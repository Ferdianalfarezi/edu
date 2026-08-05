# Implementation Plan: User Password Reset

## Overview

Modifikasi backend (`UserService`, `UserController`, `EmailProcessor`) dan buat komponen frontend baru (`ResetPasswordDialog.vue`) untuk melengkapi fitur reset password oleh superadmin. Backend sudah punya endpoint dan method, tapi perlu validasi tambahan, password generator yang lebih kuat, job handler email baru, dan wiring ke frontend yang belum ada sama sekali.

## Tasks

- [x] 1. Perbaiki `generateSecurePassword()` di `UserService`
  - [x] 1.1 Tambah method `generateSecurePassword()` di `apps/api/src/modules/user/user.service.ts`
    - Ganti `generateRandomPassword()` (base64url-only) dengan implementasi baru yang menjamin minimal 1 huruf besar, 1 huruf kecil, 1 angka, dan 1 simbol (`!@#$%^&*`) dari total 12 karakter
    - Gunakan `crypto.randomInt()` — bukan `Math.random()` — untuk setiap pemilihan karakter
    - Shuffle hasil array sebelum `join('')` menggunakan `crypto.randomInt(3) - 1` sebagai comparator
    - Tandai `generateRandomPassword()` lama sebagai `@deprecated` tapi jangan hapus dulu (ada bulk-import yang mungkin pakai)
    - _Requirements: 3.1_

  - [x]* 1.2 Tulis property test untuk `generateSecurePassword()`
    - **Property 2: Password generator memenuhi semua kriteria keamanan**
    - **Validates: Requirements 3.1**
    - File: `apps/api/src/modules/user/user.service.spec.ts`
    - Komentar: `// Feature: user-password-reset, Property 2: Password generator memenuhi semua kriteria keamanan`
    - Jalankan `generateSecurePassword()` sebanyak `numRuns: 100` iterasi dan assert: `length >= 12`, match `/[A-Z]/`, `/[a-z]/`, `/[0-9]/`, `/[!@#$%^&*]/`
    - _Requirements: 3.1_

- [x] 2. Update `UserService.resetPassword()` dengan validasi dan email job baru
  - [x] 2.1 Ubah signature `resetPassword()` menjadi `resetPassword(callerId: string, callerRole: string, targetId: string)` di `apps/api/src/modules/user/user.service.ts`
    - Tambah validasi self-reset: throw `ForbiddenException('Tidak dapat mereset password sendiri')` jika `callerId === targetId`
    - Lookup user target: throw `NotFoundException('User tidak ditemukan')` jika tidak ada
    - Tambah validasi target superadmin: throw `ForbiddenException('Tidak dapat mereset password superadmin')` jika `existingUser.role === Role.SUPER_ADMIN`
    - Tambah validasi email: throw `BadRequestException('User tidak memiliki alamat email')` jika `email` null/kosong/whitespace
    - Ganti `generateRandomPassword()` dengan `generateSecurePassword()` yang baru
    - Bungkus operasi DB dalam transaction: `this.db.transaction(async (tx) => { ... })` agar update `passwordHash` dan `mustChangePassword` atomik
    - Ganti job name `'send-password-reset'` dengan `'send-admin-password-reset'` dan tambahkan field `name` di payload
    - Bungkus `emailQueue.add()` dalam try/catch — log error tapi jangan re-throw
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.3, 4.6, 6.4, 6.5_

  - [x]* 2.2 Tulis unit tests untuk validasi di `resetPassword()`
    - Test: throw `ForbiddenException` ketika `callerId === targetId`
    - Test: throw `ForbiddenException` ketika target adalah `super_admin`
    - Test: throw `BadRequestException` ketika email target null/empty/whitespace
    - Test: throw `NotFoundException` ketika user tidak ditemukan
    - Test: return sukses (tanpa throw) ketika `emailQueue.add()` gagal — verifikasi `logger.error()` dipanggil
    - _Requirements: 3.4, 4.3, 4.6, 6.4, 6.5_

  - [x]* 2.3 Tulis property test untuk response tidak mengandung password plaintext
    - **Property 3: Response reset tidak mengandung password plaintext**
    - **Validates: Requirements 3.3**
    - File: `apps/api/src/modules/user/user.service.spec.ts`
    - Komentar: `// Feature: user-password-reset, Property 3: Response reset tidak mengandung password plaintext`
    - Generate berbagai UUID target dengan `fc.uuid()`, mock DB dan emailQueue, verifikasi `Object.keys(result)` tidak mengandung `'password'`, `'tempPassword'`, atau `'temp_password'`
    - `numRuns: 100`
    - _Requirements: 3.3_

- [x] 3. Update `UserController.resetPassword()` untuk pass caller info
  - [x] 3.1 Ubah handler `resetPassword()` di `apps/api/src/modules/user/user.controller.ts`
    - Tambah parameter `@Req() req: Request` ke method
    - Extract `currentUser` dari `(req as Request & { user: RequestUser }).user`
    - Ubah call ke `this.userService.resetPassword(currentUser.id, currentUser.role, id)`
    - Pastikan dekorator `@Auditable` sudah punya `excludeFields: ['password', 'password_hash', 'temp_password']` (sudah ada, verifikasi saja)
    - _Requirements: 3.5, 3.6, 6.3_

- [x] 4. Tambah `AdminPasswordResetJobData` interface dan job handler di `EmailProcessor`
  - [x] 4.1 Tambah interface `AdminPasswordResetJobData` dan function `buildAdminPasswordResetHtml()` di `apps/api/src/jobs/email.processor.ts`
    - Export interface: `{ to: string; name: string; password: string }`
    - Buat function `buildAdminPasswordResetHtml(name: string, password: string): string` mengikuti pola HTML yang konsisten dengan template lain (font Arial, warna `#2563eb`, max-width 600px, footer standar)
    - Template wajib mengandung: nama user, password sementara dalam `<code>`, list langkah login, dan paragraf peringatan dengan teks bahwa aksi dilakukan administrator
    - Export via `emailTemplates` object (tambah ke existing export di baris `export const emailTemplates = { ... }`)
    - _Requirements: 4.4, 4.5, 4.7_

  - [x] 4.2 Tambah method `handleAdminPasswordReset()` di class `EmailProcessor`
    - Tambah dekorator `@Process('send-admin-password-reset')` 
    - Signature: `async handleAdminPasswordReset(job: Job<AdminPasswordResetJobData>): Promise<void>`
    - Panggil `buildAdminPasswordResetHtml(job.data.name, job.data.password)` lalu `sendEmail(job.data.to, 'Password Anda Telah Direset oleh Administrator', html)`
    - Ikuti pola error handling yang sama dengan `handleUserCredentials()` — gunakan `this.logger` dan re-throw
    - _Requirements: 4.1, 4.2_

  - [x]* 4.3 Tulis property test untuk `buildAdminPasswordResetHtml()`
    - **Property 4: Template email admin-reset mengandung semua elemen wajib**
    - **Validates: Requirements 4.4, 4.5**
    - File: `apps/api/src/jobs/email.processor.spec.ts`
    - Komentar: `// Feature: user-password-reset, Property 4: Template email admin-reset mengandung semua elemen wajib`
    - Arbitraries: `fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)` untuk nama, `fc.string({ minLength: 12, maxLength: 20 })` untuk password
    - Assert: html mengandung `name`, mengandung `password`, `toLowerCase()` mengandung `'login'`, `toLowerCase()` match `/administrator|admin/`
    - `numRuns: 100`
    - _Requirements: 4.4, 4.5_

- [-] 5. Checkpoint — Pastikan backend berjalan
  - Pastikan semua tests backend pass, ask the user if questions arise.

- [x] 6. Buat komponen `ResetPasswordDialog.vue`
  - [x] 6.1 Buat file `apps/admin/src/components/ResetPasswordDialog.vue`
    - Props: `show: boolean`, `user: { id: string; nama: string | null; email: string | null } | null`
    - Emits: `close: []`, `success: [userEmail: string]`
    - State internal: `loading: Ref<boolean>` (default `false`)
    - Gunakan komponen `BaseModal` dengan `size="sm"` dan `title="Reset Password"`
    - Tampilkan nama user di body modal: `"Anda akan mereset password untuk [nama]. Aksi ini tidak dapat dibatalkan."`
    - Dua tombol di slot `footer`: "Batal" (`variant="neutral"`, emit `close`) dan "Ya, Reset" (`variant="danger"`, disabled saat `loading`, tampilkan spinner `animate-spin` saat `loading`)
    - Handler klik "Ya, Reset": set `loading = true`, `await api.post('/users/' + props.user.id + '/reset-password')`, emit `success(props.user.email!)` lalu `close` — error: set `loading = false` (toast sudah handled oleh Axios interceptor global)
    - Reset `loading = false` saat modal ditutup (`@close` handler)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 6.2 Tulis property test untuk visibilitas tombol reset di tabel
    - **Property 1: Visibilitas tombol berdasarkan kombinasi role**
    - **Validates: Requirements 1.1, 1.2, 6.1, 6.2**
    - File: `apps/admin/src/components/__tests__/ResetPasswordDialog.property.test.ts`
    - Komentar: `// Feature: user-password-reset, Property 1: Visibilitas tombol berdasarkan kombinasi role`
    - Generate array baris user dengan role acak (`fc.constantFrom(...ALL_ROLES)`) dan loggedInRole (`fc.constantFrom('super_admin', 'admin', 'guru')`), mount tabel minimal dengan logika kondisional yang sama seperti di `UserManagementView`, verifikasi: tombol muncul iff `(loggedInRole === 'super_admin' && row.role !== 'super_admin')`
    - `numRuns: 100`
    - _Requirements: 1.1, 1.2, 6.1, 6.2_

- [x] 7. Modifikasi `UserManagementView.vue` untuk mengintegrasikan dialog reset
  - [x] 7.1 Tambah imports dan state reset password di `apps/admin/src/views/UserManagementView.vue`
    - Tambah import: `useAuthStore` dari `@/stores`, `ResetPasswordDialog` dari `@/components/ResetPasswordDialog.vue`, `useToast` dari `@/composables/useToast`
    - Tambah state: `showResetDialog = ref(false)`, `resettingUser = ref<User | null>(null)`
    - Inisialisasi: `const authStore = useAuthStore()`, `const toast = useToast()`
    - Tambah fungsi: `openResetDialog(user: User)` yang set `resettingUser = user` lalu `showResetDialog = true`
    - Tambah fungsi: `onResetSuccess(userEmail: string)` yang panggil `toast.success('Password berhasil direset dan email telah dikirim ke ' + userEmail, { duration: 5000 })`
    - _Requirements: 1.3, 1.4, 5.1, 5.4_

  - [x] 7.2 Tambah tombol "Reset Password" di kolom Aksi tabel dan mount `ResetPasswordDialog`
    - Di kolom Aksi (dalam `v-for="user in users"`), tambah `ActionButton` setelah tombol Edit:
      ```html
      <ActionButton
        v-if="authStore.hasRole(Role.SUPER_ADMIN) && user.role !== Role.SUPER_ADMIN"
        variant="purple"
        :disabled="!user.email || !user.email.trim()"
        @click="openResetDialog(user)"
      >
        Reset Password
      </ActionButton>
      ```
    - Tambah `<ResetPasswordDialog>` di bawah modal-modal yang sudah ada:
      ```html
      <ResetPasswordDialog
        :show="showResetDialog"
        :user="resettingUser"
        @close="showResetDialog = false"
        @success="onResetSuccess"
      />
      ```
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 5.1, 5.3, 6.1, 6.2_

  - [ ]* 7.3 Tulis property test untuk notifikasi sukses mengandung email user
    - **Property 5: Notifikasi sukses mengandung email user**
    - **Validates: Requirements 5.1**
    - File: `apps/admin/src/views/__tests__/UserManagementView.property.test.ts`
    - Komentar: `// Feature: user-password-reset, Property 5: Notifikasi sukses mengandung email user`
    - Arbitrary: `fc.emailAddress()`, mock `api.post` return resolve, mock `useToast`, panggil `onResetSuccess(userEmail)` secara langsung atau trigger via komponen, verifikasi pesan toast mengandung `userEmail`
    - `numRuns: 100`
    - _Requirements: 5.1_

- [x] 8. Checkpoint akhir — Pastikan semua tests pass
  - Pastikan semua tests (unit + property) pass, ask the user if questions arise.

## Notes

- Tasks bertanda `*` adalah opsional dan bisa di-skip untuk MVP yang lebih cepat
- Setiap task mereferensikan requirement spesifik untuk traceability
- `generateRandomPassword()` lama **jangan dihapus** — masih digunakan oleh bulk-import flow (`handleUserCredentials`). Method baru `generateSecurePassword()` adalah tambahan, bukan pengganti total
- Property test untuk atomicity DB (req 3.2) dan audit log (req 3.6) lebih cocok sebagai integration test dengan real DB — tidak di-cover oleh property tests di sini
- Error handling frontend di `ResetPasswordDialog` sudah di-handle oleh global Axios interceptor di `api/client.ts`, dialog cukup reset `loading = false`
- Job name `'send-admin-password-reset'` dibedakan dari `'send-password-reset'` yang sudah ada (reset link flow) — jangan digabung

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "4.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "4.2"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1", "4.3"] },
    { "id": 3, "tasks": ["6.1", "7.1"] },
    { "id": 4, "tasks": ["6.2", "7.2"] },
    { "id": 5, "tasks": ["7.3"] }
  ]
}
```
