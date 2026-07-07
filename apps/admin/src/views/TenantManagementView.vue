<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';

interface Tenant {
  id: string;
  nama: string;
  alamat: string | null;
  telepon: string | null;
  email: string | null;
  is_active: boolean;
  user_count?: number;
  created_at: string;
}

interface TenantForm {
  nama: string;
  alamat: string;
  telepon: string;
  email: string;
}

const tenants = ref<Tenant[]>([]);
const loading = ref(false);

const showFormModal = ref(false);
const editingTenant = ref<Tenant | null>(null);
const form = ref<TenantForm>({ nama: '', alamat: '', telepon: '', email: '' });

async function fetchTenants() {
  loading.value = true;
  try {
    const { data } = await api.get<{ data: Tenant[] }>('/tenants');
    tenants.value = data.data;
  } catch (error) {
    console.error('Failed to fetch tenants:', error);
  } finally {
    loading.value = false;
  }
}

function openCreateForm() {
  editingTenant.value = null;
  form.value = { nama: '', alamat: '', telepon: '', email: '' };
  showFormModal.value = true;
}

function openEditForm(tenant: Tenant) {
  editingTenant.value = tenant;
  form.value = {
    nama: tenant.nama,
    alamat: tenant.alamat || '',
    telepon: tenant.telepon || '',
    email: tenant.email || '',
  };
  showFormModal.value = true;
}

async function saveTenant() {
  const payload = {
    nama: form.value.nama,
    alamat: form.value.alamat || undefined,
    telepon: form.value.telepon || undefined,
    email: form.value.email || undefined,
  };

  try {
    if (editingTenant.value) {
      await api.patch(`/tenants/${editingTenant.value.id}`, payload);
    } else {
      await api.post('/tenants', payload);
    }
    showFormModal.value = false;
    await fetchTenants();
  } catch (error) {
    console.error('Failed to save tenant:', error);
  }
}

async function toggleTenantStatus(tenant: Tenant) {
  const action = tenant.is_active ? 'deactivate' : 'activate';
  const confirmMsg = tenant.is_active
    ? `Menonaktifkan ${tenant.nama} akan memblokir seluruh user di sekolah ini. Lanjutkan?`
    : `Mengaktifkan kembali ${tenant.nama}. Lanjutkan?`;

  if (!confirm(confirmMsg)) return;

  try {
    await api.patch(`/tenants/${tenant.id}/${action}`);
    await fetchTenants();
  } catch (error) {
    console.error(`Failed to ${action} tenant:`, error);
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

onMounted(fetchTenants);
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Manajemen Tenant (Sekolah)</h1>
      <button class="btn btn-primary" @click="openCreateForm">Tambah Sekolah</button>
    </div>

    <div class="table-container">
      <table v-if="!loading && tenants.length > 0">
        <thead>
          <tr>
            <th>Nama Sekolah</th>
            <th>Email</th>
            <th>Telepon</th>
            <th>Jumlah User</th>
            <th>Status</th>
            <th>Terdaftar</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tenant in tenants" :key="tenant.id">
            <td>{{ tenant.nama }}</td>
            <td>{{ tenant.email || '-' }}</td>
            <td>{{ tenant.telepon || '-' }}</td>
            <td>{{ tenant.user_count ?? '-' }}</td>
            <td>
              <span :class="['status', tenant.is_active ? 'status-active' : 'status-inactive']">
                {{ tenant.is_active ? 'Aktif' : 'Nonaktif' }}
              </span>
            </td>
            <td>{{ formatDate(tenant.created_at) }}</td>
            <td class="actions-cell">
              <button class="btn-sm btn-edit" @click="openEditForm(tenant)">Edit</button>
              <button
                :class="['btn-sm', tenant.is_active ? 'btn-deactivate' : 'btn-activate']"
                @click="toggleTenantStatus(tenant)"
              >
                {{ tenant.is_active ? 'Nonaktifkan' : 'Aktifkan' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="loading" class="empty-state">Memuat data...</p>
      <p v-else class="empty-state">Belum ada tenant terdaftar.</p>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showFormModal" class="modal-overlay" @click.self="showFormModal = false">
      <div class="modal">
        <h2>{{ editingTenant ? 'Edit Sekolah' : 'Tambah Sekolah Baru' }}</h2>
        <p v-if="!editingTenant" class="hint">
          Setelah dibuat, satu user Admin default akan dibuatkan dan kredensial dikirim ke email
          sekolah.
        </p>
        <form @submit.prevent="saveTenant">
          <div class="form-group">
            <label>Nama Sekolah</label>
            <input
              v-model="form.nama"
              type="text"
              required
              class="input"
              placeholder="SD Negeri 1 Contoh"
            />
          </div>
          <div class="form-group">
            <label>Alamat</label>
            <textarea
              v-model="form.alamat"
              class="input textarea"
              placeholder="Jl. Pendidikan No. 1"
            ></textarea>
          </div>
          <div class="form-group">
            <label>Telepon</label>
            <input v-model="form.telepon" type="text" class="input" placeholder="021-12345678" />
          </div>
          <div class="form-group">
            <label>Email</label>
            <input
              v-model="form.email"
              type="email"
              class="input"
              placeholder="admin@sekolah.sch.id"
            />
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
.btn-edit {
  background: #fef3c7;
  color: #92400e;
}
.btn-deactivate {
  background: #fee2e2;
  color: #991b1b;
}
.btn-activate {
  background: #d1fae5;
  color: #065f46;
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
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
}
.hint {
  color: #6b7280;
  font-size: 0.875rem;
  margin-bottom: 1rem;
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
.input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}
.textarea {
  resize: vertical;
  min-height: 60px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}
</style>
