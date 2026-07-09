<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { Role } from '@edu/shared';
import { PageHeader, SearchSelect } from '@/components/ui';
import type { SelectOption } from '@/components/ui';

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

const kelasSelectOptions = computed<SelectOption[]>(() =>
  kelasList.value.map((k) => ({ value: k.id, label: k.nama })),
);

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
      const { data } = await api.get<{ data: Kelas[] }>('/absensi/kelas-hari-ini', {
        params: { tanggal: selectedTanggal.value },
      });
      kelasList.value = data.data || (data as unknown as Kelas[]);
    } else {
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
    const { data: siswaData } = await api.get<{ data: Siswa[] }>('/siswa', {
      params: { kelas_id: selectedKelasId.value, status: 'aktif' },
    });
    siswaList.value = siswaData.data;

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
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader title="Input Absensi" />

    <!-- Filter Bar -->
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <div class="flex items-center gap-2">
        <label class="text-sm font-medium text-text-primary">Tanggal:</label>
        <input
          v-model="selectedTanggal"
          type="date"
          class="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 min-w-[160px]"
        />
      </div>
      <div class="flex items-center gap-2">
        <label class="text-sm font-medium text-text-primary">Kelas:</label>
        <SearchSelect
          v-model="selectedKelasId"
          :options="kelasSelectOptions"
          placeholder="Pilih Kelas"
          class="min-w-[200px] max-w-xs"
        />
      </div>
    </div>

    <!-- Holiday Warning -->
    <div
      v-if="holidayWarning"
      class="p-3 bg-warning-50 border border-warning-500/20 rounded-lg text-sm text-warning-700 mb-4"
    >
      ⚠️ {{ holidayWarning }}
    </div>

    <!-- Read-only Notice -->
    <div
      v-if="isReadOnly && existingAbsensi.length > 0"
      class="p-3 bg-primary-50 border border-primary-500/20 rounded-lg text-sm text-primary-700 mb-4"
    >
      ℹ️ Absensi sudah diinput. Data ditampilkan dalam mode read-only.
    </div>

    <!-- Messages -->
    <div
      v-if="successMessage"
      class="p-3 bg-success-50 border border-success-500/20 rounded-lg text-sm text-success-700 mb-4"
    >
      ✅ {{ successMessage }}
    </div>
    <div
      v-if="errorMessage"
      class="p-3 bg-danger-50 border border-danger-500/20 rounded-lg text-sm text-danger-700 mb-4"
    >
      ❌ {{ errorMessage }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-8">
      <svg class="w-6 h-6 animate-spin text-primary-500 mx-auto" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p class="text-sm text-text-secondary mt-2">Memuat data siswa...</p>
    </div>

    <!-- Student List -->
    <div v-else-if="siswaList.length > 0 && selectedKelasId">
      <!-- Quick Actions -->
      <div v-if="!isReadOnly" class="flex items-center gap-2 mb-3">
        <span class="text-sm font-medium text-text-primary">Set Semua:</span>
        <button
          v-for="status in STATUS_OPTIONS"
          :key="status"
          class="px-2.5 py-1 text-xs font-medium rounded-md border border-border transition-colors hover:opacity-80"
          :style="{ background: STATUS_COLORS[status] }"
          @click="setAllStatus(status)"
        >
          {{ STATUS_LABELS[status] }}
        </button>
      </div>

      <!-- Summary -->
      <div
        class="flex flex-wrap gap-4 p-3 bg-surface-50 rounded-lg mb-4 text-xs text-text-secondary"
      >
        <span
          class="inline-flex items-center gap-1.5"
          v-for="(count, status) in statusSummary"
          :key="status"
        >
          <span
            class="w-2.5 h-2.5 rounded-full inline-block"
            :style="{ background: STATUS_COLORS[status] }"
          ></span>
          {{ STATUS_LABELS[status] }}: {{ count }}
        </span>
        <span class="font-semibold text-text-primary">Total: {{ records.length }}</span>
      </div>

      <!-- Student Table -->
      <div class="bg-white border border-border rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="border-b border-border bg-surface-50">
              <tr>
                <th class="px-4 py-3 font-medium text-text-secondary text-xs w-[50px] text-center">
                  No
                </th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                  Nama Siswa
                </th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs w-[120px]">
                  NISN
                </th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs w-[360px]">
                  Status Kehadiran
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="(record, index) in records"
                :key="record.siswa_id"
                class="hover:bg-surface-50 transition-colors"
              >
                <td class="px-4 py-3 text-sm text-center">{{ index + 1 }}</td>
                <td class="px-4 py-3 text-sm text-text-primary">
                  {{ getSiswaName(record.siswa_id) }}
                </td>
                <td class="px-4 py-3 text-sm text-text-secondary">
                  {{ getSiswaNisn(record.siswa_id) }}
                </td>
                <td class="px-4 py-3">
                  <div class="flex gap-1.5">
                    <label
                      v-for="status in STATUS_OPTIONS"
                      :key="status"
                      class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer transition-colors"
                      :class="{
                        'border-transparent font-semibold': record.status === status,
                        'border-border hover:border-text-secondary':
                          record.status !== status && !isReadOnly,
                        'opacity-70 cursor-default': isReadOnly,
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
      </div>

      <!-- Submit -->
      <div
        v-if="!isReadOnly"
        class="flex justify-between items-center mt-4 pt-4 border-t border-border"
      >
        <div
          v-if="unfilledStudents.length > 0"
          class="p-3 bg-warning-50 border border-warning-500/20 rounded-lg text-sm text-warning-700"
        >
          ⚠️ {{ unfilledStudents.length }} siswa belum diisi
        </div>
        <div v-else></div>
        <button
          class="px-4 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!allFilled || submitting"
          @click="submitAbsensi"
        >
          {{ submitting ? 'Menyimpan...' : 'Simpan Absensi' }}
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="selectedKelasId && !loading"
      class="text-center text-text-secondary py-8 text-sm"
    >
      Tidak ada siswa aktif di kelas ini.
    </div>

    <div v-else-if="!selectedKelasId" class="text-center text-text-secondary py-8 text-sm">
      <template v-if="isGuru && kelasList.length === 0">
        Tidak ada kelas terjadwal untuk hari ini.
      </template>
      <template v-else> Pilih kelas untuk memulai input absensi. </template>
    </div>
  </div>
</template>
