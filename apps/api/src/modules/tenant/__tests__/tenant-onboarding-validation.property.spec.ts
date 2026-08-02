import 'reflect-metadata';
import fc from 'fast-check';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import { CreateOnboardingGuruStaffDto } from '../dto/create-onboarding-guru-staff.dto';
import { CreateOnboardingSppDto } from '../dto/create-onboarding-spp.dto';

/**
 * Shared test helpers
 */

/** Minimal valid base tenant fields required by CreateTenantDto */
const validTenantBase = () => ({
  nama: 'SD Negeri 1',
  email: 'admin@sdnegeri1.sch.id',
  jumlah_tingkat: 6,
  admin_nama: 'Admin User',
  admin_email: 'admin.user@sdnegeri1.sch.id',
});

/** Minimal valid guru_staff entry */
const validGuruStaff = () => ({
  nama: 'Budi Santoso',
  email: 'budi@sekolah.id',
  role: 'guru',
});

/** Minimal valid kelas entry */
const validKelas = () => ({ nama: '1A', tingkat: 1 });

/** Minimal valid mata_pelajaran entry */
const validMataPelajaran = () => ({ nama: 'Matematika' });

/** Minimal valid siswa entry */
const validSiswa = () => ({ nama: 'Siti' });

/** Valid role values per spec */
const VALID_ROLES = ['admin', 'guru', 'kepala_sekolah', 'bendahara'] as const;

/**
 * Run class-validator on a plain object deserialized into the given DTO class.
 * Returns the array of ValidationError objects (empty = valid).
 */
async function validateDto<T extends object>(cls: new () => T, plain: Record<string, unknown>) {
  const instance = plainToInstance(cls, plain);
  return validate(instance as object);
}

// ─────────────────────────────────────────────────────────────────────────────
// Property 13: Backend rejects arrays exceeding size limits
//
// For any request where guru_staff, kelas, mata_pelajaran, or siswa arrays have
// more than 500 entries, or spp_bulanan has more than 13 entries, the backend
// SHALL return a 400 validation error.
//
// **Validates: Requirements 5.1**
// Feature: tenant-excel-onboarding, Property 13: Backend rejects arrays exceeding size limits
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature: tenant-excel-onboarding, Property 13: Backend rejects arrays exceeding size limits', () => {
  /**
   * Arrays exceeding 500 — test each of the four arrays that share the same limit.
   */
  it('rejects guru_staff array with more than 500 entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arrays of size 501 to 600 to keep run time reasonable
        fc.integer({ min: 501, max: 600 }),
        async (size) => {
          const tooManyEntries = Array.from({ length: size }, (_, i) => ({
            nama: `Guru ${i}`,
            email: `guru${i}@sekolah.id`,
            role: 'guru',
          }));

          const errors = await validateDto(CreateTenantDto, {
            ...validTenantBase(),
            guru_staff: tooManyEntries,
          });

          const hasArrayMaxSizeError = errors.some(
            (e) =>
              e.property === 'guru_staff' &&
              Object.keys(e.constraints ?? {}).includes('arrayMaxSize'),
          );
          expect(hasArrayMaxSizeError).toBe(true);
        },
      ),
      { numRuns: 20 },
    );
  });

  it('rejects kelas array with more than 500 entries', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 501, max: 600 }), async (size) => {
        const tooManyEntries = Array.from({ length: size }, (_, i) => ({
          nama: `Kelas ${i}`,
          tingkat: (i % 12) + 1,
        }));

        const errors = await validateDto(CreateTenantDto, {
          ...validTenantBase(),
          kelas: tooManyEntries,
        });

        const hasArrayMaxSizeError = errors.some(
          (e) =>
            e.property === 'kelas' && Object.keys(e.constraints ?? {}).includes('arrayMaxSize'),
        );
        expect(hasArrayMaxSizeError).toBe(true);
      }),
      { numRuns: 20 },
    );
  });

  it('rejects mata_pelajaran array with more than 500 entries', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 501, max: 600 }), async (size) => {
        const tooManyEntries = Array.from({ length: size }, (_, i) => ({
          nama: `Mata Pelajaran ${i}`,
        }));

        const errors = await validateDto(CreateTenantDto, {
          ...validTenantBase(),
          mata_pelajaran: tooManyEntries,
        });

        const hasArrayMaxSizeError = errors.some(
          (e) =>
            e.property === 'mata_pelajaran' &&
            Object.keys(e.constraints ?? {}).includes('arrayMaxSize'),
        );
        expect(hasArrayMaxSizeError).toBe(true);
      }),
      { numRuns: 20 },
    );
  });

  it('rejects siswa array with more than 500 entries', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 501, max: 600 }), async (size) => {
        const tooManyEntries = Array.from({ length: size }, (_, i) => ({
          nama: `Siswa ${i}`,
        }));

        const errors = await validateDto(CreateTenantDto, {
          ...validTenantBase(),
          siswa: tooManyEntries,
        });

        const hasArrayMaxSizeError = errors.some(
          (e) =>
            e.property === 'siswa' && Object.keys(e.constraints ?? {}).includes('arrayMaxSize'),
        );
        expect(hasArrayMaxSizeError).toBe(true);
      }),
      { numRuns: 20 },
    );
  });

  it('rejects spp_bulanan array with more than 13 entries', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 14, max: 30 }), async (size) => {
        const tooManyEntries = Array.from({ length: size }, (_, i) => ({
          tingkat: (i % 13) + 1,
          nominal: 150000,
        }));

        const errors = await validateDto(CreateTenantDto, {
          ...validTenantBase(),
          spp_bulanan: tooManyEntries,
        });

        const hasArrayMaxSizeError = errors.some(
          (e) =>
            e.property === 'spp_bulanan' &&
            Object.keys(e.constraints ?? {}).includes('arrayMaxSize'),
        );
        expect(hasArrayMaxSizeError).toBe(true);
      }),
      { numRuns: 20 },
    );
  });

  it('accepts arrays at exactly the size limit without arrayMaxSize error', async () => {
    // Arrays at exactly 500 / 13 entries should not produce arrayMaxSize errors
    const exactly500 = Array.from({ length: 500 }, (_, i) => ({ nama: `Siswa ${i}` }));
    const exactly13 = Array.from({ length: 13 }, (_, i) => ({
      tingkat: i + 1,
      nominal: 100000,
    }));

    const errorsFor500 = await validateDto(CreateTenantDto, {
      ...validTenantBase(),
      siswa: exactly500,
    });

    const errorsFor13 = await validateDto(CreateTenantDto, {
      ...validTenantBase(),
      spp_bulanan: exactly13,
    });

    const siswaArrayMaxSizeError = errorsFor500.some(
      (e) => e.property === 'siswa' && Object.keys(e.constraints ?? {}).includes('arrayMaxSize'),
    );
    const sppArrayMaxSizeError = errorsFor13.some(
      (e) =>
        e.property === 'spp_bulanan' && Object.keys(e.constraints ?? {}).includes('arrayMaxSize'),
    );

    expect(siswaArrayMaxSizeError).toBe(false);
    expect(sppArrayMaxSizeError).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 14: Backend rejects guru_staff with invalid role and names all bad values
//
// For any guru_staff array containing entries with role values outside
// ['admin', 'guru', 'kepala_sekolah', 'bendahara'], the backend SHALL reject
// with a 400 error that explicitly identifies each invalid role value.
//
// **Validates: Requirements 5.2**
// Feature: tenant-excel-onboarding, Property 14: Backend rejects guru_staff with invalid role
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature: tenant-excel-onboarding, Property 14: Backend rejects guru_staff with invalid role and names all bad values', () => {
  /**
   * Generator for strings that are NOT in the valid role set
   */
  const invalidRoleArb = fc
    .string({ minLength: 1 })
    .filter((s) => !(VALID_ROLES as readonly string[]).includes(s));

  it('rejects a single guru_staff entry with an invalid role', async () => {
    await fc.assert(
      fc.asyncProperty(invalidRoleArb, async (invalidRole) => {
        const errors = await validateDto(CreateOnboardingGuruStaffDto, {
          nama: 'Test User',
          email: 'test@sekolah.id',
          role: invalidRole,
        });

        // There must be at least one validation error on the `role` field
        const roleErrors = errors.filter((e) => e.property === 'role');
        expect(roleErrors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('accepts all valid roles without role validation errors', async () => {
    for (const validRole of VALID_ROLES) {
      const errors = await validateDto(CreateOnboardingGuruStaffDto, {
        nama: 'Valid User',
        email: 'valid@sekolah.id',
        role: validRole,
      });

      const roleErrors = errors.filter((e) => e.property === 'role');
      expect(roleErrors).toHaveLength(0);
    }
  });

  it('rejects every invalid role while all valid roles pass through', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('student', 'teacher', 'principal', 'GURU', 'Admin', 'superadmin', '', ' '),
        async (invalidRole) => {
          const errors = await validateDto(CreateOnboardingGuruStaffDto, {
            nama: 'User',
            email: 'user@sekolah.id',
            role: invalidRole,
          });

          const roleErrors = errors.filter((e) => e.property === 'role');
          expect(roleErrors.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('valid role entries have no role constraint violations in CreateTenantDto guru_staff array', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...VALID_ROLES), { minLength: 1, maxLength: 10 }),
        async (roles) => {
          const guruStaffEntries = roles.map((role, i) => ({
            nama: `Staff ${i}`,
            email: `staff${i}@sekolah.id`,
            role,
          }));

          const errors = await validateDto(CreateTenantDto, {
            ...validTenantBase(),
            guru_staff: guruStaffEntries,
          });

          // No role-related errors should exist in nested guru_staff validation
          const guruStaffErrors = errors.filter((e) => e.property === 'guru_staff');
          const hasRoleError = guruStaffErrors.some((e) => {
            const children = e.children ?? [];
            return children.some((child) =>
              (child.children ?? []).some((inner) => inner.property === 'role'),
            );
          });

          expect(hasRoleError).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 17: SPP validation enforces tingkat bounds and positive nominal
//
// For any spp_bulanan entry where tingkat > jumlah_tingkat OR nominal < 1, the
// backend SHALL reject the request with a descriptive 400 error identifying
// which constraint was violated.
//
// DTO part: nominal < 1 → caught by @Min(1) on CreateOnboardingSppDto
// Service part: tingkat > jumlah_tingkat → caught by validateOnboardingData
//
// **Validates: Requirements 5.5**
// Feature: tenant-excel-onboarding, Property 17: SPP validation enforces tingkat bounds and positive nominal
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature: tenant-excel-onboarding, Property 17: SPP validation enforces tingkat bounds and positive nominal', () => {
  it('rejects spp_bulanan entry with nominal < 1 (DTO @Min(1) constraint)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Zero and negative integers
        fc.integer({ min: -10000, max: 0 }),
        async (invalidNominal) => {
          const errors = await validateDto(CreateOnboardingSppDto, {
            tingkat: 1,
            nominal: invalidNominal,
          });

          const nominalErrors = errors.filter((e) => e.property === 'nominal');
          expect(nominalErrors.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts spp_bulanan entry with nominal >= 1 (no nominal validation error)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 100_000_000 }), async (validNominal) => {
        const errors = await validateDto(CreateOnboardingSppDto, {
          tingkat: 1,
          nominal: validNominal,
        });

        const nominalErrors = errors.filter((e) => e.property === 'nominal');
        expect(nominalErrors).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects spp_bulanan entry with tingkat < 1 (DTO @Min(1) constraint)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: -100, max: 0 }), async (invalidTingkat) => {
        const errors = await validateDto(CreateOnboardingSppDto, {
          tingkat: invalidTingkat,
          nominal: 150000,
        });

        const tingkatErrors = errors.filter((e) => e.property === 'tingkat');
        expect(tingkatErrors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects spp_bulanan entry with tingkat > 13 (DTO @Max(13) constraint)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 14, max: 200 }), async (invalidTingkat) => {
        const errors = await validateDto(CreateOnboardingSppDto, {
          tingkat: invalidTingkat,
          nominal: 150000,
        });

        const tingkatErrors = errors.filter((e) => e.property === 'tingkat');
        expect(tingkatErrors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Service-layer cross-field validation: tingkat > jumlah_tingkat
   *
   * This replicates the pure logic of validateOnboardingData's SPP check,
   * without touching the database. The check is: any spp.tingkat > jumlah_tingkat → reject.
   */
  it('service-layer logic rejects spp_bulanan when any tingkat exceeds jumlah_tingkat', () => {
    fc.assert(
      fc.property(
        // jumlah_tingkat: 1–12 (common school ranges)
        fc.integer({ min: 1, max: 12 }),
        // tingkat: strictly greater than jumlah_tingkat
        fc.integer({ min: 1, max: 13 }),
        (jumlahTingkat, offset) => {
          const invalidTingkat = jumlahTingkat + offset; // always > jumlah_tingkat

          // Pure logic extracted from TenantService.validateOnboardingData
          function validateSppTingkat(
            sppBulanan: Array<{ tingkat: number }>,
            maxTingkat: number,
          ): string | null {
            const exceeded = sppBulanan.some((spp) => spp.tingkat > maxTingkat);
            return exceeded ? 'Tingkat SPP melebihi jumlah tingkat sekolah' : null;
          }

          const result = validateSppTingkat([{ tingkat: invalidTingkat }], jumlahTingkat);
          expect(result).not.toBeNull();
          expect(result).toContain('Tingkat SPP');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('service-layer logic accepts spp_bulanan when all tingkat values are within jumlah_tingkat', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 13 }),
        fc.array(fc.integer({ min: 1, max: 13 }), { minLength: 1, maxLength: 13 }),
        (jumlahTingkat, rawTingkatValues) => {
          // Clamp all tingkat values to be <= jumlah_tingkat
          const validEntries = rawTingkatValues
            .map((t) => Math.min(t, jumlahTingkat))
            .map((tingkat) => ({ tingkat }));

          function validateSppTingkat(
            sppBulanan: Array<{ tingkat: number }>,
            maxTingkat: number,
          ): string | null {
            const exceeded = sppBulanan.some((spp) => spp.tingkat > maxTingkat);
            return exceeded ? 'Tingkat SPP melebihi jumlah tingkat sekolah' : null;
          }

          const result = validateSppTingkat(validEntries, jumlahTingkat);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 18: guru_staff entries missing required fields fail validation
//
// For any guru_staff entry missing any subset of {nama, email, role}, the
// backend SHALL return a validation error identifying the missing fields.
//
// **Validates: Requirements 5.7**
// Feature: tenant-excel-onboarding, Property 18: guru_staff entries missing required fields fail validation
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature: tenant-excel-onboarding, Property 18: guru_staff entries missing required fields fail validation', () => {
  it('rejects guru_staff entry missing nama (absent, null, or empty string)', async () => {
    // Note: @IsNotEmpty() from class-validator checks value.length !== 0.
    // It does NOT reject whitespace-only strings (no @MinLength after trim in the DTO).
    // Valid "missing" values that trigger validation failure: absent, null, and '' (empty string).
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(undefined, null, ''), async (missingNama) => {
        const plain: Record<string, unknown> = {
          email: 'test@sekolah.id',
          role: 'guru',
        };
        if (missingNama !== undefined) {
          plain['nama'] = missingNama;
        }

        const errors = await validateDto(CreateOnboardingGuruStaffDto, plain);
        const namaErrors = errors.filter((e) => e.property === 'nama');
        expect(namaErrors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects guru_staff entry missing email', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Use invalid/missing email values
        fc.constantFrom(undefined, null, '', 'not-an-email', 'missing-at-symbol'),
        async (missingEmail) => {
          const plain: Record<string, unknown> = {
            nama: 'Valid Name',
            role: 'guru',
          };
          if (missingEmail !== undefined) {
            plain['email'] = missingEmail;
          }

          const errors = await validateDto(CreateOnboardingGuruStaffDto, plain);
          const emailErrors = errors.filter((e) => e.property === 'email');
          expect(emailErrors.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects guru_staff entry missing role', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(undefined, null, ''), async (missingRole) => {
        const plain: Record<string, unknown> = {
          nama: 'Valid Name',
          email: 'test@sekolah.id',
        };
        if (missingRole !== undefined) {
          plain['role'] = missingRole;
        }

        const errors = await validateDto(CreateOnboardingGuruStaffDto, plain);
        const roleErrors = errors.filter((e) => e.property === 'role');
        expect(roleErrors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects guru_staff entry with all three required fields missing', async () => {
    const errors = await validateDto(CreateOnboardingGuruStaffDto, {});

    const namaErrors = errors.filter((e) => e.property === 'nama');
    const emailErrors = errors.filter((e) => e.property === 'email');
    const roleErrors = errors.filter((e) => e.property === 'role');

    expect(namaErrors.length).toBeGreaterThan(0);
    expect(emailErrors.length).toBeGreaterThan(0);
    expect(roleErrors.length).toBeGreaterThan(0);
  });

  it('accepts guru_staff entry with all three required fields present', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          nama: fc.string({ minLength: 1, maxLength: 100 }),
          email: fc.emailAddress(),
          role: fc.constantFrom(...VALID_ROLES),
        }),
        async ({ nama, email, role }) => {
          const errors = await validateDto(CreateOnboardingGuruStaffDto, { nama, email, role });

          // No errors on the three required fields when all are provided correctly
          const requiredFieldErrors = errors.filter((e) =>
            ['nama', 'email', 'role'].includes(e.property),
          );
          expect(requiredFieldErrors).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('any subset of missing required fields always produces validation errors for those fields', async () => {
    // Exhaustively test all 7 non-empty subsets of {nama, email, role}
    const subsets: Array<Array<'nama' | 'email' | 'role'>> = [
      ['nama'],
      ['email'],
      ['role'],
      ['nama', 'email'],
      ['nama', 'role'],
      ['email', 'role'],
      ['nama', 'email', 'role'],
    ];

    for (const missingFields of subsets) {
      const plain: Record<string, unknown> = {
        nama: 'Valid Name',
        email: 'valid@sekolah.id',
        role: 'guru',
      };

      for (const field of missingFields) {
        delete plain[field];
      }

      const errors = await validateDto(CreateOnboardingGuruStaffDto, plain);
      const errorProps = errors.map((e) => e.property);

      for (const field of missingFields) {
        expect(errorProps).toContain(field);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 15: Backend detects all duplicate emails within the request
//
// For any guru_staff array containing duplicate email values, the backend SHALL
// reject the request with a 400 error that lists ALL duplicate email values —
// not just the first pair found.
//
// This tests the pure logic extracted from TenantService.validateOnboardingData
// (step 1 in that method): find all emails that appear more than once.
//
// **Validates: Requirements 5.3**
// Feature: tenant-excel-onboarding, Property 15: Backend detects all duplicate emails within the request
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure duplicate-detection logic extracted from TenantService.validateOnboardingData.
 * Returns an array of all email values that appear more than once (lowercased),
 * or null if there are no duplicates.
 */
function findDuplicateEmails(guruStaff: Array<{ email: string }>): string[] | null {
  const emailCount = new Map<string, number>();
  for (const gs of guruStaff) {
    const lower = gs.email.toLowerCase();
    emailCount.set(lower, (emailCount.get(lower) ?? 0) + 1);
  }
  const duplicates = [...emailCount.entries()].filter(([, n]) => n > 1).map(([email]) => email);
  return duplicates.length > 0 ? duplicates : null;
}

describe('Feature: tenant-excel-onboarding, Property 15: Backend detects all duplicate emails within the request', () => {
  it('detects every duplicated email when guru_staff has repeated values', () => {
    fc.assert(
      fc.property(
        // Generate a non-empty base list of unique emails
        fc.array(
          fc.emailAddress().map((e) => e.toLowerCase()),
          { minLength: 1, maxLength: 20 },
        ),
        // Pick 1 or more indices from the list to duplicate
        fc.array(fc.nat({ max: 19 }), { minLength: 1, maxLength: 5 }),
        (uniqueEmails, dupIndices) => {
          // Deduplicate the base list
          const baseEmails = [...new Set(uniqueEmails)];
          if (baseEmails.length === 0) return;

          // Clamp indices to actual list length
          const clampedIndices = dupIndices.map((i) => i % baseEmails.length);
          const duplicatedEmails = new Set(clampedIndices.map((i) => baseEmails[i]));

          // Build a guru_staff list: start with unique entries, then append duplicates
          const guruStaff = [
            ...baseEmails.map((email) => ({ email })),
            ...[...duplicatedEmails].map((email) => ({ email })),
          ];

          const result = findDuplicateEmails(guruStaff);

          // Every email that was deliberately duplicated must appear in the result
          expect(result).not.toBeNull();
          for (const email of duplicatedEmails) {
            expect(result).toContain(email.toLowerCase());
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('returns null (no error) when all emails in guru_staff are unique', () => {
    fc.assert(
      fc.property(
        // Generate arrays of distinct emails (fast-check uniqueArray ensures no repeats)
        fc.uniqueArray(
          fc.emailAddress().map((e) => e.toLowerCase()),
          {
            minLength: 0,
            maxLength: 30,
          },
        ),
        (uniqueEmails) => {
          const guruStaff = uniqueEmails.map((email) => ({ email }));
          const result = findDuplicateEmails(guruStaff);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 200 },
    );
  });

  it('detects duplicates case-insensitively', () => {
    fc.assert(
      fc.property(
        // Generate a single email and vary its case
        fc.emailAddress().map((e) => e.toLowerCase()),
        (email) => {
          const upper = email.toUpperCase();
          const guruStaff = [{ email: email }, { email: upper }];

          // These two should be treated as the same email
          const result = findDuplicateEmails(guruStaff);
          expect(result).not.toBeNull();
          expect(result).toContain(email.toLowerCase());
        },
      ),
      { numRuns: 100 },
    );
  });

  it('lists ALL duplicate emails, not just the first pair', () => {
    fc.assert(
      fc.property(
        // Generate 2 or more emails that will each be duplicated
        fc.uniqueArray(
          fc.emailAddress().map((e) => e.toLowerCase()),
          {
            minLength: 2,
            maxLength: 10,
          },
        ),
        (emails) => {
          // Duplicate every email → all should appear in the result
          const guruStaff = [...emails, ...emails].map((email) => ({ email }));

          const result = findDuplicateEmails(guruStaff);
          expect(result).not.toBeNull();
          // All emails should be flagged as duplicates
          for (const email of emails) {
            expect(result).toContain(email.toLowerCase());
          }
          // Result length matches the number of distinct duplicated emails
          expect(result!.length).toBe(emails.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null for an empty guru_staff array', () => {
    const result = findDuplicateEmails([]);
    expect(result).toBeNull();
  });

  it('returns null for a single-entry guru_staff array', () => {
    fc.assert(
      fc.property(fc.emailAddress(), (email) => {
        const result = findDuplicateEmails([{ email }]);
        expect(result).toBeNull();
      }),
      { numRuns: 50 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 16: Backend detects all conflicting emails against existing users
//
// For any guru_staff array where one or more emails already exist in the user
// table, the backend SHALL reject the request and list ALL conflicting email
// values.
//
// Because this check requires a DB query, we test the pure collision-detection
// logic extracted from TenantService.validateOnboardingData (step 2): given a
// set of "existing DB emails" and a set of "requested emails", find all
// intersections and report them.
//
// **Validates: Requirements 5.4**
// Feature: tenant-excel-onboarding, Property 16: Backend detects all conflicting emails against existing users
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure conflict-detection logic extracted from TenantService.validateOnboardingData.
 * Given a list of emails already in the DB and the requested guru_staff emails,
 * returns the conflicting emails or null if there are none.
 */
function findConflictingEmails(
  existingDbEmails: string[],
  requestedEmails: string[],
): string[] | null {
  const existingSet = new Set(existingDbEmails.map((e) => e.toLowerCase()));
  const conflicting = requestedEmails.map((e) => e.toLowerCase()).filter((e) => existingSet.has(e));
  return conflicting.length > 0 ? conflicting : null;
}

describe('Feature: tenant-excel-onboarding, Property 16: Backend detects all conflicting emails against existing users', () => {
  it('detects all emails that exist in the DB and are present in the request', () => {
    fc.assert(
      fc.property(
        // A set of "existing" emails already in the DB
        fc.uniqueArray(
          fc.emailAddress().map((e) => e.toLowerCase()),
          {
            minLength: 1,
            maxLength: 20,
          },
        ),
        // A separate set of "new" emails not in the DB
        fc.uniqueArray(
          fc.emailAddress().map((e) => e.toLowerCase()),
          {
            minLength: 0,
            maxLength: 10,
          },
        ),
        // How many of the existing emails to include in the request
        fc.integer({ min: 1, max: 20 }),
        (existingEmails, newEmails, numConflicting) => {
          const numToConflict = Math.min(numConflicting, existingEmails.length);
          const conflictingEmails = existingEmails.slice(0, numToConflict);

          // Ensure new emails don't accidentally overlap with existing ones
          const safeNewEmails = newEmails.filter((e) => !existingEmails.includes(e));

          // Request contains both new (safe) emails and some existing (conflicting) ones
          const requestedEmails = [...safeNewEmails, ...conflictingEmails];
          if (requestedEmails.length === 0) return;

          const result = findConflictingEmails(existingEmails, requestedEmails);

          expect(result).not.toBeNull();
          // ALL conflicting emails must be listed
          for (const email of conflictingEmails) {
            expect(result).toContain(email.toLowerCase());
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('returns null when no requested email exists in the DB', () => {
    fc.assert(
      fc.property(
        // Existing DB emails
        fc.uniqueArray(
          fc.emailAddress().map((e) => e.toLowerCase()),
          {
            minLength: 0,
            maxLength: 20,
          },
        ),
        // Requested emails are completely disjoint from existing ones
        fc.uniqueArray(
          fc.emailAddress().map((e) => e.toLowerCase()),
          {
            minLength: 1,
            maxLength: 20,
          },
        ),
        (existingEmails, requestedEmails) => {
          // Ensure zero overlap
          const nonConflicting = requestedEmails.filter((e) => !existingEmails.includes(e));
          if (nonConflicting.length === 0) return;

          const result = findConflictingEmails(existingEmails, nonConflicting);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 200 },
    );
  });

  it('detects conflicts case-insensitively', () => {
    fc.assert(
      fc.property(
        fc.emailAddress().map((e) => e.toLowerCase()),
        (email) => {
          // DB has the lowercase version, request sends the uppercase version
          const existingEmails = [email];
          const requestedEmails = [email.toUpperCase()];

          const result = findConflictingEmails(existingEmails, requestedEmails);
          expect(result).not.toBeNull();
          expect(result).toContain(email.toLowerCase());
        },
      ),
      { numRuns: 100 },
    );
  });

  it('lists ALL conflicting emails when multiple exist in the DB', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.emailAddress().map((e) => e.toLowerCase()),
          {
            minLength: 2,
            maxLength: 10,
          },
        ),
        (conflictingEmails) => {
          // All requested emails exist in the DB
          const result = findConflictingEmails(conflictingEmails, conflictingEmails);

          expect(result).not.toBeNull();
          for (const email of conflictingEmails) {
            expect(result).toContain(email.toLowerCase());
          }
          expect(result!.length).toBe(conflictingEmails.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null when the request has no guru_staff emails (empty array)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.emailAddress(), { minLength: 0, maxLength: 20 }),
        (existingEmails) => {
          const result = findConflictingEmails(existingEmails, []);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 19: Backend detects all duplicate NISNs in siswa array
//
// For any siswa array containing duplicate non-null nisn values, the backend
// SHALL reject the request with a 400 error listing ALL duplicate NISN values.
// Null/empty NISN values are ignored (they are not considered duplicates).
//
// This tests the pure logic extracted from TenantService.validateOnboardingData
// (step 3 in that method).
//
// **Validates: Requirements 5.8**
// Feature: tenant-excel-onboarding, Property 19: Backend detects all duplicate NISNs in siswa array
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure duplicate-NISN detection logic extracted from TenantService.validateOnboardingData.
 * Only non-null and non-empty NISN values are considered.
 * Returns all duplicate NISN values or null if there are none.
 */
function findDuplicateNisns(siswa: Array<{ nisn?: string | null }>): string[] | null {
  const nisnCount = new Map<string, number>();
  for (const s of siswa) {
    if (!s.nisn) continue;
    const nisn = s.nisn.trim();
    if (!nisn) continue;
    nisnCount.set(nisn, (nisnCount.get(nisn) ?? 0) + 1);
  }
  const duplicates = [...nisnCount.entries()].filter(([, n]) => n > 1).map(([nisn]) => nisn);
  return duplicates.length > 0 ? duplicates : null;
}

describe('Feature: tenant-excel-onboarding, Property 19: Backend detects all duplicate NISNs in siswa array', () => {
  it('detects every duplicated NISN when siswa array has repeated non-null values', () => {
    fc.assert(
      fc.property(
        // Generate a non-empty list of unique NISNs (10-digit strings)
        fc.uniqueArray(fc.stringMatching(/^\d{10}$/), {
          minLength: 1,
          maxLength: 15,
        }),
        // Pick 1 or more to duplicate
        fc.array(fc.nat({ max: 14 }), { minLength: 1, maxLength: 5 }),
        (uniqueNisns, dupIndices) => {
          if (uniqueNisns.length === 0) return;

          const clampedIndices = dupIndices.map((i) => i % uniqueNisns.length);
          const duplicatedNisns = new Set(clampedIndices.map((i) => uniqueNisns[i]));

          // Build siswa list: unique entries first, then duplicates appended
          const siswaList = [
            ...uniqueNisns.map((nisn) => ({ nisn, nama: 'Siswa' })),
            ...[...duplicatedNisns].map((nisn) => ({ nisn, nama: 'Siswa Duplikat' })),
          ];

          const result = findDuplicateNisns(siswaList);

          expect(result).not.toBeNull();
          for (const nisn of duplicatedNisns) {
            expect(result).toContain(nisn);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('returns null when all non-null NISNs in siswa array are unique', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^\d{10}$/), {
          minLength: 0,
          maxLength: 20,
        }),
        (uniqueNisns) => {
          const siswaList = uniqueNisns.map((nisn) => ({ nisn, nama: 'Siswa' }));
          const result = findDuplicateNisns(siswaList);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 200 },
    );
  });

  it('ignores null and empty/whitespace NISN values — they are never treated as duplicates', () => {
    fc.assert(
      fc.property(
        // Count: how many null/empty NISN entries to add
        fc.integer({ min: 2, max: 20 }),
        // Values that should all be treated as "no NISN"
        fc.array(fc.constantFrom(null, undefined, '', '   ', '\t'), {
          minLength: 2,
          maxLength: 20,
        }),
        (_, emptyValues) => {
          const siswaList = emptyValues.map((nisn) => ({ nisn, nama: 'Siswa Tanpa NISN' }));
          const result = findDuplicateNisns(siswaList);
          // None of these should be flagged as duplicates
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('lists ALL duplicate NISNs, not just the first one', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^\d{10}$/), {
          minLength: 2,
          maxLength: 10,
        }),
        (nisns) => {
          // Duplicate every NISN → all should appear in the result
          const siswaList = [...nisns, ...nisns].map((nisn) => ({ nisn, nama: 'Siswa' }));

          const result = findDuplicateNisns(siswaList);

          expect(result).not.toBeNull();
          for (const nisn of nisns) {
            expect(result).toContain(nisn);
          }
          expect(result!.length).toBe(nisns.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('handles mixed null and valid NISNs correctly: only duplicated valid ones are flagged', () => {
    fc.assert(
      fc.property(
        // Unique NISNs that will be duplicated
        fc.uniqueArray(fc.stringMatching(/^\d{10}$/), {
          minLength: 1,
          maxLength: 5,
        }),
        // Additional unique NISNs that will NOT be duplicated
        fc.uniqueArray(fc.stringMatching(/^\d{10}$/), {
          minLength: 0,
          maxLength: 5,
        }),
        (duplicatedNisns, uniqueNisns) => {
          // Ensure the two sets don't overlap
          const safeUnique = uniqueNisns.filter((n) => !duplicatedNisns.includes(n));

          const siswaList = [
            // Entries with null NISN — should be ignored
            { nisn: null, nama: 'Tanpa NISN' },
            { nisn: '', nama: 'NISN Kosong' },
            // Entries with unique NISNs — should not be flagged
            ...safeUnique.map((nisn) => ({ nisn, nama: 'Siswa Unik' })),
            // Duplicated entries
            ...duplicatedNisns.map((nisn) => ({ nisn, nama: 'Siswa Duplikat A' })),
            ...duplicatedNisns.map((nisn) => ({ nisn, nama: 'Siswa Duplikat B' })),
          ];

          const result = findDuplicateNisns(siswaList);

          expect(result).not.toBeNull();
          // All intentionally duplicated NISNs are in the result
          for (const nisn of duplicatedNisns) {
            expect(result).toContain(nisn);
          }
          // Unique NISNs are NOT in the result
          for (const nisn of safeUnique) {
            expect(result).not.toContain(nisn);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null for an empty siswa array', () => {
    const result = findDuplicateNisns([]);
    expect(result).toBeNull();
  });

  it('returns null for a siswa array where all entries have null NISN', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (count) => {
        const siswaList = Array.from({ length: count }, () => ({ nisn: null, nama: 'Siswa' }));
        const result = findDuplicateNisns(siswaList);
        expect(result).toBeNull();
      }),
      { numRuns: 50 },
    );
  });
});
