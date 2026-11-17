<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
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
  hariEfektifSource?: 'manual' | 'otomatis' | 'campuran' | null;
  tanggalMulai: string;
  tanggalSelesai: string;
  semester: number | null;
  tahunAjaranNama: string | null;
}

interface TahunAjaran {
  status: string;
  semester2Mulai: string;
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

const STATUS_COLORS: Record<string, string> = {
  hadir: '#dcfce7',
  izin: '#fef3c7',
  sakit: '#e0e7ff',
  alpa: '#fee2e2',
};

// Helper to get status color (avoids template accessing const directly)
function getStatusColor(status: string): string {
  return STATUS_COLORS[status] || '#ffffff';
}

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

/** Semester yang sedang berjalan menurut tanggal di Tahun Ajaran aktif (menu Tahun Ajaran). */
async function pilihSemesterBerjalan() {
  try {
    const { data } = await api.get<TahunAjaran[]>('/tahun-ajaran');
    const aktif = data.find((t) => t.status === 'aktif');
    if (aktif) {
      const hariIni = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD waktu lokal
      selectedSemester.value = hariIni >= aktif.semester2Mulai ? 2 : 1;
    }
  } catch {
    // biarkan default Semester 1
  }
}

function formatTanggal(t: string): string {
  return new Date(`${t}T00:00:00`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

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
  const r = rekapData.value;
  if (r?.semester && r.tahunAjaranNama) {
    return `Semester ${r.semester} TA ${r.tahunAjaranNama} (${formatTanggal(r.tanggalMulai)} – ${formatTanggal(r.tanggalSelesai)})`;
  }
  return `Semester ${selectedSemester.value}`;
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
      periode: selectedPeriode.value,
    };

    // Semester: tanggalnya diambil dari tahun ajaran kelas, jadi tidak perlu tahun
    if (selectedPeriode.value === 'bulanan') {
      params.bulan = selectedBulan.value;
      params.tahun = selectedTahun.value;
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
      periode: selectedPeriode.value,
    };

    // Semester: tanggalnya diambil dari tahun ajaran kelas, jadi tidak perlu tahun
    if (selectedPeriode.value === 'bulanan') {
      params.bulan = selectedBulan.value;
      params.tahun = selectedTahun.value;
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
        : `rekap-absensi-semester-${selectedSemester.value}-${(rekapData.value?.tahunAjaranNama ?? '').replace('/', '-')}.xlsx`;

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
  pilihSemesterBerjalan();
});
</script>

<template>
  <div class="p-4 md:p-8 max-w-7xl mx-auto">
    <PageHeader title="Rekap Absensi">
      <template #actions>
        <ActionButton
          v-if="rekapData && rekapData.data.length > 0"
          variant="primary"
          icon="download"
          :disabled="exporting"
          class="w-full sm:w-auto"
          @click="exportRekap"
        >
          {{ exporting ? 'Mengexport...' : 'Export' }}
        </ActionButton>
      </template>
    </PageHeader>

    <!-- Filter Bar - Mobile optimized -->
    <div
      class="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-stretch lg:items-center gap-3 sm:gap-4 mb-6"
    >
      <div class="sm:min-w-[200px]">
        <SearchSelect
          v-model="selectedKelasId"
          :options="kelasOptions"
          label="Kelas"
          placeholder="Pilih Kelas"
        />
      </div>

      <div class="sm:min-w-[150px]">
        <SearchSelect
          v-model="selectedPeriode"
          :options="PERIODE_OPTIONS"
          label="Periode"
          :searchable="false"
        />
      </div>

      <div v-if="selectedPeriode === 'bulanan'" class="sm:min-w-[160px]">
        <SearchSelect v-model="selectedBulan" :options="bulanOptions" label="Bulan" />
      </div>

      <div v-if="selectedPeriode === 'semester'" class="sm:min-w-[160px]">
        <SearchSelect
          v-model="selectedSemester"
          :options="SEMESTER_OPTIONS"
          label="Semester"
          :searchable="false"
        />
      </div>

      <div v-if="selectedPeriode === 'bulanan'" class="sm:min-w-[120px]">
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
      class="p-3 sm:p-4 bg-danger-50 border-2 border-danger-500/20 rounded-xs text-[14px] sm:text-[15px] text-danger-700 mb-4"
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
      <!-- Info Bar - Mobile optimized -->
      <div
        class="grid grid-cols-1 sm:flex sm:flex-wrap gap-3 sm:gap-6 p-3 sm:p-4 bg-surface-warm rounded-xs mb-5 text-[14px] sm:text-[15px]"
      >
        <div class="flex items-center gap-2">
          <span class="text-stone-500">Periode:</span>
          <span class="font-bold text-stone-800">{{ periodeLabel }}</span>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-stone-500">Hari Efektif:</span>
          <span class="font-bold text-stone-800">
            {{
              rekapData.totalHariEfektif !== null
                ? rekapData.totalHariEfektif + ' hari'
                : 'Belum tersedia'
            }}
          </span>
          <span
            v-if="rekapData.hariEfektifSource"
            class="text-[12px] sm:text-[13px] text-stone-400"
          >
            ({{ rekapData.hariEfektifSource }})
          </span>
        </div>
        <div v-if="averagePercentage !== null" class="flex items-center gap-2">
          <span class="text-stone-500">Rata-rata:</span>
          <span class="font-bold" :class="getPercentageClass(averagePercentage)">
            {{ averagePercentage }}%
          </span>
        </div>
      </div>

      <!-- Hari efektif warning -->
      <div
        v-if="rekapData.totalHariEfektif === null"
        class="p-3 sm:p-4 bg-warning-50 border-2 border-warning-500/20 rounded-xs text-[14px] sm:text-[15px] text-warning-700 mb-4"
      >
        ⚠️ Data hari efektif belum tersedia. Persentase kehadiran tidak dapat dihitung.
      </div>

      <!-- ===== MOBILE VIEW: Card-based layout ===== -->
      <div v-if="rekapData.data && rekapData.data.length > 0 && isMobile" class="space-y-3">
        <!-- Section Header -->
        <div
          class="bg-primary-50 px-4 py-3 rounded-t-[12px] border-2 border-primary-200 border-b-0"
        >
          <h3 class="text-[15px] font-bold text-primary-800">Rekap Kehadiran</h3>
        </div>

        <!-- Student Cards -->
        <div
          v-for="(siswa, index) in rekapData.data"
          :key="siswa.siswaId"
          class="bg-white rounded-[12px] border-2 border-stone-200 shadow-xs overflow-hidden"
        >
          <!-- Card Header -->
          <div class="px-4 py-3 border-b border-stone-100">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3 min-w-0">
                <span
                  class="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                >
                  {{ index + 1 }}
                </span>
                <div class="min-w-0">
                  <p class="text-[15px] font-semibold text-stone-800 truncate">
                    {{ siswa.siswaNama }}
                  </p>
                  <p class="text-[12px] text-stone-500">NISN: {{ siswa.siswaNisn || '-' }}</p>
                </div>
              </div>
              <!-- Percentage badge -->
              <span
                class="px-2.5 py-1 rounded-full text-[12px] font-bold flex-shrink-0"
                :class="getPercentageClass(siswa.persentaseKehadiran)"
                :style="{
                  background:
                    siswa.persentaseKehadiran !== null && siswa.persentaseKehadiran >= 90
                      ? '#dcfce7'
                      : siswa.persentaseKehadiran !== null && siswa.persentaseKehadiran >= 75
                        ? '#fef3c7'
                        : '#fee2e2',
                }"
              >
                {{ siswa.persentaseKehadiran !== null ? siswa.persentaseKehadiran + '%' : '-' }}
              </span>
            </div>
          </div>

          <!-- Status Grid -->
          <div class="grid grid-cols-4 gap-0">
            <div
              class="py-3 text-center border-r border-stone-100"
              :style="{ background: getStatusColor('hadir') }"
            >
              <span class="block text-[16px] font-bold text-success-700">{{ siswa.hadir }}</span>
              <span class="block text-[10px] font-semibold text-stone-600">Hadir</span>
            </div>
            <div
              class="py-3 text-center border-r border-stone-100"
              :style="{ background: getStatusColor('izin') }"
            >
              <span class="block text-[16px] font-bold text-warning-700">{{ siswa.izin }}</span>
              <span class="block text-[10px] font-semibold text-stone-600">Izin</span>
            </div>
            <div
              class="py-3 text-center border-r border-stone-100"
              :style="{ background: getStatusColor('sakit') }"
            >
              <span class="block text-[16px] font-bold text-primary-700">{{ siswa.sakit }}</span>
              <span class="block text-[10px] font-semibold text-stone-600">Sakit</span>
            </div>
            <div class="py-3 text-center" :style="{ background: getStatusColor('alpa') }">
              <span class="block text-[16px] font-bold text-danger-700">{{ siswa.alpa }}</span>
              <span class="block text-[10px] font-semibold text-stone-600">Alpa</span>
            </div>
          </div>
        </div>

        <!-- Totals Card -->
        <div class="bg-primary-100 rounded-[12px] border-2 border-primary-300 p-4">
          <p class="text-[14px] font-bold text-primary-800 mb-3">Total Keseluruhan</p>
          <div class="grid grid-cols-4 gap-3 text-center">
            <div>
              <span class="block text-[18px] font-bold text-success-700">{{ totals.hadir }}</span>
              <span class="block text-[11px] text-stone-600">Hadir</span>
            </div>
            <div>
              <span class="block text-[18px] font-bold text-warning-700">{{ totals.izin }}</span>
              <span class="block text-[11px] text-stone-600">Izin</span>
            </div>
            <div>
              <span class="block text-[18px] font-bold text-primary-700">{{ totals.sakit }}</span>
              <span class="block text-[11px] text-stone-600">Sakit</span>
            </div>
            <div>
              <span class="block text-[18px] font-bold text-danger-700">{{ totals.alpa }}</span>
              <span class="block text-[11px] text-stone-600">Alpa</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== DESKTOP VIEW: Table layout ===== -->
      <div
        v-else-if="rekapData.data && rekapData.data.length > 0"
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
