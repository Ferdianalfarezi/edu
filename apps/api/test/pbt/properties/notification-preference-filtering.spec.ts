/**
 * Property 12: Notification Preference Filtering
 *
 * For any attendance event, the system SHALL send a notification to the parent
 * if and only if:
 *   (a) the status is NOT 'hadir' AND the parent's `ketidakhadiran_enabled` preference is true, OR
 *   (b) the status IS 'hadir' AND the parent's `kehadiran_enabled` preference is true.
 *
 * Default preferences SHALL be: kehadiran OFF, ketidakhadiran ON.
 *
 * **Validates: Requirements 6.1, 6.4, 6.5, 25.1, 25.2, 25.3**
 *
 * This is a PURE logic property test — simulates the preference filtering function
 * with arbitrary attendance events and preference configurations. No DB or network dependencies.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import {
  arbitraryUuid,
  arbitraryAttendanceStatus,
  type AttendanceStatus,
} from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationPreference {
  user_id: string;
  siswa_id: string;
  kehadiran_enabled: boolean;
  ketidakhadiran_enabled: boolean;
}

interface AttendanceEvent {
  siswa_id: string;
  kelas_id: string;
  kelas_nama: string;
  siswa_nama: string;
  status: AttendanceStatus;
  tanggal: string;
}

interface NotificationDecision {
  siswa_id: string;
  parent_user_id: string;
  should_notify: boolean;
}

// ─── Pure logic (mirrors the notification processor filtering) ────────────────

/**
 * Default preferences applied when no preference record exists for a parent-child pair.
 * Requirements 25.2, 6.5: ketidakhadiran ON, kehadiran OFF.
 */
const DEFAULT_PREFERENCES: Pick<
  NotificationPreference,
  'kehadiran_enabled' | 'ketidakhadiran_enabled'
> = {
  kehadiran_enabled: false,
  ketidakhadiran_enabled: true,
};

/**
 * Determines whether a notification should be sent for a given attendance event
 * based on the parent's notification preferences for that child.
 *
 * Logic:
 * - Status is 'hadir' → send only if kehadiran_enabled is true
 * - Status is 'izin', 'sakit', or 'alpa' → send only if ketidakhadiran_enabled is true
 *
 * This mirrors the preference filtering that occurs in the batch notification processor.
 */
function shouldSendNotification(
  event: AttendanceEvent,
  preference: Pick<NotificationPreference, 'kehadiran_enabled' | 'ketidakhadiran_enabled'> | null,
): boolean {
  // Apply defaults if no preference record exists
  const prefs = preference ?? DEFAULT_PREFERENCES;

  if (event.status === 'hadir') {
    return prefs.kehadiran_enabled;
  }
  // izin, sakit, alpa → ketidakhadiran
  return prefs.ketidakhadiran_enabled;
}

/**
 * Resolves notification decisions for a batch of attendance events.
 * For each event, looks up the parent's preference for that child
 * and determines whether to send a notification.
 *
 * This simulates the batch resolution that happens in the notification processor:
 *   1. Query all parent-child preference records for the class
 *   2. For each attendance event, check preferences
 *   3. Return list of (parent, child, should_notify) decisions
 */
function resolveNotificationDecisions(
  events: AttendanceEvent[],
  parentChildMap: Map<string, string>, // siswa_id → parent_user_id
  preferences: NotificationPreference[],
): NotificationDecision[] {
  // Build preference lookup: "userId:siswaId" → preference
  const prefLookup = new Map(preferences.map((p) => [`${p.user_id}:${p.siswa_id}`, p]));

  return events
    .filter((event) => parentChildMap.has(event.siswa_id))
    .map((event) => {
      const parentId = parentChildMap.get(event.siswa_id)!;
      const pref = prefLookup.get(`${parentId}:${event.siswa_id}`) ?? null;
      return {
        siswa_id: event.siswa_id,
        parent_user_id: parentId,
        should_notify: shouldSendNotification(event, pref),
      };
    });
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

/**
 * Generates a notification preference record with arbitrary boolean toggles.
 */
function arbitraryPreference(
  userId?: string,
  siswaId?: string,
): fc.Arbitrary<NotificationPreference> {
  return fc.record({
    user_id: userId ? fc.constant(userId) : arbitraryUuid(),
    siswa_id: siswaId ? fc.constant(siswaId) : arbitraryUuid(),
    kehadiran_enabled: fc.boolean(),
    ketidakhadiran_enabled: fc.boolean(),
  });
}

/**
 * Generates an attendance event with a given status.
 */
function arbitraryEvent(
  siswaId?: string,
  status?: AttendanceStatus,
): fc.Arbitrary<AttendanceEvent> {
  return fc.record({
    siswa_id: siswaId ? fc.constant(siswaId) : arbitraryUuid(),
    kelas_id: arbitraryUuid(),
    kelas_nama: fc.constantFrom('1A', '1B', '2A', '2B', '3A', '4A', '5A', '6A'),
    siswa_nama: fc.constantFrom('Ahmad', 'Budi', 'Citra', 'Dewi', 'Eka', 'Farhan'),
    status: status ? fc.constant(status) : arbitraryAttendanceStatus(),
    tanggal: fc.constant('2024-09-15'),
  });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 12: Notification Preference Filtering', () => {
  describe('ketidakhadiran_enabled = false suppresses non-hadir notifications', () => {
    it('when parent has ketidakhadiran_enabled = false for a child, NO notification is sent for izin/sakit/alpa', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // parent_id
          arbitraryUuid(), // siswa_id
          fc.constantFrom('izin' as const, 'sakit' as const, 'alpa' as const),
          (parentId, siswaId, status) => {
            const preference: NotificationPreference = {
              user_id: parentId,
              siswa_id: siswaId,
              kehadiran_enabled: fc.sample(fc.boolean(), 1)[0], // doesn't matter for non-hadir
              ketidakhadiran_enabled: false, // explicitly disabled
            };

            const event: AttendanceEvent = {
              siswa_id: siswaId,
              kelas_id: 'kelas-1',
              kelas_nama: '1A',
              siswa_nama: 'Test',
              status,
              tanggal: '2024-09-15',
            };

            const result = shouldSendNotification(event, preference);

            // PROPERTY: ketidakhadiran_enabled = false → NO notification for non-hadir statuses
            return result === false;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('kehadiran_enabled = false suppresses hadir notifications', () => {
    it('when parent has kehadiran_enabled = false (default), NO notification is sent for hadir status', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // parent_id
          arbitraryUuid(), // siswa_id
          (parentId, siswaId) => {
            const preference: NotificationPreference = {
              user_id: parentId,
              siswa_id: siswaId,
              kehadiran_enabled: false, // explicitly disabled (default)
              ketidakhadiran_enabled: fc.sample(fc.boolean(), 1)[0], // doesn't matter for hadir
            };

            const event: AttendanceEvent = {
              siswa_id: siswaId,
              kelas_id: 'kelas-1',
              kelas_nama: '1A',
              siswa_nama: 'Test',
              status: 'hadir',
              tanggal: '2024-09-15',
            };

            const result = shouldSendNotification(event, preference);

            // PROPERTY: kehadiran_enabled = false → NO notification for hadir status
            return result === false;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('kehadiran_enabled = true sends hadir notifications', () => {
    it('when parent has kehadiran_enabled = true, a notification IS sent for hadir status', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // parent_id
          arbitraryUuid(), // siswa_id
          (parentId, siswaId) => {
            const preference: NotificationPreference = {
              user_id: parentId,
              siswa_id: siswaId,
              kehadiran_enabled: true, // explicitly enabled
              ketidakhadiran_enabled: fc.sample(fc.boolean(), 1)[0],
            };

            const event: AttendanceEvent = {
              siswa_id: siswaId,
              kelas_id: 'kelas-1',
              kelas_nama: '1A',
              siswa_nama: 'Test',
              status: 'hadir',
              tanggal: '2024-09-15',
            };

            const result = shouldSendNotification(event, preference);

            // PROPERTY: kehadiran_enabled = true → notification IS sent for hadir
            return result === true;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Default preferences: ketidakhadiran ON, kehadiran OFF', () => {
    it('with no preference record (null), non-hadir statuses trigger notification (ketidakhadiran defaults ON)', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('izin' as const, 'sakit' as const, 'alpa' as const),
          arbitraryUuid(), // siswa_id
          (status, siswaId) => {
            const event: AttendanceEvent = {
              siswa_id: siswaId,
              kelas_id: 'kelas-1',
              kelas_nama: '2A',
              siswa_nama: 'Test Student',
              status,
              tanggal: '2024-09-15',
            };

            // null preference = no record exists → apply defaults
            const result = shouldSendNotification(event, null);

            // PROPERTY: default ketidakhadiran_enabled = true → notification sent for izin/sakit/alpa
            return result === true;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('with no preference record (null), hadir status does NOT trigger notification (kehadiran defaults OFF)', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // siswa_id
          (siswaId) => {
            const event: AttendanceEvent = {
              siswa_id: siswaId,
              kelas_id: 'kelas-1',
              kelas_nama: '2A',
              siswa_nama: 'Test Student',
              status: 'hadir',
              tanggal: '2024-09-15',
            };

            // null preference = no record exists → apply defaults
            const result = shouldSendNotification(event, null);

            // PROPERTY: default kehadiran_enabled = false → NO notification for hadir
            return result === false;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Batch resolution correctly applies per-child preferences', () => {
    it('resolves notification decisions correctly for multiple children with different preferences', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // parent_id
          fc.array(arbitraryUuid(), { minLength: 2, maxLength: 5 }), // siswa_ids (children)
          fc.array(arbitraryAttendanceStatus(), { minLength: 2, maxLength: 5 }),
          fc.array(fc.boolean(), { minLength: 2, maxLength: 5 }), // kehadiran toggles
          fc.array(fc.boolean(), { minLength: 2, maxLength: 5 }), // ketidakhadiran toggles
          (parentId, siswaIds, statuses, kehadiranToggles, ketidakhadiranToggles) => {
            // Ensure arrays are aligned (use minimum length)
            const count = Math.min(
              siswaIds.length,
              statuses.length,
              kehadiranToggles.length,
              ketidakhadiranToggles.length,
            );
            if (count < 2) return true; // skip degenerate cases

            // Build parent-child map
            const parentChildMap = new Map<string, string>();
            for (let i = 0; i < count; i++) {
              parentChildMap.set(siswaIds[i], parentId);
            }

            // Build preferences
            const preferences: NotificationPreference[] = [];
            for (let i = 0; i < count; i++) {
              preferences.push({
                user_id: parentId,
                siswa_id: siswaIds[i],
                kehadiran_enabled: kehadiranToggles[i],
                ketidakhadiran_enabled: ketidakhadiranToggles[i],
              });
            }

            // Build events
            const events: AttendanceEvent[] = [];
            for (let i = 0; i < count; i++) {
              events.push({
                siswa_id: siswaIds[i],
                kelas_id: 'kelas-1',
                kelas_nama: '1A',
                siswa_nama: `Student ${i}`,
                status: statuses[i],
                tanggal: '2024-09-15',
              });
            }

            const decisions = resolveNotificationDecisions(events, parentChildMap, preferences);

            // PROPERTY: each decision matches the expected filtering logic
            for (let i = 0; i < count; i++) {
              const decision = decisions.find((d) => d.siswa_id === siswaIds[i]);
              if (!decision) return false;

              const expectedNotify =
                statuses[i] === 'hadir' ? kehadiranToggles[i] : ketidakhadiranToggles[i];

              if (decision.should_notify !== expectedNotify) {
                return false;
              }
            }
            return true;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('children without preference records get default behavior applied', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // parent_id
          arbitraryUuid(), // child with prefs
          arbitraryUuid(), // child without prefs (no record)
          arbitraryAttendanceStatus(),
          arbitraryAttendanceStatus(),
          fc.boolean(), // kehadiran pref for child1
          fc.boolean(), // ketidakhadiran pref for child1
          (
            parentId,
            childWithPref,
            childWithoutPref,
            status1,
            status2,
            kehadiran1,
            ketidakhadiran1,
          ) => {
            fc.pre(childWithPref !== childWithoutPref);

            const parentChildMap = new Map<string, string>([
              [childWithPref, parentId],
              [childWithoutPref, parentId],
            ]);

            // Only child1 has an explicit preference record
            const preferences: NotificationPreference[] = [
              {
                user_id: parentId,
                siswa_id: childWithPref,
                kehadiran_enabled: kehadiran1,
                ketidakhadiran_enabled: ketidakhadiran1,
              },
            ];

            const events: AttendanceEvent[] = [
              {
                siswa_id: childWithPref,
                kelas_id: 'kelas-1',
                kelas_nama: '1A',
                siswa_nama: 'Child 1',
                status: status1,
                tanggal: '2024-09-15',
              },
              {
                siswa_id: childWithoutPref,
                kelas_id: 'kelas-2',
                kelas_nama: '2A',
                siswa_nama: 'Child 2',
                status: status2,
                tanggal: '2024-09-15',
              },
            ];

            const decisions = resolveNotificationDecisions(events, parentChildMap, preferences);

            // Verify child WITH preferences uses explicit values
            const dec1 = decisions.find((d) => d.siswa_id === childWithPref);
            if (!dec1) return false;
            const expected1 = status1 === 'hadir' ? kehadiran1 : ketidakhadiran1;
            if (dec1.should_notify !== expected1) return false;

            // Verify child WITHOUT preferences uses defaults (kehadiran=false, ketidakhadiran=true)
            const dec2 = decisions.find((d) => d.siswa_id === childWithoutPref);
            if (!dec2) return false;
            const expected2 = status2 === 'hadir' ? false : true; // defaults
            if (dec2.should_notify !== expected2) return false;

            return true;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Bidirectional completeness — all statuses covered', () => {
    it('for any status and any preference combination, the notification decision is deterministic', () => {
      fc.assert(
        fc.property(
          arbitraryAttendanceStatus(),
          fc.boolean(), // kehadiran_enabled
          fc.boolean(), // ketidakhadiran_enabled
          arbitraryUuid(), // siswa_id
          (status, kehadiranEnabled, ketidakhadiranEnabled, siswaId) => {
            const preference: NotificationPreference = {
              user_id: 'parent-1',
              siswa_id: siswaId,
              kehadiran_enabled: kehadiranEnabled,
              ketidakhadiran_enabled: ketidakhadiranEnabled,
            };

            const event: AttendanceEvent = {
              siswa_id: siswaId,
              kelas_id: 'kelas-1',
              kelas_nama: '1A',
              siswa_nama: 'Test',
              status,
              tanggal: '2024-09-15',
            };

            const result = shouldSendNotification(event, preference);

            // PROPERTY: result must match the biconditional:
            // hadir → kehadiran_enabled
            // non-hadir → ketidakhadiran_enabled
            const expected = status === 'hadir' ? kehadiranEnabled : ketidakhadiranEnabled;
            return result === expected;
          },
        ),
        PBT_CONFIG,
      );
    });
  });
});
