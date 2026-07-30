<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api/client';
import { PageHeader, SearchSelect, ActionButton } from '@/components/ui';
import type { SelectOption } from '@/components/ui';

interface TahunAjaran {
  id: string;
  nama: string;
  status: string;
}

interface Kelas {
  id: string;
  nama: string;
  tingkat: number;
  tahunAjaranId: string;
}

interface Siswa {
  id: string;
  siswaId?: string;
  nama: string;
  nisn: string | null;
}

interface PreviewResult {
  students: { siswaId: string; nama: string; nisn: string | null }[];
  sourceKelas: { id: string; nama: string; tingkat: number };
  targetKelas: { id: string; nama: string; tingkat: number } | null;
  isHighestGrade: boolean;
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

const targetTahunAjaranOptions = computed(() =>
  tahunAjaranList.value.filter((t) => t.id !== sourceTahunAjaranId.value),
);

// SelectOption computed for SearchSelect component
const sourceTahunAjaranSelectOptions = computed<SelectOption[]>(() =>
  sourceTahunAjaranOptions.value.map((ta) => ({
    value: ta.id,
    label: `${ta.nama} (${ta.status})`,
  })),
);

const sourceKelasSelectOptions = computed<SelectOption[]>(() =>
  sourceKelasList.value.map((k) => ({
    value: k.id,
    label: `${k.nama} (Tingkat ${k.tingkat})`,
  })),
);

const targetTahunAjaranSelectOptions = computed<SelectOption[]>(() =>
  targetTahunAjaranOptions.value.map((ta) => ({
    value: ta.id,
    label: `${ta.nama} (${ta.status})`,
  })),
);

const targetKelasSelectOptions = computed<SelectOption[]>(() =>
  targetKelasList.value.map((k) => ({
    value: k.id,
    label: `${k.nama} (Tingkat ${k.tingkat})`,
  })),
);

const selectedStudentCount = computed(
  () => previewStudents.value.length - excludedStudentIds.value.size,
);

async function fetchTahunAjaran() {
  try {
    const { data } = await api.get<TahunAjaran[]>('/tahun-ajaran');
    tahunAjaranList.value = data;
    const prepared = data.find((t) => t.status === 'disiapkan');
    const aktif = data.find((t) => t.status === 'aktif');
    if (prepared) {
      targetTahunAjaranId.value = prepared.id;
    } else if (aktif) {
      targetTahunAjaranId.value = aktif.id;
    }
  } catch (err) {
    console.error('Failed to fetch tahun ajaran:', err);
  }
}

const sourceTahunAjaranId = ref('');

const sourceTahunAjaranOptions = computed(() =>
  tahunAjaranList.value.filter((t) => t.id !== targetTahunAjaranId.value),
);

async function fetchSourceKelas() {
  if (!sourceTahunAjaranId.value) {
    sourceKelasList.value = [];
    return;
  }
  try {
    const { data } = await api.get<{ data: Kelas[] }>('/kelas', {
      params: { tahun_ajaran_id: sourceTahunAjaranId.value },
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

    const { data } = await api.post<PreviewResult>('/kenaikan-kelas/preview', payload);
    previewStudents.value = data.students.map((s) => ({
      id: s.siswaId,
      nama: s.nama,
      nisn: s.nisn,
    }));
    isHighestGrade.value = data.isHighestGrade;
    excludedStudentIds.value = new Set();

    if (!targetKelasId.value && data.targetKelas) {
      targetKelasId.value = data.targetKelas.id;
    }

    currentStep.value = 2;
  } catch (err) {
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
      promoted: number;
      excluded: number;
      graduated: number;
    }>('/kenaikan-kelas/execute', payload);

    executionResult.value = data;
    successMessage.value = 'Kenaikan kelas berhasil diproses!';
  } catch (err) {
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
  const nonTarget = tahunAjaranList.value.find((t) => t.id !== targetTahunAjaranId.value);
  if (nonTarget) {
    sourceTahunAjaranId.value = nonTarget.id;
    await fetchSourceKelas();
  }
  if (targetTahunAjaranId.value) {
    await fetchTargetKelas();
  }
});
</script>

<template>
  <div class="p-8">
    <PageHeader title="Kenaikan Kelas" />

    <!-- Wizard Steps Indicator -->
    <div class="flex items-center justify-center gap-0 mb-8">
      <div class="flex items-center gap-2">
        <div
          :class="[
            'w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold',
            currentStep >= 1 ? 'bg-primary-600 text-white' : 'bg-stone-200 text-text-tertiary',
          ]"
        >
          1
        </div>
        <span
          class="text-[15px] font-semibold"
          :class="currentStep >= 1 ? 'text-primary-600' : 'text-text-tertiary'"
          >Pilih Kelas</span
        >
      </div>
      <div :class="['w-12 h-0.5 mx-3', currentStep >= 2 ? 'bg-primary-600' : 'bg-stone-200']"></div>
      <div class="flex items-center gap-2">
        <div
          :class="[
            'w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold',
            currentStep >= 2 ? 'bg-primary-600 text-white' : 'bg-stone-200 text-text-tertiary',
          ]"
        >
          2
        </div>
        <span
          class="text-[15px] font-semibold"
          :class="currentStep >= 2 ? 'text-primary-600' : 'text-text-tertiary'"
          >Preview Siswa</span
        >
      </div>
      <div :class="['w-12 h-0.5 mx-3', currentStep >= 3 ? 'bg-primary-600' : 'bg-stone-200']"></div>
      <div class="flex items-center gap-2">
        <div
          :class="[
            'w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold',
            currentStep >= 3 ? 'bg-primary-600 text-white' : 'bg-stone-200 text-text-tertiary',
          ]"
        >
          3
        </div>
        <span
          class="text-[15px] font-semibold"
          :class="currentStep >= 3 ? 'text-primary-600' : 'text-text-tertiary'"
          >Konfirmasi</span
        >
      </div>
    </div>

    <!-- Step 1: Select Source & Target -->
    <div
      v-if="currentStep === 1"
      class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden max-w-xl mx-auto"
    >
      <!-- Section Header -->
      <div class="px-6 py-5 bg-primary-50 border-b-2 border-primary-200">
        <h3 class="text-[16px] font-bold text-primary-800">Pilih Kelas Asal dan Tujuan</h3>
      </div>

      <div class="p-6">
        <div
          v-if="targetTahunAjaranOptions.length === 0"
          class="p-4 bg-warning-50 border-2 border-warning-500/20 rounded-xs text-[15px] text-warning-700 mb-5"
        >
          Hanya ada satu tahun ajaran. Buat tahun ajaran baru terlebih dahulu sebelum melakukan
          kenaikan kelas.
        </div>

        <template v-else>
          <div class="mb-5">
            <SearchSelect
              v-model="sourceTahunAjaranId"
              label="Tahun Ajaran Asal"
              :options="sourceTahunAjaranSelectOptions"
              placeholder="-- Pilih Tahun Ajaran Asal --"
              @change="fetchSourceKelas"
            />
          </div>

          <div class="mb-5">
            <SearchSelect
              v-model="sourceKelasId"
              label="Kelas Asal"
              :options="sourceKelasSelectOptions"
              placeholder="-- Pilih Kelas Asal --"
              :disabled="!sourceTahunAjaranId"
              @change="error = ''"
            />
          </div>

          <div class="mb-5">
            <SearchSelect
              v-model="targetTahunAjaranId"
              label="Tahun Ajaran Tujuan"
              :options="targetTahunAjaranSelectOptions"
              placeholder="-- Pilih Tahun Ajaran Tujuan --"
              @change="fetchTargetKelas"
            />
          </div>

          <div class="mb-5">
            <SearchSelect
              v-model="targetKelasId"
              label="Kelas Tujuan"
              :options="targetKelasSelectOptions"
              placeholder="-- Otomatis (Tingkat +1) --"
              :disabled="!targetTahunAjaranId"
              clearable
            />
            <p class="mt-1.5 text-[13px] text-text-tertiary">
              Opsional — kosong berarti otomatis tingkat +1
            </p>
          </div>

          <p v-if="error" class="text-[13px] text-danger-600 mt-1">{{ error }}</p>

          <div class="flex justify-end mt-6">
            <ActionButton
              variant="primary"
              :disabled="!sourceKelasId || !targetTahunAjaranId || loading"
              @click="goToPreview"
            >
              {{ loading ? 'Memuat...' : 'Lanjut →' }}
            </ActionButton>
          </div>
        </template>
      </div>
    </div>

    <!-- Step 2: Preview Students -->
    <div
      v-if="currentStep === 2"
      class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden max-w-xl mx-auto"
    >
      <!-- Section Header -->
      <div class="px-6 py-5 bg-primary-50 border-b-2 border-primary-200">
        <h3 class="text-[16px] font-bold text-primary-800">Preview Siswa</h3>
        <p class="text-[13px] text-text-secondary mt-1">
          Centang siswa yang ingin <strong>dikecualikan</strong> dari kenaikan kelas (tidak naik
          kelas).
        </p>
      </div>

      <div class="p-6">
        <div
          v-if="isHighestGrade"
          class="p-4 bg-primary-50 border-2 border-primary-200 rounded-xs text-[15px] text-primary-700 mb-5"
        >
          Kelas ini adalah tingkat tertinggi. Siswa yang dipromosikan akan ditandai sebagai
          <strong>Lulus/Alumni</strong>.
        </div>

        <div class="flex gap-5 p-4 bg-surface-warm rounded-xs mb-5 text-[15px] text-text-secondary">
          <span
            >Total: <strong class="text-text-primary">{{ previewStudents.length }}</strong></span
          >
          <span
            >Naik: <strong class="text-text-primary">{{ selectedStudentCount }}</strong></span
          >
          <span
            >Dikecualikan:
            <strong class="text-text-primary">{{ excludedStudentIds.size }}</strong></span
          >
        </div>

        <div class="border-2 border-stone-200 rounded-xs overflow-hidden max-h-100 overflow-y-auto">
          <div
            v-for="student in previewStudents"
            :key="student.id"
            :class="[
              'px-5 py-4 border-b border-stone-200 last:border-b-0 transition-colors duration-200',
              excludedStudentIds.has(student.id) ? 'bg-danger-50' : 'hover:bg-primary-50',
            ]"
          >
            <label class="flex items-center gap-3 cursor-pointer text-[15px]">
              <input
                type="checkbox"
                :checked="excludedStudentIds.has(student.id)"
                class="rounded border-stone-300 text-primary-600 focus:ring-primary-500/20"
                @change="toggleExclude(student.id)"
              />
              <span class="flex-1 text-text-primary font-medium">{{ student.nama }}</span>
              <span v-if="student.nisn" class="text-[13px] text-text-tertiary font-mono">{{
                student.nisn
              }}</span>
            </label>
          </div>
          <div v-if="previewStudents.length === 0" class="py-12 text-center">
            <p class="text-[15px] text-text-tertiary">Tidak ada siswa aktif di kelas ini.</p>
          </div>
        </div>

        <p v-if="error" class="text-[13px] text-danger-600 mt-2">{{ error }}</p>

        <div class="flex justify-between mt-6">
          <ActionButton variant="neutral" @click="goBackToStep1">← Kembali</ActionButton>
          <ActionButton
            variant="primary"
            :disabled="selectedStudentCount === 0"
            @click="goToConfirmation"
          >
            Lanjut →
          </ActionButton>
        </div>
      </div>
    </div>

    <!-- Step 3: Confirm and Execute -->
    <div
      v-if="currentStep === 3"
      class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden max-w-xl mx-auto"
    >
      <!-- Section Header -->
      <div class="px-6 py-5 bg-primary-50 border-b-2 border-primary-200">
        <h3 class="text-[16px] font-bold text-primary-800">Konfirmasi Kenaikan Kelas</h3>
      </div>

      <div class="p-6">
        <div
          v-if="!executionResult"
          class="bg-surface-warm rounded-xs p-5 divide-y divide-stone-200"
        >
          <div class="flex justify-between py-3 text-[15px]">
            <span class="text-text-secondary">Kelas Asal:</span>
            <span class="font-semibold text-text-primary">{{ getSourceKelasName() }}</span>
          </div>
          <div class="flex justify-between py-3 text-[15px]">
            <span class="text-text-secondary">Kelas Tujuan:</span>
            <span class="font-semibold text-text-primary">{{ getTargetKelasName() }}</span>
          </div>
          <div class="flex justify-between py-3 text-[15px]">
            <span class="text-text-secondary">Tahun Ajaran Tujuan:</span>
            <span class="font-semibold text-text-primary">{{ getTargetTahunAjaranName() }}</span>
          </div>
          <div class="flex justify-between py-3 text-[15px]">
            <span class="text-text-secondary">Siswa Naik Kelas:</span>
            <span class="font-semibold text-text-primary">{{ selectedStudentCount }} siswa</span>
          </div>
          <div v-if="excludedStudentIds.size > 0" class="flex justify-between py-3 text-[15px]">
            <span class="text-text-secondary">Siswa Dikecualikan:</span>
            <span class="font-semibold text-text-primary">{{ excludedStudentIds.size }} siswa</span>
          </div>
          <div v-if="isHighestGrade" class="flex justify-between py-3 text-[15px]">
            <span class="text-text-secondary">Status Setelah Proses:</span>
            <span
              class="inline-flex items-center px-2.5 py-1 rounded-md text-[13px] font-semibold bg-primary-50 text-primary-700"
              >Lulus / Alumni</span
            >
          </div>
        </div>

        <!-- Success Result -->
        <div
          v-if="executionResult"
          class="text-center p-8 bg-success-50 border-2 border-success-600/20 rounded-sm"
        >
          <div
            class="w-14 h-14 rounded-full bg-success-600 text-white flex items-center justify-center text-2xl mx-auto mb-4"
          >
            ✓
          </div>
          <h3 class="text-[18px] font-bold text-success-700 mb-4">{{ successMessage }}</h3>
          <div class="space-y-2 mb-6">
            <p class="text-[15px] text-text-primary">
              Siswa naik kelas: <strong>{{ executionResult.promoted }}</strong>
            </p>
            <p v-if="executionResult.excluded > 0" class="text-[15px] text-text-primary">
              Siswa dikecualikan: <strong>{{ executionResult.excluded }}</strong>
            </p>
            <p v-if="executionResult.graduated > 0" class="text-[15px] text-text-primary">
              Siswa lulus/alumni: <strong>{{ executionResult.graduated }}</strong>
            </p>
          </div>
          <ActionButton variant="primary" @click="resetWizard">Proses Kelas Lain</ActionButton>
        </div>

        <p v-if="error" class="text-[13px] text-danger-600 mt-2">{{ error }}</p>

        <div v-if="!executionResult" class="flex justify-between mt-6">
          <ActionButton variant="neutral" @click="goBackToStep2">← Kembali</ActionButton>
          <ActionButton variant="success" :disabled="executing" @click="executePromotion">
            {{ executing ? 'Memproses...' : 'Proses Kenaikan Kelas' }}
          </ActionButton>
        </div>
      </div>
    </div>
  </div>
</template>
