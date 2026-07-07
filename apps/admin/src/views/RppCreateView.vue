<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { api } from '@/api/client';

interface MataPelajaran {
  id: string;
  nama: string;
}

interface KategoriRpp {
  id: string;
  nama: string;
}

interface RppDetail {
  id: string;
  judul: string;
  mata_pelajaran_id: string;
  kategori_id: string;
  kategori_nama: string;
  tahun_terbit: number;
  konten_type: 'richtext' | 'file';
  konten: string | null;
  file_nama: string | null;
  file_size: number | null;
  status: 'draft' | 'published';
}

const router = useRouter();
const route = useRoute();

const isEdit = computed(() => !!route.params.id);
const rppId = computed(() => route.params.id as string | undefined);

const loading = ref(false);
const saving = ref(false);
const error = ref('');

// Form data
const judul = ref('');
const mataPelajaranId = ref('');
const kategoriSearch = ref('');
const kategoriId = ref('');
const tahunTerbit = ref(new Date().getFullYear());
const kontenType = ref<'richtext' | 'file'>('richtext');
const konten = ref('');
const status = ref<'draft' | 'published'>('draft');

// File upload
const selectedFile = ref<File | null>(null);
const fileError = ref('');
const isDragging = ref(false);
const existingFileName = ref('');

// Selectors
const mataPelajaranList = ref<MataPelajaran[]>([]);
const kategoriList = ref<KategoriRpp[]>([]);
const showKategoriDropdown = ref(false);

const ALLOWED_FORMATS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const filteredKategori = computed(() => {
  if (!kategoriSearch.value) return kategoriList.value;
  const q = kategoriSearch.value.toLowerCase();
  return kategoriList.value.filter((k) => k.nama.toLowerCase().includes(q));
});

const isNewKategori = computed(() => {
  if (!kategoriSearch.value) return false;
  return !kategoriList.value.some(
    (k) => k.nama.toLowerCase() === kategoriSearch.value.toLowerCase(),
  );
});

async function fetchMataPelajaran() {
  try {
    const { data } = await api.get<{ data: MataPelajaran[] }>('/mata-pelajaran');
    mataPelajaranList.value = data.data;
  } catch (e) {
    console.error('Failed to fetch mata pelajaran:', e);
  }
}

async function fetchKategori() {
  try {
    const { data } = await api.get<{ data: KategoriRpp[] }>('/rpp/kategori');
    kategoriList.value = data.data;
  } catch (e) {
    console.error('Failed to fetch kategori:', e);
  }
}

async function fetchRppDetail() {
  if (!rppId.value) return;
  loading.value = true;
  try {
    const { data } = await api.get<{ data: RppDetail }>(`/rpp/${rppId.value}`);
    const rpp = data.data;
    judul.value = rpp.judul;
    mataPelajaranId.value = rpp.mata_pelajaran_id;
    kategoriId.value = rpp.kategori_id;
    kategoriSearch.value = rpp.kategori_nama;
    tahunTerbit.value = rpp.tahun_terbit;
    kontenType.value = rpp.konten_type;
    konten.value = rpp.konten || '';
    status.value = rpp.status;
    existingFileName.value = rpp.file_nama || '';
  } catch (e) {
    error.value = 'Gagal memuat data RPP.';
    console.error('Failed to fetch RPP detail:', e);
  } finally {
    loading.value = false;
  }
}

function selectKategori(kat: KategoriRpp) {
  kategoriId.value = kat.id;
  kategoriSearch.value = kat.nama;
  showKategoriDropdown.value = false;
}

function onKategoriInput() {
  kategoriId.value = '';
  showKategoriDropdown.value = true;
}

function handleKategoriBlur() {
  setTimeout(() => {
    showKategoriDropdown.value = false;
  }, 200);
}

function validateFile(file: File): string | null {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_FORMATS.includes(file.type)) {
    return 'Format file tidak didukung. Gunakan PDF, DOC, DOCX, PPT, atau PPTX.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'Ukuran file melebihi batas maksimal 10MB.';
  }
  return null;
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) return;
  const file = input.files[0];
  const err = validateFile(file);
  if (err) {
    fileError.value = err;
    selectedFile.value = null;
    return;
  }
  fileError.value = '';
  selectedFile.value = file;
}

function handleDrop(event: DragEvent) {
  isDragging.value = false;
  const file = event.dataTransfer?.files[0];
  if (!file) return;
  const err = validateFile(file);
  if (err) {
    fileError.value = err;
    selectedFile.value = null;
    return;
  }
  fileError.value = '';
  selectedFile.value = file;
}

function removeFile() {
  selectedFile.value = null;
  fileError.value = '';
  existingFileName.value = '';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Simple rich text toolbar actions
function execCommand(command: string, value?: string) {
  document.execCommand(command, false, value);
}

function insertTable() {
  const table =
    '<table border="1" style="border-collapse:collapse;width:100%"><tr><td style="padding:8px">&nbsp;</td><td style="padding:8px">&nbsp;</td></tr><tr><td style="padding:8px">&nbsp;</td><td style="padding:8px">&nbsp;</td></tr></table><br>';
  document.execCommand('insertHTML', false, table);
}

function onEditorInput(event: Event) {
  const el = event.target as HTMLDivElement;
  konten.value = el.innerHTML;
}

async function handleSubmit(publishStatus: 'draft' | 'published') {
  error.value = '';
  saving.value = true;

  try {
    if (kontenType.value === 'file') {
      if (!selectedFile.value && !existingFileName.value) {
        error.value = 'Silakan upload file terlebih dahulu.';
        saving.value = false;
        return;
      }

      const formData = new FormData();
      formData.append('judul', judul.value);
      formData.append('mata_pelajaran_id', mataPelajaranId.value);
      formData.append('tahun_terbit', tahunTerbit.value.toString());
      formData.append('konten_type', 'file');
      formData.append('status', publishStatus);

      if (kategoriId.value) {
        formData.append('kategori', kategoriId.value);
      } else if (kategoriSearch.value) {
        formData.append('kategori', kategoriSearch.value);
      }

      if (selectedFile.value) {
        formData.append('file', selectedFile.value);
      }

      if (isEdit.value) {
        await api.patch(`/rpp/${rppId.value}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await api.post('/rpp', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
    } else {
      const payload = {
        judul: judul.value,
        mata_pelajaran_id: mataPelajaranId.value,
        kategori: kategoriId.value || kategoriSearch.value,
        tahun_terbit: tahunTerbit.value,
        konten_type: 'richtext' as const,
        konten: konten.value,
        status: publishStatus,
      };

      if (isEdit.value) {
        await api.patch(`/rpp/${rppId.value}`, payload);
      } else {
        await api.post('/rpp', payload);
      }
    }

    router.push({ name: 'rpp-portal' });
  } catch (e: any) {
    error.value = e.response?.data?.message || 'Gagal menyimpan RPP.';
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([fetchMataPelajaran(), fetchKategori()]);
  if (isEdit.value) {
    await fetchRppDetail();
  }
});
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>{{ isEdit ? 'Edit RPP / Modul Ajar' : 'Buat RPP / Modul Ajar' }}</h1>
    </div>

    <div v-if="loading" class="empty-state">Memuat data...</div>

    <form v-else class="rpp-form" @submit.prevent>
      <p v-if="error" class="error-text">{{ error }}</p>

      <!-- Judul -->
      <div class="form-group">
        <label>Judul RPP <span class="required">*</span></label>
        <input
          v-model="judul"
          type="text"
          class="input"
          placeholder="Masukkan judul RPP"
          required
        />
      </div>

      <!-- Mata Pelajaran -->
      <div class="form-group">
        <label>Mata Pelajaran <span class="required">*</span></label>
        <select v-model="mataPelajaranId" class="input" required>
          <option value="" disabled>Pilih mata pelajaran</option>
          <option v-for="mapel in mataPelajaranList" :key="mapel.id" :value="mapel.id">
            {{ mapel.nama }}
          </option>
        </select>
      </div>

      <!-- Kategori (searchable with auto-create) -->
      <div class="form-group kategori-group">
        <label>Kategori <span class="required">*</span></label>
        <div class="kategori-input-wrapper">
          <input
            v-model="kategoriSearch"
            type="text"
            class="input"
            placeholder="Cari atau buat kategori baru"
            @input="onKategoriInput"
            @focus="showKategoriDropdown = true"
            @blur="handleKategoriBlur"
          />
          <div
            v-if="showKategoriDropdown && (filteredKategori.length > 0 || isNewKategori)"
            class="kategori-dropdown"
          >
            <div
              v-for="kat in filteredKategori"
              :key="kat.id"
              class="kategori-option"
              @mousedown.prevent="selectKategori(kat)"
            >
              {{ kat.nama }}
            </div>
            <div
              v-if="isNewKategori"
              class="kategori-option kategori-new"
              @mousedown.prevent="
                () => {
                  kategoriId = '';
                  showKategoriDropdown = false;
                }
              "
            >
              + Buat kategori baru: <strong>{{ kategoriSearch }}</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- Tahun Terbit -->
      <div class="form-group">
        <label>Tahun Terbit <span class="required">*</span></label>
        <input
          v-model.number="tahunTerbit"
          type="number"
          class="input"
          :min="2020"
          :max="2040"
          required
        />
      </div>

      <!-- Tipe Konten Toggle -->
      <div class="form-group">
        <label>Tipe Konten</label>
        <div class="toggle-group">
          <button
            type="button"
            :class="['toggle-btn', kontenType === 'richtext' ? 'active' : '']"
            @click="kontenType = 'richtext'"
          >
            ✏️ Tulis Konten
          </button>
          <button
            type="button"
            :class="['toggle-btn', kontenType === 'file' ? 'active' : '']"
            @click="kontenType = 'file'"
          >
            📁 Upload File
          </button>
        </div>
      </div>

      <!-- Rich Text Editor -->
      <div v-if="kontenType === 'richtext'" class="form-group">
        <label>Konten RPP</label>
        <div class="editor-toolbar">
          <button type="button" class="toolbar-btn" title="Bold" @click="execCommand('bold')">
            <strong>B</strong>
          </button>
          <button type="button" class="toolbar-btn" title="Italic" @click="execCommand('italic')">
            <em>I</em>
          </button>
          <button
            type="button"
            class="toolbar-btn"
            title="Heading"
            @click="execCommand('formatBlock', 'h3')"
          >
            H
          </button>
          <button
            type="button"
            class="toolbar-btn"
            title="Bullet List"
            @click="execCommand('insertUnorderedList')"
          >
            •
          </button>
          <button
            type="button"
            class="toolbar-btn"
            title="Numbered List"
            @click="execCommand('insertOrderedList')"
          >
            1.
          </button>
          <button type="button" class="toolbar-btn" title="Table" @click="insertTable">⊞</button>
        </div>
        <div
          class="editor-content"
          contenteditable="true"
          @input="onEditorInput"
          v-html="konten"
        ></div>
      </div>

      <!-- File Upload -->
      <div v-if="kontenType === 'file'" class="form-group">
        <label>Upload File</label>
        <div
          :class="['drop-zone', isDragging ? 'dragging' : '']"
          @dragover.prevent="isDragging = true"
          @dragleave="isDragging = false"
          @drop.prevent="handleDrop"
        >
          <div v-if="selectedFile" class="file-preview">
            <span class="file-icon">📄</span>
            <div class="file-info">
              <span class="file-name">{{ selectedFile.name }}</span>
              <span class="file-size">{{ formatFileSize(selectedFile.size) }}</span>
            </div>
            <button type="button" class="btn-remove-file" @click="removeFile">✕</button>
          </div>
          <div v-else-if="existingFileName" class="file-preview">
            <span class="file-icon">📄</span>
            <div class="file-info">
              <span class="file-name">{{ existingFileName }}</span>
              <span class="file-size">(file tersimpan)</span>
            </div>
            <button type="button" class="btn-remove-file" @click="removeFile">✕</button>
          </div>
          <div v-else class="drop-placeholder">
            <span class="drop-icon">📂</span>
            <p>Drag & drop file di sini, atau</p>
            <label class="btn btn-secondary upload-label">
              Pilih File
              <input
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx"
                hidden
                @change="handleFileSelect"
              />
            </label>
            <p class="drop-hint">PDF, DOC, DOCX, PPT, PPTX — maks. 10MB</p>
          </div>
        </div>
        <p v-if="fileError" class="error-text">{{ fileError }}</p>
      </div>

      <!-- Actions -->
      <div class="form-actions">
        <button
          type="button"
          class="btn btn-secondary"
          @click="router.push({ name: 'rpp-portal' })"
        >
          Batal
        </button>
        <button
          type="button"
          class="btn btn-outline"
          :disabled="saving"
          @click="handleSubmit('draft')"
        >
          Simpan sebagai Draft
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="saving"
          @click="handleSubmit('published')"
        >
          {{ saving ? 'Menyimpan...' : 'Publish' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.page {
  padding: 2rem;
  max-width: 900px;
}
.page-header {
  margin-bottom: 1.5rem;
}
.page-header h1 {
  margin: 0;
  font-size: 1.5rem;
}
.rpp-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.form-group label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}
.required {
  color: #ef4444;
}
.input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}
select.input {
  appearance: auto;
}
.toggle-group {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
.toggle-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #f9fafb;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.15s;
}
.toggle-btn.active {
  background: #2563eb;
  color: white;
  border-color: #2563eb;
}
/* Kategori dropdown */
.kategori-group {
  position: relative;
}
.kategori-input-wrapper {
  position: relative;
}
.kategori-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  max-height: 200px;
  overflow-y: auto;
  z-index: 20;
}
.kategori-option {
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  font-size: 0.875rem;
}
.kategori-option:hover {
  background: #f3f4f6;
}
.kategori-new {
  color: #2563eb;
  border-top: 1px solid #e5e7eb;
}
/* Rich text editor */
.editor-toolbar {
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: #f9fafb;
}
.toolbar-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 0.875rem;
}
.toolbar-btn:hover {
  background: #e5e7eb;
}
.editor-content {
  min-height: 300px;
  padding: 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0 0 6px 6px;
  font-size: 0.875rem;
  line-height: 1.6;
  outline: none;
  overflow-y: auto;
}
.editor-content:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}
/* File upload drop zone */
.drop-zone {
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
  transition: all 0.15s;
}
.drop-zone.dragging {
  border-color: #2563eb;
  background: #eff6ff;
}
.drop-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}
.drop-icon {
  font-size: 2rem;
}
.drop-placeholder p {
  margin: 0;
  color: #6b7280;
  font-size: 0.875rem;
}
.drop-hint {
  font-size: 0.75rem !important;
  color: #9ca3af !important;
}
.upload-label {
  cursor: pointer;
}
.file-preview {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.file-icon {
  font-size: 1.5rem;
}
.file-info {
  display: flex;
  flex-direction: column;
}
.file-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: #111827;
}
.file-size {
  font-size: 0.75rem;
  color: #6b7280;
}
.btn-remove-file {
  margin-left: auto;
  background: #fee2e2;
  color: #991b1b;
  border: none;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.75rem;
}
/* Form actions */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
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
.btn-outline {
  background: white;
  color: #2563eb;
  border: 1px solid #2563eb;
}
.btn-outline:hover {
  background: #eff6ff;
}
.btn-outline:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.empty-state {
  text-align: center;
  color: #6b7280;
  padding: 2rem;
}
.error-text {
  color: #dc2626;
  font-size: 0.875rem;
}
</style>
