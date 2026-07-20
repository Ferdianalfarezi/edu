import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, gte, lte, sql, SQL } from 'drizzle-orm';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { jadwalPelajaran, guruPengganti } from '@/drizzle/schema/jadwal';
import { kelas } from '@/drizzle/schema/kelas';
import { mataPelajaran } from '@/drizzle/schema/mata-pelajaran';
import { user } from '@/drizzle/schema/user';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { TenantService } from '@/modules/tenant/tenant.service';
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
  constructor(
    private readonly drizzleService: DrizzleService,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * Create a new jadwal pelajaran entry.
   * Requirements: 27.1, 27.2
   */
  async create(tenantId: string, adminId: string, dto: CreateJadwalDto) {
    const db = this.drizzleService.db;

    // Validate day is within tenant's allowed hari kerja
    await this.validateHariKerja(tenantId, dto.hari);

    // Validate referenced entities only for non-istirahat entries
    if (!dto.isIstirahat) {
      await this.validateReferences(tenantId, dto);
    } else {
      await this.validateKelas(tenantId, dto.kelasId);
      await this.validateTahunAjaran(tenantId, dto.tahunAjaranId);
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
        mataPelajaranId: dto.isIstirahat ? null : dto.mataPelajaranId,
        guruId: dto.isIstirahat ? null : dto.guruId,
        tahunAjaranId: dto.tahunAjaranId,
        semester: dto.semester,
        hari: dto.hari,
        jamKe: dto.jamKe,
        tanggalMulaiBerlaku: dto.tanggalMulaiBerlaku,
        tanggalSelesaiBerlaku: dto.tanggalSelesaiBerlaku,
        isIstirahat: dto.isIstirahat || false,
      })
      .returning();

    return result;
  }

  /**
   * List jadwal pelajaran with optional filters.
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

    // Filter Saturday jadwal when tenant uses 5-day work week
    const hariKerja = await this.tenantService.getHariKerja(tenantId);
    if (hariKerja === '5_hari') {
      conditions.push(sql`${jadwalPelajaran.hari} != 'sabtu'`);
    }

    const results = await db
      .select({
        id: jadwalPelajaran.id,
        kelasId: jadwalPelajaran.kelasId,
        mataPelajaranId: jadwalPelajaran.mataPelajaranId,
        guruId: jadwalPelajaran.guruId,
        hari: jadwalPelajaran.hari,
        jamKe: jadwalPelajaran.jamKe,
        isVacant: jadwalPelajaran.isVacant,
        isIstirahat: jadwalPelajaran.isIstirahat,
        tanggalMulaiBerlaku: jadwalPelajaran.tanggalMulaiBerlaku,
        tanggalSelesaiBerlaku: jadwalPelajaran.tanggalSelesaiBerlaku,
        kelasNama: kelas.nama,
        mataPelajaranNama: mataPelajaran.nama,
        mataPelajaranKode: mataPelajaran.kode,
        guruNama: user.nama,
      })
      .from(jadwalPelajaran)
      .innerJoin(kelas, eq(jadwalPelajaran.kelasId, kelas.id))
      .leftJoin(mataPelajaran, eq(jadwalPelajaran.mataPelajaranId, mataPelajaran.id))
      .leftJoin(user, eq(jadwalPelajaran.guruId, user.id))
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

        if (row.mataPelajaranId && row.guruId) {
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
        }

        return {
          id: row.id,
          kelas_id: row.kelasId,
          mata_pelajaran_id: row.mataPelajaranId,
          guru_id: row.guruId,
          hari: row.hari,
          jam_ke: row.jamKe,
          is_vacant: row.isVacant,
          is_istirahat: row.isIstirahat ?? false,
          mata_pelajaran: row.mataPelajaranId
            ? {
                id: row.mataPelajaranId,
                nama: row.mataPelajaranNama,
                kode: row.mataPelajaranKode,
              }
            : null,
          guru: row.guruId ? { id: row.guruId, nama: row.guruNama } : null,
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
        jamKe: jadwalPelajaran.jamKe,
        tanggalMulaiBerlaku: jadwalPelajaran.tanggalMulaiBerlaku,
        tanggalSelesaiBerlaku: jadwalPelajaran.tanggalSelesaiBerlaku,
        isVacant: jadwalPelajaran.isVacant,
        isIstirahat: jadwalPelajaran.isIstirahat,
        kelasNama: kelas.nama,
        mataPelajaranNama: mataPelajaran.nama,
        mataPelajaranKode: mataPelajaran.kode,
        guruNama: user.nama,
      })
      .from(jadwalPelajaran)
      .innerJoin(kelas, eq(jadwalPelajaran.kelasId, kelas.id))
      .leftJoin(mataPelajaran, eq(jadwalPelajaran.mataPelajaranId, mataPelajaran.id))
      .leftJoin(user, eq(jadwalPelajaran.guruId, user.id))
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
      jam_ke: result.jamKe,
      is_vacant: result.isVacant,
      is_istirahat: result.isIstirahat ?? false,
      mata_pelajaran: result.mataPelajaranId
        ? {
            id: result.mataPelajaranId,
            nama: result.mataPelajaranNama,
            kode: result.mataPelajaranKode,
          }
        : null,
      guru: result.guruId ? { id: result.guruId, nama: result.guruNama } : null,
    };
  }

  /**
   * Update a jadwal pelajaran entry.
   * Requirements: 27.7, 27.8
   */
  async update(tenantId: string, id: string, adminId: string, dto: UpdateJadwalDto) {
    const db = this.drizzleService.db;

    if (dto.hari !== undefined) {
      await this.validateHariKerja(tenantId, dto.hari);
    }

    const existing = await this.findOneRaw(tenantId, id);
    if (!existing) {
      throw new NotFoundException('Jadwal pelajaran tidak ditemukan');
    }

    const updateData: Record<string, unknown> = {};

    if (dto.guruId !== undefined) {
      await this.validateGuru(tenantId, dto.guruId);
      updateData.guruId = dto.guruId;
    }

    if (dto.mataPelajaranId !== undefined) {
      await this.validateMataPelajaran(tenantId, dto.mataPelajaranId);
      updateData.mataPelajaranId = dto.mataPelajaranId;
    }

    if (dto.jamKe !== undefined) updateData.jamKe = dto.jamKe;
    if (dto.tanggalMulaiBerlaku !== undefined)
      updateData.tanggalMulaiBerlaku = dto.tanggalMulaiBerlaku;
    if (dto.tanggalSelesaiBerlaku !== undefined)
      updateData.tanggalSelesaiBerlaku = dto.tanggalSelesaiBerlaku;
    if (dto.hari !== undefined) updateData.hari = dto.hari;

    if (Object.keys(updateData).length === 0) {
      return this.findOne(tenantId, id);
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

    updateData.updatedAt = new Date();

    await db
      .update(jadwalPelajaran)
      .set(updateData)
      .where(and(eq(jadwalPelajaran.id, id), eq(jadwalPelajaran.tenantId, tenantId)));

    return this.findOne(tenantId, id);
  }

  /**
   * Delete a jadwal pelajaran entry.
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
   * Assign a substitute teacher.
   * Requirements: 28.1, 28.2, 28.4
   */
  async createGuruPengganti(tenantId: string, assignedBy: string, dto: CreateGuruPenggantiDto) {
    const db = this.drizzleService.db;

    const today = new Date().toISOString().split('T')[0];
    if (dto.tanggal < today) {
      throw new BadRequestException('Tanggal penugasan tidak boleh di masa lalu');
    }

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
   * List guru pengganti assignments.
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
   * Requirements: 28.2, 28.3, 28.4
   */
  async isGuruPenggantiForClassOnDate(
    tenantId: string,
    guruId: string,
    kelasId: string,
    tanggal: string,
  ): Promise<boolean> {
    const db = this.drizzleService.db;

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
   * Requirements: 33.1, 33.2, 33.3, 33.4
   */
  async getJadwalSaya(tenantId: string, guruId: string, filters: FilterJadwalSayaDto) {
    const db = this.drizzleService.db;

    const today = new Date();
    const tanggal = filters.tanggal ?? today.toISOString().split('T')[0];

    let hari: string;
    if (filters.hari) {
      hari = filters.hari;
    } else {
      const dateObj = filters.tanggal ? new Date(filters.tanggal) : today;
      const dayIndex = dateObj.getDay();
      hari = JadwalService.DAY_MAP[dayIndex] ?? 'senin';
    }

    const jadwalResults = await db
      .select({
        id: jadwalPelajaran.id,
        kelasId: jadwalPelajaran.kelasId,
        kelasNama: kelas.nama,
        mataPelajaranId: jadwalPelajaran.mataPelajaranId,
        mataPelajaranNama: mataPelajaran.nama,
        jamKe: jadwalPelajaran.jamKe,
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

    const results = await Promise.all(
      jadwalResults.map(async (slot) => {
        let hasGuruPengganti = false;
        let guruPenggantiNama: string | undefined;

        if (slot.mataPelajaranId) {
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

          hasGuruPengganti = !!penggantiRecord;
          guruPenggantiNama = penggantiRecord?.guruPenggantiNama ?? undefined;
        }

        return {
          id: slot.id,
          kelasNama: slot.kelasNama,
          mataPelajaranNama: slot.mataPelajaranNama,
          jamKe: slot.jamKe,
          hasGuruPengganti,
          guruPenggantiNama,
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

  private async validateGuruPenggantiReferences(tenantId: string, dto: CreateGuruPenggantiDto) {
    await Promise.all([
      this.validateActiveGuru(tenantId, dto.guruPenggantiId),
      this.validateKelas(tenantId, dto.kelasId),
      this.validateMataPelajaran(tenantId, dto.mataPelajaranId),
    ]);
  }

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

  private async validateReferences(tenantId: string, dto: CreateJadwalDto) {
    await Promise.all([
      this.validateKelas(tenantId, dto.kelasId),
      this.validateMataPelajaran(tenantId, dto.mataPelajaranId!),
      this.validateGuru(tenantId, dto.guruId!),
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

  private async validateHariKerja(tenantId: string, hari: string): Promise<void> {
    const hariKerja = await this.tenantService.getHariKerja(tenantId);
    const allowedDays =
      hariKerja === '5_hari'
        ? ['senin', 'selasa', 'rabu', 'kamis', 'jumat']
        : ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

    if (!allowedDays.includes(hari)) {
      const namaHari = hari.charAt(0).toUpperCase() + hari.slice(1);
      throw new BadRequestException(`Hari ${namaHari} bukan hari aktif untuk sekolah ini`);
    }
  }
}
