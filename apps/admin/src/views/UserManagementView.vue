<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { Role } from '@edu/shared';
import { api } from '@/api/client';
import { PageHeader, BaseModal, SearchSelect, ActionButton } from '@/components/ui';
import type { SelectOption } from '@/components/ui';

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

const statusFilterOptions: SelectOption[] = [
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Nonaktif' },
];

const roleFilterOptions = computed<SelectOption[]>(() =>
  staffRoles.map((role) => ({ value: role, label: role })),
);

const roleSelectOptions = computed<SelectOption[]>(() =>
  staffRoles.map((role) => ({ value: role, label: role })),
);

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
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader title="Manajemen User" description="">
      <template #actions>
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="openImportModal"
        >
          Import Guru (CSV)
        </button>
        <button
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          @click="openCreateForm"
        >
          Tambah User
        </button>
      </template>
    </PageHeader>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3 mb-4">
      <input
        v-model="search"
        type="text"
        placeholder="Cari nama atau email..."
        class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 sm:w-auto sm:min-w-[200px]"
      />
      <SearchSelect
        v-model="filterRole"
        :options="roleFilterOptions"
        placeholder="Semua Role"
        clearable
      />
      <SearchSelect
        v-model="filterStatus"
        :options="statusFilterOptions"
        placeholder="Semua Status"
        clearable
      />
    </div>

    <!-- Table -->
    <div class="bg-white border border-border rounded-xl overflow-hidden">
      <div class="overflow-x-auto">
        <table v-if="!loading && filteredUsers.length > 0" class="w-full">
          <thead class="border-b border-border bg-surface-50">
            <tr>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Nama</th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Email</th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Role</th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Status</th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr
              v-for="user in filteredUsers"
              :key="user.id"
              class="hover:bg-surface-50 transition-colors"
            >
              <td class="px-4 py-3 text-sm text-text-primary">{{ user.nama }}</td>
              <td class="px-4 py-3 text-sm text-text-secondary">{{ user.email }}</td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-primary-50 text-primary-600"
                  >{{ user.role }}</span
                >
              </td>
              <td class="px-4 py-3">
                <span
                  :class="[
                    'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
                    user.is_active
                      ? 'bg-success-50 text-success-700'
                      : 'bg-danger-50 text-danger-700',
                  ]"
                >
                  {{ user.is_active ? 'Aktif' : 'Nonaktif' }}
                </span>
              </td>
              <td class="px-4 py-3">
                <div class="flex gap-2">
                  <ActionButton variant="warning" icon="edit" @click="openEditForm(user)"
                    >Edit</ActionButton
                  >
                  <ActionButton variant="danger" icon="delete" @click="openDeleteConfirm(user)"
                    >Hapus</ActionButton
                  >
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="loading" class="text-center text-text-secondary py-8">Memuat data...</p>
      <p
        v-else-if="filteredUsers.length === 0 && !loading"
        class="text-center text-text-secondary py-8"
      >
        Tidak ada user ditemukan.
      </p>
    </div>

    <!-- Create/Edit Modal -->
    <BaseModal
      :show="showFormModal"
      :title="editingUser ? 'Edit User' : 'Tambah User'"
      @close="showFormModal = false"
      size="lg"
    >
      <form @submit.prevent="saveUser">
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5">Nama</label>
          <input
            v-model="form.nama"
            type="text"
            required
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5">Email</label>
          <input
            v-model="form.email"
            type="email"
            required
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5">Telepon</label>
          <input
            v-model="form.phone"
            type="text"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div class="mb-4">
          <SearchSelect
            v-model="form.role"
            label="Role"
            :options="roleSelectOptions"
            placeholder="Pilih Role"
            required
          />
        </div>
        <div class="mb-4">
          <label
            class="flex items-center gap-2 text-sm font-medium text-text-primary cursor-pointer"
          >
            <input v-model="form.is_active" type="checkbox" class="rounded border-border" />
            Aktif
          </label>
        </div>
      </form>
      <template #footer>
        <button
          type="button"
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showFormModal = false"
        >
          Batal
        </button>
        <button
          type="button"
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          @click="saveUser"
        >
          Simpan
        </button>
      </template>
    </BaseModal>

    <!-- Delete Confirmation Modal -->
    <BaseModal
      :show="showDeleteModal"
      title="Konfirmasi Hapus"
      @close="showDeleteModal = false"
      size="lg"
    >
      <p class="text-sm text-text-secondary">
        Apakah Anda yakin ingin menghapus user <strong>{{ deletingUser?.nama }}</strong
        >?
      </p>
      <template #footer>
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showDeleteModal = false"
        >
          Batal
        </button>
        <button
          class="px-4 py-2 text-sm font-medium text-white bg-danger-500 rounded-lg hover:bg-danger-700 transition-colors"
          @click="deleteUser"
        >
          Hapus
        </button>
      </template>
    </BaseModal>

    <!-- Import CSV Modal -->
    <BaseModal
      :show="showImportModal"
      title="Import Guru dari CSV"
      @close="showImportModal = false"
      size="lg"
    >
      <p class="text-sm text-text-secondary mb-4">
        Format CSV: kolom wajib
        <code class="px-1 py-0.5 bg-surface-100 rounded text-xs">nama</code>,
        <code class="px-1 py-0.5 bg-surface-100 rounded text-xs">email</code>, dan
        <code class="px-1 py-0.5 bg-surface-100 rounded text-xs">mata_pelajaran</code> (opsional).
      </p>

      <div class="mb-4">
        <label class="block text-sm font-medium text-text-primary mb-1.5">Pilih File CSV</label>
        <input
          type="file"
          accept=".csv"
          @change="handleFileSelect"
          class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        />
      </div>

      <div
        v-if="importErrors.length > 0"
        class="p-3 bg-danger-50 border border-danger-500/20 rounded-lg text-sm text-danger-700 mb-4"
      >
        <p v-for="(err, i) in importErrors" :key="i">{{ err }}</p>
      </div>

      <div v-if="importPreview.length > 0" class="mt-4">
        <h3 class="text-sm font-medium text-text-primary mb-2">Preview (maks 10 baris pertama)</h3>
        <div class="overflow-x-auto border border-border rounded-lg">
          <table class="w-full">
            <thead class="border-b border-border bg-surface-50">
              <tr>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Nama</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Email</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                  Mata Pelajaran
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="(row, i) in importPreview"
                :key="i"
                class="hover:bg-surface-50 transition-colors"
              >
                <td class="px-4 py-3 text-sm">{{ row.nama }}</td>
                <td class="px-4 py-3 text-sm">{{ row.email }}</td>
                <td class="px-4 py-3 text-sm">{{ row.mata_pelajaran }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <template #footer>
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showImportModal = false"
        >
          Batal
        </button>
        <button
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!importFile || importErrors.length > 0 || importing"
          @click="importCsv"
        >
          {{ importing ? 'Mengimport...' : 'Import' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
