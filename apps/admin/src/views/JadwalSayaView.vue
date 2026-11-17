<script setup lang="ts">
// Jadwal mengajar guru yang sedang login (baca saja). Data dari GET /jadwal/saya.
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api/client';
import { PageHeader } from '@/components/ui';

interface SlotJadwal {
  id: string;
  kelasNama: string;
  mataPelajaranNama: string;
  jamKe: number;
  hasGuruPengganti: boolean;
  guruPenggantiNama?: string;
}
interface JadwalSayaResponse {
  hari: string;
  tanggal: string;
  jadwal: SlotJadwal[];
}

const HARI = [
  { value: 'senin', label: 'Senin' },
  { value: 'selasa', label: 'Selasa' },
  { value: 'rabu', label: 'Rabu' },
  { value: 'kamis', label: 'Kamis' },
  { value: 'jumat', label: 'Jumat' },
  { value: 'sabtu', label: 'Sabtu' },
];

// Default: hari ini (Minggu → Senin)
const hariIni = HARI[(new Date().getDay() + 6) % 7]?.value ?? 'senin';

const hari = ref(hariIni);
const loading = ref(true);
const error = ref<string | null>(null);
const data = ref<JadwalSayaResponse | null>(null);

const labelHari = computed(() => HARI.find((h) => h.value === hari.value)?.label ?? '');
const slots = computed(() => [...(data.value?.jadwal ?? [])].sort((a, b) => a.jamKe - b.jamKe));

async function fetchJadwal() {
  loading.value = true;
  error.value = null;
  try {
    const res = await api.get<JadwalSayaResponse>('/jadwal/saya', {
      params: { hari: hari.value },
    });
    data.value = res.data;
  } catch (err: unknown) {
    error.value = 'Gagal memuat jadwal.';
    console.error('Failed to fetch jadwal saya:', err);
  } finally {
    loading.value = false;
  }
}

function pilihHari(value: string) {
  if (hari.value === value) return;
  hari.value = value;
  fetchJadwal();
}

onMounted(fetchJadwal);
</script>

<template>
  <div class="p-8">
    <PageHeader title="Jadwal Saya" description="Jadwal mengajar Anda per hari." />

    <!-- Pilih hari -->
    <div class="flex flex-wrap gap-2 mb-5">
      <button
        v-for="h in HARI"
        :key="h.value"
        type="button"
        class="px-4 py-2 rounded-lg border-2 text-[14px] font-semibold transition-colors duration-200"
        :class="
          hari === h.value
            ? 'bg-primary-600 border-primary-600 text-white'
            : 'bg-white border-stone-200 text-text-primary hover:bg-primary-50'
        "
        @click="pilihHari(h.value)"
      >
        {{ h.label
        }}<span v-if="h.value === hariIni" class="ml-1 text-[12px] font-medium opacity-80"
          >(hari ini)</span
        >
      </button>
    </div>

    <!-- Card Container with Section Header + Data Table -->
    <div class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden">
      <!-- Section Header -->
      <div
        class="flex items-center justify-between px-6 py-5 bg-primary-50 border-b-2 border-primary-200"
      >
        <h3 class="text-[16px] font-bold text-primary-800">Jadwal {{ labelHari }}</h3>
        <span class="text-[13px] font-semibold text-text-secondary">
          {{ slots.length }} jam pelajaran
        </span>
      </div>

      <div class="overflow-x-auto">
        <table v-if="!loading && !error && slots.length > 0" class="w-full">
          <thead>
            <tr class="border-b-2 border-stone-200">
              <th class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm">Jam Ke</th>
              <th class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm">Mata Pelajaran</th>
              <th class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm">Kelas</th>
              <th class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm">Keterangan</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-200">
            <tr
              v-for="s in slots"
              :key="s.id"
              class="hover:bg-primary-50 transition-colors duration-200"
            >
              <td class="px-5 py-4 text-[15px]">
                <span
                  class="inline-flex items-center justify-center w-[38px] h-[38px] rounded-full bg-primary-100 text-primary-700 text-[14px] font-bold"
                >
                  {{ s.jamKe }}
                </span>
              </td>
              <td class="px-5 py-4 text-[15px] font-semibold text-text-primary">
                {{ s.mataPelajaranNama }}
              </td>
              <td class="px-5 py-4 text-[15px] text-text-primary">{{ s.kelasNama }}</td>
              <td class="px-5 py-4">
                <span
                  v-if="s.hasGuruPengganti"
                  class="inline-flex items-center px-2.5 py-1 rounded-md text-[13px] font-semibold bg-warning-50 text-warning-700"
                >
                  Digantikan {{ s.guruPenggantiNama || 'guru lain' }}
                </span>
                <span
                  v-else
                  class="inline-flex items-center px-2.5 py-1 rounded-md text-[13px] font-semibold bg-success-50 text-success-700"
                >
                  Mengajar
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Loading -->
        <div v-else-if="loading" class="p-12 text-center">
          <svg class="w-6 h-6 animate-spin text-primary-500 mx-auto" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p class="text-[15px] text-text-tertiary mt-2">Memuat data...</p>
        </div>

        <!-- Error -->
        <div v-else-if="error" class="p-12 text-center">
          <p class="text-[15px] text-text-tertiary mb-3">{{ error }}</p>
          <button
            class="text-[14px] font-semibold text-primary-600 hover:text-primary-700"
            @click="fetchJadwal"
          >
            Coba lagi
          </button>
        </div>

        <!-- Empty -->
        <div v-else class="p-12 text-center">
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
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p class="text-[15px] text-text-tertiary">Tidak ada jadwal mengajar di hari {{ labelHari }}.</p>
        </div>
      </div>
    </div>
  </div>
</template>
