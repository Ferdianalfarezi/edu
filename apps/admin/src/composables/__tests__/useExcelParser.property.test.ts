// Feature: tenant-excel-onboarding
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import * as XLSX from 'xlsx';
import { validateFileExtension, validateFileSize, parseExcelFile } from '../useExcelParser';

// ---------------------------------------------------------------------------
// Helpers for building synthetic Excel files used by per-row property tests
// ---------------------------------------------------------------------------

/**
 * Build a real XLSX buffer containing all 5 required sheets.
 * `guruStaffRows` replaces the Guru & Staff data rows (header is always prepended).
 * `sppRows` replaces the SPP Bulanan data rows (header is always prepended).
 * Other sheets are populated with a single valid dummy row so the file is
 * considered "successfully parsed" (Requirement 1.4).
 */
function buildXlsxFile(opts: {
  guruStaffRows?: (string | number | null)[][];
  sppRows?: (string | number | null)[][];
}): File {
  const wb = XLSX.utils.book_new();

  // Sheet: Siswa — one valid dummy row
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      [
        'nama',
        'nisn',
        'kelas',
        'jenis_kelamin',
        'tanggal_lahir',
        'alamat',
        'nama_wali',
        'telepon_wali',
      ],
      [
        'Budi Santoso',
        '1234567890',
        '7A',
        'L',
        '2010-01-01',
        'Jl. Merdeka 1',
        'Pak Budi',
        '081234567890',
      ],
    ]),
    'Siswa',
  );

  // Sheet: Kelas — one valid dummy row
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['tingkat_7'], ['7A']]), 'Kelas');

  // Sheet: Mata Pelajaran — one valid dummy row
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['mata_pelajaran', 'kode'],
      ['Matematika', 'MTK'],
    ]),
    'Mata Pelajaran',
  );

  // Sheet: Guru & Staff
  const guruData =
    opts.guruStaffRows !== undefined
      ? [['nama', 'email', 'telepon', 'role'], ...opts.guruStaffRows]
      : [
          ['nama', 'email', 'telepon', 'role'],
          ['Guru Valid', 'valid@sekolah.com', '081111111111', 'guru'],
        ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(guruData), 'Guru & Staff');

  // Sheet: SPP Bulanan
  const sppData =
    opts.sppRows !== undefined
      ? [['tingkat', 'nominal'], ...opts.sppRows]
      : [
          ['tingkat', 'nominal'],
          [7, 500000],
        ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sppData), 'SPP Bulanan');

  const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
  return new File([u8], 'test.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ---------------------------------------------------------------------------
// Properties 1 & 2 — File validation (extension + size)
// ---------------------------------------------------------------------------

describe('useExcelParser — file validation property tests', () => {
  // Feature: tenant-excel-onboarding, Property 1: Extension validation rejects non-Excel filenames
  it('Property 1: rejects filenames not ending with .xlsx or .xls (case-insensitive)', () => {
    fc.assert(
      fc.property(
        fc
          .string()
          .filter((s) => !s.toLowerCase().endsWith('.xlsx') && !s.toLowerCase().endsWith('.xls')),
        (filename) => {
          const result = validateFileExtension(filename);
          expect(result.isValid).toBe(false);
          expect(result.error).toContain('Format file tidak valid');
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 1b: valid extensions always pass
  it('Property 1b: accepts .xlsx and .xls filenames (case-insensitive)', () => {
    const validExtensions = ['.xlsx', '.xls', '.XLSX', '.XLS', '.Xlsx', '.Xls'];
    for (const ext of validExtensions) {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).map((s) => s.replace(/\./g, '') + ext),
          (filename) => {
            const result = validateFileExtension(filename);
            expect(result.isValid).toBe(true);
          },
        ),
        { numRuns: 50 },
      );
    }
  });

  // Feature: tenant-excel-onboarding, Property 2: File size validation rejects oversized files
  it('Property 2: rejects files strictly larger than 10MB (10_485_760 bytes)', () => {
    const MAX_SIZE = 10_485_760;
    fc.assert(
      fc.property(fc.integer({ min: MAX_SIZE + 1, max: MAX_SIZE * 10 }), (sizeBytes) => {
        const result = validateFileSize(sizeBytes);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('10MB');
      }),
      { numRuns: 100 },
    );
  });

  // Property 2b: files at or below limit always pass
  it('Property 2b: accepts files at or below 10MB', () => {
    const MAX_SIZE = 10_485_760;
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_SIZE }), (sizeBytes) => {
        const result = validateFileSize(sizeBytes);
        expect(result.isValid).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Properties 5, 6, 7 — Per-row validation
// ---------------------------------------------------------------------------

const VALID_ROLES = ['admin', 'guru', 'kepala_sekolah', 'bendahara'] as const;

describe('useExcelParser — per-row validation property tests', () => {
  // Feature: tenant-excel-onboarding, Property 5: Invalid guru_staff roles are marked and all valid rows pass through
  // Validates: Requirements 2.8
  it('Property 5a: rows with role outside valid set are marked invalid', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string().filter((r) => !(VALID_ROLES as readonly string[]).includes(r.trim())),
        async (invalidRole) => {
          const file = buildXlsxFile({
            guruStaffRows: [['Guru Test', 'test@sekolah.com', '081234567890', invalidRole]],
          });
          const result = await parseExcelFile(file);
          // The file is valid overall (other sheets have data)
          expect(result.data).not.toBeNull();
          const row = result.data!.guruStaff[0];
          expect(row.isValid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: tenant-excel-onboarding, Property 5b: rows with valid role are NOT marked invalid due to role
  // Validates: Requirements 2.8
  it('Property 5b: rows with a valid role and valid email are NOT marked invalid', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...VALID_ROLES), async (validRole) => {
        const file = buildXlsxFile({
          guruStaffRows: [['Guru Valid', 'guru@sekolah.com', '081234567890', validRole]],
        });
        const result = await parseExcelFile(file);
        expect(result.data).not.toBeNull();
        const row = result.data!.guruStaff[0];
        expect(row.isValid).toBe(true);
      }),
      { numRuns: 20 },
    );
  });

  // Feature: tenant-excel-onboarding, Property 5c: mixed rows — invalid roles marked, valid rows pass through
  // Validates: Requirements 2.8
  it('Property 5c: in a mixed list, exactly the rows with invalid roles are marked invalid', async () => {
    // Arbitrarily mix valid and invalid role rows
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            role: fc.oneof(
              fc.constantFrom(...VALID_ROLES),
              fc
                .string({ minLength: 1 })
                .filter((r) => !(VALID_ROLES as readonly string[]).includes(r)),
            ),
            isValidRole: fc.boolean(),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        async (inputSpec) => {
          // Override isValidRole to reflect actual role validity
          const rows = inputSpec.map((spec) => ({
            role: spec.role,
            isValidRole: (VALID_ROLES as readonly string[]).includes(spec.role),
          }));

          const guruStaffRows = rows.map((r) => [
            'Nama Guru',
            'valid@sekolah.com',
            '081234567890',
            r.role,
          ]);

          const file = buildXlsxFile({ guruStaffRows });
          const result = await parseExcelFile(file);
          expect(result.data).not.toBeNull();

          const parsed = result.data!.guruStaff;
          expect(parsed).toHaveLength(rows.length);

          rows.forEach((spec, i) => {
            if (!spec.isValidRole) {
              // Invalid role → row must be marked invalid
              expect(parsed[i].isValid).toBe(false);
            }
            // Valid role with valid email → row must be valid
            // (we set email to 'valid@sekolah.com' for all, so role is the only differentiator)
            if (spec.isValidRole) {
              expect(parsed[i].isValid).toBe(true);
            }
          });
        },
      ),
      { numRuns: 50 },
    );
  });

  // Feature: tenant-excel-onboarding, Property 6: Invalid email format marks the row invalid
  // Validates: Requirements 2.9
  it('Property 6a: email without "@" followed by at least one "." marks the row invalid', async () => {
    // Emails that don't satisfy: has '@' AND domain after '@' contains '.'
    const invalidEmailArb = fc.string().filter((email) => {
      const trimmed = email.trim();
      if (trimmed === '') return false; // empty email also invalid but tested separately
      const atIdx = trimmed.indexOf('@');
      if (atIdx === -1) return true; // no '@' → invalid
      const domain = trimmed.slice(atIdx + 1);
      return !domain.includes('.'); // '@' present but domain has no '.' → invalid
    });

    await fc.assert(
      fc.asyncProperty(invalidEmailArb, async (invalidEmail) => {
        const file = buildXlsxFile({
          guruStaffRows: [['Guru Test', invalidEmail, '081234567890', 'guru']],
        });
        const result = await parseExcelFile(file);
        expect(result.data).not.toBeNull();
        const row = result.data!.guruStaff[0];
        expect(row.isValid).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: tenant-excel-onboarding, Property 6b: valid email format with '@' and domain '.' passes
  // Validates: Requirements 2.9
  it('Property 6b: email with "@" and at least one "." in domain is NOT marked invalid due to email', async () => {
    // Build emails that satisfy: has '@' and domain after '@' contains '.'
    const validEmailArb = fc
      .tuple(
        fc.string({ minLength: 1 }).map((s) => s.replace(/[@.]/g, 'x')),
        fc.string({ minLength: 1 }).map((s) => s.replace(/[@.]/g, 'x')),
        fc.string({ minLength: 1 }).map((s) => s.replace(/[@.]/g, 'x')),
      )
      .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

    await fc.assert(
      fc.asyncProperty(validEmailArb, async (validEmail) => {
        const file = buildXlsxFile({
          guruStaffRows: [['Guru Valid', validEmail, '081234567890', 'guru']],
        });
        const result = await parseExcelFile(file);
        expect(result.data).not.toBeNull();
        const row = result.data!.guruStaff[0];
        // Row is valid if and only if email is valid (role is valid 'guru')
        expect(row.isValid).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: tenant-excel-onboarding, Property 7: Invalid SPP nominal marks the row invalid
  // Validates: Requirements 2.10
  it('Property 7a: SPP rows with non-numeric nominal are marked invalid', async () => {
    // Strings that produce null after stripping non-digits (i.e., purely non-digit)
    const nonNumericNominalArb = fc.string().filter((s) => s.replace(/\D/g, '') === '');

    await fc.assert(
      fc.asyncProperty(nonNumericNominalArb, async (badNominal) => {
        const file = buildXlsxFile({
          sppRows: [[7, badNominal]],
        });
        const result = await parseExcelFile(file);
        expect(result.data).not.toBeNull();
        const row = result.data!.sppBulanan[0];
        expect(row.isValid).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: tenant-excel-onboarding, Property 7b: SPP rows with nominal <= 0 are marked invalid
  // Validates: Requirements 2.10
  it('Property 7b: SPP rows with nominal <= 0 are marked invalid', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: -100_000, max: 0 }), async (zeroOrNegNominal) => {
        const file = buildXlsxFile({
          sppRows: [[7, zeroOrNegNominal]],
        });
        const result = await parseExcelFile(file);
        expect(result.data).not.toBeNull();
        const row = result.data!.sppBulanan[0];
        expect(row.isValid).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: tenant-excel-onboarding, Property 7c: SPP rows with nominal > 0 are valid
  // Validates: Requirements 2.10
  it('Property 7c: SPP rows with positive numeric nominal and valid tingkat are valid', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 100_000_000 }), async (posNominal) => {
        const file = buildXlsxFile({
          sppRows: [[7, posNominal]],
        });
        const result = await parseExcelFile(file);
        expect(result.data).not.toBeNull();
        const row = result.data!.sppBulanan[0];
        expect(row.isValid).toBe(true);
        expect(row.nominal).toBe(posNominal);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers for Property 4 and 8 — workbooks with configurable sheets / cells
// ---------------------------------------------------------------------------

const ALL_REQUIRED_SHEETS = [
  'Siswa',
  'Kelas',
  'Mata Pelajaran',
  'Guru & Staff',
  'SPP Bulanan',
] as const;
type RequiredSheetName = (typeof ALL_REQUIRED_SHEETS)[number];

/**
 * Convert a XLSX.write 'array' result to a File safely.
 * We pass the Uint8Array directly (not .buffer) to avoid subview/offset issues.
 */
function u8ToFile(u8: Uint8Array, name = 'test.xlsx'): File {
  return new File([u8], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Build an XLSX File that only contains the given subset of the 5 required
 * sheets (each sheet gets a single placeholder row so SheetJS doesn't crash).
 */
function buildWorkbookWithSheets(presentSheets: string[]): File {
  const wb = XLSX.utils.book_new();
  // SheetJS requires at least one sheet in the workbook
  const sheetsToAdd = presentSheets.length > 0 ? presentSheets : ['__placeholder__'];
  for (const name of sheetsToAdd) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['header']]), name);
  }
  const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
  return u8ToFile(u8);
}

/**
 * Build an XLSX File with all 5 required sheets. Each sheet's rows are
 * supplied as an array-of-arrays so callers can inject arbitrary cell values.
 */
function buildFullWorkbook(sheetData: Record<RequiredSheetName, unknown[][]>): File {
  const wb = XLSX.utils.book_new();
  for (const name of ALL_REQUIRED_SHEETS) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetData[name]), name);
  }
  const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
  return u8ToFile(u8);
}

// ---------------------------------------------------------------------------
// Property 4 — Missing sheet detection lists exactly the absent sheets
// ---------------------------------------------------------------------------

describe('useExcelParser — Property 4: missing sheet detection', () => {
  /**
   * Feature: tenant-excel-onboarding, Property 4: Missing sheet detection lists exactly the absent sheets
   * Validates: Requirements 2.2
   *
   * For any non-empty subset S of the 5 required sheet names absent from the
   * workbook, parseExcelFile SHALL return an error listing exactly the sheets
   * in S — no more, no fewer.
   */
  it(
    'Property 4: error lists exactly the absent sheets — no more, no fewer',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Pick a non-empty subset of required sheet names to omit
          fc
            .subarray([...ALL_REQUIRED_SHEETS] as string[], { minLength: 1, maxLength: 5 })
            .map((absent) => ({
              absent,
              present: ([...ALL_REQUIRED_SHEETS] as string[]).filter((s) => !absent.includes(s)),
            })),
          async ({ absent, present }) => {
            const file = buildWorkbookWithSheets(present);
            const result = await parseExcelFile(file);

            // Must be invalid with at least one fatal error
            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);

            const errorText = result.errors.join(' ');

            // Locate the missing-sheet error segment
            const match = errorText.match(/Sheet yang diperlukan tidak ditemukan:\s*(.+)/);
            expect(match).not.toBeNull();

            if (match) {
              const listedSheets = match[1].split(',').map((s) => s.trim());

              // Every listed sheet must be in the absent set (no false positives)
              for (const listed of listedSheets) {
                expect(absent).toContain(listed);
              }

              // Every absent sheet must appear in the listed set (no false negatives)
              for (const absentSheet of absent) {
                expect(listedSheets).toContain(absentSheet);
              }
            }
          },
        ),
        { numRuns: 50 },
      );
    },
    { timeout: 30_000 },
  );

  it('Property 4b: workbook with all 5 sheets present does not trigger missing-sheet error', async () => {
    const file = buildWorkbookWithSheets([...ALL_REQUIRED_SHEETS]);
    const result = await parseExcelFile(file);

    const hasMissingSheetError = result.errors.some((e) =>
      e.includes('Sheet yang diperlukan tidak ditemukan'),
    );
    expect(hasMissingSheetError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Property 8 — String values are trimmed before validation and storage
// ---------------------------------------------------------------------------

describe('useExcelParser — Property 8: string values trimmed before validation', () => {
  /**
   * Feature: tenant-excel-onboarding, Property 8: String values are trimmed before validation
   * Validates: Requirements 2.12
   *
   * For any string cell value with arbitrary leading/trailing whitespace, the
   * parsed result SHALL equal the trimmed version of that string.
   */

  // Arbitrary: a string with 1–30 non-whitespace characters, surrounded by
  // 0–5 leading spaces and 0–5 trailing spaces.
  const paddedStringArb = fc
    .tuple(
      fc.stringMatching(/^[^\s]+$/, { minLength: 1, maxLength: 20 }),
      fc.nat({ max: 5 }),
      fc.nat({ max: 5 }),
    )
    .map(([core, leading, trailing]) => ({
      padded: ' '.repeat(leading) + core + ' '.repeat(trailing),
      trimmed: core,
    }));

  it(
    'Property 8a: Siswa — nama is stored as trimmed value',
    async () => {
      await fc.assert(
        fc.asyncProperty(paddedStringArb, async ({ padded, trimmed }) => {
          const file = buildFullWorkbook({
            Siswa: [['nama'], [padded]],
            Kelas: [['tingkat_1'], ['1A']],
            'Mata Pelajaran': [['mata_pelajaran'], ['Matematika']],
            'Guru & Staff': [
              ['nama', 'email', 'role'],
              ['Guru', 'guru@sekolah.com', 'guru'],
            ],
            'SPP Bulanan': [
              ['tingkat', 'nominal'],
              [1, 500000],
            ],
          });
          const result = await parseExcelFile(file);

          expect(result.errors).toHaveLength(0);
          expect(result.data).not.toBeNull();
          const siswa = result.data!.siswa;
          expect(siswa.length).toBeGreaterThan(0);
          expect(siswa[0].nama).toBe(trimmed);
        }),
        { numRuns: 50 },
      );
    },
    { timeout: 30_000 },
  );

  it(
    'Property 8b: Siswa — optional string fields (nisn, kelas, alamat) are trimmed when present',
    async () => {
      await fc.assert(
        fc.asyncProperty(paddedStringArb, async ({ padded: paddedNisn, trimmed: trimmedNisn }) => {
          const file = buildFullWorkbook({
            Siswa: [
              ['nama', 'nisn', 'kelas', 'alamat'],
              ['Andi', paddedNisn, '  1A  ', '  Jl. Merdeka  '],
            ],
            Kelas: [['tingkat_1'], ['1A']],
            'Mata Pelajaran': [['mata_pelajaran'], ['Matematika']],
            'Guru & Staff': [
              ['nama', 'email', 'role'],
              ['Guru', 'guru@sekolah.com', 'guru'],
            ],
            'SPP Bulanan': [
              ['tingkat', 'nominal'],
              [1, 500000],
            ],
          });
          const result = await parseExcelFile(file);

          expect(result.errors).toHaveLength(0);
          expect(result.data).not.toBeNull();
          const siswa = result.data!.siswa;
          expect(siswa.length).toBeGreaterThan(0);

          if (siswa[0].nisn !== undefined) {
            expect(siswa[0].nisn).toBe(trimmedNisn);
          }
          if (siswa[0].kelas !== undefined) {
            expect(siswa[0].kelas).toBe('1A');
          }
          if (siswa[0].alamat !== undefined) {
            expect(siswa[0].alamat).toBe('Jl. Merdeka');
          }
        }),
        { numRuns: 50 },
      );
    },
    { timeout: 30_000 },
  );

  it(
    'Property 8c: Mata Pelajaran — nama and kode are trimmed',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          paddedStringArb,
          paddedStringArb,
          async (
            { padded: paddedNama, trimmed: trimmedNama },
            { padded: paddedKode, trimmed: trimmedKode },
          ) => {
            const file = buildFullWorkbook({
              Siswa: [['nama'], ['Andi']],
              Kelas: [['tingkat_1'], ['1A']],
              'Mata Pelajaran': [
                ['mata_pelajaran', 'kode'],
                [paddedNama, paddedKode],
              ],
              'Guru & Staff': [
                ['nama', 'email', 'role'],
                ['Guru', 'guru@sekolah.com', 'guru'],
              ],
              'SPP Bulanan': [
                ['tingkat', 'nominal'],
                [1, 500000],
              ],
            });
            const result = await parseExcelFile(file);

            expect(result.errors).toHaveLength(0);
            expect(result.data).not.toBeNull();
            const mp = result.data!.mataPelajaran;
            expect(mp.length).toBeGreaterThan(0);
            expect(mp[0].nama).toBe(trimmedNama);
            if (mp[0].kode !== undefined) {
              expect(mp[0].kode).toBe(trimmedKode);
            }
          },
        ),
        { numRuns: 50 },
      );
    },
    { timeout: 30_000 },
  );

  it(
    'Property 8d: Guru & Staff — nama and email are trimmed (with fixed whitespace-padded email)',
    async () => {
      // Use a fixed valid email with padding; only vary the nama padding.
      await fc.assert(
        fc.asyncProperty(
          // padded nama using only letters so it never conflicts with valid-role check
          fc
            .tuple(
              fc
                .stringMatching(/^[a-zA-Z ]+$/, { minLength: 1, maxLength: 20 })
                .map((s) => s.trim())
                .filter((s) => s.length > 0),
              fc.nat({ max: 4 }),
              fc.nat({ max: 4 }),
            )
            .map(([core, l, r]) => ({
              padded: ' '.repeat(l) + core + ' '.repeat(r),
              trimmed: core,
            })),
          async ({ padded: paddedNama, trimmed: trimmedNama }) => {
            const file = buildFullWorkbook({
              Siswa: [['nama'], ['Andi']],
              Kelas: [['tingkat_1'], ['1A']],
              'Mata Pelajaran': [['mata_pelajaran'], ['Matematika']],
              'Guru & Staff': [
                ['nama', 'email', 'role'],
                [paddedNama, '  guru@sekolah.com  ', 'guru'],
              ],
              'SPP Bulanan': [
                ['tingkat', 'nominal'],
                [1, 500000],
              ],
            });
            const result = await parseExcelFile(file);

            expect(result.errors).toHaveLength(0);
            expect(result.data).not.toBeNull();
            const guruStaff = result.data!.guruStaff;
            expect(guruStaff.length).toBeGreaterThan(0);
            expect(guruStaff[0].nama).toBe(trimmedNama);
            expect(guruStaff[0].email).toBe('guru@sekolah.com');
          },
        ),
        { numRuns: 50 },
      );
    },
    { timeout: 30_000 },
  );
});

// ---------------------------------------------------------------------------
// Property 22 — tingkat_N column pattern correctly extracts tingkat values
// ---------------------------------------------------------------------------

describe('useExcelParser — Property 22: tingkat_N column pattern', () => {
  /**
   * Feature: tenant-excel-onboarding, Property 22: tingkat_N column pattern correctly extracts tingkat values
   * Validates: Requirements 2.4, 6.3
   *
   * For any set of column names in Sheet_Kelas:
   *   - Only columns matching /^tingkat_(\d+)$/ with N between 1 and 12 (inclusive)
   *     SHALL produce kelas records, with tingkat = N
   *   - Non-matching columns (case variants, out-of-range N, malformed) SHALL produce no kelas records
   */

  /**
   * Helper: build a File with all 5 required sheets where Sheet_Kelas has
   * exactly the given columns (as header row) and a single data row with one
   * cell value per column.
   */
  function buildXlsxWithKelasColumns(columns: string[], cellValues: string[]): File {
    const wb = XLSX.utils.book_new();

    // Siswa — minimal valid row
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['nama'], ['Budi']]), 'Siswa');

    // Kelas — the sheet under test
    const kelasAoa: unknown[][] = [columns, cellValues];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kelasAoa), 'Kelas');

    // Mata Pelajaran — minimal valid row
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['mata_pelajaran', 'kode'],
        ['Matematika', 'MTK'],
      ]),
      'Mata Pelajaran',
    );

    // Guru & Staff — minimal valid row
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['nama', 'email', 'telepon', 'role'],
        ['Guru Valid', 'guru@sekolah.com', '081111111111', 'guru'],
      ]),
      'Guru & Staff',
    );

    // SPP Bulanan — minimal valid row
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['tingkat', 'nominal'],
        [7, 500000],
      ]),
      'SPP Bulanan',
    );

    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
    return new File([u8], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  // ---------------------------------------------------------------------------
  // 22a: Valid tingkat_N columns (N = 1..12) produce kelas records with tingkat = N
  // ---------------------------------------------------------------------------
  it(
    'Property 22a: valid tingkat_N columns (N=1..12) produce kelas records with tingkat = N',
    async () => {
      // For any N in 1..12, a column named "tingkat_N" with a non-empty cell
      // must produce exactly one ParsedKelas with tingkat = N and correct nama.
      await fc.assert(
        fc.asyncProperty(
          // Pick any N between 1 and 12
          fc.integer({ min: 1, max: 12 }),
          // Pick a non-empty class name (no leading/trailing spaces for simplicity)
          fc
            .stringMatching(/^[^\s][^\n\r]*$/, { minLength: 1, maxLength: 30 })
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
          async (n, kelasNama) => {
            const colName = `tingkat_${n}`;
            const file = buildXlsxWithKelasColumns([colName], [kelasNama]);
            const result = await parseExcelFile(file);

            expect(result.errors).toHaveLength(0);
            expect(result.data).not.toBeNull();

            const kelasList = result.data!.kelas;
            expect(kelasList.length).toBeGreaterThanOrEqual(1);

            // Every record from this column must have tingkat = N
            const fromThisCol = kelasList.filter((k) => k.tingkat === n);
            expect(fromThisCol.length).toBe(1);
            expect(fromThisCol[0].nama).toBe(kelasNama);
          },
        ),
        { numRuns: 100 },
      );
    },
    { timeout: 60_000 },
  );

  // ---------------------------------------------------------------------------
  // 22b: All 12 valid columns together produce records each with correct tingkat
  // ---------------------------------------------------------------------------
  it(
    'Property 22b: multiple valid tingkat_N columns each produce records with the correct tingkat value',
    async () => {
      // Generate any non-empty subset of {1..12} and verify each column's
      // records carry the right tingkat value.
      await fc.assert(
        fc.asyncProperty(
          // Pick a non-empty subset of tingkat values 1..12
          fc.subarray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], { minLength: 1, maxLength: 12 }),
          async (tingkatValues) => {
            const columns = tingkatValues.map((n) => `tingkat_${n}`);
            const cellValues = tingkatValues.map((n) => `Kelas-${n}A`);

            const file = buildXlsxWithKelasColumns(columns, cellValues);
            const result = await parseExcelFile(file);

            expect(result.errors).toHaveLength(0);
            expect(result.data).not.toBeNull();

            const kelasList = result.data!.kelas;
            expect(kelasList).toHaveLength(tingkatValues.length);

            // Each expected (tingkat, nama) pair must appear in the output
            tingkatValues.forEach((n, i) => {
              const match = kelasList.find((k) => k.tingkat === n);
              expect(match).toBeDefined();
              expect(match!.nama).toBe(cellValues[i]);
            });
          },
        ),
        { numRuns: 100 },
      );
    },
    { timeout: 60_000 },
  );

  // ---------------------------------------------------------------------------
  // 22c: N out of range (0, 13+) produces no kelas records
  // ---------------------------------------------------------------------------
  it(
    'Property 22c: tingkat_N columns with N out of range (0 or >12) produce no kelas records',
    async () => {
      const outOfRangeArb = fc.oneof(fc.constant(0), fc.integer({ min: 13, max: 999 }));

      await fc.assert(
        fc.asyncProperty(outOfRangeArb, async (n) => {
          const colName = `tingkat_${n}`;
          const file = buildXlsxWithKelasColumns([colName], [`Kelas-${n}A`]);
          const result = await parseExcelFile(file);

          expect(result.errors).toHaveLength(0);
          expect(result.data).not.toBeNull();

          // No kelas record should be produced from an out-of-range column
          expect(result.data!.kelas).toHaveLength(0);
        }),
        { numRuns: 100 },
      );
    },
    { timeout: 60_000 },
  );

  // ---------------------------------------------------------------------------
  // 22d: Case variants (Tingkat_1, TINGKAT_1, etc.) produce no kelas records
  // ---------------------------------------------------------------------------
  it(
    'Property 22d: column names with wrong case (e.g. Tingkat_1, TINGKAT_1) produce no kelas records',
    async () => {
      // Build variants that have uppercase letters in the "tingkat" prefix
      const caseVariantArb = fc
        .integer({ min: 1, max: 12 })
        .chain((n) =>
          fc.constantFrom(
            `Tingkat_${n}`,
            `TINGKAT_${n}`,
            `Tingkat_${n}`.toUpperCase(),
            `tIngkat_${n}`,
            `tiNgkat_${n}`,
          ),
        );

      await fc.assert(
        fc.asyncProperty(caseVariantArb, async (colName) => {
          const file = buildXlsxWithKelasColumns([colName], ['KelasX']);
          const result = await parseExcelFile(file);

          expect(result.errors).toHaveLength(0);
          expect(result.data).not.toBeNull();

          // Case variants must NOT produce any kelas record
          expect(result.data!.kelas).toHaveLength(0);
        }),
        { numRuns: 100 },
      );
    },
    { timeout: 60_000 },
  );

  // ---------------------------------------------------------------------------
  // 22e: Arbitrary non-matching column names produce no kelas records
  // ---------------------------------------------------------------------------
  it(
    'Property 22e: arbitrary column names not matching /^tingkat_(\\d+)$/ produce no kelas records',
    async () => {
      // Generate column names that definitely do NOT match /^tingkat_(\d+)$/
      // (lowercase, strictly digits, N between 1-12 are the valid ones)
      const nonMatchingColArb = fc.oneof(
        // completely random strings
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !/^tingkat_(\d+)$/.test(s)),
        // known bad patterns
        fc.constantFrom(
          'tingkat_',
          'tingkat_1a',
          'tingkat_1_extra',
          'kelas_1',
          '_tingkat_1',
          'tingkat 1',
          'tingkat-1',
          'tingkat_01',
          '',
          'keterangan',
          'catatan',
        ),
      );

      await fc.assert(
        fc.asyncProperty(nonMatchingColArb, async (colName) => {
          // Skip empty column names — they'd be valid header-less columns, not real headers
          if (colName === '') return;

          const file = buildXlsxWithKelasColumns([colName], ['KelasX']);
          const result = await parseExcelFile(file);

          expect(result.errors).toHaveLength(0);
          expect(result.data).not.toBeNull();

          // Non-matching column must produce NO kelas records
          expect(result.data!.kelas).toHaveLength(0);
        }),
        { numRuns: 100 },
      );
    },
    { timeout: 60_000 },
  );

  // ---------------------------------------------------------------------------
  // 22f: Empty cells under valid tingkat_N columns produce no kelas records
  // ---------------------------------------------------------------------------
  it(
    'Property 22f: empty cells under valid tingkat_N columns are skipped (produce no record)',
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 12 }), async (n) => {
          const colName = `tingkat_${n}`;
          // Put an empty string cell — should be skipped
          const file = buildXlsxWithKelasColumns([colName], ['']);
          const result = await parseExcelFile(file);

          expect(result.errors).toHaveLength(0);
          expect(result.data).not.toBeNull();

          // Empty cell → no kelas record
          expect(result.data!.kelas).toHaveLength(0);
        }),
        { numRuns: 50 },
      );
    },
    { timeout: 30_000 },
  );

  // ---------------------------------------------------------------------------
  // 22g: Mixed valid + invalid columns — only valid columns contribute records
  // ---------------------------------------------------------------------------
  it(
    'Property 22g: mixed valid and non-matching columns — only valid tingkat_N columns produce records',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Valid N in 1..12
          fc.integer({ min: 1, max: 12 }),
          // An invalid column name (non-matching pattern)
          fc.constantFrom(
            'keterangan',
            'catatan',
            'tingkat_0',
            'tingkat_13',
            'Tingkat_1',
            'kelas_1',
          ),
          async (validN, invalidCol) => {
            const validCol = `tingkat_${validN}`;
            const columns = [validCol, invalidCol];
            const cellValues = [`Kelas${validN}A`, 'ignored'];

            const file = buildXlsxWithKelasColumns(columns, cellValues);
            const result = await parseExcelFile(file);

            expect(result.errors).toHaveLength(0);
            expect(result.data).not.toBeNull();

            const kelasList = result.data!.kelas;

            // Exactly 1 record: from the valid column
            expect(kelasList).toHaveLength(1);
            expect(kelasList[0].tingkat).toBe(validN);
            expect(kelasList[0].nama).toBe(`Kelas${validN}A`);
          },
        ),
        { numRuns: 100 },
      );
    },
    { timeout: 60_000 },
  );
});

// ---------------------------------------------------------------------------
// Properties 28, 29, 30 — Date and numeric type safety (Requirements 8.1–8.7)
// ---------------------------------------------------------------------------

/**
 * Extended helper: like buildXlsxFile but also accepts custom siswa data rows
 * so we can inject arbitrary tanggal_lahir cell values.
 */
function buildXlsxFileWithSiswa(opts: {
  siswaRows?: unknown[][];
  sppRows?: (string | number | null)[][];
}): File {
  const wb = XLSX.utils.book_new();

  // Sheet: Siswa
  const siswaData =
    opts.siswaRows !== undefined
      ? [
          [
            'nama',
            'nisn',
            'kelas',
            'jenis_kelamin',
            'tanggal_lahir',
            'alamat',
            'nama_wali',
            'telepon_wali',
          ],
          ...opts.siswaRows,
        ]
      : [
          [
            'nama',
            'nisn',
            'kelas',
            'jenis_kelamin',
            'tanggal_lahir',
            'alamat',
            'nama_wali',
            'telepon_wali',
          ],
          [
            'Budi Santoso',
            '1234567890',
            '7A',
            'L',
            '2010-01-01',
            'Jl. Merdeka 1',
            'Pak Budi',
            '081234567890',
          ],
        ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(siswaData), 'Siswa');

  // Sheet: Kelas — one valid dummy row
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['tingkat_7'], ['7A']]), 'Kelas');

  // Sheet: Mata Pelajaran — one valid dummy row
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['mata_pelajaran', 'kode'],
      ['Matematika', 'MTK'],
    ]),
    'Mata Pelajaran',
  );

  // Sheet: Guru & Staff — one valid dummy row
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['nama', 'email', 'telepon', 'role'],
      ['Guru Valid', 'valid@sekolah.com', '081111111111', 'guru'],
    ]),
    'Guru & Staff',
  );

  // Sheet: SPP Bulanan
  const sppData =
    opts.sppRows !== undefined
      ? [['tingkat', 'nominal'], ...opts.sppRows]
      : [
          ['tingkat', 'nominal'],
          [7, 500000],
        ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sppData), 'SPP Bulanan');

  const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
  return new File([u8], 'test.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

describe('useExcelParser — Property 28, 29, 30: date and numeric type safety', () => {
  // -------------------------------------------------------------------------
  // Property 28: tanggal_lahir is always a valid ISO YYYY-MM-DD or null
  // Feature: tenant-excel-onboarding, Property 28: tanggal_lahir is always a valid ISO YYYY-MM-DD or null
  // Validates: Requirements 8.1, 8.4, 8.5
  // -------------------------------------------------------------------------

  it(
    'Property 28a: valid ISO date strings produce a YYYY-MM-DD output',
    async () => {
      // Generate valid date strings like "2005-03-14"
      const validDateArb = fc
        .tuple(
          fc.integer({ min: 1970, max: 2020 }),
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 1, max: 28 }), // max 28 to avoid month/day overflow
        )
        .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

      await fc.assert(
        fc.asyncProperty(validDateArb, async (dateStr) => {
          const file = buildXlsxFileWithSiswa({
            siswaRows: [['Siswa Test', null, null, null, dateStr, null, null, null]],
          });
          const result = await parseExcelFile(file);
          expect(result.data).not.toBeNull();
          const siswa = result.data!.siswa[0];
          // Must be a valid ISO string — never malformed
          expect(siswa.tanggalLahir).not.toBeNull();
          expect(typeof siswa.tanggalLahir).toBe('string');
          expect(ISO_DATE_REGEX.test(siswa.tanggalLahir as string)).toBe(true);
        }),
        { numRuns: 100 },
      );
    },
    { timeout: 60_000 },
  );

  it(
    'Property 28b: Excel serial numbers (positive finite integers) produce YYYY-MM-DD or null — never a malformed string',
    async () => {
      // Excel date serials: 1 = 1900-01-01. Typical range: 1–73050 (~year 2100)
      const excelSerialArb = fc.integer({ min: 1, max: 73_050 });

      await fc.assert(
        fc.asyncProperty(excelSerialArb, async (serial) => {
          const file = buildXlsxFileWithSiswa({
            // Pass the serial as a raw number cell value via aoa — SheetJS preserves it as number
            siswaRows: [['Siswa Test', null, null, null, serial, null, null, null]],
          });
          const result = await parseExcelFile(file);
          expect(result.data).not.toBeNull();
          const tanggal = result.data!.siswa[0].tanggalLahir;
          // Either null, or a valid ISO string — never malformed
          if (tanggal !== null && tanggal !== undefined) {
            expect(typeof tanggal).toBe('string');
            expect(ISO_DATE_REGEX.test(tanggal)).toBe(true);
          }
        }),
        { numRuns: 100 },
      );
    },
    { timeout: 60_000 },
  );

  it(
    'Property 28c: unparseable string values produce null — never a malformed string',
    async () => {
      // Strings that are not valid dates — fast-check arbitrary strings minus valid ISO dates
      const unparseableArb = fc.string().filter((s) => {
        const trimmed = s.trim();
        if (trimmed === '') return true; // empty → null
        return isNaN(new Date(trimmed).getTime()); // not a parseable date
      });

      await fc.assert(
        fc.asyncProperty(unparseableArb, async (badDate) => {
          const file = buildXlsxFileWithSiswa({
            siswaRows: [['Siswa Test', null, null, null, badDate, null, null, null]],
          });
          const result = await parseExcelFile(file);
          expect(result.data).not.toBeNull();
          const tanggal = result.data!.siswa[0].tanggalLahir;
          // Unparseable → must be null
          expect(tanggal).toBeNull();
        }),
        { numRuns: 100 },
      );
    },
    { timeout: 60_000 },
  );

  it('Property 28d: null/undefined tanggal_lahir cell produces null (never a malformed string)', async () => {
    // Pass null for tanggal_lahir
    const file = buildXlsxFileWithSiswa({
      siswaRows: [['Siswa Test', null, null, null, null, null, null, null]],
    });
    const result = await parseExcelFile(file);
    expect(result.data).not.toBeNull();
    const tanggal = result.data!.siswa[0].tanggalLahir;
    expect(tanggal).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Property 29: nominal stripping always produces a positive integer or null
  // Feature: tenant-excel-onboarding, Property 29: nominal stripping always produces a positive integer or null
  // Validates: Requirements 8.2, 8.6
  // -------------------------------------------------------------------------

  it(
    'Property 29a: any string nominal — after stripping non-digits — yields a positive integer or null',
    async () => {
      // Arbitrary strings including formatted numbers like "Rp 1.000.000", "500,000", "abc"
      const arbitraryNominalStringArb = fc.oneof(
        // purely non-digit strings → should produce null
        fc.string().filter((s) => s.replace(/\D/g, '') === ''),
        // strings with digits that strip to ≤ 0 — just "0" or empty digit sequence
        fc.constant('0'),
        fc.constant('000'),
        // realistic formatted currency strings
        fc.integer({ min: 1, max: 100_000_000 }).map((n) => `Rp ${n.toLocaleString('id-ID')}`),
        // plain numeric strings
        fc.integer({ min: 1, max: 100_000_000 }).map((n) => String(n)),
        // mixed: letters + digits
        fc
          .tuple(
            fc.string({ maxLength: 5 }),
            fc.integer({ min: 1, max: 9_999_999 }),
            fc.string({ maxLength: 5 }),
          )
          .map(([pre, n, suf]) => `${pre}${n}${suf}`),
      );

      await fc.assert(
        fc.asyncProperty(arbitraryNominalStringArb, async (nominalStr) => {
          const file = buildXlsxFileWithSiswa({
            sppRows: [[7, nominalStr]],
          });
          const result = await parseExcelFile(file);
          expect(result.data).not.toBeNull();
          const row = result.data!.sppBulanan[0];
          const nominal = row.nominal;

          if (nominal !== null) {
            // Must be a positive integer — never 0, negative, or float
            expect(typeof nominal).toBe('number');
            expect(Number.isInteger(nominal)).toBe(true);
            expect(nominal).toBeGreaterThan(0);
          }
          // null is always acceptable — no "else" branch required
        }),
        { numRuns: 200 },
      );
    },
    { timeout: 120_000 },
  );

  it(
    'Property 29b: positive integer nominal values are preserved as-is (positive integer, not float)',
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 100_000_000 }), async (posInt) => {
          const file = buildXlsxFileWithSiswa({
            sppRows: [[7, posInt]],
          });
          const result = await parseExcelFile(file);
          expect(result.data).not.toBeNull();
          const nominal = result.data!.sppBulanan[0].nominal;
          expect(nominal).toBe(posInt);
          expect(Number.isInteger(nominal!)).toBe(true);
          expect(nominal!).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    },
    { timeout: 60_000 },
  );

  it(
    'Property 29c: zero and negative numeric nominal always produce null',
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: -1_000_000, max: 0 }), async (nonPositive) => {
          const file = buildXlsxFileWithSiswa({
            sppRows: [[7, nonPositive]],
          });
          const result = await parseExcelFile(file);
          expect(result.data).not.toBeNull();
          expect(result.data!.sppBulanan[0].nominal).toBeNull();
        }),
        { numRuns: 100 },
      );
    },
    { timeout: 60_000 },
  );

  it(
    'Property 29d: float nominal values are truncated to integer (never a non-integer float)',
    async () => {
      // Positive floats with a fractional part — parser must trunc, not round
      const posFloatArb = fc
        .tuple(fc.integer({ min: 1, max: 999_999 }), fc.integer({ min: 1, max: 99 }))
        .map(([int, frac]) => int + frac / 100);

      await fc.assert(
        fc.asyncProperty(posFloatArb, async (posFloat) => {
          const file = buildXlsxFileWithSiswa({
            sppRows: [[7, posFloat]],
          });
          const result = await parseExcelFile(file);
          expect(result.data).not.toBeNull();
          const nominal = result.data!.sppBulanan[0].nominal;
          if (nominal !== null) {
            // Must be an integer — Math.trunc applied
            expect(Number.isInteger(nominal)).toBe(true);
            expect(nominal).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 },
      );
    },
    { timeout: 60_000 },
  );

  // -------------------------------------------------------------------------
  // Property 30: tingkat from Sheet_SPP parses to a positive integer or null
  // Feature: tenant-excel-onboarding, Property 30: tingkat from Sheet_SPP parses to a positive integer or null
  // Validates: Requirements 8.3, 8.7
  // -------------------------------------------------------------------------

  it(
    'Property 30a: positive integer tingkat values (≥ 1) are preserved as positive integers',
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 100 }), async (posTingkat) => {
          const file = buildXlsxFileWithSiswa({
            sppRows: [[posTingkat, 500_000]],
          });
          const result = await parseExcelFile(file);
          expect(result.data).not.toBeNull();
          const tingkat = result.data!.sppBulanan[0].tingkat;
          expect(tingkat).toBe(posTingkat);
          expect(Number.isInteger(tingkat!)).toBe(true);
          expect(tingkat!).toBeGreaterThanOrEqual(1);
        }),
        { numRuns: 100 },
      );
    },
    { timeout: 60_000 },
  );

  it(
    'Property 30b: zero and negative tingkat values always produce null',
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: -1000, max: 0 }), async (nonPositive) => {
          const file = buildXlsxFileWithSiswa({
            sppRows: [[nonPositive, 500_000]],
          });
          const result = await parseExcelFile(file);
          expect(result.data).not.toBeNull();
          expect(result.data!.sppBulanan[0].tingkat).toBeNull();
        }),
        { numRuns: 100 },
      );
    },
    { timeout: 60_000 },
  );

  it(
    'Property 30c: non-numeric string tingkat values produce null',
    async () => {
      const nonNumericStringArb = fc.string().filter((s) => {
        const trimmed = s.trim();
        if (trimmed === '') return true;
        const n = parseInt(trimmed, 10);
        return isNaN(n) || n <= 0;
      });

      await fc.assert(
        fc.asyncProperty(nonNumericStringArb, async (badTingkat) => {
          const file = buildXlsxFileWithSiswa({
            sppRows: [[badTingkat, 500_000]],
          });
          const result = await parseExcelFile(file);
          expect(result.data).not.toBeNull();
          expect(result.data!.sppBulanan[0].tingkat).toBeNull();
        }),
        { numRuns: 100 },
      );
    },
    { timeout: 60_000 },
  );

  it('Property 30d: null/undefined tingkat cell produces null', async () => {
    const file = buildXlsxFileWithSiswa({
      sppRows: [[null, 500_000]],
    });
    const result = await parseExcelFile(file);
    expect(result.data).not.toBeNull();
    expect(result.data!.sppBulanan[0].tingkat).toBeNull();
  });

  it(
    'Property 30e: for any arbitrary cell value, tingkat is either null or a positive integer — never negative, zero, or a float',
    async () => {
      // Full coverage: numbers (pos, neg, zero, float), strings, null
      const arbitraryTingkatArb = fc.oneof(
        fc.integer({ min: -100, max: 100 }),
        fc.float({ min: -10, max: 10 }).filter((f) => !Number.isInteger(f)),
        fc.string(),
        fc.constant(null),
        fc.constant(0),
      );

      await fc.assert(
        fc.asyncProperty(arbitraryTingkatArb, async (rawTingkat) => {
          const file = buildXlsxFileWithSiswa({
            sppRows: [[rawTingkat, 500_000]],
          });
          const result = await parseExcelFile(file);
          expect(result.data).not.toBeNull();
          const tingkat = result.data!.sppBulanan[0].tingkat;

          if (tingkat !== null) {
            expect(typeof tingkat).toBe('number');
            expect(Number.isInteger(tingkat)).toBe(true);
            expect(tingkat).toBeGreaterThanOrEqual(1);
          }
        }),
        { numRuns: 200 },
      );
    },
    { timeout: 120_000 },
  );
});
