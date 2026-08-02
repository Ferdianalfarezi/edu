<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';
import { PageHeader, BaseModal, ActionButton } from '@/components/ui';
import { useOnboardingForm } from '@/composables/useOnboardingForm';
import { parseExcelFile } from '@/composables/useExcelParser';
import OnboardingPreview from '@/components/OnboardingPreview.vue';

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

const {
  step,
  tenantForm,
  parseResult,
  isSubmitting,
  submitError,
  goToStep,
  handleFileParsed,
  handleGantiFile,
  submitOnboarding,
} = useOnboardingForm({
  onSuccess: () => {
    showFormModal.value = false;
    fetchTenants();
  },
});

// File parsing error state for Step 2
const parseError = ref<string | null>(null);

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  // Reset error state before each new parse (Requirement 2.11)
  parseError.value = null;

  const result = await parseExcelFile(file);
  handleFileParsed(result);

  if (result.errors.length > 0) {
    parseError.value = result.errors.join('; ');
  }
}

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
        jumlah_tingkat: form.value.jumlahTingkat,
        hari_kerja: form.value.hariKerja,
        admin_nama: form.value.adminNama,
        admin_email: form.value.adminEmail,
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
      size="xl"
      @close="showFormModal = false"
    >
      <!-- Template download link — always visible on all steps -->
      <div
        class="mb-4 flex items-center gap-2 px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xs"
      >
        <svg
          class="w-4 h-4 text-stone-500 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
          />
        </svg>
        <a
          href="/Template_TemanSekolah.xlsx"
          download
          class="text-[14px] text-primary-600 hover:text-primary-800 font-medium underline"
        >
          Download Template Excel
        </a>
        <span class="text-[13px] text-stone-400">— isi data sekolah sebelum upload</span>
      </div>
      <!-- Create mode: step-driven content -->
      <template v-if="!editingTenant">
        <!-- Step 1: Info Sekolah -->
        <div v-if="step === 'info'">
          <p class="text-[15px] text-stone-500 mb-4">
            Setelah dibuat, satu user Admin default akan dibuatkan dan kredensial dikirim ke email
            sekolah.
          </p>
          <div class="mb-4">
            <label class="block text-[14px] font-semibold text-stone-800 mb-1.5"
              >Nama Sekolah</label
            >
            <input
              v-model="tenantForm.nama"
              type="text"
              required
              class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
              placeholder="SD Negeri 1 Contoh"
            />
          </div>
          <div class="mb-4">
            <label class="block text-[14px] font-semibold text-stone-800 mb-1.5">Alamat</label>
            <textarea
              v-model="tenantForm.alamat"
              class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 min-h-15 resize-y transition-colors"
              placeholder="Jl. Pendidikan No. 1"
            ></textarea>
          </div>
          <div class="mb-4">
            <label class="block text-[14px] font-semibold text-stone-800 mb-1.5">Telepon</label>
            <input
              v-model="tenantForm.telepon"
              type="text"
              class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
              placeholder="021-12345678"
            />
          </div>
          <div class="mb-4">
            <label class="block text-[14px] font-semibold text-stone-800 mb-1.5">Email</label>
            <input
              v-model="tenantForm.email"
              type="email"
              class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
              placeholder="admin@sekolah.sch.id"
            />
          </div>
          <!-- Jumlah Tingkat -->
          <div class="mb-4">
            <label class="block text-[14px] font-semibold text-stone-800 mb-1.5"
              >Jumlah Tingkat</label
            >
            <input
              v-model.number="tenantForm.jumlah_tingkat"
              type="number"
              min="1"
              max="13"
              required
              class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
            />
            <p class="mt-1 text-[13px] text-stone-400">SD = 6, SMP/SMA = 3</p>
          </div>
          <!-- Hari Kerja -->
          <div class="mb-4">
            <label class="block text-[14px] font-semibold text-stone-800 mb-1.5">Hari Kerja</label>
            <select
              v-model="tenantForm.hari_kerja"
              class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
            >
              <option value="6_hari">6 Hari (Senin-Sabtu)</option>
              <option value="5_hari">5 Hari (Senin-Jumat)</option>
            </select>
          </div>
          <!-- Admin fields -->
          <div class="mb-4">
            <label class="block text-[14px] font-semibold text-stone-800 mb-1.5">Nama Admin</label>
            <input
              v-model="tenantForm.admin_nama"
              type="text"
              required
              class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
              placeholder="Nama lengkap admin sekolah"
            />
          </div>
          <div class="mb-4">
            <label class="block text-[14px] font-semibold text-stone-800 mb-1.5">Email Admin</label>
            <input
              v-model="tenantForm.admin_email"
              type="email"
              required
              class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
              placeholder="admin@sekolah.sch.id"
            />
          </div>
        </div>

        <!-- Step 2: Upload Excel -->
        <div v-else-if="step === 'upload'">
          <div class="mb-6">
            <label class="block text-[14px] font-semibold text-stone-800 mb-1.5">
              Upload File Excel
              <span class="text-danger-600 ml-0.5" title="Wajib">*</span>
              <span class="text-[13px] font-normal text-stone-400 ml-1">Wajib</span>
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              class="block w-full text-[15px] text-stone-700 file:mr-4 file:py-2 file:px-4 file:rounded-xs file:border-0 file:text-[14px] file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 transition-colors border-2 border-stone-200 rounded-xs px-2 py-2 cursor-pointer"
              @change="onFileChange"
            />
            <!-- Inline error display -->
            <p v-if="parseError" class="mt-2 text-[13px] text-danger-600 font-medium">
              {{ parseError }}
            </p>
            <p
              v-if="parseResult && parseResult.warnings.length > 0"
              class="mt-2 text-[13px] text-amber-600"
            >
              <span v-for="(w, i) in parseResult.warnings" :key="i" class="block">⚠ {{ w }}</span>
            </p>
          </div>
        </div>

        <!-- Step 3: Preview -->
        <div v-else-if="step === 'preview'">
          <OnboardingPreview
            v-if="parseResult?.data"
            :data="parseResult.data"
            :errors="parseResult?.errors ?? []"
            :warnings="parseResult?.warnings ?? []"
            @ganti-file="handleGantiFile"
          />
          <p v-if="submitError" class="mt-3 text-[14px] text-danger-600 font-medium">
            {{ submitError }}
          </p>
        </div>
      </template>

      <!-- Edit mode: existing form unchanged -->
      <template v-else>
        <form @submit.prevent="saveTenant">
          <div class="mb-4">
            <label class="block text-[14px] font-semibold text-stone-800 mb-1.5"
              >Nama Sekolah</label
            >
            <input
              v-model="form.nama"
              type="text"
              required
              class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
              placeholder="SD Negeri 1 Contoh"
            />
          </div>
          <div class="mb-4">
            <label class="block text-[14px] font-semibold text-stone-800 mb-1.5">Alamat</label>
            <textarea
              v-model="form.alamat"
              class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 min-h-15 resize-y transition-colors"
              placeholder="Jl. Pendidikan No. 1"
            ></textarea>
          </div>
          <div class="mb-4">
            <label class="block text-[14px] font-semibold text-stone-800 mb-1.5">Telepon</label>
            <input
              v-model="form.telepon"
              type="text"
              class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
              placeholder="021-12345678"
            />
          </div>
          <div class="mb-4">
            <label class="block text-[14px] font-semibold text-stone-800 mb-1.5">Email</label>
            <input
              v-model="form.email"
              type="email"
              class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
              placeholder="admin@sekolah.sch.id"
            />
          </div>
          <!-- Jumlah Tingkat (read-only in edit mode) -->
          <div class="mb-4">
            <label class="block text-[14px] font-semibold text-stone-800 mb-1.5"
              >Jumlah Tingkat</label
            >
            <div
              class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs bg-surface-warm text-stone-500"
            >
              {{ form.jumlahTingkat }}
            </div>
            <p class="mt-1 text-[13px] text-stone-400">SD = 6, SMP/SMA = 3</p>
          </div>
        </form>
      </template>

      <template #footer>
        <!-- Create mode: step-driven footer -->
        <template v-if="!editingTenant">
          <!-- Step 1 footer -->
          <template v-if="step === 'info'">
            <ActionButton variant="neutral" @click="showFormModal = false"> Batal </ActionButton>
            <ActionButton variant="primary" @click="goToStep('upload')"> Lanjut → </ActionButton>
          </template>
          <!-- Step 2 footer -->
          <template v-else-if="step === 'upload'">
            <ActionButton variant="neutral" @click="goToStep('info')"> ← Kembali </ActionButton>
            <ActionButton variant="primary" :disabled="true" @click="submitOnboarding">
              Konfirmasi
            </ActionButton>
          </template>
          <!-- Step 3 footer -->
          <template v-else-if="step === 'preview'">
            <ActionButton variant="neutral" @click="handleGantiFile"> ← Ganti File </ActionButton>
            <ActionButton variant="primary" :disabled="isSubmitting" @click="submitOnboarding">
              <span v-if="isSubmitting" class="flex items-center gap-2">
                <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
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
                Menyimpan...
              </span>
              <span v-else>Konfirmasi & Simpan</span>
            </ActionButton>
          </template>
        </template>
        <!-- Edit mode footer -->
        <template v-else>
          <ActionButton variant="neutral" @click="showFormModal = false"> Batal </ActionButton>
          <ActionButton variant="primary" @click="saveTenant"> Simpan </ActionButton>
        </template>
      </template>
    </BaseModal>
  </div>
</template>
