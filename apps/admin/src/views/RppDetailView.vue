<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { BaseModal, ActionButton } from '@/components/ui';

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
                :variant="rpp.is_favorited ? 'warning' : 'neutral'"
                size="sm"
                @click="toggleFavorite"
              >
                {{ rpp.is_favorited ? '★ Favorit' : '☆ Favorit' }}
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
              <span class="text-[15px] font-semibold text-text-primary">{{ rpp.guru_nama }}</span>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide"
                >Mata Pelajaran</span
              >
              <span class="text-[15px] font-semibold text-text-primary">{{
                rpp.mata_pelajaran_nama
              }}</span>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide"
                >Kategori</span
              >
              <span class="text-[15px] font-semibold text-text-primary">{{
                rpp.kategori_nama
              }}</span>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide"
                >Tahun Terbit</span
              >
              <span class="text-[15px] font-semibold text-text-primary">{{
                rpp.tahun_terbit
              }}</span>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide"
                >Tanggal Publish</span
              >
              <span class="text-[15px] font-semibold text-text-primary">{{
                formatDate(rpp.tanggal_publish)
              }}</span>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide"
                >Terakhir Diperbarui</span
              >
              <span class="text-[15px] font-semibold text-text-primary">{{
                formatDate(rpp.updated_at)
              }}</span>
            </div>
            <div v-if="rpp.konten_type === 'file'" class="flex flex-col gap-1">
              <span class="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide"
                >File</span
              >
              <span class="text-[15px] font-semibold text-text-primary"
                >{{ rpp.file_nama }} ({{ formatFileSize(rpp.file_size) }})</span
              >
            </div>
          </div>
        </div>
      </div>

      <!-- Content Card -->
      <div
        v-if="rpp.konten_type === 'richtext' && rpp.konten"
        class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden"
      >
        <div class="px-6 py-5 bg-primary-50 border-b-2 border-primary-200">
          <h3 class="text-[16px] font-bold text-primary-800">Konten</h3>
        </div>
        <div class="p-6 text-[15px] leading-relaxed prose max-w-none" v-html="rpp.konten"></div>
      </div>

      <!-- File Card -->
      <div
        v-else-if="rpp.konten_type === 'file'"
        class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden"
      >
        <div class="px-6 py-5 bg-primary-50 border-b-2 border-primary-200">
          <h3 class="text-[16px] font-bold text-primary-800">File Terlampir</h3>
        </div>
        <div class="p-6">
          <div
            class="flex items-center gap-4 p-5 border-2 border-stone-200 rounded-[12px] cursor-pointer hover:bg-primary-50 hover:border-primary-300 transition-all duration-200"
            @click="downloadRpp"
          >
            <span class="text-3xl">📄</span>
            <div>
              <p class="text-[15px] font-semibold text-text-primary">{{ rpp.file_nama }}</p>
              <p class="text-[13px] text-text-tertiary">{{ formatFileSize(rpp.file_size) }}</p>
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
