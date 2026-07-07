<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { Role } from '@edu/shared';

interface Kelas {
  id: string;
  nama: string;
  tingkat: number;
}

interface Siswa {
  id: string;
  nama: string;
  nisn: string | null;
}

interface AbsensiRecord {
  siswa_id: string;
  status: 'hadir' | 'izin' | 'sakit' | 'alpa' | '';
}

interface ExistingAbsensi {
  id: string;
  siswa_id: string;
  status: 'hadir' | 'izin' | 'sakit' | 'alpa';
  guru_id: string;
}

const STATUS_OPTIONS = ['hadir', 'izin', 'sakit', 'alpa'] as const;
const STATUS_LABELS: Record<string, string> = {
  hadir: 'Hadir',
  izin: 'Izin',
  sakit: 'Sakit',
  alpa: 'Alpa',
};
const STATUS_COLORS: Record<string, string> = {
  hadir: '#dcfce7',
  izin: '#fef3c7',
  sakit: '#e0e7ff',
  alpa: '#fee2e2',
};

const authStore = useAuthStore();

// State
const kelasList = ref<Kelas[]>([]);
const siswaList = ref<Siswa[]>([]);
const records = ref<AbsensiRecord[]>([]);
const existingAbsensi = ref<ExistingAbsensi[]>([]);

const selectedKelasId = ref('');
const selectedTanggal = ref(new Date().toISOString().split('T')[0]);
const loading = ref(false);
const submitting = ref(false);
const successMessage = ref('');
const errorMessage = ref('');
const isReadOnly = ref(false);
const holidayWarning = ref('');

// Computed
const isGuru = computed(() => authStore.user?.role === Role.GURU);

const unfilledStudents = computed(() => {
  return records.value
    .filter((r) => !r.status)
    .map((r) => {
      const siswa = siswaList.value.find((s) => s.id === r.siswa_id);
      return siswa?.nama || 'Unknown';
    });
});

const allFilled = computed(() => {
  return records.value.length > 0 && records.value.every((r) => r.status !== '');
});

const statusSummary = computed(() => {
  const summary = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
  for (const r of records.value) {
    if (r.status && r.status in summary) {
      summary[r.status as keyof typeof summary]++;
    }
  }
  return summary;
});

// Data fetching
async function fetchKelasList() {
  try {
    if (isGuru.value) {
      // Guru only sees their scheduled classes
      const { data } = await api.get<{ data: Kelas[] }>('/absensi/kelas-hari-ini', {
        params: { tanggal: selectedTanggal.value },
      });
      kelasList.value = data.data || (data as unknown as Kelas[]);
    } else {
      // Admin/Kepala Sekolah see all classes
      const { data } = await api.get<{ data: Kelas[] }>('/kelas');
      kelasList.value = data.data;
    }
  } catch (error) {
    console.error('Failed to fetch kelas:', error);
  }
}

async function fetchStudentsAndAbsensi() {
  if (!selectedKelasId.value || !selectedTanggal.value) return;

  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  holidayWarning.value = '';

  try {
    // Fetch students in the class
    const { data: siswaData } = await api.get<{ data: Siswa[] }>('/siswa', {
      params: { kelas_id: selectedKelasId.value, status: 'aktif' },
    });
    siswaList.value = siswaData.data;

    // Fetch existing attendance for this class/date
    const { data: absensiData } = await api.get<{
      data: ExistingAbsensi[];
      is_read_only?: boolean;
      holiday_warning?: string;
    }>('/absensi', {
      params: { kelas_id: selectedKelasId.value, tanggal: selectedTanggal.value },
    });

    existingAbsensi.value = absensiData.data || [];
    isReadOnly.value = absensiData.is_read_only || false;
    holidayWarning.value = absensiData.holiday_warning || '';

    // Build records from students, pre-filling existing status
    records.value = siswaList.value.map((siswa) => {
      const existing = existingAbsensi.value.find((a) => a.siswa_id === siswa.id);
      return {
        siswa_id: siswa.id,
        status: existing?.status || '',
      };
    });
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } };
    errorMessage.value = error.response?.data?.message || 'Gagal memuat data siswa.';
  } finally {
    loading.value = false;
  }
}

async function submitAbsensi() {
  if (!allFilled.value) {
    errorMessage.value = `Siswa berikut belum diisi status: ${unfilledStudents.value.join(', ')}`;
    return;
  }

  submitting.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    await api.post(`/absensi/kelas/${selectedKelasId.value}`, {
      tanggal: selectedTanggal.value,
      records: records.value.map((r) => ({
        siswa_id: r.siswa_id,
        status: r.status,
      })),
    });
    successMessage.value = 'Absensi berhasil disimpan!';
    isReadOnly.value = true;
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } };
    errorMessage.value = error.response?.data?.message || 'Gagal menyimpan absensi.';
  } finally {
    submitting.value = false;
  }
}

function setAllStatus(status: 'hadir' | 'izin' | 'sakit' | 'alpa') {
  records.value = records.value.map((r) => ({ ...r, status }));
}

function getSiswaName(siswaId: string): string {
  return siswaList.value.find((s) => s.id === siswaId)?.nama || '-';
}

function getSiswaNisn(siswaId: string): string {
  return siswaList.value.find((s) => s.id === siswaId)?.nisn || '-';
}

// Watchers
watch([selectedKelasId, selectedTanggal], () => {
  if (selectedKelasId.value && selectedTanggal.value) {
    fetchStudentsAndAbsensi();
  }
});

watch(selectedTanggal, () => {
  if (isGuru.value) {
    fetchKelasList();
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
      <h1>Input Absensi</h1>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar">
      <div class="form-group-inline">
        <label>Tanggal:</label>
        <input v-model="selectedTanggal" type="date" class="input date-input" />
      </div>
      <div class="form-group-inline">
        <label>Kelas:</label>
        <select v-model="selectedKelasId" class="input select-input">
          <option value="" disabled>Pilih Kelas</option>
          <option v-for="kelas in kelasList" :key="kelas.id" :value="kelas.id">
            {{ kelas.nama }}
          </option>
        </select>
      </div>
    </div>

    <!-- Holiday Warning -->
    <div v-if="holidayWarning" class="alert alert-warning">⚠️ {{ holidayWarning }}</div>

    <!-- Read-only Notice -->
    <div v-if="isReadOnly && existingAbsensi.length > 0" class="alert alert-info">
      ℹ️ Absensi sudah diinput. Data ditampilkan dalam mode read-only.
    </div>

    <!-- Messages -->
    <div v-if="successMessage" class="alert alert-success">✅ {{ successMessage }}</div>
    <div v-if="errorMessage" class="alert alert-danger">❌ {{ errorMessage }}</div>

    <!-- Loading -->
    <div v-if="loading" class="loading">Memuat data siswa...</div>

    <!-- Student List -->
    <div v-else-if="siswaList.length > 0 && selectedKelasId" class="absensi-content">
      <!-- Quick Actions -->
      <div v-if="!isReadOnly" class="quick-actions">
        <span class="quick-label">Set Semua:</span>
        <button
          v-for="status in STATUS_OPTIONS"
          :key="status"
          class="btn btn-sm"
          :style="{ background: STATUS_COLORS[status] }"
          @click="setAllStatus(status)"
        >
          {{ STATUS_LABELS[status] }}
        </button>
      </div>

      <!-- Summary -->
      <div class="status-summary">
        <span class="summary-item" v-for="(count, status) in statusSummary" :key="status">
          <span class="summary-dot" :style="{ background: STATUS_COLORS[status] }"></span>
          {{ STATUS_LABELS[status] }}: {{ count }}
        </span>
        <span class="summary-total">Total: {{ records.length }}</span>
      </div>

      <!-- Student Table -->
      <div class="table-container">
        <table class="absensi-table">
          <thead>
            <tr>
              <th class="col-no">No</th>
              <th class="col-nama">Nama Siswa</th>
              <th class="col-nisn">NISN</th>
              <th class="col-status">Status Kehadiran</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(record, index) in records" :key="record.siswa_id">
              <td class="col-no">{{ index + 1 }}</td>
              <td class="col-nama">{{ getSiswaName(record.siswa_id) }}</td>
              <td class="col-nisn">{{ getSiswaNisn(record.siswa_id) }}</td>
              <td class="col-status">
                <div class="status-group">
                  <label
                    v-for="status in STATUS_OPTIONS"
                    :key="status"
                    class="status-chip"
                    :class="{
                      'status-active': record.status === status,
                      'status-disabled': isReadOnly,
                    }"
                    :style="record.status === status ? { background: STATUS_COLORS[status] } : {}"
                  >
                    <input
                      type="radio"
                      :name="`status-${record.siswa_id}`"
                      :value="status"
                      v-model="record.status"
                      :disabled="isReadOnly"
                      class="sr-only"
                    />
                    {{ STATUS_LABELS[status] }}
                  </label>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Submit -->
      <div v-if="!isReadOnly" class="submit-bar">
        <div class="unfilled-warning" v-if="unfilledStudents.length > 0">
          ⚠️ {{ unfilledStudents.length }} siswa belum diisi
        </div>
        <button
          class="btn btn-primary btn-lg"
          :disabled="!allFilled || submitting"
          @click="submitAbsensi"
        >
          {{ submitting ? 'Menyimpan...' : 'Simpan Absensi' }}
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="selectedKelasId && !loading" class="empty-state">
      Tidak ada siswa aktif di kelas ini.
    </div>

    <div v-else-if="!selectedKelasId" class="empty-state">
      <template v-if="isGuru && kelasList.length === 0">
        Tidak ada kelas terjadwal untuk hari ini.
      </template>
      <template v-else> Pilih kelas untuk memulai input absensi. </template>
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
  gap: 1.5rem;
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
}
.input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}
.select-input {
  min-width: 200px;
}
.date-input {
  min-width: 160px;
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
.alert-info {
  background: #dbeafe;
  border: 1px solid #93c5fd;
  color: #1e40af;
}
.alert-success {
  background: #dcfce7;
  border: 1px solid #86efac;
  color: #166534;
}
.alert-danger {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  color: #991b1b;
}

/* Quick actions */
.quick-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.quick-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

/* Summary */
.status-summary {
  display: flex;
  gap: 1.25rem;
  margin-bottom: 1rem;
  font-size: 0.8125rem;
  color: #4b5563;
  align-items: center;
  flex-wrap: wrap;
}
.summary-item {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.summary-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.summary-total {
  font-weight: 600;
}

/* Table */
.table-container {
  overflow-x: auto;
}
.absensi-table {
  width: 100%;
  border-collapse: collapse;
}
.absensi-table th,
.absensi-table td {
  padding: 0.625rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
}
.absensi-table th {
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
.col-status {
  width: 360px;
}

/* Status chips */
.status-group {
  display: flex;
  gap: 0.375rem;
}
.status-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.65rem;
  border-radius: 16px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid #d1d5db;
  transition: all 0.15s;
  user-select: none;
}
.status-chip:hover:not(.status-disabled) {
  border-color: #9ca3af;
}
.status-active {
  border-color: transparent;
  font-weight: 600;
}
.status-disabled {
  cursor: default;
  opacity: 0.7;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* Submit */
.submit-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
}
.unfilled-warning {
  font-size: 0.8125rem;
  color: #d97706;
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
.btn-sm {
  padding: 0.3rem 0.65rem;
  font-size: 0.75rem;
}
.btn-lg {
  padding: 0.625rem 1.5rem;
  font-size: 1rem;
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
