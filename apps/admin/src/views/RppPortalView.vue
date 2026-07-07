<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/client';

interface RppItem {
  id: string;
  judul: string;
  guru_nama: string;
  mata_pelajaran_nama: string;
  kategori_nama: string;
  tahun_terbit: number;
  konten_type: 'richtext' | 'file';
  tanggal_publish: string;
  updated_at: string;
  is_favorited: boolean;
}

interface MataPelajaran {
  id: string;
  nama: string;
}

interface KategoriRpp {
  id: string;
  nama: string;
}

interface PaginatedResponse {
  data: RppItem[];
  next_cursor: string | null;
  has_more: boolean;
}

const router = useRouter();

const items = ref<RppItem[]>([]);
const loading = ref(false);
const nextCursor = ref<string | null>(null);
const hasMore = ref(false);

// Filters
const search = ref('');
const filterMapel = ref('');
const filterKategori = ref('');
const filterTahun = ref('');

// Selectors
const mataPelajaranList = ref<MataPelajaran[]>([]);
const kategoriList = ref<KategoriRpp[]>([]);

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

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

async function fetchRpp(reset = false) {
  if (reset) {
    items.value = [];
    nextCursor.value = null;
    hasMore.value = false;
  }

  loading.value = true;
  try {
    const params: Record<string, string> = {};
    if (search.value) params.search = search.value;
    if (filterMapel.value) params.mapel = filterMapel.value;
    if (filterKategori.value) params.kategori = filterKategori.value;
    if (filterTahun.value) params.tahun = filterTahun.value;
    if (nextCursor.value) params.cursor = nextCursor.value;

    const { data } = await api.get<PaginatedResponse>('/rpp', { params });
    if (reset) {
      items.value = data.data;
    } else {
      items.value.push(...data.data);
    }
    nextCursor.value = data.next_cursor;
    hasMore.value = data.has_more;
  } catch (e) {
    console.error('Failed to fetch RPP:', e);
  } finally {
    loading.value = false;
  }
}

function onSearchInput() {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    fetchRpp(true);
  }, 300);
}

function onFilterChange() {
  fetchRpp(true);
}

function loadMore() {
  if (hasMore.value && !loading.value) {
    fetchRpp(false);
  }
}

async function toggleFavorite(item: RppItem) {
  try {
    await api.post(`/rpp/${item.id}/favorite`);
    item.is_favorited = !item.is_favorited;
  } catch (e) {
    console.error('Failed to toggle favorite:', e);
  }
}

async function downloadRpp(item: RppItem) {
  try {
    const { data } = await api.get<{ url: string }>(`/rpp/${item.id}/download`);
    window.open(data.url, '_blank');
  } catch (e) {
    console.error('Failed to download RPP:', e);
  }
}

function viewRpp(item: RppItem) {
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

watch([filterMapel, filterKategori, filterTahun], onFilterChange);

onMounted(async () => {
  await Promise.all([fetchMataPelajaran(), fetchKategori()]);
  await fetchRpp(true);
});
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Portal RPP / Modul Ajar</h1>
      <button class="btn btn-primary" @click="router.push({ name: 'rpp-create' })">
        + Buat RPP Baru
      </button>
    </div>

    <!-- Filters -->
    <div class="filters">
      <div class="search-box">
        <input
          v-model="search"
          type="text"
          class="input"
          placeholder="🔍 Cari judul RPP..."
          @input="onSearchInput"
        />
      </div>
      <select v-model="filterMapel" class="input filter-select">
        <option value="">Semua Mata Pelajaran</option>
        <option v-for="mapel in mataPelajaranList" :key="mapel.id" :value="mapel.id">
          {{ mapel.nama }}
        </option>
      </select>
      <select v-model="filterKategori" class="input filter-select">
        <option value="">Semua Kategori</option>
        <option v-for="kat in kategoriList" :key="kat.id" :value="kat.id">
          {{ kat.nama }}
        </option>
      </select>
      <select v-model="filterTahun" class="input filter-select">
        <option value="">Semua Tahun</option>
        <option v-for="y in [2025, 2024, 2023, 2022, 2021, 2020]" :key="y" :value="y.toString()">
          {{ y }}
        </option>
      </select>
    </div>

    <!-- RPP List -->
    <div v-if="loading && items.length === 0" class="empty-state">Memuat data...</div>
    <div v-else-if="items.length === 0" class="empty-state">Belum ada RPP yang dipublish.</div>
    <div v-else class="rpp-grid">
      <div v-for="item in items" :key="item.id" class="rpp-card">
        <div class="card-header">
          <span :class="['content-badge', item.konten_type]">
            {{ item.konten_type === 'file' ? '📄 File' : '📝 Teks' }}
          </span>
          <button
            :class="['btn-favorite', item.is_favorited ? 'active' : '']"
            :title="item.is_favorited ? 'Hapus dari favorit' : 'Tambah ke favorit'"
            @click.stop="toggleFavorite(item)"
          >
            {{ item.is_favorited ? '★' : '☆' }}
          </button>
        </div>
        <h3 class="card-title" @click="viewRpp(item)">{{ item.judul }}</h3>
        <div class="card-meta">
          <span class="meta-item">👤 {{ item.guru_nama }}</span>
          <span class="meta-item">📚 {{ item.mata_pelajaran_nama }}</span>
          <span class="meta-item">🏷️ {{ item.kategori_nama }}</span>
        </div>
        <div class="card-footer">
          <span class="card-date">{{ formatDate(item.tanggal_publish) }}</span>
          <div class="card-actions">
            <button class="btn-sm btn-view" @click="viewRpp(item)">Lihat</button>
            <button class="btn-sm btn-download" @click="downloadRpp(item)">⬇ Download</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Load more -->
    <div v-if="hasMore" class="load-more">
      <button class="btn btn-secondary" :disabled="loading" @click="loadMore">
        {{ loading ? 'Memuat...' : 'Muat Lebih Banyak' }}
      </button>
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
.filters {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}
.search-box {
  flex: 1;
  min-width: 200px;
}
.filter-select {
  min-width: 160px;
}
.input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
  width: 100%;
}
select.input {
  appearance: auto;
}
/* RPP Grid */
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
  color: #f59e0b;
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
.load-more {
  display: flex;
  justify-content: center;
  margin-top: 1.5rem;
}
</style>
