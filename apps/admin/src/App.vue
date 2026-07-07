<script setup lang="ts">
import { RouterView } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import ForceChangePasswordModal from '@/components/ForceChangePasswordModal.vue';

const authStore = useAuthStore();
</script>

<template>
  <RouterView />
  <ForceChangePasswordModal v-if="authStore.isAuthenticated && authStore.mustChangePassword" />
</template>
