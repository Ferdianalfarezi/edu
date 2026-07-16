# Requirements Document

## Introduction

Persist search, filter, and pagination state in URL query parameters for all data tables in the admin panel. Currently, when a user applies filters, searches, or navigates pages and then refreshes the browser, all table state is lost. This feature ensures that table state is encoded in the URL so it survives page refreshes, enables sharing of filtered views via URL, and supports browser back/forward navigation.

## Glossary

- **Composable**: A reusable Vue 3 Composition API function (convention: `useXxx`) that encapsulates reactive logic
- **Table_View**: A page-level Vue component that displays a paginated, searchable, filterable data table. Current Table_Views: SiswaManagementView, TagihanView, AuditLogView, RppPortalView
- **Query_Parameters**: The key-value pairs in the URL after the `?` character (e.g., `?page=2&search=john`)
- **Table_State**: The combination of current page number, page size, search query, and active filter selections for a Table_View
- **Router**: The Vue Router 4 instance that manages navigation and URL state in the admin app
- **Default_State**: The initial values of Table_State when no Query_Parameters are present (page=1, pageSize=15, search empty, filters empty)

## Requirements

### Requirement 1: Composable for URL-Synced Table State

**User Story:** As a developer, I want a reusable composable that synchronizes table state with URL query parameters, so that I can apply URL persistence to any Table_View without duplicating logic.

#### Acceptance Criteria

1. THE Composable SHALL accept a configuration object defining the table state parameters including: search key name (string), filter keys with their types (string, number, or enum), and default page size (number from allowed set [10, 15, 25, 50])
2. THE Composable SHALL return reactive refs for page (number), pageSize (number), search (string), and a filters object with one ref per configured filter key, all two-way synced with Query_Parameters
3. WHEN the Composable is initialized, THE Composable SHALL read Query_Parameters from the current URL via `useRoute().query` and populate reactive state by parsing string values to their configured types
4. WHEN no Query_Parameters are present in the URL, THE Composable SHALL use Default_State values (page=1, pageSize=15, search='', each filter=undefined)
5. WHEN reactive state values change programmatically, THE Composable SHALL update Query_Parameters in the URL using `router.replace()` (not `router.push()`) to avoid polluting browser history
6. THE Composable SHALL omit Query_Parameters from the URL when their value equals Default_State (keep URLs clean)
7. WHEN the search value changes, THE Composable SHALL debounce the URL update by 300ms to avoid excessive router.replace calls during typing
8. WHEN a non-search filter or pagination value changes, THE Composable SHALL update the URL immediately without debounce
9. WHEN any filter (including search) changes, THE Composable SHALL reset the page parameter to 1

### Requirement 2: Page Refresh Persistence

**User Story:** As an admin user, I want my current table filters, search, and page to be preserved when I refresh the browser, so that I don't lose my place in the data.

#### Acceptance Criteria

1. WHEN a user refreshes the browser on a Table_View with Query_Parameters present in the URL, THE Table_View SHALL parse the page, pageSize, search, and filter Query_Parameters from the URL and fetch data using those values
2. WHEN a user refreshes the browser on a Table_View with no Query_Parameters in the URL, THE Table_View SHALL display Default_State (page=1, pageSize=15, search='', filters={})
3. WHEN a user changes the search input, THE Table_View SHALL wait 300ms after the last keystroke, then update the search Query_Parameter in the URL and reset the page Query_Parameter to 1
4. WHEN a user changes a filter selection, THE Table_View SHALL update the corresponding filter Query_Parameter in the URL and reset the page Query_Parameter to 1
5. WHEN a user changes page or page size via TablePagination, THE Table_View SHALL update the page and pageSize Query_Parameters in the URL
6. IF the URL contains a pageSize value that is not one of the allowed values (10, 15, 25, 50), THEN THE Table_View SHALL fall back to the default pageSize of 15
7. IF the URL contains a page value less than 1 or non-numeric, THEN THE Table_View SHALL reset the page Query_Parameter to 1
8. WHEN Query_Parameters with Default_State values are set, THE Table_View SHALL omit those parameters from the URL rather than displaying them explicitly

### Requirement 3: Integration with SiswaManagementView

**User Story:** As an admin user managing student data, I want the student table's search, class filter, status filter, tahun ajaran filter, page, and page size to persist in the URL.

#### Acceptance Criteria

1. THE SiswaManagementView SHALL synchronize these query parameters bidirectionally with the URL: `search`, `kelas_id`, `status`, `tahun_ajaran_id`, `page`, `page_size`
2. WHEN the SiswaManagementView mounts with query parameters present in the URL, THE SiswaManagementView SHALL populate its filter controls with the URL values and fetch data matching those parameters before rendering the table
3. WHEN a user clears a filter in SiswaManagementView (resets to the placeholder/empty selection), THE SiswaManagementView SHALL remove that filter's query parameter from the URL entirely rather than setting it to an empty string
4. IF query parameters are absent from the URL on initial load, THEN THE SiswaManagementView SHALL use these defaults: `page` = 1, `page_size` = 15, `search` = empty string, `kelas_id` = unset, `status` = unset, `tahun_ajaran_id` = unset
5. IF a URL query parameter contains an invalid value (non-numeric `page`, `page_size` not in allowed list, or a `status` value not matching any valid enum value), THEN THE SiswaManagementView SHALL ignore that parameter and fall back to its default value
6. WHEN the search filter value changes, THE SiswaManagementView SHALL update the URL query parameter after the 300-millisecond debounce completes (not immediately on each keystroke)
7. WHEN a non-search filter (kelas_id, status, tahun_ajaran_id) changes or when pagination (page, page_size) changes, THE SiswaManagementView SHALL update the URL query parameters immediately without debounce

### Requirement 4: Integration with TagihanView

**User Story:** As an admin/bendahara managing billing, I want the tagihan table's filters and pagination to persist in the URL.

#### Acceptance Criteria

1. THE TagihanView SHALL use the Composable to sync its active tab, search, filters, page, and page_size as Query_Parameters with these parameter names: `tab`, `search`, `status`, `kelas_id`, `bulan`, `page`, `page_size`
2. WHEN the TagihanView mounts with Query_Parameters present in the URL, THE TagihanView SHALL restore the active tab selection, populate filter controls, and fetch data matching those parameters
3. WHEN the user switches tabs, THE TagihanView SHALL update the `tab` Query_Parameter and reset page to 1, while preserving other filters
4. WHEN the user clears a filter to its default value, THE TagihanView SHALL remove that parameter from the URL
5. IF the `tab` Query_Parameter contains a value not matching any valid tab identifier, THEN THE TagihanView SHALL fall back to the default tab

### Requirement 5: Integration with AuditLogView

**User Story:** As an admin reviewing audit logs, I want the audit log table's search, filters, and pagination to persist in the URL.

#### Acceptance Criteria

1. THE AuditLogView SHALL use the Composable to sync these query parameters with the URL: `search`, `action`, `user_id`, `date_from`, `date_to`, `page`, `page_size`
2. WHEN the AuditLogView mounts with Query_Parameters present in the URL, THE AuditLogView SHALL populate its filter controls and fetch audit log data matching those parameters
3. WHEN the user clears a filter to its default value, THE AuditLogView SHALL remove that parameter from the URL
4. IF a date Query_Parameter (`date_from`, `date_to`) contains an invalid date format, THEN THE AuditLogView SHALL ignore that parameter and leave the date filter unset

### Requirement 6: Integration with RppPortalView

**User Story:** As a guru or admin browsing RPP, I want the RPP portal table's search, filters, and pagination to persist in the URL.

#### Acceptance Criteria

1. THE RppPortalView SHALL use the URL-syncing composable to read and write the following query parameters: `search` (string), `mapel` (string, mata pelajaran ID), `kategori` (string, kategori ID), `tahun` (string, tahun terbit), `page` (integer, minimum 1), and `page_size` (integer, one of the allowed page sizes)
2. WHEN the RppPortalView mounts with one or more of these query parameters present in the URL, THE RppPortalView SHALL initialize the corresponding table state (search input, filter dropdowns, current page, page size) from the URL values before fetching data
3. WHEN the user changes a filter (mapel, kategori, or tahun) or the debounced search value updates, THE RppPortalView SHALL update the URL query parameters to reflect the new state and reset the `page` parameter to 1
4. WHEN the user navigates to a page or changes page_size, THE RppPortalView SHALL update the `page` and `page_size` query parameters in the URL without triggering a full page reload
5. IF a query parameter value from the URL is invalid (page less than 1, page_size not in allowed list, or a non-existent filter ID), THEN THE RppPortalView SHALL ignore that parameter and use its default value (page=1, page_size=15, empty string for filters)
6. WHEN the user clears a filter or search to its default empty value, THE RppPortalView SHALL remove that parameter from the URL rather than keeping it as an empty string

### Requirement 7: URL Hygiene and Edge Cases

**User Story:** As a developer, I want the URL state to be well-behaved so it doesn't create broken states or confuse users.

#### Acceptance Criteria

1. IF a Query_Parameter contains an invalid page number (negative, zero, or non-numeric), THEN THE Composable SHALL reset page to 1
2. IF a Query_Parameter contains a page_size value not in the allowed list [10, 15, 25, 50], THEN THE Composable SHALL fall back to Default_State page size of 15
3. WHEN multiple filter changes happen within the same event loop tick, THE Composable SHALL batch them into a single router.replace() call
4. THE Composable SHALL preserve unknown Query_Parameters already in the URL (not strip them) to allow coexistence with other URL state
5. THE Composable SHALL encode and decode Query_Parameter values safely using Vue Router's built-in encoding (handle special characters in search strings such as &, =, +, spaces)
6. IF the URL contains duplicate keys for the same Query_Parameter, THEN THE Composable SHALL use the first occurrence and ignore subsequent ones
