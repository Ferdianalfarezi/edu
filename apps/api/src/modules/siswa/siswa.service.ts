import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, ilike, gt, asc, desc, sql, inArray } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { siswa } from '@/drizzle/schema/siswa';
import { user } from '@/drizzle/schema/user';
import { kelas } from '@/drizzle/schema/kelas';
import { tahunAjaran } from '@/drizzle/schema/tahun-ajaran';
import { tenant } from '@/drizzle/schema/tenant';
import { riwayatKelas } from '@/drizzle/schema/konfigurasi';
import { rapor, raporNilai, komponenPenilaian } from '@/drizzle/schema/rapor';
import { mataPelajaran } from '@/drizzle/schema/mata-pelajaran';
import { CreateSiswaDto, UpdateSiswaDto, SoftDeleteSiswaDto, ListSiswaQueryDto } from './dto';
import { RiwayatKelasHelper, RiwayatKelasEntry } from './riwayat-kelas.helper';

export interface SiswaDetailResponse {
  profil: {
    id: string;
    nama: string;
    nisn: string | null;
    jenis_kelamin: 'L' | 'P' | null;
    tanggal_lahir: string | null;
    alamat: string | null;
    status: 'aktif' | 'pindah_sekolah' | 'keluar' | 'lulus';
    kelas_nama: string | null;
    orang_tua_nama: string | null;
  };
  riwayat_kelas: Array<{
    kelas_nama: string;
    tingkat: number;
    tahun_ajaran_nama: string;
    tanggal_mulai: string;
    is_current: boolean;
  }>;
  rapor_ringkasan: Array<{
    tahun_ajaran_nama: string;
    periode: 'uts_semester_1' | 'semester_1' | 'uts_semester_2' | 'semester_2';
    rapor_id: string;
    rata_rata: number;
    peringkat: number | null;
  }>;
}

export interface RaporDetailResponse {
  nilai: Array<{
    mata_pelajaran_nama: string;
    komponen_nilai: Array<{
      komponen_nama: string | null;
      nilai: string | number;
    }>;
    rata_rata: string;
    guru_nama: string;
    capaian_pembelajaran: string | null;
  }>;
}

const DEFAULT_PAGE_SIZE = 20;

export interface BulkImportSiswaResult {
  created: number;
  skipped: { row: number; reason: string }[];
  total: number;
}

export interface ParsedSiswaCsvRow {
  nama: string;
  nisn: string;
  jenisKelamin: string;
  tanggalLahir: string;
  orangTuaNama: string;
  orangTuaPhone: string;
  kelasId: string;
}

@Injectable()
export class SiswaService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly riwayatKelasHelper: RiwayatKelasHelper,
  ) {}

  // ─── Create Siswa ─────────────────────────────────────────────

  async createSiswa(tenantId: string, dto: CreateSiswaDto, _processedByUserId: string) {
    // Validate NISN uniqueness per tenant (active students only)
    if (dto.nisn) {
      await this.validateNisnUniqueness(dto.nisn, tenantId);
    }

    // Handle parent linkage per ADR-002
    let orangTuaId: string | null = null;
    if (dto.orangTuaPhone) {
      orangTuaId = await this.resolveOrCreateParent(
        dto.orangTuaPhone,
        dto.orangTuaNama || dto.nama,
      );
    }

    // Insert siswa
    const [created] = await this.db
      .insert(siswa)
      .values({
        tenantId,
        kelasId: dto.kelasId || null,
        nama: dto.nama,
        nisn: dto.nisn || null,
        jenisKelamin: dto.jenisKelamin || null,
        tanggalLahir: dto.tanggalLahir || null,
        alamat: dto.alamat || null,
        orangTuaId,
        status: 'aktif',
      })
      .returning();

    // Record riwayat kelas if kelasId is non-null
    if (created.kelasId) {
      const [kelasRecord] = await this.db
        .select({ tahunAjaranId: kelas.tahunAjaranId })
        .from(kelas)
        .where(eq(kelas.id, created.kelasId))
        .limit(1);

      if (kelasRecord) {
        await this.riwayatKelasHelper.record({
          tenantId,
          siswaId: created.id,
          kelasId: created.kelasId,
          tahunAjaranId: kelasRecord.tahunAjaranId,
        });
      }
    }

    return {
      id: created.id,
      tenantId: created.tenantId,
      kelasId: created.kelasId,
      nama: created.nama,
      nisn: created.nisn,
      jenisKelamin: created.jenisKelamin,
      tanggalLahir: created.tanggalLahir,
      alamat: created.alamat,
      orangTuaId: created.orangTuaId,
      status: created.status,
      createdAt: created.createdAt,
    };
  }

  // ─── Get Siswa by ID ──────────────────────────────────────────

  async getSiswaById(tenantId: string, siswaId: string) {
    const results = await this.db
      .select({
        id: siswa.id,
        tenantId: siswa.tenantId,
        kelasId: siswa.kelasId,
        nama: siswa.nama,
        nisn: siswa.nisn,
        jenisKelamin: siswa.jenisKelamin,
        tanggalLahir: siswa.tanggalLahir,
        alamat: siswa.alamat,
        orangTuaId: siswa.orangTuaId,
        status: siswa.status,
        tanggalKeluar: siswa.tanggalKeluar,
        alasanKeluar: siswa.alasanKeluar,
        processedBy: siswa.processedBy,
        createdAt: siswa.createdAt,
        updatedAt: siswa.updatedAt,
      })
      .from(siswa)
      .where(and(eq(siswa.id, siswaId), eq(siswa.tenantId, tenantId)))
      .limit(1);

    if (!results[0]) {
      throw new NotFoundException('Siswa tidak ditemukan');
    }

    return results[0];
  }

  // ─── Get Siswa Detail ───────────────────────────────────────────

  async getSiswaDetail(tenantId: string, siswaId: string): Promise<SiswaDetailResponse> {
    // Alias user table for orang_tua join
    const orangTuaUser = user;

    // Query 1: Profile — siswa + LEFT JOIN kelas + LEFT JOIN user (orang_tua)
    const profileResults = await this.db
      .select({
        id: siswa.id,
        nama: siswa.nama,
        nisn: siswa.nisn,
        jenisKelamin: siswa.jenisKelamin,
        tanggalLahir: siswa.tanggalLahir,
        alamat: siswa.alamat,
        status: siswa.status,
        kelasId: siswa.kelasId,
        kelasNama: kelas.nama,
        kelasTingkat: kelas.tingkat,
        kelasTahunAjaranId: kelas.tahunAjaranId,
        orangTuaNama: orangTuaUser.nama,
      })
      .from(siswa)
      .leftJoin(kelas, eq(siswa.kelasId, kelas.id))
      .leftJoin(orangTuaUser, eq(siswa.orangTuaId, orangTuaUser.id))
      .where(and(eq(siswa.id, siswaId), eq(siswa.tenantId, tenantId)))
      .limit(1);

    if (!profileResults[0]) {
      throw new NotFoundException('Siswa tidak ditemukan');
    }

    const profile = profileResults[0];

    // Query 2: Riwayat — riwayat_kelas JOIN kelas JOIN tahun_ajaran
    const riwayatResults = await this.db
      .select({
        kelasNama: kelas.nama,
        tingkat: kelas.tingkat,
        tahunAjaranNama: tahunAjaran.nama,
        tanggalMulai: riwayatKelas.tanggalMulai,
      })
      .from(riwayatKelas)
      .innerJoin(kelas, eq(riwayatKelas.kelasId, kelas.id))
      .innerJoin(tahunAjaran, eq(riwayatKelas.tahunAjaranId, tahunAjaran.id))
      .where(and(eq(riwayatKelas.siswaId, siswaId), eq(riwayatKelas.tenantId, tenantId)))
      .orderBy(desc(riwayatKelas.tanggalMulai));

    // Build riwayat_kelas array: merge current kelas as first entry with is_current: true
    const riwayatEntries: SiswaDetailResponse['riwayat_kelas'] = [];

    if (profile.kelasId && profile.kelasNama !== null && profile.kelasTingkat !== null) {
      // Fetch tahun_ajaran name for the current kelas
      let currentTahunAjaranNama = '';
      if (profile.kelasTahunAjaranId) {
        const [taRecord] = await this.db
          .select({ nama: tahunAjaran.nama })
          .from(tahunAjaran)
          .where(eq(tahunAjaran.id, profile.kelasTahunAjaranId))
          .limit(1);
        currentTahunAjaranNama = taRecord?.nama || '';
      }

      riwayatEntries.push({
        kelas_nama: profile.kelasNama,
        tingkat: profile.kelasTingkat,
        tahun_ajaran_nama: currentTahunAjaranNama,
        tanggal_mulai: new Date().toISOString().split('T')[0],
        is_current: true,
      });
    }

    // Append historical entries with is_current: false
    for (const row of riwayatResults) {
      riwayatEntries.push({
        kelas_nama: row.kelasNama,
        tingkat: row.tingkat,
        tahun_ajaran_nama: row.tahunAjaranNama,
        tanggal_mulai: row.tanggalMulai || '',
        is_current: false,
      });
    }

    // Sort merged array by tanggal_mulai DESC
    riwayatEntries.sort((a, b) => {
      if (b.tanggal_mulai > a.tanggal_mulai) return 1;
      if (b.tanggal_mulai < a.tanggal_mulai) return -1;
      return 0;
    });

    // Query 3: Rapor ringkasan — rapor (status='final') + rapor_nilai for this student
    // Compute AVG(rata_rata) per rapor rounded to 2 decimal places
    const raporResults = await this.db
      .select({
        raporId: rapor.id,
        tahunAjaranNama: tahunAjaran.nama,
        periode: rapor.periode,
        avgRataRata: sql<string>`ROUND(AVG(${raporNilai.rataRata}::numeric), 2)`.as(
          'avg_rata_rata',
        ),
        peringkat: sql<number | null>`(
          SELECT ${raporNilai.peringkat}
          FROM ${raporNilai} AS rn2
          WHERE rn2.rapor_id = ${rapor.id}
            AND rn2.siswa_id = ${siswaId}
            AND rn2.peringkat IS NOT NULL
          LIMIT 1
        )`.as('peringkat'),
      })
      .from(rapor)
      .innerJoin(raporNilai, and(eq(raporNilai.raporId, rapor.id), eq(raporNilai.siswaId, siswaId)))
      .innerJoin(tahunAjaran, eq(rapor.tahunAjaranId, tahunAjaran.id))
      .where(and(eq(rapor.tenantId, tenantId), eq(rapor.status, 'final')))
      .groupBy(rapor.id, tahunAjaran.nama, rapor.periode)
      .orderBy(desc(tahunAjaran.nama), desc(rapor.periode));

    const raporRingkasan: SiswaDetailResponse['rapor_ringkasan'] = raporResults.map((row) => ({
      tahun_ajaran_nama: row.tahunAjaranNama,
      periode: row.periode,
      rapor_id: row.raporId,
      rata_rata: parseFloat(row.avgRataRata) || 0,
      peringkat: row.peringkat ?? null,
    }));

    return {
      profil: {
        id: profile.id,
        nama: profile.nama,
        nisn: profile.nisn || null,
        jenis_kelamin: profile.jenisKelamin || null,
        tanggal_lahir: profile.tanggalLahir || null,
        alamat: profile.alamat || null,
        status: profile.status as 'aktif' | 'pindah_sekolah' | 'keluar' | 'lulus',
        kelas_nama: profile.kelasNama || null,
        orang_tua_nama: profile.orangTuaNama || null,
      },
      riwayat_kelas: riwayatEntries,
      rapor_ringkasan: raporRingkasan,
    };
  }

  // ─── Get Siswa Rapor Detail ───────────────────────────────────

  async getSiswaRaporDetail(
    tenantId: string,
    siswaId: string,
    raporId: string,
  ): Promise<RaporDetailResponse> {
    // Query rapor_nilai with status='submitted', JOIN mata_pelajaran and user (guru)
    const guruUser = user;

    const nilaiResults = await this.db
      .select({
        mataPelajaranNama: mataPelajaran.nama,
        komponenNilai: raporNilai.komponenNilai,
        rataRata: raporNilai.rataRata,
        guruNama: guruUser.nama,
        capaianPembelajaran: raporNilai.capaianPembelajaran,
      })
      .from(raporNilai)
      .innerJoin(mataPelajaran, eq(raporNilai.mataPelajaranId, mataPelajaran.id))
      .innerJoin(guruUser, eq(raporNilai.guruId, guruUser.id))
      .where(
        and(
          eq(raporNilai.raporId, raporId),
          eq(raporNilai.siswaId, siswaId),
          eq(raporNilai.tenantId, tenantId),
          eq(raporNilai.status, 'submitted'),
        ),
      )
      .orderBy(asc(mataPelajaran.nama));

    if (nilaiResults.length === 0) {
      throw new NotFoundException('Data rapor tidak ditemukan');
    }

    // Collect all unique komponen_ids from all rapor_nilai rows
    const allKomponenIds = new Set<string>();
    for (const row of nilaiResults) {
      const komponenArray = row.komponenNilai as Array<{
        komponen_id: string;
        nilai: string | number;
      }>;
      if (Array.isArray(komponenArray)) {
        for (const k of komponenArray) {
          if (k.komponen_id) {
            allKomponenIds.add(k.komponen_id);
          }
        }
      }
    }

    // Batch-resolve komponen names from komponen_penilaian table
    const komponenNameMap = new Map<string, string>();
    if (allKomponenIds.size > 0) {
      const komponenRecords = await this.db
        .select({
          id: komponenPenilaian.id,
          nama: komponenPenilaian.nama,
        })
        .from(komponenPenilaian)
        .where(inArray(komponenPenilaian.id, Array.from(allKomponenIds)));

      for (const record of komponenRecords) {
        komponenNameMap.set(record.id, record.nama);
      }
    }

    // Build response: for each rapor_nilai, resolve komponen names
    const nilai: RaporDetailResponse['nilai'] = nilaiResults.map((row) => {
      const komponenArray = row.komponenNilai as Array<{
        komponen_id: string;
        nilai: string | number;
      }>;

      const resolvedKomponen: RaporDetailResponse['nilai'][number]['komponen_nilai'] =
        Array.isArray(komponenArray)
          ? komponenArray.map((k) => ({
              komponen_nama: komponenNameMap.get(k.komponen_id) ?? null,
              nilai: k.nilai,
            }))
          : [];

      return {
        mata_pelajaran_nama: row.mataPelajaranNama,
        komponen_nilai: resolvedKomponen,
        rata_rata: row.rataRata || '0.00',
        guru_nama: row.guruNama,
        capaian_pembelajaran: row.capaianPembelajaran || null,
      };
    });

    return { nilai };
  }

  // ─── Update Siswa ─────────────────────────────────────────────

  async updateSiswa(tenantId: string, siswaId: string, dto: UpdateSiswaDto) {
    // Verify siswa exists
    const existing = await this.getSiswaById(tenantId, siswaId);

    // If NISN is being changed, validate uniqueness
    if (dto.nisn && dto.nisn !== existing.nisn) {
      await this.validateNisnUniqueness(dto.nisn, tenantId, siswaId);
    }

    // Handle parent linkage update
    let orangTuaId: string | undefined;
    if (dto.orangTuaPhone !== undefined) {
      if (dto.orangTuaPhone) {
        orangTuaId = await this.resolveOrCreateParent(
          dto.orangTuaPhone,
          dto.orangTuaNama || existing.nama,
        );
      } else {
        orangTuaId = undefined; // Don't change if empty string
      }
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.nama !== undefined) updateData.nama = dto.nama;
    if (dto.nisn !== undefined) updateData.nisn = dto.nisn || null;
    if (dto.jenisKelamin !== undefined) updateData.jenisKelamin = dto.jenisKelamin;
    if (dto.tanggalLahir !== undefined) updateData.tanggalLahir = dto.tanggalLahir;
    if (dto.alamat !== undefined) updateData.alamat = dto.alamat;
    if (dto.kelasId !== undefined) updateData.kelasId = dto.kelasId;
    if (orangTuaId !== undefined) updateData.orangTuaId = orangTuaId;

    const [updated] = await this.db
      .update(siswa)
      .set(updateData)
      .where(and(eq(siswa.id, siswaId), eq(siswa.tenantId, tenantId)))
      .returning();

    // Record riwayat kelas if kelasId changed to a non-null value
    if (dto.kelasId !== undefined && dto.kelasId !== existing.kelasId && dto.kelasId !== null) {
      const [kelasRecord] = await this.db
        .select({ tahunAjaranId: kelas.tahunAjaranId })
        .from(kelas)
        .where(eq(kelas.id, dto.kelasId))
        .limit(1);

      if (kelasRecord) {
        await this.riwayatKelasHelper.record({
          tenantId,
          siswaId,
          kelasId: dto.kelasId,
          tahunAjaranId: kelasRecord.tahunAjaranId,
        });
      }
    }

    return {
      id: updated.id,
      tenantId: updated.tenantId,
      kelasId: updated.kelasId,
      nama: updated.nama,
      nisn: updated.nisn,
      jenisKelamin: updated.jenisKelamin,
      tanggalLahir: updated.tanggalLahir,
      alamat: updated.alamat,
      orangTuaId: updated.orangTuaId,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  // ─── Soft Delete (pindah_sekolah / keluar) ────────────────────

  async softDeleteSiswa(
    tenantId: string,
    siswaId: string,
    dto: SoftDeleteSiswaDto,
    processedByUserId: string,
  ) {
    // Verify siswa exists and is active
    const existing = await this.getSiswaById(tenantId, siswaId);

    if (existing.status !== 'aktif') {
      throw new BadRequestException('Siswa sudah tidak aktif');
    }

    const [updated] = await this.db
      .update(siswa)
      .set({
        status: dto.status,
        tanggalKeluar: new Date().toISOString().split('T')[0],
        alasanKeluar: dto.alasanKeluar || null,
        processedBy: processedByUserId,
        updatedAt: new Date(),
      })
      .where(and(eq(siswa.id, siswaId), eq(siswa.tenantId, tenantId)))
      .returning();

    // Check parent access revocation:
    // If this parent has no remaining active children in this tenant, their access is revoked
    // (handled at query level per design — parent won't see this tenant in their tenants[])
    if (updated.orangTuaId) {
      await this.checkAndLogParentAccessStatus(updated.orangTuaId, tenantId);
    }

    return {
      id: updated.id,
      nama: updated.nama,
      status: updated.status,
      tanggalKeluar: updated.tanggalKeluar,
      alasanKeluar: updated.alasanKeluar,
      processedBy: updated.processedBy,
    };
  }

  // ─── Get Anak Saya (Parent's Children) ────────────────────────

  /**
   * Returns all children belonging to the authenticated parent user.
   * Joins kelas and tenant tables to include kelas_nama and tenant info.
   * Used by mobile app for child selectors across features.
   *
   * Requirements: 21.9, 21.10
   */
  async getAnakSaya(parentUserId: string) {
    const results = await this.db
      .select({
        id: siswa.id,
        nama: siswa.nama,
        kelasNama: kelas.nama,
        tenantId: siswa.tenantId,
        tenantNama: tenant.nama,
      })
      .from(siswa)
      .leftJoin(kelas, eq(siswa.kelasId, kelas.id))
      .innerJoin(tenant, eq(siswa.tenantId, tenant.id))
      .where(and(eq(siswa.orangTuaId, parentUserId), eq(siswa.status, 'aktif')));

    return {
      data: results.map((r) => ({
        siswa_id: r.id,
        nama: r.nama,
        kelas_nama: r.kelasNama,
        tenant_id: r.tenantId,
        tenant_nama: r.tenantNama,
      })),
    };
  }

  // ─── List Siswa (cursor paginated, search, filter) ────────────

  async listSiswa(tenantId: string, query: ListSiswaQueryDto) {
    const conditions: ReturnType<typeof eq>[] = [eq(siswa.tenantId, tenantId)];

    // Exact NISN search
    if (query.nisn) {
      conditions.push(eq(siswa.nisn, query.nisn));
    }

    // Name ILIKE search
    if (query.search) {
      conditions.push(ilike(siswa.nama, `%${query.search}%`));
    }

    // Filter by kelas
    if (query.kelas_id) {
      conditions.push(eq(siswa.kelasId, query.kelas_id));
    }

    // Filter by status
    if (query.status) {
      conditions.push(
        eq(siswa.status, query.status as 'aktif' | 'pindah_sekolah' | 'keluar' | 'lulus'),
      );
    }

    // Filter by tahun_ajaran (via kelas.tahun_ajaran_id)
    if (query.tahun_ajaran_id) {
      const kelasIds = this.db
        .select({ id: kelas.id })
        .from(kelas)
        .where(and(eq(kelas.tenantId, tenantId), eq(kelas.tahunAjaranId, query.tahun_ajaran_id)));
      conditions.push(sql`${siswa.kelasId} IN (${kelasIds})`);
    }

    // Cursor pagination
    if (query.cursor) {
      conditions.push(gt(siswa.id, query.cursor));
    }

    const pageSize = query.limit ?? DEFAULT_PAGE_SIZE;

    // Alias the user table for the parent join
    const orangTuaUser = user;

    const results = await this.db
      .select({
        id: siswa.id,
        kelas_id: siswa.kelasId,
        kelas_nama: kelas.nama,
        tahun_ajaran_id: kelas.tahunAjaranId,
        tahun_ajaran_nama: tahunAjaran.nama,
        nama: siswa.nama,
        nisn: siswa.nisn,
        jenis_kelamin: siswa.jenisKelamin,
        tanggal_lahir: siswa.tanggalLahir,
        alamat: siswa.alamat,
        orang_tua_nama: orangTuaUser.nama,
        orang_tua_phone: orangTuaUser.phone,
        status: siswa.status,
        created_at: siswa.createdAt,
      })
      .from(siswa)
      .leftJoin(kelas, eq(siswa.kelasId, kelas.id))
      .leftJoin(tahunAjaran, eq(kelas.tahunAjaranId, tahunAjaran.id))
      .leftJoin(orangTuaUser, eq(siswa.orangTuaId, orangTuaUser.id))
      .where(and(...conditions))
      .orderBy(asc(siswa.id))
      .limit(pageSize + 1);

    const hasNext = results.length > pageSize;
    const data = hasNext ? results.slice(0, pageSize) : results;
    const nextCursor = hasNext ? data[data.length - 1].id : null;

    return {
      data,
      meta: {
        has_next: hasNext,
        cursor: nextCursor,
      },
    };
  }

  // ─── Bulk Import via CSV ──────────────────────────────────────

  async bulkImportSiswa(
    tenantId: string,
    csvContent: string,
    _processedByUserId: string,
  ): Promise<BulkImportSiswaResult> {
    const rows = this.parseSiswaCsv(csvContent);

    if (rows.length === 0) {
      throw new BadRequestException('File CSV kosong atau format tidak valid');
    }

    const created: number[] = [];
    const skipped: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 for header + 0-index

      // Validate required fields
      if (!row.nama || row.nama.trim().length === 0) {
        skipped.push({ row: rowNum, reason: 'Nama tidak boleh kosong' });
        continue;
      }

      // Validate NISN uniqueness if provided
      if (row.nisn) {
        const nisnExists = await this.checkNisnExists(row.nisn, tenantId);
        if (nisnExists) {
          skipped.push({ row: rowNum, reason: `NISN ${row.nisn} sudah terdaftar` });
          continue;
        }
      }

      // Validate jenis_kelamin
      if (row.jenisKelamin && !['L', 'P'].includes(row.jenisKelamin.toUpperCase())) {
        skipped.push({ row: rowNum, reason: 'Jenis kelamin harus L atau P' });
        continue;
      }

      // Handle parent linkage with global deduplication
      let orangTuaId: string | null = null;
      if (row.orangTuaPhone) {
        orangTuaId = await this.resolveOrCreateParent(
          row.orangTuaPhone,
          row.orangTuaNama || row.nama,
        );
      }

      await this.db.insert(siswa).values({
        tenantId,
        kelasId: row.kelasId || null,
        nama: row.nama.trim(),
        nisn: row.nisn || null,
        jenisKelamin: row.jenisKelamin ? (row.jenisKelamin.toUpperCase() as 'L' | 'P') : null,
        tanggalLahir: row.tanggalLahir || null,
        orangTuaId,
        status: 'aktif',
      });

      created.push(1);
    }

    return {
      created: created.length,
      skipped,
      total: rows.length,
    };
  }

  // ─── CSV Parsing ──────────────────────────────────────────────

  parseSiswaCsv(content: string): ParsedSiswaCsvRow[] {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      return []; // Need at least header + 1 data row
    }

    // Parse header
    const header = lines[0]
      .toLowerCase()
      .split(',')
      .map((h) => h.trim());

    const namaIdx = header.findIndex((h) => h === 'nama');
    const nisnIdx = header.findIndex((h) => h === 'nisn');
    const jenisKelaminIdx = header.findIndex((h) =>
      ['jenis_kelamin', 'jeniskelamin', 'jk'].includes(h),
    );
    const tanggalLahirIdx = header.findIndex((h) =>
      ['tanggal_lahir', 'tanggallahir', 'tgl_lahir'].includes(h),
    );
    const orangTuaNamaIdx = header.findIndex((h) =>
      ['orang_tua_nama', 'orangtuanama', 'nama_ortu'].includes(h),
    );
    const orangTuaPhoneIdx = header.findIndex((h) =>
      ['orang_tua_phone', 'orangtuaphone', 'phone_ortu', 'telp_ortu'].includes(h),
    );
    const kelasIdIdx = header.findIndex((h) => ['kelas_id', 'kelasid', 'kelas'].includes(h));

    if (namaIdx === -1) {
      throw new BadRequestException('Format CSV tidak valid. Kolom wajib: nama');
    }

    const rows: ParsedSiswaCsvRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      rows.push({
        nama: cols[namaIdx] || '',
        nisn: nisnIdx >= 0 ? cols[nisnIdx] || '' : '',
        jenisKelamin: jenisKelaminIdx >= 0 ? cols[jenisKelaminIdx] || '' : '',
        tanggalLahir: tanggalLahirIdx >= 0 ? cols[tanggalLahirIdx] || '' : '',
        orangTuaNama: orangTuaNamaIdx >= 0 ? cols[orangTuaNamaIdx] || '' : '',
        orangTuaPhone: orangTuaPhoneIdx >= 0 ? cols[orangTuaPhoneIdx] || '' : '',
        kelasId: kelasIdIdx >= 0 ? cols[kelasIdIdx] || '' : '',
      });
    }

    return rows;
  }

  // ─── Parent Linkage (ADR-002) ─────────────────────────────────

  /**
   * Resolves or creates a parent user per ADR-002:
   * 1. Check if user with phone + role='orang_tua' exists globally
   * 2. If yes → return existing user ID
   * 3. If no → create new user (tenant_id = NULL, no password)
   */
  async resolveOrCreateParent(phone: string, nama: string): Promise<string> {
    // Check globally for existing orang_tua with this phone
    const existing = await this.db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.phone, phone), eq(user.role, 'orang_tua')))
      .limit(1);

    if (existing.length > 0) {
      return existing[0].id;
    }

    // Create new parent user with tenant_id = NULL
    const [created] = await this.db
      .insert(user)
      .values({
        tenantId: null,
        nama,
        phone,
        role: 'orang_tua',
        isActive: true,
        passwordHash: null,
      })
      .returning({ id: user.id });

    return created.id;
  }

  // ─── NISN Validation ──────────────────────────────────────────

  async validateNisnUniqueness(
    nisn: string,
    tenantId: string,
    excludeSiswaId?: string,
  ): Promise<void> {
    const conditions = [
      eq(siswa.nisn, nisn),
      eq(siswa.tenantId, tenantId),
      eq(siswa.status, 'aktif'),
    ];

    if (excludeSiswaId) {
      conditions.push(sql`${siswa.id} != ${excludeSiswaId}`);
    }

    const existing = await this.db
      .select({ id: siswa.id })
      .from(siswa)
      .where(and(...conditions))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('NISN sudah terdaftar di sekolah ini untuk siswa aktif');
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async checkNisnExists(nisn: string, tenantId: string): Promise<boolean> {
    const existing = await this.db
      .select({ id: siswa.id })
      .from(siswa)
      .where(and(eq(siswa.nisn, nisn), eq(siswa.tenantId, tenantId), eq(siswa.status, 'aktif')))
      .limit(1);

    return existing.length > 0;
  }

  /**
   * Check if parent still has active children in this tenant.
   * If not, their access is effectively revoked at the query level
   * (parent won't see this tenant in their JWT tenants[]).
   * This method is primarily for logging/auditing purposes.
   */
  private async checkAndLogParentAccessStatus(
    parentId: string,
    tenantId: string,
  ): Promise<boolean> {
    const activeChildren = await this.db
      .select({ id: siswa.id })
      .from(siswa)
      .where(
        and(
          eq(siswa.orangTuaId, parentId),
          eq(siswa.tenantId, tenantId),
          eq(siswa.status, 'aktif'),
        ),
      )
      .limit(1);

    // Returns true if parent still has access (has active children)
    return activeChildren.length > 0;
  }

  // ─── CSV Import with Preview ──────────────────────────────────

  /**
   * Preview CSV import: parse, validate, detect NISN conflicts.
   * Returns conflicts and preview counts without persisting.
   */
  async importCsvPreview(tenantId: string, csvContent: string) {
    const rows = this.parseSiswaCsv(csvContent);

    if (rows.length === 0) {
      throw new BadRequestException('File CSV kosong atau format tidak valid');
    }

    const conflicts: { nisn: string; nama_csv: string; nama_existing: string }[] = [];

    for (const row of rows) {
      if (row.nisn) {
        const exists = await this.checkNisnExists(row.nisn, tenantId);
        if (exists) {
          const [existing] = await this.db
            .select({ nama: siswa.nama })
            .from(siswa)
            .where(
              and(
                eq(siswa.nisn, row.nisn),
                eq(siswa.tenantId, tenantId),
                eq(siswa.status, 'aktif'),
              ),
            )
            .limit(1);

          conflicts.push({
            nisn: row.nisn,
            nama_csv: row.nama,
            nama_existing: existing?.nama || '',
          });
        }
      }
    }

    return {
      preview_count: rows.length,
      valid_count: rows.length - conflicts.length,
      conflicts,
    };
  }

  /**
   * Execute CSV import with conflict resolutions.
   */
  async importCsvExecute(
    tenantId: string,
    csvContent: string,
    processedByUserId: string,
    resolutions: { nisn: string; action: 'skip' | 'update' }[],
  ) {
    const rows = this.parseSiswaCsv(csvContent);
    const resolutionMap = new Map(resolutions.map((r) => [r.nisn, r.action]));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    const riwayatEntries: RiwayatKelasEntry[] = [];

    for (const row of rows) {
      if (!row.nama) {
        skipped++;
        continue;
      }

      // Check for conflict
      if (row.nisn) {
        const exists = await this.checkNisnExists(row.nisn, tenantId);
        if (exists) {
          const action = resolutionMap.get(row.nisn) || 'skip';
          if (action === 'skip') {
            skipped++;
            continue;
          }
          // action === 'update': update existing record
          await this.db
            .update(siswa)
            .set({
              nama: row.nama,
              jenisKelamin:
                row.jenisKelamin === 'L' || row.jenisKelamin === 'P' ? row.jenisKelamin : undefined,
              tanggalLahir: row.tanggalLahir || undefined,
              kelasId: row.kelasId || undefined,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(siswa.nisn, row.nisn),
                eq(siswa.tenantId, tenantId),
                eq(siswa.status, 'aktif'),
              ),
            );
          updated++;
          continue;
        }
      }

      // Create new student
      const insertData: any = {
        tenantId,
        nama: row.nama,
        nisn: row.nisn || null,
        jenisKelamin:
          row.jenisKelamin === 'L' || row.jenisKelamin === 'P' ? row.jenisKelamin : null,
        tanggalLahir: row.tanggalLahir || null,
        kelasId: row.kelasId || null,
        status: 'aktif',
      };

      // Handle parent linkage
      if (row.orangTuaPhone) {
        const parentId = await this.resolveOrCreateParent(
          row.orangTuaPhone,
          row.orangTuaNama || row.nama,
        );
        insertData.orangTuaId = parentId;
      }

      const [insertedSiswa] = await this.db
        .insert(siswa)
        .values(insertData)
        .returning({ id: siswa.id });

      // Collect riwayat entry if kelasId is non-null
      if (row.kelasId) {
        const [kelasRecord] = await this.db
          .select({ tahunAjaranId: kelas.tahunAjaranId })
          .from(kelas)
          .where(eq(kelas.id, row.kelasId))
          .limit(1);

        if (kelasRecord) {
          riwayatEntries.push({
            tenantId,
            siswaId: insertedSiswa.id,
            kelasId: row.kelasId,
            tahunAjaranId: kelasRecord.tahunAjaranId,
          });
        }
      }

      created++;
    }

    // Batch record all riwayat kelas entries at the end
    if (riwayatEntries.length > 0) {
      await this.riwayatKelasHelper.recordBatch(riwayatEntries);
    }

    return { created, updated, skipped };
  }
}
