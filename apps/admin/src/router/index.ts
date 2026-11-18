import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router';
import { Role, ADMIN_PANEL_ROLES } from '@edu/shared';
import { useAuthStore } from '@/stores/auth';

declare module 'vue-router' {
  interface RouteMeta {
    /** If true, route does not require authentication */
    guest?: boolean;
    /** Roles allowed to access this route. If empty/undefined, any authenticated user can access. */
    roles?: Role[];
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
    },
    {
      path: '/users',
      name: 'users',
      component: () => import('@/views/UserManagementView.vue'),
      meta: { roles: [Role.ADMIN, Role.SUPER_ADMIN] },
    },
    {
      path: '/siswa/:id',
      name: 'siswa-detail',
      component: () => import('@/views/SiswaDetailView.vue'),
      meta: { roles: [Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH] },
    },
    {
      path: '/siswa',
      name: 'siswa',
      component: () => import('@/views/SiswaManagementView.vue'),
      meta: { roles: [Role.ADMIN, Role.KEPALA_SEKOLAH, Role.GURU] },
    },
    {
      path: '/mata-pelajaran',
      name: 'mata-pelajaran',
      component: () => import('@/views/MataPelajaranView.vue'),
      meta: { roles: [Role.ADMIN] },
    },
    {
      path: '/kelas',
      name: 'kelas',
      component: () => import('@/views/KelasManagementView.vue'),
      meta: { roles: [Role.ADMIN] },
    },
    {
      path: '/kelas/:id',
      name: 'kelas-detail',
      component: () => import('@/views/KelasDetailView.vue'),
      meta: { roles: [Role.ADMIN, Role.KEPALA_SEKOLAH] },
    },
    {
      path: '/guru',
      name: 'guru',
      component: () => import('@/views/GuruView.vue'),
      meta: { roles: [Role.ADMIN, Role.KEPALA_SEKOLAH] },
    },
    {
      path: '/tahun-ajaran',
      name: 'tahun-ajaran',
      component: () => import('@/views/TahunAjaranView.vue'),
      meta: { roles: [Role.ADMIN] },
    },
    {
      path: '/kenaikan-kelas',
      name: 'kenaikan-kelas',
      component: () => import('@/views/KenaikanKelasView.vue'),
      meta: { roles: [Role.ADMIN] },
    },
    {
      path: '/konfigurasi',
      name: 'konfigurasi',
      component: () => import('@/views/KonfigurasiView.vue'),
      meta: { roles: [Role.ADMIN] },
    },
    {
      path: '/konfigurasi-biaya',
      name: 'konfigurasi-biaya',
      component: () => import('@/views/KonfigurasiBiayaView.vue'),
      meta: { roles: [Role.ADMIN, Role.BENDAHARA] },
    },
    {
      path: '/jadwal',
      name: 'jadwal',
      component: () => import('@/views/JadwalView.vue'),
      meta: { roles: [Role.ADMIN] },
    },
    {
      path: '/jadwal-saya',
      name: 'jadwal-saya',
      component: () => import('@/views/JadwalSayaView.vue'),
      meta: { roles: [Role.GURU] },
    },
    {
      path: '/rapor/komponen',
      name: 'rapor-komponen',
      component: () => import('@/views/RaporKomponenView.vue'),
      meta: { roles: [Role.ADMIN] },
    },
    {
      path: '/rapor/input',
      name: 'rapor-input',
      component: () => import('@/views/RaporInputView.vue'),
      meta: { roles: [Role.GURU] },
    },
    {
      path: '/rapor/finalize',
      name: 'rapor-finalize',
      component: () => import('@/views/RaporFinalizeView.vue'),
      meta: { roles: [Role.GURU] },
    },
    {
      path: '/rapor',
      name: 'rapor-detail',
      component: () => import('@/views/RaporDetailView.vue'),
      meta: { roles: [Role.ADMIN, Role.KEPALA_SEKOLAH] },
    },
    {
      path: '/rpp/create',
      name: 'rpp-create',
      component: () => import('@/views/RppCreateView.vue'),
      meta: { roles: [Role.GURU] },
    },
    {
      path: '/rpp/edit/:id',
      name: 'rpp-edit',
      component: () => import('@/views/RppCreateView.vue'),
      meta: { roles: [Role.GURU] },
    },
    {
      path: '/rpp/portal',
      name: 'rpp-portal',
      component: () => import('@/views/RppPortalView.vue'),
      meta: { roles: [Role.GURU, Role.KEPALA_SEKOLAH, Role.ADMIN] },
    },
    {
      path: '/rpp/favorites',
      name: 'rpp-favorites',
      component: () => import('@/views/RppFavoritesView.vue'),
      meta: { roles: [Role.GURU] },
    },
    {
      path: '/rpp/:id',
      name: 'rpp-detail',
      component: () => import('@/views/RppDetailView.vue'),
      meta: { roles: [Role.GURU, Role.KEPALA_SEKOLAH, Role.ADMIN] },
    },
    {
      path: '/absensi/input',
      name: 'absensi-input',
      component: () => import('@/views/AbsensiInputView.vue'),
      meta: { roles: [Role.GURU, Role.ADMIN, Role.KEPALA_SEKOLAH] },
    },
    {
      path: '/absensi/edit',
      name: 'absensi-edit',
      component: () => import('@/views/AbsensiEditView.vue'),
      meta: { roles: [Role.GURU, Role.ADMIN, Role.KEPALA_SEKOLAH] },
    },
    {
      path: '/absensi/rekap',
      name: 'absensi-rekap',
      component: () => import('@/views/AbsensiRekapView.vue'),
      meta: { roles: [Role.ADMIN, Role.KEPALA_SEKOLAH] },
    },
    // Redirect /tagihan → /tagihan/list
    { path: '/tagihan', redirect: '/tagihan/list' },
    {
      path: '/tagihan/generate',
      name: 'tagihan-generate',
      component: () => import('@/views/tagihan/TagihanGenerateView.vue'),
      meta: { roles: [Role.ADMIN, Role.BENDAHARA] },
    },
    {
      path: '/tagihan/list',
      name: 'tagihan-list',
      component: () => import('@/views/tagihan/TagihanListView.vue'),
      meta: { roles: [Role.ADMIN, Role.BENDAHARA] },
    },
    {
      path: '/tagihan/verifikasi',
      name: 'tagihan-verifikasi',
      component: () => import('@/views/tagihan/TagihanVerifikasiView.vue'),
      meta: { roles: [Role.ADMIN, Role.BENDAHARA] },
    },
    {
      path: '/tagihan/tunggakan',
      name: 'tagihan-tunggakan',
      component: () => import('@/views/tagihan/TunggakanView.vue'),
      meta: { roles: [Role.ADMIN, Role.BENDAHARA] },
    },
    {
      path: '/tagihan/audit',
      name: 'tagihan-audit',
      component: () => import('@/views/tagihan/TagihanAuditView.vue'),
      meta: { roles: [Role.ADMIN, Role.BENDAHARA] },
    },
    // Catch-all untuk /tagihan/* yang tidak dikenali
    { path: '/tagihan/:pathMatch(.*)*', redirect: '/tagihan/list' },
    {
      path: '/barang',
      name: 'barang',
      component: () => import('@/views/BarangView.vue'),
      meta: { roles: [Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH] },
    },
    {
      path: '/pengumuman',
      name: 'pengumuman',
      component: () => import('@/views/PengumumanView.vue'),
      meta: { roles: [Role.ADMIN, Role.KEPALA_SEKOLAH] },
    },
    {
      path: '/audit-logs',
      name: 'audit-logs',
      component: () => import('@/views/AuditLogView.vue'),
      meta: { roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BENDAHARA] },
    },
    {
      path: '/tenants',
      name: 'tenants',
      component: () => import('@/views/TenantManagementView.vue'),
      meta: { roles: [Role.SUPER_ADMIN] },
    },
    {
      path: '/unauthorized',
      name: 'unauthorized',
      component: () => import('@/views/UnauthorizedView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
    },
  ],
});

/**
 * Global navigation guard implementing role-based access control.
 *
 * Logic:
 * 1. Guest routes (login) — redirect to dashboard if already authenticated
 * 2. Protected routes — redirect to login if not authenticated
 * 3. Role-restricted routes — check if user's role is allowed
 */
// Setelah ada deploy baru, file halaman versi lama sudah tidak ada di server.
// Tab yang masih terbuka gagal membuka menu (tidak terjadi apa-apa saat diklik).
// Solusinya: muat ulang halaman sekali ke menu tujuan supaya memakai versi terbaru.
function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Unable to preload CSS/i.test(
    msg,
  );
}

function muatUlangSekali(tujuan: string) {
  const KUNCI = 'muat-ulang-versi-baru';
  try {
    const terakhir = Number(sessionStorage.getItem(KUNCI) || 0);
    if (Date.now() - terakhir < 10_000) return; // cegah reload berulang
    sessionStorage.setItem(KUNCI, String(Date.now()));
  } catch {
    // sessionStorage tidak tersedia: tetap muat ulang
  }
  window.location.assign(tujuan);
}

router.onError((err, to) => {
  if (isChunkLoadError(err)) muatUlangSekali(to.fullPath);
});

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  muatUlangSekali(window.location.href);
});

router.beforeEach((to: RouteLocationNormalized) => {
  const authStore = useAuthStore();

  // Guest-only routes (login page): redirect authenticated users away
  if (to.meta.guest) {
    if (authStore.isAuthenticated) {
      return { name: 'dashboard' };
    }
    return true;
  }

  // All other routes require authentication
  if (!authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  // Check if user's role is allowed on the Admin Panel at all
  const userRole = authStore.user?.role;
  if (userRole && !ADMIN_PANEL_ROLES.includes(userRole as (typeof ADMIN_PANEL_ROLES)[number])) {
    authStore.logout();
    return { name: 'login' };
  }

  // Force password change: only allow dashboard (where the modal is shown)
  if (authStore.mustChangePassword && to.name !== 'dashboard') {
    return { name: 'dashboard' };
  }

  // Check route-level role restrictions
  const allowedRoles = to.meta.roles;
  if (allowedRoles && allowedRoles.length > 0) {
    if (!authStore.hasRole(...allowedRoles)) {
      return { name: 'unauthorized' };
    }
  }

  return true;
});
