<script setup lang="ts">
import { useToast } from '@/composables/useToast';

const { toasts, removeToast } = useToast();

function iconFor(type: string) {
  switch (type) {
    case 'error':
      return '✕';
    case 'success':
      return '✓';
    case 'warning':
      return '⚠';
    case 'info':
      return 'ℹ';
    default:
      return '';
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-9999 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      <TransitionGroup
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-x-full opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-full opacity-0"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast-item pointer-events-auto flex items-start gap-3"
          :data-type="toast.type"
        >
          <span class="toast-icon font-bold leading-none mt-0.5" :data-type="toast.type">
            {{ iconFor(toast.type) }}
          </span>
          <span class="toast-message flex-1 leading-snug">{{ toast.message }}</span>
          <button class="toast-close ml-2 font-bold leading-none" @click="removeToast(toast.id)">
            ×
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-item {
  background: var(--color-surface-0);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  font-size: 15px;
  padding: 12px 16px;
  border-left: 4px solid;
  color: var(--color-text-primary);
}

/* Colored left-border indicators by type */
.toast-item[data-type='success'] {
  border-left-color: var(--color-success-500);
}

.toast-item[data-type='error'] {
  border-left-color: var(--color-danger-500);
}

.toast-item[data-type='warning'] {
  border-left-color: var(--color-warning-500);
}

.toast-item[data-type='info'] {
  border-left-color: var(--color-primary-500);
}

/* Icon color matching toast type */
.toast-icon[data-type='success'] {
  color: var(--color-success-500);
}

.toast-icon[data-type='error'] {
  color: var(--color-danger-500);
}

.toast-icon[data-type='warning'] {
  color: var(--color-warning-500);
}

.toast-icon[data-type='info'] {
  color: var(--color-primary-500);
}

.toast-icon {
  font-size: 16px;
}

.toast-message {
  color: var(--color-text-primary);
}

.toast-close {
  font-size: 18px;
  border-radius: 8px;
  padding: 2px 6px;
  color: var(--color-text-secondary);
  opacity: 0.7;
  transition: all 200ms ease;
}

.toast-close:hover {
  opacity: 1;
  background: var(--color-surface-100);
}
</style>
