<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { Role } from '@edu/shared';
import TenantContextSwitcher from '@/components/layout/TenantContextSwitcher.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const sidebarCollapsed = ref(false);
const mobileMenuOpen = ref(false);

interface NavItem {
  name: string;
  path: string;
  icon: string;
  roles?: Role[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navigation = computed<NavGroup[]>(() => {
  const groups: NavGroup[] = [
    {
      label: 'Utama',
      items: [{ name: 'Dashboard', path: '/', icon: 'home' }],
    },
    {
      label: 'Akademik',
      items: [
        {
          name: 'Siswa',
          path: '/siswa',
          icon: 'users',
          roles: [Role.ADMIN, Role.KEPALA_SEKOLAH, Role.GURU],
        },
        { name: 'Kelas', path: '/kelas', icon: 'layout', roles: [Role.ADMIN] },
        { name: 'Mata Pelajaran', path: '/mata-pelajaran', icon: 'book', roles: [Role.ADMIN] },
        { name: 'Jadwal', path: '/jadwal', icon: 'calendar', roles: [Role.ADMIN] },
        {
          name: 'Kenaikan Kelas',
          path: '/kenaikan-kelas',
          icon: 'trending-up',
          roles: [Role.ADMIN],
        },
      ],
    },
    {
      label: 'Absensi',
      items: [
        {
          name: 'Input Absensi',
          path: '/absensi/input',
          icon: 'check-square',
          roles: [Role.GURU, Role.ADMIN, Role.KEPALA_SEKOLAH],
        },
        {
          name: 'Edit Absensi',
          path: '/absensi/edit',
          icon: 'edit',
          roles: [Role.GURU, Role.ADMIN, Role.KEPALA_SEKOLAH],
        },
        {
          name: 'Rekap Absensi',
          path: '/absensi/rekap',
          icon: 'bar-chart-2',
          roles: [Role.ADMIN, Role.KEPALA_SEKOLAH],
        },
      ],
    },
    {
      label: 'Rapor',
      items: [
        { name: 'Komponen Nilai', path: '/rapor/komponen', icon: 'sliders', roles: [Role.ADMIN] },
        { name: 'Input Nilai', path: '/rapor/input', icon: 'edit-3', roles: [Role.GURU] },
        { name: 'Finalisasi', path: '/rapor/finalize', icon: 'check-circle', roles: [Role.GURU] },
        {
          name: 'Lihat Rapor',
          path: '/rapor',
          icon: 'file-text',
          roles: [Role.ADMIN, Role.KEPALA_SEKOLAH],
        },
      ],
    },
    {
      label: 'RPP',
      items: [
        {
          name: 'Portal RPP',
          path: '/rpp/portal',
          icon: 'folder',
          roles: [Role.GURU, Role.KEPALA_SEKOLAH, Role.ADMIN],
        },
        { name: 'Buat RPP', path: '/rpp/create', icon: 'plus-circle', roles: [Role.GURU] },
        { name: 'Favorit', path: '/rpp/favorites', icon: 'star', roles: [Role.GURU] },
      ],
    },
    {
      label: 'Keuangan',
      items: [
        {
          name: 'Tagihan',
          path: '/tagihan',
          icon: 'credit-card',
          roles: [Role.ADMIN, Role.BENDAHARA],
        },
      ],
    },
    {
      label: 'Komunikasi',
      items: [
        {
          name: 'Pengumuman',
          path: '/pengumuman',
          icon: 'megaphone',
          roles: [Role.ADMIN, Role.KEPALA_SEKOLAH],
        },
      ],
    },
    {
      label: 'Pengaturan',
      items: [
        { name: 'Tahun Ajaran', path: '/tahun-ajaran', icon: 'clock', roles: [Role.ADMIN] },
        { name: 'Konfigurasi', path: '/konfigurasi', icon: 'settings', roles: [Role.ADMIN] },
        {
          name: 'Pengguna',
          path: '/users',
          icon: 'user-plus',
          roles: [Role.ADMIN, Role.SUPER_ADMIN],
        },
        {
          name: 'Audit Log',
          path: '/audit-logs',
          icon: 'file-text',
          roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BENDAHARA],
        },
        { name: 'Tenant', path: '/tenants', icon: 'globe', roles: [Role.SUPER_ADMIN] },
      ],
    },
  ];

  // Filter by role
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!item.roles) return true;
        return item.roles.some((role) => authStore.hasRole(role));
      }),
    }))
    .filter((group) => group.items.length > 0);
});

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/';
  // Exact match
  if (route.path === path) return true;
  // Prefix match, but only if no other nav item is a more specific match
  if (route.path.startsWith(path + '/')) {
    // Check if there's a more specific nav item that matches
    const allPaths = navigation.value.flatMap((g) => g.items.map((i) => i.path));
    const hasMoreSpecific = allPaths.some(
      (other) => other !== path && other.startsWith(path + '/') && route.path.startsWith(other),
    );
    return !hasMoreSpecific;
  }
  return false;
}

function handleLogout() {
  authStore.logout();
  router.push('/login');
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
}
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-surface-50">
    <!-- Mobile overlay -->
    <div
      v-if="mobileMenuOpen"
      class="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
      @click="mobileMenuOpen = false"
    />

    <!-- Sidebar -->
    <aside
      :class="[
        'fixed lg:static inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-border transition-all duration-200 ease-in-out',
        sidebarCollapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]',
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ]"
    >
      <!-- Logo / Brand -->
      <div class="flex items-center h-20 px-4 border-b border-border shrink-0">
        <img
          :src="sidebarCollapsed ? '/logo.png' : '/logo-text.png'"
          alt="Teman Sekolah"
          class="w-34 h-8 object-cover rounded-lg shrink-0 transition-all"
          :class="!sidebarCollapsed ? '-ml-2' : ''"
        />
      </div>

      <!-- Navigation -->
      <nav class="flex-1 overflow-y-auto py-3 px-2.5">
        <div v-for="group in navigation" :key="group.label" class="mb-4">
          <p
            v-if="!sidebarCollapsed"
            class="px-2.5 mb-1 text-[11px] font-medium uppercase tracking-wider text-text-tertiary"
          >
            {{ group.label }}
          </p>
          <ul class="space-y-0.5">
            <li v-for="item in group.items" :key="item.path">
              <router-link
                :to="item.path"
                :class="[
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors duration-150',
                  isActive(item.path)
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-text-secondary hover:bg-surface-100 hover:text-text-primary',
                ]"
                :title="sidebarCollapsed ? item.name : undefined"
                @click="mobileMenuOpen = false"
              >
                <svg
                  class="w-4 h-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
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
                  <template v-else-if="item.icon === 'users'">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </template>
                  <template v-else-if="item.icon === 'layout'">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                    />
                  </template>
                  <template v-else-if="item.icon === 'book'">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </template>
                  <template v-else-if="item.icon === 'calendar'">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </template>
                  <template v-else-if="item.icon === 'trending-up'">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                    />
                  </template>
                  <template v-else-if="item.icon === 'check-square'">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                    />
                  </template>
                  <template v-else-if="item.icon === 'edit'">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </template>
                  <template v-else-if="item.icon === 'bar-chart-2'">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M18 20V10M12 20V4M6 20v-6"
                    />
                  </template>
                  <template v-else-if="item.icon === 'sliders'">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                    />
                  </template>
                  <template v-else-if="item.icon === 'edit-3'">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </template>
                  <template v-else-if="item.icon === 'check-circle'">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </template>
                  <template v-else-if="item.icon === 'file-text'">
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
                  <template v-else-if="item.icon === 'plus-circle'">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </template>
                  <template v-else-if="item.icon === 'star'">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                    />
                  </template>
                  <template v-else-if="item.icon === 'credit-card'">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                  </template>
                  <template v-else-if="item.icon === 'clock'">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </template>
                  <template v-else-if="item.icon === 'settings'">
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
                  <template v-else-if="item.icon === 'user-plus'">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                    />
                  </template>
                  <template v-else-if="item.icon === 'globe'">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                    />
                  </template>
                  <template v-else-if="item.icon === 'megaphone'">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
                    />
                  </template>
                  <template v-else>
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </template>
                </svg>
                <span v-if="!sidebarCollapsed" class="truncate">{{ item.name }}</span>
              </router-link>
            </li>
          </ul>
        </div>
      </nav>

      <!-- User section -->
      <div class="border-t border-border p-3 shrink-0">
        <div class="flex items-center gap-2.5">
          <div
            class="w-8 h-8 rounded-full bg-surface-200 flex items-center justify-center shrink-0"
          >
            <span class="text-xs font-medium text-text-secondary">
              {{ authStore.user?.name?.charAt(0)?.toUpperCase() || '?' }}
            </span>
          </div>
          <div v-if="!sidebarCollapsed" class="flex-1 min-w-0">
            <p class="text-sm font-medium text-text-primary truncate">{{ authStore.user?.name }}</p>
            <p class="text-xs text-text-tertiary truncate capitalize">
              {{ authStore.user?.role?.replace('_', ' ') }}
            </p>
          </div>
          <button
            v-if="!sidebarCollapsed"
            class="p-1.5 rounded-md text-text-tertiary hover:text-danger-700 hover:bg-danger-50 transition-colors"
            title="Logout"
            @click="handleLogout"
          >
            <svg
              class="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
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
      </div>
    </aside>

    <!-- Main content area -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Top bar -->
      <header
        class="h-20 flex items-center justify-between px-4 lg:px-6 bg-white border-b border-border shrink-0"
      >
        <div class="flex items-center gap-3">
          <!-- Mobile hamburger -->
          <button
            class="lg:hidden p-1.5 rounded-md text-text-secondary hover:bg-surface-100"
            @click="mobileMenuOpen = !mobileMenuOpen"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.75"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <!-- Sidebar collapse toggle -->
          <button
            class="hidden lg:flex p-1.5 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-surface-100 transition-colors"
            @click="toggleSidebar"
          >
            <svg
              class="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.75"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h8m-8 6h16" />
            </svg>
          </button>
        </div>

        <div class="flex items-center gap-2">
          <TenantContextSwitcher />
          <span
            v-if="authStore.user?.tenants?.length"
            class="text-xs text-text-tertiary hidden sm:block"
          >
            {{ authStore.user.tenants[0].name }}
          </span>
        </div>
      </header>

      <!-- Page content -->
      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>
  </div>
</template>
