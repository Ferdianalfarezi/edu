<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { api } from '@/api/client';
import { PageHeader, BaseModal, SearchSelect, ActionButton } from '@/components/ui';
import type { SelectOption } from '@/components/ui';

// ===== Types =====
type StatusTagihan = 'belum_bayar' | 'cicilan' | 'lunas' | 'dibatalkan';
type StatusTransaksi = 'menunggu_verifikasi' | 'diterima' | 'ditolak';

interface Tagihan {
  id: string;
  siswa_id: string;
  siswa_nama: string;
  kelas_nama: string;
  bulan: number;
  tahun: number;
  nominal: number;
  total_dibayar: number;
  status: StatusTagihan;
  tanggal_jatuh_tempo: string | null;
  created_at: string;
}

interface TransaksiVerifikasi {
  id: string;
  tagihan_id: string;
  siswa_nama: string;
  kelas_nama: string;
  bulan: number;
  tahun: number;
  nominal_tagihan: number;
  jumlah_bayar: number;
  bukti_transfer_url: string | null;
  metode: string;
  status: StatusTransaksi;
  uploaded_by_nama: string;
  created_at: string;
}

interface Tunggakan {
  id: string;
  siswa_id: string;
  siswa_nama: string;
  kelas_nama: string;
  bulan: number;
  tahun: number;
  nominal: number;
  total_dibayar: number;
  sisa: number;
  status: StatusTagihan;
  tanggal_jatuh_tempo: string | null;
}

interface AuditLog {
  id: string;
  user_nama: string;
  jenis_aksi: string;
  nilai_sebelum: Record<string, unknown> | null;
  nilai_sesudah: Record<string, unknown> | null;
  alasan: string | null;
  created_at: string;
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

// ===== Tabs =====
type Tab = 'generate' | 'list' | 'verifikasi' | 'tunggakan' | 'audit';
const activeTab = ref<Tab>('list');

// ===== Shared State =====
const kelasList = ref<Kelas[]>([]);
const tahunAjaranList = ref<TahunAjaran[]>([]);
const loading = ref(false);

// ===== Generate Tab =====
const generateForm = reactive({
  mode: 'bulan' as 'bulan' | 'tahun_ajaran',
  bulan: new Date().getMonth() + 1,
  tahun: new Date().getFullYear(),
  tahun_ajaran_id: '',
  kelas_id: '', // empty = all classes
});
const generateResult = ref<{
  created: number;
  skipped: number;
  total_nominal: number;
} | null>(null);
const generating = ref(false);
const generateError = ref('');

// ===== List Tab =====
const tagihanList = ref<Tagihan[]>([]);
const listFilter = reactive({
  status: '' as StatusTagihan | '',
  kelas_id: '',
  bulan: '' as number | '',
  tahun: new Date().getFullYear(),
  search: '',
});
const listCursor = ref<string | null>(null);
const listHasNext = ref(false);

// ===== Verifikasi Tab =====
const verifikasiList = ref<TransaksiVerifikasi[]>([]);
const verifikasiLoading = ref(false);
const showBuktiModal = ref(false);
const selectedTransaksi = ref<TransaksiVerifikasi | null>(null);
const rejectReason = ref('');
const verifyingId = ref<string | null>(null);

// ===== Tunggakan Tab =====
const tunggakanList = ref<Tunggakan[]>([]);
const tunggakanFilter = reactive({
  kelas_id: '',
  bulan: '' as number | '',
  tahun: 0,
});
const tunggakanTotal = ref(0);
const exporting = ref(false);

// ===== Manual Payment =====
const showManualPaymentModal = ref(false);
const manualPaymentTagihan = ref<Tagihan | null>(null);
const manualPaymentForm = reactive({
  jumlah_bayar: 0,
  metode: 'tunai' as 'tunai' | 'transfer_manual',
  catatan: '',
});
const manualPaymentError = ref('');
const savingManualPayment = ref(false);

// ===== Edit Tagihan =====
const showEditModal = ref(false);
const editingTagihan = ref<Tagihan | null>(null);
const editForm = reactive({
  nominal: 0,
  tanggal_jatuh_tempo: '',
});
const editError = ref('');
const savingEdit = ref(false);

// ===== Cancel Tagihan =====
const showCancelModal = ref(false);
const cancellingTagihan = ref<Tagihan | null>(null);
const cancelReason = ref('');
const cancelling = ref(false);

// ===== Audit Trail =====
const auditLogs = ref<AuditLog[]>([]);
const auditTagihanId = ref('');
const auditLoading = ref(false);

// ===== Computed =====
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

const kelasSelectOptions = computed<SelectOption[]>(() =>
  kelasList.value.map((k) => ({ value: k.id, label: k.nama })),
);

const tahunAjaranSelectOptions = computed<SelectOption[]>(() =>
  tahunAjaranList.value.map((ta) => ({ value: ta.id, label: `${ta.nama} (${ta.status})` })),
);

const bulanSelectOptions = computed<SelectOption[]>(() =>
  bulanOptions.map((b) => ({ value: b.value, label: b.label })),
);

const statusFilterOptions = computed<SelectOption[]>(() =>
  statusOptions.map((s) => ({ value: s.value, label: s.label })),
);

const sisaTagihanManual = computed(() => {
  if (!manualPaymentTagihan.value) return 0;
  return manualPaymentTagihan.value.nominal - manualPaymentTagihan.value.total_dibayar;
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
      return 'bg-surface-100 text-text-tertiary';
    default:
      return '';
  }
}

function getStatusLabel(status: StatusTagihan): string {
  return statusOptions.find((s) => s.value === status)?.label || status;
}

// ===== API Calls =====
async function fetchKelas() {
  try {
    const { data } = await api.get<{ data: Kelas[] }>('/kelas');
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

// --- Generate ---
async function generateTagihan() {
  generating.value = true;
  generateError.value = '';
  generateResult.value = null;

  try {
    const payload: Record<string, unknown> = {};
    if (generateForm.mode === 'bulan') {
      payload.bulan = generateForm.bulan;
      payload.tahun = generateForm.tahun;
    } else {
      payload.tahun_ajaran_id = generateForm.tahun_ajaran_id;
    }
    if (generateForm.kelas_id) {
      payload.kelas_id = generateForm.kelas_id;
    }

    const { data } = await api.post<{
      created: number;
      skipped: number;
      total_nominal: number;
    }>('/tagihan/generate', payload);

    generateResult.value = data;
  } catch (error: any) {
    generateError.value = error.response?.data?.message || 'Gagal men-generate tagihan';
  } finally {
    generating.value = false;
  }
}

// --- List ---
async function fetchTagihanList(resetCursor = true) {
  loading.value = true;
  if (resetCursor) listCursor.value = null;

  try {
    const params: Record<string, string | number> = { limit: 20 };
    if (listCursor.value) params.cursor = listCursor.value;
    if (listFilter.status) params.status = listFilter.status;
    if (listFilter.kelas_id) params.kelas_id = listFilter.kelas_id;
    if (listFilter.bulan) params.bulan = listFilter.bulan;
    if (listFilter.tahun) params.tahun = listFilter.tahun;
    if (listFilter.search) params.search = listFilter.search;

    const { data } = await api.get<{
      data: Tagihan[];
      meta: { has_next: boolean; cursor: string | null };
    }>('/tagihan', { params });

    if (resetCursor) {
      tagihanList.value = data.data;
    } else {
      tagihanList.value = [...tagihanList.value, ...data.data];
    }
    listHasNext.value = data.meta.has_next;
    listCursor.value = data.meta.cursor;
  } catch (error) {
    console.error('Failed to fetch tagihan:', error);
  } finally {
    loading.value = false;
  }
}

// --- Verifikasi ---
async function fetchVerifikasi() {
  verifikasiLoading.value = true;
  try {
    const { data } = await api.get<{ data: TransaksiVerifikasi[] }>('/tagihan/verifikasi');
    verifikasiList.value = data.data;
  } catch (error) {
    console.error('Failed to fetch verifikasi:', error);
  } finally {
    verifikasiLoading.value = false;
  }
}

function openBuktiPreview(transaksi: TransaksiVerifikasi) {
  selectedTransaksi.value = transaksi;
  rejectReason.value = '';
  showBuktiModal.value = true;
}

async function verifyTransaksi(action: 'approve' | 'reject') {
  if (!selectedTransaksi.value) return;
  if (action === 'reject' && !rejectReason.value.trim()) {
    alert('Alasan penolakan wajib diisi');
    return;
  }

  verifyingId.value = selectedTransaksi.value.id;
  try {
    await api.patch(`/tagihan/${selectedTransaksi.value.id}/verify`, {
      action,
      alasan_penolakan: action === 'reject' ? rejectReason.value.trim() : undefined,
    });
    showBuktiModal.value = false;
    await fetchVerifikasi();
  } catch (error: any) {
    alert(error.response?.data?.message || 'Gagal memverifikasi');
  } finally {
    verifyingId.value = null;
  }
}

// --- Tunggakan ---
async function fetchTunggakan() {
  loading.value = true;
  try {
    const params: Record<string, string | number> = {};
    if (tunggakanFilter.kelas_id) params.kelas_id = tunggakanFilter.kelas_id;
    if (tunggakanFilter.bulan) params.bulan = tunggakanFilter.bulan;
    if (tunggakanFilter.tahun) params.tahun = tunggakanFilter.tahun;

    const { data } = await api.get<{
      data: Tunggakan[];
      total_tunggakan: number;
    }>('/tagihan/tunggakan', { params });

    tunggakanList.value = data.data;
    tunggakanTotal.value = data.total_tunggakan;
  } catch (error) {
    console.error('Failed to fetch tunggakan:', error);
  } finally {
    loading.value = false;
  }
}

async function exportTunggakan() {
  exporting.value = true;
  try {
    const params: Record<string, string | number> = { format: 'csv' };
    if (tunggakanFilter.kelas_id) params.kelas_id = tunggakanFilter.kelas_id;

    const response = await api.get('/tagihan/export', {
      params,
      responseType: 'blob',
    });

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `tunggakan_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export:', error);
    alert('Gagal mengekspor laporan');
  } finally {
    exporting.value = false;
  }
}

// --- Manual Payment ---
function openManualPayment(tagihan: Tagihan) {
  manualPaymentTagihan.value = tagihan;
  manualPaymentForm.jumlah_bayar = tagihan.nominal - tagihan.total_dibayar;
  manualPaymentForm.metode = 'tunai';
  manualPaymentForm.catatan = '';
  manualPaymentError.value = '';
  showManualPaymentModal.value = true;
}

async function saveManualPayment() {
  if (!manualPaymentTagihan.value) return;
  if (manualPaymentForm.jumlah_bayar <= 0) {
    manualPaymentError.value = 'Jumlah bayar harus lebih dari 0';
    return;
  }
  if (manualPaymentForm.jumlah_bayar > sisaTagihanManual.value) {
    manualPaymentError.value = 'Jumlah melebihi sisa tagihan';
    return;
  }

  savingManualPayment.value = true;
  manualPaymentError.value = '';

  try {
    await api.post(`/tagihan/${manualPaymentTagihan.value.id}/manual-payment`, {
      jumlah_bayar: manualPaymentForm.jumlah_bayar,
      metode: manualPaymentForm.metode,
      catatan: manualPaymentForm.catatan.trim() || undefined,
    });
    showManualPaymentModal.value = false;
    await fetchTagihanList();
  } catch (error: any) {
    manualPaymentError.value = error.response?.data?.message || 'Gagal mencatat pembayaran';
  } finally {
    savingManualPayment.value = false;
  }
}

// --- Edit ---
function openEditTagihan(tagihan: Tagihan) {
  editingTagihan.value = tagihan;
  editForm.nominal = tagihan.nominal;
  editForm.tanggal_jatuh_tempo = tagihan.tanggal_jatuh_tempo || '';
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
    await api.patch(`/tagihan/${editingTagihan.value.id}`, {
      nominal: editForm.nominal,
      tanggal_jatuh_tempo: editForm.tanggal_jatuh_tempo || undefined,
    });
    showEditModal.value = false;
    await fetchTagihanList();
  } catch (error: any) {
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
    alert('Alasan pembatalan wajib diisi');
    return;
  }

  cancelling.value = true;
  try {
    await api.patch(`/tagihan/${cancellingTagihan.value.id}/cancel`, {
      alasan: cancelReason.value.trim(),
    });
    showCancelModal.value = false;
    await fetchTagihanList();
  } catch (error: any) {
    alert(error.response?.data?.message || 'Gagal membatalkan tagihan');
  } finally {
    cancelling.value = false;
  }
}

// --- Audit Trail ---
async function fetchAuditLogs() {
  if (!auditTagihanId.value.trim()) return;
  auditLoading.value = true;
  try {
    const { data } = await api.get<{ data: AuditLog[] }>('/tagihan/audit-log', {
      params: { tagihan_id: auditTagihanId.value.trim() },
    });
    auditLogs.value = data.data;
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
  } finally {
    auditLoading.value = false;
  }
}

// ===== Watchers =====
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
watch(
  () => listFilter.search,
  () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => fetchTagihanList(), 300);
  },
);

watch(
  () => [listFilter.status, listFilter.kelas_id, listFilter.bulan, listFilter.tahun],
  () => fetchTagihanList(),
);

watch(
  () => [tunggakanFilter.kelas_id, tunggakanFilter.bulan, tunggakanFilter.tahun],
  () => {
    if (activeTab.value === 'tunggakan') fetchTunggakan();
  },
);

watch(activeTab, (tab) => {
  if (tab === 'list') fetchTagihanList();
  if (tab === 'verifikasi') fetchVerifikasi();
  if (tab === 'tunggakan') fetchTunggakan();
});

// ===== Init =====
onMounted(() => {
  fetchKelas();
  fetchTahunAjaran();
  fetchTagihanList();
});
</script>

<template>
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader title="Manajemen Tagihan" description=""> </PageHeader>

    <!-- Tabs -->
    <div class="flex gap-1 p-1 bg-surface-100 rounded-lg mb-4">
      <button
        :class="[
          'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
          activeTab === 'generate'
            ? 'bg-white text-text-primary shadow-xs'
            : 'text-text-secondary hover:text-text-primary',
        ]"
        @click="activeTab = 'generate'"
      >
        Generate
      </button>
      <button
        :class="[
          'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
          activeTab === 'list'
            ? 'bg-white text-text-primary shadow-xs'
            : 'text-text-secondary hover:text-text-primary',
        ]"
        @click="activeTab = 'list'"
      >
        Daftar Tagihan
      </button>
      <button
        :class="[
          'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
          activeTab === 'verifikasi'
            ? 'bg-white text-text-primary shadow-xs'
            : 'text-text-secondary hover:text-text-primary',
        ]"
        @click="activeTab = 'verifikasi'"
      >
        Verifikasi
      </button>
      <button
        :class="[
          'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
          activeTab === 'tunggakan'
            ? 'bg-white text-text-primary shadow-xs'
            : 'text-text-secondary hover:text-text-primary',
        ]"
        @click="activeTab = 'tunggakan'"
      >
        Tunggakan
      </button>
      <button
        :class="[
          'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
          activeTab === 'audit'
            ? 'bg-white text-text-primary shadow-xs'
            : 'text-text-secondary hover:text-text-primary',
        ]"
        @click="activeTab = 'audit'"
      >
        Audit Trail
      </button>
    </div>

    <!-- ===== Generate Tab ===== -->
    <div v-if="activeTab === 'generate'" class="min-h-[400px]">
      <div class="bg-white border border-border rounded-xl overflow-hidden p-6">
        <h2 class="text-lg font-semibold text-text-primary mb-1">Generate Tagihan</h2>
        <p class="text-sm text-text-secondary mb-4">
          Buat tagihan SPP untuk seluruh siswa aktif. Tagihan yang sudah ada akan dilewatkan (tidak
          duplikat).
        </p>

        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5">Mode Generate</label>
          <div class="flex gap-4 mt-1">
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input
                v-model="generateForm.mode"
                type="radio"
                value="bulan"
                class="text-primary-600"
              />
              Per Bulan
            </label>
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input
                v-model="generateForm.mode"
                type="radio"
                value="tahun_ajaran"
                class="text-primary-600"
              />
              Per Tahun Ajaran
            </label>
          </div>
        </div>

        <div
          v-if="generateForm.mode === 'bulan'"
          class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4"
        >
          <div>
            <SearchSelect
              v-model="generateForm.bulan"
              label="Bulan"
              :options="bulanSelectOptions"
              placeholder="Pilih Bulan"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1.5">Tahun</label>
            <input
              v-model.number="generateForm.tahun"
              type="number"
              class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
        </div>

        <div v-if="generateForm.mode === 'tahun_ajaran'" class="mb-4">
          <SearchSelect
            v-model="generateForm.tahun_ajaran_id"
            label="Tahun Ajaran"
            :options="tahunAjaranSelectOptions"
            placeholder="Pilih Tahun Ajaran"
          />
        </div>

        <div class="mb-4">
          <SearchSelect
            v-model="generateForm.kelas_id"
            label="Kelas (opsional — kosong = semua kelas)"
            :options="kelasSelectOptions"
            placeholder="Semua Kelas"
            clearable
          />
        </div>

        <div
          v-if="generateError"
          class="p-3 bg-danger-50 border border-danger-500/20 rounded-lg text-sm text-danger-700 mb-4"
        >
          {{ generateError }}
        </div>

        <button
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="generating"
          @click="generateTagihan"
        >
          {{ generating ? 'Generating...' : 'Generate Tagihan' }}
        </button>

        <div v-if="generateResult" class="mt-6 p-4 bg-surface-50 border border-border rounded-xl">
          <h3 class="text-sm font-semibold text-text-primary mb-3">Hasil Generate</h3>
          <div class="flex flex-wrap gap-4">
            <div
              class="flex flex-col items-center px-4 py-3 bg-success-50 rounded-lg min-w-[100px]"
            >
              <span class="text-xl font-bold text-success-700">{{ generateResult.created }}</span>
              <span class="text-xs text-text-tertiary mt-1">Dibuat</span>
            </div>
            <div
              class="flex flex-col items-center px-4 py-3 bg-surface-100 rounded-lg min-w-[100px]"
            >
              <span class="text-xl font-bold text-text-secondary">{{
                generateResult.skipped
              }}</span>
              <span class="text-xs text-text-tertiary mt-1">Dilewati</span>
            </div>
            <div
              class="flex flex-col items-center px-4 py-3 bg-primary-50 rounded-lg min-w-[100px]"
            >
              <span class="text-xl font-bold text-primary-600">{{
                formatCurrency(generateResult.total_nominal)
              }}</span>
              <span class="text-xs text-text-tertiary mt-1">Total Nominal</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== List Tab ===== -->
    <div v-if="activeTab === 'list'" class="min-h-[400px]">
      <div class="flex flex-wrap gap-3 mb-4 items-center">
        <input
          v-model="listFilter.search"
          type="text"
          placeholder="Cari nama siswa..."
          class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 sm:w-auto sm:min-w-[200px]"
        />
        <SearchSelect
          v-model="listFilter.status"
          :options="statusFilterOptions"
          placeholder="Semua Status"
          clearable
        />
        <SearchSelect
          v-model="listFilter.kelas_id"
          :options="kelasSelectOptions"
          placeholder="Semua Kelas"
          clearable
        />
        <SearchSelect
          v-model="listFilter.bulan"
          :options="bulanSelectOptions"
          placeholder="Semua Bulan"
          clearable
        />
        <input
          v-model.number="listFilter.tahun"
          type="number"
          class="w-[100px] px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          placeholder="Tahun"
        />
      </div>

      <div class="bg-white border border-border rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table v-if="!loading && tagihanList.length > 0" class="w-full">
            <thead class="border-b border-border bg-surface-50">
              <tr>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Siswa</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Kelas</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                  Bulan/Tahun
                </th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Nominal</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Dibayar</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Status</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                  Jatuh Tempo
                </th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="tagihan in tagihanList"
                :key="tagihan.id"
                class="hover:bg-surface-50 transition-colors"
              >
                <td class="px-4 py-3 text-sm text-text-primary">{{ tagihan.siswa_nama }}</td>
                <td class="px-4 py-3 text-sm text-text-secondary">{{ tagihan.kelas_nama }}</td>
                <td class="px-4 py-3 text-sm text-text-secondary">
                  {{ getBulanLabel(tagihan.bulan) }} {{ tagihan.tahun }}
                </td>
                <td class="px-4 py-3 text-sm text-text-primary">
                  {{ formatCurrency(tagihan.nominal) }}
                </td>
                <td class="px-4 py-3 text-sm text-text-secondary">
                  {{ formatCurrency(tagihan.total_dibayar) }}
                </td>
                <td class="px-4 py-3">
                  <span
                    :class="[
                      'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
                      getStatusClass(tagihan.status),
                    ]"
                  >
                    {{ getStatusLabel(tagihan.status) }}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-text-secondary">
                  {{ formatDate(tagihan.tanggal_jatuh_tempo) }}
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-1">
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
        <p v-if="loading" class="text-center text-text-secondary py-8">Memuat data...</p>
        <p
          v-else-if="tagihanList.length === 0 && !loading"
          class="text-center text-text-secondary py-8"
        >
          Tidak ada tagihan ditemukan.
        </p>

        <div v-if="listHasNext && !loading" class="flex justify-center p-4 border-t border-border">
          <button
            class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
            @click="fetchTagihanList(false)"
          >
            Muat Lebih Banyak
          </button>
        </div>
      </div>
    </div>

    <!-- ===== Verifikasi Tab ===== -->
    <div v-if="activeTab === 'verifikasi'" class="min-h-[400px]">
      <h2 class="text-lg font-semibold text-text-primary mb-1">Antrian Verifikasi Pembayaran</h2>
      <p class="text-sm text-text-secondary mb-4">
        Bukti transfer yang menunggu verifikasi dari bendahara.
      </p>

      <div class="bg-white border border-border rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table v-if="!verifikasiLoading && verifikasiList.length > 0" class="w-full">
            <thead class="border-b border-border bg-surface-50">
              <tr>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Siswa</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Kelas</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Tagihan</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                  Nominal Bayar
                </th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                  Pengirim
                </th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                  Tanggal Upload
                </th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="tx in verifikasiList"
                :key="tx.id"
                class="hover:bg-surface-50 transition-colors"
              >
                <td class="px-4 py-3 text-sm text-text-primary">{{ tx.siswa_nama }}</td>
                <td class="px-4 py-3 text-sm text-text-secondary">{{ tx.kelas_nama }}</td>
                <td class="px-4 py-3 text-sm text-text-secondary">
                  {{ getBulanLabel(tx.bulan) }} {{ tx.tahun }}
                </td>
                <td class="px-4 py-3 text-sm text-text-primary">
                  {{ formatCurrency(tx.jumlah_bayar) }}
                </td>
                <td class="px-4 py-3 text-sm text-text-secondary">{{ tx.uploaded_by_nama }}</td>
                <td class="px-4 py-3 text-sm text-text-secondary">
                  {{ formatDate(tx.created_at) }}
                </td>
                <td class="px-4 py-3">
                  <ActionButton variant="primary" icon="view" @click="openBuktiPreview(tx)"
                    >Lihat Bukti</ActionButton
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="verifikasiLoading" class="text-center text-text-secondary py-8">Memuat data...</p>
        <p
          v-else-if="verifikasiList.length === 0 && !verifikasiLoading"
          class="text-center text-text-secondary py-8"
        >
          Tidak ada bukti yang menunggu verifikasi.
        </p>
      </div>
    </div>

    <!-- ===== Tunggakan Tab ===== -->
    <div v-if="activeTab === 'tunggakan'" class="min-h-[400px]">
      <div class="flex flex-wrap justify-between items-start gap-4 mb-4">
        <div>
          <h2 class="text-lg font-semibold text-text-primary">Dashboard Tunggakan</h2>
          <p class="text-sm text-text-secondary mt-0.5">
            Total Tunggakan:
            <strong class="text-danger-700">{{ formatCurrency(tunggakanTotal) }}</strong>
          </p>
        </div>
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors disabled:opacity-50"
          :disabled="exporting"
          @click="exportTunggakan"
        >
          {{ exporting ? 'Mengekspor...' : 'Export CSV' }}
        </button>
      </div>

      <div class="flex flex-wrap gap-3 mb-4">
        <SearchSelect
          v-model="tunggakanFilter.kelas_id"
          :options="kelasSelectOptions"
          placeholder="Semua Kelas"
          clearable
        />
        <SearchSelect
          v-model="tunggakanFilter.bulan"
          :options="bulanSelectOptions"
          placeholder="Semua Bulan"
          clearable
        />
        <input
          v-model.number="tunggakanFilter.tahun"
          type="number"
          class="w-[100px] px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          placeholder="Tahun"
        />
      </div>

      <div class="bg-white border border-border rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table v-if="!loading && tunggakanList.length > 0" class="w-full">
            <thead class="border-b border-border bg-surface-50">
              <tr>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Siswa</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Kelas</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                  Bulan/Tahun
                </th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Nominal</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Dibayar</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Sisa</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Status</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                  Jatuh Tempo
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="item in tunggakanList"
                :key="item.id"
                class="hover:bg-surface-50 transition-colors"
              >
                <td class="px-4 py-3 text-sm text-text-primary">{{ item.siswa_nama }}</td>
                <td class="px-4 py-3 text-sm text-text-secondary">{{ item.kelas_nama }}</td>
                <td class="px-4 py-3 text-sm text-text-secondary">
                  {{ getBulanLabel(item.bulan) }} {{ item.tahun }}
                </td>
                <td class="px-4 py-3 text-sm text-text-primary">
                  {{ formatCurrency(item.nominal) }}
                </td>
                <td class="px-4 py-3 text-sm text-text-secondary">
                  {{ formatCurrency(item.total_dibayar) }}
                </td>
                <td class="px-4 py-3 text-sm font-semibold text-danger-700">
                  {{ formatCurrency(item.sisa) }}
                </td>
                <td class="px-4 py-3">
                  <span
                    :class="[
                      'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
                      getStatusClass(item.status),
                    ]"
                  >
                    {{ getStatusLabel(item.status) }}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-text-secondary">
                  {{ formatDate(item.tanggal_jatuh_tempo) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="loading" class="text-center text-text-secondary py-8">Memuat data...</p>
        <p
          v-else-if="tunggakanList.length === 0 && !loading"
          class="text-center text-text-secondary py-8"
        >
          Tidak ada tunggakan.
        </p>
      </div>
    </div>

    <!-- ===== Audit Trail Tab ===== -->
    <div v-if="activeTab === 'audit'" class="min-h-[400px]">
      <h2 class="text-lg font-semibold text-text-primary mb-4">Audit Trail Tagihan</h2>
      <div class="flex gap-3 mb-4 items-center">
        <input
          v-model="auditTagihanId"
          type="text"
          placeholder="Masukkan ID Tagihan..."
          class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 sm:w-auto sm:min-w-[250px]"
        />
        <button
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          :disabled="auditLoading"
          @click="fetchAuditLogs"
        >
          {{ auditLoading ? 'Memuat...' : 'Cari' }}
        </button>
      </div>

      <div class="bg-white border border-border rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table v-if="auditLogs.length > 0" class="w-full">
            <thead class="border-b border-border bg-surface-50">
              <tr>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Waktu</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">User</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Aksi</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Sebelum</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Sesudah</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Alasan</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="log in auditLogs"
                :key="log.id"
                class="hover:bg-surface-50 transition-colors"
              >
                <td class="px-4 py-3 text-sm text-text-secondary">
                  {{ formatDate(log.created_at) }}
                </td>
                <td class="px-4 py-3 text-sm text-text-primary">{{ log.user_nama }}</td>
                <td class="px-4 py-3 text-sm text-text-primary">{{ log.jenis_aksi }}</td>
                <td class="px-4 py-3">
                  <pre
                    v-if="log.nilai_sebelum"
                    class="text-xs max-w-[200px] overflow-auto whitespace-pre-wrap text-text-secondary"
                    >{{ JSON.stringify(log.nilai_sebelum, null, 2) }}</pre>
                  <span v-else class="text-sm text-text-tertiary">-</span>
                </td>
                <td class="px-4 py-3">
                  <pre
                    v-if="log.nilai_sesudah"
                    class="text-xs max-w-[200px] overflow-auto whitespace-pre-wrap text-text-secondary"
                    >{{ JSON.stringify(log.nilai_sesudah, null, 2) }}</pre>
                  <span v-else class="text-sm text-text-tertiary">-</span>
                </td>
                <td class="px-4 py-3 text-sm text-text-secondary">{{ log.alasan || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p
          v-if="!auditLoading && auditLogs.length === 0"
          class="text-center text-text-secondary py-8"
        >
          Masukkan ID tagihan dan klik Cari untuk melihat audit trail.
        </p>
      </div>
    </div>

    <!-- ===== Bukti Transfer Preview Modal ===== -->
    <BaseModal
      :show="showBuktiModal"
      title="Verifikasi Bukti Transfer"
      @close="showBuktiModal = false"
      size="lg"
    >
      <div v-if="selectedTransaksi">
        <div class="grid grid-cols-2 gap-2 text-sm mb-4">
          <div><strong>Siswa:</strong> {{ selectedTransaksi.siswa_nama }}</div>
          <div><strong>Kelas:</strong> {{ selectedTransaksi.kelas_nama }}</div>
          <div>
            <strong>Tagihan:</strong> {{ getBulanLabel(selectedTransaksi.bulan) }}
            {{ selectedTransaksi.tahun }}
          </div>
          <div>
            <strong>Nominal Tagihan:</strong>
            {{ formatCurrency(selectedTransaksi.nominal_tagihan) }}
          </div>
          <div>
            <strong>Nominal Bayar:</strong> {{ formatCurrency(selectedTransaksi.jumlah_bayar) }}
          </div>
          <div><strong>Pengirim:</strong> {{ selectedTransaksi.uploaded_by_nama }}</div>
        </div>

        <div v-if="selectedTransaksi.bukti_transfer_url" class="my-4 text-center">
          <img
            :src="selectedTransaksi.bukti_transfer_url"
            alt="Bukti Transfer"
            class="max-w-full max-h-[400px] rounded-lg border border-border mx-auto"
          />
        </div>
        <p v-else class="text-center text-text-secondary py-4">
          Tidak ada bukti transfer tersedia.
        </p>

        <div class="mt-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5"
            >Alasan Penolakan (wajib jika ditolak)</label
          >
          <textarea
            v-model="rejectReason"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 min-h-[60px] resize-y"
            placeholder="Alasan penolakan..."
          />
        </div>
      </div>
      <template #footer>
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showBuktiModal = false"
        >
          Tutup
        </button>
        <button
          class="px-4 py-2 text-sm font-medium text-white bg-danger-500 rounded-lg hover:bg-danger-700 transition-colors disabled:opacity-50"
          :disabled="!!verifyingId"
          @click="verifyTransaksi('reject')"
        >
          Tolak
        </button>
        <button
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          :disabled="!!verifyingId"
          @click="verifyTransaksi('approve')"
        >
          Setujui
        </button>
      </template>
    </BaseModal>

    <!-- ===== Manual Payment Modal ===== -->
    <BaseModal
      :show="showManualPaymentModal"
      title="Pencatatan Pembayaran Manual"
      @close="showManualPaymentModal = false"
      size="lg"
    >
      <div v-if="manualPaymentTagihan" class="grid grid-cols-2 gap-2 text-sm mb-4">
        <div><strong>Siswa:</strong> {{ manualPaymentTagihan.siswa_nama }}</div>
        <div><strong>Kelas:</strong> {{ manualPaymentTagihan.kelas_nama }}</div>
        <div>
          <strong>Tagihan:</strong> {{ getBulanLabel(manualPaymentTagihan.bulan) }}
          {{ manualPaymentTagihan.tahun }}
        </div>
        <div><strong>Nominal:</strong> {{ formatCurrency(manualPaymentTagihan.nominal) }}</div>
        <div>
          <strong>Sudah Dibayar:</strong> {{ formatCurrency(manualPaymentTagihan.total_dibayar) }}
        </div>
        <div><strong>Sisa:</strong> {{ formatCurrency(sisaTagihanManual) }}</div>
      </div>

      <hr class="border-border my-4" />

      <form @submit.prevent="saveManualPayment">
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5"
            >Jumlah Bayar <span class="text-danger-500">*</span></label
          >
          <input
            v-model.number="manualPaymentForm.jumlah_bayar"
            type="number"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            min="1"
            :max="sisaTagihanManual"
          />
        </div>

        <div class="mb-4">
          <SearchSelect
            v-model="manualPaymentForm.metode"
            label="Metode Pembayaran"
            :options="metodeOptions"
            placeholder="Pilih metode"
          />
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5"
            >Catatan (opsional)</label
          >
          <textarea
            v-model="manualPaymentForm.catatan"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 min-h-[60px] resize-y"
            placeholder="Catatan tambahan..."
          />
        </div>

        <div v-if="manualPaymentError" class="text-xs text-danger-500 mt-1 mb-2">
          {{ manualPaymentError }}
        </div>
      </form>
      <template #footer>
        <button
          type="button"
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showManualPaymentModal = false"
        >
          Batal
        </button>
        <button
          type="button"
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          :disabled="savingManualPayment"
          @click="saveManualPayment"
        >
          {{ savingManualPayment ? 'Menyimpan...' : 'Simpan Pembayaran' }}
        </button>
      </template>
    </BaseModal>

    <!-- ===== Edit Tagihan Modal ===== -->
    <BaseModal :show="showEditModal" title="Edit Tagihan" @close="showEditModal = false" size="lg">
      <div v-if="editingTagihan" class="grid grid-cols-2 gap-2 text-sm mb-4">
        <div><strong>Siswa:</strong> {{ editingTagihan.siswa_nama }}</div>
        <div>
          <strong>Tagihan:</strong> {{ getBulanLabel(editingTagihan.bulan) }}
          {{ editingTagihan.tahun }}
        </div>
      </div>

      <hr class="border-border my-4" />

      <form @submit.prevent="saveEditTagihan">
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5"
            >Nominal <span class="text-danger-500">*</span></label
          >
          <input
            v-model.number="editForm.nominal"
            type="number"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            min="1"
          />
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5"
            >Tanggal Jatuh Tempo</label
          >
          <input
            v-model="editForm.tanggal_jatuh_tempo"
            type="date"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>

        <div v-if="editError" class="text-xs text-danger-500 mt-1 mb-2">{{ editError }}</div>
      </form>
      <template #footer>
        <button
          type="button"
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showEditModal = false"
        >
          Batal
        </button>
        <button
          type="button"
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          :disabled="savingEdit"
          @click="saveEditTagihan"
        >
          {{ savingEdit ? 'Menyimpan...' : 'Simpan' }}
        </button>
      </template>
    </BaseModal>

    <!-- ===== Cancel Tagihan Modal ===== -->
    <BaseModal
      :show="showCancelModal"
      title="Batalkan Tagihan"
      @close="showCancelModal = false"
      size="lg"
    >
      <p class="text-sm text-text-secondary mb-4">
        Anda akan membatalkan tagihan
        <strong v-if="cancellingTagihan">
          {{ cancellingTagihan.siswa_nama }} — {{ getBulanLabel(cancellingTagihan.bulan) }}
          {{ cancellingTagihan.tahun }} </strong
        >.
      </p>

      <div class="mb-4">
        <label class="block text-sm font-medium text-text-primary mb-1.5"
          >Alasan Pembatalan <span class="text-danger-500">*</span></label
        >
        <textarea
          v-model="cancelReason"
          class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 min-h-[60px] resize-y"
          placeholder="Contoh: Mendapat beasiswa penuh"
        />
      </div>
      <template #footer>
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showCancelModal = false"
        >
          Batal
        </button>
        <button
          class="px-4 py-2 text-sm font-medium text-white bg-danger-500 rounded-lg hover:bg-danger-700 transition-colors disabled:opacity-50"
          :disabled="cancelling"
          @click="confirmCancelTagihan"
        >
          {{ cancelling ? 'Membatalkan...' : 'Batalkan Tagihan' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
