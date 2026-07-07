<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';

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
  <div class="page">
    <h1>Konfigurasi Sekolah</h1>

    <div v-if="loading" class="empty-state">Memuat konfigurasi...</div>

    <div v-else class="config-sections">
      <!-- Threshold & General Settings -->
      <section class="config-section">
        <h2>Pengaturan Umum</h2>

        <div class="form-group">
          <label>Batas Ketidakhadiran untuk Notifikasi (hari/bulan)</label>
          <input
            v-model.number="config.batas_ketidakhadiran_notifikasi"
            type="number"
            min="1"
            max="30"
            class="input input-sm"
          />
          <p class="hint">
            Siswa dengan alpa melebihi angka ini akan masuk daftar perhatian khusus.
          </p>
        </div>

        <div class="form-group">
          <label>Tanggal Jatuh Tempo Tagihan (tanggal per bulan)</label>
          <input
            v-model.number="config.tanggal_jatuh_tempo"
            type="number"
            min="1"
            max="28"
            class="input input-sm"
          />
          <p class="hint">Tanggal default jatuh tempo tagihan SPP setiap bulan.</p>
        </div>
      </section>

      <!-- Nominal SPP per Tingkat -->
      <section class="config-section">
        <h2>Nominal SPP per Tingkat Kelas</h2>
        <div class="spp-list">
          <div v-for="(entry, index) in sppEntries" :key="index" class="spp-entry">
            <div class="form-group">
              <label>Tingkat</label>
              <input v-model="entry.tingkat" type="text" class="input input-sm" placeholder="1" />
            </div>
            <div class="form-group">
              <label>Nominal</label>
              <input
                v-model.number="entry.nominal"
                type="number"
                min="0"
                class="input"
                placeholder="0"
              />
              <span class="nominal-display">{{ formatCurrency(entry.nominal || 0) }}</span>
            </div>
            <button
              class="btn-sm btn-delete"
              @click="removeSppEntry(index)"
              :disabled="sppEntries.length <= 1"
            >
              ×
            </button>
          </div>
        </div>
        <button class="btn btn-secondary btn-add" @click="addSppEntry">+ Tambah Tingkat</button>
      </section>

      <!-- Save Button -->
      <div class="save-section">
        <button class="btn btn-primary" :disabled="saving" @click="saveKonfigurasi">
          {{ saving ? 'Menyimpan...' : 'Simpan Konfigurasi' }}
        </button>
        <span v-if="saveSuccess" class="success-msg">✓ Konfigurasi berhasil disimpan</span>
      </div>

      <!-- Hari Libur -->
      <section class="config-section">
        <div class="section-header">
          <h2>Hari Libur</h2>
          <button class="btn btn-secondary" @click="showAddHoliday = !showAddHoliday">
            {{ showAddHoliday ? 'Batal' : '+ Tambah Hari Libur' }}
          </button>
        </div>

        <div v-if="showAddHoliday" class="add-holiday-form">
          <div class="form-row">
            <div class="form-group">
              <label>Tanggal</label>
              <input v-model="newHoliday.tanggal" type="date" required class="input" />
            </div>
            <div class="form-group flex-1">
              <label>Keterangan <span class="optional">(opsional)</span></label>
              <input
                v-model="newHoliday.keterangan"
                type="text"
                class="input"
                placeholder="Tahun Baru"
              />
            </div>
            <button class="btn btn-primary" @click="addHoliday" :disabled="!newHoliday.tanggal">
              Tambah
            </button>
          </div>
        </div>

        <div v-if="hariLibur.length > 0" class="holiday-list">
          <div v-for="hl in hariLibur" :key="hl.id" class="holiday-item">
            <div>
              <strong>{{ formatDate(hl.tanggal) }}</strong>
              <span v-if="hl.keterangan" class="holiday-desc"> — {{ hl.keterangan }}</span>
            </div>
            <button class="btn-sm btn-delete" @click="removeHoliday(hl.id)">Hapus</button>
          </div>
        </div>
        <p v-else class="empty-state">Belum ada hari libur yang dikonfigurasi.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: 2rem;
  max-width: 800px;
}
.page h1 {
  margin: 0 0 1.5rem;
  font-size: 1.5rem;
}
.config-sections {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
.config-section {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1.5rem;
}
.config-section h2 {
  margin: 0 0 1rem;
  font-size: 1.125rem;
  color: #1f2937;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
.section-header h2 {
  margin: 0;
}
.form-group {
  margin-bottom: 0.75rem;
}
.form-group label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}
.input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
  width: 100%;
}
.input-sm {
  width: 120px;
}
.hint {
  color: #6b7280;
  font-size: 0.75rem;
  margin-top: 0.25rem;
}
.spp-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.spp-entry {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
}
.spp-entry .form-group {
  margin-bottom: 0;
}
.nominal-display {
  font-size: 0.75rem;
  color: #6b7280;
  margin-left: 0.5rem;
}
.btn-add {
  margin-top: 0.5rem;
}
.save-section {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.success-msg {
  color: #059669;
  font-size: 0.875rem;
  font-weight: 500;
}
.add-holiday-form {
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 1rem;
  margin-bottom: 1rem;
}
.form-row {
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
}
.flex-1 {
  flex: 1;
}
.holiday-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.holiday-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.holiday-desc {
  color: #6b7280;
}
.optional {
  color: #9ca3af;
  font-weight: 400;
}
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  font-weight: 500;
}
.btn-primary {
  background: #2563eb;
  color: white;
}
.btn-primary:hover {
  background: #1d4ed8;
}
.btn-primary:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}
.btn-secondary {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
}
.btn-sm {
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
}
.btn-delete {
  background: #fee2e2;
  color: #991b1b;
}
.empty-state {
  text-align: center;
  color: #6b7280;
  padding: 1rem;
}
</style>
