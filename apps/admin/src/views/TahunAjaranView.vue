<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';
import { PageHeader, BaseModal, ActionButton } from '@/components/ui';
import { useToast } from '@/composables/useToast';

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
  generate_kelas: boolean;
}

const toast = useToast();
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
  generate_kelas: true,
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
      return 'bg-stone-100 text-stone-500';
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
  form.value = { nama: '', tanggal_mulai: '', tanggal_selesai: '', generate_kelas: true };
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
    generate_kelas: form.value.generate_kelas,
  };

  try {
    const { data } = await api.post('/tahun-ajaran', payload);
    showFormModal.value = false;

    if (!form.value.generate_kelas) {
      toast.success('Berhasil membuat tahun ajaran tanpa generate kelas.');
    } else if (data.duplicatedClassCount > 0) {
      toast.success(
        `Berhasil membuat tahun ajaran. ${data.duplicatedClassCount} kelas di-generate dari tahun sebelumnya.`,
      );
    } else {
      toast.info(
        'Berhasil membuat tahun ajaran. Tidak ada kelas di-generate karena tidak ditemukan data kelas di tahun ajaran sebelumnya.',
      );
    }

    await fetchItems();
  } catch (error: any) {
    const msg = error.response?.data?.message;
    const errorMsg = Array.isArray(msg) ? msg.join(', ') : msg || 'Gagal membuat tahun ajaran.';
    formError.value = errorMsg;
    toast.error(errorMsg);
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
  <div class="p-8 max-w-7xl mx-auto">
    <PageHeader title="Manajemen Tahun Ajaran">
      <template #actions>
        <ActionButton variant="primary" @click="openCreateForm"> Tambah Tahun Ajaran </ActionButton>
      </template>
    </PageHeader>

    <!-- Table Card -->
    <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
      <!-- Section Header -->
      <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
        <h3 class="text-[16px] font-bold text-primary-800">Daftar Tahun Ajaran</h3>
      </div>

      <div v-if="!loading && items.length > 0" class="overflow-x-auto">
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
                Tanggal Mulai
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Tanggal Selesai
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
            <tr v-for="item in items" :key="item.id" class="hover:bg-primary-50 transition-colors">
              <td class="px-5 py-4 text-[15px] text-stone-800 font-medium">{{ item.nama }}</td>
              <td class="px-5 py-4 text-[15px] text-stone-600">
                {{ formatDate(item.tanggal_mulai) }}
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-600">
                {{ formatDate(item.tanggal_selesai) }}
              </td>
              <td class="px-5 py-4">
                <span
                  :class="[
                    'inline-flex items-center px-2.5 py-1 rounded-md text-[13px] font-semibold',
                    statusClass(item.status),
                  ]"
                >
                  {{ statusLabel(item.status) }}
                </span>
              </td>
              <td class="px-5 py-4">
                <ActionButton
                  v-if="item.status === 'disiapkan'"
                  variant="primary"
                  icon="activate"
                  @click="openActivateConfirm(item)"
                  >Aktifkan</ActionButton
                >
                <span
                  v-else-if="item.status === 'aktif'"
                  class="text-[13px] text-success-700 font-semibold"
                  >Sedang Aktif</span
                >
                <span v-else class="text-[13px] text-stone-400">Historis</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="loading" class="py-12 text-center">
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

      <div v-else class="py-12 text-center">
        <svg
          class="w-10 h-10 text-stone-300 mx-auto mb-3"
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
        <p class="text-[15px] text-stone-500">Belum ada tahun ajaran.</p>
      </div>
    </div>

    <!-- Create Modal -->
    <BaseModal :show="showFormModal" title="Tambah Tahun Ajaran" @close="showFormModal = false">
      <p class="text-[15px] text-stone-600 mb-4">
        Tahun ajaran baru akan dibuat dengan status "Disiapkan". Anda dapat memilih untuk
        men-generate struktur kelas dari tahun ajaran sebelumnya.
      </p>
      <form id="form-tahun-ajaran" class="space-y-4" @submit.prevent="saveTahunAjaran">
        <div>
          <label class="block text-[15px] font-medium text-stone-800 mb-1.5">Nama Periode</label>
          <input
            v-model="form.nama"
            type="text"
            required
            placeholder="2024/2025"
            class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div>
          <label class="block text-[15px] font-medium text-stone-800 mb-1.5">Tanggal Mulai</label>
          <input
            v-model="form.tanggal_mulai"
            type="date"
            required
            class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div>
          <label class="block text-[15px] font-medium text-stone-800 mb-1.5">Tanggal Selesai</label>
          <input
            v-model="form.tanggal_selesai"
            type="date"
            required
            class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div class="flex items-center gap-2">
          <input
            id="generate-kelas"
            v-model="form.generate_kelas"
            type="checkbox"
            class="h-4 w-4 rounded border-stone-300 text-primary-600 focus:ring-primary-500/20"
          />
          <label for="generate-kelas" class="text-[15px] text-stone-800">
            Generate kelas dari tahun sebelumnya
          </label>
        </div>
        <p v-if="formError" class="text-[13px] text-danger-500 mt-1">{{ formError }}</p>
      </form>
      <template #footer>
        <ActionButton variant="neutral" @click="showFormModal = false"> Batal </ActionButton>
        <ActionButton variant="primary" type="submit" form="form-tahun-ajaran">
          Simpan
        </ActionButton>
      </template>
    </BaseModal>

    <!-- Activate Confirmation Modal -->
    <BaseModal
      :show="showActivateModal"
      title="Aktifkan Tahun Ajaran"
      @close="showActivateModal = false"
    >
      <p class="text-[15px] text-stone-800 mb-2">
        Apakah Anda yakin ingin mengaktifkan tahun ajaran <strong>{{ activatingItem?.nama }}</strong
        >?
      </p>
      <p class="text-[15px] text-stone-600">
        Tahun ajaran yang sedang aktif akan otomatis dinonaktifkan. Hanya boleh ada satu tahun
        ajaran aktif dalam satu waktu.
      </p>
      <p v-if="activateError" class="text-[13px] text-danger-500 mt-2">{{ activateError }}</p>
      <template #footer>
        <ActionButton variant="neutral" @click="showActivateModal = false"> Batal </ActionButton>
        <ActionButton variant="primary" @click="activateTahunAjaran"> Aktifkan </ActionButton>
      </template>
    </BaseModal>
  </div>
</template>
