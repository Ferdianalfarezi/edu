<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { api } from '@/api/client';
import { PageHeader, SearchSelect, ActionButton } from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import { useTableUrlState } from '@/composables/useTableUrlState';

// ===== Types =====
type StatusTagihan = 'belum_bayar' | 'cicilan' | 'lunas' | 'dibatalkan';

interface Tunggakan {
  id: string;
  siswaId: string;
  siswaNama: string;
  kelasNama: string;
  bulan: number;
  tahun: number;
  nominal: number;
  totalDibayar: number;
  sisa: number;
  status: StatusTagihan;
  tanggalJatuhTempo: string | null;
}

interface Kelas {
  id: string;
  nama: string;
}

interface TahunAjaran {
  id: string;
  nama: string;
  status: string;
}

// ===== URL State (filter persistence in query params) =====
const { filters } = useTableUrlState({
  filters: [{ key: 'kelas_id', type: 'string' }],
});

// ===== State =====
const kelasList = ref<Kelas[]>([]);
const tahunAjaranList = ref<TahunAjaran[]>([]);
const loading = ref(false);
const exporting = ref(false);

const tunggakanList = ref<Tunggakan[]>([]);
const tunggakanFilter = reactive({
  bulan: '' as number | '',
  tahun: 0,
});
const tunggakanTotal = ref(0);

// ===== Constants =====
const bulanOptions = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

const statusOptions: { value: StatusTagihan; label: string }[] = [
  { value: 'belum_bayar', label: 'Belum Bayar' },
  { value: 'cicilan', label: 'Cicilan' },
  { value: 'lunas', label: 'Lunas' },
  { value: 'dibatalkan', label: 'Dibatalkan' },
];

// ===== Computed =====
const kelasSelectOptions = computed<SelectOption[]>(() =>
  kelasList.value.map((k) => ({ value: k.id, label: k.nama })),
);

const bulanSelectOptions = computed<SelectOption[]>(() =>
  bulanOptions.map((b) => ({ value: b.value, label: b.label })),
);

// ===== Helper Functions =====

/**
 * Get the sisa (remaining) amount for a tunggakan item.
 * Uses the server-provided `sisa` field if valid (Req 7.1).
 * Falls back to client-side calculation with null-safe operators so the
 * result is never NaN (Req 7.3).
 */
function getSisaTagihan(item: Tunggakan): number {
  if (typeof item.sisa === 'number' && !isNaN(item.sisa)) {
    return item.sisa;
  }
  return Math.max(0, (item.nominal ?? 0) - (item.totalDibayar ?? 0));
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getBulanLabel(bulan: number): string {
  return bulanOptions.find((b) => b.value === bulan)?.label || String(bulan);
}

function getStatusClass(status: StatusTagihan): string {
  switch (status) {
    case 'lunas':
      return 'bg-success-50 text-success-700';
    case 'cicilan':
      return 'bg-warning-50 text-warning-700';
    case 'belum_bayar':
      return 'bg-danger-50 text-danger-700';
    case 'dibatalkan':
      return 'bg-stone-100 text-stone-500';
    default:
      return '';
  }
}

function getStatusLabel(status: StatusTagihan): string {
  return statusOptions.find((s) => s.value === status)?.label || status;
}

function downloadBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ===== API Calls =====
async function fetchKelas() {
  try {
    const activeTa = tahunAjaranList.value.find((ta) => ta.status === 'aktif');
    const params: Record<string, string> = {};
    if (activeTa) params.tahun_ajaran_id = activeTa.id;
    const { data } = await api.get<{ data: Kelas[] }>('/kelas', { params });
    kelasList.value = data.data;
  } catch (error) {
    console.error('Failed to fetch kelas:', error);
  }
}

async function fetchTahunAjaran() {
  try {
    const { data } = await api.get<TahunAjaran[]>('/tahun-ajaran');
    tahunAjaranList.value = data;
  } catch (error) {
    console.error('Failed to fetch tahun ajaran:', error);
  }
}

async function fetchTunggakan() {
  loading.value = true;
  try {
    const params: Record<string, string | number> = {};
    if (filters['kelas_id'].value) params.kelas_id = filters['kelas_id'].value;
    if (tunggakanFilter.bulan) params.bulan = tunggakanFilter.bulan;
    if (tunggakanFilter.tahun) params.tahun = tunggakanFilter.tahun;

    const { data } = await api.get<{
      data: Tunggakan[];
      totalTunggakan: number;
    }>('/tagihan/tunggakan', { params });

    tunggakanList.value = data.data;
    tunggakanTotal.value = data.totalTunggakan;
  } catch (error) {
    console.error('Failed to fetch tunggakan:', error);
    // Toast error sudah ditampilkan otomatis oleh api client
  } finally {
    loading.value = false;
  }
}

/**
 * Export tunggakan data as xlsx or pdf (Req 9.2, 9.5, 9.6).
 */
async function exportData(format: 'xlsx' | 'pdf') {
  exporting.value = true;
  try {
    const params: Record<string, string> = { format };
    if (filters['kelas_id'].value) params.kelas_id = filters['kelas_id'].value;

    const response = await api.get('/tagihan/tunggakan/export', {
      params,
      responseType: 'blob',
    });

    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const ext = format === 'xlsx' ? 'xlsx' : 'pdf';
    downloadBlob(response.data, `tagihan_tunggakan_${date}.${ext}`);
  } catch {
    // Toast error sudah ditampilkan otomatis oleh api client
  } finally {
    exporting.value = false;
  }
}

// ===== Watchers =====
watch([filters['kelas_id']], () => {
  fetchTunggakan();
});

watch(
  () => [tunggakanFilter.bulan, tunggakanFilter.tahun],
  () => {
    fetchTunggakan();
  },
);

// ===== Init =====
onMounted(async () => {
  await fetchTahunAjaran();
  fetchKelas();
  fetchTunggakan();
});
</script>

<template>
  <div class="p-8">
    <PageHeader title="Tunggakan" description="" />

    <!-- Summary + Export Toolbar -->
    <div class="flex flex-wrap justify-between items-start gap-4 mb-5">
      <!-- Total summary -->
      <div>
        <h2 class="text-[16px] font-bold text-stone-800">Dashboard Tunggakan</h2>
        <p class="text-[15px] text-stone-600 mt-1">
          Total Tunggakan:
          <strong class="text-danger-700">{{ formatCurrency(tunggakanTotal) }}</strong>
        </p>
      </div>

      <!-- Export buttons -->
      <div class="flex items-center gap-2">
        <ActionButton
          variant="success"
          icon="download"
          :disabled="exporting"
          @click="exportData('xlsx')"
        >
          <span v-if="exporting" class="flex items-center gap-1.5">
            <svg
              class="animate-spin h-3.5 w-3.5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Mengekspor...
          </span>
          <span v-else>Ekspor Excel</span>
        </ActionButton>

        <ActionButton
          variant="neutral"
          icon="download"
          :disabled="exporting"
          @click="exportData('pdf')"
        >
          <span v-if="exporting" class="flex items-center gap-1.5">
            <svg
              class="animate-spin h-3.5 w-3.5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Mengekspor...
          </span>
          <span v-else>Ekspor PDF</span>
        </ActionButton>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-end gap-3 mb-5">
      <!-- Kelas filter — URL-persisted via useTableUrlState -->
      <div class="w-44">
        <SearchSelect
          v-model="filters['kelas_id'].value"
          :options="kelasSelectOptions"
          placeholder="Semua Kelas"
          clearable
        />
      </div>

      <!-- Bulan filter -->
      <div class="w-40">
        <SearchSelect
          v-model="tunggakanFilter.bulan"
          :options="bulanSelectOptions"
          placeholder="Semua Bulan"
          clearable
        />
      </div>

      <!-- Tahun filter -->
      <input
        v-model.number="tunggakanFilter.tahun"
        type="number"
        class="w-20 px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        placeholder="Tahun"
      />
    </div>

    <!-- Table -->
    <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
      <div
        class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200 flex items-center justify-between"
      >
        <h3 class="text-[16px] font-bold text-primary-800">Daftar Tunggakan</h3>
        <span class="text-[13px] font-semibold text-stone-500"
          >{{ tunggakanList.length }} data</span
        >
      </div>

      <div class="overflow-x-auto">
        <table v-if="!loading && tunggakanList.length > 0" class="w-full">
          <thead>
            <tr class="border-b-2 border-stone-200">
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Siswa
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Kelas
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Bulan/Tahun
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Nominal
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Dibayar
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Sisa
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Status
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Jatuh Tempo
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-100">
            <tr
              v-for="item in tunggakanList"
              :key="item.id"
              class="hover:bg-primary-50 transition-colors duration-200"
            >
              <td class="px-5 py-4 text-[15px] text-stone-800 font-medium">
                {{ item.siswaNama }}
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-600">{{ item.kelasNama }}</td>
              <td class="px-5 py-4 text-[15px] text-stone-600">
                {{ getBulanLabel(item.bulan) }} {{ item.tahun }}
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-800 font-medium">
                {{ formatCurrency(item.nominal) }}
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-600">
                {{ formatCurrency(item.totalDibayar) }}
              </td>
              <td class="px-5 py-4 text-[15px] font-bold text-danger-700">
                {{ formatCurrency(getSisaTagihan(item)) }}
              </td>
              <td class="px-5 py-4">
                <span
                  :class="[
                    'inline-flex items-center px-2.5 py-1 rounded-md text-[13px] font-semibold',
                    getStatusClass(item.status),
                  ]"
                >
                  {{ getStatusLabel(item.status) }}
                </span>
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-600">
                {{ formatDate(item.tanggalJatuhTempo) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="loading" class="text-center text-stone-500 text-[15px] py-8">Memuat data...</p>
      <p
        v-else-if="tunggakanList.length === 0 && !loading"
        class="text-center text-stone-500 text-[15px] py-8"
      >
        Tidak ada tunggakan.
      </p>
    </div>
  </div>
</template>
