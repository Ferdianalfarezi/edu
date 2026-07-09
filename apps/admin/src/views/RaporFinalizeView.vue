<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { api } from '@/api/client';
import { PeriodeRapor } from '@edu/shared';
import { PageHeader, BaseModal, SearchSelect, ActionButton } from '@/components/ui';
import type { SelectOption } from '@/components/ui';

interface KelasOption {
  id: string;
  nama: string;
}

interface MapelStatus {
  mata_pelajaran_id: string;
  mata_pelajaran_nama: string;
  guru_nama: string;
  status: 'draft' | 'submitted' | 'not_started';
}

interface SiswaRapor {
  siswa_id: string;
  siswa_nama: string;
  rata_rata: number | null;
  peringkat: number | null;
  catatan_wali_kelas: string;
  p5_deskripsi: { dimensi: string; deskripsi: string }[] | null;
  nilai_per_mapel: {
    mata_pelajaran_nama: string;
    komponen_nilai: { komponen_nama: string; nilai: string | number }[];
  }[];
}

interface RaporStatus {
  status: 'draft' | 'final';
  finalized_by: string | null;
  finalized_at: string | null;
}

const selectedKelas = ref('');
const selectedPeriode = ref<string>('');

const kelasOptions = ref<KelasOption[]>([]);
const mapelStatuses = ref<MapelStatus[]>([]);
const siswaRapors = ref<SiswaRapor[]>([]);
const raporStatus = ref<RaporStatus | null>(null);

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

// P5 editing
const showP5Modal = ref(false);
const editingP5SiswaIdx = ref(-1);
const p5Form = ref<{ dimensi: string; deskripsi: string }[]>([]);

const periodeOptions: SelectOption[] = [
  { value: PeriodeRapor.UTS_SEMESTER_1, label: 'UTS Semester 1' },
  { value: PeriodeRapor.SEMESTER_1, label: 'Semester 1' },
  { value: PeriodeRapor.UTS_SEMESTER_2, label: 'UTS Semester 2' },
  { value: PeriodeRapor.SEMESTER_2, label: 'Semester 2' },
];

const kelasSelectOptions = computed<SelectOption[]>(() =>
  kelasOptions.value.map((k) => ({ value: k.id, label: k.nama })),
);

const allSubmitted = computed(() => {
  if (!mapelStatuses.value.length) return false;
  return mapelStatuses.value.every((m) => m.status === 'submitted');
});

const isFinalized = computed(() => raporStatus.value?.status === 'final');

async function fetchKelas() {
  try {
    const { data } = await api.get<{ data: KelasOption[] }>('/rapor/kelas-wali');
    kelasOptions.value = data.data;
  } catch (err) {
    console.error('Failed to fetch kelas:', err);
  }
}

async function fetchRaporOverview() {
  if (!selectedKelas.value || !selectedPeriode.value) {
    mapelStatuses.value = [];
    siswaRapors.value = [];
    raporStatus.value = null;
    return;
  }

  loading.value = true;
  error.value = '';
  successMessage.value = '';

  try {
    const params = new URLSearchParams({
      kelas_id: selectedKelas.value,
      periode_id: selectedPeriode.value,
    });

    const { data } = await api.get<{
      data: {
        mapel_status: MapelStatus[];
        siswa: SiswaRapor[];
        rapor: RaporStatus;
      };
    }>(`/rapor/finalize-overview?${params.toString()}`);

    mapelStatuses.value = data.data.mapel_status;
    siswaRapors.value = data.data.siswa;
    raporStatus.value = data.data.rapor;
  } catch (err) {
    error.value = err.response?.data?.message || 'Gagal memuat data rapor.';
  } finally {
    loading.value = false;
  }
}

function openP5Modal(siswaIdx: number) {
  editingP5SiswaIdx.value = siswaIdx;
  const current = siswaRapors.value[siswaIdx].p5_deskripsi;
  p5Form.value = current
    ? current.map((d) => ({ ...d }))
    : [
        { dimensi: 'Beriman, Bertakwa kepada Tuhan YME', deskripsi: '' },
        { dimensi: 'Berkebinekaan Global', deskripsi: '' },
        { dimensi: 'Bergotong-royong', deskripsi: '' },
        { dimensi: 'Mandiri', deskripsi: '' },
        { dimensi: 'Bernalar Kritis', deskripsi: '' },
        { dimensi: 'Kreatif', deskripsi: '' },
      ];
  showP5Modal.value = true;
}

function saveP5() {
  const filtered = p5Form.value.filter((d) => d.deskripsi.trim());
  siswaRapors.value[editingP5SiswaIdx.value].p5_deskripsi = filtered.length ? filtered : null;
  showP5Modal.value = false;
}

async function finalize() {
  if (!allSubmitted.value) {
    error.value = 'Semua guru harus submit nilai terlebih dahulu.';
    return;
  }

  saving.value = true;
  error.value = '';
  successMessage.value = '';

  try {
    await api.post('/rapor/nilai/catatan', {
      kelas_id: selectedKelas.value,
      periode_rapor_id: selectedPeriode.value,
      data: siswaRapors.value.map((s) => ({
        siswa_id: s.siswa_id,
        catatan_wali_kelas: s.catatan_wali_kelas || undefined,
        p5_deskripsi: s.p5_deskripsi || undefined,
      })),
    });

    await api.post(`/rapor/kelas/${selectedKelas.value}/periode/${selectedPeriode.value}/finalize`);

    successMessage.value =
      'Rapor berhasil difinalkan. Rapor sekarang dapat dilihat oleh orang tua.';
    await fetchRaporOverview();
  } catch (err) {
    error.value = err.response?.data?.message || 'Gagal memfinalisasi rapor.';
  } finally {
    saving.value = false;
  }
}

async function revertFinalize() {
  saving.value = true;
  error.value = '';
  successMessage.value = '';

  try {
    await api.post(`/rapor/kelas/${selectedKelas.value}/periode/${selectedPeriode.value}/revert`);
    successMessage.value = 'Finalisasi dibatalkan. Rapor kembali ke status draft.';
    await fetchRaporOverview();
  } catch (err) {
    error.value = err.response?.data?.message || 'Gagal membatalkan finalisasi.';
  } finally {
    saving.value = false;
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'submitted':
      return 'bg-success-50 text-success-700';
    case 'draft':
      return 'bg-warning-50 text-warning-700';
    default:
      return 'bg-surface-100 text-text-secondary';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'submitted':
      return 'Submitted';
    case 'draft':
      return 'Draft';
    default:
      return 'Belum diisi';
  }
}

watch([selectedKelas, selectedPeriode], () => {
  fetchRaporOverview();
});

onMounted(fetchKelas);
</script>

<template>
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader
      title="Finalisasi Rapor"
      description="Review status input nilai dari guru, tambahkan P5 dan catatan wali kelas, lalu finalkan rapor."
    />

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <div class="min-w-[200px]">
        <SearchSelect
          v-model="selectedKelas"
          :options="kelasSelectOptions"
          label="Kelas (Wali Kelas)"
          placeholder="Pilih kelas"
          :required="true"
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

    <div v-if="loading" class="text-center py-8">
      <svg class="w-6 h-6 animate-spin text-primary-500 mx-auto" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p class="text-sm text-text-secondary mt-2">Memuat data...</p>
    </div>

    <template v-else-if="selectedKelas && selectedPeriode && mapelStatuses.length > 0">
      <!-- Rapor Status Banner -->
      <div
        v-if="isFinalized"
        class="p-3 bg-primary-50 border border-primary-500/20 rounded-lg text-sm text-primary-700 mb-4"
      >
        <strong>Status: Final</strong> — Rapor sudah difinalkan pada
        {{
          raporStatus && raporStatus.finalized_at
            ? new Date(raporStatus.finalized_at).toLocaleString('id-ID')
            : ''
        }}. Orang tua dapat melihat rapor ini.
      </div>

      <!-- Status Mata Pelajaran -->
      <section class="mb-6">
        <h2 class="text-lg font-semibold text-text-primary mb-3">
          Status Input Nilai per Mata Pelajaran
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <div
            v-for="m in mapelStatuses"
            :key="m.mata_pelajaran_id"
            class="bg-white border border-border rounded-lg p-3"
          >
            <div class="flex justify-between items-center">
              <span class="font-semibold text-sm text-text-primary">{{
                m.mata_pelajaran_nama
              }}</span>
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
                :class="getStatusBadgeClass(m.status)"
              >
                {{ getStatusLabel(m.status) }}
              </span>
            </div>
            <p class="text-xs text-text-secondary mt-1">Guru: {{ m.guru_nama }}</p>
          </div>
        </div>

        <div
          v-if="!allSubmitted"
          class="p-3 bg-warning-50 border border-warning-500/20 rounded-lg text-sm text-warning-700 mb-4"
        >
          Belum semua guru submit nilai. Finalisasi belum dapat dilakukan.
        </div>
      </section>

      <!-- Siswa Overview & Catatan -->
      <section v-if="allSubmitted && siswaRapors.length > 0" class="mb-6">
        <h2 class="text-lg font-semibold text-text-primary mb-3">
          Data Siswa & Catatan Wali Kelas
        </h2>
        <div class="bg-white border border-border rounded-xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="border-b border-border bg-surface-50">
                <tr>
                  <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">No</th>
                  <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                    Nama Siswa
                  </th>
                  <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                    Rata-rata
                  </th>
                  <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                    Peringkat
                  </th>
                  <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                    Catatan Wali Kelas
                  </th>
                  <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">P5</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr
                  v-for="(siswa, idx) in siswaRapors"
                  :key="siswa.siswa_id"
                  class="hover:bg-surface-50 transition-colors"
                >
                  <td class="px-4 py-3 text-sm">{{ idx + 1 }}</td>
                  <td class="px-4 py-3 text-sm text-text-primary">{{ siswa.siswa_nama }}</td>
                  <td class="px-4 py-3 text-sm">
                    {{ siswa.rata_rata !== null ? siswa.rata_rata.toFixed(1) : '-' }}
                  </td>
                  <td class="px-4 py-3 text-sm">{{ siswa.peringkat ?? '-' }}</td>
                  <td class="px-4 py-3">
                    <textarea
                      v-model="siswa.catatan_wali_kelas"
                      class="w-full min-w-[150px] px-2 py-1.5 text-xs border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-y"
                      :disabled="isFinalized"
                      rows="2"
                      placeholder="Catatan tentang siswa..."
                    />
                  </td>
                  <td class="px-4 py-3">
                    <ActionButton
                      variant="purple"
                      icon="edit"
                      :disabled="isFinalized"
                      @click="openP5Modal(idx)"
                      >{{ siswa.p5_deskripsi ? 'Edit P5' : 'Isi P5' }}</ActionButton
                    >
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- Action Buttons -->
      <div class="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
        <button
          v-if="isFinalized"
          class="px-3 py-2 text-sm font-medium text-white bg-warning-500 rounded-lg hover:bg-warning-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="saving"
          @click="revertFinalize"
        >
          {{ saving ? 'Memproses...' : 'Batalkan Finalisasi (Revert)' }}
        </button>
        <button
          v-else
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="saving || !allSubmitted"
          @click="finalize"
        >
          {{ saving ? 'Memproses...' : 'Finalkan Rapor' }}
        </button>
      </div>
    </template>

    <div
      v-else-if="selectedKelas && selectedPeriode && !loading"
      class="text-center text-text-secondary py-8 text-sm"
    >
      Tidak ada data rapor untuk kelas dan periode ini.
    </div>
    <div
      v-else-if="!selectedKelas || !selectedPeriode"
      class="text-center text-text-secondary py-8 text-sm"
    >
      Pilih kelas dan periode untuk melihat status rapor.
    </div>

    <!-- P5 Modal -->
    <BaseModal
      :show="showP5Modal"
      title="P5 - Profil Pelajar Pancasila"
      size="lg"
      @close="showP5Modal = false"
    >
      <p class="text-sm text-text-secondary mb-4">
        Isi deskripsi naratif per dimensi (opsional). Kosongkan jika tidak relevan.
      </p>
      <div class="flex flex-col gap-3">
        <div v-for="(item, idx) in p5Form" :key="idx">
          <label class="block text-sm font-medium text-text-primary mb-1.5">{{
            item.dimensi
          }}</label>
          <textarea
            v-model="item.deskripsi"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            rows="2"
            placeholder="Deskripsi naratif..."
          />
        </div>
      </div>

      <template #footer>
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showP5Modal = false"
        >
          Batal
        </button>
        <button
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          @click="saveP5"
        >
          Simpan
        </button>
      </template>
    </BaseModal>
  </div>
</template>
