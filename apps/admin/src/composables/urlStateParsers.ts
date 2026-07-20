import {
  ALLOWED_PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
  type TableUrlStateConfig,
} from './useTableUrlState';

type QueryValue = string | string[] | undefined;

/**
 * Extracts the first string value from a query parameter that might be a string, array, or undefined.
 */
function firstValue(value: QueryValue): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

/**
 * Parses a page number from a URL query parameter value.
 * Returns 1 for invalid, non-numeric, zero, or negative values.
 */
export function parsePage(value: QueryValue): number {
  const raw = firstValue(value);
  if (raw == null) return 1;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < 1) return 1;
  return parsed;
}

/**
 * Parses a page size from a URL query parameter value.
 * Returns the default size if the value is not in the allowed set.
 */
export function parsePageSize(value: QueryValue, defaultSize: number = DEFAULT_PAGE_SIZE): number {
  const raw = firstValue(value);
  if (raw == null) return defaultSize;
  const parsed = parseInt(raw, 10);
  if ((ALLOWED_PAGE_SIZES as readonly number[]).includes(parsed)) return parsed;
  return defaultSize;
}

/**
 * Parses a string filter value from a URL query parameter.
 * Returns undefined for empty strings; uses first element for arrays.
 */
export function parseStringFilter(value: QueryValue): string | undefined {
  const raw = firstValue(value);
  if (raw == null || raw === '') return undefined;
  return raw;
}

/**
 * Parses an enum filter value from a URL query parameter.
 * Returns undefined if the value is not in the allowed enum values.
 */
export function parseEnumFilter(value: QueryValue, enumValues: string[]): string | undefined {
  const raw = firstValue(value);
  if (raw == null || raw === '') return undefined;
  if (enumValues.includes(raw)) return raw;
  return undefined;
}

/**
 * Builds a URL query object from the current table state.
 *
 * - Omits parameters when their value equals the default
 * - Preserves unknown query parameters not managed by the composable
 * - Converts all values to strings for the URL
 */
export function buildQueryObject(
  state: {
    page: number;
    pageSize: number;
    search: string;
    filters: Record<string, string | undefined>;
  },
  config: TableUrlStateConfig,
  currentQuery: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  const searchKey = config.searchKey ?? 'search';
  const defaultPageSize = config.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const filters = config.filters ?? [];

  // Determine which keys are "managed" by the composable
  const managedKeys = new Set<string>(['page', 'page_size', searchKey]);
  for (const f of filters) {
    managedKeys.add(f.key);
  }

  // Start with preserved unknown params
  const result: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(currentQuery)) {
    if (!managedKeys.has(key)) {
      // Preserve unknown params — use first value if array
      result[key] = Array.isArray(value) ? value[0] : value;
    }
  }

  // Add page (omit if equals 1)
  if (state.page !== 1) {
    result['page'] = String(state.page);
  }

  // Add page_size (omit if equals default)
  if (state.pageSize !== defaultPageSize) {
    result['page_size'] = String(state.pageSize);
  }

  // Add search (omit if empty string)
  if (state.search !== '') {
    result[searchKey] = state.search;
  }

  // Add filters (omit if undefined or equals configured default)
  for (const filterConfig of filters) {
    const value = state.filters[filterConfig.key];
    const filterDefault = filterConfig.default != null ? String(filterConfig.default) : undefined;

    if (value == null || value === '') {
      // undefined or empty string — omit from URL
      continue;
    }

    if (filterDefault != null && value === filterDefault) {
      // equals configured default — omit from URL
      continue;
    }

    result[filterConfig.key] = value;
  }

  return result;
}
