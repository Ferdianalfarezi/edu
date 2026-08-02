# Requirements Document

## Introduction

Fitur ini menambahkan alur onboarding data awal sekolah berbasis file Excel pada saat super admin membuat tenant baru. Saat ini, pembuatan tenant hanya membuat record tenant dan satu user admin default — sekolah masih kosong dan tidak ada data operasional sama sekali.

Dengan fitur ini, super admin diwajibkan mengupload file Excel berisi 5 sheet (Siswa, Kelas, Mata Pelajaran, Guru & Staff, SPP Bulanan) saat membuat tenant. File di-parse di frontend, ditampilkan sebagai preview untuk dikonfirmasi, lalu dikirim ke backend dalam satu request atomik. Backend membuat semua entitas sekolah sekaligus dan mengirim email kredensial ke seluruh user yang dibuat.

Perlu dicatat: alur ini mengubah semantik endpoint `POST /tenants` secara signifikan — payload bertambah besar dan proses backend menjadi jauh lebih kompleks. Ini bukan sekedar penambahan field, melainkan penggantian alur onboarding secara keseluruhan.

## Glossary

- **Tenant**: Satu instansi sekolah dalam platform multi-tenant Teman Sekolah
- **Super_Admin**: User dengan role `super_admin` yang mengelola semua tenant dari satu dashboard
- **Excel_Parser**: Komponen frontend yang membaca dan mem-parse file Excel menggunakan library SheetJS (xlsx)
- **Preview_Component**: Komponen Vue yang menampilkan data hasil parsing Excel dalam tampilan terstruktur sebelum konfirmasi
- **Onboarding_Service**: Method backend yang mengeksekusi pembuatan semua entitas tenant dalam satu transaksi database
- **Tahun_Ajaran_Default**: Tahun ajaran yang dibuat otomatis saat onboarding dengan status `disiapkan`, nama berformat `YYYY/YYYY+1` berdasarkan tahun saat ini
- **Konfigurasi_SPP**: Konfigurasi nominal SPP per tingkat yang disimpan di tabel `konfigurasi_sekolah` dengan key `spp_nominal_tingkat_{n}`
- **Email_Queue**: Bull queue dengan nama `email` yang sudah ada untuk pengiriman email asinkron
- **Sheet_Siswa**: Sheet Excel bernama "Siswa" berisi kolom: nama, nisn, kelas, jenis_kelamin, tanggal_lahir, alamat, nama_wali, telepon_wali
- **Sheet_Kelas**: Sheet Excel bernama "Kelas" berisi kolom tingkat_1, tingkat_2, dst — setiap cell berisi nama kelas dalam tingkat tersebut
- **Sheet_MataPelajaran**: Sheet Excel bernama "Mata Pelajaran" berisi kolom: mata_pelajaran, kode
- **Sheet_GuruStaff**: Sheet Excel bernama "Guru & Staff" berisi kolom: nama, email, telepon, role
- **Sheet_SPP**: Sheet Excel bernama "SPP Bulanan" berisi kolom: tingkat (angka), nominal (angka dalam rupiah)
- **Onboarding_DTO**: DTO yang membawa data tenant + seluruh data dari 5 sheet Excel ke backend
- **Transaksi_Atomik**: Satu database transaction yang mencakup seluruh insert — jika satu langkah gagal, semua rollback

---

## Requirements

### Requirement 1: Upload File Excel Wajib di Form Create Tenant

**User Story:** As a super admin, I want to be required to upload an Excel file when creating a new tenant, so that initial school data is always populated and the school is immediately operational.

#### Acceptance Criteria

1. WHEN the super admin opens the create tenant modal in `TenantManagementView.vue`, THE system SHALL display a file input field for Excel upload with a visible asterisk and "Wajib" label to indicate it is required.
2. WHEN the super admin selects a file that does not have a `.xlsx` or `.xls` extension, THE `Excel_Parser` SHALL display an error message "Format file tidak valid. Gunakan file Excel (.xlsx atau .xls)", reject the file, and reset the file input to an empty state.
3. WHEN the super admin selects a file larger than 10MB, THE `Excel_Parser` SHALL display an error message "Ukuran file melebihi batas maksimum 10MB", reject the file, and reset the file input to an empty state.
4. A file SHALL be considered "successfully parsed" when it contains at least one of the 5 required sheets and at least one data row below the header row in that sheet.
5. IF a valid Excel file has not been selected and successfully parsed (as defined in criterion 4), THE system SHALL keep the submit button disabled and SHALL NOT submit the form.
6. THE `TenantManagementView.vue` SHALL display a download link to the template file `Template_TemanSekolah.xlsx` at all times while the create tenant modal is open.

---

### Requirement 2: Parse File Excel di Frontend

**User Story:** As a super admin, I want the Excel file to be parsed immediately after selection in the browser, so that I can see and verify the data before sending it to the server.

#### Acceptance Criteria

1. WHEN a file with a `.xlsx` or `.xls` extension is selected, THE `Excel_Parser` SHALL parse all 5 sheets (Siswa, Kelas, Mata Pelajaran, Guru & Staff, SPP Bulanan) using the SheetJS (xlsx) library.
2. WHEN the Excel file is missing one or more of the required 5 sheet names, THE `Excel_Parser` SHALL display an error listing the missing sheet names and SHALL halt parsing and disable the submit button.
3. WHEN parsing occurs, THE `Excel_Parser` SHALL map columns in `Sheet_Siswa` to properties: `nama`, `nisn`, `kelas`, `jenis_kelamin`, `tanggal_lahir`, `alamat`, `nama_wali`, `telepon_wali`.
4. WHEN parsing occurs, THE `Excel_Parser` SHALL map columns in `Sheet_Kelas` where each column named `tingkat_N` (N is an integer between 1 and 12) contains a list of class names for that tingkat; columns not matching this pattern SHALL be skipped.
5. WHEN parsing occurs, THE `Excel_Parser` SHALL map columns in `Sheet_MataPelajaran` to properties: `nama` (from column `mata_pelajaran`), `kode`.
6. WHEN parsing occurs, THE `Excel_Parser` SHALL map columns in `Sheet_GuruStaff` to properties: `nama`, `email`, `telepon`, `role`.
7. WHEN parsing occurs, THE `Excel_Parser` SHALL map columns in `Sheet_SPP` to properties: `tingkat` (positive integer), `nominal` (positive integer > 0 in rupiah).
8. WHEN the `Sheet_GuruStaff` contains a row with a `role` value outside of `['admin', 'guru', 'kepala_sekolah', 'bendahara']`, THE `Excel_Parser` SHALL mark that row as invalid and display a warning listing the invalid rows.
9. WHEN the `Sheet_GuruStaff` contains a row with an `email` field that does not contain an `@` symbol followed by at least one `.` character, THE `Excel_Parser` SHALL mark that row as invalid and display a warning.
10. WHEN the `Sheet_SPP` contains a row with a `nominal` value that is non-numeric or less than or equal to zero, THE `Excel_Parser` SHALL mark that row as invalid and display a warning.
11. WHEN a file cannot be read or is structurally corrupt (e.g., not a valid ZIP-based Office format), THE `Excel_Parser` SHALL display an error message "File Excel tidak dapat dibaca. Pastikan file tidak rusak dan coba lagi", reset the file input to an empty state, and disable the submit button.
12. WHEN parsing occurs, THE `Excel_Parser` SHALL trim leading and trailing whitespace from all string values before validation and storage.

---

### Requirement 3: Tampilkan Preview Data Sebelum Konfirmasi

**User Story:** As a super admin, I want to see a structured preview of all parsed data from the Excel file, so that I can verify the data is correct before creating the tenant.

#### Acceptance Criteria

1. WHEN parsing succeeds, THE `Preview_Component` SHALL display parsed data from all 5 sheets in separate labeled sections within the create tenant modal.
2. WHEN parsing succeeds, THE `Preview_Component` SHALL display a summary count per sheet: jumlah siswa, jumlah kelas, jumlah mata pelajaran, jumlah guru/staff, jumlah tingkat SPP.
3. WHEN parsing succeeds, THE `Preview_Component` SHALL display `Sheet_Siswa` data in a table with columns: Nama, NISN, Kelas, Jenis Kelamin, Tanggal Lahir (formatted as DD/MM/YYYY); if more than 100 rows are present, only the first 100 rows SHALL be displayed with a note indicating the total count.
4. WHEN parsing succeeds, THE `Preview_Component` SHALL display `Sheet_Kelas` data with each tingkat as a group heading and its kelas names listed beneath it.
5. WHEN parsing succeeds, THE `Preview_Component` SHALL display `Sheet_MataPelajaran` data in a table with columns: Nama Mata Pelajaran, Kode; if more than 100 rows are present, only the first 100 rows SHALL be displayed with a note.
6. WHEN parsing succeeds, THE `Preview_Component` SHALL display `Sheet_GuruStaff` data in a table with columns: Nama, Email, Telepon, Role; if more than 100 rows are present, only the first 100 rows SHALL be displayed with a note.
7. WHEN parsing succeeds, THE `Preview_Component` SHALL display `Sheet_SPP` data in a table with columns: Tingkat, Nominal formatted using the `id-ID` locale (e.g., Rp 1.000.000).
8. WHEN the parsed data contains invalid rows, THE `Preview_Component` SHALL render those rows with a visually distinct background color and an additional inline column containing the reason for invalidity as text.
9. WHEN the super admin clicks the "Ganti File" button displayed by the `Preview_Component`, THE system SHALL clear all preview data, return the UI to the file selection step, and reset the file input to an empty state.
10. WHEN parsing succeeds and there are zero rows in `Sheet_GuruStaff` with a valid email address, THE `Preview_Component` SHALL display a non-blocking warning message above the confirmation button stating that no staff credentials email will be sent.

---

### Requirement 4: Submit Onboarding Data ke Backend

**User Story:** As a super admin, I want all school data to be sent to the backend in a single submission after I confirm the preview, so that the school is fully set up in one operation.

#### Acceptance Criteria

1. WHEN the super admin clicks the final submit button after reviewing the preview, THE system SHALL send a single submission containing: tenant data (nama, alamat, telepon, email, jumlah_tingkat, hari_kerja, admin_nama, admin_email) and onboarding data (kelas, mata_pelajaran, siswa, guru_staff, spp_bulanan).
2. WHILE the submission is in progress, THE submit button SHALL display a loading indicator and SHALL be non-interactive to prevent double submission.
3. WHILE the submission is in progress, THE system SHALL disable all form inputs to prevent modification.
4. WHEN the submission returns a successful response from the server, THE system SHALL close the modal, display a success toast notification visible for at least 3 seconds, and refresh the tenant list; IF any of these follow-up actions fail, THE system SHALL display an error state even though the data was successfully saved.
5. WHEN the submission returns an error response from the server, THE system SHALL display the error message from the response, re-enable the submit button and all form inputs, and keep the modal open.
6. WHEN the submission fails due to a network error (no server response received), THE system SHALL display the message "Gagal terhubung ke server. Periksa koneksi internet dan coba lagi", re-enable the submit button and all form inputs, and keep the modal open.
7. THE system SHALL only include rows marked as valid by the Excel parsing and validation step in the submission payload.

---

### Requirement 5: Backend — Terima dan Validasi Onboarding DTO

**User Story:** As a system, I want the backend to validate all incoming onboarding data before processing, so that only structurally correct data enters the database.

#### Acceptance Criteria

1. WHEN a create tenant request is received, THE system SHALL accept optional arrays `kelas`, `mata_pelajaran`, `siswa`, `guru_staff` (max 500 entries each), and `spp_bulanan` (max 13 entries) in the request body alongside the required tenant fields.
2. IF `guru_staff` contains an entry with a `role` value outside of `['admin', 'guru', 'kepala_sekolah', 'bendahara']`, THE system SHALL reject the request with an error message indicating which `role` value is invalid.
3. WHEN `guru_staff` array contains duplicate `email` values within the same request, THE system SHALL detect all matching email pairs and reject the request listing all duplicate email values found.
4. IF `guru_staff` contains an `email` that already exists in the `user` table for any tenant, THE system SHALL reject the request listing all conflicting email values.
5. IF `spp_bulanan` contains a `tingkat` value greater than the `jumlah_tingkat` value in the same request, or a `nominal` value less than 1, THE system SHALL reject the request with a descriptive error.
6. IF all onboarding arrays are absent or empty, THE system SHALL create the tenant and default admin user, returning the same response structure as a request without onboarding data.
7. WHEN a `guru_staff` entry is present, THE system SHALL require that it contains `nama` (string, max 255 characters), a valid `email` (max 255 characters), and a valid `role`; entries missing any of these fields SHALL be treated as validation failures.
8. IF `siswa` array contains duplicate `nisn` values (where `nisn` is not null or empty), THE system SHALL detect all matching NISN pairs and reject the request listing all duplicate NISN values found.

---

### Requirement 6: Backend — Eksekusi Onboarding dalam Transaksi Atomik

**User Story:** As a system, I want all onboarding entities to be created within a single database transaction, so that a partial failure leaves no orphaned data.

#### Acceptance Criteria

1. WHEN all validations pass, THE `Onboarding_Service` SHALL execute the following operations inside a single `Transaksi_Atomik` in order: (a) insert tenant, (b) insert `Tahun_Ajaran_Default`, (c) insert kelas dengan referensi ke tahun_ajaran_id, (d) insert mata_pelajaran, (e) insert default admin user (from `admin_nama`, `admin_email`) and all `guru_staff` users, (f) insert siswa dengan resolusi `kelas_id` dari nama kelas, (g) insert `Konfigurasi_SPP`; IF any step fails, THE `Onboarding_Service` SHALL rollback all changes so that no partial data persists.
2. THE `Onboarding_Service` SHALL create the `Tahun_Ajaran_Default` using timezone UTC+7 with: `nama = "YYYY/YYYY+1"` (berdasarkan tahun kalender saat proses berjalan), `tanggal_mulai = 1 Juli tahun ini`, `tanggal_selesai = 30 Juni tahun depan`, `status = 'disiapkan'`.
3. IF a column in `Sheet_Kelas` matches the pattern `tingkat_N` where N is an integer between 1 and 12, THE `Onboarding_Service` SHALL use N as the `tingkat` value for all kelas in that column; columns not matching this pattern SHALL be skipped.
4. WHEN a siswa's `kelas` field (nama kelas) does not match any kelas name created in step (c) of criterion 1, THE `Onboarding_Service` SHALL set the siswa's `kelas_id` to NULL rather than rejecting the entire transaction.
5. THE `Onboarding_Service` SHALL store each SPP entry as a key-value record in `konfigurasi_sekolah` with key `spp_nominal_tingkat_{tingkat}` and value as a JSON number.
6. WHEN any database operation inside the transaction fails, THE `Onboarding_Service` SHALL rollback all changes and return an error response indicating the operation failed — no partial data SHALL persist.
7. WHEN generating passwords for `guru_staff` users, THE `Onboarding_Service` SHALL generate a separate 12-character password for each user containing at least 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 special character from the set `!@#$%&*`; passwords SHALL be independent of each other.
8. THE `Onboarding_Service` SHALL create the default admin user (from `admin_nama`, `admin_email`) inside the `Transaksi_Atomik` with `role = 'admin'` and `must_change_password = true`.

---

### Requirement 7: Backend — Kirim Email Kredensial ke Guru & Staff

**User Story:** As a new school staff member, I want to receive an email with my login credentials immediately after the school is onboarded, so that I can log in to the system.

#### Acceptance Criteria

1. WHEN the `Transaksi_Atomik` commits successfully, THE `Onboarding_Service` SHALL enqueue one email job per `guru_staff` user into the `Email_Queue` using job type `'send-tenant-credentials'`.
2. THE email job payload SHALL include: `to` (email user), `tenantName` (nama sekolah), `adminName` (nama user), `email` (email user), `password` (raw password before hashing).
3. WHEN the `Transaksi_Atomik` commits successfully, THE `Onboarding_Service` SHALL enqueue one email job for the default admin user (from `admin_nama`, `admin_email`) using the same `'send-tenant-credentials'` job type with the admin's credentials.
4. IF a `guru_staff` user has a null or empty string `email` field, THE `Onboarding_Service` SHALL attempt to enqueue an email job; the failure SHALL be handled downstream by the queue processor without failing the overall onboarding operation.
5. IF enqueuing an email job fails (e.g., the queue is unavailable), THE `Onboarding_Service` SHALL log the failure and continue processing remaining email jobs — the overall onboarding operation SHALL NOT fail due to an email enqueue failure.

---

### Requirement 8: Validasi Data Parsing — Round-Trip Keamanan Tipe

**User Story:** As a system, I want all numeric and date fields from the Excel to be correctly typed before being sent to the backend, so that type errors do not cause silent data corruption.

#### Acceptance Criteria

1. THE `Excel_Parser` SHALL parse `tanggal_lahir` from `Sheet_Siswa` as a date string in ISO format `YYYY-MM-DD` before including it in the request payload.
2. THE `Excel_Parser` SHALL parse `nominal` from `Sheet_SPP` by stripping all non-digit characters from the raw cell value and converting the result to an integer before including it in the request payload; IF the result after stripping is zero or empty, THE `Excel_Parser` SHALL treat this as a parse failure and store the value as `null` for that row.
3. THE `Excel_Parser` SHALL parse `tingkat` from `Sheet_SPP` as an integer before including it in the request payload.
4. WHEN `tanggal_lahir` from `Sheet_Siswa` cannot be parsed as a valid date, THE `Excel_Parser` SHALL store the value as `null` for that siswa row and continue processing.
5. WHEN any date cell value in `Sheet_Siswa` is an Excel serial number (numeric format), THE `Excel_Parser` SHALL convert it to an ISO date string `YYYY-MM-DD` using the SheetJS date utility before including it in the request payload.
6. WHEN `nominal` from `Sheet_SPP` cannot be parsed to a valid positive integer after stripping non-digit characters, THE `Excel_Parser` SHALL store the value as `null` for that row and continue processing.
7. WHEN `tingkat` from `Sheet_SPP` cannot be parsed as a valid positive integer, THE `Excel_Parser` SHALL store the value as `null` for that row and continue processing.

---

### Requirement 9: Kompatibilitas Mundur — Endpoint Existing Tidak Rusak

**User Story:** As a system, I want the existing `POST /tenants` behavior to remain functional when no onboarding data is provided, so that any existing integrations or tests are not broken.

#### Acceptance Criteria

1. WHEN `POST /tenants` is called without any onboarding arrays, THE system SHALL create exactly one tenant record and one user record (the default admin), and SHALL return a response containing `id`, `tenant` (with `id`, `nama`, `email`), and `admin` (with `id`, `email`, `nama`).
2. IF any of the base tenant fields (`nama`, `email`, `jumlah_tingkat`, `admin_nama`, `admin_email`) are absent or fail their existing validation rules, THE system SHALL reject the request with the same validation error behavior as the current implementation.
3. WHEN `POST /tenants` is called with some onboarding arrays present and others absent, THE system SHALL process only the arrays that are present, treating absent arrays as empty, without rejecting the request.
4. THE response structure SHALL always include `id`, `tenant`, and `admin` fields regardless of whether onboarding data was provided; WHEN onboarding data was provided and processed, THE response SHALL additionally include an `onboarding_summary` field containing counts of created entities (kelas, mata_pelajaran, siswa, guru_staff, spp_bulanan).
