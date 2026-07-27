<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';
import { PageHeader, BaseModal, ActionButton } from '@/components/ui';

interface MataPelajaran {
  id: string;
  nama: string;
  kode: string | null;
  created_at: string;
}

interface MapelForm {
  nama: string;
  kode: string;
}

const items = ref<MataPelajaran[]>([]);
const loading = ref(false);

const showFormModal = ref(false);
const showDeleteModal = ref(false);
const editingItem = ref<MataPelajaran | null>(null);
const deletingItem = ref<MataPelajaran | null>(null);
const deleteError = ref('');

const form = ref<MapelForm>({ nama: '', kode: '' });

async function fetchItems() {
  loading.value = true;
  try {
    const { data } = await api.get<{ data: MataPelajaran[] }>('/mata-pelajaran');
    items.value = data.data;
  } catch (error) {
    console.error('Failed to fetch mata pelajaran:', error);
  } finally {
    loading.value = false;
  }
}

function openCreateForm() {
  editingItem.value = null;
  form.value = { nama: '', kode: '' };
  showFormModal.value = true;
}

function openEditForm(item: MataPelajaran) {
  editingItem.value = item;
  form.value = { nama: item.nama, kode: item.kode || '' };
  showFormModal.value = true;
}

function openDeleteConfirm(item: MataPelajaran) {
  deletingItem.value = item;
  deleteError.value = '';
  showDeleteModal.value = true;
}

async function saveItem() {
  const payload = {
    nama: form.value.nama,
    kode: form.value.kode || undefined,
  };

  try {
    if (editingItem.value) {
      await api.patch(`/mata-pelajaran/${editingItem.value.id}`, payload);
    } else {
      await api.post('/mata-pelajaran', payload);
    }
    showFormModal.value = false;
    await fetchItems();
  } catch (error) {
    console.error('Failed to save mata pelajaran:', error);
  }
}

async function deleteItem() {
  if (!deletingItem.value) return;
  try {
    await api.delete(`/mata-pelajaran/${deletingItem.value.id}`);
    showDeleteModal.value = false;
    deletingItem.value = null;
    deleteError.value = '';
    await fetchItems();
  } catch (error) {
    if (error.response?.status === 409 || error.response?.status === 400) {
      deleteError.value =
        error.response?.data?.message ||
        'Mata pelajaran tidak dapat dihapus karena masih digunakan dalam jadwal aktif.';
    } else {
      console.error('Failed to delete mata pelajaran:', error);
    }
  }
}

onMounted(fetchItems);
</script>

<template>
  <div class="p-8 max-w-7xl mx-auto">
    <PageHeader title="Manajemen Mata Pelajaran">
      <template #actions>
        <ActionButton variant="primary" icon="none" @click="openCreateForm">
          Tambah Mata Pelajaran
        </ActionButton>
      </template>
    </PageHeader>

    <!-- Card + Section Header + Data Table -->
    <div class="bg-white rounded-(--radius-md) border-2 border-border shadow-xs overflow-hidden">
      <!-- Section Header -->
      <div
        class="flex items-center justify-between bg-primary-50 p-5 px-6 border-b-2 border-primary-200"
      >
        <h2 class="text-[16px] font-bold text-primary-800">Daftar Mata Pelajaran</h2>
        <span v-if="!loading" class="text-[13px] font-semibold text-primary-600">
          {{ items.length }} mata pelajaran
        </span>
      </div>

      <!-- Table -->
      <div v-if="!loading && items.length > 0" class="overflow-x-auto">
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
                Kode
              </th>
              <th
                class="px-5 py-3.5 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary"
              >
                Aksi
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="item in items" :key="item.id" class="hover:bg-primary-50 transition-colors">
              <td class="px-5 py-4 text-[15px] text-text-primary font-medium">{{ item.nama }}</td>
              <td class="px-5 py-4 text-[15px] text-text-secondary font-mono">
                {{ item.kode || '-' }}
              </td>
              <td class="px-5 py-4">
                <div class="flex items-center gap-2">
                  <ActionButton variant="warning" icon="edit" @click="openEditForm(item)">
                    Edit
                  </ActionButton>
                  <ActionButton variant="danger" icon="delete" @click="openDeleteConfirm(item)">
                    Hapus
                  </ActionButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Loading state -->
      <div v-else-if="loading" class="py-16 text-center">
        <svg class="w-7 h-7 animate-spin text-primary-500 mx-auto" fill="none" viewBox="0 0 24 24">
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          ></path>
        </svg>
        <p class="mt-3 text-[15px] text-text-secondary">Memuat data...</p>
      </div>

      <!-- Empty state -->
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
            d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
          />
        </svg>
        <p class="text-[15px] text-text-secondary">Belum ada mata pelajaran.</p>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <BaseModal
      :show="showFormModal"
      :title="editingItem ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran'"
      @close="showFormModal = false"
    >
      <form id="form-mapel" class="space-y-4" @submit.prevent="saveItem">
        <div>
          <label class="block text-[15px] font-medium text-text-primary mb-1.5">Nama</label>
          <input
            v-model="form.nama"
            type="text"
            required
            placeholder="Matematika"
            class="w-full px-3 py-2.5 text-[15px] border-2 border-border rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
          />
        </div>
        <div>
          <label class="block text-[15px] font-medium text-text-primary mb-1.5">
            Kode <span class="text-text-tertiary font-normal">(opsional)</span>
          </label>
          <input
            v-model="form.kode"
            type="text"
            placeholder="MTK"
            class="w-full px-3 py-2.5 text-[15px] border-2 border-border rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
          />
        </div>
      </form>
      <template #footer>
        <ActionButton variant="neutral" icon="none" @click="showFormModal = false">
          Batal
        </ActionButton>
        <ActionButton variant="primary" icon="none" type="submit" form="form-mapel">
          Simpan
        </ActionButton>
      </template>
    </BaseModal>

    <!-- Delete Confirmation Modal -->
    <BaseModal :show="showDeleteModal" title="Konfirmasi Hapus" @close="showDeleteModal = false">
      <p class="text-[15px] text-text-primary">
        Apakah Anda yakin ingin menghapus mata pelajaran <strong>{{ deletingItem?.nama }}</strong
        >?
      </p>
      <p v-if="deleteError" class="text-[13px] text-danger-500 mt-2">{{ deleteError }}</p>
      <template #footer>
        <ActionButton variant="neutral" icon="none" @click="showDeleteModal = false">
          Batal
        </ActionButton>
        <ActionButton variant="danger" icon="delete" @click="deleteItem"> Hapus </ActionButton>
      </template>
    </BaseModal>
  </div>
</template>
