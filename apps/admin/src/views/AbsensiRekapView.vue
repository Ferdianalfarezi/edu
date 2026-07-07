<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api/client';
import { PageHeader } from '@/components/ui';

interface Kelas {
  id: string;
  nama: string;
  tingkat: number;
}

interface RekapSiswa {
  siswa_id: string;
  siswa_nama: string;
  siswa_nisn: string | null;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
  persentase_kehadiran: number | null;
}

interface RekapResponse {
  kelas_id: string;
  kelas_nama: string;
  bulan: number;
  tahun: number;
  total_hari_efektif: number | null;
  periode: 'bulanan' | 'semester';
  data: RekapSiswa[];
  hari_efektif_source?: 'manual' | 'otomatis' | null;
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
  const validEntries = rekapData.value.data.filter((s) => s.persentase_kehadiran !== null);
  if (validEntries.length === 0) return null;
  const sum = validEntries.reduce((acc, s) => acc + (s.persentase_kehadiran || 0), 0);
  return Math.round((sum / validEntries.length) * 100) / 100;
});

const periodeLabel = computed(() => {
  if (selectedPeriode.value === 'bulanan') {
    return `${BULAN_LABELS[selectedBulan.value - 1]} ${selectedTahun.value}`;
  }
  return `Semester ${selectedSemester.value} — ${selectedTahun.value}`;
});

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
  } catch (err: unknown) {
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
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } };
    errorMessage.value = error.response?.data?.message || 'Gagal mengexport laporan.';
  } finally {
    exporting.value = false;
  }
}

function getPercentageClass(value: number | null): string {
  if (value === null) return '';
  if (value >= 90) return 'text-success-700';
  if (value >= 75) return 'text-warning-700';
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
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader title="Rekap Absensi">
      <template #actions>
        <button
          v-if="rekapData && rekapData.data.length > 0"
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="exporting"
          @click="exportRekap"
        >
          {{ exporting ? 'Mengexport...' : '📥 Export' }}
        </button>
      </template>
    </PageHeader>

    <!-- Filter Bar -->
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <div class="flex items-center gap-2">
        <label class="text-sm font-medium text-text-primary">Kelas:</label>
        <select
          v-model="selectedKelasId"
          class="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 max-w-xs min-w-[180px]"
        >
          <option value="" disabled>Pilih Kelas</option>
          <option v-for="kelas in kelasList" :key="kelas.id" :value="kelas.id">
            {{ kelas.nama }}
          </option>
        </select>
      </div>

      <div class="flex items-center gap-2">
        <label class="text-sm font-medium text-text-primary">Periode:</label>
        <select
          v-model="selectedPeriode"
          class="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        >
          <option value="bulanan">Bulanan</option>
          <option value="semester">Semester</option>
        </select>
      </div>

      <div v-if="selectedPeriode === 'bulanan'" class="flex items-center gap-2">
        <label class="text-sm font-medium text-text-primary">Bulan:</label>
        <select
          v-model="selectedBulan"
          class="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        >
          <option v-for="(label, index) in BULAN_LABELS" :key="index" :value="index + 1">
            {{ label }}
          </option>
        </select>
      </div>

      <div v-if="selectedPeriode === 'semester'" class="flex items-center gap-2">
        <label class="text-sm font-medium text-text-primary">Semester:</label>
        <select
          v-model="selectedSemester"
          class="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        >
          <option :value="1">Semester 1</option>
          <option :value="2">Semester 2</option>
        </select>
      </div>

      <div class="flex items-center gap-2">
        <label class="text-sm font-medium text-text-primary">Tahun:</label>
        <select
          v-model="selectedTahun"
          class="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        >
          <option v-for="tahun in tahunOptions" :key="tahun" :value="tahun">
            {{ tahun }}
          </option>
        </select>
      </div>
    </div>

    <!-- Error -->
    <div
      v-if="errorMessage"
      class="p-3 bg-danger-50 border border-danger-500/20 rounded-lg text-sm text-danger-700 mb-4"
    >
      {{ errorMessage }}
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
      <p class="text-sm text-text-secondary mt-2">Memuat data rekap...</p>
    </div>

    <!-- Rekap Content -->
    <div v-else-if="rekapData">
      <!-- Info Bar -->
      <div class="flex flex-wrap gap-6 p-3 bg-surface-50 rounded-lg mb-4 text-sm">
        <div class="flex items-center gap-1.5">
          <span class="text-text-secondary">Periode:</span>
          <span class="font-semibold text-text-primary">{{ periodeLabel }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-text-secondary">Total Hari Efektif:</span>
          <span class="font-semibold text-text-primary">
            {{
              rekapData.total_hari_efektif !== null
                ? rekapData.total_hari_efektif + ' hari'
                : 'Belum tersedia'
            }}
          </span>
          <span v-if="rekapData.hari_efektif_source" class="text-xs text-text-tertiary">
            ({{
              rekapData.hari_efektif_source === 'manual' ? 'input manual' : 'kalkulasi otomatis'
            }})
          </span>
        </div>
        <div v-if="averagePercentage !== null" class="flex items-center gap-1.5">
          <span class="text-text-secondary">Rata-rata Kehadiran:</span>
          <span class="font-semibold" :class="getPercentageClass(averagePercentage)">
            {{ averagePercentage }}%
          </span>
        </div>
      </div>

      <!-- Hari efektif warning -->
      <div
        v-if="rekapData.total_hari_efektif === null"
        class="p-3 bg-warning-50 border border-warning-500/20 rounded-lg text-sm text-warning-700 mb-4"
      >
        ⚠️ Data hari efektif belum tersedia. Persentase kehadiran tidak dapat dihitung.
      </div>

      <!-- Rekap Table -->
      <div
        v-if="rekapData.data.length > 0"
        class="bg-white border border-border rounded-xl overflow-hidden"
      >
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
                <th class="px-4 py-3 text-center font-medium text-xs w-[70px] text-success-700">
                  Hadir
                </th>
                <th class="px-4 py-3 text-center font-medium text-xs w-[70px] text-warning-700">
                  Izin
                </th>
                <th class="px-4 py-3 text-center font-medium text-xs w-[70px] text-primary-700">
                  Sakit
                </th>
                <th class="px-4 py-3 text-center font-medium text-xs w-[70px] text-danger-700">
                  Alpa
                </th>
                <th class="px-4 py-3 text-center font-medium text-text-secondary text-xs w-[110px]">
                  % Kehadiran
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="(siswa, index) in rekapData.data"
                :key="siswa.siswa_id"
                class="hover:bg-surface-50 transition-colors"
              >
                <td class="px-4 py-3 text-sm text-center">{{ index + 1 }}</td>
                <td class="px-4 py-3 text-sm text-text-primary">{{ siswa.siswa_nama }}</td>
                <td class="px-4 py-3 text-sm text-text-secondary">{{ siswa.siswa_nisn || '-' }}</td>
                <td class="px-4 py-3 text-sm text-center">{{ siswa.hadir }}</td>
                <td class="px-4 py-3 text-sm text-center">{{ siswa.izin }}</td>
                <td class="px-4 py-3 text-sm text-center">{{ siswa.sakit }}</td>
                <td class="px-4 py-3 text-sm text-center">{{ siswa.alpa }}</td>
                <td
                  class="px-4 py-3 text-sm text-center font-medium"
                  :class="getPercentageClass(siswa.persentase_kehadiran)"
                >
                  {{ siswa.persentase_kehadiran !== null ? siswa.persentase_kehadiran + '%' : '-' }}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="bg-surface-50 border-t-2 border-border font-semibold">
                <td colspan="3" class="px-4 py-3 text-sm">Total</td>
                <td class="px-4 py-3 text-sm text-center">{{ totals.hadir }}</td>
                <td class="px-4 py-3 text-sm text-center">{{ totals.izin }}</td>
                <td class="px-4 py-3 text-sm text-center">{{ totals.sakit }}</td>
                <td class="px-4 py-3 text-sm text-center">{{ totals.alpa }}</td>
                <td class="px-4 py-3 text-sm text-center">
                  <span v-if="averagePercentage !== null">{{ averagePercentage }}%</span>
                  <span v-else>-</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div v-else class="text-center text-text-secondary py-8 text-sm">
        Tidak ada data absensi untuk periode yang dipilih.
      </div>
    </div>

    <!-- Initial empty state -->
    <div v-else-if="!selectedKelasId" class="text-center text-text-secondary py-8 text-sm">
      Pilih kelas untuk melihat rekap absensi.
    </div>
  </div>
</template>
