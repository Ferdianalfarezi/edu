<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';
import { PageHeader } from '@/components/ui';

interface KonfigurasiData {
  batas_ketidakhadiran_notifikasi: number;
  nominal_spp: Record<string, number>;
  tanggal_jatuh_tempo: number;
}

interface HariLibur {
  id: string;
  tanggal: string;
  keterangan: string;
}

const loading = ref(false);
const saving = ref(false);
const saveSuccess = ref(false);

// Configuration form
const config = ref<KonfigurasiData>({
  batas_ketidakhadiran_notifikasi: 3,
  nominal_spp: {},
  tanggal_jatuh_tempo: 10,
});

// Nominal SPP per tingkat - editable entries
const sppEntries = ref<Array<{ tingkat: string; nominal: number }>>([]);

// Hari libur
const hariLibur = ref<HariLibur[]>([]);
const showAddHoliday = ref(false);
const newHoliday = ref({ tanggal: '', keterangan: '' });

async function fetchKonfigurasi() {
  loading.value = true;
  try {
    const { data } = await api.get<{ data: KonfigurasiData }>('/konfigurasi');
    config.value = data.data;
    // Convert nominal_spp object to array for editing
    sppEntries.value = Object.entries(data.data.nominal_spp || {}).map(([tingkat, nominal]) => ({
      tingkat,
      nominal: nominal as number,
    }));
    if (sppEntries.value.length === 0) {
      sppEntries.value = [{ tingkat: '1', nominal: 0 }];
    }
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

function addSppEntry() {
  const lastTingkat =
    sppEntries.value.length > 0
      ? parseInt(sppEntries.value[sppEntries.value.length - 1].tingkat) + 1
      : 1;
  sppEntries.value.push({ tingkat: String(lastTingkat), nominal: 0 });
}

function removeSppEntry(index: number) {
  sppEntries.value.splice(index, 1);
}

async function saveKonfigurasi() {
  saving.value = true;
  saveSuccess.value = false;

  const nominal_spp: Record<string, number> = {};
  sppEntries.value.forEach((entry) => {
    if (entry.tingkat) {
      nominal_spp[entry.tingkat] = entry.nominal;
    }
  });

  const payload = {
    batas_ketidakhadiran_notifikasi: config.value.batas_ketidakhadiran_notifikasi,
    nominal_spp,
    tanggal_jatuh_tempo: config.value.tanggal_jatuh_tempo,
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

onMounted(fetchKonfigurasi);
</script>

<template>
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader title="Konfigurasi Sekolah" />

    <div v-if="loading" class="py-12 text-center">
      <svg
        class="w-6 h-6 animate-spin text-primary-500 mx-auto"
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
        ></circle>
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        ></path>
      </svg>
      <p class="text-sm text-text-tertiary mt-2">Memuat konfigurasi...</p>
    </div>

    <div v-else class="space-y-4 max-w-3xl">
      <!-- Threshold & General Settings -->
      <section class="bg-white border border-border rounded-xl p-5 mb-4">
        <h2 class="text-base font-semibold text-text-primary mb-4">Pengaturan Umum</h2>

        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5"
            >Batas Ketidakhadiran untuk Notifikasi (hari/bulan)</label
          >
          <input
            v-model.number="config.batas_ketidakhadiran_notifikasi"
            type="number"
            min="1"
            max="30"
            class="w-32 px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
          <p class="text-xs text-text-tertiary mt-1">
            Siswa dengan alpa melebihi angka ini akan masuk daftar perhatian khusus.
          </p>
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium text-text-primary mb-1.5"
            >Tanggal Jatuh Tempo Tagihan (tanggal per bulan)</label
          >
          <input
            v-model.number="config.tanggal_jatuh_tempo"
            type="number"
            min="1"
            max="28"
            class="w-32 px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
          <p class="text-xs text-text-tertiary mt-1">
            Tanggal default jatuh tempo tagihan SPP setiap bulan.
          </p>
        </div>
      </section>

      <!-- Nominal SPP per Tingkat -->
      <section class="bg-white border border-border rounded-xl p-5 mb-4">
        <h2 class="text-base font-semibold text-text-primary mb-4">
          Nominal SPP per Tingkat Kelas
        </h2>
        <div class="space-y-3">
          <div v-for="(entry, index) in sppEntries" :key="index" class="flex items-end gap-3">
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1.5">Tingkat</label>
              <input
                v-model="entry.tingkat"
                type="text"
                class="w-20 px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                placeholder="1"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1.5">Nominal</label>
              <div class="flex items-center gap-2">
                <input
                  v-model.number="entry.nominal"
                  type="number"
                  min="0"
                  class="w-40 px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  placeholder="0"
                />
                <span class="text-xs text-text-tertiary">{{
                  formatCurrency(entry.nominal || 0)
                }}</span>
              </div>
            </div>
            <button
              class="px-2 py-2 text-xs font-medium text-danger-700 bg-danger-50 rounded-md hover:bg-danger-50/80 transition-colors"
              @click="removeSppEntry(index)"
              :disabled="sppEntries.length <= 1"
            >
              ×
            </button>
          </div>
        </div>
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors mt-3"
          @click="addSppEntry"
        >
          + Tambah Tingkat
        </button>
      </section>

      <!-- Save Button -->
      <div class="flex items-center gap-4">
        <button
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          :disabled="saving"
          @click="saveKonfigurasi"
        >
          {{ saving ? 'Menyimpan...' : 'Simpan Konfigurasi' }}
        </button>
        <span v-if="saveSuccess" class="text-sm text-success-700 font-medium"
          >✓ Konfigurasi berhasil disimpan</span
        >
      </div>

      <!-- Hari Libur -->
      <section class="bg-white border border-border rounded-xl p-5 mb-4">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-base font-semibold text-text-primary">Hari Libur</h2>
          <button
            class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
            @click="showAddHoliday = !showAddHoliday"
          >
            {{ showAddHoliday ? 'Batal' : '+ Tambah Hari Libur' }}
          </button>
        </div>

        <div v-if="showAddHoliday" class="bg-surface-50 border border-border rounded-lg p-4 mb-4">
          <div class="flex items-end gap-3">
            <div>
              <label class="block text-sm font-medium text-text-primary mb-1.5">Tanggal</label>
              <input
                v-model="newHoliday.tanggal"
                type="date"
                required
                class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>
            <div class="flex-1">
              <label class="block text-sm font-medium text-text-primary mb-1.5"
                >Keterangan <span class="text-text-tertiary font-normal">(opsional)</span></label
              >
              <input
                v-model="newHoliday.keterangan"
                type="text"
                class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                placeholder="Tahun Baru"
              />
            </div>
            <button
              class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
              @click="addHoliday"
              :disabled="!newHoliday.tanggal"
            >
              Tambah
            </button>
          </div>
        </div>

        <div v-if="hariLibur.length > 0" class="space-y-2">
          <div
            v-for="hl in hariLibur"
            :key="hl.id"
            class="flex items-center justify-between p-3 bg-white border border-border rounded-lg"
          >
            <div class="text-sm text-text-primary">
              <strong>{{ formatDate(hl.tanggal) }}</strong>
              <span v-if="hl.keterangan" class="text-text-secondary"> — {{ hl.keterangan }}</span>
            </div>
            <button
              class="px-2 py-1 text-xs font-medium text-danger-700 bg-danger-50 rounded-md hover:bg-danger-50/80 transition-colors"
              @click="removeHoliday(hl.id)"
            >
              Hapus
            </button>
          </div>
        </div>
        <div v-else class="py-12 text-center">
          <p class="text-sm text-text-tertiary">Belum ada hari libur yang dikonfigurasi.</p>
        </div>
      </section>
    </div>
  </div>
</template>
