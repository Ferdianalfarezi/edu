<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';
import { PageHeader, ActionButton } from '@/components/ui';
import { useToast } from '@/composables/useToast';

interface KonfigurasiData {
  batasKetidakhadiranNotifikasi: number;
  nominalSpp: Record<string, number>;
  tanggalJatuhTempo: number;
}

interface HariLibur {
  id: string;
  tanggal: string;
  keterangan: string;
}

interface TenantProfile {
  id: string;
  nama: string;
  jumlahTingkat: number;
  hariKerja?: '5_hari' | '6_hari';
}

const toast = useToast();

const loading = ref(false);
const saving = ref(false);
const saveSuccess = ref(false);

// Hari Kerja from tenant profile
const hariKerja = ref<'5_hari' | '6_hari'>('6_hari');
const savingHariKerja = ref(false);

// Jumlah tingkat from tenant profile
const jumlahTingkat = ref(0);

// Configuration form
const config = ref<KonfigurasiData>({
  batasKetidakhadiranNotifikasi: 3,
  nominalSpp: {},
  tanggalJatuhTempo: 10,
});

// Nominal SPP per tingkat - fixed entries based on jumlah_tingkat
const sppEntries = ref<Array<{ tingkat: number; nominal: number }>>([]);

// Hari libur
const hariLibur = ref<HariLibur[]>([]);
const showAddHoliday = ref(false);
const newHoliday = ref({ tanggal: '', keterangan: '' });

/**
 * Initialize SPP entries as exactly jumlahTingkat entries (1..N),
 * filling in existing values from nominal_spp or defaulting to 0.
 */
function initSppEntries(nominalSpp: Record<string, number>, count: number) {
  sppEntries.value = Array.from({ length: count }, (_, i) => {
    const tingkat = i + 1;
    // keysToCamel converts "tingkat_1" → "tingkat1" in responses;
    // also handle legacy "tingkat_1" and plain numeric "1" formats
    const nominal =
      nominalSpp[`tingkat${tingkat}`] ??
      nominalSpp[`tingkat_${tingkat}`] ??
      nominalSpp[String(tingkat)] ??
      0;
    return { tingkat, nominal };
  });
}

async function fetchKonfigurasi() {
  loading.value = true;

  // Fetch tenant profile to get jumlah_tingkat
  try {
    const { data } = await api.get<TenantProfile>('/tenants/profile');
    jumlahTingkat.value = data.jumlahTingkat;
    hariKerja.value = data.hariKerja ?? '6_hari';
  } catch (error) {
    console.error('Failed to fetch tenant profile:', error);
  }

  try {
    const { data } = await api.get<{ data: KonfigurasiData }>('/konfigurasi');
    config.value = data.data;
    // Initialize fixed SPP entries based on jumlah_tingkat
    initSppEntries(data.data.nominalSpp || {}, jumlahTingkat.value);
  } catch (error) {
    console.error('Failed to fetch konfigurasi:', error);
  }

  try {
    const { data } = await api.get<{ data: HariLibur[] }>('/konfigurasi/hari-libur');
    hariLibur.value = data.data;
  } catch (error) {
    console.error('Failed to fetch hari libur:', error);
  }

  loading.value = false;
}

async function saveKonfigurasi() {
  saving.value = true;
  saveSuccess.value = false;

  const nominalSpp: Record<string, number> = {};
  sppEntries.value.forEach((entry) => {
    nominalSpp[`tingkat_${entry.tingkat}`] = entry.nominal;
  });

  const payload = {
    batas_ketidakhadiran_notifikasi: config.value.batasKetidakhadiranNotifikasi,
    nominal_spp: nominalSpp,
    tanggal_jatuh_tempo: config.value.tanggalJatuhTempo,
  };

  try {
    await api.patch('/konfigurasi', payload);
    saveSuccess.value = true;
    setTimeout(() => {
      saveSuccess.value = false;
    }, 3000);
  } catch (error) {
    console.error('Failed to save konfigurasi:', error);
  } finally {
    saving.value = false;
  }
}

async function addHoliday() {
  if (!newHoliday.value.tanggal) return;
  try {
    await api.post('/konfigurasi/hari-libur', {
      tanggal: newHoliday.value.tanggal,
      keterangan: newHoliday.value.keterangan || undefined,
    });
    showAddHoliday.value = false;
    newHoliday.value = { tanggal: '', keterangan: '' };
    await fetchKonfigurasi();
  } catch (error) {
    console.error('Failed to add hari libur:', error);
  }
}

async function removeHoliday(id: string) {
  try {
    await api.delete(`/konfigurasi/hari-libur/${id}`);
    hariLibur.value = hariLibur.value.filter((h) => h.id !== id);
  } catch (error) {
    console.error('Failed to delete hari libur:', error);
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value);
}

async function updateHariKerja() {
  const confirmed = confirm(
    'Perubahan ini akan mempengaruhi jadwal dan perhitungan absensi. Lanjutkan?',
  );
  if (!confirmed) return;

  savingHariKerja.value = true;
  try {
    await api.patch('/tenants/hari-kerja', { hari_kerja: hariKerja.value });
    toast.success('Hari kerja berhasil diperbarui');
  } catch (error) {
    console.error('Failed to update hari kerja:', error);
    toast.error('Gagal memperbarui hari kerja');
  } finally {
    savingHariKerja.value = false;
  }
}

onMounted(fetchKonfigurasi);
</script>

<template>
  <div class="p-8 max-w-7xl mx-auto">
    <PageHeader title="Konfigurasi Sekolah" />

    <div v-if="loading" class="py-12 text-center">
      <svg class="w-7 h-7 animate-spin text-primary-500 mx-auto" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p class="text-[15px] text-text-secondary mt-3">Memuat konfigurasi...</p>
    </div>

    <div v-else class="space-y-6 max-w-3xl">
      <!-- Hari Kerja Sekolah Card -->
      <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
        <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
          <h3 class="text-[16px] font-bold text-primary-800">Hari Kerja Sekolah</h3>
        </div>
        <div class="px-6 py-5">
          <div class="flex items-center gap-6">
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="hariKerja" type="radio" value="5_hari" class="accent-primary-600" />
              <span class="text-[15px] text-stone-800">5 Hari (Senin-Jumat)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="hariKerja" type="radio" value="6_hari" class="accent-primary-600" />
              <span class="text-[15px] text-stone-800">6 Hari (Senin-Sabtu)</span>
            </label>
          </div>
          <p class="text-[13px] text-stone-500 mt-2">
            Perubahan ini akan mempengaruhi jadwal dan perhitungan absensi.
          </p>
          <ActionButton
            variant="primary"
            class="mt-4"
            :disabled="savingHariKerja"
            @click="updateHariKerja"
          >
            {{ savingHariKerja ? 'Menyimpan...' : 'Simpan Hari Kerja' }}
          </ActionButton>
        </div>
      </div>

      <!-- Pengaturan Umum Card -->
      <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
        <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
          <h3 class="text-[16px] font-bold text-primary-800">Pengaturan Umum</h3>
        </div>
        <div class="px-6 py-5 space-y-5">
          <div>
            <label class="block text-[15px] font-medium text-stone-800 mb-1.5">
              Batas Ketidakhadiran untuk Notifikasi (hari/bulan)
            </label>
            <input
              v-model.number="config.batasKetidakhadiranNotifikasi"
              type="number"
              min="1"
              max="30"
              class="w-32 px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
            <p class="text-[13px] text-stone-500 mt-1">
              Siswa dengan alpa melebihi angka ini akan masuk daftar perhatian khusus.
            </p>
          </div>

          <div>
            <label class="block text-[15px] font-medium text-stone-800 mb-1.5">
              Tanggal Jatuh Tempo Tagihan (tanggal per bulan)
            </label>
            <input
              v-model.number="config.tanggalJatuhTempo"
              type="number"
              min="1"
              max="28"
              class="w-32 px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
            <p class="text-[13px] text-stone-500 mt-1">
              Tanggal default jatuh tempo tagihan SPP setiap bulan.
            </p>
          </div>
        </div>
      </div>

      <!-- Nominal SPP per Tingkat Card -->
      <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
        <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
          <h3 class="text-[16px] font-bold text-primary-800">Nominal SPP per Tingkat Kelas</h3>
        </div>
        <div class="px-6 py-5 space-y-4">
          <div v-for="entry in sppEntries" :key="entry.tingkat" class="flex items-end gap-4">
            <div>
              <label class="block text-[15px] font-medium text-stone-800 mb-1.5">Tingkat</label>
              <span
                class="inline-block w-28 px-3 py-2.5 text-[15px] bg-surface-warm border-2 border-stone-200 rounded-xs text-stone-800"
              >
                Tingkat {{ entry.tingkat }}
              </span>
            </div>
            <div>
              <label class="block text-[15px] font-medium text-stone-800 mb-1.5">Nominal</label>
              <div class="flex items-center gap-3">
                <input
                  v-model.number="entry.nominal"
                  type="number"
                  min="0"
                  class="w-44 px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  placeholder="0"
                />
                <span class="text-[13px] text-stone-500">{{
                  formatCurrency(entry.nominal || 0)
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Save Button -->
      <div class="flex items-center gap-4">
        <ActionButton variant="primary" :disabled="saving" @click="saveKonfigurasi">
          {{ saving ? 'Menyimpan...' : 'Simpan Konfigurasi' }}
        </ActionButton>
        <span v-if="saveSuccess" class="text-[15px] text-success-700 font-semibold">
          ✓ Konfigurasi berhasil disimpan
        </span>
      </div>

      <!-- Hari Libur Card -->
      <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
        <div
          class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200 flex justify-between items-center"
        >
          <h3 class="text-[16px] font-bold text-primary-800">Hari Libur</h3>
          <ActionButton variant="neutral" @click="showAddHoliday = !showAddHoliday">
            {{ showAddHoliday ? 'Batal' : '+ Tambah Hari Libur' }}
          </ActionButton>
        </div>
        <div class="px-6 py-5">
          <!-- Add Holiday Form -->
          <div
            v-if="showAddHoliday"
            class="bg-surface-warm border-2 border-stone-200 rounded-xs p-4 mb-5"
          >
            <div class="flex items-end gap-4">
              <div>
                <label class="block text-[15px] font-medium text-stone-800 mb-1.5">Tanggal</label>
                <input
                  v-model="newHoliday.tanggal"
                  type="date"
                  required
                  class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
              </div>
              <div class="flex-1">
                <label class="block text-[15px] font-medium text-stone-800 mb-1.5">
                  Keterangan <span class="text-stone-400 font-normal">(opsional)</span>
                </label>
                <input
                  v-model="newHoliday.keterangan"
                  type="text"
                  class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  placeholder="Tahun Baru"
                />
              </div>
              <ActionButton variant="primary" :disabled="!newHoliday.tanggal" @click="addHoliday">
                Tambah
              </ActionButton>
            </div>
          </div>

          <!-- Holiday List -->
          <div v-if="hariLibur.length > 0" class="space-y-3">
            <div
              v-for="hl in hariLibur"
              :key="hl.id"
              class="flex items-center justify-between p-4 bg-white border-2 border-stone-200 rounded-xs"
            >
              <div class="text-[15px] text-stone-800">
                <strong>{{ formatDate(hl.tanggal) }}</strong>
                <span v-if="hl.keterangan" class="text-stone-600"> — {{ hl.keterangan }}</span>
              </div>
              <ActionButton variant="danger" icon="delete" @click="removeHoliday(hl.id)">
                Hapus
              </ActionButton>
            </div>
          </div>
          <div v-else class="py-12 text-center">
            <p class="text-[15px] text-stone-500">Belum ada hari libur yang dikonfigurasi.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
