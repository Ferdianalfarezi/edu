<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { Role } from '@edu/shared';
import { router as appRouter } from '@/router';

const emit = defineEmits<{
  (e: 'navigate', path: string): void;
  (e: 'toggleMobileMenu'): void;
}>();

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

interface SidebarItem {
  key: string;
  icon: string;
  label: string;
  basePath: string;
  roles?: Role[];
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'dashboard', icon: 'home', label: 'Dashboard', basePath: '/' },
  {
    key: 'akademik',
    icon: 'book-open',
    label: 'Akademik',
    basePath: '/siswa',
    roles: [Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH],
  },
  {
    key: 'absensi',
    icon: 'clipboard-check',
    label: 'Absensi',
    basePath: '/absensi/input',
    roles: [Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH],
  },
  {
    key: 'rapor',
    icon: 'document-text',
    label: 'Rapor',
    basePath: '/rapor/input',
    roles: [Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH],
  },
  {
    key: 'rpp',
    icon: 'folder',
    label: 'RPP',
    basePath: '/rpp/portal',
    roles: [Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH],
  },
  {
    key: 'keuangan',
    icon: 'credit-card',
    label: 'Keuangan',
    basePath: '/tagihan',
    roles: [Role.ADMIN, Role.BENDAHARA],
  },
  {
    key: 'pengumuman',
    icon: 'megaphone',
    label: 'Pengumuman',
    basePath: '/pengumuman',
    roles: [Role.ADMIN, Role.KEPALA_SEKOLAH],
  },
  {
    key: 'barang',
    icon: 'cube',
    label: 'Inventaris',
    basePath: '/barang',
    roles: [Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH],
  },
  {
    key: 'pengaturan',
    icon: 'cog',
    label: 'Pengaturan',
    basePath: '/tahun-ajaran',
    roles: [Role.ADMIN, Role.SUPER_ADMIN],
  },
];

const filteredItems = computed(() =>
  SIDEBAR_ITEMS.filter((item) => {
    if (!item.roles) return true;
    return item.roles.some((role) => authStore.hasRole(role));
  }),
);

function isActive(item: SidebarItem): boolean {
  if (item.basePath === '/') {
    return route.path === '/';
  }
  // Match by section prefix
  const sectionPrefixes: Record<string, string[]> = {
    akademik: ['/siswa', '/kelas', '/mata-pelajaran', '/jadwal', '/kenaikan-kelas'],
    absensi: ['/absensi'],
    rapor: ['/rapor'],
    rpp: ['/rpp'],
    keuangan: ['/tagihan'],
    pengumuman: ['/pengumuman'],
    barang: ['/barang'],
    pengaturan: ['/tahun-ajaran', '/konfigurasi', '/users', '/audit-logs', '/tenants'],
  };

  const prefixes = sectionPrefixes[item.key];
  if (prefixes) {
    return prefixes.some((p) => route.path === p || route.path.startsWith(p + '/'));
  }
  return route.path.startsWith(item.basePath);
}

function navigateTo(item: SidebarItem) {
  // Find the first accessible route for this section by checking route meta roles
  const sectionTabPaths: Record<string, string[]> = {
    dashboard: ['/'],
    akademik: ['/siswa', '/kelas', '/mata-pelajaran', '/jadwal', '/kenaikan-kelas'],
    absensi: ['/absensi/input', '/absensi/edit', '/absensi/rekap'],
    rapor: ['/rapor/komponen', '/rapor/input', '/rapor/finalize', '/rapor'],
    rpp: ['/rpp/portal', '/rpp/create', '/rpp/favorites'],
    keuangan: ['/tagihan'],
    pengumuman: ['/pengumuman'],
    barang: ['/barang'],
    pengaturan: ['/tahun-ajaran', '/konfigurasi', '/users', '/audit-logs', '/tenants'],
  };

  const paths = sectionTabPaths[item.key] || [item.basePath];
  const accessiblePath = paths.find((path) => {
    const routeRecord = appRouter.getRoutes().find((r) => r.path === path);
    if (!routeRecord?.meta?.roles || (routeRecord.meta.roles as Role[]).length === 0) return true;
    return authStore.hasRole(...(routeRecord.meta.roles as Role[]));
  });

  const targetPath = accessiblePath || item.basePath;
  router.push(targetPath);
  emit('navigate', targetPath);
}

function handleLogout() {
  authStore.logout();
  router.push('/login');
}

const userInitial = computed(() => {
  return authStore.user?.name?.charAt(0)?.toUpperCase() || '?';
});
</script>

<template>
  <aside class="sidebar">
    <!-- Mobile close button (visible < 1024px) -->
    <button class="sidebar__mobile-close" @click="emit('toggleMobileMenu')">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>

    <!-- Logo -->
    <div class="sidebar__logo">
      <div class="sidebar__logo-container">
        <img src="/logo.png" alt="Teman Sekolah" class="sidebar__logo-img" />
      </div>
    </div>

    <!-- Navigation -->
    <nav class="sidebar__nav">
      <ul class="sidebar__nav-list">
        <li
          v-for="item in filteredItems"
          :key="item.key"
          class="sidebar__nav-item"
          :class="{ 'sidebar__nav-item--active': isActive(item) }"
          @click="navigateTo(item)"
        >
          <!-- Active indicator bar -->
          <span v-if="isActive(item)" class="sidebar__active-bar" />

          <!-- Icon -->
          <svg
            class="sidebar__nav-icon"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
          >
            <template v-if="item.icon === 'home'">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </template>
            <template v-else-if="item.icon === 'book-open'">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </template>
            <template v-else-if="item.icon === 'clipboard-check'">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </template>
            <template v-else-if="item.icon === 'document-text'">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </template>
            <template v-else-if="item.icon === 'folder'">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </template>
            <template v-else-if="item.icon === 'credit-card'">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </template>
            <template v-else-if="item.icon === 'megaphone'">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
              />
            </template>
            <template v-else-if="item.icon === 'cube'">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </template>
            <template v-else-if="item.icon === 'cog'">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </template>
          </svg>

          <!-- Label -->
          <span class="sidebar__nav-label">{{ item.label }}</span>
          <!-- Collapsed label (below icon) -->
          <span class="sidebar__nav-label-collapsed">{{ item.label }}</span>
        </li>
      </ul>
    </nav>

    <!-- User section -->
    <div class="sidebar__user">
      <div class="sidebar__avatar">
        <span class="sidebar__avatar-initial">{{ userInitial }}</span>
      </div>
      <div class="sidebar__user-info">
        <p class="sidebar__user-name">{{ authStore.user?.name }}</p>
        <p class="sidebar__user-role">{{ authStore.user?.role?.replace('_', ' ') }}</p>
      </div>
      <button class="sidebar__logout" title="Logout" @click="handleLogout">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
          />
        </svg>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: var(--sidebar-collapsed-width);
  height: 100vh;
  background: linear-gradient(180deg, var(--color-teal-dark) 0%, var(--color-teal-darker) 100%);
  transition: width 300ms cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  position: relative;
}

.sidebar:hover {
  width: var(--sidebar-width);
}

/* Mobile close button — hidden on desktop */
.sidebar__mobile-close {
  display: none;
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 4px;
  color: rgba(255, 255, 255, 0.6);
  background: none;
  border: none;
  cursor: pointer;
  border-radius: 6px;
  z-index: 10;
}

.sidebar__mobile-close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

@media (max-width: 1023px) {
  .sidebar__mobile-close {
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

/* Logo */
.sidebar__logo {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 0 16px;
  flex-shrink: 0;
}

.sidebar__logo-container {
  width: 52px;
  height: 52px;
  background: #fff;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sidebar__logo-img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

/* Navigation */
.sidebar__nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 12px;
}

.sidebar__nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar__nav-item {
  position: relative;
  display: flex;
  align-items: center;
  padding: 12px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 200ms ease;
  /* Collapsed: center icon, show small label below */
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.sidebar:hover .sidebar__nav-item {
  flex-direction: row;
  justify-content: flex-start;
  gap: 12px;
}

.sidebar__nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.sidebar__nav-item--active {
  background: rgba(255, 255, 255, 0.15);
}

/* Active indicator bar */
.sidebar__active-bar {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 28px;
  background: var(--color-accent-500);
  border-radius: 0 4px 4px 0;
}

/* Icon */
.sidebar__nav-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.6);
  transition: color 200ms ease;
}

.sidebar__nav-item--active .sidebar__nav-icon {
  color: rgba(255, 255, 255, 1);
}

.sidebar__nav-item:hover .sidebar__nav-icon {
  color: rgba(255, 255, 255, 0.85);
}

/* Label — inline (expanded state) */
.sidebar__nav-label {
  display: none;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 200ms ease;
}

.sidebar:hover .sidebar__nav-label {
  display: block;
}

.sidebar__nav-item--active .sidebar__nav-label {
  color: #fff;
  font-weight: 600;
}

/* Label — collapsed (below icon) */
.sidebar__nav-label-collapsed {
  display: block;
  font-size: 10px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  max-width: 70px;
}

.sidebar:hover .sidebar__nav-label-collapsed {
  display: none;
}

.sidebar__nav-item--active .sidebar__nav-label-collapsed {
  color: #fff;
}

/* User section */
.sidebar__user {
  display: flex;
  align-items: center;
  padding: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
  /* Collapsed: center avatar */
  justify-content: center;
  gap: 0;
}

.sidebar:hover .sidebar__user {
  justify-content: flex-start;
  gap: 10px;
}

.sidebar__avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--color-accent-500);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sidebar__avatar-initial {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.sidebar__user-info {
  display: none;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.sidebar:hover .sidebar__user-info {
  display: flex;
}

.sidebar__user-name {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar__user-role {
  margin: 0;
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
  text-transform: capitalize;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar__logout {
  display: none;
  padding: 6px;
  color: rgba(255, 255, 255, 0.5);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
}

.sidebar:hover .sidebar__logout {
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar__logout:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}
</style>
