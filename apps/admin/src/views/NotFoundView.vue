<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ActionButton } from '@/components/ui';

const router = useRouter();
</script>

<template>
  <div class="min-h-[60vh] flex items-center justify-center px-4">
    <div
      class="w-full max-w-md bg-white rounded-[16px] border-2 border-stone-200 shadow-xs p-8 text-center"
    >
      <svg
        class="w-16 h-16 text-stone-400 mx-auto mb-4"
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
      <h1 class="text-[26px] font-extrabold text-text-primary mb-2">
        404 — Halaman Tidak Ditemukan
      </h1>
      <p class="text-[15px] text-text-secondary mb-6">Halaman yang Anda cari tidak tersedia.</p>
      <ActionButton variant="primary" size="sm" @click="router.push('/')">
        Kembali ke Dashboard
      </ActionButton>
    </div>
  </div>
</template>
