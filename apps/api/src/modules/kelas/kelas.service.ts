import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, gt, asc, sql, count } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { kelas } from '@/drizzle/schema/kelas';
import { siswa } from '@/drizzle/schema/siswa';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { user } from '@/drizzle/schema/user';
import { CreateKelasDto, UpdateKelasDto, ListKelasQueryDto } from './dto';

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class KelasService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  // ─── Create Kelas ─────────────────────────────────────────────

  async createKelas(tenantId: string, dto: CreateKelasDto) {
    // Validate tahun_ajaran exists and belongs to tenant
    await this.validateTahunAjaran(tenantId, dto.tahunAjaranId);

    // Validate wali_kelas uniqueness if provided
    if (dto.waliKelasId) {
      await this.validateWaliKelasUniqueness(tenantId, dto.waliKelasId, dto.tahunAjaranId);
    }

    const [created] = await this.db
      .insert(kelas)
      .values({
        tenantId,
        tahunAjaranId: dto.tahunAjaranId,
        nama: dto.nama,
        tingkat: dto.tingkat,
        waliKelasId: dto.waliKelasId || null,
        kapasitas: dto.kapasitas || null,
      })
      .returning();

    return created;
  }

  // ─── List Kelas (cursor paginated, filter by tahun_ajaran) ────

  async listKelas(tenantId: string, query: ListKelasQueryDto) {
    const conditions = [eq(kelas.tenantId, tenantId)];

    if (query.tahunAjaranId) {
      conditions.push(eq(kelas.tahunAjaranId, query.tahunAjaranId));
    }

    if (query.cursor) {
      conditions.push(gt(kelas.id, query.cursor));
    }

    const results = await this.db
      .select({
        id: kelas.id,
        nama: kelas.nama,
        tingkat: kelas.tingkat,
        tahunAjaranId: kelas.tahunAjaranId,
        tahunAjaranNama: tahunAjaran.nama,
        waliKelasId: kelas.waliKelasId,
        waliKelasNama: user.nama,
        kapasitas: kelas.kapasitas,
        createdAt: kelas.createdAt,
        updatedAt: kelas.updatedAt,
      })
      .from(kelas)
      .leftJoin(tahunAjaran, eq(kelas.tahunAjaranId, tahunAjaran.id))
      .leftJoin(user, eq(kelas.waliKelasId, user.id))
      .where(and(...conditions))
      .orderBy(asc(kelas.id))
      .limit(DEFAULT_PAGE_SIZE + 1);

    const hasNext = results.length > DEFAULT_PAGE_SIZE;
    const rawData = hasNext ? results.slice(0, DEFAULT_PAGE_SIZE) : results;

    // Get student counts for each kelas
    const kelasIds = rawData.map((k) => k.id);
    let studentCounts: Record<string, number> = {};
    if (kelasIds.length > 0) {
      const countResults = await this.db
        .select({
          kelasId: siswa.kelasId,
          count: count(),
        })
        .from(siswa)
        .where(
          and(
            sql`${siswa.kelasId} IN (${sql.join(
              kelasIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
            eq(siswa.status, 'aktif'),
          ),
        )
        .groupBy(siswa.kelasId);

      studentCounts = Object.fromEntries(countResults.map((r) => [r.kelasId, Number(r.count)]));
    }

    const data = rawData.map((k) => ({
      id: k.id,
      nama: k.nama,
      tingkat: k.tingkat,
      wali_kelas_id: k.waliKelasId,
      wali_kelas_nama: k.waliKelasNama,
      tahun_ajaran_id: k.tahunAjaranId,
      tahun_ajaran_nama: k.tahunAjaranNama,
      kapasitas: k.kapasitas,
      jumlah_siswa: studentCounts[k.id] ?? 0,
    }));

    return { data };
  }

  // ─── Get Kelas Detail (with student count) ────────────────────

  async getKelasById(tenantId: string, kelasId: string) {
    const results = await this.db
      .select({
        id: kelas.id,
        nama: kelas.nama,
        tingkat: kelas.tingkat,
        tahunAjaranId: kelas.tahunAjaranId,
        waliKelasId: kelas.waliKelasId,
        kapasitas: kelas.kapasitas,
        createdAt: kelas.createdAt,
        updatedAt: kelas.updatedAt,
      })
      .from(kelas)
      .where(and(eq(kelas.id, kelasId), eq(kelas.tenantId, tenantId)))
      .limit(1);

    if (!results[0]) {
      throw new NotFoundException('Kelas tidak ditemukan');
    }

    // Get student count for this class (active students only)
    const [studentCount] = await this.db
      .select({ count: count() })
      .from(siswa)
      .where(and(eq(siswa.kelasId, kelasId), eq(siswa.status, 'aktif')));

    return {
      ...results[0],
      jumlahSiswa: Number(studentCount.count),
    };
  }

  // ─── Update Kelas ─────────────────────────────────────────────

  async updateKelas(tenantId: string, kelasId: string, dto: UpdateKelasDto) {
    // Verify kelas exists
    const existing = await this.getKelasById(tenantId, kelasId);

    // Validate wali_kelas uniqueness if being updated
    if (dto.waliKelasId !== undefined && dto.waliKelasId !== null) {
      await this.validateWaliKelasUniqueness(
        tenantId,
        dto.waliKelasId,
        existing.tahunAjaranId,
        kelasId,
      );
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.nama !== undefined) updateData.nama = dto.nama;
    if (dto.tingkat !== undefined) updateData.tingkat = dto.tingkat;
    if (dto.waliKelasId !== undefined) updateData.waliKelasId = dto.waliKelasId;
    if (dto.kapasitas !== undefined) updateData.kapasitas = dto.kapasitas;

    const [updated] = await this.db
      .update(kelas)
      .set(updateData)
      .where(and(eq(kelas.id, kelasId), eq(kelas.tenantId, tenantId)))
      .returning();

    return updated;
  }

  // ─── Delete Kelas ─────────────────────────────────────────────

  async deleteKelas(tenantId: string, kelasId: string) {
    // Verify kelas exists
    await this.getKelasById(tenantId, kelasId);

    // Check if kelas has active students
    const [studentCount] = await this.db
      .select({ count: count() })
      .from(siswa)
      .where(and(eq(siswa.kelasId, kelasId), eq(siswa.status, 'aktif')));

    const activeCount = Number(studentCount.count);
    if (activeCount > 0) {
      throw new BadRequestException(
        `Tidak dapat menghapus kelas. Masih terdapat ${activeCount} siswa aktif terdaftar di kelas ini.`,
      );
    }

    await this.db.delete(kelas).where(and(eq(kelas.id, kelasId), eq(kelas.tenantId, tenantId)));

    return { deleted: true };
  }

  // ─── Duplicate Class Structure ────────────────────────────────

  /**
   * Duplicates all kelas records from one tahun_ajaran to another.
   * Copies nama and tingkat, but leaves wali_kelas and students empty.
   * Called when a new tahun_ajaran is created.
   */
  async duplicateClassStructure(
    tenantId: string,
    fromTahunAjaranId: string,
    toTahunAjaranId: string,
  ): Promise<{ duplicated: number }> {
    // Get all classes from source tahun_ajaran
    const sourceClasses = await this.db
      .select({
        nama: kelas.nama,
        tingkat: kelas.tingkat,
        kapasitas: kelas.kapasitas,
      })
      .from(kelas)
      .where(and(eq(kelas.tenantId, tenantId), eq(kelas.tahunAjaranId, fromTahunAjaranId)));

    if (sourceClasses.length === 0) {
      return { duplicated: 0 };
    }

    // Insert duplicated classes (without wali_kelas)
    const values = sourceClasses.map((src) => ({
      tenantId,
      tahunAjaranId: toTahunAjaranId,
      nama: src.nama,
      tingkat: src.tingkat,
      kapasitas: src.kapasitas,
      waliKelasId: null,
    }));

    await this.db.insert(kelas).values(values);

    return { duplicated: sourceClasses.length };
  }

  // ─── Count Kelas by Tahun Ajaran ───────────────────────────────

  /**
   * Count classes for a given tahun_ajaran within a tenant.
   */
  async countByTahunAjaran(tenantId: string, tahunAjaranId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(kelas)
      .where(and(eq(kelas.tenantId, tenantId), eq(kelas.tahunAjaranId, tahunAjaranId)));

    return Number(result.count);
  }

  // ─── Validation Helpers ───────────────────────────────────────

  /**
   * Validates that the tahun_ajaran exists and belongs to the tenant.
   */
  private async validateTahunAjaran(tenantId: string, tahunAjaranId: string): Promise<void> {
    const results = await this.db
      .select({ id: tahunAjaran.id })
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.id, tahunAjaranId), eq(tahunAjaran.tenantId, tenantId)))
      .limit(1);

    if (!results[0]) {
      throw new NotFoundException('Tahun ajaran tidak ditemukan');
    }
  }

  /**
   * Validates that a guru is not already assigned as wali_kelas in another class
   * within the same tahun_ajaran.
   * One guru can only be wali_kelas of one class per tahun_ajaran.
   */
  private async validateWaliKelasUniqueness(
    tenantId: string,
    waliKelasId: string,
    tahunAjaranId: string,
    excludeKelasId?: string,
  ): Promise<void> {
    // First validate that the guru exists and belongs to tenant
    const guruResults = await this.db
      .select({ id: user.id })
      .from(user)
      .where(
        and(
          eq(user.id, waliKelasId),
          eq(user.tenantId, tenantId),
          eq(user.role, 'guru'),
          eq(user.isActive, true),
        ),
      )
      .limit(1);

    if (!guruResults[0]) {
      throw new NotFoundException('Guru tidak ditemukan atau tidak aktif');
    }

    // Check if guru is already wali_kelas of another class in the same tahun_ajaran
    const conditions = [
      eq(kelas.tenantId, tenantId),
      eq(kelas.waliKelasId, waliKelasId),
      eq(kelas.tahunAjaranId, tahunAjaranId),
    ];

    if (excludeKelasId) {
      conditions.push(sql`${kelas.id} != ${excludeKelasId}`);
    }

    const existing = await this.db
      .select({ id: kelas.id, nama: kelas.nama })
      .from(kelas)
      .where(and(...conditions))
      .limit(1);

    if (existing[0]) {
      throw new ConflictException(
        `Guru sudah menjadi wali kelas di "${existing[0].nama}" pada tahun ajaran yang sama`,
      );
    }
  }
}
