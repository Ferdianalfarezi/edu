/**
 * Smoke test to verify the testing infrastructure is correctly configured.
 * This test validates:
 * - Jest + TypeScript works
 * - Path aliases resolve correctly
 * - fast-check is properly configured
 * - Arbitraries generate valid data
 * - Factory fixtures produce expected shapes
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import {
  arbitraryRole,
  arbitraryStaffRole,
  arbitraryAttendanceStatus,
  arbitraryPaymentStatus,
  arbitrarySchoolDate,
  arbitraryDateRange,
  arbitraryPhoneNumber,
  arbitraryRupiahAmount,
  arbitraryNisn,
  ROLES,
  STAFF_ROLES,
  ATTENDANCE_STATUSES,
  PAYMENT_STATUSES,
  VALID_TRANSITIONS,
} from '../arbitraries/common';
import { arbitraryTenant, arbitraryTenantPair } from '../arbitraries/tenant';
import { arbitraryStaffUser, arbitraryParentUser, arbitraryGuru } from '../arbitraries/user';
import { arbitrarySiswa, arbitrarySiswaListVariable } from '../arbitraries/siswa';
import { arbitraryKelas } from '../arbitraries/kelas';
import { arbitraryTahunAjaran } from '../arbitraries/tahun-ajaran';
import { arbitraryMataPelajaran } from '../arbitraries/mata-pelajaran';
import { arbitraryAbsensiRecord, arbitraryAbsensiInput } from '../arbitraries/absensi';
import {
  arbitraryTagihan,
  arbitraryValidTransition,
  arbitraryInvalidTransition,
} from '../arbitraries/tagihan';
import {
  createTenant,
  createUser,
  createGuru,
  createKelas,
  createSiswa,
  createTagihan,
  createTahunAjaran,
  createOrangTua,
  resetFactory,
} from '../../fixtures/factory';

describe('Testing Infrastructure Smoke Test', () => {
  beforeEach(() => {
    resetFactory();
  });

  describe('fast-check configuration', () => {
    it('should run property tests with configured numRuns', () => {
      let runCount = 0;
      fc.assert(
        fc.property(fc.integer(), () => {
          runCount++;
          return true;
        }),
        PBT_CONFIG,
      );
      expect(runCount).toBeGreaterThanOrEqual(PBT_CONFIG.numRuns as number);
    });
  });

  describe('common arbitraries', () => {
    it('should generate valid roles', () => {
      fc.assert(
        fc.property(arbitraryRole(), (role) => {
          return ROLES.includes(role);
        }),
        PBT_CONFIG,
      );
    });

    it('should generate valid staff roles', () => {
      fc.assert(
        fc.property(arbitraryStaffRole(), (role) => {
          return STAFF_ROLES.includes(role);
        }),
        PBT_CONFIG,
      );
    });

    it('should generate valid attendance statuses', () => {
      fc.assert(
        fc.property(arbitraryAttendanceStatus(), (status) => {
          return ATTENDANCE_STATUSES.includes(status);
        }),
        PBT_CONFIG,
      );
    });

    it('should generate valid payment statuses', () => {
      fc.assert(
        fc.property(arbitraryPaymentStatus(), (status) => {
          return PAYMENT_STATUSES.includes(status);
        }),
        PBT_CONFIG,
      );
    });

    it('should generate valid school dates (YYYY-MM-DD format)', () => {
      fc.assert(
        fc.property(arbitrarySchoolDate(), (date) => {
          return /^\d{4}-\d{2}-\d{2}$/.test(date);
        }),
        PBT_CONFIG,
      );
    });

    it('should generate valid date ranges (start <= end)', () => {
      fc.assert(
        fc.property(arbitraryDateRange(), ({ start, end }) => {
          return new Date(start) <= new Date(end);
        }),
        PBT_CONFIG,
      );
    });

    it('should generate valid Indonesian phone numbers', () => {
      fc.assert(
        fc.property(arbitraryPhoneNumber(), (phone) => {
          return /^08\d{8,11}$/.test(phone);
        }),
        PBT_CONFIG,
      );
    });

    it('should generate valid rupiah amounts (multiples of 1000, >= 10000)', () => {
      fc.assert(
        fc.property(arbitraryRupiahAmount(), (amount) => {
          return amount >= 10000 && amount <= 5000000 && amount % 1000 === 0;
        }),
        PBT_CONFIG,
      );
    });

    it('should generate valid NISN (10 digits)', () => {
      fc.assert(
        fc.property(arbitraryNisn(), (nisn) => {
          return /^\d{10}$/.test(nisn);
        }),
        PBT_CONFIG,
      );
    });
  });

  describe('domain arbitraries', () => {
    it('should generate tenants with required fields', () => {
      fc.assert(
        fc.property(arbitraryTenant(), (tenant) => {
          return (
            typeof tenant.id === 'string' &&
            typeof tenant.nama === 'string' &&
            typeof tenant.alamat === 'string' &&
            typeof tenant.telepon === 'string' &&
            typeof tenant.is_active === 'boolean'
          );
        }),
        PBT_CONFIG,
      );
    });

    it('should generate distinct tenant pairs', () => {
      fc.assert(
        fc.property(arbitraryTenantPair(), ({ tenantA, tenantB }) => {
          return tenantA !== tenantB;
        }),
        PBT_CONFIG,
      );
    });

    it('should generate staff users with email and tenant_id', () => {
      fc.assert(
        fc.property(arbitraryStaffUser(), (user) => {
          return (
            user.email !== null && user.tenant_id !== null && STAFF_ROLES.includes(user.role as any)
          );
        }),
        PBT_CONFIG,
      );
    });

    it('should generate parent users with phone and null tenant_id', () => {
      fc.assert(
        fc.property(arbitraryParentUser(), (user) => {
          return user.phone !== null && user.tenant_id === null && user.role === 'orang_tua';
        }),
        PBT_CONFIG,
      );
    });

    it('should generate valid tagihan with consistent status and total_dibayar', () => {
      fc.assert(
        fc.property(arbitraryTagihan(), (tagihan) => {
          switch (tagihan.status) {
            case 'belum_bayar':
            case 'dibatalkan':
            case 'ditolak':
              return tagihan.total_dibayar === 0;
            case 'lunas':
              return tagihan.total_dibayar === tagihan.nominal;
            case 'cicilan':
            case 'menunggu_verifikasi':
              return tagihan.total_dibayar > 0 && tagihan.total_dibayar < tagihan.nominal;
            default:
              return false;
          }
        }),
        PBT_CONFIG,
      );
    });

    it('should generate valid transitions that are in VALID_TRANSITIONS map', () => {
      fc.assert(
        fc.property(arbitraryValidTransition(), ({ from, to }) => {
          return VALID_TRANSITIONS[from].includes(to);
        }),
        PBT_CONFIG,
      );
    });

    it('should generate invalid transitions that are NOT in VALID_TRANSITIONS map', () => {
      fc.assert(
        fc.property(arbitraryInvalidTransition(), ({ from, to }) => {
          return !VALID_TRANSITIONS[from].includes(to);
        }),
        PBT_CONFIG,
      );
    });
  });

  describe('factory fixtures', () => {
    it('should create tenants with unique IDs', () => {
      const t1 = createTenant();
      const t2 = createTenant();
      expect(t1.id).not.toBe(t2.id);
      expect(t1.is_active).toBe(true);
    });

    it('should create users with correct role defaults', () => {
      const tenant = createTenant();
      const guru = createGuru(tenant.id);
      expect(guru.role).toBe('guru');
      expect(guru.tenant_id).toBe(tenant.id);
      expect(guru.email).not.toBeNull();
    });

    it('should create orang_tua with null tenant_id and phone', () => {
      const parent = createOrangTua();
      expect(parent.role).toBe('orang_tua');
      expect(parent.tenant_id).toBeNull();
      expect(parent.phone).not.toBeNull();
      expect(parent.email).toBeNull();
    });

    it('should create consistent hierarchical data', () => {
      const tenant = createTenant();
      const ta = createTahunAjaran(tenant.id);
      const kelas = createKelas(tenant.id, ta.id);
      const orangTua = createOrangTua();
      const siswa = createSiswa(tenant.id, kelas.id, orangTua.id);
      const tagihan = createTagihan(tenant.id, siswa.id, { bulan: 9, tahun: 2024 });

      expect(kelas.tenant_id).toBe(tenant.id);
      expect(kelas.tahun_ajaran_id).toBe(ta.id);
      expect(siswa.tenant_id).toBe(tenant.id);
      expect(siswa.kelas_id).toBe(kelas.id);
      expect(tagihan.tenant_id).toBe(tenant.id);
      expect(tagihan.siswa_id).toBe(siswa.id);
      expect(tagihan.bulan).toBe(9);
    });

    it('should allow overrides on factory functions', () => {
      const tenant = createTenant({ nama: 'Override School', is_active: false });
      expect(tenant.nama).toBe('Override School');
      expect(tenant.is_active).toBe(false);
    });
  });
});
