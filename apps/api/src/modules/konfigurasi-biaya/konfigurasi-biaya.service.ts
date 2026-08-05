import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { konfigurasiBiaya } from '@/drizzle/schema/konfigurasi-biaya';
import { UpsertKonfigBiayaDto, KonfigBiayaType } from './dto';

/**
 * Response DTO untuk satu record konfigurasi biaya.
 */
export interface KonfigBiayaResponseDto {
  id: string;
  type: 'per_siswa' | 'per_kelas';
  siswaId: string | null;
  kelasId: string | null;
  nominal: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Service untuk modul konfigurasi biaya sekolah.
 *
 * Logic upsert: jika sudah ada override untuk siswa/kelas yang sama di tenant ini,
 * nilai lama ditimpa (overwrite). Tidak ada duplikat per (tenantId, siswaId) atau
 * per (tenantId, kelasId).
 *
 * Requirements: 6.1, 6.2, 6.3, 6.6
 */
@Injectable()
export class KonfigurasiBiayaService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  /**
   * List semua konfigurasi biaya untuk tenant.
   *
   * Requirements: 6.1
   */
  async findAll(tenantId: string): Promise<KonfigBiayaResponseDto[]> {
    const rows = await this.db
      .select()
      .from(konfigurasiBiaya)
      .where(eq(konfigurasiBiaya.tenantId, tenantId))
      .orderBy(konfigurasiBiaya.createdAt);

    return rows.map((r) => this.toResponseDto(r));
  }

  /**
   * Upsert konfigurasi biaya.
   *
   * - Jika type = per_siswa: siswaId wajib, kelasId diabaikan
   * - Jika type = per_kelas: kelasId wajib, siswaId diabaikan
   *
   * Jika sudah ada record dengan (tenantId, siswaId) atau (tenantId, kelasId) yang sama,
   * nominal akan ditimpa (overwrite).
   *
   * Requirements: 6.1, 6.2, 6.3
   */
  async upsert(tenantId: string, dto: UpsertKonfigBiayaDto): Promise<KonfigBiayaResponseDto> {
    if (dto.type === KonfigBiayaType.PER_SISWA) {
      if (!dto.siswaId) {
        throw new BadRequestException('siswaId wajib diisi ketika type adalah per_siswa');
      }
      return this.upsertPerSiswa(tenantId, dto.siswaId, dto.nominal);
    } else {
      if (!dto.kelasId) {
        throw new BadRequestException('kelasId wajib diisi ketika type adalah per_kelas');
      }
      return this.upsertPerKelas(tenantId, dto.kelasId, dto.nominal);
    }
  }

  /**
   * Hapus satu record konfigurasi biaya berdasarkan id dan tenantId.
   *
   * Requirements: 6.1
   */
  async remove(tenantId: string, id: string): Promise<void> {
    const result = await this.db
      .delete(konfigurasiBiaya)
      .where(and(eq(konfigurasiBiaya.id, id), eq(konfigurasiBiaya.tenantId, tenantId)))
      .returning({ id: konfigurasiBiaya.id });

    if (result.length === 0) {
      throw new NotFoundException('Konfigurasi biaya tidak ditemukan');
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Upsert override per siswa. Cari record yang sudah ada berdasarkan
   * (tenantId, siswaId). Jika ada, update nominalnya. Jika tidak, insert baru.
   */
  private async upsertPerSiswa(
    tenantId: string,
    siswaId: string,
    nominal: number,
  ): Promise<KonfigBiayaResponseDto> {
    const existing = await this.db
      .select()
      .from(konfigurasiBiaya)
      .where(and(eq(konfigurasiBiaya.tenantId, tenantId), eq(konfigurasiBiaya.siswaId, siswaId)))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await this.db
        .update(konfigurasiBiaya)
        .set({ nominal, updatedAt: new Date() })
        .where(eq(konfigurasiBiaya.id, existing[0].id))
        .returning();
      return this.toResponseDto(updated);
    }

    const [inserted] = await this.db
      .insert(konfigurasiBiaya)
      .values({
        tenantId,
        type: 'per_siswa',
        siswaId,
        kelasId: null,
        nominal,
      })
      .returning();

    return this.toResponseDto(inserted);
  }

  /**
   * Upsert override per kelas. Cari record yang sudah ada berdasarkan
   * (tenantId, kelasId). Jika ada, update nominalnya. Jika tidak, insert baru.
   */
  private async upsertPerKelas(
    tenantId: string,
    kelasId: string,
    nominal: number,
  ): Promise<KonfigBiayaResponseDto> {
    const existing = await this.db
      .select()
      .from(konfigurasiBiaya)
      .where(and(eq(konfigurasiBiaya.tenantId, tenantId), eq(konfigurasiBiaya.kelasId, kelasId)))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await this.db
        .update(konfigurasiBiaya)
        .set({ nominal, updatedAt: new Date() })
        .where(eq(konfigurasiBiaya.id, existing[0].id))
        .returning();
      return this.toResponseDto(updated);
    }

    const [inserted] = await this.db
      .insert(konfigurasiBiaya)
      .values({
        tenantId,
        type: 'per_kelas',
        siswaId: null,
        kelasId,
        nominal,
      })
      .returning();

    return this.toResponseDto(inserted);
  }

  private toResponseDto(record: typeof konfigurasiBiaya.$inferSelect): KonfigBiayaResponseDto {
    return {
      id: record.id,
      type: record.type,
      siswaId: record.siswaId,
      kelasId: record.kelasId,
      nominal: record.nominal,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
