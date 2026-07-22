<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/client';
import { PageHeader, ActionButton } from '@/components/ui';

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
  <div class="p-8 max-w-7xl mx-auto">
    <PageHeader title="RPP Favorit Saya">
      <template #actions>
        <ActionButton variant="neutral" size="sm" @click="router.push({ name: 'rpp-portal' })">
          ← Kembali ke Portal
        </ActionButton>
      </template>
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
      <p class="mt-2 text-[15px]">Memuat data...</p>
    </div>
    <div v-else-if="items.length === 0" class="text-center text-text-secondary py-12">
      <p class="text-5xl mb-3">☆</p>
      <p class="text-[15px]">Belum ada RPP favorit.</p>
      <p class="text-[13px] text-text-tertiary mt-1">
        Tandai RPP dari portal untuk menyimpannya di sini.
      </p>
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
            class="text-xl leading-none text-amber-500 hover:text-danger-500 transition-colors"
            title="Hapus dari favorit"
            @click.stop="removeFavorite(item)"
          >
            ★
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
          <span class="text-[13px] font-medium text-text-tertiary">📅 {{ item.tahun_terbit }}</span>
        </div>
        <div class="flex justify-between items-center pt-4 border-t-2 border-stone-200">
          <span class="text-[13px] font-medium text-text-tertiary"
            >Dipublish: {{ formatDate(item.tanggal_publish) }}</span
          >
          <div class="flex gap-2">
            <ActionButton variant="primary" icon="view" @click="viewRpp(item)">Lihat</ActionButton>
            <ActionButton variant="success" icon="download" @click="downloadRpp(item)"
              >Download</ActionButton
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
