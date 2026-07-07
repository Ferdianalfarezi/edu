import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, sql, count } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { rapor } from '@/drizzle/schema/rapor';
import { kelas } from '@/drizzle/schema/kelas';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { user } from '@/drizzle/schema/user';
import { siswa } from '@/drizzle/schema/siswa';
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
}
