import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { router } from '@/router';
import { Role } from '@edu/shared';

export interface SubNavTab {
  label: string;
  path: string;
}

interface SubNavTabWithRoles extends SubNavTab {
  roles: Role[];
}

interface SubNavConfig {
  [sectionKey: string]: SubNavTab[];
}

/**
 * Tab definitions untuk seksi keuangan (/tagihan/*).
 * Setiap tab menyertakan daftar role yang diizinkan secara eksplisit.
 */
export const KEUANGAN_TABS: SubNavTabWithRoles[] = [
  { label: 'Generate', path: '/tagihan/generate', roles: [Role.ADMIN, Role.BENDAHARA] },
  { label: 'Daftar Tagihan', path: '/tagihan/list', roles: [Role.ADMIN, Role.BENDAHARA] },
  { label: 'Verifikasi', path: '/tagihan/verifikasi', roles: [Role.ADMIN, Role.BENDAHARA] },
  { label: 'Tunggakan', path: '/tagihan/tunggakan', roles: [Role.ADMIN, Role.BENDAHARA] },
  { label: 'Audit Trail', path: '/tagihan/audit', roles: [Role.ADMIN, Role.BENDAHARA] },
];

const SUB_NAV_CONFIG: SubNavConfig = {
  dashboard: [
    { label: 'Ringkasan', path: '/' },
    { label: 'Siswa', path: '/siswa' },
    { label: 'Kelas', path: '/kelas' },
    { label: 'Mata Pelajaran', path: '/mata-pelajaran' },
    { label: 'Jadwal', path: '/jadwal' },
    { label: 'Guru', path: '/guru' },
  ],
  absensi: [
    { label: 'Input Absensi', path: '/absensi/input' },
    { label: 'Edit Absensi', path: '/absensi/edit' },
    { label: 'Rekap Absensi', path: '/absensi/rekap' },
  ],
  rapor: [
    { label: 'Komponen Nilai', path: '/rapor/komponen' },
    { label: 'Input Nilai', path: '/rapor/input' },
    { label: 'Finalisasi', path: '/rapor/finalize' },
    { label: 'Lihat Rapor', path: '/rapor' },
  ],
  rpp: [
    { label: 'Portal RPP', path: '/rpp/portal' },
    { label: 'Buat RPP', path: '/rpp/create' },
    { label: 'Favorit', path: '/rpp/favorites' },
  ],
  pengumuman: [{ label: 'Pengumuman', path: '/pengumuman' }],
  barang: [{ label: 'Inventaris Barang', path: '/barang' }],
  pengaturan: [
    { label: 'Tahun Ajaran', path: '/tahun-ajaran' },
    { label: 'Konfigurasi', path: '/konfigurasi' },
    { label: 'Pengguna', path: '/users' },
    { label: 'Audit Log', path: '/audit-logs' },
    { label: 'Tenant', path: '/tenants' },
  ],
};

export function useSubNavigation() {
  const route = useRoute();
  const authStore = useAuthStore();

  const activeSection = computed<string>(() => {
    const path = route.path;

    if (path === '/') return 'dashboard';
    if (path.startsWith('/absensi')) return 'absensi';
    if (path.startsWith('/rapor')) return 'rapor';
    if (path.startsWith('/rpp')) return 'rpp';
    if (path.startsWith('/tagihan')) return 'keuangan';
    if (path.startsWith('/pengumuman')) return 'pengumuman';
    if (path.startsWith('/barang')) return 'barang';

    // Academic routes under dashboard section
    if (
      ['/siswa', '/kelas', '/mata-pelajaran', '/jadwal', '/kenaikan-kelas', '/guru'].some((p) =>
        path.startsWith(p),
      )
    ) {
      return 'dashboard';
    }

    // Settings routes
    if (
      ['/tahun-ajaran', '/konfigurasi', '/users', '/audit-logs', '/tenants'].some((p) =>
        path.startsWith(p),
      )
    ) {
      return 'pengaturan';
    }

    return 'dashboard';
  });

  const tabs = computed<SubNavTab[]>(() => {
    // Keuangan section: filter berdasarkan role dari KEUANGAN_TABS secara eksplisit
    if (route.path.startsWith('/tagihan')) {
      return KEUANGAN_TABS.filter((tab) => authStore.hasRole(...tab.roles));
    }

    const config = SUB_NAV_CONFIG[activeSection.value] ?? [];

    return config.filter((tab) => {
      const routeRecord = router.getRoutes().find((r) => r.path === tab.path);
      if (!routeRecord?.meta?.roles || (routeRecord.meta.roles as Role[]).length === 0) {
        return true;
      }
      return authStore.hasRole(...(routeRecord.meta.roles as Role[]));
    });
  });

  return { activeSection, tabs };
}
