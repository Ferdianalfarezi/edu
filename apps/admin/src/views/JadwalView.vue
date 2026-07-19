<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api/client';
import { PageHeader, BaseModal, SearchSelect, ActionButton } from '@/components/ui';
import type { SelectOption } from '@/components/ui';

// Types
interface Kelas {
  id: string;
  nama: string;
  tingkat: number;
  tahun_ajaran_id?: string;
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
  kelas_id: string;
  mata_pelajaran_id: string | null;
  guru_id: string | null;
  hari: string;
  jam_ke?: number;
  jam_mulai: string;
  jam_selesai: string;
  is_vacant: boolean;
  is_istirahat: boolean;
  mata_pelajaran?: MataPelajaran | null;
  guru?: Guru | null;
  guru_pengganti_aktif?: GuruPenggantiInfo | null;
}

interface GuruPenggantiInfo {
  id: string;
  guru_pengganti_id: string;
  guru_pengganti_nama: string;
  tanggal: string;
}

interface JadwalForm {
  mata_pelajaran_id: string;
  guru_id: string;
  jam_mulai: string;
  jam_selesai: string;
  is_istirahat: boolean;
}

interface GuruPenggantiForm {
  guru_pengganti_id: string;
  alasan: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
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
const tahunAjaranList = ref<{ id: string; nama: string; status: string }[]>([]);
const selectedTahunAjaranId = ref('');

const selectedKelasId = ref('');
const loading = ref(false);

// Modal state - CRUD
const showFormModal = ref(false);
const editingEntry = ref<JadwalEntry | null>(null);
const selectedHari = ref('');
const selectedJamKe = ref(0);
const form = ref<JadwalForm>({
  mata_pelajaran_id: '',
  guru_id: '',
  jam_mulai: '',
  jam_selesai: '',
  is_istirahat: false,
});
const formError = ref('');

// Modal state - Guru Pengganti
const showPenggantiModal = ref(false);
const penggantiTarget = ref<JadwalEntry | null>(null);
const penggantiForm = ref<GuruPenggantiForm>({
  guru_pengganti_id: '',
  alasan: '',
  tanggal_mulai: '',
  tanggal_selesai: '',
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

// Computed: build a dynamic time→jamKe map from the actual jadwal data
const timeSlotMap = computed(() => {
  const uniqueTimes = new Set<string>();
  for (const entry of jadwalEntries.value) {
    const normalized = entry.jam_mulai?.substring(0, 5) || '';
    if (normalized) uniqueTimes.add(normalized);
  }
  const sorted = [...uniqueTimes].sort();
  const map: Record<string, number> = {};
  sorted.forEach((time, idx) => {
    map[time] = idx + 1;
  });
  return map;
});

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
    const jamKe = entry.jam_ke || deriveJamKe(entry.jam_mulai);
    if (jamKe >= 1 && jamKe <= 10) {
      grid[jamKe][entry.hari] = entry;
    }
  }

  return grid;
});

function deriveJamKe(jamMulai: string): number {
  // Handle both HH:mm and HH:mm:ss formats from the database
  const normalized = jamMulai?.substring(0, 5) || '';
  return timeSlotMap.value[normalized] || 0;
}

// Data fetching
async function fetchKelasList() {
  try {
    // Filter kelas by selected/active tahun ajaran
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
      api.get<{ id: string; nama: string; status: string }[]>('/tahun-ajaran'),
    ]);
    mataPelajaranList.value = mapelRes.data.data;
    guruList.value = guruRes.data.data;
    // Populate tahun ajaran list and auto-select active one
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
    const params: Record<string, string> = { kelasId: selectedKelasId.value };
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
  selectedKelasId.value = '';
  fetchKelasList();
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
  if (entry.is_istirahat) return 'Istirahat';
  return entry.mata_pelajaran?.nama || getMapelNama(entry.mata_pelajaran_id || '');
}

function getCellGuru(entry: JadwalEntry | null): string {
  if (!entry || entry.is_istirahat) return '';
  return entry.guru?.nama || getGuruNama(entry.guru_id || '');
}

function getCellPenggantiNama(entry: JadwalEntry | null): string {
  if (!entry?.guru_pengganti_aktif) return '';
  return entry.guru_pengganti_aktif.guru_pengganti_nama;
}

function getMapelNama(id: string): string {
  return mataPelajaranList.value.find((m) => m.id === id)?.nama || '-';
}

function getGuruNama(id: string): string {
  return guruList.value.find((g) => g.id === id)?.nama || '-';
}

function isVacant(entry: JadwalEntry | null): boolean {
  return (
    !entry || (entry.is_vacant && !entry.is_istirahat) || (!entry.guru_id && !entry.is_istirahat)
  );
}

function isIstirahat(entry: JadwalEntry | null): boolean {
  return !!entry?.is_istirahat;
}

function hasPengganti(entry: JadwalEntry | null): boolean {
  return !!entry?.guru_pengganti_aktif;
}

// CRUD actions
function openCreateForm(hari: string, jamKe: number) {
  editingEntry.value = null;
  selectedHari.value = hari;
  selectedJamKe.value = jamKe;
  form.value = {
    mata_pelajaran_id: '',
    guru_id: '',
    jam_mulai: getDefaultJamMulai(jamKe),
    jam_selesai: getDefaultJamSelesai(jamKe),
    is_istirahat: false,
  };
  formError.value = '';
  showFormModal.value = true;
}

function openEditForm(entry: JadwalEntry, hari: string, jamKe: number) {
  editingEntry.value = entry;
  selectedHari.value = hari;
  selectedJamKe.value = jamKe;
  form.value = {
    mata_pelajaran_id: entry.mata_pelajaran_id || '',
    guru_id: entry.guru_id || '',
    jam_mulai: entry.jam_mulai,
    jam_selesai: entry.jam_selesai,
    is_istirahat: entry.is_istirahat || false,
  };
  formError.value = '';
  showFormModal.value = true;
}

function getDefaultJamMulai(jamKe: number): string {
  const startHour = 7;
  const minutesPerSlot = 40;
  const totalMinutes = (jamKe - 1) * minutesPerSlot;
  const hour = startHour + Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function getDefaultJamSelesai(jamKe: number): string {
  const startHour = 7;
  const minutesPerSlot = 40;
  const totalMinutes = jamKe * minutesPerSlot;
  const hour = startHour + Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

async function saveJadwal() {
  formError.value = '';

  // Validate: if not istirahat, guru and mapel are required
  if (!form.value.is_istirahat && (!form.value.mata_pelajaran_id || !form.value.guru_id)) {
    formError.value = 'Mata pelajaran dan guru wajib dipilih untuk jam pelajaran.';
    return;
  }

  if (!selectedTahunAjaranId.value) {
    formError.value = 'Tidak ada tahun ajaran dipilih. Harap pilih tahun ajaran terlebih dahulu.';
    return;
  }

  // Determine semester based on current month (Jul-Dec = 1, Jan-Jun = 2)
  const currentMonth = new Date().getMonth() + 1;
  const semester = currentMonth >= 7 ? 1 : 2;

  // Use selected tahun ajaran from the filter
  const tahunAjaranId = selectedTahunAjaranId.value;

  const payload: Record<string, unknown> = {
    kelasId: selectedKelasId.value,
    tahunAjaranId,
    semester,
    hari: selectedHari.value,
    jamMulai: form.value.jam_mulai,
    jamSelesai: form.value.jam_selesai,
    tanggalMulaiBerlaku: '2024-07-15',
    tanggalSelesaiBerlaku: '2025-06-30',
    isIstirahat: form.value.is_istirahat,
  };

  if (!form.value.is_istirahat) {
    payload.mataPelajaranId = form.value.mata_pelajaran_id;
    payload.guruId = form.value.guru_id;
  }

  try {
    if (editingEntry.value) {
      await api.patch(`/jadwal/${editingEntry.value.id}`, payload);
    } else {
      await api.post('/jadwal', payload);
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
    guru_pengganti_id: '',
    alasan: '',
    tanggal_mulai: new Date().toISOString().split('T')[0],
    tanggal_selesai: new Date().toISOString().split('T')[0],
  };
  penggantiError.value = '';
  showPenggantiModal.value = true;
}

async function savePengganti() {
  penggantiError.value = '';
  if (!penggantiForm.value.guru_pengganti_id || !penggantiForm.value.alasan) {
    penggantiError.value = 'Guru pengganti dan alasan wajib diisi.';
    return;
  }
  if (!penggantiTarget.value) return;

  try {
    await api.post('/jadwal/guru-pengganti', {
      guruPenggantiId: penggantiForm.value.guru_pengganti_id,
      kelasId: penggantiTarget.value.kelas_id,
      mataPelajaranId: penggantiTarget.value.mata_pelajaran_id,
      tanggal: penggantiForm.value.tanggal_mulai,
    });
    showPenggantiModal.value = false;
    await fetchJadwal();
  } catch (error) {
    penggantiError.value = error.response?.data?.message || 'Gagal menyimpan guru pengganti.';
  }
}

async function removePengganti(entry: JadwalEntry) {
  try {
    const penggantiId = entry.guru_pengganti_aktif?.id;
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
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader title="Manajemen Jadwal Pelajaran" />

    <!-- Filter: Tahun Ajaran & Kelas -->
    <div class="flex items-center gap-3 mb-4">
      <SearchSelect
        v-model="selectedTahunAjaranId"
        label="Tahun Ajaran"
        :options="tahunAjaranSelectOptions"
        placeholder="Pilih Tahun Ajaran"
      />
      <SearchSelect
        v-model="selectedKelasId"
        label="Kelas"
        :options="kelasSelectOptions"
        placeholder="Pilih Kelas"
      />
    </div>

    <!-- Schedule Grid -->
    <div v-if="selectedKelasId" class="bg-white border border-border rounded-xl overflow-hidden">
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
        <p class="text-sm text-text-tertiary mt-2">Memuat jadwal...</p>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full table-fixed">
          <thead>
            <tr class="border-b border-border bg-surface-50">
              <th class="px-4 py-3 text-center font-medium text-text-secondary text-xs w-16">
                Jam Ke
              </th>
              <th
                v-for="hari in HARI_LIST"
                :key="hari"
                class="px-4 py-3 text-center font-medium text-text-secondary text-xs"
              >
                {{ HARI_LABELS[hari] }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="jam in JAM_KE_LIST" :key="jam">
              <td
                class="px-4 py-3 text-sm font-semibold text-text-primary bg-surface-50 text-center"
              >
                {{ jam }}
              </td>
              <td
                v-for="hari in HARI_LIST"
                :key="`${jam}-${hari}`"
                :class="[
                  'p-2 border border-border text-center text-xs cursor-pointer hover:bg-primary-50 transition-colors align-top min-h-[60px]',
                  isIstirahat(gridData[jam][hari]) ? 'bg-amber-50' : '',
                  isVacant(gridData[jam][hari]) && gridData[jam][hari] === null ? '' : '',
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
                    <div class="font-semibold text-amber-700">☕ Istirahat</div>
                  </template>
                  <template v-else>
                    <div class="font-semibold text-text-primary mb-0.5">
                      {{ getCellMapel(gridData[jam][hari]) }}
                    </div>
                    <div class="text-text-tertiary text-[10px]">
                      {{ getCellGuru(gridData[jam][hari]) }}
                    </div>
                    <div
                      v-if="hasPengganti(gridData[jam][hari])"
                      class="mt-1 text-[10px] text-primary-700 font-medium"
                    >
                      🔄 {{ getCellPenggantiNama(gridData[jam][hari]) }}
                    </div>
                  </template>
                </template>
                <template v-else>
                  <div class="text-warning-700 font-medium italic">Kosong</div>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div v-else class="py-12 text-center">
      <p class="text-sm text-text-tertiary">Pilih kelas untuk melihat jadwal.</p>
    </div>

    <!-- Create/Edit Jadwal Modal -->
    <BaseModal
      :show="showFormModal"
      :title="editingEntry ? 'Edit Jadwal' : 'Tambah Jadwal'"
      size="lg"
      @close="showFormModal = false"
    >
      <p class="text-sm text-text-secondary mb-4">
        {{ HARI_LABELS[selectedHari] }} — Jam ke-{{ selectedJamKe }}
      </p>
      <form @submit.prevent="saveJadwal">
        <!-- Istirahat Toggle -->
        <div class="mb-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              v-model="form.is_istirahat"
              type="checkbox"
              class="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500/20"
            />
            <span class="text-sm font-medium text-text-primary">Jam Istirahat</span>
          </label>
          <p class="text-xs text-text-tertiary mt-1">
            Centang jika slot ini adalah jam istirahat (tidak perlu guru & mata pelajaran)
          </p>
        </div>

        <!-- Mapel & Guru fields (hidden when istirahat) -->
        <template v-if="!form.is_istirahat">
          <div class="mb-4">
            <SearchSelect
              v-model="form.mata_pelajaran_id"
              label="Mata Pelajaran"
              :options="mataPelajaranSelectOptions"
              placeholder="Pilih Mata Pelajaran"
              required
            />
          </div>
          <div class="mb-4">
            <SearchSelect
              v-model="form.guru_id"
              label="Guru"
              :options="guruSelectOptions"
              placeholder="Pilih Guru"
              required
            />
          </div>
        </template>

        <div class="flex gap-4">
          <div class="flex-1 mb-4">
            <label class="block text-sm font-medium text-text-primary mb-1.5">Jam Mulai</label>
            <input
              v-model="form.jam_mulai"
              type="time"
              class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              required
            />
          </div>
          <div class="flex-1 mb-4">
            <label class="block text-sm font-medium text-text-primary mb-1.5">Jam Selesai</label>
            <input
              v-model="form.jam_selesai"
              type="time"
              class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              required
            />
          </div>
        </div>
        <p v-if="formError" class="text-xs text-danger-500 mt-1">{{ formError }}</p>
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
            v-if="editingEntry && !form.is_istirahat"
            variant="primary"
            icon="assign"
            @click="handleOpenPengganti"
            >Assign Pengganti</ActionButton
          >
          <div class="flex-1"></div>
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
            @click="saveJadwal"
          >
            Simpan
          </button>
        </div>
      </template>
    </BaseModal>

    <!-- Delete Confirmation Modal -->
    <BaseModal :show="showDeleteModal" title="Konfirmasi Hapus" @close="showDeleteModal = false">
      <p class="text-sm text-text-primary mb-3">Apakah Anda yakin ingin menghapus jadwal ini?</p>
      <div v-if="deletingEntry" class="bg-surface-50 rounded-lg p-3 text-sm space-y-1">
        <p><strong>Hari:</strong> {{ HARI_LABELS[deletingEntry.hari] }}</p>
        <p v-if="deletingEntry.is_istirahat"><strong>Tipe:</strong> Jam Istirahat</p>
        <template v-else>
          <p>
            <strong>Mata Pelajaran:</strong>
            {{
              deletingEntry.mata_pelajaran?.nama ||
              getMapelNama(deletingEntry.mata_pelajaran_id || '')
            }}
          </p>
          <p>
            <strong>Guru:</strong>
            {{ deletingEntry.guru?.nama || getGuruNama(deletingEntry.guru_id || '') }}
          </p>
        </template>
      </div>
      <template #footer>
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showDeleteModal = false"
        >
          Batal
        </button>
        <button
          class="px-4 py-2 text-sm font-medium text-white bg-danger-500 rounded-lg hover:bg-danger-700 transition-colors"
          @click="deleteJadwal"
        >
          Hapus
        </button>
      </template>
    </BaseModal>

    <!-- Guru Pengganti Modal -->
    <BaseModal
      :show="showPenggantiModal"
      title="Assign Guru Pengganti"
      size="lg"
      @close="showPenggantiModal = false"
    >
      <p v-if="penggantiTarget" class="text-sm text-text-secondary mb-4">
        {{
          penggantiTarget.mata_pelajaran?.nama ||
          getMapelNama(penggantiTarget.mata_pelajaran_id || '')
        }}
        — {{ HARI_LABELS[penggantiTarget.hari] }}
      </p>
      <div
        v-if="penggantiTarget?.guru_pengganti_aktif"
        class="flex items-center justify-between p-3 bg-primary-50 border border-primary-500/20 rounded-lg mb-4 text-sm"
      >
        <p class="text-primary-700">
          <strong>Guru Pengganti Aktif:</strong>
          {{ penggantiTarget.guru_pengganti_aktif.guru_pengganti_nama }}
        </p>
        <ActionButton variant="danger" icon="cancel" @click="handleRemovePengganti"
          >Hapus Pengganti</ActionButton
        >
      </div>
      <form @submit.prevent="savePengganti">
        <div class="mb-4">
          <SearchSelect
            v-model="penggantiForm.guru_pengganti_id"
            label="Guru Pengganti"
            :options="guruSelectOptions"
            placeholder="Pilih Guru Pengganti"
            required
          />
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5">Alasan</label>
          <input
            v-model="penggantiForm.alasan"
            type="text"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            required
            placeholder="Guru utama berhalangan, sakit, dll"
          />
        </div>
        <div class="flex gap-4">
          <div class="flex-1 mb-4">
            <label class="block text-sm font-medium text-text-primary mb-1.5">Tanggal Mulai</label>
            <input
              v-model="penggantiForm.tanggal_mulai"
              type="date"
              class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              required
            />
          </div>
          <div class="flex-1 mb-4">
            <label class="block text-sm font-medium text-text-primary mb-1.5"
              >Tanggal Selesai</label
            >
            <input
              v-model="penggantiForm.tanggal_selesai"
              type="date"
              class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              required
            />
          </div>
        </div>
        <p v-if="penggantiError" class="text-xs text-danger-500 mt-1">{{ penggantiError }}</p>
      </form>
      <template #footer>
        <button
          type="button"
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showPenggantiModal = false"
        >
          Batal
        </button>
        <button
          type="button"
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          @click="savePengganti"
        >
          Simpan
        </button>
      </template>
    </BaseModal>
  </div>
</template>
