<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api/client';
import { PageHeader } from '@/components/ui';

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
    const { data } = await api.get<TahunAjaran[]>('/tahun-ajaran');
    tahunAjaranList.value = data;
    // Default target to first prepared tahun ajaran
    const prepared = data.find((t) => t.status === 'disiapkan');
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
      params: { tahunAjaranId: activeTahunAjaran.value.id },
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
      params: { tahunAjaranId: targetTahunAjaranId.value },
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
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader title="Kenaikan Kelas" />

    <!-- Wizard Steps Indicator -->
    <div class="flex items-center justify-center gap-0 mb-6">
      <div class="flex items-center gap-2">
        <div
          :class="[
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold',
            currentStep >= 1 ? 'bg-primary-600 text-white' : 'bg-surface-200 text-text-tertiary',
          ]"
        >
          1
        </div>
        <span
          class="text-sm font-medium"
          :class="currentStep >= 1 ? 'text-primary-600' : 'text-text-tertiary'"
          >Pilih Kelas</span
        >
      </div>
      <div
        :class="['w-12 h-0.5 mx-2', currentStep >= 2 ? 'bg-primary-600' : 'bg-surface-200']"
      ></div>
      <div class="flex items-center gap-2">
        <div
          :class="[
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold',
            currentStep >= 2 ? 'bg-primary-600 text-white' : 'bg-surface-200 text-text-tertiary',
          ]"
        >
          2
        </div>
        <span
          class="text-sm font-medium"
          :class="currentStep >= 2 ? 'text-primary-600' : 'text-text-tertiary'"
          >Preview Siswa</span
        >
      </div>
      <div
        :class="['w-12 h-0.5 mx-2', currentStep >= 3 ? 'bg-primary-600' : 'bg-surface-200']"
      ></div>
      <div class="flex items-center gap-2">
        <div
          :class="[
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold',
            currentStep >= 3 ? 'bg-primary-600 text-white' : 'bg-surface-200 text-text-tertiary',
          ]"
        >
          3
        </div>
        <span
          class="text-sm font-medium"
          :class="currentStep >= 3 ? 'text-primary-600' : 'text-text-tertiary'"
          >Konfirmasi</span
        >
      </div>
    </div>

    <!-- Step 1: Select Source & Target -->
    <div v-if="currentStep === 1" class="max-w-xl">
      <h2 class="text-lg font-semibold text-text-primary mb-4">Pilih Kelas Asal dan Tujuan</h2>

      <div
        v-if="!activeTahunAjaran"
        class="p-3 bg-warning-50 border border-warning-500/20 rounded-lg text-sm text-warning-700 mb-4"
      >
        Tidak ada tahun ajaran aktif. Silakan aktifkan tahun ajaran terlebih dahulu.
      </div>

      <div
        v-else-if="preparedTahunAjaranList.length === 0"
        class="p-3 bg-warning-50 border border-warning-500/20 rounded-lg text-sm text-warning-700 mb-4"
      >
        Tidak ada tahun ajaran dengan status "Disiapkan". Buat tahun ajaran baru terlebih dahulu
        sebelum melakukan kenaikan kelas.
      </div>

      <template v-else>
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5"
            >Kelas Asal (Tahun Ajaran: {{ activeTahunAjaran?.nama }})</label
          >
          <select
            v-model="sourceKelasId"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            @change="error = ''"
          >
            <option value="">-- Pilih Kelas Asal --</option>
            <option v-for="kelas in sourceKelasList" :key="kelas.id" :value="kelas.id">
              {{ kelas.nama }} (Tingkat {{ kelas.tingkat }})
            </option>
          </select>
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5"
            >Tahun Ajaran Tujuan</label
          >
          <select
            v-model="targetTahunAjaranId"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            @change="fetchTargetKelas"
          >
            <option value="">-- Pilih Tahun Ajaran Tujuan --</option>
            <option v-for="ta in preparedTahunAjaranList" :key="ta.id" :value="ta.id">
              {{ ta.nama }}
            </option>
          </select>
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5"
            >Kelas Tujuan
            <span class="text-text-tertiary font-normal"
              >(opsional - otomatis tingkat +1)</span
            ></label
          >
          <select
            v-model="targetKelasId"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          >
            <option value="">-- Otomatis (Tingkat +1) --</option>
            <option v-for="kelas in targetKelasList" :key="kelas.id" :value="kelas.id">
              {{ kelas.nama }} (Tingkat {{ kelas.tingkat }})
            </option>
          </select>
        </div>

        <p v-if="error" class="text-xs text-danger-500 mt-1">{{ error }}</p>

        <div class="flex justify-end mt-6">
          <button
            class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!sourceKelasId || !targetTahunAjaranId || loading"
            @click="goToPreview"
          >
            {{ loading ? 'Memuat...' : 'Lanjut →' }}
          </button>
        </div>
      </template>
    </div>

    <!-- Step 2: Preview Students -->
    <div v-if="currentStep === 2" class="max-w-xl">
      <h2 class="text-lg font-semibold text-text-primary mb-2">Preview Siswa</h2>
      <p class="text-sm text-text-secondary mb-4">
        Centang siswa yang ingin <strong>dikecualikan</strong> dari kenaikan kelas (tidak naik
        kelas).
      </p>

      <div
        v-if="isHighestGrade"
        class="p-3 bg-primary-50 border border-primary-500/20 rounded-lg text-sm text-primary-700 mb-4"
      >
        Kelas ini adalah tingkat tertinggi. Siswa yang dipromosikan akan ditandai sebagai
        <strong>Lulus/Alumni</strong>.
      </div>

      <div class="flex gap-4 p-3 bg-surface-50 rounded-lg mb-4 text-sm text-text-secondary">
        <span>Total siswa: {{ previewStudents.length }}</span>
        <span>Naik kelas: {{ selectedStudentCount }}</span>
        <span>Dikecualikan: {{ excludedStudentIds.size }}</span>
      </div>

      <div
        class="bg-white border border-border rounded-xl overflow-hidden max-h-[400px] overflow-y-auto"
      >
        <div
          v-for="student in previewStudents"
          :key="student.id"
          :class="[
            'px-4 py-3 border-b border-border last:border-b-0',
            excludedStudentIds.has(student.id) ? 'bg-danger-50' : '',
          ]"
        >
          <label class="flex items-center gap-3 cursor-pointer text-sm">
            <input
              type="checkbox"
              :checked="excludedStudentIds.has(student.id)"
              @change="toggleExclude(student.id)"
              class="rounded border-border"
            />
            <span class="flex-1 text-text-primary">{{ student.nama }}</span>
            <span v-if="student.nisn" class="text-xs text-text-tertiary">{{ student.nisn }}</span>
          </label>
        </div>
        <div v-if="previewStudents.length === 0" class="py-12 text-center">
          <p class="text-sm text-text-tertiary">Tidak ada siswa aktif di kelas ini.</p>
        </div>
      </div>

      <p v-if="error" class="text-xs text-danger-500 mt-1">{{ error }}</p>

      <div class="flex justify-between mt-6">
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="goBackToStep1"
        >
          ← Kembali
        </button>
        <button
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="selectedStudentCount === 0"
          @click="goToConfirmation"
        >
          Lanjut →
        </button>
      </div>
    </div>

    <!-- Step 3: Confirm and Execute -->
    <div v-if="currentStep === 3" class="max-w-xl">
      <h2 class="text-lg font-semibold text-text-primary mb-4">Konfirmasi Kenaikan Kelas</h2>

      <div v-if="!executionResult" class="bg-surface-50 rounded-lg p-4 divide-y divide-border">
        <div class="flex justify-between py-2 text-sm">
          <span class="text-text-secondary">Kelas Asal:</span>
          <span class="font-medium text-text-primary">{{ getSourceKelasName() }}</span>
        </div>
        <div class="flex justify-between py-2 text-sm">
          <span class="text-text-secondary">Kelas Tujuan:</span>
          <span class="font-medium text-text-primary">{{ getTargetKelasName() }}</span>
        </div>
        <div class="flex justify-between py-2 text-sm">
          <span class="text-text-secondary">Tahun Ajaran Tujuan:</span>
          <span class="font-medium text-text-primary">{{ getTargetTahunAjaranName() }}</span>
        </div>
        <div class="flex justify-between py-2 text-sm">
          <span class="text-text-secondary">Siswa Naik Kelas:</span>
          <span class="font-medium text-text-primary">{{ selectedStudentCount }} siswa</span>
        </div>
        <div v-if="excludedStudentIds.size > 0" class="flex justify-between py-2 text-sm">
          <span class="text-text-secondary">Siswa Dikecualikan:</span>
          <span class="font-medium text-text-primary">{{ excludedStudentIds.size }} siswa</span>
        </div>
        <div v-if="isHighestGrade" class="flex justify-between py-2 text-sm">
          <span class="text-text-secondary">Status Setelah Proses:</span>
          <span
            class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-primary-50 text-primary-700"
            >Lulus / Alumni</span
          >
        </div>
      </div>

      <!-- Success Result -->
      <div
        v-if="executionResult"
        class="text-center p-6 bg-success-50 border border-success-500/20 rounded-xl"
      >
        <div
          class="w-12 h-12 rounded-full bg-success-700 text-white flex items-center justify-center text-xl mx-auto mb-3"
        >
          ✓
        </div>
        <h3 class="text-lg font-semibold text-success-700 mb-3">{{ successMessage }}</h3>
        <div class="space-y-1 mb-4">
          <p class="text-sm text-text-primary">
            Siswa naik kelas: <strong>{{ executionResult.promoted }}</strong>
          </p>
          <p v-if="executionResult.excluded > 0" class="text-sm text-text-primary">
            Siswa dikecualikan: <strong>{{ executionResult.excluded }}</strong>
          </p>
          <p v-if="executionResult.graduated > 0" class="text-sm text-text-primary">
            Siswa lulus/alumni: <strong>{{ executionResult.graduated }}</strong>
          </p>
        </div>
        <button
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          @click="resetWizard"
        >
          Proses Kelas Lain
        </button>
      </div>

      <p v-if="error" class="text-xs text-danger-500 mt-1">{{ error }}</p>

      <div v-if="!executionResult" class="flex justify-between mt-6">
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="goBackToStep2"
        >
          ← Kembali
        </button>
        <button
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="executing"
          @click="executePromotion"
        >
          {{ executing ? 'Memproses...' : 'Proses Kenaikan Kelas' }}
        </button>
      </div>
    </div>
  </div>
</template>
