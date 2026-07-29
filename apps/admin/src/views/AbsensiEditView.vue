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
  siswaId: string;
  siswaNama: string;
  siswaNisn: string | null;
  status: 'hadir' | 'izin' | 'sakit' | 'alpa';
  guruId: string;
  guruNama: string;
  updatedAt: string;
}

interface AuditLogEntry {
  id: string;
  absensiId: string;
  userId: string;
  userNama: string;
  role: string;
  statusSebelum: string;
  statusSesudah: string;
  createdAt: string;
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
      params: { kelasId: selectedKelasId.value, tanggal: selectedTanggal.value },
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
      params: { absensiId: absensiId },
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
  auditSiswaName.value = item.siswaNama;
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
  <div class="p-8 max-w-7xl mx-auto">
    <PageHeader title="Edit Absensi" />

    <!-- Filter Bar -->
    <div class="flex flex-wrap items-center gap-4 mb-6">
      <div class="flex items-center gap-2">
        <label class="text-[15px] font-semibold text-stone-700">Tanggal:</label>
        <input
          v-model="selectedTanggal"
          type="date"
          class="px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 min-w-[160px]"
        />
      </div>
      <div class="flex items-center gap-2">
        <label class="text-[15px] font-semibold text-stone-700">Kelas:</label>
        <SearchSelect
          v-model="selectedKelasId"
          :options="kelasSelectOptions"
          placeholder="Pilih Kelas"
          class="min-w-[200px] max-w-xs"
        />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12">
      <svg class="w-7 h-7 animate-spin text-primary-500 mx-auto" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p class="text-[15px] text-text-secondary mt-3">Memuat data absensi...</p>
    </div>

    <!-- Absensi Table Card -->
    <div
      v-else-if="absensiList.length > 0"
      class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden"
    >
      <!-- Section Header -->
      <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
        <h3 class="text-[16px] font-bold text-primary-800">Data Absensi</h3>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b-2 border-stone-200">
            <tr>
              <th
                class="px-5 py-4 font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm w-[50px] text-center"
              >
                No
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Nama Siswa
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm w-[120px]"
              >
                NISN
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm w-[100px]"
              >
                Status
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm w-[150px]"
              >
                Diinput Oleh
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm w-[130px]"
              >
                Aksi
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-200">
            <tr
              v-for="(item, index) in absensiList"
              :key="item.id"
              class="hover:bg-primary-50 transition-colors"
            >
              <td class="px-5 py-4 text-[15px] text-center text-stone-600">{{ index + 1 }}</td>
              <td class="px-5 py-4 text-[15px] text-stone-800 font-medium">
                {{ item.siswaNama }}
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-500">{{ item.siswaNisn || '-' }}</td>
              <td class="px-5 py-4">
                <span
                  class="inline-flex items-center px-2.5 py-1 rounded-xs text-[13px] font-semibold"
                  :style="{ background: STATUS_COLORS[item.status] }"
                >
                  {{ STATUS_LABELS[item.status] }}
                </span>
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-500">{{ item.guruNama }}</td>
              <td class="px-5 py-4">
                <div class="flex gap-2">
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
      class="text-center text-text-secondary py-12 text-[15px]"
    >
      Belum ada data absensi untuk kelas dan tanggal yang dipilih.
    </div>
    <div v-else class="text-center text-text-secondary py-12 text-[15px]">
      Pilih kelas dan tanggal untuk melihat data absensi.
    </div>

    <!-- Edit Modal -->
    <BaseModal :show="showEditModal" title="Edit Status Absensi" @close="showEditModal = false">
      <p v-if="editingItem" class="text-[15px] text-stone-500 mb-5">
        {{ editingItem.siswaNama }} — {{ selectedTanggal }}
      </p>

      <div class="mb-5">
        <label class="block text-[15px] font-semibold text-stone-700 mb-2">Status Kehadiran</label>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="status in STATUS_OPTIONS"
            :key="status"
            class="inline-flex items-center px-4 py-2.5 rounded-xs text-[15px] font-semibold cursor-pointer border-2 transition-all select-none"
            :class="
              editStatus === status
                ? 'border-transparent font-bold'
                : 'border-stone-200 hover:border-stone-400'
            "
            :style="editStatus === status ? { background: STATUS_COLORS[status] } : {}"
          >
            <input v-model="editStatus" type="radio" :value="status" class="sr-only" />
            {{ STATUS_LABELS[status] }}
          </label>
        </div>
      </div>

      <p v-if="editError" class="text-[13px] text-danger-500 mt-1">{{ editError }}</p>
      <p v-if="editSuccess" class="text-[13px] text-success-700 mt-1">{{ editSuccess }}</p>

      <template #footer>
        <ActionButton variant="neutral" @click="showEditModal = false"> Batal </ActionButton>
        <ActionButton variant="primary" icon="check" :disabled="editSubmitting" @click="saveEdit">
          {{ editSubmitting ? 'Menyimpan...' : 'Simpan' }}
        </ActionButton>
      </template>
    </BaseModal>

    <!-- Audit Log Modal -->
    <BaseModal
      :show="showAuditModal"
      title="Riwayat Perubahan"
      size="lg"
      @close="showAuditModal = false"
    >
      <p class="text-[15px] text-stone-500 mb-5">{{ auditSiswaName }}</p>

      <div v-if="loadingAudit" class="text-center py-6">
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
      </div>

      <div v-else-if="auditLog.length > 0" class="flex flex-col gap-3">
        <div
          v-for="entry in auditLog"
          :key="entry.id"
          class="p-4 bg-surface-warm rounded-xs border-l-4 border-primary-500 mb-2"
        >
          <div class="flex items-center gap-2 mb-2 text-[13px]">
            <span class="font-bold text-stone-800">{{ entry.userNama }}</span>
            <span class="text-stone-400">({{ entry.role }})</span>
            <span class="ml-auto text-stone-400">{{ formatDateTime(entry.createdAt) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span
              class="inline-flex items-center px-2.5 py-1 rounded-xs text-[13px] font-semibold"
              :style="{ background: STATUS_COLORS[entry.statusSebelum] }"
            >
              {{ STATUS_LABELS[entry.statusSebelum] || entry.statusSebelum }}
            </span>
            <span class="text-stone-400 font-bold">→</span>
            <span
              class="inline-flex items-center px-2.5 py-1 rounded-xs text-[13px] font-semibold"
              :style="{ background: STATUS_COLORS[entry.statusSesudah] }"
            >
              {{ STATUS_LABELS[entry.statusSesudah] || entry.statusSesudah }}
            </span>
          </div>
        </div>
      </div>

      <div v-else class="text-center text-stone-400 py-6 text-[15px]">
        Belum ada riwayat perubahan.
      </div>

      <template #footer>
        <ActionButton variant="neutral" @click="showAuditModal = false"> Tutup </ActionButton>
      </template>
    </BaseModal>
  </div>
</template>
