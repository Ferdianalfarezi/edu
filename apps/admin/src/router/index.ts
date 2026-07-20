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
      path: '/jadwal',
      name: 'jadwal',
      component: () => import('@/views/JadwalView.vue'),
      meta: { roles: [Role.ADMIN] },
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
    {
      path: '/tagihan',
      name: 'tagihan',
      component: () => import('@/views/TagihanView.vue'),
      meta: { roles: [Role.ADMIN, Role.BENDAHARA] },
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
