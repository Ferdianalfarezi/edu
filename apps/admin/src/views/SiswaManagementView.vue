<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { StatusSiswa } from '@edu/shared';
import type { PaginatedResponse } from '@edu/shared';
import { api } from '@/api/client';

interface Siswa {
  id: string;
  nama: string;
  nisn: string;
  kelas_id: string;
  kelas_nama?: string;
  tahun_ajaran_id: string;
  tahun_ajaran_nama?: string;
  jenis_kelamin: 'L' | 'P' | null;
  tanggal_lahir: string | null;
  alamat: string | null;
  orang_tua_nama?: string;
  orang_tua_phone?: string;
  status: StatusSiswa;
  created_at: string;
}

interface SiswaForm {
  nama: string;
  nisn: string;
  kelas_id: string;
  jenis_kelamin: 'L' | 'P' | '';
  tanggal_lahir: string;
  alamat: string;
  nama_wali: string;
  telepon_wali: string;
}

interface Kelas {
  id: string;
  nama: string;
  tingkat: number;
}

interface TahunAjaran {
  id: string;
  nama: string;
  status: string;
}

interface ImportConflict {
  row: number;
  nisn: string;
  nama: string;
  existing_nama: string;
  action: 'update' | 'skip';
}

interface ImportPreviewRow {
  nama: string;
  nisn: string;
  kelas: string;
  nama_wali: string;
  telepon_wali: string;
}

// Data
const siswaList = ref<Siswa[]>([]);
const kelasList = ref<Kelas[]>([]);
const tahunAjaranList = ref<TahunAjaran[]>([]);
const loading = ref(false);
const totalCount = ref(0);

// Pagination
const cursor = ref<string | null>(null);
const hasNext = ref(false);
const pageSize = 20;

// Filters
const search = ref('');
const filterKelas = ref('');
const filterStatus = ref<StatusSiswa | ''>('');
const filterTahunAjaran = ref('');

// Modal state
const showFormModal = ref(false);
const showDeleteModal = ref(false);
const showImportModal = ref(false);
const editingSiswa = ref<Siswa | null>(null);
const deletingSiswa = ref<Siswa | null>(null);

// Form
const form = reactive<SiswaForm>({
  nama: '',
  nisn: '',
  kelas_id: '',
  jenis_kelamin: '',
  tanggal_lahir: '',
  alamat: '',
  nama_wali: '',
  telepon_wali: '',
});
const formErrors = ref<Record<string, string>>({});
const saving = ref(false);

// Delete form
const deleteReason = ref('');
const deleteStatus = ref<StatusSiswa>(StatusSiswa.PINDAH_SEKOLAH);

// CSV Import state
const importFile = ref<File | null>(null);
const importPreview = ref<ImportPreviewRow[]>([]);
const importConflicts = ref<ImportConflict[]>([]);
const importErrors = ref<string[]>([]);
const importing = ref(false);
const importStep = ref<'upload' | 'preview' | 'conflicts' | 'done'>('upload');
const importResult = ref<{ created: number; updated: number; skipped: number } | null>(null);

const statusOptions = [
  { value: StatusSiswa.AKTIF, label: 'Aktif' },
  { value: StatusSiswa.PINDAH_SEKOLAH, label: 'Pindah Sekolah' },
  { value: StatusSiswa.KELUAR, label: 'Keluar' },
  { value: StatusSiswa.ALUMNI, label: 'Alumni/Lulus' },
];

const deleteStatusOptions = [
  { value: StatusSiswa.PINDAH_SEKOLAH, label: 'Pindah Sekolah' },
  { value: StatusSiswa.KELUAR, label: 'Keluar' },
];

// Fetch functions
async function fetchSiswa(resetCursor = true) {
  loading.value = true;
  if (resetCursor) {
    cursor.value = null;
  }
  try {
    const params: Record<string, string | number> = { limit: pageSize };
    if (cursor.value) params.cursor = cursor.value;
    if (search.value) params.search = search.value;
    if (filterKelas.value) params.kelas_id = filterKelas.value;
    if (filterStatus.value) params.status = filterStatus.value;
    if (filterTahunAjaran.value) params.tahun_ajaran_id = filterTahunAjaran.value;

    const { data } = await api.get<PaginatedResponse<Siswa>>('/siswa', { params });
    if (resetCursor) {
      siswaList.value = data.data;
    } else {
      siswaList.value = [...siswaList.value, ...data.data];
    }
    hasNext.value = data.meta.has_next;
    cursor.value = data.meta.cursor;
    if (data.meta.total !== undefined) {
      totalCount.value = data.meta.total;
    }
  } catch (error) {
    console.error('Failed to fetch siswa:', error);
  } finally {
    loading.value = false;
  }
}

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

function loadMore() {
  if (hasNext.value && !loading.value) {
    fetchSiswa(false);
  }
}

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
watch(search, () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => fetchSiswa(), 300);
});

watch([filterKelas, filterStatus, filterTahunAjaran], () => {
  fetchSiswa();
});

// Form functions
function validateForm(): boolean {
  formErrors.value = {};

  if (!form.nama.trim()) {
    formErrors.value.nama = 'Nama wajib diisi';
  }
  if (!form.nisn.trim()) {
    formErrors.value.nisn = 'NISN wajib diisi';
  } else if (!/^\d+$/.test(form.nisn.trim())) {
    formErrors.value.nisn = 'NISN hanya boleh berisi angka';
  }
  if (!form.kelas_id) {
    formErrors.value.kelas_id = 'Kelas wajib dipilih';
  }
  if (!form.telepon_wali.trim()) {
    formErrors.value.telepon_wali = 'Telepon wali wajib diisi';
  } else if (!/^[\d+\-\s]+$/.test(form.telepon_wali.trim())) {
    formErrors.value.telepon_wali = 'Format telepon tidak valid';
  }
  if (!form.nama_wali.trim()) {
    formErrors.value.nama_wali = 'Nama wali wajib diisi';
  }

  return Object.keys(formErrors.value).length === 0;
}

function openCreateForm() {
  editingSiswa.value = null;
  form.nama = '';
  form.nisn = '';
  form.kelas_id = '';
  form.jenis_kelamin = '';
  form.tanggal_lahir = '';
  form.alamat = '';
  form.nama_wali = '';
  form.telepon_wali = '';
  formErrors.value = {};
  showFormModal.value = true;
}

function openEditForm(siswa: Siswa) {
  editingSiswa.value = siswa;
  form.nama = siswa.nama;
  form.nisn = siswa.nisn;
  form.kelas_id = siswa.kelas_id;
  form.jenis_kelamin = siswa.jenis_kelamin || '';
  form.tanggal_lahir = siswa.tanggal_lahir || '';
  form.alamat = siswa.alamat || '';
  form.nama_wali = siswa.orang_tua_nama || '';
  form.telepon_wali = siswa.orang_tua_phone || '';
  formErrors.value = {};
  showFormModal.value = true;
}

function openDeleteConfirm(siswa: Siswa) {
  deletingSiswa.value = siswa;
  deleteReason.value = '';
  deleteStatus.value = StatusSiswa.PINDAH_SEKOLAH;
  showDeleteModal.value = true;
}

async function saveSiswa() {
  if (!validateForm()) return;

  saving.value = true;
  const payload = {
    nama: form.nama.trim(),
    nisn: form.nisn.trim(),
    kelas_id: form.kelas_id,
    jenis_kelamin: form.jenis_kelamin || undefined,
    tanggal_lahir: form.tanggal_lahir || undefined,
    alamat: form.alamat.trim() || undefined,
    nama_wali: form.nama_wali.trim(),
    telepon_wali: form.telepon_wali.trim(),
  };

  try {
    if (editingSiswa.value) {
      await api.patch(`/siswa/${editingSiswa.value.id}`, payload);
    } else {
      await api.post('/siswa', payload);
    }
    showFormModal.value = false;
    await fetchSiswa();
  } catch (error: any) {
    if (error.response?.status === 409) {
      formErrors.value.nisn = 'NISN sudah terdaftar di sekolah ini';
    } else {
      console.error('Failed to save siswa:', error);
    }
  } finally {
    saving.value = false;
  }
}

async function deleteSiswa() {
  if (!deletingSiswa.value) return;

  try {
    await api.patch(`/siswa/${deletingSiswa.value.id}/soft-delete`, {
      status: deleteStatus.value,
      alasan: deleteReason.value.trim() || undefined,
    });
    showDeleteModal.value = false;
    deletingSiswa.value = null;
    await fetchSiswa();
  } catch (error) {
    console.error('Failed to delete siswa:', error);
  }
}

// CSV Import functions
function openImportModal() {
  importFile.value = null;
  importPreview.value = [];
  importConflicts.value = [];
  importErrors.value = [];
  importStep.value = 'upload';
  importResult.value = null;
  showImportModal.value = true;
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  if (!file.name.endsWith('.csv')) {
    importErrors.value = ['File harus berformat CSV'];
    return;
  }

  importFile.value = file;
  importErrors.value = [];

  // Parse CSV for local preview
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result as string;
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length < 2) {
      importErrors.value = ['File harus memiliki header dan minimal 1 baris data'];
      return;
    }

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const namaIdx = header.indexOf('nama');
    const nisnIdx = header.indexOf('nisn');
    const kelasIdx = header.indexOf('kelas');
    const namaWaliIdx = header.indexOf('nama_wali');
    const teleponWaliIdx = header.indexOf('telepon_wali');

    if (namaIdx === -1 || nisnIdx === -1) {
      importErrors.value = ['Kolom wajib: nama, nisn'];
      return;
    }

    importErrors.value = [];
    importPreview.value = lines.slice(1, 11).map((line) => {
      const cols = line.split(',').map((c) => c.trim());
      return {
        nama: cols[namaIdx] || '',
        nisn: cols[nisnIdx] || '',
        kelas: kelasIdx !== -1 ? cols[kelasIdx] || '' : '',
        nama_wali: namaWaliIdx !== -1 ? cols[namaWaliIdx] || '' : '',
        telepon_wali: teleponWaliIdx !== -1 ? cols[teleponWaliIdx] || '' : '',
      };
    });
    importStep.value = 'preview';
  };
  reader.readAsText(file);
}

async function uploadCsvForImport() {
  if (!importFile.value) return;
  importing.value = true;

  try {
    const formData = new FormData();
    formData.append('file', importFile.value);

    const { data } = await api.post<{
      conflicts: ImportConflict[];
      preview_count: number;
      valid_count: number;
    }>('/siswa/import-csv/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    if (data.conflicts && data.conflicts.length > 0) {
      importConflicts.value = data.conflicts.map((c) => ({
        ...c,
        action: 'skip' as const,
      }));
      importStep.value = 'conflicts';
    } else {
      // No conflicts, proceed to import
      await executeImport();
    }
  } catch (error: any) {
    if (error.response?.data?.errors) {
      importErrors.value = error.response.data.errors;
    } else {
      importErrors.value = ['Gagal memproses file CSV'];
    }
  } finally {
    importing.value = false;
  }
}

async function executeImport() {
  if (!importFile.value) return;
  importing.value = true;

  try {
    const formData = new FormData();
    formData.append('file', importFile.value);

    // Send conflict resolutions
    const resolutions = importConflicts.value.map((c) => ({
      nisn: c.nisn,
      action: c.action,
    }));
    formData.append('resolutions', JSON.stringify(resolutions));

    const { data } = await api.post<{
      created: number;
      updated: number;
      skipped: number;
    }>('/siswa/import-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    importResult.value = data;
    importStep.value = 'done';
    await fetchSiswa();
  } catch (error: any) {
    if (error.response?.data?.errors) {
      importErrors.value = error.response.data.errors;
    } else {
      importErrors.value = ['Gagal mengimport data siswa'];
    }
  } finally {
    importing.value = false;
  }
}

function setAllConflictActions(action: 'update' | 'skip') {
  importConflicts.value = importConflicts.value.map((c) => ({ ...c, action }));
}

function getStatusLabel(status: StatusSiswa): string {
  const found = statusOptions.find((o) => o.value === status);
  return found?.label || status;
}

function getStatusClass(status: StatusSiswa): string {
  switch (status) {
    case StatusSiswa.AKTIF:
      return 'status-active';
    case StatusSiswa.PINDAH_SEKOLAH:
    case StatusSiswa.KELUAR:
      return 'status-inactive';
    case StatusSiswa.ALUMNI:
      return 'status-alumni';
    default:
      return '';
  }
}

onMounted(() => {
  fetchSiswa();
  fetchKelas();
  fetchTahunAjaran();
});
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Manajemen Siswa</h1>
      <div class="actions">
        <button class="btn btn-secondary" @click="openImportModal">Import CSV</button>
        <button class="btn btn-primary" @click="openCreateForm">Tambah Siswa</button>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters">
      <input
        v-model="search"
        type="text"
        placeholder="Cari nama atau NISN..."
        class="input search-input"
      />
      <select v-model="filterKelas" class="input">
        <option value="">Semua Kelas</option>
        <option v-for="kelas in kelasList" :key="kelas.id" :value="kelas.id">
          {{ kelas.nama }}
        </option>
      </select>
      <select v-model="filterStatus" class="input">
        <option value="">Semua Status</option>
        <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
      <select v-model="filterTahunAjaran" class="input">
        <option value="">Semua Tahun Ajaran</option>
        <option v-for="ta in tahunAjaranList" :key="ta.id" :value="ta.id">
          {{ ta.nama }}
        </option>
      </select>
    </div>

    <!-- Table -->
    <div class="table-container">
      <table v-if="!loading && siswaList.length > 0">
        <thead>
          <tr>
            <th>Nama</th>
            <th>NISN</th>
            <th>Kelas</th>
            <th>Jenis Kelamin</th>
            <th>Wali</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="siswa in siswaList" :key="siswa.id">
            <td>{{ siswa.nama }}</td>
            <td>{{ siswa.nisn }}</td>
            <td>{{ siswa.kelas_nama || '-' }}</td>
            <td>
              {{
                siswa.jenis_kelamin === 'L'
                  ? 'Laki-laki'
                  : siswa.jenis_kelamin === 'P'
                    ? 'Perempuan'
                    : '-'
              }}
            </td>
            <td>{{ siswa.orang_tua_nama || '-' }}</td>
            <td>
              <span :class="['status', getStatusClass(siswa.status)]">
                {{ getStatusLabel(siswa.status) }}
              </span>
            </td>
            <td class="actions-cell">
              <button class="btn-sm btn-edit" @click="openEditForm(siswa)">Edit</button>
              <button
                v-if="siswa.status === 'aktif'"
                class="btn-sm btn-delete"
                @click="openDeleteConfirm(siswa)"
              >
                Nonaktifkan
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="loading" class="empty-state">Memuat data...</p>
      <p v-else class="empty-state">Tidak ada siswa ditemukan.</p>

      <!-- Load More -->
      <div v-if="hasNext && !loading" class="load-more">
        <button class="btn btn-secondary" @click="loadMore">Muat Lebih Banyak</button>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showFormModal" class="modal-overlay" @click.self="showFormModal = false">
      <div class="modal modal-lg">
        <h2>{{ editingSiswa ? 'Edit Siswa' : 'Tambah Siswa' }}</h2>
        <form @submit.prevent="saveSiswa">
          <div class="form-row">
            <div class="form-group">
              <label>Nama Lengkap <span class="required">*</span></label>
              <input v-model="form.nama" type="text" class="input" />
              <span v-if="formErrors.nama" class="error-text">{{ formErrors.nama }}</span>
            </div>
            <div class="form-group">
              <label>NISN <span class="required">*</span></label>
              <input v-model="form.nisn" type="text" class="input" />
              <span v-if="formErrors.nisn" class="error-text">{{ formErrors.nisn }}</span>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Kelas <span class="required">*</span></label>
              <select v-model="form.kelas_id" class="input">
                <option value="" disabled>Pilih Kelas</option>
                <option v-for="kelas in kelasList" :key="kelas.id" :value="kelas.id">
                  {{ kelas.nama }}
                </option>
              </select>
              <span v-if="formErrors.kelas_id" class="error-text">{{ formErrors.kelas_id }}</span>
            </div>
            <div class="form-group">
              <label>Jenis Kelamin</label>
              <select v-model="form.jenis_kelamin" class="input">
                <option value="">Pilih</option>
                <option value="L">Laki-laki</option>
                <option value="P">Perempuan</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Tanggal Lahir</label>
              <input v-model="form.tanggal_lahir" type="date" class="input" />
            </div>
            <div class="form-group">
              <label>Alamat</label>
              <input v-model="form.alamat" type="text" class="input" />
            </div>
          </div>

          <hr class="divider" />
          <h3 class="section-title">Data Orang Tua / Wali</h3>

          <div class="form-row">
            <div class="form-group">
              <label>Nama Wali <span class="required">*</span></label>
              <input v-model="form.nama_wali" type="text" class="input" />
              <span v-if="formErrors.nama_wali" class="error-text">{{ formErrors.nama_wali }}</span>
            </div>
            <div class="form-group">
              <label>Telepon Wali <span class="required">*</span></label>
              <input
                v-model="form.telepon_wali"
                type="text"
                placeholder="08xxxxxxxxxx"
                class="input"
              />
              <span v-if="formErrors.telepon_wali" class="error-text">{{
                formErrors.telepon_wali
              }}</span>
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="showFormModal = false">
              Batal
            </button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'Menyimpan...' : 'Simpan' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete (Soft-Delete) Confirmation Modal -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
      <div class="modal">
        <h2>Nonaktifkan Siswa</h2>
        <p>
          Anda akan menonaktifkan siswa <strong>{{ deletingSiswa?.nama }}</strong
          >. Data siswa tetap tersimpan untuk keperluan riwayat.
        </p>

        <div class="form-group">
          <label>Status Baru <span class="required">*</span></label>
          <select v-model="deleteStatus" class="input">
            <option v-for="opt in deleteStatusOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>Alasan</label>
          <textarea v-model="deleteReason" class="input textarea" placeholder="Alasan (opsional)" />
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showDeleteModal = false">Batal</button>
          <button class="btn btn-danger" @click="deleteSiswa">Nonaktifkan</button>
        </div>
      </div>
    </div>

    <!-- Import CSV Modal -->
    <div v-if="showImportModal" class="modal-overlay" @click.self="showImportModal = false">
      <div class="modal modal-xl">
        <h2>Import Siswa dari CSV</h2>

        <!-- Step: Upload -->
        <div v-if="importStep === 'upload'">
          <p class="hint">
            Format CSV: kolom wajib <code>nama</code>, <code>nisn</code>. Kolom opsional:
            <code>kelas</code>, <code>jenis_kelamin</code>, <code>tanggal_lahir</code>,
            <code>alamat</code>, <code>nama_wali</code>, <code>telepon_wali</code>.
          </p>

          <div class="form-group">
            <label>Pilih File CSV</label>
            <input type="file" accept=".csv" @change="handleFileSelect" class="input" />
          </div>

          <div v-if="importErrors.length > 0" class="errors">
            <p v-for="(err, i) in importErrors" :key="i" class="error-text">{{ err }}</p>
          </div>
        </div>

        <!-- Step: Preview -->
        <div v-if="importStep === 'preview'">
          <h3>Preview (maks 10 baris pertama)</h3>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>NISN</th>
                  <th>Kelas</th>
                  <th>Nama Wali</th>
                  <th>Telepon Wali</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in importPreview" :key="i">
                  <td>{{ row.nama }}</td>
                  <td>{{ row.nisn }}</td>
                  <td>{{ row.kelas }}</td>
                  <td>{{ row.nama_wali }}</td>
                  <td>{{ row.telepon_wali }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="importErrors.length > 0" class="errors">
            <p v-for="(err, i) in importErrors" :key="i" class="error-text">{{ err }}</p>
          </div>
        </div>

        <!-- Step: Conflicts -->
        <div v-if="importStep === 'conflicts'">
          <h3>Konflik NISN Ditemukan</h3>
          <p class="hint">Beberapa NISN sudah terdaftar. Pilih aksi untuk setiap konflik:</p>

          <div class="conflict-actions-bulk">
            <button class="btn btn-sm btn-secondary" @click="setAllConflictActions('update')">
              Update Semua
            </button>
            <button class="btn btn-sm btn-secondary" @click="setAllConflictActions('skip')">
              Lewati Semua
            </button>
          </div>

          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Baris</th>
                  <th>NISN</th>
                  <th>Nama (CSV)</th>
                  <th>Nama (Existing)</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(conflict, i) in importConflicts" :key="i">
                  <td>{{ conflict.row }}</td>
                  <td>{{ conflict.nisn }}</td>
                  <td>{{ conflict.nama }}</td>
                  <td>{{ conflict.existing_nama }}</td>
                  <td>
                    <select v-model="conflict.action" class="input input-sm">
                      <option value="update">Update</option>
                      <option value="skip">Lewati</option>
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Step: Done -->
        <div v-if="importStep === 'done' && importResult">
          <div class="import-result">
            <h3>Import Selesai</h3>
            <div class="result-summary">
              <div class="result-item result-created">
                <span class="result-number">{{ importResult.created }}</span>
                <span class="result-label">Ditambahkan</span>
              </div>
              <div class="result-item result-updated">
                <span class="result-number">{{ importResult.updated }}</span>
                <span class="result-label">Diperbarui</span>
              </div>
              <div class="result-item result-skipped">
                <span class="result-number">{{ importResult.skipped }}</span>
                <span class="result-label">Dilewati</span>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button
            v-if="importStep !== 'done'"
            class="btn btn-secondary"
            @click="showImportModal = false"
          >
            Batal
          </button>
          <button
            v-if="importStep === 'done'"
            class="btn btn-primary"
            @click="showImportModal = false"
          >
            Tutup
          </button>
          <button
            v-if="importStep === 'preview'"
            class="btn btn-primary"
            :disabled="importing || importErrors.length > 0"
            @click="uploadCsvForImport"
          >
            {{ importing ? 'Memproses...' : 'Proses Import' }}
          </button>
          <button
            v-if="importStep === 'conflicts'"
            class="btn btn-primary"
            :disabled="importing"
            @click="executeImport"
          >
            {{ importing ? 'Mengimport...' : 'Konfirmasi Import' }}
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
.actions {
  display: flex;
  gap: 0.5rem;
}
.filters {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
.search-input {
  min-width: 200px;
}
.input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}
.input-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}
.textarea {
  min-height: 60px;
  resize: vertical;
}
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
}
.status {
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}
.status-active {
  background: #d1fae5;
  color: #065f46;
}
.status-inactive {
  background: #fee2e2;
  color: #991b1b;
}
.status-alumni {
  background: #e0e7ff;
  color: #3730a3;
}
.actions-cell {
  display: flex;
  gap: 0.5rem;
}
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
.btn-danger {
  background: #ef4444;
  color: white;
}
.btn-sm {
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
}
.btn-edit {
  background: #fef3c7;
  color: #92400e;
}
.btn-delete {
  background: #fee2e2;
  color: #991b1b;
}
.empty-state {
  text-align: center;
  color: #6b7280;
  padding: 2rem;
}
.load-more {
  text-align: center;
  padding: 1rem;
}
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
.modal-xl {
  max-width: 800px;
}
.modal h2 {
  margin: 0 0 1rem;
  font-size: 1.25rem;
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
.section-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0 0 1rem;
  color: #374151;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}
.hint {
  color: #6b7280;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}
.errors {
  margin-top: 0.5rem;
}
.error-text {
  color: #dc2626;
  font-size: 0.75rem;
  display: block;
  margin-top: 0.25rem;
}
.conflict-actions-bulk {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.import-result {
  text-align: center;
  padding: 1rem 0;
}
.result-summary {
  display: flex;
  justify-content: center;
  gap: 2rem;
  margin-top: 1rem;
}
.result-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem;
  border-radius: 8px;
  min-width: 100px;
}
.result-created {
  background: #d1fae5;
}
.result-updated {
  background: #fef3c7;
}
.result-skipped {
  background: #f3f4f6;
}
.result-number {
  font-size: 1.5rem;
  font-weight: 700;
}
.result-label {
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.25rem;
}
</style>
