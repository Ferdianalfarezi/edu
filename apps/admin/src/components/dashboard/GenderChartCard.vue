<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api/client';

// Response API sudah diubah ke camelCase oleh interceptor di api/client.ts
interface GenderCount {
  lakiLaki: number;
  perempuan: number;
  tidakDiketahui: number;
}
interface GenderPerKelas extends GenderCount {
  kelasId: string | null;
  kelasNama: string;
  tingkat: number | null;
}
interface GenderStats {
  total: GenderCount;
  perKelas: GenderPerKelas[];
}

const ALL = 'all';
const NO_KELAS = 'none';

const loading = ref(true);
const error = ref<string | null>(null);
const stats = ref<GenderStats | null>(null);
const selected = ref<string>(ALL);
const showPerKelas = ref(false);

async function fetchStats() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<GenderStats>('/tenants/stats/gender');
    stats.value = data;
  } catch (err: unknown) {
    error.value = 'Gagal memuat data jenis kelamin.';
    console.error('Failed to fetch gender stats:', err);
  } finally {
    loading.value = false;
  }
}

onMounted(fetchStats);

function keyOf(k: GenderPerKelas) {
  return k.kelasId ?? NO_KELAS;
}

const current = computed<GenderCount | null>(() => {
  if (!stats.value) return null;
  if (selected.value === ALL) return stats.value.total;
  return stats.value.perKelas.find((k) => keyOf(k) === selected.value) ?? null;
});

const currentLabel = computed(() => {
  if (selected.value === ALL) return 'Seluruh sekolah';
  return stats.value?.perKelas.find((k) => keyOf(k) === selected.value)?.kelasNama ?? '';
});

const totalOf = (c: GenderCount) => c.lakiLaki + c.perempuan + c.tidakDiketahui;
const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

// Donut: lingkaran r=15.915 → keliling 100, jadi panjang segmen = persen
const segments = computed(() => {
  const c = current.value;
  if (!c) return [];
  const total = totalOf(c);
  if (total === 0) return [];
  const parts = [
    { value: c.lakiLaki, cls: 'text-sky-500' },
    { value: c.perempuan, cls: 'text-pink-500' },
    { value: c.tidakDiketahui, cls: 'text-stone-300' },
  ];
  let offset = 0;
  return parts
    .filter((p) => p.value > 0)
    .map((p) => {
      const len = (p.value / total) * 100;
      const seg = { ...p, dash: `${len} ${100 - len}`, offset: 25 - offset };
      offset += len;
      return seg;
    });
});
</script>

<template>
  <div class="bg-white border-2 border-stone-200 rounded-2xl p-5.5 h-full">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
      <div>
        <h3 class="text-[17px] font-bold text-text-primary">Siswa Laki-laki &amp; Perempuan</h3>
        <p class="text-[13px] text-text-secondary">Siswa aktif · {{ currentLabel }}</p>
      </div>
      <select
        v-if="stats"
        v-model="selected"
        class="h-10 px-3 rounded-lg border border-border bg-white text-sm text-text-primary sm:w-56"
        aria-label="Filter kelas"
      >
        <option :value="ALL">Semua kelas</option>
        <option v-for="k in stats.perKelas" :key="keyOf(k)" :value="keyOf(k)">
          {{ k.kelasNama }}
        </option>
      </select>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center gap-6 animate-pulse">
      <div class="w-36 h-36 rounded-full bg-stone-100" />
      <div class="flex-1 space-y-3">
        <div class="h-4 bg-stone-100 rounded w-40" />
        <div class="h-4 bg-stone-100 rounded w-32" />
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center py-6">
      <p class="text-[14px] text-text-secondary mb-2">{{ error }}</p>
      <button
        class="text-[14px] font-semibold text-primary-600 hover:text-primary-700"
        @click="fetchStats"
      >
        Coba lagi
      </button>
    </div>

    <template v-else-if="current">
      <div class="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
        <!-- Donut -->
        <div class="relative w-40 h-40 shrink-0">
          <svg viewBox="0 0 42 42" class="w-full h-full">
            <circle
              cx="21"
              cy="21"
              r="15.915"
              fill="none"
              stroke="currentColor"
              stroke-width="6"
              class="text-stone-100"
            />
            <circle
              v-for="(s, i) in segments"
              :key="i"
              cx="21"
              cy="21"
              r="15.915"
              fill="none"
              stroke="currentColor"
              stroke-width="6"
              :class="s.cls"
              :stroke-dasharray="s.dash"
              :stroke-dashoffset="s.offset"
            />
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span class="text-2xl font-bold text-text-primary">{{ totalOf(current) }}</span>
            <span class="text-[12px] text-text-secondary">siswa</span>
          </div>
        </div>

        <!-- Legend -->
        <div class="w-full space-y-3">
          <div class="flex items-center justify-between p-3 rounded-xl bg-sky-50">
            <div class="flex items-center gap-2.5">
              <span class="w-3 h-3 rounded-full bg-sky-500" />
              <span class="text-[15px] font-medium text-text-primary">Laki-laki</span>
            </div>
            <span class="text-[15px] font-bold text-text-primary">
              {{ current.lakiLaki }}
              <span class="font-normal text-text-secondary text-[13px]">
                ({{ pct(current.lakiLaki, totalOf(current)) }}%)
              </span>
            </span>
          </div>
          <div class="flex items-center justify-between p-3 rounded-xl bg-pink-50">
            <div class="flex items-center gap-2.5">
              <span class="w-3 h-3 rounded-full bg-pink-500" />
              <span class="text-[15px] font-medium text-text-primary">Perempuan</span>
            </div>
            <span class="text-[15px] font-bold text-text-primary">
              {{ current.perempuan }}
              <span class="font-normal text-text-secondary text-[13px]">
                ({{ pct(current.perempuan, totalOf(current)) }}%)
              </span>
            </span>
          </div>
          <p v-if="current.tidakDiketahui > 0" class="text-[13px] text-text-secondary">
            {{ current.tidakDiketahui }} siswa belum diisi jenis kelaminnya.
          </p>
        </div>
      </div>

      <!-- Rincian per kelas (hanya saat "Semua kelas") -->
      <div
        v-if="selected === ALL && stats && stats.perKelas.length > 0"
        class="mt-6 pt-5 border-t border-stone-200"
      >
        <button
          type="button"
          class="w-full flex items-center justify-between rounded-lg px-2 py-1.5 text-[13px] font-semibold text-text-secondary hover:bg-stone-50"
          :aria-expanded="showPerKelas"
          @click="showPerKelas = !showPerKelas"
        >
          <span>Per kelas ({{ stats.perKelas.length }} kelas)</span>
          <span class="flex items-center gap-1 text-primary-600">
            {{ showPerKelas ? 'Sembunyikan' : 'Tampilkan' }}
            <svg
              class="w-4 h-4 transition-transform"
              :class="{ 'rotate-180': showPerKelas }"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        <p v-if="showPerKelas" class="px-2 mt-1 mb-3 text-[12px] text-text-secondary">
          Klik kelas untuk lihat detail
        </p>
        <div v-if="showPerKelas" class="space-y-2">
          <button
            v-for="k in stats.perKelas"
            :key="keyOf(k)"
            type="button"
            class="w-full flex items-center gap-3 text-left rounded-lg px-2 py-1.5 hover:bg-stone-50"
            @click="selected = keyOf(k)"
          >
            <span class="w-28 shrink-0 truncate text-[13px] font-medium text-text-primary">
              {{ k.kelasNama }}
            </span>
            <span class="flex-1 flex h-3 rounded-full overflow-hidden bg-stone-100">
              <span class="bg-sky-500" :style="{ width: pct(k.lakiLaki, totalOf(k)) + '%' }" />
              <span class="bg-pink-500" :style="{ width: pct(k.perempuan, totalOf(k)) + '%' }" />
            </span>
            <span class="w-20 shrink-0 text-right text-[13px] text-text-secondary">
              {{ k.lakiLaki }} L · {{ k.perempuan }} P
            </span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
