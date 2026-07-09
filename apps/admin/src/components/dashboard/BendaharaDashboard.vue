<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';

interface TunggakanSiswa {
  siswa_id: string;
  siswa_nama: string;
  kelas_nama: string;
  bulan: number;
  tahun: number;
  nominal: number;
  total_dibayar: number;
  sisa: number;
  status: string;
  tanggal_jatuh_tempo: string;
}
interface TunggakanSummaryResponse {
  total_tunggakan: number;
  total_siswa_nunggak: number;
  total_tagihan_nunggak: number;
  tunggakan_list: TunggakanSiswa[];
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
    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div
        v-for="i in 3"
        :key="i"
        class="bg-white border border-border rounded-xl p-5 animate-pulse"
      >
        <div class="h-4 bg-surface-200 rounded w-24 mb-3" />
        <div class="h-7 bg-surface-200 rounded w-16" />
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="bg-white border border-border rounded-xl p-8 text-center">
      <p class="text-sm text-text-secondary mb-3">{{ error }}</p>
      <button
        class="text-sm font-medium text-primary-600 hover:text-primary-700"
        @click="fetchTunggakan"
      >
        Coba lagi
      </button>
    </div>

    <template v-else-if="summaryData">
      <!-- Summary Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div class="bg-white border border-border rounded-xl p-5">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm text-text-secondary">Total Tunggakan</span>
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
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
          <p class="text-xl font-semibold text-danger-700">
            {{ formatRupiah(summaryData.total_tunggakan) }}
          </p>
        </div>
        <div class="bg-white border border-border rounded-xl p-5">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm text-text-secondary">Siswa Menunggak</span>
            <div class="w-8 h-8 rounded-lg bg-warning-50 flex items-center justify-center">
              <svg
                class="w-4 h-4 text-warning-700"
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
          <p class="text-2xl font-semibold text-text-primary">
            {{ summaryData.total_siswa_nunggak }}
          </p>
        </div>
        <div class="bg-white border border-border rounded-xl p-5">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm text-text-secondary">Tagihan Tertunggak</span>
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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
          </div>
          <p class="text-2xl font-semibold text-text-primary">
            {{ summaryData.total_tagihan_nunggak }}
          </p>
        </div>
      </div>

      <!-- Tunggakan list -->
      <div class="bg-white border border-border rounded-xl overflow-hidden">
        <div class="px-4 py-3 border-b border-border">
          <h3 class="text-sm font-semibold text-text-primary">Daftar Tunggakan</h3>
        </div>
        <div v-if="summaryData.tunggakan_list.length === 0" class="p-8 text-center">
          <p class="text-sm text-text-tertiary">Tidak ada tunggakan.</p>
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border bg-surface-50">
                <th class="px-4 py-2.5 text-left font-medium text-text-secondary text-xs">Siswa</th>
                <th class="px-4 py-2.5 text-left font-medium text-text-secondary text-xs">Kelas</th>
                <th class="px-4 py-2.5 text-left font-medium text-text-secondary text-xs">Bulan</th>
                <th class="px-4 py-2.5 text-left font-medium text-text-secondary text-xs">Sisa</th>
                <th class="px-4 py-2.5 text-left font-medium text-text-secondary text-xs">
                  Jatuh Tempo
                </th>
                <th class="px-4 py-2.5 text-left font-medium text-text-secondary text-xs">
                  Status
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="item in summaryData.tunggakan_list"
                :key="`${item.siswa_id}-${item.bulan}-${item.tahun}`"
                class="hover:bg-surface-50 transition-colors"
              >
                <td class="px-4 py-2.5 font-medium text-text-primary">{{ item.siswa_nama }}</td>
                <td class="px-4 py-2.5 text-text-secondary">{{ item.kelas_nama }}</td>
                <td class="px-4 py-2.5 text-text-secondary">{{ item.bulan }}/{{ item.tahun }}</td>
                <td class="px-4 py-2.5 font-medium text-danger-700">
                  {{ formatRupiah(item.sisa) }}
                </td>
                <td class="px-4 py-2.5 text-text-secondary">
                  {{ formatDate(item.tanggal_jatuh_tempo) }}
                </td>
                <td class="px-4 py-2.5">
                  <span
                    :class="[
                      'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
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
