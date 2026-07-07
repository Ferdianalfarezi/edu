<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';

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
  <div class="page">
    <div class="page-nav">
      <button class="btn btn-secondary" @click="router.push({ name: 'rpp-portal' })">
        ← Kembali ke Portal
      </button>
    </div>

    <div v-if="loading" class="empty-state">Memuat data...</div>
    <div v-else-if="error" class="error-state">{{ error }}</div>
    <div v-else-if="rpp" class="rpp-detail">
      <!-- Header -->
      <div class="detail-header">
        <div class="header-left">
          <span :class="['status-badge', rpp.status]">
            {{ rpp.status === 'published' ? 'Published' : 'Draft' }}
          </span>
          <h1>{{ rpp.judul }}</h1>
        </div>
        <div class="header-actions">
          <button
            :class="['btn-favorite-lg', rpp.is_favorited ? 'active' : '']"
            @click="toggleFavorite"
          >
            {{ rpp.is_favorited ? '★ Favorit' : '☆ Favorit' }}
          </button>
          <button class="btn btn-primary" @click="downloadRpp">⬇ Download</button>
          <template v-if="isOwner">
            <button
              class="btn btn-outline"
              @click="router.push({ name: 'rpp-edit', params: { id: rpp.id } })"
            >
              ✏️ Edit
            </button>
            <button class="btn btn-danger" @click="showDeleteModal = true">🗑 Hapus</button>
          </template>
        </div>
      </div>

      <!-- Metadata -->
      <div class="detail-meta">
        <div class="meta-row">
          <span class="meta-label">Guru Pembuat</span>
          <span class="meta-value">{{ rpp.guru_nama }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Mata Pelajaran</span>
          <span class="meta-value">{{ rpp.mata_pelajaran_nama }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Kategori</span>
          <span class="meta-value">{{ rpp.kategori_nama }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Tahun Terbit</span>
          <span class="meta-value">{{ rpp.tahun_terbit }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Tanggal Publish</span>
          <span class="meta-value">{{ formatDate(rpp.tanggal_publish) }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Terakhir Diperbarui</span>
          <span class="meta-value">{{ formatDate(rpp.updated_at) }}</span>
        </div>
        <div v-if="rpp.konten_type === 'file'" class="meta-row">
          <span class="meta-label">File</span>
          <span class="meta-value">{{ rpp.file_nama }} ({{ formatFileSize(rpp.file_size) }})</span>
        </div>
      </div>

      <!-- Content -->
      <div v-if="rpp.konten_type === 'richtext' && rpp.konten" class="detail-content">
        <h2>Konten</h2>
        <div class="content-render" v-html="rpp.konten"></div>
      </div>
      <div v-else-if="rpp.konten_type === 'file'" class="detail-content">
        <h2>File Terlampir</h2>
        <div class="file-card" @click="downloadRpp">
          <span class="file-icon">📄</span>
          <div>
            <p class="file-name">{{ rpp.file_nama }}</p>
            <p class="file-size">{{ formatFileSize(rpp.file_size) }}</p>
          </div>
          <span class="download-icon">⬇</span>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
      <div class="modal">
        <h2>Konfirmasi Hapus</h2>
        <p>
          Apakah Anda yakin ingin menghapus RPP <strong>{{ rpp?.judul }}</strong
          >? Tindakan ini tidak dapat dibatalkan.
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showDeleteModal = false">Batal</button>
          <button class="btn btn-danger" @click="deleteRpp">Hapus Permanen</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: 2rem;
  max-width: 900px;
}
.page-nav {
  margin-bottom: 1.5rem;
}
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  gap: 1rem;
  flex-wrap: wrap;
}
.header-left h1 {
  margin: 0.5rem 0 0;
  font-size: 1.5rem;
}
.header-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.status-badge {
  display: inline-block;
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-weight: 500;
}
.status-badge.published {
  background: #d1fae5;
  color: #065f46;
}
.status-badge.draft {
  background: #fef3c7;
  color: #92400e;
}
.btn-favorite-lg {
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-size: 0.875rem;
}
.btn-favorite-lg.active {
  background: #fffbeb;
  border-color: #f59e0b;
  color: #92400e;
}
.detail-meta {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 0.75rem;
  padding: 1.25rem;
  background: #f9fafb;
  border-radius: 8px;
  margin-bottom: 1.5rem;
}
.meta-row {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}
.meta-label {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}
.meta-value {
  font-size: 0.875rem;
  color: #111827;
  font-weight: 500;
}
.detail-content h2 {
  font-size: 1.125rem;
  margin: 0 0 1rem;
}
.content-render {
  padding: 1.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.875rem;
  line-height: 1.7;
}
.content-render :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.5rem 0;
}
.content-render :deep(td),
.content-render :deep(th) {
  border: 1px solid #e5e7eb;
  padding: 0.5rem;
}
.file-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.file-card:hover {
  background: #f9fafb;
}
.file-icon {
  font-size: 2rem;
}
.file-name {
  margin: 0;
  font-weight: 500;
  font-size: 0.875rem;
}
.file-size {
  margin: 0;
  font-size: 0.75rem;
  color: #6b7280;
}
.download-icon {
  margin-left: auto;
  font-size: 1.25rem;
  color: #6b7280;
}
/* Buttons */
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
.btn-danger {
  background: #ef4444;
  color: white;
}
.btn-danger:hover {
  background: #dc2626;
}
/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.modal {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  width: 100%;
  max-width: 480px;
}
.modal h2 {
  margin: 0 0 1rem;
  font-size: 1.25rem;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}
.empty-state {
  text-align: center;
  color: #6b7280;
  padding: 3rem;
}
.error-state {
  text-align: center;
  color: #dc2626;
  padding: 3rem;
}
</style>
