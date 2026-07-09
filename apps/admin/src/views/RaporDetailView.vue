<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api/client';
import { PeriodeRapor } from '@edu/shared';
import { PageHeader, BaseModal, SearchSelect, ActionButton } from '@/components/ui';
import type { SelectOption } from '@/components/ui';

interface KelasOption {
  id: string;
  nama: string;
}

interface TahunAjaranOption {
  id: string;
  nama: string;
  status?: string;
}

interface SiswaRaporView {
  siswa_id: string;
  siswa_nama: string;
  nisn: string | null;
  rata_rata: number | null;
  peringkat: number | null;
  catatan_wali_kelas: string | null;
  p5_deskripsi: { dimensi: string; deskripsi: string }[] | null;
  nilai_per_mapel: {
    mata_pelajaran_nama: string;
    komponen_nilai: { komponen_nama: string; nilai: string | number }[];
    capaian_pembelajaran: string | null;
  }[];
}

interface RaporOverview {
  status: 'draft' | 'final';
  finalized_by: string | null;
  finalized_at: string | null;
  kelas_nama: string;
  periode: string;
}

const selectedKelas = ref('');
const selectedPeriode = ref<string>('');
const selectedTahunAjaran = ref('');

const kelasOptions = ref<KelasOption[]>([]);
const tahunAjaranOptions = ref<TahunAjaranOption[]>([]);
const siswaRapors = ref<SiswaRaporView[]>([]);
const raporOverview = ref<RaporOverview | null>(null);

const loading = ref(false);
const error = ref('');
const exporting = ref(false);

// Detail view for individual student
const showDetailModal = ref(false);
const detailSiswa = ref<SiswaRaporView | null>(null);

const periodeOptions = [
  { value: PeriodeRapor.UTS_SEMESTER_1, label: 'UTS Semester 1' },
  { value: PeriodeRapor.SEMESTER_1, label: 'Semester 1' },
  { value: PeriodeRapor.UTS_SEMESTER_2, label: 'UTS Semester 2' },
  { value: PeriodeRapor.SEMESTER_2, label: 'Semester 2' },
];

const tahunAjaranSelectOptions = computed<SelectOption[]>(() =>
  tahunAjaranOptions.value.map((t) => ({ value: t.id, label: t.nama })),
);

const kelasSelectOptions = computed<SelectOption[]>(() =>
  kelasOptions.value.map((k) => ({ value: k.id, label: k.nama })),
);

const periodeSelectOptions = computed<SelectOption[]>(() =>
  periodeOptions.map((p) => ({ value: p.value, label: p.label })),
);

async function fetchTahunAjaran() {
  try {
    const { data } = await api.get<TahunAjaranOption[]>('/tahun-ajaran');
    tahunAjaranOptions.value = data;
    const aktif = data.find((t) => t.status === 'aktif');
    if (aktif) selectedTahunAjaran.value = aktif.id;
  } catch (err) {
    console.error('Failed to fetch tahun ajaran:', err);
  }
}

async function fetchKelas() {
  if (!selectedTahunAjaran.value) {
    kelasOptions.value = [];
    return;
  }
  try {
    const { data } = await api.get<{ data: KelasOption[] }>(
      `/kelas?tahunAjaranId=${selectedTahunAjaran.value}`,
    );
    kelasOptions.value = data.data;
  } catch (err) {
    console.error('Failed to fetch kelas:', err);
  }
}

async function fetchRapor() {
  if (!selectedKelas.value || !selectedPeriode.value) {
    siswaRapors.value = [];
    raporOverview.value = null;
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    const params = new URLSearchParams({
      kelas_id: selectedKelas.value,
      periode_id: selectedPeriode.value,
    });

    const { data } = await api.get<{
      data: {
        overview: RaporOverview;
        siswa: SiswaRaporView[];
      };
    }>(`/rapor/view?${params.toString()}`);

    raporOverview.value = data.data.overview;
    siswaRapors.value = data.data.siswa;
  } catch (err) {
    error.value = err.response?.data?.message || 'Gagal memuat data rapor.';
  } finally {
    loading.value = false;
  }
}

async function exportRapor() {
  if (!selectedKelas.value || !selectedPeriode.value) return;

  exporting.value = true;
  try {
    const params = new URLSearchParams({
      kelas_id: selectedKelas.value,
      periode_id: selectedPeriode.value,
    });

    const response = await api.get(`/rapor/export?${params.toString()}`, {
      responseType: 'blob',
    });

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    const kelasNama = kelasOptions.value.find((k) => k.id === selectedKelas.value)?.nama || 'rapor';
    const periodeLabel =
      periodeOptions.find((p) => p.value === selectedPeriode.value)?.label || 'periode';
    link.setAttribute('download', `Rapor_${kelasNama}_${periodeLabel}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    error.value = err.response?.data?.message || 'Gagal export rapor.';
  } finally {
    exporting.value = false;
  }
}

function viewDetail(siswa: SiswaRaporView) {
  detailSiswa.value = siswa;
  showDetailModal.value = true;
}

function getStatusBadgeClass(status: string): string {
  return status === 'final' ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700';
}

watch(selectedTahunAjaran, () => {
  selectedKelas.value = '';
  siswaRapors.value = [];
  raporOverview.value = null;
  fetchKelas();
});

watch([selectedKelas, selectedPeriode], () => {
  fetchRapor();
});

onMounted(() => {
  fetchTahunAjaran();
});
</script>

<template>
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader title="Rapor Siswa">
      <template #actions>
        <button
          v-if="raporOverview?.status === 'final'"
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="exporting"
          @click="exportRapor"
        >
          {{ exporting ? 'Mengexport...' : 'Export Excel' }}
        </button>
      </template>
    </PageHeader>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <div class="flex flex-col gap-1 min-w-[200px]">
        <SearchSelect
          v-model="selectedTahunAjaran"
          label="Tahun Ajaran"
          :options="tahunAjaranSelectOptions"
          placeholder="Pilih tahun ajaran"
        />
      </div>

      <div class="flex flex-col gap-1 min-w-[200px]">
        <SearchSelect
          v-model="selectedKelas"
          label="Kelas"
          :options="kelasSelectOptions"
          placeholder="Pilih kelas"
          :disabled="!selectedTahunAjaran"
        />
      </div>

      <div class="flex flex-col gap-1 min-w-[200px]">
        <SearchSelect
          v-model="selectedPeriode"
          label="Periode"
          :options="periodeSelectOptions"
          placeholder="Pilih periode"
        />
      </div>
    </div>

    <div
      v-if="error"
      class="p-3 bg-danger-50 border border-danger-500/20 rounded-lg text-sm text-danger-700 mb-4"
    >
      {{ error }}
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

    <template v-else-if="raporOverview && siswaRapors.length > 0">
      <!-- Status Banner -->
      <div
        class="flex items-center justify-between p-3 bg-surface-50 border border-border rounded-lg mb-4"
      >
        <div class="flex items-center gap-3">
          <span
            class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
            :class="getStatusBadgeClass(raporOverview.status)"
          >
            {{ raporOverview.status === 'final' ? 'Final' : 'Draft' }}
          </span>
          <span class="text-sm font-medium text-text-primary">
            {{ raporOverview.kelas_nama }} —
            {{
              periodeOptions.find((p) => p.value === (raporOverview ? raporOverview.periode : ''))
                ?.label || (raporOverview ? raporOverview.periode : '')
            }}
          </span>
        </div>
        <div v-if="raporOverview.finalized_at" class="text-xs text-text-secondary">
          Difinalkan: {{ new Date(raporOverview.finalized_at).toLocaleString('id-ID') }}
        </div>
      </div>

      <!-- Students Table -->
      <div class="bg-white border border-border rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="border-b border-border bg-surface-50">
              <tr>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">No</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                  Nama Siswa
                </th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">NISN</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                  Rata-rata
                </th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">
                  Peringkat
                </th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Status</th>
                <th class="px-4 py-3 text-left font-medium text-text-secondary text-xs">Detail</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr
                v-for="(siswa, idx) in siswaRapors"
                :key="siswa.siswa_id"
                class="hover:bg-surface-50 transition-colors"
              >
                <td class="px-4 py-3 text-sm">{{ idx + 1 }}</td>
                <td class="px-4 py-3 text-sm text-text-primary font-medium">
                  {{ siswa.siswa_nama }}
                </td>
                <td class="px-4 py-3 text-sm text-text-secondary">{{ siswa.nisn || '-' }}</td>
                <td class="px-4 py-3 text-sm">
                  {{ siswa.rata_rata !== null ? siswa.rata_rata.toFixed(1) : '-' }}
                </td>
                <td class="px-4 py-3 text-sm">{{ siswa.peringkat ?? '-' }}</td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
                    :class="
                      raporOverview && raporOverview.status === 'final'
                        ? 'bg-success-50 text-success-700'
                        : 'bg-warning-50 text-warning-700'
                    "
                  >
                    {{ raporOverview && raporOverview.status === 'final' ? 'Final' : 'Draft' }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <ActionButton variant="primary" icon="view" @click="viewDetail(siswa)"
                    >Lihat</ActionButton
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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
      Pilih tahun ajaran, kelas, dan periode untuk melihat rapor.
    </div>

    <!-- Detail Modal -->
    <BaseModal
      :show="showDetailModal && !!detailSiswa"
      :title="'Rapor: ' + (detailSiswa?.siswa_nama || '')"
      size="xl"
      @close="showDetailModal = false"
    >
      <template v-if="detailSiswa">
        <!-- Summary cards -->
        <div class="flex gap-6 mb-6 p-3 bg-surface-50 rounded-lg">
          <div class="flex flex-col">
            <span class="text-xs text-text-secondary uppercase tracking-wide">Rata-rata</span>
            <span class="text-xl font-bold text-text-primary">
              {{ detailSiswa.rata_rata !== null ? detailSiswa.rata_rata.toFixed(1) : '-' }}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-xs text-text-secondary uppercase tracking-wide">Peringkat</span>
            <span class="text-xl font-bold text-text-primary">{{
              detailSiswa.peringkat ?? '-'
            }}</span>
          </div>
        </div>

        <!-- Nilai per mapel -->
        <div class="mb-6">
          <h3 class="text-sm font-semibold text-text-primary mb-3">Nilai per Mata Pelajaran</h3>
          <div class="bg-white border border-border rounded-lg overflow-hidden">
            <table class="w-full">
              <thead class="border-b border-border bg-surface-50">
                <tr>
                  <th class="px-4 py-2 text-left font-medium text-text-secondary text-xs">
                    Mata Pelajaran
                  </th>
                  <th class="px-4 py-2 text-left font-medium text-text-secondary text-xs">
                    Komponen
                  </th>
                  <th class="px-4 py-2 text-left font-medium text-text-secondary text-xs">
                    Capaian Pembelajaran
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="mapel in detailSiswa.nilai_per_mapel" :key="mapel.mata_pelajaran_nama">
                  <td class="px-4 py-2 text-xs text-text-primary">
                    {{ mapel.mata_pelajaran_nama }}
                  </td>
                  <td class="px-4 py-2">
                    <div
                      v-for="k in mapel.komponen_nilai"
                      :key="k.komponen_nama"
                      class="flex gap-1 text-xs"
                    >
                      <span class="text-text-secondary">{{ k.komponen_nama }}:</span>
                      <span class="font-medium text-text-primary">{{ k.nilai }}</span>
                    </div>
                  </td>
                  <td class="px-4 py-2 text-xs text-text-secondary">
                    {{ mapel.capaian_pembelajaran || '-' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- P5 -->
        <div v-if="detailSiswa.p5_deskripsi && detailSiswa.p5_deskripsi.length > 0" class="mb-6">
          <h3 class="text-sm font-semibold text-text-primary mb-3">
            P5 - Profil Pelajar Pancasila
          </h3>
          <div class="flex flex-col gap-2">
            <div
              v-for="item in detailSiswa.p5_deskripsi"
              :key="item.dimensi"
              class="p-3 bg-purple-50 rounded-lg"
            >
              <strong class="text-xs text-purple-700">{{ item.dimensi }}</strong>
              <p class="text-xs text-text-primary mt-1">{{ item.deskripsi }}</p>
            </div>
          </div>
        </div>

        <!-- Catatan Wali Kelas -->
        <div v-if="detailSiswa.catatan_wali_kelas" class="mb-4">
          <h3 class="text-sm font-semibold text-text-primary mb-3">Catatan Wali Kelas</h3>
          <p class="p-3 bg-surface-50 rounded-lg text-sm text-text-primary leading-relaxed">
            {{ detailSiswa.catatan_wali_kelas }}
          </p>
        </div>
      </template>

      <template #footer>
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showDetailModal = false"
        >
          Tutup
        </button>
      </template>
    </BaseModal>
  </div>
</template>
