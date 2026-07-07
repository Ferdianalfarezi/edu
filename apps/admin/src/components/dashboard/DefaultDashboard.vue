<script setup lang="ts">
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
</script>

<template>
  <div class="default-dashboard">
    <h2>Selamat Datang</h2>
    <p>
      Halo, <strong>{{ authStore.user?.name }}</strong
      >!
    </p>
    <p class="info">
      Gunakan menu navigasi untuk mengakses fitur yang tersedia sesuai dengan peran Anda.
    </p>
  </div>
</template>

<style scoped>
.default-dashboard {
  max-width: 600px;
}

.default-dashboard h2 {
  margin-bottom: 0.5rem;
}

.info {
  margin-top: 1rem;
  color: #64748b;
}
</style>
