import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { eq, and, sql, count, lte, gte } from 'drizzle-orm';
import { Role } from '@edu/shared';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { KonfigurasiService } from '@/modules/konfigurasi/konfigurasi.service';
import { JadwalService } from '@/modules/jadwal/jadwal.service';
import { absensi, absensiAudit } from '@/drizzle/schema/absensi';
import { siswa } from '@/drizzle/schema/siswa';
import { kelas } from '@/drizzle/schema/kelas';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { jadwalPelajaran, guruPengganti } from '@/drizzle/schema/jadwal';
import { hariLibur } from '@/drizzle/schema/konfigurasi';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';
import {
  CreateAbsensiDto,
  UpdateAbsensiDto,
  RekapAbsensiQueryDto,
  RekapAbsensiItem,
  ExportRekapAbsensiQueryDto,
  ExportRekapAbsensiResponse,
  SyncAbsensiDto,
  SyncAbsensiResponse,
  SyncConflictResult,
  SyncRejectedResult,
} from './dto';

/**
 * Indonesian day names mapped from JS Date.getDay() (0=Sunday..6=Saturday).
 */
const DAY_MAP: Record<number, string> = {
  1: 'senin',
  2: 'selasa',
  3: 'rabu',
  4: 'kamis',
  5: 'jumat',
  6: 'sabtu',
};

/**
 * AbsensiService handles all attendance operations:
 * - Create attendance (POST /absensi/kelas/:kelasId) — Requirements 1.1–1.14
 * - Get today's classes (GET /absensi/kelas-hari-ini) — Requirements 1.1, 1.12
 * - View attendance per class per date (Requirements 3.1–3.3)
 * - Edit attendance (PATCH /absensi/:absensiId) — Requirements 2.1–2.6
 * - Dashboard for kepala_sekolah (Requirements 5.1–5.3)
 */
@Injectable()
export class AbsensiService {
  constructor(
    private readonly drizzleService: DrizzleService,
    private readonly konfigurasiService: KonfigurasiService,
    private readonly jadwalService: JadwalService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private readonly notificationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.EXPORT) private readonly exportQueue: Queue,
  ) {}

  // ─── Create Attendance (Task 8.1) ───────────────────────────────────────

  /**
   * POST /absensi/kelas/:kelasId
   * Creates daily attendance records for a class.
   *
   * Requirements: 1.1–1.14
   */
  async createAbsensi(tenantId: string, guruId: string, kelasId: string, dto: CreateAbsensiDto) {
    const db = this.drizzleService.db;
    const { tanggal, records } = dto;

    // Authorize: check if guru has jadwal for this class on this date's day,
    // OR is assigned as guru_pengganti for the date.
    const isAuthorized = await this.isGuruAuthorizedForInput(tenantId, guruId, kelasId, tanggal);
    if (!isAuthorized) {
      throw new ForbiddenException(
        'Anda tidak memiliki akses untuk menginput absensi kelas ini pada tanggal tersebut',
      );
    }

    // Validate class exists and get class name
    const [kelasData] = await db
      .select({ id: kelas.id, nama: kelas.nama })
      .from(kelas)
      .where(and(eq(kelas.id, kelasId), eq(kelas.tenantId, tenantId)));

    if (!kelasData) {
      throw new BadRequestException('Kelas tidak ditemukan');
    }

    // Get all active students in the class
    const activeStudents = await db
      .select({ id: siswa.id, nama: siswa.nama })
      .from(siswa)
      .where(
        and(eq(siswa.kelasId, kelasId), eq(siswa.tenantId, tenantId), eq(siswa.status, 'aktif')),
      );

    if (activeStudents.length === 0) {
      throw new BadRequestException('Tidak ada siswa aktif di kelas ini');
    }

    // Validate completeness: all active students must have a status (Req 1.4, 1.5)
    const submittedSiswaIds = new Set(records.map((r) => r.siswa_id));
    const activeSiswaIds = new Set(activeStudents.map((s) => s.id));

    const missingSiswa = activeStudents.filter((s) => !submittedSiswaIds.has(s.id));
    if (missingSiswa.length > 0) {
      const names = missingSiswa.map((s) => s.nama).join(', ');
      throw new BadRequestException(`Siswa berikut belum diberi status kehadiran: ${names}`);
    }

    const invalidIds = records.filter((r) => !activeSiswaIds.has(r.siswa_id));
    if (invalidIds.length > 0) {
      throw new BadRequestException('Beberapa siswa_id tidak termasuk siswa aktif di kelas ini');
    }

    // Check if date is a holiday (warn but allow — Req 1.13)
    const [holiday] = await db
      .select({ keterangan: hariLibur.keterangan })
      .from(hariLibur)
      .where(and(eq(hariLibur.tenantId, tenantId), eq(hariLibur.tanggal, tanggal)));

    const isHoliday = !!holiday;

    // Batch INSERT with ON CONFLICT DO NOTHING (Req 1.8, 1.9, 1.11)
    const insertValues = records.map((r) => ({
      tenantId,
      siswaId: r.siswa_id,
      kelasId,
      tanggal,
      status: r.status as 'hadir' | 'izin' | 'sakit' | 'alpa',
      guruId,
    }));

    const insertedRows = await db
      .insert(absensi)
      .values(insertValues)
      .onConflictDoNothing({ target: [absensi.siswaId, absensi.tanggal] })
      .returning();

    // Emit ONE batch notification job per class with 0-5s random jitter (Req 1.6)
    const jitterMs = Math.floor(Math.random() * 5000);
    await this.notificationQueue.add(
      'send-batch-attendance-notification',
      {
        tenant_id: tenantId,
        kelas_id: kelasId,
        kelas_nama: kelasData.nama,
        tanggal,
        waktu_input: new Date().toISOString(),
        records: records.map((r) => ({ siswa_id: r.siswa_id, status: r.status })),
      },
      { delay: jitterMs },
    );

    const response: Record<string, unknown> = {
      message: 'Absensi berhasil disimpan',
      inserted: insertedRows.length,
      skipped: records.length - insertedRows.length,
      tanggal,
      kelas: kelasData.nama,
    };

    if (isHoliday) {
      response.warning = `Hari ini ditandai sebagai hari libur: ${holiday.keterangan ?? 'Hari Libur'}`;
    }

    if (insertedRows.length === 0) {
      response.message = 'Absensi untuk kelas ini pada tanggal tersebut sudah ada (read-only)';
    }

    return response;
  }

  // ─── Get Today's Classes (Task 8.1) ─────────────────────────────────────

  /**
   * GET /absensi/kelas-hari-ini
   * Returns the guru's scheduled classes for today.
   *
   * Requirements: 1.1, 1.12
   */
  async getKelasHariIni(tenantId: string, guruId: string, inputTanggal?: string) {
    const db = this.drizzleService.db;
    const targetDate = inputTanggal ? new Date(inputTanggal) : new Date();
    const tanggal = inputTanggal || targetDate.toISOString().split('T')[0];
    const dayIndex = targetDate.getDay();
    const hari = DAY_MAP[dayIndex];

    if (!hari) {
      return {
        tanggal,
        hari: 'minggu',
        kelas: [],
        message: 'Tidak ada kelas terjadwal untuk hari ini',
      };
    }

    // Get all classes where guru is scheduled today within validity range
    const scheduledClasses = await db
      .select({
        kelasId: jadwalPelajaran.kelasId,
        kelasNama: kelas.nama,
        jamMulai: jadwalPelajaran.jamMulai,
        jamSelesai: jadwalPelajaran.jamSelesai,
      })
      .from(jadwalPelajaran)
      .innerJoin(kelas, eq(jadwalPelajaran.kelasId, kelas.id))
      .where(
        and(
          eq(jadwalPelajaran.tenantId, tenantId),
          eq(jadwalPelajaran.guruId, guruId),
          eq(jadwalPelajaran.hari, hari),
          lte(jadwalPelajaran.tanggalMulaiBerlaku, tanggal),
          gte(jadwalPelajaran.tanggalSelesaiBerlaku, tanggal),
        ),
      );

    // Also get classes where guru is assigned as pengganti today
    const penggantiClasses = await db
      .select({
        kelasId: guruPengganti.kelasId,
        kelasNama: kelas.nama,
      })
      .from(guruPengganti)
      .innerJoin(kelas, eq(guruPengganti.kelasId, kelas.id))
      .where(
        and(
          eq(guruPengganti.tenantId, tenantId),
          eq(guruPengganti.guruPenggantiId, guruId),
          eq(guruPengganti.tanggal, tanggal),
        ),
      );

    // Deduplicate by kelasId
    const kelasMap = new Map<
      string,
      { kelasId: string; kelasNama: string; jamMulai?: string; jamSelesai?: string }
    >();

    for (const slot of scheduledClasses) {
      if (!kelasMap.has(slot.kelasId)) {
        kelasMap.set(slot.kelasId, {
          kelasId: slot.kelasId,
          kelasNama: slot.kelasNama,
          jamMulai: slot.jamMulai,
          jamSelesai: slot.jamSelesai,
        });
      }
    }

    for (const slot of penggantiClasses) {
      if (!kelasMap.has(slot.kelasId)) {
        kelasMap.set(slot.kelasId, {
          kelasId: slot.kelasId,
          kelasNama: slot.kelasNama,
        });
      }
    }

    const kelasList = Array.from(kelasMap.values());

    if (kelasList.length === 0) {
      return { tanggal, hari, kelas: [], message: 'Tidak ada kelas terjadwal untuk hari ini' };
    }

    return { tanggal, hari, kelas: kelasList };
  }

  // ─── View Attendance (Task 8.6) ─────────────────────────────────────────

  /**
   * GET /absensi/kelas/:kelasId/tanggal/:tanggal
   *
   * Returns attendance data for a class on a given date.
   *
   * Requirements: 3.1, 3.2, 3.3
   */
  async getAbsensiByKelasAndTanggal(
    tenantId: string,
    kelasId: string,
    tanggal: string,
    userId: string,
    userRole: string,
  ) {
    const db = this.drizzleService.db;

    const [kelasData] = await db
      .select({
        id: kelas.id,
        nama: kelas.nama,
        tingkat: kelas.tingkat,
        tahunAjaranId: kelas.tahunAjaranId,
      })
      .from(kelas)
      .where(and(eq(kelas.id, kelasId), eq(kelas.tenantId, tenantId)));

    if (!kelasData) {
      throw new NotFoundException('Kelas tidak ditemukan');
    }

    let canEdit = false;
    if (userRole === 'kepala_sekolah') {
      canEdit = true;
    } else if (userRole === 'guru') {
      const guruJadwal = await db
        .select({ id: jadwalPelajaran.id })
        .from(jadwalPelajaran)
        .where(
          and(
            eq(jadwalPelajaran.tenantId, tenantId),
            eq(jadwalPelajaran.kelasId, kelasId),
            eq(jadwalPelajaran.guruId, userId),
          ),
        )
        .limit(1);

      canEdit = guruJadwal.length > 0;
    }

    const records = await db
      .select({
        siswa_id: absensi.siswaId,
        siswa_nama: siswa.nama,
        status: absensi.status,
      })
      .from(absensi)
      .innerJoin(siswa, eq(absensi.siswaId, siswa.id))
      .where(
        and(
          eq(absensi.tenantId, tenantId),
          eq(absensi.kelasId, kelasId),
          eq(absensi.tanggal, tanggal),
        ),
      );

    return {
      kelas_id: kelasData.id,
      kelas_nama: kelasData.nama,
      tanggal,
      can_edit: canEdit,
      records,
    };
  }

  // ─── Edit Attendance (Task 8.5) ─────────────────────────────────────────

  /**
   * PATCH /absensi/:absensiId
   * Update attendance status for a single student.
   *
   * Authorization:
   * - Kepala_sekolah: can edit ANY class's attendance (Req 2.4)
   * - Guru: can edit IF currently or previously scheduled for the class (Req 2.1, 2.3)
   * - Admin: CANNOT edit (Req 2.2) — explicit ForbiddenException
   *
   * Audit log: on every change, insert into absensi_audit (Req 2.5, 2.6)
   *
   * Requirements: 2.1–2.6
   */
  async updateAbsensi(
    tenantId: string,
    userId: string,
    userRole: Role | string,
    absensiId: string,
    dto: UpdateAbsensiDto | { status: 'hadir' | 'izin' | 'sakit' | 'alpa' },
  ) {
    const db = this.drizzleService.db;

    // Block admin from editing attendance (Req 2.2)
    if (userRole === Role.ADMIN) {
      throw new ForbiddenException('Admin tidak diizinkan mengedit data absensi');
    }

    // Block any other non-allowed roles
    if (userRole !== Role.GURU && userRole !== Role.KEPALA_SEKOLAH) {
      throw new ForbiddenException('Anda tidak memiliki izin untuk mengedit data absensi');
    }

    // Fetch the absensi record
    const [record] = await db
      .select()
      .from(absensi)
      .where(and(eq(absensi.id, absensiId), eq(absensi.tenantId, tenantId)));

    if (!record) {
      throw new NotFoundException('Data absensi tidak ditemukan');
    }

    // If status is unchanged, no-op (no audit log)
    if (record.status === dto.status) {
      return record;
    }

    // Guru authorization: must have jadwal (current or past) for this class (Req 2.1, 2.3)
    if (userRole === Role.GURU) {
      const isAuthorized = await this.isGuruAuthorizedForEdit(tenantId, userId, record.kelasId);
      if (!isAuthorized) {
        throw new ForbiddenException(
          'Guru hanya dapat mengedit absensi kelas yang dijadwalkan (atau pernah dijadwalkan)',
        );
      }
    }
    // Kepala_sekolah: no further check needed (Req 2.4)

    const statusSebelum = record.status;

    // Update the absensi record
    const [updated] = await db
      .update(absensi)
      .set({
        status: dto.status,
        updatedAt: new Date(),
      })
      .where(and(eq(absensi.id, absensiId), eq(absensi.tenantId, tenantId)))
      .returning();

    // Write audit log entry (Req 2.5, 2.6)
    await db.insert(absensiAudit).values({
      absensiId: absensiId,
      userId: userId,
      role: userRole as string,
      statusSebelum: statusSebelum,
      statusSesudah: dto.status,
    });

    return updated;
  }

  // ─── Dashboard (Task 8.6) ───────────────────────────────────────────────

  /**
   * GET /absensi/dashboard
   *
   * Returns today's attendance summary per class and alpa alert list.
   * Kepala_sekolah only.
   *
   * Requirements: 5.1, 5.2, 5.3
   */
  async getDashboard(tenantId: string) {
    const db = this.drizzleService.db;
    const today = new Date().toISOString().split('T')[0];

    const [activeTahunAjaran] = await db
      .select({ id: tahunAjaran.id })
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.tenantId, tenantId), eq(tahunAjaran.status, 'aktif')));

    if (!activeTahunAjaran) {
      return { tanggal: today, ringkasan_per_kelas: [], perhatian_khusus: [] };
    }

    const kelasList = await db
      .select({ id: kelas.id, nama: kelas.nama })
      .from(kelas)
      .where(and(eq(kelas.tenantId, tenantId), eq(kelas.tahunAjaranId, activeTahunAjaran.id)));

    const ringkasanPerKelas = await Promise.all(
      kelasList.map(async (k) => {
        const [totalResult] = await db
          .select({ count: count() })
          .from(siswa)
          .where(
            and(eq(siswa.kelasId, k.id), eq(siswa.tenantId, tenantId), eq(siswa.status, 'aktif')),
          );

        const totalSiswa = Number(totalResult?.count ?? 0);

        const statusCounts = await db
          .select({ status: absensi.status, count: count() })
          .from(absensi)
          .where(
            and(
              eq(absensi.tenantId, tenantId),
              eq(absensi.kelasId, k.id),
              eq(absensi.tanggal, today),
            ),
          )
          .groupBy(absensi.status);

        const countsMap: Record<string, number> = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
        for (const row of statusCounts) {
          countsMap[row.status] = Number(row.count);
        }

        return {
          kelas_id: k.id,
          kelas_nama: k.nama,
          total_siswa: totalSiswa,
          hadir: countsMap.hadir,
          izin: countsMap.izin,
          sakit: countsMap.sakit,
          alpa: countsMap.alpa,
        };
      }),
    );

    const thresholdConfig = await this.konfigurasiService.getConfigByKey(
      tenantId,
      'threshold_alpa',
    );
    const thresholdAlpa = Number(thresholdConfig.value?.value ?? thresholdConfig.value ?? 10);

    const perhatianKhusus = await db
      .select({
        siswa_id: siswa.id,
        siswa_nama: siswa.nama,
        kelas_nama: kelas.nama,
        total_alpa: count(absensi.id),
      })
      .from(absensi)
      .innerJoin(siswa, eq(absensi.siswaId, siswa.id))
      .innerJoin(kelas, eq(absensi.kelasId, kelas.id))
      .where(
        and(
          eq(absensi.tenantId, tenantId),
          eq(absensi.status, 'alpa'),
          eq(kelas.tahunAjaranId, activeTahunAjaran.id),
        ),
      )
      .groupBy(siswa.id, siswa.nama, kelas.nama)
      .having(sql`count(${absensi.id}) > ${thresholdAlpa}`);

    return {
      tanggal: today,
      ringkasan_per_kelas: ringkasanPerKelas,
      perhatian_khusus: perhatianKhusus.map((p) => ({
        siswa_id: p.siswa_id,
        siswa_nama: p.siswa_nama,
        kelas_nama: p.kelas_nama,
        total_alpa: Number(p.total_alpa),
      })),
    };
  }

  // ─── Orang Tua Attendance View (Task 8.11) ────────────────────────────

  /**
   * GET /absensi/anak/:siswaId
   *
   * Returns attendance calendar view for a specific child.
   * Orang_tua only — validates ownership (siswa.orang_tua_id == current user).
   *
   * Response includes:
   * - siswa_id, siswa_nama, bulan, tahun
   * - ringkasan: { hadir, izin, sakit, alpa }
   * - hari: [ { tanggal, status }[] ] — one entry per day with recorded attendance
   *
   * Requirements: 8.1, 8.2, 8.3, 8.4
   */
  async getAbsensiAnak(userId: string, siswaId: string, bulan?: number, tahun?: number) {
    const db = this.drizzleService.db;
    const now = new Date();
    const selectedBulan = bulan ?? now.getMonth() + 1;
    const selectedTahun = tahun ?? now.getFullYear();

    // Validate that the siswa belongs to this parent
    const [siswaData] = await db
      .select({ id: siswa.id, nama: siswa.nama, orangTuaId: siswa.orangTuaId })
      .from(siswa)
      .where(eq(siswa.id, siswaId));

    if (!siswaData) {
      throw new NotFoundException('Siswa tidak ditemukan');
    }

    if (siswaData.orangTuaId !== userId) {
      throw new ForbiddenException('Anda tidak memiliki akses ke data absensi siswa ini');
    }

    // Build date range for the selected month
    const startDate = `${selectedTahun}-${String(selectedBulan).padStart(2, '0')}-01`;
    const lastDay = new Date(selectedTahun, selectedBulan, 0).getDate();
    const endDate = `${selectedTahun}-${String(selectedBulan).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Get attendance records for this student in the date range
    const records = await db
      .select({
        tanggal: absensi.tanggal,
        status: absensi.status,
      })
      .from(absensi)
      .where(
        and(
          eq(absensi.siswaId, siswaId),
          gte(absensi.tanggal, startDate),
          lte(absensi.tanggal, endDate),
        ),
      );

    // Build summary totals
    const ringkasan = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
    for (const record of records) {
      ringkasan[record.status]++;
    }

    // Build daily entries (one per recorded day)
    const hari = records.map((record) => ({
      tanggal: record.tanggal,
      status: record.status,
    }));

    return {
      siswa_id: siswaData.id,
      siswa_nama: siswaData.nama,
      bulan: selectedBulan,
      tahun: selectedTahun,
      ringkasan,
      hari,
    };
  }

  // ─── Rekap Absensi (Task 8.8) ─────────────────────────────────────────

  /**
   * GET /absensi/rekap?kelas_id=&bulan=&tahun=&periode=bulanan|semester
   *
   * Returns attendance recap per student for a given period.
   * Calculates: hadir, izin, sakit, alpa counts + persentase_kehadiran.
   *
   * Hari efektif calculation:
   * 1. Check for manual override config key: hari_efektif_manual_{bulan}_{tahun}
   * 2. If no override, auto-calculate: weekdays (senin-sabtu) minus holidays
   * 3. If neither can be determined, return null for persentase_kehadiran
   *
   * For semester period: sums 6 consecutive months starting from `bulan`.
   *
   * Requirements: 4.1–4.7
   */
  async getRekapAbsensi(
    tenantId: string,
    query: RekapAbsensiQueryDto,
  ): Promise<RekapAbsensiItem[]> {
    const db = this.drizzleService.db;
    const { kelas_id, bulan, tahun, periode = 'bulanan' } = query;

    // Validate kelas exists
    const [kelasData] = await db
      .select({ id: kelas.id, nama: kelas.nama })
      .from(kelas)
      .where(and(eq(kelas.id, kelas_id), eq(kelas.tenantId, tenantId)));

    if (!kelasData) {
      throw new NotFoundException('Kelas tidak ditemukan');
    }

    // Determine date range based on period
    const { startDate, endDate } = this.getDateRange(bulan, tahun, periode);

    // Get all active students in the class
    const students = await db
      .select({ id: siswa.id, nama: siswa.nama })
      .from(siswa)
      .where(
        and(eq(siswa.kelasId, kelas_id), eq(siswa.tenantId, tenantId), eq(siswa.status, 'aktif')),
      );

    if (students.length === 0) {
      return [];
    }

    // Get attendance records for all students in the period
    const attendanceRecords = await db
      .select({
        siswaId: absensi.siswaId,
        status: absensi.status,
      })
      .from(absensi)
      .where(
        and(
          eq(absensi.tenantId, tenantId),
          eq(absensi.kelasId, kelas_id),
          gte(absensi.tanggal, startDate),
          lte(absensi.tanggal, endDate),
        ),
      );

    // Aggregate counts per student
    const countsMap = new Map<
      string,
      { hadir: number; izin: number; sakit: number; alpa: number }
    >();
    for (const record of attendanceRecords) {
      if (!countsMap.has(record.siswaId)) {
        countsMap.set(record.siswaId, { hadir: 0, izin: 0, sakit: 0, alpa: 0 });
      }
      const counts = countsMap.get(record.siswaId)!;
      counts[record.status]++;
    }

    // Calculate hari efektif
    const hariEfektif = await this.calculateHariEfektif(tenantId, bulan, tahun, periode);

    // Build result
    const result: RekapAbsensiItem[] = students.map((student) => {
      const counts = countsMap.get(student.id) ?? { hadir: 0, izin: 0, sakit: 0, alpa: 0 };

      let persentaseKehadiran: number | null = null;
      if (hariEfektif !== null && hariEfektif > 0) {
        persentaseKehadiran = Math.round((counts.hadir / hariEfektif) * 1000) / 10;
      }

      return {
        siswa_id: student.id,
        siswa_nama: student.nama,
        hadir: counts.hadir,
        izin: counts.izin,
        sakit: counts.sakit,
        alpa: counts.alpa,
        total_hari_efektif: hariEfektif,
        persentase_kehadiran: persentaseKehadiran,
      };
    });

    return result;
  }

  // ─── Export Rekap Absensi (Task 8.14) ──────────────────────────────────

  /**
   * GET /absensi/rekap/export
   * Enqueues a rekap absensi export job to the EXPORT Bull queue.
   * Returns a job_id immediately for async processing.
   *
   * The actual file generation is handled by the export processor (task 18.3).
   *
   * Requirements: 4.4
   */
  async exportRekapAbsensi(
    tenantId: string,
    userId: string,
    query: ExportRekapAbsensiQueryDto,
  ): Promise<ExportRekapAbsensiResponse> {
    const db = this.drizzleService.db;
    const { kelas_id, bulan, tahun, periode = 'bulanan', format = 'xlsx' } = query;

    // Validate kelas exists
    const [kelasData] = await db
      .select({ id: kelas.id, nama: kelas.nama })
      .from(kelas)
      .where(and(eq(kelas.id, kelas_id), eq(kelas.tenantId, tenantId)));

    if (!kelasData) {
      throw new NotFoundException('Kelas tidak ditemukan');
    }

    // Enqueue export job
    const job = await this.exportQueue.add('export-rekap-absensi', {
      tenantId,
      kelasId: kelas_id,
      bulan,
      tahun,
      periode,
      format,
      requestedBy: userId,
    });

    return {
      job_id: String(job.id),
      message: 'Export rekap absensi sedang diproses. Silakan cek status export secara berkala.',
    };
  }

  // ─── Hari Efektif Calculation Helpers (Task 8.8) ────────────────────────

  /**
   * Calculate hari efektif (effective school days) for a period.
   *
   * Priority:
   * 1. Manual override from config (key: hari_efektif_manual_{bulan}_{tahun})
   * 2. Auto-calculate: count weekdays (senin-sabtu) minus holidays
   * 3. Return null if unable to determine
   *
   * For semester periods, sums effective days across all months.
   *
   * Requirements: 4.5, 4.6, 4.7
   */
  async calculateHariEfektif(
    tenantId: string,
    bulan: number,
    tahun: number,
    periode: 'bulanan' | 'semester',
  ): Promise<number | null> {
    if (periode === 'bulanan') {
      return this.calculateHariEfektifForMonth(tenantId, bulan, tahun);
    }

    // Semester: sum hari efektif for 6 months
    let totalHariEfektif = 0;
    let hasAnyValue = false;

    for (let i = 0; i < 6; i++) {
      let m = bulan + i;
      let y = tahun;
      if (m > 12) {
        m -= 12;
        y += 1;
      }

      const monthEffective = await this.calculateHariEfektifForMonth(tenantId, m, y);
      if (monthEffective !== null) {
        totalHariEfektif += monthEffective;
        hasAnyValue = true;
      }
    }

    return hasAnyValue ? totalHariEfektif : null;
  }

  /**
   * Calculate hari efektif for a single month.
   * Checks for manual override first, then auto-calculates.
   */
  private async calculateHariEfektifForMonth(
    tenantId: string,
    bulan: number,
    tahun: number,
  ): Promise<number | null> {
    // 1. Check for manual override
    const manualKey = `hari_efektif_manual_${bulan}_${tahun}`;
    try {
      const config = await this.konfigurasiService.getConfigByKey(tenantId, manualKey);
      const value = config.value?.value ?? config.value;
      if (typeof value === 'number' && value > 0) {
        return value;
      }
    } catch {
      // NotFoundException — no manual override, proceed to auto-calculate
    }

    // 2. Auto-calculate: weekdays (senin-sabtu) minus holidays
    const { startDate, endDate } = this.getDateRange(bulan, tahun, 'bulanan');

    // Count weekdays (Monday=1 to Saturday=6, skip Sunday=0)
    const weekdays = this.countWeekdays(startDate, endDate);

    // Get holidays in this range
    const db = this.drizzleService.db;
    const holidays = await db
      .select({ tanggal: hariLibur.tanggal })
      .from(hariLibur)
      .where(
        and(
          eq(hariLibur.tenantId, tenantId),
          gte(hariLibur.tanggal, startDate),
          lte(hariLibur.tanggal, endDate),
        ),
      );

    // Count holidays that fall on weekdays (so we only subtract school-day holidays)
    let holidaysOnWeekdays = 0;
    for (const holiday of holidays) {
      const dateObj = new Date(holiday.tanggal + 'T00:00:00');
      const dayOfWeek = dateObj.getDay();
      // 1=Mon, 2=Tue, ..., 6=Sat are school days
      if (dayOfWeek >= 1 && dayOfWeek <= 6) {
        holidaysOnWeekdays++;
      }
    }

    const hariEfektif = weekdays - holidaysOnWeekdays;
    return hariEfektif > 0 ? hariEfektif : null;
  }

  /**
   * Count weekdays (Monday through Saturday) in a date range, inclusive.
   */
  private countWeekdays(startDate: string, endDate: string): number {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    let count = 0;

    const current = new Date(start);
    while (current <= end) {
      const dayOfWeek = current.getDay();
      // 0=Sunday, 1=Monday, ..., 6=Saturday
      // School days are Monday-Saturday (1-6)
      if (dayOfWeek >= 1 && dayOfWeek <= 6) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  }

  /**
   * Get start and end dates for a period.
   */
  private getDateRange(
    bulan: number,
    tahun: number,
    periode: 'bulanan' | 'semester',
  ): { startDate: string; endDate: string } {
    if (periode === 'bulanan') {
      const startDate = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
      // Last day of the month
      const lastDay = new Date(tahun, bulan, 0).getDate();
      const endDate = `${tahun}-${String(bulan).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return { startDate, endDate };
    }

    // Semester: 6 months starting from bulan
    const startDate = `${tahun}-${String(bulan).padStart(2, '0')}-01`;

    let endMonth = bulan + 5;
    let endYear = tahun;
    if (endMonth > 12) {
      endMonth -= 12;
      endYear += 1;
    }
    const lastDay = new Date(endYear, endMonth, 0).getDate();
    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { startDate, endDate };
  }

  // ─── Offline Sync (Task 8.12) ────────────────────────────────────────────

  /**
   * POST /absensi/sync
   * Accepts batch attendance records from mobile offline queue.
   * Uses event-time LWW with authority override per ADR-003.
   *
   * Conflict resolution rules:
   * - Rule 1: If existing record was last edited by kepala_sekolah → server wins (authority override)
   * - Rule 2: If server updated_at > client event_timestamp → server wins
   * - Rule 3: If client event_timestamp > server updated_at → client wins, update record
   *
   * Clock skew protection: reject records with event_timestamp > server_now + 5 minutes.
   *
   * Requirements: 26.1–26.6
   */
  async syncAbsensi(
    tenantId: string,
    guruId: string,
    dto: SyncAbsensiDto,
  ): Promise<SyncAbsensiResponse> {
    const db = this.drizzleService.db;
    const serverNow = new Date();
    const maxAllowedTime = new Date(serverNow.getTime() + 5 * 60 * 1000); // server_now + 5 min

    const synced: string[] = [];
    const conflicts: SyncConflictResult[] = [];
    const rejected: SyncRejectedResult[] = [];

    for (const record of dto.records) {
      const eventTime = new Date(record.event_timestamp);

      // Clock skew protection: reject if event_timestamp > server_now + 5 minutes
      if (eventTime > maxAllowedTime) {
        rejected.push({
          siswa_id: record.siswa_id,
          tanggal: record.tanggal,
          reason: 'Clock skew: event_timestamp exceeds server time by more than 5 minutes',
        });
        continue;
      }

      // Check if a record already exists for (siswa_id, tanggal)
      const [existing] = await db
        .select({
          id: absensi.id,
          status: absensi.status,
          updatedAt: absensi.updatedAt,
        })
        .from(absensi)
        .where(
          and(
            eq(absensi.siswaId, record.siswa_id),
            eq(absensi.tanggal, record.tanggal),
            eq(absensi.tenantId, tenantId),
          ),
        );

      if (!existing) {
        // No existing record → insert (synced)
        await db.insert(absensi).values({
          tenantId,
          siswaId: record.siswa_id,
          kelasId: record.kelas_id,
          tanggal: record.tanggal,
          status: record.status,
          guruId,
          createdAt: eventTime,
          updatedAt: eventTime,
        });
        synced.push(record.siswa_id);
        continue;
      }

      // Record exists — apply conflict resolution per ADR-003

      // Rule 1: Check if existing was last edited by kepala_sekolah (authority override)
      const [lastAudit] = await db
        .select({ role: absensiAudit.role })
        .from(absensiAudit)
        .where(eq(absensiAudit.absensiId, existing.id))
        .orderBy(sql`${absensiAudit.createdAt} DESC`)
        .limit(1);

      if (lastAudit && lastAudit.role === Role.KEPALA_SEKOLAH) {
        // Rule 1: Kepala_sekolah edits always win
        conflicts.push({
          siswa_id: record.siswa_id,
          tanggal: record.tanggal,
          winner: 'server',
          reason: 'Authority override: last edit by kepala_sekolah',
          server_value: existing.status,
        });
        continue;
      }

      // Rule 2: Server edited after client event-time → server wins
      const serverUpdatedAt = existing.updatedAt ? new Date(existing.updatedAt) : new Date(0);
      if (serverUpdatedAt > eventTime) {
        conflicts.push({
          siswa_id: record.siswa_id,
          tanggal: record.tanggal,
          winner: 'server',
          reason: 'Server record is newer than client event timestamp',
          server_value: existing.status,
        });
        continue;
      }

      // Rule 3: Client event-time newer → client wins, update record
      if (eventTime > serverUpdatedAt) {
        await db
          .update(absensi)
          .set({
            status: record.status,
            updatedAt: eventTime,
          })
          .where(eq(absensi.id, existing.id));

        // Write audit log for the sync-based update
        await db.insert(absensiAudit).values({
          absensiId: existing.id,
          userId: guruId,
          role: Role.GURU,
          statusSebelum: existing.status,
          statusSesudah: record.status,
        });

        conflicts.push({
          siswa_id: record.siswa_id,
          tanggal: record.tanggal,
          winner: 'client',
          reason: 'Client event timestamp is newer than server record',
        });
        continue;
      }

      // Equal timestamps — server wins (tie-break to avoid unnecessary writes)
      conflicts.push({
        siswa_id: record.siswa_id,
        tanggal: record.tanggal,
        winner: 'server',
        reason: 'Server record is newer than client event timestamp',
        server_value: existing.status,
      });
    }

    return { synced, conflicts, rejected };
  }

  // ─── Private Authorization Methods ──────────────────────────────────────

  /**
   * Check if guru is authorized for attendance INPUT on a given class + date.
   * Used by createAbsensi.
   *
   * Requirements: 1.7
   */
  private async isGuruAuthorizedForInput(
    tenantId: string,
    guruId: string,
    kelasId: string,
    tanggal: string,
  ): Promise<boolean> {
    const hasJadwal = await this.hasActiveJadwalForClass(tenantId, guruId, kelasId, tanggal);
    if (hasJadwal) return true;

    return this.jadwalService.isGuruPenggantiForClassOnDate(tenantId, guruId, kelasId, tanggal);
  }

  /**
   * Check if guru is authorized for attendance EDIT on a given class.
   * A guru is authorized to EDIT if they have ANY jadwal_pelajaran record
   * (current or historical) for the class. No date restriction on edit.
   *
   * Requirements: 2.1, 2.3
   */
  private async isGuruAuthorizedForEdit(
    tenantId: string,
    guruId: string,
    kelasId: string,
  ): Promise<boolean> {
    const db = this.drizzleService.db;

    const [result] = await db
      .select({ id: jadwalPelajaran.id })
      .from(jadwalPelajaran)
      .where(
        and(
          eq(jadwalPelajaran.tenantId, tenantId),
          eq(jadwalPelajaran.guruId, guruId),
          eq(jadwalPelajaran.kelasId, kelasId),
        ),
      )
      .limit(1);

    return !!result;
  }

  /**
   * Check if guru has an active jadwal_pelajaran for a class on the given date.
   * The jadwal must match the day of the week AND the date within validity range.
   */
  private async hasActiveJadwalForClass(
    tenantId: string,
    guruId: string,
    kelasId: string,
    tanggal: string,
  ): Promise<boolean> {
    const db = this.drizzleService.db;

    const dateObj = new Date(tanggal + 'T00:00:00');
    const dayIndex = dateObj.getDay();
    const hari = DAY_MAP[dayIndex];

    if (!hari) return false;

    const [result] = await db
      .select({ id: jadwalPelajaran.id })
      .from(jadwalPelajaran)
      .where(
        and(
          eq(jadwalPelajaran.tenantId, tenantId),
          eq(jadwalPelajaran.guruId, guruId),
          eq(jadwalPelajaran.kelasId, kelasId),
          eq(jadwalPelajaran.hari, hari),
          lte(jadwalPelajaran.tanggalMulaiBerlaku, tanggal),
          gte(jadwalPelajaran.tanggalSelesaiBerlaku, tanggal),
        ),
      );

    return !!result;
  }

  // ─── Audit Log ──────────────────────────────────────────────────

  /**
   * Get audit log entries for a specific absensi record.
   * Requirements: 2.5, 2.6
   */
  async getAuditLog(tenantId: string, absensiId: string) {
    const db = this.drizzleService.db;

    const results = await db
      .select({
        id: absensiAudit.id,
        absensiId: absensiAudit.absensiId,
        userId: absensiAudit.userId,
        role: absensiAudit.role,
        statusSebelum: absensiAudit.statusSebelum,
        statusSesudah: absensiAudit.statusSesudah,
        createdAt: absensiAudit.createdAt,
      })
      .from(absensiAudit)
      .where(eq(absensiAudit.absensiId, absensiId))
      .orderBy(sql`${absensiAudit.createdAt} DESC`);

    return { data: results };
  }
}
