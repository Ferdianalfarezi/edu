<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api/client';

interface Kelas {
  id: string;
  nama: string;
  tingkat: number;
}

interface RekapSiswa {
  siswa_id: string;
  siswa_nama: string;
  siswa_nisn: string | null;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
  persentase_kehadiran: number | null;
}

interface RekapResponse {
  kelas_id: string;
  kelas_nama: string;
  bulan: number;
  tahun: number;
  total_hari_efektif: number | null;
  periode: 'bulanan' | 'semester';
  data: RekapSiswa[];
  hari_efektif_source?: 'manual' | 'otomatis' | null;
}

const BULAN_LABELS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

// State
const kelasList = ref<Kelas[]>([]);
const rekapData = ref<RekapResponse | null>(null);
const loading = ref(false);
const exporting = ref(false);
const errorMessage = ref('');

const selectedKelasId = ref('');
const selectedPeriode = ref<'bulanan' | 'semester'>('bulanan');
const selectedBulan = ref(new Date().getMonth() + 1);
const selectedTahun = ref(new Date().getFullYear());
const selectedSemester = ref(1);

// Computed
const tahunOptions = computed(() => {
  const current = new Date().getFullYear();
  return [current - 1, current, current + 1];
});

const totals = computed(() => {
  if (!rekapData.value?.data) return { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
  return rekapData.value.data.reduce(
    (acc, siswa) => ({
      hadir: acc.hadir + siswa.hadir,
      izin: acc.izin + siswa.izin,
      sakit: acc.sakit + siswa.sakit,
      alpa: acc.alpa + siswa.alpa,
    }),
    { hadir: 0, izin: 0, sakit: 0, alpa: 0 },
  );
});

const averagePercentage = computed(() => {
  if (!rekapData.value?.data || rekapData.value.data.length === 0) return null;
  const validEntries = rekapData.value.data.filter((s) => s.persentase_kehadiran !== null);
  if (validEntries.length === 0) return null;
  const sum = validEntries.reduce((acc, s) => acc + (s.persentase_kehadiran || 0), 0);
  return Math.round((sum / validEntries.length) * 100) / 100;
});

const periodeLabel = computed(() => {
  if (selectedPeriode.value === 'bulanan') {
    return `${BULAN_LABELS[selectedBulan.value - 1]} ${selectedTahun.value}`;
  }
  return `Semester ${selectedSemester.value} — ${selectedTahun.value}`;
});

// Data fetching
async function fetchKelasList() {
  try {
    const { data } = await api.get<{ data: Kelas[] }>('/kelas');
    kelasList.value = data.data;
  } catch (error) {
    console.error('Failed to fetch kelas:', error);
  }
}

async function fetchRekap() {
  if (!selectedKelasId.value) return;

  loading.value = true;
  errorMessage.value = '';

  try {
    const params: Record<string, string | number> = {
      kelas_id: selectedKelasId.value,
      tahun: selectedTahun.value,
      periode: selectedPeriode.value,
    };

    if (selectedPeriode.value === 'bulanan') {
      params.bulan = selectedBulan.value;
    } else {
      params.semester = selectedSemester.value;
    }

    const { data } = await api.get<RekapResponse>('/absensi/rekap', { params });
    rekapData.value = data;
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } };
    errorMessage.value = error.response?.data?.message || 'Gagal memuat data rekap.';
    rekapData.value = null;
  } finally {
    loading.value = false;
  }
}

async function exportRekap() {
  if (!selectedKelasId.value) return;

  exporting.value = true;
  try {
    const params: Record<string, string | number> = {
      kelas_id: selectedKelasId.value,
      tahun: selectedTahun.value,
      periode: selectedPeriode.value,
    };

    if (selectedPeriode.value === 'bulanan') {
      params.bulan = selectedBulan.value;
    } else {
      params.semester = selectedSemester.value;
    }

    const response = await api.get('/absensi/rekap/export', {
      params,
      responseType: 'blob',
    });

    // Trigger download
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;

    const filename =
      selectedPeriode.value === 'bulanan'
        ? `rekap-absensi-${BULAN_LABELS[selectedBulan.value - 1]}-${selectedTahun.value}.xlsx`
        : `rekap-absensi-semester-${selectedSemester.value}-${selectedTahun.value}.xlsx`;

    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } };
    errorMessage.value = error.response?.data?.message || 'Gagal mengexport laporan.';
  } finally {
    exporting.value = false;
  }
}

function getPercentageClass(value: number | null): string {
  if (value === null) return '';
  if (value >= 90) return 'pct-high';
  if (value >= 75) return 'pct-medium';
  return 'pct-low';
}

// Watchers
watch([selectedKelasId, selectedPeriode, selectedBulan, selectedTahun, selectedSemester], () => {
  if (selectedKelasId.value) {
    fetchRekap();
  }
});

// Init
onMounted(() => {
  fetchKelasList();
});
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Rekap Absensi</h1>
      <button
        v-if="rekapData && rekapData.data.length > 0"
        class="btn btn-primary"
        :disabled="exporting"
        @click="exportRekap"
      >
        {{ exporting ? 'Mengexport...' : '📥 Export' }}
      </button>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar">
      <div class="form-group-inline">
        <label>Kelas:</label>
        <select v-model="selectedKelasId" class="input select-input">
          <option value="" disabled>Pilih Kelas</option>
          <option v-for="kelas in kelasList" :key="kelas.id" :value="kelas.id">
            {{ kelas.nama }}
          </option>
        </select>
      </div>

      <div class="form-group-inline">
        <label>Periode:</label>
        <select v-model="selectedPeriode" class="input">
          <option value="bulanan">Bulanan</option>
          <option value="semester">Semester</option>
        </select>
      </div>

      <div v-if="selectedPeriode === 'bulanan'" class="form-group-inline">
        <label>Bulan:</label>
        <select v-model="selectedBulan" class="input">
          <option v-for="(label, index) in BULAN_LABELS" :key="index" :value="index + 1">
            {{ label }}
          </option>
        </select>
      </div>

      <div v-if="selectedPeriode === 'semester'" class="form-group-inline">
        <label>Semester:</label>
        <select v-model="selectedSemester" class="input">
          <option :value="1">Semester 1</option>
          <option :value="2">Semester 2</option>
        </select>
      </div>

      <div class="form-group-inline">
        <label>Tahun:</label>
        <select v-model="selectedTahun" class="input">
          <option v-for="tahun in tahunOptions" :key="tahun" :value="tahun">
            {{ tahun }}
          </option>
        </select>
      </div>
    </div>

    <!-- Error -->
    <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

    <!-- Loading -->
    <div v-if="loading" class="loading">Memuat data rekap...</div>

    <!-- Rekap Content -->
    <div v-else-if="rekapData" class="rekap-content">
      <!-- Info Bar -->
      <div class="info-bar">
        <div class="info-item">
          <span class="info-label">Periode:</span>
          <span class="info-value">{{ periodeLabel }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Total Hari Efektif:</span>
          <span class="info-value">
            {{
              rekapData.total_hari_efektif !== null
                ? rekapData.total_hari_efektif + ' hari'
                : 'Belum tersedia'
            }}
          </span>
          <span v-if="rekapData.hari_efektif_source" class="info-source">
            ({{
              rekapData.hari_efektif_source === 'manual' ? 'input manual' : 'kalkulasi otomatis'
            }})
          </span>
        </div>
        <div v-if="averagePercentage !== null" class="info-item">
          <span class="info-label">Rata-rata Kehadiran:</span>
          <span class="info-value" :class="getPercentageClass(averagePercentage)">
            {{ averagePercentage }}%
          </span>
        </div>
      </div>

      <!-- Hari efektif warning -->
      <div v-if="rekapData.total_hari_efektif === null" class="alert alert-warning">
        ⚠️ Data hari efektif belum tersedia. Persentase kehadiran tidak dapat dihitung.
      </div>

      <!-- Rekap Table -->
      <div v-if="rekapData.data.length > 0" class="table-container">
        <table class="rekap-table">
          <thead>
            <tr>
              <th class="col-no">No</th>
              <th class="col-nama">Nama Siswa</th>
              <th class="col-nisn">NISN</th>
              <th class="col-count col-hadir">Hadir</th>
              <th class="col-count col-izin">Izin</th>
              <th class="col-count col-sakit">Sakit</th>
              <th class="col-count col-alpa">Alpa</th>
              <th class="col-pct">% Kehadiran</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(siswa, index) in rekapData.data" :key="siswa.siswa_id">
              <td class="col-no">{{ index + 1 }}</td>
              <td class="col-nama">{{ siswa.siswa_nama }}</td>
              <td class="col-nisn">{{ siswa.siswa_nisn || '-' }}</td>
              <td class="col-count">{{ siswa.hadir }}</td>
              <td class="col-count">{{ siswa.izin }}</td>
              <td class="col-count">{{ siswa.sakit }}</td>
              <td class="col-count">{{ siswa.alpa }}</td>
              <td class="col-pct" :class="getPercentageClass(siswa.persentase_kehadiran)">
                {{ siswa.persentase_kehadiran !== null ? siswa.persentase_kehadiran + '%' : '-' }}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="3"><strong>Total</strong></td>
              <td class="col-count">
                <strong>{{ totals.hadir }}</strong>
              </td>
              <td class="col-count">
                <strong>{{ totals.izin }}</strong>
              </td>
              <td class="col-count">
                <strong>{{ totals.sakit }}</strong>
              </td>
              <td class="col-count">
                <strong>{{ totals.alpa }}</strong>
              </td>
              <td class="col-pct">
                <strong v-if="averagePercentage !== null">{{ averagePercentage }}%</strong>
                <span v-else>-</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div v-else class="empty-state">Tidak ada data absensi untuk periode yang dipilih.</div>
    </div>

    <!-- Initial empty state -->
    <div v-else-if="!selectedKelasId" class="empty-state">
      Pilih kelas untuk melihat rekap absensi.
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: 2rem;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}
.page-header h1 {
  margin: 0;
  font-size: 1.5rem;
}
.filter-bar {
  display: flex;
  gap: 1.25rem;
  margin-bottom: 1.5rem;
  align-items: center;
  flex-wrap: wrap;
}
.form-group-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.form-group-inline label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
}
.input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}
.select-input {
  min-width: 180px;
}

/* Info bar */
.info-bar {
  display: flex;
  gap: 2rem;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  background: #f9fafb;
  border-radius: 8px;
  flex-wrap: wrap;
}
.info-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.875rem;
}
.info-label {
  color: #6b7280;
}
.info-value {
  font-weight: 600;
  color: #1f2937;
}
.info-source {
  font-size: 0.75rem;
  color: #9ca3af;
}

/* Alerts */
.alert {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}
.alert-warning {
  background: #fef3c7;
  border: 1px solid #fde68a;
  color: #92400e;
}
.alert-danger {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  color: #991b1b;
}

/* Table */
.table-container {
  overflow-x: auto;
}
.rekap-table {
  width: 100%;
  border-collapse: collapse;
}
.rekap-table th,
.rekap-table td {
  padding: 0.625rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
}
.rekap-table th {
  background: #f9fafb;
  font-weight: 600;
  font-size: 0.8125rem;
  color: #374151;
}
.col-no {
  width: 50px;
  text-align: center;
}
.col-nisn {
  width: 120px;
}
.col-count {
  width: 70px;
  text-align: center;
}
.col-pct {
  width: 110px;
  text-align: center;
  font-weight: 500;
}
.col-hadir {
  color: #166534;
}
.col-izin {
  color: #92400e;
}
.col-sakit {
  color: #3730a3;
}
.col-alpa {
  color: #991b1b;
}

/* Percentage indicators */
.pct-high {
  color: #166534;
}
.pct-medium {
  color: #d97706;
}
.pct-low {
  color: #dc2626;
  font-weight: 700;
}

/* Total row */
.total-row {
  background: #f3f4f6;
}
.total-row td {
  border-top: 2px solid #d1d5db;
}

/* Buttons */
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  font-weight: 500;
}
.btn-primary {
  background: #2563eb;
  color: white;
}
.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
}
.btn-primary:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #6b7280;
}
.empty-state {
  text-align: center;
  color: #6b7280;
  padding: 2rem;
}
</style>
