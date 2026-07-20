# Implementation Plan: Pengumuman (Announcement)

## Overview

Implement the announcement feature end-to-end: Drizzle schema + migration → NestJS PengumumanModule (controller, service, DTOs) → Bull queue job processor for FCM delivery → Vue admin panel view (list + create) → Flutter mobile detail screen + deep link navigation. Builds on existing `notifikasi` table, `FcmService`, `device_token` infrastructure, and `QUEUE_NAMES.NOTIFICATION` queue.

## Tasks

- [x] 1. Database Schema and Migration
  - [x] 1.1 Create Drizzle schema file `apps/api/src/drizzle/schema/pengumuman.ts`
    - Define `pengumumanModeEnum` pgEnum with values `['broadcast', 'targeted']`
    - Define `pengumumanStatusEnum` pgEnum with values `['draft', 'terkirim', 'gagal']`
    - Define `pengumuman` table with columns: id (uuid PK), tenantId, createdBy, judul (varchar 255), deskripsi (text), mode, jumlahPenerima (integer default 0), status (default 'draft'), createdAt, updatedAt
    - Define `pengumumanPenerima` table with columns: id (uuid PK), pengumumanId, userId, createdAt
    - Add composite index on `(tenantId, createdAt DESC)` for pengumuman
    - Add unique index on `(pengumumanId, userId)` for pengumuman_penerima
    - Add index on `userId` for pengumuman_penerima
    - Reference `tenant.id` and `user.id` for foreign keys
    - _Requirements: 2.2, 3.3, 5.1, 7.4_

  - [x] 1.2 Export schema from `apps/api/src/drizzle/schema/index.ts`
    - Add `export * from './pengumuman';` in the "Notifikasi" section
    - _Requirements: 2.2_

  - [x] 1.3 Generate database migration
    - Run `pnpm --filter @edu/api db:generate` to create the migration SQL
    - Verify the generated migration contains CREATE TABLE and CREATE INDEX statements
    - _Requirements: 2.2, 3.3_

- [x] 2. Checkpoint — Verify migration generates cleanly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Backend — DTOs
  - [x] 3.1 Create `apps/api/src/modules/pengumuman/pengumuman.dto.ts`
    - `CreatePengumumanDto`: judul (@IsString, @MinLength(1), @MaxLength(255)), deskripsi (@IsString, @MinLength(1), @MaxLength(5000)), mode (@IsEnum(['broadcast', 'targeted'])), siswa_ids (@IsOptional, @IsArray, @ArrayMinSize(1), @ArrayMaxSize(100), @IsUUID('4', {each:true}))
    - Add custom validation: if mode is 'targeted', siswa_ids must be provided
    - `ListPengumumanQueryDto`: extend common pagination DTO with default page_size=15, allowed sizes [10, 15, 25, 50]
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 3.1, 3.4, 5.3_

- [x] 4. Backend — PengumumanService
  - [x] 4.1 Create `apps/api/src/modules/pengumuman/pengumuman.service.ts`
    - Inject `DRIZZLE` database instance, `FcmService`, and Bull queue (QUEUE_NAMES.NOTIFICATION)
    - Implement `create(dto, user)`:
      - Trim judul/deskripsi, validate lengths
      - Insert pengumuman record with status 'draft'
      - Resolve recipients: broadcast → all active orang_tua in tenant (deduplicated); targeted → orang_tua of selected siswa (deduplicated, skip invalid)
      - Insert `pengumuman_penerima` records
      - Enqueue `send-pengumuman-notification` job with pengumuman_id, tenant_id, judul, deskripsi, penerima_user_ids
      - Update jumlah_penerima on pengumuman record
      - Return pengumuman_id, judul, mode, jumlah_penerima, status, created_at
    - Implement `list(query, tenantId)`:
      - Query pengumuman WHERE tenant_id matches, ORDER BY created_at DESC
      - Apply pagination (page, page_size)
      - Return paginated response with meta (page, page_size, total_count, total_pages)
    - Implement `getDetail(pengumumanId, userId)`:
      - Verify pengumuman exists (404 if not)
      - Verify user is in pengumuman_penerima (403 if not)
      - Verify pengumuman tenant_id is in user's tenants list (403 if not)
      - Return judul, deskripsi, nama_sekolah (from tenant), created_at
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.2, 3.3, 3.4, 3.5, 3.6, 5.2, 5.3, 5.4, 6.6, 7.2, 7.4, 7.5, 7.6_

  - [x] 4.2 Create `apps/api/src/modules/pengumuman/pengumuman.controller.ts`
    - `POST /pengumuman` with `@Roles(Role.ADMIN, Role.KEPALA_SEKOLAH)` — calls `service.create()`
    - `GET /pengumuman` with `@Roles(Role.ADMIN, Role.KEPALA_SEKOLAH)` — calls `service.list()`
    - `GET /pengumuman/:id` with `@Roles(Role.ORANG_TUA)` — calls `service.getDetail()`
    - Use `@CurrentUser()` decorator for user context, extract tenantId from JWT
    - _Requirements: 7.1, 7.3, 6.6_

  - [x] 4.3 Create `apps/api/src/modules/pengumuman/pengumuman.module.ts`
    - Import `BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATION })`
    - Import `NotifikasiModule` for FcmService access
    - Register controller, service
    - _Requirements: 2.4_

  - [x] 4.4 Register `PengumumanModule` in `apps/api/src/app.module.ts`
    - Add PengumumanModule to imports array
    - _Requirements: 2.4_

- [x] 5. Checkpoint — Verify backend compiles
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Backend — Queue Job Processor
  - [x] 6.1 Create `apps/api/src/jobs/pengumuman-notification.processor.ts`
    - Extend `BaseProcessor` with processorName 'PengumumanNotificationProcessor', concurrency 10, maxAttempts 3
    - Decorate with `@Processor(QUEUE_NAMES.NOTIFICATION)`
    - Implement `@Process('send-pengumuman-notification')` handler:
      - Receive job data: pengumuman_id, tenant_id, judul, deskripsi, penerima_user_ids
      - Batch query device_token for all penerima_user_ids (active tokens only)
      - Build FCM messages: title = judul, body = deskripsi truncated to 200 chars + "..." if longer, data = { pengumuman_id, tipe: 'pengumuman' }
      - Send via `FcmService.sendBatch()`
      - Insert `notifikasi` records for each recipient: tipe='pengumuman', judul, pesan (truncated body), data={pengumuman_id, tipe:'pengumuman'}, siswaId=null
      - Determine per-recipient status: 'terkirim' if at least one token succeeded, 'gagal' if all failed
      - Update `pengumuman.status` to 'terkirim' (if any recipient succeeded) or 'gagal' (if all failed)
    - Override `handleDeadLetter`: update `pengumuman.status` to 'gagal'
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 6.2 Register processor in `NotifikasiModule` providers
    - Add `PengumumanNotificationProcessor` to providers array in `apps/api/src/modules/notifikasi/notifikasi.module.ts`
    - _Requirements: 4.1_

- [x] 7. Checkpoint — Verify queue processor compiles and integrates
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Admin Panel — PengumumanView
  - [x] 8.1 Create `apps/admin/src/views/PengumumanView.vue`
    - List section: table with columns judul, mode (broadcast/targeted badge), jumlah_penerima, created_at (formatted), status (draft/terkirim/gagal with color coding)
    - Sorted by created_at DESC (from API)
    - Pagination using `TablePagination` component, default 15 items, options [10, 15, 25, 50]
    - Empty state message when no pengumuman exist
    - Error state with retry on API failure
    - Create button that opens modal/form
    - Create form: judul input (max 255), deskripsi textarea (max 5000, no rich text), mode radio (broadcast/targeted), siswa selector (SearchSelect, max 100, shown only for targeted mode)
    - Form validation: judul required + max length, deskripsi required + max length, siswa_ids required when mode=targeted
    - On submit: POST /pengumuman, show success toast with jumlah_penerima, refresh list
    - Use `useTableUrlState` composable for pagination state if applicable
    - _Requirements: 1.1, 1.5, 3.1, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 8.2 Add route for PengumumanView in `apps/admin/src/router/index.ts`
    - Path: `/pengumuman`, name: 'pengumuman'
    - Meta: `{ roles: [Role.ADMIN, Role.KEPALA_SEKOLAH] }`
    - Lazy-load component
    - _Requirements: 7.1_

  - [x] 8.3 Add navigation menu item for Pengumuman in `AppLayout.vue`
    - Add menu item with appropriate icon in the sidebar navigation
    - Visible for roles admin and kepala_sekolah
    - _Requirements: 5.1_

- [x] 9. Checkpoint — Verify admin panel compiles
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Mobile — Pengumuman Detail Screen
  - [x] 10.1 Create model `apps/mobile/lib/features/orang_tua/models/pengumuman_models.dart`
    - `PengumumanDetail` class with fields: id, judul, deskripsi, namaSekolah, createdAt (DateTime)
    - `fromJson` factory constructor
    - _Requirements: 6.3_

  - [x] 10.2 Create provider `apps/mobile/lib/features/orang_tua/providers/pengumuman_provider.dart`
    - `pengumumanDetailProvider(String pengumumanId)` — FutureProvider that fetches GET /pengumuman/:id
    - Use `apiClientProvider` for Dio instance
    - Parse response into `PengumumanDetail` model
    - _Requirements: 6.3, 6.4, 6.5_

  - [x] 10.3 Create screen `apps/mobile/lib/features/orang_tua/screens/pengumuman_detail_screen.dart`
    - Accept `pengumumanId` parameter
    - Show loading indicator while fetching
    - Success state: display judul, deskripsi (full text), nama sekolah, created_at formatted as "dd MMM yyyy, HH:mm"
    - Error state for 403/404: "Pengumuman tidak tersedia" + back button
    - Network error state: "Gagal memuat pengumuman" + "Coba Lagi" retry button
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 10.4 Add route in `apps/mobile/lib/core/router/app_router.dart`
    - Add `orangTuaPengumumanDetail` path constant: `/orang-tua/pengumuman/:pengumumanId`
    - Add GoRoute entry under orang_tua routes with `pengumumanId` path parameter
    - Import PengumumanDetailScreen
    - _Requirements: 6.1, 6.2_

  - [x] 10.5 Add deep link navigation from push notification tap
    - In the notification tap handler (Firebase messaging onMessageOpenedApp / getInitialMessage), check if `data['tipe'] == 'pengumuman'` and extract `pengumuman_id`
    - Navigate to `/orang-tua/pengumuman/:pengumumanId`
    - Also handle tap from notification history screen: when item tipe is 'pengumuman', extract pengumuman_id from data field and navigate
    - _Requirements: 6.1, 6.2_

- [x] 11. Checkpoint — Verify mobile compiles
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Property-Based Tests
  - [x] 12.1 Write property test for input validation
    - **Property 1: Input Validation Rejects Invalid, Accepts Valid**
    - **Validates: Requirements 1.3, 1.4, 1.5**
    - File: `apps/api/src/modules/pengumuman/__tests__/inputValidation.property.test.ts`
    - Use fast-check to generate random strings (empty, whitespace-only, valid 1–255/5000 chars, overlength)
    - Verify: empty/whitespace-only → rejected, 1–max length → accepted, >max → rejected

  - [x] 12.2 Write property test for recipient deduplication
    - **Property 2: Recipient Resolution Deduplicates Parents**
    - **Validates: Requirements 2.1, 2.2, 3.2, 3.3**
    - File: `apps/api/src/modules/pengumuman/__tests__/recipientDeduplication.property.test.ts`
    - Use fast-check to generate parent-student relationship graphs (parents with multiple children)
    - Verify: output has exactly one entry per unique orang_tua_id, count matches distinct parents

  - [x] 12.3 Write property test for notification body truncation
    - **Property 3: Notification Body Truncation**
    - **Validates: Requirements 4.1**
    - File: `apps/api/src/modules/pengumuman/__tests__/bodyTruncation.property.test.ts`
    - Use fast-check to generate random strings of varying lengths (0–5000)
    - Verify: length > 200 → body is `substring(0,200) + "..."`, length ≤ 200 → body unchanged

  - [x] 12.4 Write property test for delivery status determination
    - **Property 4: Delivery Status Determination**
    - **Validates: Requirements 4.3, 4.4**
    - File: `apps/api/src/modules/pengumuman/__tests__/deliveryStatus.property.test.ts`
    - Use fast-check to generate arrays of FCM results (success/failure per token)
    - Verify: at least one success → 'terkirim', all failed after retries → 'gagal'

  - [x] 12.5 Write property test for tenant isolation
    - **Property 5: Tenant Isolation**
    - **Validates: Requirements 5.4, 7.2, 7.4**
    - File: `apps/api/src/modules/pengumuman/__tests__/tenantIsolation.property.test.ts`
    - Use fast-check to generate multi-tenant pengumuman data
    - Verify: list query with tenant_id=T returns only records with matching tenant_id, recipient resolution only includes users in same tenant

  - [x] 12.6 Write property test for recipient-only access control
    - **Property 6: Recipient-Only Access Control**
    - **Validates: Requirements 6.6, 7.5, 7.6**
    - File: `apps/api/src/modules/pengumuman/__tests__/accessControl.property.test.ts`
    - Use fast-check to generate user/pengumuman/penerima combinations
    - Verify: user in penerima AND tenant matches → access granted, otherwise → 403

  - [x] 12.7 Write property test for list ordering invariant
    - **Property 7: List Ordering Invariant**
    - **Validates: Requirements 5.2**
    - File: `apps/api/src/modules/pengumuman/__tests__/listOrdering.property.test.ts`
    - Use fast-check to generate random timestamps for pengumuman records
    - Verify: all consecutive pairs satisfy `item[i].created_at >= item[i+1].created_at`

  - [x] 12.8 Write property test for graceful degradation with invalid students
    - **Property 8: Graceful Degradation for Invalid Students**
    - **Validates: Requirements 3.5, 3.6, 2.5**
    - File: `apps/api/src/modules/pengumuman/__tests__/gracefulDegradation.property.test.ts`
    - Use fast-check to generate mixed valid/invalid student ID lists
    - Verify: invalid entries skipped, valid ones processed, jumlah_penerima = distinct valid parents

- [x] 13. Final Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `FcmService.sendBatch()` handles chunking (500-token limit) and stale token deactivation
- The existing `BaseProcessor` provides retry (3 attempts, 60s backoff) and dead letter handling
- The existing `QUEUE_NAMES.NOTIFICATION` queue is reused — new processor uses `'send-pengumuman-notification'` job name
- Schema follows existing patterns: one file per domain in `apps/api/src/drizzle/schema/`
- Admin view follows `{Feature}View.vue` naming convention
- Mobile follows feature-based structure: models → providers → screens under `features/orang_tua/`
- Run `dart run build_runner build` after adding Riverpod providers with code generation

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 4, "tasks": ["4.4", "6.1"] },
    { "id": 5, "tasks": ["6.2"] },
    { "id": 6, "tasks": ["8.1", "8.2", "8.3"] },
    { "id": 7, "tasks": ["10.1", "10.2"] },
    { "id": 8, "tasks": ["10.3", "10.4"] },
    { "id": 9, "tasks": ["10.5"] },
    { "id": 10, "tasks": ["12.1", "12.2", "12.3", "12.4", "12.5", "12.6", "12.7", "12.8"] }
  ]
}
```
