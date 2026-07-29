<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';
import { StatCard, QuickActionCard } from '@/components/ui';

interface TenantStats {
  totalUsers: number;
  totalStudents: number;
  totalClasses: number;
  totalTeachers: number;
  activeTahunAjaran: string | null;
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
    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
      <div
        v-for="i in 4"
        :key="i"
        class="bg-white border-2 border-stone-200 rounded-2xl p-5.5 animate-pulse"
      >
        <div class="h-4 bg-stone-100 rounded w-20 mb-3" />
        <div class="h-8 bg-stone-100 rounded w-16" />
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="bg-white border-2 border-stone-200 rounded-2xl p-8 text-center">
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
      <p class="text-[15px] text-text-secondary mb-3">{{ error }}</p>
      <button
        class="text-[14px] font-semibold text-primary-600 hover:text-primary-700 transition-colors"
        @click="fetchStats"
      >
        Coba lagi
      </button>
    </div>

    <!-- Stats grid -->
    <template v-else-if="stats">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5 mb-8">
        <StatCard
          label="Total Pengguna"
          :value="stats.totalUsers"
          variant="blue"
          icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
        />
        <StatCard
          label="Total Siswa"
          :value="stats.totalStudents"
          variant="green"
          icon="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"
        />
        <StatCard
          label="Total Kelas"
          :value="stats.totalClasses"
          variant="amber"
          icon="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
        />
        <StatCard
          label="Total Guru"
          :value="stats.totalTeachers"
          variant="purple"
          icon="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </div>

      <!-- Quick Actions -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <QuickActionCard
          title="Kelola Siswa"
          description="Tambah dan kelola data siswa"
          icon="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
          icon-color="bg-primary-600"
          to="/siswa"
        />
        <QuickActionCard
          title="Kelola Kelas"
          description="Atur kelas dan wali kelas"
          icon="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z"
          icon-color="bg-success-600"
          to="/kelas"
        />
        <QuickActionCard
          title="Pengaturan"
          description="Konfigurasi tahun ajaran dan sistem"
          icon="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z"
          icon-color="bg-accent-600"
          to="/tahun-ajaran"
        />
      </div>

      <!-- Active tahun ajaran -->
      <div
        v-if="stats.activeTahunAjaran"
        class="bg-white border-2 border-stone-200 rounded-2xl p-5"
      >
        <div class="flex items-center gap-3">
          <div class="w-2.5 h-2.5 rounded-full bg-success-500 animate-pulse" />
          <span class="text-[14px] text-text-secondary">Tahun Ajaran Aktif:</span>
          <span class="text-[15px] font-bold text-text-primary">{{ stats.activeTahunAjaran }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
