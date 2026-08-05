<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { Role } from '@edu/shared';
import { PageHeader, SearchSelect, ActionButton } from '@/components/ui';
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
  siswaId: string;
  status: 'hadir' | 'izin' | 'sakit' | 'alpa' | '';
}

interface ExistingAbsensi {
  id: string;
  siswaId: string;
  status: 'hadir' | 'izin' | 'sakit' | 'alpa';
  guruId: string;
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
const STATUS_ICONS: Record<string, string> = {
  hadir: '✓',
  izin: '📋',
  sakit: '🏥',
  alpa: '✗',
};

// Responsive breakpoint detection
const isMobile = ref(false);
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
};
onMounted(() => {
  checkMobile();
  window.addEventListener('resize', checkMobile);
});
onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
});

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
      const siswa = siswaList.value.find((s) => s.id === r.siswaId);
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
      isReadOnly?: boolean;
      holidayWarning?: string;
    }>('/absensi', {
      params: { kelas_id: selectedKelasId.value, tanggal: selectedTanggal.value },
    });

    existingAbsensi.value = absensiData.data || [];
    isReadOnly.value = absensiData.isReadOnly || false;
    holidayWarning.value = absensiData.holidayWarning || '';

    records.value = siswaList.value.map((siswa) => {
      const existing = existingAbsensi.value.find((a) => a.siswaId === siswa.id);
      return {
        siswaId: siswa.id,
        status: existing?.status || '',
      };
    });
  } catch (err) {
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
        siswa_id: r.siswaId,
        status: r.status,
      })),
    });
    successMessage.value = 'Absensi berhasil disimpan!';
    isReadOnly.value = true;
  } catch (err) {
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
  <div class="p-4 md:p-8 max-w-7xl mx-auto">
    <PageHeader title="Input Absensi" />

    <!-- Filter Bar - Mobile optimized -->
    <div
      class="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4 mb-6"
    >
      <div class="flex flex-col sm:flex-row sm:items-center gap-2">
        <label class="text-[14px] sm:text-[15px] font-semibold text-stone-700">Tanggal:</label>
        <input
          v-model="selectedTanggal"
          type="date"
          class="w-full sm:w-auto px-4 py-3 sm:py-2.5 text-[16px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 min-w-[160px]"
        />
      </div>
      <div class="flex flex-col sm:flex-row sm:items-center gap-2">
        <label class="text-[14px] sm:text-[15px] font-semibold text-stone-700">Kelas:</label>
        <SearchSelect
          v-model="selectedKelasId"
          :options="kelasSelectOptions"
          placeholder="Pilih Kelas"
          class="w-full sm:w-auto sm:min-w-[200px] sm:max-w-xs"
        />
      </div>
    </div>

    <!-- Holiday Warning -->
    <div
      v-if="holidayWarning"
      class="p-3 sm:p-4 bg-warning-50 border-2 border-warning-500/20 rounded-xs text-[14px] sm:text-[15px] text-warning-700 mb-4"
    >
      ⚠️ {{ holidayWarning }}
    </div>

    <!-- Read-only Notice -->
    <div
      v-if="isReadOnly && existingAbsensi.length > 0"
      class="p-3 sm:p-4 bg-primary-50 border-2 border-primary-500/20 rounded-xs text-[14px] sm:text-[15px] text-primary-700 mb-4"
    >
      ℹ️ Absensi sudah diinput. Data ditampilkan dalam mode read-only.
    </div>

    <!-- Messages -->
    <div
      v-if="successMessage"
      class="p-3 sm:p-4 bg-success-50 border-2 border-success-500/20 rounded-xs text-[14px] sm:text-[15px] text-success-700 mb-4"
    >
      ✅ {{ successMessage }}
    </div>
    <div
      v-if="errorMessage"
      class="p-3 sm:p-4 bg-danger-50 border-2 border-danger-500/20 rounded-xs text-[14px] sm:text-[15px] text-danger-700 mb-4"
    >
      ❌ {{ errorMessage }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12">
      <svg class="w-7 h-7 animate-spin text-primary-500 mx-auto" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p class="text-[15px] text-text-secondary mt-3">Memuat data siswa...</p>
    </div>

    <!-- Student List -->
    <div v-else-if="siswaList.length > 0 && selectedKelasId">
      <!-- Quick Actions -->
      <div v-if="!isReadOnly" class="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
        <span class="text-[14px] sm:text-[15px] font-semibold text-stone-700 w-full sm:w-auto"
          >Set Semua:</span
        >
        <div class="flex flex-wrap gap-2">
          <button
            v-for="status in STATUS_OPTIONS"
            :key="status"
            class="px-3 py-2 sm:py-1.5 text-[13px] font-semibold rounded-xs border-2 border-stone-200 transition-colors hover:opacity-80 active:scale-95"
            :style="{ background: STATUS_COLORS[status] }"
            @click="setAllStatus(status)"
          >
            {{ STATUS_LABELS[status] }}
          </button>
        </div>
      </div>

      <!-- Summary - Compact on mobile -->
      <div
        class="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:gap-5 p-3 sm:p-4 bg-surface-warm rounded-xs mb-5 text-[13px] text-text-secondary"
      >
        <span
          v-for="(count, status) in statusSummary"
          :key="status"
          class="inline-flex items-center gap-1.5"
        >
          <span
            class="w-3 h-3 rounded-full inline-block flex-shrink-0"
            :style="{ background: STATUS_COLORS[status] }"
          ></span>
          {{ STATUS_LABELS[status] }}: <span class="font-semibold">{{ count }}</span>
        </span>
        <span
          class="font-bold text-stone-800 col-span-2 sm:col-span-1 text-center sm:text-left pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-200"
        >
          Total: {{ records.length }}
        </span>
      </div>

      <!-- ===== MOBILE VIEW: Card-based layout ===== -->
      <div v-if="isMobile" class="space-y-3">
        <!-- Section Header -->
        <div
          class="bg-primary-50 px-4 py-3 rounded-t-[12px] border-2 border-primary-200 border-b-0"
        >
          <h3 class="text-[15px] font-bold text-primary-800">Daftar Siswa</h3>
        </div>

        <!-- Student Cards -->
        <div
          v-for="(record, index) in records"
          :key="record.siswaId"
          class="bg-white rounded-[12px] border-2 border-stone-200 shadow-xs overflow-hidden"
        >
          <!-- Card Header -->
          <div class="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
            <div class="flex items-center gap-3 min-w-0">
              <span
                class="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[13px] font-bold flex-shrink-0"
              >
                {{ index + 1 }}
              </span>
              <div class="min-w-0">
                <p class="text-[15px] font-semibold text-stone-800 truncate">
                  {{ getSiswaName(record.siswaId) }}
                </p>
                <p class="text-[12px] text-stone-500">NISN: {{ getSiswaNisn(record.siswaId) }}</p>
              </div>
            </div>
            <!-- Current status badge -->
            <span
              v-if="record.status"
              class="px-2.5 py-1 rounded-full text-[11px] font-bold flex-shrink-0"
              :style="{ background: STATUS_COLORS[record.status] }"
            >
              {{ STATUS_ICONS[record.status] }} {{ STATUS_LABELS[record.status] }}
            </span>
          </div>

          <!-- Status Buttons - Full width tap targets -->
          <div class="grid grid-cols-4 gap-0">
            <button
              v-for="status in STATUS_OPTIONS"
              :key="status"
              :disabled="isReadOnly"
              class="py-4 text-center transition-all active:scale-95 border-r border-stone-100 last:border-r-0"
              :class="{
                'font-bold': record.status === status,
                'opacity-50': isReadOnly,
              }"
              :style="
                record.status === status
                  ? { background: STATUS_COLORS[status] }
                  : { background: '#ffffff' }
              "
              @click="!isReadOnly && (record.status = status)"
            >
              <span class="block text-[18px] mb-0.5">{{ STATUS_ICONS[status] }}</span>
              <span class="block text-[11px] font-semibold text-stone-700">{{
                STATUS_LABELS[status]
              }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- ===== DESKTOP VIEW: Table layout ===== -->
      <div
        v-else
        class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden"
      >
        <!-- Section Header -->
        <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
          <h3 class="text-[16px] font-bold text-primary-800">Daftar Siswa</h3>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="border-b-2 border-stone-200">
              <tr>
                <th
                  class="px-5 py-4 font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm w-[50px] text-center"
                >
                  No
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
                >
                  Nama Siswa
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm w-[120px]"
                >
                  NISN
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm w-[360px]"
                >
                  Status Kehadiran
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-200">
              <tr
                v-for="(record, index) in records"
                :key="record.siswaId"
                class="hover:bg-primary-50 transition-colors"
              >
                <td class="px-5 py-4 text-[15px] text-center text-stone-600">{{ index + 1 }}</td>
                <td class="px-5 py-4 text-[15px] text-stone-800 font-medium">
                  {{ getSiswaName(record.siswaId) }}
                </td>
                <td class="px-5 py-4 text-[15px] text-stone-500">
                  {{ getSiswaNisn(record.siswaId) }}
                </td>
                <td class="px-5 py-4">
                  <div class="flex gap-2">
                    <label
                      v-for="status in STATUS_OPTIONS"
                      :key="status"
                      class="inline-flex items-center px-3 py-1.5 rounded-xs text-[13px] font-semibold border-2 cursor-pointer transition-colors"
                      :class="{
                        'border-transparent font-bold': record.status === status,
                        'border-stone-200 hover:border-stone-400':
                          record.status !== status && !isReadOnly,
                        'opacity-70 cursor-default': isReadOnly,
                      }"
                      :style="record.status === status ? { background: STATUS_COLORS[status] } : {}"
                    >
                      <input
                        v-model="record.status"
                        type="radio"
                        :name="`status-${record.siswaId}`"
                        :value="status"
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

      <!-- Submit - Mobile optimized sticky footer -->
      <div
        v-if="!isReadOnly"
        class="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mt-6 pt-5 border-t-2 border-stone-200"
      >
        <div
          v-if="unfilledStudents.length > 0"
          class="p-3 sm:p-4 bg-warning-50 border-2 border-warning-500/20 rounded-xs text-[14px] sm:text-[15px] text-warning-700"
        >
          ⚠️ {{ unfilledStudents.length }} siswa belum diisi
        </div>
        <div v-else class="hidden sm:block"></div>
        <ActionButton
          variant="primary"
          icon="check"
          :disabled="!allFilled || submitting"
          class="w-full sm:w-auto py-4 sm:py-2 text-[16px] sm:text-[14px]"
          @click="submitAbsensi"
        >
          {{ submitting ? 'Menyimpan...' : 'Simpan Absensi' }}
        </ActionButton>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="selectedKelasId && !loading"
      class="text-center text-text-secondary py-12 text-[15px]"
    >
      Tidak ada siswa aktif di kelas ini.
    </div>

    <div v-else-if="!selectedKelasId" class="text-center text-text-secondary py-12 text-[15px]">
      <template v-if="isGuru && kelasList.length === 0">
        Tidak ada kelas terjadwal untuk hari ini.
      </template>
      <template v-else> Pilih kelas untuk memulai input absensi. </template>
    </div>
  </div>
</template>
