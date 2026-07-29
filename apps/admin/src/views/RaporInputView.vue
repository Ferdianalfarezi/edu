<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { api } from '@/api/client';
import { PeriodeRapor } from '@edu/shared';
import { PageHeader, SearchSelect, ActionButton } from '@/components/ui';
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
  skalaMin: number | null;
  skalaMax: number | null;
  isWajib: boolean;
}

interface SiswaNilai {
  siswaId: string;
  siswaNama: string;
  komponen: { komponenId: string; nilai: string | number | null }[];
  capaianPembelajaran: string;
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
      const komponen = komponenList.value.find((kp) => kp.id === k.komponenId);
      if (!komponen) return true;
      if (!komponen.isWajib) return true;
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
        mapelId: string;
        mapelNama: string;
        kelas: { kelasId: string; kelasNama: string }[];
      }[];
    }>('/rapor/mata-pelajaran');
    mapelOptions.value = data.data.map((m) => ({ id: m.mapelId, nama: m.mapelNama }));
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
      `/rapor/kelas?mapelId=${selectedMapel.value}`,
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
      kelasId: selectedKelas.value,
      periodeId: selectedPeriode.value,
      mapelId: selectedMapel.value,
    });

    const { data } = await api.get<{
      data: {
        kelasId: string;
        kelasNama: string;
        mapelId: string;
        mapelNama: string;
        periode: string;
        komponenPenilaian: KomponenPenilaian[];
        students: {
          siswaId: string;
          siswaNama: string;
          komponenNilai: { komponenId: string; nilai: string | number }[] | null;
          capaianPembelajaran: string | null;
          status: 'draft' | 'submitted' | null;
        }[];
      };
    }>(`/rapor/nilai?${params.toString()}`);

    komponenList.value = data.data.komponenPenilaian;
    nilaiData.value = data.data.students.map((s) => ({
      siswaId: s.siswaId,
      siswaNama: s.siswaNama,
      komponen:
        s.komponenNilai ??
        data.data.komponenPenilaian.map((k) => ({
          komponenId: k.id,
          nilai: k.tipe === 'angka' ? 0 : '-',
        })),
      capaianPembelajaran: s.capaianPembelajaran ?? '-',
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
      kelasId: selectedKelas.value,
      mataPelajaranId: selectedMapel.value,
      periodeRaporId: selectedPeriode.value,
      nilai: nilaiData.value.map((siswa) => ({
        siswaId: siswa.siswaId,
        komponen: siswa.komponen.map((k) => ({
          komponenId: k.komponenId,
          nilai: k.nilai,
        })),
        capaianPembelajaran: siswa.capaianPembelajaran || undefined,
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
  if (komponen.skalaMin !== null && num < komponen.skalaMin) {
    nilaiData.value[siswaIdx].komponen[komponenIdx].nilai = komponen.skalaMin;
  }
  if (komponen.skalaMax !== null && num > komponen.skalaMax) {
    nilaiData.value[siswaIdx].komponen[komponenIdx].nilai = komponen.skalaMax;
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
          kelasId: selectedKelas.value,
          mataPelajaranId: selectedMapel.value,
          periodeRaporId: selectedPeriode.value,
          nilai: nilaiData.value.map((siswa) => ({
            siswaId: siswa.siswaId,
            komponen: siswa.komponen.map((k) => ({
              komponenId: k.komponenId,
              nilai: k.nilai,
            })),
            capaianPembelajaran: siswa.capaianPembelajaran || undefined,
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
  <div class="p-8 max-w-7xl mx-auto">
    <PageHeader title="Input Nilai Rapor" />

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3 mb-6">
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
      class="p-3 bg-danger-50 border-2 border-danger-200 rounded-[8px] text-[15px] text-danger-700 mb-4"
    >
      {{ error }}
    </div>
    <div
      v-if="successMessage"
      class="p-3 bg-success-50 border-2 border-success-200 rounded-[8px] text-[15px] text-success-700 mb-4"
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
      <p class="text-[15px] text-text-secondary mt-2">Memuat data nilai...</p>
    </div>

    <div v-else-if="nilaiData.length > 0 && komponenList.length > 0">
      <div
        v-if="isRaporFinalized"
        class="p-3 bg-primary-50 border-2 border-primary-200 rounded-[8px] text-[15px] text-primary-700 mb-4"
      >
        Rapor sudah difinalkan. Nilai tidak dapat diedit.
      </div>

      <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
        <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
          <h2 class="text-[16px] font-bold text-primary-800">Tabel Input Nilai</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[800px]">
            <thead class="border-b-2 border-stone-200">
              <tr>
                <th
                  class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm sticky left-0 z-10 w-[40px]"
                >
                  No
                </th>
                <th
                  class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm sticky left-[40px] z-10 min-w-[150px]"
                >
                  Nama Siswa
                </th>
                <th
                  v-for="k in komponenList"
                  :key="k.id"
                  class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm whitespace-nowrap"
                >
                  {{ k.nama }}
                  <span v-if="k.isWajib" class="text-danger-500">*</span>
                  <br />
                  <small class="text-text-tertiary font-normal normal-case tracking-normal">
                    <template v-if="k.tipe === 'angka'"
                      >({{ k.skalaMin }}-{{ k.skalaMax }})</template
                    >
                    <template v-else-if="k.tipe === 'huruf'">(A/B/C/D/E)</template>
                    <template v-else>(Deskripsi)</template>
                  </small>
                </th>
                <th
                  v-if="!isUTS"
                  class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                >
                  Capaian Pembelajaran
                </th>
                <th
                  class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-200">
              <tr
                v-for="(siswa, sIdx) in nilaiData"
                :key="siswa.siswaId"
                class="hover:bg-primary-50 transition-colors"
              >
                <td class="px-5 py-4 text-[15px] sticky left-0 bg-white z-[1]">{{ sIdx + 1 }}</td>
                <td
                  class="px-5 py-4 text-[15px] text-text-primary sticky left-[40px] bg-white z-[1]"
                >
                  {{ siswa.siswaNama }}
                </td>
                <td v-for="(komponen, kIdx) in komponenList" :key="komponen.id" class="px-5 py-4">
                  <template v-if="komponen.tipe === 'deskripsi'">
                    <textarea
                      v-model="siswa.komponen[kIdx].nilai"
                      class="w-full min-w-[150px] px-3 py-2 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-y"
                      :disabled="isRaporFinalized"
                      rows="2"
                      :placeholder="isUTS ? 'Opsional' : 'Deskripsi'"
                    />
                  </template>
                  <template v-else-if="komponen.tipe === 'huruf'">
                    <select
                      v-model="siswa.komponen[kIdx].nilai"
                      class="w-full min-w-[80px] px-3 py-2 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
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
                      class="w-full min-w-[80px] px-3 py-2 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                      :disabled="isRaporFinalized"
                      :min="komponen.skalaMin ?? undefined"
                      :max="komponen.skalaMax ?? undefined"
                      @blur="validateNilaiAngka(sIdx, kIdx)"
                    />
                  </template>
                </td>
                <td v-if="!isUTS" class="px-5 py-4">
                  <textarea
                    v-model="siswa.capaianPembelajaran"
                    class="w-full min-w-[150px] px-3 py-2 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-y"
                    :disabled="isRaporFinalized"
                    rows="2"
                    placeholder="Deskripsi capaian"
                  />
                </td>
                <td class="px-5 py-4">
                  <span
                    class="inline-flex items-center px-2.5 py-1 rounded-[8px] text-[13px] font-semibold"
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
      <div v-if="canUnsubmit" class="flex justify-end gap-3 mt-6 pt-4 border-t-2 border-stone-200">
        <ActionButton
          variant="warning"
          icon="revert"
          :disabled="unsubmitting"
          @click="unsubmitNilai"
        >
          {{ unsubmitting ? 'Menarik kembali...' : 'Tarik Kembali' }}
        </ActionButton>
      </div>
      <div
        v-if="!isRaporFinalized"
        class="flex items-center justify-end gap-3 mt-6 pt-4 border-t-2 border-stone-200"
      >
        <span
          v-if="nilaiData.length > 0 && !isRaporFinalized"
          class="text-[13px] text-text-tertiary"
        >
          Auto-save aktif (30 detik)
        </span>
        <ActionButton variant="neutral" icon="check" :disabled="saving" @click="saveNilai('draft')">
          {{ saving ? 'Menyimpan...' : 'Simpan Draft' }}
        </ActionButton>
        <ActionButton
          variant="primary"
          icon="check"
          :disabled="saving || !canSubmit"
          @click="saveNilai('submitted')"
        >
          {{ saving ? 'Menyimpan...' : 'Submit ke Wali Kelas' }}
        </ActionButton>
      </div>
    </div>

    <div
      v-else-if="selectedMapel && selectedKelas && selectedPeriode && !loadingNilai"
      class="text-center text-text-secondary py-8 text-[15px]"
    >
      Tidak ada data siswa untuk kelas dan periode ini.
    </div>

    <div
      v-else-if="!selectedMapel || !selectedKelas || !selectedPeriode"
      class="text-center text-text-secondary py-8 text-[15px]"
    >
      Pilih mata pelajaran, kelas, dan periode untuk mulai input nilai.
    </div>
  </div>
</template>
