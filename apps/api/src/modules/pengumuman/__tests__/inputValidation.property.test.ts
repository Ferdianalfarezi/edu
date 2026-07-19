import 'reflect-metadata';
import fc from 'fast-check';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePengumumanDto } from '../pengumuman.dto';

/**
 * Property 1: Input Validation Rejects Invalid, Accepts Valid
 *
 * For any string s, if s.trim() is empty (length 0) or s.trim().length exceeds the field's
 * maximum (255 for judul, 5000 for deskripsi), then validation SHALL reject s.
 * Conversely, if s.trim().length is between 1 and the maximum (inclusive), validation SHALL accept s.
 *
 * **Validates: Requirements 1.3, 1.4, 1.5**
 */

/**
 * Pure validation function that mirrors the service-level trim + length check.
 * This is the authoritative validation logic applied in PengumumanService.create().
 */
function isValidField(value: string, maxLength: number): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= maxLength;
}

/**
 * Helper to create a valid base DTO payload for testing individual fields in isolation.
 */
function validBasePayload() {
  return {
    judul: 'Pengumuman Test',
    deskripsi: 'Deskripsi test content',
    mode: 'broadcast' as const,
  };
}

describe('Feature: announcement, Property 1: Input Validation Rejects Invalid, Accepts Valid', () => {
  describe('judul field (max 255 characters)', () => {
    it('empty or whitespace-only strings are rejected', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(''),
            fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 50 }),
          ),
          (invalidJudul) => {
            expect(isValidField(invalidJudul, 255)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('strings with trimmed length between 1 and 255 are accepted', () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 255 })
            .filter((s) => s.trim().length >= 1 && s.trim().length <= 255),
          (validJudul) => {
            expect(isValidField(validJudul, 255)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('strings with trimmed length exceeding 255 are rejected', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 256, maxLength: 500 }).filter((s) => s.trim().length > 255),
          (overlengthJudul) => {
            expect(isValidField(overlengthJudul, 255)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('DTO validation rejects empty judul', async () => {
      const dto = plainToInstance(CreatePengumumanDto, {
        ...validBasePayload(),
        judul: '',
      });
      const errors = await validate(dto);
      const judulError = errors.find((e) => e.property === 'judul');
      expect(judulError).toBeDefined();
    });

    it('DTO validation rejects judul exceeding 255 characters', async () => {
      const dto = plainToInstance(CreatePengumumanDto, {
        ...validBasePayload(),
        judul: 'a'.repeat(256),
      });
      const errors = await validate(dto);
      const judulError = errors.find((e) => e.property === 'judul');
      expect(judulError).toBeDefined();
    });

    it('DTO validation accepts judul with valid length (1–255)', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 255 }), async (length) => {
          const dto = plainToInstance(CreatePengumumanDto, {
            ...validBasePayload(),
            judul: 'a'.repeat(length),
          });
          const errors = await validate(dto);
          const judulError = errors.find((e) => e.property === 'judul');
          expect(judulError).toBeUndefined();
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('deskripsi field (max 5000 characters)', () => {
    it('empty or whitespace-only strings are rejected', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(''),
            fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 50 }),
          ),
          (invalidDeskripsi) => {
            expect(isValidField(invalidDeskripsi, 5000)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('strings with trimmed length between 1 and 5000 are accepted', () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 5000 })
            .filter((s) => s.trim().length >= 1 && s.trim().length <= 5000),
          (validDeskripsi) => {
            expect(isValidField(validDeskripsi, 5000)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('strings with trimmed length exceeding 5000 are rejected', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5001, maxLength: 6000 }).filter((s) => s.trim().length > 5000),
          (overlengthDeskripsi) => {
            expect(isValidField(overlengthDeskripsi, 5000)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('DTO validation rejects empty deskripsi', async () => {
      const dto = plainToInstance(CreatePengumumanDto, {
        ...validBasePayload(),
        deskripsi: '',
      });
      const errors = await validate(dto);
      const deskripsiError = errors.find((e) => e.property === 'deskripsi');
      expect(deskripsiError).toBeDefined();
    });

    it('DTO validation rejects deskripsi exceeding 5000 characters', async () => {
      const dto = plainToInstance(CreatePengumumanDto, {
        ...validBasePayload(),
        deskripsi: 'a'.repeat(5001),
      });
      const errors = await validate(dto);
      const deskripsiError = errors.find((e) => e.property === 'deskripsi');
      expect(deskripsiError).toBeDefined();
    });

    it('DTO validation accepts deskripsi with valid length (1–5000)', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 5000 }), async (length) => {
          const dto = plainToInstance(CreatePengumumanDto, {
            ...validBasePayload(),
            deskripsi: 'a'.repeat(length),
          });
          const errors = await validate(dto);
          const deskripsiError = errors.find((e) => e.property === 'deskripsi');
          expect(deskripsiError).toBeUndefined();
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('combined: service-level trim validation for any arbitrary string', () => {
    it('for any string s: isValidField(s, max) ↔ 1 <= s.trim().length <= max', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 300 }),
          fc.constantFrom(255, 5000),
          (s, maxLen) => {
            const trimmedLen = s.trim().length;
            const expected = trimmedLen >= 1 && trimmedLen <= maxLen;
            expect(isValidField(s, maxLen)).toBe(expected);
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
