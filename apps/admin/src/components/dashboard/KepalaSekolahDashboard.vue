<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { api } from '@/api/client';

interface AbsensiSummaryPerKelas {
  kelas_id: string;
  kelas_nama: string;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
  total_siswa: number;
}
interface AlpaAlert {
  siswa_id: string;
  siswa_nama: string;
  kelas_nama: string;
  total_alpa: number;
  threshold: number;
}
interface AbsensiDashboardResponse {
  tanggal: string;
  summary_per_kelas: AbsensiSummaryPerKelas[];
  total: { hadir: number; izin: number; sakit: number; alpa: number; total_siswa: number };
  alpa_alerts: AlpaAlert[];
}

const loading = ref(true);
const error = ref<string | null>(null);
const dashboardData = ref<AbsensiDashboardResponse | null>(null);

const todayFormatted = computed(() => {
  if (!dashboardData.value?.tanggal) return '';
  return new Date(dashboardData.value.tanggal).toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
});

const attendancePercentage = computed(() => {
  if (!dashboardData.value?.total) return 0;
  const { hadir, total_siswa } = dashboardData.value.total;
  if (total_siswa === 0) return 0;
  return Math.round((hadir / total_siswa) * 100);
});

async function fetchDashboard() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<AbsensiDashboardResponse>('/absensi/dashboard');
    dashboardData.value = data;
  } catch (err: unknown) {
    error.value = 'Gagal memuat data dashboard absensi.';
    console.error(err);
  } finally {
    loading.value = false;
  }
}

onMounted(fetchDashboard);
</script>

<template>
  <div>
    <p class="text-sm text-text-tertiary mb-5">{{ todayFormatted }}</p>

    <!-- Loading -->
    <div v-if="loading" class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      <div
        v-for="i in 5"
        :key="i"
        class="bg-white border border-border rounded-xl p-4 animate-pulse"
      >
        <div class="h-4 bg-surface-200 rounded w-12 mb-2" />
        <div class="h-6 bg-surface-200 rounded w-8" />
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="bg-white border border-border rounded-xl p-8 text-center">
      <p class="text-sm text-text-secondary mb-3">{{ error }}</p>
      <button
        class="text-sm font-medium text-primary-600 hover:text-primary-700"
        @click="fetchDashboard"
      >
        Coba lagi
      </button>
    </div>

    <template v-else-if="dashboardData">
      <!-- Summary Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div class="bg-white border border-border rounded-xl p-4">
          <p class="text-xs text-text-tertiary mb-1">Hadir</p>
          <p class="text-xl font-semibold text-success-700">{{ dashboardData.total.hadir }}</p>
        </div>
        <div class="bg-white border border-border rounded-xl p-4">
          <p class="text-xs text-text-tertiary mb-1">Izin</p>
          <p class="text-xl font-semibold text-warning-700">{{ dashboardData.total.izin }}</p>
        </div>
        <div class="bg-white border border-border rounded-xl p-4">
          <p class="text-xs text-text-tertiary mb-1">Sakit</p>
          <p class="text-xl font-semibold text-primary-700">{{ dashboardData.total.sakit }}</p>
        </div>
        <div class="bg-white border border-border rounded-xl p-4">
          <p class="text-xs text-text-tertiary mb-1">Alpa</p>
          <p class="text-xl font-semibold text-danger-700">{{ dashboardData.total.alpa }}</p>
        </div>
        <div class="bg-white border border-border rounded-xl p-4">
          <p class="text-xs text-text-tertiary mb-1">Kehadiran</p>
          <p class="text-xl font-semibold text-text-primary">{{ attendancePercentage }}%</p>
        </div>
      </div>

      <!-- Alpa Alerts -->
      <div
        v-if="dashboardData.alpa_alerts.length > 0"
        class="bg-danger-50 border border-danger-500/20 rounded-xl p-4 mb-6"
      >
        <h3 class="text-sm font-semibold text-danger-700 mb-3 flex items-center gap-2">
          <svg
            class="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          Perhatian Khusus (Alpa Melebihi Batas)
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left">
                <th class="pb-2 font-medium text-danger-700/70 text-xs">Siswa</th>
                <th class="pb-2 font-medium text-danger-700/70 text-xs">Kelas</th>
                <th class="pb-2 font-medium text-danger-700/70 text-xs">Alpa</th>
                <th class="pb-2 font-medium text-danger-700/70 text-xs">Batas</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-danger-500/10">
              <tr v-for="alert in dashboardData.alpa_alerts" :key="alert.siswa_id">
                <td class="py-2 text-danger-700">{{ alert.siswa_nama }}</td>
                <td class="py-2 text-danger-700/70">{{ alert.kelas_nama }}</td>
                <td class="py-2 font-semibold text-danger-700">{{ alert.total_alpa }}</td>
                <td class="py-2 text-danger-700/70">{{ alert.threshold }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Per-class breakdown -->
      <div class="bg-white border border-border rounded-xl overflow-hidden">
        <div class="px-4 py-3 border-b border-border">
          <h3 class="text-sm font-semibold text-text-primary">Ringkasan Per Kelas</h3>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border bg-surface-50">
                <th class="px-4 py-2.5 text-left font-medium text-text-secondary text-xs">Kelas</th>
                <th class="px-4 py-2.5 text-left font-medium text-text-secondary text-xs">Hadir</th>
                <th class="px-4 py-2.5 text-left font-medium text-text-secondary text-xs">Izin</th>
                <th class="px-4 py-2.5 text-left font-medium text-text-secondary text-xs">Sakit</th>
                <th class="px-4 py-2.5 text-left font-medium text-text-secondary text-xs">Alpa</th>
                <th class="px-4 py-2.5 text-left font-medium text-text-secondary text-xs">Total</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="kelas in dashboardData.summary_per_kelas"
                :key="kelas.kelas_id"
                class="hover:bg-surface-50 transition-colors"
              >
                <td class="px-4 py-2.5 font-medium text-text-primary">{{ kelas.kelas_nama }}</td>
                <td class="px-4 py-2.5 text-success-700">{{ kelas.hadir }}</td>
                <td class="px-4 py-2.5 text-warning-700">{{ kelas.izin }}</td>
                <td class="px-4 py-2.5 text-primary-700">{{ kelas.sakit }}</td>
                <td class="px-4 py-2.5 text-danger-700">{{ kelas.alpa }}</td>
                <td class="px-4 py-2.5 text-text-secondary">{{ kelas.total_siswa }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
