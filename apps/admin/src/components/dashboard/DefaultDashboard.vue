<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

const quickLinks = [
  {
    name: 'Input Absensi',
    path: '/absensi/input',
    icon: 'check',
    desc: 'Catat kehadiran siswa hari ini',
  },
  {
    name: 'Portal RPP',
    path: '/rpp/portal',
    icon: 'book',
    desc: 'Lihat dan buat rencana pembelajaran',
  },
  { name: 'Jadwal', path: '/jadwal', icon: 'calendar', desc: 'Lihat jadwal mengajar' },
];
</script>

<template>
  <div>
    <div class="bg-white border border-border rounded-xl p-6 mb-6">
      <p class="text-sm text-text-secondary">
        Gunakan menu navigasi di sebelah kiri untuk mengakses fitur yang tersedia sesuai dengan
        peran Anda.
      </p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <button
        v-for="link in quickLinks"
        :key="link.path"
        class="bg-white border border-border rounded-xl p-5 text-left hover:shadow-sm hover:border-primary-200 transition-all group"
        @click="router.push(link.path)"
      >
        <div
          class="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center mb-3 group-hover:bg-primary-100 transition-colors"
        >
          <svg
            class="w-4 h-4 text-primary-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.75"
          >
            <template v-if="link.icon === 'check'">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </template>
            <template v-else-if="link.icon === 'book'">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </template>
            <template v-else>
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </template>
          </svg>
        </div>
        <h3 class="text-sm font-medium text-text-primary mb-0.5">{{ link.name }}</h3>
        <p class="text-xs text-text-tertiary">{{ link.desc }}</p>
      </button>
    </div>
  </div>
</template>
