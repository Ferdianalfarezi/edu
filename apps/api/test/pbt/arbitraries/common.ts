import fc from 'fast-check';

// ─── Enums ────────────────────────────────────────────────────────────────────

/** All roles in the system */
export const ROLES = [
  'super_admin',
  'admin',
  'kepala_sekolah',
  'bendahara',
  'guru',
  'orang_tua',
] as const;

export type Role = (typeof ROLES)[number];

/** Staff roles (all roles that authenticate via email+password) */
export const STAFF_ROLES = ['admin', 'kepala_sekolah', 'bendahara', 'guru'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Attendance statuses */
export const ATTENDANCE_STATUSES = ['hadir', 'izin', 'sakit', 'alpa'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** Payment statuses */
export const PAYMENT_STATUSES = [
  'belum_bayar',
  'menunggu_verifikasi',
  'cicilan',
  'lunas',
  'ditolak',
  'dibatalkan',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Valid billing state transitions per Property 9 */
export const VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  belum_bayar: ['menunggu_verifikasi', 'lunas', 'cicilan', 'dibatalkan'],
  menunggu_verifikasi: ['lunas', 'cicilan', 'ditolak'],
  cicilan: ['menunggu_verifikasi', 'lunas'],
  ditolak: ['menunggu_verifikasi'],
  lunas: [],
  dibatalkan: [],
};

/** Rapor periods */
export const RAPOR_PERIODS = [
  'uts_semester_1',
  'semester_1',
  'uts_semester_2',
  'semester_2',
] as const;
export type RaporPeriod = (typeof RAPOR_PERIODS)[number];

/** RPP statuses */
export const RPP_STATUSES = ['draft', 'published'] as const;
export type RppStatus = (typeof RPP_STATUSES)[number];

/** Student statuses */
export const STUDENT_STATUSES = ['aktif', 'pindah_sekolah', 'keluar', 'alumni'] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

/** Tahun Ajaran statuses */
export const TAHUN_AJARAN_STATUSES = ['disiapkan', 'aktif', 'selesai'] as const;
export type TahunAjaranStatus = (typeof TAHUN_AJARAN_STATUSES)[number];

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

/** Generates a valid UUID v4 string */
export function arbitraryUuid(): fc.Arbitrary<string> {
  return fc.uuid();
}

/** Generates a valid role */
export function arbitraryRole(): fc.Arbitrary<Role> {
  return fc.constantFrom(...ROLES);
}

/** Generates a staff role (email+password auth) */
export function arbitraryStaffRole(): fc.Arbitrary<StaffRole> {
  return fc.constantFrom(...STAFF_ROLES);
}

/** Generates a valid attendance status */
export function arbitraryAttendanceStatus(): fc.Arbitrary<AttendanceStatus> {
  return fc.constantFrom(...ATTENDANCE_STATUSES);
}

/** Generates a valid payment status */
export function arbitraryPaymentStatus(): fc.Arbitrary<PaymentStatus> {
  return fc.constantFrom(...PAYMENT_STATUSES);
}

/** Generates a valid rapor period */
export function arbitraryRaporPeriod(): fc.Arbitrary<RaporPeriod> {
  return fc.constantFrom(...RAPOR_PERIODS);
}

/** Generates a valid RPP status */
export function arbitraryRppStatus(): fc.Arbitrary<RppStatus> {
  return fc.constantFrom(...RPP_STATUSES);
}

/** Generates a valid student status */
export function arbitraryStudentStatus(): fc.Arbitrary<StudentStatus> {
  return fc.constantFrom(...STUDENT_STATUSES);
}

/** Generates a valid tahun ajaran status */
export function arbitraryTahunAjaranStatus(): fc.Arbitrary<TahunAjaranStatus> {
  return fc.constantFrom(...TAHUN_AJARAN_STATUSES);
}

/**
 * Generates a valid date within school context (2020-2030).
 * Returns ISO date string (YYYY-MM-DD).
 */
export function arbitrarySchoolDate(): fc.Arbitrary<string> {
  return fc
    .date({
      min: new Date('2020-01-01'),
      max: new Date('2030-12-31'),
    })
    .map((d) => d.toISOString().split('T')[0]);
}

/**
 * Generates a valid date range (start <= end) within school context.
 * Useful for tahun ajaran periods.
 */
export function arbitraryDateRange(): fc.Arbitrary<{ start: string; end: string }> {
  return fc
    .tuple(
      fc.date({ min: new Date('2020-01-01'), max: new Date('2029-06-30') }),
      fc.integer({ min: 30, max: 365 }),
    )
    .map(([start, daysAfter]) => {
      const end = new Date(start.getTime() + daysAfter * 24 * 60 * 60 * 1000);
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      };
    });
}

/**
 * Generates a valid Indonesian phone number.
 * Format: 08xxxxxxxxxx (10-13 digits total)
 */
export function arbitraryPhoneNumber(): fc.Arbitrary<string> {
  return fc
    .stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
      minLength: 8,
      maxLength: 11,
    })
    .map((digits) => `08${digits}`);
}

/**
 * Generates a valid email address.
 */
export function arbitraryEmail(): fc.Arbitrary<string> {
  return fc.emailAddress();
}

/**
 * Generates a valid Indonesian money amount in Rupiah.
 * Range: Rp 10,000 to Rp 5,000,000 (in multiples of 1000)
 */
export function arbitraryRupiahAmount(): fc.Arbitrary<number> {
  return fc.integer({ min: 10, max: 5000 }).map((n) => n * 1000);
}

/**
 * Generates a valid NISN (Nomor Induk Siswa Nasional).
 * Format: 10 digits.
 */
export function arbitraryNisn(): fc.Arbitrary<string> {
  return fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
    minLength: 10,
    maxLength: 10,
  });
}

/**
 * Generates a valid name (Indonesian style).
 */
export function arbitraryName(): fc.Arbitrary<string> {
  const nameParts = [
    'Ahmad',
    'Budi',
    'Citra',
    'Dewi',
    'Eka',
    'Farhan',
    'Gita',
    'Hadi',
    'Indra',
    'Joko',
    'Kartini',
    'Lina',
    'Muhammad',
    'Nadia',
    'Omar',
    'Putri',
    'Rafi',
    'Sari',
    'Tono',
    'Umar',
    'Vina',
    'Wahyu',
    'Yani',
    'Zahra',
  ];
  return fc
    .tuple(fc.constantFrom(...nameParts), fc.constantFrom(...nameParts))
    .map(([first, last]) => `${first} ${last}`);
}
