<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';
import { PageHeader, BaseModal, ActionButton } from '@/components/ui';

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
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader title="Manajemen Tenant (Sekolah)" description="">
      <template #actions>
        <button
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          @click="openCreateForm"
        >
          Tambah Sekolah
        </button>
      </template>
    </PageHeader>

    <div class="bg-white border border-border rounded-xl overflow-hidden">
      <div v-if="!loading && tenants.length > 0" class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-border bg-surface-50">
            <tr>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                Nama Sekolah
              </th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Email</th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Telepon</th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                Jumlah User
              </th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Status</th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Terdaftar</th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr
              v-for="tenant in tenants"
              :key="tenant.id"
              class="hover:bg-surface-50 transition-colors"
            >
              <td class="px-4 py-3 text-sm text-text-primary">{{ tenant.nama }}</td>
              <td class="px-4 py-3 text-sm text-text-secondary">{{ tenant.email || '-' }}</td>
              <td class="px-4 py-3 text-sm text-text-secondary">{{ tenant.telepon || '-' }}</td>
              <td class="px-4 py-3 text-sm text-text-secondary">{{ tenant.user_count ?? '-' }}</td>
              <td class="px-4 py-3">
                <span
                  :class="[
                    'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
                    tenant.is_active
                      ? 'bg-success-50 text-success-700'
                      : 'bg-danger-50 text-danger-700',
                  ]"
                >
                  {{ tenant.is_active ? 'Aktif' : 'Nonaktif' }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-text-secondary">
                {{ formatDate(tenant.created_at) }}
              </td>
              <td class="px-4 py-3">
                <div class="flex gap-2">
                  <ActionButton variant="warning" icon="edit" @click="openEditForm(tenant)"
                    >Edit</ActionButton
                  >
                  <ActionButton
                    :variant="tenant.is_active ? 'danger' : 'success'"
                    :icon="tenant.is_active ? 'cancel' : 'activate'"
                    @click="toggleTenantStatus(tenant)"
                    >{{ tenant.is_active ? 'Nonaktifkan' : 'Aktifkan' }}</ActionButton
                  >
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else-if="loading" class="text-center text-text-secondary py-8">Memuat data...</p>
      <p v-else class="text-center text-text-secondary py-8">Belum ada tenant terdaftar.</p>
    </div>

    <!-- Create/Edit Modal -->
    <BaseModal
      :show="showFormModal"
      :title="editingTenant ? 'Edit Sekolah' : 'Tambah Sekolah Baru'"
      @close="showFormModal = false"
      size="lg"
    >
      <p v-if="!editingTenant" class="text-sm text-text-secondary mb-4">
        Setelah dibuat, satu user Admin default akan dibuatkan dan kredensial dikirim ke email
        sekolah.
      </p>
      <form @submit.prevent="saveTenant">
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5">Nama Sekolah</label>
          <input
            v-model="form.nama"
            type="text"
            required
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            placeholder="SD Negeri 1 Contoh"
          />
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5">Alamat</label>
          <textarea
            v-model="form.alamat"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 min-h-[60px] resize-y"
            placeholder="Jl. Pendidikan No. 1"
          ></textarea>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5">Telepon</label>
          <input
            v-model="form.telepon"
            type="text"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            placeholder="021-12345678"
          />
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5">Email</label>
          <input
            v-model="form.email"
            type="email"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            placeholder="admin@sekolah.sch.id"
          />
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
          @click="saveTenant"
        >
          Simpan
        </button>
      </template>
    </BaseModal>
  </div>
</template>
