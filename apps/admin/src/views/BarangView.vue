<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { Role } from '@edu/shared';
import { api } from '@/api/client';
import { PageHeader, BaseModal, TablePagination } from '@/components/ui';
import { useTableUrlState } from '@/composables/useTableUrlState';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';

interface Barang {
  id: string;
  nama: string;
  deskripsi: string | null;
  jumlah: number;
  createdAt: string;
  updatedAt: string;
}

interface BarangForm {
  nama: string;
  deskripsi: string;
  jumlah: number | string;
}

interface PaginatedResponse {
  data: Barang[];
  meta: {
    page: number;
    page_size: number;
    total_count: number;
    total_pages: number;
  };
}

const authStore = useAuthStore();
const toast = useToast();

const isAdmin = authStore.hasRole(Role.ADMIN);

// Table state with URL sync (search has built-in 300ms debounce)
const { page, pageSize, search, queryParams } = useTableUrlState({
  searchKey: 'search',
  defaultPageSize: 15,
});

// Data
const barangList = ref<Barang[]>([]);
const loading = ref(false);
const totalCount = ref(0);
const totalPages = ref(0);
const errorMessage = ref('');

// Modal state
const showFormModal = ref(false);
const showDeleteModal = ref(false);
const editingBarang = ref<Barang | null>(null);
const deletingBarang = ref<Barang | null>(null);
const saving = ref(false);
const deleting = ref(false);

const form = reactive<BarangForm>({
  nama: '',
  deskripsi: '',
  jumlah: 0,
});
const formErrors = ref<Record<string, string>>({});

// Fetch data
async function fetchBarang() {
  loading.value = true;
  errorMessage.value = '';

  try {
    const params = { ...queryParams.value };
    const { data } = await api.get<PaginatedResponse>('/barang', { params });
    barangList.value = data.data;
    totalCount.value = data.meta.total_count;
    totalPages.value = data.meta.total_pages;
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    errorMessage.value = error.response?.data?.message || 'Gagal memuat data barang.';
    barangList.value = [];
  } finally {
    loading.value = false;
  }
}

// Watch state changes to trigger fetch
watch([page, pageSize, search], fetchBarang);

// Form validation
function validateForm(): boolean {
  formErrors.value = {};

  const nama = form.nama.trim();
  if (!nama) {
    formErrors.value.nama = 'Nama barang wajib diisi';
  } else if (nama.length > 255) {
    formErrors.value.nama = 'Nama barang maksimal 255 karakter';
  }

  const jumlah = Number(form.jumlah);
  if (form.jumlah === '' || isNaN(jumlah)) {
    formErrors.value.jumlah = 'Jumlah wajib diisi';
  } else if (!Number.isInteger(jumlah)) {
    formErrors.value.jumlah = 'Jumlah harus bilangan bulat';
  } else if (jumlah < 0) {
    formErrors.value.jumlah = 'Jumlah minimal 0';
  } else if (jumlah > 999999999) {
    formErrors.value.jumlah = 'Jumlah maksimal 999.999.999';
  }

  const deskripsi = form.deskripsi.trim();
  if (deskripsi.length > 1000) {
    formErrors.value.deskripsi = 'Deskripsi maksimal 1000 karakter';
  }

  return Object.keys(formErrors.value).length === 0;
}

// CRUD operations
function openCreateForm() {
  editingBarang.value = null;
  Object.assign(form, { nama: '', deskripsi: '', jumlah: 0 });
  formErrors.value = {};
  showFormModal.value = true;
}

function openEditForm(barang: Barang) {
  editingBarang.value = barang;
  Object.assign(form, {
    nama: barang.nama,
    deskripsi: barang.deskripsi || '',
    jumlah: barang.jumlah,
  });
  formErrors.value = {};
  showFormModal.value = true;
}

function openDeleteConfirm(barang: Barang) {
  deletingBarang.value = barang;
  showDeleteModal.value = true;
}

async function saveBarang() {
  if (!validateForm()) return;

  saving.value = true;
  const payload = {
    nama: form.nama.trim(),
    deskripsi: form.deskripsi.trim() || undefined,
    jumlah: Number(form.jumlah),
  };

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
  } catch (err) {
    const error = err as { response?: { data?: { message?: string | string[] } } };
    const msg = error.response?.data?.message;
    if (Array.isArray(msg)) {
      toast.error(msg[0]);
    } else {
      toast.error(msg || 'Gagal menyimpan data barang');
    }
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
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } };
    toast.error(error.response?.data?.message || 'Gagal menghapus barang');
  } finally {
    deleting.value = false;
  }
}

// Helpers
function truncateText(text: string | null, maxLength: number): string {
  if (!text) return '-';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatNumber(num: number): string {
  return num.toLocaleString('id-ID');
}

onMounted(() => {
  fetchBarang();
});
</script>

<template>
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader title="Pencatatan Barang" description="Kelola inventaris barang sekolah.">
      <template #actions>
        <button
          v-if="isAdmin"
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          @click="openCreateForm"
        >
          Tambah Barang
        </button>
      </template>
    </PageHeader>

    <!-- Search -->
    <div class="flex flex-wrap items-end gap-2 mb-4">
      <div class="relative w-64">
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
          class="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
        />
      </div>
    </div>

    <!-- Error State -->
    <div
      v-if="errorMessage && !loading"
      class="p-6 text-center bg-white border border-border rounded-xl"
    >
      <svg
        class="w-10 h-10 text-danger-400 mx-auto mb-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="1"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
        />
      </svg>
      <p class="text-sm text-text-secondary mb-3">{{ errorMessage }}</p>
      <button
        class="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
        @click="fetchBarang"
      >
        Coba Lagi
      </button>
    </div>

    <!-- Table -->
    <div v-else class="bg-white border border-border rounded-xl overflow-hidden">
      <div class="overflow-x-auto">
        <table v-if="!loading && barangList.length > 0" class="w-full text-sm">
          <thead>
            <tr class="border-b border-border">
              <th class="text-left px-4 py-3 font-medium text-text-secondary bg-surface-50">
                Nama
              </th>
              <th class="text-left px-4 py-3 font-medium text-text-secondary bg-surface-50">
                Deskripsi
              </th>
              <th class="text-right px-4 py-3 font-medium text-text-secondary bg-surface-50">
                Jumlah
              </th>
              <th class="text-left px-4 py-3 font-medium text-text-secondary bg-surface-50">
                Tanggal Ditambahkan
              </th>
              <th
                v-if="isAdmin"
                class="text-right px-4 py-3 font-medium text-text-secondary bg-surface-50"
              >
                Aksi
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr
              v-for="barang in barangList"
              :key="barang.id"
              class="hover:bg-surface-50 transition-colors"
            >
              <td class="px-4 py-3 font-medium text-text-primary">{{ barang.nama }}</td>
              <td class="px-4 py-3 text-text-secondary">
                {{ truncateText(barang.deskripsi, 100) }}
              </td>
              <td class="px-4 py-3 text-right text-text-primary tabular-nums">
                {{ formatNumber(barang.jumlah) }}
              </td>
              <td class="px-4 py-3 text-text-secondary">{{ formatDate(barang.createdAt) }}</td>
              <td v-if="isAdmin" class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1">
                  <button
                    class="px-2 py-1 text-xs font-medium text-primary-600 bg-primary-50 rounded-md hover:bg-primary-100 transition-colors"
                    @click="openEditForm(barang)"
                  >
                    Edit
                  </button>
                  <button
                    class="px-2 py-1 text-xs font-medium text-danger-600 bg-danger-50 rounded-md hover:bg-danger-100 transition-colors"
                    @click="openDeleteConfirm(barang)"
                  >
                    Hapus
                  </button>
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

        <!-- Empty State -->
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
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
          <p class="text-sm text-text-tertiary">
            {{
              search ? 'Tidak ada barang yang sesuai dengan pencarian.' : 'Belum ada data barang.'
            }}
          </p>
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
      :title="editingBarang ? 'Edit Barang' : 'Tambah Barang'"
      @close="showFormModal = false"
    >
      <form class="space-y-4" @submit.prevent="saveBarang">
        <div>
          <label class="block text-sm font-medium text-text-primary mb-1.5">
            Nama Barang <span class="text-danger-500">*</span>
          </label>
          <input
            v-model="form.nama"
            type="text"
            maxlength="255"
            placeholder="Masukkan nama barang"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
          <p v-if="formErrors.nama" class="text-xs text-danger-500 mt-1">{{ formErrors.nama }}</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-text-primary mb-1.5">Deskripsi</label>
          <textarea
            v-model="form.deskripsi"
            rows="3"
            maxlength="1000"
            placeholder="Masukkan deskripsi barang (opsional)"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
          <div class="flex justify-between mt-1">
            <p v-if="formErrors.deskripsi" class="text-xs text-danger-500">
              {{ formErrors.deskripsi }}
            </p>
            <p class="text-xs text-text-tertiary ml-auto">{{ form.deskripsi.length }}/1000</p>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-text-primary mb-1.5">
            Jumlah <span class="text-danger-500">*</span>
          </label>
          <input
            v-model="form.jumlah"
            type="number"
            min="0"
            max="999999999"
            step="1"
            placeholder="0"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
          <p v-if="formErrors.jumlah" class="text-xs text-danger-500 mt-1">
            {{ formErrors.jumlah }}
          </p>
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
          @click="saveBarang"
        >
          {{ saving ? 'Menyimpan...' : 'Simpan' }}
        </button>
      </template>
    </BaseModal>

    <!-- Delete Confirmation Modal -->
    <BaseModal :show="showDeleteModal" title="Hapus Barang" @close="showDeleteModal = false">
      <div class="space-y-3">
        <p class="text-sm text-text-secondary">
          Anda yakin ingin menghapus barang
          <strong class="text-text-primary">{{ deletingBarang?.nama }}</strong
          >?
        </p>
        <p class="text-xs text-text-tertiary">
          Data yang dihapus tidak akan ditampilkan lagi dalam daftar.
        </p>
      </div>
      <template #footer>
        <button
          class="px-4 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showDeleteModal = false"
        >
          Batal
        </button>
        <button
          :disabled="deleting"
          class="px-4 py-2 text-sm font-medium text-white bg-danger-500 rounded-lg hover:bg-danger-700 disabled:opacity-50 transition-colors"
          @click="deleteBarang"
        >
          {{ deleting ? 'Menghapus...' : 'Hapus' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
