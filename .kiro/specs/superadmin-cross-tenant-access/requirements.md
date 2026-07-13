# Requirements Document

## Introduction

This feature enables the Superadmin user (superadmin@stepyourbiz.com) to access and manage data across all tenants in the multi-tenant school management system. It adds a tenant context switching mechanism for scoped operations, a cross-tenant dashboard for platform-wide oversight, and selective audit logging for sensitive entities (invoices, payments, user/role changes).

The system already has the `SUPER_ADMIN` role defined and RLS bypass in place via the TenantInterceptor. This spec covers the application-layer capabilities, UI, and audit trail that are currently missing.

## Glossary

- **Superadmin**: The single platform-level user (superadmin@stepyourbiz.com) with `SUPER_ADMIN` role, operating outside any single tenant scope
- **Tenant**: A school organization whose data is isolated via PostgreSQL Row-Level Security
- **Tenant_Context**: A session-level state where the Superadmin operates within a specific tenant's data scope
- **Audit_Log**: An append-only record of sensitive operations capturing actor, action, entity, timestamp, and data changes
- **Sensitive_Entity**: An entity type subject to audit logging: Tagihan (invoice), Pembayaran (payment), User, Role assignment, Tenant configuration
- **Cross_Tenant_Dashboard**: A Superadmin-only view displaying aggregated metrics across all tenants
- **API_Gateway**: The NestJS backend application at `apps/api`
- **Admin_Panel**: The Vue.js web frontend at `apps/admin`

## Requirements

### Requirement 1: Cross-Tenant Data Access

**User Story:** As the Superadmin, I want to view and manage all data across all tenants without restriction, so that I can provide platform-level support and oversight.

#### Acceptance Criteria

1. WHILE the Superadmin is authenticated AND performing a read operation, THE API_Gateway SHALL allow read access to all entities in all tenants without RLS filtering
2. WHILE the Superadmin is authenticated, THE API_Gateway SHALL allow create, update, and delete operations on all entities in all tenants
3. WHEN the Superadmin performs a read operation on a list endpoint without a Tenant_Context header, THE API_Gateway SHALL return results from all tenants with each record including its tenant_id field in the response
4. WHILE the Superadmin has SUPER_ADMIN role AND is performing a read operation AND the request includes a Tenant_Context header containing a valid tenant UUID, THE API_Gateway SHALL return only results belonging to that tenant
5. IF the Superadmin submits a create operation without specifying a tenant_id in the request body, THEN THE API_Gateway SHALL reject the request with HTTP 400 and an error message indicating that tenant_id is required for Superadmin create operations
6. WHEN a non-Superadmin user requests any Superadmin-only endpoint, THE API_Gateway SHALL return HTTP 403 Forbidden

### Requirement 2: Tenant Context Switching

**User Story:** As the Superadmin, I want to switch into a specific tenant's context, so that I can operate as if I were a staff member of that school and use existing tenant-scoped features.

#### Acceptance Criteria

1. WHEN the Superadmin selects a tenant from the tenant search/select control, THE Admin_Panel SHALL store the selected tenant identifier and include it as a tenant-scoping header on all subsequent API requests until cleared
2. WHILE a Tenant_Context is active, THE API_Gateway SHALL set the PostgreSQL session variable for RLS enforcement to the selected tenant, scoping all data queries to that tenant for the Superadmin's requests
2a. IF the PostgreSQL RLS session variable setup fails while activating a Tenant_Context, THEN THE API_Gateway SHALL block all tenant-scoped operations for that request and return HTTP 500 with an error indicating the tenant context could not be established
3. WHILE a Tenant_Context is active, THE Admin_Panel SHALL display the selected tenant's name in the persistent top header bar, visible on every page without requiring scrolling
4. WHEN the Superadmin clicks the clear action on the active Tenant_Context indicator, THE API_Gateway SHALL revert to unscoped cross-tenant access for subsequent requests
5. WHILE the Superadmin is logged in, THE Admin_Panel SHALL display a tenant search/select control in the top header bar that allows searching tenants by name with results appearing after the user has entered at least 1 character
5a. WHEN the Superadmin logs out, THE Admin_Panel SHALL immediately hide the tenant search/select control without requiring a page refresh
6. IF the Superadmin selects a tenant that has been deactivated or does not exist, THEN THE API_Gateway SHALL reject the request with an error indicating the tenant is unavailable and THE Admin_Panel SHALL clear the invalid Tenant_Context
7. WHEN the Superadmin refreshes the page or opens a new tab, THE Admin_Panel SHALL restore the previously active Tenant_Context from browser session storage so the scoped state persists within the browser session

### Requirement 3: Cross-Tenant Dashboard

**User Story:** As the Superadmin, I want a dashboard showing key metrics across all tenants, so that I can monitor platform health and identify issues.

#### Acceptance Criteria

1. WHEN the Superadmin navigates to the dashboard, THE Admin_Panel SHALL display a cross-tenant overview with: total tenants (active and inactive), total users with an enabled account across all tenants, total students with status "aktif", and total invoices with status "belum_bayar" or "cicilan"
2. WHEN the Superadmin navigates to the dashboard, THE Admin_Panel SHALL display a per-tenant summary table with columns: tenant name, user count (enabled accounts), student count (status "aktif"), and total unpaid invoice amount (sum of nominal minus total_dibayar for invoices with status "belum_bayar" or "cicilan")
3. THE API_Gateway SHALL expose a Superadmin-only endpoint that aggregates metrics across all tenants for the Cross_Tenant_Dashboard and returns the response within 5 seconds
4. IF a non-Superadmin user OR a user with an uncertain authentication state attempts to access the cross-tenant metrics endpoint, THEN THE API_Gateway SHALL return HTTP 403 Forbidden
5. WHEN a tenant has at least one invoice with status "belum_bayar" or "cicilan" whose tanggal_jatuh_tempo is more than 30 days before the current date, THE Cross_Tenant_Dashboard SHALL display that tenant row with a visual "overdue" indicator distinguishable from non-overdue rows
6. THE Admin_Panel SHALL always display a refresh/retry button on the Cross_Tenant_Dashboard, allowing the Superadmin to manually refresh data at any time
7. IF the cross-tenant metrics endpoint fails to respond or returns an error, THEN THE Admin_Panel SHALL display an error message indicating the data could not be loaded alongside the refresh/retry button

### Requirement 4: Superadmin Tenant Management

**User Story:** As the Superadmin, I want to view, create, edit, activate, and deactivate tenants, so that I can manage the schools on the platform.

#### Acceptance Criteria

1. WHEN the Superadmin requests the tenant list, THE API_Gateway SHALL return all tenants with their status (active/inactive), creation date, and user count
2. WHEN the Superadmin creates a new tenant with a valid nama (max 255 characters), tenant email, admin name, and admin email, THE API_Gateway SHALL atomically persist the tenant record and only upon successful tenant record creation proceed to create a default admin user with a generated password and enqueue a credentials email to the admin email address, returning the created tenant with its generated identifier and the created admin user's identifier
3. IF the Superadmin attempts to create a tenant with an admin email that is already in use by an existing user, THEN THE API_Gateway SHALL reject the request and return an error indicating the email is already taken
4. WHEN the Superadmin updates a tenant's details (nama, alamat, telepon, or email), THE API_Gateway SHALL persist the changes and attempt to record an Audit_Log entry capturing the actor, action type, tenant entity ID, and changed field values
4a. IF the Audit_Log write fails during a tenant detail update, THEN THE API_Gateway SHALL allow the tenant detail change to remain persisted (no rollback) and log the audit failure for operational alerting — this is intentionally different from Sensitive_Entity operations (Requirement 5 AC-7) because tenant configuration updates are lower-severity than financial or user operations
5. WHEN the Superadmin deactivates a tenant, THE API_Gateway SHALL set the tenant status to inactive and invalidate all active sessions for users in that tenant
6. WHEN the Superadmin activates an inactive tenant, THE API_Gateway SHALL set the tenant status to active
7. IF the Superadmin attempts to deactivate a tenant that is already inactive, THEN THE API_Gateway SHALL reject the request and return an error indicating the tenant is already inactive
8. IF the Superadmin attempts to delete a tenant, THEN THE API_Gateway SHALL reject ALL deletion attempts regardless of dependencies and return an error indicating that tenant deletion is prohibited (soft-delete/deactivation only approach)

### Requirement 5: Audit Logging for Sensitive Entities

**User Story:** As the Superadmin, I want an immutable audit trail for sensitive operations, so that I can track who changed financial data, user accounts, and role assignments.

#### Acceptance Criteria

1. WHEN a create, update, or delete operation is performed on a Sensitive_Entity, THE API_Gateway SHALL write an Audit_Log entry containing: action type, actor user ID, actor role, timestamp (ISO 8601 with timezone), entity type, entity ID, tenant ID, and request IP address
2. WHEN an update operation is performed on a Sensitive_Entity, THE Audit_Log entry SHALL include the before-values and after-values of all changed scalar and text fields (excluding binary file content such as Bukti_Transfer images)
3. THE API_Gateway SHALL store Audit_Log entries in an append-only table that does not permit UPDATE or DELETE operations at the application layer
4. WHEN the Superadmin queries the audit log, THE API_Gateway SHALL support filtering by: tenant ID, entity type, action type, actor user ID, and date range (maximum span of 365 days per query)
5. WHEN a non-Superadmin user with role Admin, Bendahara, or Kepala_Sekolah queries the audit log, THE API_Gateway SHALL enforce tenant scoping by filtering results to only include Audit_Log entries belonging to their own tenant
6. THE Audit_Log SHALL capture operations on these entity types: Tagihan, Pembayaran, User (create/update/deactivate), Role assignment changes, and Tenant configuration changes
7. IF the Audit_Log write fails during a sensitive operation (Tagihan, Pembayaran, User create/update/deactivate, or Role assignment change), THEN THE API_Gateway SHALL roll back the original operation and return an error indicating the operation could not be completed — this strict rollback applies to high-severity financial and user operations, distinct from lower-severity tenant configuration updates (Requirement 4 AC-4a) which allow the change to persist
7a. IF any failure occurs during a sensitive operation (including validation errors, database errors, or audit write failures), THEN THE API_Gateway SHALL return an appropriate error response to the caller
8. THE API_Gateway SHALL retain Audit_Log entries for a minimum of 5 years from the date of creation

### Requirement 6: Audit Log Viewer

**User Story:** As the Superadmin, I want to view and search the audit log through the Admin Panel, so that I can investigate changes and troubleshoot issues.

#### Acceptance Criteria

1. WHEN the Superadmin navigates to the audit log page, THE Admin_Panel SHALL display a paginated table of Audit_Log entries sorted by timestamp descending with 20 entries per page, showing page numbers and allowing direct navigation to any page (traditional offset-based pagination)
2. WHEN the Superadmin applies any combination of filters (tenant, entity type, action type, actor, date range), THE Admin_Panel SHALL reload the list showing only Audit_Log entries matching all selected filter criteria and reset pagination to the first page
3. WHEN the Superadmin selects an audit log entry, THE Admin_Panel SHALL display the full detail including before/after values presented side-by-side with changed fields visually distinguished from unchanged fields
4. WHEN a Bendahara or Admin navigates to the audit log page, THE Admin_Panel SHALL display only entries scoped to their tenant with entity type limited to Tagihan and Pembayaran, and SHALL hide the tenant filter control
5. IF no Audit_Log entries match the current filter criteria, THEN THE Admin_Panel SHALL display an empty state message indicating no entries were found and suggesting the user adjust filter criteria

### Requirement 7: Table Pagination Standard

**User Story:** As any user viewing data tables in the Admin Panel, I want traditional page-number pagination instead of "load more" buttons, so that I can navigate data predictably and know how many pages of data exist.

#### Acceptance Criteria

1. WHEN any data table in the Admin_Panel displays paginated data, THE Admin_Panel SHALL use offset-based pagination with numbered page controls (e.g., 1, 2, 3... N) instead of cursor-based "load more" or infinite scroll patterns
2. THE Admin_Panel SHALL display the total record count and total page count alongside the pagination controls for every paginated table
3. THE Admin_Panel SHALL allow direct navigation to any page number via the pagination controls (first, previous, next, last, and specific page number)
4. THE API_Gateway SHALL support offset-based pagination parameters (page number and page size) on all list endpoints and return total count metadata in the response

### Requirement 8: Superadmin Cross-Tenant User Management

**User Story:** As the Superadmin, I want to manage users across all tenants, so that I can assist with account issues, reset passwords, and adjust role assignments.

#### Acceptance Criteria

1. WHEN the Superadmin requests the user list without a Tenant_Context, THE API_Gateway SHALL return users from all tenants with tenant name included in each record, using offset-based pagination with a default page size of 50 records per page and total count in the response
2. WHEN the Superadmin updates a user's role, THE API_Gateway SHALL persist the change and write an Audit_Log entry with before and after role values, restricting assignable roles to ADMIN, KEPALA_SEKOLAH, GURU, BENDAHARA, and ORANG_TUA only
3. IF the Superadmin attempts to assign the SUPER_ADMIN role or change a user's role to one not in the allowed set, THEN THE API_Gateway SHALL reject the request with an error message indicating the role is not assignable
4. WHEN the Superadmin deactivates a user, THE API_Gateway SHALL invalidate the user's active sessions within 5 seconds by removing all stored refresh tokens, prevent further login for that user, and write an Audit_Log entry
5. IF the Superadmin deactivates a user that is already inactive, THEN THE API_Gateway SHALL reject the request with an error message indicating the user is already deactivated
6. WHEN the Superadmin resets a user's password, THE API_Gateway SHALL generate a temporary password of at least 12 characters, mark the user's account as must_change_password, send the temporary password via email, and write an Audit_Log entry without storing the password value in the log
7. WHEN the Superadmin searches users by providing a search term of at least 3 characters, THE API_Gateway SHALL return matching users by email, name, or phone across all tenants, with a default page size of 50 results per page using offset-based pagination with total count in the response
8. IF the Superadmin attempts to update, deactivate, or reset the password of a user that does not exist, THEN THE API_Gateway SHALL return an error message indicating the user was not found, without affecting any other operations in the same session or batch
