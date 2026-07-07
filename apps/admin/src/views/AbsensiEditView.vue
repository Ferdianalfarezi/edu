<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { Role } from '@edu/shared';

interface Kelas {
  id: string;
  nama: string;
  tingkat: number;
}

interface AbsensiItem {
  id: string;
  siswa_id: string;
  siswa_nama: string;
  siswa_nisn: string | null;
  status: 'hadir' | 'izin' | 'sakit' | 'alpa';
  guru_id: string;
  guru_nama: string;
  updated_at: string;
}

interface AuditLogEntry {
  id: string;
  absensi_id: string;
  user_id: string;
  user_nama: string;
  role: string;
  status_sebelum: string;
  status_sesudah: string;
  created_at: string;
}

const STATUS_OPTIONS = ['hadir', 'izin', 'sakit', 'alpa'] as const;
const STATUS_LABELS: Record<string, string> = {
  hadir: 'Hadir',
  izin: 'Izin',
  sakit: 'Sakit',
  alpa: 'Alpa',
};
const STATUS_COLORS: Record<string, string> = {
  hadir: '#dcfce7',
  izin: '#fef3c7',
  sakit: '#e0e7ff',
  alpa: '#fee2e2',
};

const authStore = useAuthStore();

// State
const kelasList = ref<Kelas[]>([]);
const absensiList = ref<AbsensiItem[]>([]);
const auditLog = ref<AuditLogEntry[]>([]);

const selectedKelasId = ref('');
const selectedTanggal = ref(new Date().toISOString().split('T')[0]);
const loading = ref(false);
const loadingAudit = ref(false);

// Edit modal state
const showEditModal = ref(false);
const editingItem = ref<AbsensiItem | null>(null);
const editStatus = ref<'hadir' | 'izin' | 'sakit' | 'alpa'>('hadir');
const editError = ref('');
const editSubmitting = ref(false);
const editSuccess = ref('');

// Audit log modal state
const showAuditModal = ref(false);
const auditAbsensiId = ref('');
const auditSiswaName = ref('');

// Computed
const canEdit = computed(() => {
  return authStore.hasRole(Role.GURU, Role.KEPALA_SEKOLAH);
});

// Data fetching
async function fetchKelasList() {
  try {
    const { data } = await api.get<{ data: Kelas[] }>('/kelas');
    kelasList.value = data.data;
  } catch (error) {
    console.error('Failed to fetch kelas:', error);
  }
}

async function fetchAbsensi() {
  if (!selectedKelasId.value || !selectedTanggal.value) return;

  loading.value = true;
  try {
    const { data } = await api.get<{ data: AbsensiItem[] }>('/absensi', {
      params: { kelas_id: selectedKelasId.value, tanggal: selectedTanggal.value },
    });
    absensiList.value = data.data || [];
  } catch (error) {
    console.error('Failed to fetch absensi:', error);
    absensiList.value = [];
  } finally {
    loading.value = false;
  }
}

async function fetchAuditLog(absensiId: string) {
  loadingAudit.value = true;
  try {
    const { data } = await api.get<{ data: AuditLogEntry[] }>('/absensi/audit-log', {
      params: { absensi_id: absensiId },
    });
    auditLog.value = data.data || [];
  } catch (error) {
    console.error('Failed to fetch audit log:', error);
    auditLog.value = [];
  } finally {
    loadingAudit.value = false;
  }
}

// Edit actions
function openEditModal(item: AbsensiItem) {
  if (!canEdit.value) return;
  editingItem.value = item;
  editStatus.value = item.status;
  editError.value = '';
  editSuccess.value = '';
  showEditModal.value = true;
}

async function saveEdit() {
  if (!editingItem.value) return;
  if (editStatus.value === editingItem.value.status) {
    editError.value = 'Status tidak berubah.';
    return;
  }

  editSubmitting.value = true;
  editError.value = '';

  try {
    await api.patch(`/absensi/${editingItem.value.id}`, {
      status: editStatus.value,
    });
    editSuccess.value = 'Status berhasil diubah.';
    // Update local list
    const idx = absensiList.value.findIndex((a) => a.id === editingItem.value!.id);
    if (idx !== -1) {
      absensiList.value[idx].status = editStatus.value;
    }
    setTimeout(() => {
      showEditModal.value = false;
    }, 1000);
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } };
    editError.value = error.response?.data?.message || 'Gagal menyimpan perubahan.';
  } finally {
    editSubmitting.value = false;
  }
}

// Audit log actions
function openAuditModal(item: AbsensiItem) {
  auditAbsensiId.value = item.id;
  auditSiswaName.value = item.siswa_nama;
  auditLog.value = [];
  showAuditModal.value = true;
  fetchAuditLog(item.id);
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Watchers
watch([selectedKelasId, selectedTanggal], () => {
  if (selectedKelasId.value && selectedTanggal.value) {
    fetchAbsensi();
  }
});

// Init
onMounted(() => {
  fetchKelasList();
});
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Edit Absensi</h1>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar">
      <div class="form-group-inline">
        <label>Tanggal:</label>
        <input v-model="selectedTanggal" type="date" class="input date-input" />
      </div>
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

    <!-- Loading -->
    <div v-if="loading" class="loading">Memuat data absensi...</div>

    <!-- Absensi Table -->
    <div v-else-if="absensiList.length > 0" class="table-container">
      <table class="absensi-table">
        <thead>
          <tr>
            <th class="col-no">No</th>
            <th class="col-nama">Nama Siswa</th>
            <th class="col-nisn">NISN</th>
            <th class="col-status">Status</th>
            <th class="col-guru">Diinput Oleh</th>
            <th class="col-actions">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in absensiList" :key="item.id">
            <td class="col-no">{{ index + 1 }}</td>
            <td class="col-nama">{{ item.siswa_nama }}</td>
            <td class="col-nisn">{{ item.siswa_nisn || '-' }}</td>
            <td class="col-status">
              <span class="status-badge" :style="{ background: STATUS_COLORS[item.status] }">
                {{ STATUS_LABELS[item.status] }}
              </span>
            </td>
            <td class="col-guru">{{ item.guru_nama }}</td>
            <td class="col-actions">
              <button v-if="canEdit" class="btn btn-sm btn-edit" @click="openEditModal(item)">
                Edit
              </button>
              <button class="btn btn-sm btn-audit" @click="openAuditModal(item)">Log</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Empty state -->
    <div v-else-if="selectedKelasId && !loading" class="empty-state">
      Belum ada data absensi untuk kelas dan tanggal yang dipilih.
    </div>
    <div v-else class="empty-state">Pilih kelas dan tanggal untuk melihat data absensi.</div>

    <!-- Edit Modal -->
    <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
      <div class="modal">
        <h2>Edit Status Absensi</h2>
        <p class="modal-subtitle" v-if="editingItem">
          {{ editingItem.siswa_nama }} — {{ selectedTanggal }}
        </p>

        <div class="form-group">
          <label>Status Kehadiran</label>
          <div class="status-group-vertical">
            <label
              v-for="status in STATUS_OPTIONS"
              :key="status"
              class="status-option"
              :class="{ 'status-selected': editStatus === status }"
              :style="editStatus === status ? { background: STATUS_COLORS[status] } : {}"
            >
              <input type="radio" :value="status" v-model="editStatus" class="sr-only" />
              {{ STATUS_LABELS[status] }}
            </label>
          </div>
        </div>

        <p v-if="editError" class="error-text">{{ editError }}</p>
        <p v-if="editSuccess" class="success-text">{{ editSuccess }}</p>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showEditModal = false">Batal</button>
          <button class="btn btn-primary" :disabled="editSubmitting" @click="saveEdit">
            {{ editSubmitting ? 'Menyimpan...' : 'Simpan' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Audit Log Modal -->
    <div v-if="showAuditModal" class="modal-overlay" @click.self="showAuditModal = false">
      <div class="modal modal-wide">
        <h2>Riwayat Perubahan</h2>
        <p class="modal-subtitle">{{ auditSiswaName }}</p>

        <div v-if="loadingAudit" class="loading">Memuat audit log...</div>

        <div v-else-if="auditLog.length > 0" class="audit-list">
          <div v-for="entry in auditLog" :key="entry.id" class="audit-entry">
            <div class="audit-header">
              <span class="audit-user">{{ entry.user_nama }}</span>
              <span class="audit-role">({{ entry.role }})</span>
              <span class="audit-time">{{ formatDateTime(entry.created_at) }}</span>
            </div>
            <div class="audit-change">
              <span
                class="status-badge status-badge-sm"
                :style="{ background: STATUS_COLORS[entry.status_sebelum] }"
              >
                {{ STATUS_LABELS[entry.status_sebelum] || entry.status_sebelum }}
              </span>
              <span class="audit-arrow">→</span>
              <span
                class="status-badge status-badge-sm"
                :style="{ background: STATUS_COLORS[entry.status_sesudah] }"
              >
                {{ STATUS_LABELS[entry.status_sesudah] || entry.status_sesudah }}
              </span>
            </div>
          </div>
        </div>

        <div v-else class="empty-state-sm">Belum ada riwayat perubahan.</div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showAuditModal = false">Tutup</button>
        </div>
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
  gap: 1.5rem;
  margin-bottom: 1.5rem;
  align-items: center;
  flex-wrap: wrap;
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
.input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}
.select-input {
  min-width: 200px;
}
.date-input {
  min-width: 160px;
}

/* Table */
.table-container {
  overflow-x: auto;
}
.absensi-table {
  width: 100%;
  border-collapse: collapse;
}
.absensi-table th,
.absensi-table td {
  padding: 0.625rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
}
.absensi-table th {
  background: #f9fafb;
  font-weight: 600;
  font-size: 0.8125rem;
  color: #374151;
}
.col-no {
  width: 50px;
  text-align: center;
}
.col-nisn {
  width: 120px;
}
.col-status {
  width: 100px;
}
.col-guru {
  width: 150px;
}
.col-actions {
  width: 130px;
}

/* Status badge */
.status-badge {
  display: inline-block;
  padding: 0.25rem 0.6rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}
.status-badge-sm {
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
}

/* Buttons */
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  font-weight: 500;
}
.btn-sm {
  padding: 0.3rem 0.6rem;
  font-size: 0.75rem;
}
.btn-primary {
  background: #2563eb;
  color: white;
}
.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
}
.btn-primary:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}
.btn-secondary {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
}
.btn-edit {
  background: #fef3c7;
  color: #92400e;
}
.btn-edit:hover {
  background: #fde68a;
}
.btn-audit {
  background: #e0e7ff;
  color: #3730a3;
}
.btn-audit:hover {
  background: #c7d2fe;
}

/* Modal */
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
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
}
.modal-wide {
  max-width: 600px;
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
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}
.form-group {
  margin-bottom: 1rem;
}
.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

/* Status options in edit modal */
.status-group-vertical {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.status-option {
  display: inline-flex;
  align-items: center;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: 2px solid #e5e7eb;
  transition: all 0.15s;
  user-select: none;
}
.status-option:hover {
  border-color: #9ca3af;
}
.status-selected {
  border-color: transparent;
  font-weight: 600;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* Audit log */
.audit-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.audit-entry {
  padding: 0.75rem;
  background: #f9fafb;
  border-radius: 6px;
  border-left: 3px solid #6366f1;
}
.audit-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.4rem;
  font-size: 0.8125rem;
}
.audit-user {
  font-weight: 600;
  color: #1f2937;
}
.audit-role {
  color: #6b7280;
}
.audit-time {
  margin-left: auto;
  color: #9ca3af;
  font-size: 0.75rem;
}
.audit-change {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.audit-arrow {
  color: #6b7280;
  font-weight: 600;
}

.error-text {
  color: #dc2626;
  font-size: 0.875rem;
}
.success-text {
  color: #16a34a;
  font-size: 0.875rem;
}
.loading {
  text-align: center;
  padding: 2rem;
  color: #6b7280;
}
.empty-state {
  text-align: center;
  color: #6b7280;
  padding: 2rem;
}
.empty-state-sm {
  text-align: center;
  color: #9ca3af;
  padding: 1rem;
  font-size: 0.875rem;
}
</style>
