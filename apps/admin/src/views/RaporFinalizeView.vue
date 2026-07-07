<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { api } from '@/api/client';
import { PeriodeRapor } from '@edu/shared';

interface KelasOption {
  id: string;
  nama: string;
}

interface MapelStatus {
  mata_pelajaran_id: string;
  mata_pelajaran_nama: string;
  guru_nama: string;
  status: 'draft' | 'submitted' | 'not_started';
}

interface SiswaRapor {
  siswa_id: string;
  siswa_nama: string;
  rata_rata: number | null;
  peringkat: number | null;
  catatan_wali_kelas: string;
  p5_deskripsi: { dimensi: string; deskripsi: string }[] | null;
  nilai_per_mapel: {
    mata_pelajaran_nama: string;
    komponen_nilai: { komponen_nama: string; nilai: string | number }[];
  }[];
}

interface RaporStatus {
  status: 'draft' | 'final';
  finalized_by: string | null;
  finalized_at: string | null;
}

const selectedKelas = ref('');
const selectedPeriode = ref<string>('');

const kelasOptions = ref<KelasOption[]>([]);
const mapelStatuses = ref<MapelStatus[]>([]);
const siswaRapors = ref<SiswaRapor[]>([]);
const raporStatus = ref<RaporStatus | null>(null);

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

// P5 editing
const showP5Modal = ref(false);
const editingP5SiswaIdx = ref(-1);
const p5Form = ref<{ dimensi: string; deskripsi: string }[]>([]);

const periodeOptions = [
  { value: PeriodeRapor.UTS_SEMESTER_1, label: 'UTS Semester 1' },
  { value: PeriodeRapor.SEMESTER_1, label: 'Semester 1' },
  { value: PeriodeRapor.UTS_SEMESTER_2, label: 'UTS Semester 2' },
  { value: PeriodeRapor.SEMESTER_2, label: 'Semester 2' },
];

const allSubmitted = computed(() => {
  if (!mapelStatuses.value.length) return false;
  return mapelStatuses.value.every((m) => m.status === 'submitted');
});

const isFinalized = computed(() => raporStatus.value?.status === 'final');

async function fetchKelas() {
  try {
    const { data } = await api.get<{ data: KelasOption[] }>('/rapor/kelas-wali');
    kelasOptions.value = data.data;
  } catch (err) {
    console.error('Failed to fetch kelas:', err);
  }
}

async function fetchRaporOverview() {
  if (!selectedKelas.value || !selectedPeriode.value) {
    mapelStatuses.value = [];
    siswaRapors.value = [];
    raporStatus.value = null;
    return;
  }

  loading.value = true;
  error.value = '';
  successMessage.value = '';

  try {
    const params = new URLSearchParams({
      kelas_id: selectedKelas.value,
      periode_id: selectedPeriode.value,
    });

    const { data } = await api.get<{
      data: {
        mapel_status: MapelStatus[];
        siswa: SiswaRapor[];
        rapor: RaporStatus;
      };
    }>(`/rapor/finalize-overview?${params.toString()}`);

    mapelStatuses.value = data.data.mapel_status;
    siswaRapors.value = data.data.siswa;
    raporStatus.value = data.data.rapor;
  } catch (err: any) {
    error.value = err.response?.data?.message || 'Gagal memuat data rapor.';
  } finally {
    loading.value = false;
  }
}

function openP5Modal(siswaIdx: number) {
  editingP5SiswaIdx.value = siswaIdx;
  const current = siswaRapors.value[siswaIdx].p5_deskripsi;
  p5Form.value = current
    ? current.map((d) => ({ ...d }))
    : [
        { dimensi: 'Beriman, Bertakwa kepada Tuhan YME', deskripsi: '' },
        { dimensi: 'Berkebinekaan Global', deskripsi: '' },
        { dimensi: 'Bergotong-royong', deskripsi: '' },
        { dimensi: 'Mandiri', deskripsi: '' },
        { dimensi: 'Bernalar Kritis', deskripsi: '' },
        { dimensi: 'Kreatif', deskripsi: '' },
      ];
  showP5Modal.value = true;
}

function saveP5() {
  const filtered = p5Form.value.filter((d) => d.deskripsi.trim());
  siswaRapors.value[editingP5SiswaIdx.value].p5_deskripsi = filtered.length ? filtered : null;
  showP5Modal.value = false;
}

async function finalize() {
  if (!allSubmitted.value) {
    error.value = 'Semua guru harus submit nilai terlebih dahulu.';
    return;
  }

  saving.value = true;
  error.value = '';
  successMessage.value = '';

  try {
    // Save catatan and P5 first
    await api.post('/rapor/nilai/catatan', {
      kelas_id: selectedKelas.value,
      periode_rapor_id: selectedPeriode.value,
      data: siswaRapors.value.map((s) => ({
        siswa_id: s.siswa_id,
        catatan_wali_kelas: s.catatan_wali_kelas || undefined,
        p5_deskripsi: s.p5_deskripsi || undefined,
      })),
    });

    // Finalize
    await api.post(`/rapor/kelas/${selectedKelas.value}/periode/${selectedPeriode.value}/finalize`);

    successMessage.value =
      'Rapor berhasil difinalkan. Rapor sekarang dapat dilihat oleh orang tua.';
    await fetchRaporOverview();
  } catch (err: any) {
    error.value = err.response?.data?.message || 'Gagal memfinalisasi rapor.';
  } finally {
    saving.value = false;
  }
}

async function revertFinalize() {
  saving.value = true;
  error.value = '';
  successMessage.value = '';

  try {
    await api.post(`/rapor/kelas/${selectedKelas.value}/periode/${selectedPeriode.value}/revert`);
    successMessage.value = 'Finalisasi dibatalkan. Rapor kembali ke status draft.';
    await fetchRaporOverview();
  } catch (err: any) {
    error.value = err.response?.data?.message || 'Gagal membatalkan finalisasi.';
  } finally {
    saving.value = false;
  }
}

function getStatusClass(status: string): string {
  switch (status) {
    case 'submitted':
      return 'badge-submitted';
    case 'draft':
      return 'badge-draft';
    default:
      return 'badge-not-started';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'submitted':
      return 'Submitted';
    case 'draft':
      return 'Draft';
    default:
      return 'Belum diisi';
  }
}

watch([selectedKelas, selectedPeriode], () => {
  fetchRaporOverview();
});

onMounted(fetchKelas);
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Finalisasi Rapor</h1>
      <p class="page-description">
        Review status input nilai dari guru, tambahkan P5 dan catatan wali kelas, lalu finalkan
        rapor.
      </p>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <div class="filter-group">
        <label>Kelas (Wali Kelas)</label>
        <select v-model="selectedKelas" class="input">
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
    <div v-if="successMessage" class="alert alert-success">{{ successMessage }}</div>

    <div v-if="loading" class="empty-state">Memuat data...</div>

    <template v-else-if="selectedKelas && selectedPeriode && mapelStatuses.length > 0">
      <!-- Rapor Status Banner -->
      <div v-if="isFinalized" class="alert alert-info">
        <strong>Status: Final</strong> — Rapor sudah difinalkan pada
        {{
          raporStatus && raporStatus.finalized_at
            ? new Date(raporStatus.finalized_at).toLocaleString('id-ID')
            : ''
        }}. Orang tua dapat melihat rapor ini.
      </div>

      <!-- Status Mata Pelajaran -->
      <section class="section">
        <h2>Status Input Nilai per Mata Pelajaran</h2>
        <div class="status-grid">
          <div v-for="m in mapelStatuses" :key="m.mata_pelajaran_id" class="status-card">
            <div class="status-card-header">
              <span class="mapel-name">{{ m.mata_pelajaran_nama }}</span>
              <span :class="['badge', getStatusClass(m.status)]">
                {{ getStatusLabel(m.status) }}
              </span>
            </div>
            <p class="guru-name">Guru: {{ m.guru_nama }}</p>
          </div>
        </div>

        <div v-if="!allSubmitted" class="alert alert-warning">
          Belum semua guru submit nilai. Finalisasi belum dapat dilakukan.
        </div>
      </section>

      <!-- Siswa Overview & Catatan -->
      <section v-if="allSubmitted && siswaRapors.length > 0" class="section">
        <h2>Data Siswa & Catatan Wali Kelas</h2>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Nama Siswa</th>
                <th>Rata-rata</th>
                <th>Peringkat</th>
                <th>Catatan Wali Kelas</th>
                <th>P5</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(siswa, idx) in siswaRapors" :key="siswa.siswa_id">
                <td>{{ idx + 1 }}</td>
                <td>{{ siswa.siswa_nama }}</td>
                <td>{{ siswa.rata_rata !== null ? siswa.rata_rata.toFixed(1) : '-' }}</td>
                <td>{{ siswa.peringkat ?? '-' }}</td>
                <td>
                  <textarea
                    v-model="siswa.catatan_wali_kelas"
                    class="input-cell textarea-cell"
                    :disabled="isFinalized"
                    rows="2"
                    placeholder="Catatan tentang siswa..."
                  />
                </td>
                <td>
                  <button class="btn-sm btn-p5" :disabled="isFinalized" @click="openP5Modal(idx)">
                    {{ siswa.p5_deskripsi ? 'Edit P5' : 'Isi P5' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Action Buttons -->
      <div class="actions-bar">
        <button
          v-if="isFinalized"
          class="btn btn-warning"
          :disabled="saving"
          @click="revertFinalize"
        >
          {{ saving ? 'Memproses...' : 'Batalkan Finalisasi (Revert)' }}
        </button>
        <button
          v-else
          class="btn btn-primary"
          :disabled="saving || !allSubmitted"
          @click="finalize"
        >
          {{ saving ? 'Memproses...' : 'Finalkan Rapor' }}
        </button>
      </div>
    </template>

    <div v-else-if="selectedKelas && selectedPeriode && !loading" class="empty-state">
      Tidak ada data rapor untuk kelas dan periode ini.
    </div>
    <div v-else-if="!selectedKelas || !selectedPeriode" class="empty-state">
      Pilih kelas dan periode untuk melihat status rapor.
    </div>

    <!-- P5 Modal -->
    <div v-if="showP5Modal" class="modal-overlay" @click.self="showP5Modal = false">
      <div class="modal modal-wide">
        <h2>P5 - Profil Pelajar Pancasila</h2>
        <p class="modal-description">
          Isi deskripsi naratif per dimensi (opsional). Kosongkan jika tidak relevan.
        </p>
        <div class="p5-form">
          <div v-for="(item, idx) in p5Form" :key="idx" class="p5-item">
            <label>{{ item.dimensi }}</label>
            <textarea
              v-model="item.deskripsi"
              class="input"
              rows="2"
              placeholder="Deskripsi naratif..."
            />
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showP5Modal = false">Batal</button>
          <button class="btn btn-primary" @click="saveP5">Simpan</button>
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
  margin-bottom: 1.5rem;
}
.page-header h1 {
  margin: 0;
  font-size: 1.5rem;
}
.page-description {
  margin: 0.25rem 0 0;
  color: #6b7280;
  font-size: 0.875rem;
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
.section {
  margin-bottom: 2rem;
}
.section h2 {
  font-size: 1.125rem;
  margin: 0 0 1rem;
  color: #1f2937;
}
.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.status-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  background: #fff;
}
.status-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.mapel-name {
  font-weight: 600;
  font-size: 0.875rem;
  color: #1f2937;
}
.guru-name {
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
  color: #6b7280;
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
.alert-success {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}
.alert-info {
  background: #eff6ff;
  color: #1e40af;
  border: 1px solid #bfdbfe;
}
.alert-warning {
  background: #fffbeb;
  color: #92400e;
  border: 1px solid #fde68a;
}
.badge {
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 500;
}
.badge-submitted {
  background: #d1fae5;
  color: #065f46;
}
.badge-draft {
  background: #fef3c7;
  color: #92400e;
}
.badge-not-started {
  background: #f3f4f6;
  color: #6b7280;
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
  vertical-align: top;
}
th {
  font-weight: 600;
  color: #374151;
  background: #f9fafb;
  font-size: 0.8125rem;
}
.input-cell {
  width: 100%;
  min-width: 150px;
  padding: 0.375rem 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.8125rem;
}
.textarea-cell {
  resize: vertical;
}
.btn-sm {
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
}
.btn-p5 {
  background: #ede9fe;
  color: #5b21b6;
}
.btn-p5:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.actions-bar {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
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
.btn-secondary {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
}
.btn-warning {
  background: #f59e0b;
  color: white;
}
.btn-warning:hover:not(:disabled) {
  background: #d97706;
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
  max-height: 80vh;
  overflow-y: auto;
}
.modal-wide {
  max-width: 640px;
}
.modal h2 {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
}
.modal-description {
  margin: 0 0 1rem;
  color: #6b7280;
  font-size: 0.875rem;
}
.p5-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.p5-item label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.25rem;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}
.empty-state {
  text-align: center;
  color: #6b7280;
  padding: 2rem;
}
</style>
