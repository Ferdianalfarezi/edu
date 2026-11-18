import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, desc, sql } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { kelas } from '@/drizzle/schema/kelas';
import { KelasService } from '@/modules/kelas/kelas.service';
import { CreateTahunAjaranDto, UpdateSemesterDto, UpdateTahunAjaranDto } from './dto';

/** Tambah/kurang hari pada tanggal 'YYYY-MM-DD' (tanpa efek zona waktu). */
function geserHari(tanggal: string, hari: number): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}

/**
 * Batas semester default: Semester 2 mulai 1 Januari setelah tanggal mulai TA.
 * Kalau 1 Januari tidak ada di dalam TA, pakai tengah-tengah TA.
 * (Rumus yang sama dipakai migrasi 0011 untuk data lama.)
 */
export function hitungSemesterDefault(tanggalMulai: string, tanggalSelesai: string) {
  const tahunMulai = Number(tanggalMulai.slice(0, 4));
  let semester2Mulai = `${tahunMulai + 1}-01-01`;
  if (!(semester2Mulai > tanggalMulai && semester2Mulai <= tanggalSelesai)) {
    const totalHari =
      (Date.parse(`${tanggalSelesai}T00:00:00Z`) - Date.parse(`${tanggalMulai}T00:00:00Z`)) /
      86_400_000;
    semester2Mulai = geserHari(tanggalMulai, Math.floor(totalHari / 2) + 1);
  }
  return { semester1Selesai: geserHari(semester2Mulai, -1), semester2Mulai };
}

interface RentangTahunAjaran {
  tanggalMulai: string;
  tanggalSelesai: string;
  semester1Mulai: string;
  semester1Selesai: string;
  semester2Mulai: string;
  semester2Selesai: string;
}

/**
 * Urutan wajib:
 * mulai TA <= awal Sem 1 <= akhir Sem 1 < awal Sem 2 <= akhir Sem 2 <= selesai TA
 * (awal Sem 1 boleh setelah mulai TA, mis. KBM mulai 13 Juli; boleh ada jeda libur antar semester).
 */
export function validasiRentang(r: RentangTahunAjaran) {
  if (r.tanggalMulai >= r.tanggalSelesai) {
    throw new BadRequestException('Tanggal mulai harus sebelum tanggal selesai');
  }
  if (r.semester1Mulai < r.tanggalMulai) {
    throw new BadRequestException('Awal Semester 1 tidak boleh sebelum tanggal mulai tahun ajaran');
  }
  if (r.semester1Selesai < r.semester1Mulai) {
    throw new BadRequestException('Akhir Semester 1 harus setelah awal Semester 1');
  }
  if (r.semester2Mulai <= r.semester1Selesai) {
    throw new BadRequestException('Awal Semester 2 harus setelah akhir Semester 1');
  }
  if (r.semester2Selesai < r.semester2Mulai) {
    throw new BadRequestException('Akhir Semester 2 harus setelah awal Semester 2');
  }
  if (r.semester2Selesai > r.tanggalSelesai) {
    throw new BadRequestException(
      'Akhir Semester 2 tidak boleh melewati tanggal selesai tahun ajaran',
    );
  }
}

export interface TahunAjaranDetail {
  id: string;
  tenantId: string;
  nama: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  semester1Mulai: string;
  semester1Selesai: string;
  semester2Mulai: string;
  semester2Selesai: string;
  status: string;
  createdAt: Date | null;
  kelasCount: number;
}

@Injectable()
export class TahunAjaranService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly kelasService: KelasService,
  ) {}

  /**
   * Create a new tahun ajaran with status 'disiapkan'.
   * Optionally duplicates class structure from the most recent tahun ajaran with kelas.
   */
  async create(tenantId: string, dto: CreateTahunAjaranDto) {
    // Validate tanggal_mulai < tanggal_selesai
    if (dto.tanggal_mulai >= dto.tanggal_selesai) {
      throw new BadRequestException('Tanggal mulai harus sebelum tanggal selesai');
    }

    // Rentang semester: pakai isian admin, sisanya diisi default
    const def = hitungSemesterDefault(dto.tanggal_mulai, dto.tanggal_selesai);
    const semester1Selesai = dto.semester_1_selesai ?? def.semester1Selesai;
    const semester2Mulai = dto.semester_2_mulai ?? def.semester2Mulai;
    validasiRentang({
      tanggalMulai: dto.tanggal_mulai,
      tanggalSelesai: dto.tanggal_selesai,
      semester1Mulai: dto.tanggal_mulai,
      semester1Selesai,
      semester2Mulai,
      semester2Selesai: dto.tanggal_selesai,
    });

    // Nama tidak boleh dobel, tanggal tidak boleh tumpang tindih dengan TA lain
    await this.cekBentrok(tenantId, dto.nama, dto.tanggal_mulai, dto.tanggal_selesai);

    // Create tahun ajaran with default status 'disiapkan'
    const [created] = await this.db
      .insert(tahunAjaran)
      .values({
        tenantId,
        nama: dto.nama,
        tanggalMulai: dto.tanggal_mulai,
        tanggalSelesai: dto.tanggal_selesai,
        semester1Mulai: dto.tanggal_mulai,
        semester1Selesai,
        semester2Mulai,
        semester2Selesai: dto.tanggal_selesai,
        status: 'disiapkan',
      })
      .returning();

    // Determine whether to generate kelas (default: true when omitted)
    const shouldGenerate = dto.generate_kelas !== false;
    let duplicatedCount = 0;

    if (shouldGenerate) {
      const sourceTahunAjaran = await this.findSourceTahunAjaran(tenantId, created.id);
      if (sourceTahunAjaran) {
        const result = await this.kelasService.duplicateClassStructure(
          tenantId,
          sourceTahunAjaran.id,
          created.id,
        );
        duplicatedCount = result.duplicated;
      }
    }

    return {
      ...created,
      duplicatedClassCount: duplicatedCount,
    };
  }

  /**
   * List all tahun ajaran for a tenant, ordered by tanggal_mulai.
   */
  async findAll(tenantId: string) {
    const results = await this.db
      .select()
      .from(tahunAjaran)
      .where(eq(tahunAjaran.tenantId, tenantId))
      .orderBy(tahunAjaran.tanggalMulai);

    return results;
  }

  /**
   * Get tahun ajaran detail with class count.
   */
  async findOne(tenantId: string, id: string): Promise<TahunAjaranDetail> {
    const results = await this.db
      .select()
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.id, id), eq(tahunAjaran.tenantId, tenantId)));

    if (results.length === 0) {
      throw new NotFoundException(`Tahun ajaran dengan id ${id} tidak ditemukan`);
    }

    const ta = results[0];
    const kelasCount = await this.kelasService.countByTahunAjaran(tenantId, id);

    return {
      id: ta.id,
      tenantId: ta.tenantId,
      nama: ta.nama,
      tanggalMulai: ta.tanggalMulai,
      tanggalSelesai: ta.tanggalSelesai,
      semester1Mulai: ta.semester1Mulai,
      semester1Selesai: ta.semester1Selesai,
      semester2Mulai: ta.semester2Mulai,
      semester2Selesai: ta.semester2Selesai,
      status: ta.status,
      createdAt: ta.createdAt,
      kelasCount,
    };
  }

  /**
   * Ubah batas semester (akhir Semester 1 & awal Semester 2) sebuah tahun ajaran.
   * (Endpoint lama; halaman admin sekarang pakai update().)
   */
  async updateSemester(tenantId: string, id: string, dto: UpdateSemesterDto) {
    return this.update(tenantId, id, {
      semester_1_selesai: dto.semester_1_selesai,
      semester_2_mulai: dto.semester_2_mulai,
    });
  }

  /**
   * Edit tahun ajaran (nama, rentang TA, rentang semester). Field yang tidak dikirim tidak berubah.
   */
  async update(tenantId: string, id: string, dto: UpdateTahunAjaranDto) {
    const ta = await this.getById(tenantId, id);

    const nama = dto.nama?.trim() ?? ta.nama;
    const rentang: RentangTahunAjaran = {
      tanggalMulai: dto.tanggal_mulai ?? ta.tanggalMulai,
      tanggalSelesai: dto.tanggal_selesai ?? ta.tanggalSelesai,
      semester1Mulai: dto.semester_1_mulai ?? ta.semester1Mulai,
      semester1Selesai: dto.semester_1_selesai ?? ta.semester1Selesai,
      semester2Mulai: dto.semester_2_mulai ?? ta.semester2Mulai,
      semester2Selesai: dto.semester_2_selesai ?? ta.semester2Selesai,
    };
    validasiRentang(rentang);
    await this.cekBentrok(tenantId, nama, rentang.tanggalMulai, rentang.tanggalSelesai, id);

    const [updated] = await this.db
      .update(tahunAjaran)
      .set({ nama, ...rentang })
      .where(eq(tahunAjaran.id, id))
      .returning();

    return updated;
  }

  /**
   * Hapus tahun ajaran yang salah input. Hanya untuk status 'disiapkan' (belum pernah aktif)
   * dan belum dipakai data apa pun. Kelas kosong hasil generate ikut dihapus.
   */
  async remove(tenantId: string, id: string) {
    const ta = await this.getById(tenantId, id);

    if (ta.status !== 'disiapkan') {
      throw new BadRequestException('Hanya tahun ajaran berstatus "Disiapkan" yang bisa dihapus');
    }

    const hitung = async (query: ReturnType<typeof sql>) => {
      const res = await this.db.execute(query);
      return Number((res.rows[0] as { n: string | number }).n);
    };
    const pemakaian: [string, number][] = [
      [
        'siswa',
        await hitung(
          sql`SELECT count(*) AS n FROM siswa s JOIN kelas k ON k.id = s.kelas_id WHERE k.tahun_ajaran_id = ${id}`,
        ),
      ],
      [
        'jadwal',
        await hitung(sql`SELECT count(*) AS n FROM jadwal_pelajaran WHERE tahun_ajaran_id = ${id}`),
      ],
      ['rapor', await hitung(sql`SELECT count(*) AS n FROM rapor WHERE tahun_ajaran_id = ${id}`)],
      [
        'tagihan',
        await hitung(sql`SELECT count(*) AS n FROM tagihan WHERE tahun_ajaran_id = ${id}`),
      ],
      [
        'riwayat kelas',
        await hitung(sql`SELECT count(*) AS n FROM riwayat_kelas WHERE tahun_ajaran_id = ${id}`),
      ],
    ];
    // Tabel CBT ada di database yang sama, tapi bisa belum dibuat di database lokal/baru
    const adaTabelCbt = await hitung(
      sql`SELECT count(*) AS n FROM pg_class WHERE relname = 'cbt_pelaksanaan_ujian' AND relkind = 'r'`,
    );
    if (adaTabelCbt > 0) {
      pemakaian.push([
        'ujian CBT',
        await hitung(
          sql`SELECT count(*) AS n FROM cbt_pelaksanaan_ujian WHERE tahun_ajaran_id = ${id}`,
        ),
      ]);
    }

    const terpakai = pemakaian.filter(([, n]) => n > 0);
    if (terpakai.length > 0) {
      throw new BadRequestException(
        `Tahun ajaran ${ta.nama} tidak bisa dihapus karena sudah dipakai: ` +
          terpakai.map(([nama, n]) => `${n} ${nama}`).join(', '),
      );
    }

    let kelasDihapus = 0;
    try {
      await this.db.transaction(async (tx) => {
        const hapusKelas = await tx
          .delete(kelas)
          .where(and(eq(kelas.tenantId, tenantId), eq(kelas.tahunAjaranId, id)))
          .returning({ id: kelas.id });
        kelasDihapus = hapusKelas.length;
        await tx.delete(tahunAjaran).where(eq(tahunAjaran.id, id));
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23503') {
        throw new BadRequestException(
          `Tahun ajaran ${ta.nama} tidak bisa dihapus karena kelasnya masih dipakai data lain`,
        );
      }
      throw error;
    }

    return { id, nama: ta.nama, kelasDihapus };
  }

  private async getById(tenantId: string, id: string) {
    const [ta] = await this.db
      .select()
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.id, id), eq(tahunAjaran.tenantId, tenantId)));

    if (!ta) {
      throw new NotFoundException(`Tahun ajaran dengan id ${id} tidak ditemukan`);
    }
    return ta;
  }

  /**
   * Tolak kalau nama sudah dipakai TA lain, atau rentang tanggalnya tumpang tindih dengan TA lain.
   */
  private async cekBentrok(
    tenantId: string,
    nama: string,
    tanggalMulai: string,
    tanggalSelesai: string,
    kecualiId?: string,
  ) {
    const daftar = await this.db
      .select({
        id: tahunAjaran.id,
        nama: tahunAjaran.nama,
        tanggalMulai: tahunAjaran.tanggalMulai,
        tanggalSelesai: tahunAjaran.tanggalSelesai,
      })
      .from(tahunAjaran)
      .where(eq(tahunAjaran.tenantId, tenantId));

    for (const lain of daftar) {
      if (lain.id === kecualiId) continue;
      if (lain.nama.trim().toLowerCase() === nama.trim().toLowerCase()) {
        throw new ConflictException(`Nama tahun ajaran "${nama}" sudah dipakai`);
      }
      if (tanggalMulai <= lain.tanggalSelesai && tanggalSelesai >= lain.tanggalMulai) {
        throw new ConflictException(
          `Tanggal bertabrakan dengan tahun ajaran ${lain.nama} ` +
            `(${lain.tanggalMulai} s.d. ${lain.tanggalSelesai})`,
        );
      }
    }
  }

  /**
   * Activate a tahun ajaran:
   * 1. Verify target exists and has status 'disiapkan'
   * 2. Find the currently active one in this tenant
   * 3. Set the previous active to 'nonaktif'
   * 4. Set the target to 'aktif'
   *
   * Ensures at most ONE active tahun ajaran per tenant at any time.
   */
  async activate(tenantId: string, id: string) {
    // Verify the target exists and belongs to this tenant
    const targets = await this.db
      .select()
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.id, id), eq(tahunAjaran.tenantId, tenantId)));

    if (targets.length === 0) {
      throw new NotFoundException(`Tahun ajaran dengan id ${id} tidak ditemukan`);
    }

    const target = targets[0];

    if (target.status === 'aktif') {
      throw new BadRequestException('Tahun ajaran ini sudah aktif');
    }

    if (target.status !== 'disiapkan') {
      throw new BadRequestException(
        'Hanya tahun ajaran dengan status "disiapkan" yang dapat diaktifkan',
      );
    }

    // Find currently active tahun ajaran (if any)
    const activeList = await this.db
      .select()
      .from(tahunAjaran)
      .where(and(eq(tahunAjaran.tenantId, tenantId), eq(tahunAjaran.status, 'aktif')));

    // Deactivate previous active
    if (activeList.length > 0) {
      await this.db
        .update(tahunAjaran)
        .set({ status: 'nonaktif' })
        .where(eq(tahunAjaran.id, activeList[0].id));
    }

    // Activate the target
    await this.db.update(tahunAjaran).set({ status: 'aktif' }).where(eq(tahunAjaran.id, id));

    return {
      id: target.id,
      nama: target.nama,
      status: 'aktif',
      previousActiveId: activeList.length > 0 ? activeList[0].id : null,
    };
  }

  /**
   * Find the most recent tahun ajaran (by tanggal_mulai DESC, created_at DESC)
   * within the same tenant that has at least one kelas record.
   * Excludes the provided excludeId (the newly created tahun ajaran).
   */
  private async findSourceTahunAjaran(
    tenantId: string,
    excludeId: string,
  ): Promise<{ id: string } | null> {
    const result = await this.db
      .select({ id: tahunAjaran.id })
      .from(tahunAjaran)
      .where(
        and(
          eq(tahunAjaran.tenantId, tenantId),
          sql`${tahunAjaran.id} != ${excludeId}`,
          sql`EXISTS (SELECT 1 FROM kelas WHERE kelas.tahun_ajaran_id = ${tahunAjaran.id} AND kelas.tenant_id = ${tenantId})`,
        ),
      )
      .orderBy(desc(tahunAjaran.tanggalMulai), desc(tahunAjaran.createdAt))
      .limit(1);

    return result[0] ?? null;
  }
}
