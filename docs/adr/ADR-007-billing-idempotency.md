# ADR-007: Billing Generation Idempotency via INSERT ON CONFLICT

## Status

Proposed

## Context

Billing generation (Requirement 9, 10) creates tagihan records in batch for all active students. The current design wraps generation in a single database transaction with a `UNIQUE(siswa_id, bulan, tahun)` constraint.

**Problem**: If billing generation is triggered twice concurrently (double-click, network retry, two admins clicking simultaneously), the second batch hits the unique constraint and the entire transaction rolls back — even if 99% of the records are new and valid.

Additionally, the current design doesn't specify what happens when:
- A partial generation succeeded previously (some months exist, some don't)
- The process times out mid-batch on a large school (500 students × 12 months = 6,000 inserts)

## Decision

Use `INSERT ... ON CONFLICT DO NOTHING` for each tagihan record instead of failing the entire transaction on duplicates.

### Implementation

```sql
-- Per-record idempotent insert
INSERT INTO tagihan (tenant_id, siswa_id, bulan, tahun, tahun_ajaran_id, nominal, status, tanggal_jatuh_tempo)
VALUES ($1, $2, $3, $4, $5, $6, 'belum_bayar', $7)
ON CONFLICT (siswa_id, bulan, tahun) DO NOTHING
RETURNING id;
```

### Batch Processing Strategy

```typescript
async generateTagihan(request: GenerateTagihanRequest) {
  const students = await getActiveStudents(tenantId);
  const months = calculateMonths(request);
  
  let created = 0;
  let skipped = 0;
  let totalNominal = 0;

  // Process in chunks of 100 to avoid memory issues and long transactions
  for (const chunk of _.chunk(students, 100)) {
    await db.transaction(async (tx) => {
      for (const student of chunk) {
        for (const month of months) {
          const nominal = await getNominalForClass(student.kelas_id);
          const result = await tx.execute(sql`
            INSERT INTO tagihan (...) VALUES (...)
            ON CONFLICT (siswa_id, bulan, tahun) DO NOTHING
            RETURNING id
          `);
          
          if (result.rowCount > 0) {
            created++;
            totalNominal += nominal;
          } else {
            skipped++;
          }
        }
      }
    });
  }

  return { created, skipped, totalNominal };
}
```

### Concurrency Protection

Even with `ON CONFLICT DO NOTHING`, we add an application-level mutex to prevent duplicate work:

```typescript
// Redis-based distributed lock
const lockKey = `billing-gen:${tenantId}:${tahunAjaranId}`;
const acquired = await redis.set(lockKey, '1', 'NX', 'EX', 300); // 5 min TTL

if (!acquired) {
  throw new ConflictException('Proses generate tagihan sedang berjalan. Silakan tunggu.');
}

try {
  return await generateTagihan(request);
} finally {
  await redis.del(lockKey);
}
```

### Response Shape

```typescript
interface GenerateTagihanResponse {
  created: number;        // New tagihan records created
  skipped: number;        // Existing records (not duplicated)
  totalNominal: number;   // Sum of created tagihan nominal
  durationMs: number;     // Processing time
}
```

## Alternatives Considered

- **Single transaction with unique constraint failure (current implicit approach)** — simpler code but all-or-nothing behavior is wrong: admins expect partial results to be preserved, not rolled back.
- **Check-then-insert pattern** — race condition: two requests both check "no record exists" then both try to insert. The unique constraint catches this but one still fails.
- **Queueing billing generation as a background job** — better UX (non-blocking) but adds complexity for MVP. Consider this for post-MVP if generation takes >10s.
- **Database advisory lock** — PostgreSQL-specific, works but Redis lock is more visible to the application and works across multiple API replicas.

## Consequences

### Positive
- Double-clicks and retries are safe — same final state regardless of how many times triggered
- Partial prior runs are seamlessly continued (existing records skipped)
- Clear reporting to admin (created vs skipped counts)
- Distributed lock prevents wasted concurrent work
- Chunked processing prevents transaction timeout on large schools

### Negative
- Slightly more complex than naive single-insert-in-loop
- Redis lock adds a dependency (if Redis is down, generation is blocked)
- Chunked transactions mean a crash mid-way leaves partial results (but this is acceptable since re-running skips existing)
- Lock TTL (5 min) means a crashed process blocks re-attempts for up to 5 minutes

## Trade-offs

Idempotency and safety are prioritized over code simplicity. The additional complexity is minimal (ON CONFLICT clause + Redis lock) and eliminates an entire class of user-reported bugs ("I clicked generate and got an error but some bills were created and some weren't").
