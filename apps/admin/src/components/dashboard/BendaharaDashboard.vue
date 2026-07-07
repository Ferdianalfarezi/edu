<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';

interface TunggakanSiswa {
  siswa_id: string;
  siswa_nama: string;
  kelas_nama: string;
  bulan: number;
  tahun: number;
  nominal: number;
  total_dibayar: number;
  sisa: number;
  status: string;
  tanggal_jatuh_tempo: string;
}

interface TunggakanSummaryResponse {
  total_tunggakan: number;
  total_siswa_nunggak: number;
  total_tagihan_nunggak: number;
  tunggakan_list: TunggakanSiswa[];
}

const loading = ref(true);
const error = ref<string | null>(null);
const summaryData = ref<TunggakanSummaryResponse | null>(null);
const filterKelas = ref('');

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'belum_bayar':
      return 'Belum Bayar';
    case 'cicilan':
      return 'Cicilan';
    default:
      return status;
  }
}

async function fetchTunggakan() {
  loading.value = true;
  error.value = null;
  try {
    const params: Record<string, string> = {};
    if (filterKelas.value) {
      params.kelas_id = filterKelas.value;
    }
    const { data } = await api.get<TunggakanSummaryResponse>('/tagihan/tunggakan/summary', {
      params,
    });
    summaryData.value = data;
  } catch (err: unknown) {
    error.value = 'Gagal memuat data tunggakan.';
    console.error('Failed to fetch tunggakan summary:', err);
  } finally {
    loading.value = false;
  }
}

onMounted(fetchTunggakan);
</script>

<template>
  <div class="bendahara-dashboard">
    <h2>Dashboard Tunggakan</h2>

    <div v-if="loading" class="loading">Memuat data...</div>

    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <button @click="fetchTunggakan">Coba Lagi</button>
    </div>

    <template v-else-if="summaryData">
      <!-- Summary Cards -->
      <div class="summary-cards">
        <div class="card card-total">
          <span class="card-value">{{ formatRupiah(summaryData.total_tunggakan) }}</span>
          <span class="card-label">Total Tunggakan</span>
        </div>
        <div class="card card-siswa">
          <span class="card-value">{{ summaryData.total_siswa_nunggak }}</span>
          <span class="card-label">Siswa Menunggak</span>
        </div>
        <div class="card card-tagihan">
          <span class="card-value">{{ summaryData.total_tagihan_nunggak }}</span>
          <span class="card-label">Tagihan Tertunggak</span>
        </div>
      </div>

      <!-- Tunggakan List -->
      <div class="tunggakan-list">
        <div class="list-header">
          <h3>Daftar Tunggakan</h3>
          <input
            v-model="filterKelas"
            type="text"
            placeholder="Filter kelas..."
            class="filter-input"
            @change="fetchTunggakan"
          />
        </div>

        <div v-if="summaryData.tunggakan_list.length === 0" class="empty-state">
          <p>Tidak ada tunggakan.</p>
        </div>

        <table v-else>
          <thead>
            <tr>
              <th>Nama Siswa</th>
              <th>Kelas</th>
              <th>Bulan/Tahun</th>
              <th>Nominal</th>
              <th>Sisa</th>
              <th>Jatuh Tempo</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in summaryData.tunggakan_list"
              :key="`${item.siswa_id}-${item.bulan}-${item.tahun}`"
            >
              <td>{{ item.siswa_nama }}</td>
              <td>{{ item.kelas_nama }}</td>
              <td>{{ item.bulan }}/{{ item.tahun }}</td>
              <td>{{ formatRupiah(item.nominal) }}</td>
              <td class="text-danger">{{ formatRupiah(item.sisa) }}</td>
              <td>{{ formatDate(item.tanggal_jatuh_tempo) }}</td>
              <td>
                <span class="badge" :class="`badge-${item.status}`">
                  {{ getStatusLabel(item.status) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.bendahara-dashboard {
  max-width: 1000px;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
  font-size: 1.5rem;
  font-weight: 700;
}

.card-label {
  font-size: 0.875rem;
  color: #475569;
}

.card-total {
  background: #fee2e2;
}
.card-siswa {
  background: #fef3c7;
}
.card-tagihan {
  background: #e0e7ff;
}

.tunggakan-list {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1.25rem;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.list-header h3 {
  font-size: 1rem;
  margin: 0;
}

.filter-input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.875rem;
  width: 180px;
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

.badge {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.badge-belum_bayar {
  background: #fee2e2;
  color: #b91c1c;
}

.badge-cicilan {
  background: #fef3c7;
  color: #92400e;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: #64748b;
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
