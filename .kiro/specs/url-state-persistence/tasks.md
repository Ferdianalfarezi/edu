# Implementation Plan: URL State Persistence

## Overview

Implement a `useTableUrlState` composable that bidirectionally syncs table state (pagination, search, filters) with URL query parameters via Vue Router. The composable will be integrated into all four Table_Views (SiswaManagementView, TagihanView, AuditLogView, RppPortalView) to persist table state across page refreshes and enable shareable filtered URLs. Test infrastructure (vitest, fast-check, happy-dom) will be set up from scratch since the admin app currently has no test runner.

## Tasks

- [x] 1. Set up test infrastructure and core interfaces
  - [x] 1.1 Install test dependencies and configure vitest
    - Add `vitest`, `@vue/test-utils`, `fast-check`, `happy-dom` as devDependencies in `apps/admin/package.json`
    - Create `apps/admin/vitest.config.ts` with `happy-dom` environment, vue plugin, and `@` alias resolution
    - Add `test` script to `apps/admin/package.json`: `"test": "vitest --run"`
    - _Requirements: Design Testing Strategy section_

  - [x] 1.2 Create TypeScript interfaces and type definitions for the composable
    - Create `apps/admin/src/composables/useTableUrlState.ts` with exported interfaces: `FilterConfig`, `TableUrlStateConfig`, `TableUrlStateReturn`
    - Define the `ALLOWED_PAGE_SIZES` constant as `[10, 15, 25, 50] as const`
    - Export the `DEFAULT_PAGE_SIZE` constant as `15`
    - _Requirements: 1.1, 1.2_

- [x] 2. Implement pure parser and serializer functions
  - [x] 2.1 Implement URL-to-state parser functions
    - Implement `parsePage(value: string | string[] | undefined): number` — returns 1 for invalid/non-numeric/negative/zero values
    - Implement `parsePageSize(value: string | string[] | undefined, defaultSize: number): number` — validates against allowed set, falls back to default
    - Implement `parseStringFilter(value: string | string[] | undefined): string | undefined` — returns undefined for empty strings, uses first element for arrays
    - Implement `parseEnumFilter(value: string | string[] | undefined, enumValues: string[]): string | undefined` — validates against enum set
    - All parsers handle duplicate query keys (arrays) by using the first element
    - _Requirements: 1.3, 2.1, 2.6, 2.7, 7.1, 7.2, 7.6_

  - [x] 2.2 Implement state-to-URL serializer function
    - Implement `buildQueryObject(state, config, currentQuery)` that:
      - Omits parameters when their value equals the default
      - Preserves unknown query parameters not managed by the composable
      - Converts all values to strings for the URL
    - _Requirements: 1.6, 2.8, 7.4_

  - [x] 2.3 Write property tests for parsePage (Property 4)
    - **Property 4: Invalid Page Values Fall Back to 1**
    - Use fast-check to generate arbitrary strings, verify non-numeric/zero/negative → 1, valid positive integers → parsed value
    - **Validates: Requirements 2.7, 7.1**

  - [x] 2.4 Write property tests for parsePageSize (Property 5)
    - **Property 5: Invalid PageSize Values Fall Back to Default**
    - Use fast-check to generate arbitrary integers, verify not-in-allowed-set → default (15), in-set → parsed value
    - **Validates: Requirements 2.6, 7.2**

  - [x] 2.5 Write property tests for parseEnumFilter (Property 6)
    - **Property 6: Invalid Enum Values Fall Back to Undefined**
    - Use fast-check to generate arbitrary strings with a defined enumValues array, verify invalid → undefined, valid → value
    - **Validates: Requirements 3.5, 4.5, 6.5**

  - [x] 2.6 Write property tests for round-trip consistency (Property 1)
    - **Property 1: State-to-URL Round Trip**
    - Use fast-check to generate valid state (page ≥ 1, pageSize ∈ allowed, arbitrary search strings, filter values), serialize to query then parse back, verify identity
    - **Validates: Requirements 1.2, 1.3, 2.1**

  - [x] 2.7 Write property tests for default omission (Property 2)
    - **Property 2: Default Values Are Omitted from URL**
    - Use fast-check to generate state at defaults, verify serialized query object does NOT contain those keys
    - **Validates: Requirements 1.6, 2.8, 3.3, 4.4, 5.3, 6.6**

  - [x] 2.8 Write property tests for unknown param preservation (Property 8)
    - **Property 8: Unknown Query Parameters Are Preserved**
    - Use fast-check to generate random extra query params, run serializer, verify all unknown params remain
    - **Validates: Requirements 7.4**

- [x] 3. Checkpoint - Ensure all pure function tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement composable reactive logic
  - [x] 4.1 Implement the `useTableUrlState` composable core
    - Build reactive refs from parsed initial route.query values
    - Implement nextTick-based batching mechanism (`scheduleFlush`)
    - Implement `syncToUrl()` that calls `router.replace()` with computed query, preserving unknown params
    - Implement 300ms debounced watcher for search ref
    - Implement immediate watchers for filter/pageSize changes that reset page to 1
    - Implement watcher for page changes (no page reset)
    - Implement route.query watcher for browser back/forward (re-parse without triggering URL write loop)
    - Implement `resetFilters()` and `resetAll()` methods
    - Implement `activeFilterCount` and `queryParams` computed properties
    - Catch and silently handle `router.replace()` errors
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 7.3, 7.4, 7.5_

  - [x] 4.2 Write unit tests for composable behavior
    - Test: initializes with correct defaults when no query params
    - Test: parses initial state from route.query on mount
    - Test: calls `router.replace()` (not `push()`) on state change
    - Test: search debounce fires after 300ms (fake timers)
    - Test: non-search changes flush immediately via nextTick
    - Test: page resets to 1 on filter/search change
    - Test: `resetFilters()` clears all filters but keeps page/pageSize
    - Test: `resetAll()` resets everything to defaults
    - _Requirements: 1.4, 1.5, 1.7, 1.8, 1.9_

  - [x] 4.3 Write property test for filter-change page reset (Property 3)
    - **Property 3: Filter Change Resets Page to 1**
    - Use fast-check to generate state where page > 1, simulate a filter change, verify page becomes 1
    - **Validates: Requirements 1.9, 2.3, 2.4, 3.6, 3.7, 4.3, 6.3**

  - [x] 4.4 Write property test for batching (Property 7)
    - **Property 7: Batching — Multiple Changes Produce Single URL Update**
    - For N synchronous state changes within the same tick, verify exactly one `router.replace()` call after nextTick
    - **Validates: Requirements 7.3**

- [x] 5. Checkpoint - Ensure composable tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Update TablePagination component
  - [x] 6.1 Align TablePagination page size options with composable
    - Change `pageSizeOptions` in `apps/admin/src/components/ui/TablePagination.vue` from `[15, 50, 100]` to `[10, 15, 25, 50]` to match the composable's allowed page sizes
    - Alternatively, accept `pageSizeOptions` as an optional prop with default `[10, 15, 25, 50]`
    - _Requirements: 2.6, 7.2_

- [x] 7. Integrate with SiswaManagementView
  - [x] 7.1 Refactor SiswaManagementView to use useTableUrlState
    - Replace manual `currentPage`, `pageSize`, `search`, `filterKelas`, `filterStatus`, `filterTahunAjaran` refs with composable return values
    - Configure composable with: `searchKey: 'search'`, filters `kelas_id` (string), `status` (enum: aktif/pindah_sekolah/keluar/alumni), `tahun_ajaran_id` (string)
    - Remove manual debounce logic and watcher-based page resets
    - Update `fetchSiswa()` to use `queryParams` computed or individual refs
    - Wire `onPageChange` and `onPageSizeChange` to composable's `page` and `pageSize` refs directly
    - Update template `v-model` bindings to use `filters['kelas_id']`, `filters['status']`, `filters['tahun_ajaran_id']`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 7.2 Write integration tests for SiswaManagementView URL state
    - Test: mounts with query params → populates filters and fetches data
    - Test: clearing a filter removes its query param from URL
    - Test: invalid enum value in URL is ignored
    - _Requirements: 3.2, 3.3, 3.5_

- [x] 8. Integrate with TagihanView
  - [x] 8.1 Refactor TagihanView to use useTableUrlState
    - Replace manual `activeTab`, `listFilter.search`, `listFilter.status`, `listFilter.kelas_id`, `listFilter.bulan`, `currentPage`, `pageSize` with composable return values
    - Configure composable with: `searchKey: 'search'`, filters `tab` (enum: generate/daftar/verifikasi/tunggakan/audit), `status` (string), `kelas_id` (string), `bulan` (string)
    - Remove manual search debounce and watcher-based page resets
    - Wire tab switching to the composable's `filters['tab']` ref
    - Ensure tab change resets page to 1 (handled by composable's filter-change logic)
    - Update `fetchTagihanList()` and tab-switching watchers accordingly
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 8.2 Write integration tests for TagihanView URL state
    - Test: mounts with `tab` query param → restores correct active tab
    - Test: switching tabs updates URL and resets page
    - Test: invalid tab value falls back to default
    - _Requirements: 4.2, 4.3, 4.5_

- [x] 9. Integrate with AuditLogView
  - [x] 9.1 Refactor AuditLogView to use useTableUrlState
    - Replace manual filter refs (`filterAction`, `filterActorUserId`, `filterDateFrom`, `filterDateTo`, `currentPage`, `pageSize`) with composable return values
    - Configure composable with: `searchKey: 'search'`, filters `action` (string), `user_id` (string), `date_from` (string), `date_to` (string)
    - Add view-level date format validation: if `date_from` or `date_to` fails ISO date parse, treat as undefined
    - Remove manual watcher and debounce logic
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 9.2 Write integration tests for AuditLogView URL state
    - Test: mounts with date query params → populates date filters
    - Test: invalid date format in URL is ignored (filter left unset)
    - _Requirements: 5.2, 5.4_

- [x] 10. Integrate with RppPortalView
  - [x] 10.1 Refactor RppPortalView to use useTableUrlState
    - Replace manual `search`, `filterMapel`, `filterKategori`, `filterTahun`, `currentPage`, `pageSize` refs with composable return values
    - Configure composable with: `searchKey: 'search'`, filters `mapel` (string), `kategori` (string), `tahun` (string)
    - Remove manual `searchTimeout` debounce logic
    - Wire `fetchRpp()` to composable state changes
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 10.2 Write integration tests for RppPortalView URL state
    - Test: mounts with query params → initializes filters and fetches data
    - Test: filter change updates URL and resets page to 1
    - Test: clearing filter removes param from URL
    - _Requirements: 6.2, 6.3, 6.6_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design's Correctness Properties section
- Unit tests validate specific examples and edge cases
- The design uses TypeScript specifically, so all code uses TypeScript
- The existing `TablePagination.vue` uses page sizes `[15, 50, 100]` but the design specifies `[10, 15, 25, 50]` — task 6.1 addresses this alignment
- The composable's pure functions (parsers, serializer) are extracted for easy property-based testing with fast-check

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "2.4", "2.5", "2.6", "2.7", "2.8"] },
    { "id": 3, "tasks": ["4.1", "6.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4"] },
    { "id": 5, "tasks": ["7.1", "8.1", "9.1", "10.1"] },
    { "id": 6, "tasks": ["7.2", "8.2", "9.2", "10.2"] }
  ]
}
```
