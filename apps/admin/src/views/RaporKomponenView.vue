<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';
import { PageHeader, BaseModal, SearchSelect, ActionButton } from '@/components/ui';
import type { SelectOption } from '@/components/ui';

interface KomponenPenilaian {
  id: string;
  nama: string;
  tipe: 'angka' | 'huruf' | 'deskripsi';
  skala_min: number | null;
  skala_max: number | null;
  is_wajib: boolean;
  urutan: number;
  created_at: string;
}

interface KomponenForm {
  nama: string;
  tipe: 'angka' | 'huruf' | 'deskripsi';
  skala_min: number | null;
  skala_max: number | null;
  is_wajib: boolean;
  urutan: number;
}

const items = ref<KomponenPenilaian[]>([]);
const loading = ref(false);
const error = ref('');

const showFormModal = ref(false);
const showDeleteModal = ref(false);
const editingItem = ref<KomponenPenilaian | null>(null);
const deletingItem = ref<KomponenPenilaian | null>(null);
const deleteError = ref('');
const formError = ref('');

const defaultForm: KomponenForm = {
  nama: '',
  tipe: 'angka',
  skala_min: 0,
  skala_max: 100,
  is_wajib: true,
  urutan: 0,
};

const form = ref<KomponenForm>({ ...defaultForm });

const tipePenilaianOptions: SelectOption[] = [
  { value: 'angka', label: 'Angka (misal: 0-100)' },
  { value: 'huruf', label: 'Huruf (A/B/C/D/E)' },
  { value: 'deskripsi', label: 'Deskripsi Naratif' },
];

async function fetchItems() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get<KomponenPenilaian[]>('/rapor/komponen-penilaian');
    items.value = data;
  } catch (err) {
    error.value = err.response?.data?.message || 'Gagal memuat komponen penilaian.';
    console.error('Failed to fetch komponen penilaian:', err);
  } finally {
    loading.value = false;
  }
}

function openCreateForm() {
  editingItem.value = null;
  form.value = { ...defaultForm, urutan: items.value.length + 1 };
  formError.value = '';
  showFormModal.value = true;
}

function openEditForm(item: KomponenPenilaian) {
  editingItem.value = item;
  form.value = {
    nama: item.nama,
    tipe: item.tipe,
    skala_min: item.skala_min,
    skala_max: item.skala_max,
    is_wajib: item.is_wajib,
    urutan: item.urutan,
  };
  formError.value = '';
  showFormModal.value = true;
}

function openDeleteConfirm(item: KomponenPenilaian) {
  deletingItem.value = item;
  deleteError.value = '';
  showDeleteModal.value = true;
}

function onTipeChange() {
  if (form.value.tipe === 'angka') {
    form.value.skala_min = 0;
    form.value.skala_max = 100;
  } else {
    form.value.skala_min = null;
    form.value.skala_max = null;
  }
}

async function saveItem() {
  formError.value = '';

  if (!form.value.nama.trim()) {
    formError.value = 'Nama komponen wajib diisi.';
    return;
  }

  if (form.value.tipe === 'angka') {
    if (form.value.skala_min === null || form.value.skala_max === null) {
      formError.value = 'Skala min dan max wajib diisi untuk tipe angka.';
      return;
    }
    if (form.value.skala_min >= form.value.skala_max) {
      formError.value = 'Skala min harus lebih kecil dari skala max.';
      return;
    }
  }

  const payload = {
    nama: form.value.nama.trim(),
    tipe: form.value.tipe,
    skala_min: form.value.tipe === 'angka' ? form.value.skala_min : undefined,
    skala_max: form.value.tipe === 'angka' ? form.value.skala_max : undefined,
    is_wajib: form.value.is_wajib,
    urutan: form.value.urutan,
  };

  try {
    if (editingItem.value) {
      await api.patch(`/rapor/komponen-penilaian/${editingItem.value.id}`, payload);
    } else {
      await api.post('/rapor/komponen-penilaian', payload);
    }
    showFormModal.value = false;
    await fetchItems();
  } catch (err) {
    formError.value = err.response?.data?.message || 'Gagal menyimpan komponen penilaian.';
  }
}

async function deleteItem() {
  if (!deletingItem.value) return;
  try {
    await api.delete(`/rapor/komponen-penilaian/${deletingItem.value.id}`);
    showDeleteModal.value = false;
    deletingItem.value = null;
    await fetchItems();
  } catch (err) {
    deleteError.value = err.response?.data?.message || 'Gagal menghapus komponen penilaian.';
  }
}

function getTipeLabel(tipe: string): string {
  switch (tipe) {
    case 'angka':
      return 'Angka';
    case 'huruf':
      return 'Huruf (A/B/C/D/E)';
    case 'deskripsi':
      return 'Deskripsi Naratif';
    default:
      return tipe;
  }
}

onMounted(fetchItems);
</script>

<template>
  <div class="p-8 max-w-7xl mx-auto">
    <PageHeader
      title="Konfigurasi Komponen Penilaian"
      description="Atur komponen penilaian rapor sesuai kurikulum sekolah. Template default: Kurikulum Merdeka (Nilai Akhir angka 0-100, Capaian Pembelajaran deskripsi naratif)."
    >
      <template #actions>
        <ActionButton variant="primary" icon="check" @click="openCreateForm">
          Tambah Komponen
        </ActionButton>
      </template>
    </PageHeader>

    <div
      v-if="error"
      class="p-3 bg-danger-50 border-2 border-danger-200 rounded-[8px] text-[15px] text-danger-700 mb-4"
    >
      {{ error }}
    </div>

    <div
      v-if="!loading && items.length > 0"
      class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden"
    >
      <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
        <h2 class="text-[16px] font-bold text-primary-800">Daftar Komponen Penilaian</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b-2 border-stone-200">
            <tr>
              <th
                class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm w-[80px]"
              >
                Urutan
              </th>
              <th
                class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Nama Komponen
              </th>
              <th
                class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Tipe
              </th>
              <th
                class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Skala
              </th>
              <th
                class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Wajib
              </th>
              <th
                class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Aksi
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-200">
            <tr v-for="item in items" :key="item.id" class="hover:bg-primary-50 transition-colors">
              <td class="px-5 py-4 text-[15px]">{{ item.urutan }}</td>
              <td class="px-5 py-4 text-[15px] text-text-primary font-medium">{{ item.nama }}</td>
              <td class="px-5 py-4 text-[15px] text-text-secondary">
                {{ getTipeLabel(item.tipe) }}
              </td>
              <td class="px-5 py-4 text-[15px] text-text-secondary">
                <span v-if="item.tipe === 'angka'"
                  >{{ item.skala_min }} - {{ item.skala_max }}</span
                >
                <span v-else-if="item.tipe === 'huruf'">A/B/C/D/E</span>
                <span v-else>-</span>
              </td>
              <td class="px-5 py-4">
                <span
                  class="inline-flex items-center px-2.5 py-1 rounded-[8px] text-[13px] font-semibold"
                  :class="
                    item.is_wajib
                      ? 'bg-primary-50 text-primary-700'
                      : 'bg-stone-100 text-text-secondary'
                  "
                >
                  {{ item.is_wajib ? 'Wajib' : 'Opsional' }}
                </span>
              </td>
              <td class="px-5 py-4">
                <div class="flex gap-2">
                  <ActionButton variant="warning" icon="edit" @click="openEditForm(item)">
                    Edit
                  </ActionButton>
                  <ActionButton variant="danger" icon="delete" @click="openDeleteConfirm(item)">
                    Hapus
                  </ActionButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else-if="loading" class="text-center py-8">
      <svg class="w-6 h-6 animate-spin text-primary-500 mx-auto" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p class="text-[15px] text-text-secondary mt-2">Memuat data...</p>
    </div>

    <div v-else class="text-center text-text-secondary py-8 text-[15px]">
      Belum ada komponen penilaian. Klik "Tambah Komponen" untuk mengatur format rapor.
    </div>

    <!-- Create/Edit Modal -->
    <BaseModal
      :show="showFormModal"
      :title="editingItem ? 'Edit Komponen' : 'Tambah Komponen Penilaian'"
      @close="showFormModal = false"
    >
      <form @submit.prevent="saveItem">
        <div class="mb-4">
          <label class="block text-[15px] font-medium text-text-primary mb-1.5"
            >Nama Komponen</label
          >
          <input
            v-model="form.nama"
            type="text"
            required
            class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            placeholder="Contoh: Nilai Akhir, Tugas Harian, UTS"
          />
        </div>

        <div class="mb-4">
          <SearchSelect
            v-model="form.tipe"
            :options="tipePenilaianOptions"
            label="Tipe Penilaian"
            :required="true"
            :searchable="false"
            @change="onTipeChange"
          />
        </div>

        <div v-if="form.tipe === 'angka'" class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-[15px] font-medium text-text-primary mb-1.5">Skala Min</label>
            <input
              v-model.number="form.skala_min"
              type="number"
              class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
          <div>
            <label class="block text-[15px] font-medium text-text-primary mb-1.5">Skala Max</label>
            <input
              v-model.number="form.skala_max"
              type="number"
              class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
        </div>

        <div class="mb-4">
          <label class="block text-[15px] font-medium text-text-primary mb-1.5">Urutan</label>
          <input
            v-model.number="form.urutan"
            type="number"
            min="0"
            class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>

        <div class="mb-4">
          <label class="flex items-center gap-2 text-[15px] text-text-primary cursor-pointer">
            <input v-model="form.is_wajib" type="checkbox" class="rounded border-stone-200" />
            Wajib diisi oleh guru
          </label>
        </div>

        <p v-if="formError" class="text-[13px] text-danger-500 mt-1">{{ formError }}</p>
      </form>

      <template #footer>
        <ActionButton variant="neutral" icon="x" @click="showFormModal = false">
          Batal
        </ActionButton>
        <ActionButton variant="primary" icon="check" @click="saveItem"> Simpan </ActionButton>
      </template>
    </BaseModal>

    <!-- Delete Confirmation Modal -->
    <BaseModal :show="showDeleteModal" title="Konfirmasi Hapus" @close="showDeleteModal = false">
      <p class="text-[15px] text-text-primary">
        Apakah Anda yakin ingin menghapus komponen
        <strong>{{ deletingItem?.nama }}</strong
        >?
      </p>
      <p v-if="deleteError" class="text-[13px] text-danger-500 mt-1">{{ deleteError }}</p>

      <template #footer>
        <ActionButton variant="neutral" icon="x" @click="showDeleteModal = false">
          Batal
        </ActionButton>
        <ActionButton variant="danger" icon="delete" @click="deleteItem"> Hapus </ActionButton>
      </template>
    </BaseModal>
  </div>
</template>
