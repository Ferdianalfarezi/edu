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
  jumlahTingkat: number;
  hariKerja?: '5_hari' | '6_hari';
  isActive: boolean;
  userCount?: number;
  createdAt: string;
}

interface TenantForm {
  nama: string;
  alamat: string;
  telepon: string;
  email: string;
  jumlahTingkat: number;
  hariKerja: '5_hari' | '6_hari';
  adminNama: string;
  adminEmail: string;
}

const tenants = ref<Tenant[]>([]);
const loading = ref(false);

const showFormModal = ref(false);
const editingTenant = ref<Tenant | null>(null);
const form = ref<TenantForm>({
  nama: '',
  alamat: '',
  telepon: '',
  email: '',
  jumlahTingkat: 3,
  hariKerja: '6_hari',
  adminNama: '',
  adminEmail: '',
});

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
  form.value = {
    nama: '',
    alamat: '',
    telepon: '',
    email: '',
    jumlahTingkat: 3,
    hariKerja: '6_hari',
    adminNama: '',
    adminEmail: '',
  };
  showFormModal.value = true;
}

function openEditForm(tenant: Tenant) {
  editingTenant.value = tenant;
  form.value = {
    nama: tenant.nama,
    alamat: tenant.alamat || '',
    telepon: tenant.telepon || '',
    email: tenant.email || '',
    jumlahTingkat: tenant.jumlahTingkat,
    hariKerja: '6_hari',
    adminNama: '',
    adminEmail: '',
  };
  showFormModal.value = true;
}

async function saveTenant() {
  try {
    if (editingTenant.value) {
      const payload = {
        nama: form.value.nama,
        alamat: form.value.alamat || undefined,
        telepon: form.value.telepon || undefined,
        email: form.value.email || undefined,
      };
      await api.patch(`/tenants/${editingTenant.value.id}`, payload);
    } else {
      const payload = {
        nama: form.value.nama,
        alamat: form.value.alamat || undefined,
        telepon: form.value.telepon || undefined,
        email: form.value.email || undefined,
        jumlahTingkat: form.value.jumlahTingkat,
        hariKerja: form.value.hariKerja,
        adminNama: form.value.adminNama,
        adminEmail: form.value.adminEmail,
      };
      await api.post('/tenants', payload);
    }
    showFormModal.value = false;
    await fetchTenants();
  } catch (error) {
    console.error('Failed to save tenant:', error);
  }
}

async function toggleTenantStatus(tenant: Tenant) {
  const action = tenant.isActive ? 'deactivate' : 'activate';
  const confirmMsg = tenant.isActive
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
  <div class="p-8 max-w-7xl mx-auto">
    <PageHeader title="Manajemen Tenant (Sekolah)">
      <template #actions>
        <ActionButton variant="primary" @click="openCreateForm"> Tambah Sekolah </ActionButton>
      </template>
    </PageHeader>

    <!-- Table Card -->
    <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
      <!-- Section Header -->
      <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
        <h3 class="text-[16px] font-bold text-primary-800">Daftar Sekolah</h3>
      </div>

      <div v-if="!loading && tenants.length > 0" class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b-2 border-stone-200">
            <tr>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Nama Sekolah
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
                Jumlah User
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Hari Kerja
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Status
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Terdaftar
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
              v-for="tenant in tenants"
              :key="tenant.id"
              class="hover:bg-primary-50 transition-colors"
            >
              <td class="px-5 py-4 text-[15px] text-stone-800 font-medium">{{ tenant.nama }}</td>
              <td class="px-5 py-4 text-[15px] text-stone-500">{{ tenant.email || '-' }}</td>
              <td class="px-5 py-4 text-[15px] text-stone-500">{{ tenant.telepon || '-' }}</td>
              <td class="px-5 py-4 text-[15px] text-stone-500">{{ tenant.userCount ?? '-' }}</td>
              <td class="px-5 py-4 text-[15px] text-stone-500">
                {{ tenant.hariKerja === '5_hari' ? '5 Hari' : '6 Hari' }}
              </td>
              <td class="px-5 py-4">
                <span
                  :class="[
                    'inline-flex items-center px-2.5 py-1 rounded-[8px] text-[13px] font-semibold',
                    tenant.isActive
                      ? 'bg-success-50 text-success-700'
                      : 'bg-danger-50 text-danger-700',
                  ]"
                >
                  {{ tenant.isActive ? 'Aktif' : 'Nonaktif' }}
                </span>
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-500">
                {{ formatDate(tenant.createdAt) }}
              </td>
              <td class="px-5 py-4">
                <div class="flex gap-2">
                  <ActionButton variant="warning" icon="edit" @click="openEditForm(tenant)">
                    Edit
                  </ActionButton>
                  <ActionButton
                    :variant="tenant.isActive ? 'danger' : 'success'"
                    :icon="tenant.isActive ? 'cancel' : 'activate'"
                    @click="toggleTenantStatus(tenant)"
                  >
                    {{ tenant.isActive ? 'Nonaktifkan' : 'Aktifkan' }}
                  </ActionButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else-if="loading" class="text-center text-stone-500 text-[15px] py-12">Memuat data...</p>
      <p v-else class="text-center text-stone-500 text-[15px] py-12">Belum ada tenant terdaftar.</p>
    </div>

    <!-- Create/Edit Modal -->
    <BaseModal
      :show="showFormModal"
      :title="editingTenant ? 'Edit Sekolah' : 'Tambah Sekolah Baru'"
      size="lg"
      @close="showFormModal = false"
    >
      <p v-if="!editingTenant" class="text-[15px] text-stone-500 mb-4">
        Setelah dibuat, satu user Admin default akan dibuatkan dan kredensial dikirim ke email
        sekolah.
      </p>
      <form @submit.prevent="saveTenant">
        <div class="mb-4">
          <label class="block text-[14px] font-semibold text-stone-800 mb-1.5">Nama Sekolah</label>
          <input
            v-model="form.nama"
            type="text"
            required
            class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-[8px] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
            placeholder="SD Negeri 1 Contoh"
          />
        </div>
        <div class="mb-4">
          <label class="block text-[14px] font-semibold text-stone-800 mb-1.5">Alamat</label>
          <textarea
            v-model="form.alamat"
            class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-[8px] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 min-h-[60px] resize-y transition-colors"
            placeholder="Jl. Pendidikan No. 1"
          ></textarea>
        </div>
        <div class="mb-4">
          <label class="block text-[14px] font-semibold text-stone-800 mb-1.5">Telepon</label>
          <input
            v-model="form.telepon"
            type="text"
            class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-[8px] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
            placeholder="021-12345678"
          />
        </div>
        <div class="mb-4">
          <label class="block text-[14px] font-semibold text-stone-800 mb-1.5">Email</label>
          <input
            v-model="form.email"
            type="email"
            class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-[8px] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
            placeholder="admin@sekolah.sch.id"
          />
        </div>
        <!-- Jumlah Tingkat -->
        <div class="mb-4">
          <label class="block text-[14px] font-semibold text-stone-800 mb-1.5"
            >Jumlah Tingkat</label
          >
          <input
            v-if="!editingTenant"
            v-model.number="form.jumlahTingkat"
            type="number"
            min="1"
            max="13"
            required
            class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-[8px] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
          />
          <div
            v-else
            class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-[8px] bg-surface-warm text-stone-500"
          >
            {{ form.jumlahTingkat }}
          </div>
          <p class="mt-1 text-[13px] text-stone-400">SD = 6, SMP/SMA = 3</p>
        </div>
        <!-- Hari Kerja (create mode only) -->
        <div v-if="!editingTenant" class="mb-4">
          <label class="block text-[14px] font-semibold text-stone-800 mb-1.5">Hari Kerja</label>
          <select
            v-model="form.hariKerja"
            class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-[8px] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
          >
            <option value="6_hari">6 Hari (Senin-Sabtu)</option>
            <option value="5_hari">5 Hari (Senin-Jumat)</option>
          </select>
        </div>
        <!-- Admin fields (create mode only) -->
        <template v-if="!editingTenant">
          <div class="mb-4">
            <label class="block text-[14px] font-semibold text-stone-800 mb-1.5">Nama Admin</label>
            <input
              v-model="form.adminNama"
              type="text"
              required
              class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-[8px] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
              placeholder="Nama lengkap admin sekolah"
            />
          </div>
          <div class="mb-4">
            <label class="block text-[14px] font-semibold text-stone-800 mb-1.5">Email Admin</label>
            <input
              v-model="form.adminEmail"
              type="email"
              required
              class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-[8px] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
              placeholder="admin@sekolah.sch.id"
            />
          </div>
        </template>
      </form>
      <template #footer>
        <ActionButton variant="neutral" @click="showFormModal = false"> Batal </ActionButton>
        <ActionButton variant="primary" @click="saveTenant"> Simpan </ActionButton>
      </template>
    </BaseModal>
  </div>
</template>
