<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';
import { StatCard, QuickActionCard } from '@/components/ui';

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
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5 mb-8">
        <div
          v-for="i in 4"
          :key="i"
          class="bg-white border-2 border-stone-200 rounded-2xl p-5.5 animate-pulse"
        >
          <div class="h-4 bg-stone-100 rounded w-24 mb-3" />
          <div class="h-8 bg-stone-100 rounded w-16" />
        </div>
      </div>
      <div class="bg-white border-2 border-stone-200 rounded-2xl p-5 animate-pulse">
        <div class="h-4 bg-stone-100 rounded w-32 mb-4" />
        <div class="space-y-3">
          <div v-for="i in 3" :key="i" class="h-10 bg-stone-100 rounded" />
        </div>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="bg-white border-2 border-stone-200 rounded-2xl p-8 text-center">
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
      <p class="text-[15px] text-text-secondary mb-3">{{ error }}</p>
      <button
        class="text-[14px] font-semibold text-primary-600 hover:text-primary-700 transition-colors"
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
          class="inline-flex items-center gap-1.5 px-4 py-2 text-[14px] font-semibold text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
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

      <!-- Overview stat cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5 mb-8">
        <StatCard
          label="Total Tenant"
          :value="metrics.overview.totalTenants"
          variant="blue"
          icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          :change="`${metrics.overview.activeTenants} aktif`"
        />
        <StatCard
          label="Total Pengguna"
          :value="metrics.overview.totalUsers"
          variant="green"
          icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
        />
        <StatCard
          label="Total Siswa"
          :value="metrics.overview.totalStudents"
          variant="amber"
          icon="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"
        />
        <StatCard
          label="Tagihan Belum Lunas"
          :value="metrics.overview.totalUnpaidInvoices"
          variant="purple"
          icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </div>

      <!-- Quick Actions -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <QuickActionCard
          title="Kelola Tenant"
          description="Tambah dan kelola sekolah"
          icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          icon-color="bg-primary-600"
          to="/tenants"
        />
        <QuickActionCard
          title="Kelola Pengguna"
          description="Atur akun admin dan staff"
          icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          icon-color="bg-success-600"
          to="/users"
        />
        <QuickActionCard
          title="Audit Log"
          description="Lihat riwayat aktivitas sistem"
          icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          icon-color="bg-accent-600"
          to="/audit-logs"
        />
      </div>

      <!-- Per-tenant summary table -->
      <div class="bg-white border-2 border-stone-200 rounded-2xl overflow-hidden">
        <div
          class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200 flex items-center justify-between"
        >
          <h3 class="text-[16px] font-bold text-text-primary">Ringkasan Per Tenant</h3>
        </div>
        <div v-if="metrics.tenants.length === 0" class="p-8 text-center">
          <p class="text-[15px] text-text-tertiary">Belum ada data tenant.</p>
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-stone-200 bg-surface-warm">
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em]"
                >
                  Nama Tenant
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em]"
                >
                  Status
                </th>
                <th
                  class="px-5 py-4 text-right font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em]"
                >
                  Pengguna
                </th>
                <th
                  class="px-5 py-4 text-right font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em]"
                >
                  Siswa
                </th>
                <th
                  class="px-5 py-4 text-right font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em]"
                >
                  Tagihan Belum Lunas
                </th>
                <th
                  class="px-5 py-4 text-center font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em]"
                >
                  Overdue
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-100">
              <tr
                v-for="tenant in metrics.tenants"
                :key="tenant.id"
                :class="[
                  'transition-colors',
                  tenant.hasOverdueInvoices
                    ? 'bg-danger-50/50 hover:bg-danger-50'
                    : 'hover:bg-primary-50',
                ]"
              >
                <td class="px-5 py-4 font-semibold text-text-primary text-[15px]">
                  {{ tenant.nama }}
                </td>
                <td class="px-5 py-4">
                  <span
                    :class="[
                      'inline-flex items-center px-2.5 py-1 rounded-lg text-[13px] font-semibold',
                      tenant.isActive
                        ? 'bg-success-50 text-success-700'
                        : 'bg-stone-100 text-text-tertiary',
                    ]"
                  >
                    {{ tenant.isActive ? 'Aktif' : 'Nonaktif' }}
                  </span>
                </td>
                <td class="px-5 py-4 text-right text-text-secondary text-[15px]">
                  {{ tenant.userCount }}
                </td>
                <td class="px-5 py-4 text-right text-text-secondary text-[15px]">
                  {{ tenant.studentCount }}
                </td>
                <td class="px-5 py-4 text-right font-semibold text-text-primary text-[15px]">
                  {{ formatRupiah(tenant.unpaidAmount) }}
                </td>
                <td class="px-5 py-4 text-center">
                  <span
                    v-if="tenant.hasOverdueInvoices"
                    class="inline-flex items-center px-2.5 py-1 rounded-lg text-[13px] font-semibold bg-danger-50 text-danger-700"
                  >
                    Overdue
                  </span>
                  <span v-else class="text-[13px] text-text-tertiary">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
