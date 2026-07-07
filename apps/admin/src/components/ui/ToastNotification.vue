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
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="translate-x-full opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-full opacity-0"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto rounded-lg shadow-lg px-4 py-3 flex items-start gap-3 text-sm"
          :class="{
            'bg-red-600 text-white': toast.type === 'error',
            'bg-green-600 text-white': toast.type === 'success',
            'bg-yellow-500 text-white': toast.type === 'warning',
            'bg-blue-600 text-white': toast.type === 'info',
          }"
        >
          <span class="font-bold text-base leading-none mt-0.5">{{ iconFor(toast.type) }}</span>
          <span class="flex-1 leading-snug">{{ toast.message }}</span>
          <button
            class="ml-2 opacity-70 hover:opacity-100 font-bold text-base leading-none"
            @click="removeToast(toast.id)"
          >
            ×
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
