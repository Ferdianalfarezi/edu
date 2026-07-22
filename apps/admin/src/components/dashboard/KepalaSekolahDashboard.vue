<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { api } from '@/api/client';
import { StatCard } from '@/components/ui';

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
    <p class="text-[14px] text-text-tertiary mb-6">{{ todayFormatted }}</p>

    <!-- Loading -->
    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
      <div
        v-for="i in 4"
        :key="i"
        class="bg-white border-2 border-stone-200 rounded-2xl p-5.5 animate-pulse"
      >
        <div class="h-4 bg-stone-100 rounded w-12 mb-2" />
        <div class="h-8 bg-stone-100 rounded w-10" />
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="bg-white border-2 border-stone-200 rounded-2xl p-8 text-center">
      <p class="text-[15px] text-text-secondary mb-3">{{ error }}</p>
      <button
        class="text-[14px] font-semibold text-primary-600 hover:text-primary-700"
        @click="fetchDashboard"
      >
        Coba lagi
      </button>
    </div>

    <template v-else-if="dashboardData">
      <!-- Summary Stat Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5 mb-8">
        <StatCard
          label="Hadir"
          :value="dashboardData.total.hadir"
          variant="green"
          icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <StatCard
          label="Izin"
          :value="dashboardData.total.izin"
          variant="amber"
          icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
        <StatCard
          label="Sakit"
          :value="dashboardData.total.sakit"
          variant="blue"
          icon="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
        <StatCard
          label="Kehadiran"
          :value="`${attendancePercentage}%`"
          variant="purple"
          icon="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </div>

      <!-- Alpa Alerts -->
      <div
        v-if="dashboardData.alpa_alerts.length > 0"
        class="bg-danger-50 border-2 border-danger-200 rounded-2xl p-5 mb-8"
      >
        <h3 class="text-[15px] font-bold text-danger-700 mb-4 flex items-center gap-2">
          <svg
            class="w-5 h-5"
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
          <table class="w-full">
            <thead>
              <tr class="text-left">
                <th
                  class="pb-3 font-bold text-danger-700/70 text-[13px] uppercase tracking-[0.04em]"
                >
                  Siswa
                </th>
                <th
                  class="pb-3 font-bold text-danger-700/70 text-[13px] uppercase tracking-[0.04em]"
                >
                  Kelas
                </th>
                <th
                  class="pb-3 font-bold text-danger-700/70 text-[13px] uppercase tracking-[0.04em]"
                >
                  Alpa
                </th>
                <th
                  class="pb-3 font-bold text-danger-700/70 text-[13px] uppercase tracking-[0.04em]"
                >
                  Batas
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-danger-200/50">
              <tr v-for="alert in dashboardData.alpa_alerts" :key="alert.siswa_id">
                <td class="py-3 text-[15px] text-danger-700 font-semibold">
                  {{ alert.siswa_nama }}
                </td>
                <td class="py-3 text-[15px] text-danger-700/70">{{ alert.kelas_nama }}</td>
                <td class="py-3 text-[15px] font-bold text-danger-700">{{ alert.total_alpa }}</td>
                <td class="py-3 text-[15px] text-danger-700/70">{{ alert.threshold }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Per-class breakdown -->
      <div class="bg-white border-2 border-stone-200 rounded-2xl overflow-hidden">
        <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
          <h3 class="text-[16px] font-bold text-text-primary">Ringkasan Per Kelas</h3>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-stone-200 bg-surface-warm">
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em]"
                >
                  Kelas
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em]"
                >
                  Hadir
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em]"
                >
                  Izin
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em]"
                >
                  Sakit
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em]"
                >
                  Alpa
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em]"
                >
                  Total
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-100">
              <tr
                v-for="kelas in dashboardData.summary_per_kelas"
                :key="kelas.kelas_id"
                class="hover:bg-primary-50 transition-colors"
              >
                <td class="px-5 py-4 font-semibold text-text-primary text-[15px]">
                  {{ kelas.kelas_nama }}
                </td>
                <td class="px-5 py-4 text-success-700 font-semibold text-[15px]">
                  {{ kelas.hadir }}
                </td>
                <td class="px-5 py-4 text-warning-700 font-semibold text-[15px]">
                  {{ kelas.izin }}
                </td>
                <td class="px-5 py-4 text-primary-700 font-semibold text-[15px]">
                  {{ kelas.sakit }}
                </td>
                <td class="px-5 py-4 text-danger-700 font-bold text-[15px]">{{ kelas.alpa }}</td>
                <td class="px-5 py-4 text-text-secondary text-[15px]">{{ kelas.total_siswa }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
