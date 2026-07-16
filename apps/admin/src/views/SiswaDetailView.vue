<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api/client';

// --- Types ---
interface SiswaDetailProfil {
  id: string;
  nama: string;
  nisn: string | null;
  jenis_kelamin: 'L' | 'P' | null;
  tanggal_lahir: string | null;
  alamat: string | null;
  status: 'aktif' | 'pindah_sekolah' | 'keluar' | 'lulus';
  kelas_nama: string | null;
  orang_tua_nama: string | null;
}

interface RiwayatKelasEntry {
  kelas_nama: string;
  tingkat: number;
  tahun_ajaran_nama: string;
  tanggal_mulai: string;
  is_current: boolean;
}

interface RaporRingkasanEntry {
  tahun_ajaran_nama: string;
  periode: string;
  rapor_id: string;
  rata_rata: number;
  peringkat: number | null;
}

interface SiswaDetailResponse {
  profil: SiswaDetailProfil;
  riwayat_kelas: RiwayatKelasEntry[];
  rapor_ringkasan: RaporRingkasanEntry[];
}

interface RaporNilaiEntry {
  mata_pelajaran_nama: string;
  komponen_nilai: Array<{ komponen_nama: string | null; nilai: string | number }>;
  rata_rata: string;
  guru_nama: string;
  capaian_pembelajaran: string | null;
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
  for (const entry of detail.value.rapor_ringkasan) {
    if (!groups[entry.tahun_ajaran_nama]) {
      groups[entry.tahun_ajaran_nama] = [];
    }
    groups[entry.tahun_ajaran_nama].push(entry);
  }
  return Object.entries(groups).map(([tahunAjaran, items]) => ({
    tahun_ajaran_nama: tahunAjaran,
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
  <div class="p-4 lg:p-6 max-w-5xl mx-auto">
    <!-- Back link -->
    <div class="mb-4">
      <router-link
        to="/siswa"
        class="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary-600 transition-colors"
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
      <div class="bg-white border border-border rounded-xl p-6">
        <div class="animate-pulse space-y-4">
          <div class="h-6 bg-surface-100 rounded w-48"></div>
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
      <!-- Skeleton timeline -->
      <div class="bg-white border border-border rounded-xl p-6">
        <div class="animate-pulse space-y-3">
          <div class="h-5 bg-surface-100 rounded w-40"></div>
          <div class="h-4 bg-surface-100 rounded w-64"></div>
          <div class="h-4 bg-surface-100 rounded w-56"></div>
        </div>
      </div>
      <!-- Skeleton rapor -->
      <div class="bg-white border border-border rounded-xl p-6">
        <div class="animate-pulse space-y-3">
          <div class="h-5 bg-surface-100 rounded w-36"></div>
          <div class="h-4 bg-surface-100 rounded w-72"></div>
          <div class="h-4 bg-surface-100 rounded w-60"></div>
        </div>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="bg-white border border-border rounded-xl p-12 text-center">
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
      <p class="text-sm text-text-secondary mb-4">{{ error }}</p>
      <button
        class="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
        @click="fetchDetail"
      >
        Coba Lagi
      </button>
    </div>

    <!-- 404 State -->
    <div v-else-if="notFound" class="bg-white border border-border rounded-xl p-12 text-center">
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
      <p class="text-sm text-text-secondary mb-4">Data siswa tidak ditemukan</p>
      <router-link
        to="/siswa"
        class="inline-block px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
      >
        Kembali ke Daftar Siswa
      </router-link>
    </div>

    <!-- Detail Content -->
    <div v-else-if="detail" class="space-y-6">
      <!-- Profile Card -->
      <div class="bg-white border border-border rounded-xl p-6">
        <div class="flex items-start justify-between mb-4">
          <h2 class="text-lg font-semibold text-text-primary">{{ detail.profil.nama }}</h2>
          <span
            :class="[
              'inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium',
              getStatusBadgeClass(detail.profil.status),
            ]"
          >
            {{ getStatusLabel(detail.profil.status) }}
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <div>
            <dt class="text-xs font-medium text-text-tertiary uppercase tracking-wide">NISN</dt>
            <dd class="text-sm text-text-primary mt-0.5 font-mono">
              {{ detail.profil.nisn || '-' }}
            </dd>
          </div>
          <div>
            <dt class="text-xs font-medium text-text-tertiary uppercase tracking-wide">
              Jenis Kelamin
            </dt>
            <dd class="text-sm text-text-primary mt-0.5">
              {{ formatJenisKelamin(detail.profil.jenis_kelamin) }}
            </dd>
          </div>
          <div>
            <dt class="text-xs font-medium text-text-tertiary uppercase tracking-wide">
              Tanggal Lahir
            </dt>
            <dd class="text-sm text-text-primary mt-0.5">
              {{ formatTanggalLahir(detail.profil.tanggal_lahir) }}
            </dd>
          </div>
          <div>
            <dt class="text-xs font-medium text-text-tertiary uppercase tracking-wide">Alamat</dt>
            <dd class="text-sm text-text-primary mt-0.5">{{ detail.profil.alamat || '-' }}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium text-text-tertiary uppercase tracking-wide">Kelas</dt>
            <dd class="text-sm text-text-primary mt-0.5">
              {{ detail.profil.kelas_nama || 'Belum ditempatkan' }}
            </dd>
          </div>
          <div>
            <dt class="text-xs font-medium text-text-tertiary uppercase tracking-wide">
              Orang Tua / Wali
            </dt>
            <dd class="text-sm text-text-primary mt-0.5">
              {{ detail.profil.orang_tua_nama || '-' }}
            </dd>
          </div>
        </div>
      </div>

      <!-- Timeline Riwayat Kelas -->
      <div class="bg-white border border-border rounded-xl p-6">
        <h3 class="text-base font-semibold text-text-primary mb-4">Riwayat Kelas</h3>

        <div v-if="detail.riwayat_kelas.length === 0" class="text-sm text-text-tertiary">
          Belum ada riwayat kelas
        </div>

        <div v-else class="relative pl-6 border-l-2 border-surface-200 space-y-4">
          <div v-for="(entry, idx) in detail.riwayat_kelas" :key="idx" class="relative">
            <!-- Timeline dot -->
            <div
              :class="[
                'absolute left-[-25px] top-1 w-3 h-3 rounded-full border-2',
                entry.is_current
                  ? 'bg-success-500 border-success-200'
                  : 'bg-surface-200 border-surface-100',
              ]"
            ></div>

            <div class="flex items-start gap-2">
              <div>
                <p class="text-sm font-medium text-text-primary">
                  {{ entry.kelas_nama }}
                  <span class="text-text-tertiary font-normal">(Tingkat {{ entry.tingkat }})</span>
                </p>
                <p class="text-xs text-text-secondary mt-0.5">
                  {{ entry.tahun_ajaran_nama }} &middot;
                  {{ formatTanggalLahir(entry.tanggal_mulai) }}
                </p>
              </div>
              <span
                v-if="entry.is_current"
                class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-success-50 text-success-700 shrink-0"
              >
                Aktif
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Rapor Ringkasan -->
      <div class="bg-white border border-border rounded-xl p-6">
        <h3 class="text-base font-semibold text-text-primary mb-4">Ringkasan Rapor</h3>

        <div v-if="raporGrouped.length === 0" class="text-sm text-text-tertiary">
          Belum ada data rapor
        </div>

        <div v-else class="space-y-6">
          <div v-for="group in raporGrouped" :key="group.tahun_ajaran_nama">
            <h4 class="text-sm font-medium text-text-secondary mb-2">
              {{ group.tahun_ajaran_nama }}
            </h4>

            <div class="space-y-1">
              <div v-for="entry in group.items" :key="entry.rapor_id">
                <!-- Accordion header -->
                <button
                  class="w-full flex items-center justify-between px-4 py-3 bg-surface-50 hover:bg-surface-100 rounded-lg transition-colors text-left"
                  @click="toggleRaporDetail(entry.rapor_id)"
                >
                  <div class="flex items-center gap-4">
                    <span class="text-sm font-medium text-text-primary">{{
                      getPeriodeLabel(entry.periode)
                    }}</span>
                    <span class="text-xs text-text-secondary">
                      Rata-rata:
                      <strong class="text-text-primary">{{ entry.rata_rata.toFixed(1) }}</strong>
                    </span>
                    <span v-if="entry.peringkat !== null" class="text-xs text-text-secondary">
                      Peringkat: <strong class="text-text-primary">{{ entry.peringkat }}</strong>
                    </span>
                  </div>
                  <svg
                    :class="[
                      'w-4 h-4 text-text-tertiary transition-transform',
                      expandedRaporId === entry.rapor_id ? 'rotate-180' : '',
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
                  v-if="expandedRaporId === entry.rapor_id"
                  class="mt-1 px-4 py-3 bg-white border border-border rounded-lg"
                >
                  <!-- Loading -->
                  <div
                    v-if="raporDetailLoading && !raporDetailCache[entry.rapor_id]"
                    class="flex items-center justify-center py-4"
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
                    <span class="ml-2 text-sm text-text-tertiary">Memuat detail rapor...</span>
                  </div>

                  <!-- Error -->
                  <div
                    v-else-if="raporDetailError && !raporDetailCache[entry.rapor_id]"
                    class="text-center py-4"
                  >
                    <p class="text-sm text-danger-600 mb-2">{{ raporDetailError }}</p>
                    <button
                      class="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
                      @click="retryRaporDetail"
                    >
                      Coba Lagi
                    </button>
                  </div>

                  <!-- Detail content -->
                  <div v-else-if="raporDetailCache[entry.rapor_id]">
                    <div class="overflow-x-auto">
                      <table class="w-full text-sm">
                        <thead>
                          <tr class="border-b border-border">
                            <th class="text-left px-3 py-2 font-medium text-text-secondary text-xs">
                              Mata Pelajaran
                            </th>
                            <th class="text-left px-3 py-2 font-medium text-text-secondary text-xs">
                              Komponen Nilai
                            </th>
                            <th
                              class="text-center px-3 py-2 font-medium text-text-secondary text-xs"
                            >
                              Rata-rata
                            </th>
                            <th class="text-left px-3 py-2 font-medium text-text-secondary text-xs">
                              Guru
                            </th>
                            <th class="text-left px-3 py-2 font-medium text-text-secondary text-xs">
                              Capaian
                            </th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-border">
                          <tr v-for="(nilai, nIdx) in raporDetailCache[entry.rapor_id]" :key="nIdx">
                            <td class="px-3 py-2 font-medium text-text-primary">
                              {{ nilai.mata_pelajaran_nama }}
                            </td>
                            <td class="px-3 py-2">
                              <div class="space-y-0.5">
                                <div
                                  v-for="(komp, kIdx) in nilai.komponen_nilai"
                                  :key="kIdx"
                                  class="text-xs text-text-secondary"
                                >
                                  <span class="text-text-tertiary"
                                    >{{ komp.komponen_nama || '-' }}:</span
                                  >
                                  <span class="font-medium text-text-primary ml-1">{{
                                    komp.nilai
                                  }}</span>
                                </div>
                              </div>
                            </td>
                            <td class="px-3 py-2 text-center font-medium text-text-primary">
                              {{ nilai.rata_rata }}
                            </td>
                            <td class="px-3 py-2 text-text-secondary">{{ nilai.guru_nama }}</td>
                            <td class="px-3 py-2 text-xs text-text-secondary">
                              {{ nilai.capaian_pembelajaran || '-' }}
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
</template>
