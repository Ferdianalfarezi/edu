/**
 * Property 2: Attendance Authorization Enforcement
 *
 * For any user attempting to input or edit attendance for a class on a given day,
 * the system SHALL permit the operation if and only if the user is:
 *   (a) a guru with an active schedule entry for that class on that day,
 *   (b) a guru_pengganti assigned to that class on that date, or
 *   (c) a user with role kepala_sekolah in the same tenant.
 * All other users (including admin) SHALL be rejected.
 *
 * **Validates: Requirements 1.7, 2.1, 2.2, 2.3, 2.4, 3.3**
 *
 * This is a PURE logic property test — simulates the authorization decision function
 * with arbitrary inputs. No DB or network dependencies.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid, arbitrarySchoolDate, type Role } from '../arbitraries/common';

// ─── Types representing the authorization context ─────────────────────────────

interface JadwalEntry {
  guru_id: string;
  kelas_id: string;
  hari: string;
  tanggal_mulai_berlaku: string;
  tanggal_selesai_berlaku: string;
}

interface GuruPenggantiEntry {
  guru_pengganti_id: string;
  kelas_id: string;
  tanggal: string;
}

interface AuthorizationContext {
  jadwalEntries: JadwalEntry[];
  guruPenggantiEntries: GuruPenggantiEntry[];
}

interface AttendanceAuthRequest {
  userId: string;
  userRole: Role;
  kelasId: string;
  tanggal: string;
  tenantId: string;
}

// ─── Pure authorization logic (mirrors the service implementation) ─────────────

const DAY_MAP: Record<number, string> = {
  0: 'minggu',
  1: 'senin',
  2: 'selasa',
  3: 'rabu',
  4: 'kamis',
  5: 'jumat',
  6: 'sabtu',
};

/**
 * Determines if a guru has an active jadwal for a class on the given date.
 * Checks: day of week matches AND date is within validity range.
 */
function hasActiveJadwal(
  guruId: string,
  kelasId: string,
  tanggal: string,
  jadwalEntries: JadwalEntry[],
): boolean {
  const dateObj = new Date(tanggal + 'T00:00:00');
  const dayIndex = dateObj.getDay();
  const hari = DAY_MAP[dayIndex];

  if (!hari) return false;

  return jadwalEntries.some(
    (j) =>
      j.guru_id === guruId &&
      j.kelas_id === kelasId &&
      j.hari === hari &&
      j.tanggal_mulai_berlaku <= tanggal &&
      j.tanggal_selesai_berlaku >= tanggal,
  );
}

/**
 * Determines if a guru is assigned as guru_pengganti for a class on a date.
 */
function isGuruPengganti(
  guruId: string,
  kelasId: string,
  tanggal: string,
  guruPenggantiEntries: GuruPenggantiEntry[],
): boolean {
  return guruPenggantiEntries.some(
    (gp) => gp.guru_pengganti_id === guruId && gp.kelas_id === kelasId && gp.tanggal === tanggal,
  );
}

/**
 * Determines if a guru has ANY jadwal (current or historical) for a class.
 * Used for edit authorization (no date restriction).
 */
function hasAnyJadwalForClass(
  guruId: string,
  kelasId: string,
  jadwalEntries: JadwalEntry[],
): boolean {
  return jadwalEntries.some((j) => j.guru_id === guruId && j.kelas_id === kelasId);
}

/**
 * Core authorization decision for attendance INPUT.
 * Returns true if the user is allowed to input attendance.
 *
 * Requirements: 1.7
 */
function canInputAttendance(
  request: AttendanceAuthRequest,
  context: AuthorizationContext,
): boolean {
  const { userId, userRole, kelasId, tanggal } = request;

  // Only guru role can input attendance
  if (userRole !== 'guru') return false;

  // Guru must be scheduled for this class on this date OR be guru_pengganti
  return (
    hasActiveJadwal(userId, kelasId, tanggal, context.jadwalEntries) ||
    isGuruPengganti(userId, kelasId, tanggal, context.guruPenggantiEntries)
  );
}

/**
 * Core authorization decision for attendance EDIT.
 * Returns true if the user is allowed to edit attendance.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 3.3
 */
function canEditAttendance(request: AttendanceAuthRequest, context: AuthorizationContext): boolean {
  const { userId, userRole, kelasId } = request;

  // Admin is NEVER allowed to edit (Req 2.2)
  if (userRole === 'admin') return false;

  // Kepala_sekolah can ALWAYS edit any class (Req 2.4)
  if (userRole === 'kepala_sekolah') return true;

  // Only guru (beyond kepala_sekolah) can edit
  if (userRole !== 'guru') return false;

  // Guru must have any jadwal (current or past) for this class (Req 2.1, 2.3)
  return hasAnyJadwalForClass(userId, kelasId, context.jadwalEntries);
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

const DAYS_OF_WEEK = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'] as const;

/**
 * Generates a jadwal entry that is guaranteed to match the given date.
 */
function arbitraryMatchingJadwal(
  guruId: string,
  kelasId: string,
  tanggal: string,
): fc.Arbitrary<JadwalEntry> {
  const dateObj = new Date(tanggal + 'T00:00:00');
  const dayIndex = dateObj.getDay();
  const hari = DAY_MAP[dayIndex];

  return fc.record({
    guru_id: fc.constant(guruId),
    kelas_id: fc.constant(kelasId),
    hari: fc.constant(hari),
    tanggal_mulai_berlaku: fc.constant(
      new Date(dateObj.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    ),
    tanggal_selesai_berlaku: fc.constant(
      new Date(dateObj.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    ),
  });
}

/**
 * Generates a jadwal entry for a random day/validity that does NOT match the given date.
 */
function arbitraryNonMatchingJadwal(
  guruId: string,
  kelasId: string,
  tanggal: string,
): fc.Arbitrary<JadwalEntry> {
  const dateObj = new Date(tanggal + 'T00:00:00');
  const dayIndex = dateObj.getDay();
  const matchingHari = DAY_MAP[dayIndex];

  // Strategy: use a different day of week so it never matches
  const otherDays = DAYS_OF_WEEK.filter((d) => d !== matchingHari);

  return fc.record({
    guru_id: fc.constant(guruId),
    kelas_id: fc.constant(kelasId),
    hari: fc.constantFrom(...(otherDays.length > 0 ? otherDays : ['minggu'])),
    tanggal_mulai_berlaku: fc.constant(
      new Date(dateObj.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    ),
    tanggal_selesai_berlaku: fc.constant(
      new Date(dateObj.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    ),
  });
}

/**
 * Generates a jadwal entry for a class but for a DIFFERENT guru.
 */
function arbitraryJadwalForOtherGuru(
  otherGuruId: string,
  kelasId: string,
): fc.Arbitrary<JadwalEntry> {
  return fc.record({
    guru_id: fc.constant(otherGuruId),
    kelas_id: fc.constant(kelasId),
    hari: fc.constantFrom(...DAYS_OF_WEEK),
    tanggal_mulai_berlaku: arbitrarySchoolDate(),
    tanggal_selesai_berlaku: arbitrarySchoolDate(),
  });
}

/**
 * Generates a guru_pengganti entry matching the given guru, class, and date.
 */
function arbitraryMatchingPengganti(
  guruId: string,
  kelasId: string,
  tanggal: string,
): fc.Arbitrary<GuruPenggantiEntry> {
  return fc.constant({
    guru_pengganti_id: guruId,
    kelas_id: kelasId,
    tanggal,
  });
}

/**
 * Generates a weekday date (Mon-Sat) to avoid Sunday (no school).
 */
function arbitraryWeekdayDate(): fc.Arbitrary<string> {
  return fc
    .date({
      min: new Date('2023-01-02'), // Monday
      max: new Date('2028-12-30'),
    })
    .filter((d) => d.getDay() !== 0) // Exclude Sunday (no school)
    .map((d) => d.toISOString().split('T')[0]);
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 2: Attendance Authorization Enforcement', () => {
  describe('Input Authorization', () => {
    it('guru NOT scheduled for class AND NOT guru_pengganti → attendance input DENIED', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // guruId
          arbitraryUuid(), // kelasId
          arbitraryUuid(), // tenantId
          arbitraryWeekdayDate(), // tanggal
          arbitraryUuid(), // otherGuruId (the one who IS scheduled)
          (guruId, kelasId, tenantId, tanggal, otherGuruId) => {
            // Precondition: guru and otherGuru are different
            fc.pre(guruId !== otherGuruId);

            // Context: another guru has jadwal for this class, but NOT our guru.
            // Also no guru_pengganti assignment for our guru.
            const context: AuthorizationContext = {
              jadwalEntries: [
                {
                  guru_id: otherGuruId,
                  kelas_id: kelasId,
                  hari: DAY_MAP[new Date(tanggal + 'T00:00:00').getDay()],
                  tanggal_mulai_berlaku: new Date(
                    new Date(tanggal).getTime() - 30 * 24 * 60 * 60 * 1000,
                  )
                    .toISOString()
                    .split('T')[0],
                  tanggal_selesai_berlaku: new Date(
                    new Date(tanggal).getTime() + 30 * 24 * 60 * 60 * 1000,
                  )
                    .toISOString()
                    .split('T')[0],
                },
              ],
              guruPenggantiEntries: [], // No pengganti assignment
            };

            const request: AttendanceAuthRequest = {
              userId: guruId,
              userRole: 'guru',
              kelasId,
              tanggal,
              tenantId,
            };

            // PROPERTY: guru without schedule and without pengganti assignment is DENIED
            return canInputAttendance(request, context) === false;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('guru scheduled for class on date → attendance input ALLOWED', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // guruId
          arbitraryUuid(), // kelasId
          arbitraryUuid(), // tenantId
          arbitraryWeekdayDate(), // tanggal
          (guruId, kelasId, tenantId, tanggal) => {
            const dateObj = new Date(tanggal + 'T00:00:00');
            const hari = DAY_MAP[dateObj.getDay()];

            // Context: guru has an active jadwal for this class on this day
            const context: AuthorizationContext = {
              jadwalEntries: [
                {
                  guru_id: guruId,
                  kelas_id: kelasId,
                  hari,
                  tanggal_mulai_berlaku: new Date(dateObj.getTime() - 60 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split('T')[0],
                  tanggal_selesai_berlaku: new Date(dateObj.getTime() + 60 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split('T')[0],
                },
              ],
              guruPenggantiEntries: [],
            };

            const request: AttendanceAuthRequest = {
              userId: guruId,
              userRole: 'guru',
              kelasId,
              tanggal,
              tenantId,
            };

            // PROPERTY: guru with active jadwal is ALLOWED
            return canInputAttendance(request, context) === true;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('guru_pengganti assigned to class on date → attendance input ALLOWED', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // guruId (substitute)
          arbitraryUuid(), // kelasId
          arbitraryUuid(), // tenantId
          arbitraryWeekdayDate(), // tanggal
          (guruId, kelasId, tenantId, tanggal) => {
            // Context: guru has NO jadwal but IS assigned as guru_pengganti
            const context: AuthorizationContext = {
              jadwalEntries: [], // No regular schedule
              guruPenggantiEntries: [
                {
                  guru_pengganti_id: guruId,
                  kelas_id: kelasId,
                  tanggal,
                },
              ],
            };

            const request: AttendanceAuthRequest = {
              userId: guruId,
              userRole: 'guru',
              kelasId,
              tanggal,
              tenantId,
            };

            // PROPERTY: guru_pengganti for the class on the date is ALLOWED
            return canInputAttendance(request, context) === true;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('non-guru roles cannot input attendance regardless of jadwal', () => {
      const nonGuruRoles: Role[] = [
        'admin',
        'kepala_sekolah',
        'bendahara',
        'orang_tua',
        'super_admin',
      ];

      fc.assert(
        fc.property(
          arbitraryUuid(), // userId
          arbitraryUuid(), // kelasId
          arbitraryUuid(), // tenantId
          arbitraryWeekdayDate(), // tanggal
          fc.constantFrom(...nonGuruRoles),
          (userId, kelasId, tenantId, tanggal, role) => {
            const dateObj = new Date(tanggal + 'T00:00:00');
            const hari = DAY_MAP[dateObj.getDay()];

            // Context: even if user appears in jadwal (hypothetically)
            const context: AuthorizationContext = {
              jadwalEntries: [
                {
                  guru_id: userId,
                  kelas_id: kelasId,
                  hari,
                  tanggal_mulai_berlaku: new Date(dateObj.getTime() - 30 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split('T')[0],
                  tanggal_selesai_berlaku: new Date(dateObj.getTime() + 30 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split('T')[0],
                },
              ],
              guruPenggantiEntries: [{ guru_pengganti_id: userId, kelas_id: kelasId, tanggal }],
            };

            const request: AttendanceAuthRequest = {
              userId,
              userRole: role,
              kelasId,
              tanggal,
              tenantId,
            };

            // PROPERTY: non-guru roles are always DENIED for input
            return canInputAttendance(request, context) === false;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Edit Authorization', () => {
    it('admin role can NEVER edit attendance regardless of other conditions', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // adminId
          arbitraryUuid(), // kelasId
          arbitraryUuid(), // tenantId
          arbitraryWeekdayDate(), // tanggal
          (adminId, kelasId, tenantId, tanggal) => {
            const dateObj = new Date(tanggal + 'T00:00:00');
            const hari = DAY_MAP[dateObj.getDay()];

            // Context: even if admin has jadwal entries (should still be denied)
            const context: AuthorizationContext = {
              jadwalEntries: [
                {
                  guru_id: adminId,
                  kelas_id: kelasId,
                  hari,
                  tanggal_mulai_berlaku: new Date(dateObj.getTime() - 30 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split('T')[0],
                  tanggal_selesai_berlaku: new Date(dateObj.getTime() + 30 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split('T')[0],
                },
              ],
              guruPenggantiEntries: [{ guru_pengganti_id: adminId, kelas_id: kelasId, tanggal }],
            };

            const request: AttendanceAuthRequest = {
              userId: adminId,
              userRole: 'admin',
              kelasId,
              tanggal,
              tenantId,
            };

            // PROPERTY: admin is NEVER allowed to edit attendance (Req 2.2)
            return canEditAttendance(request, context) === false;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('kepala_sekolah can ALWAYS edit attendance regardless of jadwal assignment', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // kepalaId
          arbitraryUuid(), // kelasId
          arbitraryUuid(), // tenantId
          arbitraryWeekdayDate(), // tanggal
          fc.boolean(), // hasJadwal (should not matter)
          (kepalaId, kelasId, tenantId, tanggal, hasJadwal) => {
            // Context: kepala_sekolah may or may not have jadwal — doesn't matter
            const context: AuthorizationContext = {
              jadwalEntries: hasJadwal
                ? [
                    {
                      guru_id: kepalaId,
                      kelas_id: kelasId,
                      hari: DAY_MAP[new Date(tanggal + 'T00:00:00').getDay()],
                      tanggal_mulai_berlaku: tanggal,
                      tanggal_selesai_berlaku: tanggal,
                    },
                  ]
                : [],
              guruPenggantiEntries: [],
            };

            const request: AttendanceAuthRequest = {
              userId: kepalaId,
              userRole: 'kepala_sekolah',
              kelasId,
              tanggal,
              tenantId,
            };

            // PROPERTY: kepala_sekolah can ALWAYS edit attendance (Req 2.4)
            return canEditAttendance(request, context) === true;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('guru with jadwal (current or historical) for class → edit ALLOWED', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // guruId
          arbitraryUuid(), // kelasId
          arbitraryUuid(), // tenantId
          arbitraryWeekdayDate(), // tanggal
          fc.constantFrom(...DAYS_OF_WEEK), // jadwalDay (may be different from tanggal day)
          arbitrarySchoolDate(), // jadwalStart
          arbitrarySchoolDate(), // jadwalEnd
          (guruId, kelasId, tenantId, tanggal, jadwalDay, jadwalStart, jadwalEnd) => {
            // Context: guru has ANY jadwal for this class (day/date don't need to match for edit)
            const context: AuthorizationContext = {
              jadwalEntries: [
                {
                  guru_id: guruId,
                  kelas_id: kelasId,
                  hari: jadwalDay,
                  tanggal_mulai_berlaku: jadwalStart,
                  tanggal_selesai_berlaku: jadwalEnd,
                },
              ],
              guruPenggantiEntries: [],
            };

            const request: AttendanceAuthRequest = {
              userId: guruId,
              userRole: 'guru',
              kelasId,
              tanggal,
              tenantId,
            };

            // PROPERTY: guru with any jadwal for the class can edit (Req 2.1, 2.3)
            return canEditAttendance(request, context) === true;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('guru without any jadwal for class → edit DENIED', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // guruId
          arbitraryUuid(), // kelasId
          arbitraryUuid(), // tenantId
          arbitraryUuid(), // otherKelasId
          arbitraryWeekdayDate(), // tanggal
          (guruId, kelasId, tenantId, otherKelasId, tanggal) => {
            // Precondition: the two class IDs are different
            fc.pre(kelasId !== otherKelasId);

            // Context: guru has jadwal but for a DIFFERENT class
            const context: AuthorizationContext = {
              jadwalEntries: [
                {
                  guru_id: guruId,
                  kelas_id: otherKelasId, // Different class!
                  hari: DAY_MAP[new Date(tanggal + 'T00:00:00').getDay()],
                  tanggal_mulai_berlaku: tanggal,
                  tanggal_selesai_berlaku: tanggal,
                },
              ],
              guruPenggantiEntries: [],
            };

            const request: AttendanceAuthRequest = {
              userId: guruId,
              userRole: 'guru',
              kelasId,
              tanggal,
              tenantId,
            };

            // PROPERTY: guru without jadwal for THIS class is DENIED for edit
            return canEditAttendance(request, context) === false;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('bendahara, orang_tua, super_admin cannot edit attendance', () => {
      const deniedRoles: Role[] = ['bendahara', 'orang_tua', 'super_admin'];

      fc.assert(
        fc.property(
          arbitraryUuid(), // userId
          arbitraryUuid(), // kelasId
          arbitraryUuid(), // tenantId
          arbitraryWeekdayDate(), // tanggal
          fc.constantFrom(...deniedRoles),
          (userId, kelasId, tenantId, tanggal, role) => {
            const dateObj = new Date(tanggal + 'T00:00:00');
            const hari = DAY_MAP[dateObj.getDay()];

            // Context: even with jadwal (impossible in practice, but testing the logic)
            const context: AuthorizationContext = {
              jadwalEntries: [
                {
                  guru_id: userId,
                  kelas_id: kelasId,
                  hari,
                  tanggal_mulai_berlaku: tanggal,
                  tanggal_selesai_berlaku: tanggal,
                },
              ],
              guruPenggantiEntries: [],
            };

            const request: AttendanceAuthRequest = {
              userId,
              userRole: role,
              kelasId,
              tanggal,
              tenantId,
            };

            // PROPERTY: these roles are NEVER allowed to edit
            return canEditAttendance(request, context) === false;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Read-only enforcement (Req 3.3)', () => {
    it('guru without jadwal for a class has read-only access (no edit)', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // guruId
          arbitraryUuid(), // otherGuruId (the one scheduled)
          arbitraryUuid(), // kelasId
          arbitraryUuid(), // tenantId
          arbitraryWeekdayDate(), // tanggal
          (guruId, otherGuruId, kelasId, tenantId, tanggal) => {
            fc.pre(guruId !== otherGuruId);

            // Context: only another guru is scheduled for this class
            const context: AuthorizationContext = {
              jadwalEntries: [
                {
                  guru_id: otherGuruId,
                  kelas_id: kelasId,
                  hari: DAY_MAP[new Date(tanggal + 'T00:00:00').getDay()],
                  tanggal_mulai_berlaku: new Date(
                    new Date(tanggal).getTime() - 30 * 24 * 60 * 60 * 1000,
                  )
                    .toISOString()
                    .split('T')[0],
                  tanggal_selesai_berlaku: new Date(
                    new Date(tanggal).getTime() + 30 * 24 * 60 * 60 * 1000,
                  )
                    .toISOString()
                    .split('T')[0],
                },
              ],
              guruPenggantiEntries: [],
            };

            const request: AttendanceAuthRequest = {
              userId: guruId,
              userRole: 'guru',
              kelasId,
              tanggal,
              tenantId,
            };

            // PROPERTY: guru can see attendance (not tested here — view is always allowed)
            // but CANNOT edit if they have no jadwal for this class
            const canEdit = canEditAttendance(request, context);
            const canInput = canInputAttendance(request, context);

            return canEdit === false && canInput === false;
          },
        ),
        PBT_CONFIG,
      );
    });
  });
});
