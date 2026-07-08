import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, gte, lte, SQL } from 'drizzle-orm';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { jadwalPelajaran, guruPengganti } from '@/drizzle/schema/jadwal';
import { kelas } from '@/drizzle/schema/kelas';
import { mataPelajaran } from '@/drizzle/schema/mata-pelajaran';
import { user } from '@/drizzle/schema/user';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import {
  CreateJadwalDto,
  UpdateJadwalDto,
  FilterJadwalDto,
  FilterJadwalSayaDto,
  CreateGuruPenggantiDto,
  FilterGuruPenggantiDto,
} from './dto';

@Injectable()
export class JadwalService {
  constructor(private readonly drizzleService: DrizzleService) {}

  /**
   * Create a new jadwal pelajaran entry.
   * Validates that kelas, mataPelajaran, guru, and tahunAjaran
   * all exist within the same tenant.
   *
   * Requirements: 27.1, 27.2
   */
  async create(tenantId: string, adminId: string, dto: CreateJadwalDto) {
    const db = this.drizzleService.db;

    // Validate all referenced entities exist in the same tenant
    await this.validateReferences(tenantId, dto);

    // Validate jamSelesai > jamMulai
    if (dto.jamSelesai <= dto.jamMulai) {
      throw new BadRequestException('jamSelesai harus lebih besar dari jamMulai');
    }

    // Validate tanggalSelesaiBerlaku > tanggalMulaiBerlaku
    if (dto.tanggalSelesaiBerlaku <= dto.tanggalMulaiBerlaku) {
      throw new BadRequestException(
        'tanggalSelesaiBerlaku harus lebih besar dari tanggalMulaiBerlaku',
      );
    }

    const [result] = await db
      .insert(jadwalPelajaran)
      .values({
        tenantId,
        kelasId: dto.kelasId,
        mataPelajaranId: dto.mataPelajaranId,
        guruId: dto.guruId,
        tahunAjaranId: dto.tahunAjaranId,
        semester: dto.semester,
        hari: dto.hari,
        jamMulai: dto.jamMulai,
        jamSelesai: dto.jamSelesai,
        tanggalMulaiBerlaku: dto.tanggalMulaiBerlaku,
        tanggalSelesaiBerlaku: dto.tanggalSelesaiBerlaku,
      })
      .returning();

    return result;
  }

  /**
   * List jadwal pelajaran with optional filters.
   * Filters: kelasId, guruId, tahunAjaranId, semester, hari
   *
   * Requirements: 27.4, 27.10
   */
  async findAll(tenantId: string, filters: FilterJadwalDto) {
    const db = this.drizzleService.db;

    const conditions: SQL[] = [eq(jadwalPelajaran.tenantId, tenantId)];

    if (filters.kelasId) {
      conditions.push(eq(jadwalPelajaran.kelasId, filters.kelasId));
    }
    if (filters.guruId) {
      conditions.push(eq(jadwalPelajaran.guruId, filters.guruId));
    }
    if (filters.tahunAjaranId) {
      conditions.push(eq(jadwalPelajaran.tahunAjaranId, filters.tahunAjaranId));
    }
    if (filters.semester) {
      conditions.push(eq(jadwalPelajaran.semester, filters.semester));
    }
    if (filters.hari) {
      conditions.push(eq(jadwalPelajaran.hari, filters.hari));
    }

    const results = await db
      .select({
        id: jadwalPelajaran.id,
        kelasId: jadwalPelajaran.kelasId,
        mataPelajaranId: jadwalPelajaran.mataPelajaranId,
        guruId: jadwalPelajaran.guruId,
        hari: jadwalPelajaran.hari,
        jamMulai: jadwalPelajaran.jamMulai,
        jamSelesai: jadwalPelajaran.jamSelesai,
        isVacant: jadwalPelajaran.isVacant,
        tanggalMulaiBerlaku: jadwalPelajaran.tanggalMulaiBerlaku,
        tanggalSelesaiBerlaku: jadwalPelajaran.tanggalSelesaiBerlaku,
        kelasNama: kelas.nama,
        mataPelajaranNama: mataPelajaran.nama,
        mataPelajaranKode: mataPelajaran.kode,
        guruNama: user.nama,
      })
      .from(jadwalPelajaran)
      .innerJoin(kelas, eq(jadwalPelajaran.kelasId, kelas.id))
      .innerJoin(mataPelajaran, eq(jadwalPelajaran.mataPelajaranId, mataPelajaran.id))
      .innerJoin(user, eq(jadwalPelajaran.guruId, user.id))
      .where(and(...conditions));

    // Check for active guru_pengganti for today on each entry
    const today = new Date().toISOString().split('T')[0];
    const enriched = await Promise.all(
      results.map(async (row) => {
        let guru_pengganti_aktif: {
          id: string;
          guru_pengganti_id: string;
          guru_pengganti_nama: string;
          tanggal: string;
        } | null = null;

        const [penggantiRecord] = await db
          .select({
            id: guruPengganti.id,
            guruPenggantiId: guruPengganti.guruPenggantiId,
            guruPenggantiNama: user.nama,
            tanggal: guruPengganti.tanggal,
          })
          .from(guruPengganti)
          .innerJoin(user, eq(guruPengganti.guruPenggantiId, user.id))
          .where(
            and(
              eq(guruPengganti.tenantId, tenantId),
              eq(guruPengganti.kelasId, row.kelasId),
              eq(guruPengganti.mataPelajaranId, row.mataPelajaranId),
              gte(guruPengganti.tanggal, today),
            ),
          );

        if (penggantiRecord) {
          guru_pengganti_aktif = {
            id: penggantiRecord.id,
            guru_pengganti_id: penggantiRecord.guruPenggantiId,
            guru_pengganti_nama: penggantiRecord.guruPenggantiNama,
            tanggal: penggantiRecord.tanggal,
          };
        }

        return {
          id: row.id,
          kelas_id: row.kelasId,
          mata_pelajaran_id: row.mataPelajaranId,
          guru_id: row.guruId,
          hari: row.hari,
          jam_mulai: row.jamMulai,
          jam_selesai: row.jamSelesai,
          is_vacant: row.isVacant,
          mata_pelajaran: {
            id: row.mataPelajaranId,
            nama: row.mataPelajaranNama,
            kode: row.mataPelajaranKode,
          },
          guru: { id: row.guruId, nama: row.guruNama },
          guru_pengganti_aktif,
        };
      }),
    );

    return enriched;
  }

  /**
   * Get a single jadwal pelajaran by ID.
   */
  async findOne(tenantId: string, id: string) {
    const db = this.drizzleService.db;

    const [result] = await db
      .select({
        id: jadwalPelajaran.id,
        kelasId: jadwalPelajaran.kelasId,
        mataPelajaranId: jadwalPelajaran.mataPelajaranId,
        guruId: jadwalPelajaran.guruId,
        tahunAjaranId: jadwalPelajaran.tahunAjaranId,
        semester: jadwalPelajaran.semester,
        hari: jadwalPelajaran.hari,
        jamMulai: jadwalPelajaran.jamMulai,
        jamSelesai: jadwalPelajaran.jamSelesai,
        tanggalMulaiBerlaku: jadwalPelajaran.tanggalMulaiBerlaku,
        tanggalSelesaiBerlaku: jadwalPelajaran.tanggalSelesaiBerlaku,
        isVacant: jadwalPelajaran.isVacant,
        kelasNama: kelas.nama,
        mataPelajaranNama: mataPelajaran.nama,
        mataPelajaranKode: mataPelajaran.kode,
        guruNama: user.nama,
      })
      .from(jadwalPelajaran)
      .innerJoin(kelas, eq(jadwalPelajaran.kelasId, kelas.id))
      .innerJoin(mataPelajaran, eq(jadwalPelajaran.mataPelajaranId, mataPelajaran.id))
      .innerJoin(user, eq(jadwalPelajaran.guruId, user.id))
      .where(and(eq(jadwalPelajaran.id, id), eq(jadwalPelajaran.tenantId, tenantId)));

    if (!result) {
      throw new NotFoundException('Jadwal pelajaran tidak ditemukan');
    }

    return {
      id: result.id,
      kelas_id: result.kelasId,
      mata_pelajaran_id: result.mataPelajaranId,
      guru_id: result.guruId,
      hari: result.hari,
      jam_mulai: result.jamMulai,
      jam_selesai: result.jamSelesai,
      is_vacant: result.isVacant,
      mata_pelajaran: {
        id: result.mataPelajaranId,
        nama: result.mataPelajaranNama,
        kode: result.mataPelajaranKode,
      },
      guru: { id: result.guruId, nama: result.guruNama },
    };
  }

  /**
   * Update a jadwal pelajaran entry.
   * Only allows updating: guru, mataPelajaran, times, validity dates, hari.
   * Tracks change with updatedAt timestamp.
   *
   * Requirements: 27.7, 27.8
   */
  async update(tenantId: string, id: string, adminId: string, dto: UpdateJadwalDto) {
    const db = this.drizzleService.db;

    // Verify the jadwal exists in this tenant
    const existing = await this.findOneRaw(tenantId, id);
    if (!existing) {
      throw new NotFoundException('Jadwal pelajaran tidak ditemukan');
    }

    // Build update payload
    const updateData: Record<string, unknown> = {};

    if (dto.guruId !== undefined) {
      await this.validateGuru(tenantId, dto.guruId);
      updateData.guruId = dto.guruId;
    }

    if (dto.mataPelajaranId !== undefined) {
      await this.validateMataPelajaran(tenantId, dto.mataPelajaranId);
      updateData.mataPelajaranId = dto.mataPelajaranId;
    }

    if (dto.jamMulai !== undefined) updateData.jamMulai = dto.jamMulai;
    if (dto.jamSelesai !== undefined) updateData.jamSelesai = dto.jamSelesai;
    if (dto.tanggalMulaiBerlaku !== undefined)
      updateData.tanggalMulaiBerlaku = dto.tanggalMulaiBerlaku;
    if (dto.tanggalSelesaiBerlaku !== undefined)
      updateData.tanggalSelesaiBerlaku = dto.tanggalSelesaiBerlaku;
    if (dto.hari !== undefined) updateData.hari = dto.hari;

    if (Object.keys(updateData).length === 0) {
      return this.findOne(tenantId, id);
    }

    // Validate time consistency after merge
    const finalJamMulai = (updateData.jamMulai as string) ?? existing.jamMulai;
    const finalJamSelesai = (updateData.jamSelesai as string) ?? existing.jamSelesai;
    if (finalJamSelesai <= finalJamMulai) {
      throw new BadRequestException('jamSelesai harus lebih besar dari jamMulai');
    }

    // Validate date consistency after merge
    const finalMulai = (updateData.tanggalMulaiBerlaku as string) ?? existing.tanggalMulaiBerlaku;
    const finalSelesai =
      (updateData.tanggalSelesaiBerlaku as string) ?? existing.tanggalSelesaiBerlaku;
    if (finalSelesai <= finalMulai) {
      throw new BadRequestException(
        'tanggalSelesaiBerlaku harus lebih besar dari tanggalMulaiBerlaku',
      );
    }

    // Track change timestamp
    updateData.updatedAt = new Date();

    await db
      .update(jadwalPelajaran)
      .set(updateData)
      .where(and(eq(jadwalPelajaran.id, id), eq(jadwalPelajaran.tenantId, tenantId)));

    return this.findOne(tenantId, id);
  }

  /**
   * Delete a jadwal pelajaran entry.
   * Historical jadwal preservation is handled by only deleting
   * when explicitly requested — old entries stay for reference.
   *
   * Requirements: 27.7, 27.10
   */
  async remove(tenantId: string, id: string) {
    const db = this.drizzleService.db;

    const existing = await this.findOneRaw(tenantId, id);
    if (!existing) {
      throw new NotFoundException('Jadwal pelajaran tidak ditemukan');
    }

    await db
      .delete(jadwalPelajaran)
      .where(and(eq(jadwalPelajaran.id, id), eq(jadwalPelajaran.tenantId, tenantId)));

    return { message: 'Jadwal pelajaran berhasil dihapus' };
  }

  /**
   * Get raw jadwal data (without joins) for internal use.
   */
  private async findOneRaw(tenantId: string, id: string) {
    const db = this.drizzleService.db;

    const [result] = await db
      .select()
      .from(jadwalPelajaran)
      .where(and(eq(jadwalPelajaran.id, id), eq(jadwalPelajaran.tenantId, tenantId)));

    return result ?? null;
  }

  // ─── Guru Pengganti (Substitute Teacher) ────────────────────────────────

  /**
   * Assign a substitute teacher for a specific class + subject on a given date.
   * Validates: guru exists and is active, kelas exists, mataPelajaran exists,
   * date is not in the past.
   *
   * Access logic: the guru_pengganti record grants attendance input access for
   * that specific class+date ONLY. Auto-revocation is date-based (if current
   * date > tanggal, the record no longer grants access).
   *
   * Requirements: 28.1, 28.2, 28.4
   */
  async createGuruPengganti(tenantId: string, assignedBy: string, dto: CreateGuruPenggantiDto) {
    const db = this.drizzleService.db;

    // Validate date is not in the past (compare date strings to avoid timezone issues)
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD local-ish
    if (dto.tanggal < today) {
      throw new BadRequestException('Tanggal penugasan tidak boleh di masa lalu');
    }

    // Validate referenced entities
    await this.validateGuruPenggantiReferences(tenantId, dto);

    const [result] = await db
      .insert(guruPengganti)
      .values({
        tenantId,
        guruPenggantiId: dto.guruPenggantiId,
        kelasId: dto.kelasId,
        mataPelajaranId: dto.mataPelajaranId,
        tanggal: dto.tanggal,
        ditugaskanOleh: assignedBy,
      })
      .returning();

    return result;
  }

  /**
   * List guru pengganti assignments filtered by kelasId and/or tanggal.
   * Only returns active assignments (tanggal >= today) by default.
   *
   * Requirements: 28.2
   */
  async findAllGuruPengganti(tenantId: string, filters: FilterGuruPenggantiDto) {
    const db = this.drizzleService.db;

    const conditions: SQL[] = [eq(guruPengganti.tenantId, tenantId)];

    if (filters.kelasId) {
      conditions.push(eq(guruPengganti.kelasId, filters.kelasId));
    }

    if (filters.tanggal) {
      conditions.push(eq(guruPengganti.tanggal, filters.tanggal));
    } else {
      // By default, only show active (current and future) assignments
      const today = new Date().toISOString().split('T')[0];
      conditions.push(gte(guruPengganti.tanggal, today));
    }

    return db
      .select({
        id: guruPengganti.id,
        tenantId: guruPengganti.tenantId,
        guruPenggantiId: guruPengganti.guruPenggantiId,
        kelasId: guruPengganti.kelasId,
        mataPelajaranId: guruPengganti.mataPelajaranId,
        tanggal: guruPengganti.tanggal,
        ditugaskanOleh: guruPengganti.ditugaskanOleh,
        createdAt: guruPengganti.createdAt,
        guruNama: user.nama,
        kelasNama: kelas.nama,
        mataPelajaranNama: mataPelajaran.nama,
      })
      .from(guruPengganti)
      .innerJoin(user, eq(guruPengganti.guruPenggantiId, user.id))
      .innerJoin(kelas, eq(guruPengganti.kelasId, kelas.id))
      .innerJoin(mataPelajaran, eq(guruPengganti.mataPelajaranId, mataPelajaran.id))
      .where(and(...conditions));
  }

  /**
   * Remove a guru pengganti assignment.
   * Only admin can remove assignments.
   */
  async removeGuruPengganti(tenantId: string, id: string) {
    const db = this.drizzleService.db;

    const [existing] = await db
      .select({ id: guruPengganti.id })
      .from(guruPengganti)
      .where(and(eq(guruPengganti.id, id), eq(guruPengganti.tenantId, tenantId)));

    if (!existing) {
      throw new NotFoundException('Penugasan guru pengganti tidak ditemukan');
    }

    await db
      .delete(guruPengganti)
      .where(and(eq(guruPengganti.id, id), eq(guruPengganti.tenantId, tenantId)));

    return { message: 'Penugasan guru pengganti berhasil dihapus' };
  }

  /**
   * Check if a guru has active substitute access for a specific class and date.
   * Used by the absensi module to verify attendance input authorization.
   *
   * Returns true if:
   * - A guru_pengganti record exists for the guru, class, and date
   * - The date is today (not in the past — auto-revocation)
   *
   * Requirements: 28.2, 28.3, 28.4
   */
  async isGuruPenggantiForClassOnDate(
    tenantId: string,
    guruId: string,
    kelasId: string,
    tanggal: string,
  ): Promise<boolean> {
    const db = this.drizzleService.db;

    // Date-based auto-revocation: only grant access if tanggal matches today
    const today = new Date().toISOString().split('T')[0];
    if (tanggal !== today) {
      return false;
    }

    const [result] = await db
      .select({ id: guruPengganti.id })
      .from(guruPengganti)
      .where(
        and(
          eq(guruPengganti.tenantId, tenantId),
          eq(guruPengganti.guruPenggantiId, guruId),
          eq(guruPengganti.kelasId, kelasId),
          eq(guruPengganti.tanggal, tanggal),
        ),
      );

    return !!result;
  }

  // ─── Jadwal Saya (Guru's Teaching Schedule) ────────────────────────────

  /**
   * Indonesian day names mapped from JS Date.getDay() (0=Sunday..6=Saturday).
   */
  private static readonly DAY_MAP: Record<number, string> = {
    1: 'senin',
    2: 'selasa',
    3: 'rabu',
    4: 'kamis',
    5: 'jumat',
    6: 'sabtu',
  };

  /**
   * Get the authenticated guru's teaching schedule for a specific day.
   * Defaults to today's day. Also checks for active guru_pengganti
   * assignments on the given date.
   *
   * Requirements: 33.1, 33.2, 33.3, 33.4
   */
  async getJadwalSaya(tenantId: string, guruId: string, filters: FilterJadwalSayaDto) {
    const db = this.drizzleService.db;

    // Determine the target date and day
    const today = new Date();
    const tanggal = filters.tanggal ?? today.toISOString().split('T')[0];

    let hari: string;
    if (filters.hari) {
      hari = filters.hari;
    } else {
      const dateObj = filters.tanggal ? new Date(filters.tanggal) : today;
      const dayIndex = dateObj.getDay();
      hari = JadwalService.DAY_MAP[dayIndex] ?? 'senin'; // Fallback (Sunday has no school)
    }

    // Query jadwal where guru is the assigned teacher,
    // hari matches, and today is within validity range
    const jadwalResults = await db
      .select({
        id: jadwalPelajaran.id,
        kelasId: jadwalPelajaran.kelasId,
        kelasNama: kelas.nama,
        mataPelajaranId: jadwalPelajaran.mataPelajaranId,
        mataPelajaranNama: mataPelajaran.nama,
        jamMulai: jadwalPelajaran.jamMulai,
        jamSelesai: jadwalPelajaran.jamSelesai,
      })
      .from(jadwalPelajaran)
      .innerJoin(kelas, eq(jadwalPelajaran.kelasId, kelas.id))
      .innerJoin(mataPelajaran, eq(jadwalPelajaran.mataPelajaranId, mataPelajaran.id))
      .where(
        and(
          eq(jadwalPelajaran.tenantId, tenantId),
          eq(jadwalPelajaran.guruId, guruId),
          eq(jadwalPelajaran.hari, hari),
          lte(jadwalPelajaran.tanggalMulaiBerlaku, tanggal),
          gte(jadwalPelajaran.tanggalSelesaiBerlaku, tanggal),
        ),
      );

    // For each slot, check if there's a guru_pengganti assigned for that date
    const results = await Promise.all(
      jadwalResults.map(async (slot) => {
        const [penggantiRecord] = await db
          .select({
            id: guruPengganti.id,
            guruPenggantiNama: user.nama,
          })
          .from(guruPengganti)
          .innerJoin(user, eq(guruPengganti.guruPenggantiId, user.id))
          .where(
            and(
              eq(guruPengganti.tenantId, tenantId),
              eq(guruPengganti.kelasId, slot.kelasId),
              eq(guruPengganti.mataPelajaranId, slot.mataPelajaranId),
              eq(guruPengganti.tanggal, tanggal),
            ),
          );

        return {
          id: slot.id,
          kelasNama: slot.kelasNama,
          mataPelajaranNama: slot.mataPelajaranNama,
          jamMulai: slot.jamMulai,
          jamSelesai: slot.jamSelesai,
          hasGuruPengganti: !!penggantiRecord,
          guruPenggantiNama: penggantiRecord?.guruPenggantiNama ?? undefined,
        };
      }),
    );

    return {
      hari,
      tanggal,
      jadwal: results,
    };
  }

  // ─── Private Validation Methods ─────────────────────────────────────────

  /**
   * Validate all references for guru pengganti assignment.
   * Checks: guru exists & is active & has role 'guru', kelas exists, mataPelajaran exists.
   */
  private async validateGuruPenggantiReferences(tenantId: string, dto: CreateGuruPenggantiDto) {
    await Promise.all([
      this.validateActiveGuru(tenantId, dto.guruPenggantiId),
      this.validateKelas(tenantId, dto.kelasId),
      this.validateMataPelajaran(tenantId, dto.mataPelajaranId),
    ]);
  }

  /**
   * Validate that a guru exists, is active, and has role 'guru'.
   */
  private async validateActiveGuru(tenantId: string, guruId: string) {
    const db = this.drizzleService.db;

    const [result] = await db
      .select({ id: user.id, role: user.role, isActive: user.isActive })
      .from(user)
      .where(and(eq(user.id, guruId), eq(user.tenantId, tenantId)));

    if (!result) {
      throw new BadRequestException('Guru tidak ditemukan dalam tenant ini');
    }

    if (result.role !== 'guru') {
      throw new BadRequestException('User yang dipilih bukan guru');
    }

    if (!result.isActive) {
      throw new BadRequestException('Guru tidak aktif');
    }
  }

  /**
   * Validate all referenced entities exist in the same tenant.
   */
  private async validateReferences(tenantId: string, dto: CreateJadwalDto) {
    await Promise.all([
      this.validateKelas(tenantId, dto.kelasId),
      this.validateMataPelajaran(tenantId, dto.mataPelajaranId),
      this.validateGuru(tenantId, dto.guruId),
      this.validateTahunAjaran(tenantId, dto.tahunAjaranId),
    ]);
  }

  private async validateKelas(tenantId: string, kelasId: string) {
    const db = this.drizzleService.db;

    const [result] = await db
      .select({ id: kelas.id })
      .from(kelas)
      .where(and(eq(kelas.id, kelasId), eq(kelas.tenantId, tenantId)));

    if (!result) {
      throw new BadRequestException('Kelas tidak ditemukan dalam tenant ini');
    }
  }

  private async validateMataPelajaran(tenantId: string, mapelId: string) {
    const db = this.drizzleService.db;

    const [result] = await db
      .select({ id: mataPelajaran.id })
      .from(mataPelajaran)
      .where(and(eq(mataPelajaran.id, mapelId), eq(mataPelajaran.tenantId, tenantId)));

    if (!result) {
      throw new BadRequestException('Mata pelajaran tidak ditemukan dalam tenant ini');
    }
  }

  private async validateGuru(tenantId: string, guruId: string) {
    const db = this.drizzleService.db;

    const [result] = await db
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(and(eq(user.id, guruId), eq(user.tenantId, tenantId)));

    if (!result) {
      throw new BadRequestException('Guru tidak ditemukan dalam tenant ini');
    }

    if (result.role !== 'guru') {
      throw new BadRequestException('User yang dipilih bukan guru');
    }
  }

  private async validateTahunAjaran(tenantId: string, tahunAjaranId: string) {
    const db = this.drizzleService.db;

    const [result] = await db
      .select({ id: tahunAjaran.id })
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.id, tahunAjaranId), eq(tahunAjaran.tenantId, tenantId)));

    if (!result) {
      throw new BadRequestException('Tahun ajaran tidak ditemukan dalam tenant ini');
    }
  }
}
