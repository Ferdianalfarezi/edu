<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { api } from '@/api/client';
import { PageHeader, SearchSelect } from '@/components/ui';
import type { SelectOption } from '@/components/ui';

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

const mataPelajaranSelectOptions = computed<SelectOption[]>(() =>
  mataPelajaranList.value.map((m) => ({ value: m.id, label: m.nama })),
);

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
  } catch (e) {
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
  <div class="p-4 lg:p-6 max-w-3xl mx-auto">
    <PageHeader :title="isEdit ? 'Edit RPP / Modul Ajar' : 'Buat RPP / Modul Ajar'" description="">
    </PageHeader>

    <div v-if="loading" class="text-center text-text-secondary py-12">
      <svg class="w-6 h-6 animate-spin text-primary-500 mx-auto" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p class="mt-2 text-sm">Memuat data...</p>
    </div>

    <form v-else class="space-y-5" @submit.prevent>
      <div
        v-if="error"
        class="p-3 bg-danger-50 border border-danger-500/20 rounded-lg text-sm text-danger-700"
      >
        {{ error }}
      </div>

      <!-- Judul -->
      <div>
        <label class="block text-sm font-medium text-text-primary mb-1.5"
          >Judul RPP <span class="text-danger-500">*</span></label
        >
        <input
          v-model="judul"
          type="text"
          class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          placeholder="Masukkan judul RPP"
          required
        />
      </div>

      <!-- Mata Pelajaran -->
      <div>
        <SearchSelect
          v-model="mataPelajaranId"
          label="Mata Pelajaran"
          :options="mataPelajaranSelectOptions"
          placeholder="Pilih mata pelajaran"
          required
        />
      </div>

      <!-- Kategori (searchable with auto-create) -->
      <div class="relative">
        <label class="block text-sm font-medium text-text-primary mb-1.5"
          >Kategori <span class="text-danger-500">*</span></label
        >
        <div class="relative">
          <input
            v-model="kategoriSearch"
            type="text"
            class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            placeholder="Cari atau buat kategori baru"
            @input="onKategoriInput"
            @focus="showKategoriDropdown = true"
            @blur="handleKategoriBlur"
          />
          <div
            v-if="showKategoriDropdown && (filteredKategori.length > 0 || isNewKategori)"
            class="absolute top-full left-0 right-0 bg-white border border-border rounded-lg shadow-lg max-h-[200px] overflow-y-auto z-20"
          >
            <div
              v-for="kat in filteredKategori"
              :key="kat.id"
              class="px-3 py-2 text-sm cursor-pointer hover:bg-surface-50 transition-colors"
              @mousedown.prevent="selectKategori(kat)"
            >
              {{ kat.nama }}
            </div>
            <div
              v-if="isNewKategori"
              class="px-3 py-2 text-sm cursor-pointer text-primary-600 border-t border-border hover:bg-surface-50 transition-colors"
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
      <div>
        <label class="block text-sm font-medium text-text-primary mb-1.5"
          >Tahun Terbit <span class="text-danger-500">*</span></label
        >
        <input
          v-model.number="tahunTerbit"
          type="number"
          class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          :min="2020"
          :max="2040"
          required
        />
      </div>

      <!-- Tipe Konten Toggle -->
      <div>
        <label class="block text-sm font-medium text-text-primary mb-1.5">Tipe Konten</label>
        <div class="flex gap-1 p-1 bg-surface-100 rounded-lg w-fit">
          <button
            type="button"
            :class="[
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              kontenType === 'richtext'
                ? 'bg-white text-text-primary shadow-xs'
                : 'text-text-secondary hover:text-text-primary',
            ]"
            @click="kontenType = 'richtext'"
          >
            ✏️ Tulis Konten
          </button>
          <button
            type="button"
            :class="[
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              kontenType === 'file'
                ? 'bg-white text-text-primary shadow-xs'
                : 'text-text-secondary hover:text-text-primary',
            ]"
            @click="kontenType = 'file'"
          >
            📁 Upload File
          </button>
        </div>
      </div>

      <!-- Rich Text Editor -->
      <div v-if="kontenType === 'richtext'">
        <label class="block text-sm font-medium text-text-primary mb-1.5">Konten RPP</label>
        <div class="flex gap-1 p-2 bg-surface-50 border border-border border-b-0 rounded-t-lg">
          <button
            type="button"
            class="w-8 h-8 flex items-center justify-center border border-border rounded-md bg-white hover:bg-surface-50 text-sm"
            title="Bold"
            @click="execCommand('bold')"
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            class="w-8 h-8 flex items-center justify-center border border-border rounded-md bg-white hover:bg-surface-50 text-sm"
            title="Italic"
            @click="execCommand('italic')"
          >
            <em>I</em>
          </button>
          <button
            type="button"
            class="w-8 h-8 flex items-center justify-center border border-border rounded-md bg-white hover:bg-surface-50 text-sm"
            title="Heading"
            @click="execCommand('formatBlock', 'h3')"
          >
            H
          </button>
          <button
            type="button"
            class="w-8 h-8 flex items-center justify-center border border-border rounded-md bg-white hover:bg-surface-50 text-sm"
            title="Bullet List"
            @click="execCommand('insertUnorderedList')"
          >
            •
          </button>
          <button
            type="button"
            class="w-8 h-8 flex items-center justify-center border border-border rounded-md bg-white hover:bg-surface-50 text-sm"
            title="Numbered List"
            @click="execCommand('insertOrderedList')"
          >
            1.
          </button>
          <button
            type="button"
            class="w-8 h-8 flex items-center justify-center border border-border rounded-md bg-white hover:bg-surface-50 text-sm"
            title="Table"
            @click="insertTable"
          >
            ⊞
          </button>
        </div>
        <div
          class="min-h-[300px] p-4 border border-border rounded-b-lg text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          contenteditable="true"
          @input="onEditorInput"
          v-html="konten"
        ></div>
      </div>

      <!-- File Upload -->
      <div v-if="kontenType === 'file'">
        <label class="block text-sm font-medium text-text-primary mb-1.5">Upload File</label>
        <div
          :class="[
            'border-2 border-dashed rounded-xl p-8 text-center transition-colors',
            isDragging ? 'border-primary-500 bg-primary-50' : 'border-border',
          ]"
          @dragover.prevent="isDragging = true"
          @dragleave="isDragging = false"
          @drop.prevent="handleDrop"
        >
          <div v-if="selectedFile" class="flex items-center gap-3 justify-center">
            <span class="text-2xl">📄</span>
            <div class="text-left">
              <span class="text-sm font-medium text-text-primary block">{{
                selectedFile.name
              }}</span>
              <span class="text-xs text-text-tertiary">{{
                formatFileSize(selectedFile.size)
              }}</span>
            </div>
            <button
              type="button"
              class="ml-4 w-6 h-6 flex items-center justify-center bg-danger-50 text-danger-700 rounded-full text-xs hover:bg-danger-50/80 transition-colors"
              @click="removeFile"
            >
              ✕
            </button>
          </div>
          <div v-else-if="existingFileName" class="flex items-center gap-3 justify-center">
            <span class="text-2xl">📄</span>
            <div class="text-left">
              <span class="text-sm font-medium text-text-primary block">{{
                existingFileName
              }}</span>
              <span class="text-xs text-text-tertiary">(file tersimpan)</span>
            </div>
            <button
              type="button"
              class="ml-4 w-6 h-6 flex items-center justify-center bg-danger-50 text-danger-700 rounded-full text-xs hover:bg-danger-50/80 transition-colors"
              @click="removeFile"
            >
              ✕
            </button>
          </div>
          <div v-else class="flex flex-col items-center gap-2">
            <span class="text-3xl">📂</span>
            <p class="text-sm text-text-secondary">Drag & drop file di sini, atau</p>
            <label
              class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors cursor-pointer"
            >
              Pilih File
              <input
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx"
                hidden
                @change="handleFileSelect"
              />
            </label>
            <p class="text-xs text-text-tertiary">PDF, DOC, DOCX, PPT, PPTX — maks. 10MB</p>
          </div>
        </div>
        <p v-if="fileError" class="text-xs text-danger-500 mt-1">{{ fileError }}</p>
      </div>

      <!-- Actions -->
      <div class="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
        <button
          type="button"
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="router.push({ name: 'rpp-portal' })"
        >
          Batal
        </button>
        <button
          type="button"
          class="px-3 py-2 text-sm font-medium text-primary-600 bg-white border border-primary-600 rounded-lg hover:bg-primary-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="saving"
          @click="handleSubmit('draft')"
        >
          Simpan sebagai Draft
        </button>
        <button
          type="button"
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="saving"
          @click="handleSubmit('published')"
        >
          {{ saving ? 'Menyimpan...' : 'Publish' }}
        </button>
      </div>
    </form>
  </div>
</template>
