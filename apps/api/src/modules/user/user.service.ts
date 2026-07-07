import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, ilike, or, gt, asc, desc, sql, inArray } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Queue } from 'bull';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { user } from '@/drizzle/schema/user';
import { jadwalPelajaran } from '@/drizzle/schema/jadwal';
import { kelas } from '@/drizzle/schema/kelas';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { QUEUE_NAMES } from '@/modules/queue';
import { Role } from '@edu/shared';
import { CreateUserDto, UpdateUserDto, ListUsersQueryDto } from './dto';

const BCRYPT_SALT_ROUNDS = 10;
const DEFAULT_PAGE_SIZE = 20;

export interface BulkImportResult {
  created: number;
  skipped: { email: string; reason: string }[];
  total: number;
}

export interface ParsedCsvRow {
  nama: string;
  email: string;
}

export interface VacantJadwalSlot {
  id: string;
  kelasId: string;
  mataPelajaranId: string;
  hari: string;
  jamMulai: string;
  jamSelesai: string;
  semester: number;
  tahunAjaranId: string;
}

export interface RemovedWaliKelas {
  kelasId: string;
  kelasNama: string;
  tahunAjaranId: string;
}

export interface DeactivateGuruResult {
  deactivatedUser: { id: string; nama: string; email: string | null; isActive: boolean | null };
  vacantJadwalSlots: VacantJadwalSlot[];
  removedWaliKelas: RemovedWaliKelas[];
  message: string;
}

@Injectable()
export class UserService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
  ) {}

  // ─── Create User ──────────────────────────────────────────────

  async createUser(tenantId: string, dto: CreateUserDto) {
    // Validate email uniqueness per tenant
    await this.validateEmailUniqueness(dto.email, tenantId);

    // Generate random password
    const rawPassword = this.generateRandomPassword();
    const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_SALT_ROUNDS);

    // Insert user
    const [created] = await this.db
      .insert(user)
      .values({
        tenantId,
        nama: dto.nama,
        email: dto.email,
        phone: dto.phone || null,
        passwordHash,
        role: dto.role,
        isActive: true,
        mustChangePassword: true,
      })
      .returning();

    // Enqueue welcome email with credentials
    await this.emailQueue.add('send-user-credentials', {
      to: dto.email,
      name: dto.nama,
      password: rawPassword,
      role: dto.role,
    });

    return {
      id: created.id,
      nama: created.nama,
      email: created.email,
      phone: created.phone,
      role: created.role,
      isActive: created.isActive,
      mustChangePassword: created.mustChangePassword,
      createdAt: created.createdAt,
    };
  }

  // ─── List Users (cursor paginated) ────────────────────────────

  async listUsers(tenantId: string, query: ListUsersQueryDto) {
    const conditions = [eq(user.tenantId, tenantId), eq(user.isActive, true)];

    // Filter by role
    if (query.role) {
      conditions.push(eq(user.role, query.role));
    }

    // Search by name or email
    if (query.search) {
      conditions.push(
        or(ilike(user.nama, `%${query.search}%`), ilike(user.email, `%${query.search}%`))!,
      );
    }

    // Cursor pagination (id-based, ascending order)
    if (query.cursor) {
      conditions.push(gt(user.id, query.cursor));
    }

    const results = await this.db
      .select({
        id: user.id,
        nama: user.nama,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(and(...conditions))
      .orderBy(asc(user.id))
      .limit(DEFAULT_PAGE_SIZE + 1);

    const hasNext = results.length > DEFAULT_PAGE_SIZE;
    const data = hasNext ? results.slice(0, DEFAULT_PAGE_SIZE) : results;
    const nextCursor = hasNext ? data[data.length - 1].id : null;

    return { data, nextCursor };
  }

  // ─── Get Single User ──────────────────────────────────────────

  async getUserById(tenantId: string, userId: string) {
    const results = await this.db
      .select({
        id: user.id,
        nama: user.nama,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(and(eq(user.id, userId), eq(user.tenantId, tenantId)))
      .limit(1);

    if (!results[0]) {
      throw new NotFoundException('User tidak ditemukan');
    }

    return results[0];
  }

  // ─── Update User ──────────────────────────────────────────────

  async updateUser(tenantId: string, userId: string, dto: UpdateUserDto) {
    // Verify user exists in this tenant
    const existing = await this.getUserById(tenantId, userId);

    // If email is being changed, validate uniqueness
    if (dto.email && dto.email !== existing.email) {
      await this.validateEmailUniqueness(dto.email, tenantId, userId);
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.nama !== undefined) updateData.nama = dto.nama;
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.role !== undefined) updateData.role = dto.role;

    const [updated] = await this.db
      .update(user)
      .set(updateData)
      .where(and(eq(user.id, userId), eq(user.tenantId, tenantId)))
      .returning();

    return {
      id: updated.id,
      nama: updated.nama,
      email: updated.email,
      phone: updated.phone,
      role: updated.role,
      isActive: updated.isActive,
      mustChangePassword: updated.mustChangePassword,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  // ─── Deactivate User ──────────────────────────────────────────

  async deactivateUser(tenantId: string, userId: string) {
    // Verify user exists
    await this.getUserById(tenantId, userId);

    // Deactivate and invalidate tokens
    const [deactivated] = await this.db
      .update(user)
      .set({
        isActive: false,
        tokensInvalidatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(user.id, userId), eq(user.tenantId, tenantId)))
      .returning();

    return {
      id: deactivated.id,
      nama: deactivated.nama,
      isActive: deactivated.isActive,
    };
  }

  // ─── Deactivate Guru (with jadwal cleanup) ────────────────────

  async deactivateGuru(tenantId: string, userId: string): Promise<DeactivateGuruResult> {
    // 1. Verify user exists and is a guru
    const existingUser = await this.getUserById(tenantId, userId);
    if (existingUser.role !== Role.GURU) {
      throw new BadRequestException('User bukan guru. Gunakan endpoint deactivate biasa.');
    }

    // 2. Deactivate user and invalidate tokens (reuse existing method)
    const deactivated = await this.deactivateUser(tenantId, userId);

    // 3. Find all active jadwal_pelajaran for this guru in current/future tahun_ajaran
    const activeJadwal = await this.findActiveJadwalForGuru(tenantId, userId);

    // 4. Mark affected jadwal slots as vacant
    const vacantSlots: VacantJadwalSlot[] = [];
    if (activeJadwal.length > 0) {
      const jadwalIds = activeJadwal.map((j) => j.id);

      await this.db
        .update(jadwalPelajaran)
        .set({ isVacant: true, updatedAt: new Date() })
        .where(inArray(jadwalPelajaran.id, jadwalIds));

      vacantSlots.push(
        ...activeJadwal.map((j) => ({
          id: j.id,
          kelasId: j.kelasId,
          mataPelajaranId: j.mataPelajaranId,
          hari: j.hari,
          jamMulai: j.jamMulai,
          jamSelesai: j.jamSelesai,
          semester: j.semester,
          tahunAjaranId: j.tahunAjaranId,
        })),
      );
    }

    // 5. Find all kelas where this guru is wali_kelas (in active/disiapkan tahun_ajaran)
    const waliKelasEntries = await this.findWaliKelasForGuru(tenantId, userId);

    // 6. Remove wali_kelas assignment
    const removedWaliKelas: RemovedWaliKelas[] = [];
    if (waliKelasEntries.length > 0) {
      const kelasIds = waliKelasEntries.map((k) => k.kelasId);

      await this.db
        .update(kelas)
        .set({ waliKelasId: null, updatedAt: new Date() })
        .where(inArray(kelas.id, kelasIds));

      removedWaliKelas.push(
        ...waliKelasEntries.map((k) => ({
          kelasId: k.kelasId,
          kelasNama: k.kelasNama,
          tahunAjaranId: k.tahunAjaranId,
        })),
      );
    }

    // 7. Build response
    const message =
      `${vacantSlots.length} slot jadwal kosong, silakan assign guru pengganti` +
      (removedWaliKelas.length > 0
        ? `. ${removedWaliKelas.length} kelas kehilangan wali kelas.`
        : '.');

    return {
      deactivatedUser: {
        id: deactivated.id,
        nama: deactivated.nama,
        email: existingUser.email,
        isActive: deactivated.isActive,
      },
      vacantJadwalSlots: vacantSlots,
      removedWaliKelas,
      message,
    };
  }

  // ─── Helper: Find active jadwal for a guru ────────────────────

  async findActiveJadwalForGuru(tenantId: string, guruId: string): Promise<VacantJadwalSlot[]> {
    return this.db
      .select({
        id: jadwalPelajaran.id,
        kelasId: jadwalPelajaran.kelasId,
        mataPelajaranId: jadwalPelajaran.mataPelajaranId,
        hari: jadwalPelajaran.hari,
        jamMulai: jadwalPelajaran.jamMulai,
        jamSelesai: jadwalPelajaran.jamSelesai,
        semester: jadwalPelajaran.semester,
        tahunAjaranId: jadwalPelajaran.tahunAjaranId,
      })
      .from(jadwalPelajaran)
      .innerJoin(tahunAjaran, eq(jadwalPelajaran.tahunAjaranId, tahunAjaran.id))
      .where(
        and(
          eq(jadwalPelajaran.guruId, guruId),
          eq(jadwalPelajaran.tenantId, tenantId),
          eq(jadwalPelajaran.isVacant, false),
          inArray(tahunAjaran.status, ['aktif', 'disiapkan']),
        ),
      );
  }

  // ─── Helper: Find wali kelas assignments for a guru ───────────

  async findWaliKelasForGuru(
    tenantId: string,
    guruId: string,
  ): Promise<{ kelasId: string; kelasNama: string; tahunAjaranId: string }[]> {
    return this.db
      .select({
        kelasId: kelas.id,
        kelasNama: kelas.nama,
        tahunAjaranId: kelas.tahunAjaranId,
      })
      .from(kelas)
      .innerJoin(tahunAjaran, eq(kelas.tahunAjaranId, tahunAjaran.id))
      .where(
        and(
          eq(kelas.waliKelasId, guruId),
          eq(kelas.tenantId, tenantId),
          inArray(tahunAjaran.status, ['aktif', 'disiapkan']),
        ),
      );
  }

  // ─── Bulk Import (CSV) ────────────────────────────────────────

  async bulkImportGuru(tenantId: string, csvContent: string): Promise<BulkImportResult> {
    const rows = this.parseCsv(csvContent);

    if (rows.length === 0) {
      throw new BadRequestException('File CSV kosong atau format tidak valid');
    }

    const created: number[] = [];
    const skipped: { email: string; reason: string }[] = [];

    for (const row of rows) {
      // Validate email format
      if (!row.email || !this.isValidEmail(row.email)) {
        skipped.push({ email: row.email || '(kosong)', reason: 'Format email tidak valid' });
        continue;
      }

      if (!row.nama || row.nama.trim().length === 0) {
        skipped.push({ email: row.email, reason: 'Nama tidak boleh kosong' });
        continue;
      }

      // Check email uniqueness
      const existingUser = await this.db
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.email, row.email), eq(user.tenantId, tenantId)))
        .limit(1);

      if (existingUser.length > 0) {
        skipped.push({ email: row.email, reason: 'Email sudah terdaftar' });
        continue;
      }

      // Generate random password and create user
      const rawPassword = this.generateRandomPassword();
      const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_SALT_ROUNDS);

      await this.db.insert(user).values({
        tenantId,
        nama: row.nama.trim(),
        email: row.email.trim().toLowerCase(),
        role: Role.GURU,
        passwordHash,
        isActive: true,
        mustChangePassword: true,
      });

      // Enqueue credential email
      await this.emailQueue.add('send-user-credentials', {
        to: row.email.trim().toLowerCase(),
        name: row.nama.trim(),
        password: rawPassword,
        role: Role.GURU,
      });

      created.push(1);
    }

    return {
      created: created.length,
      skipped,
      total: rows.length,
    };
  }

  // ─── CSV Parsing ──────────────────────────────────────────────

  parseCsv(content: string): ParsedCsvRow[] {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      return []; // Need at least header + 1 data row
    }

    // Parse header to identify column indices
    const header = lines[0]
      .toLowerCase()
      .split(',')
      .map((h) => h.trim());
    const namaIdx = header.findIndex((h) => h === 'nama');
    const emailIdx = header.findIndex((h) => h === 'email');

    if (namaIdx === -1 || emailIdx === -1) {
      throw new BadRequestException('Format CSV tidak valid. Kolom wajib: nama, email');
    }

    const rows: ParsedCsvRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      rows.push({
        nama: cols[namaIdx] || '',
        email: cols[emailIdx] || '',
      });
    }

    return rows;
  }

  // ─── Helpers ──────────────────────────────────────────────────

  /**
   * Generate a random password using crypto.randomBytes.
   * Returns a 12-character alphanumeric string.
   */
  generateRandomPassword(): string {
    return crypto.randomBytes(9).toString('base64url').slice(0, 12);
  }

  private async validateEmailUniqueness(
    email: string,
    tenantId: string,
    excludeUserId?: string,
  ): Promise<void> {
    const conditions = [eq(user.email, email), eq(user.tenantId, tenantId)];

    if (excludeUserId) {
      conditions.push(sql`${user.id} != ${excludeUserId}`);
    }

    const existing = await this.db
      .select({ id: user.id })
      .from(user)
      .where(and(...conditions))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('Email sudah terdaftar di tenant ini');
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
