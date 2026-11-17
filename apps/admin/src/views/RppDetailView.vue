<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { BaseModal, ActionButton } from '@/components/ui';
import { useToast } from '@/composables/useToast';

interface RppDetail {
  id: string;
  judul: string;
  // API detail mengirim guru: { id, nama }, mata_pelajaran, kategori (lalu di-camelCase interceptor)
  guru: { id: string; nama: string } | null;
  mataPelajaran: string | null;
  kategori: string | null;
  tahunTerbit: number;
  kontenType: 'richtext' | 'file';
  konten: string | null;
  fileNama: string | null;
  fileSize: number | null;
  status: 'draft' | 'published';
  tanggalPublish: string | null;
  updatedAt: string;
  isFavorited: boolean;
}

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const rppId = computed(() => route.params.id as string);
const rpp = ref<RppDetail | null>(null);
const loading = ref(false);
const error = ref('');
const showDeleteModal = ref(false);

const isOwner = computed(() => rpp.value?.guru?.id === authStore.user?.id);

const toast = useToast();

// ===== Preview file =====
const showPreview = ref(false);
const previewLoading = ref(false);
const previewUrl = ref('');
const previewError = ref('');

const fileExt = computed(() => (rpp.value?.fileNama?.split('.').pop() || '').toLowerCase());
const previewKind = computed<'pdf' | 'image' | 'none'>(() => {
  if (fileExt.value === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExt.value)) return 'image';
  return 'none';
});

async function getFileUrl(): Promise<string> {
  // API membungkus jawaban: { data: { url, file_nama } }
  const { data } = await api.get<{ data?: { url?: string }; url?: string }>(
    `/rpp/${rpp.value!.id}/download`,
  );
  const url = data.data?.url ?? data.url;
  if (!url) throw new Error('URL file tidak ditemukan');
  return url;
}

async function openPreview() {
  if (!rpp.value) return;
  showPreview.value = true;
  previewLoading.value = true;
  previewError.value = '';
  previewUrl.value = '';
  try {
    previewUrl.value = await getFileUrl();
  } catch (e) {
    previewError.value = e.response?.data?.message || 'Gagal memuat file.';
  } finally {
    previewLoading.value = false;
  }
}

async function fetchDetail() {
  loading.value = true;
  try {
    const { data } = await api.get<{ data: RppDetail }>(`/rpp/${rppId.value}`);
    rpp.value = data.data;
  } catch (e) {
    error.value = e.response?.data?.message || 'Gagal memuat RPP.';
  } finally {
    loading.value = false;
  }
}

async function toggleFavorite() {
  if (!rpp.value) return;
  try {
    await api.post(`/rpp/${rpp.value.id}/favorite`);
    rpp.value.isFavorited = !rpp.value.isFavorited;
  } catch (e) {
    console.error('Failed to toggle favorite:', e);
  }
}

async function downloadRpp() {
  if (!rpp.value) return;
  // Buka tab dulu saat klik (sebelum await) supaya tidak diblok popup blocker
  const tab = window.open('', '_blank');
  try {
    const url = await getFileUrl();
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (e) {
    tab?.close();
    toast.error(e.response?.data?.message || 'Gagal mengunduh file RPP.');
  }
}

async function deleteRpp() {
  if (!rpp.value) return;
  try {
    await api.delete(`/rpp/${rpp.value.id}`);
    router.push({ name: 'rpp-portal' });
  } catch (e) {
    error.value = e.response?.data?.message || 'Gagal menghapus RPP.';
    showDeleteModal.value = false;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

onMounted(fetchDetail);
</script>

<template>
  <div class="p-8 max-w-4xl mx-auto">
    <!-- Back button -->
    <div class="mb-6">
      <ActionButton variant="neutral" size="sm" @click="router.push({ name: 'rpp-portal' })">
        ← Kembali ke Portal
      </ActionButton>
    </div>

    <div v-if="loading" class="text-center text-text-secondary py-12">
      <svg class="w-6 h-6 animate-spin text-primary-500 mx-auto" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p class="mt-2 text-[15px]">Memuat data...</p>
    </div>
    <div v-else-if="error" class="text-center text-danger-500 py-12 text-[15px]">{{ error }}</div>
    <div v-else-if="rpp" class="space-y-6">
      <!-- Header Card -->
      <div class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden">
        <div class="px-6 py-5 bg-primary-50 border-b-2 border-primary-200">
          <div class="flex flex-wrap justify-between items-center gap-4">
            <div class="flex items-center gap-3">
              <span
                :class="[
                  'inline-flex items-center px-2.5 py-1 rounded-xs text-[13px] font-semibold',
                  rpp.status === 'published'
                    ? 'bg-success-50 text-success-700'
                    : 'bg-warning-50 text-warning-700',
                ]"
              >
                {{ rpp.status === 'published' ? 'Published' : 'Draft' }}
              </span>
              <h3 class="text-[16px] font-bold text-primary-800">Detail RPP</h3>
            </div>
            <div class="flex flex-wrap gap-2">
              <ActionButton
                :variant="rpp.isFavorited ? 'warning' : 'neutral'"
                size="sm"
                @click="toggleFavorite"
              >
                {{ rpp.isFavorited ? '★ Favorit' : '☆ Favorit' }}
              </ActionButton>
              <ActionButton variant="primary" icon="download" size="sm" @click="downloadRpp">
                Download
              </ActionButton>
              <template v-if="isOwner">
                <ActionButton
                  variant="warning"
                  icon="edit"
                  size="sm"
                  @click="router.push({ name: 'rpp-edit', params: { id: rpp.id } })"
                >
                  Edit
                </ActionButton>
                <ActionButton
                  variant="danger"
                  icon="delete"
                  size="sm"
                  @click="showDeleteModal = true"
                >
                  Hapus
                </ActionButton>
              </template>
            </div>
          </div>
        </div>

        <!-- Title & Content -->
        <div class="p-6">
          <h1 class="text-[26px] font-extrabold text-text-primary mb-4">{{ rpp.judul }}</h1>

          <!-- Metadata Grid -->
          <div
            class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5 bg-stone-50 rounded-[12px]"
          >
            <div class="flex flex-col gap-1">
              <span class="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide"
                >Guru Pembuat</span
              >
              <span class="text-[15px] font-semibold text-text-primary">{{
                rpp.guru?.nama || '-'
              }}</span>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide"
                >Mata Pelajaran</span
              >
              <span class="text-[15px] font-semibold text-text-primary">{{
                rpp.mataPelajaran || '-'
              }}</span>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide"
                >Kategori</span
              >
              <span class="text-[15px] font-semibold text-text-primary">{{
                rpp.kategori || '-'
              }}</span>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide"
                >Tahun Terbit</span
              >
              <span class="text-[15px] font-semibold text-text-primary">{{ rpp.tahunTerbit }}</span>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide"
                >Tanggal Publish</span
              >
              <span class="text-[15px] font-semibold text-text-primary">{{
                formatDate(rpp.tanggalPublish)
              }}</span>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide"
                >Terakhir Diperbarui</span
              >
              <span class="text-[15px] font-semibold text-text-primary">{{
                formatDate(rpp.updatedAt)
              }}</span>
            </div>
            <div v-if="rpp.kontenType === 'file'" class="flex flex-col gap-1">
              <span class="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide"
                >File</span
              >
              <span class="text-[15px] font-semibold text-text-primary"
                >{{ rpp.fileNama }} ({{ formatFileSize(rpp.fileSize) }})</span
              >
            </div>
          </div>
        </div>
      </div>

      <!-- Content Card -->
      <div
        v-if="rpp.kontenType === 'richtext' && rpp.konten"
        class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden"
      >
        <div class="px-6 py-5 bg-primary-50 border-b-2 border-primary-200">
          <h3 class="text-[16px] font-bold text-primary-800">Konten</h3>
        </div>
        <div class="p-6 text-[15px] leading-relaxed prose max-w-none" v-html="rpp.konten"></div>
      </div>

      <!-- File Card -->
      <div
        v-else-if="rpp.kontenType === 'file'"
        class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden"
      >
        <div class="px-6 py-5 bg-primary-50 border-b-2 border-primary-200">
          <h3 class="text-[16px] font-bold text-primary-800">File Terlampir</h3>
        </div>
        <div class="p-6">
          <div
            class="flex items-center gap-4 p-5 border-2 border-stone-200 rounded-[12px] cursor-pointer hover:bg-primary-50 hover:border-primary-300 transition-all duration-200"
            @click="openPreview"
          >
            <span class="text-3xl">📄</span>
            <div class="min-w-0">
              <p class="text-[15px] font-semibold text-text-primary truncate">{{ rpp.fileNama }}</p>
              <p class="text-[13px] text-text-tertiary">
                {{ formatFileSize(rpp.fileSize) }} · Klik untuk lihat isi
              </p>
            </div>
            <span class="ml-auto text-[14px] font-semibold text-primary-600 shrink-0">Lihat</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Preview File Modal -->
    <BaseModal
      :show="showPreview"
      :title="rpp?.fileNama || 'Preview File'"
      size="xl"
      @close="showPreview = false"
    >
      <div v-if="previewLoading" class="py-16 text-center">
        <svg class="w-6 h-6 animate-spin text-primary-500 mx-auto" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <p class="text-[15px] text-text-tertiary mt-2">Memuat file...</p>
      </div>
      <div v-else-if="previewError" class="py-12 text-center">
        <p class="text-[15px] text-danger-600 mb-3">{{ previewError }}</p>
        <button
          class="text-[14px] font-semibold text-primary-600 hover:text-primary-700"
          @click="openPreview"
        >
          Coba lagi
        </button>
      </div>
      <template v-else-if="previewUrl">
        <iframe
          v-if="previewKind === 'pdf'"
          :src="previewUrl"
          title="Preview file RPP"
          class="w-full h-[70vh] rounded-[12px] border-2 border-stone-200 bg-stone-50"
        />
        <img
          v-else-if="previewKind === 'image'"
          :src="previewUrl"
          :alt="rpp?.fileNama || 'File RPP'"
          class="max-h-[70vh] mx-auto rounded-[12px]"
        />
        <div v-else class="py-12 text-center">
          <p class="text-[15px] text-text-secondary mb-1">
            Preview langsung hanya tersedia untuk file PDF dan gambar.
          </p>
          <p class="text-[13px] text-text-tertiary">
            File .{{ fileExt }} perlu diunduh untuk dibuka (Word/PowerPoint).
          </p>
        </div>
      </template>
      <template #footer>
        <ActionButton variant="neutral" size="sm" @click="showPreview = false">Tutup</ActionButton>
        <a
          v-if="previewUrl"
          :href="previewUrl"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center px-4 py-2 rounded-lg bg-primary-600 text-white text-[14px] font-semibold hover:bg-primary-700"
        >
          Download
        </a>
      </template>
    </BaseModal>

    <!-- Delete Confirmation Modal -->
    <BaseModal
      :show="showDeleteModal"
      title="Konfirmasi Hapus"
      size="lg"
      @close="showDeleteModal = false"
    >
      <p class="text-[15px] text-text-secondary">
        Apakah Anda yakin ingin menghapus RPP <strong>{{ rpp?.judul }}</strong
        >? Tindakan ini tidak dapat dibatalkan.
      </p>
      <template #footer>
        <ActionButton variant="neutral" size="sm" @click="showDeleteModal = false">
          Batal
        </ActionButton>
        <ActionButton variant="danger" icon="delete" size="sm" @click="deleteRpp">
          Hapus Permanen
        </ActionButton>
      </template>
    </BaseModal>
  </div>
</template>
