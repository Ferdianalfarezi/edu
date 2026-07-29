<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api/client';

// --- Types ---
interface SiswaDetailProfil {
  id: string;
  nama: string;
  nisn: string | null;
  jenisKelamin: 'L' | 'P' | null;
  tanggalLahir: string | null;
  alamat: string | null;
  status: 'aktif' | 'pindah_sekolah' | 'keluar' | 'lulus';
  kelasNama: string | null;
  orangTuaNama: string | null;
}

interface RiwayatKelasEntry {
  kelasNama: string;
  tingkat: number;
  tahunAjaranNama: string;
  tanggalMulai: string;
  isCurrent: boolean;
}

interface RaporRingkasanEntry {
  tahunAjaranNama: string;
  periode: string;
  raporId: string;
  rataRata: number;
  peringkat: number | null;
}

interface SiswaDetailResponse {
  profil: SiswaDetailProfil;
  riwayatKelas: RiwayatKelasEntry[];
  raporRingkasan: RaporRingkasanEntry[];
}

interface RaporNilaiEntry {
  mataPelajaranNama: string;
  komponenNilai: Array<{ komponenNama: string | null; nilai: string | number }>;
  rataRata: string;
  guruNama: string;
  capaianPembelajaran: string | null;
}

interface RaporDetailResponse {
  nilai: RaporNilaiEntry[];
}

// --- State ---
const route = useRoute();

const loading = ref(true);
const error = ref<string | null>(null);
const notFound = ref(false);
const detail = ref<SiswaDetailResponse | null>(null);

const expandedRaporId = ref<string | null>(null);
const raporDetailLoading = ref(false);
const raporDetailError = ref<string | null>(null);
const raporDetailCache = ref<Record<string, RaporNilaiEntry[]>>({});

// --- Computed ---
const siswaId = computed(() => route.params.id as string);

const raporGrouped = computed(() => {
  if (!detail.value) return [];
  const groups: Record<string, RaporRingkasanEntry[]> = {};
  for (const entry of detail.value.raporRingkasan) {
    if (!groups[entry.tahunAjaranNama]) {
      groups[entry.tahunAjaranNama] = [];
    }
    groups[entry.tahunAjaranNama].push(entry);
  }
  return Object.entries(groups).map(([tahunAjaran, items]) => ({
    tahunAjaranNama: tahunAjaran,
    items,
  }));
});

// --- Helpers ---
const BULAN_INDONESIA = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function formatTanggalLahir(dateStr: string | null): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const day = parseInt(parts[2], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const year = parts[0];
  if (monthIdx < 0 || monthIdx > 11) return dateStr;
  return `${day} ${BULAN_INDONESIA[monthIdx]} ${year}`;
}

function formatJenisKelamin(jk: 'L' | 'P' | null): string {
  if (jk === 'L') return 'Laki-laki';
  if (jk === 'P') return 'Perempuan';
  return '-';
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'aktif':
      return 'bg-success-50 text-success-700';
    case 'pindah_sekolah':
    case 'keluar':
      return 'bg-danger-50 text-danger-700';
    case 'lulus':
      return 'bg-primary-50 text-primary-700';
    default:
      return 'bg-surface-100 text-text-secondary';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'aktif':
      return 'Aktif';
    case 'pindah_sekolah':
      return 'Pindah Sekolah';
    case 'keluar':
      return 'Keluar';
    case 'lulus':
      return 'Lulus';
    default:
      return status;
  }
}

function getPeriodeLabel(periode: string): string {
  switch (periode) {
    case 'uts_semester_1':
      return 'UTS Semester 1';
    case 'semester_1':
      return 'Semester 1';
    case 'uts_semester_2':
      return 'UTS Semester 2';
    case 'semester_2':
      return 'Semester 2';
    default:
      return periode;
  }
}

// Avatar helper functions for Data_Table name column
const AVATAR_GRADIENTS = [
  '#2563EB, #1D4ED8',
  '#16A34A, #15803D',
  '#D97706, #B45309',
  '#9333EA, #7E22CE',
  '#DC2626, #B91C1C',
  '#0891B2, #0E7490',
  '#4F46E5, #4338CA',
  '#EA580C, #C2410C',
];

function getInitials(nama: string): string {
  const parts = nama.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function getAvatarColor(nama: string): string {
  let hash = 0;
  for (let i = 0; i < nama.length; i++) {
    hash = nama.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

// Progress bar color helpers for percentage/rata-rata columns
function getRataRataColor(value: number): string {
  if (value >= 80) return 'text-success-700';
  if (value >= 60) return 'text-warning-700';
  return 'text-danger-700';
}

function getRataRataBarColor(value: number): string {
  if (value >= 80) return 'bg-success-500';
  if (value >= 60) return 'bg-warning-500';
  return 'bg-danger-500';
}

// --- API calls ---
async function fetchDetail() {
  loading.value = true;
  error.value = null;
  notFound.value = false;
  try {
    const { data } = await api.get<SiswaDetailResponse>(`/siswa/${siswaId.value}/detail`);
    detail.value = data;
  } catch (err: any) {
    if (err.response?.status === 404) {
      notFound.value = true;
    } else {
      error.value = 'Gagal memuat data siswa. Silakan coba lagi.';
    }
  } finally {
    loading.value = false;
  }
}

async function toggleRaporDetail(raporId: string) {
  if (expandedRaporId.value === raporId) {
    expandedRaporId.value = null;
    return;
  }

  expandedRaporId.value = raporId;
  raporDetailError.value = null;

  if (raporDetailCache.value[raporId]) {
    return;
  }

  raporDetailLoading.value = true;
  try {
    const { data } = await api.get<RaporDetailResponse>(`/siswa/${siswaId.value}/rapor/${raporId}`);
    raporDetailCache.value[raporId] = data.nilai;
  } catch {
    raporDetailError.value = 'Gagal memuat detail rapor. Silakan coba lagi.';
  } finally {
    raporDetailLoading.value = false;
  }
}

async function retryRaporDetail() {
  if (!expandedRaporId.value) return;
  const raporId = expandedRaporId.value;
  raporDetailError.value = null;
  raporDetailLoading.value = true;
  try {
    const { data } = await api.get<RaporDetailResponse>(`/siswa/${siswaId.value}/rapor/${raporId}`);
    raporDetailCache.value[raporId] = data.nilai;
  } catch {
    raporDetailError.value = 'Gagal memuat detail rapor. Silakan coba lagi.';
  } finally {
    raporDetailLoading.value = false;
  }
}

onMounted(() => {
  fetchDetail();
});
</script>

<template>
  <div class="p-8">
    <!-- Back link -->
    <div class="mb-5">
      <router-link
        to="/siswa"
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
        Kembali ke Daftar Siswa
      </router-link>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="space-y-6">
      <!-- Skeleton profile card -->
      <div class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden">
        <div class="px-6 py-5 bg-primary-50 border-b-2 border-primary-200">
          <div class="animate-pulse h-5 bg-primary-100 rounded w-40"></div>
        </div>
        <div class="p-6">
          <div class="animate-pulse space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="h-4 bg-surface-100 rounded w-32"></div>
              <div class="h-4 bg-surface-100 rounded w-40"></div>
              <div class="h-4 bg-surface-100 rounded w-36"></div>
              <div class="h-4 bg-surface-100 rounded w-28"></div>
              <div class="h-4 bg-surface-100 rounded w-44"></div>
              <div class="h-4 bg-surface-100 rounded w-24"></div>
            </div>
          </div>
        </div>
      </div>
      <!-- Skeleton timeline -->
      <div class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden">
        <div class="px-6 py-5 bg-primary-50 border-b-2 border-primary-200">
          <div class="animate-pulse h-5 bg-primary-100 rounded w-36"></div>
        </div>
        <div class="p-6">
          <div class="animate-pulse space-y-3">
            <div class="h-4 bg-surface-100 rounded w-64"></div>
            <div class="h-4 bg-surface-100 rounded w-56"></div>
          </div>
        </div>
      </div>
      <!-- Skeleton rapor -->
      <div class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden">
        <div class="px-6 py-5 bg-primary-50 border-b-2 border-primary-200">
          <div class="animate-pulse h-5 bg-primary-100 rounded w-40"></div>
        </div>
        <div class="p-6">
          <div class="animate-pulse space-y-3">
            <div class="h-4 bg-surface-100 rounded w-72"></div>
            <div class="h-4 bg-surface-100 rounded w-60"></div>
          </div>
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
        @click="fetchDetail"
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
          d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z"
        />
      </svg>
      <p class="text-[15px] text-text-secondary mb-4">Data siswa tidak ditemukan</p>
      <router-link
        to="/siswa"
        class="inline-block px-[18px] py-[10px] text-[14px] font-semibold text-white bg-primary-600 rounded-[8px] shadow-[0_2px_8px_rgba(37,99,235,0.3)] hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(37,99,235,0.4)] transition-all duration-200"
      >
        Kembali ke Daftar Siswa
      </router-link>
    </div>

    <!-- Detail Content -->
    <div v-else-if="detail" class="space-y-6">
      <!-- Profile Card -->
      <div class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden">
        <!-- Section Header -->
        <div
          class="flex items-center justify-between px-6 py-5 bg-primary-50 border-b-2 border-primary-200"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-[38px] h-[38px] rounded-full flex items-center justify-center text-white text-[14px] font-bold"
              :style="{
                background: `linear-gradient(135deg, ${getAvatarColor(detail.profil.nama)})`,
              }"
            >
              {{ getInitials(detail.profil.nama) }}
            </div>
            <h3 class="text-[16px] font-bold text-primary-800">{{ detail.profil.nama }}</h3>
          </div>
          <span
            :class="[
              'inline-flex items-center px-2.5 py-1 rounded-md text-[13px] font-semibold',
              getStatusBadgeClass(detail.profil.status),
            ]"
          >
            {{ getStatusLabel(detail.profil.status) }}
          </span>
        </div>

        <div class="p-6">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt class="text-[13px] font-bold text-text-tertiary uppercase tracking-[0.04em]">
                NISN
              </dt>
              <dd class="text-[15px] text-text-primary mt-1 font-mono">
                {{ detail.profil.nisn || '-' }}
              </dd>
            </div>
            <div>
              <dt class="text-[13px] font-bold text-text-tertiary uppercase tracking-[0.04em]">
                Jenis Kelamin
              </dt>
              <dd class="text-[15px] text-text-primary mt-1">
                {{ formatJenisKelamin(detail.profil.jenisKelamin) }}
              </dd>
            </div>
            <div>
              <dt class="text-[13px] font-bold text-text-tertiary uppercase tracking-[0.04em]">
                Tanggal Lahir
              </dt>
              <dd class="text-[15px] text-text-primary mt-1">
                {{ formatTanggalLahir(detail.profil.tanggalLahir) }}
              </dd>
            </div>
            <div>
              <dt class="text-[13px] font-bold text-text-tertiary uppercase tracking-[0.04em]">
                Alamat
              </dt>
              <dd class="text-[15px] text-text-primary mt-1">{{ detail.profil.alamat || '-' }}</dd>
            </div>
            <div>
              <dt class="text-[13px] font-bold text-text-tertiary uppercase tracking-[0.04em]">
                Kelas
              </dt>
              <dd class="text-[15px] text-text-primary mt-1">
                {{ detail.profil.kelasNama || 'Belum ditempatkan' }}
              </dd>
            </div>
            <div>
              <dt class="text-[13px] font-bold text-text-tertiary uppercase tracking-[0.04em]">
                Orang Tua / Wali
              </dt>
              <dd class="text-[15px] text-text-primary mt-1">
                {{ detail.profil.orangTuaNama || '-' }}
              </dd>
            </div>
          </div>
        </div>
      </div>

      <!-- Timeline Riwayat Kelas -->
      <div class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden">
        <!-- Section Header -->
        <div
          class="flex items-center justify-between px-6 py-5 bg-primary-50 border-b-2 border-primary-200"
        >
          <h3 class="text-[16px] font-bold text-primary-800">Riwayat Kelas</h3>
        </div>

        <div class="p-6">
          <div v-if="detail.riwayatKelas.length === 0" class="text-[15px] text-text-tertiary">
            Belum ada riwayat kelas
          </div>

          <div v-else class="space-y-4">
            <div v-for="(entry, idx) in detail.riwayatKelas" :key="idx" class="relative pl-6">
              <!-- Timeline line -->
              <div
                v-if="idx < detail.riwayatKelas.length - 1"
                class="absolute left-[5px] top-4 bottom-[-16px] w-0.5 bg-stone-200"
              ></div>
              <!-- Timeline dot -->
              <div
                :class="[
                  'absolute left-0 top-1 w-3 h-3 rounded-full border-2',
                  entry.isCurrent
                    ? 'bg-success-500 border-success-200'
                    : 'bg-stone-200 border-stone-100',
                ]"
              ></div>

              <div class="flex items-start gap-2">
                <div>
                  <p class="text-[15px] font-semibold text-text-primary">
                    {{ entry.kelasNama }}
                    <span class="text-text-tertiary font-normal"
                      >(Tingkat {{ entry.tingkat }})</span
                    >
                  </p>
                  <p class="text-[13px] text-text-secondary mt-0.5">
                    {{ entry.tahunAjaranNama }} &middot;
                    {{ formatTanggalLahir(entry.tanggalMulai) }}
                  </p>
                </div>
                <span
                  v-if="entry.isCurrent"
                  class="inline-flex items-center px-2.5 py-1 rounded-md text-[13px] font-semibold bg-success-50 text-success-700 shrink-0"
                >
                  Aktif
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Rapor Ringkasan -->
      <div class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden">
        <!-- Section Header -->
        <div
          class="flex items-center justify-between px-6 py-5 bg-primary-50 border-b-2 border-primary-200"
        >
          <h3 class="text-[16px] font-bold text-primary-800">Ringkasan Rapor</h3>
        </div>

        <div class="p-6">
          <div v-if="raporGrouped.length === 0" class="text-[15px] text-text-tertiary">
            Belum ada data rapor
          </div>

          <div v-else class="space-y-6">
            <div v-for="group in raporGrouped" :key="group.tahunAjaranNama">
              <h4 class="text-[14px] font-semibold text-text-secondary mb-3">
                {{ group.tahunAjaranNama }}
              </h4>

              <div class="space-y-2">
                <div v-for="entry in group.items" :key="entry.raporId">
                  <!-- Accordion header -->
                  <button
                    class="w-full flex items-center justify-between px-5 py-3.5 bg-surface-warm hover:bg-surface-100 rounded-[8px] transition-colors duration-200 text-left border border-stone-200"
                    @click="toggleRaporDetail(entry.raporId)"
                  >
                    <div class="flex items-center gap-4">
                      <span class="text-[15px] font-semibold text-text-primary">{{
                        getPeriodeLabel(entry.periode)
                      }}</span>
                      <span class="text-[13px] text-text-secondary">
                        Rata-rata:
                        <strong class="text-text-primary">{{ entry.rataRata.toFixed(1) }}</strong>
                      </span>
                      <span v-if="entry.peringkat !== null" class="text-[13px] text-text-secondary">
                        Peringkat: <strong class="text-text-primary">{{ entry.peringkat }}</strong>
                      </span>
                    </div>
                    <svg
                      :class="[
                        'w-4 h-4 text-text-tertiary transition-transform duration-200',
                        expandedRaporId === entry.raporId ? 'rotate-180' : '',
                      ]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  <!-- Accordion content -->
                  <div
                    v-if="expandedRaporId === entry.raporId"
                    class="mt-2 bg-white border-2 border-stone-200 rounded-[12px] overflow-hidden"
                  >
                    <!-- Loading -->
                    <div
                      v-if="raporDetailLoading && !raporDetailCache[entry.raporId]"
                      class="flex items-center justify-center py-6"
                    >
                      <svg
                        class="w-5 h-5 animate-spin text-primary-500"
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
                      <span class="ml-2 text-[15px] text-text-tertiary"
                        >Memuat detail rapor...</span
                      >
                    </div>

                    <!-- Error -->
                    <div
                      v-else-if="raporDetailError && !raporDetailCache[entry.raporId]"
                      class="text-center py-6"
                    >
                      <p class="text-[15px] text-danger-600 mb-2">{{ raporDetailError }}</p>
                      <button
                        class="text-[14px] font-semibold text-primary-600 hover:text-primary-700 transition-colors"
                        @click="retryRaporDetail"
                      >
                        Coba Lagi
                      </button>
                    </div>

                    <!-- Detail content with Data_Table styling -->
                    <div v-else-if="raporDetailCache[entry.raporId]">
                      <div class="overflow-x-auto">
                        <table class="w-full">
                          <thead>
                            <tr class="border-b-2 border-stone-200">
                              <th
                                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                              >
                                Mata Pelajaran
                              </th>
                              <th
                                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                              >
                                Komponen Nilai
                              </th>
                              <th
                                class="text-center px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                              >
                                Rata-rata
                              </th>
                              <th
                                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                              >
                                Guru
                              </th>
                              <th
                                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                              >
                                Capaian
                              </th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-stone-200">
                            <tr
                              v-for="(nilai, nIdx) in raporDetailCache[entry.raporId]"
                              :key="nIdx"
                              class="hover:bg-primary-50 transition-colors duration-200"
                            >
                              <td class="px-5 py-4 text-[15px] font-semibold text-text-primary">
                                {{ nilai.mataPelajaranNama }}
                              </td>
                              <td class="px-5 py-4">
                                <div class="space-y-1">
                                  <div
                                    v-for="(komp, kIdx) in nilai.komponenNilai"
                                    :key="kIdx"
                                    class="text-[13px] text-text-secondary"
                                  >
                                    <span class="text-text-tertiary"
                                      >{{ komp.komponenNama || '-' }}:</span
                                    >
                                    <span class="font-semibold text-text-primary ml-1">{{
                                      komp.nilai
                                    }}</span>
                                  </div>
                                </div>
                              </td>
                              <td class="px-5 py-4 text-center">
                                <!-- Progress bar for rata-rata -->
                                <div class="flex flex-col items-center gap-1">
                                  <span
                                    :class="[
                                      'text-[15px] font-bold',
                                      getRataRataColor(Number(nilai.rataRata)),
                                    ]"
                                  >
                                    {{ nilai.rataRata }}
                                  </span>
                                  <div
                                    class="w-full max-w-[80px] h-[8px] bg-stone-200 rounded-full overflow-hidden"
                                  >
                                    <div
                                      class="h-full rounded-full transition-all duration-300"
                                      :class="getRataRataBarColor(Number(nilai.rataRata))"
                                      :style="{
                                        width: `${Math.min(Number(nilai.rataRata), 100)}%`,
                                      }"
                                    ></div>
                                  </div>
                                </div>
                              </td>
                              <td class="px-5 py-4 text-[15px] text-text-secondary">
                                {{ nilai.guruNama }}
                              </td>
                              <td class="px-5 py-4 text-[13px] text-text-secondary">
                                {{ nilai.capaianPembelajaran || '-' }}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
