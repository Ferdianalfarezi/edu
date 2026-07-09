<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';
import { PageHeader, BaseModal, ActionButton } from '@/components/ui';

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
      return 'bg-success-50 text-success-700';
    case 'disiapkan':
      return 'bg-warning-50 text-warning-700';
    case 'nonaktif':
      return 'bg-surface-100 text-text-tertiary';
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
    const { data } = await api.get<TahunAjaran[]>('/tahun-ajaran');
    items.value = data;
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
  } catch (error) {
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
  } catch (error) {
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
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader title="Manajemen Tahun Ajaran">
      <template #actions>
        <button
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          @click="openCreateForm"
        >
          Tambah Tahun Ajaran
        </button>
      </template>
    </PageHeader>

    <div class="bg-white border border-border rounded-xl overflow-hidden">
      <div v-if="!loading && items.length > 0" class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-border bg-surface-50">
            <tr>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Nama</th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                Tanggal Mulai
              </th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                Tanggal Selesai
              </th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Status</th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="item in items" :key="item.id" class="hover:bg-surface-50 transition-colors">
              <td class="px-4 py-3 text-sm text-text-primary">{{ item.nama }}</td>
              <td class="px-4 py-3 text-sm text-text-secondary">
                {{ formatDate(item.tanggal_mulai) }}
              </td>
              <td class="px-4 py-3 text-sm text-text-secondary">
                {{ formatDate(item.tanggal_selesai) }}
              </td>
              <td class="px-4 py-3">
                <span
                  :class="[
                    'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
                    statusClass(item.status),
                  ]"
                >
                  {{ statusLabel(item.status) }}
                </span>
              </td>
              <td class="px-4 py-3">
                <ActionButton
                  v-if="item.status === 'disiapkan'"
                  variant="primary"
                  icon="activate"
                  @click="openActivateConfirm(item)"
                  >Aktifkan</ActionButton
                >
                <span v-else-if="item.status === 'aktif'" class="text-xs text-text-tertiary"
                  >Sedang Aktif</span
                >
                <span v-else class="text-xs text-text-tertiary">Historis</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="loading" class="py-12 text-center">
        <svg class="w-6 h-6 animate-spin text-primary-500 mx-auto" fill="none" viewBox="0 0 24 24">
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          ></path>
        </svg>
        <p class="mt-2 text-sm text-text-tertiary">Memuat data...</p>
      </div>

      <div v-else class="py-12 text-center">
        <svg
          class="w-10 h-10 text-text-tertiary mx-auto mb-2"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
          />
        </svg>
        <p class="text-sm text-text-tertiary">Belum ada tahun ajaran.</p>
      </div>
    </div>

    <!-- Create Modal -->
    <BaseModal :show="showFormModal" title="Tambah Tahun Ajaran" @close="showFormModal = false">
      <p class="text-sm text-text-secondary mb-4">
        Tahun ajaran baru akan dibuat dengan status "Disiapkan". Struktur kelas dari tahun ajaran
        aktif akan otomatis diduplikasi.
      </p>
      <form id="form-tahun-ajaran" class="space-y-4" @submit.prevent="saveTahunAjaran">
        <div>
          <label class="block text-sm font-medium text-text-primary mb-1.5">Nama Periode</label>
          <input
            v-model="form.nama"
            type="text"
            required
            placeholder="2024/2025"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-text-primary mb-1.5">Tanggal Mulai</label>
          <input
            v-model="form.tanggal_mulai"
            type="date"
            required
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-text-primary mb-1.5">Tanggal Selesai</label>
          <input
            v-model="form.tanggal_selesai"
            type="date"
            required
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <p v-if="formError" class="text-xs text-danger-500 mt-1">{{ formError }}</p>
      </form>
      <template #footer>
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showFormModal = false"
        >
          Batal
        </button>
        <button
          type="submit"
          form="form-tahun-ajaran"
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
        >
          Simpan
        </button>
      </template>
    </BaseModal>

    <!-- Activate Confirmation Modal -->
    <BaseModal
      :show="showActivateModal"
      title="Aktifkan Tahun Ajaran"
      @close="showActivateModal = false"
    >
      <p class="text-sm text-text-primary mb-2">
        Apakah Anda yakin ingin mengaktifkan tahun ajaran <strong>{{ activatingItem?.nama }}</strong
        >?
      </p>
      <p class="text-sm text-text-secondary">
        Tahun ajaran yang sedang aktif akan otomatis dinonaktifkan. Hanya boleh ada satu tahun
        ajaran aktif dalam satu waktu.
      </p>
      <p v-if="activateError" class="text-xs text-danger-500 mt-2">{{ activateError }}</p>
      <template #footer>
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showActivateModal = false"
        >
          Batal
        </button>
        <button
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          @click="activateTahunAjaran"
        >
          Aktifkan
        </button>
      </template>
    </BaseModal>
  </div>
</template>
