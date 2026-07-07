<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';

interface TenantStats {
  total_users: number;
  total_students: number;
  total_classes: number;
  total_teachers: number;
  active_tahun_ajaran: string | null;
}

const loading = ref(true);
const error = ref<string | null>(null);
const stats = ref<TenantStats | null>(null);

async function fetchStats() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<TenantStats>('/tenants/stats');
    stats.value = data;
  } catch (err: unknown) {
    error.value = 'Gagal memuat statistik.';
    console.error('Failed to fetch tenant stats:', err);
  } finally {
    loading.value = false;
  }
}

onMounted(fetchStats);
</script>

<template>
  <div>
    <!-- Loading skeleton -->
    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div
        v-for="i in 4"
        :key="i"
        class="bg-white border border-border rounded-xl p-5 animate-pulse"
      >
        <div class="h-4 bg-surface-200 rounded w-20 mb-3" />
        <div class="h-7 bg-surface-200 rounded w-12" />
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="bg-white border border-border rounded-xl p-8 text-center">
      <div
        class="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center mx-auto mb-3"
      >
        <svg
          class="w-5 h-5 text-danger-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.75"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <p class="text-sm text-text-secondary mb-3">{{ error }}</p>
      <button
        @click="fetchStats"
        class="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
      >
        Coba lagi
      </button>
    </div>

    <!-- Stats grid -->
    <template v-else-if="stats">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="bg-white border border-border rounded-xl p-5 hover:shadow-sm transition-shadow">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm text-text-secondary">Total Pengguna</span>
            <div class="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
              <svg
                class="w-4 h-4 text-primary-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.75"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            </div>
          </div>
          <p class="text-2xl font-semibold text-text-primary">{{ stats.total_users }}</p>
        </div>

        <div class="bg-white border border-border rounded-xl p-5 hover:shadow-sm transition-shadow">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm text-text-secondary">Total Siswa</span>
            <div class="w-8 h-8 rounded-lg bg-success-50 flex items-center justify-center">
              <svg
                class="w-4 h-4 text-success-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.75"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"
                />
              </svg>
            </div>
          </div>
          <p class="text-2xl font-semibold text-text-primary">{{ stats.total_students }}</p>
        </div>

        <div class="bg-white border border-border rounded-xl p-5 hover:shadow-sm transition-shadow">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm text-text-secondary">Total Kelas</span>
            <div class="w-8 h-8 rounded-lg bg-warning-50 flex items-center justify-center">
              <svg
                class="w-4 h-4 text-warning-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.75"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                />
              </svg>
            </div>
          </div>
          <p class="text-2xl font-semibold text-text-primary">{{ stats.total_classes }}</p>
        </div>

        <div class="bg-white border border-border rounded-xl p-5 hover:shadow-sm transition-shadow">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm text-text-secondary">Total Guru</span>
            <div class="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
              <svg
                class="w-4 h-4 text-text-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.75"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
          </div>
          <p class="text-2xl font-semibold text-text-primary">{{ stats.total_teachers }}</p>
        </div>
      </div>

      <!-- Active tahun ajaran -->
      <div v-if="stats.active_tahun_ajaran" class="bg-white border border-border rounded-xl p-5">
        <div class="flex items-center gap-3">
          <div class="w-2 h-2 rounded-full bg-success-500" />
          <span class="text-sm text-text-secondary">Tahun Ajaran Aktif:</span>
          <span class="text-sm font-medium text-text-primary">{{ stats.active_tahun_ajaran }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
