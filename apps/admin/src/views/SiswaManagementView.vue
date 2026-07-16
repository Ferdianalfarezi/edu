<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { StatusSiswa } from '@edu/shared';
import { api } from '@/api/client';
import {
  PageHeader,
  BaseModal,
  SearchSelect,
  ActionButton,
  TablePagination,
} from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import { useTableUrlState } from '@/composables/useTableUrlState';

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

const siswaList = ref<Siswa[]>([]);
const kelasList = ref<Kelas[]>([]);
const tahunAjaranList = ref<TahunAjaran[]>([]);
const loading = ref(false);
const totalCount = ref(0);
const totalPages = ref(0);

const { page, pageSize, search, filters, queryParams } = useTableUrlState({
  searchKey: 'search',
  defaultPageSize: 15,
  filters: [
    { key: 'kelas_id', type: 'string' },
    { key: 'status', type: 'enum', enumValues: ['aktif', 'pindah_sekolah', 'keluar', 'alumni'] },
    { key: 'tahun_ajaran_id', type: 'string' },
  ],
});

// Shorthand refs for template v-model bindings
const filterKelas = filters['kelas_id'];
const filterStatus = filters['status'];
const filterTahunAjaran = filters['tahun_ajaran_id'];

const showFormModal = ref(false);
const showDeleteModal = ref(false);
const showImportModal = ref(false);
const editingSiswa = ref<Siswa | null>(null);
const deletingSiswa = ref<Siswa | null>(null);

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

const deleteReason = ref('');
const deleteStatus = ref<StatusSiswa>(StatusSiswa.PINDAH_SEKOLAH);

const importFile = ref<File | null>(null);
const importPreview = ref<ImportPreviewRow[]>([]);
const importConflicts = ref<ImportConflict[]>([]);
const importErrors = ref<string[]>([]);
const importing = ref(false);
const importStep = ref<'upload' | 'preview' | 'conflicts' | 'done'>('upload');
const importResult = ref<{ created: number; updated: number; skipped: number } | null>(null);

const statusOptions: SelectOption[] = [
  { value: StatusSiswa.AKTIF, label: 'Aktif' },
  { value: StatusSiswa.PINDAH_SEKOLAH, label: 'Pindah Sekolah' },
  { value: StatusSiswa.KELUAR, label: 'Keluar' },
  { value: StatusSiswa.ALUMNI, label: 'Alumni/Lulus' },
];

const deleteStatusOptions: SelectOption[] = [
  { value: StatusSiswa.PINDAH_SEKOLAH, label: 'Pindah Sekolah' },
  { value: StatusSiswa.KELUAR, label: 'Keluar' },
];

const jenisKelaminOptions: SelectOption[] = [
  { value: 'L', label: 'Laki-laki' },
  { value: 'P', label: 'Perempuan' },
];

const kelasSelectOptions = computed<SelectOption[]>(() =>
  kelasList.value.map((k) => ({ value: k.id, label: k.nama })),
);

const tahunAjaranSelectOptions = computed<SelectOption[]>(() =>
  tahunAjaranList.value.map((ta) => ({ value: ta.id, label: ta.nama })),
);

async function fetchSiswa() {
  loading.value = true;
  try {
    const params = { ...queryParams.value };
    const { data } = await api.get<{
      data: Siswa[];
      meta: { page: number; page_size: number; total_count: number; total_pages: number };
    }>('/siswa', { params });
    siswaList.value = data.data;
    totalCount.value = data.meta.total_count;
    totalPages.value = data.meta.total_pages;
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
    const { data } = await api.get<TahunAjaran[]>('/tahun-ajaran');
    tahunAjaranList.value = data;
  } catch (error) {
    console.error('Failed to fetch tahun ajaran:', error);
  }
}

// Watch composable state changes to trigger fetch
watch([page, pageSize, search, filterKelas, filterStatus, filterTahunAjaran], fetchSiswa);

function validateForm(): boolean {
  formErrors.value = {};
  if (!form.nama.trim()) formErrors.value.nama = 'Nama wajib diisi';
  if (!form.nisn.trim()) formErrors.value.nisn = 'NISN wajib diisi';
  else if (!/^\d+$/.test(form.nisn.trim())) formErrors.value.nisn = 'NISN hanya boleh berisi angka';
  if (!form.kelas_id) formErrors.value.kelas_id = 'Kelas wajib dipilih';
  if (!form.telepon_wali.trim()) formErrors.value.telepon_wali = 'Telepon wali wajib diisi';
  else if (!/^[\d+\-\s]+$/.test(form.telepon_wali.trim()))
    formErrors.value.telepon_wali = 'Format telepon tidak valid';
  if (!form.nama_wali.trim()) formErrors.value.nama_wali = 'Nama wali wajib diisi';
  return Object.keys(formErrors.value).length === 0;
}

function openCreateForm() {
  editingSiswa.value = null;
  Object.assign(form, {
    nama: '',
    nisn: '',
    kelas_id: '',
    jenis_kelamin: '',
    tanggal_lahir: '',
    alamat: '',
    nama_wali: '',
    telepon_wali: '',
  });
  formErrors.value = {};
  showFormModal.value = true;
}

function openEditForm(siswa: Siswa) {
  editingSiswa.value = siswa;
  Object.assign(form, {
    nama: siswa.nama,
    nisn: siswa.nisn,
    kelas_id: siswa.kelas_id,
    jenis_kelamin: siswa.jenis_kelamin || '',
    tanggal_lahir: siswa.tanggal_lahir || '',
    alamat: siswa.alamat || '',
    nama_wali: siswa.orang_tua_nama || '',
    telepon_wali: siswa.orang_tua_phone || '',
  });
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
    if (editingSiswa.value) await api.patch(`/siswa/${editingSiswa.value.id}`, payload);
    else await api.post('/siswa', payload);
    showFormModal.value = false;
    await fetchSiswa();
  } catch (error) {
    if (error.response?.status === 409)
      formErrors.value.nisn = 'NISN sudah terdaftar di sekolah ini';
    else console.error('Failed to save siswa:', error);
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
      importConflicts.value = data.conflicts.map((c) => ({ ...c, action: 'skip' as const }));
      importStep.value = 'conflicts';
    } else await executeImport();
  } catch (error) {
    importErrors.value = error.response?.data?.errors || ['Gagal memproses file CSV'];
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
    const resolutions = importConflicts.value.map((c) => ({ nisn: c.nisn, action: c.action }));
    formData.append('resolutions', JSON.stringify(resolutions));
    const { data } = await api.post<{ created: number; updated: number; skipped: number }>(
      '/siswa/import-csv',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    importResult.value = data;
    importStep.value = 'done';
    await fetchSiswa();
  } catch (error) {
    importErrors.value = error.response?.data?.errors || ['Gagal mengimport data siswa'];
  } finally {
    importing.value = false;
  }
}

function setAllConflictActions(action: 'update' | 'skip') {
  importConflicts.value = importConflicts.value.map((c) => ({ ...c, action }));
}
function getStatusLabel(status: StatusSiswa): string {
  return statusOptions.find((o) => o.value === status)?.label || status;
}

onMounted(() => {
  fetchSiswa();
  fetchKelas();
  fetchTahunAjaran();
});
</script>

<template>
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader
      title="Manajemen Siswa"
      description="Kelola data siswa, import CSV, dan status kesiswaan."
    >
      <template #actions>
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="openImportModal"
        >
          Import CSV
        </button>
        <button
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          @click="openCreateForm"
        >
          Tambah Siswa
        </button>
      </template>
    </PageHeader>

    <!-- Filters -->
    <div class="flex flex-wrap items-end gap-2 mb-4">
      <div class="relative w-48 min-w-[150px]">
        <svg
          class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary"
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
          placeholder="Cari nama atau NISN..."
          class="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
        />
      </div>
      <div class="w-40">
        <SearchSelect
          v-model="filterKelas"
          :options="kelasSelectOptions"
          placeholder="Semua Kelas"
          clearable
        />
      </div>
      <div class="w-40">
        <SearchSelect
          v-model="filterStatus"
          :options="statusOptions"
          placeholder="Semua Status"
          clearable
          :searchable="false"
        />
      </div>
      <div class="w-48">
        <SearchSelect
          v-model="filterTahunAjaran"
          :options="tahunAjaranSelectOptions"
          placeholder="Semua Tahun Ajaran"
          clearable
        />
      </div>
    </div>

    <!-- Table -->
    <div class="bg-white border border-border rounded-xl overflow-hidden">
      <div class="overflow-x-auto">
        <table v-if="!loading && siswaList.length > 0" class="w-full text-sm">
          <thead>
            <tr class="border-b border-border">
              <th class="text-left px-4 py-3 font-medium text-text-secondary bg-surface-50">
                Nama
              </th>
              <th class="text-left px-4 py-3 font-medium text-text-secondary bg-surface-50">
                NISN
              </th>
              <th class="text-left px-4 py-3 font-medium text-text-secondary bg-surface-50">
                Kelas
              </th>
              <th class="text-left px-4 py-3 font-medium text-text-secondary bg-surface-50">JK</th>
              <th class="text-left px-4 py-3 font-medium text-text-secondary bg-surface-50">
                Wali / No. Telp
              </th>
              <th class="text-left px-4 py-3 font-medium text-text-secondary bg-surface-50">
                Status
              </th>
              <th class="text-right px-4 py-3 font-medium text-text-secondary bg-surface-50">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr
              v-for="siswa in siswaList"
              :key="siswa.id"
              class="hover:bg-surface-50 transition-colors"
            >
              <td class="px-4 py-3 font-medium text-text-primary">
                <router-link :to="'/siswa/' + siswa.id" class="text-primary-600 hover:underline">{{
                  siswa.nama
                }}</router-link>
              </td>
              <td class="px-4 py-3 text-text-secondary font-mono text-xs">{{ siswa.nisn }}</td>
              <td class="px-4 py-3 text-text-secondary">{{ siswa.kelas_nama || '-' }}</td>
              <td class="px-4 py-3 text-text-secondary">
                {{ siswa.jenis_kelamin === 'L' ? 'L' : siswa.jenis_kelamin === 'P' ? 'P' : '-' }}
              </td>
              <td class="px-4 py-3 text-text-secondary">
                {{ siswa.orang_tua_nama || '-' }} / {{ siswa.orang_tua_phone || '-' }}
              </td>
              <td class="px-4 py-3">
                <span
                  :class="[
                    'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
                    siswa.status === 'aktif' ? 'bg-success-50 text-success-700' : '',
                    siswa.status === 'pindah_sekolah' || siswa.status === 'keluar'
                      ? 'bg-danger-50 text-danger-700'
                      : '',
                    siswa.status === 'alumni' ? 'bg-primary-50 text-primary-700' : '',
                  ]"
                >
                  {{ getStatusLabel(siswa.status) }}
                </span>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1">
                  <ActionButton variant="warning" icon="edit" @click="openEditForm(siswa)"
                    >Edit</ActionButton
                  >
                  <ActionButton
                    v-if="siswa.status === 'aktif'"
                    variant="danger"
                    icon="cancel"
                    @click="openDeleteConfirm(siswa)"
                    >Nonaktifkan</ActionButton
                  >
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Loading -->
        <div v-else-if="loading" class="p-12 text-center">
          <svg
            class="w-6 h-6 animate-spin text-primary-500 mx-auto"
            viewBox="0 0 24 24"
            fill="none"
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
          <p class="text-sm text-text-tertiary mt-2">Memuat data...</p>
        </div>

        <!-- Empty -->
        <div v-else class="p-12 text-center">
          <svg
            class="w-10 h-10 text-surface-300 mx-auto mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
          <p class="text-sm text-text-tertiary">Tidak ada siswa ditemukan.</p>
        </div>
      </div>
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

    <!-- Create/Edit Modal -->
    <BaseModal
      :show="showFormModal"
      :title="editingSiswa ? 'Edit Siswa' : 'Tambah Siswa'"
      size="lg"
      @close="showFormModal = false"
    >
      <form class="space-y-4" @submit.prevent="saveSiswa">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1.5"
              >Nama Lengkap <span class="text-danger-500">*</span></label
            >
            <input
              v-model="form.nama"
              type="text"
              class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
            <p v-if="formErrors.nama" class="text-xs text-danger-500 mt-1">{{ formErrors.nama }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1.5"
              >NISN <span class="text-danger-500">*</span></label
            >
            <input
              v-model="form.nisn"
              type="text"
              class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
            <p v-if="formErrors.nisn" class="text-xs text-danger-500 mt-1">{{ formErrors.nisn }}</p>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <SearchSelect
              v-model="form.kelas_id"
              :options="kelasSelectOptions"
              label="Kelas"
              placeholder="Pilih Kelas"
              :required="true"
              :error="!!formErrors.kelas_id"
              :error-message="formErrors.kelas_id"
            />
          </div>
          <div>
            <SearchSelect
              v-model="form.jenis_kelamin"
              :options="jenisKelaminOptions"
              label="Jenis Kelamin"
              placeholder="Pilih"
              clearable
              :searchable="false"
            />
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1.5">Tanggal Lahir</label>
            <input
              v-model="form.tanggal_lahir"
              type="date"
              class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1.5">Alamat</label>
            <input
              v-model="form.alamat"
              type="text"
              class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
        </div>

        <div class="border-t border-border pt-4 mt-4">
          <h3 class="text-sm font-semibold text-text-primary mb-3">Data Orang Tua / Wali</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1.5"
                >Nama Wali <span class="text-danger-500">*</span></label
              >
              <input
                v-model="form.nama_wali"
                type="text"
                class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
              <p v-if="formErrors.nama_wali" class="text-xs text-danger-500 mt-1">
                {{ formErrors.nama_wali }}
              </p>
            </div>
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1.5"
                >Telepon Wali <span class="text-danger-500">*</span></label
              >
              <input
                v-model="form.telepon_wali"
                type="text"
                placeholder="08xxxxxxxxxx"
                class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
              <p v-if="formErrors.telepon_wali" class="text-xs text-danger-500 mt-1">
                {{ formErrors.telepon_wali }}
              </p>
            </div>
          </div>
        </div>
      </form>
      <template #footer>
        <button
          class="px-4 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showFormModal = false"
        >
          Batal
        </button>
        <button
          :disabled="saving"
          class="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          @click="saveSiswa"
        >
          {{ saving ? 'Menyimpan...' : 'Simpan' }}
        </button>
      </template>
    </BaseModal>

    <!-- Delete Modal -->
    <BaseModal :show="showDeleteModal" title="Nonaktifkan Siswa" @close="showDeleteModal = false">
      <div class="space-y-4">
        <p class="text-sm text-text-secondary">
          Anda akan menonaktifkan siswa
          <strong class="text-text-primary">{{ deletingSiswa?.nama }}</strong
          >. Data siswa tetap tersimpan untuk keperluan riwayat.
        </p>
        <div>
          <SearchSelect
            v-model="deleteStatus"
            :options="deleteStatusOptions"
            label="Status Baru"
            :required="true"
            :searchable="false"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-text-primary mb-1.5"
            >Alasan (opsional)</label
          >
          <textarea
            v-model="deleteReason"
            rows="2"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            placeholder="Alasan nonaktifkan..."
          />
        </div>
      </div>
      <template #footer>
        <button
          class="px-4 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showDeleteModal = false"
        >
          Batal
        </button>
        <button
          class="px-4 py-2 text-sm font-medium text-white bg-danger-500 rounded-lg hover:bg-danger-700 transition-colors"
          @click="deleteSiswa"
        >
          Nonaktifkan
        </button>
      </template>
    </BaseModal>

    <!-- Import CSV Modal -->
    <BaseModal
      :show="showImportModal"
      title="Import Siswa dari CSV"
      size="xl"
      @close="showImportModal = false"
    >
      <!-- Upload Step -->
      <div v-if="importStep === 'upload'" class="space-y-4">
        <p class="text-sm text-text-secondary">
          Format CSV: kolom wajib
          <code class="px-1 py-0.5 bg-surface-100 rounded text-xs">nama</code>,
          <code class="px-1 py-0.5 bg-surface-100 rounded text-xs">nisn</code>. Kolom opsional:
          kelas, jenis_kelamin, tanggal_lahir, alamat, nama_wali, telepon_wali.
        </p>
        <div>
          <label class="block text-sm font-medium text-text-primary mb-1.5">Pilih File CSV</label>
          <input
            type="file"
            accept=".csv"
            class="w-full text-sm text-text-secondary file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-border file:bg-white file:text-sm file:font-medium file:text-text-primary hover:file:bg-surface-50"
            @change="handleFileSelect"
          />
        </div>
        <div v-if="importErrors.length > 0" class="p-3 bg-danger-50 rounded-lg">
          <p v-for="(err, i) in importErrors" :key="i" class="text-xs text-danger-700">{{ err }}</p>
        </div>
      </div>

      <!-- Preview Step -->
      <div v-if="importStep === 'preview'" class="space-y-4">
        <h3 class="text-sm font-semibold text-text-primary">Preview (maks 10 baris pertama)</h3>
        <div class="overflow-x-auto border border-border rounded-lg">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border bg-surface-50">
                <th class="px-3 py-2 text-left font-medium text-text-secondary">Nama</th>
                <th class="px-3 py-2 text-left font-medium text-text-secondary">NISN</th>
                <th class="px-3 py-2 text-left font-medium text-text-secondary">Kelas</th>
                <th class="px-3 py-2 text-left font-medium text-text-secondary">Nama Wali</th>
                <th class="px-3 py-2 text-left font-medium text-text-secondary">Telepon Wali</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="(row, i) in importPreview" :key="i">
                <td class="px-3 py-2">{{ row.nama }}</td>
                <td class="px-3 py-2 font-mono text-xs">{{ row.nisn }}</td>
                <td class="px-3 py-2">{{ row.kelas }}</td>
                <td class="px-3 py-2">{{ row.nama_wali }}</td>
                <td class="px-3 py-2">{{ row.telepon_wali }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Conflicts Step -->
      <div v-if="importStep === 'conflicts'" class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-text-primary">Konflik NISN Ditemukan</h3>
          <div class="flex gap-2">
            <button
              class="text-xs px-2 py-1 rounded border border-border hover:bg-surface-50"
              @click="setAllConflictActions('update')"
            >
              Update Semua
            </button>
            <button
              class="text-xs px-2 py-1 rounded border border-border hover:bg-surface-50"
              @click="setAllConflictActions('skip')"
            >
              Lewati Semua
            </button>
          </div>
        </div>
        <div class="overflow-x-auto border border-border rounded-lg">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border bg-surface-50">
                <th class="px-3 py-2 text-left font-medium text-text-secondary">Baris</th>
                <th class="px-3 py-2 text-left font-medium text-text-secondary">NISN</th>
                <th class="px-3 py-2 text-left font-medium text-text-secondary">Nama (CSV)</th>
                <th class="px-3 py-2 text-left font-medium text-text-secondary">Nama (Existing)</th>
                <th class="px-3 py-2 text-left font-medium text-text-secondary">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="(conflict, i) in importConflicts" :key="i">
                <td class="px-3 py-2">{{ conflict.row }}</td>
                <td class="px-3 py-2 font-mono text-xs">{{ conflict.nisn }}</td>
                <td class="px-3 py-2">{{ conflict.nama }}</td>
                <td class="px-3 py-2">{{ conflict.existing_nama }}</td>
                <td class="px-3 py-2">
                  <select
                    v-model="conflict.action"
                    class="px-2 py-1 text-xs border border-border rounded"
                  >
                    <option value="update">Update</option>
                    <option value="skip">Lewati</option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Done Step -->
      <div v-if="importStep === 'done' && importResult" class="text-center py-6">
        <div
          class="w-12 h-12 rounded-full bg-success-50 flex items-center justify-center mx-auto mb-4"
        >
          <svg
            class="w-6 h-6 text-success-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 class="text-base font-semibold text-text-primary mb-4">Import Selesai</h3>
        <div class="flex justify-center gap-6">
          <div class="text-center">
            <p class="text-2xl font-semibold text-success-700">{{ importResult.created }}</p>
            <p class="text-xs text-text-tertiary">Ditambahkan</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-semibold text-warning-700">{{ importResult.updated }}</p>
            <p class="text-xs text-text-tertiary">Diperbarui</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-semibold text-text-tertiary">{{ importResult.skipped }}</p>
            <p class="text-xs text-text-tertiary">Dilewati</p>
          </div>
        </div>
      </div>

      <template #footer>
        <button
          v-if="importStep !== 'done'"
          class="px-4 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showImportModal = false"
        >
          Batal
        </button>
        <button
          v-if="importStep === 'done'"
          class="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          @click="showImportModal = false"
        >
          Tutup
        </button>
        <button
          v-if="importStep === 'preview'"
          :disabled="importing || importErrors.length > 0"
          class="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          @click="uploadCsvForImport"
        >
          {{ importing ? 'Memproses...' : 'Proses Import' }}
        </button>
        <button
          v-if="importStep === 'conflicts'"
          :disabled="importing"
          class="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          @click="executeImport"
        >
          {{ importing ? 'Mengimport...' : 'Konfirmasi Import' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
