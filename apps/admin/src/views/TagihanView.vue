<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed, h } from 'vue';
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

// ===== Tab Icons (inline SVG render functions) =====
const IconGenerate = {
  render() {
    return h(
      'svg',
      { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 20 20', fill: 'currentColor' },
      [
        h('path', {
          'fill-rule': 'evenodd',
          d: 'M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm4.75 6.75a.75.75 0 011.5 0v2.25h2.25a.75.75 0 010 1.5h-2.25v2.25a.75.75 0 01-1.5 0v-2.25H7a.75.75 0 010-1.5h2.25V8.75z',
          'clip-rule': 'evenodd',
        }),
      ],
    );
  },
};

const IconList = {
  render() {
    return h(
      'svg',
      { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 20 20', fill: 'currentColor' },
      [
        h('path', {
          'fill-rule': 'evenodd',
          d: 'M.99 5.24A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25l.01 9.5A2.25 2.25 0 0116.76 17H3.26A2.25 2.25 0 011 14.75l-.01-9.51zm8.26 9.52v-.625a.75.75 0 00-.75-.75H3.25a.75.75 0 00-.75.75v.615c0 .414.336.75.75.75h5.373a.75.75 0 00.627-.74zm1.5 0a.75.75 0 00.627.74h5.373a.75.75 0 00.75-.75v-.615a.75.75 0 00-.75-.75H11.5a.75.75 0 00-.75.75v.625zm6.75-5.26v-.625a.75.75 0 00-.75-.75H11.5a.75.75 0 00-.75.75v.625c0 .414.336.75.75.75h5.25a.75.75 0 00.75-.75zm-8.5 0v-.625a.75.75 0 00-.75-.75H3.25a.75.75 0 00-.75.75v.625c0 .414.336.75.75.75H8.5a.75.75 0 00.75-.75zM17.5 6.5v-.625a.75.75 0 00-.75-.75H11.5a.75.75 0 00-.75.75V6.5c0 .414.336.75.75.75h5.25a.75.75 0 00.75-.75zm-8.5 0v-.625a.75.75 0 00-.75-.75H3.25a.75.75 0 00-.75.75V6.5c0 .414.336.75.75.75H8.5a.75.75 0 00.75-.75z',
          'clip-rule': 'evenodd',
        }),
      ],
    );
  },
};

const IconVerifikasi = {
  render() {
    return h(
      'svg',
      { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 20 20', fill: 'currentColor' },
      [
        h('path', {
          'fill-rule': 'evenodd',
          d: 'M16.403 12.652a3 3 0 000-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z',
          'clip-rule': 'evenodd',
        }),
      ],
    );
  },
};

const IconTunggakan = {
  render() {
    return h(
      'svg',
      { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 20 20', fill: 'currentColor' },
      [
        h('path', {
          'fill-rule': 'evenodd',
          d: 'M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z',
          'clip-rule': 'evenodd',
        }),
      ],
    );
  },
};

const IconAudit = {
  render() {
    return h(
      'svg',
      { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 20 20', fill: 'currentColor' },
      [
        h('path', {
          d: 'M10 1a6 6 0 00-3.815 10.631C7.237 12.5 8 13.443 8 14.456v.644a.75.75 0 00.572.729 6.016 6.016 0 002.856 0A.75.75 0 0012 15.1v-.644c0-1.013.762-1.957 1.815-2.825A6 6 0 0010 1zM8.863 17.414a.75.75 0 00-.226 1.483 9.066 9.066 0 002.726 0 .75.75 0 00-.226-1.483 7.553 7.553 0 01-2.274 0z',
        }),
      ],
    );
  },
};

const toast = useToast();

// ===== Types =====
type StatusTagihan = 'belum_bayar' | 'cicilan' | 'lunas' | 'dibatalkan';
type StatusTransaksi = 'menunggu_verifikasi' | 'diterima' | 'ditolak';

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

interface TransaksiVerifikasi {
  id: string;
  tagihanId: string;
  siswaNama: string;
  kelasNama: string;
  bulan: number;
  tahun: number;
  nominalTagihan: number;
  jumlahBayar: number;
  buktiTransferUrl: string | null;
  metode: string;
  status: StatusTransaksi;
  uploadedByNama: string;
  createdAt: string;
}

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

interface AuditLog {
  id: string;
  userNama: string;
  jenisAksi: string;
  nilaiSebelum: Record<string, unknown> | null;
  nilaiSesudah: Record<string, unknown> | null;
  alasan: string | null;
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

// ===== Tabs =====
type Tab = 'generate' | 'list' | 'verifikasi' | 'tunggakan' | 'audit';

// ===== URL State Composable =====
const { page, pageSize, search, filters } = useTableUrlState({
  searchKey: 'search',
  defaultPageSize: 15,
  filters: [
    {
      key: 'tab',
      type: 'enum',
      enumValues: ['generate', 'list', 'verifikasi', 'tunggakan', 'audit'],
    },
    { key: 'status', type: 'string' },
    { key: 'kelas_id', type: 'string' },
    { key: 'bulan', type: 'string' },
  ],
});

const activeTab = computed<Tab>(() => (filters['tab'].value || 'list') as Tab);

// ===== Shared State =====
const kelasList = ref<Kelas[]>([]);
const tahunAjaranList = ref<TahunAjaran[]>([]);
const loading = ref(false);

// ===== Generate Tab =====
const generateForm = reactive({
  mode: 'bulan' as 'bulan' | 'tahun_ajaran',
  bulan: new Date().getMonth() + 1,
  tahun: new Date().getFullYear(),
  tahunAjaranId: '',
  kelasId: '', // empty = all classes
});
const generateResult = ref<{
  created: number;
  skipped: number;
  totalNominal: number;
} | null>(null);
const generating = ref(false);
const generateError = ref('');

// ===== List Tab =====
const tagihanList = ref<Tagihan[]>([]);
const listFilterTahun = ref(new Date().getFullYear());
const totalCount = ref(0);
const totalPages = ref(0);

// ===== Verifikasi Tab =====
const verifikasiList = ref<TransaksiVerifikasi[]>([]);
const verifikasiLoading = ref(false);
const showBuktiModal = ref(false);
const selectedTransaksi = ref<TransaksiVerifikasi | null>(null);
const rejectReason = ref('');
const verifyingId = ref<string | null>(null);
const showLightbox = ref(false);

// ===== Tunggakan Tab =====
const tunggakanList = ref<Tunggakan[]>([]);
const tunggakanFilter = reactive({
  kelasId: '',
  bulan: '' as number | '',
  tahun: 0,
});
const tunggakanTotal = ref(0);
const exporting = ref(false);

// ===== Manual Payment =====
const showManualPaymentModal = ref(false);
const manualPaymentTagihan = ref<Tagihan | null>(null);
const manualPaymentForm = reactive({
  jumlahBayar: 0,
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
  tanggalJatuhTempo: '',
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
  return manualPaymentTagihan.value.nominal - manualPaymentTagihan.value.totalDibayar;
});

// ===== Tab Items =====
const tabItems = computed(() => [
  { key: 'generate' as Tab, label: 'Generate', icon: IconGenerate },
  { key: 'list' as Tab, label: 'Daftar Tagihan', icon: IconList },
  { key: 'verifikasi' as Tab, label: 'Verifikasi', icon: IconVerifikasi },
  { key: 'tunggakan' as Tab, label: 'Tunggakan', icon: IconTunggakan },
  { key: 'audit' as Tab, label: 'Audit Trail', icon: IconAudit },
]);

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

// ===== API Calls =====
async function fetchKelas() {
  try {
    // Only fetch kelas from the active tahun ajaran
    const activeTa = tahunAjaranList.value.find((ta) => ta.status === 'aktif');
    const params: Record<string, string> = {};
    if (activeTa) {
      params.tahun_ajaran_id = activeTa.id;
    }
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

// --- Generate ---
async function generateTagihan() {
  generating.value = true;
  generateError.value = '';
  generateResult.value = null;
  toast.info('Sedang men-generate tagihan, mohon tunggu...', 0);

  try {
    const payload: Record<string, unknown> = {};
    if (generateForm.mode === 'bulan') {
      payload.bulan = generateForm.bulan;
      payload.tahun = generateForm.tahun;
    } else {
      payload.tahun_ajaran_id = generateForm.tahunAjaranId;
    }
    if (generateForm.kelasId) {
      payload.kelas_id = generateForm.kelasId;
    }

    const { data } = await api.post<{
      message: string;
      data: { created: number; skipped: number; totalNominal: number };
    }>('/tagihan/generate', payload);

    generateResult.value = data.data;
    toast.success(`Berhasil! ${data.data.created} tagihan dibuat, ${data.data.skipped} dilewati.`);
  } catch (error) {
    generateError.value = error.response?.data?.message || 'Gagal men-generate tagihan';
    // Toast error sudah ditampilkan otomatis oleh api client
  } finally {
    generating.value = false;
    // Remove the persistent info toast
    const infoToast = toast.toasts.value.find(
      (t) => t.type === 'info' && t.message.includes('men-generate tagihan'),
    );
    if (infoToast) toast.removeToast(infoToast.id);
  }
}

// --- List ---
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
    toast.warning('Alasan penolakan wajib diisi');
    return;
  }

  verifyingId.value = selectedTransaksi.value.id;
  try {
    const { data } = await api.patch(`/tagihan/${selectedTransaksi.value.tagihanId}/verify`, {
      action,
      alasan_penolakan: action === 'reject' ? rejectReason.value.trim() : undefined,
    });
    showBuktiModal.value = false;
    toast.success(
      data.message || (action === 'approve' ? 'Pembayaran disetujui' : 'Pembayaran ditolak'),
    );
    await fetchVerifikasi();
  } catch (error) {
    // Toast error sudah ditampilkan otomatis oleh api client
  } finally {
    verifyingId.value = null;
  }
}

// --- Tunggakan ---
async function fetchTunggakan() {
  loading.value = true;
  try {
    const params: Record<string, string | number> = {};
    if (tunggakanFilter.kelasId) params.kelas_id = tunggakanFilter.kelasId;
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
  } finally {
    loading.value = false;
  }
}

async function exportTunggakan() {
  exporting.value = true;
  try {
    const params: Record<string, string | number> = { format: 'csv' };
    if (tunggakanFilter.kelasId) params.kelas_id = tunggakanFilter.kelasId;

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
    // Toast error sudah ditampilkan otomatis oleh api client
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
    await api.patch(`/tagihan/${editingTagihan.value.id}`, {
      nominal: editForm.nominal,
    });
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
    // Toast error sudah ditampilkan otomatis oleh api client
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
// Watch composable state changes to trigger list fetch
watch([page, pageSize, search, filters['status'], filters['kelas_id'], filters['bulan']], () => {
  if (activeTab.value === 'list') fetchTagihanList();
});

// Watch tahun separately (local ref, not URL-persisted)
watch(listFilterTahun, () => {
  if (activeTab.value === 'list') fetchTagihanList();
});

// Watch activeTab to fetch data when tab changes
watch(activeTab, (tab) => {
  if (tab === 'list') fetchTagihanList();
  if (tab === 'verifikasi') fetchVerifikasi();
  if (tab === 'tunggakan') fetchTunggakan();
});

watch(
  () => [tunggakanFilter.kelasId, tunggakanFilter.bulan, tunggakanFilter.tahun],
  () => {
    if (activeTab.value === 'tunggakan') fetchTunggakan();
  },
);

// ===== Init =====
onMounted(async () => {
  await fetchTahunAjaran();
  fetchKelas();
  fetchTagihanList();
});
</script>

<template>
  <div class="p-8">
    <PageHeader title="Manajemen Tagihan" description="" />

    <!-- Tabs -->
    <div class="tagihan-tabs mb-6">
      <nav
        class="flex gap-0.5 overflow-x-auto scrollbar-hide border-b-2 border-stone-200"
        role="tablist"
      >
        <button
          v-for="tab in tabItems"
          :key="tab.key"
          role="tab"
          :aria-selected="activeTab === tab.key"
          :class="[
            'tagihan-tab group relative flex items-center gap-2 px-4 py-3 text-[15px] font-semibold whitespace-nowrap transition-all duration-200 outline-none',
            activeTab === tab.key ? 'text-primary-600' : 'text-stone-500 hover:text-stone-700',
          ]"
          @click="filters['tab'].value = tab.key"
        >
          <!-- Tab Icon -->
          <component :is="tab.icon" class="w-4 h-4 shrink-0 transition-colors duration-200" />

          <!-- Tab Label -->
          <span>{{ tab.label }}</span>

          <!-- Badge (for verifikasi pending count) -->
          <span
            v-if="tab.key === 'verifikasi' && verifikasiList.length > 0"
            class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold leading-none text-white bg-danger-500 rounded-full shadow-sm animate-pulse"
          >
            {{ verifikasiList.length > 99 ? '99+' : verifikasiList.length }}
          </span>

          <!-- Active indicator bar -->
          <span
            :class="[
              'absolute bottom-0 left-2 right-2 h-[2.5px] rounded-full transition-all duration-300 ease-out',
              activeTab === tab.key
                ? 'bg-primary-600 scale-x-100 opacity-100'
                : 'bg-transparent scale-x-0 opacity-0',
            ]"
          />
        </button>
      </nav>
    </div>

    <!-- ===== Generate Tab ===== -->
    <div v-if="activeTab === 'generate'" class="min-h-[400px]">
      <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
        <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
          <h2 class="text-[16px] font-bold text-primary-800">Generate Tagihan</h2>
        </div>
        <div class="p-6">
          <p class="text-[15px] text-stone-600 mb-5">
            Buat tagihan SPP untuk seluruh siswa aktif. Tagihan yang sudah ada akan dilewatkan
            (tidak duplikat).
          </p>

          <div class="mb-5">
            <label class="block text-[15px] font-semibold text-stone-800 mb-2">Mode Generate</label>
            <div class="flex gap-4 mt-1">
              <label class="flex items-center gap-2 text-[15px] cursor-pointer">
                <input
                  v-model="generateForm.mode"
                  type="radio"
                  value="bulan"
                  class="text-primary-600"
                />
                Per Bulan
              </label>
              <label class="flex items-center gap-2 text-[15px] cursor-pointer">
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
            class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5"
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
              <label class="block text-[15px] font-semibold text-stone-800 mb-2">Tahun</label>
              <input
                v-model.number="generateForm.tahun"
                type="number"
                class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>
          </div>

          <div v-if="generateForm.mode === 'tahun_ajaran'" class="mb-5">
            <SearchSelect
              v-model="generateForm.tahunAjaranId"
              label="Tahun Ajaran"
              :options="tahunAjaranSelectOptions"
              placeholder="Pilih Tahun Ajaran"
            />
          </div>

          <div class="mb-5">
            <SearchSelect
              v-model="generateForm.kelasId"
              label="Kelas (opsional — kosong = semua kelas)"
              :options="kelasSelectOptions"
              placeholder="Semua Kelas"
              clearable
            />
          </div>

          <div
            v-if="generateError"
            class="p-3 bg-danger-50 border-2 border-danger-200 rounded-lg text-[15px] text-danger-700 mb-5"
          >
            {{ generateError }}
          </div>

          <ActionButton variant="primary" :disabled="generating" @click="generateTagihan">
            <svg
              v-if="generating"
              class="animate-spin h-4 w-4 text-white"
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
            {{ generating ? 'Sedang men-generate...' : 'Generate Tagihan' }}
          </ActionButton>

          <div
            v-if="generateResult"
            class="mt-6 p-5 bg-surface-warm border-2 border-stone-200 rounded-[12px]"
          >
            <h3 class="text-[15px] font-bold text-stone-800 mb-3">Hasil Generate</h3>
            <div class="flex flex-wrap gap-4">
              <div
                class="flex flex-col items-center px-5 py-4 bg-success-50 rounded-[12px] min-w-[100px]"
              >
                <span class="text-xl font-bold text-success-700">{{ generateResult.created }}</span>
                <span class="text-[13px] font-semibold text-stone-500 mt-1">Dibuat</span>
              </div>
              <div
                class="flex flex-col items-center px-5 py-4 bg-stone-100 rounded-[12px] min-w-[100px]"
              >
                <span class="text-xl font-bold text-stone-600">{{ generateResult.skipped }}</span>
                <span class="text-[13px] font-semibold text-stone-500 mt-1">Dilewati</span>
              </div>
              <div
                class="flex flex-col items-center px-5 py-4 bg-primary-50 rounded-[12px] min-w-[100px]"
              >
                <span class="text-xl font-bold text-primary-600">{{
                  formatCurrency(generateResult.totalNominal)
                }}</span>
                <span class="text-[13px] font-semibold text-stone-500 mt-1">Total Nominal</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== List Tab ===== -->
    <div v-if="activeTab === 'list'" class="min-h-[400px]">
      <div class="flex flex-wrap items-end gap-3 mb-5">
        <div class="relative w-48 min-w-[150px]">
          <input
            v-model="search"
            type="text"
            placeholder="Cari nama siswa..."
            class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div class="w-40">
          <SearchSelect
            v-model="filters['status'].value"
            :options="statusFilterOptions"
            placeholder="Semua Status"
            clearable
          />
        </div>
        <div class="w-40">
          <SearchSelect
            v-model="filters['kelas_id'].value"
            :options="kelasSelectOptions"
            placeholder="Semua Kelas"
            clearable
          />
        </div>
        <div class="w-40">
          <SearchSelect
            v-model="filters['bulan'].value"
            :options="bulanSelectOptions"
            placeholder="Semua Bulan"
            clearable
          />
        </div>
        <input
          v-model.number="listFilterTahun"
          type="number"
          class="w-20 px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          placeholder="Tahun"
        />
      </div>

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
    </div>

    <!-- ===== Verifikasi Tab ===== -->
    <div v-if="activeTab === 'verifikasi'" class="min-h-[400px]">
      <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
        <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
          <h2 class="text-[16px] font-bold text-primary-800">Antrian Verifikasi Pembayaran</h2>
          <p class="text-[13px] text-stone-500 mt-1">
            Bukti transfer yang menunggu verifikasi dari bendahara.
          </p>
        </div>

        <div class="overflow-x-auto">
          <table v-if="!verifikasiLoading && verifikasiList.length > 0" class="w-full">
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
                  Tagihan
                </th>
                <th
                  class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                >
                  Nominal Bayar
                </th>
                <th
                  class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                >
                  Pengirim
                </th>
                <th
                  class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                >
                  Tanggal Upload
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
                v-for="tx in verifikasiList"
                :key="tx.id"
                class="hover:bg-primary-50 transition-colors duration-200"
              >
                <td class="px-5 py-4 text-[15px] text-stone-800 font-medium">
                  {{ tx.siswaNama }}
                </td>
                <td class="px-5 py-4 text-[15px] text-stone-600">{{ tx.kelasNama }}</td>
                <td class="px-5 py-4 text-[15px] text-stone-600">
                  {{ getBulanLabel(tx.bulan) }} {{ tx.tahun }}
                </td>
                <td class="px-5 py-4 text-[15px] text-stone-800 font-medium">
                  {{ formatCurrency(tx.jumlahBayar) }}
                </td>
                <td class="px-5 py-4 text-[15px] text-stone-600">{{ tx.uploadedByNama }}</td>
                <td class="px-5 py-4 text-[15px] text-stone-600">
                  {{ formatDate(tx.createdAt) }}
                </td>
                <td class="px-5 py-4">
                  <ActionButton variant="primary" icon="view" @click="openBuktiPreview(tx)"
                    >Lihat Bukti</ActionButton
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="verifikasiLoading" class="text-center text-stone-500 text-[15px] py-8">
          Memuat data...
        </p>
        <p
          v-else-if="verifikasiList.length === 0 && !verifikasiLoading"
          class="text-center text-stone-500 text-[15px] py-8"
        >
          Tidak ada bukti yang menunggu verifikasi.
        </p>
      </div>
    </div>

    <!-- ===== Tunggakan Tab ===== -->
    <div v-if="activeTab === 'tunggakan'" class="min-h-[400px]">
      <div class="flex flex-wrap justify-between items-start gap-4 mb-5">
        <div>
          <h2 class="text-[16px] font-bold text-stone-800">Dashboard Tunggakan</h2>
          <p class="text-[15px] text-stone-600 mt-1">
            Total Tunggakan:
            <strong class="text-danger-700">{{ formatCurrency(tunggakanTotal) }}</strong>
          </p>
        </div>
        <ActionButton variant="neutral" :disabled="exporting" @click="exportTunggakan">
          {{ exporting ? 'Mengekspor...' : 'Export CSV' }}
        </ActionButton>
      </div>

      <div class="flex flex-wrap items-end gap-3 mb-5">
        <div class="w-40">
          <SearchSelect
            v-model="tunggakanFilter.kelasId"
            :options="kelasSelectOptions"
            placeholder="Semua Kelas"
            clearable
          />
        </div>
        <div class="w-40">
          <SearchSelect
            v-model="tunggakanFilter.bulan"
            :options="bulanSelectOptions"
            placeholder="Semua Bulan"
            clearable
          />
        </div>
        <input
          v-model.number="tunggakanFilter.tahun"
          type="number"
          class="w-20 px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          placeholder="Tahun"
        />
      </div>

      <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
        <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
          <h3 class="text-[16px] font-bold text-primary-800">Daftar Tunggakan</h3>
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
                  {{ formatCurrency(item.sisa) }}
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

    <!-- ===== Audit Trail Tab ===== -->
    <div v-if="activeTab === 'audit'" class="min-h-[400px]">
      <div class="flex gap-3 mb-5 items-center">
        <input
          v-model="auditTagihanId"
          type="text"
          placeholder="Masukkan ID Tagihan..."
          class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 sm:w-auto sm:min-w-[250px]"
        />
        <ActionButton variant="primary" :disabled="auditLoading" @click="fetchAuditLogs">
          {{ auditLoading ? 'Memuat...' : 'Cari' }}
        </ActionButton>
      </div>

      <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
        <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
          <h3 class="text-[16px] font-bold text-primary-800">Audit Trail Tagihan</h3>
        </div>
        <div class="overflow-x-auto">
          <table v-if="auditLogs.length > 0" class="w-full">
            <thead>
              <tr class="border-b-2 border-stone-200">
                <th
                  class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                >
                  Waktu
                </th>
                <th
                  class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                >
                  User
                </th>
                <th
                  class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                >
                  Aksi
                </th>
                <th
                  class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                >
                  Sebelum
                </th>
                <th
                  class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                >
                  Sesudah
                </th>
                <th
                  class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                >
                  Alasan
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-100">
              <tr
                v-for="log in auditLogs"
                :key="log.id"
                class="hover:bg-primary-50 transition-colors duration-200"
              >
                <td class="px-5 py-4 text-[15px] text-stone-600">
                  {{ formatDate(log.createdAt) }}
                </td>
                <td class="px-5 py-4 text-[15px] text-stone-800 font-medium">
                  {{ log.userNama }}
                </td>
                <td class="px-5 py-4 text-[15px] text-stone-800">{{ log.jenisAksi }}</td>
                <td class="px-5 py-4">
                  <pre
                    v-if="log.nilaiSebelum"
                    class="text-[13px] max-w-[200px] overflow-auto whitespace-pre-wrap text-stone-600"
                    >{{ JSON.stringify(log.nilaiSebelum, null, 2) }}</pre>
                  <span v-else class="text-[15px] text-stone-400">-</span>
                </td>
                <td class="px-5 py-4">
                  <pre
                    v-if="log.nilaiSesudah"
                    class="text-[13px] max-w-[200px] overflow-auto whitespace-pre-wrap text-stone-600"
                    >{{ JSON.stringify(log.nilaiSesudah, null, 2) }}</pre>
                  <span v-else class="text-[15px] text-stone-400">-</span>
                </td>
                <td class="px-5 py-4 text-[15px] text-stone-600">{{ log.alasan || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p
          v-if="!auditLoading && auditLogs.length === 0"
          class="text-center text-stone-500 text-[15px] py-8"
        >
          Masukkan ID tagihan dan klik Cari untuk melihat audit trail.
        </p>
      </div>
    </div>

    <!-- ===== Bukti Transfer Preview Modal ===== -->
    <BaseModal
      :show="showBuktiModal"
      title="Verifikasi Bukti Transfer"
      size="lg"
      @close="showBuktiModal = false"
    >
      <div v-if="selectedTransaksi">
        <div class="grid grid-cols-2 gap-3 text-[15px] mb-5">
          <div>
            <strong class="text-stone-800">Siswa:</strong>
            <span class="text-stone-600">{{ selectedTransaksi.siswaNama }}</span>
          </div>
          <div>
            <strong class="text-stone-800">Kelas:</strong>
            <span class="text-stone-600">{{ selectedTransaksi.kelasNama }}</span>
          </div>
          <div>
            <strong class="text-stone-800">Tagihan:</strong>
            <span class="text-stone-600"
              >{{ getBulanLabel(selectedTransaksi.bulan) }} {{ selectedTransaksi.tahun }}</span
            >
          </div>
          <div>
            <strong class="text-stone-800">Nominal Tagihan:</strong>
            <span class="text-stone-600">{{
              formatCurrency(selectedTransaksi.nominalTagihan)
            }}</span>
          </div>
          <div>
            <strong class="text-stone-800">Nominal Bayar:</strong>
            <span class="text-stone-600">{{ formatCurrency(selectedTransaksi.jumlahBayar) }}</span>
          </div>
          <div>
            <strong class="text-stone-800">Pengirim:</strong>
            <span class="text-stone-600">{{ selectedTransaksi.uploadedByNama }}</span>
          </div>
        </div>

        <div v-if="selectedTransaksi.buktiTransferUrl" class="my-5 text-center">
          <img
            :src="selectedTransaksi.buktiTransferUrl"
            alt="Bukti Transfer"
            class="max-w-full max-h-[400px] rounded-[12px] border-2 border-stone-200 mx-auto cursor-zoom-in hover:opacity-90 transition-opacity"
            @click="showLightbox = true"
          />
          <p class="text-[13px] text-stone-500 mt-2">Klik gambar untuk memperbesar</p>
        </div>
        <p v-else class="text-center text-stone-500 text-[15px] py-4">
          Tidak ada bukti transfer tersedia.
        </p>

        <div class="mt-5">
          <label class="block text-[15px] font-semibold text-stone-800 mb-2"
            >Alasan Penolakan (wajib jika ditolak)</label
          >
          <textarea
            v-model="rejectReason"
            class="w-full px-4 py-3 text-[15px] border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 min-h-[60px] resize-y"
            placeholder="Alasan penolakan..."
          />
        </div>
      </div>
      <template #footer>
        <ActionButton variant="neutral" @click="showBuktiModal = false"> Tutup </ActionButton>
        <ActionButton variant="danger" :disabled="!!verifyingId" @click="verifyTransaksi('reject')">
          Tolak
        </ActionButton>
        <ActionButton
          variant="primary"
          :disabled="!!verifyingId"
          @click="verifyTransaksi('approve')"
        >
          Setujui
        </ActionButton>
      </template>
    </BaseModal>

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
          <label class="block text-[15px] font-semibold text-stone-800 mb-2"
            >Jumlah Bayar <span class="text-danger-500">*</span></label
          >
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
        <ActionButton variant="neutral" @click="showManualPaymentModal = false">
          Batal
        </ActionButton>
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
          <label class="block text-[15px] font-semibold text-stone-800 mb-2"
            >Nominal <span class="text-danger-500">*</span></label
          >
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
        <ActionButton variant="neutral" @click="showEditModal = false"> Batal </ActionButton>
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
        <label class="block text-[15px] font-semibold text-stone-800 mb-2"
          >Alasan Pembatalan <span class="text-danger-500">*</span></label
        >
        <textarea
          v-model="cancelReason"
          class="w-full px-4 py-3 text-[15px] border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 min-h-[60px] resize-y"
          placeholder="Contoh: Mendapat beasiswa penuh"
        />
      </div>
      <template #footer>
        <ActionButton variant="neutral" @click="showCancelModal = false"> Batal </ActionButton>
        <ActionButton variant="danger" :disabled="cancelling" @click="confirmCancelTagihan">
          {{ cancelling ? 'Membatalkan...' : 'Batalkan Tagihan' }}
        </ActionButton>
      </template>
    </BaseModal>

    <!-- ===== Lightbox for Bukti Transfer ===== -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="showLightbox && selectedTransaksi?.buktiTransferUrl"
          class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
          @click="showLightbox = false"
        >
          <button
            class="absolute top-4 right-4 text-white/80 hover:text-white text-3xl font-light leading-none w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            @click.stop="showLightbox = false"
          >
            ×
          </button>
          <img
            :src="selectedTransaksi.buktiTransferUrl"
            alt="Bukti Transfer"
            class="max-w-[90vw] max-h-[90vh] object-contain rounded-[16px] shadow-2xl"
            @click.stop
          />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* Tab scrollbar hide for mobile overflow */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

/* Tab focus style */
.tagihan-tab:focus-visible {
  outline: 2px solid var(--color-primary-400);
  outline-offset: -2px;
  border-radius: 6px;
}

/* Subtle gradient line under tabs */
.tagihan-tabs {
  position: relative;
}
</style>
