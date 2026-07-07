<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/client';

interface RppFavoriteItem {
  id: string;
  judul: string;
  guru_nama: string;
  mata_pelajaran_nama: string;
  kategori_nama: string;
  tahun_terbit: number;
  konten_type: 'richtext' | 'file';
  tanggal_publish: string;
  updated_at: string;
}

const router = useRouter();
const items = ref<RppFavoriteItem[]>([]);
const loading = ref(false);

async function fetchFavorites() {
  loading.value = true;
  try {
    const { data } = await api.get<{ data: RppFavoriteItem[] }>('/rpp/favorit');
    items.value = data.data;
  } catch (e) {
    console.error('Failed to fetch favorites:', e);
  } finally {
    loading.value = false;
  }
}

async function removeFavorite(item: RppFavoriteItem) {
  try {
    await api.post(`/rpp/${item.id}/favorite`);
    items.value = items.value.filter((i) => i.id !== item.id);
  } catch (e) {
    console.error('Failed to remove favorite:', e);
  }
}

async function downloadRpp(item: RppFavoriteItem) {
  try {
    const { data } = await api.get<{ url: string }>(`/rpp/${item.id}/download`);
    window.open(data.url, '_blank');
  } catch (e) {
    console.error('Failed to download RPP:', e);
  }
}

function viewRpp(item: RppFavoriteItem) {
  router.push({ name: 'rpp-detail', params: { id: item.id } });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

onMounted(fetchFavorites);
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>RPP Favorit Saya</h1>
      <button class="btn btn-secondary" @click="router.push({ name: 'rpp-portal' })">
        ← Kembali ke Portal
      </button>
    </div>

    <div v-if="loading" class="empty-state">Memuat data...</div>
    <div v-else-if="items.length === 0" class="empty-state">
      <p class="empty-icon">☆</p>
      <p>Belum ada RPP favorit.</p>
      <p class="empty-hint">Tandai RPP dari portal untuk menyimpannya di sini.</p>
    </div>
    <div v-else class="rpp-grid">
      <div v-for="item in items" :key="item.id" class="rpp-card">
        <div class="card-header">
          <span :class="['content-badge', item.konten_type]">
            {{ item.konten_type === 'file' ? '📄 File' : '📝 Teks' }}
          </span>
          <button
            class="btn-favorite active"
            title="Hapus dari favorit"
            @click.stop="removeFavorite(item)"
          >
            ★
          </button>
        </div>
        <h3 class="card-title" @click="viewRpp(item)">{{ item.judul }}</h3>
        <div class="card-meta">
          <span class="meta-item">👤 {{ item.guru_nama }}</span>
          <span class="meta-item">📚 {{ item.mata_pelajaran_nama }}</span>
          <span class="meta-item">🏷️ {{ item.kategori_nama }}</span>
          <span class="meta-item">📅 {{ item.tahun_terbit }}</span>
        </div>
        <div class="card-footer">
          <span class="card-date">Dipublish: {{ formatDate(item.tanggal_publish) }}</span>
          <div class="card-actions">
            <button class="btn-sm btn-view" @click="viewRpp(item)">Lihat</button>
            <button class="btn-sm btn-download" @click="downloadRpp(item)">⬇ Download</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: 2rem;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}
.page-header h1 {
  margin: 0;
  font-size: 1.5rem;
}
.rpp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
}
.rpp-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1rem;
  background: white;
  transition: box-shadow 0.15s;
}
.rpp-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}
.content-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: #f3f4f6;
  color: #374151;
}
.content-badge.file {
  background: #fef3c7;
  color: #92400e;
}
.content-badge.richtext {
  background: #dbeafe;
  color: #1e40af;
}
.btn-favorite {
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  color: #9ca3af;
  transition: color 0.15s;
}
.btn-favorite.active {
  color: #f59e0b;
}
.btn-favorite:hover {
  color: #ef4444;
}
.card-title {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  cursor: pointer;
}
.card-title:hover {
  color: #2563eb;
}
.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.meta-item {
  font-size: 0.75rem;
  color: #6b7280;
}
.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.75rem;
  border-top: 1px solid #f3f4f6;
}
.card-date {
  font-size: 0.75rem;
  color: #9ca3af;
}
.card-actions {
  display: flex;
  gap: 0.5rem;
}
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  font-weight: 500;
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
.btn-view {
  background: #dbeafe;
  color: #1e40af;
}
.btn-view:hover {
  background: #bfdbfe;
}
.btn-download {
  background: #d1fae5;
  color: #065f46;
}
.btn-download:hover {
  background: #a7f3d0;
}
.empty-state {
  text-align: center;
  color: #6b7280;
  padding: 3rem;
}
.empty-icon {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}
.empty-hint {
  font-size: 0.875rem;
  color: #9ca3af;
}
</style>
