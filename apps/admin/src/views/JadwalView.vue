<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api/client';
import { PageHeader, BaseModal } from '@/components/ui';

// Types
interface Kelas {
  id: string;
  nama: string;
  tingkat: number;
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
  mata_pelajaran_id: string;
  guru_id: string;
  hari: string;
  jam_ke?: number;
  jam_mulai: string;
  jam_selesai: string;
  is_vacant: boolean;
  mata_pelajaran?: MataPelajaran;
  guru?: Guru;
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
  const timeMap: Record<string, number> = {
    '07:00': 1,
    '07:40': 2,
    '08:20': 3,
    '09:00': 4,
    '09:40': 5,
    '10:20': 6,
    '11:00': 7,
    '11:40': 8,
    '12:20': 9,
    '13:00': 10,
  };
  return timeMap[jamMulai] || 0;
}

// Data fetching
async function fetchKelasList() {
  try {
    const { data } = await api.get<{ data: Kelas[] }>('/kelas');
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
    const [mapelRes, guruRes] = await Promise.all([
      api.get<{ data: MataPelajaran[] }>('/mata-pelajaran'),
      api.get<{ data: Guru[] }>('/users', { params: { role: 'guru' } }),
    ]);
    mataPelajaranList.value = mapelRes.data.data;
    guruList.value = guruRes.data.data;
  } catch (error) {
    console.error('Failed to fetch dropdowns:', error);
  }
}

async function fetchJadwal() {
  if (!selectedKelasId.value) return;
  loading.value = true;
  try {
    const { data } = await api.get<JadwalEntry[]>('/jadwal', {
      params: { kelasId: selectedKelasId.value },
    });
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

// Cell click handler (avoids non-null assertion in template)
function handleCellClick(jam: number, hari: string) {
  const entry = gridData.value[jam][hari];
  if (entry) {
    openEditForm(entry, hari, jam);
  } else {
    openCreateForm(hari, jam);
  }
}

// Cell display helpers (avoids non-null assertion in template)
function getCellMapel(entry: JadwalEntry | null): string {
  if (!entry) return '';
  return entry.mata_pelajaran?.nama || getMapelNama(entry.mata_pelajaran_id);
}

function getCellGuru(entry: JadwalEntry | null): string {
  if (!entry) return '';
  return entry.guru?.nama || getGuruNama(entry.guru_id);
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
  return !entry || entry.is_vacant || !entry.guru_id;
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
  };
  formError.value = '';
  showFormModal.value = true;
}

function openEditForm(entry: JadwalEntry, hari: string, jamKe: number) {
  editingEntry.value = entry;
  selectedHari.value = hari;
  selectedJamKe.value = jamKe;
  form.value = {
    mata_pelajaran_id: entry.mata_pelajaran_id,
    guru_id: entry.guru_id,
    jam_mulai: entry.jam_mulai,
    jam_selesai: entry.jam_selesai,
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
  if (!form.value.mata_pelajaran_id || !form.value.guru_id) {
    formError.value = 'Mata pelajaran dan guru wajib dipilih.';
    return;
  }

  const payload = {
    kelasId: selectedKelasId.value,
    mataPelajaranId: form.value.mata_pelajaran_id,
    guruId: form.value.guru_id,
    hari: selectedHari.value,
    jamMulai: form.value.jam_mulai,
    jamSelesai: form.value.jam_selesai,
  };

  try {
    if (editingEntry.value) {
      await api.patch(`/jadwal/${editingEntry.value.id}`, payload);
    } else {
      await api.post('/jadwal', payload);
    }
    showFormModal.value = false;
    await fetchJadwal();
  } catch (error: any) {
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
  } catch (error: any) {
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
  await Promise.all([fetchKelasList(), fetchDropdowns()]);
});
</script>

<template>
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader title="Manajemen Jadwal Pelajaran" />

    <!-- Kelas Selector -->
    <div class="flex items-center gap-3 mb-4">
      <label class="text-sm font-medium text-text-primary">Kelas:</label>
      <select
        v-model="selectedKelasId"
        class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 max-w-xs"
      >
        <option value="" disabled>Pilih Kelas</option>
        <option v-for="kelas in kelasList" :key="kelas.id" :value="kelas.id">
          {{ kelas.nama }}
        </option>
      </select>
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
                  isVacant(gridData[jam][hari]) && gridData[jam][hari] === null ? '' : '',
                  isVacant(gridData[jam][hari]) && gridData[jam][hari] !== null
                    ? 'bg-warning-50'
                    : '',
                  hasPengganti(gridData[jam][hari]) ? 'bg-primary-50' : '',
                ]"
                @click="handleCellClick(jam, hari)"
              >
                <template v-if="gridData[jam][hari]">
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
      @close="showFormModal = false"
      size="lg"
    >
      <p class="text-sm text-text-secondary mb-4">
        {{ HARI_LABELS[selectedHari] }} — Jam ke-{{ selectedJamKe }}
      </p>
      <form @submit.prevent="saveJadwal">
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5">Mata Pelajaran</label>
          <select
            v-model="form.mata_pelajaran_id"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            required
          >
            <option value="" disabled>Pilih Mata Pelajaran</option>
            <option v-for="mapel in mataPelajaranList" :key="mapel.id" :value="mapel.id">
              {{ mapel.nama }}
            </option>
          </select>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5">Guru</label>
          <select
            v-model="form.guru_id"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            required
          >
            <option value="" disabled>Pilih Guru</option>
            <option v-for="guru in guruList" :key="guru.id" :value="guru.id">
              {{ guru.nama }}
            </option>
          </select>
        </div>
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
          <button
            v-if="editingEntry"
            type="button"
            class="px-4 py-2 text-sm font-medium text-white bg-danger-500 rounded-lg hover:bg-danger-700 transition-colors"
            @click="handleConfirmDelete"
          >
            Hapus
          </button>
          <button
            v-if="editingEntry"
            type="button"
            class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
            @click="handleOpenPengganti"
          >
            Assign Pengganti
          </button>
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
        <p>
          <strong>Mata Pelajaran:</strong>
          {{ deletingEntry.mata_pelajaran?.nama || getMapelNama(deletingEntry.mata_pelajaran_id) }}
        </p>
        <p>
          <strong>Guru:</strong>
          {{ deletingEntry.guru?.nama || getGuruNama(deletingEntry.guru_id) }}
        </p>
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
      @close="showPenggantiModal = false"
      size="lg"
    >
      <p class="text-sm text-text-secondary mb-4" v-if="penggantiTarget">
        {{
          penggantiTarget.mata_pelajaran?.nama || getMapelNama(penggantiTarget.mata_pelajaran_id)
        }}
        — {{ HARI_LABELS[penggantiTarget.hari] }}
      </p>

      <!-- Show current pengganti if exists -->
      <div
        v-if="penggantiTarget?.guru_pengganti_aktif"
        class="flex items-center justify-between p-3 bg-primary-50 border border-primary-500/20 rounded-lg mb-4 text-sm"
      >
        <p class="text-primary-700">
          <strong>Guru Pengganti Aktif:</strong>
          {{ penggantiTarget.guru_pengganti_aktif.guru_pengganti_nama }}
        </p>
        <button
          class="px-2 py-1 text-xs font-medium text-danger-700 bg-danger-50 rounded-md hover:bg-danger-50/80 transition-colors"
          @click="handleRemovePengganti"
        >
          Hapus Pengganti
        </button>
      </div>

      <form @submit.prevent="savePengganti">
        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5">Guru Pengganti</label>
          <select
            v-model="penggantiForm.guru_pengganti_id"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            required
          >
            <option value="" disabled>Pilih Guru Pengganti</option>
            <option v-for="guru in guruList" :key="guru.id" :value="guru.id">
              {{ guru.nama }}
            </option>
          </select>
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
