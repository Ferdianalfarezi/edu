# Implementation Plan: Superadmin Cross-Tenant Access & Audit Logging

## Overview

This plan implements the Superadmin cross-tenant access feature in dependency order: foundational utilities (pagination), data layer (audit_logs schema), backend interceptors/decorators, API modules, then frontend components. Each task builds incrementally on prior work and ends with full integration.

## Tasks

- [x] 1. Create pagination utilities and shared DTOs
  - [x] 1.1 Create PaginationQueryDto, PaginationMeta interface, and paginate utility
    - Create `apps/api/src/common/dto/pagination.dto.ts` with `PaginationQueryDto` class (page: default 1, page_size: default 20, max 100) using class-validator decorators
    - Create `apps/api/src/common/interfaces/pagination.interface.ts` with `PaginationMeta` and `PaginatedResponse<T>` interfaces
    - Create `apps/api/src/common/utils/paginate.ts` with `paginate<T>()` utility function that computes total_pages from total_count and page_size
    - Export from `apps/api/src/common/dto/index.ts` and `apps/api/src/common/interfaces/index.ts`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 1.2 Write property test for pagination metadata correctness
    - **Property 10: Pagination metadata correctness**
    - **Validates: Requirements 7.2, 7.4**
    - Using fast-check, generate arbitrary total_count (0–10000), page (1–100), page_size (1–100); verify meta.total_pages === ceil(total_count/page_size), data.length <= page_size, meta.page === requested page

- [x] 2. Create audit_logs Drizzle schema and database migration
  - [x] 2.1 Define audit_logs Drizzle schema and types
    - Create `apps/api/src/drizzle/schema/audit-log.ts` with the `auditLogs` pgTable definition including all columns (id, tenant_id, actor_user_id, actor_role, action, entity_type, entity_id, ip_address, before_values, after_values, created_at) and indexes (tenant+created_at, entity_type+entity_id, actor+created_at, action+created_at)
    - Create `apps/api/src/modules/audit-log/audit-log.types.ts` with `AuditAction` and `AuditEntityType` type aliases
    - Export the schema from `apps/api/src/drizzle/schema/index.ts`
    - _Requirements: 5.1, 5.3, 5.6, 5.8_

  - [x] 2.2 Generate and run Drizzle migration for audit_logs table
    - Run `drizzle-kit generate` to create migration SQL
    - Add the `CREATE RULE audit_logs_no_update` and `CREATE RULE audit_logs_no_delete` statements to the migration to enforce append-only at DB level
    - Verify migration applies cleanly
    - _Requirements: 5.3, 5.8_

- [x] 3. Implement AuditLog module with service, decorator, and interceptor
  - [x] 3.1 Create AuditLogService with create and query methods
    - Create `apps/api/src/modules/audit-log/audit-log.service.ts` with methods: `create(dto: CreateAuditLogDto)` for inserting entries, `findAll(query: AuditLogQueryDto)` for filtered paginated queries (supporting tenant_id, entity_type, action, actor_user_id, date_from, date_to filters with max 365-day range validation), and `findOne(id: string)` for detail view
    - Inject DrizzleService, use the auditLogs schema for queries
    - Apply tenant scoping for non-SUPER_ADMIN callers (filter by their tenant_id)
    - Use the `paginate()` utility from task 1.1
    - _Requirements: 5.1, 5.4, 5.5, 5.6_

  - [x] 3.2 Create @Auditable() decorator
    - Create `apps/api/src/modules/audit-log/decorators/auditable.decorator.ts`
    - Define `AuditableOptions` interface with: entityType, action, entityIdSource ('params.id' | 'body.id' | 'response.id'), tenantIdSource ('body.tenant_id' | 'params.tenantId' | 'entity_lookup'), strictMode (default true), excludeFields (string array)
    - Use `SetMetadata` from `@nestjs/core` with `AUDITABLE_KEY` constant
    - Export the `AUDITABLE_KEY` constant and `Auditable` decorator
    - _Requirements: 5.1, 5.2_

  - [x] 3.3 Create AuditInterceptor
    - Create `apps/api/src/modules/audit-log/interceptors/audit.interceptor.ts`
    - Implement `NestInterceptor` that: reads `@Auditable()` metadata via Reflector, fetches entity "before" state pre-handler (for update/delete actions), compares with response "after" state, writes audit_log entry via AuditLogService
    - If `strictMode=true` and audit write fails, throw `InternalServerErrorException` to trigger transaction rollback
    - If `strictMode=false` and audit write fails, log warning and continue
    - Exclude fields listed in `excludeFields` from before/after diff
    - Extract IP address from request (`req.ip` or `X-Forwarded-For` header)
    - _Requirements: 5.1, 5.2, 5.7, 4.4a_

  - [x] 3.4 Create AuditLogController with list and detail endpoints
    - Create `apps/api/src/modules/audit-log/audit-log.controller.ts`
    - `GET /audit-logs` — accessible by SUPER_ADMIN, ADMIN, BENDAHARA; accepts filter query params; for ADMIN/BENDAHARA auto-scopes to their tenant and restricts entity_type to 'tagihan' and 'pembayaran' for BENDAHARA
    - `GET /audit-logs/:id` — accessible by same roles with same scoping
    - Validate date range does not exceed 365 days
    - _Requirements: 5.4, 5.5, 6.1, 6.4_

  - [x] 3.5 Create AuditLogModule and register providers
    - Create `apps/api/src/modules/audit-log/audit-log.module.ts` as a Global module exporting AuditLogService and AuditInterceptor
    - Create barrel `apps/api/src/modules/audit-log/index.ts`
    - Register in `AppModule`
    - _Requirements: 5.1, 5.6_

  - [x] 3.6 Write property test for audit log creation on sensitive entity operations
    - **Property 4: Audit log creation for sensitive entity operations**
    - **Validates: Requirements 5.1, 5.6**
    - Generate random sensitive entity operations (CRUD on tagihan/pembayaran/user/role_assignment/tenant_config), verify audit entry has all required fields (action, actor_user_id, actor_role, timestamp ISO8601+tz, entity_type, entity_id, tenant_id, ip_address)

  - [x] 3.7 Write property test for audit log before/after values on updates
    - **Property 5: Audit log captures before/after values for updates**
    - **Validates: Requirements 5.2**
    - Generate random entity states, perform random field modifications, verify before_values and after_values differ on at least one key and excluded fields are absent

  - [x] 3.8 Write property test for audit log filter correctness
    - **Property 6: Filter correctness**
    - **Validates: Requirements 5.4**
    - Generate random audit entries, apply random filter combinations, verify every returned entry satisfies all active filters

  - [x] 3.9 Write property test for audit write failure rollback
    - **Property 8: Audit write failure causes operation rollback for sensitive entities**
    - **Validates: Requirements 5.7**
    - Mock audit INSERT to fail, execute sensitive entity operation, verify entity state unchanged in database

- [x] 4. Checkpoint - Verify audit module compiles and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Modify TenantInterceptor for X-Tenant-Context header support
  - [x] 5.1 Extend TenantInterceptor to handle X-Tenant-Context for SUPER_ADMIN
    - Modify `apps/api/src/common/interceptors/tenant.interceptor.ts`
    - When user is SUPER_ADMIN: check for `X-Tenant-Context` header
    - If header present: validate UUID format, verify tenant exists and is active (query tenant table), then acquire pool client + BEGIN + SET LOCAL app.tenant_id to the header value (scope to that tenant)
    - If header absent: continue with existing behavior (bypass RLS entirely, no pool client needed)
    - If header has invalid UUID or inactive/nonexistent tenant: return HTTP 400 with error message `Tenant tidak tersedia atau tidak aktif`
    - If SET LOCAL fails: return HTTP 500 with message `Konteks tenant tidak dapat disiapkan`
    - _Requirements: 1.3, 1.4, 2.2, 2.2a, 2.6_

  - [x] 5.2 Write property tests for tenant context scoping
    - **Property 2: Tenant context header scopes all results to that tenant**
    - **Validates: Requirements 1.4, 2.2**
    - Generate entities across N tenants, set X-Tenant-Context to random valid tenant UUID, verify all response records have matching tenant_id and no other tenant's data appears

  - [x] 5.3 Write property test for cross-tenant read without context
    - **Property 1: Cross-tenant read without context returns all tenants with tenant_id**
    - **Validates: Requirements 1.1, 1.3**
    - Generate entities across multiple tenants, query without header, verify all records include non-null tenant_id and records from all populated tenants appear

- [x] 6. Implement Dashboard module with cross-tenant metrics
  - [x] 6.1 Create DashboardService with cross-tenant aggregation query
    - Create `apps/api/src/modules/dashboard/dashboard.service.ts`
    - Implement `getCrossTenantMetrics()` using raw SQL that: counts total/active/inactive tenants, total enabled users, total active students, total unpaid invoices; per-tenant: userCount, studentCount, unpaidAmount (sum of nominal - total_dibayar where status in 'belum_bayar','cicilan'), hasOverdueInvoices (any invoice with tanggal_jatuh_tempo < NOW() - 30 days)
    - Return `CrossTenantMetrics` interface shape
    - _Requirements: 3.1, 3.2, 3.3, 3.5_

  - [x] 6.2 Create DashboardController and DashboardModule
    - Create `apps/api/src/modules/dashboard/dashboard.controller.ts` with `GET /dashboard/superadmin/metrics` endpoint, guarded with `@Roles(Role.SUPER_ADMIN)`
    - Create `apps/api/src/modules/dashboard/dashboard.module.ts`
    - Register module in AppModule
    - _Requirements: 3.3, 3.4_

  - [x] 6.3 Write property test for overdue invoice detection
    - **Property 9: Overdue invoice detection**
    - **Validates: Requirements 3.5**
    - Generate tenants with invoices at random dates and statuses, verify hasOverdueInvoices is true only when at least one invoice has tanggal_jatuh_tempo > 30 days overdue with status belum_bayar or cicilan

- [x] 7. Extend Tenant module with enhanced management endpoints
  - [x] 7.1 Add tenant search endpoint and paginated tenant list
    - Add `GET /tenants/search?q=` endpoint to existing `tenant.controller.ts` (SUPER_ADMIN only, min 1 char query, returns id + nama)
    - Modify existing `GET /tenants` to use `PaginationQueryDto` and return `PaginatedResponse` with status, creation date, and user count
    - _Requirements: 2.5, 4.1, 7.4_

  - [x] 7.2 Implement tenant create with admin user and credentials email
    - Add `POST /tenants` endpoint (SUPER_ADMIN only)
    - Accept: nama (max 255), tenant email, admin name, admin email
    - Atomically: create tenant record → create admin user with generated password (12+ chars) → enqueue credentials email via BullMQ
    - Return created tenant with ID and admin user ID
    - Validate admin email uniqueness, return error if taken
    - Add `@Auditable({ entityType: 'tenant_config', action: 'create', entityIdSource: 'response.id', strictMode: false })` 
    - _Requirements: 4.2, 4.3_

  - [x] 7.3 Implement tenant activate/deactivate endpoints
    - Add `PATCH /tenants/:id/activate` and `PATCH /tenants/:id/deactivate` (SUPER_ADMIN only)
    - Deactivate: set status inactive + invalidate all user sessions (delete refresh tokens for all tenant users)
    - Activate: set status to active
    - Reject deactivate if already inactive; reject any DELETE attempt with error "tenant deletion is prohibited"
    - Add `@Auditable()` with strictMode: false for both
    - Add `DELETE /tenants/:id` endpoint that always returns 400 with prohibition message
    - _Requirements: 4.5, 4.6, 4.7, 4.8_

  - [x] 7.4 Add @Auditable() decorator to tenant update endpoint
    - Modify existing tenant update endpoint to include `@Auditable({ entityType: 'tenant_config', action: 'update', entityIdSource: 'params.id', strictMode: false })`
    - This ensures tenant detail changes are logged but not rolled back on audit failure
    - _Requirements: 4.4, 4.4a_

- [x] 8. Extend User module with cross-tenant management endpoints
  - [x] 8.1 Add cross-tenant user list and search endpoint
    - Extend existing user controller with `GET /users` for SUPER_ADMIN: returns all users across tenants with tenant name, paginated (default page_size 50), with search support (min 3 chars, matches email/nama/phone)
    - Include `PaginationQueryDto` with custom default page_size=50
    - When X-Tenant-Context is set, scope to that tenant
    - When no context, include all tenants with tenant name in each record
    - _Requirements: 8.1, 8.7, 1.3_

  - [x] 8.2 Implement user role update endpoint
    - Add `PATCH /users/:id/role` (SUPER_ADMIN only)
    - Accept body `{ role: string }`; validate role is in allowed set (ADMIN, KEPALA_SEKOLAH, GURU, BENDAHARA, ORANG_TUA); reject SUPER_ADMIN assignment
    - Persist change + `@Auditable({ entityType: 'role_assignment', action: 'role_change', entityIdSource: 'params.id', strictMode: true })`
    - _Requirements: 8.2, 8.3_

  - [x] 8.3 Implement user deactivate/activate endpoints
    - Add `PATCH /users/:id/deactivate` and `PATCH /users/:id/activate` (SUPER_ADMIN only)
    - Deactivate: set user inactive, delete all refresh tokens for that user (session invalidation), `@Auditable({ entityType: 'user', action: 'deactivate', strictMode: true })`
    - Activate: set user active, `@Auditable({ entityType: 'user', action: 'activate', strictMode: true })`
    - Reject if user not found (404) or already in target state (400)
    - _Requirements: 8.4, 8.5, 8.8_

  - [x] 8.4 Implement password reset endpoint
    - Add `POST /users/:id/reset-password` (SUPER_ADMIN only)
    - Generate temporary password (12+ chars), hash and persist, set must_change_password flag, enqueue email with temp password via BullMQ
    - `@Auditable({ entityType: 'user', action: 'password_reset', entityIdSource: 'params.id', strictMode: true, excludeFields: ['password', 'password_hash', 'temp_password'] })`
    - _Requirements: 8.6_

  - [x] 8.5 Write property test for non-superadmin authorization rejection
    - **Property 3: Non-superadmin authorization rejection**
    - **Validates: Requirements 1.6, 3.4**
    - For each non-SUPER_ADMIN role × each superadmin-only endpoint, verify HTTP 403 is returned

  - [x] 8.6 Write property test for user search matching
    - **Property 12: User search returns only matching users**
    - **Validates: Requirements 8.7**
    - Generate random users with arbitrary names/emails/phones, search random substrings (3+ chars), verify every result contains the search term in at least one of email, nama, or phone

  - [x] 8.7 Write property test for password value exclusion from audit
    - **Property 11: Audit log excludes sensitive password values**
    - **Validates: Requirements 8.6**
    - Execute password reset operations, verify the audit log entry's before_values and after_values contain no plaintext password, hash, or temporary password value

- [x] 9. Add @Auditable() to existing Tagihan and Pembayaran controllers
  - [x] 9.1 Add @Auditable() decorator to Tagihan CRUD endpoints
    - Add `@Auditable({ entityType: 'tagihan', action: 'create'|'update'|'delete', strictMode: true, excludeFields: ['bukti_transfer_url'] })` to relevant endpoints in `apps/api/src/modules/tagihan/tagihan.controller.ts`
    - Ensure transaction wraps both the entity operation and audit write
    - _Requirements: 5.1, 5.6, 5.7_

  - [x] 9.2 Add @Auditable() decorator to Pembayaran CRUD endpoints
    - Add `@Auditable({ entityType: 'pembayaran', action: 'create'|'update'|'delete', strictMode: true, excludeFields: ['bukti_transfer_url'] })` to relevant endpoints in the pembayaran/tagihan controller
    - _Requirements: 5.1, 5.6, 5.7_

- [x] 10. Checkpoint - Verify all backend modules compile and pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Create tenant context Pinia store and axios interceptor (Frontend)
  - [x] 11.1 Create tenant-context Pinia store with sessionStorage persistence
    - Create `apps/admin/src/stores/tenant-context.ts`
    - State: `activeTenant: { id: string; nama: string } | null`, initialized from `sessionStorage.getItem('tenant_context')`
    - Actions: `setTenant(tenant)` saves to sessionStorage, `clearTenant()` removes from sessionStorage
    - Getters: `hasTenantContext` boolean
    - _Requirements: 2.1, 2.7_

  - [x] 11.2 Add X-Tenant-Context request interceptor to axios client
    - Modify `apps/admin/src/api/client.ts` to add a request interceptor that reads `useTenantContextStore().activeTenant` and sets `X-Tenant-Context` header when non-null
    - Ensure the interceptor runs after the existing auth interceptor
    - _Requirements: 2.1, 2.4_

  - [x] 11.3 Write property test for tenant context header propagation
    - **Property 13: Tenant context header propagation from frontend**
    - **Validates: Requirements 2.1, 2.4**
    - Set random tenant UUIDs in store, intercept outgoing requests, verify header presence/absence matches store state

- [x] 12. Create TenantContextSwitcher component and integrate into layout
  - [x] 12.1 Create TenantContextSwitcher component
    - Create `apps/admin/src/components/layout/TenantContextSwitcher.vue`
    - Renders only when user role is SUPER_ADMIN
    - Contains: SearchSelect (debounced, min 1 char) calling `GET /tenants/search?q=`
    - Shows active tenant badge with name + clear button when context is set
    - On select: calls `tenantContextStore.setTenant()`
    - On clear: calls `tenantContextStore.clearTenant()`
    - On invalid tenant error response (400): clear context and show toast
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6_

  - [x] 12.2 Integrate TenantContextSwitcher into AppLayout header
    - Modify `apps/admin/src/components/layout/AppLayout.vue` to include `<TenantContextSwitcher />` in the top header bar, visible on all pages
    - Conditionally render based on SUPER_ADMIN role (handled within component, but ensure it's always mounted for SUPER_ADMIN)
    - On logout: ensure tenant context is cleared (add `clearTenant()` call to logout flow in auth store)
    - _Requirements: 2.3, 2.5, 2.5a_

- [x] 13. Create SuperadminDashboard component
  - [x] 13.1 Create SuperadminDashboard component with overview cards and tenant table
    - Create `apps/admin/src/components/dashboard/SuperadminDashboard.vue`
    - Overview cards: total tenants (active/inactive), total users, total students, total unpaid invoices
    - Per-tenant summary table: nama, userCount, studentCount, unpaidAmount, overdue indicator (visual badge/highlight for rows with hasOverdueInvoices=true)
    - Refresh button that re-fetches `GET /dashboard/superadmin/metrics`
    - Error state with message + retry button on API failure
    - Loading state during fetch
    - _Requirements: 3.1, 3.2, 3.5, 3.6, 3.7_

  - [x] 13.2 Register SuperadminDashboard in DashboardView
    - Modify `apps/admin/src/views/DashboardView.vue` (or its component registry at `apps/admin/src/components/dashboard/index.ts`) to render `SuperadminDashboard` when user role is SUPER_ADMIN
    - _Requirements: 3.1_

- [x] 14. Create AuditLogViewer view and route
  - [x] 14.1 Create AuditLogView with paginated table and filters
    - Create `apps/admin/src/views/AuditLogView.vue`
    - For SUPER_ADMIN: full filters (tenant dropdown, entity type, action type, actor, date range picker)
    - For ADMIN/BENDAHARA: hide tenant filter, restrict entity type options to tagihan/pembayaran
    - Paginated table (20 per page, offset-based) with page numbers, total count display, first/prev/next/last controls
    - Columns: timestamp, action, entity type, entity ID, actor, tenant name
    - Empty state message when no results match filters
    - On filter change: reset to page 1
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 7.1, 7.2, 7.3_

  - [x] 14.2 Add audit log detail panel with before/after diff view
    - In the AuditLogView, add a detail panel (modal or slide-over) shown when clicking an entry
    - Display all audit entry fields + before/after values side-by-side
    - Visually distinguish changed fields from unchanged fields (highlight or color coding)
    - _Requirements: 6.3_

  - [x] 14.3 Add audit-log route to Vue Router
    - Add route `{ path: '/audit-logs', name: 'audit-logs', component: AuditLogView, meta: { roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BENDAHARA] } }` to `apps/admin/src/router/index.ts`
    - Add navigation link in sidebar/menu for applicable roles
    - _Requirements: 6.1, 6.4_

  - [x] 14.4 Write property test for non-superadmin audit log scoping
    - **Property 7: Non-superadmin audit log access is tenant and entity scoped**
    - **Validates: Requirements 5.5, 6.4**
    - Query as ADMIN/BENDAHARA user, verify all results have matching tenant_id; for BENDAHARA verify entity_type is only tagihan or pembayaran

- [x] 15. Validate create operations require tenant_id for Superadmin
  - [x] 15.1 Add tenant_id validation middleware for Superadmin create operations
    - In the TenantInterceptor or as a separate guard/pipe: when SUPER_ADMIN performs a POST (create) and no X-Tenant-Context header is set and no tenant_id in body, return HTTP 400 with message `tenant_id wajib disertakan untuk operasi create oleh Superadmin`
    - This ensures Superadmin cannot accidentally create entities without specifying which tenant they belong to
    - _Requirements: 1.5_

- [x] 16. Final checkpoint - Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The TenantInterceptor modification (task 5) is the critical integration point — it connects frontend tenant context switching to backend RLS scoping
- The AuditInterceptor (task 3.3) handles both strict-mode (rollback on failure for financial ops) and soft-mode (log warning for tenant config ops) strategies
- BullMQ is used for email enqueuing (tenant creation credentials, password reset) — these leverage the existing queue module at `apps/api/src/modules/queue/`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2"] },
    { "id": 2, "tasks": ["3.1", "3.2"] },
    { "id": 3, "tasks": ["3.3", "3.4", "3.5"] },
    { "id": 4, "tasks": ["3.6", "3.7", "3.8", "3.9", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "6.1", "7.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "7.2", "7.3", "7.4"] },
    { "id": 7, "tasks": ["8.1", "8.2", "8.3", "8.4", "9.1", "9.2"] },
    { "id": 8, "tasks": ["8.5", "8.6", "8.7", "15.1"] },
    { "id": 9, "tasks": ["11.1"] },
    { "id": 10, "tasks": ["11.2", "11.3"] },
    { "id": 11, "tasks": ["12.1"] },
    { "id": 12, "tasks": ["12.2", "13.1"] },
    { "id": 13, "tasks": ["13.2", "14.1"] },
    { "id": 14, "tasks": ["14.2", "14.3", "14.4"] }
  ]
}
```
