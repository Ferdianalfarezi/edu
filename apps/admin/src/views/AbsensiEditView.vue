<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { Role } from '@edu/shared';
import { PageHeader, BaseModal, SearchSelect, ActionButton } from '@/components/ui';
import type { SelectOption } from '@/components/ui';

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

const kelasSelectOptions = computed<SelectOption[]>(() =>
  kelasList.value.map((k) => ({ value: k.id, label: k.nama })),
);

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
  } catch (err) {
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
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader title="Edit Absensi" />

    <!-- Filter Bar -->
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <div class="flex items-center gap-2">
        <label class="text-sm font-medium text-text-primary">Tanggal:</label>
        <input
          v-model="selectedTanggal"
          type="date"
          class="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 min-w-[160px]"
        />
      </div>
      <div class="flex items-center gap-2">
        <SearchSelect
          v-model="selectedKelasId"
          label="Kelas"
          :options="kelasSelectOptions"
          placeholder="Pilih Kelas"
        />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-8">
      <svg class="w-6 h-6 animate-spin text-primary-500 mx-auto" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p class="text-sm text-text-secondary mt-2">Memuat data absensi...</p>
    </div>

    <!-- Absensi Table -->
    <div
      v-else-if="absensiList.length > 0"
      class="bg-white border border-border rounded-xl overflow-hidden"
    >
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-border bg-surface-50">
            <tr>
              <th class="px-4 py-3 font-medium text-text-secondary text-xs w-[50px] text-center">
                No
              </th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                Nama Siswa
              </th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs w-[120px]">
                NISN
              </th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs w-[100px]">
                Status
              </th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs w-[150px]">
                Diinput Oleh
              </th>
              <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs w-[130px]">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr
              v-for="(item, index) in absensiList"
              :key="item.id"
              class="hover:bg-surface-50 transition-colors"
            >
              <td class="px-4 py-3 text-sm text-center">{{ index + 1 }}</td>
              <td class="px-4 py-3 text-sm text-text-primary">{{ item.siswa_nama }}</td>
              <td class="px-4 py-3 text-sm text-text-secondary">{{ item.siswa_nisn || '-' }}</td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
                  :style="{ background: STATUS_COLORS[item.status] }"
                >
                  {{ STATUS_LABELS[item.status] }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-text-secondary">{{ item.guru_nama }}</td>
              <td class="px-4 py-3">
                <div class="flex gap-1.5">
                  <ActionButton
                    v-if="canEdit"
                    variant="warning"
                    icon="edit"
                    @click="openEditModal(item)"
                    >Edit</ActionButton
                  >
                  <ActionButton variant="primary" icon="log" @click="openAuditModal(item)"
                    >Log</ActionButton
                  >
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="selectedKelasId && !loading"
      class="text-center text-text-secondary py-8 text-sm"
    >
      Belum ada data absensi untuk kelas dan tanggal yang dipilih.
    </div>
    <div v-else class="text-center text-text-secondary py-8 text-sm">
      Pilih kelas dan tanggal untuk melihat data absensi.
    </div>

    <!-- Edit Modal -->
    <BaseModal :show="showEditModal" title="Edit Status Absensi" @close="showEditModal = false">
      <p v-if="editingItem" class="text-sm text-text-secondary mb-4">
        {{ editingItem.siswa_nama }} — {{ selectedTanggal }}
      </p>

      <div class="mb-4">
        <label class="block text-sm font-medium text-text-primary mb-1.5">Status Kehadiran</label>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="status in STATUS_OPTIONS"
            :key="status"
            class="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium cursor-pointer border-2 transition-all select-none"
            :class="
              editStatus === status
                ? 'border-transparent font-semibold'
                : 'border-border hover:border-text-tertiary'
            "
            :style="editStatus === status ? { background: STATUS_COLORS[status] } : {}"
          >
            <input v-model="editStatus" type="radio" :value="status" class="sr-only" />
            {{ STATUS_LABELS[status] }}
          </label>
        </div>
      </div>

      <p v-if="editError" class="text-xs text-danger-500 mt-1">{{ editError }}</p>
      <p v-if="editSuccess" class="text-xs text-success-700 mt-1">{{ editSuccess }}</p>

      <template #footer>
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showEditModal = false"
        >
          Batal
        </button>
        <button
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="editSubmitting"
          @click="saveEdit"
        >
          {{ editSubmitting ? 'Menyimpan...' : 'Simpan' }}
        </button>
      </template>
    </BaseModal>

    <!-- Audit Log Modal -->
    <BaseModal
      :show="showAuditModal"
      title="Riwayat Perubahan"
      size="lg"
      @close="showAuditModal = false"
    >
      <p class="text-sm text-text-secondary mb-4">{{ auditSiswaName }}</p>

      <div v-if="loadingAudit" class="text-center py-4">
        <svg class="w-6 h-6 animate-spin text-primary-500 mx-auto" fill="none" viewBox="0 0 24 24">
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
      </div>

      <div v-else-if="auditLog.length > 0" class="flex flex-col gap-2">
        <div
          v-for="entry in auditLog"
          :key="entry.id"
          class="p-3 bg-surface-50 rounded-lg border-l-3 border-primary-500 mb-2"
        >
          <div class="flex items-center gap-1.5 mb-1.5 text-xs">
            <span class="font-semibold text-text-primary">{{ entry.user_nama }}</span>
            <span class="text-text-tertiary">({{ entry.role }})</span>
            <span class="ml-auto text-text-tertiary">{{ formatDateTime(entry.created_at) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span
              class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
              :style="{ background: STATUS_COLORS[entry.status_sebelum] }"
            >
              {{ STATUS_LABELS[entry.status_sebelum] || entry.status_sebelum }}
            </span>
            <span class="text-text-secondary font-semibold">→</span>
            <span
              class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
              :style="{ background: STATUS_COLORS[entry.status_sesudah] }"
            >
              {{ STATUS_LABELS[entry.status_sesudah] || entry.status_sesudah }}
            </span>
          </div>
        </div>
      </div>

      <div v-else class="text-center text-text-tertiary py-4 text-sm">
        Belum ada riwayat perubahan.
      </div>

      <template #footer>
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showAuditModal = false"
        >
          Tutup
        </button>
      </template>
    </BaseModal>
  </div>
</template>
