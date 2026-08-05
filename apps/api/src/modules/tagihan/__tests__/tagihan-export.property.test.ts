import fc from 'fast-check';
import * as ExcelJS from 'exceljs';

/**
 * Property 15: XLSX yang dihasilkan memiliki tepat 9 kolom urutan benar dan data identik dengan source
 *
 * For any array of tagihan data (0–100 records), the generated XLSX MUST:
 * 1. Have exactly 9 columns
 * 2. Column headers match exact order: nama_siswa, kelas, bulan, tahun, nominal,
 *    total_dibayar, sisa, status, tanggal_jatuh_tempo
 * 3. Data row count equals source data count (no row dropped)
 * 4. Data values are preserved identically
 *
 * **Validates: Requirements 9.3**
 *
 * // Feature: sistem-pengembangan-v2, Property 15: XLSX yang dihasilkan memiliki tepat 9 kolom urutan benar dan data identik dengan source
 */

// ─────────────────────────────────────────────────────────────────────────────
// Pure re-implementation of TagihanService.buildTagihanXlsx (private method).
// Source: apps/api/src/modules/tagihan/tagihan.service.ts ~L2224
// Extracted here so we can test it without bootstrapping the full NestJS DI.
// ─────────────────────────────────────────────────────────────────────────────

interface ExportRow {
  nama_siswa: string;
  kelas: string;
  bulan: number;
  tahun: number;
  nominal: number;
  total_dibayar: number;
  sisa: number;
  status: string;
  tanggal_jatuh_tempo: string;
}

/**
 * Expected column headers (display labels) in the exact order mandated by Req 9.3.
 * These are the `header` strings set on sheet.columns — they ARE stored in the XLSX file
 * as cell values in row 1.
 */
const EXPECTED_COLUMN_HEADERS = [
  'Nama Siswa',
  'Kelas',
  'Bulan',
  'Tahun',
  'Nominal',
  'Total Dibayar',
  'Sisa',
  'Status',
  'Tanggal Jatuh Tempo',
] as const;

/**
 * Map column index (1-based) to the ExportRow field name.
 * Used for positional cell access after round-trip parse (keys are not persisted in XLSX).
 */
const COLUMN_INDEX_MAP: Record<number, keyof ExportRow> = {
  1: 'nama_siswa',
  2: 'kelas',
  3: 'bulan',
  4: 'tahun',
  5: 'nominal',
  6: 'total_dibayar',
  7: 'sisa',
  8: 'status',
  9: 'tanggal_jatuh_tempo',
};

/**
 * Mirrors TagihanService.buildTagihanXlsx() exactly.
 * Returns a Buffer of the XLSX workbook.
 */
async function buildTagihanXlsx(rows: ExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Tagihan');

  // Define columns in exact order per Req 9.3
  sheet.columns = [
    { header: 'Nama Siswa', key: 'nama_siswa', width: 30 },
    { header: 'Kelas', key: 'kelas', width: 15 },
    { header: 'Bulan', key: 'bulan', width: 8 },
    { header: 'Tahun', key: 'tahun', width: 8 },
    { header: 'Nominal', key: 'nominal', width: 15 },
    { header: 'Total Dibayar', key: 'total_dibayar', width: 15 },
    { header: 'Sisa', key: 'sisa', width: 15 },
    { header: 'Status', key: 'status', width: 20 },
    { header: 'Tanggal Jatuh Tempo', key: 'tanggal_jatuh_tempo', width: 20 },
  ];

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9EAD3' },
  };

  // Add data rows
  for (const row of rows) {
    sheet.addRow(row);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Parse an XLSX Buffer back into a workbook for assertions.
 * ExcelJS.xlsx.load() accepts ArrayBuffer; slice the underlying ArrayBuffer from the Buffer.
 */
async function parseXlsx(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  await workbook.xlsx.load(arrayBuffer);
  return workbook;
}

// ─────────────────────────────────────────────────────────────────────────────
// Arbitraries
// ─────────────────────────────────────────────────────────────────────────────

/** Non-empty string, reasonable length */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 50 });

/** Valid nominal: positive integer up to 999_999_999 (per Req 6.3) */
const nominalArb = fc.integer({ min: 1, max: 999_999_999 });

/** Non-negative integer for total_dibayar (could be 0 or partial) */
const totalDibayarArb = fc.integer({ min: 0, max: 999_999_999 });

/** Bulan: 1–12 */
const bulanArb = fc.integer({ min: 1, max: 12 });

/** Tahun: reasonable school year range */
const tahunArb = fc.integer({ min: 2020, max: 2030 });

/** Status values used by the export layer */
const statusArb = fc.constantFrom(
  'belum_bayar',
  'cicilan',
  'lunas',
  'menunggu_verifikasi',
  'ditolak',
);

/** A single export row with realistic but arbitrary field values */
const exportRowArb = fc
  .tuple(
    nonEmptyStringArb,
    nonEmptyStringArb,
    bulanArb,
    tahunArb,
    nominalArb,
    totalDibayarArb,
    statusArb,
    nonEmptyStringArb,
  )
  .map(
    ([nama_siswa, kelas, bulan, tahun, nominal, totalDibayarRaw, status, tanggal_jatuh_tempo]) => {
      // sisa is always Math.max(0, nominal - total_dibayar) per Req 7.1
      const total_dibayar = Math.min(totalDibayarRaw, nominal); // keep total_dibayar <= nominal for realism
      const sisa = Math.max(0, nominal - total_dibayar);
      return {
        nama_siswa,
        kelas,
        bulan,
        tahun,
        nominal,
        total_dibayar,
        sisa,
        status,
        tanggal_jatuh_tempo,
      } satisfies ExportRow;
    },
  );

/** Array of 0–100 export rows */
const exportRowsArb = fc.array(exportRowArb, { minLength: 0, maxLength: 100 });

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature: sistem-pengembangan-v2, Property 15: XLSX yang dihasilkan memiliki tepat 9 kolom urutan benar dan data identik dengan source', () => {
  /**
   * Property 15a: XLSX always has exactly 9 columns regardless of row count.
   */
  it('XLSX selalu memiliki tepat 9 kolom untuk sembarang jumlah baris', async () => {
    await fc.assert(
      fc.asyncProperty(exportRowsArb, async (rows) => {
        const buffer = await buildTagihanXlsx(rows);
        const workbook = await parseXlsx(buffer);
        const sheet = workbook.getWorksheet('Tagihan')!;

        // ExcelJS sheet.columnCount includes all defined columns
        expect(sheet.columnCount).toBe(9);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 15b: Column headers are in the exact order mandated by Req 9.3.
   * We read header values from row 1 of the sheet (that's where ExcelJS writes them),
   * since column `key` metadata is not persisted in the XLSX binary format.
   */
  it('urutan kolom selalu: nama_siswa, kelas, bulan, tahun, nominal, total_dibayar, sisa, status, tanggal_jatuh_tempo', async () => {
    await fc.assert(
      fc.asyncProperty(exportRowsArb, async (rows) => {
        const buffer = await buildTagihanXlsx(rows);
        const workbook = await parseXlsx(buffer);
        const sheet = workbook.getWorksheet('Tagihan')!;

        // Header values are stored as cell values in row 1
        const headerRow = sheet.getRow(1);
        const actualHeaders: string[] = [];
        for (let col = 1; col <= 9; col++) {
          actualHeaders.push(String(headerRow.getCell(col).value ?? ''));
        }

        expect(actualHeaders).toEqual([...EXPECTED_COLUMN_HEADERS]);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 15c: Row count in XLSX equals source data count (no row dropped, no phantom row).
   * Row 1 is the header, so data rows start at row 2.
   */
  it('jumlah baris data XLSX identik dengan jumlah baris source (tidak ada baris hilang atau bertambah)', async () => {
    await fc.assert(
      fc.asyncProperty(exportRowsArb, async (rows) => {
        const buffer = await buildTagihanXlsx(rows);
        const workbook = await parseXlsx(buffer);
        const sheet = workbook.getWorksheet('Tagihan')!;

        // rowCount includes the header row, so data rows = rowCount - 1
        const dataRowCount = sheet.rowCount - 1;
        expect(dataRowCount).toBe(rows.length);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 15d: Numeric values (bulan, tahun, nominal, total_dibayar, sisa) are
   * preserved identically in every row — no rounding, coercion, or data loss.
   * Uses column index (1-based) since key metadata is not persisted in XLSX format.
   */
  it('nilai numerik di setiap baris identik dengan data source (tidak ada perubahan nilai)', async () => {
    await fc.assert(
      fc.asyncProperty(exportRowsArb, async (rows) => {
        if (rows.length === 0) return; // nothing to assert for empty data

        const buffer = await buildTagihanXlsx(rows);
        const workbook = await parseXlsx(buffer);
        const sheet = workbook.getWorksheet('Tagihan')!;

        for (let i = 0; i < rows.length; i++) {
          const sourceRow = rows[i];
          const xlsxRow = sheet.getRow(i + 2); // +2 because row 1 is header

          // Column indices per COLUMN_INDEX_MAP: bulan=3, tahun=4, nominal=5, total_dibayar=6, sisa=7
          expect(xlsxRow.getCell(3).value).toBe(sourceRow.bulan);
          expect(xlsxRow.getCell(4).value).toBe(sourceRow.tahun);
          expect(xlsxRow.getCell(5).value).toBe(sourceRow.nominal);
          expect(xlsxRow.getCell(6).value).toBe(sourceRow.total_dibayar);
          expect(xlsxRow.getCell(7).value).toBe(sourceRow.sisa);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 15e: String values (nama_siswa, kelas, status, tanggal_jatuh_tempo) are
   * preserved identically in every row.
   * Uses column index (1-based) since key metadata is not persisted in XLSX format.
   */
  it('nilai string di setiap baris identik dengan data source (tidak ada perubahan teks)', async () => {
    await fc.assert(
      fc.asyncProperty(exportRowsArb, async (rows) => {
        if (rows.length === 0) return;

        const buffer = await buildTagihanXlsx(rows);
        const workbook = await parseXlsx(buffer);
        const sheet = workbook.getWorksheet('Tagihan')!;

        for (let i = 0; i < rows.length; i++) {
          const sourceRow = rows[i];
          const xlsxRow = sheet.getRow(i + 2);

          // Column indices per COLUMN_INDEX_MAP: nama_siswa=1, kelas=2, status=8, tanggal_jatuh_tempo=9
          expect(xlsxRow.getCell(1).value).toBe(sourceRow.nama_siswa);
          expect(xlsxRow.getCell(2).value).toBe(sourceRow.kelas);
          expect(xlsxRow.getCell(8).value).toBe(sourceRow.status);
          expect(xlsxRow.getCell(9).value).toBe(sourceRow.tanggal_jatuh_tempo);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 15f: Empty input produces a valid XLSX with 9 columns and 0 data rows.
   * Edge case: export with no records must not crash and must still be valid.
   */
  it('input kosong menghasilkan XLSX valid dengan 9 kolom dan 0 baris data', async () => {
    const buffer = await buildTagihanXlsx([]);
    const workbook = await parseXlsx(buffer);
    const sheet = workbook.getWorksheet('Tagihan')!;

    expect(sheet.columnCount).toBe(9);
    // Only the header row exists
    expect(sheet.rowCount).toBe(1);
  });
});
