// Feature: tenant-excel-onboarding, Property 3: Submit disabled when parsing not succeeded
// Feature: tenant-excel-onboarding, Property 12: Submission payload contains only valid rows
// **Validates: Requirements 1.5, 4.7**
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { useOnboardingForm } from '../useOnboardingForm';
import type {
  ParseResult,
  ParsedOnboardingData,
  ParsedSiswa,
  ParsedMataPelajaran,
  ParsedGuruStaff,
  ParsedSppBulanan,
  ParsedKelas,
} from '../useExcelParser';

// ---------------------------------------------------------------------------
// Helpers / generators
// ---------------------------------------------------------------------------

/** Arbitrary invalid ParseResult — parseResult is not null but isValid = false */
const arbInvalidParseResult = fc.record({
  data: fc.oneof(
    fc.constant(null),
    // data present but marked invalid
    fc.constant<ParsedOnboardingData>({
      siswa: [],
      kelas: [],
      mataPelajaran: [],
      guruStaff: [],
      sppBulanan: [],
    }),
  ),
  errors: fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 5 }),
  warnings: fc.array(fc.string({ minLength: 0 }), { minLength: 0, maxLength: 3 }),
  isValid: fc.constant(false),
}) as fc.Arbitrary<ParseResult>;

/** Arbitrary valid ParseResult — isValid = true, data is non-null with at least one row */
const arbValidParseResult = fc.constant<ParseResult>({
  data: {
    siswa: [],
    kelas: [{ nama: '1A', tingkat: 1 }],
    mataPelajaran: [],
    guruStaff: [],
    sppBulanan: [],
  },
  errors: [],
  warnings: [],
  isValid: true,
});

// ---------------------------------------------------------------------------
// Mock external dependencies used inside submitOnboarding
// ---------------------------------------------------------------------------

vi.mock('@/api', () => ({
  api: {
    post: vi.fn(),
  },
}));

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useOnboardingForm — Property 3: Submit disabled when parsing not succeeded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Property 3a: null parseResult → submitOnboarding is a no-op (no HTTP call, isSubmitting stays false)', async () => {
    // Feature: tenant-excel-onboarding, Property 3: Submit disabled when parsing not succeeded
    // For any form state where parseResult is null, the submit SHALL NOT proceed.
    const { api } = await import('@/api');

    await fc.assert(
      fc.asyncProperty(fc.constant(null), async (_) => {
        vi.clearAllMocks();
        const form = useOnboardingForm();

        // parseResult is null by default
        expect(form.parseResult.value).toBeNull();

        await form.submitOnboarding();

        // No HTTP request should have been fired
        expect(api.post).not.toHaveBeenCalled();
        // isSubmitting must remain false — button stays disabled
        expect(form.isSubmitting.value).toBe(false);
      }),
      { numRuns: 20 },
    );
  });

  it('Property 3b: invalid parseResult (isValid=false) → submitOnboarding is a no-op', async () => {
    // Feature: tenant-excel-onboarding, Property 3: Submit disabled when parsing not succeeded
    // For any form state where parseResult.isValid is false, the submit SHALL NOT proceed.
    const { api } = await import('@/api');

    await fc.assert(
      fc.asyncProperty(arbInvalidParseResult, async (invalidResult) => {
        vi.clearAllMocks();
        const form = useOnboardingForm();
        form.goToStep('upload');
        form.handleFileParsed(invalidResult);

        // Step should still be 'upload' (not preview) for invalid results
        expect(form.step.value).toBe('upload');
        // parseResult is stored so UI can display errors
        expect(form.parseResult.value).toEqual(invalidResult);

        await form.submitOnboarding();

        // No HTTP request should have been fired
        expect(api.post).not.toHaveBeenCalled();
        // isSubmitting must not have been set — submit button stays disabled
        expect(form.isSubmitting.value).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('Property 3c: parseResult null after gantiFile → submitOnboarding is a no-op', async () => {
    // Feature: tenant-excel-onboarding, Property 3: Submit disabled when parsing not succeeded
    // After gantiFile resets parseResult to null, submit must remain blocked.
    const { api } = await import('@/api');

    await fc.assert(
      fc.asyncProperty(arbValidParseResult, async (validResult) => {
        vi.clearAllMocks();
        const form = useOnboardingForm();
        form.goToStep('upload');
        form.handleFileParsed(validResult);

        // After valid parse, step advances to preview
        expect(form.step.value).toBe('preview');

        // User clicks "Ganti File" → resets state
        form.handleGantiFile();
        expect(form.parseResult.value).toBeNull();
        expect(form.step.value).toBe('upload');

        await form.submitOnboarding();

        // Submit must be blocked again
        expect(api.post).not.toHaveBeenCalled();
        expect(form.isSubmitting.value).toBe(false);
      }),
      { numRuns: 20 },
    );
  });

  it('Property 3d: isValid=false covers arbitrary error/warning combinations', async () => {
    // Feature: tenant-excel-onboarding, Property 3: Submit disabled when parsing not succeeded
    // Regardless of the error/warning content, isValid=false always blocks submit.
    const { api } = await import('@/api');

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errors: fc.array(fc.string({ minLength: 1, maxLength: 100 }), {
            minLength: 1,
            maxLength: 10,
          }),
          warnings: fc.array(fc.string({ minLength: 0, maxLength: 100 }), {
            minLength: 0,
            maxLength: 5,
          }),
        }),
        async ({ errors, warnings }) => {
          vi.clearAllMocks();
          const invalidResult: ParseResult = {
            data: null,
            errors,
            warnings,
            isValid: false,
          };

          const form = useOnboardingForm();
          form.goToStep('upload');
          form.handleFileParsed(invalidResult);

          await form.submitOnboarding();

          expect(api.post).not.toHaveBeenCalled();
          expect(form.isSubmitting.value).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12 — Submission payload contains only valid rows
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Arbitraries for Property 12
// ---------------------------------------------------------------------------

/** Produce a ParsedSiswa row with controlled isValid flag */
const arbSiswaRow = (isValid: boolean): fc.Arbitrary<ParsedSiswa> =>
  fc.record({
    nama: fc.string({ minLength: 1, maxLength: 20 }),
    nisn: fc.option(fc.string({ minLength: 5, maxLength: 15 }), { nil: undefined }),
    kelas: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined }),
    jenisKelamin: fc.option(fc.constantFrom('L' as const, 'P' as const), { nil: undefined }),
    tanggalLahir: fc.option(fc.constant('2010-01-15'), { nil: undefined }),
    alamat: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    namaWali: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    teleponWali: fc.option(fc.string({ minLength: 8, maxLength: 15 }), { nil: undefined }),
    isValid: fc.constant(isValid),
    reason: isValid
      ? fc.constant(undefined)
      : fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  });

/** Produce a ParsedMataPelajaran row with controlled isValid flag */
const arbMataPelajaranRow = (isValid: boolean): fc.Arbitrary<ParsedMataPelajaran> =>
  fc.record({
    nama: isValid ? fc.string({ minLength: 1, maxLength: 30 }) : fc.constant(''),
    kode: fc.option(fc.string({ minLength: 2, maxLength: 10 }), { nil: undefined }),
    isValid: fc.constant(isValid),
    reason: isValid
      ? fc.constant(undefined)
      : fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  });

/** Produce a ParsedGuruStaff row with controlled isValid flag */
const arbGuruStaffRow = (isValid: boolean): fc.Arbitrary<ParsedGuruStaff> =>
  fc.record({
    nama: fc.string({ minLength: 1, maxLength: 20 }),
    email: isValid ? fc.constant('valid@sekolah.com') : fc.constant('invalid-email'),
    telepon: fc.option(fc.string({ minLength: 8, maxLength: 15 }), { nil: undefined }),
    role: isValid ? fc.constant('guru') : fc.constant('invalid_role'),
    isValid: fc.constant(isValid),
    reason: isValid
      ? fc.constant(undefined)
      : fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  });

/** Produce a ParsedSppBulanan row with controlled isValid flag */
const arbSppBulananRow = (isValid: boolean): fc.Arbitrary<ParsedSppBulanan> =>
  isValid
    ? fc.record({
        tingkat: fc.integer({ min: 1, max: 12 }),
        nominal: fc.integer({ min: 1, max: 5_000_000 }),
        isValid: fc.constant(true as const),
        reason: fc.constant(undefined),
      })
    : fc.record({
        tingkat: fc.option(fc.integer({ min: 1, max: 12 }), { nil: null }),
        nominal: fc.constant(null),
        isValid: fc.constant(false as const),
        reason: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
      });

/** Produce a ParsedKelas row (no isValid — all pass through) */
const arbKelasRow: fc.Arbitrary<ParsedKelas> = fc.record({
  nama: fc.string({ minLength: 1, maxLength: 10 }),
  tingkat: fc.integer({ min: 1, max: 12 }),
});

/**
 * Build an arbitrary list of rows mixing valid and invalid entries.
 * Returns { rows, validCount } so the test knows how many should survive filtering.
 */
function arbMixedRows<T>(
  validArb: fc.Arbitrary<T>,
  invalidArb: fc.Arbitrary<T>,
): fc.Arbitrary<{ rows: T[]; validCount: number }> {
  return fc
    .array(fc.record({ valid: fc.boolean() }), { minLength: 0, maxLength: 10 })
    .chain((specs) => {
      if (specs.length === 0) {
        return fc.constant({ rows: [] as T[], validCount: 0 });
      }
      const rowArbs = specs.map((s) => (s.valid ? validArb : invalidArb));
      return fc.tuple(...(rowArbs as [fc.Arbitrary<T>, ...fc.Arbitrary<T>[]])).map((rows) => ({
        rows: rows as T[],
        validCount: specs.filter((s) => s.valid).length,
      }));
    });
}

/** Arbitrary ParsedOnboardingData with known valid/invalid counts per sheet */
const arbMixedOnboardingData: fc.Arbitrary<{
  data: ParsedOnboardingData;
  validSiswaCount: number;
  validMataPelajaranCount: number;
  validGuruStaffCount: number;
  validSppBulananCount: number;
  kelasCount: number;
}> = fc
  .tuple(
    arbMixedRows(arbSiswaRow(true), arbSiswaRow(false)),
    arbMixedRows(arbMataPelajaranRow(true), arbMataPelajaranRow(false)),
    arbMixedRows(arbGuruStaffRow(true), arbGuruStaffRow(false)),
    arbMixedRows(arbSppBulananRow(true), arbSppBulananRow(false)),
    fc.array(arbKelasRow, { minLength: 0, maxLength: 5 }),
  )
  .map(([siswaResult, mpResult, guruResult, sppResult, kelas]) => ({
    data: {
      siswa: siswaResult.rows,
      mataPelajaran: mpResult.rows,
      guruStaff: guruResult.rows,
      sppBulanan: sppResult.rows,
      kelas,
    },
    validSiswaCount: siswaResult.validCount,
    validMataPelajaranCount: mpResult.validCount,
    validGuruStaffCount: guruResult.validCount,
    validSppBulananCount: sppResult.validCount,
    kelasCount: kelas.length,
  }));

// ---------------------------------------------------------------------------
// Property 12 tests
// ---------------------------------------------------------------------------

describe('useOnboardingForm — Property 12: Submission payload contains only valid rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Feature: tenant-excel-onboarding, Property 12: Submission payload contains only valid rows
   * **Validates: Requirements 4.7**
   *
   * For any ParsedOnboardingData with arbitrary combinations of valid/invalid
   * rows across all sheets, the HTTP request payload sent on submit SHALL
   * contain ONLY rows where `isValid !== false` — no invalid rows included.
   */
  it(
    'Property 12: payload arrays contain only valid rows (isValid !== false) for all sheets',
    async () => {
      const { api } = await import('@/api');
      const mockPost = vi.mocked(api.post);

      await fc.assert(
        fc.asyncProperty(
          arbMixedOnboardingData,
          async ({
            data,
            validSiswaCount,
            validMataPelajaranCount,
            validGuruStaffCount,
            validSppBulananCount,
            kelasCount,
          }) => {
            vi.clearAllMocks();
            mockPost.mockResolvedValue({ data: { id: 'tenant-1' } });

            const parseResult: ParseResult = {
              data,
              errors: [],
              warnings: [],
              isValid: true,
            };

            const form = useOnboardingForm();
            form.goToStep('upload');
            form.handleFileParsed(parseResult);

            await form.submitOnboarding();

            // api.post must have been called once
            expect(mockPost).toHaveBeenCalledOnce();

            const [, payload] = mockPost.mock.calls[0] as [string, Record<string, unknown>];

            // ---- siswa ----
            const sentSiswa = payload.siswa as unknown[];
            expect(sentSiswa).toHaveLength(validSiswaCount);
            // None of the sent siswa rows should map to an invalid source row
            // (verify by checking count; all sent rows derive from isValid !== false source rows)
            const sourceSiswaValid = data.siswa.filter((r) => r.isValid !== false);
            expect(sentSiswa).toHaveLength(sourceSiswaValid.length);

            // ---- mata_pelajaran ----
            const sentMp = payload.mata_pelajaran as unknown[];
            expect(sentMp).toHaveLength(validMataPelajaranCount);
            const sourceMpValid = data.mataPelajaran.filter((r) => r.isValid !== false);
            expect(sentMp).toHaveLength(sourceMpValid.length);

            // ---- guru_staff ----
            const sentGuru = payload.guru_staff as unknown[];
            expect(sentGuru).toHaveLength(validGuruStaffCount);
            const sourceGuruValid = data.guruStaff.filter((r) => r.isValid !== false);
            expect(sentGuru).toHaveLength(sourceGuruValid.length);

            // ---- spp_bulanan ----
            const sentSpp = payload.spp_bulanan as unknown[];
            expect(sentSpp).toHaveLength(validSppBulananCount);
            const sourceSppValid = data.sppBulanan.filter((r) => r.isValid !== false);
            expect(sentSpp).toHaveLength(sourceSppValid.length);

            // ---- kelas (no isValid — all pass through) ----
            const sentKelas = payload.kelas as unknown[];
            expect(sentKelas).toHaveLength(kelasCount);
          },
        ),
        { numRuns: 100 },
      );
    },
    { timeout: 30_000 },
  );

  it(
    'Property 12b: when all rows are invalid, all payload arrays are empty (except kelas)',
    async () => {
      const { api } = await import('@/api');
      const mockPost = vi.mocked(api.post);

      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.array(arbSiswaRow(false), { minLength: 1, maxLength: 10 }),
            fc.array(arbMataPelajaranRow(false), { minLength: 0, maxLength: 10 }),
            fc.array(arbGuruStaffRow(false), { minLength: 0, maxLength: 10 }),
            fc.array(arbSppBulananRow(false), { minLength: 0, maxLength: 10 }),
            fc.array(arbKelasRow, { minLength: 0, maxLength: 5 }),
          ),
          async ([siswa, mataPelajaran, guruStaff, sppBulanan, kelas]) => {
            vi.clearAllMocks();
            mockPost.mockResolvedValue({ data: { id: 'tenant-1' } });

            const parseResult: ParseResult = {
              data: { siswa, mataPelajaran, guruStaff, sppBulanan, kelas },
              errors: [],
              warnings: [],
              isValid: true,
            };

            const form = useOnboardingForm();
            form.goToStep('upload');
            form.handleFileParsed(parseResult);

            await form.submitOnboarding();

            expect(mockPost).toHaveBeenCalledOnce();
            const [, payload] = mockPost.mock.calls[0] as [string, Record<string, unknown>];

            expect(payload.siswa as unknown[]).toHaveLength(0);
            expect(payload.mata_pelajaran as unknown[]).toHaveLength(0);
            expect(payload.guru_staff as unknown[]).toHaveLength(0);
            expect(payload.spp_bulanan as unknown[]).toHaveLength(0);
            // kelas always passes through
            expect(payload.kelas as unknown[]).toHaveLength(kelas.length);
          },
        ),
        { numRuns: 50 },
      );
    },
    { timeout: 20_000 },
  );

  it(
    'Property 12c: when all rows are valid, payload arrays contain all rows',
    async () => {
      const { api } = await import('@/api');
      const mockPost = vi.mocked(api.post);

      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.array(arbSiswaRow(true), { minLength: 1, maxLength: 10 }),
            fc.array(arbMataPelajaranRow(true), { minLength: 0, maxLength: 10 }),
            fc.array(arbGuruStaffRow(true), { minLength: 0, maxLength: 10 }),
            fc.array(arbSppBulananRow(true), { minLength: 0, maxLength: 10 }),
            fc.array(arbKelasRow, { minLength: 0, maxLength: 5 }),
          ),
          async ([siswa, mataPelajaran, guruStaff, sppBulanan, kelas]) => {
            vi.clearAllMocks();
            mockPost.mockResolvedValue({ data: { id: 'tenant-1' } });

            const parseResult: ParseResult = {
              data: { siswa, mataPelajaran, guruStaff, sppBulanan, kelas },
              errors: [],
              warnings: [],
              isValid: true,
            };

            const form = useOnboardingForm();
            form.goToStep('upload');
            form.handleFileParsed(parseResult);

            await form.submitOnboarding();

            expect(mockPost).toHaveBeenCalledOnce();
            const [, payload] = mockPost.mock.calls[0] as [string, Record<string, unknown>];

            expect(payload.siswa as unknown[]).toHaveLength(siswa.length);
            expect(payload.mata_pelajaran as unknown[]).toHaveLength(mataPelajaran.length);
            expect(payload.guru_staff as unknown[]).toHaveLength(guruStaff.length);
            expect(payload.spp_bulanan as unknown[]).toHaveLength(sppBulanan.length);
            expect(payload.kelas as unknown[]).toHaveLength(kelas.length);
          },
        ),
        { numRuns: 50 },
      );
    },
    { timeout: 20_000 },
  );

  it(
    'Property 12d: payload field mapping is correct for valid rows',
    async () => {
      // Verify that the field names in the sent payload match the expected DTO field names
      const { api } = await import('@/api');
      const mockPost = vi.mocked(api.post);

      vi.clearAllMocks();
      mockPost.mockResolvedValue({ data: { id: 'tenant-1' } });

      const validSiswa: ParsedSiswa = {
        nama: 'Budi',
        nisn: '1234567890',
        kelas: '7A',
        jenisKelamin: 'L',
        tanggalLahir: '2010-01-15',
        alamat: 'Jl. Merdeka',
        namaWali: 'Pak Budi',
        teleponWali: '081234567890',
        isValid: true,
      };
      const invalidSiswa: ParsedSiswa = {
        nama: '',
        isValid: false,
        reason: 'Nama kosong',
      };

      const validGuru: ParsedGuruStaff = {
        nama: 'Ibu Sari',
        email: 'sari@sekolah.com',
        telepon: '082222222222',
        role: 'guru',
        isValid: true,
      };
      const invalidGuru: ParsedGuruStaff = {
        nama: 'Bad Guy',
        email: 'notvalid',
        role: 'unknown',
        isValid: false,
        reason: 'Role dan email tidak valid',
      };

      const parseResult: ParseResult = {
        data: {
          siswa: [validSiswa, invalidSiswa],
          mataPelajaran: [],
          guruStaff: [validGuru, invalidGuru],
          sppBulanan: [],
          kelas: [{ nama: '7A', tingkat: 7 }],
        },
        errors: [],
        warnings: [],
        isValid: true,
      };

      const form = useOnboardingForm();
      form.goToStep('upload');
      form.handleFileParsed(parseResult);
      await form.submitOnboarding();

      expect(mockPost).toHaveBeenCalledOnce();
      const [, payload] = mockPost.mock.calls[0] as [string, Record<string, unknown>];

      // Siswa: only the valid row, with mapped field names
      const sentSiswa = payload.siswa as Record<string, unknown>[];
      expect(sentSiswa).toHaveLength(1);
      expect(sentSiswa[0]).toMatchObject({
        nama: 'Budi',
        nisn: '1234567890',
        kelasNama: '7A', // field remapped from kelas → kelasNama
        jenisKelamin: 'L',
        tanggalLahir: '2010-01-15',
        alamat: 'Jl. Merdeka',
        namaWali: 'Pak Budi',
        teleponWali: '081234567890',
      });

      // guru_staff: only the valid row
      const sentGuru = payload.guru_staff as Record<string, unknown>[];
      expect(sentGuru).toHaveLength(1);
      expect(sentGuru[0]).toMatchObject({
        nama: 'Ibu Sari',
        email: 'sari@sekolah.com',
        telepon: '082222222222',
        role: 'guru',
      });

      // kelas passes through untouched
      const sentKelas = payload.kelas as unknown[];
      expect(sentKelas).toHaveLength(1);
    },
    { timeout: 10_000 },
  );
});
