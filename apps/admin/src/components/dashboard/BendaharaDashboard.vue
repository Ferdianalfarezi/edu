<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';
import { StatCard, QuickActionCard } from '@/components/ui';

interface TunggakanSiswa {
  siswaId: string;
  siswaNama: string;
  kelasNama: string;
  bulan: number;
  tahun: number;
  nominal: number;
  totalDibayar: number;
  sisa: number;
  status: string;
  tanggalJatuhTempo: string;
}
interface TunggakanSummaryResponse {
  totalTunggakan: number;
  totalSiswaNunggak: number;
  totalTagihanNunggak: number;
  tunggakanList: TunggakanSiswa[];
}

const loading = ref(true);
const error = ref<string | null>(null);
const summaryData = ref<TunggakanSummaryResponse | null>(null);

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'belum_bayar':
      return 'Belum Bayar';
    case 'cicilan':
      return 'Cicilan';
    default:
      return status;
  }
}

async function fetchTunggakan() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<TunggakanSummaryResponse>('/tagihan/tunggakan/summary');
    summaryData.value = data;
  } catch (err: unknown) {
    error.value = 'Gagal memuat data tunggakan.';
    console.error(err);
  } finally {
    loading.value = false;
  }
}

onMounted(fetchTunggakan);
</script>

<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
      <div
        v-for="i in 3"
        :key="i"
        class="bg-white border-2 border-stone-200 rounded-2xl p-5.5 animate-pulse"
      >
        <div class="h-4 bg-stone-100 rounded w-24 mb-3" />
        <div class="h-8 bg-stone-100 rounded w-16" />
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="bg-white border-2 border-stone-200 rounded-2xl p-8 text-center">
      <p class="text-[15px] text-text-secondary mb-3">{{ error }}</p>
      <button
        class="text-[14px] font-semibold text-primary-600 hover:text-primary-700"
        @click="fetchTunggakan"
      >
        Coba lagi
      </button>
    </div>

    <template v-else-if="summaryData">
      <!-- Summary Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5 mb-8">
        <StatCard
          label="Total Tunggakan"
          :value="formatRupiah(summaryData.totalTunggakan)"
          variant="amber"
          icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <StatCard
          label="Siswa Menunggak"
          :value="summaryData.totalSiswaNunggak"
          variant="purple"
          icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
        />
        <StatCard
          label="Tagihan Tertunggak"
          :value="summaryData.totalTagihanNunggak"
          variant="blue"
          icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </div>

      <!-- Quick Actions -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <QuickActionCard
          title="Kelola Tagihan"
          description="Buat dan kelola tagihan SPP"
          icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          icon-color="bg-primary-600"
          to="/tagihan"
        />
        <QuickActionCard
          title="Verifikasi Pembayaran"
          description="Konfirmasi bukti bayar dari orang tua"
          icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          icon-color="bg-success-600"
          to="/tagihan"
        />
        <QuickActionCard
          title="Laporan Keuangan"
          description="Lihat rekapitulasi pembayaran"
          icon="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          icon-color="bg-accent-600"
          to="/tagihan"
        />
      </div>

      <!-- Tunggakan list -->
      <div class="bg-white border-2 border-stone-200 rounded-2xl overflow-hidden">
        <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
          <h3 class="text-[16px] font-bold text-text-primary">Daftar Tunggakan</h3>
        </div>
        <div v-if="summaryData.tunggakanList.length === 0" class="p-8 text-center">
          <p class="text-[15px] text-text-tertiary">Tidak ada tunggakan.</p>
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-stone-200 bg-surface-warm">
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em]"
                >
                  Siswa
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em]"
                >
                  Kelas
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em]"
                >
                  Bulan
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em]"
                >
                  Sisa
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em]"
                >
                  Jatuh Tempo
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em]"
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-100">
              <tr
                v-for="item in summaryData.tunggakanList"
                :key="`${item.siswaId}-${item.bulan}-${item.tahun}`"
                class="hover:bg-primary-50 transition-colors"
              >
                <td class="px-5 py-4 font-semibold text-text-primary text-[15px]">
                  {{ item.siswaNama }}
                </td>
                <td class="px-5 py-4 text-text-secondary text-[15px]">{{ item.kelasNama }}</td>
                <td class="px-5 py-4 text-text-secondary text-[15px]">
                  {{ item.bulan }}/{{ item.tahun }}
                </td>
                <td class="px-5 py-4 font-bold text-danger-700 text-[15px]">
                  {{ formatRupiah(item.sisa) }}
                </td>
                <td class="px-5 py-4 text-text-secondary text-[15px]">
                  {{ formatDate(item.tanggalJatuhTempo) }}
                </td>
                <td class="px-5 py-4">
                  <span
                    :class="[
                      'inline-flex items-center px-2.5 py-1 rounded-lg text-[13px] font-semibold',
                      item.status === 'belum_bayar'
                        ? 'bg-danger-50 text-danger-700'
                        : 'bg-warning-50 text-warning-700',
                    ]"
                    >{{ getStatusLabel(item.status) }}</span
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
