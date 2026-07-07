import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, ilike, or, gt, asc, sql } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { siswa } from '@/drizzle/schema/siswa';
import { user } from '@/drizzle/schema/user';
import { kelas } from '@/drizzle/schema/kelas';
import { CreateSiswaDto, UpdateSiswaDto, SoftDeleteSiswaDto, ListSiswaQueryDto } from './dto';

const DEFAULT_PAGE_SIZE = 20;

export interface BulkImportSiswaResult {
  created: number;
  skipped: { row: number; reason: string }[];
  total: number;
}

export interface ParsedSiswaCsvRow {
  nama: string;
  nisn: string;
  jenisKelamin: string;
  tanggalLahir: string;
  orangTuaNama: string;
  orangTuaPhone: string;
  kelasId: string;
}

@Injectable()
export class SiswaService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  // ─── Create Siswa ─────────────────────────────────────────────

  async createSiswa(tenantId: string, dto: CreateSiswaDto, processedByUserId: string) {
    // Validate NISN uniqueness per tenant (active students only)
    if (dto.nisn) {
      await this.validateNisnUniqueness(dto.nisn, tenantId);
    }

    // Handle parent linkage per ADR-002
    let orangTuaId: string | null = null;
    if (dto.orangTuaPhone) {
      orangTuaId = await this.resolveOrCreateParent(
        dto.orangTuaPhone,
        dto.orangTuaNama || dto.nama,
      );
    }

    // Insert siswa
    const [created] = await this.db
      .insert(siswa)
      .values({
        tenantId,
        kelasId: dto.kelasId || null,
        nama: dto.nama,
        nisn: dto.nisn || null,
        jenisKelamin: dto.jenisKelamin || null,
        tanggalLahir: dto.tanggalLahir || null,
        alamat: dto.alamat || null,
        orangTuaId,
        status: 'aktif',
      })
      .returning();

    return {
      id: created.id,
      tenantId: created.tenantId,
      kelasId: created.kelasId,
      nama: created.nama,
      nisn: created.nisn,
      jenisKelamin: created.jenisKelamin,
      tanggalLahir: created.tanggalLahir,
      alamat: created.alamat,
      orangTuaId: created.orangTuaId,
      status: created.status,
      createdAt: created.createdAt,
    };
  }

  // ─── Get Siswa by ID ──────────────────────────────────────────

  async getSiswaById(tenantId: string, siswaId: string) {
    const results = await this.db
      .select({
        id: siswa.id,
        tenantId: siswa.tenantId,
        kelasId: siswa.kelasId,
        nama: siswa.nama,
        nisn: siswa.nisn,
        jenisKelamin: siswa.jenisKelamin,
        tanggalLahir: siswa.tanggalLahir,
        alamat: siswa.alamat,
        orangTuaId: siswa.orangTuaId,
        status: siswa.status,
        tanggalKeluar: siswa.tanggalKeluar,
        alasanKeluar: siswa.alasanKeluar,
        processedBy: siswa.processedBy,
        createdAt: siswa.createdAt,
        updatedAt: siswa.updatedAt,
      })
      .from(siswa)
      .where(and(eq(siswa.id, siswaId), eq(siswa.tenantId, tenantId)))
      .limit(1);

    if (!results[0]) {
      throw new NotFoundException('Siswa tidak ditemukan');
    }

    return results[0];
  }

  // ─── Update Siswa ─────────────────────────────────────────────

  async updateSiswa(tenantId: string, siswaId: string, dto: UpdateSiswaDto) {
    // Verify siswa exists
    const existing = await this.getSiswaById(tenantId, siswaId);

    // If NISN is being changed, validate uniqueness
    if (dto.nisn && dto.nisn !== existing.nisn) {
      await this.validateNisnUniqueness(dto.nisn, tenantId, siswaId);
    }

    // Handle parent linkage update
    let orangTuaId: string | undefined;
    if (dto.orangTuaPhone !== undefined) {
      if (dto.orangTuaPhone) {
        orangTuaId = await this.resolveOrCreateParent(
          dto.orangTuaPhone,
          dto.orangTuaNama || existing.nama,
        );
      } else {
        orangTuaId = undefined; // Don't change if empty string
      }
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.nama !== undefined) updateData.nama = dto.nama;
    if (dto.nisn !== undefined) updateData.nisn = dto.nisn || null;
    if (dto.jenisKelamin !== undefined) updateData.jenisKelamin = dto.jenisKelamin;
    if (dto.tanggalLahir !== undefined) updateData.tanggalLahir = dto.tanggalLahir;
    if (dto.alamat !== undefined) updateData.alamat = dto.alamat;
    if (dto.kelasId !== undefined) updateData.kelasId = dto.kelasId;
    if (orangTuaId !== undefined) updateData.orangTuaId = orangTuaId;

    const [updated] = await this.db
      .update(siswa)
      .set(updateData)
      .where(and(eq(siswa.id, siswaId), eq(siswa.tenantId, tenantId)))
      .returning();

    return {
      id: updated.id,
      tenantId: updated.tenantId,
      kelasId: updated.kelasId,
      nama: updated.nama,
      nisn: updated.nisn,
      jenisKelamin: updated.jenisKelamin,
      tanggalLahir: updated.tanggalLahir,
      alamat: updated.alamat,
      orangTuaId: updated.orangTuaId,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  // ─── Soft Delete (pindah_sekolah / keluar) ────────────────────

  async softDeleteSiswa(
    tenantId: string,
    siswaId: string,
    dto: SoftDeleteSiswaDto,
    processedByUserId: string,
  ) {
    // Verify siswa exists and is active
    const existing = await this.getSiswaById(tenantId, siswaId);

    if (existing.status !== 'aktif') {
      throw new BadRequestException('Siswa sudah tidak aktif');
    }

    const [updated] = await this.db
      .update(siswa)
      .set({
        status: dto.status,
        tanggalKeluar: new Date().toISOString().split('T')[0],
        alasanKeluar: dto.alasanKeluar || null,
        processedBy: processedByUserId,
        updatedAt: new Date(),
      })
      .where(and(eq(siswa.id, siswaId), eq(siswa.tenantId, tenantId)))
      .returning();

    // Check parent access revocation:
    // If this parent has no remaining active children in this tenant, their access is revoked
    // (handled at query level per design — parent won't see this tenant in their tenants[])
    if (updated.orangTuaId) {
      await this.checkAndLogParentAccessStatus(updated.orangTuaId, tenantId);
    }

    return {
      id: updated.id,
      nama: updated.nama,
      status: updated.status,
      tanggalKeluar: updated.tanggalKeluar,
      alasanKeluar: updated.alasanKeluar,
      processedBy: updated.processedBy,
    };
  }

  // ─── List Siswa (cursor paginated, search, filter) ────────────

  async listSiswa(tenantId: string, query: ListSiswaQueryDto) {
    const conditions: ReturnType<typeof eq>[] = [eq(siswa.tenantId, tenantId)];

    // Exact NISN search
    if (query.nisn) {
      conditions.push(eq(siswa.nisn, query.nisn));
    }

    // Name ILIKE search
    if (query.search) {
      conditions.push(ilike(siswa.nama, `%${query.search}%`));
    }

    // Filter by kelas
    if (query.kelasId) {
      conditions.push(eq(siswa.kelasId, query.kelasId));
    }

    // Filter by status
    if (query.status) {
      conditions.push(
        eq(siswa.status, query.status as 'aktif' | 'pindah_sekolah' | 'keluar' | 'lulus'),
      );
    }

    // Filter by tahun_ajaran (via kelas.tahun_ajaran_id)
    if (query.tahunAjaranId) {
      // We need a subquery or join; use subquery for simplicity
      const kelasIds = this.db
        .select({ id: kelas.id })
        .from(kelas)
        .where(and(eq(kelas.tenantId, tenantId), eq(kelas.tahunAjaranId, query.tahunAjaranId)));
      conditions.push(sql`${siswa.kelasId} IN (${kelasIds})`);
    }

    // Cursor pagination
    if (query.cursor) {
      conditions.push(gt(siswa.id, query.cursor));
    }

    const results = await this.db
      .select({
        id: siswa.id,
        kelasId: siswa.kelasId,
        nama: siswa.nama,
        nisn: siswa.nisn,
        jenisKelamin: siswa.jenisKelamin,
        tanggalLahir: siswa.tanggalLahir,
        orangTuaId: siswa.orangTuaId,
        status: siswa.status,
        createdAt: siswa.createdAt,
      })
      .from(siswa)
      .where(and(...conditions))
      .orderBy(asc(siswa.id))
      .limit(DEFAULT_PAGE_SIZE + 1);

    const hasNext = results.length > DEFAULT_PAGE_SIZE;
    const data = hasNext ? results.slice(0, DEFAULT_PAGE_SIZE) : results;
    const nextCursor = hasNext ? data[data.length - 1].id : null;

    return { data, nextCursor };
  }

  // ─── Bulk Import via CSV ──────────────────────────────────────

  async bulkImportSiswa(
    tenantId: string,
    csvContent: string,
    processedByUserId: string,
  ): Promise<BulkImportSiswaResult> {
    const rows = this.parseSiswaCsv(csvContent);

    if (rows.length === 0) {
      throw new BadRequestException('File CSV kosong atau format tidak valid');
    }

    const created: number[] = [];
    const skipped: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 for header + 0-index

      // Validate required fields
      if (!row.nama || row.nama.trim().length === 0) {
        skipped.push({ row: rowNum, reason: 'Nama tidak boleh kosong' });
        continue;
      }

      // Validate NISN uniqueness if provided
      if (row.nisn) {
        const nisnExists = await this.checkNisnExists(row.nisn, tenantId);
        if (nisnExists) {
          skipped.push({ row: rowNum, reason: `NISN ${row.nisn} sudah terdaftar` });
          continue;
        }
      }

      // Validate jenis_kelamin
      if (row.jenisKelamin && !['L', 'P'].includes(row.jenisKelamin.toUpperCase())) {
        skipped.push({ row: rowNum, reason: 'Jenis kelamin harus L atau P' });
        continue;
      }

      // Handle parent linkage with global deduplication
      let orangTuaId: string | null = null;
      if (row.orangTuaPhone) {
        orangTuaId = await this.resolveOrCreateParent(
          row.orangTuaPhone,
          row.orangTuaNama || row.nama,
        );
      }

      await this.db.insert(siswa).values({
        tenantId,
        kelasId: row.kelasId || null,
        nama: row.nama.trim(),
        nisn: row.nisn || null,
        jenisKelamin: row.jenisKelamin ? (row.jenisKelamin.toUpperCase() as 'L' | 'P') : null,
        tanggalLahir: row.tanggalLahir || null,
        orangTuaId,
        status: 'aktif',
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

  parseSiswaCsv(content: string): ParsedSiswaCsvRow[] {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      return []; // Need at least header + 1 data row
    }

    // Parse header
    const header = lines[0]
      .toLowerCase()
      .split(',')
      .map((h) => h.trim());

    const namaIdx = header.findIndex((h) => h === 'nama');
    const nisnIdx = header.findIndex((h) => h === 'nisn');
    const jenisKelaminIdx = header.findIndex((h) =>
      ['jenis_kelamin', 'jeniskelamin', 'jk'].includes(h),
    );
    const tanggalLahirIdx = header.findIndex((h) =>
      ['tanggal_lahir', 'tanggallahir', 'tgl_lahir'].includes(h),
    );
    const orangTuaNamaIdx = header.findIndex((h) =>
      ['orang_tua_nama', 'orangtuanama', 'nama_ortu'].includes(h),
    );
    const orangTuaPhoneIdx = header.findIndex((h) =>
      ['orang_tua_phone', 'orangtuaphone', 'phone_ortu', 'telp_ortu'].includes(h),
    );
    const kelasIdIdx = header.findIndex((h) => ['kelas_id', 'kelasid', 'kelas'].includes(h));

    if (namaIdx === -1) {
      throw new BadRequestException('Format CSV tidak valid. Kolom wajib: nama');
    }

    const rows: ParsedSiswaCsvRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      rows.push({
        nama: cols[namaIdx] || '',
        nisn: nisnIdx >= 0 ? cols[nisnIdx] || '' : '',
        jenisKelamin: jenisKelaminIdx >= 0 ? cols[jenisKelaminIdx] || '' : '',
        tanggalLahir: tanggalLahirIdx >= 0 ? cols[tanggalLahirIdx] || '' : '',
        orangTuaNama: orangTuaNamaIdx >= 0 ? cols[orangTuaNamaIdx] || '' : '',
        orangTuaPhone: orangTuaPhoneIdx >= 0 ? cols[orangTuaPhoneIdx] || '' : '',
        kelasId: kelasIdIdx >= 0 ? cols[kelasIdIdx] || '' : '',
      });
    }

    return rows;
  }

  // ─── Parent Linkage (ADR-002) ─────────────────────────────────

  /**
   * Resolves or creates a parent user per ADR-002:
   * 1. Check if user with phone + role='orang_tua' exists globally
   * 2. If yes → return existing user ID
   * 3. If no → create new user (tenant_id = NULL, no password)
   */
  async resolveOrCreateParent(phone: string, nama: string): Promise<string> {
    // Check globally for existing orang_tua with this phone
    const existing = await this.db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.phone, phone), eq(user.role, 'orang_tua')))
      .limit(1);

    if (existing.length > 0) {
      return existing[0].id;
    }

    // Create new parent user with tenant_id = NULL
    const [created] = await this.db
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

  // ─── NISN Validation ──────────────────────────────────────────

  async validateNisnUniqueness(
    nisn: string,
    tenantId: string,
    excludeSiswaId?: string,
  ): Promise<void> {
    const conditions = [
      eq(siswa.nisn, nisn),
      eq(siswa.tenantId, tenantId),
      eq(siswa.status, 'aktif'),
    ];

    if (excludeSiswaId) {
      conditions.push(sql`${siswa.id} != ${excludeSiswaId}`);
    }

    const existing = await this.db
      .select({ id: siswa.id })
      .from(siswa)
      .where(and(...conditions))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('NISN sudah terdaftar di sekolah ini untuk siswa aktif');
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async checkNisnExists(nisn: string, tenantId: string): Promise<boolean> {
    const existing = await this.db
      .select({ id: siswa.id })
      .from(siswa)
      .where(and(eq(siswa.nisn, nisn), eq(siswa.tenantId, tenantId), eq(siswa.status, 'aktif')))
      .limit(1);

    return existing.length > 0;
  }

  /**
   * Check if parent still has active children in this tenant.
   * If not, their access is effectively revoked at the query level
   * (parent won't see this tenant in their JWT tenants[]).
   * This method is primarily for logging/auditing purposes.
   */
  private async checkAndLogParentAccessStatus(
    parentId: string,
    tenantId: string,
  ): Promise<boolean> {
    const activeChildren = await this.db
      .select({ id: siswa.id })
      .from(siswa)
      .where(
        and(
          eq(siswa.orangTuaId, parentId),
          eq(siswa.tenantId, tenantId),
          eq(siswa.status, 'aktif'),
        ),
      )
      .limit(1);

    // Returns true if parent still has access (has active children)
    return activeChildren.length > 0;
  }

  // ─── CSV Import with Preview ──────────────────────────────────

  /**
   * Preview CSV import: parse, validate, detect NISN conflicts.
   * Returns conflicts and preview counts without persisting.
   */
  async importCsvPreview(tenantId: string, csvContent: string) {
    const rows = this.parseSiswaCsv(csvContent);

    if (rows.length === 0) {
      throw new BadRequestException('File CSV kosong atau format tidak valid');
    }

    const conflicts: { nisn: string; nama_csv: string; nama_existing: string }[] = [];

    for (const row of rows) {
      if (row.nisn) {
        const exists = await this.checkNisnExists(row.nisn, tenantId);
        if (exists) {
          const [existing] = await this.db
            .select({ nama: siswa.nama })
            .from(siswa)
            .where(
              and(
                eq(siswa.nisn, row.nisn),
                eq(siswa.tenantId, tenantId),
                eq(siswa.status, 'aktif'),
              ),
            )
            .limit(1);

          conflicts.push({
            nisn: row.nisn,
            nama_csv: row.nama,
            nama_existing: existing?.nama || '',
          });
        }
      }
    }

    return {
      preview_count: rows.length,
      valid_count: rows.length - conflicts.length,
      conflicts,
    };
  }

  /**
   * Execute CSV import with conflict resolutions.
   */
  async importCsvExecute(
    tenantId: string,
    csvContent: string,
    processedByUserId: string,
    resolutions: { nisn: string; action: 'skip' | 'update' }[],
  ) {
    const rows = this.parseSiswaCsv(csvContent);
    const resolutionMap = new Map(resolutions.map((r) => [r.nisn, r.action]));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!row.nama) {
        skipped++;
        continue;
      }

      // Check for conflict
      if (row.nisn) {
        const exists = await this.checkNisnExists(row.nisn, tenantId);
        if (exists) {
          const action = resolutionMap.get(row.nisn) || 'skip';
          if (action === 'skip') {
            skipped++;
            continue;
          }
          // action === 'update': update existing record
          await this.db
            .update(siswa)
            .set({
              nama: row.nama,
              jenisKelamin:
                row.jenisKelamin === 'L' || row.jenisKelamin === 'P' ? row.jenisKelamin : undefined,
              tanggalLahir: row.tanggalLahir || undefined,
              kelasId: row.kelasId || undefined,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(siswa.nisn, row.nisn),
                eq(siswa.tenantId, tenantId),
                eq(siswa.status, 'aktif'),
              ),
            );
          updated++;
          continue;
        }
      }

      // Create new student
      const insertData: any = {
        tenantId,
        nama: row.nama,
        nisn: row.nisn || null,
        jenisKelamin:
          row.jenisKelamin === 'L' || row.jenisKelamin === 'P' ? row.jenisKelamin : null,
        tanggalLahir: row.tanggalLahir || null,
        kelasId: row.kelasId || null,
        status: 'aktif',
      };

      // Handle parent linkage
      if (row.orangTuaPhone) {
        const parentId = await this.resolveOrCreateParent(
          row.orangTuaPhone,
          row.orangTuaNama || row.nama,
        );
        insertData.orangTuaId = parentId;
      }

      await this.db.insert(siswa).values(insertData);
      created++;
    }

    return { created, updated, skipped };
  }
}
