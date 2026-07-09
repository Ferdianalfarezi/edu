import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { rapor, raporNilai } from '@/drizzle/schema/rapor';
import { mataPelajaran } from '@/drizzle/schema/mata-pelajaran';
import { siswa } from '@/drizzle/schema/siswa';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';

/**
 * Represents a single subject's grade within a rapor period.
 */
export interface RaporNilaiMapelItem {
  mapel: string;
  komponen_nilai: { komponen_id: string; nilai: string | number }[];
  capaian_pembelajaran: string | null;
}

/**
 * Represents a single rapor period visible to the parent.
 */
export interface RaporPeriodResult {
  rapor_id: string;
  periode: string;
  tahun_ajaran: string;
  nilai: RaporNilaiMapelItem[];
  peringkat: number | null;
  rata_rata: string | null;
  catatan_wali_kelas: string | null;
  p5_deskripsi: { dimensi: string; deskripsi: string }[] | null;
}

/**
 * Service for orang_tua rapor view.
 * Only exposes finalized rapor periods.
 *
 * Requirements: 39.1–39.5
 */
@Injectable()
export class RaporOrangTuaService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  /**
   * GET /rapor/siswa/:siswaId — Returns all finalized rapor periods for a child.
   *
   * Validates:
   * - siswa exists
   * - parent owns the child (siswa.orang_tua_id == userId)
   * - Only rapor with status 'final' are returned (Req 39.1, 39.2)
   *
   * Returns per period: nilai per mapel, capaian, P5, catatan wali, peringkat, rata-rata (Req 39.3, 39.5)
   *
   * Requirements: 39.1, 39.2, 39.3, 39.4, 39.5
   */
  async getRaporSiswa(userId: string, siswaId: string): Promise<RaporPeriodResult[]> {
    // Validate siswa exists and parent owns this child
    const [siswaData] = await this.db
      .select({
        id: siswa.id,
        nama: siswa.nama,
        orangTuaId: siswa.orangTuaId,
        kelasId: siswa.kelasId,
        tenantId: siswa.tenantId,
      })
      .from(siswa)
      .where(eq(siswa.id, siswaId));

    if (!siswaData) {
      throw new NotFoundException('Siswa tidak ditemukan');
    }

    if (siswaData.orangTuaId !== userId) {
      throw new ForbiddenException('Anda tidak memiliki akses ke data rapor siswa ini');
    }

    // Get all finalized rapor records for this student's kelas
    // We need to find rapor records where siswa has nilai AND rapor.status == 'final'
    const finalRapors = await this.db
      .select({
        raporId: rapor.id,
        periode: rapor.periode,
        tahunAjaranId: rapor.tahunAjaranId,
        kelasId: rapor.kelasId,
      })
      .from(rapor)
      .where(and(eq(rapor.status, 'final'), eq(rapor.tenantId, siswaData.tenantId)));

    if (finalRapors.length === 0) {
      return [];
    }

    // For each final rapor, get the student's nilai entries
    const results: RaporPeriodResult[] = [];

    for (const raporRecord of finalRapors) {
      // Get nilai for this student in this rapor
      const nilaiRows = await this.db
        .select({
          mataPelajaranId: raporNilai.mataPelajaranId,
          komponenNilai: raporNilai.komponenNilai,
          capaianPembelajaran: raporNilai.capaianPembelajaran,
          peringkat: raporNilai.peringkat,
          rataRata: raporNilai.rataRata,
          catatanWaliKelas: raporNilai.catatanWaliKelas,
          p5Deskripsi: raporNilai.p5Deskripsi,
        })
        .from(raporNilai)
        .where(
          and(
            eq(raporNilai.raporId, raporRecord.raporId),
            eq(raporNilai.siswaId, siswaId),
            eq(raporNilai.tenantId, siswaData.tenantId),
          ),
        );

      // Skip rapor periods where this student has no nilai
      if (nilaiRows.length === 0) {
        continue;
      }

      // Get tahun_ajaran name
      const [taData] = await this.db
        .select({ nama: tahunAjaran.nama })
        .from(tahunAjaran)
        .where(eq(tahunAjaran.id, raporRecord.tahunAjaranId));

      const tahunAjaranNama = taData?.nama ?? '';

      // Get mapel names for all mata_pelajaran_ids in the nilai
      const mapelIds = nilaiRows.map((n) => n.mataPelajaranId);
      const mapelNames = new Map<string, string>();
      for (const mapelId of mapelIds) {
        if (!mapelNames.has(mapelId)) {
          const [mapelData] = await this.db
            .select({ nama: mataPelajaran.nama })
            .from(mataPelajaran)
            .where(eq(mataPelajaran.id, mapelId));
          if (mapelData) {
            mapelNames.set(mapelId, mapelData.nama);
          }
        }
      }

      // Build nilai per mapel
      const nilaiPerMapel: RaporNilaiMapelItem[] = nilaiRows.map((row) => ({
        mapel: mapelNames.get(row.mataPelajaranId) ?? '',
        komponen_nilai: (row.komponenNilai as any[]) ?? [],
        capaian_pembelajaran: row.capaianPembelajaran,
      }));

      // peringkat, rata_rata, catatan_wali_kelas, p5_deskripsi are per-student per-rapor
      // They may appear on any row (typically set per-student, same across all mapel entries)
      // Use first non-null found
      const peringkat = nilaiRows.find((r) => r.peringkat !== null)?.peringkat ?? null;
      const rataRata = nilaiRows.find((r) => r.rataRata !== null)?.rataRata ?? null;
      const catatanWaliKelas =
        nilaiRows.find((r) => r.catatanWaliKelas !== null)?.catatanWaliKelas ?? null;
      const p5Deskripsi =
        (nilaiRows.find((r) => r.p5Deskripsi !== null)?.p5Deskripsi as any[]) ?? null;

      results.push({
        rapor_id: raporRecord.raporId,
        periode: raporRecord.periode,
        tahun_ajaran: tahunAjaranNama,
        nilai: nilaiPerMapel,
        peringkat,
        rata_rata: rataRata,
        catatan_wali_kelas: catatanWaliKelas,
        p5_deskripsi: p5Deskripsi,
      });
    }

    return results;
  }
}
