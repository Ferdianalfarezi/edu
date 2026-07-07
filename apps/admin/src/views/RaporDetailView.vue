<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { api } from '@/api/client';
import { PeriodeRapor } from '@edu/shared';

interface KelasOption {
  id: string;
  nama: string;
}

interface TahunAjaranOption {
  id: string;
  nama: string;
}

interface SiswaRaporView {
  siswa_id: string;
  siswa_nama: string;
  nisn: string | null;
  rata_rata: number | null;
  peringkat: number | null;
  catatan_wali_kelas: string | null;
  p5_deskripsi: { dimensi: string; deskripsi: string }[] | null;
  nilai_per_mapel: {
    mata_pelajaran_nama: string;
    komponen_nilai: { komponen_nama: string; nilai: string | number }[];
    capaian_pembelajaran: string | null;
  }[];
}

interface RaporOverview {
  status: 'draft' | 'final';
  finalized_by: string | null;
  finalized_at: string | null;
  kelas_nama: string;
  periode: string;
}

const selectedKelas = ref('');
const selectedPeriode = ref<string>('');
const selectedTahunAjaran = ref('');

const kelasOptions = ref<KelasOption[]>([]);
const tahunAjaranOptions = ref<TahunAjaranOption[]>([]);
const siswaRapors = ref<SiswaRaporView[]>([]);
const raporOverview = ref<RaporOverview | null>(null);

const loading = ref(false);
const error = ref('');
const exporting = ref(false);

// Detail view for individual student
const showDetailModal = ref(false);
const detailSiswa = ref<SiswaRaporView | null>(null);

const periodeOptions = [
  { value: PeriodeRapor.UTS_SEMESTER_1, label: 'UTS Semester 1' },
  { value: PeriodeRapor.SEMESTER_1, label: 'Semester 1' },
  { value: PeriodeRapor.UTS_SEMESTER_2, label: 'UTS Semester 2' },
  { value: PeriodeRapor.SEMESTER_2, label: 'Semester 2' },
];

async function fetchTahunAjaran() {
  try {
    const { data } = await api.get<{ data: TahunAjaranOption[] }>('/tahun-ajaran');
    tahunAjaranOptions.value = data.data;
    // Default to aktif
    const aktif = data.data.find((t: any) => t.status === 'aktif');
    if (aktif) selectedTahunAjaran.value = aktif.id;
  } catch (err) {
    console.error('Failed to fetch tahun ajaran:', err);
  }
}

async function fetchKelas() {
  if (!selectedTahunAjaran.value) {
    kelasOptions.value = [];
    return;
  }
  try {
    const { data } = await api.get<{ data: KelasOption[] }>(
      `/kelas?tahun_ajaran_id=${selectedTahunAjaran.value}`,
    );
    kelasOptions.value = data.data;
  } catch (err) {
    console.error('Failed to fetch kelas:', err);
  }
}

async function fetchRapor() {
  if (!selectedKelas.value || !selectedPeriode.value) {
    siswaRapors.value = [];
    raporOverview.value = null;
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    const params = new URLSearchParams({
      kelas_id: selectedKelas.value,
      periode_id: selectedPeriode.value,
    });

    const { data } = await api.get<{
      data: {
        overview: RaporOverview;
        siswa: SiswaRaporView[];
      };
    }>(`/rapor/view?${params.toString()}`);

    raporOverview.value = data.data.overview;
    siswaRapors.value = data.data.siswa;
  } catch (err: any) {
    error.value = err.response?.data?.message || 'Gagal memuat data rapor.';
  } finally {
    loading.value = false;
  }
}

async function exportRapor() {
  if (!selectedKelas.value || !selectedPeriode.value) return;

  exporting.value = true;
  try {
    const params = new URLSearchParams({
      kelas_id: selectedKelas.value,
      periode_id: selectedPeriode.value,
    });

    const response = await api.get(`/rapor/export?${params.toString()}`, {
      responseType: 'blob',
    });

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    const kelasNama = kelasOptions.value.find((k) => k.id === selectedKelas.value)?.nama || 'rapor';
    const periodeLabel =
      periodeOptions.find((p) => p.value === selectedPeriode.value)?.label || 'periode';
    link.setAttribute('download', `Rapor_${kelasNama}_${periodeLabel}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err: any) {
    error.value = err.response?.data?.message || 'Gagal export rapor.';
  } finally {
    exporting.value = false;
  }
}

function viewDetail(siswa: SiswaRaporView) {
  detailSiswa.value = siswa;
  showDetailModal.value = true;
}

function getStatusBadgeClass(status: string): string {
  return status === 'final' ? 'badge-final' : 'badge-draft';
}

watch(selectedTahunAjaran, () => {
  selectedKelas.value = '';
  siswaRapors.value = [];
  raporOverview.value = null;
  fetchKelas();
});

watch([selectedKelas, selectedPeriode], () => {
  fetchRapor();
});

onMounted(() => {
  fetchTahunAjaran();
});
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Rapor Siswa</h1>
      <button
        v-if="raporOverview?.status === 'final'"
        class="btn btn-primary"
        :disabled="exporting"
        @click="exportRapor"
      >
        {{ exporting ? 'Mengexport...' : 'Export Excel' }}
      </button>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <div class="filter-group">
        <label>Tahun Ajaran</label>
        <select v-model="selectedTahunAjaran" class="input">
          <option value="" disabled>Pilih tahun ajaran</option>
          <option v-for="t in tahunAjaranOptions" :key="t.id" :value="t.id">
            {{ t.nama }}
          </option>
        </select>
      </div>

      <div class="filter-group">
        <label>Kelas</label>
        <select v-model="selectedKelas" class="input" :disabled="!selectedTahunAjaran">
          <option value="" disabled>Pilih kelas</option>
          <option v-for="k in kelasOptions" :key="k.id" :value="k.id">{{ k.nama }}</option>
        </select>
      </div>

      <div class="filter-group">
        <label>Periode</label>
        <select v-model="selectedPeriode" class="input">
          <option value="" disabled>Pilih periode</option>
          <option v-for="p in periodeOptions" :key="p.value" :value="p.value">
            {{ p.label }}
          </option>
        </select>
      </div>
    </div>

    <div v-if="error" class="alert alert-error">{{ error }}</div>

    <div v-if="loading" class="empty-state">Memuat data...</div>

    <template v-else-if="raporOverview && siswaRapors.length > 0">
      <!-- Status Banner -->
      <div class="rapor-status-banner">
        <div class="status-info">
          <span :class="['badge', getStatusBadgeClass(raporOverview.status)]">
            {{ raporOverview.status === 'final' ? 'Final' : 'Draft' }}
          </span>
          <span class="status-text">
            {{ raporOverview.kelas_nama }} —
            {{
              periodeOptions.find((p) => p.value === (raporOverview ? raporOverview.periode : ''))
                ?.label || (raporOverview ? raporOverview.periode : '')
            }}
          </span>
        </div>
        <div v-if="raporOverview.finalized_at" class="finalized-info">
          Difinalkan: {{ new Date(raporOverview.finalized_at).toLocaleString('id-ID') }}
        </div>
      </div>

      <!-- Students Table -->
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Nama Siswa</th>
              <th>NISN</th>
              <th>Rata-rata</th>
              <th>Peringkat</th>
              <th>Status</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(siswa, idx) in siswaRapors" :key="siswa.siswa_id">
              <td>{{ idx + 1 }}</td>
              <td>{{ siswa.siswa_nama }}</td>
              <td>{{ siswa.nisn || '-' }}</td>
              <td>{{ siswa.rata_rata !== null ? siswa.rata_rata.toFixed(1) : '-' }}</td>
              <td>{{ siswa.peringkat ?? '-' }}</td>
              <td>
                <span
                  :class="[
                    'badge',
                    raporOverview && raporOverview.status === 'final'
                      ? 'badge-final'
                      : 'badge-draft',
                  ]"
                >
                  {{ raporOverview && raporOverview.status === 'final' ? 'Final' : 'Draft' }}
                </span>
              </td>
              <td>
                <button class="btn-sm btn-detail" @click="viewDetail(siswa)">Lihat</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div v-else-if="selectedKelas && selectedPeriode && !loading" class="empty-state">
      Tidak ada data rapor untuk kelas dan periode ini.
    </div>
    <div v-else-if="!selectedKelas || !selectedPeriode" class="empty-state">
      Pilih tahun ajaran, kelas, dan periode untuk melihat rapor.
    </div>

    <!-- Detail Modal -->
    <div
      v-if="showDetailModal && detailSiswa"
      class="modal-overlay"
      @click.self="showDetailModal = false"
    >
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>Rapor: {{ detailSiswa.siswa_nama }}</h2>
          <button class="btn-close" @click="showDetailModal = false">&times;</button>
        </div>

        <div class="detail-summary">
          <div class="summary-item">
            <span class="summary-label">Rata-rata</span>
            <span class="summary-value">
              {{ detailSiswa.rata_rata !== null ? detailSiswa.rata_rata.toFixed(1) : '-' }}
            </span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Peringkat</span>
            <span class="summary-value">{{ detailSiswa.peringkat ?? '-' }}</span>
          </div>
        </div>

        <!-- Nilai per mapel -->
        <div class="detail-section">
          <h3>Nilai per Mata Pelajaran</h3>
          <table class="detail-table">
            <thead>
              <tr>
                <th>Mata Pelajaran</th>
                <th>Komponen</th>
                <th>Capaian Pembelajaran</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="mapel in detailSiswa.nilai_per_mapel" :key="mapel.mata_pelajaran_nama">
                <td>{{ mapel.mata_pelajaran_nama }}</td>
                <td>
                  <div
                    v-for="k in mapel.komponen_nilai"
                    :key="k.komponen_nama"
                    class="komponen-item"
                  >
                    <span class="komponen-label">{{ k.komponen_nama }}:</span>
                    <span class="komponen-value">{{ k.nilai }}</span>
                  </div>
                </td>
                <td>{{ mapel.capaian_pembelajaran || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- P5 -->
        <div
          v-if="detailSiswa.p5_deskripsi && detailSiswa.p5_deskripsi.length > 0"
          class="detail-section"
        >
          <h3>P5 - Profil Pelajar Pancasila</h3>
          <div class="p5-list">
            <div v-for="item in detailSiswa.p5_deskripsi" :key="item.dimensi" class="p5-item-view">
              <strong>{{ item.dimensi }}</strong>
              <p>{{ item.deskripsi }}</p>
            </div>
          </div>
        </div>

        <!-- Catatan Wali Kelas -->
        <div v-if="detailSiswa.catatan_wali_kelas" class="detail-section">
          <h3>Catatan Wali Kelas</h3>
          <p class="catatan-text">{{ detailSiswa.catatan_wali_kelas }}</p>
        </div>
      </div>
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
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}
.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 200px;
}
.filter-group label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}
.input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}
.alert {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}
.alert-error {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}
.rapor-status-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 1.5rem;
}
.status-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.status-text {
  font-weight: 500;
  color: #1f2937;
}
.finalized-info {
  font-size: 0.8125rem;
  color: #6b7280;
}
.badge {
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 500;
}
.badge-final {
  background: #d1fae5;
  color: #065f46;
}
.badge-draft {
  background: #fef3c7;
  color: #92400e;
}
.table-container {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
}
th {
  font-weight: 600;
  color: #374151;
  background: #f9fafb;
  font-size: 0.8125rem;
}
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  font-weight: 500;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-primary {
  background: #2563eb;
  color: white;
}
.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
}
.btn-sm {
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
}
.btn-detail {
  background: #dbeafe;
  color: #1e40af;
}
.empty-state {
  text-align: center;
  color: #6b7280;
  padding: 2rem;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.modal {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  width: 100%;
  max-width: 520px;
  max-height: 85vh;
  overflow-y: auto;
}
.modal-wide {
  max-width: 720px;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
}
.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #6b7280;
  line-height: 1;
}
.detail-summary {
  display: flex;
  gap: 2rem;
  margin-bottom: 1.5rem;
  padding: 0.75rem 1rem;
  background: #f9fafb;
  border-radius: 6px;
}
.summary-item {
  display: flex;
  flex-direction: column;
}
.summary-label {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}
.summary-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1f2937;
}
.detail-section {
  margin-bottom: 1.5rem;
}
.detail-section h3 {
  font-size: 1rem;
  margin: 0 0 0.75rem;
  color: #374151;
}
.detail-table {
  width: 100%;
  border-collapse: collapse;
}
.detail-table th,
.detail-table td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.8125rem;
}
.detail-table th {
  background: #f9fafb;
  font-weight: 600;
}
.komponen-item {
  display: flex;
  gap: 0.25rem;
  font-size: 0.8125rem;
}
.komponen-label {
  color: #6b7280;
}
.komponen-value {
  font-weight: 500;
}
.p5-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.p5-item-view {
  padding: 0.5rem 0.75rem;
  background: #f5f3ff;
  border-radius: 6px;
  font-size: 0.8125rem;
}
.p5-item-view strong {
  color: #5b21b6;
}
.p5-item-view p {
  margin: 0.25rem 0 0;
  color: #374151;
}
.catatan-text {
  padding: 0.75rem;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 0.875rem;
  color: #374151;
  line-height: 1.5;
}
</style>
