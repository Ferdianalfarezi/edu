<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';
import { Role } from '@edu/shared';
import KepalaSekolahDashboard from '@/components/dashboard/KepalaSekolahDashboard.vue';
import BendaharaDashboard from '@/components/dashboard/BendaharaDashboard.vue';
import AdminDashboard from '@/components/dashboard/AdminDashboard.vue';
import DefaultDashboard from '@/components/dashboard/DefaultDashboard.vue';

const authStore = useAuthStore();
const router = useRouter();

const dashboardComponent = computed(() => {
  switch (authStore.user?.role) {
    case Role.KEPALA_SEKOLAH:
      return KepalaSekolahDashboard;
    case Role.BENDAHARA:
      return BendaharaDashboard;
    case Role.ADMIN:
    case Role.SUPER_ADMIN:
      return AdminDashboard;
    default:
      return DefaultDashboard;
  }
});

function handleLogout() {
  authStore.logout();
  router.push('/login');
}
</script>

<template>
  <div class="dashboard">
    <header>
      <h1>Dashboard</h1>
      <div class="user-info">
        <span>{{ authStore.user?.name }} ({{ authStore.user?.role }})</span>
        <button @click="handleLogout">Logout</button>
      </div>
    </header>
    <main>
      <component :is="dashboardComponent" />
    </main>
  </div>
</template>

<style scoped>
.dashboard {
  padding: 2rem;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e2e8f0;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.user-info button {
  padding: 0.5rem 1rem;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style>
