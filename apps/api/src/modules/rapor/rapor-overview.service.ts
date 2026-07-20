import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, sql, count } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { rapor, komponenPenilaian } from '@/drizzle/schema/rapor';
import { kelas } from '@/drizzle/schema/kelas';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { user } from '@/drizzle/schema/user';
import { siswa } from '@/drizzle/schema/siswa';
import { mataPelajaran } from '@/drizzle/schema/mata-pelajaran';
import { raporNilai } from '@/drizzle/schema/rapor';
import { GetRaporOverviewQueryDto } from './dto';

/**
 * Response item for the rapor overview endpoint.
 */
export interface RaporOverviewItem {
  rapor_id: string;
  kelas_id: string;
  kelas_nama: string;
  periode: string;
  tahun_ajaran_id: string;
  tahun_ajaran_nama: string;
  status: 'draft' | 'final';
  finalized_by: string | null;
  finalized_at: string | null;
  total_students: number;
  submitted_count: number;
}

/**
 * RaporOverviewService — Provides read-only rapor overview for kepala_sekolah.
 * Shows all rapor (draft + final) with status indicator, filterable by kelas, periode, tahun_ajaran.
 *
 * Requirements: 38.11, 38.12
 */
@Injectable()
export class RaporOverviewService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  /**
   * GET /rapor/overview
   * Returns all rapor records with status indicator for kepala_sekolah.
   * Filters: kelas_id (optional), periode (optional), tahun_ajaran_id (optional).
   * If no tahun_ajaran_id filter, defaults to active tahun_ajaran.
   *
   * Requirements: 38.11, 38.12
   */
  async getOverview(
    tenantId: string,
    query: GetRaporOverviewQueryDto,
  ): Promise<RaporOverviewItem[]> {
    const { kelas_id, periode, tahun_ajaran_id } = query;

    // Determine tahun_ajaran filter: use provided or default to active
    let targetTahunAjaranId = tahun_ajaran_id;
    if (!targetTahunAjaranId) {
      const activeTa = await this.db
        .select({ id: tahunAjaran.id })
        .from(tahunAjaran)
        .where(and(eq(tahunAjaran.tenantId, tenantId), eq(tahunAjaran.status, 'aktif')))
        .limit(1);

      if (activeTa.length === 0) {
        return [];
      }
      targetTahunAjaranId = activeTa[0].id;
    }

    // Build conditions for rapor query
    const conditions = [eq(rapor.tenantId, tenantId), eq(rapor.tahunAjaranId, targetTahunAjaranId)];

    if (kelas_id) {
      conditions.push(eq(rapor.kelasId, kelas_id));
    }

    if (periode) {
      conditions.push(eq(rapor.periode, periode as any));
    }

    // Query rapor records with joins to kelas, tahun_ajaran, user (finalized_by)
    const raporRows = await this.db
      .select({
        raporId: rapor.id,
        kelasId: rapor.kelasId,
        kelasNama: kelas.nama,
        periode: rapor.periode,
        tahunAjaranId: rapor.tahunAjaranId,
        tahunAjaranNama: tahunAjaran.nama,
        status: rapor.status,
        finalizedBy: user.nama,
        finalizedAt: rapor.finalizedAt,
      })
      .from(rapor)
      .innerJoin(kelas, eq(rapor.kelasId, kelas.id))
      .innerJoin(tahunAjaran, eq(rapor.tahunAjaranId, tahunAjaran.id))
      .leftJoin(user, eq(rapor.finalizedBy, user.id))
      .where(and(...conditions))
      .orderBy(kelas.nama, rapor.periode);

    if (raporRows.length === 0) {
      return [];
    }

    // For each rapor, compute total_students and submitted_count
    const result: RaporOverviewItem[] = [];

    for (const row of raporRows) {
      // Count active students in this kelas
      const studentCountResult = await this.db
        .select({ count: count() })
        .from(siswa)
        .where(
          and(
            eq(siswa.kelasId, row.kelasId),
            eq(siswa.tenantId, tenantId),
            eq(siswa.status, 'aktif'),
          ),
        );
      const totalStudents = Number(studentCountResult[0]?.count ?? 0);

      // Count distinct siswa with at least one submitted rapor_nilai entry in this rapor
      const submittedCountResult = await this.db
        .select({ count: sql<number>`COUNT(DISTINCT ${raporNilai.siswaId})` })
        .from(raporNilai)
        .where(and(eq(raporNilai.raporId, row.raporId), eq(raporNilai.status, 'submitted')));
      const submittedCount = Number(submittedCountResult[0]?.count ?? 0);

      result.push({
        rapor_id: row.raporId,
        kelas_id: row.kelasId,
        kelas_nama: row.kelasNama,
        periode: row.periode,
        tahun_ajaran_id: row.tahunAjaranId,
        tahun_ajaran_nama: row.tahunAjaranNama,
        status: row.status,
        finalized_by: row.finalizedBy ?? null,
        finalized_at: row.finalizedAt ? row.finalizedAt.toISOString() : null,
        total_students: totalStudents,
        submitted_count: submittedCount,
      });
    }

    return result;
  }

  /**
   * GET /rapor/view
   * Returns detailed rapor view for a specific kelas and periode.
   * Includes overview info and per-siswa grades.
   */
  async getRaporView(tenantId: string, kelasId: string, periodeId: string) {
    if (!kelasId || !periodeId) {
      return { overview: null, siswa: [] };
    }

    // Find the rapor record
    const raporRows = await this.db
      .select({
        raporId: rapor.id,
        kelasId: rapor.kelasId,
        kelasNama: kelas.nama,
        periode: rapor.periode,
        tahunAjaranId: rapor.tahunAjaranId,
        tahunAjaranNama: tahunAjaran.nama,
        status: rapor.status,
        finalizedBy: user.nama,
        finalizedAt: rapor.finalizedAt,
      })
      .from(rapor)
      .innerJoin(kelas, eq(rapor.kelasId, kelas.id))
      .innerJoin(tahunAjaran, eq(rapor.tahunAjaranId, tahunAjaran.id))
      .leftJoin(user, eq(rapor.finalizedBy, user.id))
      .where(
        and(
          eq(rapor.tenantId, tenantId),
          eq(rapor.kelasId, kelasId),
          eq(rapor.periode, periodeId as any),
        ),
      )
      .limit(1);

    if (raporRows.length === 0) {
      return { overview: null, siswa: [] };
    }

    const raporRecord = raporRows[0];

    // Count students
    const studentCountResult = await this.db
      .select({ count: count() })
      .from(siswa)
      .where(
        and(eq(siswa.kelasId, kelasId), eq(siswa.tenantId, tenantId), eq(siswa.status, 'aktif')),
      );
    const totalStudents = Number(studentCountResult[0]?.count ?? 0);

    // Count submitted
    const submittedCountResult = await this.db
      .select({ count: sql<number>`COUNT(DISTINCT ${raporNilai.siswaId})` })
      .from(raporNilai)
      .where(and(eq(raporNilai.raporId, raporRecord.raporId), eq(raporNilai.status, 'submitted')));
    const submittedCount = Number(submittedCountResult[0]?.count ?? 0);

    const overview = {
      rapor_id: raporRecord.raporId,
      kelas_id: raporRecord.kelasId,
      kelas_nama: raporRecord.kelasNama,
      periode: raporRecord.periode,
      tahun_ajaran_id: raporRecord.tahunAjaranId,
      tahun_ajaran_nama: raporRecord.tahunAjaranNama,
      status: raporRecord.status,
      finalized_by: raporRecord.finalizedBy ?? null,
      finalized_at: raporRecord.finalizedAt ? raporRecord.finalizedAt.toISOString() : null,
      total_students: totalStudents,
      submitted_count: submittedCount,
    };

    // Get per-siswa grades with mata_pelajaran names
    const nilaiRows = await this.db
      .select({
        siswaId: raporNilai.siswaId,
        siswaNama: siswa.nama,
        siswaNisn: siswa.nisn,
        mataPelajaranId: raporNilai.mataPelajaranId,
        mataPelajaranNama: mataPelajaran.nama,
        komponenNilai: raporNilai.komponenNilai,
        capaianPembelajaran: raporNilai.capaianPembelajaran,
        status: raporNilai.status,
        peringkat: raporNilai.peringkat,
        rataRata: raporNilai.rataRata,
        catatanWaliKelas: raporNilai.catatanWaliKelas,
        p5Deskripsi: raporNilai.p5Deskripsi,
      })
      .from(raporNilai)
      .innerJoin(siswa, eq(raporNilai.siswaId, siswa.id))
      .innerJoin(mataPelajaran, eq(raporNilai.mataPelajaranId, mataPelajaran.id))
      .where(eq(raporNilai.raporId, raporRecord.raporId))
      .orderBy(siswa.nama);

    // Get all komponen penilaian for this tenant to resolve komponen names
    const komponenList = await this.db
      .select({
        id: komponenPenilaian.id,
        nama: komponenPenilaian.nama,
      })
      .from(komponenPenilaian)
      .where(eq(komponenPenilaian.tenantId, tenantId));

    const komponenMap = new Map(komponenList.map((k) => [k.id, k.nama]));

    // Group by student — matching frontend SiswaRaporView interface
    const siswaMap = new Map<
      string,
      {
        siswa_id: string;
        siswa_nama: string;
        nisn: string | null;
        rata_rata: number | null;
        peringkat: number | null;
        catatan_wali_kelas: string | null;
        p5_deskripsi: any;
        nilai_per_mapel: {
          mata_pelajaran_nama: string;
          komponen_nilai: { komponen_nama: string; nilai: string | number }[];
          capaian_pembelajaran: string | null;
        }[];
      }
    >();

    for (const row of nilaiRows) {
      if (!siswaMap.has(row.siswaId)) {
        siswaMap.set(row.siswaId, {
          siswa_id: row.siswaId,
          siswa_nama: row.siswaNama,
          nisn: row.siswaNisn ?? null,
          rata_rata: row.rataRata ? Number(row.rataRata) : null,
          peringkat: row.peringkat,
          catatan_wali_kelas: row.catatanWaliKelas,
          p5_deskripsi: row.p5Deskripsi,
          nilai_per_mapel: [],
        });
      }

      // Resolve komponen_nilai from JSON [{komponen_id, nilai}] to [{komponen_nama, nilai}]
      const rawKomponen = (row.komponenNilai as any[]) || [];
      const resolvedKomponen = rawKomponen.map(
        (k: { komponen_id: string; nilai: string | number }) => ({
          komponen_nama: komponenMap.get(k.komponen_id) || k.komponen_id,
          nilai: k.nilai,
        }),
      );

      siswaMap.get(row.siswaId)!.nilai_per_mapel.push({
        mata_pelajaran_nama: row.mataPelajaranNama,
        komponen_nilai: resolvedKomponen,
        capaian_pembelajaran: row.capaianPembelajaran,
      });

      // Update rata_rata to the max across all entries (take the first non-null value found)
      // The rata_rata is usually stored per-student-per-mapel but displayed as overall
      const entry = siswaMap.get(row.siswaId)!;
      if (row.rataRata && entry.rata_rata === null) {
        entry.rata_rata = Number(row.rataRata);
      }
    }

    // Calculate overall rata_rata per student (average of all mapel rata_rata values)
    for (const entry of siswaMap.values()) {
      const mapelRataRata = nilaiRows
        .filter((r) => r.siswaId === entry.siswa_id && r.rataRata !== null)
        .map((r) => Number(r.rataRata));

      if (mapelRataRata.length > 0) {
        entry.rata_rata =
          Math.round((mapelRataRata.reduce((a, b) => a + b, 0) / mapelRataRata.length) * 100) / 100;
      }
    }

    return {
      overview,
      siswa: Array.from(siswaMap.values()),
    };
  }
}
