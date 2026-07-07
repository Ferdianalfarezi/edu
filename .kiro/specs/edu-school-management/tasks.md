# Implementation Plan: Edu School Management System

## Overview

Multi-tenant school management system built with NestJS (TypeScript) backend, PostgreSQL with Drizzle ORM, Vue.js admin panel, and Flutter mobile app. Implementation proceeds from infrastructure scaffolding through core modules, then domain-specific features, culminating in frontend clients and deployment.

## Tasks

- [x] 1. Project scaffolding and infrastructure setup
  - [x] 1.1 Initialize monorepo with pnpm workspaces and NestJS backend
    - Create monorepo root: `pnpm-workspace.yaml` with `apps/*` and `packages/*`
    - Root `package.json` with `"private": true`, shared dev dependencies (ESLint, Prettier, TypeScript config)
    - Create folder structure: `apps/api/`, `apps/admin/`, `apps/mobile/`, `packages/shared/`
    - Initialize NestJS project in `apps/api/` with `src/common/`, `src/modules/`, `src/jobs/`, `src/drizzle/` structure
    - Configure TypeScript, ESLint, Prettier for `apps/api/`
    - Install and configure dependencies in `apps/api/`: `@nestjs/config`, `drizzle-orm`, `drizzle-kit`, `pg`, `@nestjs/bull`, `bull`, `ioredis`, `bcrypt`, `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `class-validator`, `class-transformer`, `sharp`, `@aws-sdk/client-s3`, `firebase-admin`, `fast-check`, `@nestjs/schedule`, `@nestjs/throttler`
    - Set up environment variable handling (`.env.example`, validation schema) in `apps/api/`
    - Configure global API prefix with versioning: `app.setGlobalPrefix('api/v1')` per [ADR-004](../../docs/adr/ADR-004-api-versioning.md)
    - Create `packages/shared/` with shared TypeScript types (roles, status enums, API interfaces)
    - _Requirements: 23.3, 23.4_

  - [x] 1.2 Configure Drizzle ORM and database connection
    - Set up Drizzle config (`drizzle.config.ts`) with PostgreSQL driver in `apps/api/`
    - Create database connection module with connection pooling (max: 20, min: 5, idle timeout: 30s)
    - Configure migration scripts in `apps/api/package.json`
    - Create separate DB roles: superuser for migrations (bypasses RLS), app role with RLS enforced
    - _Requirements: 23.3_

  - [x] 1.3 Set up Redis connection and Bull queue infrastructure
    - Configure Redis module for cache, token blacklist, and job queues
    - Define Bull queues: `notification`, `image`, `import`, `export`, `email`, `cron`
    - Create base job processor class with error handling and retry logic
    - _Requirements: 6.7, 11.15_

  - [x] 1.4 Configure Cloudflare R2 (S3-compatible) storage service
    - Create `StorageService` with upload, download, delete, presigned-URL methods
    - Configure bucket paths: `bukti-transfer/`, `rpp/`, `exports/`
    - _Requirements: 11.4, 11.15, 41.1_

  - [x] 1.5 Set up testing infrastructure
    - Configure Jest with TypeScript, path aliases
    - Install and configure `fast-check` for property-based tests
    - Create test database setup/teardown helpers
    - Create shared test fixtures and factories (arbitrary generators for PBT)
    - _Requirements: (testing infrastructure)_

- [x] 2. Database schema and migrations
  - [x] 2.1 Create core Drizzle schema definitions (tenant, user, tahun_ajaran, kelas, siswa, mata_pelajaran)
    - Define all tables with proper types, constraints, and relations
    - Include `tenant_id` on every entity table for multi-tenant isolation
    - Define unique indexes (NISN per tenant, email per tenant)
    - _Requirements: 16.1, 16.4, 17.1, 17.2, 18.1, 18.2, 23.3, 31.1, 31.2_

  - [x] 2.2 Create jadwal, absensi, and attendance audit schema
    - Define `jadwal_pelajaran`, `guru_pengganti`, `absensi`, `absensi_audit` tables
    - Include constraints: status enum, unique(siswa_id, tanggal), semester check
    - _Requirements: 1.2, 1.8, 2.5, 2.6, 27.1, 28.1_

  - [x] 2.3 Create billing schema (tagihan, tagihan_transaksi, audit_trail)
    - Define `tagihan`, `tagihan_transaksi`, `audit_trail` tables
    - Include status checks, unique constraints, immutability on audit_trail
    - _Requirements: 9.2, 9.4, 13.5, 14.4, 29.1, 29.2_

  - [x] 2.4 Create notification schema (notifikasi, notifikasi_preferensi, device_token)
    - Define tables with status, retry_count, preference defaults
    - _Requirements: 6.5, 7.2, 7.3, 25.2_

  - [x] 2.5 Create rapor schema (komponen_penilaian, rapor, rapor_nilai)
    - Define tables with period enum, status constraints, JSONB for komponen_nilai
    - _Requirements: 36.1, 36.4, 37.5_

  - [x] 2.6 Create RPP schema (kategori_rpp, rpp, rpp_favorit)
    - Define tables with konten_type enum, status, unique constraints
    - _Requirements: 41.4, 41.8, 44.4_

  - [x] 2.7 Create configuration and utility schema (konfigurasi_sekolah, hari_libur, riwayat_kelas)
    - Define key-value config store, holiday calendar, class history
    - _Requirements: 22.1, 22.5, 30.5_

  - [x] 2.8 Create indexes for query performance
    - Add all indexes from design: tenant-scoped composite indexes for absensi, tagihan, notifikasi, jadwal, rapor_nilai, rpp, audit_trail
    - _Requirements: 35.1_

  - [x] 2.9 Enable PostgreSQL Row-Level Security (RLS) on all tenant-scoped tables
    - Enable RLS on all tables with `tenant_id` column (siswa, absensi, tagihan, kelas, etc.)
    - Create tenant isolation policy: `USING (tenant_id = current_setting('app.tenant_id')::uuid)`
    - Create cross-tenant parent policy using `app.tenant_ids` for orang_tua sessions
    - Ensure app role has RLS enforced, migration superuser bypasses RLS
    - Per [ADR-001](../../docs/adr/ADR-001-postgresql-rls-tenant-isolation.md)
    - _Requirements: 23.1, 23.2, 23.3_

  - [x] 2.10 Generate and run initial Drizzle migration
    - Run `drizzle-kit generate` to produce migration SQL (including RLS policies)
    - Verify migration applies cleanly on fresh database
    - Create seed script for development data (sample tenant, users, classes)
    - _Requirements: (infrastructure)_

- [x] 3. Checkpoint - Ensure schema and infrastructure setup are working
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Authentication module (JWT, roles, multi-tenant)
  - [x] 4.1 Implement JWT authentication strategy and guards
    - Create `JwtStrategy` with payload extraction (sub, role, tenant_id, tenants, platform)
    - Create `JwtAuthGuard` that checks Redis token blacklist
    - Create `RolesGuard` with `@Roles()` decorator
    - Create `TenantGuard` for cross-tenant parent access validation
    - _Requirements: 18.3, 18.4, 19.7, 19.8, 23.1, 23.2_

  - [x] 4.2 Implement login endpoints (staff email+password, parent phone-only)
    - `POST /auth/login` — branch on platform and credential type
    - Staff login: validate email+password, return JWT (24h admin_panel, 90d mobile guru)
    - Parent login: validate phone exists, return JWT (1 year), include cross-tenant tenants[]
    - Parent user model: single user record with `tenant_id = NULL`, resolve tenants from siswa records per [ADR-002](../../docs/adr/ADR-002-parent-user-model.md)
    - Implement account lockout after 5 failed attempts (15 min)
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.10, 19.11_

  - [x] 4.3 Implement rate limiting for authentication endpoints
    - Phone login: max 5 attempts per phone number per hour (Redis sliding window)
    - Anti-enumeration: after limit hit, return same 429 response regardless of phone existence
    - General API: 100 req/min per user, 30 req/min per IP for unauthenticated
    - File uploads: 10 req/5min per user; billing generation: 2 req/min per tenant
    - Fail-open strategy if Redis unreachable
    - Per [ADR-005](../../docs/adr/ADR-005-rate-limiting.md)
    - _Requirements: 19.5_

  - [x] 4.4 Implement token refresh and invalidation
    - `POST /auth/refresh` — validate refresh token, issue new pair
    - Token blacklist: store JTI in Redis with TTL = remaining lifetime
    - Invalidate all tokens on password change, deactivation, tenant disable
    - _Requirements: 19.8, 20.4, 20.9, 24.4_

  - [x] 4.5 Implement password reset flow
    - `POST /auth/reset-password/request` — send email with 30-min token
    - `POST /auth/reset-password/confirm` — validate token, set new password, invalidate all tokens
    - `POST /auth/change-password` — require old password, invalidate other sessions
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9_

  - [x] 4.6 Implement TenantInterceptor for automatic tenant_id injection
    - Auto-inject `tenant_id` filter on all Drizzle queries for non-super_admin users
    - Auto-set `tenant_id` on all INSERT operations
    - Set PostgreSQL session variable `SET LOCAL app.tenant_id` per request for RLS enforcement per [ADR-001](../../docs/adr/ADR-001-postgresql-rls-tenant-isolation.md)
    - For orang_tua sessions: set `app.tenant_ids` (plural) with accessible tenant list
    - Validate orang_tua cross-tenant access against JWT `tenants[]`
    - _Requirements: 23.1, 23.2, 23.4, 23.5_

  - [x] 4.7 Write property test for multi-tenant data isolation (Property 1)
    - **Property 1: Multi-Tenant Data Isolation**
    - **Validates: Requirements 23.1, 23.2, 23.3, 23.4**

  - [x] 4.8 Write unit tests for auth module
    - Test login flows, lockout logic, token generation, refresh, blacklisting
    - Test cross-tenant parent resolution
    - _Requirements: 19.1–19.11_

- [x] 5. Core admin module (tenant, user, siswa, kelas, tahun ajaran, mata pelajaran)
  - [x] 5.1 Implement Tenant management (Super Admin)
    - `POST /tenants` — create tenant + default admin user, send credentials email
    - `PATCH /tenants/:id/deactivate` — deactivate, blacklist all tokens
    - `GET /tenants` — list all tenants with stats
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6_

  - [x] 5.2 Implement User management module
    - CRUD for users within tenant (admin-scoped)
    - `POST /users/bulk-import` — CSV upload for guru bulk creation
    - Generate random passwords, send via email, flag `must_change_password`
    - Validate email uniqueness per tenant, handle conflicts
    - _Requirements: 18.2, 18.5, 18.6, 18.7, 18.8, 18.9, 18.10_

  - [x] 5.3 Implement Siswa (student) management module
    - CRUD: create with parent linkage, update, soft-delete (pindah_sekolah/keluar)
    - Parent user model per [ADR-002](../../docs/adr/ADR-002-parent-user-model.md): on siswa creation, check if parent phone already exists globally as orang_tua user; if yes, link to existing user; if no, create new user with `tenant_id = NULL`
    - NISN uniqueness validation per tenant (active students only)
    - Bulk import via CSV (siswa + orang_tua phone linkage with global deduplication)
    - Parent access revocation when all children leave
    - Search by name/NISN, filter by kelas/status/tahun_ajaran
    - _Requirements: 16.1–16.13, 21.1–21.12_

  - [x] 5.4 Implement Kelas (class) management module
    - CRUD: create with tahun_ajaran linkage, assign wali_kelas
    - Validate wali_kelas uniqueness (one guru = one class)
    - Prevent deletion if class has active students
    - Auto-duplicate structure on new tahun_ajaran creation
    - _Requirements: 17.1, 17.4, 17.5, 17.11, 17.12, 17.13, 17.14, 17.15_

  - [x] 5.5 Implement Tahun Ajaran (academic year) lifecycle
    - CRUD: create with status `disiapkan`, activate (deactivate previous), view historical
    - Ensure single active per tenant constraint
    - Read-only access to historical tahun_ajaran data
    - _Requirements: 17.2, 17.3, 17.6, 17.7, 17.8, 17.9, 17.10_

  - [x] 5.6 Write property test for single active tahun ajaran (Property 23)
    - **Property 23: Single Active Tahun Ajaran Per Tenant**
    - **Validates: Requirements 17.7, 17.8**

  - [x] 5.7 Implement Mata Pelajaran (subject) management
    - CRUD: create per tenant, validate before delete (check active jadwal)
    - _Requirements: 31.1–31.5_

  - [x] 5.8 Implement Konfigurasi Sekolah (school configuration)
    - Key-value config store per tenant (threshold alpa, nominal SPP per tingkat, jatuh tempo, logo)
    - Hari libur calendar management
    - Apply defaults when config not set
    - _Requirements: 22.1–22.5_

  - [x] 5.9 Implement Guru deactivation with jadwal cleanup
    - Deactivate user, invalidate tokens, remove from all active jadwal
    - Mark affected jadwal slots as `vacant`, remove wali_kelas assignment
    - Return list of vacant slots needing replacement
    - _Requirements: 32.1–32.9_

- [x] 6. Checkpoint - Ensure core admin module works correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Jadwal pelajaran and guru pengganti
  - [x] 7.1 Implement Jadwal Pelajaran CRUD
    - Create/update/delete schedule entries (kelas, hari, jam, mapel, guru, semester, validity dates)
    - No conflict validation (guru can teach multiple classes at same time per requirement)
    - Track changes with timestamp and admin_id
    - Require new jadwal creation on semester change
    - Historical jadwal preservation
    - _Requirements: 27.1–27.10_

  - [x] 7.2 Implement Guru Pengganti (substitute teacher) assignment
    - `POST /jadwal/guru-pengganti` — assign substitute for class+date
    - Auto-grant attendance input access for that date only
    - Auto-revoke access after date passes
    - Restrict substitute to input-only (no edit of historical)
    - _Requirements: 28.1–28.4_

  - [x] 7.3 Implement "Lihat Jadwal Mengajar" for guru
    - `GET /jadwal/saya` — return today's schedule (default) with day filter
    - Show slot info: kelas, mapel, jam_mulai, jam_selesai
    - Indicate slots with active guru_pengganti assigned
    - _Requirements: 33.1–33.4_

  - [x] 7.4 Write unit tests for jadwal authorization logic
    - Test guru assignment validation, substitute access, historical access prevention
    - _Requirements: 27.4, 28.2, 28.3, 28.4_

- [x] 8. Absensi (attendance) module
  - [x] 8.1 Implement attendance input (create) endpoint
    - `POST /absensi/kelas/:kelasId` — validate all students covered, guru authorized via jadwal/pengganti
    - `GET /absensi/kelas-hari-ini` — return guru's scheduled classes for today
    - Use batch INSERT for all students in one DB round-trip (not 30 individual inserts)
    - Enforce one record per student per day (ON CONFLICT DO NOTHING), first-guru creates daily record
    - Handle hari libur warning (allow but warn)
    - Emit ONE batch notification job per class to Bull queue (not per student) with 0-5s random jitter
    - _Requirements: 1.1–1.14_

  - [x] 8.2 Write property test for attendance authorization (Property 2)
    - **Property 2: Attendance Authorization Enforcement**
    - **Validates: Requirements 1.7, 2.1, 2.2, 2.3, 2.4, 3.3**

  - [x] 8.3 Write property test for attendance completeness (Property 3)
    - **Property 3: Attendance Completeness Validation**
    - **Validates: Requirements 1.4, 1.5**

  - [x] 8.4 Write property test for attendance uniqueness (Property 4)
    - **Property 4: Attendance Uniqueness Per Student Per Day**
    - **Validates: Requirements 1.8**

  - [x] 8.5 Implement attendance edit endpoint
    - `PATCH /absensi/:absensiId` — validate guru authorized (jadwal current or past) or kepala_sekolah
    - Block admin from editing attendance
    - Write audit log entry (user_id, role, before/after status, timestamp)
    - _Requirements: 2.1–2.6_

  - [x] 8.6 Implement attendance view (guru: all classes read-only, kepala_sekolah dashboard)
    - `GET /absensi/kelas/:kelasId/tanggal/:tanggal` — return data, read-only for non-assigned guru
    - `GET /absensi/dashboard` — kepala_sekolah: today's summary per class, alpa alert list
    - _Requirements: 3.1–3.3, 5.1–5.3_

  - [x] 8.7 Write property test for alpa threshold alerting (Property 7)
    - **Property 7: Alpa Threshold Alerting**
    - **Validates: Requirements 5.3**

  - [x] 8.8 Implement rekap absensi (monthly/semester recap)
    - `GET /absensi/rekap` — calculate per-student counts (hadir, izin, sakit, alpa)
    - Calculate attendance percentage: hadir / total_hari_efektif × 100
    - Support manual hari_efektif override, auto-calculate from school days minus holidays
    - Handle missing hari_efektif gracefully
    - _Requirements: 4.1–4.7_

  - [x] 8.9 Write property test for attendance percentage calculation (Property 5)
    - **Property 5: Attendance Percentage Calculation**
    - **Validates: Requirements 1.14, 4.3, 4.5, 4.6**

  - [x] 8.10 Write property test for attendance aggregation (Property 6)
    - **Property 6: Attendance Aggregation Correctness**
    - **Validates: Requirements 4.1, 4.2, 5.1, 5.2, 8.2**

  - [x] 8.11 Implement attendance view for orang_tua (mobile API)
    - `GET /absensi/anak/:siswaId` — calendar view with color-coded status per month
    - Summary totals for current month, allow month selection
    - Separate view per child for multi-child parents
    - _Requirements: 8.1–8.4_

  - [x] 8.12 Implement offline sync endpoint
    - `POST /absensi/sync` — accept batch records from mobile with `event_timestamp` (when teacher pressed save, not sync time)
    - Conflict resolution per [ADR-003](../../docs/adr/ADR-003-offline-sync-conflict-resolution.md):
      - Rule 1: Kepala_Sekolah edits always win (authority override)
      - Rule 2: Server edited after client event-time → server wins
      - Rule 3: Client event-time newer → client wins
    - Clock skew protection: reject records with event_timestamp > server_now + 5 minutes
    - Return sync result: synced IDs, conflict resolutions with winner/reason/server_value
    - _Requirements: 26.1–26.6_

  - [x] 8.13 Write property test for offline sync conflict resolution (Property 15)
    - **Property 15: Offline Sync Conflict Resolution (Event-Time with Authority Override)**
    - Test authority override: Kepala_Sekolah edits never overridden by offline sync
    - Test event-time ordering: correct winner based on actual event timestamps
    - Test clock skew rejection: future timestamps rejected
    - **Validates: Requirements 26.3**

  - [x] 8.14 Implement rekap absensi export
    - `GET /absensi/rekap/export` — generate downloadable report file
    - Enqueue export job to Bull queue for large datasets
    - _Requirements: 4.4_

- [x] 9. Checkpoint - Ensure attendance module works correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Notification system (FCM, preferences, history)
  - [x] 10.1 Implement FCM integration service
    - Initialize Firebase Admin SDK
    - `sendBatch(messages[])` method using `messaging.sendEach()` for multicast (up to 500 tokens per call)
    - Handle stale token cleanup (deactivate device_token on `messaging/registration-token-not-registered`)
    - Partial failure handling: only failed tokens are retried, not entire batch
    - _Requirements: 6.1, 6.7_

  - [x] 10.2 Implement notification Bull queue processor
    - `BatchAttendanceNotificationProcessor` — process ONE job per class (batch approach)
      - Batch resolve students + parents + preferences in 2-3 DB queries (not N individual queries)
      - Filter by preferences, build notification list
      - Send via FCM `sendEach` in chunks of 500 tokens (multicast)
      - Batch INSERT notification records into DB
      - Handle stale token deactivation from FCM response
    - `NotificationProcessor` — for non-attendance events (tagihan, payment, rapor)
    - Retry logic: max 3 retries, 60s interval, mark as `gagal` after exhaustion
    - Target: < 30s delivery for online attendance events (0-5s jitter + <1s processing)
    - Queue concurrency: 10 for batch-attendance, 5 for other notifications
    - _Requirements: 6.1, 6.2, 6.3, 6.7_

  - [x] 10.3 Write property test for notification preference filtering (Property 12)
    - **Property 12: Notification Preference Filtering**
    - **Validates: Requirements 6.1, 6.4, 6.5, 25.1, 25.2, 25.3**

  - [x] 10.4 Write property test for per-child notification separation (Property 13)
    - **Property 13: Per-Child Notification Separation**
    - **Validates: Requirements 6.6, 6.8**

  - [x] 10.5 Implement notification preferences API
    - `GET /notifikasi/preferensi` — return per-child toggle states
    - `PATCH /notifikasi/preferensi` — update kehadiran_enabled, ketidakhadiran_enabled per child
    - Default: ketidakhadiran ON, kehadiran OFF
    - _Requirements: 25.1–25.4_

  - [x] 10.6 Implement notification history API
    - `GET /notifikasi/riwayat` — cursor-paginated list, newest first
    - Include delivery status (terkirim/gagal) per notification
    - Retain history for at least 1 active tahun_ajaran
    - _Requirements: 7.1–7.3_

  - [x] 10.7 Write property test for notification history ordering (Property 14)
    - **Property 14: Notification History Ordering**
    - **Validates: Requirements 7.1**

  - [x] 10.8 Implement device token registration
    - `POST /device-tokens` — register FCM token with platform (android/ios)
    - `DELETE /device-tokens/:tokenId` — deactivate on logout
    - _Requirements: 6.1_

- [x] 11. Billing/tagihan module
  - [x] 11.1 Implement tagihan generation (per-month and per-tahun_ajaran)
    - `POST /tagihan/generate` — create tagihan for active students per class config nominal
    - Use `INSERT ... ON CONFLICT DO NOTHING` for idempotent generation per [ADR-007](../../docs/adr/ADR-007-billing-idempotency.md)
    - Redis distributed lock to prevent concurrent generation: `billing-gen:{tenantId}:{tahunAjaranId}` with 5min TTL
    - Process in chunks of 100 students per transaction to avoid timeout
    - Return summary (created, skipped, total nominal)
    - Auto-generate tagihan for new students (from bulan berjalan to end of tahun_ajaran)
    - Send notification to parents for new tagihan
    - _Requirements: 9.1–9.7, 10.1–10.5_

  - [x] 11.2 Write property test for billing generation idempotency (Property 8)
    - **Property 8: Billing Generation Idempotency and Correctness**
    - **Validates: Requirements 9.1, 9.2, 9.3, 10.1, 10.2, 10.3, 10.4**

  - [x] 11.3 Write property test for new student billing range (Property 11)
    - **Property 11: New Student Billing Range**
    - **Validates: Requirements 9.5, 9.6, 9.7**

  - [x] 11.4 Implement bukti transfer upload by orang_tua
    - `POST /tagihan/:id/upload-bukti` — multipart upload with nominal_bayar
    - Validate: file format (JPG/JPEG/PNG), max 5MB, nominal ≥ 10000, nominal ≤ sisa
    - Enforce max 2 cicilan via upload; second must equal remaining balance
    - Block upload if status is menunggu_verifikasi
    - Compress to WebP via Bull job, store in R2
    - Change status to menunggu_verifikasi
    - _Requirements: 11.1–11.17_

  - [x] 11.5 Implement payment verification by bendahara
    - `PATCH /tagihan/:id/verify` — approve (→ lunas or cicilan) or reject (→ ditolak + alasan)
    - `GET /tagihan/verifikasi` — list pending verifications with bukti preview
    - Send notification on approve or reject
    - _Requirements: 12.1–12.8_

  - [x] 11.6 Implement manual payment recording by bendahara
    - `POST /tagihan/:id/manual-payment` — record tunai/transfer_manual payment
    - Auto-transition to lunas when total_dibayar reaches nominal
    - No limit on cicilan count for manual (more flexible than upload)
    - Validate amount ≤ sisa
    - Generate nomor_referensi unik
    - _Requirements: 13.1–13.7_

  - [x] 11.7 Write property test for billing state machine (Property 9)
    - **Property 9: Billing State Machine Transitions**
    - **Validates: Requirements 11.1, 11.4, 11.8, 12.2, 12.3, 12.4, 12.6, 13.1, 13.2, 13.4, 34.5**

  - [x] 11.8 Write property test for payment amount validation (Property 10)
    - **Property 10: Payment Amount Validation**
    - **Validates: Requirements 11.9, 11.10, 11.13, 11.14, 13.7**

  - [x] 11.9 Implement tagihan management (edit, delete, cancel) by bendahara
    - `DELETE /tagihan/:id` — only if status belum_bayar
    - `PATCH /tagihan/:id` — edit nominal only if belum_bayar
    - `PATCH /tagihan/:id/cancel` — cancel with alasan only if belum_bayar
    - Record all actions in audit trail
    - _Requirements: 34.1–34.7_

  - [x] 11.10 Write property test for billing mutation restrictions (Property 16)
    - **Property 16: Billing Mutation Restrictions**
    - **Validates: Requirements 34.1, 34.2, 34.3, 34.4, 34.5, 34.6**

  - [x] 11.11 Implement payment history and receipt for orang_tua
    - `GET /tagihan/siswa/:siswaId` — all tagihan with status, per child
    - `GET /tagihan/:id/bukti-bayar` — generate PDF receipt with nomor_referensi
    - Separate view per child for multi-child parents
    - _Requirements: 14.1–14.6_

  - [x] 11.12 Write property test for payment reference uniqueness (Property 18)
    - **Property 18: Payment Reference Uniqueness**
    - **Validates: Requirements 14.4**

  - [x] 11.13 Implement tunggakan dashboard and export for bendahara
    - `GET /tagihan/tunggakan` — list belum_bayar/cicilan, sorted by jatuh_tempo oldest first
    - Filter by kelas, include pindah_sekolah/keluar students
    - `GET /tagihan/export` — Excel/CSV export via Bull job
    - _Requirements: 15.1–15.8_

  - [x] 11.14 Implement audit trail for billing
    - Record all billing actions in append-only audit_trail table
    - `GET /audit-trail` — list for bendahara/admin (edit), kepala_sekolah (read-only)
    - Cursor-paginated, newest first
    - _Requirements: 29.1–29.5_

  - [x] 11.15 Write property test for audit trail immutability (Property 17)
    - **Property 17: Audit Trail Immutability**
    - **Validates: Requirements 29.1, 29.2**

- [x] 12. Checkpoint - Ensure billing module works correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Rapor (grades) module
  - [x] 13.1 Implement komponen penilaian configuration
    - CRUD for assessment components per tenant (angka/huruf/deskripsi, skala, wajib/opsional)
    - Provide Kurikulum Merdeka default template
    - Optional P5 field configuration
    - _Requirements: 36.1–36.6_

  - [x] 13.2 Implement input nilai (grade input) by guru
    - `GET /rapor/mata-pelajaran` — guru's assigned subjects from jadwal
    - `GET /rapor/kelas/:kelasId/mapel/:mapelId/periode/:periodeId` — student list with components
    - `POST /rapor/nilai` — save grades (draft or submitted), validate skala, partial save allowed
    - Enforce UTS: angka only required; Semester: angka + deskripsi required
    - Restrict to guru's assigned mapel via jadwal
    - Admin Panel only (not mobile)
    - _Requirements: 37.1–37.10_

  - [x] 13.3 Implement rapor finalization by wali kelas
    - `POST /rapor/kelas/:kelasId/periode/:periodeId/finalize` — validate all mapel submitted, calculate rankings
    - `POST /rapor/kelas/:kelasId/periode/:periodeId/revert` — revert to draft, hide from parents
    - P5 deskripsi and catatan wali kelas input
    - Block guru edits after finalization
    - Send notification to parents on finalize
    - _Requirements: 38.1–38.12_

  - [x] 13.4 Write property test for rapor finalization guard (Property 20)
    - **Property 20: Rapor Finalization Guard**
    - **Validates: Requirements 38.1, 38.2, 38.3**

  - [x] 13.5 Write property test for rapor visibility control (Property 19)
    - **Property 19: Rapor Visibility Control**
    - **Validates: Requirements 38.7, 39.1, 39.2**

  - [x] 13.6 Implement rapor view for orang_tua (mobile API)
    - `GET /rapor/siswa/:siswaId` — only show final rapor periods
    - Display: nilai per mapel, capaian, P5, catatan wali, peringkat, rata-rata
    - Separate per child
    - _Requirements: 39.1–39.5_

  - [x] 13.7 Implement rapor view for kepala_sekolah (read-only all classes)
    - Show all rapor (draft + final) with status indicator
    - Filter by kelas, periode, tahun_ajaran
    - _Requirements: 38.11, 38.12_

  - [x] 13.8 Implement rapor export by admin
    - `GET /rapor/export` — Excel export per kelas per periode (final only)
    - Include: nama, NISN, all komponen, rata-rata, peringkat
    - Enqueue to export Bull job
    - _Requirements: 40.1–40.4_

- [x] 14. RPP / Modul Ajar module
  - [x] 14.1 Implement RPP CRUD (create, edit, delete)
    - `POST /rpp` — richtext or file upload (PDF/DOC/DOCX/PPT/PPTX, max 10MB)
    - Required metadata: judul, mata_pelajaran_id, kategori (auto-create if new), tahun_terbit
    - Save as draft or published; track tanggal_publish
    - Only creator can edit/delete; published→draft hides from others
    - On delete: remove file from R2, remove all favorit references
    - _Requirements: 41.1–41.11, 42.1–42.6_

  - [x] 14.2 Write property test for RPP ownership enforcement (Property 21)
    - **Property 21: RPP Ownership Enforcement**
    - **Validates: Requirements 42.1, 42.4**

  - [x] 14.3 Implement RPP portal (search, filter, view, download)
    - `GET /rpp` — cursor-paginated list of published RPP in same tenant, sorted by tanggal_publish desc
    - Filters: kategori, mapel, tahun_terbit; text search by judul
    - `GET /rpp/:id` — full detail view
    - `GET /rpp/:id/download` — presigned URL (5min expiry) for file, or PDF generation for richtext
    - Accessible by guru, kepala_sekolah, admin
    - _Requirements: 43.1–43.7_

  - [x] 14.4 Write property test for RPP portal visibility (Property 22)
    - **Property 22: RPP Portal Visibility**
    - **Validates: Requirements 41.6, 41.11, 43.1**

  - [x] 14.5 Implement RPP favorit (toggle, list)
    - `POST /rpp/:id/favorite` — toggle favorit for logged-in guru
    - `GET /rpp/favorit` — list my favorites (hide if source RPP reverted to draft)
    - _Requirements: 44.1–44.5_

- [x] 15. Kenaikan kelas and tahun ajaran lifecycle
  - [x] 15.1 Implement kenaikan kelas massal (mass promotion)
    - `GET /kenaikan-kelas/kelas/:kelasId` — list active students, suggest target class (tingkat+1)
    - `POST /kenaikan-kelas` — promote selected students to target class in new tahun_ajaran
    - Exclude specific students (tinggal kelas), allow manual reassignment
    - Handle highest grade: mark as lulus/alumni
    - Validate tahun_ajaran baru exists and has target classes
    - Record riwayat_kelas for each promoted student
    - Wrap in DB transaction
    - Return summary: promoted count, excluded count, target class
    - Preserve unpaid tagihan across tahun_ajaran
    - _Requirements: 30.1–30.10_

- [x] 16. Cursor-based pagination utility
  - [x] 16.1 Implement shared cursor-based pagination helper
    - Create `PaginationService` with cursor encode/decode, consistent page size (default 20)
    - Apply to all list endpoints: siswa, notifikasi, tagihan, tunggakan, audit, verifikasi, rpp
    - Provide next/previous navigation info in response
    - _Requirements: 35.1–35.3_

  - [x] 16.2 Write property test for cursor pagination completeness (Property 24)
    - **Property 24: Cursor-Based Pagination Completeness**
    - **Validates: Requirements 35.1, 35.2, 35.3**

- [x] 17. Checkpoint - Ensure all backend modules work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Background jobs and scheduled tasks
  - [x] 18.1 Implement image compression processor (Bukti Transfer)
    - Sharp: compress + convert to WebP (quality 80, max 1920px)
    - Upload compressed image to R2
    - Update tagihan_transaksi with file URL
    - _Requirements: 11.15_

  - [x] 18.2 Implement CSV import processor (bulk guru/siswa)
    - Parse CSV, validate columns, process row by row
    - Collect errors per row, return summary (successes + failures)
    - Never fail entire batch on single row error
    - _Requirements: 18.6, 21.1_

  - [x] 18.3 Implement export processor (reports, rapor, tunggakan)
    - Generate Excel/CSV files for export requests
    - Store in R2 exports bucket, return download URL
    - _Requirements: 4.4, 15.6, 15.7, 40.1_

  - [x] 18.4 Implement email processor (password reset, credential delivery)
    - Send SMTP emails for: password reset link, new user credentials, password change confirmation
    - _Requirements: 18.8, 20.1, 20.5_

  - [x] 18.5 Implement scheduled file cleanup (cron)
    - Daily 2 AM: delete bukti_transfer files > 3 years old from R2, preserve metadata
    - Daily 3 AM: cleanup expired Redis blacklist entries (safety redundancy)
    - _Requirements: 11.16, 11.17_

- [x] 19. Vue.js admin panel
  - [x] 19.1 Initialize Vue.js SPA project with Vite
    - Create project in `apps/admin/` with Vue 3 + TypeScript + Vite
    - Configure router (vue-router), state (Pinia), HTTP client (axios with JWT interceptor)
    - Import shared types from `packages/shared/`
    - Set up auto-refresh token on 401
    - Implement role-based route guards
    - _Requirements: 18.3, 19.1_

  - [x] 19.2 Implement login, password reset, and force-change-password pages
    - Login form (email + password)
    - Reset password request and confirm pages
    - Force change password modal on first login
    - _Requirements: 19.1, 19.4, 18.9, 20.1–20.8_

  - [x] 19.3 Implement dashboard pages (per role)
    - Kepala sekolah: absensi dashboard (today's summary, alpa alerts)
    - Bendahara: tunggakan dashboard (total, list)
    - Admin: tenant stats, user count
    - _Requirements: 5.1–5.3, 15.1–15.4_

  - [x] 19.4 Implement siswa management pages (list, create, edit, import, soft-delete)
    - CRUD forms with validation
    - CSV bulk import with conflict resolution UI
    - Search and filter (kelas, status, tahun_ajaran)
    - _Requirements: 16.1–16.13, 21.1–21.12_

  - [x] 19.5 Implement kelas and tahun ajaran management pages
    - Kelas CRUD, wali_kelas assignment
    - Tahun ajaran lifecycle (create, activate, view historical)
    - Kenaikan kelas wizard (select source/target, exclude students)
    - _Requirements: 17.1–17.15, 30.1–30.10_

  - [x] 19.6 Implement jadwal pelajaran management pages
    - Schedule grid view per kelas per hari
    - CRUD for schedule entries
    - Guru pengganti assignment modal
    - Vacant slot highlighting
    - _Requirements: 27.1–27.10, 28.1–28.4, 32.4–32.6_

  - [x] 19.7 Implement absensi pages (input, edit, view, rekap, export)
    - Input page: student list with status selection, validation
    - Edit page: with audit log display
    - Rekap page: monthly/semester with percentage calculation
    - Dashboard page for kepala_sekolah
    - Export button
    - _Requirements: 1.1–1.14, 2.1–2.6, 3.1–3.3, 4.1–4.7, 5.1–5.3_

  - [x] 19.8 Implement tagihan/billing pages
    - Generate tagihan (per-month, per-year)
    - Verification queue with bukti preview
    - Manual payment recording form
    - Tunggakan dashboard with filters
    - Edit/delete/cancel tagihan
    - Export reports
    - Audit trail viewer
    - _Requirements: 9.1–9.7, 10.1–10.5, 12.1–12.8, 13.1–13.7, 15.1–15.8, 34.1–34.7, 29.3–29.5_

  - [x] 19.9 Implement rapor pages (config, input nilai, finalization, export)
    - Komponen penilaian config for admin
    - Input nilai page for guru (per mapel, per kelas, per periode)
    - Finalization page for wali_kelas (status overview, P5, catatan, ranking)
    - Read-only view for kepala_sekolah (all classes, filter)
    - Export button
    - _Requirements: 36.1–36.6, 37.1–37.10, 38.1–38.12, 40.1–40.4_

  - [x] 19.10 Implement RPP pages (create, edit, portal, favorites)
    - Rich text editor (bold, italic, heading, bullet, table, image)
    - File upload with format/size validation
    - Portal: search, filter, view, download
    - Favorites toggle and list
    - _Requirements: 41.1–41.11, 42.1–42.6, 43.1–43.7, 44.1–44.5_

  - [x] 19.11 Implement user management and configuration pages
    - User CRUD, bulk import guru (CSV)
    - Mata pelajaran management
    - Konfigurasi sekolah (threshold, nominal SPP, hari libur)
    - Super admin: tenant management
    - _Requirements: 18.1–18.10, 22.1–22.5, 24.1–24.6, 31.1–31.5_

- [x] 20. Checkpoint - Ensure admin panel is functional
  - Ensure all tests pass, ask the user if questions arise.

- [x] 21. Flutter mobile app
  - [x] 21.1 Initialize Flutter project with core architecture
    - Set up Flutter project in `apps/mobile/` (Android + iOS targets)
    - Configure Drift (SQLite) for local DB, connectivity_plus for network monitoring
    - Set up Dio HTTP client with JWT interceptor (auto-refresh)
    - Implement role-based UI routing (guru UI vs orang_tua UI based on JWT role)
    - Set up FCM integration (firebase_messaging package)
    - _Requirements: 19.2, 19.3, 19.10, 19.11, 26.4_

  - [x] 21.2 Implement authentication screens (guru login + orang_tua phone login)
    - Guru: email + password login form with reset password option
    - Orang_tua: phone number input, no password
    - Store tokens securely (flutter_secure_storage)
    - Role detection and UI routing after login
    - _Requirements: 19.1, 19.2, 19.9, 19.10, 19.11_

  - [x] 21.3 Implement guru attendance screens with offline support
    - Today's classes list from jadwal
    - Attendance input: student list with status selection
    - Offline mode: save to Drift with `event_timestamp` (local save time, not sync time) per [ADR-003](../../docs/adr/ADR-003-offline-sync-conflict-resolution.md)
    - Show sync queue indicator with conflict results (teacher informed when input overridden)
    - Auto-sync on connectivity restore
    - Online/offline banner indicator
    - Clock skew detection: warn if device clock differs from server by >5 minutes
    - _Requirements: 1.1–1.14, 26.1–26.6_

  - [x] 21.4 Implement orang_tua attendance view screens
    - Calendar view with color-coded statuses per month
    - Summary totals (hadir, izin, sakit, alpa)
    - Month selector, per-child separation
    - Multi-school grouping for cross-tenant parents
    - _Requirements: 8.1–8.4, 21.9, 21.10_

  - [x] 21.5 Implement orang_tua tagihan screens (view, upload bukti, history)
    - Tagihan list per child with status badges
    - Upload bukti: camera/gallery, input nominal_bayar, validation feedback
    - Payment history with receipt download
    - Multi-child separation
    - _Requirements: 11.1–11.17, 14.1–14.6_

  - [x] 21.6 Implement orang_tua rapor view screens
    - Period list (only final rapor visible)
    - Detail: nilai per mapel, capaian, P5, catatan wali, peringkat, rata-rata
    - Per-child separation
    - _Requirements: 39.1–39.5_

  - [x] 21.7 Implement notification screens (history, preferences)
    - Notification history list (newest first, delivery status)
    - Preference toggles per child (kehadiran ON/OFF, ketidakhadiran ON/OFF)
    - Push notification handling (foreground + background)
    - _Requirements: 7.1–7.3, 25.1–25.4_

  - [x] 21.8 Implement RPP screens for guru (create, view, portal, favorites)
    - Create RPP: file upload or basic text input
    - Portal: search, filter, view, download
    - Favorites: toggle and list
    - _Requirements: 41.1–41.11, 43.1–43.7, 44.1–44.5_

  - [x] 21.9 Implement guru jadwal view screen
    - Today's schedule (default) with day filter
    - Slot info: kelas, mapel, jam_mulai, jam_selesai
    - Guru pengganti indicator
    - _Requirements: 33.1–33.4_

- [x] 22. Checkpoint - Ensure mobile app is functional
  - Ensure all tests pass, ask the user if questions arise.

- [x] 23. Integration tests
  - [x] 23.1 Write integration tests for auth flow
    - Full login → token → refresh → logout cycle
    - Account lockout after 5 failures
    - Cross-tenant parent access
    - Token invalidation on password change
    - _Requirements: 19.1–19.11, 20.1–20.9_

  - [x] 23.2 Write integration tests for billing flow
    - Generate → upload → verify → lunas flow
    - Generate → manual payment → cicilan → lunas flow
    - Rejection → re-upload flow
    - _Requirements: 9–15, 34_

  - [x] 23.3 Write integration tests for notification delivery
    - Attendance save → queue → processor → FCM mock → DB record
    - Preference filtering (hadir ON/OFF)
    - Retry on failure
    - _Requirements: 6.1–6.8, 25.1–25.4_

  - [x] 23.4 Write integration tests for file upload and storage
    - Bukti transfer upload → compression → R2 storage → retrieval
    - RPP file upload → storage → presigned URL download
    - File size/format validation
    - _Requirements: 11.4, 11.5, 11.15, 41.1, 41.10_

- [x] 24. Deployment and CI/CD
  - [x] 24.1 Configure Railway deployment
    - Set up Railway project with services: API (1GB RAM), Worker (512MB RAM), PostgreSQL (1GB RAM), Redis (256MB) per [ADR-006](../../docs/adr/ADR-006-load-estimation-and-scaling.md)
    - Configure environment variables
    - Set up Vue.js SPA deployment (Railway Static or Cloudflare Pages)
    - Configure health check endpoint
    - Set up `X-Minimum-App-Version` response header per [ADR-004](../../docs/adr/ADR-004-api-versioning.md)
    - _Requirements: (infrastructure)_

  - [x] 24.2 Set up CI/CD pipeline
    - GitHub Actions: lint, test (unit + integration), build on PR
    - Auto-deploy to Railway on main branch merge
    - Run Drizzle migrations as part of deploy
    - _Requirements: (infrastructure)_

  - [x] 24.3 Configure production monitoring and logging
    - Structured logging (JSON format)
    - Error tracking setup
    - Basic health monitoring
    - Alert on scaling triggers per [ADR-006](../../docs/adr/ADR-006-load-estimation-and-scaling.md): API p95 > 500ms, queue depth > 500, notification p95 > 25s, error rate > 1%
    - _Requirements: (infrastructure)_

- [x] 25. Final checkpoint - Ensure all tests pass and system is deployable
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 24 universal correctness properties defined in the design document
- Unit tests validate specific examples and edge cases
- The tech stack uses TypeScript throughout: NestJS backend, Vue.js admin panel, fast-check for PBT
- Flutter mobile app uses Dart with Drift for local SQLite (offline mode)
- All list endpoints use cursor-based pagination (default 20 items)
- Multi-tenant isolation enforced at two layers: application-level TenantInterceptor + PostgreSQL RLS ([ADR-001](../../docs/adr/ADR-001-postgresql-rls-tenant-isolation.md))
- Parent (orang_tua) has a single user record with `tenant_id = NULL` ([ADR-002](../../docs/adr/ADR-002-parent-user-model.md))
- All API endpoints prefixed with `/api/v1/` ([ADR-004](../../docs/adr/ADR-004-api-versioning.md))
- Rate limiting enforced on auth and heavy endpoints ([ADR-005](../../docs/adr/ADR-005-rate-limiting.md))

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.5"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7"] },
    { "id": 3, "tasks": ["2.8", "2.9", "2.10"] },
    { "id": 4, "tasks": ["4.1", "4.2", "4.3", "4.6"] },
    { "id": 5, "tasks": ["4.4", "4.5", "4.7", "4.8"] },
    { "id": 6, "tasks": ["5.1", "5.2", "5.7", "5.8"] },
    { "id": 7, "tasks": ["5.3", "5.4", "5.5", "5.6"] },
    { "id": 8, "tasks": ["5.9", "7.1"] },
    { "id": 9, "tasks": ["7.2", "7.3", "7.4"] },
    { "id": 10, "tasks": ["8.1", "8.5", "8.6"] },
    { "id": 11, "tasks": ["8.2", "8.3", "8.4", "8.7", "8.8", "8.11", "8.12"] },
    { "id": 12, "tasks": ["8.9", "8.10", "8.13", "8.14"] },
    { "id": 13, "tasks": ["10.1", "10.5", "10.8"] },
    { "id": 14, "tasks": ["10.2", "10.6", "10.3", "10.4", "10.7"] },
    { "id": 15, "tasks": ["11.1", "11.4"] },
    { "id": 16, "tasks": ["11.2", "11.3", "11.5", "11.6"] },
    { "id": 17, "tasks": ["11.7", "11.8", "11.9", "11.11", "11.13", "11.14"] },
    { "id": 18, "tasks": ["11.10", "11.12", "11.15"] },
    { "id": 19, "tasks": ["13.1", "13.2"] },
    { "id": 20, "tasks": ["13.3", "13.6", "13.7"] },
    { "id": 21, "tasks": ["13.4", "13.5", "13.8"] },
    { "id": 22, "tasks": ["14.1"] },
    { "id": 23, "tasks": ["14.2", "14.3", "14.5"] },
    { "id": 24, "tasks": ["14.4", "15.1", "16.1"] },
    { "id": 25, "tasks": ["16.2"] },
    { "id": 26, "tasks": ["18.1", "18.2", "18.3", "18.4", "18.5"] },
    { "id": 27, "tasks": ["19.1", "21.1"] },
    { "id": 28, "tasks": ["19.2", "19.3", "19.11", "21.2"] },
    { "id": 29, "tasks": ["19.4", "19.5", "19.6", "21.3", "21.9"] },
    { "id": 30, "tasks": ["19.7", "19.8", "19.9", "19.10", "21.4", "21.5", "21.6", "21.7", "21.8"] },
    { "id": 31, "tasks": ["23.1", "23.2", "23.3", "23.4"] },
    { "id": 32, "tasks": ["24.1", "24.2", "24.3"] }
  ]
}
```
