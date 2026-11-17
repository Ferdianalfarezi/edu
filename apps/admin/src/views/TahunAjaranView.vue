<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { api } from '@/api/client';
import { PageHeader, BaseModal, ActionButton } from '@/components/ui';
import { useToast } from '@/composables/useToast';

interface TahunAjaran {
  id: string;
  nama: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  semester1Mulai: string;
  semester1Selesai: string;
  semester2Mulai: string;
  semester2Selesai: string;
  status: 'disiapkan' | 'aktif' | 'nonaktif';
  createdAt: string;
}

interface TahunAjaranForm {
  nama: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  semester_1_selesai: string;
  semester_2_mulai: string;
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
  semester_1_selesai: '',
  semester_2_mulai: '',
  generate_kelas: true,
});

// Modal atur semester
const showSemesterModal = ref(false);
const editingItem = ref<TahunAjaran | null>(null);
const semesterForm = ref({ semester_1_selesai: '', semester_2_mulai: '' });
const semesterError = ref('');
const savingSemester = ref(false);

/** 'YYYY-MM-DD' digeser n hari (tanpa efek zona waktu). */
function geserHari(tanggal: string, hari: number): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}

/** Sama dengan default di API: Semester 2 mulai 1 Januari, kalau tidak ada di dalam TA pakai tengahnya. */
function hitungSemesterDefault(mulai: string, selesai: string) {
  let semester2Mulai = `${Number(mulai.slice(0, 4)) + 1}-01-01`;
  if (!(semester2Mulai > mulai && semester2Mulai <= selesai)) {
    const totalHari = (Date.parse(selesai) - Date.parse(mulai)) / 86_400_000;
    semester2Mulai = geserHari(mulai, Math.floor(totalHari / 2) + 1);
  }
  return { semester_1_selesai: geserHari(semester2Mulai, -1), semester_2_mulai: semester2Mulai };
}

// Isi otomatis batas semester begitu tanggal TA lengkap (admin tetap bisa ubah)
watch(
  () => [form.value.tanggal_mulai, form.value.tanggal_selesai],
  ([mulai, selesai]) => {
    if (mulai && selesai && mulai < selesai) {
      Object.assign(form.value, hitungSemesterDefault(mulai, selesai));
    }
  },
);

function formatRentang(mulai: string, selesai: string): string {
  const opsi: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const fmt = (t: string) => new Date(`${t}T00:00:00`).toLocaleDateString('id-ID', opsi);
  return mulai && selesai ? `${fmt(mulai)} – ${fmt(selesai)}` : '-';
}

function getErrorMessage(error: unknown, fallback: string): string {
  const msg = (error as { response?: { data?: { message?: string | string[] } } }).response?.data
    ?.message;
  return Array.isArray(msg) ? msg.join(', ') : msg || fallback;
}

function openSemesterForm(item: TahunAjaran) {
  editingItem.value = item;
  semesterForm.value = {
    semester_1_selesai: item.semester1Selesai,
    semester_2_mulai: item.semester2Mulai,
  };
  semesterError.value = '';
  showSemesterModal.value = true;
}

async function saveSemester() {
  if (!editingItem.value) return;
  semesterError.value = '';
  savingSemester.value = true;
  try {
    await api.patch(`/tahun-ajaran/${editingItem.value.id}/semester`, semesterForm.value);
    showSemesterModal.value = false;
    toast.success(`Tanggal semester ${editingItem.value.nama} disimpan.`);
    await fetchItems();
  } catch (error) {
    semesterError.value = getErrorMessage(error, 'Gagal menyimpan tanggal semester.');
  } finally {
    savingSemester.value = false;
  }
}

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
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('id-ID', {
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
  form.value = {
    nama: '',
    tanggal_mulai: '',
    tanggal_selesai: '',
    semester_1_selesai: '',
    semester_2_mulai: '',
    generate_kelas: true,
  };
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
    semester_1_selesai: form.value.semester_1_selesai || undefined,
    semester_2_mulai: form.value.semester_2_mulai || undefined,
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
                Semester
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
                {{ formatDate(item.tanggalMulai) }}
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-600">
                {{ formatDate(item.tanggalSelesai) }}
              </td>
              <td class="px-5 py-4 text-[13px] text-stone-600 whitespace-nowrap">
                <div>
                  <span class="font-semibold text-stone-800">Sem 1</span>
                  {{ formatRentang(item.semester1Mulai, item.semester1Selesai) }}
                </div>
                <div>
                  <span class="font-semibold text-stone-800">Sem 2</span>
                  {{ formatRentang(item.semester2Mulai, item.semester2Selesai) }}
                </div>
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
                <div class="flex items-center gap-2 flex-wrap">
                  <ActionButton variant="warning" icon="edit" @click="openSemesterForm(item)"
                    >Atur Semester</ActionButton
                  >
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
                </div>
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
        <div v-if="form.tanggal_mulai && form.tanggal_selesai" class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[15px] font-medium text-stone-800 mb-1.5"
              >Akhir Semester 1</label
            >
            <input
              v-model="form.semester_1_selesai"
              type="date"
              required
              class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
          <div>
            <label class="block text-[15px] font-medium text-stone-800 mb-1.5"
              >Awal Semester 2</label
            >
            <input
              v-model="form.semester_2_mulai"
              type="date"
              required
              class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
          <p class="col-span-2 text-[13px] text-stone-500">
            Terisi otomatis (Semester 2 mulai 1 Januari). Ubah kalau kalender sekolah berbeda.
          </p>
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

    <!-- Atur Semester Modal -->
    <BaseModal
      :show="showSemesterModal"
      :title="`Atur Semester ${editingItem?.nama ?? ''}`"
      @close="showSemesterModal = false"
    >
      <p class="text-[15px] text-stone-600 mb-4">
        Semester 1 dimulai {{ formatDate(editingItem?.tanggalMulai ?? '') }} dan Semester 2 berakhir
        {{ formatDate(editingItem?.tanggalSelesai ?? '') }} (sesuai tahun ajaran). Atur batas di
        antaranya. Boleh ada jeda untuk libur semester.
      </p>
      <form id="form-semester" class="grid grid-cols-2 gap-3" @submit.prevent="saveSemester">
        <div>
          <label class="block text-[15px] font-medium text-stone-800 mb-1.5"
            >Akhir Semester 1</label
          >
          <input
            v-model="semesterForm.semester_1_selesai"
            type="date"
            required
            :min="editingItem?.tanggalMulai"
            :max="editingItem?.tanggalSelesai"
            class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <div>
          <label class="block text-[15px] font-medium text-stone-800 mb-1.5">Awal Semester 2</label>
          <input
            v-model="semesterForm.semester_2_mulai"
            type="date"
            required
            :min="editingItem?.tanggalMulai"
            :max="editingItem?.tanggalSelesai"
            class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
        <p v-if="semesterError" class="col-span-2 text-[13px] text-danger-500">
          {{ semesterError }}
        </p>
      </form>
      <template #footer>
        <ActionButton variant="neutral" @click="showSemesterModal = false"> Batal </ActionButton>
        <ActionButton variant="primary" type="submit" form="form-semester"> Simpan </ActionButton>
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
