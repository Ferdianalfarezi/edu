<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/client';
import { PageHeader, SearchSelect, ActionButton, TablePagination } from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import { useAuthStore } from '@/stores/auth';
import { useTableUrlState } from '@/composables/useTableUrlState';
import { Role } from '@edu/shared';

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

interface OffsetPaginatedResponse {
  data: RppItem[];
  meta: {
    page: number;
    page_size: number;
    total_count: number;
    total_pages: number;
  };
}

const router = useRouter();
const authStore = useAuthStore();
const canCreateRpp = computed(() => !authStore.hasRole(Role.ADMIN));

const items = ref<RppItem[]>([]);
const loading = ref(false);
const errorMessage = ref('');

// URL-synced table state
const { page, pageSize, search, filters } = useTableUrlState({
  searchKey: 'search',
  defaultPageSize: 15,
  filters: [
    { key: 'mapel', type: 'string' },
    { key: 'kategori', type: 'string' },
    { key: 'tahun', type: 'string' },
  ],
});

const totalCount = ref(0);
const totalPages = ref(0);

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

async function fetchRpp() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const params: Record<string, string | number> = {
      page: page.value,
      page_size: pageSize.value,
    };
    if (search.value) params.search = search.value;
    if (filters['mapel'].value) params.mapel = filters['mapel'].value;
    if (filters['kategori'].value) params.kategori = filters['kategori'].value;
    if (filters['tahun'].value) params.tahun = filters['tahun'].value;

    const { data } = await api.get<OffsetPaginatedResponse>('/rpp', { params });
    items.value = data.data;
    totalCount.value = data.meta.total_count;
    totalPages.value = data.meta.total_pages;
  } catch (e) {
    console.error('Failed to fetch RPP:', e);
    errorMessage.value = 'Gagal memuat data RPP. Silakan coba lagi.';
  } finally {
    loading.value = false;
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

// Watch composable state to trigger fetch
watch([page, pageSize, search, filters['mapel'], filters['kategori'], filters['tahun']], fetchRpp);

onMounted(async () => {
  await Promise.all([fetchMataPelajaran(), fetchKategori()]);
  await fetchRpp();
});
</script>

<template>
  <div class="p-8 max-w-7xl mx-auto">
    <PageHeader title="Portal RPP / Modul Ajar">
      <template #actions>
        <ActionButton
          v-if="canCreateRpp"
          variant="primary"
          size="sm"
          @click="router.push({ name: 'rpp-create' })"
        >
          + Buat RPP Baru
        </ActionButton>
      </template>
    </PageHeader>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3 mb-6">
      <div class="flex-1 min-w-[200px] relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary text-[15px]"
          >🔍</span
        >
        <input
          v-model="search"
          type="text"
          class="w-full pl-9 pr-4 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
          placeholder="Cari judul RPP..."
        />
      </div>
      <SearchSelect
        v-model="filters['mapel'].value"
        :options="mapelFilterOptions"
        placeholder="Semua Mata Pelajaran"
        clearable
      />
      <SearchSelect
        v-model="filters['kategori'].value"
        :options="kategoriFilterOptions"
        placeholder="Semua Kategori"
        clearable
      />
      <SearchSelect
        v-model="filters['tahun'].value"
        :options="tahunFilterOptions"
        placeholder="Semua Tahun"
        clearable
      />
    </div>

    <!-- Error message -->
    <div
      v-if="errorMessage"
      class="mb-6 p-4 bg-danger-50 border-2 border-danger-200 rounded-[12px] text-[15px] text-danger-700"
    >
      {{ errorMessage }}
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
      <p class="mt-2 text-[15px]">Memuat data...</p>
    </div>
    <div v-else-if="items.length === 0" class="text-center text-text-secondary py-12">
      <p class="text-[15px]">Belum ada RPP yang dipublish.</p>
    </div>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      <div
        v-for="item in items"
        :key="item.id"
        class="bg-white border-2 border-stone-200 rounded-[16px] p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
      >
        <div class="flex justify-between items-center mb-3">
          <span
            :class="[
              'inline-flex items-center px-2.5 py-1 rounded-xs text-[13px] font-semibold',
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
          class="text-[15px] font-bold text-text-primary cursor-pointer hover:text-primary-600 transition-colors mb-3"
          @click="viewRpp(item)"
        >
          {{ item.judul }}
        </h3>
        <div class="flex flex-wrap gap-2 mb-4">
          <span class="text-[13px] font-medium text-text-tertiary">👤 {{ item.guru_nama }}</span>
          <span class="text-[13px] font-medium text-text-tertiary"
            >📚 {{ item.mata_pelajaran_nama }}</span
          >
          <span class="text-[13px] font-medium text-text-tertiary"
            >🏷️ {{ item.kategori_nama }}</span
          >
        </div>
        <div class="flex justify-between items-center pt-4 border-t-2 border-stone-200">
          <span class="text-[13px] font-medium text-text-tertiary">{{
            formatDate(item.tanggal_publish)
          }}</span>
          <div class="flex gap-2">
            <ActionButton variant="primary" icon="view" @click="viewRpp(item)">Lihat</ActionButton>
            <ActionButton variant="success" icon="download" @click="downloadRpp(item)"
              >Download</ActionButton
            >
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <TablePagination
      :current-page="page"
      :total-pages="totalPages"
      :total-count="totalCount"
      :page-size="pageSize"
      :loading="loading"
      @page-change="page = $event"
      @page-size-change="pageSize = $event"
    />
  </div>
</template>
