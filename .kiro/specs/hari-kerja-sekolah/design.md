# Design Document: Hari Kerja Sekolah

## Overview

Fitur ini menambahkan pengaturan hari kerja sekolah (`5_hari` atau `6_hari`) ke level tenant, mempengaruhi tiga modul: Jadwal (validasi hari), Absensi (perhitungan hari efektif), dan Admin Panel (UI konfigurasi). Desain mengikuti pola yang sudah diterapkan untuk `jumlah_tingkat` — kolom pada tabel tenant, diekspos via TenantService helper, dan dikonsumsi oleh modul lain melalui dependency injection.

Perbedaan utama dengan `jumlah_tingkat`: field `hari_kerja` bersifat **mutable** oleh admin sekolah (bukan hanya superadmin saat pembuatan), sehingga perlu mekanisme update terpisah di KonfigurasiView dan endpoint PATCH.

## Architecture

```mermaid
flowchart TD
    subgraph "Admin Panel (Vue 3)"
        TMV[TenantManagementView]
        KV[KonfigurasiView]
    end

    subgraph "API Layer (NestJS)"
        TC[TenantController]
        TS[TenantService]
        KS[KonfigurasiService]
        JS[JadwalService]
        AS[AbsensiService]
    end

    subgraph "Data Layer (Drizzle + PostgreSQL)"
        TT[tenant table<br/>+ hari_kerja column]
    end

    TMV -->|POST /tenants<br/>hari_kerja in payload| TC
    KV -->|PATCH /tenants/hari-kerja<br/>new value| TC
    TC --> TS
    TS --> TT

    KV -->|GET /tenants/profile<br/>reads hari_kerja| TC
    TC --> TS

    JS -->|getHariKerja(tenantId)| TS
    AS -->|getHariKerja(tenantId)| TS
    KS -->|getHariKerja(tenantId)| TS

    TS --> TT
```

**Data flow:**
1. Superadmin sets `hari_kerja` saat membuat tenant via TenantManagementView → POST /tenants
2. Admin sekolah mengubah `hari_kerja` via KonfigurasiView → PATCH /tenants/hari-kerja
3. JadwalService memanggil `TenantService.getHariKerja()` saat validasi pembuatan jadwal
4. AbsensiService memanggil `TenantService.getHariKerja()` saat menghitung hari efektif dan memfilter kelas-hari-ini
5. GET /tenants/profile mengembalikan `hari_kerja` ke frontend untuk display

## Components and Interfaces

### Backend Changes

#### 1. Schema: `apps/api/src/drizzle/schema/tenant.ts`

Tambah kolom `hari_kerja` pada tabel tenant:

```typescript
hariKerja: varchar('hari_kerja', { length: 10 }).notNull().default('6_hari'),
```

Tambah CHECK constraint:

```typescript
hariKerjaCheck: check('chk_hari_kerja', sql`${table.hariKerja} IN ('5_hari', '6_hari')`),
```

#### 2. DTO: `CreateTenantDto`

Tambah field optional:

```typescript
@IsOptional()
@IsIn(['5_hari', '6_hari'], { message: 'hari_kerja harus bernilai 5_hari atau 6_hari' })
hari_kerja?: '5_hari' | '6_hari';
```

#### 3. DTO: `UpdateHariKerjaDto` (new file)

```typescript
export class UpdateHariKerjaDto {
  @IsNotEmpty()
  @IsIn(['5_hari', '6_hari'], { message: 'hari_kerja harus bernilai 5_hari atau 6_hari' })
  hari_kerja: '5_hari' | '6_hari';
}
```

#### 4. TenantService — new methods & changes

```typescript
// New helper method
async getHariKerja(tenantId: string): Promise<'5_hari' | '6_hari'> {
  const result = await this.db
    .select({ hariKerja: tenant.hariKerja })
    .from(tenant)
    .where(eq(tenant.id, tenantId))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundException(`Tenant dengan id ${tenantId} tidak ditemukan`);
  }
  return result[0].hariKerja as '5_hari' | '6_hari';
}

// New update method
async updateHariKerja(tenantId: string, hariKerja: '5_hari' | '6_hari'): Promise<{ message: string }> {
  const tenants = await this.db.select().from(tenant).where(eq(tenant.id, tenantId)).limit(1);
  if (tenants.length === 0) {
    throw new NotFoundException(`Tenant dengan id ${tenantId} tidak ditemukan`);
  }
  await this.db
    .update(tenant)
    .set({ hariKerja, updatedAt: new Date() })
    .where(eq(tenant.id, tenantId));
  return { message: 'Hari kerja berhasil diperbarui' };
}
```

Modifikasi `createTenant()`: tambah `hariKerja: dto.hari_kerja ?? '6_hari'` ke INSERT values.

Modifikasi `getTenantProfile()`: tambah `hari_kerja` ke response object.

Modifikasi `listTenants()`/`listTenantsPaginated()`: tambah `hariKerja` ke select dan mapping response.

#### 5. TenantController — new endpoint

```typescript
@Patch('hari-kerja')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@HttpCode(HttpStatus.OK)
async updateHariKerja(
  @TenantId() tenantId: string,
  @Body() dto: UpdateHariKerjaDto,
): Promise<{ message: string }> {
  return this.tenantService.updateHariKerja(tenantId, dto.hari_kerja);
}
```

**Note:** Endpoint menggunakan `@TenantId()` decorator (dari JWT), bukan path param. Admin hanya bisa mengubah tenant sendiri.

#### 6. JadwalService — validasi hari

Tambah validasi di method `create()` dan `update()`:

```typescript
// Inject TenantService
constructor(
  private readonly drizzleService: DrizzleService,
  private readonly tenantService: TenantService,  // NEW
) {}

// In create() — before existing validations:
private async validateHariKerja(tenantId: string, hari: string): Promise<void> {
  const hariKerja = await this.tenantService.getHariKerja(tenantId);
  const allowedDays = hariKerja === '5_hari'
    ? ['senin', 'selasa', 'rabu', 'kamis', 'jumat']
    : ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

  if (!allowedDays.includes(hari)) {
    const namaHari = hari.charAt(0).toUpperCase() + hari.slice(1);
    throw new BadRequestException(
      `Hari ${namaHari} bukan hari aktif untuk sekolah ini`
    );
  }
}
```

Modifikasi `findAll()`: filter Saturday jadwal when tenant is `5_hari`:

```typescript
// After building conditions, check hari_kerja
const hariKerja = await this.tenantService.getHariKerja(tenantId);
if (hariKerja === '5_hari') {
  conditions.push(sql`${jadwalPelajaran.hari} != 'sabtu'`);
}
```

#### 7. AbsensiService — perhitungan hari efektif

Modifikasi `countWeekdays()` → menjadi `countSchoolDays()` yang menerima parameter `hariKerja`:

```typescript
private countSchoolDays(startDate: string, endDate: string, hariKerja: '5_hari' | '6_hari'): number {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  let count = 0;
  const maxDay = hariKerja === '5_hari' ? 5 : 6; // 5=Friday, 6=Saturday

  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= maxDay) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}
```

Modifikasi `calculateHariEfektifForMonth()`: fetch `hariKerja` dan pass ke `countSchoolDays()`.

Modifikasi `getKelasHariIni()`: jika `hariKerja === '5_hari'` dan hari ini Sabtu, return empty list (sama seperti Minggu).

Modifikasi `createAbsensi()`: jika `hariKerja === '5_hari'` dan tanggal yang disubmit jatuh pada Sabtu, reject.

### Frontend Changes

#### 8. TenantManagementView — form pembuatan

Tambah field select di create form (setelah jumlah_tingkat):

```vue
<!-- Hari Kerja (create mode only) -->
<div v-if="!editingTenant" class="mb-4">
  <label class="block text-sm font-medium text-text-primary mb-1.5">Hari Kerja</label>
  <select v-model="form.hari_kerja" class="w-full px-3 py-2 text-sm border ...">
    <option value="6_hari">6 Hari (Senin-Sabtu)</option>
    <option value="5_hari">5 Hari (Senin-Jumat)</option>
  </select>
</div>
```

Tambah kolom "Hari Kerja" di tabel list tenant (antara "Jumlah User" dan "Status"):

```vue
<td class="px-4 py-3 text-sm text-text-secondary">
  {{ tenant.hari_kerja === '5_hari' ? '5 Hari' : '6 Hari' }}
</td>
```

#### 9. KonfigurasiView — section baru

Tambah section "Hari Kerja Sekolah" di atas "Pengaturan Umum":

```vue
<section class="bg-white border border-border rounded-xl p-5 mb-4">
  <h2 class="text-base font-semibold text-text-primary mb-4">Hari Kerja Sekolah</h2>
  <div class="flex items-center gap-4">
    <label class="flex items-center gap-2 cursor-pointer">
      <input type="radio" v-model="hariKerja" value="5_hari" />
      <span class="text-sm">5 Hari (Senin-Jumat)</span>
    </label>
    <label class="flex items-center gap-2 cursor-pointer">
      <input type="radio" v-model="hariKerja" value="6_hari" />
      <span class="text-sm">6 Hari (Senin-Sabtu)</span>
    </label>
  </div>
  <p class="text-xs text-text-tertiary mt-2">
    Perubahan ini akan mempengaruhi jadwal dan perhitungan absensi.
  </p>
  <button @click="updateHariKerja" class="mt-3 px-3 py-2 text-sm ...">
    Simpan Hari Kerja
  </button>
</section>
```

Method `updateHariKerja()` menampilkan confirmation dialog sebelum PATCH.

## Data Models

### Tenant Table — Migration

```sql
ALTER TABLE tenant
  ADD COLUMN hari_kerja VARCHAR(10) NOT NULL DEFAULT '6_hari';

ALTER TABLE tenant
  ADD CONSTRAINT chk_hari_kerja CHECK (hari_kerja IN ('5_hari', '6_hari'));
```

### Drizzle Schema Change

```typescript
export const tenant = pgTable(
  'tenant',
  {
    // ... existing columns
    hariKerja: varchar('hari_kerja', { length: 10 }).notNull().default('6_hari'),
  },
  (table) => ({
    jumlahTingkatCheck: check('chk_jumlah_tingkat', sql`${table.jumlahTingkat} BETWEEN 1 AND 13`),
    hariKerjaCheck: check('chk_hari_kerja', sql`${table.hariKerja} IN ('5_hari', '6_hari')`),
  }),
);
```

### API Response Changes

**GET /tenants/profile** response:
```json
{
  "id": "uuid",
  "nama": "SD Negeri 1",
  "jumlah_tingkat": 6,
  "hari_kerja": "6_hari"
}
```

**GET /tenants** (list) response item:
```json
{
  "id": "uuid",
  "nama": "...",
  "hari_kerja": "6_hari",
  "jumlah_tingkat": 6,
  "..."
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Hari kerja validation accepts only valid values

*For any* string value, the hari_kerja validation function SHALL accept the value if and only if it equals `'5_hari'` or `'6_hari'`; all other strings SHALL be rejected.

**Validates: Requirements 1.1, 1.4, 3.5**

### Property 2: Role authorization for hari_kerja update

*For any* user role, the update hari_kerja endpoint SHALL return success (200) if the role is `admin` or `super_admin`, and SHALL return 403 Forbidden for all other roles.

**Validates: Requirements 3.4**

### Property 3: Jadwal day validation respects hari_kerja setting

*For any* tenant with a given `hari_kerja` setting and any day name, jadwal creation SHALL succeed if and only if the day is within the allowed set (`{senin..jumat}` for `5_hari`, `{senin..sabtu}` for `6_hari`).

**Validates: Requirements 4.1, 4.2, 4.3**

### Property 4: Saturday schedule visibility round-trip

*For any* tenant with existing Saturday jadwal records, changing `hari_kerja` from `6_hari` to `5_hari` SHALL exclude Saturday records from query results, and changing back to `6_hari` SHALL restore their visibility — the record set returned after the round-trip SHALL equal the original set.

**Validates: Requirements 4.4, 4.5**

### Property 5: Hari efektif metamorphic — 5_hari always ≤ 6_hari

*For any* month and year, the hari_efektif computed with `hari_kerja = '5_hari'` SHALL be less than or equal to the hari_efektif computed with `hari_kerja = '6_hari'` for the same month, given the same set of holidays.

**Validates: Requirements 5.1, 5.2**

### Property 6: Saturday attendance rejection for 5_hari tenants

*For any* tenant with `hari_kerja = '5_hari'` and any date that falls on a Saturday, attendance submission SHALL be rejected, and kelas-hari-ini SHALL return an empty class list.

**Validates: Requirements 5.3**

### Property 7: Saturday attendance records excluded from calculations after switch

*For any* tenant that switches from `6_hari` to `5_hari` and has existing Saturday attendance records, those records SHALL still exist in the database but SHALL be excluded from rekap percentage calculations.

**Validates: Requirements 5.5**

## Error Handling

| Scenario | HTTP Status | Error Message | Module |
|----------|-------------|---------------|--------|
| Invalid `hari_kerja` value in CreateTenantDto | 400 | `hari_kerja harus bernilai 5_hari atau 6_hari` | TenantController |
| Invalid `hari_kerja` value in UpdateHariKerjaDto | 400 | `hari_kerja harus bernilai 5_hari atau 6_hari` | TenantController |
| Non-admin/superadmin attempts hari_kerja update | 403 | `Forbidden resource` | RolesGuard |
| Jadwal creation on non-active day | 400 | `Hari {NamaHari} bukan hari aktif untuk sekolah ini` | JadwalService |
| Attendance submission on Saturday for 5_hari tenant | 400 | `Hari Sabtu bukan hari aktif untuk sekolah ini` | AbsensiService |
| Tenant not found during getHariKerja | 404 | `Tenant dengan id {id} tidak ditemukan` | TenantService |
| DB constraint violation (CHECK) | 500 (shouldn't reach — validated before insert) | Internal server error | PostgreSQL |

## Testing Strategy

### Unit Tests (example-based)

- **CreateTenantDto validation**: omission defaults, valid values accepted, invalid rejected
- **TenantManagementView**: form rendering, default selection, column display mapping
- **KonfigurasiView**: section rendering, confirmation dialog, save flow
- **getTenantProfile response**: includes `hari_kerja` field
- **listTenants response**: includes `hari_kerja` column

### Property-Based Tests (fast-check)

Property-based testing is appropriate here because the validation and calculation logic involves clear input/output behavior with meaningful variation across inputs (arbitrary strings, day names, date ranges).

**Library:** fast-check (already installed in project)
**Minimum iterations:** 100 per property test

Each property test must be tagged with:
```
Feature: hari-kerja-sekolah, Property {N}: {property_text}
```

Properties to implement:
1. **Validation property** (P1): Generate arbitrary strings → only '5_hari'/'6_hari' pass
2. **Role authorization** (P2): Generate from role enum → only admin/super_admin succeed
3. **Jadwal day validation** (P3): Generate (hariKerja, day) tuples → verify allowed-set membership
4. **Schedule visibility round-trip** (P4): Generate Saturday jadwal, toggle setting, verify visibility
5. **Hari efektif metamorphic** (P5): Generate month/year → verify 5_hari ≤ 6_hari
6. **Saturday attendance rejection** (P6): Generate Saturday dates → verify rejection for 5_hari
7. **Saturday records exclusion** (P7): Generate existing attendance + switch → verify exclusion from rekap

### Integration Tests

- End-to-end tenant creation flow with hari_kerja
- KonfigurasiView PATCH flow with role verification
- Jadwal creation validation against live DB
- Absensi rekap calculation with hari_kerja change mid-period
