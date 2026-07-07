<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { api } from '@/api/client';

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
  bulan: 0,
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
  bulan: 0,
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
      return 'status-lunas';
    case 'cicilan':
      return 'status-cicilan';
    case 'belum_bayar':
      return 'status-belum';
    case 'dibatalkan':
      return 'status-batal';
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
    const { data } = await api.get<{ data: TahunAjaran[] }>('/tahun-ajaran');
    tahunAjaranList.value = data.data;
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
    await api.patch(`/tagihan/transaksi/${selectedTransaksi.value.id}/verify`, {
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
    await api.post(`/tagihan/${manualPaymentTagihan.value.id}/bayar-manual`, {
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
    await api.delete(`/tagihan/${cancellingTagihan.value.id}`, {
      data: { alasan: cancelReason.value.trim() },
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
  <div class="page">
    <div class="page-header">
      <h1>Manajemen Tagihan</h1>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button
        :class="['tab', { active: activeTab === 'generate' }]"
        @click="activeTab = 'generate'"
      >
        Generate
      </button>
      <button :class="['tab', { active: activeTab === 'list' }]" @click="activeTab = 'list'">
        Daftar Tagihan
      </button>
      <button
        :class="['tab', { active: activeTab === 'verifikasi' }]"
        @click="activeTab = 'verifikasi'"
      >
        Verifikasi
      </button>
      <button
        :class="['tab', { active: activeTab === 'tunggakan' }]"
        @click="activeTab = 'tunggakan'"
      >
        Tunggakan
      </button>
      <button :class="['tab', { active: activeTab === 'audit' }]" @click="activeTab = 'audit'">
        Audit Trail
      </button>
    </div>

    <!-- ===== Generate Tab ===== -->
    <div v-if="activeTab === 'generate'" class="tab-content">
      <div class="card">
        <h2>Generate Tagihan</h2>
        <p class="hint">
          Buat tagihan SPP untuk seluruh siswa aktif. Tagihan yang sudah ada akan dilewatkan (tidak
          duplikat).
        </p>

        <div class="form-group">
          <label>Mode Generate</label>
          <div class="radio-group">
            <label class="radio-label">
              <input v-model="generateForm.mode" type="radio" value="bulan" />
              Per Bulan
            </label>
            <label class="radio-label">
              <input v-model="generateForm.mode" type="radio" value="tahun_ajaran" />
              Per Tahun Ajaran
            </label>
          </div>
        </div>

        <div v-if="generateForm.mode === 'bulan'" class="form-row">
          <div class="form-group">
            <label>Bulan</label>
            <select v-model="generateForm.bulan" class="input">
              <option v-for="b in bulanOptions" :key="b.value" :value="b.value">
                {{ b.label }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Tahun</label>
            <input v-model.number="generateForm.tahun" type="number" class="input" />
          </div>
        </div>

        <div v-if="generateForm.mode === 'tahun_ajaran'" class="form-group">
          <label>Tahun Ajaran</label>
          <select v-model="generateForm.tahun_ajaran_id" class="input">
            <option value="" disabled>Pilih Tahun Ajaran</option>
            <option v-for="ta in tahunAjaranList" :key="ta.id" :value="ta.id">
              {{ ta.nama }} ({{ ta.status }})
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>Kelas (opsional — kosong = semua kelas)</label>
          <select v-model="generateForm.kelas_id" class="input">
            <option value="">Semua Kelas</option>
            <option v-for="kelas in kelasList" :key="kelas.id" :value="kelas.id">
              {{ kelas.nama }}
            </option>
          </select>
        </div>

        <div v-if="generateError" class="error-text">{{ generateError }}</div>

        <button class="btn btn-primary" :disabled="generating" @click="generateTagihan">
          {{ generating ? 'Generating...' : 'Generate Tagihan' }}
        </button>

        <div v-if="generateResult" class="result-box">
          <h3>Hasil Generate</h3>
          <div class="result-summary">
            <div class="result-item result-created">
              <span class="result-number">{{ generateResult.created }}</span>
              <span class="result-label">Dibuat</span>
            </div>
            <div class="result-item result-skipped">
              <span class="result-number">{{ generateResult.skipped }}</span>
              <span class="result-label">Dilewati</span>
            </div>
            <div class="result-item result-total">
              <span class="result-number">{{ formatCurrency(generateResult.total_nominal) }}</span>
              <span class="result-label">Total Nominal</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== List Tab ===== -->
    <div v-if="activeTab === 'list'" class="tab-content">
      <div class="filters">
        <input
          v-model="listFilter.search"
          type="text"
          placeholder="Cari nama siswa..."
          class="input search-input"
        />
        <select v-model="listFilter.status" class="input">
          <option value="">Semua Status</option>
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <select v-model="listFilter.kelas_id" class="input">
          <option value="">Semua Kelas</option>
          <option v-for="kelas in kelasList" :key="kelas.id" :value="kelas.id">
            {{ kelas.nama }}
          </option>
        </select>
        <select v-model.number="listFilter.bulan" class="input">
          <option :value="0">Semua Bulan</option>
          <option v-for="b in bulanOptions" :key="b.value" :value="b.value">
            {{ b.label }}
          </option>
        </select>
        <input
          v-model.number="listFilter.tahun"
          type="number"
          class="input input-year"
          placeholder="Tahun"
        />
      </div>

      <div class="table-container">
        <table v-if="!loading && tagihanList.length > 0">
          <thead>
            <tr>
              <th>Siswa</th>
              <th>Kelas</th>
              <th>Bulan/Tahun</th>
              <th>Nominal</th>
              <th>Dibayar</th>
              <th>Status</th>
              <th>Jatuh Tempo</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tagihan in tagihanList" :key="tagihan.id">
              <td>{{ tagihan.siswa_nama }}</td>
              <td>{{ tagihan.kelas_nama }}</td>
              <td>{{ getBulanLabel(tagihan.bulan) }} {{ tagihan.tahun }}</td>
              <td>{{ formatCurrency(tagihan.nominal) }}</td>
              <td>{{ formatCurrency(tagihan.total_dibayar) }}</td>
              <td>
                <span :class="['status', getStatusClass(tagihan.status)]">
                  {{ getStatusLabel(tagihan.status) }}
                </span>
              </td>
              <td>{{ formatDate(tagihan.tanggal_jatuh_tempo) }}</td>
              <td class="actions-cell">
                <button
                  v-if="tagihan.status === 'belum_bayar' || tagihan.status === 'cicilan'"
                  class="btn-sm btn-pay"
                  @click="openManualPayment(tagihan)"
                >
                  Bayar Manual
                </button>
                <button
                  v-if="tagihan.status !== 'lunas' && tagihan.status !== 'dibatalkan'"
                  class="btn-sm btn-edit"
                  @click="openEditTagihan(tagihan)"
                >
                  Edit
                </button>
                <button
                  v-if="tagihan.status !== 'lunas' && tagihan.status !== 'dibatalkan'"
                  class="btn-sm btn-delete"
                  @click="openCancelTagihan(tagihan)"
                >
                  Batalkan
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else-if="loading" class="empty-state">Memuat data...</p>
        <p v-else class="empty-state">Tidak ada tagihan ditemukan.</p>

        <div v-if="listHasNext && !loading" class="load-more">
          <button class="btn btn-secondary" @click="fetchTagihanList(false)">
            Muat Lebih Banyak
          </button>
        </div>
      </div>
    </div>

    <!-- ===== Verifikasi Tab ===== -->
    <div v-if="activeTab === 'verifikasi'" class="tab-content">
      <h2>Antrian Verifikasi Pembayaran</h2>
      <p class="hint">Bukti transfer yang menunggu verifikasi dari bendahara.</p>

      <div class="table-container">
        <table v-if="!verifikasiLoading && verifikasiList.length > 0">
          <thead>
            <tr>
              <th>Siswa</th>
              <th>Kelas</th>
              <th>Tagihan</th>
              <th>Nominal Bayar</th>
              <th>Pengirim</th>
              <th>Tanggal Upload</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tx in verifikasiList" :key="tx.id">
              <td>{{ tx.siswa_nama }}</td>
              <td>{{ tx.kelas_nama }}</td>
              <td>{{ getBulanLabel(tx.bulan) }} {{ tx.tahun }}</td>
              <td>{{ formatCurrency(tx.jumlah_bayar) }}</td>
              <td>{{ tx.uploaded_by_nama }}</td>
              <td>{{ formatDate(tx.created_at) }}</td>
              <td>
                <button class="btn-sm btn-view" @click="openBuktiPreview(tx)">Lihat Bukti</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else-if="verifikasiLoading" class="empty-state">Memuat data...</p>
        <p v-else class="empty-state">Tidak ada bukti yang menunggu verifikasi.</p>
      </div>
    </div>

    <!-- ===== Tunggakan Tab ===== -->
    <div v-if="activeTab === 'tunggakan'" class="tab-content">
      <div class="tunggakan-header">
        <div>
          <h2>Dashboard Tunggakan</h2>
          <p class="total-tunggakan">
            Total Tunggakan: <strong>{{ formatCurrency(tunggakanTotal) }}</strong>
          </p>
        </div>
        <button class="btn btn-secondary" :disabled="exporting" @click="exportTunggakan">
          {{ exporting ? 'Mengekspor...' : 'Export CSV' }}
        </button>
      </div>

      <div class="filters">
        <select v-model="tunggakanFilter.kelas_id" class="input">
          <option value="">Semua Kelas</option>
          <option v-for="kelas in kelasList" :key="kelas.id" :value="kelas.id">
            {{ kelas.nama }}
          </option>
        </select>
        <select v-model.number="tunggakanFilter.bulan" class="input">
          <option :value="0">Semua Bulan</option>
          <option v-for="b in bulanOptions" :key="b.value" :value="b.value">
            {{ b.label }}
          </option>
        </select>
        <input
          v-model.number="tunggakanFilter.tahun"
          type="number"
          class="input input-year"
          placeholder="Tahun"
        />
      </div>

      <div class="table-container">
        <table v-if="!loading && tunggakanList.length > 0">
          <thead>
            <tr>
              <th>Siswa</th>
              <th>Kelas</th>
              <th>Bulan/Tahun</th>
              <th>Nominal</th>
              <th>Dibayar</th>
              <th>Sisa</th>
              <th>Status</th>
              <th>Jatuh Tempo</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in tunggakanList" :key="item.id">
              <td>{{ item.siswa_nama }}</td>
              <td>{{ item.kelas_nama }}</td>
              <td>{{ getBulanLabel(item.bulan) }} {{ item.tahun }}</td>
              <td>{{ formatCurrency(item.nominal) }}</td>
              <td>{{ formatCurrency(item.total_dibayar) }}</td>
              <td class="sisa-cell">{{ formatCurrency(item.sisa) }}</td>
              <td>
                <span :class="['status', getStatusClass(item.status)]">
                  {{ getStatusLabel(item.status) }}
                </span>
              </td>
              <td>{{ formatDate(item.tanggal_jatuh_tempo) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else-if="loading" class="empty-state">Memuat data...</p>
        <p v-else class="empty-state">Tidak ada tunggakan.</p>
      </div>
    </div>

    <!-- ===== Audit Trail Tab ===== -->
    <div v-if="activeTab === 'audit'" class="tab-content">
      <h2>Audit Trail Tagihan</h2>
      <div class="filters">
        <input
          v-model="auditTagihanId"
          type="text"
          placeholder="Masukkan ID Tagihan..."
          class="input search-input"
        />
        <button class="btn btn-primary" :disabled="auditLoading" @click="fetchAuditLogs">
          {{ auditLoading ? 'Memuat...' : 'Cari' }}
        </button>
      </div>

      <div class="table-container">
        <table v-if="auditLogs.length > 0">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>User</th>
              <th>Aksi</th>
              <th>Sebelum</th>
              <th>Sesudah</th>
              <th>Alasan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in auditLogs" :key="log.id">
              <td>{{ formatDate(log.created_at) }}</td>
              <td>{{ log.user_nama }}</td>
              <td>{{ log.jenis_aksi }}</td>
              <td class="json-cell">
                <pre v-if="log.nilai_sebelum">{{ JSON.stringify(log.nilai_sebelum, null, 2) }}</pre>
                <span v-else>-</span>
              </td>
              <td class="json-cell">
                <pre v-if="log.nilai_sesudah">{{ JSON.stringify(log.nilai_sesudah, null, 2) }}</pre>
                <span v-else>-</span>
              </td>
              <td>{{ log.alasan || '-' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else-if="!auditLoading" class="empty-state">
          Masukkan ID tagihan dan klik Cari untuk melihat audit trail.
        </p>
      </div>
    </div>

    <!-- ===== Bukti Transfer Preview Modal ===== -->
    <div v-if="showBuktiModal" class="modal-overlay" @click.self="showBuktiModal = false">
      <div class="modal modal-lg">
        <h2>Verifikasi Bukti Transfer</h2>

        <div v-if="selectedTransaksi" class="bukti-detail">
          <div class="detail-grid">
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
              <strong>Nominal Bayar:</strong>
              {{ formatCurrency(selectedTransaksi.jumlah_bayar) }}
            </div>
            <div><strong>Pengirim:</strong> {{ selectedTransaksi.uploaded_by_nama }}</div>
          </div>

          <div v-if="selectedTransaksi.bukti_transfer_url" class="bukti-image">
            <img
              :src="selectedTransaksi.bukti_transfer_url"
              alt="Bukti Transfer"
              class="bukti-preview"
            />
          </div>
          <p v-else class="empty-state">Tidak ada bukti transfer tersedia.</p>

          <div class="form-group">
            <label>Alasan Penolakan (wajib jika ditolak)</label>
            <textarea
              v-model="rejectReason"
              class="input textarea"
              placeholder="Alasan penolakan..."
            />
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showBuktiModal = false">Tutup</button>
            <button
              class="btn btn-danger"
              :disabled="!!verifyingId"
              @click="verifyTransaksi('reject')"
            >
              Tolak
            </button>
            <button
              class="btn btn-primary"
              :disabled="!!verifyingId"
              @click="verifyTransaksi('approve')"
            >
              Setujui
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== Manual Payment Modal ===== -->
    <div
      v-if="showManualPaymentModal"
      class="modal-overlay"
      @click.self="showManualPaymentModal = false"
    >
      <div class="modal">
        <h2>Pencatatan Pembayaran Manual</h2>

        <div v-if="manualPaymentTagihan" class="detail-grid">
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

        <hr class="divider" />

        <form @submit.prevent="saveManualPayment">
          <div class="form-group">
            <label>Jumlah Bayar <span class="required">*</span></label>
            <input
              v-model.number="manualPaymentForm.jumlah_bayar"
              type="number"
              class="input"
              min="1"
              :max="sisaTagihanManual"
            />
          </div>

          <div class="form-group">
            <label>Metode Pembayaran</label>
            <select v-model="manualPaymentForm.metode" class="input">
              <option value="tunai">Tunai</option>
              <option value="transfer_manual">Transfer Manual</option>
            </select>
          </div>

          <div class="form-group">
            <label>Catatan (opsional)</label>
            <textarea
              v-model="manualPaymentForm.catatan"
              class="input textarea"
              placeholder="Catatan tambahan..."
            />
          </div>

          <div v-if="manualPaymentError" class="error-text">{{ manualPaymentError }}</div>

          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="showManualPaymentModal = false">
              Batal
            </button>
            <button type="submit" class="btn btn-primary" :disabled="savingManualPayment">
              {{ savingManualPayment ? 'Menyimpan...' : 'Simpan Pembayaran' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ===== Edit Tagihan Modal ===== -->
    <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
      <div class="modal">
        <h2>Edit Tagihan</h2>

        <div v-if="editingTagihan" class="detail-grid">
          <div><strong>Siswa:</strong> {{ editingTagihan.siswa_nama }}</div>
          <div>
            <strong>Tagihan:</strong> {{ getBulanLabel(editingTagihan.bulan) }}
            {{ editingTagihan.tahun }}
          </div>
        </div>

        <hr class="divider" />

        <form @submit.prevent="saveEditTagihan">
          <div class="form-group">
            <label>Nominal <span class="required">*</span></label>
            <input v-model.number="editForm.nominal" type="number" class="input" min="1" />
          </div>

          <div class="form-group">
            <label>Tanggal Jatuh Tempo</label>
            <input v-model="editForm.tanggal_jatuh_tempo" type="date" class="input" />
          </div>

          <div v-if="editError" class="error-text">{{ editError }}</div>

          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="showEditModal = false">
              Batal
            </button>
            <button type="submit" class="btn btn-primary" :disabled="savingEdit">
              {{ savingEdit ? 'Menyimpan...' : 'Simpan' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ===== Cancel Tagihan Modal ===== -->
    <div v-if="showCancelModal" class="modal-overlay" @click.self="showCancelModal = false">
      <div class="modal">
        <h2>Batalkan Tagihan</h2>
        <p>
          Anda akan membatalkan tagihan
          <strong v-if="cancellingTagihan">
            {{ cancellingTagihan.siswa_nama }} — {{ getBulanLabel(cancellingTagihan.bulan) }}
            {{ cancellingTagihan.tahun }} </strong
          >.
        </p>

        <div class="form-group">
          <label>Alasan Pembatalan <span class="required">*</span></label>
          <textarea
            v-model="cancelReason"
            class="input textarea"
            placeholder="Contoh: Mendapat beasiswa penuh"
          />
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showCancelModal = false">Batal</button>
          <button class="btn btn-danger" :disabled="cancelling" @click="confirmCancelTagihan">
            {{ cancelling ? 'Membatalkan...' : 'Batalkan Tagihan' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: 2rem;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}
.page-header h1 {
  margin: 0;
  font-size: 1.5rem;
}

/* Tabs */
.tabs {
  display: flex;
  gap: 0;
  border-bottom: 2px solid #e5e7eb;
  margin-bottom: 1.5rem;
}
.tab {
  padding: 0.75rem 1.25rem;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition:
    color 0.15s,
    border-color 0.15s;
}
.tab:hover {
  color: #374151;
}
.tab.active {
  color: #2563eb;
  border-bottom-color: #2563eb;
}

.tab-content {
  min-height: 400px;
}

/* Card */
.card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1.5rem;
}

/* Filters */
.filters {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  align-items: center;
}
.search-input {
  min-width: 200px;
}
.input-year {
  width: 100px;
}

/* Form */
.input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}
.input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}
.textarea {
  min-height: 60px;
  resize: vertical;
  width: 100%;
}
.form-group {
  margin-bottom: 1rem;
}
.form-group label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}
.form-group .input {
  width: 100%;
}
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.required {
  color: #ef4444;
}
.divider {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 1.5rem 0 1rem;
}
.radio-group {
  display: flex;
  gap: 1.5rem;
  margin-top: 0.25rem;
}
.radio-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.875rem;
  cursor: pointer;
}

/* Table */
.table-container {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
}
th {
  font-weight: 600;
  color: #374151;
  background: #f9fafb;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}
td {
  font-size: 0.875rem;
}
.actions-cell {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.sisa-cell {
  font-weight: 600;
  color: #dc2626;
}
.json-cell pre {
  font-size: 0.7rem;
  margin: 0;
  max-width: 200px;
  overflow: auto;
  white-space: pre-wrap;
}

/* Status badges */
.status {
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
}
.status-lunas {
  background: #d1fae5;
  color: #065f46;
}
.status-cicilan {
  background: #fef3c7;
  color: #92400e;
}
.status-belum {
  background: #fee2e2;
  color: #991b1b;
}
.status-batal {
  background: #f3f4f6;
  color: #6b7280;
}

/* Buttons */
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  font-weight: 500;
}
.btn-primary {
  background: #2563eb;
  color: white;
}
.btn-primary:hover {
  background: #1d4ed8;
}
.btn-primary:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}
.btn-secondary {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
}
.btn-secondary:hover {
  background: #e5e7eb;
}
.btn-danger {
  background: #ef4444;
  color: white;
}
.btn-danger:hover {
  background: #dc2626;
}
.btn-danger:disabled {
  background: #fca5a5;
  cursor: not-allowed;
}
.btn-sm {
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: 4px;
  font-size: 0.72rem;
  cursor: pointer;
  font-weight: 500;
}
.btn-pay {
  background: #d1fae5;
  color: #065f46;
}
.btn-edit {
  background: #fef3c7;
  color: #92400e;
}
.btn-delete {
  background: #fee2e2;
  color: #991b1b;
}
.btn-view {
  background: #dbeafe;
  color: #1e40af;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.modal {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
}
.modal-lg {
  max-width: 640px;
}
.modal h2 {
  margin: 0 0 1rem;
  font-size: 1.25rem;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

/* Result */
.result-box {
  margin-top: 1.5rem;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}
.result-box h3 {
  margin: 0 0 1rem;
  font-size: 1rem;
}
.result-summary {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.result-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  min-width: 100px;
}
.result-created {
  background: #d1fae5;
}
.result-skipped {
  background: #f3f4f6;
}
.result-total {
  background: #dbeafe;
}
.result-number {
  font-size: 1.25rem;
  font-weight: 700;
}
.result-label {
  font-size: 0.72rem;
  color: #6b7280;
  margin-top: 0.25rem;
}

/* Detail grid */
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

/* Bukti preview */
.bukti-image {
  margin: 1rem 0;
  text-align: center;
}
.bukti-preview {
  max-width: 100%;
  max-height: 400px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

/* Tunggakan header */
.tunggakan-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}
.tunggakan-header h2 {
  margin: 0;
}
.total-tunggakan {
  margin-top: 0.25rem;
  font-size: 0.9rem;
  color: #6b7280;
}

/* Misc */
.empty-state {
  text-align: center;
  color: #6b7280;
  padding: 2rem;
}
.load-more {
  text-align: center;
  padding: 1rem;
}
.hint {
  color: #6b7280;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}
.error-text {
  color: #dc2626;
  font-size: 0.8rem;
  margin-bottom: 0.5rem;
}
</style>
