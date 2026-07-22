<script setup lang="ts">
interface Props {
  title: string;
  schoolName?: string;
}

defineProps<Props>();

const emit = defineEmits<{
  (e: 'toggleMobileMenu'): void;
}>();
</script>

<template>
  <header
    class="flex items-center justify-between px-6 shrink-0"
    style="
      height: 70px;
      background: linear-gradient(
        135deg,
        var(--color-primary-600) 0%,
        var(--color-primary-700) 100%
      );
    "
  >
    <!-- Left side: hamburger (mobile) + page title -->
    <div class="flex items-center gap-3">
      <!-- Mobile hamburger button -->
      <button
        class="lg:hidden flex items-center justify-center w-10 h-10 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors duration-200"
        aria-label="Toggle menu"
        @click="emit('toggleMobileMenu')"
      >
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <!-- Page title -->
      <h1 class="text-white font-bold" style="font-size: 20px; font-weight: 700">
        {{ title }}
      </h1>
    </div>

    <!-- Right side: school name badge -->
    <div
      v-if="schoolName"
      class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white text-sm"
      style="
        background: rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(8px);
        border-radius: 8px;
        font-size: 14px;
      "
    >
      <!-- Building/school icon -->
      <svg
        class="w-4 h-4 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z"
        />
      </svg>
      <span class="truncate max-w-50">{{ schoolName }}</span>
    </div>
  </header>
</template>
