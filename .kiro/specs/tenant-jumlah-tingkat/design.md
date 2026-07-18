# Technical Design: Jumlah Tingkat per Tenant

## Overview

Add a structural `jumlah_tingkat` integer column to the `tenant` table that determines the number of grade levels a school supports (e.g., 3 for SMP/SMA, 6 for SD). This value is set at creation time by super_admin and is immutable. It affects kelas creation validation, graduation logic, and SPP configuration display.

## Architecture

### Data Layer Changes

```
┌──────────────────────────────────────────────────────────────────┐
│ tenant table                                                      │
├──────────────────────────────────────────────────────────────────┤
│ + jumlah_tingkat INTEGER NOT NULL DEFAULT 6 CHECK(1..13)         │
│   Set at creation, never updated                                  │
└──────────────────────────────────────────────────────────────────┘
         │
         │ Referenced by:
         ▼
┌─────────────────────┐   ┌──────────────────────────┐   ┌────────────────────────┐
│ KelasService        │   │ KenaikanKelasService     │   │ KonfigurasiService     │
│ validate tingkat    │   │ is_highest_grade logic   │   │ SPP validation         │
│ <= jumlah_tingkat   │   │ tingkat >= jumlah_tingkat│   │ keys must match N      │
└─────────────────────┘   └──────────────────────────┘   └────────────────────────┘
```

### Module Dependencies

```
TenantModule (exports TenantService.getJumlahTingkat)
     │
     ├── KelasModule (imports TenantModule for tingkat validation)
     ├── KenaikanKelasModule (imports TenantModule for graduation logic)
     └── KonfigurasiModule (imports TenantModule for SPP validation)
```

## Components and Interfaces

### API Layer

#### TenantService — new method

```typescript
/**
 * Returns the jumlah_tingkat for a given tenant.
 * Used by KelasService, KenaikanKelasService, and KonfigurasiService.
 */
async getJumlahTingkat(tenantId: string): Promise<number>;
```

#### TenantService — new method: getTenantProfile

```typescript
/**
 * Returns tenant profile including jumlah_tingkat for non-super-admin roles.
 * Used by admin panel to know school's structure.
 */
async getTenantProfile(tenantId: string): Promise<{ id: string; nama: string; jumlahTingkat: number }>;
```

#### TenantController — new endpoint

```typescript
@Get('profile')
@Roles(Role.ADMIN, Role.KEPALA_SEKOLAH, Role.BENDAHARA, Role.GURU)
async getTenantProfile(@TenantId() tenantId: string): Promise<TenantProfile>;
```

#### CreateTenantDto — new field

```typescript
@IsInt()
@Min(1)
@Max(13)
jumlah_tingkat: number;
```

#### KelasService.createKelas — new validation step

```typescript
// Before existing validation:
const jumlahTingkat = await this.tenantService.getJumlahTingkat(tenantId);
if (dto.tingkat > jumlahTingkat) {
  throw new BadRequestException(
    `Tingkat ${dto.tingkat} melebihi batas maksimum (${jumlahTingkat}) untuk sekolah ini`,
  );
}
```

#### KenaikanKelasService.previewPromotion — logic change

```typescript
// Replace: is_highest_grade: !targetKelas
// With:
const jumlahTingkat = await this.tenantService.getJumlahTingkat(tenantId);
const isHighestGrade = sourceKelas.tingkat >= jumlahTingkat;

let targetKelas = null;
if (!isHighestGrade) {
  // search for target kelas at tingkat+1
}

return { is_highest_grade: isHighestGrade, target_kelas: targetKelas ? {...} : null };
```

#### KonfigurasiService — SPP validation in bulkUpsertConfig

```typescript
if (body.nominal_spp) {
  const jumlahTingkat = await this.tenantService.getJumlahTingkat(tenantId);
  // Validate exactly N keys (tingkat_1..tingkat_N), reject extras
}
```

### Admin Panel (Vue 3)

#### KonfigurasiView.vue — SPP section changes

- Fetch `jumlahTingkat` from `GET /tenants/profile` on mount
- Render exactly N input fields (fixed count, no add/remove buttons)
- Tingkat label is read-only ("Tingkat 1", "Tingkat 2", etc.)

#### TenantManagementView.vue — create form changes

- Add `jumlah_tingkat` number input (required, min 1, max 13)
- Only shown in create mode; read-only display in edit mode
- Helper text: "SD = 6, SMP/SMA = 3"

## Data Models

### Tenant Table — Schema Change

```typescript
// apps/api/src/drizzle/schema/tenant.ts
import { pgTable, uuid, varchar, text, boolean, integer, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const tenant = pgTable('tenant', {
  id: uuid('id').primaryKey().defaultRandom(),
  nama: varchar('nama', { length: 255 }).notNull(),
  alamat: text('alamat'),
  telepon: varchar('telepon', { length: 20 }),
  email: varchar('email', { length: 255 }),
  logoUrl: varchar('logo_url', { length: 500 }),
  jumlahTingkat: integer('jumlah_tingkat').notNull().default(6), // NEW
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  jumlahTingkatCheck: check('chk_jumlah_tingkat', sql`${table.jumlahTingkat} BETWEEN 1 AND 13`),
}));
```

### Migration SQL

```sql
-- Add column with safe default for existing rows
ALTER TABLE tenant ADD COLUMN jumlah_tingkat INTEGER NOT NULL DEFAULT 6;
ALTER TABLE tenant ADD CONSTRAINT chk_jumlah_tingkat CHECK (jumlah_tingkat BETWEEN 1 AND 13);

-- Adjust existing tenants whose kelas already exceed the default
UPDATE tenant t
SET jumlah_tingkat = sub.max_tingkat
FROM (
  SELECT k.tenant_id, MAX(k.tingkat) AS max_tingkat
  FROM kelas k
  GROUP BY k.tenant_id
  HAVING MAX(k.tingkat) > 6
) sub
WHERE t.id = sub.tenant_id;
```

### Seed Data Change

In `seed.ts`: add `jumlahTingkat: 3` to the "Sekolah Contoh" tenant insert values.

### API Response Shapes

#### GET /tenants/profile

```json
{
  "id": "uuid",
  "nama": "Sekolah Contoh",
  "jumlah_tingkat": 3
}
```

#### GET /tenants (list — super admin)

```json
{
  "data": [
    {
      "id": "uuid",
      "nama": "Sekolah Contoh",
      "jumlah_tingkat": 3,
      "is_active": true,
      "user_count": 10,
      "created_at": "..."
    }
  ]
}
```

#### POST /tenants (create)

Request:
```json
{
  "nama": "SMP Nusantara",
  "email": "info@smpnusantara.sch.id",
  "jumlah_tingkat": 3,
  "admin_nama": "Admin SMP",
  "admin_email": "admin@smpnusantara.sch.id"
}
```

## Error Handling

| Scenario | HTTP Status | Error Message |
|----------|-------------|---------------|
| Create tenant without `jumlah_tingkat` | 400 | "jumlah_tingkat should not be empty" |
| `jumlah_tingkat` < 1 or > 13 | 400 | "jumlah_tingkat must not be less than 1" / "must not be greater than 13" |
| `jumlah_tingkat` not integer | 400 | "jumlah_tingkat must be an integer number" |
| Create kelas with tingkat > jumlah_tingkat | 400 | "Tingkat {n} melebihi batas maksimum ({max}) untuk sekolah ini" |
| Update kelas with tingkat > jumlah_tingkat | 400 | "Tingkat {n} melebihi batas maksimum ({max}) untuk sekolah ini" |
| SPP save with missing tingkat entry | 400 | "Nominal SPP untuk tingkat {n} wajib diisi" |
| SPP save with extra tingkat beyond limit | 400 | "Tingkat SPP melebihi batas (maks {max}): tingkat_4, ..." |
| Attempt to update jumlah_tingkat | N/A | Silently ignored (field not in UpdateTenantDto) |

## Correctness Properties

### Property 1: Immutability Invariant

Once a tenant is created, `jumlah_tingkat` never changes. No code path exists that calls `UPDATE tenant SET jumlah_tingkat = ...`. The UpdateTenantDto does not include this field, and even if sent in request body, it is stripped before processing.

**Validates: Requirements 1.4, 3.1, 3.2**

### Property 2: Kelas Constraint

For any kelas record `k` with tenant `t`: `k.tingkat <= t.jumlah_tingkat`. Enforced at service layer on create and update operations. The database CHECK constraint on `jumlah_tingkat` itself ensures the tenant value is between 1 and 13.

**Validates: Requirements 4.1, 4.2, 4.4**

### Property 3: Graduation Determinism

`is_highest_grade` is always computed as `sourceKelas.tingkat >= tenant.jumlah_tingkat`. This is deterministic and does not depend on whether a target kelas happens to exist in the target tahun ajaran. A school with `jumlah_tingkat = 3` always graduates students at tingkat 3.

**Validates: Requirements 5.1, 5.2, 5.5**

### Property 4: SPP Completeness

After a successful save, the `nominal_spp` JSONB contains exactly keys `tingkat_1` through `tingkat_N` where N = `jumlah_tingkat`. No extra keys are allowed, and all keys within range are required.

**Validates: Requirements 6.2, 6.4, 6.5**

### Property 5: Migration Safety

After migration completes, no tenant has `jumlah_tingkat` less than the maximum `tingkat` value across its kelas records. Existing data is always valid against the new constraint.

**Validates: Requirements 7.3, 7.4, 7.5**

### Property 6: Database Constraint

CHECK constraint at the database level prevents invalid `jumlah_tingkat` values (< 1 or > 13) even if application-layer validation is bypassed.

**Validates: Requirements 1.1, 1.2, 2.3**

## Testing Strategy

- **Unit tests**: `TenantService.getJumlahTingkat`, kelas creation rejection when tingkat exceeds limit, KenaikanKelas is_highest_grade logic with mocked tenant
- **Integration tests**: Full flow of creating tenant with jumlah_tingkat, creating kelas at boundary, previewing kenaikan kelas at highest grade
- **Contract tests**: Endpoint validation for POST /tenants (missing field, out of range), POST /kelas (exceeds limit), PATCH /konfigurasi (SPP validation)
