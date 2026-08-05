// Feature: sistem-pengembangan-v2, Property 10: Nominal <= 0 atau > 999.999.999 selalu ditolak; 1–999.999.999 selalu diterima

import 'reflect-metadata';
import fc from 'fast-check';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpsertKonfigBiayaDto, KonfigBiayaType } from '../dto';

/**
 * Property 10: Nominal ≤ 0 atau > 999.999.999 selalu ditolak; 1–999.999.999 selalu diterima
 *
 * Untuk sembarang nilai nominal:
 * - nominal ≤ 0  → validasi HARUS ditolak
 * - nominal > 999.999.999 → validasi HARUS ditolak
 * - 1 ≤ nominal ≤ 999.999.999 (integer) → validasi HARUS diterima
 * - float (non-integer) → validasi HARUS ditolak
 *
 * **Validates: Requirements 6.3**
 */

const NOMINAL_MAX = 999_999_999;

/**
 * Helper: buat DTO dengan nominal tertentu, type dan id selalu valid
 * agar error yang diperiksa hanya berasal dari field nominal.
 */
function buildDto(nominal: unknown): UpsertKonfigBiayaDto {
  return plainToInstance(UpsertKonfigBiayaDto, {
    type: KonfigBiayaType.PER_KELAS,
    kelasId: '550e8400-e29b-41d4-a716-446655440000',
    nominal,
  });
}

async function getNominalErrors(nominal: unknown) {
  const dto = buildDto(nominal);
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'nominal');
}

const EXPECTED_ERROR_MSG = 'Nominal harus berupa angka bulat antara 1 dan 999.999.999.';

// ---------------------------------------------------------------------------
// Property 10a: nominal ≤ 0 (bilangan bulat) selalu ditolak
// ---------------------------------------------------------------------------

describe('Property 10: Validasi nominal UpsertKonfigBiayaDto', () => {
  describe('10a: nominal ≤ 0 selalu ditolak', () => {
    it('sembarang integer ≤ 0 menghasilkan error validasi nominal', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: -10_000_000, max: 0 }), async (nominal) => {
          const errors = await getNominalErrors(nominal);
          expect(errors.length).toBeGreaterThan(0);
          const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
          expect(messages.some((m) => m === EXPECTED_ERROR_MSG)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('nilai 0 selalu ditolak', async () => {
      const errors = await getNominalErrors(0);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('nilai negatif -1 selalu ditolak', async () => {
      const errors = await getNominalErrors(-1);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Property 10b: nominal > 999.999.999 selalu ditolak
  // ---------------------------------------------------------------------------

  describe('10b: nominal > 999.999.999 selalu ditolak', () => {
    it('sembarang integer > 999.999.999 menghasilkan error validasi nominal', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: NOMINAL_MAX + 1, max: NOMINAL_MAX + 10_000_000 }),
          async (nominal) => {
            const errors = await getNominalErrors(nominal);
            expect(errors.length).toBeGreaterThan(0);
            const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
            expect(messages.some((m) => m === EXPECTED_ERROR_MSG)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('nilai 1.000.000.000 selalu ditolak', async () => {
      const errors = await getNominalErrors(1_000_000_000);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Property 10c: 1 ≤ nominal ≤ 999.999.999 selalu diterima
  // ---------------------------------------------------------------------------

  describe('10c: 1 ≤ nominal ≤ 999.999.999 selalu diterima', () => {
    it('sembarang integer dalam rentang valid tidak menghasilkan error nominal', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: NOMINAL_MAX }), async (nominal) => {
          const errors = await getNominalErrors(nominal);
          expect(errors.length).toBe(0);
        }),
        { numRuns: 100 },
      );
    });

    it('nilai batas bawah 1 selalu diterima', async () => {
      const errors = await getNominalErrors(1);
      expect(errors.length).toBe(0);
    });

    it('nilai batas atas 999.999.999 selalu diterima', async () => {
      const errors = await getNominalErrors(NOMINAL_MAX);
      expect(errors.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Property 10d: nilai non-integer (float, string) selalu ditolak
  // ---------------------------------------------------------------------------

  describe('10d: nilai non-integer selalu ditolak', () => {
    it('sembarang float (bukan bilangan bulat) dalam rentang [1, 999.999.999] ditolak', async () => {
      // fc.float hanya menerima 32-bit float bounds — gunakan Math.fround untuk konversi
      await fc.assert(
        fc.asyncProperty(
          fc
            .float({
              min: Math.fround(1),
              max: Math.fround(999_999_872),
              noNaN: true,
              noDefaultInfinity: true,
            })
            .filter((n) => !Number.isInteger(n)),
          async (nominal) => {
            const errors = await getNominalErrors(nominal);
            expect(errors.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('string numerik ditolak karena class-transformer tidak mengkonversi tanpa @Transform', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: NOMINAL_MAX }).map((n) => String(n)),
          async (nominalStr) => {
            // plainToInstance tanpa @Type tidak mengkonversi string → number secara otomatis
            // sehingga validasi @IsInt akan gagal
            const errors = await getNominalErrors(nominalStr);
            expect(errors.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('null ditolak', async () => {
      const errors = await getNominalErrors(null);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('undefined ditolak', async () => {
      const errors = await getNominalErrors(undefined);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
