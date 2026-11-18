<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { api } from '@/api/client';
import { SearchSelect, ActionButton } from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import { useToast } from '@/composables/useToast';

const toast = useToast();

// ===== Types =====
interface Kelas {
  id: string;
  nama: string;
}

interface SiswaItem {
  id: string;
  nama: string;
  nisn: string | null;
}

interface TahunAjaran {
  id: string;
  nama: string;
  status: string;
}

// ===== State =====
const kelasList = ref<Kelas[]>([]);
const siswaList = ref<SiswaItem[]>([]);
const tahunAjaranList = ref<TahunAjaran[]>([]);
const loadingSiswa = ref(false);

const generateForm = reactive({
  mode: 'bulan' as 'bulan' | 'tahun_ajaran',
  bulan: new Date().getMonth() + 1,
  tahun: new Date().getFullYear(),
  tahunAjaranId: '',
  kelasId: '',
  siswaIds: [] as string[],
});
const generateResult = ref<{
  created: number;
  skipped: number;
  totalNominal: number;
} | null>(null);
const generating = ref(false);
const generateError = ref('');

// ===== Options =====
const bulanOptions = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

const bulanSelectOptions = computed<SelectOption[]>(() =>
  bulanOptions.map((b) => ({ value: b.value, label: b.label })),
);

const kelasSelectOptions = computed<SelectOption[]>(() =>
  kelasList.value.map((k) => ({ value: k.id, label: k.nama })),
);

const tahunAjaranSelectOptions = computed<SelectOption[]>(() =>
  tahunAjaranList.value.map((ta) => ({ value: ta.id, label: `${ta.nama} (${ta.status})` })),
);

// Label ringkas untuk siswa terpilih di trigger
const selectedSiswaLabel = computed(() => {
  const count = generateForm.siswaIds.length;
  if (count === 0) return '';
  if (count === 1) {
    const found = siswaList.value.find((s) => s.id === generateForm.siswaIds[0]);
    return found?.nama ?? '1 siswa';
  }
  return `${count} siswa dipilih`;
});

// ===== Helpers =====
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

function toggleSiswa(id: string) {
  const idx = generateForm.siswaIds.indexOf(id);
  if (idx === -1) {
    generateForm.siswaIds.push(id);
  } else {
    generateForm.siswaIds.splice(idx, 1);
  }
}

function selectAllSiswa() {
  generateForm.siswaIds = siswaList.value.map((s) => s.id);
}

function clearAllSiswa() {
  generateForm.siswaIds = [];
}

// ===== API Calls =====
async function fetchTahunAjaran() {
  try {
    const { data } = await api.get<TahunAjaran[]>('/tahun-ajaran');
    tahunAjaranList.value = data;
  } catch (error) {
    console.error('Failed to fetch tahun ajaran:', error);
  }
}

async function fetchKelas() {
  try {
    const activeTa = tahunAjaranList.value.find((ta) => ta.status === 'aktif');
    const params: Record<string, string> = {};
    if (activeTa) {
      params.tahun_ajaran_id = activeTa.id;
    }
    const { data } = await api.get<{ data: Kelas[] }>('/kelas', { params });
    kelasList.value = data.data;
  } catch (error) {
    console.error('Failed to fetch kelas:', error);
  }
}

async function fetchSiswaByKelas(kelasId: string) {
  if (!kelasId) {
    siswaList.value = [];
    generateForm.siswaIds = [];
    return;
  }
  loadingSiswa.value = true;
  try {
    const { data } = await api.get<{ data: SiswaItem[] }>('/siswa', {
      params: { kelas_id: kelasId, page_size: 100, status: 'aktif' },
    });
    siswaList.value = data.data;
    // Reset pilihan siswa saat kelas berganti
    generateForm.siswaIds = [];
  } catch (error) {
    console.error('Failed to fetch siswa:', error);
    siswaList.value = [];
  } finally {
    loadingSiswa.value = false;
  }
}

async function generateTagihan() {
  generating.value = true;
  generateError.value = '';
  generateResult.value = null;
  toast.info('Sedang men-generate tagihan, mohon tunggu...', 0);

  try {
    const payload: Record<string, unknown> = {};
    if (generateForm.mode === 'bulan') {
      payload.bulan = generateForm.bulan;
      payload.tahun = generateForm.tahun;
    } else {
      payload.tahun_ajaran_id = generateForm.tahunAjaranId;
    }
    if (generateForm.kelasId) {
      payload.kelas_id = generateForm.kelasId;
    }
    // Kirim siswa_ids hanya jika ada pilihan spesifik
    if (generateForm.siswaIds.length > 0) {
      payload.siswa_ids = generateForm.siswaIds;
    }

    const { data } = await api.post<{
      message: string;
      data: { created: number; skipped: number; totalNominal: number };
    }>('/tagihan/generate', payload);

    generateResult.value = data.data;
    toast.success(`Berhasil! ${data.data.created} tagihan dibuat, ${data.data.skipped} dilewati.`);
  } catch (error) {
    generateError.value = error.response?.data?.message || 'Gagal men-generate tagihan';
    // Toast error sudah ditampilkan otomatis oleh api client
  } finally {
    generating.value = false;
    const infoToast = toast.toasts.value.find(
      (t) => t.type === 'info' && t.message.includes('men-generate tagihan'),
    );
    if (infoToast) toast.removeToast(infoToast.id);
  }
}

// ===== Watchers =====
watch(
  () => generateForm.kelasId,
  (newKelasId) => {
    fetchSiswaByKelas(newKelasId);
  },
);

// ===== Init =====
onMounted(async () => {
  await fetchTahunAjaran();
  fetchKelas();
});
</script>

<template>
  <div class="p-8">
    <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
      <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
        <h2 class="text-[16px] font-bold text-primary-800">Generate Tagihan</h2>
      </div>
      <div class="p-6">
        <p class="text-[15px] text-stone-600 mb-5">
          Buat tagihan SPP untuk seluruh siswa aktif. Tagihan yang sudah ada akan dilewatkan (tidak
          duplikat).
        </p>

        <div class="mb-5">
          <label class="block text-[15px] font-semibold text-stone-800 mb-2">Mode Generate</label>
          <div class="flex gap-4 mt-1">
            <label class="flex items-center gap-2 text-[15px] cursor-pointer">
              <input
                v-model="generateForm.mode"
                type="radio"
                value="bulan"
                class="text-primary-600"
              />
              Per Bulan
            </label>
            <label class="flex items-center gap-2 text-[15px] cursor-pointer">
              <input
                v-model="generateForm.mode"
                type="radio"
                value="tahun_ajaran"
                class="text-primary-600"
              />
              Per Tahun Ajaran
            </label>
          </div>
        </div>

        <div
          v-if="generateForm.mode === 'bulan'"
          class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5"
        >
          <div>
            <SearchSelect
              v-model="generateForm.bulan"
              label="Bulan"
              :options="bulanSelectOptions"
              placeholder="Pilih Bulan"
            />
          </div>
          <div>
            <label class="block text-[15px] font-semibold text-stone-800 mb-2">Tahun</label>
            <input
              v-model.number="generateForm.tahun"
              type="number"
              class="w-full px-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
        </div>

        <div v-if="generateForm.mode === 'tahun_ajaran'" class="mb-5">
          <SearchSelect
            v-model="generateForm.tahunAjaranId"
            label="Tahun Ajaran"
            :options="tahunAjaranSelectOptions"
            placeholder="Pilih Tahun Ajaran"
          />
        </div>

        <div class="mb-5">
          <SearchSelect
            v-model="generateForm.kelasId"
            label="Kelas (opsional — kosong = semua kelas)"
            :options="kelasSelectOptions"
            placeholder="Semua Kelas"
            clearable
          />
        </div>

        <!-- Multi-select siswa — hanya muncul jika kelas dipilih -->
        <div v-if="generateForm.kelasId" class="mb-5">
          <div class="flex items-center justify-between mb-2">
            <label class="text-[15px] font-semibold text-stone-800">
              Siswa
              <span class="text-stone-400 font-normal text-[13px]">
                (kosong = semua siswa di kelas ini)
              </span>
            </label>
            <div v-if="siswaList.length > 0" class="flex gap-2">
              <button
                type="button"
                class="text-[13px] text-primary-600 hover:text-primary-800 font-medium"
                @click="selectAllSiswa"
              >
                Pilih Semua
              </button>
              <span class="text-stone-300">|</span>
              <button
                type="button"
                class="text-[13px] text-stone-500 hover:text-stone-700 font-medium"
                @click="clearAllSiswa"
              >
                Hapus Semua
              </button>
            </div>
          </div>

          <!-- Loading state -->
          <div
            v-if="loadingSiswa"
            class="border-2 border-stone-200 rounded-lg px-4 py-3 text-[14px] text-stone-400"
          >
            Memuat daftar siswa...
          </div>

          <!-- Empty state -->
          <div
            v-else-if="siswaList.length === 0"
            class="border-2 border-stone-200 rounded-lg px-4 py-3 text-[14px] text-stone-400"
          >
            Tidak ada siswa aktif di kelas ini.
          </div>

          <!-- Siswa checklist -->
          <div
            v-else
            class="border-2 border-stone-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto"
          >
            <!-- Trigger/summary bar -->
            <div
              class="px-4 py-2.5 bg-stone-50 border-b border-stone-200 text-[13px] text-stone-500"
            >
              <span v-if="generateForm.siswaIds.length === 0"
                >Semua {{ siswaList.length }} siswa akan diproses</span
              >
              <span v-else class="text-primary-700 font-medium">{{ selectedSiswaLabel }}</span>
            </div>

            <!-- Checklist items -->
            <ul class="divide-y divide-stone-100">
              <li
                v-for="s in siswaList"
                :key="s.id"
                class="flex items-center gap-3 px-4 py-2.5 hover:bg-primary-50 cursor-pointer transition-colors"
                @click="toggleSiswa(s.id)"
              >
                <div
                  class="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
                  :class="
                    generateForm.siswaIds.includes(s.id)
                      ? 'bg-primary-600 border-primary-600'
                      : 'border-stone-300 bg-white'
                  "
                >
                  <svg
                    v-if="generateForm.siswaIds.includes(s.id)"
                    class="w-2.5 h-2.5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="3"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span class="text-[15px] text-stone-800 font-medium flex-1">{{ s.nama }}</span>
                <span v-if="s.nisn" class="text-[13px] text-stone-400 font-mono">{{ s.nisn }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div
          v-if="generateError"
          class="p-3 bg-danger-50 border-2 border-danger-200 rounded-lg text-[15px] text-danger-700 mb-5"
        >
          {{ generateError }}
        </div>

        <ActionButton variant="primary" :disabled="generating" @click="generateTagihan">
          <svg
            v-if="generating"
            class="animate-spin h-4 w-4 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
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
          {{ generating ? 'Sedang men-generate...' : 'Generate Tagihan' }}
        </ActionButton>

        <div
          v-if="generateResult"
          class="mt-6 p-5 bg-surface-warm border-2 border-stone-200 rounded-[12px]"
        >
          <h3 class="text-[15px] font-bold text-stone-800 mb-3">Hasil Generate</h3>
          <div class="flex flex-wrap gap-4">
            <div
              class="flex flex-col items-center px-5 py-4 bg-success-50 rounded-[12px] min-w-[100px]"
            >
              <span class="text-xl font-bold text-success-700">{{ generateResult.created }}</span>
              <span class="text-[13px] font-semibold text-stone-500 mt-1">Dibuat</span>
            </div>
            <div
              class="flex flex-col items-center px-5 py-4 bg-stone-100 rounded-[12px] min-w-[100px]"
            >
              <span class="text-xl font-bold text-stone-600">{{ generateResult.skipped }}</span>
              <span class="text-[13px] font-semibold text-stone-500 mt-1">Dilewati</span>
            </div>
            <div
              class="flex flex-col items-center px-5 py-4 bg-primary-50 rounded-[12px] min-w-[100px]"
            >
              <span class="text-xl font-bold text-primary-600">{{
                formatCurrency(generateResult.totalNominal)
              }}</span>
              <span class="text-[13px] font-semibold text-stone-500 mt-1">Total Nominal</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
