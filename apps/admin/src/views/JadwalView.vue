<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api/client';

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
    const { data } = await api.get<{ data: JadwalEntry[] }>('/jadwal', {
      params: { kelas_id: selectedKelasId.value },
    });
    jadwalEntries.value = data.data;
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
    kelas_id: selectedKelasId.value,
    mata_pelajaran_id: form.value.mata_pelajaran_id,
    guru_id: form.value.guru_id,
    hari: selectedHari.value,
    jam_mulai: form.value.jam_mulai,
    jam_selesai: form.value.jam_selesai,
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
    await api.post(`/jadwal/${penggantiTarget.value.id}/guru-pengganti`, {
      guru_pengganti_id: penggantiForm.value.guru_pengganti_id,
      alasan: penggantiForm.value.alasan,
      tanggal_mulai: penggantiForm.value.tanggal_mulai,
      tanggal_selesai: penggantiForm.value.tanggal_selesai,
    });
    showPenggantiModal.value = false;
    await fetchJadwal();
  } catch (error: any) {
    penggantiError.value = error.response?.data?.message || 'Gagal menyimpan guru pengganti.';
  }
}

async function removePengganti(entry: JadwalEntry) {
  try {
    await api.delete(`/jadwal/${entry.id}/guru-pengganti`);
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
  <div class="page">
    <div class="page-header">
      <h1>Manajemen Jadwal Pelajaran</h1>
    </div>

    <!-- Kelas Selector -->
    <div class="filter-bar">
      <div class="form-group-inline">
        <label>Kelas:</label>
        <select v-model="selectedKelasId" class="input select-input">
          <option value="" disabled>Pilih Kelas</option>
          <option v-for="kelas in kelasList" :key="kelas.id" :value="kelas.id">
            {{ kelas.nama }}
          </option>
        </select>
      </div>
    </div>

    <!-- Schedule Grid -->
    <div class="table-container" v-if="selectedKelasId">
      <p v-if="loading" class="empty-state">Memuat jadwal...</p>
      <table v-else class="schedule-grid">
        <thead>
          <tr>
            <th class="jam-col">Jam Ke</th>
            <th v-for="hari in HARI_LIST" :key="hari">{{ HARI_LABELS[hari] }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="jam in JAM_KE_LIST" :key="jam">
            <td class="jam-col">{{ jam }}</td>
            <td
              v-for="hari in HARI_LIST"
              :key="`${jam}-${hari}`"
              :class="[
                'schedule-cell',
                { 'cell-vacant': isVacant(gridData[jam][hari]) },
                { 'cell-pengganti': hasPengganti(gridData[jam][hari]) },
              ]"
              @click="handleCellClick(jam, hari)"
            >
              <template v-if="gridData[jam][hari]">
                <div class="cell-mapel">{{ getCellMapel(gridData[jam][hari]) }}</div>
                <div class="cell-guru">{{ getCellGuru(gridData[jam][hari]) }}</div>
                <div v-if="hasPengganti(gridData[jam][hari])" class="cell-pengganti-badge">
                  🔄 {{ getCellPenggantiNama(gridData[jam][hari]) }}
                </div>
              </template>
              <template v-else>
                <div class="cell-vacant-label">Kosong</div>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="empty-state">Pilih kelas untuk melihat jadwal.</p>

    <!-- Create/Edit Jadwal Modal -->
    <div v-if="showFormModal" class="modal-overlay" @click.self="showFormModal = false">
      <div class="modal">
        <h2>{{ editingEntry ? 'Edit Jadwal' : 'Tambah Jadwal' }}</h2>
        <p class="modal-subtitle">{{ HARI_LABELS[selectedHari] }} — Jam ke-{{ selectedJamKe }}</p>
        <form @submit.prevent="saveJadwal">
          <div class="form-group">
            <label>Mata Pelajaran</label>
            <select v-model="form.mata_pelajaran_id" class="input" required>
              <option value="" disabled>Pilih Mata Pelajaran</option>
              <option v-for="mapel in mataPelajaranList" :key="mapel.id" :value="mapel.id">
                {{ mapel.nama }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Guru</label>
            <select v-model="form.guru_id" class="input" required>
              <option value="" disabled>Pilih Guru</option>
              <option v-for="guru in guruList" :key="guru.id" :value="guru.id">
                {{ guru.nama }}
              </option>
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Jam Mulai</label>
              <input v-model="form.jam_mulai" type="time" class="input" required />
            </div>
            <div class="form-group">
              <label>Jam Selesai</label>
              <input v-model="form.jam_selesai" type="time" class="input" required />
            </div>
          </div>
          <p v-if="formError" class="error-text">{{ formError }}</p>
          <div class="modal-actions">
            <button
              v-if="editingEntry"
              type="button"
              class="btn btn-danger"
              @click="handleConfirmDelete"
            >
              Hapus
            </button>
            <button
              v-if="editingEntry"
              type="button"
              class="btn btn-info"
              @click="handleOpenPengganti"
            >
              Assign Pengganti
            </button>
            <div class="spacer"></div>
            <button type="button" class="btn btn-secondary" @click="showFormModal = false">
              Batal
            </button>
            <button type="submit" class="btn btn-primary">Simpan</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
      <div class="modal">
        <h2>Konfirmasi Hapus</h2>
        <p>Apakah Anda yakin ingin menghapus jadwal ini?</p>
        <div v-if="deletingEntry" class="delete-info">
          <p><strong>Hari:</strong> {{ HARI_LABELS[deletingEntry.hari] }}</p>
          <p>
            <strong>Mata Pelajaran:</strong>
            {{
              deletingEntry.mata_pelajaran?.nama || getMapelNama(deletingEntry.mata_pelajaran_id)
            }}
          </p>
          <p>
            <strong>Guru:</strong>
            {{ deletingEntry.guru?.nama || getGuruNama(deletingEntry.guru_id) }}
          </p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showDeleteModal = false">Batal</button>
          <button class="btn btn-danger" @click="deleteJadwal">Hapus</button>
        </div>
      </div>
    </div>

    <!-- Guru Pengganti Modal -->
    <div v-if="showPenggantiModal" class="modal-overlay" @click.self="showPenggantiModal = false">
      <div class="modal">
        <h2>Assign Guru Pengganti</h2>
        <p class="modal-subtitle" v-if="penggantiTarget">
          {{
            penggantiTarget.mata_pelajaran?.nama || getMapelNama(penggantiTarget.mata_pelajaran_id)
          }}
          — {{ HARI_LABELS[penggantiTarget.hari] }}
        </p>

        <!-- Show current pengganti if exists -->
        <div v-if="penggantiTarget?.guru_pengganti_aktif" class="current-pengganti">
          <p>
            <strong>Guru Pengganti Aktif:</strong>
            {{ penggantiTarget.guru_pengganti_aktif.guru_pengganti_nama }}
          </p>
          <button class="btn btn-sm btn-danger" @click="handleRemovePengganti">
            Hapus Pengganti
          </button>
        </div>

        <form @submit.prevent="savePengganti">
          <div class="form-group">
            <label>Guru Pengganti</label>
            <select v-model="penggantiForm.guru_pengganti_id" class="input" required>
              <option value="" disabled>Pilih Guru Pengganti</option>
              <option v-for="guru in guruList" :key="guru.id" :value="guru.id">
                {{ guru.nama }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Alasan</label>
            <input
              v-model="penggantiForm.alasan"
              type="text"
              class="input"
              required
              placeholder="Guru utama berhalangan, sakit, dll"
            />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Tanggal Mulai</label>
              <input v-model="penggantiForm.tanggal_mulai" type="date" class="input" required />
            </div>
            <div class="form-group">
              <label>Tanggal Selesai</label>
              <input v-model="penggantiForm.tanggal_selesai" type="date" class="input" required />
            </div>
          </div>
          <p v-if="penggantiError" class="error-text">{{ penggantiError }}</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="showPenggantiModal = false">
              Batal
            </button>
            <button type="submit" class="btn btn-primary">Simpan</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: 2rem;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}
.page-header h1 {
  margin: 0;
  font-size: 1.5rem;
}
.filter-bar {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  align-items: center;
}
.form-group-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.form-group-inline label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}
.select-input {
  min-width: 200px;
}
.table-container {
  overflow-x: auto;
}
.schedule-grid {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.schedule-grid th,
.schedule-grid td {
  padding: 0.5rem;
  text-align: center;
  border: 1px solid #e5e7eb;
  vertical-align: top;
}
.schedule-grid th {
  font-weight: 600;
  color: #374151;
  background: #f9fafb;
  font-size: 0.875rem;
}
.jam-col {
  width: 60px;
  font-weight: 600;
  background: #f9fafb;
}
.schedule-cell {
  cursor: pointer;
  min-height: 60px;
  transition: background-color 0.15s;
  font-size: 0.75rem;
}
.schedule-cell:hover {
  background: #eff6ff;
}
.cell-vacant {
  background: #fef9c3;
}
.cell-vacant:hover {
  background: #fef08a;
}
.cell-pengganti {
  background: #dbeafe;
}
.cell-pengganti:hover {
  background: #bfdbfe;
}
.cell-mapel {
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 2px;
}
.cell-guru {
  color: #6b7280;
  font-size: 0.7rem;
}
.cell-pengganti-badge {
  margin-top: 4px;
  font-size: 0.65rem;
  color: #1d4ed8;
  font-weight: 500;
}
.cell-vacant-label {
  color: #92400e;
  font-weight: 500;
  font-style: italic;
}
.empty-state {
  text-align: center;
  color: #6b7280;
  padding: 2rem;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.modal {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
}
.modal h2 {
  margin: 0 0 0.25rem;
  font-size: 1.25rem;
}
.modal-subtitle {
  margin: 0 0 1rem;
  font-size: 0.875rem;
  color: #6b7280;
}
.form-group {
  margin-bottom: 1rem;
}
.form-group label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}
.form-row {
  display: flex;
  gap: 1rem;
}
.form-row .form-group {
  flex: 1;
}
.input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}
.modal-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1.5rem;
  flex-wrap: wrap;
}
.spacer {
  flex: 1;
}
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  font-weight: 500;
}
.btn-primary {
  background: #2563eb;
  color: white;
}
.btn-primary:hover {
  background: #1d4ed8;
}
.btn-secondary {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
}
.btn-danger {
  background: #ef4444;
  color: white;
}
.btn-danger:hover {
  background: #dc2626;
}
.btn-info {
  background: #3b82f6;
  color: white;
}
.btn-info:hover {
  background: #2563eb;
}
.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}
.error-text {
  color: #dc2626;
  font-size: 0.875rem;
  margin-top: 0.5rem;
}
.delete-info {
  background: #f9fafb;
  border-radius: 6px;
  padding: 0.75rem;
  margin: 0.75rem 0;
  font-size: 0.875rem;
}
.delete-info p {
  margin: 0.25rem 0;
}
.current-pengganti {
  background: #dbeafe;
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.875rem;
}
.current-pengganti p {
  margin: 0;
}
</style>
