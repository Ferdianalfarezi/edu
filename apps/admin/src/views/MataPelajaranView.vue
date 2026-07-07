<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';

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
  } catch (error: any) {
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
  <div class="page">
    <div class="page-header">
      <h1>Manajemen Mata Pelajaran</h1>
      <button class="btn btn-primary" @click="openCreateForm">Tambah Mata Pelajaran</button>
    </div>

    <div class="table-container">
      <table v-if="!loading && items.length > 0">
        <thead>
          <tr>
            <th>Nama</th>
            <th>Kode</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td>{{ item.nama }}</td>
            <td>{{ item.kode || '-' }}</td>
            <td class="actions-cell">
              <button class="btn-sm btn-edit" @click="openEditForm(item)">Edit</button>
              <button class="btn-sm btn-delete" @click="openDeleteConfirm(item)">Hapus</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="loading" class="empty-state">Memuat data...</p>
      <p v-else class="empty-state">Belum ada mata pelajaran.</p>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showFormModal" class="modal-overlay" @click.self="showFormModal = false">
      <div class="modal">
        <h2>{{ editingItem ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran' }}</h2>
        <form @submit.prevent="saveItem">
          <div class="form-group">
            <label>Nama</label>
            <input
              v-model="form.nama"
              type="text"
              required
              class="input"
              placeholder="Matematika"
            />
          </div>
          <div class="form-group">
            <label>Kode <span class="optional">(opsional)</span></label>
            <input v-model="form.kode" type="text" class="input" placeholder="MTK" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="showFormModal = false">
              Batal
            </button>
            <button type="submit" class="btn btn-primary">Simpan</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
      <div class="modal">
        <h2>Konfirmasi Hapus</h2>
        <p>
          Apakah Anda yakin ingin menghapus mata pelajaran
          <strong>{{ deletingItem?.nama }}</strong
          >?
        </p>
        <p v-if="deleteError" class="error-text">{{ deleteError }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showDeleteModal = false">Batal</button>
          <button class="btn btn-danger" @click="deleteItem">Hapus</button>
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
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}
.optional {
  color: #9ca3af;
  font-weight: 400;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}
.error-text {
  color: #dc2626;
  font-size: 0.875rem;
  margin-top: 0.5rem;
}
</style>
