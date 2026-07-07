<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import AppLayout from '@/components/layout/AppLayout.vue';
import ForceChangePasswordModal from '@/components/ForceChangePasswordModal.vue';
import ToastNotification from '@/components/ui/ToastNotification.vue';

const route = useRoute();
const authStore = useAuthStore();

const showLayout = computed(() => {
  return authStore.isAuthenticated && !route.meta.guest;
});
</script>

<template>
  <AppLayout v-if="showLayout">
    <RouterView />
  </AppLayout>
  <RouterView v-else />
  <ForceChangePasswordModal v-if="authStore.isAuthenticated && authStore.mustChangePassword" />
  <ToastNotification />
</template>
