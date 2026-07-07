<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api/client';

interface TahunAjaran {
  id: string;
  nama: string;
  status: string;
}

interface Guru {
  id: string;
  nama: string;
}

interface Kelas {
  id: string;
  nama: string;
  tingkat: number;
  wali_kelas_id: string | null;
  wali_kelas_nama: string | null;
  tahun_ajaran_id: string;
  tahun_ajaran_nama: string;
  kapasitas: number | null;
  jumlah_siswa: number;
}

interface KelasForm {
  nama: string;
  tingkat: number | '';
  wali_kelas_id: string;
  kapasitas: string;
}

const kelasList = ref<Kelas[]>([]);
const tahunAjaranList = ref<TahunAjaran[]>([]);
const guruList = ref<Guru[]>([]);
const loading = ref(false);
const selectedTahunAjaran = ref('');

// Modal state
const showFormModal = ref(false);
const showDeleteModal = ref(false);
const editingKelas = ref<Kelas | null>(null);
const deletingKelas = ref<Kelas | null>(null);
const deleteError = ref('');
const formError = ref('');

const form = ref<KelasForm>({
  nama: '',
  tingkat: '',
  wali_kelas_id: '',
  kapasitas: '',
});

const filteredKelas = computed(() => {
  if (!selectedTahunAjaran.value) return kelasList.value;
  return kelasList.value.filter((k) => k.tahun_ajaran_id === selectedTahunAjaran.value);
});

async function fetchTahunAjaran() {
  try {
    const { data } = await api.get<{ data: TahunAjaran[] }>('/tahun-ajaran');
    tahunAjaranList.value = data.data;
    // Default to the active tahun ajaran
    const active = data.data.find((t) => t.status === 'aktif');
    if (active) {
      selectedTahunAjaran.value = active.id;
    } else if (data.data.length > 0) {
      selectedTahunAjaran.value = data.data[0].id;
    }
  } catch (error) {
    console.error('Failed to fetch tahun ajaran:', error);
  }
}

async function fetchKelas() {
  loading.value = true;
  try {
    const params: Record<string, string> = {};
    if (selectedTahunAjaran.value) {
      params.tahun_ajaran_id = selectedTahunAjaran.value;
    }
    const { data } = await api.get<{ data: Kelas[] }>('/kelas', { params });
    kelasList.value = data.data;
  } catch (error) {
    console.error('Failed to fetch kelas:', error);
  } finally {
    loading.value = false;
  }
}

async function fetchGuru() {
  try {
    const { data } = await api.get<{ data: Guru[] }>('/users', { params: { role: 'guru' } });
    guruList.value = data.data;
  } catch (error) {
    console.error('Failed to fetch guru:', error);
  }
}

function openCreateForm() {
  editingKelas.value = null;
  formError.value = '';
  form.value = { nama: '', tingkat: '', wali_kelas_id: '', kapasitas: '' };
  showFormModal.value = true;
}

function openEditForm(kelas: Kelas) {
  editingKelas.value = kelas;
  formError.value = '';
  form.value = {
    nama: kelas.nama,
    tingkat: kelas.tingkat,
    wali_kelas_id: kelas.wali_kelas_id || '',
    kapasitas: kelas.kapasitas ? String(kelas.kapasitas) : '',
  };
  showFormModal.value = true;
}

function openDeleteConfirm(kelas: Kelas) {
  deletingKelas.value = kelas;
  deleteError.value = '';
  showDeleteModal.value = true;
}

async function saveKelas() {
  formError.value = '';
  const payload: Record<string, unknown> = {
    nama: form.value.nama,
    tingkat: Number(form.value.tingkat),
    tahun_ajaran_id: selectedTahunAjaran.value,
  };
  if (form.value.wali_kelas_id) {
    payload.wali_kelas_id = form.value.wali_kelas_id;
  } else {
    payload.wali_kelas_id = null;
  }
  if (form.value.kapasitas) {
    payload.kapasitas = Number(form.value.kapasitas);
  }

  try {
    if (editingKelas.value) {
      await api.patch(`/kelas/${editingKelas.value.id}`, payload);
    } else {
      await api.post('/kelas', payload);
    }
    showFormModal.value = false;
    await fetchKelas();
  } catch (error: any) {
    const msg = error.response?.data?.message;
    if (msg) {
      formError.value = Array.isArray(msg) ? msg.join(', ') : msg;
    } else {
      formError.value = 'Gagal menyimpan kelas.';
    }
  }
}

async function deleteKelas() {
  if (!deletingKelas.value) return;
  try {
    await api.delete(`/kelas/${deletingKelas.value.id}`);
    showDeleteModal.value = false;
    deletingKelas.value = null;
    deleteError.value = '';
    await fetchKelas();
  } catch (error: any) {
    const msg = error.response?.data?.message;
    if (msg) {
      deleteError.value = Array.isArray(msg) ? msg.join(', ') : msg;
    } else {
      deleteError.value = 'Kelas tidak dapat dihapus karena masih memiliki siswa aktif.';
    }
  }
}

function onTahunAjaranChange() {
  fetchKelas();
}

onMounted(async () => {
  await fetchTahunAjaran();
  await Promise.all([fetchKelas(), fetchGuru()]);
});
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Manajemen Kelas</h1>
      <button class="btn btn-primary" @click="openCreateForm">Tambah Kelas</button>
    </div>

    <!-- Filter by Tahun Ajaran -->
    <div class="filters">
      <select v-model="selectedTahunAjaran" class="input" @change="onTahunAjaranChange">
        <option value="">Semua Tahun Ajaran</option>
        <option v-for="ta in tahunAjaranList" :key="ta.id" :value="ta.id">
          {{ ta.nama }} <span v-if="ta.status === 'aktif'">(Aktif)</span>
        </option>
      </select>
    </div>

    <!-- Table -->
    <div class="table-container">
      <table v-if="!loading && filteredKelas.length > 0">
        <thead>
          <tr>
            <th>Nama Kelas</th>
            <th>Tingkat</th>
            <th>Wali Kelas</th>
            <th>Jumlah Siswa</th>
            <th>Kapasitas</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="kelas in filteredKelas" :key="kelas.id">
            <td>{{ kelas.nama }}</td>
            <td>{{ kelas.tingkat }}</td>
            <td>{{ kelas.wali_kelas_nama || '-' }}</td>
            <td>{{ kelas.jumlah_siswa }}</td>
            <td>{{ kelas.kapasitas || '-' }}</td>
            <td class="actions-cell">
              <button class="btn-sm btn-edit" @click="openEditForm(kelas)">Edit</button>
              <button class="btn-sm btn-delete" @click="openDeleteConfirm(kelas)">Hapus</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="loading" class="empty-state">Memuat data...</p>
      <p v-else class="empty-state">Belum ada kelas untuk tahun ajaran ini.</p>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showFormModal" class="modal-overlay" @click.self="showFormModal = false">
      <div class="modal">
        <h2>{{ editingKelas ? 'Edit Kelas' : 'Tambah Kelas' }}</h2>
        <form @submit.prevent="saveKelas">
          <div class="form-group">
            <label>Nama Kelas</label>
            <input
              v-model="form.nama"
              type="text"
              required
              class="input"
              placeholder="1A, 2B, 6C..."
            />
          </div>
          <div class="form-group">
            <label>Tingkat</label>
            <input
              v-model="form.tingkat"
              type="number"
              required
              min="1"
              max="12"
              class="input"
              placeholder="1-12"
            />
          </div>
          <div class="form-group">
            <label>Wali Kelas <span class="optional">(opsional)</span></label>
            <select v-model="form.wali_kelas_id" class="input">
              <option value="">-- Tidak Ada --</option>
              <option v-for="guru in guruList" :key="guru.id" :value="guru.id">
                {{ guru.nama }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Kapasitas <span class="optional">(opsional)</span></label>
            <input v-model="form.kapasitas" type="number" min="1" class="input" placeholder="30" />
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
          Apakah Anda yakin ingin menghapus kelas
          <strong>{{ deletingKelas?.nama }}</strong
          >?
        </p>
        <p v-if="deleteError" class="error-text">{{ deleteError }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showDeleteModal = false">Batal</button>
          <button class="btn btn-danger" @click="deleteKelas">Hapus</button>
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
.filters {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
.input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
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
  max-height: 90vh;
  overflow-y: auto;
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
