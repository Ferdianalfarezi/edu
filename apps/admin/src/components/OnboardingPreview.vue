<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ParsedOnboardingData } from '@/composables/useExcelParser';
import { kelasLabel } from '@/utils/kelas-label';

const props = defineProps<{
  data: ParsedOnboardingData;
  errors: string[];
  warnings: string[];
  jenjang?: string | null;
}>();

const emit = defineEmits<{ gantiFile: [] }>();

type TabId = 'siswa' | 'kelas' | 'mata-pelajaran' | 'guru-staff' | 'spp';
const activeTab = ref<TabId>('siswa');

const tabs = [
  { id: 'siswa' as TabId, label: 'Siswa', count: () => props.data.siswa.length },
  { id: 'kelas' as TabId, label: 'Kelas', count: () => props.data.kelas.length },
  {
    id: 'mata-pelajaran' as TabId,
    label: 'Mata Pelajaran',
    count: () => props.data.mataPelajaran.length,
  },
  { id: 'guru-staff' as TabId, label: 'Guru & Staff', count: () => props.data.guruStaff.length },
  { id: 'spp' as TabId, label: 'SPP', count: () => props.data.sppBulanan.length },
];

// Task 8.2: Siswa table
function formatDisplayDate(isoDate?: string | null): string {
  if (!isoDate) return '-';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

const siswaDisplay = computed(() => props.data.siswa.slice(0, 100));
const siswaOverflow = computed(() => props.data.siswa.length > 100);
const hasSiswaInvalid = computed(() => siswaDisplay.value.some((r) => !r.isValid));

// Task 8.3: Kelas grouped view
const kelasByTingkat = computed(() => {
  const map = new Map<number, string[]>();
  for (const k of props.data.kelas) {
    if (!map.has(k.tingkat)) map.set(k.tingkat, []);
    map.get(k.tingkat)!.push(k.nama);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a - b);
});

// Task 8.3: Mata Pelajaran table
const mataPelajaranDisplay = computed(() => props.data.mataPelajaran.slice(0, 100));
const mataPelajaranOverflow = computed(() => props.data.mataPelajaran.length > 100);

// Task 8.3: Guru & Staff table
const guruStaffDisplay = computed(() => props.data.guruStaff.slice(0, 100));
const guruStaffOverflow = computed(() => props.data.guruStaff.length > 100);
const hasGuruStaffInvalid = computed(() => guruStaffDisplay.value.some((r) => !r.isValid));

// Task 8.4: SPP nominal formatter
function formatNominal(nominal: number | null): string {
  if (nominal === null) return '-';
  return `Rp ${nominal.toLocaleString('id-ID')}`;
}

// Task 8.4: zero valid staff email warning
const hasNoValidStaffEmail = computed(
  () => props.data.guruStaff.length > 0 && props.data.guruStaff.every((g) => g.isValid === false),
);
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Error banners -->
    <div
      v-for="(error, idx) in errors"
      :key="`error-${idx}`"
      class="flex items-start gap-3 px-4 py-3 bg-danger-50 border border-danger-200 rounded-xs text-[14px] text-danger-700"
    >
      <svg
        class="w-4 h-4 mt-0.5 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
        />
      </svg>
      <span>{{ error }}</span>
    </div>

    <!-- Warning banners -->
    <div
      v-for="(warning, idx) in warnings"
      :key="`warning-${idx}`"
      class="flex items-start gap-3 px-4 py-3 bg-accent-50 border border-accent-200 rounded-xs text-[14px] text-accent-700"
    >
      <svg
        class="w-4 h-4 mt-0.5 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
        />
      </svg>
      <span>{{ warning }}</span>
    </div>

    <!-- Tab navigation -->
    <div class="border-b-2 border-stone-200">
      <nav class="-mb-0.5 flex gap-1 overflow-x-auto">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          :class="[
            'flex items-center gap-2 px-4 py-2.5 text-[14px] font-semibold whitespace-nowrap border-b-2 transition-colors duration-150',
            activeTab === tab.id
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300',
          ]"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
          <span
            :class="[
              'inline-flex items-center justify-center min-w-5 px-1.5 py-0.5 rounded-full text-[12px] font-bold leading-none',
              activeTab === tab.id
                ? 'bg-primary-100 text-primary-700'
                : 'bg-stone-100 text-stone-500',
            ]"
          >
            {{ tab.count() }}
          </span>
        </button>
      </nav>
    </div>

    <!-- Tab content -->
    <div class="min-h-50">
      <!-- Siswa tab (Task 8.2) -->
      <div v-if="activeTab === 'siswa'">
        <div
          v-if="siswaDisplay.length === 0"
          class="py-8 text-center text-[14px] text-stone-400 italic"
        >
          Tidak ada data siswa.
        </div>
        <template v-else>
          <div class="overflow-x-auto">
            <table class="w-full text-[13px] text-left border-collapse">
              <thead>
                <tr class="bg-stone-50 border-b border-stone-200">
                  <th class="px-3 py-2.5 font-semibold text-stone-600 whitespace-nowrap">No</th>
                  <th class="px-3 py-2.5 font-semibold text-stone-600 whitespace-nowrap">Nama</th>
                  <th class="px-3 py-2.5 font-semibold text-stone-600 whitespace-nowrap">NISN</th>
                  <th class="px-3 py-2.5 font-semibold text-stone-600 whitespace-nowrap">Kelas</th>
                  <th class="px-3 py-2.5 font-semibold text-stone-600 whitespace-nowrap">
                    Jenis Kelamin
                  </th>
                  <th class="px-3 py-2.5 font-semibold text-stone-600 whitespace-nowrap">
                    Tanggal Lahir
                  </th>
                  <th
                    v-if="hasSiswaInvalid"
                    class="px-3 py-2.5 font-semibold text-red-600 whitespace-nowrap"
                  >
                    Alasan
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, idx) in siswaDisplay"
                  :key="idx"
                  :class="[
                    'border-b border-stone-100 last:border-0',
                    row.isValid === false
                      ? 'bg-red-50 border-l-4 border-l-red-400'
                      : 'hover:bg-stone-50',
                  ]"
                >
                  <td class="px-3 py-2 text-stone-400">{{ idx + 1 }}</td>
                  <td class="px-3 py-2 text-stone-700 font-medium">{{ row.nama || '-' }}</td>
                  <td class="px-3 py-2 text-stone-600">{{ row.nisn || '-' }}</td>
                  <td class="px-3 py-2 text-stone-600">{{ row.kelas || '-' }}</td>
                  <td class="px-3 py-2 text-stone-600">
                    {{
                      row.jenisKelamin === 'L'
                        ? 'Laki-laki'
                        : row.jenisKelamin === 'P'
                          ? 'Perempuan'
                          : '-'
                    }}
                  </td>
                  <td class="px-3 py-2 text-stone-600">
                    {{ formatDisplayDate(row.tanggalLahir) }}
                  </td>
                  <td v-if="hasSiswaInvalid" class="px-3 py-2 text-red-600">
                    {{ row.isValid === false ? row.reason || '-' : '' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="siswaOverflow" class="mt-2 text-[13px] text-stone-400 italic">
            Menampilkan 100 dari {{ data.siswa.length }} baris
          </p>
        </template>
      </div>

      <!-- Kelas tab (Task 8.3) -->
      <div v-else-if="activeTab === 'kelas'">
        <div v-if="kelasByTingkat.length === 0" class="text-[13px] text-stone-400 italic">
          Tidak ada data kelas.
        </div>
        <div v-else class="flex flex-col gap-4">
          <div v-for="[tingkat, namaList] in kelasByTingkat" :key="tingkat">
            <p class="text-[13px] font-bold text-stone-700 mb-1">{{ kelasLabel(tingkat, jenjang) }}</p>
            <ul class="flex flex-wrap gap-2">
              <li
                v-for="nama in namaList"
                :key="nama"
                class="px-2.5 py-1 bg-stone-100 rounded text-[13px] text-stone-600"
              >
                {{ nama }}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Mata Pelajaran tab (Task 8.3) -->
      <div v-else-if="activeTab === 'mata-pelajaran'">
        <div v-if="mataPelajaranDisplay.length === 0" class="text-[13px] text-stone-400 italic">
          Tidak ada data mata pelajaran.
        </div>
        <template v-else>
          <div class="overflow-x-auto">
            <table class="w-full text-[13px] border-collapse">
              <thead>
                <tr class="border-b border-stone-200 bg-stone-50">
                  <th class="text-left px-3 py-2.5 font-semibold text-stone-600 whitespace-nowrap">
                    No
                  </th>
                  <th class="text-left px-3 py-2.5 font-semibold text-stone-600 whitespace-nowrap">
                    Nama Mata Pelajaran
                  </th>
                  <th
                    class="text-left px-3 py-2.5 font-semibold text-stone-600 whitespace-nowrap w-32"
                  >
                    Kode
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(mp, idx) in mataPelajaranDisplay"
                  :key="idx"
                  class="border-b border-stone-100 last:border-0 hover:bg-stone-50"
                >
                  <td class="px-3 py-2 text-stone-400">{{ idx + 1 }}</td>
                  <td class="px-3 py-2 text-stone-700">{{ mp.nama }}</td>
                  <td class="px-3 py-2 text-stone-500">{{ mp.kode || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="mataPelajaranOverflow" class="mt-2 text-[13px] text-stone-400 italic">
            Menampilkan 100 dari {{ data.mataPelajaran.length }} baris
          </p>
        </template>
      </div>

      <!-- Guru & Staff tab (Task 8.3) -->
      <div v-else-if="activeTab === 'guru-staff'">
        <div v-if="guruStaffDisplay.length === 0" class="text-[13px] text-stone-400 italic">
          Tidak ada data guru &amp; staff.
        </div>
        <template v-else>
          <div class="overflow-x-auto">
            <table class="w-full text-[13px] border-collapse">
              <thead>
                <tr class="border-b border-stone-200 bg-stone-50">
                  <th class="text-left px-3 py-2 font-semibold text-stone-600 w-10">No</th>
                  <th class="text-left px-3 py-2 font-semibold text-stone-600">Nama</th>
                  <th class="text-left px-3 py-2 font-semibold text-stone-600">Email</th>
                  <th class="text-left px-3 py-2 font-semibold text-stone-600 w-36">Telepon</th>
                  <th class="text-left px-3 py-2 font-semibold text-stone-600 w-36">Role</th>
                  <th
                    v-if="hasGuruStaffInvalid"
                    class="text-left px-3 py-2 font-semibold text-red-600 w-48"
                  >
                    Alasan
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(gs, idx) in guruStaffDisplay"
                  :key="idx"
                  :class="[
                    'border-b border-stone-100',
                    !gs.isValid ? 'bg-red-50 border-l-4 border-l-red-400' : 'hover:bg-stone-50',
                  ]"
                >
                  <td class="px-3 py-2 text-stone-400">{{ idx + 1 }}</td>
                  <td class="px-3 py-2 text-stone-700">{{ gs.nama }}</td>
                  <td class="px-3 py-2 text-stone-600">{{ gs.email }}</td>
                  <td class="px-3 py-2 text-stone-500">{{ gs.telepon || '-' }}</td>
                  <td class="px-3 py-2 text-stone-500">{{ gs.role }}</td>
                  <td v-if="hasGuruStaffInvalid" class="px-3 py-2 text-red-600 text-[12px]">
                    {{ gs.reason || '' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="guruStaffOverflow" class="mt-2 text-[12px] text-stone-400 italic">
            Menampilkan 100 dari {{ data.guruStaff.length }} baris
          </p>
        </template>
      </div>

      <!-- SPP tab (Task 8.4) -->
      <div v-else-if="activeTab === 'spp'">
        <div v-if="data.sppBulanan.length === 0" class="text-[13px] text-stone-400 italic">
          Tidak ada data SPP.
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-[13px] border-collapse">
            <thead>
              <tr class="border-b border-stone-200 bg-stone-50">
                <th class="text-left px-3 py-2 font-semibold text-stone-600 w-10">No</th>
                <th class="text-left px-3 py-2 font-semibold text-stone-600 w-28">Kelas</th>
                <th class="text-left px-3 py-2 font-semibold text-stone-600">Nominal</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(spp, idx) in data.sppBulanan"
                :key="idx"
                class="border-b border-stone-100 hover:bg-stone-50"
              >
                <td class="px-3 py-2 text-stone-400">{{ idx + 1 }}</td>
                <td class="px-3 py-2 text-stone-700">
                  {{ spp.tingkat !== null ? kelasLabel(spp.tingkat, jenjang) : '-' }}
                </td>
                <td class="px-3 py-2 text-stone-700">{{ formatNominal(spp.nominal) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Zero-staff-email warning (Task 8.4, Req 3.10) -->
    <div
      v-if="hasNoValidStaffEmail"
      class="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xs text-[14px] text-amber-700"
    >
      <svg
        class="w-4 h-4 mt-0.5 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
        />
      </svg>
      <span>Tidak ada akun guru/staff dengan email valid yang akan menerima email kredensial.</span>
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between pt-3 border-t border-stone-200">
      <p class="text-[13px] text-stone-400">Tinjau data di atas sebelum mengkonfirmasi import.</p>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2.5 text-[14px] font-semibold text-stone-600 bg-white border-2 border-stone-200 rounded-xs hover:bg-surface-warm hover:border-stone-300 transition-colors duration-150"
        @click="emit('gantiFile')"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
          />
        </svg>
        Ganti File
      </button>
    </div>
  </div>
</template>
