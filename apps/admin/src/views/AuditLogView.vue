<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { Role } from '@edu/shared';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { PageHeader, SearchSelect, BaseModal } from '@/components/ui';
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
  page_size: number;
  total_count: number;
  total_pages: number;
}

interface AuditLogResponse {
  data: AuditLogEntry[];
  meta: PaginationMeta;
}

const authStore = useAuthStore();

const isSuperAdmin = computed(() => authStore.user?.role === Role.SUPER_ADMIN);
const isBendahara = computed(() => authStore.user?.role === Role.BENDAHARA);

// Filters
const filterTenantId = ref('');
const filterEntityType = ref('');
const filterAction = ref('');
const filterActorUserId = ref('');
const filterDateFrom = ref('');
const filterDateTo = ref('');

// Pagination
const currentPage = ref(1);
const pageSize = 20;
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
      page: currentPage.value,
      page_size: pageSize,
    };
    if (filterTenantId.value) params.tenantId = filterTenantId.value;
    if (filterEntityType.value) params.entityType = filterEntityType.value;
    if (filterAction.value) params.action = filterAction.value;
    if (filterActorUserId.value) params.actorUserId = filterActorUserId.value;
    if (filterDateFrom.value) params.dateFrom = filterDateFrom.value;
    if (filterDateTo.value) params.dateTo = filterDateTo.value;

    const { data } = await api.get<AuditLogResponse>('/audit-logs', { params });
    entries.value = data.data;
    totalCount.value = data.meta.total_count;
    totalPages.value = data.meta.total_pages;
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

// Reset to page 1 on filter change
watch(
  [filterTenantId, filterEntityType, filterAction, filterActorUserId, filterDateFrom, filterDateTo],
  () => {
    currentPage.value = 1;
    fetchAuditLogs();
  },
);

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return;
  currentPage.value = page;
  fetchAuditLogs();
}

function goFirst() {
  goToPage(1);
}

function goPrev() {
  goToPage(currentPage.value - 1);
}

function goNext() {
  goToPage(currentPage.value + 1);
}

function goLast() {
  goToPage(totalPages.value);
}

// Page numbers to display (show a window of pages around current)
const visiblePages = computed(() => {
  const pages: number[] = [];
  const total = totalPages.value;
  const current = currentPage.value;

  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current > 3) pages.push(-1); // ellipsis marker
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push(-1); // ellipsis marker
    pages.push(total);
  }
  return pages;
});

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
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader title="Audit Log" description="Riwayat perubahan data sensitif pada sistem." />

    <!-- Filters -->
    <div class="flex flex-wrap items-end gap-2 mb-4">
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
          v-model="filterAction"
          :options="actionTypeOptions"
          placeholder="Action"
          clearable
          :searchable="false"
        />
      </div>

      <!-- Actor filter -->
      <div class="w-44">
        <input
          v-model="filterActorUserId"
          type="text"
          placeholder="Actor User ID..."
          class="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
        />
      </div>

      <!-- Date From -->
      <div class="w-40">
        <input
          v-model="filterDateFrom"
          type="date"
          title="Dari tanggal"
          class="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
        />
      </div>

      <!-- Date To -->
      <div class="w-40">
        <input
          v-model="filterDateTo"
          type="date"
          title="Sampai tanggal"
          class="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
        />
      </div>
    </div>

    <!-- Table -->
    <div class="bg-white border border-border rounded-xl overflow-hidden">
      <div class="overflow-x-auto">
        <table v-if="!loading && entries.length > 0" class="w-full text-sm">
          <thead>
            <tr class="border-b border-border">
              <th class="text-left px-4 py-3 font-medium text-text-secondary bg-surface-50">
                Timestamp
              </th>
              <th class="text-left px-4 py-3 font-medium text-text-secondary bg-surface-50">
                Action
              </th>
              <th class="text-left px-4 py-3 font-medium text-text-secondary bg-surface-50">
                Entity Type
              </th>
              <th class="text-left px-4 py-3 font-medium text-text-secondary bg-surface-50">
                Entity ID
              </th>
              <th class="text-left px-4 py-3 font-medium text-text-secondary bg-surface-50">
                Actor
              </th>
              <th class="text-left px-4 py-3 font-medium text-text-secondary bg-surface-50">
                Tenant
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr
              v-for="entry in entries"
              :key="entry.id"
              class="hover:bg-surface-50 transition-colors cursor-pointer"
              @click="openDetail(entry)"
            >
              <td class="px-4 py-3 text-text-secondary whitespace-nowrap">
                {{ formatTimestamp(entry.createdAt) }}
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-primary-50 text-primary-700"
                >
                  {{ formatAction(entry.action) }}
                </span>
              </td>
              <td class="px-4 py-3 text-text-primary">
                {{ formatEntityType(entry.entityType) }}
              </td>
              <td class="px-4 py-3 text-text-secondary font-mono text-xs">
                {{ entry.entityId.substring(0, 8) }}...
              </td>
              <td class="px-4 py-3 text-text-secondary font-mono text-xs">
                {{ entry.actorUserId.substring(0, 8) }}...
              </td>
              <td class="px-4 py-3 text-text-secondary font-mono text-xs">
                {{ entry.tenantId.substring(0, 8) }}...
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Loading -->
        <div v-else-if="loading" class="p-12 text-center">
          <svg
            class="w-6 h-6 animate-spin text-primary-500 mx-auto"
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
          <p class="text-sm text-text-tertiary mt-2">Memuat data...</p>
        </div>

        <!-- Empty state -->
        <div v-else class="p-12 text-center">
          <svg
            class="w-10 h-10 text-surface-300 mx-auto mb-3"
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
          <p class="text-sm text-text-tertiary">
            Tidak ada audit log ditemukan. Coba sesuaikan filter pencarian Anda.
          </p>
        </div>
      </div>

      <!-- Pagination -->
      <div
        v-if="totalPages > 0"
        class="px-4 py-3 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3"
      >
        <p class="text-sm text-text-secondary">
          Menampilkan {{ entries.length }} dari {{ totalCount }} entri (Halaman
          {{ currentPage }} dari {{ totalPages }})
        </p>

        <div class="flex items-center gap-1">
          <!-- First -->
          <button
            :disabled="currentPage === 1"
            class="px-2 py-1 text-sm font-medium rounded-md border border-border hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Halaman pertama"
            @click="goFirst"
          >
            ««
          </button>
          <!-- Previous -->
          <button
            :disabled="currentPage === 1"
            class="px-2 py-1 text-sm font-medium rounded-md border border-border hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Sebelumnya"
            @click="goPrev"
          >
            «
          </button>

          <!-- Page numbers -->
          <template v-for="(p, idx) in visiblePages">
            <span v-if="p === -1" :key="'ellipsis-' + idx" class="px-1 text-text-tertiary"
              >...</span
            >
            <button
              v-else
              :key="'page-' + p"
              :class="[
                'px-2.5 py-1 text-sm font-medium rounded-md border transition-colors',
                p === currentPage
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'border-border hover:bg-surface-50 text-text-primary',
              ]"
              @click="goToPage(p)"
            >
              {{ p }}
            </button>
          </template>

          <!-- Next -->
          <button
            :disabled="currentPage === totalPages"
            class="px-2 py-1 text-sm font-medium rounded-md border border-border hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Berikutnya"
            @click="goNext"
          >
            »
          </button>
          <!-- Last -->
          <button
            :disabled="currentPage === totalPages"
            class="px-2 py-1 text-sm font-medium rounded-md border border-border hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Halaman terakhir"
            @click="goLast"
          >
            »»
          </button>
        </div>
      </div>
    </div>

    <!-- Audit Log Detail Modal -->
    <BaseModal :show="showDetailModal" title="Detail Audit Log" size="xl" @close="closeDetail">
      <!-- Loading state -->
      <div v-if="detailLoading" class="py-8 text-center">
        <svg class="w-6 h-6 animate-spin text-primary-500 mx-auto" viewBox="0 0 24 24" fill="none">
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
        <p class="text-sm text-text-tertiary mt-2">Memuat detail...</p>
      </div>

      <!-- Detail content -->
      <div v-else-if="detailEntry" class="space-y-5">
        <!-- Entry metadata -->
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span class="text-text-tertiary">ID</span>
            <p class="font-mono text-xs text-text-primary mt-0.5">{{ detailEntry.id }}</p>
          </div>
          <div>
            <span class="text-text-tertiary">Timestamp</span>
            <p class="text-text-primary mt-0.5">{{ formatTimestamp(detailEntry.createdAt) }}</p>
          </div>
          <div>
            <span class="text-text-tertiary">Action</span>
            <p class="mt-0.5">
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-primary-50 text-primary-700"
              >
                {{ formatAction(detailEntry.action) }}
              </span>
            </p>
          </div>
          <div>
            <span class="text-text-tertiary">Entity Type</span>
            <p class="text-text-primary mt-0.5">{{ formatEntityType(detailEntry.entityType) }}</p>
          </div>
          <div>
            <span class="text-text-tertiary">Entity ID</span>
            <p class="font-mono text-xs text-text-primary mt-0.5">{{ detailEntry.entityId }}</p>
          </div>
          <div>
            <span class="text-text-tertiary">Tenant ID</span>
            <p class="font-mono text-xs text-text-primary mt-0.5">{{ detailEntry.tenantId }}</p>
          </div>
          <div>
            <span class="text-text-tertiary">Actor User ID</span>
            <p class="font-mono text-xs text-text-primary mt-0.5">{{ detailEntry.actorUserId }}</p>
          </div>
          <div>
            <span class="text-text-tertiary">Actor Role</span>
            <p class="text-text-primary mt-0.5">{{ detailEntry.actorRole }}</p>
          </div>
          <div>
            <span class="text-text-tertiary">IP Address</span>
            <p class="font-mono text-xs text-text-primary mt-0.5">{{ detailEntry.ipAddress }}</p>
          </div>
        </div>

        <!-- Before/After Diff Section -->
        <div v-if="detailEntry.beforeValues || detailEntry.afterValues">
          <h3 class="text-sm font-semibold text-text-primary mb-2 border-t border-border pt-4">
            Perubahan Data
          </h3>

          <div class="border border-border rounded-lg overflow-hidden">
            <!-- Header row -->
            <div class="grid grid-cols-3 bg-surface-50 border-b border-border">
              <div class="px-3 py-2 text-xs font-medium text-text-secondary">Field</div>
              <div class="px-3 py-2 text-xs font-medium text-text-secondary">Before</div>
              <div class="px-3 py-2 text-xs font-medium text-text-secondary">After</div>
            </div>

            <!-- Diff rows -->
            <div
              v-for="field in computeDiffFields(detailEntry)"
              :key="field.key"
              :class="[
                'grid grid-cols-3 border-b border-border last:border-b-0 text-xs',
                field.status === 'added' ? 'bg-green-50' : '',
                field.status === 'removed' ? 'bg-red-50' : '',
                field.status === 'modified' ? 'bg-amber-50' : '',
              ]"
            >
              <div class="px-3 py-2 font-medium text-text-primary flex items-center gap-1.5">
                <span
                  v-if="field.status === 'added'"
                  class="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0"
                  title="Ditambahkan"
                />
                <span
                  v-else-if="field.status === 'removed'"
                  class="inline-block w-2 h-2 rounded-full bg-red-500 shrink-0"
                  title="Dihapus"
                />
                <span
                  v-else-if="field.status === 'modified'"
                  class="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0"
                  title="Diubah"
                />
                <span
                  v-else
                  class="inline-block w-2 h-2 rounded-full bg-surface-300 shrink-0"
                  title="Tidak berubah"
                />
                {{ field.key }}
              </div>
              <div
                :class="[
                  'px-3 py-2 font-mono break-all text-text-secondary',
                  field.status === 'removed' ? 'text-red-700' : '',
                  field.status === 'modified' ? 'text-red-600' : '',
                ]"
              >
                {{ formatValue(field.beforeValue) }}
              </div>
              <div
                :class="[
                  'px-3 py-2 font-mono break-all text-text-secondary',
                  field.status === 'added' ? 'text-green-700' : '',
                  field.status === 'modified' ? 'text-green-600' : '',
                ]"
              >
                {{ formatValue(field.afterValue) }}
              </div>
            </div>
          </div>

          <!-- Legend -->
          <div class="flex items-center gap-4 mt-2 text-xs text-text-tertiary">
            <span class="flex items-center gap-1">
              <span class="inline-block w-2 h-2 rounded-full bg-green-500" /> Ditambahkan
            </span>
            <span class="flex items-center gap-1">
              <span class="inline-block w-2 h-2 rounded-full bg-red-500" /> Dihapus
            </span>
            <span class="flex items-center gap-1">
              <span class="inline-block w-2 h-2 rounded-full bg-amber-500" /> Diubah
            </span>
            <span class="flex items-center gap-1">
              <span class="inline-block w-2 h-2 rounded-full bg-surface-300" /> Tidak berubah
            </span>
          </div>
        </div>

        <!-- No diff data -->
        <div
          v-else
          class="text-sm text-text-tertiary text-center py-4 border-t border-border mt-4 pt-4"
        >
          Tidak ada data before/after untuk entri ini.
        </div>
      </div>

      <template #footer>
        <button
          class="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-surface-50 text-text-primary transition-colors"
          @click="closeDetail"
        >
          Tutup
        </button>
      </template>
    </BaseModal>
  </div>
</template>
