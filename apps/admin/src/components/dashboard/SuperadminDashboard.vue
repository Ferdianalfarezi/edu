<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';

interface TenantSummary {
  id: string;
  nama: string;
  isActive: boolean;
  userCount: number;
  studentCount: number;
  unpaidAmount: number;
  hasOverdueInvoices: boolean;
}

interface CrossTenantMetrics {
  overview: {
    totalTenants: number;
    activeTenants: number;
    inactiveTenants: number;
    totalUsers: number;
    totalStudents: number;
    totalUnpaidInvoices: number;
  };
  tenants: TenantSummary[];
}

const loading = ref(true);
const error = ref<string | null>(null);
const metrics = ref<CrossTenantMetrics | null>(null);

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

async function fetchMetrics() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<CrossTenantMetrics>('/dashboard/superadmin/metrics');
    metrics.value = data;
  } catch (err: unknown) {
    error.value = 'Gagal memuat metrik cross-tenant.';
    console.error('Failed to fetch superadmin metrics:', err);
  } finally {
    loading.value = false;
  }
}

onMounted(fetchMetrics);
</script>

<template>
  <div>
    <!-- Loading skeleton -->
    <div v-if="loading">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div
          v-for="i in 4"
          :key="i"
          class="bg-white border border-border rounded-xl p-5 animate-pulse"
        >
          <div class="h-4 bg-surface-200 rounded w-24 mb-3" />
          <div class="h-7 bg-surface-200 rounded w-16" />
        </div>
      </div>
      <div class="bg-white border border-border rounded-xl p-5 animate-pulse">
        <div class="h-4 bg-surface-200 rounded w-32 mb-4" />
        <div class="space-y-3">
          <div v-for="i in 3" :key="i" class="h-8 bg-surface-200 rounded" />
        </div>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="bg-white border border-border rounded-xl p-8 text-center">
      <div
        class="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center mx-auto mb-3"
      >
        <svg
          class="w-5 h-5 text-danger-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.75"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <p class="text-sm text-text-secondary mb-3">{{ error }}</p>
      <button
        class="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        @click="fetchMetrics"
      >
        Coba lagi
      </button>
    </div>

    <!-- Dashboard content -->
    <template v-else-if="metrics">
      <!-- Refresh button -->
      <div class="flex justify-end mb-4">
        <button
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
          @click="fetchMetrics"
        >
          <svg
            class="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.75"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Refresh
        </button>
      </div>

      <!-- Overview cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <!-- Total Tenants -->
        <div class="bg-white border border-border rounded-xl p-5 hover:shadow-sm transition-shadow">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm text-text-secondary">Total Tenant</span>
            <div class="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
              <svg
                class="w-4 h-4 text-primary-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.75"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
          </div>
          <p class="text-2xl font-semibold text-text-primary">
            {{ metrics.overview.totalTenants }}
          </p>
          <p class="text-xs text-text-tertiary mt-1">
            {{ metrics.overview.activeTenants }} aktif ·
            {{ metrics.overview.inactiveTenants }} nonaktif
          </p>
        </div>

        <!-- Total Users -->
        <div class="bg-white border border-border rounded-xl p-5 hover:shadow-sm transition-shadow">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm text-text-secondary">Total Pengguna</span>
            <div class="w-8 h-8 rounded-lg bg-success-50 flex items-center justify-center">
              <svg
                class="w-4 h-4 text-success-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.75"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            </div>
          </div>
          <p class="text-2xl font-semibold text-text-primary">{{ metrics.overview.totalUsers }}</p>
        </div>

        <!-- Total Students -->
        <div class="bg-white border border-border rounded-xl p-5 hover:shadow-sm transition-shadow">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm text-text-secondary">Total Siswa</span>
            <div class="w-8 h-8 rounded-lg bg-warning-50 flex items-center justify-center">
              <svg
                class="w-4 h-4 text-warning-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.75"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"
                />
              </svg>
            </div>
          </div>
          <p class="text-2xl font-semibold text-text-primary">
            {{ metrics.overview.totalStudents }}
          </p>
        </div>

        <!-- Total Unpaid Invoices -->
        <div class="bg-white border border-border rounded-xl p-5 hover:shadow-sm transition-shadow">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm text-text-secondary">Tagihan Belum Lunas</span>
            <div class="w-8 h-8 rounded-lg bg-danger-50 flex items-center justify-center">
              <svg
                class="w-4 h-4 text-danger-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.75"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
          </div>
          <p class="text-2xl font-semibold text-text-primary">
            {{ metrics.overview.totalUnpaidInvoices }}
          </p>
        </div>
      </div>

      <!-- Per-tenant summary table -->
      <div class="bg-white border border-border rounded-xl overflow-hidden">
        <div class="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 class="text-sm font-semibold text-text-primary">Ringkasan Per Tenant</h3>
        </div>
        <div v-if="metrics.tenants.length === 0" class="p-8 text-center">
          <p class="text-sm text-text-tertiary">Belum ada data tenant.</p>
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border bg-surface-50">
                <th class="px-4 py-2.5 text-left font-medium text-text-secondary text-xs">
                  Nama Tenant
                </th>
                <th class="px-4 py-2.5 text-left font-medium text-text-secondary text-xs">
                  Status
                </th>
                <th class="px-4 py-2.5 text-right font-medium text-text-secondary text-xs">
                  Pengguna
                </th>
                <th class="px-4 py-2.5 text-right font-medium text-text-secondary text-xs">
                  Siswa
                </th>
                <th class="px-4 py-2.5 text-right font-medium text-text-secondary text-xs">
                  Tagihan Belum Lunas
                </th>
                <th class="px-4 py-2.5 text-center font-medium text-text-secondary text-xs">
                  Overdue
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="tenant in metrics.tenants"
                :key="tenant.id"
                :class="[
                  'transition-colors',
                  tenant.hasOverdueInvoices
                    ? 'bg-danger-50/50 hover:bg-danger-50'
                    : 'hover:bg-surface-50',
                ]"
              >
                <td class="px-4 py-2.5 font-medium text-text-primary">{{ tenant.nama }}</td>
                <td class="px-4 py-2.5">
                  <span
                    :class="[
                      'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
                      tenant.isActive
                        ? 'bg-success-50 text-success-700'
                        : 'bg-surface-100 text-text-tertiary',
                    ]"
                  >
                    {{ tenant.isActive ? 'Aktif' : 'Nonaktif' }}
                  </span>
                </td>
                <td class="px-4 py-2.5 text-right text-text-secondary">{{ tenant.userCount }}</td>
                <td class="px-4 py-2.5 text-right text-text-secondary">
                  {{ tenant.studentCount }}
                </td>
                <td class="px-4 py-2.5 text-right font-medium text-text-primary">
                  {{ formatRupiah(tenant.unpaidAmount) }}
                </td>
                <td class="px-4 py-2.5 text-center">
                  <span
                    v-if="tenant.hasOverdueInvoices"
                    class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-danger-50 text-danger-700"
                  >
                    Overdue
                  </span>
                  <span v-else class="text-xs text-text-tertiary">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
