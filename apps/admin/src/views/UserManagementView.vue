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
  isActive: boolean;
  createdAt: string;
}

interface UserForm {
  nama: string;
  email: string;
  phone: string;
  role: Role | '';
  isActive: boolean;
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
  isActive: true,
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
      (filterStatus.value === 'active' && u.isActive) ||
      (filterStatus.value === 'inactive' && !u.isActive);
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
  form.isActive = true;
  showFormModal.value = true;
}

function openEditForm(user: User) {
  editingUser.value = user;
  form.nama = user.nama;
  form.email = user.email;
  form.phone = user.phone || '';
  form.role = user.role;
  form.isActive = user.isActive;
  showFormModal.value = true;
}

function openDeleteConfirm(user: User) {
  deletingUser.value = user;
  showDeleteModal.value = true;
}

async function saveUser() {
  const payload: Record<string, unknown> = {
    nama: form.nama,
    email: form.email,
    phone: form.phone || undefined,
    role: form.role,
  };

  // isActive only relevant when editing existing user
  if (editingUser.value) {
    payload.isActive = form.isActive;
  }

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
  <div class="p-8 max-w-7xl mx-auto">
    <PageHeader title="Manajemen User">
      <template #actions>
        <ActionButton variant="neutral" @click="openImportModal"> Import Guru (CSV) </ActionButton>
        <ActionButton variant="primary" @click="openCreateForm"> Tambah User </ActionButton>
      </template>
    </PageHeader>

    <!-- Filters -->
    <div class="flex flex-wrap items-end gap-3 mb-6">
      <div class="relative min-w-[200px]">
        <input
          v-model="search"
          type="text"
          placeholder="Cari nama atau email..."
          class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        />
      </div>
      <div class="w-44">
        <SearchSelect
          v-model="filterRole"
          :options="roleFilterOptions"
          placeholder="Semua Role"
          clearable
        />
      </div>
      <div class="w-44">
        <SearchSelect
          v-model="filterStatus"
          :options="statusFilterOptions"
          placeholder="Semua Status"
          clearable
        />
      </div>
    </div>

    <!-- Table Card -->
    <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
      <!-- Section Header -->
      <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
        <h3 class="text-[16px] font-bold text-primary-800">Daftar User</h3>
      </div>

      <div class="overflow-x-auto">
        <table v-if="!loading && filteredUsers.length > 0" class="w-full">
          <thead class="border-b-2 border-stone-200">
            <tr>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Nama
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Email
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Role
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Status
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Aksi
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-200">
            <tr
              v-for="user in filteredUsers"
              :key="user.id"
              class="hover:bg-primary-50 transition-colors"
            >
              <td class="px-5 py-4 text-[15px] text-stone-800 font-medium">{{ user.nama }}</td>
              <td class="px-5 py-4 text-[15px] text-stone-600">{{ user.email }}</td>
              <td class="px-5 py-4">
                <span
                  class="inline-flex items-center px-2.5 py-1 rounded-md text-[13px] font-semibold bg-primary-50 text-primary-600"
                >
                  {{ user.role }}
                </span>
              </td>
              <td class="px-5 py-4">
                <span
                  :class="[
                    'inline-flex items-center px-2.5 py-1 rounded-md text-[13px] font-semibold',
                    user.isActive
                      ? 'bg-success-50 text-success-700'
                      : 'bg-danger-50 text-danger-700',
                  ]"
                >
                  {{ user.isActive ? 'Aktif' : 'Nonaktif' }}
                </span>
              </td>
              <td class="px-5 py-4">
                <div class="flex gap-2">
                  <ActionButton variant="warning" icon="edit" @click="openEditForm(user)">
                    Edit
                  </ActionButton>
                  <ActionButton variant="danger" icon="delete" @click="openDeleteConfirm(user)">
                    Hapus
                  </ActionButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="loading" class="py-12 text-center">
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

      <p
        v-else-if="filteredUsers.length === 0 && !loading"
        class="text-center text-[15px] text-stone-500 py-12"
      >
        Tidak ada user ditemukan.
      </p>
    </div>

    <!-- Create/Edit Modal -->
    <BaseModal
      :show="showFormModal"
      :title="editingUser ? 'Edit User' : 'Tambah User'"
      size="lg"
      @close="showFormModal = false"
    >
      <form @submit.prevent="saveUser">
        <div class="mb-4">
          <label class="block text-[15px] font-medium text-stone-800 mb-1.5">Nama</label>
          <input
            v-model="form.nama"
            type="text"
            required
            class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div class="mb-4">
          <label class="block text-[15px] font-medium text-stone-800 mb-1.5">Email</label>
          <input
            v-model="form.email"
            type="email"
            required
            class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div class="mb-4">
          <label class="block text-[15px] font-medium text-stone-800 mb-1.5">Telepon</label>
          <input
            v-model="form.phone"
            type="text"
            class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
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
            class="flex items-center gap-2 text-[15px] font-medium text-stone-800 cursor-pointer"
          >
            <input v-model="form.isActive" type="checkbox" class="rounded border-stone-300" />
            Aktif
          </label>
        </div>
      </form>
      <template #footer>
        <ActionButton variant="neutral" @click="showFormModal = false"> Batal </ActionButton>
        <ActionButton variant="primary" @click="saveUser"> Simpan </ActionButton>
      </template>
    </BaseModal>

    <!-- Delete Confirmation Modal -->
    <BaseModal
      :show="showDeleteModal"
      title="Konfirmasi Hapus"
      size="lg"
      @close="showDeleteModal = false"
    >
      <p class="text-[15px] text-stone-600">
        Apakah Anda yakin ingin menghapus user
        <strong class="text-stone-800">{{ deletingUser?.nama }}</strong
        >?
      </p>
      <template #footer>
        <ActionButton variant="neutral" @click="showDeleteModal = false"> Batal </ActionButton>
        <ActionButton variant="danger" @click="deleteUser"> Hapus </ActionButton>
      </template>
    </BaseModal>

    <!-- Import CSV Modal -->
    <BaseModal
      :show="showImportModal"
      title="Import Guru dari CSV"
      size="lg"
      @close="showImportModal = false"
    >
      <p class="text-[15px] text-stone-600 mb-4">
        Format CSV: kolom wajib
        <code class="px-1.5 py-0.5 bg-surface-warm rounded text-[13px] font-semibold">nama</code>,
        <code class="px-1.5 py-0.5 bg-surface-warm rounded text-[13px] font-semibold">email</code>,
        dan
        <code class="px-1.5 py-0.5 bg-surface-warm rounded text-[13px] font-semibold"
          >mata_pelajaran</code
        >
        (opsional).
      </p>

      <div class="mb-4">
        <label class="block text-[15px] font-medium text-stone-800 mb-1.5">Pilih File CSV</label>
        <input
          type="file"
          accept=".csv"
          class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          @change="handleFileSelect"
        />
      </div>

      <div
        v-if="importErrors.length > 0"
        class="p-4 bg-danger-50 border-2 border-danger-500/20 rounded-xs text-[15px] text-danger-700 mb-4"
      >
        <p v-for="(err, i) in importErrors" :key="i">{{ err }}</p>
      </div>

      <div v-if="importPreview.length > 0" class="mt-4">
        <h3 class="text-[15px] font-bold text-stone-800 mb-3">Preview (maks 10 baris pertama)</h3>
        <div class="overflow-x-auto border-2 border-stone-200 rounded-xs">
          <table class="w-full">
            <thead class="border-b-2 border-stone-200">
              <tr>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
                >
                  Nama
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
                >
                  Email
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
                >
                  Mata Pelajaran
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-200">
              <tr
                v-for="(row, i) in importPreview"
                :key="i"
                class="hover:bg-primary-50 transition-colors"
              >
                <td class="px-5 py-4 text-[15px] text-stone-800">{{ row.nama }}</td>
                <td class="px-5 py-4 text-[15px] text-stone-600">{{ row.email }}</td>
                <td class="px-5 py-4 text-[15px] text-stone-600">{{ row.mata_pelajaran }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <template #footer>
        <ActionButton variant="neutral" @click="showImportModal = false"> Batal </ActionButton>
        <ActionButton
          variant="primary"
          :disabled="!importFile || importErrors.length > 0 || importing"
          @click="importCsv"
        >
          {{ importing ? 'Mengimport...' : 'Import' }}
        </ActionButton>
      </template>
    </BaseModal>
  </div>
</template>
