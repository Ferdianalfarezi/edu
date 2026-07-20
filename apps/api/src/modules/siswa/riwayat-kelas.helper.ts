import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { riwayatKelas } from '@/drizzle/schema/konfigurasi';

export interface RiwayatKelasEntry {
  tenantId: string;
  siswaId: string;
  kelasId: string;
  tahunAjaranId: string;
  tanggalMulai?: string; // YYYY-MM-DD, defaults to today
}

@Injectable()
export class RiwayatKelasHelper {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  /**
   * Records a single riwayat_kelas entry.
   * Called from SiswaService (create, update, import) and KenaikanKelasService (promote).
   * Always sets tanggalMulai to a non-null date value.
   */
  async record(params: RiwayatKelasEntry): Promise<void> {
    const tanggalMulai = params.tanggalMulai || new Date().toISOString().split('T')[0];

    await this.db.insert(riwayatKelas).values({
      tenantId: params.tenantId,
      siswaId: params.siswaId,
      kelasId: params.kelasId,
      tahunAjaranId: params.tahunAjaranId,
      tanggalMulai,
    });
  }

  /**
   * Batch record for bulk operations (import, promotion).
   * Uses a single db.insert().values(...) call for efficiency.
   * Always sets tanggalMulai to a non-null date value for each entry.
   * No-op if entries array is empty.
   */
  async recordBatch(entries: RiwayatKelasEntry[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const today = new Date().toISOString().split('T')[0];

    const values = entries.map((entry) => ({
      tenantId: entry.tenantId,
      siswaId: entry.siswaId,
      kelasId: entry.kelasId,
      tahunAjaranId: entry.tahunAjaranId,
      tanggalMulai: entry.tanggalMulai || today,
    }));

    await this.db.insert(riwayatKelas).values(values);
  }
}
