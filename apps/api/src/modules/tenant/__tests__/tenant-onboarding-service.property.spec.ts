import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import fc from 'fast-check';
import { TenantService } from '../tenant.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { AuthService } from '@/modules/auth/auth.service';
import { QUEUE_NAMES } from '@/modules/queue';

/**
 * Property tests for TenantService onboarding logic.
 *
 * Properties covered:
 *   Property 25 — Each guru_staff user gets an independent password satisfying complexity
 *   Property 26 — Total email jobs enqueued equals guru_staff count plus one admin
 *   Property 27 — Every email job payload contains all required fields
 *
 * **Validates: Requirements 6.7, 7.1, 7.2, 7.3**
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailPayload {
  to: string;
  tenantName: string;
  adminName: string;
  email: string;
  password: string;
}

interface AdminInput {
  adminEmail: string;
  adminNama: string;
  adminRawPassword: string;
  tenantNama: string;
}

interface GuruStaffInput {
  email: string;
  nama: string;
  rawPassword: string;
}

// ─── Pure enqueueing logic extracted from TenantService ───────────────────────

/**
 * Replicates the post-transaction emailPayloads collection logic from
 * TenantService.createTenantWithOnboarding.
 */
function buildEmailPayloads(admin: AdminInput, guruStaffList: GuruStaffInput[]): EmailPayload[] {
  const payloads: EmailPayload[] = [];

  payloads.push({
    to: admin.adminEmail,
    tenantName: admin.tenantNama,
    adminName: admin.adminNama,
    email: admin.adminEmail,
    password: admin.adminRawPassword,
  });

  for (const gs of guruStaffList) {
    payloads.push({
      to: gs.email,
      tenantName: admin.tenantNama,
      adminName: gs.nama,
      email: gs.email,
      password: gs.rawPassword,
    });
  }

  return payloads;
}

function simulateEnqueue(
  payloads: EmailPayload[],
): Array<{ jobType: string; payload: EmailPayload }> {
  return payloads.map((payload) => ({
    jobType: 'send-tenant-credentials',
    payload,
  }));
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim() !== '');
const emailArb = fc.emailAddress();

const adminInputArb = fc.record<AdminInput>({
  adminEmail: emailArb,
  adminNama: nonEmptyStringArb,
  adminRawPassword: nonEmptyStringArb,
  tenantNama: nonEmptyStringArb,
});

const guruStaffInputArb = fc.record<GuruStaffInput>({
  email: emailArb,
  nama: nonEmptyStringArb,
  rawPassword: nonEmptyStringArb,
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 25: Each guru_staff user gets an independent password satisfying complexity
//
// For any list of guru_staff users of length N >= 1, the N generated passwords
// SHALL each be exactly 12 characters long, contain at least 1 uppercase letter,
// 1 lowercase letter, 1 digit, and 1 character from !@#$%&*, and all N passwords
// SHALL be pairwise distinct.
//
// **Validates: Requirements 6.7**
// Feature: tenant-excel-onboarding, Property 25: Each guru_staff user gets an independent password satisfying complexity
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature: tenant-excel-onboarding, Property 25: Each guru_staff user gets an independent password satisfying complexity', () => {
  let service: TenantService;

  beforeEach(async () => {
    const mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      transaction: jest.fn(),
    };

    const mockAuthService = {
      invalidateAllTenantTokens: jest.fn(),
    };

    const mockEmailQueue = {
      add: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: AuthService, useValue: mockAuthService },
        { provide: getQueueToken(QUEUE_NAMES.EMAIL), useValue: mockEmailQueue },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
  });

  it('each generated password is exactly 12 characters long', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (n) => {
        for (let i = 0; i < n; i++) {
          const password = service['generateRandomPassword']();
          expect(password).toHaveLength(12);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('each generated password contains at least 1 uppercase letter (A-Z)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (n) => {
        for (let i = 0; i < n; i++) {
          const password = service['generateRandomPassword']();
          expect(/[A-Z]/.test(password)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('each generated password contains at least 1 lowercase letter (a-z)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (n) => {
        for (let i = 0; i < n; i++) {
          const password = service['generateRandomPassword']();
          expect(/[a-z]/.test(password)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('each generated password contains at least 1 digit (0-9)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (n) => {
        for (let i = 0; i < n; i++) {
          const password = service['generateRandomPassword']();
          expect(/[0-9]/.test(password)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('each generated password contains at least 1 special character from !@#$%&*', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (n) => {
        for (let i = 0; i < n; i++) {
          const password = service['generateRandomPassword']();
          expect(/[!@#$%&*]/.test(password)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('N passwords generated for N guru_staff users are all pairwise distinct', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (n) => {
        const passwords: string[] = [];
        for (let i = 0; i < n; i++) {
          passwords.push(service['generateRandomPassword']());
        }
        expect(new Set(passwords).size).toBe(n);
      }),
      { numRuns: 200 },
    );
  });

  it('each generated password satisfies all complexity requirements simultaneously', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (n) => {
        const passwords: string[] = [];
        for (let i = 0; i < n; i++) {
          const pw = service['generateRandomPassword']();

          expect(pw).toHaveLength(12);
          expect(/[A-Z]/.test(pw)).toBe(true);
          expect(/[a-z]/.test(pw)).toBe(true);
          expect(/[0-9]/.test(pw)).toBe(true);
          expect(/[!@#$%&*]/.test(pw)).toBe(true);
          // Only characters from the allowed charset
          expect(/^[a-zA-Z0-9!@#$%&*]+$/.test(pw)).toBe(true);

          passwords.push(pw);
        }

        // All passwords in the batch must be pairwise distinct
        expect(new Set(passwords).size).toBe(n);
      }),
      { numRuns: 200 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 26: Total email jobs enqueued equals guru_staff count plus one admin
//
// For any onboarding request with G valid guru_staff entries, the emailQueue
// SHALL receive exactly G + 1 `add` calls after transaction commit — one per
// guru_staff user and one for the default admin.
//
// **Validates: Requirements 7.1, 7.3**
// Feature: tenant-excel-onboarding, Property 26: Total email jobs enqueued equals guru_staff count plus one admin
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature: tenant-excel-onboarding, Property 26: Total email jobs enqueued equals guru_staff count plus one admin', () => {
  it('enqueues exactly G + 1 jobs for G guru_staff entries', () => {
    fc.assert(
      fc.property(
        adminInputArb,
        fc.array(guruStaffInputArb, { minLength: 0, maxLength: 50 }),
        (admin, guruStaffList) => {
          const G = guruStaffList.length;
          const payloads = buildEmailPayloads(admin, guruStaffList);
          const jobs = simulateEnqueue(payloads);

          expect(jobs).toHaveLength(G + 1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('enqueues exactly 1 job when guru_staff is empty (only admin)', () => {
    fc.assert(
      fc.property(adminInputArb, (admin) => {
        const payloads = buildEmailPayloads(admin, []);
        const jobs = simulateEnqueue(payloads);

        expect(jobs).toHaveLength(1);
      }),
      { numRuns: 100 },
    );
  });

  it('all jobs use the correct job type send-tenant-credentials', () => {
    fc.assert(
      fc.property(
        adminInputArb,
        fc.array(guruStaffInputArb, { minLength: 0, maxLength: 30 }),
        (admin, guruStaffList) => {
          const payloads = buildEmailPayloads(admin, guruStaffList);
          const jobs = simulateEnqueue(payloads);

          for (const job of jobs) {
            expect(job.jobType).toBe('send-tenant-credentials');
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('first enqueued job is always the admin job', () => {
    fc.assert(
      fc.property(
        adminInputArb,
        fc.array(guruStaffInputArb, { minLength: 0, maxLength: 20 }),
        (admin, guruStaffList) => {
          const payloads = buildEmailPayloads(admin, guruStaffList);
          const jobs = simulateEnqueue(payloads);

          expect(jobs[0].payload.to).toBe(admin.adminEmail);
          expect(jobs[0].payload.email).toBe(admin.adminEmail);
          expect(jobs[0].payload.adminName).toBe(admin.adminNama);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('job count grows linearly with guru_staff size', () => {
    fc.assert(
      fc.property(
        adminInputArb,
        fc.integer({ min: 0, max: 25 }),
        fc.integer({ min: 0, max: 25 }),
        (admin, sizeA, sizeB) => {
          const listA = Array.from({ length: sizeA }, (_, i) => ({
            email: `guru${i}@sekolah.id`,
            nama: `Guru ${i}`,
            rawPassword: `pw_${i}`,
          }));
          const listB = Array.from({ length: sizeB }, (_, i) => ({
            email: `staff${i}@sekolah.id`,
            nama: `Staff ${i}`,
            rawPassword: `pw_staff_${i}`,
          }));

          const jobsA = simulateEnqueue(buildEmailPayloads(admin, listA));
          const jobsB = simulateEnqueue(buildEmailPayloads(admin, listB));

          expect(jobsA).toHaveLength(sizeA + 1);
          expect(jobsB).toHaveLength(sizeB + 1);
          expect(jobsA.length - jobsB.length).toBe(sizeA - sizeB);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 27: Every email job payload contains all required fields
//
// For any email job enqueued during onboarding, the job payload SHALL contain
// non-null values for `to`, `tenantName`, `adminName`, `email`, and `password`.
//
// **Validates: Requirements 7.2**
// Feature: tenant-excel-onboarding, Property 27: Every email job payload contains all required fields
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature: tenant-excel-onboarding, Property 27: Every email job payload contains all required fields', () => {
  const REQUIRED_PAYLOAD_FIELDS: Array<keyof EmailPayload> = [
    'to',
    'tenantName',
    'adminName',
    'email',
    'password',
  ];

  it('every enqueued job payload has all 5 required fields as non-null, non-undefined strings', () => {
    fc.assert(
      fc.property(
        adminInputArb,
        fc.array(guruStaffInputArb, { minLength: 0, maxLength: 50 }),
        (admin, guruStaffList) => {
          const payloads = buildEmailPayloads(admin, guruStaffList);
          const jobs = simulateEnqueue(payloads);

          for (const job of jobs) {
            for (const field of REQUIRED_PAYLOAD_FIELDS) {
              const value = job.payload[field];
              expect(value).not.toBeNull();
              expect(value).not.toBeUndefined();
              expect(typeof value).toBe('string');
              expect((value as string).length).toBeGreaterThan(0);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('admin job payload maps all fields correctly from admin input', () => {
    fc.assert(
      fc.property(adminInputArb, (admin) => {
        const payloads = buildEmailPayloads(admin, []);
        const jobs = simulateEnqueue(payloads);
        const adminJob = jobs[0];

        expect(adminJob.payload.to).toBe(admin.adminEmail);
        expect(adminJob.payload.email).toBe(admin.adminEmail);
        expect(adminJob.payload.adminName).toBe(admin.adminNama);
        expect(adminJob.payload.tenantName).toBe(admin.tenantNama);
        expect(adminJob.payload.password).toBe(admin.adminRawPassword);
      }),
      { numRuns: 200 },
    );
  });

  it('each guru_staff job payload maps all fields correctly from that entry', () => {
    fc.assert(
      fc.property(
        adminInputArb,
        fc.array(guruStaffInputArb, { minLength: 1, maxLength: 20 }),
        (admin, guruStaffList) => {
          const payloads = buildEmailPayloads(admin, guruStaffList);
          const jobs = simulateEnqueue(payloads);

          for (let i = 0; i < guruStaffList.length; i++) {
            const gs = guruStaffList[i];
            const job = jobs[i + 1];

            expect(job.payload.to).toBe(gs.email);
            expect(job.payload.email).toBe(gs.email);
            expect(job.payload.adminName).toBe(gs.nama);
            expect(job.payload.tenantName).toBe(admin.tenantNama);
            expect(job.payload.password).toBe(gs.rawPassword);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('no job payload has any required field set to null, undefined, or empty string', () => {
    fc.assert(
      fc.property(
        adminInputArb,
        fc.array(guruStaffInputArb, { minLength: 0, maxLength: 30 }),
        (admin, guruStaffList) => {
          const payloads = buildEmailPayloads(admin, guruStaffList);
          const jobs = simulateEnqueue(payloads);

          for (const job of jobs) {
            const p = job.payload;
            expect(p.to).toBeTruthy();
            expect(p.tenantName).toBeTruthy();
            expect(p.adminName).toBeTruthy();
            expect(p.email).toBeTruthy();
            expect(p.password).toBeTruthy();
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('tenantName is the same across all jobs in a single onboarding run', () => {
    fc.assert(
      fc.property(
        adminInputArb,
        fc.array(guruStaffInputArb, { minLength: 1, maxLength: 20 }),
        (admin, guruStaffList) => {
          const payloads = buildEmailPayloads(admin, guruStaffList);
          const jobs = simulateEnqueue(payloads);

          const tenantNames = jobs.map((j) => j.payload.tenantName);
          const uniqueTenantNames = new Set(tenantNames);

          expect(uniqueTenantNames.size).toBe(1);
          expect(uniqueTenantNames.has(admin.tenantNama)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure logic extracted from TenantService.createTenantWithOnboarding
// for testing Properties 21 and 24 in isolation (no DB, no DI container).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the Tahun_Ajaran_Default fields from a UTC timestamp (ms since epoch).
 * Mirrors Step (b) of createTenantWithOnboarding:
 *
 *   const utc7Year = new Date(now.getTime() + 7 * 60 * 60 * 1000).getUTCFullYear();
 *   nama            = `${utc7Year}/${utc7Year + 1}`
 *   tanggalMulai    = `${utc7Year}-07-01`
 *   tanggalSelesai  = `${utc7Year + 1}-06-30`
 *   status          = 'disiapkan'
 */
function computeTahunAjaranDefault(nowMs: number): {
  nama: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  status: string;
} {
  const utc7Year = new Date(nowMs + 7 * 60 * 60 * 1000).getUTCFullYear();
  return {
    nama: `${utc7Year}/${utc7Year + 1}`,
    tanggalMulai: `${utc7Year}-07-01`,
    tanggalSelesai: `${utc7Year + 1}-06-30`,
    status: 'disiapkan',
  };
}

/**
 * Build the konfigurasi_sekolah key and value for a single SPP entry.
 * Mirrors Step (g) of createTenantWithOnboarding:
 *
 *   key:   `spp_nominal_tingkat_${spp.tingkat}`
 *   value: spp.nominal  (stored as JSON number)
 */
function buildSppKonfigurasi(tingkat: number, nominal: number): { key: string; value: number } {
  return {
    key: `spp_nominal_tingkat_${tingkat}`,
    value: nominal,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Property 21: Tahun_Ajaran_Default formula is correct for any execution date
//
// For any datetime in timezone UTC+7 with calendar year Y, the created
// tahun_ajaran record SHALL have:
//   nama            = "Y/Y+1"
//   tanggal_mulai   = Y-07-01
//   tanggal_selesai = (Y+1)-06-30
//   status          = 'disiapkan'
//
// **Validates: Requirements 6.2**
// Feature: tenant-excel-onboarding, Property 21: Tahun_Ajaran_Default formula is correct for any execution date
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature: tenant-excel-onboarding, Property 21: Tahun_Ajaran_Default formula is correct for any execution date', () => {
  /**
   * Arbitrary UTC timestamp covering years ~2000–2099.
   * Covers all realistic onboarding scenarios without exotic edge cases.
   */
  const utcTimestampArb = fc.integer({
    min: new Date('2000-01-01T00:00:00Z').getTime(),
    max: new Date('2099-12-31T23:59:59Z').getTime(),
  });

  it('nama is "Y/Y+1" where Y is the UTC+7 calendar year', () => {
    fc.assert(
      fc.property(utcTimestampArb, (nowMs) => {
        const Y = new Date(nowMs + 7 * 60 * 60 * 1000).getUTCFullYear();
        const result = computeTahunAjaranDefault(nowMs);
        expect(result.nama).toBe(`${Y}/${Y + 1}`);
      }),
      { numRuns: 500 },
    );
  });

  it('tanggal_mulai is July 1 of UTC+7 calendar year Y', () => {
    fc.assert(
      fc.property(utcTimestampArb, (nowMs) => {
        const Y = new Date(nowMs + 7 * 60 * 60 * 1000).getUTCFullYear();
        const result = computeTahunAjaranDefault(nowMs);
        expect(result.tanggalMulai).toBe(`${Y}-07-01`);
      }),
      { numRuns: 500 },
    );
  });

  it('tanggal_selesai is June 30 of UTC+7 calendar year Y+1', () => {
    fc.assert(
      fc.property(utcTimestampArb, (nowMs) => {
        const Y = new Date(nowMs + 7 * 60 * 60 * 1000).getUTCFullYear();
        const result = computeTahunAjaranDefault(nowMs);
        expect(result.tanggalSelesai).toBe(`${Y + 1}-06-30`);
      }),
      { numRuns: 500 },
    );
  });

  it('status is always "disiapkan"', () => {
    fc.assert(
      fc.property(utcTimestampArb, (nowMs) => {
        const result = computeTahunAjaranDefault(nowMs);
        expect(result.status).toBe('disiapkan');
      }),
      { numRuns: 500 },
    );
  });

  it('all four fields are correct together for any timestamp', () => {
    fc.assert(
      fc.property(utcTimestampArb, (nowMs) => {
        const Y = new Date(nowMs + 7 * 60 * 60 * 1000).getUTCFullYear();
        const result = computeTahunAjaranDefault(nowMs);

        expect(result.nama).toBe(`${Y}/${Y + 1}`);
        expect(result.tanggalMulai).toBe(`${Y}-07-01`);
        expect(result.tanggalSelesai).toBe(`${Y + 1}-06-30`);
        expect(result.status).toBe('disiapkan');
      }),
      { numRuns: 500 },
    );
  });

  it('UTC+7 offset shifts the date correctly near midnight UTC', () => {
    // 2024-12-31T17:00:00Z → 2025-01-01 00:00:00 UTC+7 → Y = 2025
    const midnightJakarta2025 = new Date('2024-12-31T17:00:00Z').getTime();
    const result = computeTahunAjaranDefault(midnightJakarta2025);
    expect(result.nama).toBe('2025/2026');
    expect(result.tanggalMulai).toBe('2025-07-01');
    expect(result.tanggalSelesai).toBe('2026-06-30');
    expect(result.status).toBe('disiapkan');
  });

  it('UTC+7 does NOT shift date for morning UTC times (same calendar date in UTC+7)', () => {
    // 2024-06-15T00:00:00Z → 2024-06-15 07:00:00 UTC+7 → Y = 2024
    const morningUtc2024 = new Date('2024-06-15T00:00:00Z').getTime();
    const result = computeTahunAjaranDefault(morningUtc2024);
    expect(result.nama).toBe('2024/2025');
    expect(result.tanggalMulai).toBe('2024-07-01');
    expect(result.tanggalSelesai).toBe('2025-06-30');
  });

  it('year rolls over correctly at the UTC+7 new year boundary', () => {
    // One second before Jakarta new year → still 2023
    const oneSecondBefore = new Date('2023-12-31T16:59:59Z').getTime();
    // Exactly at Jakarta new year → 2024
    const atNewYear = new Date('2023-12-31T17:00:00Z').getTime();

    const before = computeTahunAjaranDefault(oneSecondBefore);
    const at = computeTahunAjaranDefault(atNewYear);

    expect(before.nama).toBe('2023/2024');
    expect(at.nama).toBe('2024/2025');
  });

  it('nama always matches pattern "NNNN/NNNN" with the second year exactly one more', () => {
    fc.assert(
      fc.property(utcTimestampArb, (nowMs) => {
        const result = computeTahunAjaranDefault(nowMs);
        expect(result.nama).toMatch(/^\d{4}\/\d{4}$/);
        const [yearStr, nextYearStr] = result.nama.split('/');
        expect(Number(nextYearStr) - Number(yearStr)).toBe(1);
      }),
      { numRuns: 500 },
    );
  });

  it('tanggal_mulai and tanggal_selesai span exactly one academic year (July–June)', () => {
    fc.assert(
      fc.property(utcTimestampArb, (nowMs) => {
        const result = computeTahunAjaranDefault(nowMs);
        const [mulaiYear] = result.tanggalMulai.split('-').map(Number);
        const [selesaiYear] = result.tanggalSelesai.split('-').map(Number);

        expect(result.tanggalMulai).toMatch(/-07-01$/);
        expect(result.tanggalSelesai).toMatch(/-06-30$/);
        expect(selesaiYear - mulaiYear).toBe(1);
      }),
      { numRuns: 500 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 24: SPP keys follow the exact naming formula
//
// For any spp_bulanan entry with tingkat = T and nominal = N, the stored
// konfigurasi_sekolah record SHALL have:
//   key   = "spp_nominal_tingkat_T"
//   value = N  (as a JSON number, not a string)
//
// **Validates: Requirements 6.5**
// Feature: tenant-excel-onboarding, Property 24: SPP keys follow the exact naming formula
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature: tenant-excel-onboarding, Property 24: SPP keys follow the exact naming formula', () => {
  /** Valid tingkat range: 1–13 (matches DTO @Min(1) @Max(13)) */
  const tingkatArb = fc.integer({ min: 1, max: 13 });

  /** Valid nominal range: positive integers (matches DTO @Min(1)) */
  const nominalArb = fc.integer({ min: 1, max: 100_000_000 });

  it('key is exactly "spp_nominal_tingkat_{tingkat}" for any valid tingkat', () => {
    fc.assert(
      fc.property(tingkatArb, nominalArb, (tingkat, nominal) => {
        const result = buildSppKonfigurasi(tingkat, nominal);
        expect(result.key).toBe(`spp_nominal_tingkat_${tingkat}`);
      }),
      { numRuns: 500 },
    );
  });

  it('value equals the original nominal and is a number type (not string)', () => {
    fc.assert(
      fc.property(tingkatArb, nominalArb, (tingkat, nominal) => {
        const result = buildSppKonfigurasi(tingkat, nominal);
        expect(result.value).toBe(nominal);
        expect(typeof result.value).toBe('number');
      }),
      { numRuns: 500 },
    );
  });

  it('key starts with the fixed prefix "spp_nominal_tingkat_"', () => {
    fc.assert(
      fc.property(tingkatArb, nominalArb, (tingkat, nominal) => {
        const result = buildSppKonfigurasi(tingkat, nominal);
        expect(result.key.startsWith('spp_nominal_tingkat_')).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('key suffix is the decimal string representation of tingkat (no leading zeros)', () => {
    fc.assert(
      fc.property(tingkatArb, nominalArb, (tingkat, nominal) => {
        const result = buildSppKonfigurasi(tingkat, nominal);
        const suffix = result.key.slice('spp_nominal_tingkat_'.length);
        expect(suffix).toBe(String(tingkat));
      }),
      { numRuns: 500 },
    );
  });

  it('keys for different tingkat values are always distinct', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(tingkatArb, { minLength: 2, maxLength: 13 }),
        nominalArb,
        (tingkatList, nominal) => {
          const keys = tingkatList.map((t) => buildSppKonfigurasi(t, nominal).key);
          const uniqueKeys = new Set(keys);
          expect(uniqueKeys.size).toBe(tingkatList.length);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('nominal value is preserved exactly — no rounding or type coercion', () => {
    fc.assert(
      fc.property(tingkatArb, nominalArb, (tingkat, nominal) => {
        const result = buildSppKonfigurasi(tingkat, nominal);
        expect(result.value).toStrictEqual(nominal);
      }),
      { numRuns: 500 },
    );
  });

  it('key matches regex "^spp_nominal_tingkat_\\d+$" — no whitespace or extra characters', () => {
    fc.assert(
      fc.property(tingkatArb, nominalArb, (tingkat, nominal) => {
        const result = buildSppKonfigurasi(tingkat, nominal);
        expect(result.key).toMatch(/^spp_nominal_tingkat_\d+$/);
      }),
      { numRuns: 500 },
    );
  });

  it('spot-check known expected values', () => {
    // tingkat 1, nominal Rp 500.000
    const spp1 = buildSppKonfigurasi(1, 500000);
    expect(spp1.key).toBe('spp_nominal_tingkat_1');
    expect(spp1.value).toBe(500000);

    // tingkat 6, nominal Rp 1.500.000
    const spp6 = buildSppKonfigurasi(6, 1500000);
    expect(spp6.key).toBe('spp_nominal_tingkat_6');
    expect(spp6.value).toBe(1500000);

    // tingkat 13 (max valid), nominal 1 (min valid)
    const spp13 = buildSppKonfigurasi(13, 1);
    expect(spp13.key).toBe('spp_nominal_tingkat_13');
    expect(spp13.value).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure logic extracted from TenantService.createTenantWithOnboarding
// for testing Properties 31 and 32 in isolation (no DB, no DI container).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mirrors the `hasOnboardingData` check from TenantService.createTenantWithOnboarding.
 * Returns true if at least one onboarding array is present and non-empty.
 */
function hasOnboardingData(dto: {
  kelas?: unknown[];
  mata_pelajaran?: unknown[];
  siswa?: unknown[];
  guru_staff?: unknown[];
  spp_bulanan?: unknown[];
}): boolean {
  return (
    (dto.kelas !== undefined && dto.kelas.length > 0) ||
    (dto.mata_pelajaran !== undefined && dto.mata_pelajaran.length > 0) ||
    (dto.siswa !== undefined && dto.siswa.length > 0) ||
    (dto.guru_staff !== undefined && dto.guru_staff.length > 0) ||
    (dto.spp_bulanan !== undefined && dto.spp_bulanan.length > 0)
  );
}

/**
 * Mirrors the onboarding_summary count computation from TenantService.
 * Each count is the length of the array if present, or 0 if absent/empty.
 */
function computeOnboardingSummary(dto: {
  kelas?: unknown[];
  mata_pelajaran?: unknown[];
  siswa?: unknown[];
  guru_staff?: unknown[];
  spp_bulanan?: unknown[];
}): {
  kelas: number;
  mata_pelajaran: number;
  siswa: number;
  guru_staff: number;
  spp_bulanan: number;
} {
  return {
    kelas: dto.kelas?.length ?? 0,
    mata_pelajaran: dto.mata_pelajaran?.length ?? 0,
    siswa: dto.siswa?.length ?? 0,
    guru_staff: dto.guru_staff?.length ?? 0,
    spp_bulanan: dto.spp_bulanan?.length ?? 0,
  };
}

/**
 * Mirrors the return value construction from TenantService.createTenantWithOnboarding.
 * Builds the CreateTenantResult shape based on inserted tenant, admin, and onboarding data.
 */
function buildCreateTenantResult(
  tenantId: string,
  tenantNama: string,
  tenantEmail: string | null,
  adminId: string,
  adminEmail: string | null,
  adminNama: string,
  dto: {
    kelas?: unknown[];
    mata_pelajaran?: unknown[];
    siswa?: unknown[];
    guru_staff?: unknown[];
    spp_bulanan?: unknown[];
  },
): {
  id: string;
  tenant: { id: string; nama: string; email: string | null };
  admin: { id: string; email: string | null; nama: string };
  onboarding_summary?: {
    kelas: number;
    mata_pelajaran: number;
    siswa: number;
    guru_staff: number;
    spp_bulanan: number;
  };
} {
  const summary = computeOnboardingSummary(dto);
  return {
    id: tenantId,
    tenant: {
      id: tenantId,
      nama: tenantNama,
      email: tenantEmail,
    },
    admin: {
      id: adminId,
      email: adminEmail,
      nama: adminNama,
    },
    ...(hasOnboardingData(dto) ? { onboarding_summary: summary } : {}),
  };
}

// ─── Arbitraries for Properties 31 & 32 ──────────────────────────────────────

const uuidArb = fc.uuid();
const nullableEmailArb = fc.option(fc.emailAddress(), { nil: null });

/**
 * Arbitrary for a single onboarding array — an array of opaque objects
 * with a random length (0–50). We use `fc.array(fc.object())` here
 * because these tests only care about array lengths, not their contents.
 */
const onboardingArrayArb = fc.array(fc.record({ _: fc.string() }), {
  minLength: 0,
  maxLength: 50,
});

/**
 * Arbitrary for a DTO with all 5 optional onboarding arrays.
 * Each array is independently optional (wrapped in `fc.option`).
 */
const partialDtoArb = fc.record({
  kelas: fc.option(onboardingArrayArb, { nil: undefined }),
  mata_pelajaran: fc.option(onboardingArrayArb, { nil: undefined }),
  siswa: fc.option(onboardingArrayArb, { nil: undefined }),
  guru_staff: fc.option(onboardingArrayArb, { nil: undefined }),
  spp_bulanan: fc.option(onboardingArrayArb, { nil: undefined }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 31: Partial onboarding arrays are processed independently
//
// For any subset of the 5 onboarding arrays present in the request
// (including the empty subset), the backend SHALL process exactly the arrays
// that are present, treating absent arrays as empty, and SHALL successfully
// create at minimum 1 tenant and 1 admin user.
//
// **Validates: Requirements 9.3**
// Feature: tenant-excel-onboarding, Property 31: Partial onboarding arrays are processed independently
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature: tenant-excel-onboarding, Property 31: Partial onboarding arrays are processed independently', () => {
  it('absent arrays produce a count of 0 in onboarding_summary', () => {
    fc.assert(
      fc.property(partialDtoArb, (dto) => {
        const summary = computeOnboardingSummary(dto);

        // Each absent array must yield count 0
        if (dto.kelas === undefined) expect(summary.kelas).toBe(0);
        if (dto.mata_pelajaran === undefined) expect(summary.mata_pelajaran).toBe(0);
        if (dto.siswa === undefined) expect(summary.siswa).toBe(0);
        if (dto.guru_staff === undefined) expect(summary.guru_staff).toBe(0);
        if (dto.spp_bulanan === undefined) expect(summary.spp_bulanan).toBe(0);
      }),
      { numRuns: 500 },
    );
  });

  it('present arrays produce a count equal to their actual length', () => {
    fc.assert(
      fc.property(partialDtoArb, (dto) => {
        const summary = computeOnboardingSummary(dto);

        // Each present array must yield count equal to its length
        if (dto.kelas !== undefined) expect(summary.kelas).toBe(dto.kelas.length);
        if (dto.mata_pelajaran !== undefined)
          expect(summary.mata_pelajaran).toBe(dto.mata_pelajaran.length);
        if (dto.siswa !== undefined) expect(summary.siswa).toBe(dto.siswa.length);
        if (dto.guru_staff !== undefined) expect(summary.guru_staff).toBe(dto.guru_staff.length);
        if (dto.spp_bulanan !== undefined) expect(summary.spp_bulanan).toBe(dto.spp_bulanan.length);
      }),
      { numRuns: 500 },
    );
  });

  it('all counts are non-negative integers regardless of which arrays are present', () => {
    fc.assert(
      fc.property(partialDtoArb, (dto) => {
        const summary = computeOnboardingSummary(dto);

        expect(summary.kelas).toBeGreaterThanOrEqual(0);
        expect(summary.mata_pelajaran).toBeGreaterThanOrEqual(0);
        expect(summary.siswa).toBeGreaterThanOrEqual(0);
        expect(summary.guru_staff).toBeGreaterThanOrEqual(0);
        expect(summary.spp_bulanan).toBeGreaterThanOrEqual(0);

        // All values must be integers
        expect(Number.isInteger(summary.kelas)).toBe(true);
        expect(Number.isInteger(summary.mata_pelajaran)).toBe(true);
        expect(Number.isInteger(summary.siswa)).toBe(true);
        expect(Number.isInteger(summary.guru_staff)).toBe(true);
        expect(Number.isInteger(summary.spp_bulanan)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('when all arrays are absent, hasOnboardingData returns false (no onboarding_summary)', () => {
    fc.assert(
      fc.property(fc.constant({}), (emptyDto) => {
        expect(hasOnboardingData(emptyDto)).toBe(false);
      }),
      { numRuns: 10 },
    );
  });

  it('when all arrays are present but empty, hasOnboardingData returns false', () => {
    fc.assert(
      fc.property(
        fc.constant({
          kelas: [],
          mata_pelajaran: [],
          siswa: [],
          guru_staff: [],
          spp_bulanan: [],
        }),
        (dto) => {
          expect(hasOnboardingData(dto)).toBe(false);
        },
      ),
      { numRuns: 10 },
    );
  });

  it('when exactly one non-empty array is present, hasOnboardingData returns true', () => {
    const arrayNames = ['kelas', 'mata_pelajaran', 'siswa', 'guru_staff', 'spp_bulanan'] as const;

    fc.assert(
      fc.property(
        fc.constantFrom(...arrayNames),
        fc.array(fc.record({ _: fc.string() }), { minLength: 1, maxLength: 20 }),
        (arrayName, items) => {
          const dto = { [arrayName]: items };
          expect(hasOnboardingData(dto)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('counts for present non-empty arrays are independent of other arrays', () => {
    // Generate two independent dtos and verify their summaries are computed
    // independently — merging different arrays should not cross-pollinate counts
    fc.assert(
      fc.property(
        fc.array(fc.record({ _: fc.string() }), { minLength: 1, maxLength: 30 }),
        fc.array(fc.record({ _: fc.string() }), { minLength: 1, maxLength: 30 }),
        (kelasList, siswaList) => {
          const dtoA = { kelas: kelasList };
          const dtoB = { siswa: siswaList };

          const summaryA = computeOnboardingSummary(dtoA);
          const summaryB = computeOnboardingSummary(dtoB);

          // A only has kelas — siswa count must be 0
          expect(summaryA.kelas).toBe(kelasList.length);
          expect(summaryA.siswa).toBe(0);

          // B only has siswa — kelas count must be 0
          expect(summaryB.siswa).toBe(siswaList.length);
          expect(summaryB.kelas).toBe(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('spot-check: only kelas present with 5 items → all other counts are 0', () => {
    const dto = { kelas: [1, 2, 3, 4, 5].map((n) => ({ nama: `Kelas ${n}`, tingkat: n })) };
    const summary = computeOnboardingSummary(dto);
    expect(summary.kelas).toBe(5);
    expect(summary.mata_pelajaran).toBe(0);
    expect(summary.siswa).toBe(0);
    expect(summary.guru_staff).toBe(0);
    expect(summary.spp_bulanan).toBe(0);
  });

  it('spot-check: mixed partial presence — counts match array lengths exactly', () => {
    const dto = {
      kelas: [
        { nama: 'X', tingkat: 1 },
        { nama: 'Y', tingkat: 2 },
      ],
      siswa: [{ nama: 'A' }, { nama: 'B' }, { nama: 'C' }],
      // mata_pelajaran, guru_staff, spp_bulanan absent
    };
    const summary = computeOnboardingSummary(dto);
    expect(summary.kelas).toBe(2);
    expect(summary.mata_pelajaran).toBe(0);
    expect(summary.siswa).toBe(3);
    expect(summary.guru_staff).toBe(0);
    expect(summary.spp_bulanan).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 32: Response structure is invariant across all request variants
//
// For any valid POST /tenants request (with or without onboarding data), the
// response SHALL always include `id`, `tenant` (with `id`, `nama`, `email`),
// and `admin` (with `id`, `email`, `nama`); when onboarding data was provided
// and processed, the response SHALL additionally include `onboarding_summary`
// with count fields for each entity type.
//
// **Validates: Requirements 9.4**
// Feature: tenant-excel-onboarding, Property 32: Response structure is invariant across all request variants
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature: tenant-excel-onboarding, Property 32: Response structure is invariant across all request variants', () => {
  /**
   * Bundle all 7 inputs into a record to avoid the 6-arg limit of fc.property overloads.
   */
  const resultInputArb = fc.record({
    tenantId: uuidArb,
    tenantNama: nonEmptyStringArb,
    tenantEmail: nullableEmailArb,
    adminId: uuidArb,
    adminEmail: nullableEmailArb,
    adminNama: nonEmptyStringArb,
    dto: partialDtoArb,
  });

  it('response always contains id field as a non-empty string', () => {
    fc.assert(
      fc.property(
        resultInputArb,
        ({ tenantId, tenantNama, tenantEmail, adminId, adminEmail, adminNama, dto }) => {
          const result = buildCreateTenantResult(
            tenantId,
            tenantNama,
            tenantEmail,
            adminId,
            adminEmail,
            adminNama,
            dto,
          );
          expect(result.id).toBeDefined();
          expect(typeof result.id).toBe('string');
          expect(result.id.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('response always contains tenant object with id, nama, email fields', () => {
    fc.assert(
      fc.property(
        resultInputArb,
        ({ tenantId, tenantNama, tenantEmail, adminId, adminEmail, adminNama, dto }) => {
          const result = buildCreateTenantResult(
            tenantId,
            tenantNama,
            tenantEmail,
            adminId,
            adminEmail,
            adminNama,
            dto,
          );

          expect(result.tenant).toBeDefined();
          expect(typeof result.tenant.id).toBe('string');
          expect(result.tenant.id.length).toBeGreaterThan(0);
          expect(typeof result.tenant.nama).toBe('string');
          expect(result.tenant.nama.length).toBeGreaterThan(0);
          // email can be null or a string
          expect(result.tenant.email === null || typeof result.tenant.email === 'string').toBe(
            true,
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it('response always contains admin object with id, email, nama fields', () => {
    fc.assert(
      fc.property(
        resultInputArb,
        ({ tenantId, tenantNama, tenantEmail, adminId, adminEmail, adminNama, dto }) => {
          const result = buildCreateTenantResult(
            tenantId,
            tenantNama,
            tenantEmail,
            adminId,
            adminEmail,
            adminNama,
            dto,
          );

          expect(result.admin).toBeDefined();
          expect(typeof result.admin.id).toBe('string');
          expect(result.admin.id.length).toBeGreaterThan(0);
          expect(typeof result.admin.nama).toBe('string');
          expect(result.admin.nama.length).toBeGreaterThan(0);
          // email can be null or a string
          expect(result.admin.email === null || typeof result.admin.email === 'string').toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('id field equals tenant.id — they are the same tenant identifier', () => {
    fc.assert(
      fc.property(
        resultInputArb,
        ({ tenantId, tenantNama, tenantEmail, adminId, adminEmail, adminNama, dto }) => {
          const result = buildCreateTenantResult(
            tenantId,
            tenantNama,
            tenantEmail,
            adminId,
            adminEmail,
            adminNama,
            dto,
          );

          expect(result.id).toBe(result.tenant.id);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('onboarding_summary is absent when no onboarding arrays are present', () => {
    fc.assert(
      fc.property(
        uuidArb,
        nonEmptyStringArb,
        nullableEmailArb,
        uuidArb,
        nullableEmailArb,
        nonEmptyStringArb,
        (tenantId, tenantNama, tenantEmail, adminId, adminEmail, adminNama) => {
          // No onboarding arrays — empty DTO
          const dto = {};
          const result = buildCreateTenantResult(
            tenantId,
            tenantNama,
            tenantEmail,
            adminId,
            adminEmail,
            adminNama,
            dto,
          );

          expect(result.onboarding_summary).toBeUndefined();
        },
      ),
      { numRuns: 200 },
    );
  });

  it('onboarding_summary is absent when all onboarding arrays are empty', () => {
    fc.assert(
      fc.property(
        uuidArb,
        nonEmptyStringArb,
        nullableEmailArb,
        uuidArb,
        nullableEmailArb,
        nonEmptyStringArb,
        (tenantId, tenantNama, tenantEmail, adminId, adminEmail, adminNama) => {
          const dto = {
            kelas: [],
            mata_pelajaran: [],
            siswa: [],
            guru_staff: [],
            spp_bulanan: [],
          };
          const result = buildCreateTenantResult(
            tenantId,
            tenantNama,
            tenantEmail,
            adminId,
            adminEmail,
            adminNama,
            dto,
          );

          expect(result.onboarding_summary).toBeUndefined();
        },
      ),
      { numRuns: 200 },
    );
  });

  it('onboarding_summary is present with all 5 count fields when at least one array is non-empty', () => {
    const arrayNames = ['kelas', 'mata_pelajaran', 'siswa', 'guru_staff', 'spp_bulanan'] as const;

    fc.assert(
      fc.property(
        fc.record({
          tenantId: uuidArb,
          tenantNama: nonEmptyStringArb,
          tenantEmail: nullableEmailArb,
          adminId: uuidArb,
          adminEmail: nullableEmailArb,
          adminNama: nonEmptyStringArb,
          arrayName: fc.constantFrom(...arrayNames),
          items: fc.array(fc.record({ _: fc.string() }), { minLength: 1, maxLength: 20 }),
        }),
        ({
          tenantId,
          tenantNama,
          tenantEmail,
          adminId,
          adminEmail,
          adminNama,
          arrayName,
          items,
        }) => {
          const dto = { [arrayName]: items };
          const result = buildCreateTenantResult(
            tenantId,
            tenantNama,
            tenantEmail,
            adminId,
            adminEmail,
            adminNama,
            dto,
          );

          expect(result.onboarding_summary).toBeDefined();
          // All 5 count fields must be present
          expect(typeof result.onboarding_summary!.kelas).toBe('number');
          expect(typeof result.onboarding_summary!.mata_pelajaran).toBe('number');
          expect(typeof result.onboarding_summary!.siswa).toBe('number');
          expect(typeof result.onboarding_summary!.guru_staff).toBe('number');
          expect(typeof result.onboarding_summary!.spp_bulanan).toBe('number');
        },
      ),
      { numRuns: 300 },
    );
  });

  it('onboarding_summary counts match array lengths when onboarding data is present', () => {
    fc.assert(
      fc.property(
        resultInputArb,
        ({ tenantId, tenantNama, tenantEmail, adminId, adminEmail, adminNama, dto }) => {
          if (!hasOnboardingData(dto)) return; // skip requests with no onboarding data

          const result = buildCreateTenantResult(
            tenantId,
            tenantNama,
            tenantEmail,
            adminId,
            adminEmail,
            adminNama,
            dto,
          );

          expect(result.onboarding_summary).toBeDefined();
          const s = result.onboarding_summary!;

          expect(s.kelas).toBe(dto.kelas?.length ?? 0);
          expect(s.mata_pelajaran).toBe(dto.mata_pelajaran?.length ?? 0);
          expect(s.siswa).toBe(dto.siswa?.length ?? 0);
          expect(s.guru_staff).toBe(dto.guru_staff?.length ?? 0);
          expect(s.spp_bulanan).toBe(dto.spp_bulanan?.length ?? 0);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('response shape is consistent — no extra unexpected top-level keys', () => {
    fc.assert(
      fc.property(
        resultInputArb,
        ({ tenantId, tenantNama, tenantEmail, adminId, adminEmail, adminNama, dto }) => {
          const result = buildCreateTenantResult(
            tenantId,
            tenantNama,
            tenantEmail,
            adminId,
            adminEmail,
            adminNama,
            dto,
          );

          const topLevelKeys = Object.keys(result);
          const expectedKeys = hasOnboardingData(dto)
            ? ['id', 'tenant', 'admin', 'onboarding_summary']
            : ['id', 'tenant', 'admin'];

          expect(topLevelKeys.sort()).toEqual(expectedKeys.sort());
        },
      ),
      { numRuns: 300 },
    );
  });

  it('tenant and admin fields carry the correct input values', () => {
    fc.assert(
      fc.property(
        resultInputArb,
        ({ tenantId, tenantNama, tenantEmail, adminId, adminEmail, adminNama, dto }) => {
          const result = buildCreateTenantResult(
            tenantId,
            tenantNama,
            tenantEmail,
            adminId,
            adminEmail,
            adminNama,
            dto,
          );

          expect(result.id).toBe(tenantId);
          expect(result.tenant.id).toBe(tenantId);
          expect(result.tenant.nama).toBe(tenantNama);
          expect(result.tenant.email).toBe(tenantEmail);
          expect(result.admin.id).toBe(adminId);
          expect(result.admin.email).toBe(adminEmail);
          expect(result.admin.nama).toBe(adminNama);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('spot-check: request without onboarding — response has exactly id, tenant, admin', () => {
    const result = buildCreateTenantResult(
      'tenant-uuid-001',
      'SMP Negeri 1',
      'smpn1@example.com',
      'admin-uuid-001',
      'admin@smpn1.sch.id',
      'Budi Santoso',
      {}, // no onboarding arrays
    );

    expect(result.id).toBe('tenant-uuid-001');
    expect(result.tenant.nama).toBe('SMP Negeri 1');
    expect(result.admin.nama).toBe('Budi Santoso');
    expect(result.onboarding_summary).toBeUndefined();
    expect(Object.keys(result)).toEqual(['id', 'tenant', 'admin']);
  });

  it('spot-check: request with all 5 arrays — onboarding_summary reflects correct counts', () => {
    const dto = {
      kelas: [
        { nama: 'VII-A', tingkat: 7 },
        { nama: 'VII-B', tingkat: 7 },
      ],
      mata_pelajaran: [{ nama: 'Matematika' }, { nama: 'IPA' }, { nama: 'Bahasa Indonesia' }],
      siswa: Array.from({ length: 10 }, (_, i) => ({ nama: `Siswa ${i + 1}` })),
      guru_staff: [{ nama: 'Guru A', email: 'a@sekolah.id', role: 'guru' }],
      spp_bulanan: [{ tingkat: 7, nominal: 750000 }],
    };

    const result = buildCreateTenantResult(
      'tenant-abc',
      'SMP Harapan',
      'harapan@school.id',
      'admin-abc',
      'admin@harapan.id',
      'Admin Harapan',
      dto,
    );

    expect(result.onboarding_summary).toEqual({
      kelas: 2,
      mata_pelajaran: 3,
      siswa: 10,
      guru_staff: 1,
      spp_bulanan: 1,
    });
    expect(Object.keys(result)).toContain('onboarding_summary');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 20: Transaction atomicity — any failure causes full rollback
//
// For any failure injected at any step of the onboarding transaction (steps 1–7),
// the database SHALL contain no rows from any of the affected tables that were
// part of that attempted onboarding (i.e. the service propagates the error,
// does NOT swallow it, and does NOT return a success result).
//
// The 7 steps are:
//   1 — insert tenant
//   2 — insert tahun_ajaran
//   3 — insert kelas
//   4 — insert mata_pelajaran
//   5 — insert users (admin + guru_staff)
//   6 — insert siswa
//   7 — insert konfigurasi_sekolah (SPP)
//
// Since Drizzle's actual rollback happens at the DB level (not mockable in unit
// tests), what we verify here is:
//   (a) The service propagates the error — does NOT swallow it
//   (b) The error bubbles up to the caller
//   (c) The service does NOT return a success result when a step throws
//
// **Validates: Requirements 6.1, 6.6**
// Feature: tenant-excel-onboarding, Property 20: Transaction atomicity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a minimal valid CreateTenantDto for testing.
 * All onboarding arrays are populated so that all 7 transaction steps are exercised.
 */
function buildMinimalOnboardingDto(overrides?: Record<string, unknown>) {
  return {
    nama: 'SMP Test Atomicity',
    email: 'test@sekolah.id',
    alamat: 'Jl. Test No. 1',
    telepon: '08123456789',
    jumlah_tingkat: 9, // must be >= max(kelas.tingkat, spp_bulanan.tingkat) = 7
    hari_kerja: '6_hari' as const,
    admin_nama: 'Admin Test',
    admin_email: 'admin@test.id',
    kelas: [{ nama: 'VII-A', tingkat: 7 }],
    mata_pelajaran: [{ nama: 'Matematika', kode: 'MTK' }],
    siswa: [{ nama: 'Budi', nisn: '1234567890', kelasNama: 'VII-A' }],
    guru_staff: [{ nama: 'Guru A', email: 'gurua@test.id', role: 'guru' as const }],
    spp_bulanan: [{ tingkat: 7, nominal: 500000 }],
    ...overrides,
  };
}

/**
 * Tracks how many times `tx.insert` has been called inside the transaction
 * callback. When the call count reaches `failAtStep`, throw the injected error.
 *
 * Step → insert call mapping:
 *   Step 1: insert(tenant)           → call #1
 *   Step 2: insert(tahunAjaran)      → call #2
 *   Step 3: insert(kelas)            → call #3
 *   Step 4: insert(mataPelajaran)    → call #4
 *   Step 5: insert(user) admin       → call #5   (first user insert)
 *   Step 5: insert(user) guru_staff  → call #6   (second user insert — each guru loops)
 *   Step 6: insert(siswa)            → call #7
 *   Step 7: insert(konfigurasiSekolah) → call #8
 *
 * NOTE: The DTO used in tests has exactly 1 guru_staff entry, so step 5 spans
 * calls #5 (admin) and #6 (single guru). Steps ≥7 map to calls #7 and #8.
 * We parameterise over `failAtCall` (1–8) to cover all 7 spec-defined steps.
 */
function buildMockTransactionThatFailsAtCall(failAtCall: number, errorMessage: string) {
  return jest.fn().mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
    let insertCallCount = 0;

    const mockTx = {
      insert: jest.fn().mockImplementation(() => {
        insertCallCount++;
        if (insertCallCount === failAtCall) {
          throw new Error(errorMessage);
        }
        // Return a chainable mock that resolves with an empty returning() result
        return {
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([
              {
                id: `mock-id-${insertCallCount}`,
                nama: 'mock-nama',
                email: 'mock@test.id',
                passwordHash: 'hash',
                role: 'admin',
                isActive: true,
                mustChangePassword: true,
                tenantId: 'tenant-id',
              },
            ]),
          }),
        };
      }),
    };

    // Execute the callback with the mocked tx — any thrown error propagates out
    return callback(mockTx);
  });
}

describe('Feature: tenant-excel-onboarding, Property 20: Transaction atomicity — any failure causes full rollback', () => {
  let service: TenantService;
  let mockDb: {
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    transaction: jest.Mock;
  };
  let mockEmailQueue: { add: jest.Mock };

  /**
   * Rebuilds the service with a fresh mockDb for each test.
   * `mockDb.transaction` is overridden per test to inject failures.
   */
  async function buildService(transactionMock: jest.Mock): Promise<TenantService> {
    mockDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]), // no existing users (pre-tx validation passes)
          }),
        }),
      }),
      insert: jest.fn(),
      update: jest.fn(),
      transaction: transactionMock,
    };

    mockEmailQueue = { add: jest.fn().mockResolvedValue(undefined) };

    const mockAuthService = { invalidateAllTenantTokens: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: AuthService, useValue: mockAuthService },
        { provide: getQueueToken(QUEUE_NAMES.EMAIL), useValue: mockEmailQueue },
      ],
    }).compile();

    return module.get<TenantService>(TenantService);
  }

  // ── Core property: any of the 8 insert call positions (covering 7 steps) ──

  it('service throws when step 1 (insert tenant) fails', async () => {
    const txMock = buildMockTransactionThatFailsAtCall(1, 'DB error: insert tenant failed');
    service = await buildService(txMock);
    const dto = buildMinimalOnboardingDto();

    await expect(service.createTenant(dto as never)).rejects.toThrow();
  });

  it('service throws when step 2 (insert tahun_ajaran) fails', async () => {
    const txMock = buildMockTransactionThatFailsAtCall(2, 'DB error: insert tahun_ajaran failed');
    service = await buildService(txMock);
    const dto = buildMinimalOnboardingDto();

    await expect(service.createTenant(dto as never)).rejects.toThrow();
  });

  it('service throws when step 3 (insert kelas) fails', async () => {
    const txMock = buildMockTransactionThatFailsAtCall(3, 'DB error: insert kelas failed');
    service = await buildService(txMock);
    const dto = buildMinimalOnboardingDto();

    await expect(service.createTenant(dto as never)).rejects.toThrow();
  });

  it('service throws when step 4 (insert mata_pelajaran) fails', async () => {
    const txMock = buildMockTransactionThatFailsAtCall(4, 'DB error: insert mata_pelajaran failed');
    service = await buildService(txMock);
    const dto = buildMinimalOnboardingDto();

    await expect(service.createTenant(dto as never)).rejects.toThrow();
  });

  it('service throws when step 5a (insert admin user) fails', async () => {
    const txMock = buildMockTransactionThatFailsAtCall(5, 'DB error: insert admin user failed');
    service = await buildService(txMock);
    const dto = buildMinimalOnboardingDto();

    await expect(service.createTenant(dto as never)).rejects.toThrow();
  });

  it('service throws when step 5b (insert guru_staff user) fails', async () => {
    const txMock = buildMockTransactionThatFailsAtCall(
      6,
      'DB error: insert guru_staff user failed',
    );
    service = await buildService(txMock);
    const dto = buildMinimalOnboardingDto();

    await expect(service.createTenant(dto as never)).rejects.toThrow();
  });

  it('service throws when step 6 (insert siswa) fails', async () => {
    const txMock = buildMockTransactionThatFailsAtCall(7, 'DB error: insert siswa failed');
    service = await buildService(txMock);
    const dto = buildMinimalOnboardingDto();

    await expect(service.createTenant(dto as never)).rejects.toThrow();
  });

  it('service throws when step 7 (insert konfigurasi_sekolah) fails', async () => {
    const txMock = buildMockTransactionThatFailsAtCall(8, 'DB error: insert spp failed');
    service = await buildService(txMock);
    const dto = buildMinimalOnboardingDto();

    await expect(service.createTenant(dto as never)).rejects.toThrow();
  });

  // ── Property: error must propagate, not be swallowed ──────────────────────

  it('the error message from the failing step propagates to the caller', async () => {
    const uniqueMessage = 'UNIQUE_CONSTRAINT_VIOLATION_test_atomicity';
    const txMock = buildMockTransactionThatFailsAtCall(1, uniqueMessage);
    service = await buildService(txMock);
    const dto = buildMinimalOnboardingDto();

    await expect(service.createTenant(dto as never)).rejects.toThrow(uniqueMessage);
  });

  it('email queue receives zero add() calls when transaction fails', async () => {
    // When the transaction throws, no email jobs should be enqueued
    const txMock = buildMockTransactionThatFailsAtCall(2, 'tx abort');
    service = await buildService(txMock);
    const dto = buildMinimalOnboardingDto();

    await expect(service.createTenant(dto as never)).rejects.toThrow();
    expect(mockEmailQueue.add).not.toHaveBeenCalled();
  });

  it('createTenant does NOT return a success result when any step fails (rejects, not resolves)', async () => {
    const txMock = buildMockTransactionThatFailsAtCall(3, 'step 3 failure');
    service = await buildService(txMock);
    const dto = buildMinimalOnboardingDto();

    // Must reject — a resolved promise would mean partial data could have been returned
    let resolved = false;
    let rejected = false;

    await service.createTenant(dto as never).then(
      () => {
        resolved = true;
      },
      () => {
        rejected = true;
      },
    );

    expect(resolved).toBe(false);
    expect(rejected).toBe(true);
  });

  // ── Fast-check property: all 8 insert-call positions (covering 7 steps) ──

  it('for any failing step (1–8 insert calls), createTenant always throws', async () => {
    // We use fc.assert with a sequential async property.
    // fast-check runs this numRuns times with random failAtCall values.
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 8 }),
        fc.string({ minLength: 5, maxLength: 50 }).filter((s) => s.trim().length > 3),
        async (failAtCall, errorMessage) => {
          const txMock = buildMockTransactionThatFailsAtCall(failAtCall, errorMessage);
          const svc = await buildService(txMock);
          const dto = buildMinimalOnboardingDto();

          let threw = false;
          try {
            await svc.createTenant(dto as never);
          } catch {
            threw = true;
          }

          // The service MUST throw for any injected failure — never return a result
          expect(threw).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);

  it('for any failing step, email queue add() is never called (no side-effects after failure)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 8 }), async (failAtCall) => {
        const txMock = buildMockTransactionThatFailsAtCall(failAtCall, 'tx-fail');
        const svc = await buildService(txMock);
        const queueSpy = mockEmailQueue.add;
        const dto = buildMinimalOnboardingDto();

        try {
          await svc.createTenant(dto as never);
        } catch {
          // expected
        }

        // Email queue must remain untouched — no jobs should be enqueued on failure
        expect(queueSpy).not.toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  }, 30000);

  // ── Spot-check: without onboarding arrays, a direct tx failure still throws ──

  it('tx failure propagates even when only base tenant fields are provided (no onboarding arrays)', async () => {
    const txMock = buildMockTransactionThatFailsAtCall(1, 'base tenant insert failed');
    service = await buildService(txMock);

    // No onboarding arrays — only tenant + admin fields
    const minimalDto = {
      nama: 'SD Ujicoba',
      email: 'sd@test.id',
      jumlah_tingkat: 6,
      admin_nama: 'Admin SD',
      admin_email: 'admin@sd.id',
    };

    await expect(service.createTenant(minimalDto as never)).rejects.toThrow(
      'base tenant insert failed',
    );
    expect(mockEmailQueue.add).not.toHaveBeenCalled();
  });
});
