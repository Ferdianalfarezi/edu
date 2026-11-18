<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { Role } from '@edu/shared';
import { api } from '@/api/client';
import {
  PageHeader,
  BaseModal,
  SearchSelect,
  ActionButton,
  TablePagination,
} from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import { useTableUrlState } from '@/composables/useTableUrlState';
import { useAuthStore } from '@/stores';
import ResetPasswordDialog from '@/components/ResetPasswordDialog.vue';
import { useToast } from '@/composables/useToast';

interface User {
  id: string;
  nama: string | null;
  email: string | null;
  phone?: string | null;
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

// ── Auth store and toast ──
const authStore = useAuthStore();
const toast = useToast();

// ── Reset password state ──
const showResetDialog = ref(false);
const resettingUser = ref<User | null>(null);

function openResetDialog(user: User) {
  resettingUser.value = user;
  showResetDialog.value = true;
}

function onResetSuccess(userEmail: string) {
  toast.success('Password berhasil direset dan email telah dikirim ke ' + userEmail, 5000);
}

// ── Server-side state (useTableUrlState syncs search/filters/page to URL) ──
const { page, pageSize, search, filters } = useTableUrlState({
  searchKey: 'search',
  defaultPageSize: 25,
  filters: [
    {
      key: 'role',
      type: 'enum',
      enumValues: [Role.ADMIN, Role.KEPALA_SEKOLAH, Role.GURU, Role.BENDAHARA],
    },
    { key: 'is_active', type: 'enum', enumValues: ['true', 'false', 'all'] },
  ],
});

const filterRole = filters['role'];
const filterStatus = filters['is_active'];

// ── Cursor stack for multi-page navigation ──
// Index 0 = page 1 (no cursor), index 1 = cursor for page 2, etc.
const cursorStack = ref<(string | null)[]>([null]);

const users = ref<User[]>([]);
const loading = ref(false);
const hasNext = ref(false);
const totalPages = ref(1);

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
const importPreview = ref<Array<{ nama: string; email: string; telepon: string; role: string }>>(
  [],
);
const importDilewati = ref<Array<{ email: string; reason: string }>>([]);
const importErrors = ref<string[]>([]);
const importing = ref(false);

const staffRoles = [Role.ADMIN, Role.KEPALA_SEKOLAH, Role.GURU, Role.BENDAHARA] as const;

const statusFilterOptions: SelectOption[] = [
  { value: 'true', label: 'Aktif' },
  { value: 'false', label: 'Nonaktif' },
  { value: 'all', label: 'Semua' },
];

const roleFilterOptions = computed<SelectOption[]>(() =>
  staffRoles.map((role) => ({ value: role, label: role })),
);

const roleSelectOptions = computed<SelectOption[]>(() =>
  staffRoles.map((role) => ({ value: role, label: role })),
);

// ── Fetch users from API using cursor pagination ──
async function fetchUsers(cursor: string | null = null) {
  loading.value = true;
  try {
    const params: Record<string, string | number> = {
      page_size: pageSize.value,
    };
    if (search.value) params.search = search.value;
    if (filterRole.value) params.role = filterRole.value;
    if (filterStatus.value) params.is_active = filterStatus.value;
    if (cursor) params.cursor = cursor;

    const { data } = await api.get<{
      data: User[];
      meta: { has_next: boolean; cursor: string | null };
    }>('/users', { params });

    users.value = data.data;
    hasNext.value = data.meta.has_next;

    // Update cursor stack for the current page
    if (hasNext.value && data.meta.cursor) {
      if (cursorStack.value.length <= page.value) {
        cursorStack.value.push(data.meta.cursor);
      } else {
        cursorStack.value[page.value] = data.meta.cursor;
      }
    }

    // Estimate total pages: if we have a next page, show at least current + 1
    totalPages.value = hasNext.value ? page.value + 1 : page.value;
  } catch (error) {
    console.error('Failed to fetch users:', error);
  } finally {
    loading.value = false;
  }
}

// ── Reset cursor stack and go to page 1 when filters/search change ──
watch(
  () => ({ s: search.value, r: filterRole.value, st: filterStatus.value, ps: pageSize.value }),
  () => {
    cursorStack.value = [null];
    page.value = 1;
    fetchUsers(null);
  },
  { immediate: true },
);

// ── Navigate pages using cursor stack ──
watch(page, (newPage) => {
  const cursor = cursorStack.value[newPage - 1] ?? null;
  fetchUsers(cursor);
});

function onPageChange(newPage: number) {
  page.value = newPage;
}

function onPageSizeChange(size: number) {
  pageSize.value = size;
  // Reset handled by useTableUrlState watcher above
}

// ── CRUD helpers ──
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
  form.nama = user.nama ?? '';
  form.email = user.email ?? '';
  form.phone = user.phone ?? '';
  form.role = user.role;
  form.isActive = user.isActive;
  showFormModal.value = true;
}

function openDeleteConfirm(user: User) {
  deletingUser.value = user;
  showDeleteModal.value = true;
}

async function saveUser() {
  try {
    if (editingUser.value) {
      const updatePayload: Record<string, unknown> = {
        nama: form.nama,
        email: form.email,
        phone: form.phone,
        role: form.role,
      };
      await api.patch(`/users/${editingUser.value.id}`, updatePayload);

      const wasActive = editingUser.value.isActive;
      if (form.isActive !== wasActive) {
        if (form.isActive) {
          await api.patch(`/users/${editingUser.value.id}/activate`);
        } else {
          await api.patch(`/users/${editingUser.value.id}/deactivate`);
        }
      }
    } else {
      const createPayload: Record<string, unknown> = {
        nama: form.nama,
        email: form.email,
        phone: form.phone || undefined,
        role: form.role,
      };
      await api.post('/users', createPayload);
    }
    showFormModal.value = false;
    // Refresh current page
    const cursor = cursorStack.value[page.value - 1] ?? null;
    await fetchUsers(cursor);
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
    const cursor = cursorStack.value[page.value - 1] ?? null;
    await fetchUsers(cursor);
  } catch (error) {
    console.error('Failed to delete user:', error);
  }
}

function openImportModal() {
  importFile.value = null;
  importPreview.value = [];
  importErrors.value = [];
  importDilewati.value = [];
  showImportModal.value = true;
}

// Template CSV import pengguna (semua role). Data tambahan guru dilengkapi di halaman Guru.
function downloadImportTemplate() {
  const csv = [
    'nama,email,telepon,role',
    'Budi Santoso,budi@sekolah.sch.id,081234567890,guru',
    'Siti Aminah,siti@sekolah.sch.id,081298765432,bendahara',
  ].join('\n');
  const url = URL.createObjectURL(new Blob([csv + '\n'], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'template_import_pengguna.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  importFile.value = file;

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
    const roleIdx = header.indexOf('role');
    const teleponIdx = header.findIndex((h) => ['telepon', 'phone', 'no_hp', 'hp'].includes(h));

    if (namaIdx === -1 || emailIdx === -1 || roleIdx === -1) {
      importErrors.value = ['Kolom wajib: nama, email, role'];
      return;
    }

    importErrors.value = [];
    importPreview.value = lines.slice(1, 11).map((line) => {
      const cols = line.split(',').map((c) => c.trim());
      return {
        nama: cols[namaIdx] || '',
        email: cols[emailIdx] || '',
        telepon: teleponIdx !== -1 ? cols[teleponIdx] || '' : '',
        role: cols[roleIdx] || '',
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
    const { data } = await api.post<{
      created: number;
      skipped: Array<{ email: string; reason: string }>;
      total: number;
    }>('/users/bulk-import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    if (data.created > 0) toast.success(`${data.created} pengguna ditambahkan.`);
    // Baris yang dilewati ditampilkan di modal supaya bisa diperbaiki
    importDilewati.value = data.skipped ?? [];
    if (importDilewati.value.length === 0) showImportModal.value = false;
    cursorStack.value = [null];
    page.value = 1;
    await fetchUsers(null);
  } catch (error) {
    console.error('Failed to import CSV:', error);
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <div class="p-8 max-w-7xl mx-auto">
    <PageHeader title="Manajemen User">
      <template #actions>
        <ActionButton variant="neutral" @click="openImportModal"> Import User (CSV) </ActionButton>
        <ActionButton variant="primary" @click="openCreateForm"> Tambah User </ActionButton>
      </template>
    </PageHeader>

    <!-- Filters -->
    <div class="flex flex-wrap items-end gap-3 mb-6">
      <div class="relative min-w-50">
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
        <table v-if="!loading && users.length > 0" class="w-full">
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
            <tr v-for="user in users" :key="user.id" class="hover:bg-primary-50 transition-colors">
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
                  <ActionButton
                    v-if="authStore.hasRole(Role.SUPER_ADMIN) && user.role !== Role.SUPER_ADMIN"
                    variant="purple"
                    :disabled="!user.email || !user.email.trim()"
                    @click="openResetDialog(user)"
                  >
                    Reset Password
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
        v-else-if="users.length === 0 && !loading"
        class="text-center text-[15px] text-stone-500 py-12"
      >
        Tidak ada user ditemukan.
      </p>

      <!-- Pagination -->
      <TablePagination
        v-if="totalPages > 1 || hasNext"
        :current-page="page"
        :total-pages="totalPages"
        :total-count="totalPages * pageSize"
        :page-size="pageSize"
        :loading="loading"
        @page-change="onPageChange"
        @page-size-change="onPageSizeChange"
      />
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

    <!-- Reset Password Dialog -->
    <ResetPasswordDialog
      :show="showResetDialog"
      :user="resettingUser"
      @close="showResetDialog = false"
      @success="onResetSuccess"
    />

    <!-- Import CSV Modal -->
    <BaseModal
      :show="showImportModal"
      title="Import User dari CSV"
      size="lg"
      @close="showImportModal = false"
    >
      <p class="text-[15px] text-stone-600 mb-2">
        Kolom wajib
        <code class="px-1.5 py-0.5 bg-surface-warm rounded text-[13px] font-semibold">nama</code>,
        <code class="px-1.5 py-0.5 bg-surface-warm rounded text-[13px] font-semibold">email</code>,
        <code class="px-1.5 py-0.5 bg-surface-warm rounded text-[13px] font-semibold">role</code>;
        opsional
        <code class="px-1.5 py-0.5 bg-surface-warm rounded text-[13px] font-semibold">telepon</code
        >. Role yang valid:
        <code class="px-1.5 py-0.5 bg-surface-warm rounded text-[13px] font-semibold">admin</code>,
        <code class="px-1.5 py-0.5 bg-surface-warm rounded text-[13px] font-semibold"
          >kepala_sekolah</code
        >,
        <code class="px-1.5 py-0.5 bg-surface-warm rounded text-[13px] font-semibold">guru</code>,
        <code class="px-1.5 py-0.5 bg-surface-warm rounded text-[13px] font-semibold"
          >bendahara</code
        >.
      </p>
      <p class="text-[14px] text-stone-500 mb-4">
        Data tambahan guru (tanggal lahir, pendidikan, alamat, dll.) dilengkapi di halaman Guru.
      </p>
      <div
        class="flex items-center justify-between gap-3 p-3 mb-4 rounded-lg border border-border bg-surface-50"
      >
        <p class="text-sm text-text-secondary">
          Belum punya format? Unduh template lalu isi datanya.
        </p>
        <button
          type="button"
          class="shrink-0 px-3 py-2 rounded-lg border border-border bg-white text-sm font-medium text-text-primary hover:bg-surface-100"
          @click="downloadImportTemplate"
        >
          Unduh Template CSV
        </button>
      </div>

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

      <div
        v-if="importDilewati.length > 0"
        class="p-4 bg-warning-50 border-2 border-warning-100 rounded-xs text-[14px] text-warning-700 mb-4"
      >
        <p class="font-semibold mb-1">{{ importDilewati.length }} baris tidak diimport:</p>
        <p v-for="(d, i) in importDilewati" :key="i">{{ d.email }}: {{ d.reason }}</p>
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
                  Telepon
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
                >
                  Role
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
                <td class="px-5 py-4 text-[15px] text-stone-600">{{ row.telepon || '-' }}</td>
                <td class="px-5 py-4 text-[15px] text-stone-600">{{ row.role }}</td>
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
