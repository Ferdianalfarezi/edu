import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, inArray } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { kelas } from '@/drizzle/schema/kelas';
import { siswa } from '@/drizzle/schema/siswa';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { riwayatKelas } from '@/drizzle/schema/konfigurasi';
import { PromoteStudentsDto, PreviewPromotionDto } from './dto';

@Injectable()
export class KenaikanKelasService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  // ─── GET /kenaikan-kelas/kelas/:kelasId ───────────────────────

  /**
   * List active students in a class and suggest a target class (tingkat+1)
   * in the newest tahun_ajaran with status 'disiapkan' or 'aktif'.
   *
   * Requirements: 30.1, 30.7
   */
  async getStudentsForPromotion(tenantId: string, kelasId: string) {
    // 1. Get the source kelas
    const [sourceKelas] = await this.db
      .select({
        id: kelas.id,
        nama: kelas.nama,
        tingkat: kelas.tingkat,
        tahunAjaranId: kelas.tahunAjaranId,
      })
      .from(kelas)
      .where(and(eq(kelas.id, kelasId), eq(kelas.tenantId, tenantId)))
      .limit(1);

    if (!sourceKelas) {
      throw new NotFoundException('Kelas tidak ditemukan');
    }

    // 2. Get active students in this class
    const students = await this.db
      .select({
        siswaId: siswa.id,
        nama: siswa.nama,
        nisn: siswa.nisn,
      })
      .from(siswa)
      .where(
        and(eq(siswa.kelasId, kelasId), eq(siswa.tenantId, tenantId), eq(siswa.status, 'aktif')),
      );

    // 3. Find suggested target class: same tenant, tingkat+1, in the newest
    //    tahun_ajaran that is 'disiapkan' (prepared for next year)
    const targetTingkat = sourceKelas.tingkat + 1;

    // Find tahun_ajaran 'disiapkan' for this tenant (next academic year)
    const [preparedTahunAjaran] = await this.db
      .select({ id: tahunAjaran.id, nama: tahunAjaran.nama })
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.tenantId, tenantId), eq(tahunAjaran.status, 'disiapkan')))
      .limit(1);

    let suggestedTarget: { kelasId: string; nama: string; tingkat: number } | null = null;

    if (preparedTahunAjaran) {
      // Find a class at tingkat+1 in the prepared tahun_ajaran
      const [targetKelas] = await this.db
        .select({
          id: kelas.id,
          nama: kelas.nama,
          tingkat: kelas.tingkat,
        })
        .from(kelas)
        .where(
          and(
            eq(kelas.tenantId, tenantId),
            eq(kelas.tahunAjaranId, preparedTahunAjaran.id),
            eq(kelas.tingkat, targetTingkat),
          ),
        )
        .limit(1);

      if (targetKelas) {
        suggestedTarget = {
          kelasId: targetKelas.id,
          nama: targetKelas.nama,
          tingkat: targetKelas.tingkat,
        };
      }
    }

    return {
      currentKelas: {
        id: sourceKelas.id,
        nama: sourceKelas.nama,
        tingkat: sourceKelas.tingkat,
        tahunAjaranId: sourceKelas.tahunAjaranId,
      },
      students: students.map((s) => ({
        siswaId: s.siswaId,
        nama: s.nama,
        nisn: s.nisn,
      })),
      suggestedTarget,
    };
  }

  // ─── POST /kenaikan-kelas/preview ─────────────────────────────

  /**
   * Preview promotion: returns students from sourceKelas and finds target class
   * in the new tahun_ajaran. Does not execute any changes.
   */
  async previewPromotion(tenantId: string, dto: PreviewPromotionDto) {
    const { source_kelas_id: sourceKelasId, target_tahun_ajaran_id: tahunAjaranBaruId } = dto;

    // Get source kelas
    const [sourceKelas] = await this.db
      .select({
        id: kelas.id,
        nama: kelas.nama,
        tingkat: kelas.tingkat,
        tahunAjaranId: kelas.tahunAjaranId,
      })
      .from(kelas)
      .where(and(eq(kelas.id, sourceKelasId), eq(kelas.tenantId, tenantId)))
      .limit(1);

    if (!sourceKelas) {
      throw new NotFoundException('Kelas asal tidak ditemukan');
    }

    // Get active students in source class
    const students = await this.db
      .select({
        siswaId: siswa.id,
        nama: siswa.nama,
        nisn: siswa.nisn,
      })
      .from(siswa)
      .where(
        and(
          eq(siswa.kelasId, sourceKelasId),
          eq(siswa.tenantId, tenantId),
          eq(siswa.status, 'aktif'),
        ),
      );

    // Find target class at tingkat+1 in new tahun ajaran
    const targetTingkat = sourceKelas.tingkat + 1;
    const [targetKelas] = await this.db
      .select({
        id: kelas.id,
        nama: kelas.nama,
        tingkat: kelas.tingkat,
      })
      .from(kelas)
      .where(
        and(
          eq(kelas.tenantId, tenantId),
          eq(kelas.tahunAjaranId, tahunAjaranBaruId),
          eq(kelas.tingkat, targetTingkat),
        ),
      )
      .limit(1);

    return {
      students: students.map((s) => ({
        siswa_id: s.siswaId,
        nama: s.nama,
        nisn: s.nisn,
      })),
      source_kelas: {
        id: sourceKelas.id,
        nama: sourceKelas.nama,
        tingkat: sourceKelas.tingkat,
      },
      target_kelas: targetKelas
        ? { id: targetKelas.id, nama: targetKelas.nama, tingkat: targetKelas.tingkat }
        : null,
      is_highest_grade: !targetKelas,
    };
  }

  // ─── POST /kenaikan-kelas/execute ─────────────────────────────────────

  /**
   * Mass promote students to a target class in a new tahun_ajaran.
   * - Moves siswa_ids to target_kelas_id
   * - For lulus_ids: set siswa.status = 'lulus'
   * - Records riwayat_kelas for all promoted/graduated students
   * - Validates target kelas belongs to tahun_ajaran_baru
   *
   * Requirements: 30.2, 30.3, 30.4, 30.5, 30.8, 30.9
   */
  async promoteStudents(tenantId: string, dto: PromoteStudentsDto) {
    const {
      source_kelas_id: sourceKelasId,
      target_kelas_id: targetKelasId,
      target_tahun_ajaran_id: tahunAjaranBaruId,
      excluded_siswa_ids: excludedIds = [],
      lulus_ids: lulusIds,
    } = dto;

    // 1. Validate tahun_ajaran baru exists and belongs to tenant
    const [newTahunAjaran] = await this.db
      .select({ id: tahunAjaran.id, status: tahunAjaran.status })
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.id, tahunAjaranBaruId), eq(tahunAjaran.tenantId, tenantId)))
      .limit(1);

    if (!newTahunAjaran) {
      throw new NotFoundException('Tahun ajaran baru tidak ditemukan');
    }

    // 2. Validate source kelas exists and get its tahun_ajaran
    const [sourceKelas] = await this.db
      .select({
        id: kelas.id,
        nama: kelas.nama,
        tingkat: kelas.tingkat,
        tahunAjaranId: kelas.tahunAjaranId,
      })
      .from(kelas)
      .where(and(eq(kelas.id, sourceKelasId), eq(kelas.tenantId, tenantId)))
      .limit(1);

    if (!sourceKelas) {
      throw new NotFoundException('Kelas asal tidak ditemukan');
    }

    // 3. Get all active students from source kelas
    const allActiveStudents = await this.db
      .select({ id: siswa.id })
      .from(siswa)
      .where(
        and(
          eq(siswa.kelasId, sourceKelasId),
          eq(siswa.tenantId, tenantId),
          eq(siswa.status, 'aktif'),
        ),
      );

    const excludedSet = new Set(excludedIds);
    const lulusSet = new Set(lulusIds || []);

    // Derive siswaIds to promote: all active students minus excluded and lulus
    const siswaIds = allActiveStudents
      .map((s) => s.id)
      .filter((id) => !excludedSet.has(id) && !lulusSet.has(id));

    // 4. Validate target kelas exists AND belongs to tahun_ajaran_baru (if provided)
    let targetKelas: { id: string; nama: string; tingkat: number; tahunAjaranId: string } | null =
      null;
    if (targetKelasId) {
      const [found] = await this.db
        .select({
          id: kelas.id,
          nama: kelas.nama,
          tingkat: kelas.tingkat,
          tahunAjaranId: kelas.tahunAjaranId,
        })
        .from(kelas)
        .where(and(eq(kelas.id, targetKelasId), eq(kelas.tenantId, tenantId)))
        .limit(1);

      if (!found) {
        throw new NotFoundException('Kelas tujuan tidak ditemukan');
      }

      if (found.tahunAjaranId !== tahunAjaranBaruId) {
        throw new BadRequestException(
          'Kelas tujuan tidak termasuk dalam tahun ajaran baru yang dipilih',
        );
      }
      targetKelas = found;
    }

    // 5. Validate lulusIds (if provided) are active students in source kelas
    if (lulusIds && lulusIds.length > 0) {
      const lulusStudents = await this.db
        .select({ id: siswa.id })
        .from(siswa)
        .where(
          and(
            eq(siswa.kelasId, sourceKelasId),
            eq(siswa.tenantId, tenantId),
            eq(siswa.status, 'aktif'),
            inArray(siswa.id, lulusIds),
          ),
        );

      const lulusStudentIds = new Set(lulusStudents.map((s) => s.id));
      const invalidLulusIds = lulusIds.filter((id) => !lulusStudentIds.has(id));
      if (invalidLulusIds.length > 0) {
        throw new BadRequestException(
          `Beberapa siswa lulus tidak ditemukan atau tidak aktif di kelas asal: ${invalidLulusIds.join(', ')}`,
        );
      }
    }

    // 6. Execute promotion — move siswaIds to target class
    let promotedCount = 0;
    if (siswaIds.length > 0 && targetKelas) {
      await this.db
        .update(siswa)
        .set({ kelasId: targetKelas.id, updatedAt: new Date() })
        .where(and(eq(siswa.tenantId, tenantId), inArray(siswa.id, siswaIds)));
      promotedCount = siswaIds.length;
    }

    // 7. Mark lulus students as alumni
    let lulusCount = 0;
    if (lulusIds && lulusIds.length > 0) {
      await this.db
        .update(siswa)
        .set({ status: 'lulus', kelasId: null, updatedAt: new Date() })
        .where(and(eq(siswa.tenantId, tenantId), inArray(siswa.id, lulusIds)));
      lulusCount = lulusIds.length;
    }

    // 8. Record riwayat_kelas for promoted students (their history in the source kelas)
    const riwayatRecords = [
      ...siswaIds.map((siswaId) => ({
        tenantId,
        siswaId,
        kelasId: sourceKelasId,
        tahunAjaranId: sourceKelas.tahunAjaranId,
      })),
      ...(lulusIds || []).map((siswaId) => ({
        tenantId,
        siswaId,
        kelasId: sourceKelasId,
        tahunAjaranId: sourceKelas.tahunAjaranId,
      })),
    ];

    if (riwayatRecords.length > 0) {
      await this.db.insert(riwayatKelas).values(riwayatRecords);
    }

    return {
      promoted: promotedCount,
      excluded: excludedIds.length,
      graduated: lulusCount,
      targetKelas: targetKelas
        ? {
            id: targetKelas.id,
            nama: targetKelas.nama,
            tingkat: targetKelas.tingkat,
          }
        : null,
      sourceKelas: {
        id: sourceKelas.id,
        nama: sourceKelas.nama,
        tingkat: sourceKelas.tingkat,
      },
    };
  }
}
