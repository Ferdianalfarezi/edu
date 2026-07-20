import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { mataPelajaran } from '@/drizzle/schema/mata-pelajaran';
import { jadwalPelajaran } from '@/drizzle/schema/jadwal';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { kelas } from '@/drizzle/schema/kelas';
import { CreateMataPelajaranDto, UpdateMataPelajaranDto } from './dto';

@Injectable()
export class MataPelajaranService {
  constructor(private readonly drizzleService: DrizzleService) {}

  /**
   * Create a new mata pelajaran for a tenant.
   * Requirements: 31.1, 31.2
   */
  async create(tenantId: string, dto: CreateMataPelajaranDto) {
    const db = this.drizzleService.db;

    const [result] = await db
      .insert(mataPelajaran)
      .values({
        tenantId,
        nama: dto.nama,
        kode: dto.kode ?? null,
      })
      .returning();

    return result;
  }

  /**
   * List all mata pelajaran for a tenant.
   * Requirements: 31.2
   */
  async findAll(tenantId: string) {
    const db = this.drizzleService.db;

    const data = await db.select().from(mataPelajaran).where(eq(mataPelajaran.tenantId, tenantId));

    return { data };
  }

  /**
   * Get a single mata pelajaran by ID within a tenant.
   */
  async findOne(tenantId: string, id: string) {
    const db = this.drizzleService.db;

    const [result] = await db
      .select()
      .from(mataPelajaran)
      .where(and(eq(mataPelajaran.id, id), eq(mataPelajaran.tenantId, tenantId)));

    if (!result) {
      throw new NotFoundException('Mata pelajaran tidak ditemukan');
    }

    return result;
  }

  /**
   * Update a mata pelajaran.
   */
  async update(tenantId: string, id: string, dto: UpdateMataPelajaranDto) {
    // Verify existence first
    await this.findOne(tenantId, id);

    const db = this.drizzleService.db;

    const updateData: Record<string, unknown> = {};
    if (dto.nama !== undefined) updateData.nama = dto.nama;
    if (dto.kode !== undefined) updateData.kode = dto.kode;

    if (Object.keys(updateData).length === 0) {
      return this.findOne(tenantId, id);
    }

    const [result] = await db
      .update(mataPelajaran)
      .set(updateData)
      .where(and(eq(mataPelajaran.id, id), eq(mataPelajaran.tenantId, tenantId)))
      .returning();

    return result;
  }

  /**
   * Delete a mata pelajaran.
   * Requirements: 31.3, 31.4 — validate not used in active jadwal before deleting.
   */
  async remove(tenantId: string, id: string) {
    // Verify existence
    await this.findOne(tenantId, id);

    const db = this.drizzleService.db;

    // Find the active tahun ajaran for this tenant
    const [activeTahunAjaran] = await db
      .select()
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.tenantId, tenantId), eq(tahunAjaran.status, 'aktif')));

    if (activeTahunAjaran) {
      // Check if any jadwal_pelajaran references this mata_pelajaran in the active tahun_ajaran
      const activeJadwal = await db
        .select({
          id: jadwalPelajaran.id,
          hari: jadwalPelajaran.hari,
          jamKe: jadwalPelajaran.jamKe,
          kelasNama: kelas.nama,
        })
        .from(jadwalPelajaran)
        .innerJoin(kelas, eq(jadwalPelajaran.kelasId, kelas.id))
        .where(
          and(
            eq(jadwalPelajaran.mataPelajaranId, id),
            eq(jadwalPelajaran.tenantId, tenantId),
            eq(jadwalPelajaran.tahunAjaranId, activeTahunAjaran.id),
          ),
        );

      if (activeJadwal.length > 0) {
        const jadwalList = activeJadwal.map(
          (j) => `${j.kelasNama} - ${j.hari} (Jam ke-${j.jamKe})`,
        );

        throw new BadRequestException({
          message: 'Mata pelajaran tidak dapat dihapus karena masih digunakan dalam jadwal aktif',
          jadwal: jadwalList,
        });
      }
    }

    // Safe to delete
    await db
      .delete(mataPelajaran)
      .where(and(eq(mataPelajaran.id, id), eq(mataPelajaran.tenantId, tenantId)));

    return { message: 'Mata pelajaran berhasil dihapus' };
  }
}
