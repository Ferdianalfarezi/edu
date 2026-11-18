<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTenantContextStore } from '@/stores/tenant-context';
import { useSubNavigation } from '@/composables/useSubNavigation';
import AppSidebar from '@/components/layout/AppSidebar.vue';
import AppTopBar from '@/components/layout/AppTopBar.vue';
import AppSubNav from '@/components/layout/AppSubNav.vue';
import { api } from '@/api/client';
import { Role } from '@edu/shared';
import ProfilGuruModal from '@/components/guru/ProfilGuruModal.vue';
import { useProfilSaya } from '@/composables/useProfilSaya';
import { useToast } from '@/composables/useToast';
import type { ProfilGuru } from '@/utils/kelengkapan-guru';

const route = useRoute();
const authStore = useAuthStore();
const tenantContextStore = useTenantContextStore();
const { tabs } = useSubNavigation();

const mobileMenuOpen = ref(false);

// --- Profil guru: pengingat data diri belum lengkap + modal profil ---
const toast = useToast();
const profilSaya = useProfilSaya();
const isGuru = computed(() => authStore.user?.role === Role.GURU);
const KUNCI_TUTUP = 'profil-guru-banner-ditutup';
const bannerDitutup = ref(false);
try {
  bannerDitutup.value = sessionStorage.getItem(KUNCI_TUTUP) === '1';
} catch {
  // sessionStorage tidak tersedia: banner tetap tampil
}
const tampilkanBanner = computed(
  () => isGuru.value && profilSaya.belumLengkap.value && !bannerDitutup.value,
);

function tutupBanner() {
  bannerDitutup.value = true;
  try {
    sessionStorage.setItem(KUNCI_TUTUP, '1');
  } catch {
    // abaikan
  }
}

function onProfilSaved(data: ProfilGuru) {
  profilSaya.profil.value = data;
  profilSaya.showModal.value = false;
  toast.success(
    profilSaya.belumLengkap.value
      ? 'Data diri disimpan.'
      : 'Data diri sudah lengkap. Terima kasih!',
  );
}

// Reactive tenant info fetched from API (used when auth response lacks tenant data)
const fetchedTenantName = ref<string | null>(null);
const fetchedTenantLogoUrl = ref<string | null>(null);

onMounted(async () => {
  // Skip if tenant context is already set (super admin) or tenant info already in auth user
  if (tenantContextStore.activeTenant) return;
  if (authStore.user?.tenants?.[0]?.name) return;

  // Skip for super_admin (no tenant)
  if (
    !authStore.user?.tenant_id &&
    !(authStore.user as unknown as Record<string, unknown>)?.['tenantId']
  )
    return;

  try {
    const { data } = await api.get<{ id: string; nama: string; logoUrl?: string }>(
      '/tenants/profile',
    );
    fetchedTenantName.value = data.nama ?? null;
    fetchedTenantLogoUrl.value = data.logoUrl ?? null;
  } catch {
    // Non-critical — topbar just won't show school name
  }
});

const pageTitle = computed(() => {
  if (route.meta?.title) return route.meta.title as string;

  // Derive from route path
  const path = route.path;
  if (path === '/') return 'Dashboard';

  const titleMap: Record<string, string> = {
    '/siswa': 'Siswa',
    '/kelas': 'Kelas',
    '/mata-pelajaran': 'Mata Pelajaran',
    '/jadwal': 'Jadwal',
    '/jadwal-saya': 'Jadwal Saya',
    '/kenaikan-kelas': 'Kenaikan Kelas',
    '/absensi/input': 'Input Absensi',
    '/absensi/edit': 'Edit Absensi',
    '/absensi/rekap': 'Rekap Absensi',
    '/rapor/komponen': 'Komponen Nilai',
    '/rapor/input': 'Input Nilai',
    '/rapor/finalize': 'Finalisasi Rapor',
    '/rapor': 'Lihat Rapor',
    '/rpp/portal': 'Portal RPP',
    '/rpp/create': 'Buat RPP',
    '/rpp/favorites': 'Favorit RPP',
    '/tagihan': 'Tagihan',
    '/pengumuman': 'Pengumuman',
    '/barang': 'Inventaris Barang',
    '/tahun-ajaran': 'Tahun Ajaran',
    '/konfigurasi': 'Konfigurasi',
    '/users': 'Pengguna',
    '/audit-logs': 'Audit Log',
    '/tenants': 'Tenant',
  };

  // Exact match first
  if (titleMap[path]) return titleMap[path];

  // Prefix match for nested routes
  const matchedKey = Object.keys(titleMap).find(
    (key) => path.startsWith(key + '/') || path === key,
  );
  if (matchedKey) return titleMap[matchedKey];

  // Fallback: capitalize first path segment
  const segment = path.split('/').filter(Boolean)[0] || '';
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
});

const schoolName = computed(() => {
  // 1. Active tenant context (super admin switching)
  if (tenantContextStore.activeTenant?.nama) {
    return tenantContextStore.activeTenant.nama;
  }
  // 2. Tenant info from login response (if backend already returns it)
  if (authStore.user?.tenants?.[0]?.name) {
    return authStore.user.tenants[0].name;
  }
  // 3. Fetched on mount via GET /tenant/:id
  return fetchedTenantName.value ?? '';
});

const schoolLogoUrl = computed<string | null>(() => {
  // 1. Active tenant context (super admin switching)
  if (tenantContextStore.activeTenant) {
    return tenantContextStore.logoUrl;
  }
  // 2. Tenant info from login response (camelCase after axios transform)
  const firstTenant = authStore.user?.tenants?.[0] as
    ({ logoUrl?: string; logo_url?: string } & { id: string; name: string }) | undefined;
  if (firstTenant?.logoUrl ?? firstTenant?.logo_url) {
    return firstTenant?.logoUrl ?? firstTenant?.logo_url ?? null;
  }
  // 3. Fetched on mount via GET /tenant/:id
  return fetchedTenantLogoUrl.value;
});
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-surface-warm">
    <!-- Mobile overlay backdrop -->
    <div
      v-if="mobileMenuOpen"
      class="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
      @click="mobileMenuOpen = false"
    />

    <!-- Sidebar (fixed on desktop, drawer on mobile) -->
    <div
      :class="[
        'fixed lg:static inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out',
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ]"
    >
      <AppSidebar @navigate="mobileMenuOpen = false" @toggle-mobile-menu="mobileMenuOpen = false" />
    </div>

    <!-- Main content area -->
    <div class="flex-1 flex flex-col overflow-hidden min-w-0">
      <AppTopBar
        :title="pageTitle"
        :school-name="schoolName"
        :logo-url="schoolLogoUrl"
        @toggle-mobile-menu="mobileMenuOpen = !mobileMenuOpen"
      />

      <AppSubNav :tabs="tabs" :active-path="route.path" />

      <!-- Pengingat data diri guru belum lengkap -->
      <div
        v-if="tampilkanBanner"
        class="flex flex-wrap items-center gap-3 px-6 py-2.5 bg-warning-50 border-b border-warning-100 text-[14px] text-warning-700"
      >
        <span class="w-2 h-2 rounded-full bg-warning-500 shrink-0" />
        <span class="flex-1 min-w-0">
          Data diri Anda belum lengkap
          <span class="text-warning-600">(kurang: {{ profilSaya.kurang.value.join(', ') }})</span>.
        </span>
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg bg-warning-500 text-white text-[13px] font-semibold hover:bg-warning-600"
          @click="profilSaya.showModal.value = true"
        >
          Lengkapi sekarang
        </button>
        <button
          type="button"
          class="p-1 rounded text-warning-600 hover:bg-warning-100"
          title="Tutup (muncul lagi saat login berikutnya)"
          aria-label="Tutup pengingat"
          @click="tutupBanner"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <!-- Page content with scrollable area and custom scrollbar -->
      <main class="flex-1 overflow-y-auto scrollbar-custom">
        <slot />
      </main>
    </div>

    <ProfilGuruModal
      v-if="isGuru"
      :show="profilSaya.showModal.value"
      title="Profil Saya"
      :profil="profilSaya.profil.value"
      endpoint="/users/me/profil-guru"
      :keterangan="`${profilSaya.profil.value?.nama ?? ''} · ${profilSaya.profil.value?.email ?? ''}. Nama dan email hanya bisa diubah oleh admin sekolah.`"
      @close="profilSaya.showModal.value = false"
      @saved="onProfilSaved"
    />
  </div>
</template>

<style scoped>
/* Custom scrollbar for content area */
.scrollbar-custom {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.15) transparent;
}

.scrollbar-custom::-webkit-scrollbar {
  width: 8px;
}

.scrollbar-custom::-webkit-scrollbar-track {
  background: transparent;
}

.scrollbar-custom::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.15);
  border-radius: 9999px;
}

.scrollbar-custom::-webkit-scrollbar-thumb:hover {
  background-color: rgba(0, 0, 0, 0.25);
}
</style>
