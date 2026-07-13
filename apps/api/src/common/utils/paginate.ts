import { PaginatedResponse } from '../interfaces/pagination.interface';

/**
 * Builds an offset-based paginated response with metadata.
 *
 * @param items - The slice of items for the current page
 * @param totalCount - Total number of matching records in the database
 * @param page - Current page number (1-based)
 * @param pageSize - Number of items per page
 * @returns PaginatedResponse with data and pagination meta
 */
export function paginate<T>(
  items: T[],
  totalCount: number,
  page: number,
  pageSize: number,
): PaginatedResponse<T> {
  return {
    data: items,
    meta: {
      page,
      page_size: pageSize,
      total_count: totalCount,
      total_pages: Math.ceil(totalCount / pageSize),
    },
  };
}
