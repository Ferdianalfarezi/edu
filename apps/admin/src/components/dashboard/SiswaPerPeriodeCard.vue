<script setup lang="ts">
/**
 * Kartu "Perkembangan Jumlah Siswa" di dashboard admin.
 * Data: GET /tenants/stats/siswa-per-periode.
 *
 * Tab "Per semester" fokus ke tahun ajaran aktif:
 * - Semester 1 berjalan  -> cincin progres semester, jumlah siswa di tengah
 * - Semester 2 berjalan  -> linimasa: kotak Semester 1 (selesai) + cincin Semester 2
 * - Libur antar semester -> cincin Semester 1 penuh + info kapan Semester 2 mulai
 * Tab "Per tahun ajaran" -> grafik kolom riwayat antar tahun ajaran.
 */
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api/client';

interface PerSemester {
  tahunAjaranId: string;
  tahunAjaranNama: string;
  tahunAjaranStatus: 'disiapkan' | 'aktif' | 'nonaktif';
  semester: number;
  tanggalMulai: string;
  tanggalSelesai: string;
  berjalan: boolean;
  sudahMulai: boolean;
  jumlah: number;
  jumlahAktif: number;
}

interface PerTahunAjaran {
  tahunAjaranId: string;
  tahunAjaranNama: string;
  jumlah: number;
}

interface Kolom {
  key: string;
  label: string;
  jumlah: number;
  detail: string;
}

const perSemester = ref<PerSemester[]>([]);
const perTahunAjaran = ref<PerTahunAjaran[]>([]);
const loading = ref(true);
const error = ref('');
const tampilTabel = ref(false);
const hover = ref<string | null>(null);
const mode = ref<'semester' | 'tahun'>('semester');

const PILIHAN_MODE = [
  { id: 'semester', label: 'Per semester' },
  { id: 'tahun', label: 'Per tahun ajaran' },
] as const;

// ── Tanggal ─────────────────────────────────────────────────────────────────
const hariIni = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD waktu lokal

function formatTanggal(t: string): string {
  return new Date(`${t}T00:00:00`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function selisihHari(dari: string, sampai: string): number {
  return Math.round(
    (Date.parse(`${sampai}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`)) / 86_400_000,
  );
}

function rentang(s: PerSemester): string {
  return `${formatTanggal(s.tanggalMulai)} – ${formatTanggal(s.tanggalSelesai)}`;
}

// ── Semester yang difokuskan ────────────────────────────────────────────────
const semesterTaAktif = computed(() => {
  const aktif = perSemester.value.filter((s) => s.tahunAjaranStatus === 'aktif');
  if (aktif.length > 0) return [...aktif].sort((a, b) => a.semester - b.semester);
  // Tidak ada TA aktif: pakai TA terakhir yang sudah mulai
  const mulai = perSemester.value.filter((s) => s.sudahMulai);
  const terakhir = mulai[mulai.length - 1];
  return terakhir
    ? perSemester.value
        .filter((s) => s.tahunAjaranId === terakhir.tahunAjaranId)
        .sort((a, b) => a.semester - b.semester)
    : [];
});

/** Semester utama (cincin): yang sedang berjalan, atau yang terakhir sudah mulai. */
const fokus = computed<PerSemester | null>(() => {
  const list = semesterTaAktif.value;
  return list.find((s) => s.berjalan) ?? [...list].reverse().find((s) => s.sudahMulai) ?? null;
});

/** Semester 1 yang sudah selesai, ditampilkan di linimasa saat Semester 2 berjalan. */
const semesterSebelumnya = computed(() =>
  fokus.value?.semester === 2 ? semesterTaAktif.value.find((s) => s.semester === 1) : undefined,
);

/** Semester 2 yang belum mulai (masa libur setelah Semester 1). */
const semesterBerikutnya = computed(() =>
  fokus.value?.semester === 1 && !fokus.value.berjalan
    ? semesterTaAktif.value.find((s) => s.semester === 2 && !s.sudahMulai)
    : undefined,
);

const progres = computed(() => {
  const s = fokus.value;
  if (!s) return { persen: 0, sisaHari: 0 };
  const totalHari = selisihHari(s.tanggalMulai, s.tanggalSelesai) + 1;
  const lewat = Math.min(Math.max(selisihHari(s.tanggalMulai, hariIni) + 1, 0), totalHari);
  return {
    persen: Math.round((lewat / totalHari) * 100),
    sisaHari: totalHari - lewat,
  };
});

// ── Tab per tahun ajaran & tabel ────────────────────────────────────────────
const kolomTahunAjaran = computed<Kolom[]>(() =>
  perTahunAjaran.value.map((t) => ({
    key: t.tahunAjaranId,
    label: t.tahunAjaranNama,
    jumlah: t.jumlah,
    detail: `Tahun ajaran ${t.tahunAjaranNama}`,
  })),
);

const barisTabel = computed<Kolom[]>(() =>
  mode.value === 'tahun'
    ? kolomTahunAjaran.value
    : perSemester.value
        .filter((s) => s.sudahMulai)
        .map((s) => ({
          key: `${s.tahunAjaranId}-${s.semester}`,
          label: `Sem ${s.semester}`,
          jumlah: s.jumlah,
          detail:
            `Semester ${s.semester} TA ${s.tahunAjaranNama} (${rentang(s)})` +
            (s.berjalan ? ', sedang berjalan' : ''),
        })),
);

/** Batas atas sumbu: dibulatkan ke angka rapi supaya garis bantu mudah dibaca. */
function batasAtas(kolom: Kolom[]): number {
  const maks = Math.max(0, ...kolom.map((k) => k.jumlah));
  if (maks <= 10) return 10;
  const langkah = Math.pow(10, Math.floor(Math.log10(maks)));
  return Math.ceil(maks / langkah) * langkah;
}

function tinggiPersen(jumlah: number, kolom: Kolom[]): number {
  return (jumlah / batasAtas(kolom)) * 100;
}

async function fetchData() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get<{
      perSemester: PerSemester[];
      perTahunAjaran: PerTahunAjaran[];
    }>('/tenants/stats/siswa-per-periode');
    perSemester.value = data.perSemester;
    perTahunAjaran.value = data.perTahunAjaran;
  } catch {
    error.value = 'Gagal memuat data jumlah siswa.';
  } finally {
    loading.value = false;
  }
}

onMounted(fetchData);
</script>

<template>
  <div class="bg-white border-2 border-stone-200 rounded-2xl p-5.5 h-full flex flex-col">
    <div class="mb-4">
      <h3 class="text-[17px] font-bold text-text-primary">Perkembangan Jumlah Siswa</h3>
      <p class="text-[13px] text-text-secondary">
        {{
          mode === 'semester' && fokus
            ? `Tahun ajaran ${fokus.tahunAjaranNama}`
            : 'Siswa terdaftar per tahun ajaran'
        }}
      </p>
    </div>

    <!-- Pilihan periode + tabel -->
    <div v-if="!loading && !error && fokus" class="flex items-center justify-between gap-3 mb-4">
      <div class="inline-flex rounded-lg bg-stone-100 p-1" role="tablist">
        <button
          v-for="m in PILIHAN_MODE"
          :key="m.id"
          type="button"
          role="tab"
          :aria-selected="mode === m.id"
          class="px-3 py-1.5 rounded-md text-[13px] font-semibold transition-colors"
          :class="
            mode === m.id
              ? 'bg-white text-text-primary shadow-xs'
              : 'text-text-secondary hover:text-text-primary'
          "
          @click="mode = m.id"
        >
          {{ m.label }}
        </button>
      </div>
      <button
        type="button"
        class="text-[13px] font-semibold text-primary-600 hover:text-primary-700"
        @click="tampilTabel = !tampilTabel"
      >
        {{ tampilTabel ? 'Lihat grafik' : 'Lihat tabel' }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="h-40 bg-stone-100 rounded-xl animate-pulse" />

    <!-- Error -->
    <div v-else-if="error" class="text-center py-6">
      <p class="text-[14px] text-text-secondary mb-2">{{ error }}</p>
      <button
        class="text-[14px] font-semibold text-primary-600 hover:text-primary-700"
        @click="fetchData"
      >
        Coba lagi
      </button>
    </div>

    <!-- Kosong -->
    <p v-else-if="!fokus" class="text-[14px] text-text-secondary py-6 text-center">
      Belum ada semester yang dimulai.
    </p>

    <!-- Tabel (riwayat lengkap) -->
    <table v-else-if="tampilTabel" class="w-full text-[14px]">
      <thead>
        <tr class="border-b border-border text-left text-text-secondary">
          <th class="py-2 font-medium">Periode</th>
          <th class="py-2 font-medium text-right">Jumlah siswa</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        <tr v-for="k in barisTabel" :key="k.key">
          <td class="py-2 text-text-primary">{{ k.detail }}</td>
          <td class="py-2 text-right font-semibold text-text-primary">{{ k.jumlah }}</td>
        </tr>
      </tbody>
    </table>

    <!-- Per semester: (Semester 1 selesai) + cincin progres semester fokus -->
    <div v-else-if="mode === 'semester'" class="flex flex-wrap items-center gap-5">
      <div
        v-if="semesterSebelumnya"
        class="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 min-w-36"
      >
        <p class="text-[12px] font-semibold text-text-secondary">Semester 1 · selesai</p>
        <p class="text-[26px] font-bold text-text-primary leading-tight">
          {{ semesterSebelumnya.jumlah }}
        </p>
        <p class="text-[12px] text-text-secondary">siswa · {{ rentang(semesterSebelumnya) }}</p>
      </div>

      <svg
        viewBox="0 0 42 42"
        class="w-32 h-32 shrink-0"
        role="img"
        :aria-label="`${progres.persen} persen Semester ${fokus.semester} berjalan, ${fokus.jumlah} siswa`"
      >
        <circle
          cx="21"
          cy="21"
          r="15.9155"
          fill="none"
          stroke="currentColor"
          stroke-width="4"
          class="text-primary-100"
        />
        <circle
          cx="21"
          cy="21"
          r="15.9155"
          fill="none"
          stroke="currentColor"
          stroke-width="4"
          stroke-linecap="round"
          class="text-primary-500"
          :stroke-dasharray="`${progres.persen} ${100 - progres.persen}`"
          stroke-dashoffset="25"
        />
        <text
          x="21"
          y="21.5"
          text-anchor="middle"
          class="fill-text-primary"
          style="font-size: 10px; font-weight: 700"
        >
          {{ fokus.jumlah }}
        </text>
        <text
          x="21"
          y="27.5"
          text-anchor="middle"
          class="fill-text-secondary"
          style="font-size: 3.6px"
        >
          siswa
        </text>
      </svg>

      <div class="text-[14px] leading-relaxed min-w-0">
        <p class="font-semibold text-text-primary">
          Semester {{ fokus.semester }} ·
          {{ fokus.berjalan ? `${progres.persen}% berjalan` : 'selesai' }}
        </p>
        <p class="text-text-secondary">{{ rentang(fokus) }}</p>
        <p v-if="fokus.berjalan" class="text-text-secondary">Sisa {{ progres.sisaHari }} hari</p>
        <p v-else-if="semesterBerikutnya" class="text-text-secondary">
          Semester 2 mulai {{ formatTanggal(semesterBerikutnya.tanggalMulai) }}
        </p>
        <p class="text-text-secondary">
          {{ fokus.jumlahAktif }} aktif · {{ fokus.jumlah - fokus.jumlahAktif }} keluar/lulus
        </p>
      </div>
    </div>

    <!-- Per tahun ajaran: satu periode -> angka -->
    <div v-else-if="kolomTahunAjaran.length === 1" class="py-4">
      <p class="text-[40px] font-bold text-text-primary leading-none">
        {{ kolomTahunAjaran[0].jumlah }}
      </p>
      <p class="text-[14px] text-text-secondary mt-2">siswa · {{ kolomTahunAjaran[0].detail }}</p>
    </div>

    <!-- Per tahun ajaran: grafik kolom -->
    <div v-else class="relative">
      <div class="relative h-40 ml-8">
        <div
          v-for="frac in [1, 0.5]"
          :key="frac"
          class="absolute left-0 right-0 border-t border-stone-100"
          :style="{ bottom: `${frac * 100}%` }"
        >
          <span class="absolute -left-8 -translate-y-1/2 text-[11px] text-text-tertiary">
            {{ Math.round(batasAtas(kolomTahunAjaran) * frac) }}
          </span>
        </div>
        <div class="absolute left-0 right-0 bottom-0 border-t border-stone-300" />
        <span class="absolute -left-8 bottom-0 translate-y-1/2 text-[11px] text-text-tertiary"
          >0</span
        >

        <div class="absolute inset-0 flex items-end justify-around">
          <div
            v-for="k in kolomTahunAjaran"
            :key="k.key"
            class="relative h-full flex flex-1 flex-col items-center justify-end cursor-default"
            @mouseenter="hover = k.key"
            @mouseleave="hover = null"
          >
            <span class="text-[13px] font-semibold text-text-primary mb-1">{{ k.jumlah }}</span>
            <div
              class="w-6 rounded-t bg-primary-500 transition-opacity"
              :class="hover && hover !== k.key ? 'opacity-60' : ''"
              :style="{ height: `${tinggiPersen(k.jumlah, kolomTahunAjaran)}%` }"
            />
            <div
              v-if="hover === k.key"
              class="absolute bottom-full mb-2 z-10 w-48 rounded-lg bg-stone-800 text-white text-[12px] px-3 py-2 shadow-lg pointer-events-none"
            >
              <p class="font-semibold">{{ k.jumlah }} siswa</p>
              <p class="text-stone-300">{{ k.detail }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="flex justify-around ml-8 mt-2">
        <p
          v-for="k in kolomTahunAjaran"
          :key="k.key"
          class="flex-1 text-center text-[12px] font-medium text-text-primary"
        >
          {{ k.label }}
        </p>
      </div>
    </div>

    <p v-if="!loading && !error && fokus" class="text-[12px] text-text-tertiary mt-auto pt-4">
      Dihitung dari riwayat kelas dan kelas siswa saat ini. Siswa yang keluar atau lulus sebelum
      semester dimulai tidak dihitung.
    </p>
  </div>
</template>
