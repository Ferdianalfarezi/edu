<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { api } from '@/api/client';
import {
  PageHeader,
  BaseModal,
  SearchSelect,
  ActionButton,
  TablePagination,
} from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import { useToast } from '@/composables/useToast';
import { useTableUrlState } from '@/composables/useTableUrlState';

const toast = useToast();

// ===== Types =====
type StatusTagihan = 'belum_bayar' | 'cicilan' | 'lunas' | 'dibatalkan';

interface Tagihan {
  id: string;
  siswaId: string;
  siswaNama: string;
  kelasNama: string;
  bulan: number;
  tahun: number;
  nominal: number;
  totalDibayar: number;
  status: StatusTagihan;
  tanggalJatuhTempo: string | null;
  createdAt: string;
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
const { page, pageSize, search, filters } = useTableUrlState({
  searchKey: 'search',
  defaultPageSize: 15,
  filters: [
    { key: 'status', type: 'string' },
    { key: 'kelas_id', type: 'string' },
    { key: 'bulan', type: 'string' },
  ],
});

// ===== Shared State =====
const kelasList = ref<Kelas[]>([]);
const tahunAjaranList = ref<TahunAjaran[]>([]);
const loading = ref(false);
const exporting = ref(false);

// ===== List State =====
const tagihanList = ref<Tagihan[]>([]);
const listFilterTahun = ref(new Date().getFullYear());
const totalCount = ref(0);
const totalPages = ref(0);

// ===== Manual Payment Modal =====
const showManualPaymentModal = ref(false);
const manualPaymentTagihan = ref<Tagihan | null>(null);
const manualPaymentForm = reactive({
  jumlahBayar: 0,
  metode: 'tunai' as 'tunai' | 'transfer_manual',
  catatan: '',
});
const manualPaymentError = ref('');
const savingManualPayment = ref(false);

// ===== Edit Tagihan Modal =====
const showEditModal = ref(false);
const editingTagihan = ref<Tagihan | null>(null);
const editForm = reactive({
  nominal: 0,
  tanggalJatuhTempo: '',
});
const editError = ref('');
const savingEdit = ref(false);

// ===== Cancel Tagihan Modal =====
const showCancelModal = ref(false);
const cancellingTagihan = ref<Tagihan | null>(null);
const cancelReason = ref('');
const cancelling = ref(false);

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

const metodeOptions: SelectOption[] = [
  { value: 'tunai', label: 'Tunai' },
  { value: 'transfer_manual', label: 'Transfer Manual' },
];

// ===== Computed =====
const kelasSelectOptions = computed<SelectOption[]>(() =>
  kelasList.value.map((k) => ({ value: k.id, label: k.nama })),
);

const bulanSelectOptions = computed<SelectOption[]>(() =>
  bulanOptions.map((b) => ({ value: b.value, label: b.label })),
);

const statusFilterOptions = computed<SelectOption[]>(() =>
  statusOptions.map((s) => ({ value: s.value, label: s.label })),
);

const sisaTagihanManual = computed(() => {
  if (!manualPaymentTagihan.value) return 0;
  return manualPaymentTagihan.value.nominal - manualPaymentTagihan.value.totalDibayar;
});

/** Active filters passed to the export endpoint — mirrors what's shown in the list */
const activeFiltersForExport = computed<Record<string, string | number>>(() => {
  const params: Record<string, string | number> = {};
  if (filters['status'].value) params.status = filters['status'].value;
  if (filters['kelas_id'].value) params.kelas_id = filters['kelas_id'].value;
  if (filters['bulan'].value) params.bulan = filters['bulan'].value;
  if (listFilterTahun.value) params.tahun = listFilterTahun.value;
  if (search.value) params.search = search.value;
  return params;
});

// ===== Helper Functions =====
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

async function fetchTagihanList() {
  loading.value = true;
  try {
    const params: Record<string, string | number> = {
      page: page.value,
      page_size: pageSize.value,
    };
    if (filters['status'].value) params.status = filters['status'].value;
    if (filters['kelas_id'].value) params.kelas_id = filters['kelas_id'].value;
    if (filters['bulan'].value) params.bulan = filters['bulan'].value;
    if (listFilterTahun.value) params.tahun = listFilterTahun.value;
    if (search.value) params.search = search.value;

    const { data } = await api.get<{
      data: Tagihan[];
      meta: { page: number; pageSize: number; totalCount: number; totalPages: number };
    }>('/tagihan', { params });

    tagihanList.value = data.data;
    totalCount.value = data.meta.totalCount;
    totalPages.value = data.meta.totalPages;
  } catch (error) {
    console.error('Failed to fetch tagihan:', error);
  } finally {
    loading.value = false;
  }
}

async function exportData(format: 'xlsx' | 'pdf') {
  exporting.value = true;
  try {
    const params = { format, ...activeFiltersForExport.value };
    const response = await api.get('/tagihan/export', {
      params,
      responseType: 'blob',
    });
    const ext = format === 'xlsx' ? 'xlsx' : 'pdf';
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `tagihan_list_${date}.${ext}`;
    downloadBlob(response.data, filename);
  } catch (err) {
    toast.error('Gagal mengekspor data tagihan');
  } finally {
    exporting.value = false;
  }
}

// --- Manual Payment ---
function openManualPayment(tagihan: Tagihan) {
  manualPaymentTagihan.value = tagihan;
  manualPaymentForm.jumlahBayar = tagihan.nominal - tagihan.totalDibayar;
  manualPaymentForm.metode = 'tunai';
  manualPaymentForm.catatan = '';
  manualPaymentError.value = '';
  showManualPaymentModal.value = true;
}

async function saveManualPayment() {
  if (!manualPaymentTagihan.value) return;
  if (manualPaymentForm.jumlahBayar <= 0) {
    manualPaymentError.value = 'Jumlah bayar harus lebih dari 0';
    return;
  }
  if (manualPaymentForm.jumlahBayar > sisaTagihanManual.value) {
    manualPaymentError.value = 'Jumlah melebihi sisa tagihan';
    return;
  }
  savingManualPayment.value = true;
  manualPaymentError.value = '';
  try {
    await api.post(`/tagihan/${manualPaymentTagihan.value.id}/manual-payment`, {
      jumlah_bayar: manualPaymentForm.jumlahBayar,
      metode: manualPaymentForm.metode,
      catatan: manualPaymentForm.catatan.trim() || undefined,
    });
    showManualPaymentModal.value = false;
    await fetchTagihanList();
  } catch (error) {
    manualPaymentError.value = error.response?.data?.message || 'Gagal mencatat pembayaran';
  } finally {
    savingManualPayment.value = false;
  }
}

// --- Edit ---
function openEditTagihan(tagihan: Tagihan) {
  editingTagihan.value = tagihan;
  editForm.nominal = tagihan.nominal;
  editForm.tanggalJatuhTempo = tagihan.tanggalJatuhTempo || '';
  editError.value = '';
  showEditModal.value = true;
}

async function saveEditTagihan() {
  if (!editingTagihan.value) return;
  if (editForm.nominal <= 0) {
    editError.value = 'Nominal harus lebih dari 0';
    return;
  }
  savingEdit.value = true;
  editError.value = '';
  try {
    await api.patch(`/tagihan/${editingTagihan.value.id}`, { nominal: editForm.nominal });
    showEditModal.value = false;
    await fetchTagihanList();
  } catch (error) {
    editError.value = error.response?.data?.message || 'Gagal mengubah tagihan';
  } finally {
    savingEdit.value = false;
  }
}

// --- Cancel ---
function openCancelTagihan(tagihan: Tagihan) {
  cancellingTagihan.value = tagihan;
  cancelReason.value = '';
  showCancelModal.value = true;
}

async function confirmCancelTagihan() {
  if (!cancellingTagihan.value) return;
  if (!cancelReason.value.trim()) {
    toast.warning('Alasan pembatalan wajib diisi');
    return;
  }
  cancelling.value = true;
  try {
    await api.patch(`/tagihan/${cancellingTagihan.value.id}/cancel`, {
      alasan: cancelReason.value.trim(),
    });
    showCancelModal.value = false;
    await fetchTagihanList();
  } catch (error) {
    toast.error(error.response?.data?.message || 'Gagal membatalkan tagihan');
  } finally {
    cancelling.value = false;
  }
}

// ===== Watchers =====
watch([page, pageSize, search, filters['status'], filters['kelas_id'], filters['bulan']], () => {
  fetchTagihanList();
});

watch(listFilterTahun, () => {
  fetchTagihanList();
});

// ===== Init =====
onMounted(async () => {
  await fetchTahunAjaran();
  fetchKelas();
  fetchTagihanList();
});
</script>

<template>
  <div class="p-8">
    <PageHeader title="Daftar Tagihan" description="" />

    <!-- Filters & Export Toolbar -->
    <div class="flex flex-wrap items-end gap-3 mb-5">
      <!-- Search -->
      <div class="relative w-48 min-w-[150px]">
        <label class="block text-[15px] font-medium text-text-primary mb-1.5">Cari Siswa</label>
        <div class="relative">
          <svg
            class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.75"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            v-model="search"
            type="text"
            placeholder="Nama siswa..."
            class="w-full pl-9 pr-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
      </div>

      <!-- Status filter -->
      <div class="w-40">
        <SearchSelect
          v-model="filters['status'].value"
          :options="statusFilterOptions"
          placeholder="Semua Status"
          clearable
        />
      </div>

      <!-- Kelas filter -->
      <div class="w-40">
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
          v-model="filters['bulan'].value"
          :options="bulanSelectOptions"
          placeholder="Semua Bulan"
          clearable
        />
      </div>

      <!-- Tahun filter -->
      <div class="w-32">
        <label class="block text-[15px] font-medium text-text-primary mb-1.5">Tahun</label>
        <input
          v-model.number="listFilterTahun"
          type="number"
          min="2020"
          max="2050"
          class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
          placeholder="Tahun"
        />
      </div>

      <!-- Spacer -->
      <div class="flex-1" />

      <!-- Export buttons -->
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

    <!-- Table -->
    <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
      <div
        class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200 flex items-center justify-between"
      >
        <h3 class="text-[16px] font-bold text-primary-800">Daftar Tagihan</h3>
        <span class="text-[13px] font-semibold text-stone-500">{{ totalCount }} data</span>
      </div>
      <div class="overflow-x-auto">
        <table v-if="!loading && tagihanList.length > 0" class="w-full">
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
                Periode
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
                Status
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Jatuh Tempo
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Aksi
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-100">
            <tr
              v-for="tagihan in tagihanList"
              :key="tagihan.id"
              class="hover:bg-primary-50 transition-colors duration-200"
            >
              <td class="px-5 py-4 text-[15px] text-stone-800 font-medium">
                {{ tagihan.siswaNama }}
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-600">{{ tagihan.kelasNama }}</td>
              <td class="px-5 py-4 text-[15px] text-stone-600">
                {{ getBulanLabel(tagihan.bulan) }} {{ tagihan.tahun }}
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-800 font-medium">
                {{ formatCurrency(tagihan.nominal) }}
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-600">
                {{ formatCurrency(tagihan.totalDibayar) }}
              </td>
              <td class="px-5 py-4">
                <span
                  :class="[
                    'inline-flex items-center px-2.5 py-1 rounded-md text-[13px] font-semibold',
                    getStatusClass(tagihan.status),
                  ]"
                >
                  {{ getStatusLabel(tagihan.status) }}
                </span>
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-600">
                {{ formatDate(tagihan.tanggalJatuhTempo) }}
              </td>
              <td class="px-5 py-4">
                <div class="flex flex-wrap gap-1.5">
                  <ActionButton
                    v-if="tagihan.status === 'belum_bayar' || tagihan.status === 'cicilan'"
                    variant="success"
                    icon="pay"
                    @click="openManualPayment(tagihan)"
                    >Bayar Manual</ActionButton
                  >
                  <ActionButton
                    v-if="tagihan.status !== 'lunas' && tagihan.status !== 'dibatalkan'"
                    variant="warning"
                    icon="edit"
                    @click="openEditTagihan(tagihan)"
                    >Edit</ActionButton
                  >
                  <ActionButton
                    v-if="tagihan.status !== 'lunas' && tagihan.status !== 'dibatalkan'"
                    variant="danger"
                    icon="cancel"
                    @click="openCancelTagihan(tagihan)"
                    >Batalkan</ActionButton
                  >
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="loading" class="text-center text-stone-500 text-[15px] py-8">Memuat data...</p>
      <p
        v-else-if="tagihanList.length === 0 && !loading"
        class="text-center text-stone-500 text-[15px] py-8"
      >
        Tidak ada tagihan ditemukan.
      </p>
    </div>

    <!-- Pagination -->
    <TablePagination
      :current-page="page"
      :total-pages="totalPages"
      :total-count="totalCount"
      :page-size="pageSize"
      :loading="loading"
      @page-change="page = $event"
      @page-size-change="pageSize = $event"
    />

    <!-- ===== Manual Payment Modal ===== -->
    <BaseModal
      :show="showManualPaymentModal"
      title="Pencatatan Pembayaran Manual"
      size="lg"
      @close="showManualPaymentModal = false"
    >
      <div v-if="manualPaymentTagihan" class="grid grid-cols-2 gap-3 text-[15px] mb-5">
        <div>
          <strong class="text-stone-800">Siswa:</strong>
          <span class="text-stone-600">{{ manualPaymentTagihan.siswaNama }}</span>
        </div>
        <div>
          <strong class="text-stone-800">Kelas:</strong>
          <span class="text-stone-600">{{ manualPaymentTagihan.kelasNama }}</span>
        </div>
        <div>
          <strong class="text-stone-800">Tagihan:</strong>
          <span class="text-stone-600"
            >{{ getBulanLabel(manualPaymentTagihan.bulan) }} {{ manualPaymentTagihan.tahun }}</span
          >
        </div>
        <div>
          <strong class="text-stone-800">Nominal:</strong>
          <span class="text-stone-600">{{ formatCurrency(manualPaymentTagihan.nominal) }}</span>
        </div>
        <div>
          <strong class="text-stone-800">Sudah Dibayar:</strong>
          <span class="text-stone-600">{{
            formatCurrency(manualPaymentTagihan.totalDibayar)
          }}</span>
        </div>
        <div>
          <strong class="text-stone-800">Sisa:</strong>
          <span class="text-stone-600">{{ formatCurrency(sisaTagihanManual) }}</span>
        </div>
      </div>

      <hr class="border-stone-200 my-5" />

      <form @submit.prevent="saveManualPayment">
        <div class="mb-5">
          <label class="block text-[15px] font-semibold text-stone-800 mb-2">
            Jumlah Bayar <span class="text-danger-500">*</span>
          </label>
          <input
            v-model.number="manualPaymentForm.jumlahBayar"
            type="number"
            class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            min="1"
            :max="sisaTagihanManual"
          />
        </div>
        <div class="mb-5">
          <SearchSelect
            v-model="manualPaymentForm.metode"
            label="Metode Pembayaran"
            :options="metodeOptions"
            placeholder="Pilih metode"
          />
        </div>
        <div class="mb-5">
          <label class="block text-[15px] font-semibold text-stone-800 mb-2"
            >Catatan (opsional)</label
          >
          <textarea
            v-model="manualPaymentForm.catatan"
            class="w-full px-4 py-3 text-[15px] border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 min-h-[60px] resize-y"
            placeholder="Catatan tambahan..."
          />
        </div>
        <div v-if="manualPaymentError" class="text-[13px] text-danger-600 font-medium mt-1 mb-2">
          {{ manualPaymentError }}
        </div>
      </form>
      <template #footer>
        <ActionButton variant="neutral" @click="showManualPaymentModal = false">Batal</ActionButton>
        <ActionButton variant="primary" :disabled="savingManualPayment" @click="saveManualPayment">
          {{ savingManualPayment ? 'Menyimpan...' : 'Simpan Pembayaran' }}
        </ActionButton>
      </template>
    </BaseModal>

    <!-- ===== Edit Tagihan Modal ===== -->
    <BaseModal :show="showEditModal" title="Edit Tagihan" size="lg" @close="showEditModal = false">
      <div v-if="editingTagihan" class="grid grid-cols-2 gap-3 text-[15px] mb-5">
        <div>
          <strong class="text-stone-800">Siswa:</strong>
          <span class="text-stone-600">{{ editingTagihan.siswaNama }}</span>
        </div>
        <div>
          <strong class="text-stone-800">Tagihan:</strong>
          <span class="text-stone-600"
            >{{ getBulanLabel(editingTagihan.bulan) }} {{ editingTagihan.tahun }}</span
          >
        </div>
      </div>

      <hr class="border-stone-200 my-5" />

      <form @submit.prevent="saveEditTagihan">
        <div class="mb-5">
          <label class="block text-[15px] font-semibold text-stone-800 mb-2">
            Nominal <span class="text-danger-500">*</span>
          </label>
          <input
            v-model.number="editForm.nominal"
            type="number"
            class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            min="1"
          />
        </div>
        <div class="mb-5">
          <label class="block text-[15px] font-semibold text-stone-800 mb-2"
            >Tanggal Jatuh Tempo</label
          >
          <input
            v-model="editForm.tanggalJatuhTempo"
            type="date"
            class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div v-if="editError" class="text-[13px] text-danger-600 font-medium mt-1 mb-2">
          {{ editError }}
        </div>
      </form>
      <template #footer>
        <ActionButton variant="neutral" @click="showEditModal = false">Batal</ActionButton>
        <ActionButton variant="primary" :disabled="savingEdit" @click="saveEditTagihan">
          {{ savingEdit ? 'Menyimpan...' : 'Simpan' }}
        </ActionButton>
      </template>
    </BaseModal>

    <!-- ===== Cancel Tagihan Modal ===== -->
    <BaseModal
      :show="showCancelModal"
      title="Batalkan Tagihan"
      size="lg"
      @close="showCancelModal = false"
    >
      <p class="text-[15px] text-stone-600 mb-5">
        Anda akan membatalkan tagihan
        <strong v-if="cancellingTagihan" class="text-stone-800">
          {{ cancellingTagihan.siswaNama }} — {{ getBulanLabel(cancellingTagihan.bulan) }}
          {{ cancellingTagihan.tahun }} </strong
        >.
      </p>
      <div class="mb-5">
        <label class="block text-[15px] font-semibold text-stone-800 mb-2">
          Alasan Pembatalan <span class="text-danger-500">*</span>
        </label>
        <textarea
          v-model="cancelReason"
          class="w-full px-4 py-3 text-[15px] border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 min-h-[60px] resize-y"
          placeholder="Contoh: Mendapat beasiswa penuh"
        />
      </div>
      <template #footer>
        <ActionButton variant="neutral" @click="showCancelModal = false">Batal</ActionButton>
        <ActionButton variant="danger" :disabled="cancelling" @click="confirmCancelTagihan">
          {{ cancelling ? 'Membatalkan...' : 'Batalkan Tagihan' }}
        </ActionButton>
      </template>
    </BaseModal>
  </div>
</template>
