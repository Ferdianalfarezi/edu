import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, count, ilike, inArray } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Queue } from 'bull';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { tenant } from '@/drizzle/schema/tenant';
import { user } from '@/drizzle/schema/user';
import { siswa } from '@/drizzle/schema/siswa';
import { kelas } from '@/drizzle/schema/kelas';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { mataPelajaran } from '@/drizzle/schema/mata-pelajaran';
import { konfigurasiSekolah } from '@/drizzle/schema/konfigurasi';
import { AuthService } from '@/modules/auth/auth.service';
import { QUEUE_NAMES } from '@/modules/queue';
import { paginate } from '@/common/utils/paginate';
import { PaginatedResponse } from '@/common/interfaces/pagination.interface';
import { CreateTenantDto, UpdateTenantDto } from './dto';

const BCRYPT_SALT_ROUNDS = 10;
const GENERATED_PASSWORD_LENGTH = 12;

type Jenjang = 'sd' | 'smp' | 'sma';
const JENJANG_JUMLAH_TINGKAT: Record<Jenjang, number> = { sd: 6, smp: 3, sma: 3 };

export interface TenantWithStats {
  id: string;
  nama: string;
  alamat: string | null;
  telepon: string | null;
  email: string | null;
  logo_url: string | null;
  jumlah_tingkat: number;
  jenjang: string | null;
  hari_kerja: '5_hari' | '6_hari';
  is_active: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
  user_count: number;
}

export interface CreateTenantResult {
  id: string;
  tenant: {
    id: string;
    nama: string;
    email: string | null;
  };
  admin: {
    id: string;
    email: string | null;
    nama: string;
  };
  onboarding_summary?: {
    kelas: number;
    mata_pelajaran: number;
    siswa: number;
    guru_staff: number;
    spp_bulanan: number;
  };
}

export interface TenantStats {
  total_users: number;
  total_students: number;
  total_classes: number;
  total_teachers: number;
  active_tahun_ajaran: string | null;
}

export interface GenderCount {
  laki_laki: number;
  perempuan: number;
  tidak_diketahui: number;
}

export interface GenderStatsPerKelas extends GenderCount {
  kelas_id: string | null; // null = siswa belum punya kelas
  kelas_nama: string;
  tingkat: number | null;
}

export interface GenderStats {
  total: GenderCount;
  per_kelas: GenderStatsPerKelas[];
}

@Injectable()
export class TenantService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly authService: AuthService,
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
  ) {}

  /**
   * Get stats for a specific tenant (scoped to the current user's tenant).
   */
  async getTenantStats(tenantId: string): Promise<TenantStats> {
    // Count active users in this tenant
    const [userCountResult] = await this.db
      .select({ count: count(user.id) })
      .from(user)
      .where(and(eq(user.tenantId, tenantId), eq(user.isActive, true)));

    // Count active students in this tenant
    const [studentCountResult] = await this.db
      .select({ count: count(siswa.id) })
      .from(siswa)
      .where(and(eq(siswa.tenantId, tenantId), eq(siswa.status, 'aktif')));

    // Count classes in this tenant
    const [classCountResult] = await this.db
      .select({ count: count(kelas.id) })
      .from(kelas)
      .where(eq(kelas.tenantId, tenantId));

    // Count teachers (guru role) in this tenant
    const [teacherCountResult] = await this.db
      .select({ count: count(user.id) })
      .from(user)
      .where(and(eq(user.tenantId, tenantId), eq(user.role, 'guru'), eq(user.isActive, true)));

    // Get active tahun ajaran name
    const activeTahunAjaran = await this.db
      .select({ nama: tahunAjaran.nama })
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.tenantId, tenantId), eq(tahunAjaran.status, 'aktif')))
      .limit(1);

    return {
      total_users: Number(userCountResult.count),
      total_students: Number(studentCountResult.count),
      total_classes: Number(classCountResult.count),
      total_teachers: Number(teacherCountResult.count),
      active_tahun_ajaran: activeTahunAjaran.length > 0 ? activeTahunAjaran[0].nama : null,
    };
  }

  /**
   * Jumlah siswa aktif per jenis kelamin: total sekolah + rincian per kelas.
   */
  async getGenderStats(tenantId: string): Promise<GenderStats> {
    const rows = await this.db
      .select({
        kelasId: siswa.kelasId,
        kelasNama: kelas.nama,
        tingkat: kelas.tingkat,
        jenisKelamin: siswa.jenisKelamin,
        count: count(siswa.id),
      })
      .from(siswa)
      .leftJoin(kelas, eq(siswa.kelasId, kelas.id))
      .where(and(eq(siswa.tenantId, tenantId), eq(siswa.status, 'aktif')))
      .groupBy(siswa.kelasId, kelas.nama, kelas.tingkat, siswa.jenisKelamin);

    const empty = (): GenderCount => ({ laki_laki: 0, perempuan: 0, tidak_diketahui: 0 });
    const add = (target: GenderCount, jk: string | null, n: number) => {
      if (jk === 'L') target.laki_laki += n;
      else if (jk === 'P') target.perempuan += n;
      else target.tidak_diketahui += n;
    };

    const total = empty();
    const byKelas = new Map<string, GenderStatsPerKelas>();
    for (const row of rows) {
      const n = Number(row.count);
      add(total, row.jenisKelamin, n);
      const key = row.kelasId ?? '__none__';
      let entry = byKelas.get(key);
      if (!entry) {
        entry = {
          kelas_id: row.kelasId,
          kelas_nama: row.kelasId ? (row.kelasNama ?? '-') : 'Belum ada kelas',
          tingkat: row.tingkat ?? null,
          ...empty(),
        };
        byKelas.set(key, entry);
      }
      add(entry, row.jenisKelamin, n);
    }

    // Urutkan per tingkat lalu nama; "Belum ada kelas" paling bawah
    const per_kelas = [...byKelas.values()].sort((a, b) => {
      if (a.kelas_id === null) return 1;
      if (b.kelas_id === null) return -1;
      return (
        (a.tingkat ?? 0) - (b.tingkat ?? 0) ||
        a.kelas_nama.localeCompare(b.kelas_nama, 'id', { numeric: true })
      );
    });

    return { total, per_kelas };
  }

  /**
   * Create a new tenant with a default admin user (and optional onboarding data).
   * Delegates to createTenantWithOnboarding after running pre-transaction validation.
   * Backward-compatible: when no onboarding arrays are present, returns result without
   * `onboarding_summary` field.
   *
   * Requirements: 9.1, 9.2, 9.3, 9.4
   */
  async createTenant(dto: CreateTenantDto): Promise<CreateTenantResult> {
    await this.validateOnboardingData(dto);
    return this.createTenantWithOnboarding(dto);
  }

  /**
   * Deactivate a tenant: set is_active = false and invalidate all user tokens.
   */
  async deactivateTenant(tenantId: string): Promise<{ message: string }> {
    // Verify tenant exists
    const tenants = await this.db.select().from(tenant).where(eq(tenant.id, tenantId)).limit(1);

    if (tenants.length === 0) {
      throw new NotFoundException(`Tenant dengan id ${tenantId} tidak ditemukan`);
    }

    const existingTenant = tenants[0];

    if (!existingTenant.isActive) {
      throw new BadRequestException('Tenant sudah nonaktif');
    }

    // Deactivate tenant
    await this.db
      .update(tenant)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(tenant.id, tenantId));

    // Invalidate all tokens for users in this tenant
    await this.authService.invalidateAllTenantTokens(tenantId);

    return { message: `Tenant "${existingTenant.nama}" berhasil dinonaktifkan` };
  }

  /**
   * Reactivate a previously deactivated tenant.
   */
  async activateTenant(tenantId: string): Promise<{ message: string }> {
    const tenants = await this.db.select().from(tenant).where(eq(tenant.id, tenantId)).limit(1);

    if (tenants.length === 0) {
      throw new NotFoundException(`Tenant dengan id ${tenantId} tidak ditemukan`);
    }

    const existingTenant = tenants[0];

    if (existingTenant.isActive) {
      throw new BadRequestException('Tenant sudah aktif');
    }

    await this.db
      .update(tenant)
      .set({
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(tenant.id, tenantId));

    return { message: `Tenant "${existingTenant.nama}" berhasil diaktifkan kembali` };
  }

  /**
   * Update the logo_url for a tenant after successful S3 upload.
   * Returns the updated tenant record with the new logo_url.
   *
   * Requirements: 1.2
   */
  async updateLogoUrl(
    tenantId: string,
    logoUrl: string,
  ): Promise<{ id: string; logo_url: string }> {
    const existing = await this.db
      .select({ id: tenant.id })
      .from(tenant)
      .where(eq(tenant.id, tenantId))
      .limit(1);

    if (existing.length === 0) {
      throw new NotFoundException(`Tenant dengan id ${tenantId} tidak ditemukan`);
    }

    await this.db
      .update(tenant)
      .set({ logoUrl, updatedAt: new Date() })
      .where(eq(tenant.id, tenantId));

    return { id: tenantId, logo_url: logoUrl };
  }

  /**
   * Update tenant details (nama, alamat, telepon, email).
   */
  async updateTenant(tenantId: string, dto: UpdateTenantDto): Promise<{ message: string }> {
    const tenants = await this.db.select().from(tenant).where(eq(tenant.id, tenantId)).limit(1);

    if (tenants.length === 0) {
      throw new NotFoundException(`Tenant dengan id ${tenantId} tidak ditemukan`);
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.nama !== undefined) updateData.nama = dto.nama;
    if (dto.alamat !== undefined) updateData.alamat = dto.alamat;
    if (dto.telepon !== undefined) updateData.telepon = dto.telepon;
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.jenjang !== undefined) {
      const expected = JENJANG_JUMLAH_TINGKAT[dto.jenjang];
      if (expected !== tenants[0].jumlahTingkat) {
        throw new BadRequestException(
          `Jenjang ${dto.jenjang.toUpperCase()} tidak sesuai dengan jumlah tingkat sekolah (${tenants[0].jumlahTingkat})`,
        );
      }
      updateData.jenjang = dto.jenjang;
    }

    await this.db.update(tenant).set(updateData).where(eq(tenant.id, tenantId));

    return { message: 'Tenant berhasil diperbarui' };
  }

  /**
   * List all tenants with basic stats (user count).
   */
  async listTenants(): Promise<TenantWithStats[]> {
    const results = await this.db
      .select({
        id: tenant.id,
        nama: tenant.nama,
        alamat: tenant.alamat,
        telepon: tenant.telepon,
        email: tenant.email,
        logoUrl: tenant.logoUrl,
        jumlahTingkat: tenant.jumlahTingkat,
        jenjang: tenant.jenjang,
        hariKerja: tenant.hariKerja,
        isActive: tenant.isActive,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
        userCount: count(user.id),
      })
      .from(tenant)
      .leftJoin(user, and(eq(user.tenantId, tenant.id), eq(user.isActive, true)))
      .groupBy(tenant.id)
      .orderBy(tenant.createdAt);

    return results.map((r) => ({
      id: r.id,
      nama: r.nama,
      alamat: r.alamat,
      telepon: r.telepon,
      email: r.email,
      logo_url: r.logoUrl,
      jumlah_tingkat: r.jumlahTingkat,
      jenjang: r.jenjang ?? null,
      hari_kerja: r.hariKerja as '5_hari' | '6_hari',
      is_active: r.isActive,
      user_count: Number(r.userCount),
      created_at: r.createdAt,
      updated_at: r.updatedAt,
    }));
  }

  /**
   * List all tenants with pagination and stats (user count).
   */
  async listTenantsPaginated(
    page: number = 1,
    pageSize: number = 20,
  ): Promise<PaginatedResponse<TenantWithStats>> {
    // Count total tenants
    const [countResult] = await this.db.select({ count: count() }).from(tenant);
    const totalCount = Number(countResult.count);

    // Get paginated data
    const offset = (page - 1) * pageSize;
    const results = await this.db
      .select({
        id: tenant.id,
        nama: tenant.nama,
        alamat: tenant.alamat,
        telepon: tenant.telepon,
        email: tenant.email,
        logoUrl: tenant.logoUrl,
        jumlahTingkat: tenant.jumlahTingkat,
        jenjang: tenant.jenjang,
        hariKerja: tenant.hariKerja,
        isActive: tenant.isActive,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
        userCount: count(user.id),
      })
      .from(tenant)
      .leftJoin(user, and(eq(user.tenantId, tenant.id), eq(user.isActive, true)))
      .groupBy(tenant.id)
      .orderBy(tenant.createdAt)
      .limit(pageSize)
      .offset(offset);

    const mappedResults = results.map((r) => ({
      id: r.id,
      nama: r.nama,
      alamat: r.alamat,
      telepon: r.telepon,
      email: r.email,
      logo_url: r.logoUrl,
      jumlah_tingkat: r.jumlahTingkat,
      jenjang: r.jenjang ?? null,
      hari_kerja: r.hariKerja as '5_hari' | '6_hari',
      is_active: r.isActive,
      user_count: Number(r.userCount),
      created_at: r.createdAt,
      updated_at: r.updatedAt,
    }));

    return paginate(mappedResults, totalCount, page, pageSize);
  }

  /**
   * Search tenants by name (case-insensitive partial match).
   * Returns only id and nama for use in search/select controls.
   */
  async searchTenants(query: string): Promise<{ id: string; nama: string }[]> {
    const results = await this.db
      .select({ id: tenant.id, nama: tenant.nama })
      .from(tenant)
      .where(ilike(tenant.nama, `%${query}%`))
      .orderBy(tenant.nama)
      .limit(20);
    return results;
  }

  /**
   * Returns the jumlah_tingkat for a given tenant.
   * Used by KelasService, KenaikanKelasService, and KonfigurasiService.
   */
  async getJumlahTingkat(tenantId: string): Promise<number> {
    const result = await this.db
      .select({ jumlahTingkat: tenant.jumlahTingkat })
      .from(tenant)
      .where(eq(tenant.id, tenantId))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundException(`Tenant dengan id ${tenantId} tidak ditemukan`);
    }

    return result[0].jumlahTingkat;
  }

  /**
   * Returns the hari_kerja setting for a given tenant.
   * Used by JadwalService, AbsensiService, and KonfigurasiService.
   */
  async getHariKerja(tenantId: string): Promise<'5_hari' | '6_hari'> {
    const result = await this.db
      .select({ hariKerja: tenant.hariKerja })
      .from(tenant)
      .where(eq(tenant.id, tenantId))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundException(`Tenant dengan id ${tenantId} tidak ditemukan`);
    }

    return result[0].hariKerja as '5_hari' | '6_hari';
  }

  /**
   * Update the hari_kerja setting for a tenant.
   * Used by the PATCH /tenants/hari-kerja endpoint.
   */
  async updateHariKerja(
    tenantId: string,
    hariKerja: '5_hari' | '6_hari',
  ): Promise<{ message: string }> {
    const tenants = await this.db.select().from(tenant).where(eq(tenant.id, tenantId)).limit(1);

    if (tenants.length === 0) {
      throw new NotFoundException(`Tenant dengan id ${tenantId} tidak ditemukan`);
    }

    await this.db
      .update(tenant)
      .set({ hariKerja, updatedAt: new Date() })
      .where(eq(tenant.id, tenantId));

    return { message: 'Hari kerja berhasil diperbarui' };
  }

  /**
   * Returns tenant profile including jumlah_tingkat for non-super-admin roles.
   * Used by admin panel to know school's structure.
   */
  async getTenantProfile(tenantId: string): Promise<{
    id: string;
    nama: string;
    logo_url: string | null;
    jumlah_tingkat: number;
    jenjang: string | null;
    hari_kerja: '5_hari' | '6_hari';
  }> {
    const result = await this.db
      .select({
        id: tenant.id,
        nama: tenant.nama,
        logoUrl: tenant.logoUrl,
        jumlahTingkat: tenant.jumlahTingkat,
        jenjang: tenant.jenjang,
        hariKerja: tenant.hariKerja,
      })
      .from(tenant)
      .where(eq(tenant.id, tenantId))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundException(`Tenant dengan id ${tenantId} tidak ditemukan`);
    }

    return {
      id: result[0].id,
      nama: result[0].nama,
      logo_url: result[0].logoUrl ?? null,
      jumlah_tingkat: result[0].jumlahTingkat,
      jenjang: result[0].jenjang ?? null,
      hari_kerja: result[0].hariKerja as '5_hari' | '6_hari',
    };
  }

  /**
   * Validate cross-field onboarding constraints before entering the transaction.
   * Also validates that admin_email is not already taken.
   * Throws BadRequestException with a descriptive message on the first violation found.
   * Requirements: 5.3, 5.4, 5.5, 5.8
   */
  private async validateOnboardingData(dto: CreateTenantDto): Promise<void> {
    // ── 0. Admin email must not already be in use ───────────────────────────
    const existingAdmin = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, dto.admin_email))
      .limit(1);

    if (existingAdmin.length > 0) {
      throw new BadRequestException(`Email ${dto.admin_email} sudah digunakan oleh user lain`);
    }

    // ── 1. Duplicate emails within the guru_staff array (Req 5.3) ──────────────
    if (dto.guru_staff && dto.guru_staff.length > 0) {
      const emailCount = new Map<string, number>();
      for (const gs of dto.guru_staff) {
        const lower = gs.email.toLowerCase();
        emailCount.set(lower, (emailCount.get(lower) ?? 0) + 1);
      }
      const duplicates = [...emailCount.entries()].filter(([, n]) => n > 1).map(([email]) => email);

      if (duplicates.length > 0) {
        throw new BadRequestException(`Email duplikat ditemukan: ${duplicates.join(', ')}`);
      }

      // ── 2. Emails already in the user table (Req 5.4) ──────────────────────
      const requestedEmails = dto.guru_staff.map((gs) => gs.email.toLowerCase());
      const existingRows = await this.db
        .select({ email: user.email })
        .from(user)
        .where(inArray(user.email, requestedEmails));

      if (existingRows.length > 0) {
        const conflicting = existingRows.map((r) => r.email).filter(Boolean) as string[];
        throw new BadRequestException(`Email sudah digunakan: ${conflicting.join(', ')}`);
      }
    }

    // ── 3. Duplicate NISN within the siswa array — non-null/non-empty only (Req 5.8) ──
    if (dto.siswa && dto.siswa.length > 0) {
      const nisnCount = new Map<string, number>();
      for (const s of dto.siswa) {
        if (!s.nisn) continue;
        const nisn = s.nisn.trim();
        if (!nisn) continue;
        nisnCount.set(nisn, (nisnCount.get(nisn) ?? 0) + 1);
      }
      const duplicateNisn = [...nisnCount.entries()].filter(([, n]) => n > 1).map(([nisn]) => nisn);

      if (duplicateNisn.length > 0) {
        throw new BadRequestException(`NISN duplikat ditemukan: ${duplicateNisn.join(', ')}`);
      }
    }

    // ── 4. SPP tingkat must not exceed jumlah_tingkat (Req 5.5) ────────────────
    if (dto.spp_bulanan && dto.spp_bulanan.length > 0) {
      const exceeded = dto.spp_bulanan.some((spp) => spp.tingkat > dto.jumlah_tingkat);
      if (exceeded) {
        throw new BadRequestException('Tingkat SPP melebihi jumlah tingkat sekolah');
      }
    }
  }

  /**
   * Create a new tenant with full onboarding data inside a single Drizzle transaction.
   * Steps: (a) tenant, (b) tahun_ajaran, (c) kelas, (d) mata_pelajaran,
   *        (e) admin + guru_staff users, (f) siswa, (g) konfigurasi_sekolah (SPP).
   * After tx commit: enqueue credential emails for admin + all guru_staff.
   *
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 7.1, 7.2, 7.3, 7.4, 7.5
   */
  private async createTenantWithOnboarding(dto: CreateTenantDto): Promise<CreateTenantResult> {
    // Capture email payloads to enqueue after transaction commit
    const emailPayloads: Array<{
      to: string;
      tenantName: string;
      adminName: string;
      email: string;
      password: string;
    }> = [];

    // Execute all inserts atomically
    const { newTenant, adminUser, onboarding_summary } = await this.db.transaction(async (tx) => {
      // ── Step (a): Insert tenant ──────────────────────────────────────────
      const [insertedTenant] = await tx
        .insert(tenant)
        .values({
          nama: dto.nama,
          alamat: dto.alamat ?? null,
          telepon: dto.telepon ?? null,
          email: dto.email,
          jumlahTingkat: dto.jumlah_tingkat,
          jenjang:
            dto.jenjang ??
            (dto.jumlah_tingkat === 6 ? 'sd' : dto.jumlah_tingkat === 3 ? 'smp' : null),
          hariKerja: dto.hari_kerja ?? '6_hari',
          isActive: true,
        })
        .returning();

      // ── Step (b): Insert tahun_ajaran default ────────────────────────────
      // Use UTC+7 (Asia/Jakarta) timezone to determine current year
      const now = new Date();
      const utc7Year = new Date(now.getTime() + 7 * 60 * 60 * 1000).getUTCFullYear();
      const tahunAjaranNama = `${utc7Year}/${utc7Year + 1}`;
      const tanggalMulai = `${utc7Year}-07-01`;
      const tanggalSelesai = `${utc7Year + 1}-06-30`;

      const [insertedTahunAjaran] = await tx
        .insert(tahunAjaran)
        .values({
          tenantId: insertedTenant.id,
          nama: tahunAjaranNama,
          tanggalMulai,
          tanggalSelesai,
          status: 'disiapkan',
        })
        .returning();

      // ── Step (c): Insert kelas (bulk) ────────────────────────────────────
      const kelasMap = new Map<string, string>(); // nama → id
      let kelasCount = 0;

      if (dto.kelas && dto.kelas.length > 0) {
        const kelasValues = dto.kelas.map((k) => ({
          tenantId: insertedTenant.id,
          tahunAjaranId: insertedTahunAjaran.id,
          nama: k.nama,
          tingkat: k.tingkat,
        }));

        const insertedKelas = await tx.insert(kelas).values(kelasValues).returning();
        kelasCount = insertedKelas.length;

        for (const k of insertedKelas) {
          kelasMap.set(k.nama, k.id);
        }
      }

      // ── Step (d): Insert mata_pelajaran (bulk) ───────────────────────────
      let mataPelajaranCount = 0;

      if (dto.mata_pelajaran && dto.mata_pelajaran.length > 0) {
        const mpValues = dto.mata_pelajaran.map((mp) => ({
          tenantId: insertedTenant.id,
          nama: mp.nama,
          kode: mp.kode ?? null,
        }));

        const insertedMp = await tx.insert(mataPelajaran).values(mpValues).returning();
        mataPelajaranCount = insertedMp.length;
      }

      // ── Step (e): Insert admin user + guru_staff users ───────────────────
      // Admin user
      const adminRawPassword = this.generateRandomPassword();
      const adminPasswordHash = await bcrypt.hash(adminRawPassword, BCRYPT_SALT_ROUNDS);

      const [insertedAdmin] = await tx
        .insert(user)
        .values({
          tenantId: insertedTenant.id,
          nama: dto.admin_nama,
          email: dto.admin_email,
          passwordHash: adminPasswordHash,
          role: 'admin',
          isActive: true,
          mustChangePassword: true,
        })
        .returning();

      // Collect admin email payload (enqueued after tx commit)
      emailPayloads.push({
        to: dto.admin_email,
        tenantName: dto.nama,
        adminName: dto.admin_nama,
        email: dto.admin_email,
        password: adminRawPassword,
      });

      // Guru & staff users
      let guruStaffCount = 0;

      if (dto.guru_staff && dto.guru_staff.length > 0) {
        for (const gs of dto.guru_staff) {
          const rawPassword = this.generateRandomPassword();
          const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_SALT_ROUNDS);

          await tx.insert(user).values({
            tenantId: insertedTenant.id,
            nama: gs.nama,
            email: gs.email,
            passwordHash,
            role: gs.role as 'admin' | 'kepala_sekolah' | 'guru' | 'bendahara',
            isActive: true,
            mustChangePassword: true,
          });

          emailPayloads.push({
            to: gs.email,
            tenantName: dto.nama,
            adminName: gs.nama,
            email: gs.email,
            password: rawPassword,
          });
        }

        guruStaffCount = dto.guru_staff.length;
      }

      // ── Step (f): Insert siswa (bulk) with parent linkage ──────────────────
      let siswaCount = 0;

      if (dto.siswa && dto.siswa.length > 0) {
        // Build a map of phone → parentId to deduplicate parents within this batch
        const parentIdCache = new Map<string, string>();

        const siswaValues = await Promise.all(
          dto.siswa.map(async (s) => {
            // Resolve kelasId via nama lookup; unmatched → null (do NOT throw)
            const kelasId = s.kelasNama ? (kelasMap.get(s.kelasNama) ?? null) : null;

            // Resolve or create parent if teleponWali is provided
            let orangTuaId: string | null = null;
            if (s.teleponWali) {
              // Check cache first to avoid duplicate DB calls for same phone
              const cached = parentIdCache.get(s.teleponWali);
              if (cached) {
                orangTuaId = cached;
              } else {
                orangTuaId = await this.resolveOrCreateParentInTx(
                  tx,
                  s.teleponWali,
                  s.namaWali || s.nama, // Fallback to student name if no parent name
                );
                parentIdCache.set(s.teleponWali, orangTuaId);
              }
            }

            return {
              tenantId: insertedTenant.id,
              kelasId,
              nama: s.nama,
              nisn: s.nisn ?? null,
              jenisKelamin: s.jenisKelamin ?? null,
              tanggalLahir: s.tanggalLahir ?? null,
              alamat: s.alamat ?? null,
              orangTuaId,
            };
          }),
        );

        const insertedSiswa = await tx.insert(siswa).values(siswaValues).returning();
        siswaCount = insertedSiswa.length;
      }

      // ── Step (g): Insert konfigurasi_sekolah for SPP ────────────────────
      let sppCount = 0;

      if (dto.spp_bulanan && dto.spp_bulanan.length > 0) {
        const sppValues = dto.spp_bulanan.map((spp) => ({
          tenantId: insertedTenant.id,
          key: `spp_nominal_tingkat_${spp.tingkat}`,
          // Store as JSON number per spec (Requirements 6.5)
          value: spp.nominal as unknown as Record<string, unknown>,
        }));

        const insertedSpp = await tx.insert(konfigurasiSekolah).values(sppValues).returning();
        sppCount = insertedSpp.length;
      }

      return {
        newTenant: insertedTenant,
        adminUser: insertedAdmin,
        onboarding_summary: {
          kelas: kelasCount,
          mata_pelajaran: mataPelajaranCount,
          siswa: siswaCount,
          guru_staff: guruStaffCount,
          spp_bulanan: sppCount,
        },
      };
    });

    // ── After transaction commit: enqueue credential emails ─────────────────
    // Requirement 7.5: enqueue failure must NOT fail the overall onboarding
    for (const payload of emailPayloads) {
      try {
        await this.emailQueue.add('send-tenant-credentials', payload);
      } catch (err) {
        // Log and continue — email enqueue failure is non-fatal
        console.error(`[TenantService] Failed to enqueue credentials email to ${payload.to}:`, err);
      }
    }

    const hasOnboardingData =
      (dto.kelas && dto.kelas.length > 0) ||
      (dto.mata_pelajaran && dto.mata_pelajaran.length > 0) ||
      (dto.siswa && dto.siswa.length > 0) ||
      (dto.guru_staff && dto.guru_staff.length > 0) ||
      (dto.spp_bulanan && dto.spp_bulanan.length > 0);

    return {
      id: newTenant.id,
      tenant: {
        id: newTenant.id,
        nama: newTenant.nama,
        email: newTenant.email,
      },
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        nama: adminUser.nama,
      },
      ...(hasOnboardingData ? { onboarding_summary } : {}),
    };
  }

  /**
   * Resolve or create a parent user within a transaction context.
   * Per ADR-002: parents have tenant_id = NULL, deduplicated globally by phone.
   *
   * @param tx - Drizzle transaction instance
   * @param phone - Parent's phone number
   * @param nama - Parent's name (used only if creating new)
   * @returns Parent user ID
   */
  private async resolveOrCreateParentInTx(
    tx: Parameters<Parameters<typeof this.db.transaction>[0]>[0],
    phone: string,
    nama: string,
  ): Promise<string> {
    // Check globally for existing orang_tua with this phone
    const existing = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.phone, phone), eq(user.role, 'orang_tua')))
      .limit(1);

    if (existing.length > 0) {
      return existing[0].id;
    }

    // Create new parent user with tenant_id = NULL
    const [created] = await tx
      .insert(user)
      .values({
        tenantId: null,
        nama,
        phone,
        role: 'orang_tua',
        isActive: true,
        passwordHash: null,
      })
      .returning({ id: user.id });

    return created.id;
  }

  /**
   * Generate a cryptographically random password of exactly GENERATED_PASSWORD_LENGTH (12) chars.
   *
   * Guarantees at least one character from each required class (Requirement 6.7):
   *   - 1 uppercase letter (A–Z)
   *   - 1 lowercase letter (a–z)
   *   - 1 digit (0–9)
   *   - 1 special character from !@#$%&*
   *
   * The remaining characters are drawn from the full charset and all positions
   * are shuffled using a Fisher–Yates shuffle seeded with crypto.randomBytes to
   * ensure uniform distribution and unpredictability.
   */
  private generateRandomPassword(): string {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const special = '!@#$%&*';
    const allChars = lowercase + uppercase + digits + special;

    // Helper: pick one random character from a given set using crypto.randomBytes
    const pickRandom = (charset: string): string => {
      const byte = crypto.randomBytes(1)[0];
      return charset[byte % charset.length];
    };

    // Guarantee at least one char from each required class (4 mandatory positions)
    const chars: string[] = [
      pickRandom(uppercase),
      pickRandom(lowercase),
      pickRandom(digits),
      pickRandom(special),
    ];

    // Fill the remaining positions from the full charset
    for (let i = chars.length; i < GENERATED_PASSWORD_LENGTH; i++) {
      chars.push(pickRandom(allChars));
    }

    // Fisher–Yates shuffle using crypto.randomBytes for uniform randomness
    for (let i = chars.length - 1; i > 0; i--) {
      const byte = crypto.randomBytes(1)[0];
      const j = byte % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    return chars.join('');
  }
}
