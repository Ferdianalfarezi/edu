<script setup lang="ts">
import { ref } from 'vue';
import { api } from '@/api/client';
import { ActionButton } from '@/components/ui';

// ===== Types =====
interface PerubahanItem {
  namaField: string;
  labelField: string;
  nilaiSebelum: unknown;
  nilaiSesudah: unknown;
}

interface AuditLog {
  id: string;
  userNama: string;
  jenisAksi: string;
  aksiLabel?: string;
  perubahan?: PerubahanItem[];
  nilaiSebelum: Record<string, unknown> | null;
  nilaiSesudah: Record<string, unknown> | null;
  alasan: string | null;
  createdAt: string;
}

// ===== State =====
const auditLogs = ref<AuditLog[]>([]);
const auditTagihanId = ref('');
const auditLoading = ref(false);
const auditError = ref('');

// ===== Helpers =====
function formatAuditEntry(log: AuditLog): string {
  if (log.jenisAksi === 'CREATE') return 'Data baru dibuat';
  if (!log.perubahan?.length) return log.aksiLabel ?? log.jenisAksi;
  return log.perubahan
    .map((p) => `${p.labelField}: ${p.nilaiSebelum} → ${p.nilaiSesudah}`)
    .join('\n');
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  const formatted = date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const time = date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${formatted}, ${time} WIB`;
}

function getAksiLabel(log: AuditLog): string {
  return log.aksiLabel ?? log.jenisAksi;
}

function getAksiClass(jenisAksi: string): string {
  switch (jenisAksi) {
    case 'CREATE':
      return 'bg-success-50 text-success-700';
    case 'UPDATE':
      return 'bg-warning-50 text-warning-700';
    case 'DELETE':
    case 'CANCEL':
      return 'bg-danger-50 text-danger-700';
    default:
      return 'bg-stone-100 text-stone-600';
  }
}

// ===== API Calls =====
async function fetchAuditLogs() {
  const id = auditTagihanId.value.trim();
  if (!id) return;

  auditLoading.value = true;
  auditError.value = '';

  try {
    const { data } = await api.get<{ data: AuditLog[] }>('/tagihan/audit-log', {
      params: { tagihan_id: id },
    });
    auditLogs.value = data.data;
    if (data.data.length === 0) {
      auditError.value = 'Tidak ada audit trail untuk ID tagihan ini.';
    }
  } catch (error) {
    auditLogs.value = [];
    auditError.value =
      error.response?.data?.message || 'Gagal memuat audit trail. Periksa ID tagihan.';
  } finally {
    auditLoading.value = false;
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') fetchAuditLogs();
}
</script>

<template>
  <div class="p-8">
    <!-- Search Bar -->
    <div class="flex gap-3 mb-5 items-center flex-wrap">
      <input
        v-model="auditTagihanId"
        type="text"
        placeholder="Masukkan ID Tagihan..."
        class="w-full sm:w-auto sm:min-w-[300px] px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        @keydown="handleKeydown"
      />
      <ActionButton
        variant="primary"
        :disabled="auditLoading || !auditTagihanId.trim()"
        @click="fetchAuditLogs"
      >
        <svg
          v-if="auditLoading"
          class="animate-spin h-4 w-4 text-white"
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
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        {{ auditLoading ? 'Memuat...' : 'Cari' }}
      </ActionButton>
    </div>

    <!-- Result Card -->
    <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
      <div
        class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200 flex items-center justify-between"
      >
        <div>
          <h3 class="text-[16px] font-bold text-primary-800">Audit Trail Tagihan</h3>
          <p
            v-if="auditTagihanId.trim() && auditLogs.length > 0"
            class="text-[13px] text-stone-500 mt-0.5"
          >
            {{ auditLogs.length }} entri untuk ID: {{ auditTagihanId.trim() }}
          </p>
        </div>
      </div>

      <!-- Audit Entries -->
      <div v-if="auditLogs.length > 0" class="divide-y divide-stone-100">
        <div
          v-for="log in auditLogs"
          :key="log.id"
          class="px-6 py-5 hover:bg-stone-50 transition-colors duration-150"
        >
          <!-- Header row: time + user + aksi badge -->
          <div class="flex flex-wrap items-center gap-3 mb-2">
            <span class="text-[13px] text-stone-500 font-medium">
              {{ formatDateTime(log.createdAt) }}
            </span>
            <span class="text-[13px] font-semibold text-stone-700">
              {{ log.userNama }}
            </span>
            <span
              :class="[
                'inline-flex items-center px-2.5 py-0.5 rounded-md text-[12px] font-semibold',
                getAksiClass(log.jenisAksi),
              ]"
            >
              {{ getAksiLabel(log) }}
            </span>
          </div>

          <!-- Ringkasan perubahan -->
          <div class="text-[15px] text-stone-800 whitespace-pre-line leading-relaxed">
            {{ formatAuditEntry(log) }}
          </div>

          <!-- Alasan (hanya jika ada) -->
          <div
            v-if="log.alasan && log.alasan.trim()"
            class="mt-2 text-[14px] text-stone-500 italic"
          >
            Alasan: {{ log.alasan }}
          </div>
        </div>
      </div>

      <!-- Empty / initial state -->
      <div v-else class="py-12 text-center">
        <svg
          class="mx-auto h-10 w-10 text-stone-300 mb-3"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
          />
        </svg>
        <p v-if="auditError" class="text-[15px] text-danger-600 font-medium">{{ auditError }}</p>
        <p v-else class="text-[15px] text-stone-500">
          Masukkan ID tagihan dan klik <strong>Cari</strong> untuk melihat audit trail.
        </p>
      </div>
    </div>
  </div>
</template>
