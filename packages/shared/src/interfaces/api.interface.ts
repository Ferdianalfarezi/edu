/**
 * Standard paginated response using cursor-based pagination.
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PaginationMeta {
  has_next: boolean;
  cursor: string | null;
  total?: number;
}

/**
 * Standard API error response.
 */
export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  details?: Record<string, string[]>;
}

/**
 * Standard success response for mutations.
 */
export interface ApiSuccessResponse<T = void> {
  success: true;
  message: string;
  data?: T;
}

/**
 * Cursor-based pagination query params.
 */
export interface CursorPaginationQuery {
  cursor?: string;
  limit?: number;
}
