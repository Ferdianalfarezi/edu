# Requirements Document

## Introduction

Fitur ini menambahkan pengaturan hari kerja sekolah (5 hari atau 6 hari) pada level tenant. Pengaturan ini menentukan apakah hari Sabtu dianggap sebagai hari aktif untuk penjadwalan dan perhitungan absensi. Setting ditentukan saat pembuatan tenant oleh superadmin dan dapat diubah oleh admin sekolah melalui modul konfigurasi.

## Glossary

- **Tenant**: Entitas sekolah dalam sistem multi-tenant; setiap tenant memiliki data terisolasi
- **Superadmin**: Pengguna yang mengelola seluruh tenant dari dashboard terpusat
- **Admin**: Pengguna pengelola sekolah yang dapat mengatur konfigurasi tenant-nya
- **Hari_Kerja**: Pengaturan jumlah hari aktif sekolah dalam seminggu, bernilai `5_hari` (Senin-Jumat) atau `6_hari` (Senin-Sabtu)
- **Jadwal_Module**: Modul yang mengelola jadwal pelajaran per kelas per hari
- **Absensi_Module**: Modul yang mencatat dan menghitung kehadiran siswa harian
- **Hari_Aktif**: Hari-hari dalam seminggu di mana sekolah beroperasi sesuai pengaturan Hari_Kerja

## Requirements

### Requirement 1: Penyimpanan Pengaturan Hari Kerja

**User Story:** As a superadmin, I want to set the working days configuration when creating a new school tenant, so that the system knows which days are active for that school.

#### Acceptance Criteria

1. THE Tenant schema SHALL store a `hari_kerja` field with allowed values `5_hari` or `6_hari`
2. THE Tenant schema SHALL default the `hari_kerja` field to `6_hari` when no value is provided
3. WHEN a superadmin creates a new tenant, THE Create_Tenant endpoint SHALL accept an optional `hari_kerja` field as part of the request payload, applying the default value of `6_hari` when the field is omitted or null
4. IF the `hari_kerja` field value is present and not `5_hari` or `6_hari`, THEN THE Create_Tenant endpoint SHALL reject the request with a validation error message indicating the allowed values

### Requirement 2: Pemilihan Hari Kerja di Form Pembuatan Tenant

**User Story:** As a superadmin, I want to select the working days type in the tenant creation form, so that I can configure it appropriately for each school.

#### Acceptance Criteria

1. WHEN the superadmin opens the tenant creation form, THE Tenant_Management_View SHALL display a `hari_kerja` selection field with exactly two options: "5 Hari (Senin-Jumat)" mapped to value `5_hari`, and "6 Hari (Senin-Sabtu)" mapped to value `6_hari`
2. THE Tenant_Management_View SHALL pre-select "6 Hari (Senin-Sabtu)" as the default value in the creation form so that the field always has a valid selection
3. WHEN the superadmin submits the creation form, THE Tenant_Management_View SHALL include the selected `hari_kerja` mapped value (`5_hari` or `6_hari`) in the API request payload
4. IF the tenant creation API request fails, THEN THE Tenant_Management_View SHALL display an error message indicating the creation was unsuccessful and SHALL preserve the form field values including the selected `hari_kerja` option
5. THE Tenant_Management_View SHALL display the `hari_kerja` selection field only in creation mode, not in the tenant edit form

### Requirement 3: Perubahan Hari Kerja oleh Admin

**User Story:** As a school admin, I want to change the working days setting for my school, so that I can adjust it when school policy changes between academic years.

#### Acceptance Criteria

1. WHEN an admin accesses the school configuration page, THE Konfigurasi_Module SHALL display the current `hari_kerja` setting as a radio button or select with options "5 Hari (Senin-Jumat)" and "6 Hari (Senin-Sabtu)"
2. WHEN an admin updates the `hari_kerja` setting, THE Konfigurasi_Module SHALL save the new value to the tenant record and display a success confirmation message
3. WHEN an admin attempts to change the `hari_kerja` setting, THE Konfigurasi_Module SHALL display a warning before saving that states "Perubahan ini akan mempengaruhi jadwal dan perhitungan absensi", requiring user confirmation before proceeding
4. THE Update_Tenant_Hari_Kerja endpoint SHALL only accept requests from users with `admin` or `super_admin` role and SHALL return a 403 Forbidden response for unauthorized roles
5. IF the `hari_kerja` value submitted to the Update endpoint is not `5_hari` or `6_hari`, THEN THE endpoint SHALL reject the request with a 400 Bad Request response indicating the allowed values

### Requirement 4: Pembatasan Jadwal Berdasarkan Hari Kerja

**User Story:** As a school admin, I want the schedule module to respect the working days setting, so that Saturday schedules are not created for 5-day schools.

#### Acceptance Criteria

1. WHILE the Tenant Hari_Kerja is set to `5_hari`, THE Jadwal_Module SHALL only allow schedule entries for Senin through Jumat (days 1–5)
2. WHILE the Tenant Hari_Kerja is set to `6_hari`, THE Jadwal_Module SHALL allow schedule entries for Senin through Sabtu (days 1–6) and SHALL reject Minggu (day 0/7)
3. WHEN a schedule entry is submitted for a day outside the Hari_Aktif, THE Jadwal_Module SHALL reject the request with a 400 Bad Request response and error message "Hari {nama_hari} bukan hari aktif untuk sekolah ini"
4. WHEN the Hari_Kerja setting is changed from `6_hari` to `5_hari`, THE Jadwal_Module SHALL retain existing Saturday schedules in the database but SHALL exclude them from the active jadwal queries and display
5. WHEN the Hari_Kerja setting is changed from `5_hari` to `6_hari`, THE Jadwal_Module SHALL re-include any previously excluded Saturday schedules in active jadwal queries

### Requirement 5: Perhitungan Absensi Berdasarkan Hari Kerja

**User Story:** As a school admin, I want attendance calculations to respect the working days setting, so that Saturday is excluded from attendance records for 5-day schools.

#### Acceptance Criteria

1. WHILE the Tenant Hari_Kerja is set to `5_hari`, THE Absensi_Module SHALL exclude Sabtu from the hari_efektif (effective school days) count, counting only Senin through Jumat minus holidays when computing attendance percentages
2. WHILE the Tenant Hari_Kerja is set to `6_hari`, THE Absensi_Module SHALL include Sabtu in the hari_efektif count, counting Senin through Sabtu minus holidays when computing attendance percentages
3. WHILE the Tenant Hari_Kerja is set to `5_hari`, THE Absensi_Module SHALL not return Sabtu in the list of available days for attendance recording via the kelas-hari-ini endpoint, and SHALL reject attendance submissions where the tanggal falls on a Sabtu
4. THE Absensi_Module SHALL use the Hari_Kerja setting of the tenant at the time of computation when calculating attendance percentages and rekap summaries
5. IF the Tenant Hari_Kerja is changed from `6_hari` to `5_hari`, THEN THE Absensi_Module SHALL retain existing Saturday attendance records but SHALL exclude them from future percentage and rekap calculations

### Requirement 6: Penampilan Hari Kerja di Daftar Tenant

**User Story:** As a superadmin, I want to see the working days setting for each school in the tenant list, so that I can quickly identify school schedules.

#### Acceptance Criteria

1. THE Tenant_Management_View SHALL display the `hari_kerja` value as a dedicated column in the tenant list table for each tenant
2. THE Tenant_Management_View SHALL display `hari_kerja` with the mapped label "5 Hari" when the value is `5_hari`, and "6 Hari" when the value is `6_hari`
3. IF the `hari_kerja` value is not available for a tenant, THEN THE Tenant_Management_View SHALL display "6 Hari" as the default label
