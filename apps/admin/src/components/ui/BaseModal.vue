<script setup lang="ts">
import { watch, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  show: boolean;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}>();

const emit = defineEmits<{
  close: [];
}>();

function handleEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => document.addEventListener('keydown', handleEscape));
onUnmounted(() => document.removeEventListener('keydown', handleEscape));

watch(
  () => props.show,
  (val) => {
    document.body.style.overflow = val ? 'hidden' : '';
  },
);
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200 ease-in-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200 ease-in-out"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans">
        <!-- Backdrop — warm semi-transparent overlay -->
        <div
          class="absolute inset-0 backdrop-blur-[2px]"
          style="background: rgba(28, 25, 23, 0.4)"
          @click="emit('close')"
        />

        <!-- Modal panel -->
        <div
          :class="[
            'relative bg-white rounded-(--radius-md) shadow-lg w-full overflow-hidden',
            size === 'sm' ? 'max-w-sm' : '',
            size === 'lg' ? 'max-w-2xl' : '',
            size === 'xl' ? 'max-w-4xl' : '',
            !size || size === 'md' ? 'max-w-lg' : '',
          ]"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 class="text-base font-semibold text-text-primary">{{ title }}</h2>
            <button
              class="p-1 rounded-xs text-text-tertiary hover:text-text-secondary hover:bg-surface-100 transition-colors duration-200 ease-in-out"
              @click="emit('close')"
            >
              <svg
                class="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="px-5 py-4 max-h-[70vh] overflow-y-auto">
            <slot />
          </div>

          <!-- Footer -->
          <div
            v-if="$slots.footer"
            class="px-5 py-3 border-t border-border bg-surface-50 flex items-center justify-end gap-2 [&_button]:rounded-xs"
          >
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
