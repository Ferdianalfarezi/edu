# Requirements Document

## Introduction

Improve the auto-generation of kelas records when a new tahun ajaran is created. The current implementation copies from the active tahun ajaran only, with no opt-out mechanism. This feature refines the source selection logic to use the most recent tahun ajaran with kelas records (regardless of status), adds an admin-facing opt-out checkbox, and provides clear feedback about the generation result.

## Glossary

- **Tahun_Ajaran**: An academic year record belonging to a tenant. Has a status lifecycle: `disiapkan` → `aktif` → `nonaktif`.
- **Kelas**: A class/classroom record tied to a specific Tahun_Ajaran and tenant. Contains nama (e.g. "1A"), tingkat (grade level), kapasitas (max students), and optional wali_kelas_id (homeroom teacher).
- **Kelas_Generator**: The subsystem responsible for duplicating kelas structure from a source Tahun_Ajaran into a newly created Tahun_Ajaran.
- **Admin**: A user with the `admin` role who manages school data within a single tenant.
- **Tenant**: A school instance with isolated data in the multi-tenant system.
- **Source_Tahun_Ajaran**: The Tahun_Ajaran from which kelas structure is copied — determined as the most recent Tahun_Ajaran (by tanggal_mulai descending) that has at least one kelas record for the same tenant.
- **Create_Form**: The admin panel form for creating a new Tahun_Ajaran.

## Requirements

### Requirement 1: Source Selection for Kelas Duplication

**User Story:** As an admin, I want the system to find the most appropriate source for kelas duplication regardless of tahun ajaran status, so that kelas are generated even if no tahun ajaran is currently active.

#### Acceptance Criteria

1. WHEN a new Tahun_Ajaran is created with auto-generate enabled, THE Kelas_Generator SHALL identify the Source_Tahun_Ajaran as the most recent Tahun_Ajaran (by tanggal_mulai descending, then by created_at descending as tiebreaker) within the same Tenant that has at least one Kelas record.
2. WHEN identifying the Source_Tahun_Ajaran, THE Kelas_Generator SHALL exclude the newly created Tahun_Ajaran from the candidate pool.
3. IF no Tahun_Ajaran within the Tenant has any Kelas records (excluding the newly created Tahun_Ajaran), THEN THE Kelas_Generator SHALL skip auto-generation and return a count of zero duplicated kelas.
4. WHEN the Source_Tahun_Ajaran is identified, THE Kelas_Generator SHALL select exactly one Tahun_Ajaran regardless of its status (disiapkan, aktif, or nonaktif).

### Requirement 2: Kelas Structure Duplication

**User Story:** As an admin, I want the generated kelas to preserve class names, grade levels, and capacity from the source, so that I don't need to re-enter this information every year.

#### Acceptance Criteria

1. WHEN the Kelas_Generator duplicates kelas from the Source_Tahun_Ajaran, THE Kelas_Generator SHALL copy the nama, tingkat, and kapasitas fields of each Kelas record.
2. WHEN the Kelas_Generator creates a duplicated Kelas, THE Kelas_Generator SHALL set wali_kelas_id to null.
3. WHEN the Kelas_Generator creates a duplicated Kelas, THE Kelas_Generator SHALL associate the new Kelas with the newly created Tahun_Ajaran and the same Tenant.
4. THE Kelas_Generator SHALL produce exactly the same number of Kelas records in the target Tahun_Ajaran as exist in the Source_Tahun_Ajaran.

### Requirement 3: Opt-Out Mechanism

**User Story:** As an admin, I want the option to skip kelas generation when creating a new tahun ajaran, so that I can start with a clean slate in rare cases where the school restructures its classes.

#### Acceptance Criteria

1. THE Create_Form SHALL display a checkbox labeled "Generate kelas dari tahun sebelumnya" that is checked by default.
2. WHEN the Admin unchecks the checkbox and submits the form, THE Kelas_Generator SHALL not create any Kelas records for the new Tahun_Ajaran, and THE System SHALL return a response with `duplicatedClassCount` equal to 0.
3. WHEN the Admin submits the form with the checkbox checked, THE Kelas_Generator SHALL proceed with kelas duplication from the Source_Tahun_Ajaran.
4. THE Create_Form SHALL include the opt-out preference as a boolean field `generate_kelas` (default: `true`) in the API request payload.
5. IF the Admin submits the form with the checkbox checked but no Source_Tahun_Ajaran exists for the tenant, THEN THE System SHALL create the new Tahun_Ajaran with zero Kelas records and return a response with `duplicatedClassCount` equal to 0.

### Requirement 4: API Contract for Generate Option

**User Story:** As a developer, I want the create tahun ajaran endpoint to accept a generate flag, so that the frontend can control auto-generation behavior.

#### Acceptance Criteria

1. THE Tahun_Ajaran API endpoint (POST /tahun-ajaran) SHALL accept an optional boolean field `generate_kelas` in the request body.
2. WHEN the `generate_kelas` field is omitted from the request, THE Kelas_Generator SHALL treat the value as true (generate by default).
3. WHEN the `generate_kelas` field is set to false, THE Kelas_Generator SHALL skip kelas duplication entirely and return `duplicatedClassCount` equal to 0.
4. THE Tahun_Ajaran API endpoint SHALL include a `duplicatedClassCount` field in the response indicating the number of kelas records created.

### Requirement 5: User Feedback on Generation Result

**User Story:** As an admin, I want to see how many kelas were generated after creating a tahun ajaran, so that I can verify the operation completed correctly.

#### Acceptance Criteria

1. WHEN a Tahun_Ajaran is created with auto-generation enabled and the API response contains a `duplicatedClassCount` greater than zero, THE Create_Form SHALL display a success toast notification containing the exact numeric value of kelas generated (e.g., "Berhasil membuat tahun ajaran. 12 kelas di-generate dari tahun sebelumnya.").
2. WHEN a Tahun_Ajaran is created with auto-generation enabled and the API response contains a `duplicatedClassCount` of zero, THE Create_Form SHALL display an informational toast notification stating that no kelas were generated because no previous tahun ajaran with kelas data was found.
3. WHEN a Tahun_Ajaran is created with auto-generation disabled, THE Create_Form SHALL display a success toast notification confirming the Tahun_Ajaran was created without generating kelas.
4. IF the API request to create a Tahun_Ajaran fails, THEN THE Create_Form SHALL display an error toast notification indicating the failure reason from the API response, and SHALL NOT navigate away from the form so that the Admin's input is preserved.

### Requirement 6: Data Isolation

**User Story:** As an admin, I want kelas generation to be scoped to my school only, so that data from other tenants is never accessed or copied.

#### Acceptance Criteria

1. THE Kelas_Generator SHALL only consider Tahun_Ajaran and Kelas records belonging to the same Tenant as the newly created Tahun_Ajaran.
2. THE Kelas_Generator SHALL assign the same tenant_id to all generated Kelas records as the target Tahun_Ajaran.
3. IF the source Tahun_Ajaran does not belong to the same Tenant as the target Tahun_Ajaran, THEN THE Kelas_Generator SHALL reject the operation and return an error indicating a tenant mismatch.
