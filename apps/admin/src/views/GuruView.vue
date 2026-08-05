<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';

// --- Types ---
interface GuruItem {
  id: string;
  nama: string;
  email: string;
  telepon: string | null;
}

interface GuruListResponse {
  data: GuruItem[];
}

// --- State ---
const loading = ref(true);
const error = ref<string | null>(null);
const guruList = ref<GuruItem[]>([]);

// --- API ---
async function fetchGuru() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<GuruListResponse>('/users', { params: { role: 'guru' } });
    guruList.value = data.data;
  } catch (err: any) {
    error.value = 'Gagal memuat data guru. Silakan coba lagi.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchGuru();
});
</script>

<template>
  <div class="p-8 max-w-7xl mx-auto">
    <!-- Page Header -->
    <div class="mb-6">
      <h1 class="text-[22px] font-bold text-text-primary">Daftar Guru</h1>
      <p class="text-[14px] text-text-secondary mt-1">Seluruh guru aktif di sekolah ini.</p>
    </div>

    <!-- Loading State -->
    <div
      v-if="loading"
      class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden"
    >
      <div class="px-6 py-5 bg-primary-50 border-b-2 border-primary-200">
        <div class="animate-pulse h-5 bg-primary-100 rounded w-36"></div>
      </div>
      <div class="p-6 space-y-3">
        <div v-for="n in 5" :key="n" class="animate-pulse h-10 bg-surface-100 rounded"></div>
      </div>
    </div>

    <!-- Error State -->
    <div
      v-else-if="error"
      class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs p-12 text-center"
    >
      <svg
        class="w-10 h-10 text-danger-400 mx-auto mb-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
        />
      </svg>
      <p class="text-[15px] text-text-secondary mb-4">{{ error }}</p>
      <button
        class="px-4.5 py-2.5 text-[14px] font-semibold text-white bg-primary-600 rounded-xs shadow-[0_2px_8px_rgba(37,99,235,0.3)] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(37,99,235,0.4)] transition-all duration-200"
        @click="fetchGuru"
      >
        Coba Lagi
      </button>
    </div>

    <!-- Main Content -->
    <div v-else class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
      <!-- Section Header -->
      <div
        class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200 flex items-center justify-between"
      >
        <h3 class="text-[16px] font-bold text-primary-800">Daftar Guru</h3>
        <span class="text-[13px] font-semibold text-stone-500"> {{ guruList.length }} guru </span>
      </div>

      <!-- Populated Table -->
      <div v-if="guruList.length > 0" class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b-2 border-stone-200">
            <tr>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                No
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Nama Lengkap
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Email
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Nomor Telepon
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-200">
            <tr
              v-for="(guru, index) in guruList"
              :key="guru.id"
              class="hover:bg-primary-50 transition-colors"
            >
              <td class="px-5 py-4 text-[15px] text-stone-400 tabular-nums w-12">
                {{ index + 1 }}
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-800 font-medium">
                {{ guru.nama }}
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-600">
                {{ guru.email }}
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-600 font-mono">
                {{ guru.telepon ?? '-' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Empty State -->
      <p v-else class="text-center text-[15px] text-stone-500 py-12">Tidak ada data ditemukan.</p>
    </div>
  </div>
</template>
