# Design Document: URL State Persistence

## Overview

This feature introduces a `useTableUrlState` composable that bidirectionally syncs table state (pagination, search, filters) with URL query parameters. The composable is consumed by all Table_Views in the admin panel (SiswaManagementView, TagihanView, AuditLogView, RppPortalView) to persist their state across page refreshes and enable shareable filtered URLs.

The design avoids introducing new dependencies — it uses Vue Router's built-in `useRoute()`/`useRouter()` APIs and Vue's reactivity system (`ref`, `watch`, `computed`, `nextTick`).

### Key Design Decisions

1. **`router.replace()` over `router.push()`** — URL updates don't create history entries because filter changes are not navigation events. Users shouldn't need to "go back" through 10 page-size changes.
2. **Batching via `nextTick`** — Multiple synchronous state changes (e.g., filter change + page reset to 1) are batched into a single `router.replace()` call by deferring the write to the next microtask.
3. **Debounce only for search** — Search keystroke input gets 300ms debounce. All other state changes flush immediately (after the nextTick batch).
4. **Omit defaults from URL** — Parameters at their default values are stripped from the URL to keep URLs clean and human-readable.
5. **Preserve unknown params** — The composable spreads existing query params it doesn't own, so other features can coexist on the same route.

## Architecture

```mermaid
flowchart TD
    subgraph Browser
        URL[URL Query String]
    end
    
    subgraph Vue Router
        Route[useRoute().query]
        Replace[router.replace()]
    end
    
    subgraph useTableUrlState
        Config[Config Object]
        State[Reactive State Refs]
        Parser[Parse URL → State]
        Serializer[State → URL Params]
        Debouncer[Search Debounce 300ms]
        Batcher[nextTick Batch]
    end
    
    subgraph View
        SearchInput[Search Input v-model]
        Filters[Filter Controls v-model]
        Pagination[TablePagination Component]
        FetchFn[fetchData Function]
    end
    
    URL --> Route
    Route --> Parser
    Parser --> State
    Config --> Parser
    
    State --> Serializer
    Serializer --> Batcher
    Debouncer --> Batcher
    Batcher --> Replace
    Replace --> URL
    
    SearchInput --> State
    Filters --> State
    Pagination --> State
    State --> FetchFn
```

### Data Flow

1. **Initialization (mount)**: Composable reads `route.query`, parses each param according to config types, and populates reactive refs. Invalid values fall back to defaults.
2. **User interaction → URL**: When a ref changes, a watcher triggers serialization. Search changes go through a 300ms debounce timer. Non-search changes queue a `nextTick` flush. The flush collects all dirty state, computes the query object (omitting defaults, preserving unknown params), and calls `router.replace()`.
3. **URL → State (back/forward navigation)**: A watcher on `route.query` detects external URL changes and re-parses state. This handles browser back/forward.

## Components and Interfaces

### Configuration Interface

```typescript
interface FilterConfig {
  key: string;           // URL param name (e.g., 'kelas_id')
  type: 'string' | 'number' | 'enum';
  enumValues?: string[]; // Valid values when type is 'enum'
  default?: string | number; // Default value (undefined = omit from URL)
}

interface TableUrlStateConfig {
  searchKey?: string;         // URL param name for search (default: 'search')
  filters?: FilterConfig[];   // Additional filter definitions
  defaultPageSize?: 10 | 15 | 25 | 50; // Default page size (default: 15)
  debounceMs?: number;        // Search debounce (default: 300)
}
```

### Return Type

```typescript
interface TableUrlStateReturn {
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
```

### Internal Mechanics

```typescript
// Simplified internal flow
function useTableUrlState(config: TableUrlStateConfig): TableUrlStateReturn {
  const route = useRoute();
  const router = useRouter();
  
  // 1. Parse initial state from URL
  const page = ref(parsePageFromQuery(route.query));
  const pageSize = ref(parsePageSizeFromQuery(route.query, config));
  const search = ref(parseStringFromQuery(route.query, config.searchKey ?? 'search'));
  const filters = buildFilterRefs(config.filters, route.query);
  
  // 2. Batching mechanism
  let flushScheduled = false;
  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    nextTick(() => {
      flushScheduled = false;
      syncToUrl();
    });
  }
  
  // 3. URL sync (write)
  function syncToUrl() {
    const newQuery = buildQueryObject(page, pageSize, search, filters, config);
    // Preserve unknown params
    const preserved = pickUnknownParams(route.query, config);
    router.replace({ query: { ...preserved, ...newQuery } });
  }
  
  // 4. Debounced search
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  watch(search, () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      page.value = 1; // Reset page on search change
      scheduleFlush();
    }, config.debounceMs ?? 300);
  });
  
  // 5. Immediate watchers for non-search state
  watch([pageSize, ...Object.values(filters)], () => {
    page.value = 1; // Reset page on filter change
    scheduleFlush();
  });
  
  watch(page, () => {
    scheduleFlush();
  });
  
  // 6. URL → State (handle browser back/forward)
  watch(() => route.query, (newQuery) => {
    // Re-parse and update state without triggering URL write
  }, { deep: true });
  
  return { page, pageSize, search, filters, activeFilterCount, queryParams, resetFilters, resetAll };
}
```

### View Integration Pattern

Each view replaces its manual state management with the composable:

```typescript
// Before (SiswaManagementView)
const currentPage = ref(1);
const pageSize = ref(15);
const search = ref('');
const filterKelas = ref('');
// + manual watchers, debounce logic, etc.

// After
const { page, pageSize, search, filters, queryParams } = useTableUrlState({
  searchKey: 'search',
  defaultPageSize: 15,
  filters: [
    { key: 'kelas_id', type: 'string' },
    { key: 'status', type: 'enum', enumValues: ['aktif', 'pindah_sekolah', 'keluar', 'alumni'] },
    { key: 'tahun_ajaran_id', type: 'string' },
  ],
});

// Use queryParams computed for API calls
async function fetchSiswa() {
  const { data } = await api.get('/siswa', { params: queryParams.value });
  // ...
}

// Watch reactive state to trigger fetches
watch([page, pageSize, search, ...Object.values(filters)], fetchSiswa);
```

### View-Specific Configurations

**SiswaManagementView:**
```typescript
useTableUrlState({
  searchKey: 'search',
  defaultPageSize: 15,
  filters: [
    { key: 'kelas_id', type: 'string' },
    { key: 'status', type: 'enum', enumValues: ['aktif', 'pindah_sekolah', 'keluar', 'alumni'] },
    { key: 'tahun_ajaran_id', type: 'string' },
  ],
});
```

**TagihanView:**
```typescript
useTableUrlState({
  searchKey: 'search',
  defaultPageSize: 15,
  filters: [
    { key: 'tab', type: 'enum', enumValues: ['generate', 'daftar', 'verifikasi', 'tunggakan', 'audit'] },
    { key: 'status', type: 'string' },
    { key: 'kelas_id', type: 'string' },
    { key: 'bulan', type: 'string' },
  ],
});
```

**AuditLogView:**
```typescript
useTableUrlState({
  searchKey: 'search',
  defaultPageSize: 15,
  filters: [
    { key: 'action', type: 'string' },
    { key: 'user_id', type: 'string' },
    { key: 'date_from', type: 'string' },
    { key: 'date_to', type: 'string' },
  ],
});
```

**RppPortalView:**
```typescript
useTableUrlState({
  searchKey: 'search',
  defaultPageSize: 15,
  filters: [
    { key: 'mapel', type: 'string' },
    { key: 'kategori', type: 'string' },
    { key: 'tahun', type: 'string' },
  ],
});
```

## Data Models

### URL Query Parameter Schema

| Parameter | Type | Default | Validation |
|-----------|------|---------|------------|
| `page` | integer ≥ 1 | 1 | Non-numeric or < 1 → reset to 1 |
| `page_size` | integer ∈ {10, 15, 25, 50} | 15 | Not in allowed set → reset to 15 |
| `search` | string | `''` (omitted) | URL-decoded via Vue Router |
| `{filter_key}` | string | `undefined` (omitted) | Validated per config type |

### State-to-URL Mapping Rules

1. **Omission rule**: If `value === default`, the param is excluded from the URL object.
2. **Type coercion**: All URL params are strings. Numbers are parsed via `parseInt()`. Enum values are validated against the `enumValues` array.
3. **Unknown param preservation**: Params not in the config are spread into the replacement query untouched.
4. **Duplicate keys**: If `route.query[key]` is an array (duplicate keys), use the first element.

### Allowed Page Sizes

The composable validates against `[10, 15, 25, 50]`. Note: The existing `TablePagination.vue` component uses `[15, 50, 100]` — this will need to be aligned. The composable will be the source of truth for allowed sizes, and `TablePagination` should accept `pageSizeOptions` as a prop (or be updated to match).

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: State-to-URL Round Trip

*For any* valid table state configuration and any set of valid state values (page ≥ 1, pageSize ∈ {10, 15, 25, 50}, search string, filter values matching their configured types), serializing state to URL query params and then parsing those params back should produce the original state values.

**Validates: Requirements 1.2, 1.3, 2.1**

### Property 2: Default Values Are Omitted from URL

*For any* table state configuration, when a state value equals its default (page=1, pageSize=config.defaultPageSize, search='', filter=undefined), the corresponding query parameter must NOT appear in the serialized URL query object.

**Validates: Requirements 1.6, 2.8, 3.3, 4.4, 5.3, 6.6**

### Property 3: Filter Change Resets Page to 1

*For any* table state where page > 1, and any filter change (including search), the page value must be reset to 1 after the change is processed.

**Validates: Requirements 1.9, 2.3, 2.4, 3.6, 3.7, 4.3, 6.3**

### Property 4: Invalid Page Values Fall Back to 1

*For any* string value that is non-numeric, zero, or negative when parsed as an integer, the `parsePage` function must return 1.

**Validates: Requirements 2.7, 7.1**

### Property 5: Invalid PageSize Values Fall Back to Default

*For any* string value that, when parsed as an integer, is not in the allowed set [10, 15, 25, 50], the `parsePageSize` function must return the configured default (15).

**Validates: Requirements 2.6, 7.2**

### Property 6: Invalid Enum Values Fall Back to Undefined

*For any* filter configured with type 'enum' and a defined `enumValues` array, and *for any* string value not present in that array, the parsed filter value must be `undefined` (the default).

**Validates: Requirements 3.5, 4.5, 6.5**

### Property 7: Batching — Multiple Changes Produce Single URL Update

*For any* number N ≥ 1 of synchronous state changes within the same event loop tick, exactly one `router.replace()` call should be made (after the nextTick flush).

**Validates: Requirements 7.3**

### Property 8: Unknown Query Parameters Are Preserved

*For any* set of query parameters in the URL that are not part of the composable's configuration (unknown params), after any state change triggers a URL update via `router.replace()`, the resulting query object must still contain all those unknown parameters with their original values.

**Validates: Requirements 7.4**

## Error Handling

### Invalid URL Parameters

| Scenario | Behavior |
|----------|----------|
| `page` is non-numeric, ≤ 0 | Reset to `1` |
| `page_size` not in `[10, 15, 25, 50]` | Reset to config default (`15`) |
| Enum filter has value not in `enumValues` | Set to `undefined` (omit) |
| String filter is empty string `''` | Set to `undefined` (omit) |
| Duplicate query key (array value) | Use first element |
| Date filter with invalid format | View-level: set to `undefined` (AuditLogView handles this) |

### Router Errors

- If `router.replace()` throws (e.g., navigation aborted by a guard), the composable should catch the error silently. The state refs remain accurate; only the URL sync failed. On the next state change, it will retry.
- Navigation guards in the existing router (auth, role checks) run before the route resolves, so `replace()` on the same route with only query changes won't trigger them (same-route navigation).

### Race Conditions

- **Debounce + immediate change**: If a user types in search (debounced) and simultaneously changes a filter (immediate), the immediate change flushes first. When the debounce timer fires, it triggers another flush with the search update. This is correct behavior — at most 2 `replace()` calls, not N.
- **Rapid pagination**: Clicking "next page" repeatedly queues changes. Each click produces a new `page` value. Due to nextTick batching, only the last value within the same tick is written. If clicks span multiple ticks, each produces one replace call — also correct.

## Testing Strategy

### Property-Based Testing (fast-check)

The composable's pure logic functions are ideal for property-based testing:

- **Parser functions** (`parsePage`, `parsePageSize`, `parseFilterValue`, `parseStringFromQuery`): Pure functions with clear input/output. PBT generates random strings and verifies fallback behavior.
- **Serializer function** (`buildQueryObject`): Pure function taking state + config → query object. PBT verifies omission and round-trip properties.
- **Unknown param preservation**: Generate random query objects, run the serializer, verify unknown keys survive.

**Library**: `fast-check` (already in the monorepo for API tests)

**Configuration**: Minimum 100 iterations per property test.

**Tag format**: `Feature: url-state-persistence, Property {N}: {description}`

### Unit Tests (Vitest)

For behavior that requires mocking Vue Router:

- Composable initializes with correct defaults
- `router.replace()` is called (not `push()`) on state change
- Search debounce fires after 300ms (fake timers)
- Non-search changes flush immediately (nextTick)
- Batching: multiple changes in one tick → one replace call
- Page resets to 1 on filter change
- `resetFilters()` and `resetAll()` methods work correctly

### Integration Tests

For view-level integration (requires mounting components with mocked router):

- Each view initializes from URL params on mount
- Each view calls its fetch function with correct params from URL
- Tab switching in TagihanView preserves other filters
- Date validation in AuditLogView rejects malformed dates

### Test Infrastructure

The admin app currently has no test runner configured. The implementation should add:

```json
// package.json devDependencies additions
"vitest": "^2.0.0",
"@vue/test-utils": "^2.4.0",
"fast-check": "^3.19.0",
"happy-dom": "^14.0.0"
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    globals: true,
  },
  resolve: {
    alias: { '@': '/src' },
  },
});
```

