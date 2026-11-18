<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';

interface Props {
  title: string;
  schoolName?: string;
  logoUrl?: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'toggleMobileMenu'): void;
}>();

// Local ref so @error can clear it without mutating the prop
const resolvedLogoUrl = ref<string | null>(props.logoUrl ?? null);
watch(
  () => props.logoUrl,
  (val) => {
    resolvedLogoUrl.value = val ?? null;
  },
);
function handleLogoError() {
  resolvedLogoUrl.value = null;
}

// Tanggal & jam (waktu perangkat), diperbarui tiap pergantian menit
const sekarang = ref(new Date());
let timer: ReturnType<typeof setTimeout> | undefined;
function jadwalkanTick() {
  const sisaMs = 60_000 - (Date.now() % 60_000);
  timer = setTimeout(() => {
    sekarang.value = new Date();
    jadwalkanTick();
  }, sisaMs + 50);
}
onMounted(jadwalkanTick);
onUnmounted(() => clearTimeout(timer));

function formatTanggalNavbar(d: Date): string {
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatJamNavbar(d: Date): string {
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  // Nama zona waktu singkat (WIB/WITA/WIT) kalau browser menyediakannya
  const zona =
    new Intl.DateTimeFormat('id-ID', { timeZoneName: 'short' })
      .formatToParts(d)
      .find((p) => p.type === 'timeZoneName')?.value ?? '';
  return zona ? `${jam} ${zona}` : jam;
}
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
    <!-- Left side: branding + hamburger (mobile) + page title -->
    <div class="flex items-center gap-3">
      <span class="hidden lg:block w-px h-5 bg-white/25"></span>

      <!-- Page title -->
      <h1 class="text-white font-bold" style="font-size: 20px; font-weight: 700">
        {{ title }}
      </h1>

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
    </div>

    <!-- Right side: tanggal & jam + school logo + name -->
    <div class="flex items-center gap-3">
      <div
        class="hidden md:flex items-center gap-2 text-white/90"
        style="font-size: 14px"
        :title="sekarang.toLocaleString('id-ID')"
      >
        <svg
          class="w-4 h-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span class="hidden xl:inline">{{ formatTanggalNavbar(sekarang) }}</span>
        <span class="hidden xl:inline text-white/50">·</span>
        <span class="font-semibold tabular-nums">{{ formatJamNavbar(sekarang) }}</span>
      </div>
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
        <!-- School logo (32x32 rounded) with fallback to /logo.png -->
        <img
          v-if="resolvedLogoUrl"
          :src="resolvedLogoUrl"
          :alt="schoolName"
          class="w-8 h-8 rounded-full object-cover shrink-0"
          @error="handleLogoError"
        />
        <img v-else src="/logo.png" alt="Teman Sekolah" class="w-8 h-8 rounded-full shrink-0" />
        <span class="truncate max-w-50">{{ schoolName }}</span>
      </div>
    </div>
  </header>
</template>
