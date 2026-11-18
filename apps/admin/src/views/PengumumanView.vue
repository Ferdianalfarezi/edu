<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { api } from '@/api/client';
import { PageHeader, BaseModal, ActionButton, TablePagination } from '@/components/ui';
import { useTableUrlState } from '@/composables/useTableUrlState';
import { useToast } from '@/composables/useToast';

interface Pengumuman {
  id: string;
  judul: string;
  mode: 'broadcast' | 'targeted';
  jumlahPenerima: number;
  status: 'draft' | 'terkirim' | 'gagal';
  createdAt: string;
}

interface PengumumanListResponse {
  data: Pengumuman[];
  meta: { page: number; pageSize: number; totalCount: number; totalPages: number };
}

interface SiswaOption {
  id: string;
  nama: string;
  nisn: string;
  kelasNama?: string;
}

interface PengumumanForm {
  judul: string;
  deskripsi: string;
  mode: 'broadcast' | 'targeted';
  siswaIds: string[];
}

const toast = useToast();

// Table state
const pengumumanList = ref<Pengumuman[]>([]);
const loading = ref(false);
const error = ref(false);
const totalCount = ref(0);
const totalPages = ref(0);

const { page, pageSize, queryParams } = useTableUrlState({
  defaultPageSize: 15,
});

// Modal state
const showCreateModal = ref(false);
const saving = ref(false);
const form = reactive<PengumumanForm>({
  judul: '',
  deskripsi: '',
  mode: 'broadcast',
  siswaIds: [],
});
const formErrors = ref<Record<string, string>>({});

// Siswa search state
const siswaSearchQuery = ref('');
const siswaSearchResults = ref<SiswaOption[]>([]);
const siswaSearchLoading = ref(false);
const selectedSiswa = ref<SiswaOption[]>([]);
let siswaSearchTimer: ReturnType<typeof setTimeout> | null = null;

// Fetch pengumuman list
async function fetchPengumuman() {
  loading.value = true;
  error.value = false;
  try {
    const params = { ...queryParams.value };
    const { data } = await api.get<PengumumanListResponse>('/pengumuman', { params });
    pengumumanList.value = data.data;
    totalCount.value = data.meta.totalCount;
    totalPages.value = data.meta.totalPages;
  } catch {
    error.value = true;
    pengumumanList.value = [];
  } finally {
    loading.value = false;
  }
}

// Watch pagination changes
watch([page, pageSize], fetchPengumuman);

// Siswa search
async function searchSiswa(query: string) {
  if (!query.trim()) {
    siswaSearchResults.value = [];
    return;
  }
  siswaSearchLoading.value = true;
  try {
    const { data } = await api.get<{
      data: SiswaOption[];
    }>('/siswa', { params: { search: query, page_size: 20, status: 'aktif' } });
    // Filter out already selected
    const selectedIds = new Set(selectedSiswa.value.map((s) => s.id));
    siswaSearchResults.value = data.data.filter((s) => !selectedIds.has(s.id));
  } catch {
    siswaSearchResults.value = [];
  } finally {
    siswaSearchLoading.value = false;
  }
}

function onSiswaSearchInput() {
  if (siswaSearchTimer) clearTimeout(siswaSearchTimer);
  siswaSearchTimer = setTimeout(() => {
    searchSiswa(siswaSearchQuery.value);
  }, 300);
}

function addSiswa(siswa: SiswaOption) {
  if (selectedSiswa.value.length >= 100) {
    toast.warning('Maksimal 100 siswa yang dapat dipilih');
    return;
  }
  selectedSiswa.value.push(siswa);
  form.siswaIds.push(siswa.id);
  // Remove from search results
  siswaSearchResults.value = siswaSearchResults.value.filter((s) => s.id !== siswa.id);
  siswaSearchQuery.value = '';
  siswaSearchResults.value = [];
}

function removeSiswa(siswaId: string) {
  selectedSiswa.value = selectedSiswa.value.filter((s) => s.id !== siswaId);
  form.siswaIds = form.siswaIds.filter((id) => id !== siswaId);
}

// Form
function openCreateModal() {
  Object.assign(form, {
    judul: '',
    deskripsi: '',
    mode: 'broadcast',
    siswaIds: [],
  });
  selectedSiswa.value = [];
  siswaSearchQuery.value = '';
  siswaSearchResults.value = [];
  formErrors.value = {};
  showCreateModal.value = true;
}

function validateForm(): boolean {
  formErrors.value = {};
  if (!form.judul.trim()) {
    formErrors.value.judul = 'Judul wajib diisi';
  } else if (form.judul.trim().length > 255) {
    formErrors.value.judul = 'Judul maksimal 255 karakter';
  }
  if (!form.deskripsi.trim()) {
    formErrors.value.deskripsi = 'Deskripsi wajib diisi';
  } else if (form.deskripsi.trim().length > 5000) {
    formErrors.value.deskripsi = 'Deskripsi maksimal 5000 karakter';
  }
  if (form.mode === 'targeted' && form.siswaIds.length === 0) {
    formErrors.value.siswaIds = 'Minimal satu siswa harus dipilih';
  }
  return Object.keys(formErrors.value).length === 0;
}

async function submitPengumuman() {
  if (!validateForm()) return;
  saving.value = true;
  try {
    const payload: Record<string, unknown> = {
      judul: form.judul.trim(),
      deskripsi: form.deskripsi.trim(),
      mode: form.mode,
    };
    if (form.mode === 'targeted') {
      payload.siswa_ids = form.siswaIds;
    }
    const { data } = await api.post<{ jumlahPenerima: number }>('/pengumuman', payload);
    toast.success(`Pengumuman berhasil dikirim ke ${data.jumlahPenerima} penerima`);
    showCreateModal.value = false;
    await fetchPengumuman();
  } catch {
    // Global error interceptor handles toast
  } finally {
    saving.value = false;
  }
}

// Helpers
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const deskripsiCharCount = computed(() => form.deskripsi.length);

onMounted(fetchPengumuman);
</script>

<template>
  <div class="p-8">
    <PageHeader title="Pengumuman" description="Buat dan kirim pengumuman ke orang tua siswa.">
      <template #actions>
        <ActionButton variant="primary" size="sm" @click="openCreateModal">
          Buat Pengumuman
        </ActionButton>
      </template>
    </PageHeader>

    <!-- Card Container -->
    <div class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden">
      <!-- Section Header -->
      <div
        class="flex items-center justify-between px-6 py-5 bg-primary-50 border-b-2 border-primary-200"
      >
        <h3 class="text-[16px] font-bold text-primary-800">Daftar Pengumuman</h3>
        <span class="text-[13px] font-semibold text-text-secondary">
          {{ totalCount }} pengumuman
        </span>
      </div>

      <div class="overflow-x-auto">
        <table v-if="!loading && !error && pengumumanList.length > 0" class="w-full">
          <thead>
            <tr class="border-b-2 border-stone-200">
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Judul
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Mode
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Penerima
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Tanggal
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Status
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-200">
            <tr
              v-for="item in pengumumanList"
              :key="item.id"
              class="hover:bg-primary-50 transition-colors duration-200"
            >
              <td class="px-5 py-4 text-[15px] font-medium text-text-primary max-w-xs truncate">
                {{ item.judul }}
              </td>
              <td class="px-5 py-4">
                <span
                  :class="[
                    'inline-flex items-center px-2.5 py-1 rounded-xs text-[13px] font-semibold',
                    item.mode === 'broadcast'
                      ? 'bg-primary-50 text-primary-700'
                      : 'bg-warning-50 text-warning-700',
                  ]"
                >
                  {{ item.mode === 'broadcast' ? 'Broadcast' : 'Targeted' }}
                </span>
              </td>
              <td class="px-5 py-4 text-[15px] text-text-secondary">
                {{ item.jumlahPenerima }}
              </td>
              <td class="px-5 py-4 text-[15px] text-text-secondary">
                {{ formatDate(item.createdAt) }}
              </td>
              <td class="px-5 py-4">
                <!--
                  status 'gagal' = notifikasi HP tidak sampai (umumnya penerima belum memasang /
                  login aplikasi mobile). Pengumumannya sendiri tetap tersimpan, jadi tidak
                  ditampilkan sebagai "Gagal" merah.
                -->
                <span
                  :class="[
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-[13px] font-semibold whitespace-nowrap',
                    item.status === 'terkirim' ? 'bg-success-50 text-success-700' : '',
                    item.status === 'draft' ? 'bg-stone-100 text-text-secondary' : '',
                    item.status === 'gagal' ? 'bg-stone-100 text-stone-600' : '',
                  ]"
                  :title="
                    item.status === 'gagal'
                      ? 'Pengumuman tersimpan, tapi notifikasi belum sampai ke HP penerima karena aplikasi mobile belum dipasang / belum login.'
                      : undefined
                  "
                >
                  <svg
                    v-if="item.status === 'gagal'"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <rect x="6" y="2" width="12" height="20" rx="2" />
                    <path stroke-linecap="round" d="M11 18h2" />
                  </svg>
                  {{
                    item.status === 'terkirim'
                      ? 'Terkirim'
                      : item.status === 'draft'
                        ? 'Draft'
                        : 'Belum ada aplikasi HP'
                  }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Loading -->
        <div v-else-if="loading" class="p-12 text-center">
          <svg
            class="w-6 h-6 animate-spin text-primary-500 mx-auto"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p class="text-[15px] text-text-tertiary mt-2">Memuat data...</p>
        </div>

        <!-- Error -->
        <div v-else-if="error" class="p-12 text-center">
          <svg
            class="w-10 h-10 text-danger-400 mx-auto mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <p class="text-[15px] text-text-secondary mb-3">Gagal memuat data pengumuman.</p>
          <ActionButton variant="neutral" size="sm" @click="fetchPengumuman">
            Coba Lagi
          </ActionButton>
        </div>

        <!-- Empty -->
        <div v-else class="p-12 text-center">
          <svg
            class="w-10 h-10 text-stone-300 mx-auto mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
            />
          </svg>
          <p class="text-[15px] text-text-tertiary">Belum ada pengumuman.</p>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <TablePagination
      :current-page="page"
      :total-pages="totalPages"
      :total-count="totalCount"
      :page-size="pageSize"
      :page-size-options="[10, 15, 25, 50]"
      :loading="loading"
      @page-change="page = $event"
      @page-size-change="pageSize = $event"
    />

    <!-- Create Modal -->
    <BaseModal
      :show="showCreateModal"
      title="Buat Pengumuman"
      size="lg"
      @close="showCreateModal = false"
    >
      <form class="space-y-5" @submit.prevent="submitPengumuman">
        <!-- Judul -->
        <div>
          <label class="block text-[15px] font-semibold text-text-primary mb-2">
            Judul <span class="text-danger-500">*</span>
          </label>
          <input
            v-model="form.judul"
            type="text"
            maxlength="255"
            placeholder="Judul pengumuman..."
            class="w-full px-4 py-3 text-[15px] border-2 border-stone-200 rounded-xs bg-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
          />
          <div class="flex items-center justify-between mt-1.5">
            <p v-if="formErrors.judul" class="text-[13px] text-danger-500">
              {{ formErrors.judul }}
            </p>
            <span v-else />
            <span class="text-[13px] text-text-tertiary">{{ form.judul.length }}/255</span>
          </div>
        </div>

        <!-- Deskripsi -->
        <div>
          <label class="block text-[15px] font-semibold text-text-primary mb-2">
            Deskripsi <span class="text-danger-500">*</span>
          </label>
          <textarea
            v-model="form.deskripsi"
            rows="5"
            maxlength="5000"
            placeholder="Isi pengumuman..."
            class="w-full px-4 py-3 text-[15px] border-2 border-stone-200 rounded-xs resize-none bg-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
          />
          <div class="flex items-center justify-between mt-1.5">
            <p v-if="formErrors.deskripsi" class="text-[13px] text-danger-500">
              {{ formErrors.deskripsi }}
            </p>
            <span v-else />
            <span class="text-[13px] text-text-tertiary">{{ deskripsiCharCount }}/5000</span>
          </div>
        </div>

        <!-- Mode -->
        <div>
          <label class="block text-[15px] font-semibold text-text-primary mb-2">
            Mode Pengiriman <span class="text-danger-500">*</span>
          </label>
          <div class="flex items-center gap-5">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="form.mode"
                type="radio"
                value="broadcast"
                class="w-4 h-4 text-primary-600 border-stone-200 focus:ring-primary-500"
              />
              <span class="text-[15px] text-text-primary">Broadcast (Semua orang tua)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="form.mode"
                type="radio"
                value="targeted"
                class="w-4 h-4 text-primary-600 border-stone-200 focus:ring-primary-500"
              />
              <span class="text-[15px] text-text-primary">Targeted (Siswa tertentu)</span>
            </label>
          </div>
        </div>

        <!-- Siswa Selector (shown only for targeted) -->
        <div v-if="form.mode === 'targeted'">
          <label class="block text-[15px] font-semibold text-text-primary mb-2">
            Pilih Siswa <span class="text-danger-500">*</span>
            <span class="text-[13px] text-text-tertiary font-normal ml-1">(maks. 100)</span>
          </label>

          <!-- Search input -->
          <div class="relative">
            <svg
              class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.75"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              v-model="siswaSearchQuery"
              type="text"
              placeholder="Cari siswa berdasarkan nama atau NISN..."
              class="w-full pl-10 pr-4 py-3 text-[15px] border-2 border-stone-200 rounded-xs bg-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
              @input="onSiswaSearchInput"
            />
            <svg
              v-if="siswaSearchLoading"
              class="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary-500"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>

          <!-- Search results dropdown -->
          <div
            v-if="siswaSearchResults.length > 0"
            class="mt-1.5 border-2 border-stone-200 rounded-xs bg-white shadow-lg max-h-40 overflow-y-auto"
          >
            <button
              v-for="siswa in siswaSearchResults"
              :key="siswa.id"
              type="button"
              class="w-full text-left px-4 py-3 text-[15px] hover:bg-primary-50 transition-colors duration-200 border-b border-stone-100 last:border-b-0"
              @click="addSiswa(siswa)"
            >
              <span class="font-medium text-text-primary">{{ siswa.nama }}</span>
              <span class="text-text-tertiary ml-2 text-[13px]">{{ siswa.nisn }}</span>
              <span v-if="siswa.kelasNama" class="text-text-tertiary ml-1 text-[13px]"
                >· {{ siswa.kelasNama }}</span
              >
            </button>
          </div>

          <!-- Selected siswa tags -->
          <div v-if="selectedSiswa.length > 0" class="flex flex-wrap gap-2 mt-3">
            <span
              v-for="siswa in selectedSiswa"
              :key="siswa.id"
              class="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-primary-50 text-primary-700 rounded-xs text-[13px] font-semibold"
            >
              {{ siswa.nama }}
              <button
                type="button"
                class="p-0.5 rounded hover:bg-primary-100 transition-colors duration-200"
                @click="removeSiswa(siswa.id)"
              >
                <svg
                  class="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          </div>
          <p class="text-[13px] text-text-tertiary mt-1.5">
            {{ selectedSiswa.length }}/100 siswa dipilih
          </p>
          <p v-if="formErrors.siswaIds" class="text-[13px] text-danger-500 mt-1">
            {{ formErrors.siswaIds }}
          </p>
        </div>
      </form>

      <template #footer>
        <ActionButton variant="neutral" size="sm" @click="showCreateModal = false">
          Batal
        </ActionButton>
        <ActionButton variant="primary" size="sm" :disabled="saving" @click="submitPengumuman">
          {{ saving ? 'Mengirim...' : 'Kirim Pengumuman' }}
        </ActionButton>
      </template>
    </BaseModal>
  </div>
</template>
