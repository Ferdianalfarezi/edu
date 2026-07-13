<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { Role } from '@edu/shared';
import KepalaSekolahDashboard from '@/components/dashboard/KepalaSekolahDashboard.vue';
import BendaharaDashboard from '@/components/dashboard/BendaharaDashboard.vue';
import AdminDashboard from '@/components/dashboard/AdminDashboard.vue';
import DefaultDashboard from '@/components/dashboard/DefaultDashboard.vue';
import SuperadminDashboard from '@/components/dashboard/SuperadminDashboard.vue';

const authStore = useAuthStore();

const dashboardComponent = computed(() => {
  switch (authStore.user?.role) {
    case Role.SUPER_ADMIN:
      return SuperadminDashboard;
    case Role.KEPALA_SEKOLAH:
      return KepalaSekolahDashboard;
    case Role.BENDAHARA:
      return BendaharaDashboard;
    case Role.ADMIN:
      return AdminDashboard;
    default:
      return DefaultDashboard;
  }
});

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
});
</script>

<template>
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <!-- Page header -->
    <div class="mb-6">
      <h1 class="text-lg font-semibold text-text-primary">
        {{ greeting }}, {{ authStore.user?.name }}
      </h1>
      <p class="text-sm text-text-secondary mt-0.5">
        Berikut ringkasan informasi sekolah Anda hari ini.
      </p>
    </div>

    <!-- Role-specific dashboard -->
    <component :is="dashboardComponent" />
  </div>
</template>
