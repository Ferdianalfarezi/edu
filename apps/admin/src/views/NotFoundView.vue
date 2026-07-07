<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
    <svg
      class="w-16 h-16 text-text-tertiary mb-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="1.5"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
      />
    </svg>
    <h1 class="text-2xl font-semibold text-text-primary mb-2">404 — Halaman Tidak Ditemukan</h1>
    <p class="text-sm text-text-secondary mb-6">Halaman yang Anda cari tidak tersedia.</p>
    <button
      class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
      @click="router.push('/')"
    >
      Kembali ke Dashboard
    </button>
  </div>
</template>
