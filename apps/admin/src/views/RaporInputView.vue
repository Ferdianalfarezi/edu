<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api/client';
import { PeriodeRapor } from '@edu/shared';

interface MapelOption {
  id: string;
  nama: string;
}

interface KelasOption {
  id: string;
  nama: string;
}

interface KomponenPenilaian {
  id: string;
  nama: string;
  tipe: 'angka' | 'huruf' | 'deskripsi';
  skala_min: number | null;
  skala_max: number | null;
  is_wajib: boolean;
}

interface SiswaNilai {
  siswa_id: string;
  siswa_nama: string;
  komponen: { komponen_id: string; nilai: string | number | null }[];
  capaian_pembelajaran: string;
  status: 'draft' | 'submitted';
}

// Filters
const selectedMapel = ref('');
const selectedKelas = ref('');
const selectedPeriode = ref<string>('');

const mapelOptions = ref<MapelOption[]>([]);
const kelasOptions = ref<KelasOption[]>([]);
const komponenList = ref<KomponenPenilaian[]>([]);
const nilaiData = ref<SiswaNilai[]>([]);

const loadingNilai = ref(false);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

const periodeOptions = [
  { value: PeriodeRapor.UTS_SEMESTER_1, label: 'UTS Semester 1' },
  { value: PeriodeRapor.SEMESTER_1, label: 'Semester 1' },
  { value: PeriodeRapor.UTS_SEMESTER_2, label: 'UTS Semester 2' },
  { value: PeriodeRapor.SEMESTER_2, label: 'Semester 2' },
];

const isUTS = computed(() =>
  [PeriodeRapor.UTS_SEMESTER_1, PeriodeRapor.UTS_SEMESTER_2].includes(
    selectedPeriode.value as PeriodeRapor,
  ),
);

const canSubmit = computed(() => {
  if (!nilaiData.value.length) return false;
  return nilaiData.value.every((siswa) => {
    return siswa.komponen.every((k) => {
      const komponen = komponenList.value.find((kp) => kp.id === k.komponen_id);
      if (!komponen) return true;
      if (!komponen.is_wajib) return true;
      // For UTS, deskripsi is optional
      if (isUTS.value && komponen.tipe === 'deskripsi') return true;
      return k.nilai !== null && k.nilai !== '';
    });
  });
});

const isRaporFinalized = computed(() => {
  return nilaiData.value.length > 0 && nilaiData.value.every((s) => s.status === 'submitted');
});

async function fetchMapel() {
  try {
    const { data } = await api.get<{ data: MapelOption[] }>('/rapor/mata-pelajaran');
    mapelOptions.value = data.data;
  } catch (err) {
    console.error('Failed to fetch mata pelajaran:', err);
  }
}

async function fetchKelas() {
  if (!selectedMapel.value) {
    kelasOptions.value = [];
    return;
  }
  try {
    const { data } = await api.get<{ data: KelasOption[] }>(
      `/rapor/kelas?mapel_id=${selectedMapel.value}`,
    );
    kelasOptions.value = data.data;
  } catch (err) {
    console.error('Failed to fetch kelas:', err);
  }
}

async function fetchNilai() {
  if (!selectedMapel.value || !selectedKelas.value || !selectedPeriode.value) {
    nilaiData.value = [];
    return;
  }

  loadingNilai.value = true;
  error.value = '';
  successMessage.value = '';

  try {
    const params = new URLSearchParams({
      kelas_id: selectedKelas.value,
      periode_id: selectedPeriode.value,
      mapel_id: selectedMapel.value,
    });

    const { data } = await api.get<{
      data: { siswa: SiswaNilai[]; komponen: KomponenPenilaian[] };
    }>(`/rapor/nilai?${params.toString()}`);

    nilaiData.value = data.data.siswa;
    komponenList.value = data.data.komponen;
  } catch (err: any) {
    error.value = err.response?.data?.message || 'Gagal memuat data nilai.';
  } finally {
    loadingNilai.value = false;
  }
}

async function saveNilai(status: 'draft' | 'submitted') {
  if (status === 'submitted' && !canSubmit.value) {
    error.value = 'Semua nilai wajib harus diisi sebelum submit.';
    return;
  }

  saving.value = true;
  error.value = '';
  successMessage.value = '';

  try {
    await api.post('/rapor/nilai', {
      kelas_id: selectedKelas.value,
      mata_pelajaran_id: selectedMapel.value,
      periode_rapor_id: selectedPeriode.value,
      nilai: nilaiData.value.map((siswa) => ({
        siswa_id: siswa.siswa_id,
        komponen: siswa.komponen.map((k) => ({
          komponen_id: k.komponen_id,
          nilai: k.nilai,
        })),
        capaian_pembelajaran: siswa.capaian_pembelajaran || undefined,
      })),
      status,
    });

    successMessage.value =
      status === 'draft'
        ? 'Nilai berhasil disimpan sebagai draft.'
        : 'Nilai berhasil di-submit ke wali kelas.';

    await fetchNilai();
  } catch (err: any) {
    error.value = err.response?.data?.message || 'Gagal menyimpan nilai.';
  } finally {
    saving.value = false;
  }
}

function getInputType(komponen: KomponenPenilaian): string {
  if (komponen.tipe === 'angka') return 'number';
  return 'text';
}

function validateNilaiAngka(siswaIdx: number, komponenIdx: number) {
  const komponen = komponenList.value[komponenIdx];
  if (komponen?.tipe !== 'angka') return;

  const val = nilaiData.value[siswaIdx].komponen[komponenIdx].nilai;
  if (val === null || val === '') return;

  const num = Number(val);
  if (komponen.skala_min !== null && num < komponen.skala_min) {
    nilaiData.value[siswaIdx].komponen[komponenIdx].nilai = komponen.skala_min;
  }
  if (komponen.skala_max !== null && num > komponen.skala_max) {
    nilaiData.value[siswaIdx].komponen[komponenIdx].nilai = komponen.skala_max;
  }
}

watch(selectedMapel, () => {
  selectedKelas.value = '';
  nilaiData.value = [];
  fetchKelas();
});

watch([selectedKelas, selectedPeriode], () => {
  fetchNilai();
});

onMounted(() => {
  fetchMapel();
});
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Input Nilai Rapor</h1>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <div class="filter-group">
        <label>Mata Pelajaran</label>
        <select v-model="selectedMapel" class="input">
          <option value="" disabled>Pilih mata pelajaran</option>
          <option v-for="m in mapelOptions" :key="m.id" :value="m.id">{{ m.nama }}</option>
        </select>
      </div>

      <div class="filter-group">
        <label>Kelas</label>
        <select v-model="selectedKelas" class="input" :disabled="!selectedMapel">
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

    <!-- Nilai Table -->
    <div v-if="loadingNilai" class="empty-state">Memuat data nilai...</div>

    <div v-else-if="nilaiData.length > 0 && komponenList.length > 0" class="table-container">
      <div v-if="isRaporFinalized" class="alert alert-info">
        Rapor sudah difinalkan. Nilai tidak dapat diedit.
      </div>

      <table>
        <thead>
          <tr>
            <th class="sticky-col">No</th>
            <th class="sticky-col-2">Nama Siswa</th>
            <th v-for="k in komponenList" :key="k.id">
              {{ k.nama }}
              <span v-if="k.is_wajib" class="required-mark">*</span>
              <br />
              <small class="komponen-hint">
                <template v-if="k.tipe === 'angka'">({{ k.skala_min }}-{{ k.skala_max }})</template>
                <template v-else-if="k.tipe === 'huruf'">(A/B/C/D/E)</template>
                <template v-else>(Deskripsi)</template>
              </small>
            </th>
            <th v-if="!isUTS">Capaian Pembelajaran</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(siswa, sIdx) in nilaiData" :key="siswa.siswa_id">
            <td class="sticky-col">{{ sIdx + 1 }}</td>
            <td class="sticky-col-2">{{ siswa.siswa_nama }}</td>
            <td v-for="(komponen, kIdx) in komponenList" :key="komponen.id">
              <template v-if="komponen.tipe === 'deskripsi'">
                <textarea
                  v-model="siswa.komponen[kIdx].nilai"
                  class="input-cell textarea-cell"
                  :disabled="isRaporFinalized"
                  rows="2"
                  :placeholder="isUTS ? 'Opsional' : 'Deskripsi'"
                />
              </template>
              <template v-else-if="komponen.tipe === 'huruf'">
                <select
                  v-model="siswa.komponen[kIdx].nilai"
                  class="input-cell"
                  :disabled="isRaporFinalized"
                >
                  <option value="">-</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                  <option value="E">E</option>
                </select>
              </template>
              <template v-else>
                <input
                  v-model.number="siswa.komponen[kIdx].nilai"
                  :type="getInputType(komponen)"
                  class="input-cell"
                  :disabled="isRaporFinalized"
                  :min="komponen.skala_min ?? undefined"
                  :max="komponen.skala_max ?? undefined"
                  @blur="validateNilaiAngka(sIdx, kIdx)"
                />
              </template>
            </td>
            <td v-if="!isUTS">
              <textarea
                v-model="siswa.capaian_pembelajaran"
                class="input-cell textarea-cell"
                :disabled="isRaporFinalized"
                rows="2"
                placeholder="Deskripsi capaian"
              />
            </td>
            <td>
              <span
                :class="
                  siswa.status === 'submitted' ? 'badge badge-submitted' : 'badge badge-draft'
                "
              >
                {{ siswa.status === 'submitted' ? 'Submitted' : 'Draft' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Action buttons -->
      <div v-if="!isRaporFinalized" class="actions-bar">
        <button class="btn btn-secondary" :disabled="saving" @click="saveNilai('draft')">
          {{ saving ? 'Menyimpan...' : 'Simpan Draft' }}
        </button>
        <button
          class="btn btn-primary"
          :disabled="saving || !canSubmit"
          @click="saveNilai('submitted')"
        >
          {{ saving ? 'Menyimpan...' : 'Submit ke Wali Kelas' }}
        </button>
      </div>
    </div>

    <div
      v-else-if="selectedMapel && selectedKelas && selectedPeriode && !loadingNilai"
      class="empty-state"
    >
      Tidak ada data siswa untuk kelas dan periode ini.
    </div>

    <div v-else-if="!selectedMapel || !selectedKelas || !selectedPeriode" class="empty-state">
      Pilih mata pelajaran, kelas, dan periode untuk mulai input nilai.
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
.table-container {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 800px;
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
  white-space: nowrap;
}
.sticky-col {
  position: sticky;
  left: 0;
  background: white;
  z-index: 1;
  width: 40px;
}
.sticky-col-2 {
  position: sticky;
  left: 40px;
  background: white;
  z-index: 1;
  min-width: 150px;
}
thead .sticky-col,
thead .sticky-col-2 {
  background: #f9fafb;
  z-index: 2;
}
.required-mark {
  color: #dc2626;
}
.komponen-hint {
  color: #9ca3af;
  font-weight: 400;
}
.input-cell {
  width: 100%;
  min-width: 80px;
  padding: 0.375rem 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.8125rem;
}
.textarea-cell {
  min-width: 150px;
  resize: vertical;
}
.badge {
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 500;
}
.badge-draft {
  background: #fef3c7;
  color: #92400e;
}
.badge-submitted {
  background: #d1fae5;
  color: #065f46;
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
.empty-state {
  text-align: center;
  color: #6b7280;
  padding: 2rem;
}
</style>
