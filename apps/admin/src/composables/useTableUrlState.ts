import { ref, computed, watch, nextTick } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  parsePage,
  parsePageSize,
  parseStringFilter,
  parseEnumFilter,
  buildQueryObject,
} from './urlStateParsers';

/**
 * Allowed page sizes for table pagination.
 */
export const ALLOWED_PAGE_SIZES = [10, 15, 25, 50] as const;

/**
 * Type representing a valid page size value.
 */
export type AllowedPageSize = (typeof ALLOWED_PAGE_SIZES)[number];

/**
 * Default page size used when no valid page size is specified.
 */
export const DEFAULT_PAGE_SIZE: AllowedPageSize = 15;

/**
 * Configuration for a single URL filter parameter.
 */
export interface FilterConfig {
  /** URL param name (e.g., 'kelas_id') */
  key: string;
  /** The type used for parsing and validation */
  type: 'string' | 'number' | 'enum';
  /** Valid values when type is 'enum' */
  enumValues?: string[];
  /** Default value (undefined = omit from URL) */
  default?: string | number;
}

/**
 * Configuration object for the useTableUrlState composable.
 */
export interface TableUrlStateConfig {
  /** URL param name for search (default: 'search') */
  searchKey?: string;
  /** Additional filter definitions */
  filters?: FilterConfig[];
  /** Default page size (default: 15) */
  defaultPageSize?: AllowedPageSize;
  /** Search debounce in milliseconds (default: 300) */
  debounceMs?: number;
}

/**
 * Return type of the useTableUrlState composable.
 */
export interface TableUrlStateReturn {
  // Reactive state
  page: Ref<number>;
  pageSize: Ref<number>;
  search: Ref<string>;
  filters: Record<string, Ref<string | undefined>>;

  // Computed helpers
  activeFilterCount: ComputedRef<number>;
  queryParams: ComputedRef<Record<string, string | number>>;

  // Methods
  resetFilters: () => void;
  resetAll: () => void;
}

/**
 * Composable that bidirectionally syncs table state (pagination, search, filters)
 * with URL query parameters via Vue Router.
 *
 * Features:
 * - Initializes state from current URL query parameters
 * - Batches synchronous changes into a single router.replace() via nextTick
 * - Debounces search input (300ms default)
 * - Resets page to 1 on filter/search changes
 * - Handles browser back/forward without triggering URL write loops
 * - Preserves unknown query parameters
 * - Omits default values from URL for clean URLs
 */
export function useTableUrlState(config: TableUrlStateConfig): TableUrlStateReturn {
  const route = useRoute();
  const router = useRouter();

  const searchKey = config.searchKey ?? 'search';
  const defaultPageSize = config.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const debounceMs = config.debounceMs ?? 300;
  const filterConfigs = config.filters ?? [];

  // --- 1. Parse initial state from URL ---
  const page = ref(parsePage(route.query.page as string | string[] | undefined));
  const pageSize = ref(
    parsePageSize(route.query.page_size as string | string[] | undefined, defaultPageSize),
  );
  const search = ref(
    parseStringFilter(route.query[searchKey] as string | string[] | undefined) ?? '',
  );

  const filters: Record<string, Ref<string | undefined>> = {};
  for (const fc of filterConfigs) {
    const rawValue = route.query[fc.key] as string | string[] | undefined;
    if (fc.type === 'enum' && fc.enumValues) {
      filters[fc.key] = ref(parseEnumFilter(rawValue, fc.enumValues));
    } else {
      filters[fc.key] = ref(parseStringFilter(rawValue));
    }
  }

  // --- 2. Batching mechanism ---
  let flushScheduled = false;
  let isSyncingFromUrl = false;

  function scheduleFlush() {
    if (flushScheduled || isSyncingFromUrl) return;
    flushScheduled = true;
    nextTick(() => {
      flushScheduled = false;
      syncToUrl();
    });
  }

  // --- 3. URL sync (write) ---
  function syncToUrl() {
    const currentFilters: Record<string, string | undefined> = {};
    for (const fc of filterConfigs) {
      currentFilters[fc.key] = filters[fc.key].value;
    }

    const newQuery = buildQueryObject(
      {
        page: page.value,
        pageSize: pageSize.value,
        search: search.value,
        filters: currentFilters,
      },
      config,
      route.query as Record<string, string | string[] | undefined>,
    );

    try {
      router.replace({ query: newQuery });
    } catch {
      // Silently ignore NavigationDuplicated and other router errors
    }
  }

  // --- 4. Debounced search watcher ---
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  watch(search, () => {
    if (isSyncingFromUrl) return;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      page.value = 1;
      scheduleFlush();
    }, debounceMs);
  });

  // --- 5. Immediate watchers for filter/pageSize changes (reset page to 1) ---
  const filterRefs = Object.values(filters);

  watch([pageSize, ...filterRefs], () => {
    if (isSyncingFromUrl) return;
    page.value = 1;
    scheduleFlush();
  });

  // --- 6. Page watcher (no page reset) ---
  watch(page, () => {
    if (isSyncingFromUrl) return;
    scheduleFlush();
  });

  // --- 7. Route.query watcher for browser back/forward ---
  watch(
    () => route.query,
    (newQuery) => {
      isSyncingFromUrl = true;

      page.value = parsePage(newQuery.page as string | string[] | undefined);
      pageSize.value = parsePageSize(
        newQuery.page_size as string | string[] | undefined,
        defaultPageSize,
      );
      search.value = parseStringFilter(newQuery[searchKey] as string | string[] | undefined) ?? '';

      for (const fc of filterConfigs) {
        const rawValue = newQuery[fc.key] as string | string[] | undefined;
        if (fc.type === 'enum' && fc.enumValues) {
          filters[fc.key].value = parseEnumFilter(rawValue, fc.enumValues);
        } else {
          filters[fc.key].value = parseStringFilter(rawValue);
        }
      }

      // Clear any pending search timer since we're syncing from URL
      if (searchTimer) {
        clearTimeout(searchTimer);
        searchTimer = null;
      }

      nextTick(() => {
        isSyncingFromUrl = false;
      });
    },
    { deep: true },
  );

  // --- 8. resetFilters() ---
  function resetFilters(): void {
    search.value = '';
    for (const fc of filterConfigs) {
      filters[fc.key].value = undefined;
    }
    page.value = 1;
    // Clear any pending search debounce
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    scheduleFlush();
  }

  // --- 9. resetAll() ---
  function resetAll(): void {
    search.value = '';
    for (const fc of filterConfigs) {
      filters[fc.key].value = undefined;
    }
    page.value = 1;
    pageSize.value = defaultPageSize;
    // Clear any pending search debounce
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    scheduleFlush();
  }

  // --- 10. Computed: activeFilterCount ---
  const activeFilterCount = computed<number>(() => {
    let count = 0;
    for (const fc of filterConfigs) {
      if (filters[fc.key].value != null) {
        count++;
      }
    }
    if (search.value !== '') {
      count++;
    }
    return count;
  });

  // --- 11. Computed: queryParams (for API calls, includes all values) ---
  const queryParams = computed<Record<string, string | number>>(() => {
    const params: Record<string, string | number> = {
      page: page.value,
      page_size: pageSize.value,
    };

    if (search.value !== '') {
      params[searchKey] = search.value;
    }

    for (const fc of filterConfigs) {
      const val = filters[fc.key].value;
      if (val != null) {
        params[fc.key] = val;
      }
    }

    return params;
  });

  return {
    page,
    pageSize,
    search,
    filters,
    activeFilterCount,
    queryParams,
    resetFilters,
    resetAll,
  };
}
