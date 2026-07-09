<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/client';
import { PageHeader, SearchSelect } from '@/components/ui';
import type { SelectOption } from '@/components/ui';

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
  meta: {
    has_next: boolean;
    cursor: string | null;
  };
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

const tahunFilterOptions: SelectOption[] = [2025, 2024, 2023, 2022, 2021, 2020].map((y) => ({
  value: y.toString(),
  label: y.toString(),
}));

const mapelFilterOptions = computed<SelectOption[]>(() =>
  mataPelajaranList.value.map((m) => ({ value: m.id, label: m.nama })),
);

const kategoriFilterOptions = computed<SelectOption[]>(() =>
  kategoriList.value.map((k) => ({ value: k.id, label: k.nama })),
);

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
    nextCursor.value = data.meta.cursor;
    hasMore.value = data.meta.has_next;
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
  <div class="p-4 lg:p-6 max-w-7xl mx-auto">
    <PageHeader title="Portal RPP / Modul Ajar" description="">
      <template #actions>
        <button
          class="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          @click="router.push({ name: 'rpp-create' })"
        >
          + Buat RPP Baru
        </button>
      </template>
    </PageHeader>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3 mb-4">
      <div class="flex-1 min-w-[200px] relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary text-sm">🔍</span>
        <input
          v-model="search"
          type="text"
          class="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          placeholder="Cari judul RPP..."
          @input="onSearchInput"
        />
      </div>
      <SearchSelect
        v-model="filterMapel"
        :options="mapelFilterOptions"
        placeholder="Semua Mata Pelajaran"
        clearable
      />
      <SearchSelect
        v-model="filterKategori"
        :options="kategoriFilterOptions"
        placeholder="Semua Kategori"
        clearable
      />
      <SearchSelect
        v-model="filterTahun"
        :options="tahunFilterOptions"
        placeholder="Semua Tahun"
        clearable
      />
    </div>

    <!-- RPP List -->
    <div v-if="loading && items.length === 0" class="text-center text-text-secondary py-12">
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
    <div v-else-if="items.length === 0" class="text-center text-text-secondary py-12">
      <p class="text-sm">Belum ada RPP yang dipublish.</p>
    </div>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="item in items"
        :key="item.id"
        class="bg-white border border-border rounded-xl p-4 hover:shadow-md transition-shadow"
      >
        <div class="flex justify-between items-center mb-2">
          <span
            :class="[
              'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
              item.konten_type === 'file'
                ? 'bg-warning-50 text-warning-700'
                : 'bg-primary-50 text-primary-600',
            ]"
          >
            {{ item.konten_type === 'file' ? '📄 File' : '📝 Teks' }}
          </span>
          <button
            :class="[
              'text-xl leading-none transition-colors',
              item.is_favorited ? 'text-amber-500' : 'text-text-tertiary hover:text-amber-500',
            ]"
            :title="item.is_favorited ? 'Hapus dari favorit' : 'Tambah ke favorit'"
            @click.stop="toggleFavorite(item)"
          >
            {{ item.is_favorited ? '★' : '☆' }}
          </button>
        </div>
        <h3
          class="text-sm font-semibold text-text-primary cursor-pointer hover:text-primary-600 transition-colors mb-2"
          @click="viewRpp(item)"
        >
          {{ item.judul }}
        </h3>
        <div class="flex flex-wrap gap-2 mb-3">
          <span class="text-xs text-text-tertiary">👤 {{ item.guru_nama }}</span>
          <span class="text-xs text-text-tertiary">📚 {{ item.mata_pelajaran_nama }}</span>
          <span class="text-xs text-text-tertiary">🏷️ {{ item.kategori_nama }}</span>
        </div>
        <div class="flex justify-between items-center pt-3 border-t border-border">
          <span class="text-xs text-text-tertiary">{{ formatDate(item.tanggal_publish) }}</span>
          <div class="flex gap-2">
            <button
              class="px-2 py-1 text-xs font-medium text-primary-600 bg-primary-50 rounded-md hover:bg-primary-100 transition-colors"
              @click="viewRpp(item)"
            >
              Lihat
            </button>
            <button
              class="px-2 py-1 text-xs font-medium text-success-700 bg-success-50 rounded-md hover:bg-success-50/80 transition-colors"
              @click="downloadRpp(item)"
            >
              ⬇ Download
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Load more -->
    <div v-if="hasMore" class="flex justify-center mt-6">
      <button
        class="px-3 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-lg hover:bg-surface-50 transition-colors"
        :disabled="loading"
        @click="loadMore"
      >
        {{ loading ? 'Memuat...' : 'Muat Lebih Banyak' }}
      </button>
    </div>
  </div>
</template>
