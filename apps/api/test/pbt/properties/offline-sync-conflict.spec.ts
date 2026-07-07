/**
 * Property 15: Offline Sync Conflict Resolution (Event-Time with Authority Override)
 *
 * The offline sync conflict resolution SHALL:
 *   1. NEVER overwrite records last edited by kepala_sekolah (authority override)
 *   2. Let server win when server updated_at > client event_timestamp
 *   3. Let client win when client event_timestamp > server updated_at
 *   4. ALWAYS reject records with event_timestamp > server_now + 5 minutes (clock skew)
 *   5. Resolve equal timestamps in favor of server (conservative no-write approach)
 *
 * **Validates: Requirements 26.3**
 *
 * This is a PURE logic property test — simulates the conflict resolution decision function
 * with arbitrary inputs. No DB or network dependencies.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import {
  arbitraryUuid,
  arbitraryAttendanceStatus,
  type AttendanceStatus,
} from '../arbitraries/common';

// ─── Types representing the sync conflict context ─────────────────────────────

type ConflictWinner = 'server' | 'client';

interface ExistingRecord {
  id: string;
  status: AttendanceStatus;
  updated_at: Date;
  last_editor_role: string | null; // Role of the last editor (from audit log)
}

interface SyncRecord {
  siswa_id: string;
  kelas_id: string;
  tanggal: string;
  status: AttendanceStatus;
  event_timestamp: Date; // When teacher pressed save (event-time)
}

type SyncDecision =
  | { type: 'insert' }
  | { type: 'conflict'; winner: ConflictWinner; reason: string }
  | { type: 'rejected'; reason: string };

// ─── Pure conflict resolution logic (mirrors the service implementation) ──────

const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Core offline sync conflict resolution decision function.
 *
 * Rules per ADR-003:
 * 1. Clock skew protection: reject if event_timestamp > server_now + 5 min
 * 2. No existing record → insert (synced)
 * 3. Existing edited by kepala_sekolah → server wins (authority override)
 * 4. Server updated_at > client event_timestamp → server wins
 * 5. Client event_timestamp > server updated_at → client wins
 * 6. Equal timestamps → server wins (conservative tie-break)
 */
function resolveOfflineSyncConflict(
  syncRecord: SyncRecord,
  existing: ExistingRecord | null,
  serverNow: Date,
): SyncDecision {
  const maxAllowedTime = new Date(serverNow.getTime() + CLOCK_SKEW_TOLERANCE_MS);

  // Clock skew protection: reject future timestamps
  if (syncRecord.event_timestamp > maxAllowedTime) {
    return {
      type: 'rejected',
      reason: 'Clock skew: event_timestamp exceeds server time by more than 5 minutes',
    };
  }

  // No existing record → insert
  if (!existing) {
    return { type: 'insert' };
  }

  // Rule 1: Authority override — kepala_sekolah edits always win
  if (existing.last_editor_role === 'kepala_sekolah') {
    return {
      type: 'conflict',
      winner: 'server',
      reason: 'Authority override: last edit by kepala_sekolah',
    };
  }

  // Rule 2: Server updated_at > client event_timestamp → server wins
  if (existing.updated_at > syncRecord.event_timestamp) {
    return {
      type: 'conflict',
      winner: 'server',
      reason: 'Server record is newer than client event timestamp',
    };
  }

  // Rule 3: Client event_timestamp > server updated_at → client wins
  if (syncRecord.event_timestamp > existing.updated_at) {
    return {
      type: 'conflict',
      winner: 'client',
      reason: 'Client event timestamp is newer than server record',
    };
  }

  // Equal timestamps → server wins (tie-break, conservative no-write)
  return {
    type: 'conflict',
    winner: 'server',
    reason: 'Server record is newer than client event timestamp',
  };
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

/**
 * Generates a Date within a reasonable school hours range.
 */
function arbitraryTimestamp(): fc.Arbitrary<Date> {
  return fc.date({
    min: new Date('2023-01-01T00:00:00Z'),
    max: new Date('2028-12-31T23:59:59Z'),
  });
}

/**
 * Generates a valid server "now" time and a client event_timestamp that is
 * guaranteed to be within acceptable clock skew (not rejected).
 */
function arbitraryValidTimestampPair(): fc.Arbitrary<{ serverNow: Date; eventTimestamp: Date }> {
  return arbitraryTimestamp().chain((serverNow) => {
    // Client event must be at or before serverNow + 5 min
    const maxClient = new Date(serverNow.getTime() + CLOCK_SKEW_TOLERANCE_MS);
    const minClient = new Date(serverNow.getTime() - 365 * 24 * 60 * 60 * 1000); // up to 1 year before

    return fc
      .date({ min: minClient, max: maxClient })
      .map((eventTimestamp) => ({ serverNow, eventTimestamp }));
  });
}

/**
 * Generates a client event_timestamp that is guaranteed to exceed clock skew tolerance.
 * (event_timestamp > serverNow + 5 min)
 */
function arbitraryFutureTimestampPair(): fc.Arbitrary<{ serverNow: Date; eventTimestamp: Date }> {
  return arbitraryTimestamp()
    .filter((d) => d.getTime() < new Date('2028-06-01T00:00:00Z').getTime()) // leave room for future
    .chain((serverNow) => {
      // Client event must be strictly more than 5 minutes in the future
      const minFuture = new Date(serverNow.getTime() + CLOCK_SKEW_TOLERANCE_MS + 1);
      const maxFuture = new Date(serverNow.getTime() + 24 * 60 * 60 * 1000); // up to 1 day ahead

      return fc
        .date({ min: minFuture, max: maxFuture })
        .map((eventTimestamp) => ({ serverNow, eventTimestamp }));
    });
}

/**
 * Generates an existing record with last editor as kepala_sekolah.
 */
function arbitraryKepalaEditedRecord(): fc.Arbitrary<ExistingRecord> {
  return fc.record({
    id: arbitraryUuid(),
    status: arbitraryAttendanceStatus(),
    updated_at: arbitraryTimestamp(),
    last_editor_role: fc.constant('kepala_sekolah'),
  });
}

/**
 * Generates an existing record with last editor as any non-kepala role.
 */
function arbitraryNonKepalaEditedRecord(): fc.Arbitrary<ExistingRecord> {
  return fc.record({
    id: arbitraryUuid(),
    status: arbitraryAttendanceStatus(),
    updated_at: arbitraryTimestamp(),
    last_editor_role: fc.constantFrom('guru', 'admin', null),
  });
}

/**
 * Generates a sync record with a specific event_timestamp.
 */
function arbitrarySyncRecord(eventTimestamp: Date): fc.Arbitrary<SyncRecord> {
  return fc.record({
    siswa_id: arbitraryUuid(),
    kelas_id: arbitraryUuid(),
    tanggal: fc.constant('2024-03-15'), // date doesn't affect conflict resolution logic
    status: arbitraryAttendanceStatus(),
    event_timestamp: fc.constant(eventTimestamp),
  });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 15: Offline Sync Conflict Resolution (Event-Time with Authority Override)', () => {
  describe('Authority Override (Kepala_Sekolah edits never overridden)', () => {
    it('records last edited by kepala_sekolah are NEVER overwritten by offline sync', () => {
      fc.assert(
        fc.property(
          arbitraryKepalaEditedRecord(),
          arbitraryValidTimestampPair(),
          arbitraryAttendanceStatus(),
          arbitraryUuid(),
          arbitraryUuid(),
          (existing, { serverNow, eventTimestamp }, clientStatus, siswaId, kelasId) => {
            const syncRecord: SyncRecord = {
              siswa_id: siswaId,
              kelas_id: kelasId,
              tanggal: '2024-03-15',
              status: clientStatus,
              event_timestamp: eventTimestamp,
            };

            const decision = resolveOfflineSyncConflict(syncRecord, existing, serverNow);

            // PROPERTY: When existing was last edited by kepala_sekolah,
            // server ALWAYS wins regardless of timestamps
            return (
              decision.type === 'conflict' &&
              decision.winner === 'server' &&
              decision.reason.includes('Authority override')
            );
          },
        ),
        PBT_CONFIG,
      );
    });

    it('kepala_sekolah authority override takes precedence even when client timestamp is newer', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // siswaId
          arbitraryUuid(), // kelasId
          arbitraryAttendanceStatus(), // existing status
          arbitraryAttendanceStatus(), // client status
          arbitraryTimestamp(), // serverNow
          (siswaId, kelasId, existingStatus, clientStatus, serverNow) => {
            // Force existing to have been edited BEFORE the client event time
            const existingUpdatedAt = new Date(serverNow.getTime() - 60 * 60 * 1000); // 1 hour ago
            // Client event_timestamp is clearly newer (just now), and within tolerance
            const clientEventTime = new Date(serverNow.getTime() - 1000); // 1 second ago

            const existing: ExistingRecord = {
              id: 'existing-1',
              status: existingStatus,
              updated_at: existingUpdatedAt,
              last_editor_role: 'kepala_sekolah',
            };

            const syncRecord: SyncRecord = {
              siswa_id: siswaId,
              kelas_id: kelasId,
              tanggal: '2024-03-15',
              status: clientStatus,
              event_timestamp: clientEventTime,
            };

            const decision = resolveOfflineSyncConflict(syncRecord, existing, serverNow);

            // PROPERTY: Even though client is newer, kepala_sekolah authority wins
            return decision.type === 'conflict' && decision.winner === 'server';
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Event-Time Ordering (correct winner based on timestamps)', () => {
    it('server wins when server updated_at > client event_timestamp', () => {
      fc.assert(
        fc.property(
          arbitraryNonKepalaEditedRecord(),
          arbitraryTimestamp(), // serverNow
          arbitraryUuid(),
          arbitraryUuid(),
          arbitraryAttendanceStatus(),
          fc.integer({ min: 1000, max: 3600000 }), // offset: 1s to 1h
          (existing, serverNow, siswaId, kelasId, clientStatus, offsetMs) => {
            // Force client event_timestamp to be BEFORE existing.updated_at
            const clientEventTime = new Date(existing.updated_at.getTime() - offsetMs);

            // Ensure clientEventTime is still within clock skew tolerance
            fc.pre(clientEventTime <= new Date(serverNow.getTime() + CLOCK_SKEW_TOLERANCE_MS));

            const syncRecord: SyncRecord = {
              siswa_id: siswaId,
              kelas_id: kelasId,
              tanggal: '2024-03-15',
              status: clientStatus,
              event_timestamp: clientEventTime,
            };

            const decision = resolveOfflineSyncConflict(syncRecord, existing, serverNow);

            // PROPERTY: When server updated_at > client event_timestamp, server wins
            return decision.type === 'conflict' && decision.winner === 'server';
          },
        ),
        PBT_CONFIG,
      );
    });

    it('client wins when client event_timestamp > server updated_at', () => {
      fc.assert(
        fc.property(
          arbitraryNonKepalaEditedRecord(),
          arbitraryTimestamp(), // serverNow
          arbitraryUuid(),
          arbitraryUuid(),
          arbitraryAttendanceStatus(),
          fc.integer({ min: 1000, max: 3600000 }), // offset: 1s to 1h
          (existing, serverNow, siswaId, kelasId, clientStatus, offsetMs) => {
            // Force client event_timestamp to be AFTER existing.updated_at
            const clientEventTime = new Date(existing.updated_at.getTime() + offsetMs);

            // Ensure clientEventTime is still within clock skew tolerance relative to serverNow
            // We need serverNow to be at least clientEventTime - 5min
            const adjustedServerNow = new Date(
              Math.max(serverNow.getTime(), clientEventTime.getTime() - CLOCK_SKEW_TOLERANCE_MS),
            );

            const syncRecord: SyncRecord = {
              siswa_id: siswaId,
              kelas_id: kelasId,
              tanggal: '2024-03-15',
              status: clientStatus,
              event_timestamp: clientEventTime,
            };

            const decision = resolveOfflineSyncConflict(syncRecord, existing, adjustedServerNow);

            // PROPERTY: When client event_timestamp > server updated_at, client wins
            return decision.type === 'conflict' && decision.winner === 'client';
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Clock Skew Rejection (future timestamps rejected)', () => {
    it('records with event_timestamp > server_now + 5 minutes are ALWAYS rejected', () => {
      fc.assert(
        fc.property(
          arbitraryFutureTimestampPair(),
          arbitraryUuid(),
          arbitraryUuid(),
          arbitraryAttendanceStatus(),
          fc.option(arbitraryKepalaEditedRecord(), { nil: null }), // existing may or may not exist
          ({ serverNow, eventTimestamp }, siswaId, kelasId, clientStatus, existing) => {
            const syncRecord: SyncRecord = {
              siswa_id: siswaId,
              kelas_id: kelasId,
              tanggal: '2024-03-15',
              status: clientStatus,
              event_timestamp: eventTimestamp,
            };

            const decision = resolveOfflineSyncConflict(syncRecord, existing, serverNow);

            // PROPERTY: Clock skew rejection happens BEFORE any conflict resolution
            // regardless of whether existing record exists
            return decision.type === 'rejected' && decision.reason.includes('Clock skew');
          },
        ),
        PBT_CONFIG,
      );
    });

    it('records at exactly server_now + 5 minutes boundary are accepted', () => {
      fc.assert(
        fc.property(
          arbitraryTimestamp(), // serverNow
          arbitraryUuid(),
          arbitraryUuid(),
          arbitraryAttendanceStatus(),
          (serverNow, siswaId, kelasId, clientStatus) => {
            // Exactly at the boundary (server_now + 5 min)
            const eventTimestamp = new Date(serverNow.getTime() + CLOCK_SKEW_TOLERANCE_MS);

            const syncRecord: SyncRecord = {
              siswa_id: siswaId,
              kelas_id: kelasId,
              tanggal: '2024-03-15',
              status: clientStatus,
              event_timestamp: eventTimestamp,
            };

            const decision = resolveOfflineSyncConflict(syncRecord, null, serverNow);

            // PROPERTY: At exact boundary, NOT rejected (insert since no existing)
            return decision.type === 'insert';
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Equal Timestamps (conservative server-wins approach)', () => {
    it('equal timestamps resolve in favor of server (no-write)', () => {
      fc.assert(
        fc.property(
          arbitraryNonKepalaEditedRecord(),
          arbitraryTimestamp(), // serverNow
          arbitraryUuid(),
          arbitraryUuid(),
          arbitraryAttendanceStatus(),
          (existing, serverNow, siswaId, kelasId, clientStatus) => {
            // Force exact same timestamp
            const clientEventTime = new Date(existing.updated_at.getTime());

            // Ensure within clock skew tolerance
            const adjustedServerNow = new Date(
              Math.max(serverNow.getTime(), clientEventTime.getTime() - CLOCK_SKEW_TOLERANCE_MS),
            );

            const syncRecord: SyncRecord = {
              siswa_id: siswaId,
              kelas_id: kelasId,
              tanggal: '2024-03-15',
              status: clientStatus,
              event_timestamp: clientEventTime,
            };

            const decision = resolveOfflineSyncConflict(syncRecord, existing, adjustedServerNow);

            // PROPERTY: Equal timestamps → server wins (conservative)
            return decision.type === 'conflict' && decision.winner === 'server';
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('No-conflict path (new record insertion)', () => {
    it('when no existing record exists, sync record is inserted', () => {
      fc.assert(
        fc.property(
          arbitraryValidTimestampPair(),
          arbitraryUuid(),
          arbitraryUuid(),
          arbitraryAttendanceStatus(),
          ({ serverNow, eventTimestamp }, siswaId, kelasId, clientStatus) => {
            const syncRecord: SyncRecord = {
              siswa_id: siswaId,
              kelas_id: kelasId,
              tanggal: '2024-03-15',
              status: clientStatus,
              event_timestamp: eventTimestamp,
            };

            const decision = resolveOfflineSyncConflict(syncRecord, null, serverNow);

            // PROPERTY: No existing record → insert (synced)
            return decision.type === 'insert';
          },
        ),
        PBT_CONFIG,
      );
    });
  });
});
