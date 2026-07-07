/**
 * Shared cursor-based pagination utility.
 *
 * Implements the fetch-limit+1 pattern:
 * - Query asks for `limit + 1` rows
 * - If we get more than `limit` rows, there's a next page
 * - Slice to `limit`, use last item's `id` as cursor for next request
 *
 * Requirements: 35.1, 35.2, 35.3
 */

export const DEFAULT_PAGE_SIZE = 20;

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    has_next: boolean;
    cursor: string | null;
  };
}

/**
 * Given an array of rows fetched with `limit + 1`, produces a paginated response.
 *
 * @param rows - Rows fetched from DB with `LIMIT limit + 1`
 * @param limit - The desired page size (default: 20)
 * @returns PaginatedResult with data slice and navigation meta
 *
 * @example
 * ```typescript
 * const rows = await db.select().from(table).where(...).orderBy(...).limit(limit + 1);
 * return paginate(rows, limit);
 * ```
 */
export function paginate<T extends { id: string }>(
  rows: T[],
  limit: number = DEFAULT_PAGE_SIZE,
): PaginatedResult<T> {
  const hasNext = rows.length > limit;
  const data = hasNext ? rows.slice(0, limit) : rows;
  const cursor = hasNext && data.length > 0 ? data[data.length - 1].id : null;

  return {
    data,
    meta: {
      has_next: hasNext,
      cursor,
    },
  };
}
