# ADR-003: Offline Sync Conflict Resolution — Event-Time with Authority Override

## Status

Proposed

## Context

The Flutter mobile app supports offline attendance input. When a teacher submits attendance offline and later syncs, conflicts can arise if someone else (e.g., Kepala Sekolah) has already modified the same record on the server.

The current design specifies "last-write-wins based on timestamp" but doesn't clarify:
1. Whether "timestamp" means event time (when teacher pressed save) or sync time (when data reaches server)
2. How Kepala Sekolah's override authority (Requirement 2.4) interacts with conflict resolution
3. What happens when offline data is stale by hours

### Problem Scenario

1. Teacher A saves attendance offline at 08:00 (student = hadir)
2. Kepala Sekolah corrects the record at 08:30 online (student = alpa)
3. Teacher A's phone syncs at 09:00

With naive last-write-wins on sync time: Teacher A's stale data (sync time 09:00 > server 08:30) overwrites the principal's correction. This violates Requirement 2.4 (override power).

## Decision

Use **event-time** (when the user actually performed the action) as the conflict resolution timestamp, combined with **authority-based override rules**.

### Resolution Algorithm

```typescript
async resolveConflict(serverRecord: Absensi, clientRecord: SyncRecord): Resolution {
  // Rule 1: If server record was edited by Kepala_Sekolah, server always wins
  // (their role gives explicit override authority per Requirement 2.4)
  if (serverRecord.last_edited_by_role === 'kepala_sekolah') {
    return { winner: 'server', reason: 'authority_override' };
  }

  // Rule 2: If server record was edited AFTER client event-time, server wins
  // (someone made a more recent intentional change)
  if (serverRecord.updated_at > clientRecord.event_timestamp) {
    return { winner: 'server', reason: 'server_newer' };
  }

  // Rule 3: Client event-time is newer — client wins
  return { winner: 'client', reason: 'client_newer' };
}
```

### Client-Side Data

The sync payload must include `event_timestamp` (the moment the teacher pressed save, captured locally) — NOT the moment of sync:

```typescript
interface SyncRecord {
  siswa_id: string;
  kelas_id: string;
  tanggal: string;
  status: AttendanceStatus;
  event_timestamp: string;  // When teacher actually saved, in ISO 8601
  guru_id: string;
}
```

### Clock Skew Mitigation

- Mobile app should periodically sync device clock against server time (on each successful API call, compare timestamps)
- If clock skew > 5 minutes, display warning to user: "Jam perangkat tidak sinkron"
- Server rejects sync records with event_timestamp > server_now + 5 minutes (future timestamps)
- Server rejects sync records with event_timestamp < tanggal record - 24 hours (too far in the past)

### Sync Response

```typescript
interface SyncResponse {
  synced: string[];           // IDs successfully written to server
  conflicts: {
    id: string;
    winner: 'server' | 'client';
    reason: string;
    server_value: AttendanceStatus;  // Current server state
  }[];
}
```

Client must display conflicts to the teacher so they're aware their input was overridden.

## Alternatives Considered

- **Sync-time based LWW (current design)** — simpler but produces incorrect results when offline period overlaps with online edits. A phone that syncs late always wins, regardless of actual event ordering.
- **Manual conflict resolution (user picks)** — most correct, but UX nightmare for teachers doing attendance on 30+ students. Too many conflict prompts would make offline mode unusable.
- **Server always wins** — safest but makes offline mode pointless (teachers' work gets discarded).
- **Operational Transform / CRDT** — overkill for attendance where the value space is a simple enum. The complexity isn't justified.

## Consequences

### Positive
- Respects actual chronological order of events
- Honors Kepala Sekolah's institutional authority
- Teacher is informed when their input was overridden (transparency)
- Clock skew protection prevents accidental future-timestamp wins

### Negative
- Slightly more complex than naive LWW
- Requires accurate clock on mobile device (mitigated by skew detection)
- Kepala Sekolah edits can never be overridden by offline sync (by design, but teachers should be aware)
- Sync response is larger (must include conflict details)

## Trade-offs

Correctness and institutional authority are prioritized over simplicity. The additional complexity is minimal (one extra field, three resolution rules) and prevents a class of bugs that would silently corrupt attendance data.
