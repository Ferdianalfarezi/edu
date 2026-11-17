<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { StatusSiswa } from '@edu/shared';
import { api } from '@/api/client';
import { keysToCamel } from '@/api/case-transform';
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
  kelasId: string;
  kelasNama?: string;
  tahunAjaranId: string;
  tahunAjaranNama?: string;
  jenisKelamin: 'L' | 'P' | null;
  tanggalLahir: string | null;
  alamat: string | null;
  orangTuaNama?: string;
  orangTuaPhone?: string;
  status: StatusSiswa;
  tanggalKeluar?: string | null;
  alasanKeluar?: string | null;
  createdAt: string;
}

interface SiswaForm {
  nama: string;
  nisn: string;
  kelasId: string;
  jenisKelamin: 'L' | 'P' | '';
  tanggalLahir: string;
  alamat: string;
  namaWali: string;
  teleponWali: string;
  status: StatusTampil;
  alasanKeluar: string;
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
// Konflik NISN dari API (preview / import). Satu konflik saja = import dibatalkan semua.
interface ImportConflict {
  jenis: 'dobel_di_file' | 'sudah_terdaftar';
  nisn: string;
  baris: number[];
  namaCsv: string[];
  namaTerdaftar?: string;
  kelasTerdaftar?: string | null;
  statusTerdaftar?: StatusSiswa;
}
interface ImportPreviewRow {
  nama: string;
  nisn: string;
  kelas: string;
  namaWali: string;
  teleponWali: string;
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
    { key: 'status', type: 'enum', enumValues: ['aktif', 'nonaktif', 'lulus'] },
    { key: 'tahun_ajaran_id', type: 'string' },
    { key: 'jenis_kelamin', type: 'enum', enumValues: ['L', 'P'] },
  ],
});

// Shorthand refs for template v-model bindings
const filterKelas = filters['kelas_id'];
const filterStatus = filters['status'];
const filterTahunAjaran = filters['tahun_ajaran_id'];
const filterJenisKelamin = filters['jenis_kelamin'];

const showFormModal = ref(false);
const showImportModal = ref(false);
const editingSiswa = ref<Siswa | null>(null);

const form = reactive<SiswaForm>({
  nama: '',
  nisn: '',
  kelasId: '',
  jenisKelamin: '',
  tanggalLahir: '',
  alamat: '',
  namaWali: '',
  teleponWali: '',
  status: 'aktif',
  alasanKeluar: '',
});
const formErrors = ref<Record<string, string>>({});
const saving = ref(false);

const importFile = ref<File | null>(null);
const importPreview = ref<ImportPreviewRow[]>([]);
const importConflicts = ref<ImportConflict[]>([]);
const importErrors = ref<string[]>([]);
const importing = ref(false);
const importStep = ref<'upload' | 'preview' | 'conflicts' | 'done'>('upload');
const importResult = ref<{ created: number; updated: number; skipped: number } | null>(null);

// Status yang tampil di layar: 3 pilihan. 'nonaktif' = pindah_sekolah atau keluar di database
// (siswa baru yang dinonaktifkan disimpan sebagai 'keluar', detailnya di kolom alasan).
type StatusTampil = 'aktif' | 'nonaktif' | 'lulus';

const statusOptions: SelectOption[] = [
  { value: 'aktif', label: 'Aktif' },
  { value: 'nonaktif', label: 'Nonaktif' },
  { value: 'lulus', label: 'Lulus (Alumni)' },
];

function toStatusTampil(status: StatusSiswa): StatusTampil {
  if (status === StatusSiswa.AKTIF) return 'aktif';
  if (status === StatusSiswa.LULUS) return 'lulus';
  return 'nonaktif';
}

// Status untuk dikirim ke API. Kalau tetap nonaktif, status asli (pindah_sekolah/keluar) dipertahankan.
function toStatusDb(tampil: StatusTampil, asli?: StatusSiswa): StatusSiswa {
  if (tampil === 'aktif') return StatusSiswa.AKTIF;
  if (tampil === 'lulus') return StatusSiswa.LULUS;
  return asli === StatusSiswa.PINDAH_SEKOLAH ? StatusSiswa.PINDAH_SEKOLAH : StatusSiswa.KELUAR;
}

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
      meta: { page: number; pageSize: number; totalCount: number; totalPages: number };
    }>('/siswa', { params });
    siswaList.value = data.data;
    totalCount.value = data.meta.totalCount;
    totalPages.value = data.meta.totalPages;
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
watch(
  [page, pageSize, search, filterKelas, filterStatus, filterTahunAjaran, filterJenisKelamin],
  fetchSiswa,
);

function validateForm(): boolean {
  formErrors.value = {};
  if (!form.nama.trim()) formErrors.value.nama = 'Nama wajib diisi';
  if (!form.nisn.trim()) formErrors.value.nisn = 'NISN wajib diisi';
  else if (!/^\d+$/.test(form.nisn.trim())) formErrors.value.nisn = 'NISN hanya boleh berisi angka';
  if (!form.kelasId) formErrors.value.kelasId = 'Kelas wajib dipilih';
  if (!form.teleponWali.trim()) formErrors.value.teleponWali = 'Telepon wali wajib diisi';
  else if (!/^[\d+\-\s]+$/.test(form.teleponWali.trim()))
    formErrors.value.teleponWali = 'Format telepon tidak valid';
  if (!form.namaWali.trim()) formErrors.value.namaWali = 'Nama wali wajib diisi';
  return Object.keys(formErrors.value).length === 0;
}

function openCreateForm() {
  editingSiswa.value = null;
  Object.assign(form, {
    nama: '',
    nisn: '',
    kelasId: '',
    jenisKelamin: '',
    tanggalLahir: '',
    alamat: '',
    namaWali: '',
    teleponWali: '',
    status: 'aktif',
    alasanKeluar: '',
  });
  formErrors.value = {};
  showFormModal.value = true;
}

function openEditForm(siswa: Siswa) {
  editingSiswa.value = siswa;
  Object.assign(form, {
    nama: siswa.nama,
    nisn: siswa.nisn,
    kelasId: siswa.kelasId,
    jenisKelamin: siswa.jenisKelamin || '',
    tanggalLahir: siswa.tanggalLahir || '',
    alamat: siswa.alamat || '',
    namaWali: siswa.orangTuaNama || '',
    teleponWali: siswa.orangTuaPhone || '',
    status: toStatusTampil(siswa.status),
    alasanKeluar: siswa.alasanKeluar || '',
  });
  formErrors.value = {};
  showFormModal.value = true;
}

async function saveSiswa() {
  if (!validateForm()) return;
  saving.value = true;
  const payload = {
    nama: form.nama.trim(),
    nisn: form.nisn.trim(),
    kelasId: form.kelasId,
    jenisKelamin: form.jenisKelamin || undefined,
    tanggalLahir: form.tanggalLahir || undefined,
    alamat: form.alamat.trim() || undefined,
    orangTuaNama: form.namaWali.trim(),
    orangTuaPhone: form.teleponWali.trim(),
    status: toStatusDb(form.status, editingSiswa.value?.status),
    alasanKeluar: form.status === 'nonaktif' ? form.alasanKeluar.trim() : undefined,
  };
  try {
    if (editingSiswa.value) await api.patch(`/siswa/${editingSiswa.value.id}`, payload);
    else await api.post('/siswa', payload);
    showFormModal.value = false;
    await fetchSiswa();
  } catch (error) {
    if (error.response?.status === 409)
      formErrors.value.nisn = error.response?.data?.message || 'NISN sudah digunakan siswa lain';
    else console.error('Failed to save siswa:', error);
  } finally {
    saving.value = false;
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

// Template CSV import siswa. Header harus cocok dengan parseSiswaCsv di API
// (pemisah koma, tanpa BOM; kolom kelas sengaja tidak ada karena API butuh ID kelas).
function downloadImportTemplate() {
  const csv = [
    'nama,nisn,jenis_kelamin,tanggal_lahir,nama_wali,telepon_wali',
    'Budi Santoso,0012345678,L,2012-05-17,Slamet Santoso,081234567890',
    'Siti Aminah,0012345679,P,2012-08-03,Aminah Rahayu,081298765432',
  ].join('\n');
  const url = URL.createObjectURL(new Blob([csv + '\n'], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'template_import_siswa.csv';
  a.click();
  URL.revokeObjectURL(url);
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
        namaWali: namaWaliIdx !== -1 ? cols[namaWaliIdx] || '' : '',
        teleponWali: teleponWaliIdx !== -1 ? cols[teleponWaliIdx] || '' : '',
      };
    });
    importStep.value = 'preview';
  };
  reader.readAsText(file);
}

function showImportConflicts(conflicts: ImportConflict[]) {
  importConflicts.value = conflicts;
  importStep.value = 'conflicts';
}

function getImportErrorMessage(error: unknown, fallback: string): string[] {
  const message = (error as { response?: { data?: { message?: string | string[] } } }).response
    ?.data?.message;
  if (Array.isArray(message)) return message;
  return [message || fallback];
}

async function uploadCsvForImport() {
  if (!importFile.value) return;
  importing.value = true;
  importErrors.value = [];
  try {
    const formData = new FormData();
    formData.append('file', importFile.value);
    const { data } = await api.post<{ conflicts: ImportConflict[]; previewCount: number }>(
      '/siswa/import-csv/preview',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    if (data.conflicts && data.conflicts.length > 0) showImportConflicts(data.conflicts);
    else await executeImport();
  } catch (error) {
    importErrors.value = getImportErrorMessage(error, 'Gagal memproses file CSV');
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
    const { data } = await api.post<{ created: number; updated: number; skipped: number }>(
      '/siswa/import-csv',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    importResult.value = data;
    importStep.value = 'done';
    await fetchSiswa();
  } catch (error) {
    // 409 = ada konflik NISN (mis. data berubah sejak preview): tampilkan daftarnya
    const details = (error as { response?: { status?: number; data?: { details?: unknown } } })
      .response;
    const conflicts = (
      keysToCamel(details?.data?.details ?? {}) as { conflicts?: ImportConflict[] }
    ).conflicts;
    if (details?.status === 409 && conflicts?.length) showImportConflicts(conflicts);
    else importErrors.value = getImportErrorMessage(error, 'Gagal mengimport data siswa');
  } finally {
    importing.value = false;
  }
}

function resetImportUpload() {
  importFile.value = null;
  importPreview.value = [];
  importConflicts.value = [];
  importErrors.value = [];
  importStep.value = 'upload';
}
function getStatusLabel(status: StatusSiswa): string {
  return statusOptions.find((o) => o.value === toStatusTampil(status))?.label || status;
}

// Avatar helper functions for Data_Table name column
const AVATAR_GRADIENTS = [
  '#2563EB, #1D4ED8',
  '#16A34A, #15803D',
  '#D97706, #B45309',
  '#9333EA, #7E22CE',
  '#DC2626, #B91C1C',
  '#0891B2, #0E7490',
  '#4F46E5, #4338CA',
  '#EA580C, #C2410C',
];

function getInitials(nama: string): string {
  const parts = nama.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function getAvatarColor(nama: string): string {
  let hash = 0;
  for (let i = 0; i < nama.length; i++) {
    hash = nama.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

onMounted(() => {
  fetchSiswa();
  fetchKelas();
  fetchTahunAjaran();
});
</script>

<template>
  <div class="p-8">
    <PageHeader
      title="Manajemen Siswa"
      description="Kelola data siswa, import CSV, dan status kesiswaan."
    >
      <template #actions>
        <button
          class="px-[18px] py-[10px] text-[14px] font-semibold text-text-secondary bg-white border-2 border-stone-200 rounded-[8px] hover:bg-surface-warm hover:border-primary-300 hover:text-primary-700 transition-all duration-200"
          @click="openImportModal"
        >
          Import CSV
        </button>
        <button
          class="px-[18px] py-[10px] text-[14px] font-semibold text-white bg-primary-600 rounded-[8px] shadow-[0_2px_8px_rgba(37,99,235,0.3)] hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(37,99,235,0.4)] transition-all duration-200"
          @click="openCreateForm"
        >
          Tambah Siswa
        </button>
      </template>
    </PageHeader>

    <!-- Filters -->
    <div class="flex flex-wrap items-end gap-3 mb-6">
      <div class="relative w-52 min-w-[160px]">
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
          class="w-full pl-9 pr-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-[8px] bg-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
        />
      </div>
      <div class="w-44">
        <SearchSelect
          v-model="filterKelas"
          :options="kelasSelectOptions"
          placeholder="Semua Kelas"
          clearable
        />
      </div>
      <div class="w-44">
        <SearchSelect
          v-model="filterStatus"
          :options="statusOptions"
          placeholder="Semua Status"
          clearable
          :searchable="false"
        />
      </div>
      <div class="w-44">
        <SearchSelect
          v-model="filterJenisKelamin"
          :options="jenisKelaminOptions"
          placeholder="Semua Jenis Kelamin"
          clearable
          :searchable="false"
        />
      </div>
      <div class="w-52">
        <SearchSelect
          v-model="filterTahunAjaran"
          :options="tahunAjaranSelectOptions"
          placeholder="Semua Tahun Ajaran"
          clearable
        />
      </div>
    </div>

    <!-- Card Container with Section Header + Data Table -->
    <div class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden">
      <!-- Section Header -->
      <div
        class="flex items-center justify-between px-6 py-5 bg-primary-50 border-b-2 border-primary-200"
      >
        <h3 class="text-[16px] font-bold text-primary-800">Daftar Siswa</h3>
        <span class="text-[13px] font-semibold text-text-secondary"> {{ totalCount }} siswa </span>
      </div>

      <div class="overflow-x-auto">
        <table v-if="!loading && siswaList.length > 0" class="w-full">
          <thead>
            <tr class="border-b-2 border-stone-200">
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Nama
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                NISN
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Kelas
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                JK
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Wali / No. Telp
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Status
              </th>
              <th
                class="text-right px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Aksi
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-200">
            <tr
              v-for="siswa in siswaList"
              :key="siswa.id"
              class="hover:bg-primary-50 transition-colors duration-200"
            >
              <td class="px-5 py-4 text-[15px] text-text-primary">
                <div class="flex items-center gap-3">
                  <div
                    class="w-[38px] h-[38px] rounded-full flex items-center justify-center text-white text-[14px] font-bold shrink-0"
                    :style="{
                      background: `linear-gradient(135deg, ${getAvatarColor(siswa.nama)})`,
                    }"
                  >
                    {{ getInitials(siswa.nama) }}
                  </div>
                  <router-link
                    :to="'/siswa/' + siswa.id"
                    class="font-semibold text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    {{ siswa.nama }}
                  </router-link>
                </div>
              </td>
              <td class="px-5 py-4 text-[15px] text-text-secondary font-mono">{{ siswa.nisn }}</td>
              <td class="px-5 py-4 text-[15px] text-text-secondary">
                {{ siswa.kelasNama || '-' }}
              </td>
              <td class="px-5 py-4 text-[15px] text-text-secondary">
                {{ siswa.jenisKelamin === 'L' ? 'L' : siswa.jenisKelamin === 'P' ? 'P' : '-' }}
              </td>
              <td class="px-5 py-4 text-[15px] text-text-secondary">
                {{ siswa.orangTuaNama || '-' }} / {{ siswa.orangTuaPhone || '-' }}
              </td>
              <td class="px-5 py-4">
                <span
                  :class="[
                    'inline-flex items-center px-2.5 py-1 rounded-md text-[13px] font-semibold',
                    siswa.status === 'aktif' ? 'bg-success-50 text-success-700' : '',
                    siswa.status === 'pindah_sekolah' || siswa.status === 'keluar'
                      ? 'bg-danger-50 text-danger-700'
                      : '',
                    siswa.status === 'lulus' ? 'bg-primary-50 text-primary-700' : '',
                  ]"
                >
                  {{ getStatusLabel(siswa.status) }}
                </span>
              </td>
              <td class="px-5 py-4 text-right">
                <div class="flex items-center justify-end gap-1">
                  <ActionButton variant="warning" icon="edit" @click="openEditForm(siswa)"
                    >Edit</ActionButton
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
          <p class="text-[15px] text-text-tertiary mt-2">Memuat data...</p>
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
          <p class="text-[15px] text-text-tertiary">Tidak ada siswa ditemukan.</p>
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
              v-model="form.kelasId"
              :options="kelasSelectOptions"
              label="Kelas"
              placeholder="Pilih Kelas"
              :required="true"
              :error="!!formErrors.kelasId"
              :error-message="formErrors.kelasId"
            />
          </div>
          <div>
            <SearchSelect
              v-model="form.jenisKelamin"
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
              v-model="form.tanggalLahir"
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
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <SearchSelect
              v-model="form.status"
              :options="statusOptions"
              label="Status"
              :required="true"
              :searchable="false"
            />
          </div>
          <div v-if="form.status === 'nonaktif'">
            <label class="block text-sm font-medium text-text-primary mb-1.5"
              >Alasan (opsional)</label
            >
            <input
              v-model="form.alasanKeluar"
              type="text"
              maxlength="500"
              placeholder="Contoh: pindah ke SDN 2 Bandung / mengundurkan diri"
              class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
        </div>
        <p
          v-if="form.status !== 'aktif'"
          class="text-xs text-warning-700 bg-warning-50 border border-warning-100 rounded-lg px-3 py-2"
        >
          Data Siswa yang tidak aktif akan tetap tersimpan untuk riwayat.
        </p>

        <div class="border-t border-border pt-4 mt-4">
          <h3 class="text-sm font-semibold text-text-primary mb-3">Data Orang Tua / Wali</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1.5"
                >Nama Wali <span class="text-danger-500">*</span></label
              >
              <input
                v-model="form.namaWali"
                type="text"
                class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
              <p v-if="formErrors.namaWali" class="text-xs text-danger-500 mt-1">
                {{ formErrors.namaWali }}
              </p>
            </div>
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1.5"
                >Telepon Wali <span class="text-danger-500">*</span></label
              >
              <input
                v-model="form.teleponWali"
                type="text"
                placeholder="08xxxxxxxxxx"
                class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
              <p v-if="formErrors.teleponWali" class="text-xs text-danger-500 mt-1">
                {{ formErrors.teleponWali }}
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
          jenis_kelamin (L/P), tanggal_lahir (YYYY-MM-DD), nama_wali, telepon_wali. Pisahkan kolom
          dengan koma.
        </p>
        <div
          class="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-surface-50"
        >
          <p class="text-sm text-text-secondary">
            Belum punya format? Unduh template lalu isi datanya.
          </p>
          <button
            type="button"
            class="shrink-0 px-3 py-2 rounded-lg border border-border bg-white text-sm font-medium text-text-primary hover:bg-surface-100"
            @click="downloadImportTemplate"
          >
            Unduh Template CSV
          </button>
        </div>
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
        <div v-if="importErrors.length > 0" class="p-3 bg-danger-50 rounded-lg">
          <p v-for="(err, i) in importErrors" :key="i" class="text-xs text-danger-700">{{ err }}</p>
        </div>
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
                <td class="px-3 py-2">{{ row.namaWali }}</td>
                <td class="px-3 py-2">{{ row.teleponWali }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Conflicts Step: import dibatalkan semua -->
      <div v-if="importStep === 'conflicts'" class="space-y-4">
        <div class="p-3 rounded-lg bg-danger-50 border border-danger-100">
          <p class="text-sm font-semibold text-danger-700">
            Import dibatalkan: {{ importConflicts.length }} konflik NISN ditemukan
          </p>
          <p class="text-xs text-danger-700 mt-1">
            Tidak ada data yang disimpan. Perbaiki file CSV lalu upload ulang.
          </p>
        </div>
        <ul class="divide-y divide-border border border-border rounded-lg max-h-80 overflow-y-auto">
          <li v-for="(c, i) in importConflicts" :key="i" class="px-3 py-2.5 text-sm">
            <p class="text-xs text-text-tertiary mb-0.5">
              Baris {{ c.baris.join(', ') }} · {{ c.namaCsv.join(', ') }}
            </p>
            <p v-if="c.jenis === 'sudah_terdaftar'" class="text-text-primary">
              NISN <span class="font-mono font-semibold">{{ c.nisn }}</span> telah digunakan oleh
              <strong>{{ c.namaTerdaftar }}</strong>
              <template v-if="c.kelasTerdaftar">
                kelas <strong>{{ c.kelasTerdaftar }}</strong></template
              >
              dengan status
              <strong>{{ c.statusTerdaftar ? getStatusLabel(c.statusTerdaftar) : '-' }}</strong>
            </p>
            <p v-else class="text-text-primary">
              NISN <span class="font-mono font-semibold">{{ c.nisn }}</span> dipakai lebih dari
              sekali di file ini (baris {{ c.baris.join(', ') }})
            </p>
          </li>
        </ul>
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
          class="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          @click="resetImportUpload"
        >
          Upload Ulang
        </button>
      </template>
    </BaseModal>
  </div>
</template>
