<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { PageHeader, BaseModal } from '@/components/ui';

interface RppDetail {
  id: string;
  judul: string;
  guru_id: string;
  guru_nama: string;
  mata_pelajaran_nama: string;
  kategori_nama: string;
  tahun_terbit: number;
  konten_type: 'richtext' | 'file';
  konten: string | null;
  file_nama: string | null;
  file_size: number | null;
  status: 'draft' | 'published';
  tanggal_publish: string | null;
  updated_at: string;
  is_favorited: boolean;
}

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const rppId = computed(() => route.params.id as string);
const rpp = ref<RppDetail | null>(null);
const loading = ref(false);
const error = ref('');
const showDeleteModal = ref(false);

const isOwner = computed(() => rpp.value?.guru_id === authStore.user?.id);

async function fetchDetail() {
  loading.value = true;
  try {
    const { data } = await api.get<{ data: RppDetail }>(`/rpp/${rppId.value}`);
    rpp.value = data.data;
  } catch (e: any) {
    error.value = e.response?.data?.message || 'Gagal memuat RPP.';
  } finally {
    loading.value = false;
  }
}

async function toggleFavorite() {
  if (!rpp.value) return;
  try {
    await api.post(`/rpp/${rpp.value.id}/favorite`);
    rpp.value.is_favorited = !rpp.value.is_favorited;
  } catch (e) {
    console.error('Failed to toggle favorite:', e);
  }
}

async function downloadRpp() {
  if (!rpp.value) return;
  try {
    const { data } = await api.get<{ url: string }>(`/rpp/${rpp.value.id}/download`);
    window.open(data.url, '_blank');
  } catch (e) {
    console.error('Failed to download RPP:', e);
  }
}

async function deleteRpp() {
  if (!rpp.value) return;
  try {
    await api.delete(`/rpp/${rpp.value.id}`);
    router.push({ name: 'rpp-portal' });
  } catch (e: any) {
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
  <div class="p-4 lg:p-6 max-w-4xl mx-auto">
    <!-- Back button -->
    <div class="mb-4">
      <button
        class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
        @click="router.push({ name: 'rpp-portal' })"
      >
        ← Kembali ke Portal
      </button>
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
      <p class="mt-2 text-sm">Memuat data...</p>
    </div>
    <div v-else-if="error" class="text-center text-danger-500 py-12">{{ error }}</div>
    <div v-else-if="rpp">
      <!-- Header -->
      <div class="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <span
            :class="[
              'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
              rpp.status === 'published'
                ? 'bg-success-50 text-success-700'
                : 'bg-warning-50 text-warning-700',
            ]"
          >
            {{ rpp.status === 'published' ? 'Published' : 'Draft' }}
          </span>
          <h1 class="text-xl font-bold text-text-primary mt-2">{{ rpp.judul }}</h1>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            :class="[
              'px-3 py-2 text-sm font-medium rounded-lg border transition-colors',
              rpp.is_favorited
                ? 'bg-warning-50 border-amber-500 text-warning-700'
                : 'bg-white border-border text-text-secondary hover:bg-surface-50',
            ]"
            @click="toggleFavorite"
          >
            {{ rpp.is_favorited ? '★ Favorit' : '☆ Favorit' }}
          </button>
          <button
            class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
            @click="downloadRpp"
          >
            ⬇ Download
          </button>
          <template v-if="isOwner">
            <button
              class="px-3 py-2 text-sm font-medium text-primary-600 bg-white border border-primary-600 rounded-lg hover:bg-primary-50 transition-colors"
              @click="router.push({ name: 'rpp-edit', params: { id: rpp.id } })"
            >
              ✏️ Edit
            </button>
            <button
              class="px-4 py-2 text-sm font-medium text-white bg-danger-500 rounded-lg hover:bg-danger-700 transition-colors"
              @click="showDeleteModal = true"
            >
              🗑 Hapus
            </button>
          </template>
        </div>
      </div>

      <!-- Metadata -->
      <div
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-surface-50 rounded-xl mb-6"
      >
        <div class="flex flex-col gap-0.5">
          <span class="text-xs text-text-tertiary uppercase tracking-wide">Guru Pembuat</span>
          <span class="text-sm font-medium text-text-primary">{{ rpp.guru_nama }}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-xs text-text-tertiary uppercase tracking-wide">Mata Pelajaran</span>
          <span class="text-sm font-medium text-text-primary">{{ rpp.mata_pelajaran_nama }}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-xs text-text-tertiary uppercase tracking-wide">Kategori</span>
          <span class="text-sm font-medium text-text-primary">{{ rpp.kategori_nama }}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-xs text-text-tertiary uppercase tracking-wide">Tahun Terbit</span>
          <span class="text-sm font-medium text-text-primary">{{ rpp.tahun_terbit }}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-xs text-text-tertiary uppercase tracking-wide">Tanggal Publish</span>
          <span class="text-sm font-medium text-text-primary">{{
            formatDate(rpp.tanggal_publish)
          }}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-xs text-text-tertiary uppercase tracking-wide"
            >Terakhir Diperbarui</span
          >
          <span class="text-sm font-medium text-text-primary">{{
            formatDate(rpp.updated_at)
          }}</span>
        </div>
        <div v-if="rpp.konten_type === 'file'" class="flex flex-col gap-0.5">
          <span class="text-xs text-text-tertiary uppercase tracking-wide">File</span>
          <span class="text-sm font-medium text-text-primary"
            >{{ rpp.file_nama }} ({{ formatFileSize(rpp.file_size) }})</span
          >
        </div>
      </div>

      <!-- Content -->
      <div
        v-if="rpp.konten_type === 'richtext' && rpp.konten"
        class="bg-white border border-border rounded-xl overflow-hidden"
      >
        <div class="px-4 py-3 border-b border-border bg-surface-50">
          <h2 class="text-base font-semibold text-text-primary">Konten</h2>
        </div>
        <div class="p-6 text-sm leading-relaxed prose max-w-none" v-html="rpp.konten"></div>
      </div>
      <div
        v-else-if="rpp.konten_type === 'file'"
        class="bg-white border border-border rounded-xl overflow-hidden"
      >
        <div class="px-4 py-3 border-b border-border bg-surface-50">
          <h2 class="text-base font-semibold text-text-primary">File Terlampir</h2>
        </div>
        <div class="p-4">
          <div
            class="flex items-center gap-4 p-4 border border-border rounded-lg cursor-pointer hover:bg-surface-50 transition-colors"
            @click="downloadRpp"
          >
            <span class="text-3xl">📄</span>
            <div>
              <p class="text-sm font-medium text-text-primary">{{ rpp.file_nama }}</p>
              <p class="text-xs text-text-tertiary">{{ formatFileSize(rpp.file_size) }}</p>
            </div>
            <span class="ml-auto text-lg text-text-tertiary">⬇</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <BaseModal
      :show="showDeleteModal"
      title="Konfirmasi Hapus"
      @close="showDeleteModal = false"
      size="lg"
    >
      <p class="text-sm text-text-secondary">
        Apakah Anda yakin ingin menghapus RPP <strong>{{ rpp?.judul }}</strong
        >? Tindakan ini tidak dapat dibatalkan.
      </p>
      <template #footer>
        <button
          class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
          @click="showDeleteModal = false"
        >
          Batal
        </button>
        <button
          class="px-4 py-2 text-sm font-medium text-white bg-danger-500 rounded-lg hover:bg-danger-700 transition-colors"
          @click="deleteRpp"
        >
          Hapus Permanen
        </button>
      </template>
    </BaseModal>
  </div>
</template>
