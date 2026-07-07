/**
 * Property 14: Notification History Ordering
 *
 * Verifies that the notification history listing for orang_tua is always
 * sorted by created_at DESC (newest first), and that cursor-based pagination
 * maintains correct ordering without skipping or duplicating items.
 *
 * **Validates: Requirements 7.1**
 *
 * This is a PURE logic property test — exercises the sort/pagination algorithm
 * with arbitrary notification records. No DB or network dependencies.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid } from '../arbitraries';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationRecord {
  id: string;
  user_id: string;
  tipe: string;
  judul: string;
  pesan: string;
  status_pengiriman: 'pending' | 'terkirim' | 'gagal';
  created_at: Date;
}

interface PaginatedResult {
  items: NotificationRecord[];
  cursor: string | null; // null means no more pages
}

// ─── Pure pagination logic (mirrors what NotifikasiService.getRiwayat would do) ──

/**
 * Sorts notifications by created_at DESC (newest first).
 * For stable sort when created_at is equal, uses id as tiebreaker (DESC).
 */
function sortNotifications(records: NotificationRecord[]): NotificationRecord[] {
  return [...records].sort((a, b) => {
    const timeDiff = b.created_at.getTime() - a.created_at.getTime();
    if (timeDiff !== 0) return timeDiff;
    // Tiebreaker: id DESC for stable ordering
    return b.id.localeCompare(a.id);
  });
}

/**
 * Cursor-based pagination for notification history.
 * Cursor encodes the created_at + id of the last item on the previous page.
 * Returns items after that cursor position.
 */
function paginateNotifications(
  sortedRecords: NotificationRecord[],
  pageSize: number,
  cursor: string | null,
): PaginatedResult {
  let startIdx = 0;

  if (cursor) {
    const { created_at: cursorTime, id: cursorId } = decodeCursor(cursor);

    // Find the first item that comes AFTER the cursor position
    startIdx = sortedRecords.findIndex((item) => {
      const itemTime = item.created_at.getTime();
      if (itemTime < cursorTime) return true;
      if (itemTime === cursorTime && item.id < cursorId) return true;
      return false;
    });

    if (startIdx === -1) {
      // No items after cursor
      return { items: [], cursor: null };
    }
  }

  const items = sortedRecords.slice(startIdx, startIdx + pageSize);
  const hasMore = startIdx + pageSize < sortedRecords.length;
  const nextCursor = hasMore ? encodeCursor(items[items.length - 1]) : null;

  return { items, cursor: nextCursor };
}

/**
 * Encodes cursor from the last item's created_at and id.
 */
function encodeCursor(item: NotificationRecord): string {
  return JSON.stringify({
    created_at: item.created_at.getTime(),
    id: item.id,
  });
}

/**
 * Decodes cursor to extract created_at and id.
 */
function decodeCursor(cursor: string): { created_at: number; id: string } {
  return JSON.parse(cursor);
}

/**
 * Fetches all pages iteratively using cursor-based pagination.
 * Returns all items collected across all pages.
 */
function fetchAllPages(
  sortedRecords: NotificationRecord[],
  pageSize: number,
): NotificationRecord[] {
  const allItems: NotificationRecord[] = [];
  let cursor: string | null = null;

  // Safety limit to prevent infinite loops in tests
  const maxPages = Math.ceil(sortedRecords.length / pageSize) + 1;
  let pageCount = 0;

  do {
    const result = paginateNotifications(sortedRecords, pageSize, cursor);
    allItems.push(...result.items);
    cursor = result.cursor;
    pageCount++;

    if (pageCount > maxPages) break;
  } while (cursor !== null);

  return allItems;
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

const NOTIFICATION_TYPES = [
  'absensi',
  'tagihan_baru',
  'verifikasi',
  'rapor',
  'pembayaran',
] as const;
const DELIVERY_STATUSES = ['pending', 'terkirim', 'gagal'] as const;

/**
 * Generates a random notification record.
 */
function arbitraryNotification(userId: string): fc.Arbitrary<NotificationRecord> {
  return fc.record({
    id: arbitraryUuid(),
    user_id: fc.constant(userId),
    tipe: fc.constantFrom(...NOTIFICATION_TYPES),
    judul: fc.string({ minLength: 1, maxLength: 50 }),
    pesan: fc.string({ minLength: 1, maxLength: 200 }),
    status_pengiriman: fc.constantFrom(...DELIVERY_STATUSES),
    created_at: fc.date({
      min: new Date('2023-01-01T00:00:00Z'),
      max: new Date('2025-12-31T23:59:59Z'),
    }),
  });
}

/**
 * Generates a list of notification records for a single user.
 * May include records with same created_at timestamps to test tiebreaking.
 */
function arbitraryNotificationList(
  userId: string,
  options?: { min?: number; max?: number },
): fc.Arbitrary<NotificationRecord[]> {
  return fc.array(arbitraryNotification(userId), {
    minLength: options?.min ?? 0,
    maxLength: options?.max ?? 50,
  });
}

/**
 * Generates a list of notifications where some share exact timestamps.
 * This exercises the tiebreaker logic specifically.
 */
function arbitraryNotificationsWithDuplicateTimestamps(
  userId: string,
): fc.Arbitrary<NotificationRecord[]> {
  return fc
    .tuple(
      fc.array(
        fc.date({
          min: new Date('2023-01-01T00:00:00Z'),
          max: new Date('2025-12-31T23:59:59Z'),
        }),
        { minLength: 1, maxLength: 10 },
      ),
      fc.array(arbitraryUuid(), { minLength: 3, maxLength: 20 }),
    )
    .map(([sharedDates, ids]) => {
      return ids.map((id, idx) => ({
        id,
        user_id: userId,
        tipe: NOTIFICATION_TYPES[idx % NOTIFICATION_TYPES.length],
        judul: `Notifikasi ${idx}`,
        pesan: `Pesan notifikasi ke-${idx}`,
        status_pengiriman: DELIVERY_STATUSES[idx % DELIVERY_STATUSES.length],
        // Reuse dates to create duplicates
        created_at: sharedDates[idx % sharedDates.length],
      }));
    });
}

/**
 * Generates a valid page size for pagination.
 */
function arbitraryPageSize(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 20 });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 14: Notification History Ordering', () => {
  describe('Notification history is always sorted by created_at DESC (newest first)', () => {
    it('sorted result has every item created_at >= the next item created_at', () => {
      fc.assert(
        fc.property(arbitraryUuid(), (userId) => {
          return fc.assert(
            fc.property(arbitraryNotificationList(userId, { min: 2, max: 40 }), (records) => {
              const sorted = sortNotifications(records);

              // PROPERTY: For all consecutive pairs, first.created_at >= second.created_at
              for (let i = 0; i < sorted.length - 1; i++) {
                if (sorted[i].created_at.getTime() < sorted[i + 1].created_at.getTime()) {
                  return false;
                }
              }
              return true;
            }),
            { numRuns: 1 },
          );
        }),
        PBT_CONFIG,
      );
    });

    it('sorted result preserves all original items (no items lost or added)', () => {
      fc.assert(
        fc.property(arbitraryUuid(), (userId) => {
          return fc.assert(
            fc.property(arbitraryNotificationList(userId, { min: 0, max: 30 }), (records) => {
              const sorted = sortNotifications(records);

              // PROPERTY: Same length
              if (sorted.length !== records.length) return false;

              // PROPERTY: Same set of IDs
              const originalIds = new Set(records.map((r) => r.id));
              const sortedIds = new Set(sorted.map((r) => r.id));
              if (originalIds.size !== sortedIds.size) return false;

              for (const id of originalIds) {
                if (!sortedIds.has(id)) return false;
              }
              return true;
            }),
            { numRuns: 1 },
          );
        }),
        PBT_CONFIG,
      );
    });

    it('records with identical created_at are stably ordered by id DESC', () => {
      fc.assert(
        fc.property(arbitraryUuid(), (userId) => {
          return fc.assert(
            fc.property(arbitraryNotificationsWithDuplicateTimestamps(userId), (records) => {
              fc.pre(records.length >= 2);

              const sorted = sortNotifications(records);

              // PROPERTY: For items with same timestamp, id ordering is DESC
              for (let i = 0; i < sorted.length - 1; i++) {
                if (sorted[i].created_at.getTime() === sorted[i + 1].created_at.getTime()) {
                  // Same timestamp: id should be in descending order
                  if (sorted[i].id.localeCompare(sorted[i + 1].id) < 0) {
                    return false;
                  }
                }
              }
              return true;
            }),
            { numRuns: 1 },
          );
        }),
        PBT_CONFIG,
      );
    });
  });

  describe('Consecutive items in paginated list maintain ordering', () => {
    it('for any two consecutive items in a page, first.created_at >= second.created_at', () => {
      fc.assert(
        fc.property(arbitraryUuid(), arbitraryPageSize(), (userId, pageSize) => {
          return fc.assert(
            fc.property(arbitraryNotificationList(userId, { min: 1, max: 40 }), (records) => {
              const sorted = sortNotifications(records);
              let cursor: string | null = null;

              // Check ordering within each page
              const maxPages = Math.ceil(sorted.length / pageSize) + 1;
              let pageCount = 0;

              do {
                const result = paginateNotifications(sorted, pageSize, cursor);

                // PROPERTY: Within each page, ordering is maintained
                for (let i = 0; i < result.items.length - 1; i++) {
                  if (
                    result.items[i].created_at.getTime() < result.items[i + 1].created_at.getTime()
                  ) {
                    return false;
                  }
                }

                cursor = result.cursor;
                pageCount++;
                if (pageCount > maxPages) return false; // Safety: prevent infinite loop
              } while (cursor !== null);

              return true;
            }),
            { numRuns: 1 },
          );
        }),
        PBT_CONFIG,
      );
    });

    it('last item of page N has created_at >= first item of page N+1', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(),
          // Use small page sizes to guarantee multi-page scenarios
          fc.integer({ min: 1, max: 5 }),
          (userId, pageSize) => {
            return fc.assert(
              fc.property(
                // Generate enough records to always exceed pageSize
                arbitraryNotificationList(userId, { min: 6, max: 40 }),
                (records) => {
                  const sorted = sortNotifications(records);
                  let cursor: string | null = null;
                  let previousLastItem: NotificationRecord | null = null;

                  const maxPages = Math.ceil(sorted.length / pageSize) + 1;
                  let pageCount = 0;

                  do {
                    const result = paginateNotifications(sorted, pageSize, cursor);
                    if (result.items.length === 0) break;

                    // PROPERTY: First item of this page should have created_at <= last item of previous page
                    if (previousLastItem) {
                      if (
                        previousLastItem.created_at.getTime() < result.items[0].created_at.getTime()
                      ) {
                        return false;
                      }
                    }

                    previousLastItem = result.items[result.items.length - 1];
                    cursor = result.cursor;
                    pageCount++;
                    if (pageCount > maxPages) return false;
                  } while (cursor !== null);

                  return true;
                },
              ),
              { numRuns: 1 },
            );
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Pagination does not skip or duplicate items', () => {
    it('total items across all pages equals total notification count', () => {
      fc.assert(
        fc.property(arbitraryUuid(), arbitraryPageSize(), (userId, pageSize) => {
          return fc.assert(
            fc.property(arbitraryNotificationList(userId, { min: 0, max: 40 }), (records) => {
              const sorted = sortNotifications(records);
              const allCollected = fetchAllPages(sorted, pageSize);

              // PROPERTY: Total collected equals total records
              return allCollected.length === records.length;
            }),
            { numRuns: 1 },
          );
        }),
        PBT_CONFIG,
      );
    });

    it('no item appears more than once across all pages', () => {
      fc.assert(
        fc.property(arbitraryUuid(), arbitraryPageSize(), (userId, pageSize) => {
          return fc.assert(
            fc.property(arbitraryNotificationList(userId, { min: 0, max: 40 }), (records) => {
              const sorted = sortNotifications(records);
              const allCollected = fetchAllPages(sorted, pageSize);

              // PROPERTY: All IDs are unique (no duplicates)
              const ids = allCollected.map((item) => item.id);
              const uniqueIds = new Set(ids);
              return ids.length === uniqueIds.size;
            }),
            { numRuns: 1 },
          );
        }),
        PBT_CONFIG,
      );
    });

    it('every original record appears in the paginated result', () => {
      fc.assert(
        fc.property(arbitraryUuid(), arbitraryPageSize(), (userId, pageSize) => {
          return fc.assert(
            fc.property(arbitraryNotificationList(userId, { min: 1, max: 30 }), (records) => {
              const sorted = sortNotifications(records);
              const allCollected = fetchAllPages(sorted, pageSize);

              // PROPERTY: Every original record ID exists in collected results
              const collectedIds = new Set(allCollected.map((item) => item.id));
              for (const record of records) {
                if (!collectedIds.has(record.id)) return false;
              }
              return true;
            }),
            { numRuns: 1 },
          );
        }),
        PBT_CONFIG,
      );
    });
  });

  describe('Cursor-based pagination maintains ordering across pages', () => {
    it('concatenation of all pages forms a single DESC-sorted sequence', () => {
      fc.assert(
        fc.property(arbitraryUuid(), arbitraryPageSize(), (userId, pageSize) => {
          return fc.assert(
            fc.property(arbitraryNotificationList(userId, { min: 2, max: 40 }), (records) => {
              const sorted = sortNotifications(records);
              const allCollected = fetchAllPages(sorted, pageSize);

              // PROPERTY: The entire concatenated list is in DESC order
              for (let i = 0; i < allCollected.length - 1; i++) {
                const currentTime = allCollected[i].created_at.getTime();
                const nextTime = allCollected[i + 1].created_at.getTime();
                if (currentTime < nextTime) {
                  return false;
                }
                // If same time, tiebreaker must hold
                if (currentTime === nextTime) {
                  if (allCollected[i].id.localeCompare(allCollected[i + 1].id) < 0) {
                    return false;
                  }
                }
              }
              return true;
            }),
            { numRuns: 1 },
          );
        }),
        PBT_CONFIG,
      );
    });

    it('paginating with different page sizes produces same item set', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(),
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 11, max: 25 }),
          (userId, smallPage, largePage) => {
            return fc.assert(
              fc.property(arbitraryNotificationList(userId, { min: 1, max: 30 }), (records) => {
                const sorted = sortNotifications(records);
                const smallPageResult = fetchAllPages(sorted, smallPage);
                const largePageResult = fetchAllPages(sorted, largePage);

                // PROPERTY: Both page sizes collect the same items in the same order
                if (smallPageResult.length !== largePageResult.length) return false;

                for (let i = 0; i < smallPageResult.length; i++) {
                  if (smallPageResult[i].id !== largePageResult[i].id) return false;
                }
                return true;
              }),
              { numRuns: 1 },
            );
          },
        ),
        PBT_CONFIG,
      );
    });

    it('empty notification list returns no items and no cursor', () => {
      fc.assert(
        fc.property(arbitraryPageSize(), (pageSize) => {
          const result = paginateNotifications([], pageSize, null);

          // PROPERTY: Empty input → empty output with no cursor
          return result.items.length === 0 && result.cursor === null;
        }),
        PBT_CONFIG,
      );
    });

    it('single-item list returns that item with no next cursor', () => {
      fc.assert(
        fc.property(arbitraryUuid(), arbitraryPageSize(), (userId, pageSize) => {
          return fc.assert(
            fc.property(arbitraryNotification(userId), (notification) => {
              const sorted = sortNotifications([notification]);
              const result = paginateNotifications(sorted, pageSize, null);

              // PROPERTY: Single item, no further pages
              return (
                result.items.length === 1 &&
                result.items[0].id === notification.id &&
                result.cursor === null
              );
            }),
            { numRuns: 1 },
          );
        }),
        PBT_CONFIG,
      );
    });
  });
});
