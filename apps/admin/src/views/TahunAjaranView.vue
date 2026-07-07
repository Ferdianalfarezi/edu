<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';

interface TahunAjaran {
  id: string;
  nama: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  status: 'disiapkan' | 'aktif' | 'nonaktif';
  created_at: string;
}

interface TahunAjaranForm {
  nama: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
}

const items = ref<TahunAjaran[]>([]);
const loading = ref(false);

// Modal state
const showFormModal = ref(false);
const showActivateModal = ref(false);
const activatingItem = ref<TahunAjaran | null>(null);
const formError = ref('');
const activateError = ref('');

const form = ref<TahunAjaranForm>({
  nama: '',
  tanggal_mulai: '',
  tanggal_selesai: '',
});

function statusLabel(status: string): string {
  switch (status) {
    case 'aktif':
      return 'Aktif';
    case 'disiapkan':
      return 'Disiapkan';
    case 'nonaktif':
      return 'Nonaktif';
    default:
      return status;
  }
}

function statusClass(status: string): string {
  switch (status) {
    case 'aktif':
      return 'status-active';
    case 'disiapkan':
      return 'status-prepared';
    case 'nonaktif':
      return 'status-inactive';
    default:
      return '';
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

async function fetchItems() {
  loading.value = true;
  try {
    const { data } = await api.get<{ data: TahunAjaran[] }>('/tahun-ajaran');
    items.value = data.data;
  } catch (error) {
    console.error('Failed to fetch tahun ajaran:', error);
  } finally {
    loading.value = false;
  }
}

function openCreateForm() {
  formError.value = '';
  form.value = { nama: '', tanggal_mulai: '', tanggal_selesai: '' };
  showFormModal.value = true;
}

function openActivateConfirm(item: TahunAjaran) {
  activatingItem.value = item;
  activateError.value = '';
  showActivateModal.value = true;
}

async function saveTahunAjaran() {
  formError.value = '';
  const payload = {
    nama: form.value.nama,
    tanggal_mulai: form.value.tanggal_mulai,
    tanggal_selesai: form.value.tanggal_selesai,
  };

  try {
    await api.post('/tahun-ajaran', payload);
    showFormModal.value = false;
    await fetchItems();
  } catch (error: any) {
    const msg = error.response?.data?.message;
    if (msg) {
      formError.value = Array.isArray(msg) ? msg.join(', ') : msg;
    } else {
      formError.value = 'Gagal membuat tahun ajaran.';
    }
  }
}

async function activateTahunAjaran() {
  if (!activatingItem.value) return;
  activateError.value = '';
  try {
    await api.patch(`/tahun-ajaran/${activatingItem.value.id}/activate`);
    showActivateModal.value = false;
    activatingItem.value = null;
    await fetchItems();
  } catch (error: any) {
    const msg = error.response?.data?.message;
    if (msg) {
      activateError.value = Array.isArray(msg) ? msg.join(', ') : msg;
    } else {
      activateError.value = 'Gagal mengaktifkan tahun ajaran.';
    }
  }
}

onMounted(fetchItems);
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Manajemen Tahun Ajaran</h1>
      <button class="btn btn-primary" @click="openCreateForm">Tambah Tahun Ajaran</button>
    </div>

    <!-- Table -->
    <div class="table-container">
      <table v-if="!loading && items.length > 0">
        <thead>
          <tr>
            <th>Nama</th>
            <th>Tanggal Mulai</th>
            <th>Tanggal Selesai</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td>{{ item.nama }}</td>
            <td>{{ formatDate(item.tanggal_mulai) }}</td>
            <td>{{ formatDate(item.tanggal_selesai) }}</td>
            <td>
              <span :class="['status', statusClass(item.status)]">
                {{ statusLabel(item.status) }}
              </span>
            </td>
            <td class="actions-cell">
              <button
                v-if="item.status === 'disiapkan'"
                class="btn-sm btn-activate"
                @click="openActivateConfirm(item)"
              >
                Aktifkan
              </button>
              <span v-else-if="item.status === 'aktif'" class="text-muted">Sedang Aktif</span>
              <span v-else class="text-muted">Historis</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="loading" class="empty-state">Memuat data...</p>
      <p v-else class="empty-state">Belum ada tahun ajaran.</p>
    </div>

    <!-- Create Modal -->
    <div v-if="showFormModal" class="modal-overlay" @click.self="showFormModal = false">
      <div class="modal">
        <h2>Tambah Tahun Ajaran</h2>
        <p class="hint">
          Tahun ajaran baru akan dibuat dengan status "Disiapkan". Struktur kelas dari tahun ajaran
          aktif akan otomatis diduplikasi.
        </p>
        <form @submit.prevent="saveTahunAjaran">
          <div class="form-group">
            <label>Nama Periode</label>
            <input v-model="form.nama" type="text" required class="input" placeholder="2024/2025" />
          </div>
          <div class="form-group">
            <label>Tanggal Mulai</label>
            <input v-model="form.tanggal_mulai" type="date" required class="input" />
          </div>
          <div class="form-group">
            <label>Tanggal Selesai</label>
            <input v-model="form.tanggal_selesai" type="date" required class="input" />
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

    <!-- Activate Confirmation Modal -->
    <div v-if="showActivateModal" class="modal-overlay" @click.self="showActivateModal = false">
      <div class="modal">
        <h2>Aktifkan Tahun Ajaran</h2>
        <p>
          Apakah Anda yakin ingin mengaktifkan tahun ajaran
          <strong>{{ activatingItem?.nama }}</strong
          >?
        </p>
        <p class="hint">
          Tahun ajaran yang sedang aktif akan otomatis dinonaktifkan. Hanya boleh ada satu tahun
          ajaran aktif dalam satu waktu.
        </p>
        <p v-if="activateError" class="error-text">{{ activateError }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showActivateModal = false">Batal</button>
          <button class="btn btn-primary" @click="activateTahunAjaran">Aktifkan</button>
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
  align-items: center;
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
.status-prepared {
  background: #fef3c7;
  color: #92400e;
}
.status-inactive {
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
.btn-sm {
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
}
.btn-activate {
  background: #dbeafe;
  color: #1e40af;
}
.btn-activate:hover {
  background: #bfdbfe;
}
.text-muted {
  color: #9ca3af;
  font-size: 0.75rem;
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
.input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}
.hint {
  color: #6b7280;
  font-size: 0.875rem;
  margin-bottom: 1rem;
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
