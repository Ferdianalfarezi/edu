<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { Role } from '@edu/shared';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { useTableUrlState } from '@/composables/useTableUrlState';
import { PageHeader, SearchSelect, BaseModal, TablePagination } from '@/components/ui';
import type { SelectOption } from '@/components/ui';

interface AuditLogEntry {
  id: string;
  tenantId: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress: string;
  beforeValues: Record<string, unknown> | null;
  afterValues: Record<string, unknown> | null;
  createdAt: string;
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

interface AuditLogResponse {
  data: AuditLogEntry[];
  meta: PaginationMeta;
}

const authStore = useAuthStore();

const isSuperAdmin = computed(() => authStore.user?.role === Role.SUPER_ADMIN);
const isBendahara = computed(() => authStore.user?.role === Role.BENDAHARA);

// URL-synced table state (action, user_id, date_from, date_to, page, page_size)
const { page, pageSize, filters } = useTableUrlState({
  searchKey: 'search',
  defaultPageSize: 15,
  filters: [
    { key: 'action', type: 'string' },
    { key: 'user_id', type: 'string' },
    { key: 'date_from', type: 'string' },
    { key: 'date_to', type: 'string' },
  ],
});

// Local-only filters (not URL-persisted per spec)
const filterTenantId = ref('');
const filterEntityType = ref('');

// Date validation: treat invalid ISO dates as undefined
const validDateFrom = computed(() => {
  const val = filters['date_from'].value;
  if (!val || isNaN(Date.parse(val))) return undefined;
  return val;
});
const validDateTo = computed(() => {
  const val = filters['date_to'].value;
  if (!val || isNaN(Date.parse(val))) return undefined;
  return val;
});

// Pagination metadata
const totalCount = ref(0);
const totalPages = ref(0);

// Data
const entries = ref<AuditLogEntry[]>([]);
const loading = ref(false);
const tenantOptions = ref<SelectOption[]>([]);
const tenantSearchLoading = ref(false);

// Entity type options based on role
const entityTypeOptions = computed<SelectOption[]>(() => {
  if (isBendahara.value) {
    return [
      { value: 'tagihan', label: 'Tagihan' },
      { value: 'pembayaran', label: 'Pembayaran' },
    ];
  }
  return [
    { value: 'tagihan', label: 'Tagihan' },
    { value: 'pembayaran', label: 'Pembayaran' },
    { value: 'user', label: 'User' },
    { value: 'role_assignment', label: 'Role Assignment' },
    { value: 'tenant_config', label: 'Tenant Config' },
  ];
});

const actionTypeOptions: SelectOption[] = [
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'deactivate', label: 'Deactivate' },
  { value: 'activate', label: 'Activate' },
  { value: 'role_change', label: 'Role Change' },
  { value: 'password_reset', label: 'Password Reset' },
];

async function fetchAuditLogs() {
  loading.value = true;
  try {
    const params: Record<string, string | number> = {
      page: page.value,
      page_size: pageSize.value,
    };
    if (filterTenantId.value) params.tenantId = filterTenantId.value;
    if (filterEntityType.value) params.entityType = filterEntityType.value;
    if (filters['action'].value) params.action = filters['action'].value;
    if (filters['user_id'].value) params.actorUserId = filters['user_id'].value;
    if (validDateFrom.value) params.dateFrom = validDateFrom.value;
    if (validDateTo.value) params.dateTo = validDateTo.value;

    const { data } = await api.get<AuditLogResponse>('/audit-logs', { params });
    entries.value = data.data;
    totalCount.value = data.meta.totalCount;
    totalPages.value = data.meta.totalPages;
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    entries.value = [];
    totalCount.value = 0;
    totalPages.value = 0;
  } finally {
    loading.value = false;
  }
}

async function loadTenantOptions() {
  if (!isSuperAdmin.value) return;
  tenantSearchLoading.value = true;
  try {
    const { data } = await api.get<{ data: { id: string; nama: string }[] }>('/tenants', {
      params: { page: 1, page_size: 100 },
    });
    tenantOptions.value = data.data.map((t: { id: string; nama: string }) => ({
      value: t.id,
      label: t.nama,
    }));
  } catch {
    tenantOptions.value = [];
  } finally {
    tenantSearchLoading.value = false;
  }
}

// Watcher for local-only filters (reset page and fetch)
watch([filterTenantId, filterEntityType], () => {
  page.value = 1;
  fetchAuditLogs();
});

// Watcher for URL-synced state to trigger fetches
watch(
  [
    page,
    pageSize,
    () => filters['action'].value,
    () => filters['user_id'].value,
    () => filters['date_from'].value,
    () => filters['date_to'].value,
  ],
  fetchAuditLogs,
);

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('id-ID', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatEntityType(type: string): string {
  const map: Record<string, string> = {
    tagihan: 'Tagihan',
    pembayaran: 'Pembayaran',
    user: 'User',
    role_assignment: 'Role Assignment',
    tenant_config: 'Tenant Config',
  };
  return map[type] || type;
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    create: 'Create',
    update: 'Update',
    delete: 'Delete',
    deactivate: 'Deactivate',
    activate: 'Activate',
    role_change: 'Role Change',
    password_reset: 'Password Reset',
  };
  return map[action] || action;
}

// Detail panel state
const showDetailModal = ref(false);
const detailEntry = ref<AuditLogEntry | null>(null);
const detailLoading = ref(false);

async function openDetail(entry: AuditLogEntry) {
  showDetailModal.value = true;
  detailLoading.value = true;
  detailEntry.value = null;
  try {
    const { data } = await api.get<AuditLogEntry>(`/audit-logs/${entry.id}`);
    detailEntry.value = data;
  } catch (error) {
    console.error('Failed to fetch audit log detail:', error);
    detailEntry.value = entry; // fallback to the list entry data
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail() {
  showDetailModal.value = false;
  detailEntry.value = null;
}

// Compute diff keys for before/after values
interface DiffField {
  key: string;
  beforeValue: unknown;
  afterValue: unknown;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
}

function computeDiffFields(entry: AuditLogEntry): DiffField[] {
  const before = entry.beforeValues || {};
  const after = entry.afterValues || {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const fields: DiffField[] = [];

  for (const key of allKeys) {
    const hasBefore = key in before;
    const hasAfter = key in after;

    if (!hasBefore && hasAfter) {
      fields.push({ key, beforeValue: undefined, afterValue: after[key], status: 'added' });
    } else if (hasBefore && !hasAfter) {
      fields.push({ key, beforeValue: before[key], afterValue: undefined, status: 'removed' });
    } else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      fields.push({ key, beforeValue: before[key], afterValue: after[key], status: 'modified' });
    } else {
      fields.push({ key, beforeValue: before[key], afterValue: after[key], status: 'unchanged' });
    }
  }

  // Sort: changed fields first, then unchanged
  fields.sort((a, b) => {
    if (a.status === 'unchanged' && b.status !== 'unchanged') return 1;
    if (a.status !== 'unchanged' && b.status === 'unchanged') return -1;
    return a.key.localeCompare(b.key);
  });

  return fields;
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

onMounted(() => {
  fetchAuditLogs();
  loadTenantOptions();
});
</script>

<template>
  <div class="p-8 max-w-7xl mx-auto">
    <PageHeader title="Audit Log" subtitle="Riwayat perubahan data sensitif pada sistem." />

    <!-- Filters -->
    <div class="flex flex-wrap items-end gap-3 mb-6">
      <!-- Tenant filter (SUPER_ADMIN only) -->
      <div v-if="isSuperAdmin" class="w-48">
        <SearchSelect
          v-model="filterTenantId"
          :options="tenantOptions"
          placeholder="Semua Tenant"
          clearable
        />
      </div>

      <!-- Entity Type filter -->
      <div class="w-40">
        <SearchSelect
          v-model="filterEntityType"
          :options="entityTypeOptions"
          placeholder="Entity Type"
          clearable
          :searchable="false"
        />
      </div>

      <!-- Action Type filter -->
      <div class="w-40">
        <SearchSelect
          v-model="filters['action'].value"
          :options="actionTypeOptions"
          placeholder="Action"
          clearable
          :searchable="false"
        />
      </div>

      <!-- Actor filter -->
      <div class="w-44">
        <input
          v-model="filters['user_id'].value"
          type="text"
          placeholder="Actor User ID..."
          class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-[8px] bg-white placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
        />
      </div>

      <!-- Date From -->
      <div class="w-40">
        <input
          v-model="filters['date_from'].value"
          type="date"
          title="Dari tanggal"
          class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-[8px] bg-white placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
        />
      </div>

      <!-- Date To -->
      <div class="w-40">
        <input
          v-model="filters['date_to'].value"
          type="date"
          title="Sampai tanggal"
          class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-[8px] bg-white placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
        />
      </div>
    </div>

    <!-- Table Card -->
    <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
      <!-- Section Header -->
      <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
        <h3 class="text-[16px] font-bold text-primary-800">Riwayat Audit</h3>
      </div>

      <div class="overflow-x-auto">
        <table v-if="!loading && entries.length > 0" class="w-full">
          <thead class="border-b-2 border-stone-200">
            <tr>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Timestamp
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Action
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Entity Type
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Entity ID
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Actor
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Tenant
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-200">
            <tr
              v-for="entry in entries"
              :key="entry.id"
              class="hover:bg-primary-50 transition-colors cursor-pointer"
              @click="openDetail(entry)"
            >
              <td class="px-5 py-4 text-[15px] text-stone-500 whitespace-nowrap">
                {{ formatTimestamp(entry.createdAt) }}
              </td>
              <td class="px-5 py-4">
                <span
                  class="inline-flex items-center px-2.5 py-1 rounded-[8px] text-[13px] font-semibold bg-primary-50 text-primary-700"
                >
                  {{ formatAction(entry.action) }}
                </span>
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-800">
                {{ formatEntityType(entry.entityType) }}
              </td>
              <td class="px-5 py-4 text-[13px] text-stone-500 font-mono">
                {{ entry.entityId.substring(0, 8) }}...
              </td>
              <td class="px-5 py-4 text-[13px] text-stone-500 font-mono">
                {{ entry.actorUserId.substring(0, 8) }}...
              </td>
              <td class="px-5 py-4 text-[13px] text-stone-500 font-mono">
                {{ entry.tenantId.substring(0, 8) }}...
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Loading -->
        <div v-else-if="loading" class="p-12 text-center">
          <svg
            class="w-7 h-7 animate-spin text-primary-500 mx-auto"
            viewBox="0 0 24 24"
            fill="none"
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
          <p class="text-[15px] text-stone-500 mt-3">Memuat data...</p>
        </div>

        <!-- Empty state -->
        <div v-else class="p-12 text-center">
          <svg
            class="w-10 h-10 text-stone-300 mx-auto mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p class="text-[15px] text-stone-500">
            Tidak ada audit log ditemukan. Coba sesuaikan filter pencarian Anda.
          </p>
        </div>
      </div>

      <!-- Pagination -->
      <TablePagination
        :current-page="page"
        :total-pages="totalPages"
        :total-count="totalCount"
        :page-size="pageSize"
        :loading="loading"
        @page-change="page = $event"
        @page-size-change="pageSize = $event"
      />
    </div>

    <!-- Audit Log Detail Modal -->
    <BaseModal :show="showDetailModal" title="Detail Audit Log" size="xl" @close="closeDetail">
      <!-- Loading state -->
      <div v-if="detailLoading" class="py-8 text-center">
        <svg class="w-7 h-7 animate-spin text-primary-500 mx-auto" viewBox="0 0 24 24" fill="none">
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
        <p class="text-[15px] text-stone-500 mt-3">Memuat detail...</p>
      </div>

      <!-- Detail content -->
      <div v-else-if="detailEntry" class="space-y-5">
        <!-- Entry metadata -->
        <div class="grid grid-cols-2 gap-4 text-[15px]">
          <div>
            <span class="text-stone-500 text-[13px] font-semibold">ID</span>
            <p class="font-mono text-[13px] text-stone-800 mt-0.5">{{ detailEntry.id }}</p>
          </div>
          <div>
            <span class="text-stone-500 text-[13px] font-semibold">Timestamp</span>
            <p class="text-stone-800 mt-0.5">{{ formatTimestamp(detailEntry.createdAt) }}</p>
          </div>
          <div>
            <span class="text-stone-500 text-[13px] font-semibold">Action</span>
            <p class="mt-0.5">
              <span
                class="inline-flex items-center px-2.5 py-1 rounded-[8px] text-[13px] font-semibold bg-primary-50 text-primary-700"
              >
                {{ formatAction(detailEntry.action) }}
              </span>
            </p>
          </div>
          <div>
            <span class="text-stone-500 text-[13px] font-semibold">Entity Type</span>
            <p class="text-stone-800 mt-0.5">{{ formatEntityType(detailEntry.entityType) }}</p>
          </div>
          <div>
            <span class="text-stone-500 text-[13px] font-semibold">Entity ID</span>
            <p class="font-mono text-[13px] text-stone-800 mt-0.5">{{ detailEntry.entityId }}</p>
          </div>
          <div>
            <span class="text-stone-500 text-[13px] font-semibold">Tenant ID</span>
            <p class="font-mono text-[13px] text-stone-800 mt-0.5">{{ detailEntry.tenantId }}</p>
          </div>
          <div>
            <span class="text-stone-500 text-[13px] font-semibold">Actor User ID</span>
            <p class="font-mono text-[13px] text-stone-800 mt-0.5">{{ detailEntry.actorUserId }}</p>
          </div>
          <div>
            <span class="text-stone-500 text-[13px] font-semibold">Actor Role</span>
            <p class="text-stone-800 mt-0.5">{{ detailEntry.actorRole }}</p>
          </div>
          <div>
            <span class="text-stone-500 text-[13px] font-semibold">IP Address</span>
            <p class="font-mono text-[13px] text-stone-800 mt-0.5">{{ detailEntry.ipAddress }}</p>
          </div>
        </div>

        <!-- Before/After Diff Section -->
        <div v-if="detailEntry.beforeValues || detailEntry.afterValues">
          <h3 class="text-[15px] font-bold text-stone-800 mb-3 border-t-2 border-stone-200 pt-4">
            Perubahan Data
          </h3>

          <div class="border-2 border-stone-200 rounded-[12px] overflow-hidden">
            <!-- Header row -->
            <div class="grid grid-cols-3 bg-surface-warm border-b-2 border-stone-200">
              <div
                class="px-4 py-3 text-[13px] font-bold uppercase tracking-[0.04em] text-stone-600"
              >
                Field
              </div>
              <div
                class="px-4 py-3 text-[13px] font-bold uppercase tracking-[0.04em] text-stone-600"
              >
                Before
              </div>
              <div
                class="px-4 py-3 text-[13px] font-bold uppercase tracking-[0.04em] text-stone-600"
              >
                After
              </div>
            </div>

            <!-- Diff rows -->
            <div
              v-for="field in computeDiffFields(detailEntry)"
              :key="field.key"
              :class="[
                'grid grid-cols-3 border-b border-stone-200 last:border-b-0 text-[13px]',
                field.status === 'added' ? 'bg-success-50' : '',
                field.status === 'removed' ? 'bg-danger-50' : '',
                field.status === 'modified' ? 'bg-warning-50' : '',
              ]"
            >
              <div class="px-4 py-3 font-semibold text-stone-800 flex items-center gap-1.5">
                <span
                  v-if="field.status === 'added'"
                  class="inline-block w-2 h-2 rounded-full bg-success-500 shrink-0"
                  title="Ditambahkan"
                />
                <span
                  v-else-if="field.status === 'removed'"
                  class="inline-block w-2 h-2 rounded-full bg-danger-500 shrink-0"
                  title="Dihapus"
                />
                <span
                  v-else-if="field.status === 'modified'"
                  class="inline-block w-2 h-2 rounded-full bg-warning-500 shrink-0"
                  title="Diubah"
                />
                <span
                  v-else
                  class="inline-block w-2 h-2 rounded-full bg-stone-300 shrink-0"
                  title="Tidak berubah"
                />
                {{ field.key }}
              </div>
              <div
                :class="[
                  'px-4 py-3 font-mono break-all text-stone-500',
                  field.status === 'removed' ? 'text-danger-700' : '',
                  field.status === 'modified' ? 'text-danger-600' : '',
                ]"
              >
                {{ formatValue(field.beforeValue) }}
              </div>
              <div
                :class="[
                  'px-4 py-3 font-mono break-all text-stone-500',
                  field.status === 'added' ? 'text-success-700' : '',
                  field.status === 'modified' ? 'text-success-600' : '',
                ]"
              >
                {{ formatValue(field.afterValue) }}
              </div>
            </div>
          </div>

          <!-- Legend -->
          <div class="flex items-center gap-4 mt-3 text-[13px] text-stone-500">
            <span class="flex items-center gap-1">
              <span class="inline-block w-2 h-2 rounded-full bg-success-500" /> Ditambahkan
            </span>
            <span class="flex items-center gap-1">
              <span class="inline-block w-2 h-2 rounded-full bg-danger-500" /> Dihapus
            </span>
            <span class="flex items-center gap-1">
              <span class="inline-block w-2 h-2 rounded-full bg-warning-500" /> Diubah
            </span>
            <span class="flex items-center gap-1">
              <span class="inline-block w-2 h-2 rounded-full bg-stone-300" /> Tidak berubah
            </span>
          </div>
        </div>

        <!-- No diff data -->
        <div
          v-else
          class="text-[15px] text-stone-500 text-center py-4 border-t-2 border-stone-200 mt-4 pt-4"
        >
          Tidak ada data before/after untuk entri ini.
        </div>
      </div>

      <template #footer>
        <button
          class="px-4 py-2.5 text-[14px] font-semibold rounded-[8px] border-2 border-stone-200 hover:bg-surface-warm text-stone-800 transition-colors"
          @click="closeDetail"
        >
          Tutup
        </button>
      </template>
    </BaseModal>
  </div>
</template>
