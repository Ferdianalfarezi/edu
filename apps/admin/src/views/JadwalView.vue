<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api/client';
import { PageHeader, BaseModal, SearchSelect, ActionButton } from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import { useToast } from '@/composables/useToast';

// Types
interface Kelas {
  id: string;
  nama: string;
  tingkat: number;
  tahunAjaranId?: string;
}

interface MataPelajaran {
  id: string;
  nama: string;
  kode: string | null;
}

interface Guru {
  id: string;
  nama: string;
}

interface JadwalEntry {
  id: string;
  kelasId: string;
  mataPelajaranId: string | null;
  guruId: string | null;
  hari: string;
  jamKe: number;
  isVacant: boolean;
  isIstirahat: boolean;
  mataPelajaran?: MataPelajaran | null;
  guru?: Guru | null;
  guruPenggantiAktif?: GuruPenggantiInfo | null;
}

interface TahunAjaran {
  id: string;
  nama: string;
  status: string;
  semester1Mulai: string;
  semester1Selesai: string;
  semester2Mulai: string;
  semester2Selesai: string;
}

interface HasilSalin {
  jadwalDisalin: number;
  kelasDisalin: string[];
  kelasDilewati: { kelas: string; alasan: string }[];
}

interface GuruPenggantiInfo {
  id: string;
  guruPenggantiId: string;
  guruPenggantiNama: string;
  tanggal: string;
}

interface JadwalForm {
  mataPelajaranId: string;
  guruId: string;
  isIstirahat: boolean;
}

interface GuruPenggantiForm {
  guruPenggantiId: string;
  alasan: string;
  tanggalMulai: string;
  tanggalSelesai: string;
}

// Constants
const HARI_LIST = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
const HARI_LABELS: Record<string, string> = {
  senin: 'Senin',
  selasa: 'Selasa',
  rabu: 'Rabu',
  kamis: 'Kamis',
  jumat: 'Jumat',
  sabtu: 'Sabtu',
};
const JAM_KE_LIST = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// State
const kelasList = ref<Kelas[]>([]);
const mataPelajaranList = ref<MataPelajaran[]>([]);
const guruList = ref<Guru[]>([]);
const jadwalEntries = ref<JadwalEntry[]>([]);
const tahunAjaranList = ref<TahunAjaran[]>([]);
const selectedTahunAjaranId = ref('');
const selectedSemester = ref(1);
const toast = useToast();
const menyalin = ref(false);

const SEMESTER_OPTIONS: SelectOption[] = [
  { value: 1, label: 'Semester 1' },
  { value: 2, label: 'Semester 2' },
];

const selectedTahunAjaran = computed(() =>
  tahunAjaranList.value.find((ta) => ta.id === selectedTahunAjaranId.value),
);

function formatTanggal(t: string): string {
  return new Date(`${t}T00:00:00`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Rentang berlaku semester terpilih (diatur di menu Tahun Ajaran -> Edit). */
const rentangSemesterLabel = computed(() => {
  const ta = selectedTahunAjaran.value;
  if (!ta) return '';
  const [mulai, selesai] =
    selectedSemester.value === 1
      ? [ta.semester1Mulai, ta.semester1Selesai]
      : [ta.semester2Mulai, ta.semester2Selesai];
  return mulai && selesai ? `${formatTanggal(mulai)} – ${formatTanggal(selesai)}` : '';
});

/** TA aktif: semester yang sedang berjalan hari ini. TA lain: Semester 1. */
function semesterDefault(ta: TahunAjaran | undefined): number {
  if (!ta || ta.status !== 'aktif') return 1;
  const hariIni = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD waktu lokal
  return hariIni >= ta.semester2Mulai ? 2 : 1;
}

async function salinDariSemester1(semuaKelas: boolean) {
  if (!selectedTahunAjaran.value) return;
  const target = semuaKelas
    ? `SEMUA kelas di TA ${selectedTahunAjaran.value.nama}`
    : `kelas ${kelasList.value.find((k) => k.id === selectedKelasId.value)?.nama ?? ''}`;
  if (
    !window.confirm(
      `Salin jadwal Semester 1 ke Semester 2 untuk ${target}?\n\nKelas yang sudah punya jadwal Semester 2 akan dilewati.`,
    )
  )
    return;

  menyalin.value = true;
  try {
    const { data } = await api.post<HasilSalin>('/jadwal/salin-semester', {
      tahunAjaranId: selectedTahunAjaranId.value,
      ...(semuaKelas ? {} : { kelasId: selectedKelasId.value }),
    });
    if (data.jadwalDisalin > 0) {
      toast.success(
        `${data.jadwalDisalin} jadwal disalin ke Semester 2 (${data.kelasDisalin.join(', ')}).`,
      );
    }
    if (data.kelasDilewati.length > 0) {
      toast.info(
        'Dilewati: ' + data.kelasDilewati.map((k) => `${k.kelas} (${k.alasan})`).join(', '),
      );
    }
    await fetchJadwal();
  } catch {
    // Toast error sudah ditampilkan otomatis oleh api client
  } finally {
    menyalin.value = false;
  }
}

const selectedKelasId = ref('');
const loading = ref(false);

// Modal state - CRUD
const showFormModal = ref(false);
const editingEntry = ref<JadwalEntry | null>(null);
const selectedHari = ref('');
const selectedJamKe = ref(0);
const form = ref<JadwalForm>({
  mataPelajaranId: '',
  guruId: '',
  isIstirahat: false,
});
const formError = ref('');

// Modal state - Guru Pengganti
const showPenggantiModal = ref(false);
const penggantiTarget = ref<JadwalEntry | null>(null);
const penggantiForm = ref<GuruPenggantiForm>({
  guruPenggantiId: '',
  alasan: '',
  tanggalMulai: '',
  tanggalSelesai: '',
});
const penggantiError = ref('');

// Delete confirmation
const showDeleteModal = ref(false);
const deletingEntry = ref<JadwalEntry | null>(null);

// Computed options
const tahunAjaranSelectOptions = computed<SelectOption[]>(() =>
  tahunAjaranList.value.map((ta) => ({
    value: ta.id,
    label: `${ta.nama}${ta.status === 'aktif' ? ' (Aktif)' : ''}`,
  })),
);

const kelasSelectOptions = computed<SelectOption[]>(() =>
  kelasList.value.map((k) => ({ value: k.id, label: k.nama })),
);

const mataPelajaranSelectOptions = computed<SelectOption[]>(() =>
  mataPelajaranList.value.map((m) => ({ value: m.id, label: m.nama })),
);

const guruSelectOptions = computed<SelectOption[]>(() =>
  guruList.value.map((g) => ({ value: g.id, label: g.nama })),
);

// Computed: grid data structure mapping jam_ke + hari to jadwal entry
const gridData = computed(() => {
  const grid: Record<number, Record<string, JadwalEntry | null>> = {};
  for (const jam of JAM_KE_LIST) {
    grid[jam] = {};
    for (const hari of HARI_LIST) {
      grid[jam][hari] = null;
    }
  }

  for (const entry of jadwalEntries.value) {
    if (entry.jamKe >= 1 && entry.jamKe <= 10) {
      grid[entry.jamKe][entry.hari] = entry;
    }
  }

  return grid;
});

// Data fetching
async function fetchKelasList() {
  try {
    const params: Record<string, string> = {};
    if (selectedTahunAjaranId.value) {
      params.tahunAjaranId = selectedTahunAjaranId.value;
    }
    const { data } = await api.get<{ data: Kelas[] }>('/kelas', { params });
    kelasList.value = data.data;
    if (kelasList.value.length > 0 && !selectedKelasId.value) {
      selectedKelasId.value = kelasList.value[0].id;
    }
  } catch (error) {
    console.error('Failed to fetch kelas:', error);
  }
}

async function fetchDropdowns() {
  try {
    const [mapelRes, guruRes, taRes] = await Promise.all([
      api.get<{ data: MataPelajaran[] }>('/mata-pelajaran'),
      api.get<{ data: Guru[] }>('/users', { params: { role: 'guru' } }),
      api.get<TahunAjaran[]>('/tahun-ajaran'),
    ]);
    mataPelajaranList.value = mapelRes.data.data;
    guruList.value = guruRes.data.data;
    const taList = taRes.data;
    tahunAjaranList.value = taList;
    const aktif = taList.find((ta) => ta.status === 'aktif');
    if (aktif) {
      selectedTahunAjaranId.value = aktif.id;
    } else if (taList.length > 0) {
      selectedTahunAjaranId.value = taList[0].id;
    }
  } catch (error) {
    console.error('Failed to fetch dropdowns:', error);
  }
}

async function fetchJadwal() {
  if (!selectedKelasId.value) return;
  loading.value = true;
  try {
    const params: Record<string, string | number> = {
      kelasId: selectedKelasId.value,
      semester: selectedSemester.value,
    };
    if (selectedTahunAjaranId.value) {
      params.tahunAjaranId = selectedTahunAjaranId.value;
    }
    const { data } = await api.get<JadwalEntry[]>('/jadwal', { params });
    jadwalEntries.value = data;
  } catch (error) {
    console.error('Failed to fetch jadwal:', error);
  } finally {
    loading.value = false;
  }
}

watch(selectedKelasId, () => {
  fetchJadwal();
});

watch(selectedTahunAjaranId, () => {
  selectedSemester.value = semesterDefault(selectedTahunAjaran.value);
  selectedKelasId.value = '';
  fetchKelasList();
});

watch(selectedSemester, () => {
  fetchJadwal();
});

// Cell click handler
function handleCellClick(jam: number, hari: string) {
  const entry = gridData.value[jam][hari];
  if (entry) {
    openEditForm(entry, hari, jam);
  } else {
    openCreateForm(hari, jam);
  }
}

// Cell display helpers
function getCellMapel(entry: JadwalEntry | null): string {
  if (!entry) return '';
  if (entry.isIstirahat) return 'Istirahat';
  return entry.mataPelajaran?.nama || getMapelNama(entry.mataPelajaranId || '');
}

function getCellGuru(entry: JadwalEntry | null): string {
  if (!entry || entry.isIstirahat) return '';
  return entry.guru?.nama || getGuruNama(entry.guruId || '');
}

function getCellPenggantiNama(entry: JadwalEntry | null): string {
  if (!entry?.guruPenggantiAktif) return '';
  return entry.guruPenggantiAktif.guruPenggantiNama;
}

function getMapelNama(id: string): string {
  return mataPelajaranList.value.find((m) => m.id === id)?.nama || '-';
}

function getGuruNama(id: string): string {
  return guruList.value.find((g) => g.id === id)?.nama || '-';
}

function isVacant(entry: JadwalEntry | null): boolean {
  return !entry || (entry.isVacant && !entry.isIstirahat) || (!entry.guruId && !entry.isIstirahat);
}

function isIstirahat(entry: JadwalEntry | null): boolean {
  return !!entry?.isIstirahat;
}

function hasPengganti(entry: JadwalEntry | null): boolean {
  return !!entry?.guruPenggantiAktif;
}

// CRUD actions
function openCreateForm(hari: string, jamKe: number) {
  editingEntry.value = null;
  selectedHari.value = hari;
  selectedJamKe.value = jamKe;
  form.value = {
    mataPelajaranId: '',
    guruId: '',
    isIstirahat: false,
  };
  formError.value = '';
  showFormModal.value = true;
}

function openEditForm(entry: JadwalEntry, hari: string, jamKe: number) {
  editingEntry.value = entry;
  selectedHari.value = hari;
  selectedJamKe.value = jamKe;
  form.value = {
    mataPelajaranId: entry.mataPelajaranId || '',
    guruId: entry.guruId || '',
    isIstirahat: entry.isIstirahat || false,
  };
  formError.value = '';
  showFormModal.value = true;
}

async function saveJadwal() {
  formError.value = '';

  if (!form.value.isIstirahat && (!form.value.mataPelajaranId || !form.value.guruId)) {
    formError.value = 'Mata pelajaran dan guru wajib dipilih untuk jam pelajaran.';
    return;
  }

  if (!selectedTahunAjaranId.value) {
    formError.value = 'Tidak ada tahun ajaran dipilih. Harap pilih tahun ajaran terlebih dahulu.';
    return;
  }

  // Tanggal berlaku tidak dikirim: API mengisinya dari rentang semester di tahun ajaran
  const createPayload: Record<string, unknown> = {
    kelasId: selectedKelasId.value,
    tahunAjaranId: selectedTahunAjaranId.value,
    semester: selectedSemester.value,
    hari: selectedHari.value,
    jamKe: selectedJamKe.value,
    isIstirahat: form.value.isIstirahat,
  };

  if (!form.value.isIstirahat) {
    createPayload.mataPelajaranId = form.value.mataPelajaranId;
    createPayload.guruId = form.value.guruId;
  }

  // UpdateJadwalDto only accepts: guruId, mataPelajaranId, jamKe, hari,
  // tanggalMulaiBerlaku, tanggalSelesaiBerlaku (tanggal berlaku tidak diubah saat edit)
  const updatePayload: Record<string, unknown> = {
    hari: selectedHari.value,
    jamKe: selectedJamKe.value,
  };
  if (!form.value.isIstirahat) {
    updatePayload.mataPelajaranId = form.value.mataPelajaranId;
    updatePayload.guruId = form.value.guruId;
  }

  try {
    if (editingEntry.value) {
      await api.patch(`/jadwal/${editingEntry.value.id}`, updatePayload);
    } else {
      await api.post('/jadwal', createPayload);
    }
    showFormModal.value = false;
    await fetchJadwal();
  } catch (error) {
    formError.value = error.response?.data?.message || 'Gagal menyimpan jadwal.';
  }
}

function confirmDelete(entry: JadwalEntry) {
  deletingEntry.value = entry;
  showDeleteModal.value = true;
}

async function deleteJadwal() {
  if (!deletingEntry.value) return;
  try {
    await api.delete(`/jadwal/${deletingEntry.value.id}`);
    showDeleteModal.value = false;
    deletingEntry.value = null;
    await fetchJadwal();
  } catch (error) {
    console.error('Failed to delete jadwal:', error);
  }
}

// Guru Pengganti
function openPenggantiModal(entry: JadwalEntry) {
  penggantiTarget.value = entry;
  penggantiForm.value = {
    guruPenggantiId: '',
    alasan: '',
    tanggalMulai: new Date().toISOString().split('T')[0],
    tanggalSelesai: new Date().toISOString().split('T')[0],
  };
  penggantiError.value = '';
  showPenggantiModal.value = true;
}

async function savePengganti() {
  penggantiError.value = '';
  if (!penggantiForm.value.guruPenggantiId || !penggantiForm.value.alasan) {
    penggantiError.value = 'Guru pengganti dan alasan wajib diisi.';
    return;
  }
  if (!penggantiTarget.value) return;

  try {
    await api.post('/jadwal/guru-pengganti', {
      guruPenggantiId: penggantiForm.value.guruPenggantiId,
      kelasId: penggantiTarget.value.kelasId,
      mataPelajaranId: penggantiTarget.value.mataPelajaranId,
      tanggal: penggantiForm.value.tanggalMulai,
    });
    showPenggantiModal.value = false;
    await fetchJadwal();
  } catch (error) {
    penggantiError.value = error.response?.data?.message || 'Gagal menyimpan guru pengganti.';
  }
}

async function removePengganti(entry: JadwalEntry) {
  try {
    const penggantiId = entry.guruPenggantiAktif?.id;
    if (!penggantiId) return;
    await api.delete(`/jadwal/guru-pengganti/${penggantiId}`);
    await fetchJadwal();
  } catch (error) {
    console.error('Failed to remove guru pengganti:', error);
  }
}

function handleConfirmDelete() {
  if (editingEntry.value) {
    confirmDelete(editingEntry.value);
  }
}

function handleOpenPengganti() {
  if (editingEntry.value) {
    openPenggantiModal(editingEntry.value);
  }
}

function handleRemovePengganti() {
  if (penggantiTarget.value) {
    removePengganti(penggantiTarget.value);
  }
}

// Init
onMounted(async () => {
  await fetchDropdowns();
  await fetchKelasList();
});
</script>

<template>
  <div class="p-8">
    <PageHeader title="Manajemen Jadwal Pelajaran" />

    <!-- Filter: Tahun Ajaran & Kelas -->
    <div class="flex flex-wrap items-end gap-4 mb-6">
      <div class="w-56">
        <SearchSelect
          v-model="selectedTahunAjaranId"
          label="Tahun Ajaran"
          :options="tahunAjaranSelectOptions"
          placeholder="Pilih Tahun Ajaran"
        />
      </div>
      <div class="w-44">
        <SearchSelect
          v-model="selectedSemester"
          label="Semester"
          :options="SEMESTER_OPTIONS"
          :searchable="false"
        />
      </div>
      <div class="w-48">
        <SearchSelect
          v-model="selectedKelasId"
          label="Kelas"
          :options="kelasSelectOptions"
          placeholder="Pilih Kelas"
        />
      </div>
      <p v-if="rentangSemesterLabel" class="text-[13px] text-text-secondary pb-2.5">
        Berlaku {{ rentangSemesterLabel }}
      </p>
    </div>

    <!-- Semester 2 masih kosong: tawarkan salin dari Semester 1 -->
    <div
      v-if="selectedKelasId && selectedSemester === 2 && !loading && jadwalEntries.length === 0"
      class="flex flex-wrap items-center justify-between gap-3 p-4 mb-4 rounded-[12px] border-2 border-warning-100 bg-warning-50"
    >
      <p class="text-[14px] text-warning-700">
        Jadwal Semester 2 kelas ini masih kosong. Salin dari Semester 1 lalu ubah yang berbeda?
      </p>
      <div class="flex gap-2">
        <ActionButton variant="neutral" :disabled="menyalin" @click="salinDariSemester1(false)">
          Salin kelas ini
        </ActionButton>
        <ActionButton variant="primary" :disabled="menyalin" @click="salinDariSemester1(true)">
          Salin semua kelas
        </ActionButton>
      </div>
    </div>

    <!-- Schedule Grid Card -->
    <div
      v-if="selectedKelasId"
      class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden"
    >
      <!-- Section Header -->
      <div
        class="flex items-center justify-between px-6 py-5 bg-primary-50 border-b-2 border-primary-200"
      >
        <h3 class="text-[16px] font-bold text-primary-800">Jadwal Pelajaran</h3>
        <span class="text-[13px] font-semibold text-text-secondary">
          {{ kelasList.find((k) => k.id === selectedKelasId)?.nama || '' }}
        </span>
      </div>

      <div v-if="loading" class="py-12 text-center">
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
        <p class="text-[15px] text-text-tertiary mt-2">Memuat jadwal...</p>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full table-fixed">
          <thead>
            <tr class="border-b-2 border-stone-200">
              <th
                class="px-5 py-4 text-center text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm w-16"
              >
                Jam
              </th>
              <th
                v-for="hari in HARI_LIST"
                :key="hari"
                class="px-5 py-4 text-center text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                {{ HARI_LABELS[hari] }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-200">
            <tr v-for="jam in JAM_KE_LIST" :key="jam">
              <td
                class="px-5 py-4 text-[15px] font-semibold text-text-primary bg-surface-warm text-center"
              >
                {{ jam }}
              </td>
              <td
                v-for="hari in HARI_LIST"
                :key="`${jam}-${hari}`"
                :class="[
                  'p-3 border border-stone-200 text-center cursor-pointer hover:bg-primary-50 transition-colors duration-200 align-top min-h-15',
                  isIstirahat(gridData[jam][hari]) ? 'bg-accent-50' : '',
                  isVacant(gridData[jam][hari]) &&
                  gridData[jam][hari] !== null &&
                  !isIstirahat(gridData[jam][hari])
                    ? 'bg-warning-50'
                    : '',
                  hasPengganti(gridData[jam][hari]) ? 'bg-primary-50' : '',
                ]"
                @click="handleCellClick(jam, hari)"
              >
                <template v-if="gridData[jam][hari]">
                  <template v-if="isIstirahat(gridData[jam][hari])">
                    <div class="text-[13px] font-semibold text-accent-700">☕ Istirahat</div>
                  </template>
                  <template v-else>
                    <div class="text-[13px] font-semibold text-text-primary mb-0.5">
                      {{ getCellMapel(gridData[jam][hari]) }}
                    </div>
                    <div class="text-text-tertiary text-[11px]">
                      {{ getCellGuru(gridData[jam][hari]) }}
                    </div>
                    <div
                      v-if="hasPengganti(gridData[jam][hari])"
                      class="mt-1 text-[11px] text-primary-700 font-semibold"
                    >
                      🔄 {{ getCellPenggantiNama(gridData[jam][hari]) }}
                    </div>
                  </template>
                </template>
                <template v-else>
                  <div class="text-[13px] text-warning-700 font-medium italic">Kosong</div>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else
      class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs py-12 text-center"
    >
      <p class="text-[15px] text-text-tertiary">Pilih kelas untuk melihat jadwal.</p>
    </div>

    <!-- Create/Edit Jadwal Modal -->
    <BaseModal
      :show="showFormModal"
      :title="editingEntry ? 'Edit Jadwal' : 'Tambah Jadwal'"
      size="lg"
      @close="showFormModal = false"
    >
      <p class="text-[15px] text-text-secondary mb-4">
        {{ HARI_LABELS[selectedHari] }} — Jam ke-{{ selectedJamKe }}
      </p>
      <form @submit.prevent="saveJadwal">
        <!-- Istirahat Toggle -->
        <div class="mb-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              v-model="form.isIstirahat"
              type="checkbox"
              class="w-4 h-4 rounded border-stone-300 text-primary-600 focus:ring-primary-500/20"
            />
            <span class="text-[15px] font-medium text-text-primary">Jam Istirahat</span>
          </label>
          <p class="text-[13px] text-text-tertiary mt-1">
            Centang jika slot ini adalah jam istirahat (tidak perlu guru & mata pelajaran)
          </p>
        </div>

        <!-- Mapel & Guru fields (hidden when istirahat) -->
        <template v-if="!form.isIstirahat">
          <div class="mb-4">
            <SearchSelect
              v-model="form.mataPelajaranId"
              label="Mata Pelajaran"
              :options="mataPelajaranSelectOptions"
              placeholder="Pilih Mata Pelajaran"
              required
            />
          </div>
          <div class="mb-4">
            <SearchSelect
              v-model="form.guruId"
              label="Guru"
              :options="guruSelectOptions"
              placeholder="Pilih Guru"
              required
            />
          </div>
        </template>

        <p v-if="formError" class="text-[13px] text-danger-600 mt-1">{{ formError }}</p>
      </form>
      <template #footer>
        <div class="flex items-center gap-2 w-full">
          <ActionButton
            v-if="editingEntry"
            variant="danger"
            icon="delete"
            @click="handleConfirmDelete"
            >Hapus</ActionButton
          >
          <ActionButton
            v-if="editingEntry && !form.isIstirahat"
            variant="primary"
            icon="assign"
            @click="handleOpenPengganti"
            >Assign Pengganti</ActionButton
          >
          <div class="flex-1"></div>
          <ActionButton variant="neutral" @click="showFormModal = false">Batal</ActionButton>
          <ActionButton variant="primary" @click="saveJadwal">Simpan</ActionButton>
        </div>
      </template>
    </BaseModal>

    <!-- Delete Confirmation Modal -->
    <BaseModal :show="showDeleteModal" title="Konfirmasi Hapus" @close="showDeleteModal = false">
      <p class="text-[15px] text-text-primary mb-3">
        Apakah Anda yakin ingin menghapus jadwal ini?
      </p>
      <div v-if="deletingEntry" class="bg-surface-warm rounded-xs p-4 text-[15px] space-y-1">
        <p><strong>Hari:</strong> {{ HARI_LABELS[deletingEntry.hari] }}</p>
        <p v-if="deletingEntry.isIstirahat"><strong>Tipe:</strong> Jam Istirahat</p>
        <template v-else>
          <p>
            <strong>Mata Pelajaran:</strong>
            {{
              deletingEntry.mataPelajaran?.nama || getMapelNama(deletingEntry.mataPelajaranId || '')
            }}
          </p>
          <p>
            <strong>Guru:</strong>
            {{ deletingEntry.guru?.nama || getGuruNama(deletingEntry.guruId || '') }}
          </p>
        </template>
      </div>
      <template #footer>
        <ActionButton variant="neutral" @click="showDeleteModal = false">Batal</ActionButton>
        <ActionButton variant="danger" icon="delete" @click="deleteJadwal">Hapus</ActionButton>
      </template>
    </BaseModal>

    <!-- Guru Pengganti Modal -->
    <BaseModal
      :show="showPenggantiModal"
      title="Assign Guru Pengganti"
      size="lg"
      @close="showPenggantiModal = false"
    >
      <p v-if="penggantiTarget" class="text-[15px] text-text-secondary mb-4">
        {{
          penggantiTarget.mataPelajaran?.nama || getMapelNama(penggantiTarget.mataPelajaranId || '')
        }}
        — {{ HARI_LABELS[penggantiTarget.hari] }}
      </p>
      <div
        v-if="penggantiTarget?.guruPenggantiAktif"
        class="flex items-center justify-between p-4 bg-primary-50 border-2 border-primary-200 rounded-xs mb-4 text-[15px]"
      >
        <p class="text-primary-700">
          <strong>Guru Pengganti Aktif:</strong>
          {{ penggantiTarget.guruPenggantiAktif.guruPenggantiNama }}
        </p>
        <ActionButton variant="danger" icon="cancel" @click="handleRemovePengganti"
          >Hapus Pengganti</ActionButton
        >
      </div>
      <form @submit.prevent="savePengganti">
        <div class="mb-4">
          <SearchSelect
            v-model="penggantiForm.guruPenggantiId"
            label="Guru Pengganti"
            :options="guruSelectOptions"
            placeholder="Pilih Guru Pengganti"
            required
          />
        </div>
        <div class="mb-4">
          <label class="block text-[15px] font-medium text-text-primary mb-1.5">Alasan</label>
          <input
            v-model="penggantiForm.alasan"
            type="text"
            class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
            required
            placeholder="Guru utama berhalangan, sakit, dll"
          />
        </div>
        <div class="flex gap-4">
          <div class="flex-1 mb-4">
            <label class="block text-[15px] font-medium text-text-primary mb-1.5"
              >Tanggal Mulai</label
            >
            <input
              v-model="penggantiForm.tanggalMulai"
              type="date"
              class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
              required
            />
          </div>
          <div class="flex-1 mb-4">
            <label class="block text-[15px] font-medium text-text-primary mb-1.5"
              >Tanggal Selesai</label
            >
            <input
              v-model="penggantiForm.tanggalSelesai"
              type="date"
              class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
              required
            />
          </div>
        </div>
        <p v-if="penggantiError" class="text-[13px] text-danger-600 mt-1">{{ penggantiError }}</p>
      </form>
      <template #footer>
        <ActionButton variant="neutral" @click="showPenggantiModal = false">Batal</ActionButton>
        <ActionButton variant="primary" @click="savePengganti">Simpan</ActionButton>
      </template>
    </BaseModal>
  </div>
</template>
