<script setup lang="ts">
import { ref } from 'vue';
import { api } from '@/api/client';
import { BaseModal, ActionButton } from '@/components/ui';

const props = defineProps<{
  show: boolean;
  user: { id: string; nama: string | null; email: string | null } | null;
}>();

const emit = defineEmits<{
  close: [];
  success: [userEmail: string];
}>();

const loading = ref(false);

function handleClose() {
  loading.value = false;
  emit('close');
}

async function handleReset() {
  if (!props.user) return;

  loading.value = true;
  try {
    await api.post('/users/' + props.user.id + '/reset-password');
    emit('success', props.user.email!);
    emit('close');
  } catch {
    // Error toast already handled by global Axios interceptor in api/client.ts
    loading.value = false;
  }
}
</script>

<template>
  <BaseModal :show="show" title="Reset Password" size="sm" @close="handleClose">
    <p class="text-sm text-text-secondary leading-relaxed">
      Anda akan mereset password untuk
      <span class="font-semibold text-text-primary">{{ user?.nama ?? '-' }}</span
      >. Aksi ini tidak dapat dibatalkan.
    </p>

    <template #footer>
      <ActionButton variant="neutral" @click="handleClose">Batal</ActionButton>
      <ActionButton variant="danger" :disabled="loading" @click="handleReset">
        <svg v-if="loading" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        Ya, Reset
      </ActionButton>
    </template>
  </BaseModal>
</template>
