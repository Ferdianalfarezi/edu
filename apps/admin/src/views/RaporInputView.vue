<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { api } from '@/api/client';
import { PeriodeRapor } from '@edu/shared';
import { PageHeader, SearchSelect } from '@/components/ui';
import type { SelectOption } from '@/components/ui';

interface MapelOption {
  id: string;
  nama: string;
}

interface KelasOption {
  id: string;
  nama: string;
}

interface KomponenPenilaian {
  id: string;
  nama: string;
  tipe: 'angka' | 'huruf' | 'deskripsi';
  skala_min: number | null;
  skala_max: number | null;
  is_wajib: boolean;
}

interface SiswaNilai {
  siswa_id: string;
  siswa_nama: string;
  komponen: { komponen_id: string; nilai: string | number | null }[];
  capaian_pembelajaran: string;
  status: 'draft' | 'submitted';
}

// Filters
const selectedMapel = ref('');
const selectedKelas = ref('');
const selectedPeriode = ref<string>('');

const mapelOptions = ref<MapelOption[]>([]);
const kelasOptions = ref<KelasOption[]>([]);
const komponenList = ref<KomponenPenilaian[]>([]);
const nilaiData = ref<SiswaNilai[]>([]);

const loadingNilai = ref(false);
const saving = ref(false);
const unsubmitting = ref(false);
const error = ref('');
const successMessage = ref('');

const isDirty = ref(false);
let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

const periodeOptions: SelectOption[] = [
  { value: PeriodeRapor.UTS_SEMESTER_1, label: 'UTS Semester 1' },
  { value: PeriodeRapor.SEMESTER_1, label: 'Semester 1' },
  { value: PeriodeRapor.UTS_SEMESTER_2, label: 'UTS Semester 2' },
  { value: PeriodeRapor.SEMESTER_2, label: 'Semester 2' },
];

const mapelSelectOptions = computed<SelectOption[]>(() =>
  mapelOptions.value.map((m) => ({ value: m.id, label: m.nama })),
);

const kelasSelectOptions = computed<SelectOption[]>(() =>
  kelasOptions.value.map((k) => ({ value: k.id, label: k.nama })),
);

const isUTS = computed(() =>
  [PeriodeRapor.UTS_SEMESTER_1, PeriodeRapor.UTS_SEMESTER_2].includes(
    selectedPeriode.value as PeriodeRapor,
  ),
);

const canSubmit = computed(() => {
  if (!nilaiData.value.length) return false;
  return nilaiData.value.every((siswa) => {
    return siswa.komponen.every((k) => {
      const komponen = komponenList.value.find((kp) => kp.id === k.komponen_id);
      if (!komponen) return true;
      if (!komponen.is_wajib) return true;
      if (isUTS.value && komponen.tipe === 'deskripsi') return true;
      return k.nilai !== null && k.nilai !== '';
    });
  });
});

const isRaporFinalized = computed(() => {
  return nilaiData.value.length > 0 && nilaiData.value.every((s) => s.status === 'submitted');
});

const canUnsubmit = computed(() => {
  return nilaiData.value.length > 0 && nilaiData.value.every((s) => s.status === 'submitted');
});

async function fetchMapel() {
  try {
    const { data } = await api.get<{
      data: {
        mapel_id: string;
        mapel_nama: string;
        kelas: { kelas_id: string; kelas_nama: string }[];
      }[];
    }>('/rapor/mata-pelajaran');
    mapelOptions.value = data.data.map((m) => ({ id: m.mapel_id, nama: m.mapel_nama }));
  } catch (err) {
    console.error('Failed to fetch mata pelajaran:', err);
  }
}

async function fetchKelas() {
  if (!selectedMapel.value) {
    kelasOptions.value = [];
    return;
  }
  try {
    const { data } = await api.get<{ data: KelasOption[] }>(
      `/rapor/kelas?mapel_id=${selectedMapel.value}`,
    );
    kelasOptions.value = data.data;
  } catch (err) {
    console.error('Failed to fetch kelas:', err);
  }
}

async function fetchNilai() {
  if (!selectedMapel.value || !selectedKelas.value || !selectedPeriode.value) {
    nilaiData.value = [];
    return;
  }

  loadingNilai.value = true;
  error.value = '';
  successMessage.value = '';

  try {
    const params = new URLSearchParams({
      kelas_id: selectedKelas.value,
      periode_id: selectedPeriode.value,
      mapel_id: selectedMapel.value,
    });

    const { data } = await api.get<{
      data: {
        kelas_id: string;
        kelas_nama: string;
        mapel_id: string;
        mapel_nama: string;
        periode: string;
        komponen_penilaian: KomponenPenilaian[];
        students: {
          siswa_id: string;
          siswa_nama: string;
          komponen_nilai: { komponen_id: string; nilai: string | number }[] | null;
          capaian_pembelajaran: string | null;
          status: 'draft' | 'submitted' | null;
        }[];
      };
    }>(`/rapor/nilai?${params.toString()}`);

    komponenList.value = data.data.komponen_penilaian;
    nilaiData.value = data.data.students.map((s) => ({
      siswa_id: s.siswa_id,
      siswa_nama: s.siswa_nama,
      komponen:
        s.komponen_nilai ??
        data.data.komponen_penilaian.map((k) => ({
          komponen_id: k.id,
          nilai: k.tipe === 'angka' ? 0 : '-',
        })),
      capaian_pembelajaran: s.capaian_pembelajaran ?? '-',
      status: s.status ?? 'draft',
    }));
  } catch (err) {
    error.value = err.response?.data?.message || 'Gagal memuat data nilai.';
  } finally {
    loadingNilai.value = false;
  }
}

async function saveNilai(status: 'draft' | 'submitted') {
  if (status === 'submitted' && !canSubmit.value) {
    error.value = 'Semua nilai wajib harus diisi sebelum submit.';
    return;
  }

  saving.value = true;
  error.value = '';
  successMessage.value = '';

  try {
    await api.post('/rapor/nilai', {
      kelas_id: selectedKelas.value,
      mata_pelajaran_id: selectedMapel.value,
      periode_rapor_id: selectedPeriode.value,
      nilai: nilaiData.value.map((siswa) => ({
        siswa_id: siswa.siswa_id,
        komponen: siswa.komponen.map((k) => ({
          komponen_id: k.komponen_id,
          nilai: k.nilai,
        })),
        capaian_pembelajaran: siswa.capaian_pembelajaran || undefined,
      })),
      status,
    });

    successMessage.value =
      status === 'draft'
        ? 'Nilai berhasil disimpan sebagai draft.'
        : 'Nilai berhasil di-submit ke wali kelas.';

    isDirty.value = false;
    await fetchNilai();
  } catch (err) {
    error.value = err.response?.data?.message || 'Gagal menyimpan nilai.';
  } finally {
    saving.value = false;
  }
}

async function unsubmitNilai() {
  unsubmitting.value = true;
  error.value = '';
  successMessage.value = '';

  try {
    await api.post('/rapor/nilai/unsubmit', {
      kelas_id: selectedKelas.value,
      mata_pelajaran_id: selectedMapel.value,
      periode_rapor_id: selectedPeriode.value,
    });

    successMessage.value = 'Nilai berhasil ditarik kembali ke draft.';
    await fetchNilai();
  } catch (err: any) {
    error.value = err.response?.data?.message || 'Gagal menarik kembali nilai.';
  } finally {
    unsubmitting.value = false;
  }
}

function getInputType(komponen: KomponenPenilaian): string {
  if (komponen.tipe === 'angka') return 'number';
  return 'text';
}

function validateNilaiAngka(siswaIdx: number, komponenIdx: number) {
  const komponen = komponenList.value[komponenIdx];
  if (komponen?.tipe !== 'angka') return;

  const val = nilaiData.value[siswaIdx].komponen[komponenIdx].nilai;
  if (val === null || val === '') return;

  const num = Number(val);
  if (komponen.skala_min !== null && num < komponen.skala_min) {
    nilaiData.value[siswaIdx].komponen[komponenIdx].nilai = komponen.skala_min;
  }
  if (komponen.skala_max !== null && num > komponen.skala_max) {
    nilaiData.value[siswaIdx].komponen[komponenIdx].nilai = komponen.skala_max;
  }
}

watch(selectedMapel, () => {
  selectedKelas.value = '';
  nilaiData.value = [];
  fetchKelas();
});

watch([selectedKelas, selectedPeriode], () => {
  fetchNilai();
});

watch(
  nilaiData,
  () => {
    isDirty.value = true;
  },
  { deep: true },
);

onMounted(() => {
  fetchMapel();
  autoSaveTimer = setInterval(async () => {
    if (isDirty.value && nilaiData.value.length > 0 && !saving.value && !isRaporFinalized.value) {
      try {
        await api.post('/rapor/nilai', {
          kelas_id: selectedKelas.value,
          mata_pelajaran_id: selectedMapel.value,
          periode_rapor_id: selectedPeriode.value,
          nilai: nilaiData.value.map((siswa) => ({
            siswa_id: siswa.siswa_id,
            komponen: siswa.komponen.map((k) => ({
              komponen_id: k.komponen_id,
              nilai: k.nilai,
            })),
            capaian_pembelajaran: siswa.capaian_pembelajaran || undefined,
          })),
          status: 'draft',
        });
        isDirty.value = false;
      } catch {
        // Silently fail auto-save — don't disrupt user with errors
      }
    }
  }, 30000);
});

onUnmounted(() => {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
});
</script>

<template>
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader title="Input Nilai Rapor" />

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <div class="min-w-[200px]">
        <SearchSelect
          v-model="selectedMapel"
          :options="mapelSelectOptions"
          label="Mata Pelajaran"
          placeholder="Pilih mata pelajaran"
          :required="true"
        />
      </div>

      <div class="min-w-[200px]">
        <SearchSelect
          v-model="selectedKelas"
          :options="kelasSelectOptions"
          label="Kelas"
          placeholder="Pilih kelas"
          :required="true"
          :disabled="!selectedMapel"
        />
      </div>

      <div class="min-w-[200px]">
        <SearchSelect
          v-model="selectedPeriode"
          :options="periodeOptions"
          label="Periode"
          placeholder="Pilih periode"
          :required="true"
        />
      </div>
    </div>

    <div
      v-if="error"
      class="p-3 bg-danger-50 border border-danger-500/20 rounded-lg text-sm text-danger-700 mb-4"
    >
      {{ error }}
    </div>
    <div
      v-if="successMessage"
      class="p-3 bg-success-50 border border-success-500/20 rounded-lg text-sm text-success-700 mb-4"
    >
      {{ successMessage }}
    </div>

    <!-- Nilai Table -->
    <div v-if="loadingNilai" class="text-center py-8">
      <svg class="w-6 h-6 animate-spin text-primary-500 mx-auto" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p class="text-sm text-text-secondary mt-2">Memuat data nilai...</p>
    </div>

    <div v-else-if="nilaiData.length > 0 && komponenList.length > 0">
      <div
        v-if="isRaporFinalized"
        class="p-3 bg-primary-50 border border-primary-500/20 rounded-lg text-sm text-primary-700 mb-4"
      >
        Rapor sudah difinalkan. Nilai tidak dapat diedit.
      </div>

      <div class="bg-white border border-border rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[800px]">
            <thead class="border-b border-border bg-surface-50">
              <tr>
                <th
                  class="px-4 py-3 text-left font-medium text-text-secondary text-xs sticky left-0 bg-surface-50 z-10 w-[40px]"
                >
                  No
                </th>
                <th
                  class="px-4 py-3 text-left font-medium text-text-secondary text-xs sticky left-[40px] bg-surface-50 z-10 min-w-[150px]"
                >
                  Nama Siswa
                </th>
                <th
                  v-for="k in komponenList"
                  :key="k.id"
                  class="px-4 py-3 text-left font-medium text-text-secondary text-xs whitespace-nowrap"
                >
                  {{ k.nama }}
                  <span v-if="k.is_wajib" class="text-danger-500">*</span>
                  <br />
                  <small class="text-text-tertiary font-normal">
                    <template v-if="k.tipe === 'angka'"
                      >({{ k.skala_min }}-{{ k.skala_max }})</template
                    >
                    <template v-else-if="k.tipe === 'huruf'">(A/B/C/D/E)</template>
                    <template v-else>(Deskripsi)</template>
                  </small>
                </th>
                <th
                  v-if="!isUTS"
                  class="px-4 py-3 text-left font-medium text-text-secondary text-xs"
                >
                  Capaian Pembelajaran
                </th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="(siswa, sIdx) in nilaiData"
                :key="siswa.siswa_id"
                class="hover:bg-surface-50 transition-colors"
              >
                <td class="px-4 py-3 text-sm sticky left-0 bg-white z-1">{{ sIdx + 1 }}</td>
                <td class="px-4 py-3 text-sm text-text-primary sticky left-[40px] bg-white z-1">
                  {{ siswa.siswa_nama }}
                </td>
                <td v-for="(komponen, kIdx) in komponenList" :key="komponen.id" class="px-4 py-3">
                  <template v-if="komponen.tipe === 'deskripsi'">
                    <textarea
                      v-model="siswa.komponen[kIdx].nilai"
                      class="w-full min-w-[150px] px-2 py-1.5 text-xs border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-y"
                      :disabled="isRaporFinalized"
                      rows="2"
                      :placeholder="isUTS ? 'Opsional' : 'Deskripsi'"
                    />
                  </template>
                  <template v-else-if="komponen.tipe === 'huruf'">
                    <select
                      v-model="siswa.komponen[kIdx].nilai"
                      class="w-full min-w-[80px] px-2 py-1.5 text-xs border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                      :disabled="isRaporFinalized"
                    >
                      <option value="">-</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                      <option value="D">D</option>
                      <option value="E">E</option>
                    </select>
                  </template>
                  <template v-else>
                    <input
                      v-model.number="siswa.komponen[kIdx].nilai"
                      :type="getInputType(komponen)"
                      class="w-full min-w-[80px] px-2 py-1.5 text-xs border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                      :disabled="isRaporFinalized"
                      :min="komponen.skala_min ?? undefined"
                      :max="komponen.skala_max ?? undefined"
                      @blur="validateNilaiAngka(sIdx, kIdx)"
                    />
                  </template>
                </td>
                <td v-if="!isUTS" class="px-4 py-3">
                  <textarea
                    v-model="siswa.capaian_pembelajaran"
                    class="w-full min-w-[150px] px-2 py-1.5 text-xs border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-y"
                    :disabled="isRaporFinalized"
                    rows="2"
                    placeholder="Deskripsi capaian"
                  />
                </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
                    :class="
                      siswa.status === 'submitted'
                        ? 'bg-success-50 text-success-700'
                        : 'bg-warning-50 text-warning-700'
                    "
                  >
                    {{ siswa.status === 'submitted' ? 'Submitted' : 'Draft' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Action buttons -->
      <div v-if="canUnsubmit" class="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
        <button
          class="px-3 py-2 text-sm font-medium text-warning-700 bg-warning-50 border border-warning-200 rounded-lg hover:bg-warning-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="unsubmitting"
          @click="unsubmitNilai"
        >
          {{ unsubmitting ? 'Menarik kembali...' : 'Tarik Kembali' }}
        </button>
      </div>
      <div
        v-if="!isRaporFinalized"
        class="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-border"
      >
        <span v-if="nilaiData.length > 0 && !isRaporFinalized" class="text-xs text-text-tertiary">
          Auto-save aktif (30 detik)
        </span>
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="saving"
          @click="saveNilai('draft')"
        >
          {{ saving ? 'Menyimpan...' : 'Simpan Draft' }}
        </button>
        <button
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="saving || !canSubmit"
          @click="saveNilai('submitted')"
        >
          {{ saving ? 'Menyimpan...' : 'Submit ke Wali Kelas' }}
        </button>
      </div>
    </div>

    <div
      v-else-if="selectedMapel && selectedKelas && selectedPeriode && !loadingNilai"
      class="text-center text-text-secondary py-8 text-sm"
    >
      Tidak ada data siswa untuk kelas dan periode ini.
    </div>

    <div
      v-else-if="!selectedMapel || !selectedKelas || !selectedPeriode"
      class="text-center text-text-secondary py-8 text-sm"
    >
      Pilih mata pelajaran, kelas, dan periode untuk mulai input nilai.
    </div>
  </div>
</template>
