<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';

interface KomponenPenilaian {
  id: string;
  nama: string;
  tipe: 'angka' | 'huruf' | 'deskripsi';
  skala_min: number | null;
  skala_max: number | null;
  is_wajib: boolean;
  urutan: number;
  created_at: string;
}

interface KomponenForm {
  nama: string;
  tipe: 'angka' | 'huruf' | 'deskripsi';
  skala_min: number | null;
  skala_max: number | null;
  is_wajib: boolean;
  urutan: number;
}

const items = ref<KomponenPenilaian[]>([]);
const loading = ref(false);
const error = ref('');

const showFormModal = ref(false);
const showDeleteModal = ref(false);
const editingItem = ref<KomponenPenilaian | null>(null);
const deletingItem = ref<KomponenPenilaian | null>(null);
const deleteError = ref('');
const formError = ref('');

const defaultForm: KomponenForm = {
  nama: '',
  tipe: 'angka',
  skala_min: 0,
  skala_max: 100,
  is_wajib: true,
  urutan: 0,
};

const form = ref<KomponenForm>({ ...defaultForm });

async function fetchItems() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get<{ data: KomponenPenilaian[] }>('/rapor/komponen-penilaian');
    items.value = data.data;
  } catch (err: any) {
    error.value = err.response?.data?.message || 'Gagal memuat komponen penilaian.';
    console.error('Failed to fetch komponen penilaian:', err);
  } finally {
    loading.value = false;
  }
}

function openCreateForm() {
  editingItem.value = null;
  form.value = { ...defaultForm, urutan: items.value.length + 1 };
  formError.value = '';
  showFormModal.value = true;
}

function openEditForm(item: KomponenPenilaian) {
  editingItem.value = item;
  form.value = {
    nama: item.nama,
    tipe: item.tipe,
    skala_min: item.skala_min,
    skala_max: item.skala_max,
    is_wajib: item.is_wajib,
    urutan: item.urutan,
  };
  formError.value = '';
  showFormModal.value = true;
}

function openDeleteConfirm(item: KomponenPenilaian) {
  deletingItem.value = item;
  deleteError.value = '';
  showDeleteModal.value = true;
}

function onTipeChange() {
  if (form.value.tipe === 'angka') {
    form.value.skala_min = 0;
    form.value.skala_max = 100;
  } else {
    form.value.skala_min = null;
    form.value.skala_max = null;
  }
}

async function saveItem() {
  formError.value = '';

  if (!form.value.nama.trim()) {
    formError.value = 'Nama komponen wajib diisi.';
    return;
  }

  if (form.value.tipe === 'angka') {
    if (form.value.skala_min === null || form.value.skala_max === null) {
      formError.value = 'Skala min dan max wajib diisi untuk tipe angka.';
      return;
    }
    if (form.value.skala_min >= form.value.skala_max) {
      formError.value = 'Skala min harus lebih kecil dari skala max.';
      return;
    }
  }

  const payload = {
    nama: form.value.nama.trim(),
    tipe: form.value.tipe,
    skala_min: form.value.tipe === 'angka' ? form.value.skala_min : undefined,
    skala_max: form.value.tipe === 'angka' ? form.value.skala_max : undefined,
    is_wajib: form.value.is_wajib,
    urutan: form.value.urutan,
  };

  try {
    if (editingItem.value) {
      await api.patch(`/rapor/komponen-penilaian/${editingItem.value.id}`, payload);
    } else {
      await api.post('/rapor/komponen-penilaian', payload);
    }
    showFormModal.value = false;
    await fetchItems();
  } catch (err: any) {
    formError.value = err.response?.data?.message || 'Gagal menyimpan komponen penilaian.';
  }
}

async function deleteItem() {
  if (!deletingItem.value) return;
  try {
    await api.delete(`/rapor/komponen-penilaian/${deletingItem.value.id}`);
    showDeleteModal.value = false;
    deletingItem.value = null;
    await fetchItems();
  } catch (err: any) {
    deleteError.value = err.response?.data?.message || 'Gagal menghapus komponen penilaian.';
  }
}

function getTipeLabel(tipe: string): string {
  switch (tipe) {
    case 'angka':
      return 'Angka';
    case 'huruf':
      return 'Huruf (A/B/C/D/E)';
    case 'deskripsi':
      return 'Deskripsi Naratif';
    default:
      return tipe;
  }
}

onMounted(fetchItems);
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Konfigurasi Komponen Penilaian</h1>
        <p class="page-description">
          Atur komponen penilaian rapor sesuai kurikulum sekolah. Template default: Kurikulum
          Merdeka (Nilai Akhir angka 0-100, Capaian Pembelajaran deskripsi naratif).
        </p>
      </div>
      <button class="btn btn-primary" @click="openCreateForm">Tambah Komponen</button>
    </div>

    <div v-if="error" class="alert alert-error">{{ error }}</div>

    <div class="table-container">
      <table v-if="!loading && items.length > 0">
        <thead>
          <tr>
            <th>Urutan</th>
            <th>Nama Komponen</th>
            <th>Tipe</th>
            <th>Skala</th>
            <th>Wajib</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td>{{ item.urutan }}</td>
            <td>{{ item.nama }}</td>
            <td>{{ getTipeLabel(item.tipe) }}</td>
            <td>
              <span v-if="item.tipe === 'angka'">{{ item.skala_min }} - {{ item.skala_max }}</span>
              <span v-else-if="item.tipe === 'huruf'">A/B/C/D/E</span>
              <span v-else>-</span>
            </td>
            <td>
              <span :class="item.is_wajib ? 'badge badge-required' : 'badge badge-optional'">
                {{ item.is_wajib ? 'Wajib' : 'Opsional' }}
              </span>
            </td>
            <td class="actions-cell">
              <button class="btn-sm btn-edit" @click="openEditForm(item)">Edit</button>
              <button class="btn-sm btn-delete" @click="openDeleteConfirm(item)">Hapus</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="loading" class="empty-state">Memuat data...</p>
      <p v-else class="empty-state">
        Belum ada komponen penilaian. Klik "Tambah Komponen" untuk mengatur format rapor.
      </p>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showFormModal" class="modal-overlay" @click.self="showFormModal = false">
      <div class="modal">
        <h2>{{ editingItem ? 'Edit Komponen' : 'Tambah Komponen Penilaian' }}</h2>
        <form @submit.prevent="saveItem">
          <div class="form-group">
            <label>Nama Komponen</label>
            <input
              v-model="form.nama"
              type="text"
              required
              class="input"
              placeholder="Contoh: Nilai Akhir, Tugas Harian, UTS"
            />
          </div>

          <div class="form-group">
            <label>Tipe Penilaian</label>
            <select v-model="form.tipe" class="input" @change="onTipeChange">
              <option value="angka">Angka (misal: 0-100)</option>
              <option value="huruf">Huruf (A/B/C/D/E)</option>
              <option value="deskripsi">Deskripsi Naratif</option>
            </select>
          </div>

          <div v-if="form.tipe === 'angka'" class="form-row">
            <div class="form-group">
              <label>Skala Min</label>
              <input v-model.number="form.skala_min" type="number" class="input" />
            </div>
            <div class="form-group">
              <label>Skala Max</label>
              <input v-model.number="form.skala_max" type="number" class="input" />
            </div>
          </div>

          <div class="form-group">
            <label>Urutan</label>
            <input v-model.number="form.urutan" type="number" min="0" class="input" />
          </div>

          <div class="form-group checkbox-group">
            <label>
              <input v-model="form.is_wajib" type="checkbox" />
              Wajib diisi oleh guru
            </label>
          </div>

          <p v-if="formError" class="error-text">{{ formError }}</p>

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
          Apakah Anda yakin ingin menghapus komponen
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
  align-items: flex-start;
  margin-bottom: 1.5rem;
}
.page-header h1 {
  margin: 0;
  font-size: 1.5rem;
}
.page-description {
  margin: 0.25rem 0 0;
  color: #6b7280;
  font-size: 0.875rem;
}
.alert {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}
.alert-error {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
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
.badge {
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}
.badge-required {
  background: #dbeafe;
  color: #1e40af;
}
.badge-optional {
  background: #f3f4f6;
  color: #6b7280;
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
  max-width: 520px;
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
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 400;
  cursor: pointer;
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
