<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api/client';

// --- Types ---
type StatusSiswa = 'aktif' | 'tidak_aktif' | 'pindah' | 'lulus';

interface SiswaItem {
  id: string;
  nama: string;
  nisn: string | null;
  status: StatusSiswa;
}

interface KelasDetailResponse {
  id: string;
  nama: string;
  tingkat: number;
  waliKelasNama: string | null;
  siswa: SiswaItem[];
}

// --- State ---
const route = useRoute();
const loading = ref(true);
const error = ref<string | null>(null);
const notFound = ref(false);
const kelas = ref<KelasDetailResponse | null>(null);

// --- Computed ---
const kelasId = computed(() => route.params.id as string);

// --- Helpers ---
function getStatusLabel(status: StatusSiswa): string {
  switch (status) {
    case 'aktif':
      return 'Aktif';
    case 'tidak_aktif':
      return 'Tidak Aktif';
    case 'pindah':
      return 'Pindah';
    case 'lulus':
      return 'Lulus';
    default:
      return status;
  }
}

function getStatusBadgeClass(status: StatusSiswa): string {
  switch (status) {
    case 'aktif':
      return 'bg-success-50 text-success-700';
    case 'tidak_aktif':
      return 'bg-stone-100 text-stone-500';
    case 'pindah':
      return 'bg-warning-50 text-warning-700';
    case 'lulus':
      return 'bg-primary-50 text-primary-700';
    default:
      return 'bg-surface-100 text-text-secondary';
  }
}

// --- API ---
async function fetchKelasDetail() {
  loading.value = true;
  error.value = null;
  notFound.value = false;
  try {
    const { data } = await api.get<KelasDetailResponse>(`/kelas/${kelasId.value}`);
    kelas.value = data;
  } catch (err: any) {
    if (err.response?.status === 404) {
      notFound.value = true;
    } else {
      error.value = 'Gagal memuat data kelas. Silakan coba lagi.';
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchKelasDetail();
});
</script>

<template>
  <div class="p-8 max-w-7xl mx-auto">
    <!-- Back link -->
    <div class="mb-5">
      <router-link
        to="/kelas"
        class="inline-flex items-center gap-1.5 text-[15px] text-text-secondary hover:text-primary-600 transition-colors duration-200"
      >
        <svg
          class="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.75"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Kembali ke Daftar Kelas
      </router-link>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="space-y-6">
      <div class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden">
        <div class="px-6 py-5 bg-primary-50 border-b-2 border-primary-200">
          <div class="animate-pulse h-5 bg-primary-100 rounded w-40"></div>
        </div>
        <div class="p-6">
          <div class="animate-pulse space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="h-4 bg-surface-100 rounded w-32"></div>
              <div class="h-4 bg-surface-100 rounded w-20"></div>
              <div class="h-4 bg-surface-100 rounded w-36"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden">
        <div class="px-6 py-5 bg-primary-50 border-b-2 border-primary-200">
          <div class="animate-pulse h-5 bg-primary-100 rounded w-36"></div>
        </div>
        <div class="p-6 space-y-3">
          <div v-for="n in 4" :key="n" class="animate-pulse h-10 bg-surface-100 rounded"></div>
        </div>
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
        class="px-[18px] py-[10px] text-[14px] font-semibold text-white bg-primary-600 rounded-[8px] shadow-[0_2px_8px_rgba(37,99,235,0.3)] hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(37,99,235,0.4)] transition-all duration-200"
        @click="fetchKelasDetail"
      >
        Coba Lagi
      </button>
    </div>

    <!-- 404 State -->
    <div
      v-else-if="notFound"
      class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs p-12 text-center"
    >
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
          d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <p class="text-[15px] text-text-secondary mb-4">Data kelas tidak ditemukan.</p>
      <router-link
        to="/kelas"
        class="inline-block px-[18px] py-[10px] text-[14px] font-semibold text-white bg-primary-600 rounded-[8px] shadow-[0_2px_8px_rgba(37,99,235,0.3)] hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(37,99,235,0.4)] transition-all duration-200"
      >
        Kembali ke Daftar Kelas
      </router-link>
    </div>

    <!-- Main Content -->
    <div v-else-if="kelas" class="space-y-6">
      <!-- Kelas Info Card -->
      <div class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden">
        <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
          <h2 class="text-[16px] font-bold text-primary-800">{{ kelas.nama }}</h2>
        </div>
        <div class="p-6">
          <dl class="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-4">
            <div>
              <dt class="text-[13px] font-bold text-text-tertiary uppercase tracking-[0.04em]">
                Nama Kelas
              </dt>
              <dd class="text-[15px] text-text-primary mt-1 font-semibold">{{ kelas.nama }}</dd>
            </div>
            <div>
              <dt class="text-[13px] font-bold text-text-tertiary uppercase tracking-[0.04em]">
                Tingkat
              </dt>
              <dd class="text-[15px] text-text-primary mt-1">{{ kelas.tingkat }}</dd>
            </div>
            <div>
              <dt class="text-[13px] font-bold text-text-tertiary uppercase tracking-[0.04em]">
                Wali Kelas
              </dt>
              <dd class="text-[15px] text-text-primary mt-1">
                {{ kelas.waliKelasNama ?? '-' }}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <!-- Daftar Siswa Card -->
      <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
        <!-- Section Header -->
        <div
          class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200 flex items-center justify-between"
        >
          <h3 class="text-[16px] font-bold text-primary-800">Daftar Siswa</h3>
          <span class="text-[13px] font-semibold text-stone-500">
            {{ kelas.siswa.length }} siswa
          </span>
        </div>

        <!-- Populated Table -->
        <div v-if="kelas.siswa.length > 0" class="overflow-x-auto">
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
                  Nama Siswa
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
                >
                  NISN
                </th>
                <th
                  class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-200">
              <tr
                v-for="(siswa, index) in kelas.siswa"
                :key="siswa.id"
                class="hover:bg-primary-50 transition-colors"
              >
                <td class="px-5 py-4 text-[15px] text-stone-400 tabular-nums w-12">
                  {{ index + 1 }}
                </td>
                <td class="px-5 py-4 text-[15px] text-stone-800 font-medium">
                  {{ siswa.nama }}
                </td>
                <td class="px-5 py-4 text-[15px] text-stone-600 font-mono">
                  {{ siswa.nisn ?? '-' }}
                </td>
                <td class="px-5 py-4">
                  <span
                    :class="[
                      'inline-flex items-center px-2.5 py-1 rounded-md text-[13px] font-semibold',
                      getStatusBadgeClass(siswa.status),
                    ]"
                  >
                    {{ getStatusLabel(siswa.status) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Empty State -->
        <p v-else class="text-center text-[15px] text-stone-500 py-12">Tidak ada data ditemukan.</p>
      </div>
    </div>
  </div>
</template>
