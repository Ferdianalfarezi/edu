<script setup lang="ts">
/**
 * Jadwal Saya (guru): strip tanggal + tabel jadwal per tanggal.
 * Data dari GET /jadwal/saya/rentang (per tanggal, termasuk hari libur & guru pengganti).
 * Kolom waktu sementara memakai "Jam ke-n" (jam mulai–selesai belum diatur sekolah).
 */
import { ref, computed, watch, onMounted } from 'vue';
import { api } from '@/api/client';

interface JadwalItem {
  id: string;
  jamKe: number;
  kelasNama: string;
  mataPelajaranNama: string | null;
  kategori: 'mengajar' | 'digantikan' | 'menggantikan';
  guruLain: string | null;
}

interface HariJadwal {
  tanggal: string;
  hari: string;
  libur: string | null;
  jadwal: JadwalItem[];
}

const JUMLAH_HARI = 10;

const KATEGORI: Record<JadwalItem['kategori'], { label: string; kelas: string }> = {
  mengajar: { label: 'Mengajar', kelas: 'bg-primary-50 text-primary-700' },
  digantikan: { label: 'Digantikan', kelas: 'bg-warning-100 text-warning-700' },
  menggantikan: { label: 'Menggantikan', kelas: 'bg-success-50 text-success-700' },
};

// ── Tanggal (selalu string YYYY-MM-DD, tanpa efek zona waktu) ──────────────
function geser(tanggal: string, hari: number): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}
const hariIni = new Date().toLocaleDateString('sv-SE');

function formatPanjang(t: string): string {
  return new Date(`${t}T00:00:00`).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
function formatTabel(t: string): string {
  return new Date(`${t}T00:00:00`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
function namaHariPendek(t: string): string {
  return new Date(`${t}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'long' });
}

// ── State ──────────────────────────────────────────────────────────────────
const tanggalDipilih = ref(hariIni);
const awalStrip = ref(hariIni);
const data = ref<HariJadwal[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const cari = ref('');
const kategori = ref<'' | JadwalItem['kategori']>('');

const bulan = computed({
  get: () => tanggalDipilih.value.slice(0, 7),
  set: (v: string) => {
    if (!v) return;
    // Bulan ini -> ke hari ini; bulan lain -> tanggal 1
    pilihTanggal(v === hariIni.slice(0, 7) ? hariIni : `${v}-01`);
  },
});

const strip = computed(() =>
  Array.from({ length: JUMLAH_HARI }, (_, i) => {
    const tanggal = geser(awalStrip.value, i);
    const info = data.value.find((h) => h.tanggal === tanggal);
    return {
      tanggal,
      tgl: Number(tanggal.slice(8, 10)),
      hari: namaHariPendek(tanggal),
      libur: info?.libur ?? null,
      adaJadwal: (info?.jadwal.length ?? 0) > 0,
    };
  }),
);

const hariDipilih = computed(() => data.value.find((h) => h.tanggal === tanggalDipilih.value));

const barisTampil = computed(() => {
  const q = cari.value.trim().toLowerCase();
  return (hariDipilih.value?.jadwal ?? []).filter(
    (j) =>
      (!kategori.value || j.kategori === kategori.value) &&
      (!q ||
        (j.mataPelajaranNama ?? '').toLowerCase().includes(q) ||
        j.kelasNama.toLowerCase().includes(q)),
  );
});

// ── Navigasi ───────────────────────────────────────────────────────────────
function pilihTanggal(t: string) {
  tanggalDipilih.value = t;
  // Kalau tanggal di luar strip, strip mulai dari tanggal itu
  if (t < awalStrip.value || t > geser(awalStrip.value, JUMLAH_HARI - 1)) {
    awalStrip.value = t;
  }
}

function geserStrip(arah: 1 | -1) {
  awalStrip.value = geser(awalStrip.value, arah * JUMLAH_HARI);
  tanggalDipilih.value = awalStrip.value;
}

// ── Data ───────────────────────────────────────────────────────────────────
async function fetchData() {
  loading.value = true;
  error.value = null;
  try {
    const { data: res } = await api.get<{ hari: HariJadwal[] }>('/jadwal/saya/rentang', {
      params: { mulai: awalStrip.value, selesai: geser(awalStrip.value, JUMLAH_HARI - 1) },
    });
    data.value = res.hari;
  } catch {
    error.value = 'Gagal memuat jadwal.';
  } finally {
    loading.value = false;
  }
}

watch(awalStrip, fetchData);
onMounted(fetchData);
</script>

<template>
  <div class="p-4 md:p-8 max-w-7xl mx-auto">
    <div class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs p-5 md:p-6">
      <!-- Judul + pilih bulan -->
      <div class="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1 class="text-[22px] font-bold text-text-primary">Jadwal Saya</h1>
          <p class="text-[14px] text-text-secondary mt-1">Jadwal mengajar Anda per tanggal.</p>
        </div>
        <input
          v-model="bulan"
          type="month"
          aria-label="Pilih bulan"
          class="h-11 px-3 rounded-lg border-2 border-stone-200 text-[14px] text-text-primary focus:outline-none focus:border-primary-500"
          style="width: 14rem"
        />
      </div>

      <!-- Strip tanggal -->
      <div class="flex items-center gap-2 md:gap-3 mb-5">
        <button
          type="button"
          aria-label="10 hari sebelumnya"
          class="shrink-0 w-10 h-10 rounded-full bg-stone-800 text-white flex items-center justify-center hover:bg-stone-700"
          @click="geserStrip(-1)"
        >
          <svg
            class="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div class="flex-1 min-w-0 overflow-x-auto">
          <div class="grid gap-2" style="grid-template-columns: repeat(10, minmax(56px, 1fr))">
            <button
              v-for="d in strip"
              :key="d.tanggal"
              type="button"
              :title="d.libur ?? (d.adaJadwal ? 'Ada jadwal' : 'Tidak ada jadwal')"
              class="relative rounded-xl border-2 py-2.5 text-center transition-colors"
              :class="[
                d.tanggal === tanggalDipilih
                  ? 'bg-primary-600 border-primary-600 text-white'
                  : d.libur
                    ? 'bg-white border-danger-100 text-danger-600 hover:bg-danger-50'
                    : 'bg-white border-stone-200 text-text-primary hover:border-primary-300',
                d.tanggal === hariIni && d.tanggal !== tanggalDipilih
                  ? 'ring-2 ring-primary-200'
                  : '',
              ]"
              @click="pilihTanggal(d.tanggal)"
            >
              <span
                v-if="d.adaJadwal"
                class="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                :class="d.tanggal === tanggalDipilih ? 'bg-white' : 'bg-primary-600'"
              />
              <span class="block text-[22px] font-bold leading-tight">{{ d.tgl }}</span>
              <span class="block text-[12px]">{{ d.hari }}</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          aria-label="10 hari berikutnya"
          class="shrink-0 w-10 h-10 rounded-full bg-stone-800 text-white flex items-center justify-center hover:bg-stone-700"
          @click="geserStrip(1)"
        >
          <svg
            class="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <!-- Filter -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div class="relative">
          <input
            v-model="cari"
            type="search"
            placeholder="Cari mata pelajaran atau kelas"
            class="w-full h-11 pl-3 pr-9 rounded-lg border-2 border-stone-200 text-[14px] focus:outline-none focus:border-primary-500"
          />
          <svg
            class="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-stone-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <select
          v-model="kategori"
          aria-label="Kategori"
          class="h-11 px-3 rounded-lg border-2 border-stone-200 text-[14px] bg-white focus:outline-none focus:border-primary-500"
        >
          <option value="">Semua kategori</option>
          <option value="mengajar">Mengajar</option>
          <option value="digantikan">Digantikan guru lain</option>
          <option value="menggantikan">Menggantikan guru lain</option>
        </select>
        <input
          :value="tanggalDipilih"
          type="date"
          aria-label="Pilih tanggal"
          class="h-11 px-3 rounded-lg border-2 border-stone-200 text-[14px] focus:outline-none focus:border-primary-500"
          @change="
            (e) =>
              (e.target as HTMLInputElement).value &&
              pilihTanggal((e.target as HTMLInputElement).value)
          "
        />
      </div>

      <p class="text-[14px] font-semibold text-text-primary mb-3">
        {{ formatPanjang(tanggalDipilih) }}
        <span v-if="tanggalDipilih === hariIni" class="text-primary-600"> · hari ini</span>
      </p>

      <!-- Loading -->
      <div v-if="loading" class="space-y-2">
        <div v-for="n in 4" :key="n" class="h-12 bg-stone-100 rounded-lg animate-pulse" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="py-10 text-center">
        <p class="text-[14px] text-text-secondary mb-2">{{ error }}</p>
        <button class="text-[14px] font-semibold text-primary-600" @click="fetchData">
          Coba lagi
        </button>
      </div>

      <!-- Libur -->
      <div
        v-else-if="hariDipilih?.libur"
        class="py-10 text-center rounded-xl bg-danger-50 border-2 border-danger-100"
      >
        <p class="text-[15px] font-semibold text-danger-700">{{ hariDipilih.libur }}</p>
        <p class="text-[13px] text-danger-600 mt-1">Tidak ada jadwal mengajar.</p>
      </div>

      <!-- Tabel -->
      <div
        v-else-if="barisTampil.length > 0"
        class="overflow-x-auto rounded-xl border-2 border-stone-200"
      >
        <table class="w-full">
          <thead class="bg-surface-warm">
            <tr class="text-left text-[13px] font-bold text-text-secondary">
              <th class="px-4 py-3">Tanggal</th>
              <th class="px-4 py-3">Waktu</th>
              <th class="px-4 py-3">Mata Pelajaran</th>
              <th class="px-4 py-3">Kelas</th>
              <th class="px-4 py-3">Kategori</th>
              <th class="px-4 py-3">Keterangan</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-200">
            <tr
              v-for="j in barisTampil"
              :key="`${j.id}-${j.kategori}`"
              class="text-[14px] hover:bg-primary-50/50"
            >
              <td class="px-4 py-3.5 text-text-primary whitespace-nowrap">
                {{ formatTabel(tanggalDipilih) }}
              </td>
              <td class="px-4 py-3.5 text-text-primary whitespace-nowrap">Jam ke-{{ j.jamKe }}</td>
              <td class="px-4 py-3.5 font-medium text-text-primary">
                {{ j.mataPelajaranNama ?? '-' }}
              </td>
              <td class="px-4 py-3.5 text-text-primary">{{ j.kelasNama }}</td>
              <td class="px-4 py-3.5">
                <span
                  class="inline-flex px-2.5 py-1 rounded-md text-[12px] font-semibold whitespace-nowrap"
                  :class="KATEGORI[j.kategori].kelas"
                  >{{ KATEGORI[j.kategori].label }}</span
                >
              </td>
              <td class="px-4 py-3.5 text-text-secondary">
                <template v-if="j.kategori === 'digantikan'">Diisi oleh {{ j.guruLain }}</template>
                <template v-else-if="j.kategori === 'menggantikan'"
                  >Menggantikan {{ j.guruLain ?? 'guru lain' }}</template
                >
                <template v-else>-</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Kosong -->
      <div v-else class="py-10 text-center rounded-xl border-2 border-dashed border-stone-200">
        <p class="text-[14px] text-text-secondary">
          {{
            (hariDipilih?.jadwal.length ?? 0) > 0
              ? 'Tidak ada jadwal yang cocok dengan pencarian.'
              : 'Tidak ada jadwal mengajar di tanggal ini.'
          }}
        </p>
      </div>
    </div>
  </div>
</template>
