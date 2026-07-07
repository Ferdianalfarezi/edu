<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api/client';
import { PageHeader, BaseModal } from '@/components/ui';

interface TahunAjaran {
  id: string;
  nama: string;
  status: string;
}

interface Guru {
  id: string;
  nama: string;
}

interface Kelas {
  id: string;
  nama: string;
  tingkat: number;
  wali_kelas_id: string | null;
  wali_kelas_nama: string | null;
  tahun_ajaran_id: string;
  tahun_ajaran_nama: string;
  kapasitas: number | null;
  jumlah_siswa: number;
}

interface KelasForm {
  nama: string;
  tingkat: number | '';
  wali_kelas_id: string;
  kapasitas: string;
}

const kelasList = ref<Kelas[]>([]);
const tahunAjaranList = ref<TahunAjaran[]>([]);
const guruList = ref<Guru[]>([]);
const loading = ref(false);
const selectedTahunAjaran = ref('');

// Modal state
const showFormModal = ref(false);
const showDeleteModal = ref(false);
const editingKelas = ref<Kelas | null>(null);
const deletingKelas = ref<Kelas | null>(null);
const deleteError = ref('');
const formError = ref('');

const form = ref<KelasForm>({
  nama: '',
  tingkat: '',
  wali_kelas_id: '',
  kapasitas: '',
});

const filteredKelas = computed(() => {
  if (!selectedTahunAjaran.value) return kelasList.value;
  return kelasList.value.filter((k) => k.tahun_ajaran_id === selectedTahunAjaran.value);
});

async function fetchTahunAjaran() {
  try {
    const { data } = await api.get<{ data: TahunAjaran[] }>('/tahun-ajaran');
    tahunAjaranList.value = data.data;
    // Default to the active tahun ajaran
    const active = data.data.find((t) => t.status === 'aktif');
    if (active) {
      selectedTahunAjaran.value = active.id;
    } else if (data.data.length > 0) {
      selectedTahunAjaran.value = data.data[0].id;
    }
  } catch (error) {
    console.error('Failed to fetch tahun ajaran:', error);
  }
}

async function fetchKelas() {
  loading.value = true;
  try {
    const params: Record<string, string> = {};
    if (selectedTahunAjaran.value) {
      params.tahun_ajaran_id = selectedTahunAjaran.value;
    }
    const { data } = await api.get<{ data: Kelas[] }>('/kelas', { params });
    kelasList.value = data.data;
  } catch (error) {
    console.error('Failed to fetch kelas:', error);
  } finally {
    loading.value = false;
  }
}

async function fetchGuru() {
  try {
    const { data } = await api.get<{ data: Guru[] }>('/users', { params: { role: 'guru' } });
    guruList.value = data.data;
  } catch (error) {
    console.error('Failed to fetch guru:', error);
  }
}

function openCreateForm() {
  editingKelas.value = null;
  formError.value = '';
  form.value = { nama: '', tingkat: '', wali_kelas_id: '', kapasitas: '' };
  showFormModal.value = true;
}

function openEditForm(kelas: Kelas) {
  editingKelas.value = kelas;
  formError.value = '';
  form.value = {
    nama: kelas.nama,
    tingkat: kelas.tingkat,
    wali_kelas_id: kelas.wali_kelas_id || '',
    kapasitas: kelas.kapasitas ? String(kelas.kapasitas) : '',
  };
  showFormModal.value = true;
}

function openDeleteConfirm(kelas: Kelas) {
  deletingKelas.value = kelas;
  deleteError.value = '';
  showDeleteModal.value = true;
}

async function saveKelas() {
  formError.value = '';
  const payload: Record<string, unknown> = {
    nama: form.value.nama,
    tingkat: Number(form.value.tingkat),
    tahun_ajaran_id: selectedTahunAjaran.value,
  };
  if (form.value.wali_kelas_id) {
    payload.wali_kelas_id = form.value.wali_kelas_id;
  } else {
    payload.wali_kelas_id = null;
  }
  if (form.value.kapasitas) {
    payload.kapasitas = Number(form.value.kapasitas);
  }

  try {
    if (editingKelas.value) {
      await api.patch(`/kelas/${editingKelas.value.id}`, payload);
    } else {
      await api.post('/kelas', payload);
    }
    showFormModal.value = false;
    await fetchKelas();
  } catch (error: any) {
    const msg = error.response?.data?.message;
    if (msg) {
      formError.value = Array.isArray(msg) ? msg.join(', ') : msg;
    } else {
      formError.value = 'Gagal menyimpan kelas.';
    }
  }
}

async function deleteKelas() {
  if (!deletingKelas.value) return;
  try {
    await api.delete(`/kelas/${deletingKelas.value.id}`);
    showDeleteModal.value = false;
    deletingKelas.value = null;
    deleteError.value = '';
    await fetchKelas();
  } catch (error: any) {
    const msg = error.response?.data?.message;
    if (msg) {
      deleteError.value = Array.isArray(msg) ? msg.join(', ') : msg;
    } else {
      deleteError.value = 'Kelas tidak dapat dihapus karena masih memiliki siswa aktif.';
    }
  }
}

function onTahunAjaranChange() {
  fetchKelas();
}

onMounted(async () => {
  await fetchTahunAjaran();
  await Promise.all([fetchKelas(), fetchGuru()]);
});
</script>

<template>
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader title="Manajemen Kelas">
      <template #actions>
        <button
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          @click="openCreateForm"
        >
          Tambah Kelas
        </button>
      </template>
    </PageHeader>

    <!-- Filter by Tahun Ajaran -->
    <div class="flex flex-wrap gap-3 mb-4">
      <select
        v-model="selectedTahunAjaran"
        class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 max-w-xs"
        @change="onTahunAjaranChange"
      >
        <option value="">Semua Tahun Ajaran</option>
        <option v-for="ta in tahunAjaranList" :key="ta.id" :value="ta.id">
          {{ ta.nama }} <span v-if="ta.status === 'aktif'">(Aktif)</span>
        </option>
      </select>
    </div>

    <!-- Table -->
    <div class="bg-white border border-border rounded-xl overflow-hidden">
      <table v-if="!loading && filteredKelas.length > 0" class="w-full">
        <thead>
          <tr class="border-b border-border bg-surface-50">
            <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Nama Kelas</th>
            <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Tingkat</th>
            <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Wali Kelas</th>
            <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
              Jumlah Siswa
            </th>
            <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Kapasitas</th>
            <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr
            v-for="kelas in filteredKelas"
            :key="kelas.id"
            class="hover:bg-surface-50 transition-colors"
          >
            <td class="px-4 py-3 text-sm text-text-primary">{{ kelas.nama }}</td>
            <td class="px-4 py-3 text-sm text-text-primary">{{ kelas.tingkat }}</td>
            <td class="px-4 py-3 text-sm text-text-primary">{{ kelas.wali_kelas_nama || '-' }}</td>
            <td class="px-4 py-3 text-sm text-text-primary">{{ kelas.jumlah_siswa }}</td>
            <td class="px-4 py-3 text-sm text-text-primary">{{ kelas.kapasitas || '-' }}</td>
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <button
                  class="px-2 py-1 text-xs font-medium text-warning-700 bg-warning-50 rounded-md hover:bg-warning-50/80 transition-colors"
                  @click="openEditForm(kelas)"
                >
                  Edit
                </button>
                <button
                  class="px-2 py-1 text-xs font-medium text-danger-700 bg-danger-50 rounded-md hover:bg-danger-50/80 transition-colors"
                  @click="openDeleteConfirm(kelas)"
                >
                  Hapus
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else-if="loading" class="py-12 text-center">
        <svg
          class="w-6 h-6 animate-spin text-primary-500 mx-auto"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
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
        <p class="text-sm text-text-tertiary mt-2">Memuat data...</p>
      </div>
      <div v-else class="py-12 text-center">
        <p class="text-sm text-text-tertiary">Belum ada kelas untuk tahun ajaran ini.</p>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <BaseModal
      :show="showFormModal"
      :title="editingKelas ? 'Edit Kelas' : 'Tambah Kelas'"
      @close="showFormModal = false"
    >
      <form @submit.prevent="saveKelas">
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5">Nama Kelas</label>
          <input
            v-model="form.nama"
            type="text"
            required
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            placeholder="1A, 2B, 6C..."
          />
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5">Tingkat</label>
          <input
            v-model="form.tingkat"
            type="number"
            required
            min="1"
            max="12"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            placeholder="1-12"
          />
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5"
            >Wali Kelas <span class="text-text-tertiary font-normal">(opsional)</span></label
          >
          <select
            v-model="form.wali_kelas_id"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          >
            <option value="">-- Tidak Ada --</option>
            <option v-for="guru in guruList" :key="guru.id" :value="guru.id">
              {{ guru.nama }}
            </option>
          </select>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5"
            >Kapasitas <span class="text-text-tertiary font-normal">(opsional)</span></label
          >
          <input
            v-model="form.kapasitas"
            type="number"
            min="1"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            placeholder="30"
          />
        </div>
        <p v-if="formError" class="text-xs text-danger-500 mt-1">{{ formError }}</p>
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
          @click="saveKelas"
        >
          Simpan
        </button>
      </template>
    </BaseModal>

    <!-- Delete Confirmation Modal -->
    <BaseModal :show="showDeleteModal" title="Konfirmasi Hapus" @close="showDeleteModal = false">
      <p class="text-sm text-text-primary">
        Apakah Anda yakin ingin menghapus kelas
        <strong>{{ deletingKelas?.nama }}</strong
        >?
      </p>
      <p v-if="deleteError" class="text-xs text-danger-500 mt-1">{{ deleteError }}</p>
      <template #footer>
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showDeleteModal = false"
        >
          Batal
        </button>
        <button
          class="px-4 py-2 text-sm font-medium text-white bg-danger-500 rounded-lg hover:bg-danger-700 transition-colors"
          @click="deleteKelas"
        >
          Hapus
        </button>
      </template>
    </BaseModal>
  </div>
</template>
