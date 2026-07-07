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
  total: {
    hadir: number;
    izin: number;
    sakit: number;
    alpa: number;
    total_siswa: number;
  };
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
    console.error('Failed to fetch absensi dashboard:', err);
  } finally {
    loading.value = false;
  }
}

onMounted(fetchDashboard);
</script>

<template>
  <div class="kepala-sekolah-dashboard">
    <h2>Dashboard Absensi</h2>
    <p class="subtitle">{{ todayFormatted }}</p>

    <div v-if="loading" class="loading">Memuat data...</div>

    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <button @click="fetchDashboard">Coba Lagi</button>
    </div>

    <template v-else-if="dashboardData">
      <!-- Summary Cards -->
      <div class="summary-cards">
        <div class="card card-hadir">
          <span class="card-value">{{ dashboardData.total.hadir }}</span>
          <span class="card-label">Hadir</span>
        </div>
        <div class="card card-izin">
          <span class="card-value">{{ dashboardData.total.izin }}</span>
          <span class="card-label">Izin</span>
        </div>
        <div class="card card-sakit">
          <span class="card-value">{{ dashboardData.total.sakit }}</span>
          <span class="card-label">Sakit</span>
        </div>
        <div class="card card-alpa">
          <span class="card-value">{{ dashboardData.total.alpa }}</span>
          <span class="card-label">Alpa</span>
        </div>
        <div class="card card-percentage">
          <span class="card-value">{{ attendancePercentage }}%</span>
          <span class="card-label">Kehadiran</span>
        </div>
      </div>

      <!-- Alpa Alerts -->
      <div v-if="dashboardData.alpa_alerts.length > 0" class="alpa-alerts">
        <h3>⚠️ Perhatian Khusus (Alpa Melebihi Threshold)</h3>
        <table>
          <thead>
            <tr>
              <th>Nama Siswa</th>
              <th>Kelas</th>
              <th>Total Alpa</th>
              <th>Threshold</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="alert in dashboardData.alpa_alerts" :key="alert.siswa_id">
              <td>{{ alert.siswa_nama }}</td>
              <td>{{ alert.kelas_nama }}</td>
              <td class="text-danger">{{ alert.total_alpa }}</td>
              <td>{{ alert.threshold }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Per-class breakdown -->
      <div class="per-kelas">
        <h3>Ringkasan Per Kelas</h3>
        <table>
          <thead>
            <tr>
              <th>Kelas</th>
              <th>Hadir</th>
              <th>Izin</th>
              <th>Sakit</th>
              <th>Alpa</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="kelas in dashboardData.summary_per_kelas" :key="kelas.kelas_id">
              <td>{{ kelas.kelas_nama }}</td>
              <td>{{ kelas.hadir }}</td>
              <td>{{ kelas.izin }}</td>
              <td>{{ kelas.sakit }}</td>
              <td>{{ kelas.alpa }}</td>
              <td>{{ kelas.total_siswa }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.kepala-sekolah-dashboard {
  max-width: 1000px;
}

.subtitle {
  color: #64748b;
  margin-bottom: 1.5rem;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.card {
  padding: 1.25rem;
  border-radius: 8px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.card-value {
  font-size: 1.75rem;
  font-weight: 700;
}

.card-label {
  font-size: 0.875rem;
  color: #475569;
}

.card-hadir {
  background: #dcfce7;
}
.card-izin {
  background: #fef3c7;
}
.card-sakit {
  background: #e0e7ff;
}
.card-alpa {
  background: #fee2e2;
}
.card-percentage {
  background: #f1f5f9;
}

.alpa-alerts {
  margin-bottom: 2rem;
  padding: 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
}

.alpa-alerts h3 {
  margin-bottom: 1rem;
  font-size: 1rem;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 0.625rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
}

th {
  font-weight: 600;
  font-size: 0.8125rem;
  color: #475569;
  text-transform: uppercase;
}

.text-danger {
  color: #dc2626;
  font-weight: 600;
}

.per-kelas h3 {
  margin-bottom: 1rem;
  font-size: 1rem;
}

.loading {
  padding: 2rem;
  text-align: center;
  color: #64748b;
}

.error {
  padding: 1.5rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  text-align: center;
}

.error button {
  margin-top: 0.75rem;
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style>
