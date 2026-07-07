<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { Role } from '@edu/shared';
import { api } from '@/api/client';

interface User {
  id: string;
  nama: string;
  email: string;
  phone?: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

interface UserForm {
  nama: string;
  email: string;
  phone: string;
  role: Role | '';
  is_active: boolean;
}

const users = ref<User[]>([]);
const loading = ref(false);
const search = ref('');
const filterRole = ref<Role | ''>('');
const filterStatus = ref<'' | 'active' | 'inactive'>('');

// Modal state
const showFormModal = ref(false);
const showDeleteModal = ref(false);
const showImportModal = ref(false);
const editingUser = ref<User | null>(null);
const deletingUser = ref<User | null>(null);

const form = reactive<UserForm>({
  nama: '',
  email: '',
  phone: '',
  role: '',
  is_active: true,
});

// CSV import state
const importFile = ref<File | null>(null);
const importPreview = ref<Array<{ nama: string; email: string; mata_pelajaran: string }>>([]);
const importErrors = ref<string[]>([]);
const importing = ref(false);

const staffRoles = [Role.ADMIN, Role.KEPALA_SEKOLAH, Role.GURU, Role.BENDAHARA] as const;

const filteredUsers = computed(() => {
  return users.value.filter((u) => {
    const matchSearch =
      !search.value ||
      u.nama.toLowerCase().includes(search.value.toLowerCase()) ||
      u.email.toLowerCase().includes(search.value.toLowerCase());
    const matchRole = !filterRole.value || u.role === filterRole.value;
    const matchStatus =
      !filterStatus.value ||
      (filterStatus.value === 'active' && u.is_active) ||
      (filterStatus.value === 'inactive' && !u.is_active);
    return matchSearch && matchRole && matchStatus;
  });
});

async function fetchUsers() {
  loading.value = true;
  try {
    const { data } = await api.get<{ data: User[] }>('/users');
    users.value = data.data;
  } catch (error) {
    console.error('Failed to fetch users:', error);
  } finally {
    loading.value = false;
  }
}

function openCreateForm() {
  editingUser.value = null;
  form.nama = '';
  form.email = '';
  form.phone = '';
  form.role = '';
  form.is_active = true;
  showFormModal.value = true;
}

function openEditForm(user: User) {
  editingUser.value = user;
  form.nama = user.nama;
  form.email = user.email;
  form.phone = user.phone || '';
  form.role = user.role;
  form.is_active = user.is_active;
  showFormModal.value = true;
}

function openDeleteConfirm(user: User) {
  deletingUser.value = user;
  showDeleteModal.value = true;
}

async function saveUser() {
  const payload = {
    nama: form.nama,
    email: form.email,
    phone: form.phone || undefined,
    role: form.role,
    is_active: form.is_active,
  };

  try {
    if (editingUser.value) {
      await api.patch(`/users/${editingUser.value.id}`, payload);
    } else {
      await api.post('/users', payload);
    }
    showFormModal.value = false;
    await fetchUsers();
  } catch (error) {
    console.error('Failed to save user:', error);
  }
}

async function deleteUser() {
  if (!deletingUser.value) return;
  try {
    await api.patch(`/users/${deletingUser.value.id}/deactivate`);
    showDeleteModal.value = false;
    deletingUser.value = null;
    await fetchUsers();
  } catch (error) {
    console.error('Failed to delete user:', error);
  }
}

function openImportModal() {
  importFile.value = null;
  importPreview.value = [];
  importErrors.value = [];
  showImportModal.value = true;
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  importFile.value = file;

  // Parse CSV preview
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
    const emailIdx = header.indexOf('email');
    const mapelIdx = header.indexOf('mata_pelajaran');

    if (namaIdx === -1 || emailIdx === -1) {
      importErrors.value = ['Kolom wajib: nama, email'];
      return;
    }

    importErrors.value = [];
    importPreview.value = lines.slice(1, 11).map((line) => {
      const cols = line.split(',').map((c) => c.trim());
      return {
        nama: cols[namaIdx] || '',
        email: cols[emailIdx] || '',
        mata_pelajaran: mapelIdx !== -1 ? cols[mapelIdx] || '' : '',
      };
    });
  };
  reader.readAsText(file);
}

async function importCsv() {
  if (!importFile.value) return;
  importing.value = true;
  try {
    const formData = new FormData();
    formData.append('file', importFile.value);
    await api.post('/users/bulk-import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    showImportModal.value = false;
    await fetchUsers();
  } catch (error) {
    console.error('Failed to import CSV:', error);
  } finally {
    importing.value = false;
  }
}

onMounted(fetchUsers);
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Manajemen User</h1>
      <div class="actions">
        <button class="btn btn-secondary" @click="openImportModal">Import Guru (CSV)</button>
        <button class="btn btn-primary" @click="openCreateForm">Tambah User</button>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters">
      <input v-model="search" type="text" placeholder="Cari nama atau email..." class="input" />
      <select v-model="filterRole" class="input">
        <option value="">Semua Role</option>
        <option v-for="role in staffRoles" :key="role" :value="role">{{ role }}</option>
      </select>
      <select v-model="filterStatus" class="input">
        <option value="">Semua Status</option>
        <option value="active">Aktif</option>
        <option value="inactive">Nonaktif</option>
      </select>
    </div>

    <!-- Table -->
    <div class="table-container">
      <table v-if="!loading && filteredUsers.length > 0">
        <thead>
          <tr>
            <th>Nama</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in filteredUsers" :key="user.id">
            <td>{{ user.nama }}</td>
            <td>{{ user.email }}</td>
            <td>
              <span class="badge">{{ user.role }}</span>
            </td>
            <td>
              <span :class="['status', user.is_active ? 'status-active' : 'status-inactive']">
                {{ user.is_active ? 'Aktif' : 'Nonaktif' }}
              </span>
            </td>
            <td class="actions-cell">
              <button class="btn-sm btn-edit" @click="openEditForm(user)">Edit</button>
              <button class="btn-sm btn-delete" @click="openDeleteConfirm(user)">Hapus</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="loading" class="empty-state">Memuat data...</p>
      <p v-else class="empty-state">Tidak ada user ditemukan.</p>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showFormModal" class="modal-overlay" @click.self="showFormModal = false">
      <div class="modal">
        <h2>{{ editingUser ? 'Edit User' : 'Tambah User' }}</h2>
        <form @submit.prevent="saveUser">
          <div class="form-group">
            <label>Nama</label>
            <input v-model="form.nama" type="text" required class="input" />
          </div>
          <div class="form-group">
            <label>Email</label>
            <input v-model="form.email" type="email" required class="input" />
          </div>
          <div class="form-group">
            <label>Telepon</label>
            <input v-model="form.phone" type="text" class="input" />
          </div>
          <div class="form-group">
            <label>Role</label>
            <select v-model="form.role" required class="input">
              <option value="" disabled>Pilih Role</option>
              <option v-for="role in staffRoles" :key="role" :value="role">{{ role }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input v-model="form.is_active" type="checkbox" />
              Aktif
            </label>
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
          Apakah Anda yakin ingin menghapus user <strong>{{ deletingUser?.nama }}</strong
          >?
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showDeleteModal = false">Batal</button>
          <button class="btn btn-danger" @click="deleteUser">Hapus</button>
        </div>
      </div>
    </div>

    <!-- Import CSV Modal -->
    <div v-if="showImportModal" class="modal-overlay" @click.self="showImportModal = false">
      <div class="modal modal-lg">
        <h2>Import Guru dari CSV</h2>
        <p class="hint">
          Format CSV: kolom wajib <code>nama</code>, <code>email</code>, dan
          <code>mata_pelajaran</code> (opsional).
        </p>

        <div class="form-group">
          <label>Pilih File CSV</label>
          <input type="file" accept=".csv" @change="handleFileSelect" class="input" />
        </div>

        <div v-if="importErrors.length > 0" class="errors">
          <p v-for="(err, i) in importErrors" :key="i" class="error-text">{{ err }}</p>
        </div>

        <div v-if="importPreview.length > 0" class="preview">
          <h3>Preview (maks 10 baris pertama)</h3>
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Mata Pelajaran</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in importPreview" :key="i">
                <td>{{ row.nama }}</td>
                <td>{{ row.email }}</td>
                <td>{{ row.mata_pelajaran }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showImportModal = false">Batal</button>
          <button
            class="btn btn-primary"
            :disabled="!importFile || importErrors.length > 0 || importing"
            @click="importCsv"
          >
            {{ importing ? 'Mengimport...' : 'Import' }}
          </button>
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
.actions {
  display: flex;
  gap: 0.5rem;
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
.badge {
  background: #e0e7ff;
  color: #3730a3;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
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
.status-inactive {
  background: #fee2e2;
  color: #991b1b;
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
.btn-primary:disabled {
  background: #93c5fd;
  cursor: not-allowed;
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
.modal-lg {
  max-width: 640px;
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
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}
.hint {
  color: #6b7280;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}
.preview {
  margin-top: 1rem;
}
.preview h3 {
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
}
.errors {
  margin-top: 0.5rem;
}
.error-text {
  color: #dc2626;
  font-size: 0.875rem;
}
</style>
