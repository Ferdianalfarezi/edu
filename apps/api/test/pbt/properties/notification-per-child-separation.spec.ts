/**
 * Property 13: Per-Child Notification Separation
 *
 * For any parent with N children in a school, when attendance is recorded
 * for all N children, the system SHALL generate exactly N separate notifications —
 * one per child, each containing that specific child's information.
 *
 * **Validates: Requirements 6.6, 6.8**
 *
 * Requirements:
 *   6.6 - THE Sistem_Notifikasi SHALL menyertakan informasi dalam notifikasi:
 *         nama siswa, Status_Kehadiran, tanggal, dan nama kelas
 *   6.8 - WHEN Orang_Tua memiliki lebih dari satu anak di sekolah yang sama,
 *         THE Sistem_Notifikasi SHALL mengirim notifikasi terpisah untuk setiap anak
 *
 * This is a PURE logic property test — simulates the notification generation
 * logic for multi-child parents. No DB or network dependencies.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import {
  arbitraryUuid,
  arbitraryName,
  arbitraryAttendanceStatus,
  type AttendanceStatus,
} from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChildRecord {
  siswa_id: string;
  siswa_nama: string;
  kelas_id: string;
  kelas_nama: string;
  orang_tua_id: string;
}

interface AttendanceRecord {
  siswa_id: string;
  status: AttendanceStatus;
}

interface NotificationPreference {
  user_id: string;
  siswa_id: string;
  kehadiran_enabled: boolean;
  ketidakhadiran_enabled: boolean;
}

interface GeneratedNotification {
  user_id: string;
  siswa_id: string;
  siswa_nama: string;
  status: AttendanceStatus;
  tanggal: string;
  kelas_nama: string;
}

// ─── Pure Logic (mirrors notification processor implementation) ────────────────

/**
 * Generates notifications for a batch of attendance records.
 * This mirrors the `resolveParentsWithPreferences` logic from the notification processor:
 *
 * 1. For each attendance record, look up the child and their parent
 * 2. Check parent's notification preference for that specific child
 * 3. Generate one notification PER CHILD (not per parent) with child-specific info
 *
 * Key requirement (6.8): Each child gets a SEPARATE notification, even if
 * they share the same parent.
 */
function generateNotificationsForBatch(
  attendanceRecords: AttendanceRecord[],
  children: ChildRecord[],
  preferences: NotificationPreference[],
  tanggal: string,
): GeneratedNotification[] {
  const notifications: GeneratedNotification[] = [];

  // Build lookup maps
  const childMap = new Map(children.map((c) => [c.siswa_id, c]));
  const prefMap = new Map(preferences.map((p) => [`${p.user_id}:${p.siswa_id}`, p]));

  for (const record of attendanceRecords) {
    const child = childMap.get(record.siswa_id);
    if (!child) continue;

    const parentId = child.orang_tua_id;

    // Get preference for this specific parent-child pair
    const pref = prefMap.get(`${parentId}:${record.siswa_id}`);

    // Default preferences: ketidakhadiran ON, kehadiran OFF
    const kehadiranEnabled = pref?.kehadiran_enabled ?? false;
    const ketidakhadiranEnabled = pref?.ketidakhadiran_enabled ?? true;

    // Determine if notification should be sent
    const isHadir = record.status === 'hadir';
    const shouldNotify = isHadir ? kehadiranEnabled : ketidakhadiranEnabled;

    if (shouldNotify) {
      // Requirement 6.6: include nama siswa, status, tanggal, kelas_nama
      // Requirement 6.8: one notification PER child
      notifications.push({
        user_id: parentId,
        siswa_id: record.siswa_id,
        siswa_nama: child.siswa_nama,
        status: record.status,
        tanggal,
        kelas_nama: child.kelas_nama,
      });
    }
  }

  return notifications;
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

/**
 * Generates a parent with N children (2-5 children, simulating multi-child family).
 */
function arbitraryParentWithChildren(options?: {
  minChildren?: number;
  maxChildren?: number;
}): fc.Arbitrary<{ parentId: string; children: ChildRecord[] }> {
  const minChildren = options?.minChildren ?? 2;
  const maxChildren = options?.maxChildren ?? 5;

  return fc
    .record({
      parentId: arbitraryUuid(),
      childCount: fc.integer({ min: minChildren, max: maxChildren }),
    })
    .chain(({ parentId, childCount }) => {
      const childArbs = Array.from({ length: childCount }, () =>
        fc.record({
          siswa_id: arbitraryUuid(),
          siswa_nama: arbitraryName(),
          kelas_id: arbitraryUuid(),
          kelas_nama: fc.constantFrom('1A', '1B', '2A', '2B', '3A', '3B', '4A', '5A', '6A'),
          orang_tua_id: fc.constant(parentId),
        }),
      );
      return fc.tuple(...childArbs).map((children) => ({
        parentId,
        children: children as ChildRecord[],
      }));
    });
}

/**
 * Generates attendance records for all children of a parent.
 */
function arbitraryAttendanceForChildren(children: ChildRecord[]): fc.Arbitrary<AttendanceRecord[]> {
  const recordArbs = children.map((child) =>
    arbitraryAttendanceStatus().map((status) => ({
      siswa_id: child.siswa_id,
      status,
    })),
  );
  return fc.tuple(...recordArbs).map((records) => records as AttendanceRecord[]);
}

/**
 * Generates notification preferences for a parent's children.
 * All preferences have notifications enabled (both hadir and non-hadir).
 */
function arbitraryAllEnabledPreferences(
  parentId: string,
  children: ChildRecord[],
): NotificationPreference[] {
  return children.map((child) => ({
    user_id: parentId,
    siswa_id: child.siswa_id,
    kehadiran_enabled: true,
    ketidakhadiran_enabled: true,
  }));
}

/**
 * Generates mixed preferences: some children have hadir enabled, some don't.
 */
function arbitraryMixedPreferences(
  parentId: string,
  children: ChildRecord[],
): fc.Arbitrary<NotificationPreference[]> {
  const prefArbs = children.map((child) =>
    fc.record({
      user_id: fc.constant(parentId),
      siswa_id: fc.constant(child.siswa_id),
      kehadiran_enabled: fc.boolean(),
      ketidakhadiran_enabled: fc.boolean(),
    }),
  );
  return fc.tuple(...prefArbs).map((prefs) => prefs as NotificationPreference[]);
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 13: Per-Child Notification Separation', () => {
  const testDate = '2024-06-15';

  describe('Parent with N children receives N separate notifications (Req 6.8)', () => {
    it('parent with N children gets exactly N notifications when all preferences enabled', () => {
      fc.assert(
        fc.property(
          arbitraryParentWithChildren({ minChildren: 2, maxChildren: 5 }),
          ({ parentId, children }) => {
            // All preferences enabled for all statuses
            const preferences = arbitraryAllEnabledPreferences(parentId, children);

            // Create attendance records for all children (any status)
            const attendanceRecords: AttendanceRecord[] = children.map((child) => ({
              siswa_id: child.siswa_id,
              status: 'alpa' as AttendanceStatus, // non-hadir, always notified with default
            }));

            const notifications = generateNotificationsForBatch(
              attendanceRecords,
              children,
              preferences,
              testDate,
            );

            // PROPERTY: exactly N notifications for N children
            return notifications.length === children.length;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('each notification is addressed to the same parent but different child', () => {
      fc.assert(
        fc.property(
          arbitraryParentWithChildren({ minChildren: 2, maxChildren: 5 }),
          ({ parentId, children }) => {
            const preferences = arbitraryAllEnabledPreferences(parentId, children);

            const attendanceRecords: AttendanceRecord[] = children.map((child) => ({
              siswa_id: child.siswa_id,
              status: 'sakit' as AttendanceStatus,
            }));

            const notifications = generateNotificationsForBatch(
              attendanceRecords,
              children,
              preferences,
              testDate,
            );

            // All notifications go to same parent
            const allSameParent = notifications.every((n) => n.user_id === parentId);

            // Each notification references a different child
            const childIds = notifications.map((n) => n.siswa_id);
            const uniqueChildIds = new Set(childIds);
            const allUnique = uniqueChildIds.size === childIds.length;

            return allSameParent && allUnique;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Each notification references exactly one child (Req 6.6)', () => {
    it('every notification contains exactly one siswa_id', () => {
      fc.assert(
        fc.property(
          arbitraryParentWithChildren({ minChildren: 1, maxChildren: 5 }),
          ({ parentId, children }) => {
            const preferences = arbitraryAllEnabledPreferences(parentId, children);

            const attendanceRecords: AttendanceRecord[] = children.map((child) => ({
              siswa_id: child.siswa_id,
              status: 'izin' as AttendanceStatus,
            }));

            const notifications = generateNotificationsForBatch(
              attendanceRecords,
              children,
              preferences,
              testDate,
            );

            // PROPERTY: every notification has a non-empty siswa_id that exists in children
            const childIdSet = new Set(children.map((c) => c.siswa_id));
            return notifications.every(
              (n) => n.siswa_id && n.siswa_id.length > 0 && childIdSet.has(n.siswa_id),
            );
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Notification content includes correct child name and status (Req 6.6)', () => {
    it('notification siswa_nama matches the child referenced by siswa_id', () => {
      fc.assert(
        fc.property(
          arbitraryParentWithChildren({ minChildren: 2, maxChildren: 5 }),
          ({ parentId, children }) => {
            const preferences = arbitraryAllEnabledPreferences(parentId, children);

            const attendanceRecords: AttendanceRecord[] = children.map((child) => ({
              siswa_id: child.siswa_id,
              status: 'alpa' as AttendanceStatus,
            }));

            const notifications = generateNotificationsForBatch(
              attendanceRecords,
              children,
              preferences,
              testDate,
            );

            // Build child lookup
            const childMap = new Map(children.map((c) => [c.siswa_id, c]));

            // PROPERTY: each notification's siswa_nama matches the correct child
            return notifications.every((n) => {
              const child = childMap.get(n.siswa_id);
              return child && n.siswa_nama === child.siswa_nama;
            });
          },
        ),
        PBT_CONFIG,
      );
    });

    it('notification status matches the recorded attendance status for each child', () => {
      fc.assert(
        fc.property(
          arbitraryParentWithChildren({ minChildren: 2, maxChildren: 5 }),
          fc.array(arbitraryAttendanceStatus(), { minLength: 2, maxLength: 5 }),
          ({ parentId, children }, statuses) => {
            // Use up to N statuses for N children
            const preferences = arbitraryAllEnabledPreferences(parentId, children);

            const attendanceRecords: AttendanceRecord[] = children.map((child, i) => ({
              siswa_id: child.siswa_id,
              status: statuses[i % statuses.length],
            }));

            const notifications = generateNotificationsForBatch(
              attendanceRecords,
              children,
              preferences,
              testDate,
            );

            // Build record lookup
            const recordMap = new Map(attendanceRecords.map((r) => [r.siswa_id, r]));

            // PROPERTY: each notification's status matches the attendance status recorded
            return notifications.every((n) => {
              const record = recordMap.get(n.siswa_id);
              return record && n.status === record.status;
            });
          },
        ),
        PBT_CONFIG,
      );
    });

    it('notification kelas_nama matches the child class', () => {
      fc.assert(
        fc.property(
          arbitraryParentWithChildren({ minChildren: 2, maxChildren: 5 }),
          ({ parentId, children }) => {
            const preferences = arbitraryAllEnabledPreferences(parentId, children);

            const attendanceRecords: AttendanceRecord[] = children.map((child) => ({
              siswa_id: child.siswa_id,
              status: 'hadir' as AttendanceStatus,
            }));

            const notifications = generateNotificationsForBatch(
              attendanceRecords,
              children,
              preferences,
              testDate,
            );

            // Build child lookup
            const childMap = new Map(children.map((c) => [c.siswa_id, c]));

            // PROPERTY: each notification's kelas_nama matches the child's actual class
            return notifications.every((n) => {
              const child = childMap.get(n.siswa_id);
              return child && n.kelas_nama === child.kelas_nama;
            });
          },
        ),
        PBT_CONFIG,
      );
    });

    it('notification tanggal matches the attendance date', () => {
      fc.assert(
        fc.property(
          arbitraryParentWithChildren({ minChildren: 1, maxChildren: 4 }),
          fc
            .date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') })
            .map((d) => d.toISOString().split('T')[0]),
          ({ parentId, children }, date) => {
            const preferences = arbitraryAllEnabledPreferences(parentId, children);

            const attendanceRecords: AttendanceRecord[] = children.map((child) => ({
              siswa_id: child.siswa_id,
              status: 'alpa' as AttendanceStatus,
            }));

            const notifications = generateNotificationsForBatch(
              attendanceRecords,
              children,
              preferences,
              date,
            );

            // PROPERTY: every notification's tanggal matches the input date
            return notifications.every((n) => n.tanggal === date);
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Per-child preference enforcement', () => {
    it('if parent has hadir enabled for child A but not child B, only A notification sent on hadir', () => {
      fc.assert(
        fc.property(
          arbitraryParentWithChildren({ minChildren: 2, maxChildren: 5 }),
          fc.integer({ min: 0 }), // index selector for the "enabled" child
          ({ parentId, children }, enabledIdx) => {
            // Pick one child to have kehadiran_enabled = true
            const enabledChildIdx = enabledIdx % children.length;

            // Create preferences: only enabledChild has kehadiran_enabled
            const preferences: NotificationPreference[] = children.map((child, i) => ({
              user_id: parentId,
              siswa_id: child.siswa_id,
              kehadiran_enabled: i === enabledChildIdx,
              ketidakhadiran_enabled: true, // all have ketidakhadiran on
            }));

            // All children recorded as 'hadir'
            const attendanceRecords: AttendanceRecord[] = children.map((child) => ({
              siswa_id: child.siswa_id,
              status: 'hadir' as AttendanceStatus,
            }));

            const notifications = generateNotificationsForBatch(
              attendanceRecords,
              children,
              preferences,
              testDate,
            );

            // PROPERTY: only the enabled child gets a notification for 'hadir'
            return (
              notifications.length === 1 &&
              notifications[0].siswa_id === children[enabledChildIdx].siswa_id
            );
          },
        ),
        PBT_CONFIG,
      );
    });

    it('ketidakhadiran preference per-child: disabled child does not get non-hadir notification', () => {
      fc.assert(
        fc.property(
          arbitraryParentWithChildren({ minChildren: 2, maxChildren: 5 }),
          fc.integer({ min: 0 }), // index selector for the "disabled" child
          fc.constantFrom('izin', 'sakit', 'alpa') as fc.Arbitrary<AttendanceStatus>,
          ({ parentId, children }, disabledIdx, nonHadirStatus) => {
            // Pick one child to have ketidakhadiran_enabled = false
            const disabledChildIdx = disabledIdx % children.length;

            const preferences: NotificationPreference[] = children.map((child, i) => ({
              user_id: parentId,
              siswa_id: child.siswa_id,
              kehadiran_enabled: false,
              ketidakhadiran_enabled: i !== disabledChildIdx, // one child has it disabled
            }));

            // All children have non-hadir status
            const attendanceRecords: AttendanceRecord[] = children.map((child) => ({
              siswa_id: child.siswa_id,
              status: nonHadirStatus,
            }));

            const notifications = generateNotificationsForBatch(
              attendanceRecords,
              children,
              preferences,
              testDate,
            );

            // PROPERTY: disabled child does NOT appear in notifications
            const notifiedChildIds = new Set(notifications.map((n) => n.siswa_id));
            const disabledChildId = children[disabledChildIdx].siswa_id;

            return (
              !notifiedChildIds.has(disabledChildId) && notifications.length === children.length - 1
            );
          },
        ),
        PBT_CONFIG,
      );
    });

    it('mixed preferences with mixed statuses: each child independently filtered', () => {
      fc.assert(
        fc.property(
          arbitraryParentWithChildren({ minChildren: 2, maxChildren: 5 }),
          (parentWithChildren) => {
            const { parentId, children } = parentWithChildren;

            // Use fast-check nested to generate mixed preferences
            return (
              fc.assert(
                fc.property(
                  arbitraryMixedPreferences(parentId, children),
                  fc.array(arbitraryAttendanceStatus(), {
                    minLength: children.length,
                    maxLength: children.length,
                  }),
                  (preferences, statuses) => {
                    const attendanceRecords: AttendanceRecord[] = children.map((child, i) => ({
                      siswa_id: child.siswa_id,
                      status: statuses[i],
                    }));

                    const notifications = generateNotificationsForBatch(
                      attendanceRecords,
                      children,
                      preferences,
                      testDate,
                    );

                    // PROPERTY: each notification corresponds to a child whose preference
                    // allows the notification for that specific status
                    const prefMap = new Map(
                      preferences.map((p) => [`${p.user_id}:${p.siswa_id}`, p]),
                    );

                    for (const notif of notifications) {
                      const pref = prefMap.get(`${notif.user_id}:${notif.siswa_id}`);
                      if (!pref) return false;

                      const isHadir = notif.status === 'hadir';
                      const shouldHaveNotified = isHadir
                        ? pref.kehadiran_enabled
                        : pref.ketidakhadiran_enabled;
                      if (!shouldHaveNotified) return false;
                    }

                    // PROPERTY: no child that SHOULD have been notified was skipped
                    for (let i = 0; i < children.length; i++) {
                      const child = children[i];
                      const status = statuses[i];
                      const pref = prefMap.get(`${parentId}:${child.siswa_id}`);
                      const isHadir = status === 'hadir';
                      const shouldNotify = pref
                        ? isHadir
                          ? pref.kehadiran_enabled
                          : pref.ketidakhadiran_enabled
                        : !isHadir; // default: ketidakhadiran ON, kehadiran OFF

                      const wasNotified = notifications.some((n) => n.siswa_id === child.siswa_id);

                      if (shouldNotify !== wasNotified) return false;
                    }

                    return true;
                  },
                ),
                { numRuns: 10 }, // nested, fewer runs
              ) === undefined
            ); // fc.assert returns undefined on success
          },
        ),
        { numRuns: 10 }, // outer runs fewer since inner does 10 each
      );
    });

    it('default preferences (no explicit record): kehadiran OFF, ketidakhadiran ON', () => {
      fc.assert(
        fc.property(
          arbitraryParentWithChildren({ minChildren: 2, maxChildren: 4 }),
          fc.constantFrom('hadir', 'alpa') as fc.Arbitrary<AttendanceStatus>,
          ({ parentId, children }, status) => {
            // NO preferences set → defaults apply
            const preferences: NotificationPreference[] = [];

            const attendanceRecords: AttendanceRecord[] = children.map((child) => ({
              siswa_id: child.siswa_id,
              status,
            }));

            const notifications = generateNotificationsForBatch(
              attendanceRecords,
              children,
              preferences,
              testDate,
            );

            if (status === 'hadir') {
              // Default kehadiran_enabled = false → no notifications
              return notifications.length === 0;
            } else {
              // Default ketidakhadiran_enabled = true → all children get notifications
              return notifications.length === children.length;
            }
          },
        ),
        PBT_CONFIG,
      );
    });
  });
});
