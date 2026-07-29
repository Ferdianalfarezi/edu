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
  siswaId: string;
  siswaNama: string;
  nisn: string | null;
  rataRata: number | null;
  peringkat: number | null;
  catatanWaliKelas: string | null;
  p5Deskripsi: { dimensi: string; deskripsi: string }[] | null;
  nilaiPerMapel: {
    mataPelajaranNama: string;
    komponenNilai: { komponenNama: string; nilai: string | number }[];
    capaianPembelajaran: string | null;
  }[];
}

interface RaporOverview {
  status: 'draft' | 'final';
  finalizedBy: string | null;
  finalizedAt: string | null;
  kelasNama: string;
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
  <div class="p-8 max-w-7xl mx-auto">
    <PageHeader title="Rapor Siswa">
      <template #actions>
        <ActionButton
          v-if="raporOverview?.status === 'final'"
          variant="primary"
          icon="download"
          :disabled="exporting"
          @click="exportRapor"
        >
          {{ exporting ? 'Mengexport...' : 'Export Excel' }}
        </ActionButton>
      </template>
    </PageHeader>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3 mb-6">
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
      class="p-3 bg-danger-50 border-2 border-danger-200 rounded-[8px] text-[15px] text-danger-700 mb-4"
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
      <p class="text-[15px] text-text-secondary mt-2">Memuat data...</p>
    </div>

    <template v-else-if="raporOverview && siswaRapors.length > 0">
      <!-- Status Banner -->
      <div
        class="flex items-center justify-between p-4 bg-surface-warm border-2 border-stone-200 rounded-[12px] mb-4"
      >
        <div class="flex items-center gap-3">
          <span
            class="inline-flex items-center px-2.5 py-1 rounded-[8px] text-[13px] font-semibold"
            :class="getStatusBadgeClass(raporOverview.status)"
          >
            {{ raporOverview.status === 'final' ? 'Final' : 'Draft' }}
          </span>
          <span class="text-[15px] font-medium text-text-primary">
            {{ raporOverview.kelasNama }} —
            {{
              periodeOptions.find((p) => p.value === (raporOverview ? raporOverview.periode : ''))
                ?.label || (raporOverview ? raporOverview.periode : '')
            }}
          </span>
        </div>
        <div v-if="raporOverview.finalizedAt" class="text-[13px] text-text-secondary">
          Difinalkan: {{ new Date(raporOverview.finalizedAt).toLocaleString('id-ID') }}
        </div>
      </div>

      <!-- Students Table -->
      <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
        <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
          <h2 class="text-[16px] font-bold text-primary-800">Daftar Siswa</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="border-b-2 border-stone-200">
              <tr>
                <th
                  class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                >
                  No
                </th>
                <th
                  class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                >
                  Nama Siswa
                </th>
                <th
                  class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                >
                  NISN
                </th>
                <th
                  class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                >
                  Rata-rata
                </th>
                <th
                  class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                >
                  Peringkat
                </th>
                <th
                  class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                >
                  Status
                </th>
                <th
                  class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                >
                  Detail
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-200">
              <tr
                v-for="(siswa, idx) in siswaRapors"
                :key="siswa.siswaId"
                class="hover:bg-primary-50 transition-colors"
              >
                <td class="px-5 py-4 text-[15px]">{{ idx + 1 }}</td>
                <td class="px-5 py-4 text-[15px] text-text-primary font-medium">
                  {{ siswa.siswaNama }}
                </td>
                <td class="px-5 py-4 text-[15px] text-text-secondary">{{ siswa.nisn || '-' }}</td>
                <td class="px-5 py-4 text-[15px]">
                  {{
                    siswa.rataRata !== null && siswa.rataRata !== undefined
                      ? Number(siswa.rataRata).toFixed(1)
                      : '-'
                  }}
                </td>
                <td class="px-5 py-4 text-[15px]">{{ siswa.peringkat ?? '-' }}</td>
                <td class="px-5 py-4">
                  <span
                    class="inline-flex items-center px-2.5 py-1 rounded-[8px] text-[13px] font-semibold"
                    :class="
                      raporOverview && raporOverview.status === 'final'
                        ? 'bg-success-50 text-success-700'
                        : 'bg-warning-50 text-warning-700'
                    "
                  >
                    {{ raporOverview && raporOverview.status === 'final' ? 'Final' : 'Draft' }}
                  </span>
                </td>
                <td class="px-5 py-4">
                  <ActionButton variant="primary" icon="view" @click="viewDetail(siswa)">
                    Lihat
                  </ActionButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <div
      v-else-if="selectedKelas && selectedPeriode && !loading"
      class="text-center text-text-secondary py-8 text-[15px]"
    >
      Tidak ada data rapor untuk kelas dan periode ini.
    </div>
    <div
      v-else-if="!selectedKelas || !selectedPeriode"
      class="text-center text-text-secondary py-8 text-[15px]"
    >
      Pilih tahun ajaran, kelas, dan periode untuk melihat rapor.
    </div>

    <!-- Detail Modal -->
    <BaseModal
      :show="showDetailModal && !!detailSiswa"
      :title="'Rapor: ' + (detailSiswa?.siswaNama || '')"
      size="xl"
      @close="showDetailModal = false"
    >
      <template v-if="detailSiswa">
        <!-- Summary cards -->
        <div class="flex gap-6 mb-6 p-4 bg-surface-warm rounded-[12px] border-2 border-stone-200">
          <div class="flex flex-col">
            <span class="text-[13px] text-text-secondary uppercase tracking-[0.04em] font-bold"
              >Rata-rata</span
            >
            <span class="text-[24px] font-bold text-text-primary">
              {{
                detailSiswa.rataRata !== null && detailSiswa.rataRata !== undefined
                  ? Number(detailSiswa.rataRata).toFixed(1)
                  : '-'
              }}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-[13px] text-text-secondary uppercase tracking-[0.04em] font-bold"
              >Peringkat</span
            >
            <span class="text-[24px] font-bold text-text-primary">{{
              detailSiswa.peringkat ?? '-'
            }}</span>
          </div>
        </div>

        <!-- Nilai per mapel -->
        <div class="mb-6">
          <h3 class="text-[15px] font-bold text-text-primary mb-3">Nilai per Mata Pelajaran</h3>
          <div class="bg-white border-2 border-stone-200 rounded-[12px] overflow-hidden">
            <table class="w-full">
              <thead class="border-b-2 border-stone-200">
                <tr>
                  <th
                    class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                  >
                    Mata Pelajaran
                  </th>
                  <th
                    class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                  >
                    Komponen
                  </th>
                  <th
                    class="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
                  >
                    Capaian Pembelajaran
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-stone-200">
                <tr
                  v-for="mapel in detailSiswa.nilaiPerMapel"
                  :key="mapel.mataPelajaranNama"
                  class="hover:bg-primary-50 transition-colors"
                >
                  <td class="px-5 py-4 text-[15px] text-text-primary">
                    {{ mapel.mataPelajaranNama }}
                  </td>
                  <td class="px-5 py-4">
                    <div
                      v-for="k in mapel.komponenNilai"
                      :key="k.komponenNama"
                      class="flex gap-1 text-[13px]"
                    >
                      <span class="text-text-secondary">{{ k.komponenNama }}:</span>
                      <span class="font-semibold text-text-primary">{{ k.nilai }}</span>
                    </div>
                  </td>
                  <td class="px-5 py-4 text-[15px] text-text-secondary">
                    {{ mapel.capaianPembelajaran || '-' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- P5 -->
        <div v-if="detailSiswa.p5Deskripsi && detailSiswa.p5Deskripsi.length > 0" class="mb-6">
          <h3 class="text-[15px] font-bold text-text-primary mb-3">
            P5 - Profil Pelajar Pancasila
          </h3>
          <div class="flex flex-col gap-2">
            <div
              v-for="item in detailSiswa.p5Deskripsi"
              :key="item.dimensi"
              class="p-4 bg-purple-50 rounded-[12px] border-2 border-purple-200"
            >
              <strong class="text-[13px] text-purple-700 font-bold">{{ item.dimensi }}</strong>
              <p class="text-[15px] text-text-primary mt-1">{{ item.deskripsi }}</p>
            </div>
          </div>
        </div>

        <!-- Catatan Wali Kelas -->
        <div v-if="detailSiswa.catatanWaliKelas" class="mb-4">
          <h3 class="text-[15px] font-bold text-text-primary mb-3">Catatan Wali Kelas</h3>
          <p
            class="p-4 bg-surface-warm rounded-[12px] border-2 border-stone-200 text-[15px] text-text-primary leading-relaxed"
          >
            {{ detailSiswa.catatanWaliKelas }}
          </p>
        </div>
      </template>

      <template #footer>
        <ActionButton variant="neutral" icon="x" @click="showDetailModal = false">
          Tutup
        </ActionButton>
      </template>
    </BaseModal>
  </div>
</template>
