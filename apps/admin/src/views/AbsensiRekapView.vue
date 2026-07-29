<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api/client';
import { PageHeader, SearchSelect, ActionButton } from '@/components/ui';
import type { SelectOption } from '@/components/ui';

interface Kelas {
  id: string;
  nama: string;
  tingkat: number;
}

interface RekapSiswa {
  siswaId: string;
  siswaNama: string;
  siswaNisn: string | null;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
  persentaseKehadiran: number | null;
}

interface RekapResponse {
  kelasId: string;
  kelasNama: string;
  bulan: number;
  tahun: number;
  totalHariEfektif: number | null;
  periode: 'bulanan' | 'semester';
  data: RekapSiswa[];
  hariEfektifSource?: 'manual' | 'otomatis' | null;
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
  const validEntries = rekapData.value.data.filter((s) => s.persentaseKehadiran !== null);
  if (validEntries.length === 0) return null;
  const sum = validEntries.reduce((acc, s) => acc + (s.persentaseKehadiran || 0), 0);
  return Math.round((sum / validEntries.length) * 100) / 100;
});

const periodeLabel = computed(() => {
  if (selectedPeriode.value === 'bulanan') {
    return `${BULAN_LABELS[selectedBulan.value - 1]} ${selectedTahun.value}`;
  }
  return `Semester ${selectedSemester.value} — ${selectedTahun.value}`;
});

// Select options
const kelasOptions = computed<SelectOption[]>(() =>
  kelasList.value.map((k) => ({ value: k.id, label: k.nama })),
);

const PERIODE_OPTIONS: SelectOption[] = [
  { value: 'bulanan', label: 'Bulanan' },
  { value: 'semester', label: 'Semester' },
];

const bulanOptions = computed<SelectOption[]>(() =>
  BULAN_LABELS.map((label, index) => ({ value: index + 1, label })),
);

const SEMESTER_OPTIONS: SelectOption[] = [
  { value: 1, label: 'Semester 1' },
  { value: 2, label: 'Semester 2' },
];

const tahunSelectOptions = computed<SelectOption[]>(() =>
  tahunOptions.value.map((t) => ({ value: t, label: String(t) })),
);

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
  } catch (err) {
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
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    errorMessage.value = error.response?.data?.message || 'Gagal mengexport laporan.';
  } finally {
    exporting.value = false;
  }
}

function getPercentageClass(value: number | null): string {
  if (value === null) return '';
  if (value >= 90) return 'text-success-700 font-bold';
  if (value >= 75) return 'text-warning-700 font-bold';
  return 'text-danger-700 font-bold';
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
  <div class="p-8 max-w-7xl mx-auto">
    <PageHeader title="Rekap Absensi">
      <template #actions>
        <ActionButton
          v-if="rekapData && rekapData.data.length > 0"
          variant="primary"
          icon="download"
          :disabled="exporting"
          @click="exportRekap"
        >
          {{ exporting ? 'Mengexport...' : 'Export' }}
        </ActionButton>
      </template>
    </PageHeader>

    <!-- Filter Bar -->
    <div class="flex flex-wrap items-center gap-4 mb-6">
      <div class="min-w-[200px]">
        <SearchSelect
          v-model="selectedKelasId"
          :options="kelasOptions"
          label="Kelas"
          placeholder="Pilih Kelas"
        />
      </div>

      <div class="min-w-[150px]">
        <SearchSelect
          v-model="selectedPeriode"
          :options="PERIODE_OPTIONS"
          label="Periode"
          :searchable="false"
        />
      </div>

      <div v-if="selectedPeriode === 'bulanan'" class="min-w-[160px]">
        <SearchSelect v-model="selectedBulan" :options="bulanOptions" label="Bulan" />
      </div>

      <div v-if="selectedPeriode === 'semester'" class="min-w-[160px]">
        <SearchSelect
          v-model="selectedSemester"
          :options="SEMESTER_OPTIONS"
          label="Semester"
          :searchable="false"
        />
      </div>

      <div class="min-w-[120px]">
        <SearchSelect
          v-model="selectedTahun"
          :options="tahunSelectOptions"
          label="Tahun"
          :searchable="false"
        />
      </div>
    </div>

    <!-- Error -->
    <div
      v-if="errorMessage"
      class="p-4 bg-danger-50 border-2 border-danger-500/20 rounded-xs text-[15px] text-danger-700 mb-4"
    >
      {{ errorMessage }}
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
      <p class="text-[15px] text-text-secondary mt-3">Memuat data rekap...</p>
    </div>

    <!-- Rekap Content -->
    <div v-else-if="rekapData">
      <!-- Info Bar -->
      <div class="flex flex-wrap gap-6 p-4 bg-surface-warm rounded-xs mb-5 text-[15px]">
        <div class="flex items-center gap-2">
          <span class="text-stone-500">Periode:</span>
          <span class="font-bold text-stone-800">{{ periodeLabel }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-stone-500">Total Hari Efektif:</span>
          <span class="font-bold text-stone-800">
            {{
              rekapData.totalHariEfektif !== null
                ? rekapData.totalHariEfektif + ' hari'
                : 'Belum tersedia'
            }}
          </span>
          <span v-if="rekapData.hariEfektifSource" class="text-[13px] text-stone-400">
            ({{ rekapData.hariEfektifSource === 'manual' ? 'input manual' : 'kalkulasi otomatis' }})
          </span>
        </div>
        <div v-if="averagePercentage !== null" class="flex items-center gap-2">
          <span class="text-stone-500">Rata-rata Kehadiran:</span>
          <span class="font-bold" :class="getPercentageClass(averagePercentage)">
            {{ averagePercentage }}%
          </span>
        </div>
      </div>

      <!-- Hari efektif warning -->
      <div
        v-if="rekapData.totalHariEfektif === null"
        class="p-4 bg-warning-50 border-2 border-warning-500/20 rounded-xs text-[15px] text-warning-700 mb-4"
      >
        ⚠️ Data hari efektif belum tersedia. Persentase kehadiran tidak dapat dihitung.
      </div>

      <!-- Rekap Table Card -->
      <div
        v-if="rekapData.data && rekapData.data.length > 0"
        class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden"
      >
        <!-- Section Header -->
        <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
          <h3 class="text-[16px] font-bold text-primary-800">Rekap Kehadiran</h3>
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
                  class="px-5 py-4 text-center font-bold text-[13px] uppercase tracking-[0.04em] bg-surface-warm w-[70px] text-success-700"
                >
                  Hadir
                </th>
                <th
                  class="px-5 py-4 text-center font-bold text-[13px] uppercase tracking-[0.04em] bg-surface-warm w-[70px] text-warning-700"
                >
                  Izin
                </th>
                <th
                  class="px-5 py-4 text-center font-bold text-[13px] uppercase tracking-[0.04em] bg-surface-warm w-[70px] text-primary-700"
                >
                  Sakit
                </th>
                <th
                  class="px-5 py-4 text-center font-bold text-[13px] uppercase tracking-[0.04em] bg-surface-warm w-[70px] text-danger-700"
                >
                  Alpa
                </th>
                <th
                  class="px-5 py-4 text-center font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm w-[110px]"
                >
                  % Kehadiran
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-200">
              <tr
                v-for="(siswa, index) in rekapData.data"
                :key="siswa.siswaId"
                class="hover:bg-primary-50 transition-colors"
              >
                <td class="px-5 py-4 text-[15px] text-center text-stone-600">{{ index + 1 }}</td>
                <td class="px-5 py-4 text-[15px] text-stone-800 font-medium">
                  {{ siswa.siswaNama }}
                </td>
                <td class="px-5 py-4 text-[15px] text-stone-500">{{ siswa.siswaNisn || '-' }}</td>
                <td class="px-5 py-4 text-[15px] text-center">{{ siswa.hadir }}</td>
                <td class="px-5 py-4 text-[15px] text-center">{{ siswa.izin }}</td>
                <td class="px-5 py-4 text-[15px] text-center">{{ siswa.sakit }}</td>
                <td class="px-5 py-4 text-[15px] text-center">{{ siswa.alpa }}</td>
                <td
                  class="px-5 py-4 text-[15px] text-center"
                  :class="getPercentageClass(siswa.persentaseKehadiran)"
                >
                  {{ siswa.persentaseKehadiran !== null ? siswa.persentaseKehadiran + '%' : '-' }}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="bg-surface-warm border-t-2 border-stone-200 font-bold">
                <td colspan="3" class="px-5 py-4 text-[15px] text-stone-800">Total</td>
                <td class="px-5 py-4 text-[15px] text-center">{{ totals.hadir }}</td>
                <td class="px-5 py-4 text-[15px] text-center">{{ totals.izin }}</td>
                <td class="px-5 py-4 text-[15px] text-center">{{ totals.sakit }}</td>
                <td class="px-5 py-4 text-[15px] text-center">{{ totals.alpa }}</td>
                <td class="px-5 py-4 text-[15px] text-center">
                  <span
                    v-if="averagePercentage !== null"
                    :class="getPercentageClass(averagePercentage)"
                    >{{ averagePercentage }}%</span
                  >
                  <span v-else>-</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div v-else class="text-center text-text-secondary py-12 text-[15px]">
        Tidak ada data absensi untuk periode yang dipilih.
      </div>
    </div>

    <!-- Initial empty state -->
    <div v-else-if="!selectedKelasId" class="text-center text-text-secondary py-12 text-[15px]">
      Pilih kelas untuk melihat rekap absensi.
    </div>
  </div>
</template>
