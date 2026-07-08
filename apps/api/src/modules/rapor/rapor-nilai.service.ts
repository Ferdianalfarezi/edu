import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, sql } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { komponenPenilaian, rapor, raporNilai } from '@/drizzle/schema/rapor';
import { jadwalPelajaran } from '@/drizzle/schema/jadwal';
import { mataPelajaran } from '@/drizzle/schema/mata-pelajaran';
import { kelas } from '@/drizzle/schema/kelas';
import { siswa } from '@/drizzle/schema/siswa';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { InputNilaiDto } from './dto';

/**
 * Represents an assigned subject for the guru (from jadwal).
 */
export interface GuruMapelResult {
  mapel_id: string;
  mapel_nama: string;
  kelas: { kelas_id: string; kelas_nama: string }[];
}

/**
 * Represents a student row in the grade input screen.
 */
export interface StudentGradeRow {
  siswa_id: string;
  siswa_nama: string;
  komponen_nilai: { komponen_id: string; nilai: string | number }[] | null;
  capaian_pembelajaran: string | null;
  status: 'draft' | 'submitted' | null;
}

/**
 * Response shape for GET /rapor/kelas/:kelasId/mapel/:mapelId/periode/:periodeId
 */
export interface KelasGradeResult {
  kelas_id: string;
  kelas_nama: string;
  mapel_id: string;
  mapel_nama: string;
  periode: string;
  komponen_penilaian: {
    id: string;
    nama: string;
    tipe: 'angka' | 'huruf' | 'deskripsi';
    skala_min: number | null;
    skala_max: number | null;
    is_wajib: boolean | null;
  }[];
  students: StudentGradeRow[];
}

/**
 * Valid huruf grade values (A–E).
 */
const VALID_HURUF_VALUES = ['A', 'B', 'C', 'D', 'E'];

/**
 * Periods that classify as "UTS" — only require angka values.
 * Semester periods require angka + deskripsi.
 * Requirements: 37.3, 37.4
 */
const UTS_PERIODS = ['uts_semester_1', 'uts_semester_2'];

@Injectable()
export class RaporNilaiService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  // ═══════════════════════════════════════════════════════════════════
  // GET /rapor/mata-pelajaran — Guru's assigned subjects
  // Requirements: 37.1, 37.9
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Returns the list of subjects assigned to the guru via jadwal in the active tahun_ajaran.
   * Groups by mapel, each with the list of kelas taught.
   */
  async getGuruMapel(tenantId: string, guruId: string): Promise<GuruMapelResult[]> {
    // Get active tahun_ajaran
    const activeTa = await this.getActiveTahunAjaran(tenantId);
    if (!activeTa) {
      return [];
    }

    // Query jadwal entries for this guru in active tahun_ajaran (non-vacant)
    const rows = await this.db
      .select({
        mapelId: jadwalPelajaran.mataPelajaranId,
        mapelNama: mataPelajaran.nama,
        kelasId: jadwalPelajaran.kelasId,
        kelasNama: kelas.nama,
      })
      .from(jadwalPelajaran)
      .innerJoin(mataPelajaran, eq(jadwalPelajaran.mataPelajaranId, mataPelajaran.id))
      .innerJoin(kelas, eq(jadwalPelajaran.kelasId, kelas.id))
      .where(
        and(
          eq(jadwalPelajaran.tenantId, tenantId),
          eq(jadwalPelajaran.guruId, guruId),
          eq(jadwalPelajaran.tahunAjaranId, activeTa.id),
          eq(jadwalPelajaran.isVacant, false),
        ),
      );

    // Group by mapel
    const mapelMap = new Map<string, GuruMapelResult>();
    for (const row of rows) {
      if (!mapelMap.has(row.mapelId)) {
        mapelMap.set(row.mapelId, {
          mapel_id: row.mapelId,
          mapel_nama: row.mapelNama,
          kelas: [],
        });
      }
      const entry = mapelMap.get(row.mapelId)!;
      // Deduplicate kelas (guru may have multiple slots same class same subject)
      if (!entry.kelas.some((k) => k.kelas_id === row.kelasId)) {
        entry.kelas.push({ kelas_id: row.kelasId, kelas_nama: row.kelasNama });
      }
    }

    return Array.from(mapelMap.values());
  }

  // ═══════════════════════════════════════════════════════════════════
  // GET /rapor/kelas/:kelasId/mapel/:mapelId/periode/:periodeId
  // Requirements: 37.1, 37.2
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Returns the student list with existing grades and assessment components.
   * Validates guru is assigned to this mapel+kelas via jadwal.
   */
  async getKelasGrades(
    tenantId: string,
    guruId: string,
    kelasId: string,
    mapelId: string,
    periodeId: string,
  ): Promise<KelasGradeResult> {
    // Validate guru is assigned to this mapel+kelas
    await this.validateGuruAssignment(tenantId, guruId, kelasId, mapelId);

    // Get kelas info
    const kelasInfo = await this.db
      .select({ id: kelas.id, nama: kelas.nama })
      .from(kelas)
      .where(and(eq(kelas.id, kelasId), eq(kelas.tenantId, tenantId)));

    if (kelasInfo.length === 0) {
      throw new NotFoundException('Kelas tidak ditemukan');
    }

    // Get mapel info
    const mapelInfo = await this.db
      .select({ id: mataPelajaran.id, nama: mataPelajaran.nama })
      .from(mataPelajaran)
      .where(and(eq(mataPelajaran.id, mapelId), eq(mataPelajaran.tenantId, tenantId)));

    if (mapelInfo.length === 0) {
      throw new NotFoundException('Mata pelajaran tidak ditemukan');
    }

    // Validate periode exists (we accept period string directly)
    const validPeriods = ['uts_semester_1', 'semester_1', 'uts_semester_2', 'semester_2'];
    if (!validPeriods.includes(periodeId)) {
      throw new BadRequestException(
        'Periode tidak valid. Gunakan: uts_semester_1, semester_1, uts_semester_2, semester_2',
      );
    }

    // Get komponen penilaian for this tenant
    const komponen = await this.db
      .select({
        id: komponenPenilaian.id,
        nama: komponenPenilaian.nama,
        tipe: komponenPenilaian.tipe,
        skala_min: komponenPenilaian.skalaMin,
        skala_max: komponenPenilaian.skalaMax,
        is_wajib: komponenPenilaian.isWajib,
      })
      .from(komponenPenilaian)
      .where(eq(komponenPenilaian.tenantId, tenantId))
      .orderBy(komponenPenilaian.urutan);

    // Get active students in this kelas
    const students = await this.db
      .select({ id: siswa.id, nama: siswa.nama })
      .from(siswa)
      .where(
        and(eq(siswa.kelasId, kelasId), eq(siswa.tenantId, tenantId), eq(siswa.status, 'aktif')),
      )
      .orderBy(siswa.nama);

    // Check if rapor record exists for this kelas + periode
    const activeTa = await this.getActiveTahunAjaran(tenantId);
    const existingNilai: Map<
      string,
      { komponen_nilai: any; capaian: string | null; status: string }
    > = new Map();

    if (activeTa) {
      const raporRecord = await this.db
        .select({ id: rapor.id })
        .from(rapor)
        .where(
          and(
            eq(rapor.kelasId, kelasId),
            eq(rapor.tahunAjaranId, activeTa.id),
            eq(rapor.periode, periodeId as any),
            eq(rapor.tenantId, tenantId),
          ),
        );

      if (raporRecord.length > 0) {
        // Get existing nilai for this guru's mapel
        const nilaiRows = await this.db
          .select({
            siswaId: raporNilai.siswaId,
            komponenNilai: raporNilai.komponenNilai,
            capaianPembelajaran: raporNilai.capaianPembelajaran,
            status: raporNilai.status,
          })
          .from(raporNilai)
          .where(
            and(
              eq(raporNilai.raporId, raporRecord[0].id),
              eq(raporNilai.mataPelajaranId, mapelId),
              eq(raporNilai.guruId, guruId),
              eq(raporNilai.tenantId, tenantId),
            ),
          );

        for (const row of nilaiRows) {
          existingNilai.set(row.siswaId, {
            komponen_nilai: row.komponenNilai,
            capaian: row.capaianPembelajaran,
            status: row.status,
          });
        }
      }
    }

    // Build student grade rows
    const studentRows: StudentGradeRow[] = students.map((s) => {
      const existing = existingNilai.get(s.id);
      return {
        siswa_id: s.id,
        siswa_nama: s.nama,
        komponen_nilai: existing ? (existing.komponen_nilai as any) : null,
        capaian_pembelajaran: existing ? existing.capaian : null,
        status: existing ? (existing.status as 'draft' | 'submitted') : null,
      };
    });

    return {
      kelas_id: kelasInfo[0].id,
      kelas_nama: kelasInfo[0].nama,
      mapel_id: mapelInfo[0].id,
      mapel_nama: mapelInfo[0].nama,
      periode: periodeId,
      komponen_penilaian: komponen,
      students: studentRows,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // POST /rapor/nilai — Save grades
  // Requirements: 37.3–37.9
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Save grade entries for students. Supports draft (partial) or submitted.
   * Creates rapor record if not exists, inserts/upserts rapor_nilai records.
   */
  async saveNilai(
    tenantId: string,
    guruId: string,
    dto: InputNilaiDto,
  ): Promise<{ saved: number; rapor_id: string }> {
    const { kelas_id, mata_pelajaran_id, periode_rapor_id, nilai, status } = dto;

    // Validate guru is assigned to this mapel+kelas via jadwal
    await this.validateGuruAssignment(tenantId, guruId, kelas_id, mata_pelajaran_id);

    // Validate periode
    const validPeriods = ['uts_semester_1', 'semester_1', 'uts_semester_2', 'semester_2'];
    if (!validPeriods.includes(periode_rapor_id)) {
      throw new BadRequestException(
        'Periode tidak valid. Gunakan: uts_semester_1, semester_1, uts_semester_2, semester_2',
      );
    }

    // Get active tahun_ajaran
    const activeTa = await this.getActiveTahunAjaran(tenantId);
    if (!activeTa) {
      throw new BadRequestException('Tidak ada tahun ajaran aktif');
    }

    // Check if rapor is already finalized
    const existingRapor = await this.db
      .select({ id: rapor.id, status: rapor.status })
      .from(rapor)
      .where(
        and(
          eq(rapor.kelasId, kelas_id),
          eq(rapor.tahunAjaranId, activeTa.id),
          eq(rapor.periode, periode_rapor_id as any),
          eq(rapor.tenantId, tenantId),
        ),
      );

    if (existingRapor.length > 0 && existingRapor[0].status === 'final') {
      throw new ForbiddenException(
        'Rapor sudah difinalkan. Tidak dapat mengedit nilai setelah finalisasi.',
      );
    }

    // Get komponen penilaian for validation
    const komponen = await this.db
      .select({
        id: komponenPenilaian.id,
        tipe: komponenPenilaian.tipe,
        skalaMin: komponenPenilaian.skalaMin,
        skalaMax: komponenPenilaian.skalaMax,
        isWajib: komponenPenilaian.isWajib,
      })
      .from(komponenPenilaian)
      .where(eq(komponenPenilaian.tenantId, tenantId));

    const komponenMap = new Map(komponen.map((k) => [k.id, k]));

    // Validate each student's grade values
    const isUts = UTS_PERIODS.includes(periode_rapor_id);
    for (const entry of nilai) {
      this.validateNilaiEntry(entry, komponenMap, isUts, status);
    }

    // Create or get rapor record
    let raporId: string;
    if (existingRapor.length > 0) {
      raporId = existingRapor[0].id;
    } else {
      const newRapor = await this.db
        .insert(rapor)
        .values({
          tenantId,
          kelasId: kelas_id,
          tahunAjaranId: activeTa.id,
          periode: periode_rapor_id as any,
          status: 'draft',
        })
        .returning({ id: rapor.id });
      raporId = newRapor[0].id;
    }

    // Upsert rapor_nilai records for each student
    let savedCount = 0;
    for (const entry of nilai) {
      // Check if existing rapor_nilai exists for this student+mapel
      const existing = await this.db
        .select({ id: raporNilai.id })
        .from(raporNilai)
        .where(
          and(
            eq(raporNilai.raporId, raporId),
            eq(raporNilai.siswaId, entry.siswa_id),
            eq(raporNilai.mataPelajaranId, mata_pelajaran_id),
            eq(raporNilai.tenantId, tenantId),
          ),
        );

      if (existing.length > 0) {
        // Update existing
        await this.db
          .update(raporNilai)
          .set({
            komponenNilai: entry.komponen.map((k) => ({
              komponen_id: k.komponen_id,
              nilai: k.nilai,
            })),
            capaianPembelajaran: entry.capaian_pembelajaran || null,
            status: status as any,
            updatedAt: new Date(),
          })
          .where(eq(raporNilai.id, existing[0].id));
      } else {
        // Insert new
        await this.db.insert(raporNilai).values({
          tenantId,
          raporId,
          siswaId: entry.siswa_id,
          mataPelajaranId: mata_pelajaran_id,
          guruId,
          komponenNilai: entry.komponen.map((k) => ({
            komponen_id: k.komponen_id,
            nilai: k.nilai,
          })),
          capaianPembelajaran: entry.capaian_pembelajaran || null,
          status: status as any,
        });
      }
      savedCount++;
    }

    return { saved: savedCount, rapor_id: raporId };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Validate that the guru is assigned to the given mapel+kelas in active tahun_ajaran.
   * Requirements: 37.1, 37.9
   */
  async validateGuruAssignment(
    tenantId: string,
    guruId: string,
    kelasId: string,
    mapelId: string,
  ): Promise<void> {
    const activeTa = await this.getActiveTahunAjaran(tenantId);
    if (!activeTa) {
      throw new ForbiddenException('Tidak ada tahun ajaran aktif');
    }

    const assignment = await this.db
      .select({ id: jadwalPelajaran.id })
      .from(jadwalPelajaran)
      .where(
        and(
          eq(jadwalPelajaran.tenantId, tenantId),
          eq(jadwalPelajaran.guruId, guruId),
          eq(jadwalPelajaran.kelasId, kelasId),
          eq(jadwalPelajaran.mataPelajaranId, mapelId),
          eq(jadwalPelajaran.tahunAjaranId, activeTa.id),
          eq(jadwalPelajaran.isVacant, false),
        ),
      )
      .limit(1);

    if (assignment.length === 0) {
      throw new ForbiddenException(
        'Anda tidak ditugaskan untuk mata pelajaran ini di kelas tersebut',
      );
    }
  }

  /**
   * Validate a single student's grade entry against komponen definitions.
   * Requirements: 37.3, 37.4, 37.5
   */
  private validateNilaiEntry(
    entry: {
      siswa_id: string;
      komponen: { komponen_id: string; nilai: string | number }[];
      capaian_pembelajaran?: string;
    },
    komponenMap: Map<
      string,
      {
        id: string;
        tipe: string;
        skalaMin: number | null;
        skalaMax: number | null;
        isWajib: boolean | null;
      }
    >,
    isUts: boolean,
    status: 'draft' | 'submitted',
  ): void {
    for (const item of entry.komponen) {
      const def = komponenMap.get(item.komponen_id);
      if (!def) {
        throw new BadRequestException(`Komponen penilaian "${item.komponen_id}" tidak ditemukan`);
      }

      // Validate value based on tipe
      switch (def.tipe) {
        case 'angka': {
          const numVal = typeof item.nilai === 'string' ? parseFloat(item.nilai) : item.nilai;
          if (isNaN(numVal)) {
            throw new BadRequestException(
              `Nilai untuk komponen angka harus berupa angka (siswa: ${entry.siswa_id})`,
            );
          }
          const min = def.skalaMin ?? 0;
          const max = def.skalaMax ?? 100;
          if (numVal < min || numVal > max) {
            throw new BadRequestException(
              `Nilai angka harus dalam rentang ${min}-${max} (siswa: ${entry.siswa_id})`,
            );
          }
          break;
        }
        case 'huruf': {
          const strVal = String(item.nilai).toUpperCase();
          if (!VALID_HURUF_VALUES.includes(strVal)) {
            throw new BadRequestException(
              `Nilai huruf harus salah satu dari: A, B, C, D, E (siswa: ${entry.siswa_id})`,
            );
          }
          break;
        }
        case 'deskripsi': {
          if (typeof item.nilai !== 'string' || item.nilai.trim() === '') {
            throw new BadRequestException(
              `Nilai deskripsi tidak boleh kosong (siswa: ${entry.siswa_id})`,
            );
          }
          break;
        }
      }
    }

    // For submitted status on Semester periods, require capaian_pembelajaran
    // Requirements: 37.4
    if (status === 'submitted' && !isUts) {
      if (!entry.capaian_pembelajaran || entry.capaian_pembelajaran.trim() === '') {
        throw new BadRequestException(
          `Capaian pembelajaran wajib diisi untuk periode semester (siswa: ${entry.siswa_id})`,
        );
      }
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
}
