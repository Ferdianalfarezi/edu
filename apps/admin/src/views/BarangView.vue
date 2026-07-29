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
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
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

const form = reactive<BarangForm>({ nama: '', deskripsi: '', jumlah: 0 });

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
  Object.assign(form, { nama: '', deskripsi: '', jumlah: 0 });
  formError.value = '';
  showFormModal.value = true;
}

function openEditForm(barang: Barang) {
  editingBarang.value = barang;
  Object.assign(form, {
    nama: barang.nama,
    deskripsi: barang.deskripsi || '',
    jumlah: barang.jumlah,
  });
  formError.value = '';
  showFormModal.value = true;
}

function openDeleteConfirm(barang: Barang) {
  deletingBarang.value = barang;
  showDeleteModal.value = true;
}

async function saveBarang() {
  formError.value = '';
  const payload = {
    nama: form.nama.trim(),
    deskripsi: form.deskripsi.trim() || undefined,
    jumlah: Number(form.jumlah),
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
    toast.error(formError.value);
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
  } catch (err: any) {
    toast.error(err.response?.data?.message || 'Gagal menghapus barang');
  } finally {
    deleting.value = false;
  }
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
  </div>
</template>
