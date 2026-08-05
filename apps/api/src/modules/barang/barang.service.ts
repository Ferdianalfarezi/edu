import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import * as ExcelJS from 'exceljs';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import {
  barang,
  kondisiBarangEnum,
  sumberDanaEnum,
  kategoriBarangEnum,
} from '@/drizzle/schema/barang';
import { paginate } from '../../common/utils/paginate';
import { PaginatedResponse } from '../../common/interfaces/pagination.interface';
import { CreateBarangDto } from './dto/create-barang.dto';
import { UpdateBarangDto } from './dto/update-barang.dto';
import { ListBarangQueryDto } from './dto/list-barang-query.dto';
import { BarangResponseDto } from './dto';

/** Hasil import XLSX barang */
export interface ImportResult {
  berhasilDitambahkan: number;
  dilewati: { baris: number; nama: string; alasan: string }[];
}

/**
 * Service layer untuk modul Pencatatan Barang.
 *
 * Requirements: 1.2, 1.3, 1.4, 1.8, 2.2, 2.3, 2.4, 2.6, 3.2, 3.4, 4.2, 4.3, 4.4, 4.6, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10
 */
@Injectable()
export class BarangService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  async create(tenantId: string, dto: CreateBarangDto): Promise<BarangResponseDto> {
    const [created] = await this.db
      .insert(barang)
      .values({
        tenantId,
        nama: dto.nama,
        deskripsi: dto.deskripsi ?? null,
        jumlah: dto.jumlah,
        lokasi: dto.lokasi ?? null,
        kondisiBarang: dto.kondisi_barang,
        sumberDana: dto.sumber_dana,
        kategori: dto.kategori,
      })
      .returning();

    return this.toResponseDto(created);
  }

  async findAll(
    tenantId: string,
    query: ListBarangQueryDto,
  ): Promise<PaginatedResponse<BarangResponseDto>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 15;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(barang.tenantId, tenantId), isNull(barang.deletedAt)];

    if (query.search) {
      conditions.push(ilike(barang.nama, `%${query.search}%`));
    }

    if (query.kondisi_barang) {
      conditions.push(eq(barang.kondisiBarang, query.kondisi_barang));
    }

    if (query.sumber_dana) {
      conditions.push(eq(barang.sumberDana, query.sumber_dana));
    }

    if (query.kategori) {
      conditions.push(eq(barang.kategori, query.kategori));
    }

    const [countResult, dataResult] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(barang)
        .where(and(...conditions)),
      this.db
        .select()
        .from(barang)
        .where(and(...conditions))
        .orderBy(desc(barang.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const totalCount = countResult[0]?.count ?? 0;
    const data = dataResult.map((item) => this.toResponseDto(item));

    return paginate(data, totalCount, page, pageSize);
  }

  async findOne(tenantId: string, id: string): Promise<BarangResponseDto> {
    const [result] = await this.db
      .select()
      .from(barang)
      .where(and(eq(barang.id, id), eq(barang.tenantId, tenantId), isNull(barang.deletedAt)));

    if (!result) {
      throw new NotFoundException('Barang tidak ditemukan');
    }

    return this.toResponseDto(result);
  }

  async update(tenantId: string, id: string, dto: UpdateBarangDto): Promise<BarangResponseDto> {
    // Ensure the barang exists and belongs to this tenant
    await this.findOne(tenantId, id);

    // Whitespace-only detection on nama
    if (dto.nama !== undefined && dto.nama.trim() === '') {
      throw new BadRequestException('Nama barang tidak boleh hanya berisi whitespace');
    }

    const [updated] = await this.db
      .update(barang)
      .set({
        ...(dto.nama !== undefined && { nama: dto.nama }),
        ...(dto.deskripsi !== undefined && { deskripsi: dto.deskripsi }),
        ...(dto.jumlah !== undefined && { jumlah: dto.jumlah }),
        ...(dto.lokasi !== undefined && { lokasi: dto.lokasi }),
        ...(dto.kondisi_barang !== undefined && { kondisiBarang: dto.kondisi_barang }),
        ...(dto.sumber_dana !== undefined && { sumberDana: dto.sumber_dana }),
        ...(dto.kategori !== undefined && { kategori: dto.kategori }),
        updatedAt: new Date(),
      })
      .where(eq(barang.id, id))
      .returning();

    return this.toResponseDto(updated);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    // Ensure the barang exists and belongs to this tenant
    await this.findOne(tenantId, id);

    await this.db.update(barang).set({ deletedAt: new Date() }).where(eq(barang.id, id));
  }

  /**
   * Export semua barang yang cocok dengan filter ke format XLSX.
   * Query tanpa pagination — semua record sesuai filter dikembalikan.
   *
   * Kolom (berurutan): nama | deskripsi | jumlah | lokasi | kondisi_barang | sumber_dana | kategori
   * Requirements: 5.6
   */
  async exportToXlsx(
    filters: Omit<ListBarangQueryDto, 'page' | 'page_size'>,
    tenantId: string,
  ): Promise<Buffer> {
    const conditions = [eq(barang.tenantId, tenantId), isNull(barang.deletedAt)];

    if (filters.search) {
      conditions.push(ilike(barang.nama, `%${filters.search}%`));
    }
    if (filters.kondisi_barang) {
      conditions.push(eq(barang.kondisiBarang, filters.kondisi_barang));
    }
    if (filters.sumber_dana) {
      conditions.push(eq(barang.sumberDana, filters.sumber_dana));
    }
    if (filters.kategori) {
      conditions.push(eq(barang.kategori, filters.kategori));
    }

    const records = await this.db
      .select()
      .from(barang)
      .where(and(...conditions))
      .orderBy(desc(barang.createdAt));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Barang');

    sheet.columns = [
      { header: 'nama', key: 'nama', width: 30 },
      { header: 'deskripsi', key: 'deskripsi', width: 40 },
      { header: 'jumlah', key: 'jumlah', width: 10 },
      { header: 'lokasi', key: 'lokasi', width: 25 },
      { header: 'kondisi_barang', key: 'kondisi_barang', width: 20 },
      { header: 'sumber_dana', key: 'sumber_dana', width: 20 },
      { header: 'kategori', key: 'kategori', width: 15 },
    ];

    for (const record of records) {
      sheet.addRow({
        nama: record.nama,
        deskripsi: record.deskripsi ?? '',
        jumlah: record.jumlah,
        lokasi: record.lokasi ?? '',
        kondisi_barang: record.kondisiBarang ?? '',
        sumber_dana: record.sumberDana ?? '',
        kategori: record.kategori ?? '',
      });
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Import barang dari buffer XLSX.
   *
   * - Baris 1 adalah header, baris 2+ adalah data.
   * - Validasi per baris: enum valid, jumlah integer ≥ 0, duplikat nama (case-insensitive) di-skip.
   * - Baris valid di-insert; baris tidak valid dilaporkan di array `dilewati`.
   *
   * Requirements: 5.7, 5.8, 5.9, 5.10
   */
  async importFromXlsx(buffer: Buffer, tenantId: string): Promise<ImportResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('File XLSX tidak memiliki worksheet');
    }

    // Ambil semua nama barang yang sudah ada di tenant (untuk cek duplikat)
    const existingRecords = await this.db
      .select({ nama: barang.nama })
      .from(barang)
      .where(and(eq(barang.tenantId, tenantId), isNull(barang.deletedAt)));

    const existingNames = new Set(existingRecords.map((r) => r.nama.toLowerCase()));

    const validKondisi = new Set(kondisiBarangEnum.enumValues as string[]);
    const validSumberDana = new Set(sumberDanaEnum.enumValues as string[]);
    const validKategori = new Set(kategoriBarangEnum.enumValues as string[]);

    let berhasilDitambahkan = 0;
    const dilewati: ImportResult['dilewati'] = [];

    // Nama yang berhasil diimport dalam batch ini (untuk cek duplikat intra-file)
    const importedNames = new Set<string>();

    // Mulai dari baris 2 (baris 1 = header)
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // lewati header

      const getCellValue = (colIndex: number): string => {
        const cell = row.getCell(colIndex);
        const raw = cell.value;
        if (raw === null || raw === undefined) return '';
        if (typeof raw === 'object' && 'richText' in raw) {
          // RichText
          return (raw as ExcelJS.CellRichTextValue).richText.map((rt) => rt.text).join('');
        }
        return String(raw).trim();
      };

      const nama = getCellValue(1);
      const deskripsi = getCellValue(2);
      const jumlahRaw = getCellValue(3);
      const lokasi = getCellValue(4);
      const kondisiBarangVal = getCellValue(5);
      const sumberDanaVal = getCellValue(6);
      const kategoriVal = getCellValue(7);

      // Validasi nama tidak boleh kosong
      if (!nama) {
        dilewati.push({
          baris: rowNumber,
          nama: nama || '(kosong)',
          alasan: 'Nama barang tidak boleh kosong',
        });
        return;
      }

      // Validasi duplikat (case-insensitive) — termasuk dalam file yang sama
      const namaLower = nama.toLowerCase();
      if (existingNames.has(namaLower) || importedNames.has(namaLower)) {
        dilewati.push({ baris: rowNumber, nama, alasan: 'Nama barang sudah ada' });
        return;
      }

      // Validasi jumlah
      const jumlah = parseInt(jumlahRaw, 10);
      if (isNaN(jumlah) || !Number.isInteger(jumlah) || jumlah < 0) {
        dilewati.push({ baris: rowNumber, nama, alasan: 'Jumlah harus berupa bilangan bulat ≥ 0' });
        return;
      }

      // Validasi kondisi_barang (wajib diisi saat import)
      if (!kondisiBarangVal || !validKondisi.has(kondisiBarangVal)) {
        dilewati.push({
          baris: rowNumber,
          nama,
          alasan: kondisiBarangVal
            ? `kondisi_barang tidak valid: "${kondisiBarangVal}". Nilai yang diizinkan: bagus, perlu_perbaikan, rusak`
            : 'kondisi_barang wajib diisi. Nilai yang diizinkan: bagus, perlu_perbaikan, rusak',
        });
        return;
      }

      // Validasi sumber_dana (wajib diisi saat import)
      if (!sumberDanaVal || !validSumberDana.has(sumberDanaVal)) {
        dilewati.push({
          baris: rowNumber,
          nama,
          alasan: sumberDanaVal
            ? `sumber_dana tidak valid: "${sumberDanaVal}". Nilai yang diizinkan: yayasan, unit_sekolah, bos`
            : 'sumber_dana wajib diisi. Nilai yang diizinkan: yayasan, unit_sekolah, bos',
        });
        return;
      }

      // Validasi kategori (wajib diisi saat import)
      if (!kategoriVal || !validKategori.has(kategoriVal)) {
        dilewati.push({
          baris: rowNumber,
          nama,
          alasan: kategoriVal
            ? `kategori tidak valid: "${kategoriVal}". Nilai yang diizinkan: peralatan, perlengkapan`
            : 'kategori wajib diisi. Nilai yang diizinkan: peralatan, perlengkapan',
        });
        return;
      }

      // Baris valid — tandai nama agar tidak duplikat dalam file yang sama
      importedNames.add(namaLower);
    });

    // Insert semua baris valid dalam satu batch
    // Kita perlu rebuild data dari sheet untuk batch insert.
    // Catatan: kondisiBarang, sumberDana, kategori dijamin non-null karena
    // sudah divalidasi wajib di pass pertama.
    const rowsToInsert: {
      tenantId: string;
      nama: string;
      deskripsi: string | null;
      jumlah: number;
      lokasi: string | null;
      kondisiBarang: (typeof kondisiBarangEnum.enumValues)[number];
      sumberDana: (typeof sumberDanaEnum.enumValues)[number];
      kategori: (typeof kategoriBarangEnum.enumValues)[number];
    }[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const getCellValue = (colIndex: number): string => {
        const cell = row.getCell(colIndex);
        const raw = cell.value;
        if (raw === null || raw === undefined) return '';
        if (typeof raw === 'object' && 'richText' in raw) {
          return (raw as ExcelJS.CellRichTextValue).richText.map((rt) => rt.text).join('');
        }
        return String(raw).trim();
      };

      const nama = getCellValue(1);
      const namaLower = nama.toLowerCase();

      // Hanya proses baris yang ada di importedNames (artinya lolos validasi)
      if (!importedNames.has(namaLower)) return;
      // Pastikan belum pernah di-insert dalam loop ini (duplikat intra-file sudah dicegah di atas)
      if (!nama) return;

      const deskripsi = getCellValue(2) || null;
      const jumlah = parseInt(getCellValue(3), 10);
      const lokasi = getCellValue(4) || null;
      const kondisiBarangVal = getCellValue(5);
      const sumberDanaVal = getCellValue(6);
      const kategoriVal = getCellValue(7);

      rowsToInsert.push({
        tenantId,
        nama,
        deskripsi,
        jumlah,
        lokasi,
        kondisiBarang: kondisiBarangVal as (typeof kondisiBarangEnum.enumValues)[number],
        sumberDana: sumberDanaVal as (typeof sumberDanaEnum.enumValues)[number],
        kategori: kategoriVal as (typeof kategoriBarangEnum.enumValues)[number],
      });

      // Hapus dari importedNames agar tidak di-insert dua kali jika terjadi duplikat nama berbeda baris
      importedNames.delete(namaLower);
    });

    if (rowsToInsert.length > 0) {
      await this.db.insert(barang).values(rowsToInsert);
      berhasilDitambahkan = rowsToInsert.length;
    }

    return { berhasilDitambahkan, dilewati };
  }

  private toResponseDto(record: typeof barang.$inferSelect): BarangResponseDto {
    return {
      id: record.id,
      nama: record.nama,
      deskripsi: record.deskripsi,
      jumlah: record.jumlah,
      lokasi: record.lokasi ?? null,
      kondisi_barang: record.kondisiBarang ?? null,
      sumber_dana: record.sumberDana ?? null,
      kategori: record.kategori ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
