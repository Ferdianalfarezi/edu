<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api/client';
import { PageHeader, BaseModal, SearchSelect, ActionButton } from '@/components/ui';
import type { SelectOption } from '@/components/ui';

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
  waliKelasId: string | null;
  waliKelasNama: string | null;
  tahunAjaranId: string;
  tahunAjaranNama: string;
  kapasitas: number | null;
  jumlahSiswa: number;
}

interface KelasForm {
  nama: string;
  tingkat: number | '';
  waliKelasId: string;
  kapasitas: string;
}

const kelasList = ref<Kelas[]>([]);
const tahunAjaranList = ref<TahunAjaran[]>([]);
const guruList = ref<Guru[]>([]);
const loading = ref(false);
const selectedTahunAjaran = ref('');
const selectedTingkat = ref('');

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
  waliKelasId: '',
  kapasitas: '',
});

const filteredKelas = computed(() => {
  let result = kelasList.value;
  if (selectedTahunAjaran.value) {
    result = result.filter((k) => k.tahunAjaranId === selectedTahunAjaran.value);
  }
  if (selectedTingkat.value) {
    result = result.filter((k) => k.tingkat === Number(selectedTingkat.value));
  }
  return result;
});

const tingkatOptions = computed<SelectOption[]>(() => {
  const tingkatSet = new Set(kelasList.value.map((k) => k.tingkat));
  return Array.from(tingkatSet)
    .sort((a, b) => a - b)
    .map((t) => ({ value: String(t), label: `Tingkat ${t}` }));
});

// Jumlah tingkat sekolah (dari jenjang: SD = 6, SMP/SMA = 3) → pilihan tingkat di form
const jumlahTingkat = ref(6);
const formTingkatOptions = computed(() =>
  Array.from({ length: jumlahTingkat.value }, (_, i) => i + 1),
);

async function fetchJumlahTingkat() {
  try {
    const { data } = await api.get<{ jumlahTingkat: number }>('/tenants/profile');
    if (data?.jumlahTingkat) jumlahTingkat.value = data.jumlahTingkat;
  } catch (error) {
    console.error('Failed to fetch tenant profile:', error);
  }
}

const tahunAjaranSelectOptions = computed<SelectOption[]>(() =>
  tahunAjaranList.value.map((ta) => ({
    value: ta.id,
    label: ta.status === 'aktif' ? `${ta.nama} (Aktif)` : ta.nama,
  })),
);

const guruSelectOptions = computed<SelectOption[]>(() =>
  guruList.value.map((guru) => ({ value: guru.id, label: guru.nama })),
);

async function fetchTahunAjaran() {
  try {
    const { data } = await api.get<TahunAjaran[]>('/tahun-ajaran');
    tahunAjaranList.value = data;
    // Default to the active tahun ajaran
    const active = data.find((t) => t.status === 'aktif');
    if (active) {
      selectedTahunAjaran.value = active.id;
    } else if (data.length > 0) {
      selectedTahunAjaran.value = data[0].id;
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
  form.value = { nama: '', tingkat: '', waliKelasId: '', kapasitas: '' };
  showFormModal.value = true;
}

function openEditForm(kelas: Kelas) {
  editingKelas.value = kelas;
  formError.value = '';
  form.value = {
    nama: kelas.nama,
    tingkat: kelas.tingkat,
    waliKelasId: kelas.waliKelasId || '',
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
    tahunAjaranId: selectedTahunAjaran.value,
  };
  if (form.value.waliKelasId) {
    payload.waliKelasId = form.value.waliKelasId;
  } else {
    payload.waliKelasId = null;
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
  } catch (error) {
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
  } catch (error) {
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
  await Promise.all([fetchKelas(), fetchGuru(), fetchJumlahTingkat()]);
});
</script>

<template>
  <div class="p-8 max-w-7xl mx-auto">
    <PageHeader title="Manajemen Kelas">
      <template #actions>
        <ActionButton variant="primary" icon="none" @click="openCreateForm">
          Tambah Kelas
        </ActionButton>
      </template>
    </PageHeader>

    <!-- Filter by Tahun Ajaran & Tingkat -->
    <div class="flex flex-wrap gap-3 mb-5">
      <SearchSelect
        v-model="selectedTahunAjaran"
        :options="tahunAjaranSelectOptions"
        placeholder="Semua Tahun Ajaran"
        clearable
        class="max-w-xs"
        @change="onTahunAjaranChange"
      />
      <SearchSelect
        v-model="selectedTingkat"
        :options="tingkatOptions"
        placeholder="Semua Tingkat"
        clearable
        class="max-w-xs"
      />
    </div>

    <!-- Card + Section Header + Data Table -->
    <div class="bg-white rounded-(--radius-md) border-2 border-border shadow-xs overflow-hidden">
      <!-- Section Header -->
      <div
        class="flex items-center justify-between bg-primary-50 p-5 px-6 border-b-2 border-primary-200"
      >
        <h2 class="text-[16px] font-bold text-primary-800">Daftar Kelas</h2>
        <span v-if="!loading" class="text-[13px] font-semibold text-primary-600">
          {{ filteredKelas.length }} kelas
        </span>
      </div>

      <!-- Table -->
      <div v-if="!loading && filteredKelas.length > 0" class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b-2 border-border bg-surface-warm">
              <th
                class="px-5 py-3.5 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary"
              >
                Nama Kelas
              </th>
              <th
                class="px-5 py-3.5 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary"
              >
                Tingkat
              </th>
              <th
                class="px-5 py-3.5 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary"
              >
                Wali Kelas
              </th>
              <th
                class="px-5 py-3.5 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary"
              >
                Jumlah Siswa
              </th>
              <th
                class="px-5 py-3.5 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary"
              >
                Kapasitas
              </th>
              <th
                class="px-5 py-3.5 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary"
              >
                Aksi
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr
              v-for="kelas in filteredKelas"
              :key="kelas.id"
              class="hover:bg-primary-50 transition-colors"
            >
              <td class="px-5 py-4 text-[15px] text-text-primary font-medium">{{ kelas.nama }}</td>
              <td class="px-5 py-4 text-[15px] text-text-primary">{{ kelas.tingkat }}</td>
              <td class="px-5 py-4 text-[15px] text-text-primary">
                {{ kelas.waliKelasNama || '-' }}
              </td>
              <td class="px-5 py-4 text-[15px] text-text-primary">{{ kelas.jumlahSiswa }}</td>
              <td class="px-5 py-4 text-[15px] text-text-primary">{{ kelas.kapasitas || '-' }}</td>
              <td class="px-5 py-4">
                <div class="flex items-center gap-2">
                  <ActionButton variant="warning" icon="edit" @click="openEditForm(kelas)">
                    Edit
                  </ActionButton>
                  <ActionButton variant="danger" icon="delete" @click="openDeleteConfirm(kelas)">
                    Hapus
                  </ActionButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Loading state -->
      <div v-else-if="loading" class="py-16 text-center">
        <svg
          class="w-7 h-7 animate-spin text-primary-500 mx-auto"
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
        <p class="mt-3 text-[15px] text-text-secondary">Memuat data...</p>
      </div>

      <!-- Empty state -->
      <div v-else class="py-16 text-center">
        <svg
          class="w-12 h-12 text-stone-300 mx-auto mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342"
          />
        </svg>
        <p class="text-[15px] text-text-secondary">Belum ada kelas untuk tahun ajaran ini.</p>
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
          <label class="block text-[15px] font-medium text-text-primary mb-1.5">Nama Kelas</label>
          <input
            v-model="form.nama"
            type="text"
            required
            class="w-full px-3 py-2.5 text-[15px] border-2 border-border rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
            placeholder="1A, 2B, 6C..."
          />
        </div>
        <div class="mb-4">
          <label class="block text-[15px] font-medium text-text-primary mb-1.5">Tingkat</label>
          <select
            v-model.number="form.tingkat"
            required
            class="w-full px-3 py-2.5 text-[15px] border-2 border-border rounded-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
          >
            <option value="" disabled>-- Pilih Tingkat --</option>
            <option v-for="t in formTingkatOptions" :key="t" :value="t">Tingkat {{ t }}</option>
          </select>
        </div>
        <div class="mb-4">
          <SearchSelect
            v-model="form.waliKelasId"
            :options="guruSelectOptions"
            label="Wali Kelas (opsional)"
            placeholder="-- Tidak Ada --"
            clearable
          />
        </div>
        <div class="mb-4">
          <label class="block text-[15px] font-medium text-text-primary mb-1.5">
            Kapasitas <span class="text-text-tertiary font-normal">(opsional)</span>
          </label>
          <input
            v-model="form.kapasitas"
            type="number"
            min="1"
            class="w-full px-3 py-2.5 text-[15px] border-2 border-border rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
            placeholder="30"
          />
        </div>
        <p v-if="formError" class="text-[13px] text-danger-500 mt-1">{{ formError }}</p>
      </form>
      <template #footer>
        <ActionButton variant="neutral" icon="none" @click="showFormModal = false">
          Batal
        </ActionButton>
        <ActionButton variant="primary" icon="none" @click="saveKelas"> Simpan </ActionButton>
      </template>
    </BaseModal>

    <!-- Delete Confirmation Modal -->
    <BaseModal :show="showDeleteModal" title="Konfirmasi Hapus" @close="showDeleteModal = false">
      <p class="text-[15px] text-text-primary">
        Apakah Anda yakin ingin menghapus kelas
        <strong>{{ deletingKelas?.nama }}</strong
        >?
      </p>
      <p v-if="deleteError" class="text-[13px] text-danger-500 mt-2">{{ deleteError }}</p>
      <template #footer>
        <ActionButton variant="neutral" icon="none" @click="showDeleteModal = false">
          Batal
        </ActionButton>
        <ActionButton variant="danger" icon="delete" @click="deleteKelas"> Hapus </ActionButton>
      </template>
    </BaseModal>
  </div>
</template>
