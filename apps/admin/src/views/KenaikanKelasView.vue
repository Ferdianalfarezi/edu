<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api/client';

interface TahunAjaran {
  id: string;
  nama: string;
  status: string;
}

interface Kelas {
  id: string;
  nama: string;
  tingkat: number;
  tahun_ajaran_id: string;
}

interface Siswa {
  id: string;
  nama: string;
  nisn: string | null;
}

interface PreviewResult {
  students: Siswa[];
  source_kelas: Kelas;
  target_kelas: Kelas | null;
  suggested_target_kelas_id: string | null;
}

// Wizard steps
const currentStep = ref(1);
const loading = ref(false);
const error = ref('');
const successMessage = ref('');

// Step 1: Selection
const tahunAjaranList = ref<TahunAjaran[]>([]);
const sourceKelasList = ref<Kelas[]>([]);
const targetKelasList = ref<Kelas[]>([]);

const sourceKelasId = ref('');
const targetKelasId = ref('');
const targetTahunAjaranId = ref('');

// Step 2: Preview & Exclude
const previewStudents = ref<Siswa[]>([]);
const excludedStudentIds = ref<Set<string>>(new Set());
const isHighestGrade = ref(false);

// Step 3: Confirmation & Result
const executing = ref(false);
const executionResult = ref<{
  promoted: number;
  excluded: number;
  graduated: number;
} | null>(null);

const activeTahunAjaran = computed(() => tahunAjaranList.value.find((t) => t.status === 'aktif'));

const preparedTahunAjaranList = computed(() =>
  tahunAjaranList.value.filter((t) => t.status === 'disiapkan'),
);

const selectedStudentCount = computed(
  () => previewStudents.value.length - excludedStudentIds.value.size,
);

async function fetchTahunAjaran() {
  try {
    const { data } = await api.get<{ data: TahunAjaran[] }>('/tahun-ajaran');
    tahunAjaranList.value = data.data;
    // Default target to first prepared tahun ajaran
    const prepared = data.data.find((t) => t.status === 'disiapkan');
    if (prepared) {
      targetTahunAjaranId.value = prepared.id;
    }
  } catch (err) {
    console.error('Failed to fetch tahun ajaran:', err);
  }
}

async function fetchSourceKelas() {
  if (!activeTahunAjaran.value) return;
  try {
    const { data } = await api.get<{ data: Kelas[] }>('/kelas', {
      params: { tahun_ajaran_id: activeTahunAjaran.value.id },
    });
    sourceKelasList.value = data.data;
  } catch (err) {
    console.error('Failed to fetch source kelas:', err);
  }
}

async function fetchTargetKelas() {
  if (!targetTahunAjaranId.value) {
    targetKelasList.value = [];
    return;
  }
  try {
    const { data } = await api.get<{ data: Kelas[] }>('/kelas', {
      params: { tahun_ajaran_id: targetTahunAjaranId.value },
    });
    targetKelasList.value = data.data;
  } catch (err) {
    console.error('Failed to fetch target kelas:', err);
  }
}

async function goToPreview() {
  if (!sourceKelasId.value || !targetTahunAjaranId.value) {
    error.value = 'Pilih kelas asal dan tahun ajaran tujuan.';
    return;
  }
  error.value = '';
  loading.value = true;

  try {
    const payload: Record<string, string> = {
      source_kelas_id: sourceKelasId.value,
      target_tahun_ajaran_id: targetTahunAjaranId.value,
    };
    if (targetKelasId.value) {
      payload.target_kelas_id = targetKelasId.value;
    }

    const { data } = await api.post<{ data: PreviewResult }>('/kenaikan-kelas/preview', payload);
    previewStudents.value = data.data.students;
    isHighestGrade.value = !data.data.target_kelas;
    excludedStudentIds.value = new Set();

    // Auto-select suggested target if not manually chosen
    if (!targetKelasId.value && data.data.suggested_target_kelas_id) {
      targetKelasId.value = data.data.suggested_target_kelas_id;
    }

    currentStep.value = 2;
  } catch (err: any) {
    const msg = err.response?.data?.message;
    error.value = msg
      ? Array.isArray(msg)
        ? msg.join(', ')
        : msg
      : 'Gagal memuat preview kenaikan kelas.';
  } finally {
    loading.value = false;
  }
}

function toggleExclude(studentId: string) {
  const newSet = new Set(excludedStudentIds.value);
  if (newSet.has(studentId)) {
    newSet.delete(studentId);
  } else {
    newSet.add(studentId);
  }
  excludedStudentIds.value = newSet;
}

function goToConfirmation() {
  currentStep.value = 3;
}

function goBackToStep1() {
  currentStep.value = 1;
  previewStudents.value = [];
  excludedStudentIds.value = new Set();
  executionResult.value = null;
  successMessage.value = '';
}

function goBackToStep2() {
  currentStep.value = 2;
  executionResult.value = null;
}

async function executePromotion() {
  executing.value = true;
  error.value = '';

  try {
    const payload = {
      source_kelas_id: sourceKelasId.value,
      target_kelas_id: targetKelasId.value || undefined,
      target_tahun_ajaran_id: targetTahunAjaranId.value,
      excluded_siswa_ids: Array.from(excludedStudentIds.value),
    };

    const { data } = await api.post<{
      data: { promoted: number; excluded: number; graduated: number };
    }>('/kenaikan-kelas/execute', payload);

    executionResult.value = data.data;
    successMessage.value = 'Kenaikan kelas berhasil diproses!';
  } catch (err: any) {
    const msg = err.response?.data?.message;
    error.value = msg
      ? Array.isArray(msg)
        ? msg.join(', ')
        : msg
      : 'Gagal memproses kenaikan kelas.';
  } finally {
    executing.value = false;
  }
}

function resetWizard() {
  currentStep.value = 1;
  sourceKelasId.value = '';
  targetKelasId.value = '';
  previewStudents.value = [];
  excludedStudentIds.value = new Set();
  executionResult.value = null;
  successMessage.value = '';
  error.value = '';
}

function getSourceKelasName(): string {
  const kelas = sourceKelasList.value.find((k) => k.id === sourceKelasId.value);
  return kelas ? kelas.nama : '';
}

function getTargetKelasName(): string {
  const kelas = targetKelasList.value.find((k) => k.id === targetKelasId.value);
  return kelas ? kelas.nama : '(Auto - Tingkat +1)';
}

function getTargetTahunAjaranName(): string {
  const ta = tahunAjaranList.value.find((t) => t.id === targetTahunAjaranId.value);
  return ta ? ta.nama : '';
}

onMounted(async () => {
  await fetchTahunAjaran();
  await fetchSourceKelas();
});
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Kenaikan Kelas</h1>
    </div>

    <!-- Wizard Steps Indicator -->
    <div class="steps-indicator">
      <div :class="['step', { active: currentStep >= 1 }]">
        <span class="step-number">1</span>
        <span class="step-label">Pilih Kelas</span>
      </div>
      <div class="step-line" :class="{ active: currentStep >= 2 }"></div>
      <div :class="['step', { active: currentStep >= 2 }]">
        <span class="step-number">2</span>
        <span class="step-label">Preview Siswa</span>
      </div>
      <div class="step-line" :class="{ active: currentStep >= 3 }"></div>
      <div :class="['step', { active: currentStep >= 3 }]">
        <span class="step-number">3</span>
        <span class="step-label">Konfirmasi</span>
      </div>
    </div>

    <!-- Step 1: Select Source & Target -->
    <div v-if="currentStep === 1" class="wizard-step">
      <h2>Pilih Kelas Asal dan Tujuan</h2>

      <div v-if="!activeTahunAjaran" class="alert alert-warning">
        Tidak ada tahun ajaran aktif. Silakan aktifkan tahun ajaran terlebih dahulu.
      </div>

      <div v-else-if="preparedTahunAjaranList.length === 0" class="alert alert-warning">
        Tidak ada tahun ajaran dengan status "Disiapkan". Buat tahun ajaran baru terlebih dahulu
        sebelum melakukan kenaikan kelas.
      </div>

      <template v-else>
        <div class="form-group">
          <label>Kelas Asal (Tahun Ajaran: {{ activeTahunAjaran?.nama }})</label>
          <select v-model="sourceKelasId" class="input" @change="error = ''">
            <option value="">-- Pilih Kelas Asal --</option>
            <option v-for="kelas in sourceKelasList" :key="kelas.id" :value="kelas.id">
              {{ kelas.nama }} (Tingkat {{ kelas.tingkat }})
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>Tahun Ajaran Tujuan</label>
          <select v-model="targetTahunAjaranId" class="input" @change="fetchTargetKelas">
            <option value="">-- Pilih Tahun Ajaran Tujuan --</option>
            <option v-for="ta in preparedTahunAjaranList" :key="ta.id" :value="ta.id">
              {{ ta.nama }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>Kelas Tujuan <span class="optional">(opsional - otomatis tingkat +1)</span></label>
          <select v-model="targetKelasId" class="input">
            <option value="">-- Otomatis (Tingkat +1) --</option>
            <option v-for="kelas in targetKelasList" :key="kelas.id" :value="kelas.id">
              {{ kelas.nama }} (Tingkat {{ kelas.tingkat }})
            </option>
          </select>
        </div>

        <p v-if="error" class="error-text">{{ error }}</p>

        <div class="wizard-actions">
          <button
            class="btn btn-primary"
            :disabled="!sourceKelasId || !targetTahunAjaranId || loading"
            @click="goToPreview"
          >
            {{ loading ? 'Memuat...' : 'Lanjut →' }}
          </button>
        </div>
      </template>
    </div>

    <!-- Step 2: Preview Students -->
    <div v-if="currentStep === 2" class="wizard-step">
      <h2>Preview Siswa</h2>
      <p class="hint">
        Centang siswa yang ingin <strong>dikecualikan</strong> dari kenaikan kelas (tidak naik
        kelas).
      </p>

      <div v-if="isHighestGrade" class="alert alert-info">
        Kelas ini adalah tingkat tertinggi. Siswa yang dipromosikan akan ditandai sebagai
        <strong>Lulus/Alumni</strong>.
      </div>

      <div class="summary-bar">
        <span>Total siswa: {{ previewStudents.length }}</span>
        <span>Naik kelas: {{ selectedStudentCount }}</span>
        <span>Dikecualikan: {{ excludedStudentIds.size }}</span>
      </div>

      <div class="student-list">
        <div
          v-for="student in previewStudents"
          :key="student.id"
          :class="['student-item', { excluded: excludedStudentIds.has(student.id) }]"
        >
          <label class="checkbox-label">
            <input
              type="checkbox"
              :checked="excludedStudentIds.has(student.id)"
              @change="toggleExclude(student.id)"
            />
            <span class="student-name">{{ student.nama }}</span>
            <span v-if="student.nisn" class="student-nisn">{{ student.nisn }}</span>
          </label>
        </div>
        <p v-if="previewStudents.length === 0" class="empty-state">
          Tidak ada siswa aktif di kelas ini.
        </p>
      </div>

      <p v-if="error" class="error-text">{{ error }}</p>

      <div class="wizard-actions">
        <button class="btn btn-secondary" @click="goBackToStep1">← Kembali</button>
        <button
          class="btn btn-primary"
          :disabled="selectedStudentCount === 0"
          @click="goToConfirmation"
        >
          Lanjut →
        </button>
      </div>
    </div>

    <!-- Step 3: Confirm and Execute -->
    <div v-if="currentStep === 3" class="wizard-step">
      <h2>Konfirmasi Kenaikan Kelas</h2>

      <div v-if="!executionResult" class="confirmation-details">
        <div class="detail-row">
          <span class="detail-label">Kelas Asal:</span>
          <span class="detail-value">{{ getSourceKelasName() }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Kelas Tujuan:</span>
          <span class="detail-value">{{ getTargetKelasName() }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Tahun Ajaran Tujuan:</span>
          <span class="detail-value">{{ getTargetTahunAjaranName() }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Siswa Naik Kelas:</span>
          <span class="detail-value">{{ selectedStudentCount }} siswa</span>
        </div>
        <div v-if="excludedStudentIds.size > 0" class="detail-row">
          <span class="detail-label">Siswa Dikecualikan:</span>
          <span class="detail-value">{{ excludedStudentIds.size }} siswa</span>
        </div>
        <div v-if="isHighestGrade" class="detail-row">
          <span class="detail-label">Status Setelah Proses:</span>
          <span class="detail-value status-badge-alumni">Lulus / Alumni</span>
        </div>
      </div>

      <!-- Success Result -->
      <div v-if="executionResult" class="result-box">
        <div class="result-icon">✓</div>
        <h3>{{ successMessage }}</h3>
        <div class="result-details">
          <p>
            Siswa naik kelas: <strong>{{ executionResult.promoted }}</strong>
          </p>
          <p v-if="executionResult.excluded > 0">
            Siswa dikecualikan: <strong>{{ executionResult.excluded }}</strong>
          </p>
          <p v-if="executionResult.graduated > 0">
            Siswa lulus/alumni: <strong>{{ executionResult.graduated }}</strong>
          </p>
        </div>
        <button class="btn btn-primary" @click="resetWizard">Proses Kelas Lain</button>
      </div>

      <p v-if="error" class="error-text">{{ error }}</p>

      <div v-if="!executionResult" class="wizard-actions">
        <button class="btn btn-secondary" @click="goBackToStep2">← Kembali</button>
        <button class="btn btn-primary" :disabled="executing" @click="executePromotion">
          {{ executing ? 'Memproses...' : 'Proses Kenaikan Kelas' }}
        </button>
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

/* Steps Indicator */
.steps-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2rem;
  gap: 0;
}
.step {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #9ca3af;
}
.step.active {
  color: #2563eb;
}
.step-number {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
}
.step.active .step-number {
  background: #2563eb;
  color: white;
}
.step-label {
  font-size: 0.875rem;
  font-weight: 500;
}
.step-line {
  width: 60px;
  height: 2px;
  background: #e5e7eb;
  margin: 0 0.5rem;
}
.step-line.active {
  background: #2563eb;
}

/* Wizard Step Content */
.wizard-step {
  max-width: 640px;
}
.wizard-step h2 {
  font-size: 1.125rem;
  margin: 0 0 1rem;
}
.wizard-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 1.5rem;
}

/* Form */
.form-group {
  margin-bottom: 1rem;
}
.form-group label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}
.input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}
.optional {
  color: #9ca3af;
  font-weight: 400;
}

/* Alerts */
.alert {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}
.alert-warning {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}
.alert-info {
  background: #dbeafe;
  color: #1e40af;
  border: 1px solid #bfdbfe;
}

/* Summary Bar */
.summary-bar {
  display: flex;
  gap: 1.5rem;
  padding: 0.75rem 1rem;
  background: #f9fafb;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: #374151;
}

/* Student List */
.student-list {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.student-item {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #f3f4f6;
}
.student-item:last-child {
  border-bottom: none;
}
.student-item.excluded {
  background: #fef2f2;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  font-size: 0.875rem;
}
.student-name {
  flex: 1;
}
.student-nisn {
  color: #6b7280;
  font-size: 0.75rem;
}

/* Confirmation Details */
.confirmation-details {
  background: #f9fafb;
  border-radius: 8px;
  padding: 1rem 1.25rem;
}
.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.875rem;
}
.detail-row:last-child {
  border-bottom: none;
}
.detail-label {
  color: #6b7280;
}
.detail-value {
  font-weight: 500;
  color: #111827;
}
.status-badge-alumni {
  background: #ede9fe;
  color: #5b21b6;
  padding: 0.1rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
}

/* Result */
.result-box {
  text-align: center;
  padding: 2rem;
  background: #f0fdf4;
  border-radius: 8px;
  border: 1px solid #bbf7d0;
}
.result-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #22c55e;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  margin: 0 auto 1rem;
}
.result-box h3 {
  margin: 0 0 1rem;
  color: #166534;
}
.result-details {
  margin-bottom: 1.5rem;
}
.result-details p {
  margin: 0.25rem 0;
  font-size: 0.875rem;
  color: #374151;
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
.btn-primary:hover {
  background: #1d4ed8;
}
.btn-primary:disabled {
  background: #93c5fd;
  cursor: not-allowed;
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
.hint {
  color: #6b7280;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}
.error-text {
  color: #dc2626;
  font-size: 0.875rem;
  margin-top: 0.5rem;
}
</style>
