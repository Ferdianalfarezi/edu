import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { KelasService } from '@/modules/kelas/kelas.service';
import { CreateTahunAjaranDto } from './dto';

export interface TahunAjaranDetail {
  id: string;
  tenantId: string;
  nama: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  status: string;
  createdAt: Date | null;
  kelasCount: number;
}

@Injectable()
export class TahunAjaranService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly kelasService: KelasService,
  ) {}

  /**
   * Create a new tahun ajaran with status 'disiapkan'.
   * Duplicates class structure from the currently active tahun ajaran.
   */
  async create(tenantId: string, dto: CreateTahunAjaranDto) {
    // Validate tanggal_mulai < tanggal_selesai
    if (dto.tanggal_mulai >= dto.tanggal_selesai) {
      throw new BadRequestException('Tanggal mulai harus sebelum tanggal selesai');
    }

    // Create tahun ajaran with default status 'disiapkan'
    const [created] = await this.db
      .insert(tahunAjaran)
      .values({
        tenantId,
        nama: dto.nama,
        tanggalMulai: dto.tanggal_mulai,
        tanggalSelesai: dto.tanggal_selesai,
        status: 'disiapkan',
      })
      .returning();

    // Find the currently active tahun ajaran to duplicate class structure
    const activeList = await this.db
      .select()
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.tenantId, tenantId), eq(tahunAjaran.status, 'aktif')));

    let duplicatedCount = 0;
    if (activeList.length > 0) {
      const result = await this.kelasService.duplicateClassStructure(
        tenantId,
        activeList[0].id,
        created.id,
      );
      duplicatedCount = result.duplicated;
    }

    return {
      ...created,
      duplicatedClassCount: duplicatedCount,
    };
  }

  /**
   * List all tahun ajaran for a tenant, ordered by tanggal_mulai.
   */
  async findAll(tenantId: string) {
    const results = await this.db
      .select()
      .from(tahunAjaran)
      .where(eq(tahunAjaran.tenantId, tenantId))
      .orderBy(tahunAjaran.tanggalMulai);

    return results;
  }

  /**
   * Get tahun ajaran detail with class count.
   */
  async findOne(tenantId: string, id: string): Promise<TahunAjaranDetail> {
    const results = await this.db
      .select()
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.id, id), eq(tahunAjaran.tenantId, tenantId)));

    if (results.length === 0) {
      throw new NotFoundException(`Tahun ajaran dengan id ${id} tidak ditemukan`);
    }

    const ta = results[0];
    const kelasCount = await this.kelasService.countByTahunAjaran(tenantId, id);

    return {
      id: ta.id,
      tenantId: ta.tenantId,
      nama: ta.nama,
      tanggalMulai: ta.tanggalMulai,
      tanggalSelesai: ta.tanggalSelesai,
      status: ta.status,
      createdAt: ta.createdAt,
      kelasCount,
    };
  }

  /**
   * Activate a tahun ajaran:
   * 1. Verify target exists and has status 'disiapkan'
   * 2. Find the currently active one in this tenant
   * 3. Set the previous active to 'nonaktif'
   * 4. Set the target to 'aktif'
   *
   * Ensures at most ONE active tahun ajaran per tenant at any time.
   */
  async activate(tenantId: string, id: string) {
    // Verify the target exists and belongs to this tenant
    const targets = await this.db
      .select()
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.id, id), eq(tahunAjaran.tenantId, tenantId)));

    if (targets.length === 0) {
      throw new NotFoundException(`Tahun ajaran dengan id ${id} tidak ditemukan`);
    }

    const target = targets[0];

    if (target.status === 'aktif') {
      throw new BadRequestException('Tahun ajaran ini sudah aktif');
    }

    if (target.status !== 'disiapkan') {
      throw new BadRequestException(
        'Hanya tahun ajaran dengan status "disiapkan" yang dapat diaktifkan',
      );
    }

    // Find currently active tahun ajaran (if any)
    const activeList = await this.db
      .select()
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.tenantId, tenantId), eq(tahunAjaran.status, 'aktif')));

    // Deactivate previous active
    if (activeList.length > 0) {
      await this.db
        .update(tahunAjaran)
        .set({ status: 'nonaktif' })
        .where(eq(tahunAjaran.id, activeList[0].id));
    }

    // Activate the target
    await this.db.update(tahunAjaran).set({ status: 'aktif' }).where(eq(tahunAjaran.id, id));

    return {
      id: target.id,
      nama: target.nama,
      status: 'aktif',
      previousActiveId: activeList.length > 0 ? activeList[0].id : null,
    };
  }
}
