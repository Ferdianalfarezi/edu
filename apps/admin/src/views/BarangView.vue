<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { Role } from '@edu/shared';
import { api } from '@/api/client';
import { PageHeader, BaseModal, ActionButton, TablePagination } from '@/components/ui';
import { useTableUrlState } from '@/composables/useTableUrlState';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';

interface Barang {
  id: string;
  nama: string;
  deskripsi: string | null;
  jumlah: number;
  lokasi: string | null;
  kondisiBarang: string | null;
  sumberDana: string | null;
  kategori: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BarangForm {
  nama: string;
  deskripsi: string;
  jumlah: number | string;
  lokasi: string;
  kondisiBarang: string;
  sumberDana: string;
  kategori: string;
}

interface PaginatedResponse {
  data: Barang[];
  meta: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

interface ImportSkippedItem {
  baris: number;
  nama: string;
  alasan: string;
}

interface ImportResult {
  berhasilDitambahkan: number;
  dilewati: ImportSkippedItem[];
}

const authStore = useAuthStore();
const toast = useToast();
const isAdmin = authStore.hasRole(Role.ADMIN);

const { page, pageSize, search, queryParams } = useTableUrlState({
  searchKey: 'search',
  defaultPageSize: 15,
});

const barangList = ref<Barang[]>([]);
const loading = ref(false);
const totalCount = ref(0);
const totalPages = ref(0);

const showFormModal = ref(false);
const showDeleteModal = ref(false);
const editingBarang = ref<Barang | null>(null);
const deletingBarang = ref<Barang | null>(null);
const saving = ref(false);
const deleting = ref(false);
const formError = ref('');

const KONDISI_OPTIONS = [
  { value: 'bagus', label: 'Bagus' },
  { value: 'perlu_perbaikan', label: 'Perlu Perbaikan' },
  { value: 'rusak', label: 'Rusak' },
];

const SUMBER_DANA_OPTIONS = [
  { value: 'yayasan', label: 'Yayasan' },
  { value: 'unit_sekolah', label: 'Unit Sekolah' },
  { value: 'bos', label: 'BOS' },
];

const KATEGORI_OPTIONS = [
  { value: 'peralatan', label: 'Peralatan' },
  { value: 'perlengkapan', label: 'Perlengkapan' },
];

function labelKondisi(value: string | null): string {
  return KONDISI_OPTIONS.find((o) => o.value === value)?.label ?? (value || '-');
}

function labelSumberDana(value: string | null): string {
  return SUMBER_DANA_OPTIONS.find((o) => o.value === value)?.label ?? (value || '-');
}

function labelKategori(value: string | null): string {
  return KATEGORI_OPTIONS.find((o) => o.value === value)?.label ?? (value || '-');
}

const formErrors = reactive<Record<string, string>>({});

const form = reactive<BarangForm>({
  nama: '',
  deskripsi: '',
  jumlah: 0,
  lokasi: '',
  kondisiBarang: '',
  sumberDana: '',
  kategori: '',
});

// ===== Import/Export State =====
const exporting = ref(false);
const importing = ref(false);
const importFileInputRef = ref<HTMLInputElement | null>(null);
const importResult = ref<ImportResult | null>(null);
const showImportResultModal = ref(false);

async function fetchBarang() {
  loading.value = true;
  try {
    const { data } = await api.get<PaginatedResponse>('/barang', { params: queryParams.value });
    barangList.value = data.data;
    totalCount.value = data.meta.totalCount;
    totalPages.value = data.meta.totalPages;
  } catch {
    barangList.value = [];
  } finally {
    loading.value = false;
  }
}

watch([page, pageSize, search], fetchBarang);

function openCreateForm() {
  editingBarang.value = null;
  Object.assign(form, {
    nama: '',
    deskripsi: '',
    jumlah: 0,
    lokasi: '',
    kondisiBarang: '',
    sumberDana: '',
    kategori: '',
  });
  formError.value = '';
  Object.keys(formErrors).forEach((k) => delete formErrors[k]);
  showFormModal.value = true;
}

function openEditForm(barang: Barang) {
  editingBarang.value = barang;
  Object.assign(form, {
    nama: barang.nama,
    deskripsi: barang.deskripsi || '',
    jumlah: barang.jumlah,
    lokasi: barang.lokasi || '',
    kondisiBarang: barang.kondisiBarang || '',
    sumberDana: barang.sumberDana || '',
    kategori: barang.kategori || '',
  });
  formError.value = '';
  Object.keys(formErrors).forEach((k) => delete formErrors[k]);
  showFormModal.value = true;
}

function openDeleteConfirm(barang: Barang) {
  deletingBarang.value = barang;
  showDeleteModal.value = true;
}

async function saveBarang() {
  formError.value = '';

  // Validate required enum fields
  Object.keys(formErrors).forEach((k) => delete formErrors[k]);
  if (!form.kondisiBarang) formErrors.kondisiBarang = 'Kondisi barang wajib dipilih';
  if (!form.sumberDana) formErrors.sumberDana = 'Sumber dana wajib dipilih';
  if (!form.kategori) formErrors.kategori = 'Kategori wajib dipilih';
  if (Object.keys(formErrors).length > 0) return;

  const payload = {
    nama: form.nama.trim(),
    deskripsi: form.deskripsi.trim() || undefined,
    jumlah: Number(form.jumlah),
    lokasi: form.lokasi.trim() || undefined,
    // API DTO pakai snake_case (request tidak dikonversi otomatis, hanya response)
    kondisi_barang: form.kondisiBarang || undefined,
    sumber_dana: form.sumberDana || undefined,
    kategori: form.kategori || undefined,
  };

  saving.value = true;
  try {
    if (editingBarang.value) {
      await api.patch(`/barang/${editingBarang.value.id}`, payload);
      toast.success('Barang berhasil diperbarui');
    } else {
      await api.post('/barang', payload);
      toast.success('Barang berhasil ditambahkan');
    }
    showFormModal.value = false;
    await fetchBarang();
  } catch (err: any) {
    const msg = err.response?.data?.message;
    formError.value = Array.isArray(msg) ? msg.join(', ') : msg || 'Gagal menyimpan barang.';
    // Toast error sudah ditampilkan otomatis oleh api client
  } finally {
    saving.value = false;
  }
}

async function deleteBarang() {
  if (!deletingBarang.value) return;
  deleting.value = true;
  try {
    await api.delete(`/barang/${deletingBarang.value.id}`);
    toast.success('Barang berhasil dihapus');
    showDeleteModal.value = false;
    deletingBarang.value = null;
    await fetchBarang();
  } catch {
    // Toast error sudah ditampilkan otomatis oleh api client
  } finally {
    deleting.value = false;
  }
}

// ===== Export Excel =====
async function exportXlsx() {
  exporting.value = true;
  try {
    // Pass current active filters (search + other query params) to export
    const response = await api.get('/barang/export', {
      params: queryParams.value,
      responseType: 'blob',
    });
    const url = URL.createObjectURL(response.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'barang_export.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    // Toast error sudah ditampilkan otomatis oleh api client
  } finally {
    exporting.value = false;
  }
}

// ===== Import Excel =====
function triggerImportFile() {
  importFileInputRef.value?.click();
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // Reset so re-selecting the same file still fires the change event
  input.value = '';

  if (!file) return;

  const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
  if (file.size > MAX_SIZE) {
    toast.error('Ukuran file maksimum 5 MB');
    return;
  }

  importing.value = true;
  try {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post<ImportResult>('/barang/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    importResult.value = data;
    showImportResultModal.value = true;
    await fetchBarang();
  } catch {
    // Toast error sudah ditampilkan otomatis oleh api client
  } finally {
    importing.value = false;
  }
}

// ===== Template Download =====
function downloadTemplate() {
  const a = document.createElement('a');
  a.href = '/Template_TemanSekolah.xlsx';
  a.download = 'Template_TemanSekolah.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatNumber(num: number): string {
  return num.toLocaleString('id-ID');
}

onMounted(fetchBarang);
</script>

<template>
  <div class="p-8 max-w-7xl mx-auto">
    <PageHeader title="Inventaris Barang">
      <template #actions>
        <!-- Hidden file input for import -->
        <input
          ref="importFileInputRef"
          type="file"
          accept=".xlsx"
          class="hidden"
          @change="handleImportFile"
        />
        <ActionButton variant="neutral" icon="none" :disabled="importing" @click="downloadTemplate">
          <svg
            class="w-4 h-4 mr-1.5 inline-block"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.75"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Unduh Template
        </ActionButton>
        <ActionButton
          v-if="isAdmin"
          variant="neutral"
          icon="none"
          :disabled="importing"
          @click="triggerImportFile"
        >
          <svg
            class="w-4 h-4 mr-1.5 inline-block"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.75"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12"
            />
          </svg>
          {{ importing ? 'Mengimpor...' : 'Import Excel' }}
        </ActionButton>
        <ActionButton variant="neutral" icon="none" :disabled="exporting" @click="exportXlsx">
          <svg
            class="w-4 h-4 mr-1.5 inline-block"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.75"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          {{ exporting ? 'Mengekspor...' : 'Ekspor Excel' }}
        </ActionButton>
        <ActionButton v-if="isAdmin" variant="primary" icon="none" @click="openCreateForm">
          Tambah Barang
        </ActionButton>
      </template>
    </PageHeader>

    <!-- Search -->
    <div class="flex items-center gap-3 mb-5">
      <div class="relative w-72">
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
          placeholder="Cari nama barang..."
          class="w-full pl-9 pr-3 py-2.5 text-[15px] border-2 border-border rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
        />
      </div>
    </div>

    <!-- Card + Section Header + Table -->
    <div class="bg-white rounded-(--radius-md) border-2 border-border shadow-xs overflow-hidden">
      <div
        class="flex items-center justify-between bg-primary-50 p-5 px-6 border-b-2 border-primary-200"
      >
        <h2 class="text-[16px] font-bold text-primary-800">Daftar Barang</h2>
        <span v-if="!loading" class="text-[13px] font-semibold text-primary-600">
          {{ totalCount }} barang
        </span>
      </div>

      <div v-if="!loading && barangList.length > 0" class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b-2 border-border bg-surface-warm">
              <th
                class="px-5 py-3.5 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary"
              >
                Nama
              </th>
              <th
                class="px-5 py-3.5 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary"
              >
                Deskripsi
              </th>
              <th
                class="px-5 py-3.5 text-right text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary"
              >
                Jumlah
              </th>
              <th
                class="px-5 py-3.5 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary"
              >
                Lokasi
              </th>
              <th
                class="px-5 py-3.5 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary"
              >
                Kondisi
              </th>
              <th
                class="px-5 py-3.5 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary"
              >
                Sumber Dana
              </th>
              <th
                class="px-5 py-3.5 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary"
              >
                Kategori
              </th>
              <th
                class="px-5 py-3.5 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary"
              >
                Ditambahkan
              </th>
              <th
                v-if="isAdmin"
                class="px-5 py-3.5 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary"
              >
                Aksi
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr
              v-for="barang in barangList"
              :key="barang.id"
              class="hover:bg-primary-50 transition-colors"
            >
              <td class="px-5 py-4 text-[15px] text-text-primary font-medium">{{ barang.nama }}</td>
              <td class="px-5 py-4 text-[15px] text-text-secondary max-w-xs truncate">
                {{ barang.deskripsi || '-' }}
              </td>
              <td
                class="px-5 py-4 text-[15px] text-text-primary text-right tabular-nums font-medium"
              >
                {{ formatNumber(barang.jumlah) }}
              </td>
              <td class="px-5 py-4 text-[15px] text-text-secondary">
                {{ barang.lokasi || '-' }}
              </td>
              <td class="px-5 py-4 text-[15px] text-text-secondary">
                {{ labelKondisi(barang.kondisiBarang) }}
              </td>
              <td class="px-5 py-4 text-[15px] text-text-secondary">
                {{ labelSumberDana(barang.sumberDana) }}
              </td>
              <td class="px-5 py-4 text-[15px] text-text-secondary">
                {{ labelKategori(barang.kategori) }}
              </td>
              <td class="px-5 py-4 text-[15px] text-text-secondary">
                {{ formatDate(barang.createdAt) }}
              </td>
              <td v-if="isAdmin" class="px-5 py-4">
                <div class="flex items-center gap-2">
                  <ActionButton variant="warning" icon="edit" @click="openEditForm(barang)"
                    >Edit</ActionButton
                  >
                  <ActionButton variant="danger" icon="delete" @click="openDeleteConfirm(barang)"
                    >Hapus</ActionButton
                  >
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Loading -->
      <div v-else-if="loading" class="py-16 text-center">
        <svg class="w-7 h-7 animate-spin text-primary-500 mx-auto" fill="none" viewBox="0 0 24 24">
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
        <p class="mt-3 text-[15px] text-text-secondary">Memuat data...</p>
      </div>

      <!-- Empty -->
      <div v-else class="py-16 text-center">
        <svg
          class="w-12 h-12 text-stone-300 mx-auto mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
        <p class="text-[15px] text-text-secondary">
          {{ search ? 'Tidak ada barang yang sesuai pencarian.' : 'Belum ada data barang.' }}
        </p>
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
      :title="editingBarang ? 'Edit Barang' : 'Tambah Barang'"
      @close="showFormModal = false"
    >
      <form id="form-barang" class="space-y-4" @submit.prevent="saveBarang">
        <div>
          <label class="block text-[15px] font-medium text-text-primary mb-1.5">Nama Barang</label>
          <input
            v-model="form.nama"
            type="text"
            required
            maxlength="255"
            placeholder="Masukkan nama barang"
            class="w-full px-3 py-2.5 text-[15px] border-2 border-border rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
          />
        </div>
        <div>
          <label class="block text-[15px] font-medium text-text-primary mb-1.5">
            Deskripsi <span class="text-text-tertiary font-normal">(opsional)</span>
          </label>
          <textarea
            v-model="form.deskripsi"
            rows="3"
            maxlength="1000"
            placeholder="Masukkan deskripsi barang"
            class="w-full px-3 py-2.5 text-[15px] border-2 border-border rounded-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
          />
        </div>
        <div>
          <label class="block text-[15px] font-medium text-text-primary mb-1.5">Jumlah</label>
          <input
            v-model="form.jumlah"
            type="number"
            required
            min="0"
            placeholder="0"
            class="w-full px-3 py-2.5 text-[15px] border-2 border-border rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
          />
        </div>
        <div>
          <label class="block text-[15px] font-medium text-text-primary mb-1.5">
            Lokasi <span class="text-text-tertiary font-normal">(opsional)</span>
          </label>
          <input
            v-model="form.lokasi"
            type="text"
            maxlength="255"
            placeholder="Contoh: Ruang Gudang Lt. 2"
            class="w-full px-3 py-2.5 text-[15px] border-2 border-border rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
          />
        </div>
        <div>
          <label class="block text-[15px] font-medium text-text-primary mb-1.5">
            Kondisi Barang <span class="text-danger-500">*</span>
          </label>
          <select
            v-model="form.kondisiBarang"
            class="w-full px-3 py-2.5 text-[15px] border-2 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors bg-white"
            :class="formErrors.kondisiBarang ? 'border-danger-500' : 'border-border'"
          >
            <option value="">-- Pilih kondisi --</option>
            <option v-for="opt in KONDISI_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <p v-if="formErrors.kondisiBarang" class="text-[13px] text-danger-500 mt-1">
            {{ formErrors.kondisiBarang }}
          </p>
        </div>
        <div>
          <label class="block text-[15px] font-medium text-text-primary mb-1.5">
            Sumber Dana <span class="text-danger-500">*</span>
          </label>
          <select
            v-model="form.sumberDana"
            class="w-full px-3 py-2.5 text-[15px] border-2 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors bg-white"
            :class="formErrors.sumberDana ? 'border-danger-500' : 'border-border'"
          >
            <option value="">-- Pilih sumber dana --</option>
            <option v-for="opt in SUMBER_DANA_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <p v-if="formErrors.sumberDana" class="text-[13px] text-danger-500 mt-1">
            {{ formErrors.sumberDana }}
          </p>
        </div>
        <div>
          <label class="block text-[15px] font-medium text-text-primary mb-1.5">
            Kategori <span class="text-danger-500">*</span>
          </label>
          <select
            v-model="form.kategori"
            class="w-full px-3 py-2.5 text-[15px] border-2 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors bg-white"
            :class="formErrors.kategori ? 'border-danger-500' : 'border-border'"
          >
            <option value="">-- Pilih kategori --</option>
            <option v-for="opt in KATEGORI_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <p v-if="formErrors.kategori" class="text-[13px] text-danger-500 mt-1">
            {{ formErrors.kategori }}
          </p>
        </div>
        <p v-if="formError" class="text-[13px] text-danger-500 mt-1">{{ formError }}</p>
      </form>
      <template #footer>
        <ActionButton variant="neutral" icon="none" @click="showFormModal = false"
          >Batal</ActionButton
        >
        <ActionButton
          variant="primary"
          icon="none"
          type="submit"
          form="form-barang"
          :disabled="saving"
        >
          {{ saving ? 'Menyimpan...' : 'Simpan' }}
        </ActionButton>
      </template>
    </BaseModal>

    <!-- Delete Modal -->
    <BaseModal :show="showDeleteModal" title="Konfirmasi Hapus" @close="showDeleteModal = false">
      <p class="text-[15px] text-text-primary">
        Apakah Anda yakin ingin menghapus barang <strong>{{ deletingBarang?.nama }}</strong
        >?
      </p>
      <template #footer>
        <ActionButton variant="neutral" icon="none" @click="showDeleteModal = false"
          >Batal</ActionButton
        >
        <ActionButton variant="danger" icon="delete" :disabled="deleting" @click="deleteBarang">
          {{ deleting ? 'Menghapus...' : 'Hapus' }}
        </ActionButton>
      </template>
    </BaseModal>

    <!-- Import Result Modal -->
    <BaseModal
      :show="showImportResultModal"
      title="Hasil Import Excel"
      @close="showImportResultModal = false"
    >
      <div v-if="importResult" class="space-y-4">
        <!-- Success count -->
        <div class="flex items-center gap-3 p-4 bg-success-50 border border-success-200 rounded-sm">
          <svg
            class="w-5 h-5 text-success-600 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p class="text-[15px] text-success-800 font-medium">
            Berhasil ditambahkan: <strong>{{ importResult.berhasilDitambahkan }} barang</strong>
          </p>
        </div>

        <!-- Skipped rows -->
        <div v-if="importResult.dilewati.length > 0">
          <p class="text-[14px] font-semibold text-text-secondary mb-2">
            Dilewati: {{ importResult.dilewati.length }} baris
          </p>
          <div
            class="max-h-64 overflow-y-auto border border-border rounded-sm divide-y divide-border"
          >
            <div
              v-for="item in importResult.dilewati"
              :key="item.baris"
              class="px-4 py-3 flex items-start gap-3"
            >
              <span class="text-[13px] font-mono text-text-tertiary shrink-0 mt-0.5">
                Baris {{ item.baris }}
              </span>
              <div class="min-w-0">
                <p class="text-[14px] font-medium text-text-primary truncate">
                  {{ item.nama || '(tanpa nama)' }}
                </p>
                <p class="text-[13px] text-danger-600">{{ item.alasan }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- All skipped message -->
        <div
          v-if="importResult.berhasilDitambahkan === 0 && importResult.dilewati.length === 0"
          class="text-[15px] text-text-secondary text-center py-2"
        >
          Tidak ada data yang diproses.
        </div>
      </div>
      <template #footer>
        <ActionButton variant="primary" icon="none" @click="showImportResultModal = false">
          Tutup
        </ActionButton>
      </template>
    </BaseModal>
  </div>
</template>
