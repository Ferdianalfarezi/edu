import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { router } from '@/router';
import type { Role } from '@edu/shared';

export interface SubNavTab {
  label: string;
  path: string;
}

interface SubNavConfig {
  [sectionKey: string]: SubNavTab[];
}

const SUB_NAV_CONFIG: SubNavConfig = {
  dashboard: [
    { label: 'Ringkasan', path: '/' },
    { label: 'Siswa', path: '/siswa' },
    { label: 'Kelas', path: '/kelas' },
    { label: 'Mata Pelajaran', path: '/mata-pelajaran' },
    { label: 'Jadwal', path: '/jadwal' },
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
  keuangan: [{ label: 'Tagihan', path: '/tagihan' }],
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
      ['/siswa', '/kelas', '/mata-pelajaran', '/jadwal', '/kenaikan-kelas'].some((p) =>
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
