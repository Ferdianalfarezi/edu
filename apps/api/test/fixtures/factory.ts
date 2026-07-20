/**
 * Test data factory for creating deterministic test records.
 * Use these for unit tests where you need specific, known values.
 * For property-based tests, use the arbitraries in test/pbt/arbitraries/ instead.
 */

import type { Role, AttendanceStatus, PaymentStatus } from '../pbt/arbitraries/common';

// ─── Counter for unique IDs ───────────────────────────────────────────────────

let counter = 0;

function nextId(prefix: string = 'test'): string {
  counter++;
  return `${prefix}-${counter.toString().padStart(6, '0')}`;
}

/** Reset counter between test suites */
export function resetFactory(): void {
  counter = 0;
}

// ─── Tenant Factory ───────────────────────────────────────────────────────────

export interface TenantFixture {
  id: string;
  nama: string;
  alamat: string;
  telepon: string;
  is_active: boolean;
}

export function createTenant(overrides: Partial<TenantFixture> = {}): TenantFixture {
  return {
    id: nextId('tenant'),
    nama: `Sekolah Test ${counter}`,
    alamat: `Jl. Test No. ${counter}`,
    telepon: `081234567${String(counter).padStart(3, '0')}`,
    is_active: true,
    ...overrides,
  };
}

// ─── User Factory ─────────────────────────────────────────────────────────────

export interface UserFixture {
  id: string;
  tenant_id: string | null;
  nama: string;
  email: string | null;
  phone: string | null;
  role: Role;
  is_active: boolean;
}

export function createUser(overrides: Partial<UserFixture> = {}): UserFixture {
  const role = overrides.role || 'guru';
  return {
    id: nextId('user'),
    tenant_id: role === 'orang_tua' || role === 'super_admin' ? null : nextId('tenant'),
    nama: `User Test ${counter}`,
    email: role === 'orang_tua' ? null : `user${counter}@test.edu`,
    phone: role === 'orang_tua' ? `08123456${String(counter).padStart(4, '0')}` : null,
    role,
    is_active: true,
    ...overrides,
  };
}

export function createGuru(tenantId: string, overrides: Partial<UserFixture> = {}): UserFixture {
  return createUser({ tenant_id: tenantId, role: 'guru', ...overrides });
}

export function createKepalaSekolah(
  tenantId: string,
  overrides: Partial<UserFixture> = {},
): UserFixture {
  return createUser({ tenant_id: tenantId, role: 'kepala_sekolah', ...overrides });
}

export function createBendahara(
  tenantId: string,
  overrides: Partial<UserFixture> = {},
): UserFixture {
  return createUser({ tenant_id: tenantId, role: 'bendahara', ...overrides });
}

export function createAdmin(tenantId: string, overrides: Partial<UserFixture> = {}): UserFixture {
  return createUser({ tenant_id: tenantId, role: 'admin', ...overrides });
}

export function createOrangTua(overrides: Partial<UserFixture> = {}): UserFixture {
  return createUser({ role: 'orang_tua', tenant_id: null, ...overrides });
}

// ─── Tahun Ajaran Factory ─────────────────────────────────────────────────────

export interface TahunAjaranFixture {
  id: string;
  tenant_id: string;
  nama: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  status: 'disiapkan' | 'aktif' | 'selesai';
}

export function createTahunAjaran(
  tenantId: string,
  overrides: Partial<TahunAjaranFixture> = {},
): TahunAjaranFixture {
  return {
    id: nextId('ta'),
    tenant_id: tenantId,
    nama: '2024/2025',
    tanggal_mulai: '2024-07-15',
    tanggal_selesai: '2025-06-13',
    status: 'aktif',
    ...overrides,
  };
}

// ─── Kelas Factory ────────────────────────────────────────────────────────────

export interface KelasFixture {
  id: string;
  tenant_id: string;
  tahun_ajaran_id: string;
  nama: string;
  tingkat: number;
  wali_kelas_id: string | null;
  kapasitas: number;
}

export function createKelas(
  tenantId: string,
  tahunAjaranId: string,
  overrides: Partial<KelasFixture> = {},
): KelasFixture {
  return {
    id: nextId('kelas'),
    tenant_id: tenantId,
    tahun_ajaran_id: tahunAjaranId,
    nama: `Kelas ${counter}`,
    tingkat: 1,
    wali_kelas_id: null,
    kapasitas: 30,
    ...overrides,
  };
}

// ─── Siswa Factory ────────────────────────────────────────────────────────────

export interface SiswaFixture {
  id: string;
  tenant_id: string;
  kelas_id: string;
  nisn: string;
  nama: string;
  jenis_kelamin: 'L' | 'P';
  tanggal_lahir: string;
  status: 'aktif' | 'pindah_sekolah' | 'keluar' | 'lulus';
  orang_tua_id: string;
}

export function createSiswa(
  tenantId: string,
  kelasId: string,
  orangTuaId: string,
  overrides: Partial<SiswaFixture> = {},
): SiswaFixture {
  return {
    id: nextId('siswa'),
    tenant_id: tenantId,
    kelas_id: kelasId,
    nisn: String(counter).padStart(10, '0'),
    nama: `Siswa Test ${counter}`,
    jenis_kelamin: counter % 2 === 0 ? 'L' : 'P',
    tanggal_lahir: '2012-05-15',
    status: 'aktif',
    orang_tua_id: orangTuaId,
    ...overrides,
  };
}

// ─── Tagihan Factory ──────────────────────────────────────────────────────────

export interface TagihanFixture {
  id: string;
  tenant_id: string;
  siswa_id: string;
  bulan: number;
  tahun: number;
  nominal: number;
  status: PaymentStatus;
  total_dibayar: number;
  tanggal_jatuh_tempo: string;
}

export function createTagihan(
  tenantId: string,
  siswaId: string,
  overrides: Partial<TagihanFixture> = {},
): TagihanFixture {
  const bulan = overrides.bulan || 7;
  const tahun = overrides.tahun || 2024;
  return {
    id: nextId('tagihan'),
    tenant_id: tenantId,
    siswa_id: siswaId,
    bulan,
    tahun,
    nominal: 500000,
    status: 'belum_bayar',
    total_dibayar: 0,
    tanggal_jatuh_tempo: `${tahun}-${String(bulan).padStart(2, '0')}-10`,
    ...overrides,
  };
}

// ─── Absensi Factory ──────────────────────────────────────────────────────────

export interface AbsensiFixture {
  id: string;
  tenant_id: string;
  siswa_id: string;
  kelas_id: string;
  tanggal: string;
  status: AttendanceStatus;
  guru_id: string;
}

export function createAbsensi(
  tenantId: string,
  siswaId: string,
  kelasId: string,
  guruId: string,
  overrides: Partial<AbsensiFixture> = {},
): AbsensiFixture {
  return {
    id: nextId('absensi'),
    tenant_id: tenantId,
    siswa_id: siswaId,
    kelas_id: kelasId,
    tanggal: '2024-09-02',
    status: 'hadir',
    guru_id: guruId,
    ...overrides,
  };
}

// ─── Mata Pelajaran Factory ───────────────────────────────────────────────────

export interface MataPelajaranFixture {
  id: string;
  tenant_id: string;
  nama: string;
  kode: string;
}

export function createMataPelajaran(
  tenantId: string,
  overrides: Partial<MataPelajaranFixture> = {},
): MataPelajaranFixture {
  return {
    id: nextId('mapel'),
    tenant_id: tenantId,
    nama: `Mata Pelajaran ${counter}`,
    kode: `MP${counter}`,
    ...overrides,
  };
}
