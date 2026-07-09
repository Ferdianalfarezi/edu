import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, sql } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { rapor, raporNilai, komponenPenilaian } from '@/drizzle/schema/rapor';
import { kelas } from '@/drizzle/schema/kelas';
import { siswa } from '@/drizzle/schema/siswa';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { jadwalPelajaran } from '@/drizzle/schema/jadwal';
import { mataPelajaran } from '@/drizzle/schema/mata-pelajaran';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';
import { FinalizeRaporDto } from './dto';

/**
 * Mapel submission status info — used to report which subjects are missing.
 */
export interface MapelSubmissionStatus {
  mata_pelajaran_id: string;
  mata_pelajaran_nama: string;
  submitted: boolean;
}

/**
 * Finalization result returned to the controller.
 */
export interface FinalizeResult {
  rapor_id: string;
  status: 'final';
  total_students: number;
  rankings: { siswa_id: string; siswa_nama: string; rata_rata: number; peringkat: number }[];
}

/**
 * Revert result returned to the controller.
 */
export interface RevertResult {
  rapor_id: string;
  status: 'draft';
}

/**
 * RaporFinalizationService handles finalization and revert of rapor by wali kelas.
 *
 * Key logic:
 * - Validate all mapel for the class have been submitted
 * - Calculate ranking (rata_rata per student → rank by DESC)
 * - Set rapor.status='final', notify parents
 * - Revert: set back to 'draft', hide from parents
 * - Block guru edits after finalization (handled in RaporNilaiService.saveNilai)
 *
 * Requirements: 38.1–38.12
 */
@Injectable()
export class RaporFinalizationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private readonly notificationQueue: Queue,
  ) {}

  // ═══════════════════════════════════════════════════════════════════
  // POST /rapor/kelas/:kelasId/periode/:periodeId/finalize
  // Requirements: 38.1–38.10
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Finalize rapor for a class+period.
   *
   * Steps:
   * 1. Validate wali_kelas ownership
   * 2. Validate all mapel submitted
   * 3. Save P5 + catatan wali kelas (if provided)
   * 4. Calculate rata_rata and peringkat
   * 5. Set rapor.status = 'final'
   * 6. Send notification to parents
   */
  async finalizeRapor(
    tenantId: string,
    userId: string,
    kelasId: string,
    periodeId: string,
    dto: FinalizeRaporDto,
  ): Promise<FinalizeResult> {
    // 1. Validate period
    this.validatePeriode(periodeId);

    // 2. Validate wali kelas
    await this.validateWaliKelas(tenantId, userId, kelasId);

    // 3. Get or create rapor record
    const activeTa = await this.getActiveTahunAjaran(tenantId);
    if (!activeTa) {
      throw new BadRequestException('Tidak ada tahun ajaran aktif');
    }

    const raporRecord = await this.getOrCreateRapor(tenantId, kelasId, activeTa.id, periodeId);

    // Already final? reject
    if (raporRecord.status === 'final') {
      throw new BadRequestException('Rapor sudah dalam status final');
    }

    // 4. Validate all mapel submitted (Req 38.1, 38.2)
    const mapelStatuses = await this.getMapelSubmissionStatuses(
      tenantId,
      kelasId,
      raporRecord.id,
      activeTa.id,
    );
    const missingMapel = mapelStatuses.filter((m) => !m.submitted);
    if (missingMapel.length > 0) {
      throw new BadRequestException({
        message: 'Tidak dapat memfinalisasi rapor. Beberapa mata pelajaran belum di-submit.',
        missing_mapel: missingMapel.map((m) => ({
          mata_pelajaran_id: m.mata_pelajaran_id,
          mata_pelajaran_nama: m.mata_pelajaran_nama,
        })),
      });
    }

    // 5. Save P5 + catatan wali kelas if provided (Req 38.4, 38.5)
    if (dto.student_notes && dto.student_notes.length > 0) {
      await this.saveStudentNotes(tenantId, raporRecord.id, dto.student_notes);
    }

    // 6. Calculate rata_rata and peringkat (Req 38.6)
    const rankings = await this.calculateRankings(tenantId, raporRecord.id, kelasId);

    // 7. Update rapor status to final (Req 38.7)
    await this.db
      .update(rapor)
      .set({
        status: 'final',
        finalizedBy: userId,
        finalizedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(rapor.id, raporRecord.id));

    // 8. Send notification to parents (Req 38.10)
    await this.sendFinalizationNotification(tenantId, kelasId, periodeId);

    return {
      rapor_id: raporRecord.id,
      status: 'final',
      total_students: rankings.length,
      rankings,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // POST /rapor/kelas/:kelasId/periode/:periodeId/revert
  // Requirements: 38.9
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Revert rapor from 'final' to 'draft'.
   * After revert, rapor is no longer visible to parents.
   */
  async revertRapor(
    tenantId: string,
    userId: string,
    kelasId: string,
    periodeId: string,
  ): Promise<RevertResult> {
    // Validate period
    this.validatePeriode(periodeId);

    // Validate wali kelas
    await this.validateWaliKelas(tenantId, userId, kelasId);

    // Get active tahun ajaran
    const activeTa = await this.getActiveTahunAjaran(tenantId);
    if (!activeTa) {
      throw new BadRequestException('Tidak ada tahun ajaran aktif');
    }

    // Find existing rapor
    const raporRecords = await this.db
      .select({ id: rapor.id, status: rapor.status })
      .from(rapor)
      .where(
        and(
          eq(rapor.kelasId, kelasId),
          eq(rapor.tahunAjaranId, activeTa.id),
          eq(rapor.periode, periodeId as any),
          eq(rapor.tenantId, tenantId),
        ),
      );

    if (raporRecords.length === 0) {
      throw new NotFoundException('Rapor tidak ditemukan untuk kelas dan periode ini');
    }

    const raporRecord = raporRecords[0];

    if (raporRecord.status === 'draft') {
      throw new BadRequestException('Rapor sudah dalam status draft');
    }

    // Revert to draft
    await this.db
      .update(rapor)
      .set({
        status: 'draft',
        finalizedBy: null,
        finalizedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(rapor.id, raporRecord.id));

    return {
      rapor_id: raporRecord.id,
      status: 'draft',
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Validate that a given period string is valid.
   */
  private validatePeriode(periodeId: string): void {
    const validPeriods = ['uts_semester_1', 'semester_1', 'uts_semester_2', 'semester_2'];
    if (!validPeriods.includes(periodeId)) {
      throw new BadRequestException(
        'Periode tidak valid. Gunakan: uts_semester_1, semester_1, uts_semester_2, semester_2',
      );
    }
  }

  /**
   * Validate that the current user is the wali kelas for the given class.
   * Requirements: 38.1 (only wali_kelas can finalize)
   */
  async validateWaliKelas(tenantId: string, userId: string, kelasId: string): Promise<void> {
    const kelasRows = await this.db
      .select({ id: kelas.id, waliKelasId: kelas.waliKelasId })
      .from(kelas)
      .where(and(eq(kelas.id, kelasId), eq(kelas.tenantId, tenantId)));

    if (kelasRows.length === 0) {
      throw new NotFoundException('Kelas tidak ditemukan');
    }

    if (kelasRows[0].waliKelasId !== userId) {
      throw new ForbiddenException(
        'Hanya wali kelas yang dapat memfinalisasi atau membatalkan finalisasi rapor',
      );
    }
  }

  /**
   * Get the active tahun ajaran for a tenant.
   */
  private async getActiveTahunAjaran(tenantId: string) {
    const rows = await this.db
      .select({ id: tahunAjaran.id, nama: tahunAjaran.nama })
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.tenantId, tenantId), eq(tahunAjaran.status, 'aktif')))
      .limit(1);

    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Get or create a rapor record for kelas+tahunAjaran+periode.
   */
  private async getOrCreateRapor(
    tenantId: string,
    kelasId: string,
    tahunAjaranId: string,
    periodeId: string,
  ): Promise<{ id: string; status: string }> {
    const existing = await this.db
      .select({ id: rapor.id, status: rapor.status })
      .from(rapor)
      .where(
        and(
          eq(rapor.kelasId, kelasId),
          eq(rapor.tahunAjaranId, tahunAjaranId),
          eq(rapor.periode, periodeId as any),
          eq(rapor.tenantId, tenantId),
        ),
      );

    if (existing.length > 0) {
      return existing[0];
    }

    // Create new rapor in draft
    const newRapor = await this.db
      .insert(rapor)
      .values({
        tenantId,
        kelasId,
        tahunAjaranId,
        periode: periodeId as any,
        status: 'draft',
      })
      .returning({ id: rapor.id, status: rapor.status });

    return newRapor[0];
  }

  /**
   * Get submission statuses for all mapel assigned to this class.
   * A mapel is "submitted" when ALL active students in the class have rapor_nilai
   * with status='submitted' for that mapel in the given rapor.
   *
   * Requirements: 38.1, 38.2
   */
  async getMapelSubmissionStatuses(
    tenantId: string,
    kelasId: string,
    raporId: string,
    tahunAjaranId: string,
  ): Promise<MapelSubmissionStatus[]> {
    // Get all mapel scheduled for this class (distinct mapel from jadwal)
    const mapelRows = await this.db
      .select({
        mapelId: jadwalPelajaran.mataPelajaranId,
        mapelNama: mataPelajaran.nama,
      })
      .from(jadwalPelajaran)
      .innerJoin(mataPelajaran, eq(jadwalPelajaran.mataPelajaranId, mataPelajaran.id))
      .where(
        and(
          eq(jadwalPelajaran.kelasId, kelasId),
          eq(jadwalPelajaran.tahunAjaranId, tahunAjaranId),
          eq(jadwalPelajaran.tenantId, tenantId),
          eq(jadwalPelajaran.isVacant, false),
        ),
      );

    // Deduplicate mapel
    const uniqueMapel = new Map<string, string>();
    for (const row of mapelRows) {
      if (row.mapelId) {
        uniqueMapel.set(row.mapelId, row.mapelNama);
      }
    }

    if (uniqueMapel.size === 0) {
      return [];
    }

    // Get count of active students in kelas
    const activeStudents = await this.db
      .select({ id: siswa.id })
      .from(siswa)
      .where(
        and(eq(siswa.kelasId, kelasId), eq(siswa.tenantId, tenantId), eq(siswa.status, 'aktif')),
      );

    const totalStudents = activeStudents.length;

    if (totalStudents === 0) {
      // No students — all mapel are "submitted" by default
      return Array.from(uniqueMapel.entries()).map(([id, nama]) => ({
        mata_pelajaran_id: id,
        mata_pelajaran_nama: nama,
        submitted: true,
      }));
    }

    // For each mapel, check that every active student has rapor_nilai with status='submitted'
    const results: MapelSubmissionStatus[] = [];

    for (const [mapelId, mapelNama] of uniqueMapel) {
      const submittedCount = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(raporNilai)
        .where(
          and(
            eq(raporNilai.raporId, raporId),
            eq(raporNilai.mataPelajaranId, mapelId),
            eq(raporNilai.status, 'submitted'),
            eq(raporNilai.tenantId, tenantId),
          ),
        );

      const count = Number(submittedCount[0]?.count ?? 0);
      results.push({
        mata_pelajaran_id: mapelId,
        mata_pelajaran_nama: mapelNama,
        submitted: count >= totalStudents,
      });
    }

    return results;
  }

  /**
   * Save P5 deskripsi and catatan wali kelas for students.
   * Requirements: 38.4, 38.5
   */
  private async saveStudentNotes(
    tenantId: string,
    raporId: string,
    notes: { siswa_id: string; p5_deskripsi?: any[]; catatan_wali_kelas?: string }[],
  ): Promise<void> {
    for (const note of notes) {
      // Update all rapor_nilai entries for this student in this rapor
      // P5 and catatan are stored at the rapor_nilai level (per student per mapel)
      // We update ALL entries for this student so it appears across all subjects
      const updateData: Record<string, any> = { updatedAt: new Date() };

      if (note.p5_deskripsi !== undefined) {
        updateData.p5Deskripsi = note.p5_deskripsi;
      }
      if (note.catatan_wali_kelas !== undefined) {
        updateData.catatanWaliKelas = note.catatan_wali_kelas;
      }

      await this.db
        .update(raporNilai)
        .set(updateData)
        .where(
          and(
            eq(raporNilai.raporId, raporId),
            eq(raporNilai.siswaId, note.siswa_id),
            eq(raporNilai.tenantId, tenantId),
          ),
        );
    }
  }

  /**
   * Calculate rata-rata (average of angka komponen) per student and assign peringkat.
   * Rankings: sorted by rata_rata DESC, rank 1 = highest.
   *
   * Requirements: 38.6
   */
  async calculateRankings(
    tenantId: string,
    raporId: string,
    kelasId: string,
  ): Promise<{ siswa_id: string; siswa_nama: string; rata_rata: number; peringkat: number }[]> {
    // Get all rapor_nilai for this rapor
    const nilaiRows = await this.db
      .select({
        siswaId: raporNilai.siswaId,
        komponenNilai: raporNilai.komponenNilai,
      })
      .from(raporNilai)
      .where(and(eq(raporNilai.raporId, raporId), eq(raporNilai.tenantId, tenantId)));

    // Get komponen penilaian to identify "angka" type components
    const komponenRows = await this.db
      .select({ id: komponenPenilaian.id, tipe: komponenPenilaian.tipe })
      .from(komponenPenilaian)
      .where(eq(komponenPenilaian.tenantId, tenantId));

    const angkaKomponenIds = new Set(
      komponenRows.filter((k) => k.tipe === 'angka').map((k) => k.id),
    );

    // Calculate rata_rata per student: average of ALL angka komponen values across ALL subjects
    const studentTotals = new Map<string, { sum: number; count: number }>();

    for (const row of nilaiRows) {
      const komponenArr = row.komponenNilai as { komponen_id: string; nilai: string | number }[];
      if (!Array.isArray(komponenArr)) continue;

      for (const item of komponenArr) {
        if (!angkaKomponenIds.has(item.komponen_id)) continue;

        const numVal = typeof item.nilai === 'string' ? parseFloat(item.nilai) : item.nilai;
        if (isNaN(numVal)) continue;

        const existing = studentTotals.get(row.siswaId) ?? { sum: 0, count: 0 };
        existing.sum += numVal;
        existing.count += 1;
        studentTotals.set(row.siswaId, existing);
      }
    }

    // Get student names
    const activeStudents = await this.db
      .select({ id: siswa.id, nama: siswa.nama })
      .from(siswa)
      .where(
        and(eq(siswa.kelasId, kelasId), eq(siswa.tenantId, tenantId), eq(siswa.status, 'aktif')),
      );

    const studentNameMap = new Map(activeStudents.map((s) => [s.id, s.nama]));

    // Calculate averages
    const studentAverages: { siswa_id: string; siswa_nama: string; rata_rata: number }[] = [];

    for (const [studentId, totals] of studentTotals) {
      const avg = totals.count > 0 ? totals.sum / totals.count : 0;
      const roundedAvg = Math.round(avg * 100) / 100;
      studentAverages.push({
        siswa_id: studentId,
        siswa_nama: studentNameMap.get(studentId) ?? 'Unknown',
        rata_rata: roundedAvg,
      });
    }

    // Sort DESC by rata_rata
    studentAverages.sort((a, b) => b.rata_rata - a.rata_rata);

    // Assign rankings (handle ties: same rata_rata = same rank)
    const rankings: {
      siswa_id: string;
      siswa_nama: string;
      rata_rata: number;
      peringkat: number;
    }[] = [];
    let currentRank = 1;

    for (let i = 0; i < studentAverages.length; i++) {
      if (i > 0 && studentAverages[i].rata_rata < studentAverages[i - 1].rata_rata) {
        currentRank = i + 1;
      }
      rankings.push({
        ...studentAverages[i],
        peringkat: currentRank,
      });
    }

    // Persist rata_rata and peringkat to rapor_nilai
    for (const ranking of rankings) {
      await this.db
        .update(raporNilai)
        .set({
          rataRata: String(ranking.rata_rata),
          peringkat: ranking.peringkat,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(raporNilai.raporId, raporId),
            eq(raporNilai.siswaId, ranking.siswa_id),
            eq(raporNilai.tenantId, tenantId),
          ),
        );
    }

    return rankings;
  }

  /**
   * Send push notification to all parents in the class about rapor availability.
   * Requirements: 38.10
   */
  private async sendFinalizationNotification(
    tenantId: string,
    kelasId: string,
    periodeId: string,
  ): Promise<void> {
    // Get all active students with their parent IDs
    const students = await this.db
      .select({
        siswaId: siswa.id,
        siswaNama: siswa.nama,
        orangTuaId: siswa.orangTuaId,
      })
      .from(siswa)
      .where(
        and(eq(siswa.kelasId, kelasId), eq(siswa.tenantId, tenantId), eq(siswa.status, 'aktif')),
      );

    // Get kelas name for notification content
    const kelasRows = await this.db
      .select({ nama: kelas.nama })
      .from(kelas)
      .where(eq(kelas.id, kelasId));

    const kelasNama = kelasRows[0]?.nama ?? '';

    // Map periode to display name
    const periodeDisplayMap: Record<string, string> = {
      uts_semester_1: 'UTS Semester 1',
      semester_1: 'Semester 1',
      uts_semester_2: 'UTS Semester 2',
      semester_2: 'Semester 2',
    };
    const periodeDisplay = periodeDisplayMap[periodeId] ?? periodeId;

    // Collect unique parent IDs
    const parentNotifications: { orang_tua_id: string; siswa_nama: string }[] = [];
    for (const student of students) {
      if (student.orangTuaId) {
        parentNotifications.push({
          orang_tua_id: student.orangTuaId,
          siswa_nama: student.siswaNama,
        });
      }
    }

    if (parentNotifications.length === 0) return;

    // Enqueue notification job
    await this.notificationQueue.add('send-rapor-finalization-notification', {
      tenant_id: tenantId,
      kelas_nama: kelasNama,
      periode: periodeDisplay,
      notifications: parentNotifications,
    });
  }
}
