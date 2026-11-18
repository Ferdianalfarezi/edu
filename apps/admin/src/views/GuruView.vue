<script setup lang="ts">
/**
 * Daftar Guru + kelengkapan data guru.
 * Akun guru dibuat di Pengaturan -> Pengguna (sama seperti role lain);
 * data tambahan (telepon, NUPTK/NIP, tanggal lahir, pendidikan, kampus, alamat)
 * dilengkapi di sini. Baris yang datanya belum lengkap ditandai.
 */
import { ref, computed, onMounted } from 'vue';
import { Role } from '@edu/shared';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores';
import { useToast } from '@/composables/useToast';
import { ActionButton } from '@/components/ui';
import ProfilGuruModal from '@/components/guru/ProfilGuruModal.vue';
import { dataKurang, type ProfilGuru } from '@/utils/kelengkapan-guru';

// --- Types ---
type GuruItem = ProfilGuru;

const authStore = useAuthStore();
const toast = useToast();
const bisaEdit = computed(() => authStore.hasRole(Role.ADMIN));

// --- State ---
const loading = ref(true);
const error = ref<string | null>(null);
const guruList = ref<GuruItem[]>([]);
const filter = ref<'semua' | 'belum'>('semua');

const jumlahBelumLengkap = computed(
  () => guruList.value.filter((g) => dataKurang(g).length > 0).length,
);

const guruTampil = computed(() =>
  filter.value === 'belum'
    ? guruList.value.filter((g) => dataKurang(g).length > 0)
    : guruList.value,
);

function formatTanggal(t: string | null): string {
  if (!t) return '-';
  return new Date(`${t}T00:00:00`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function pendidikanLabel(g: GuruItem): string {
  if (!g.pendidikanTerakhir) return '-';
  return g.kampus ? `${g.pendidikanTerakhir} · ${g.kampus}` : g.pendidikanTerakhir;
}

// --- Modal lengkapi / edit ---
const showModal = ref(false);
const editing = ref<GuruItem | null>(null);

function openModal(g: GuruItem) {
  editing.value = g;
  showModal.value = true;
}

async function onSaved() {
  showModal.value = false;
  toast.success(`Data ${editing.value?.nama ?? 'guru'} disimpan.`);
  await fetchGuru();
}

// --- API ---
async function fetchGuru() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<{ data: GuruItem[] }>('/users', { params: { role: 'guru' } });
    guruList.value = data.data;
  } catch {
    error.value = 'Gagal memuat data guru. Silakan coba lagi.';
  } finally {
    loading.value = false;
  }
}

onMounted(fetchGuru);
</script>

<template>
  <div class="p-8 max-w-screen-2xl mx-auto">
    <!-- Page Header -->
    <div class="mb-6">
      <h1 class="text-[22px] font-bold text-text-primary">Daftar Guru</h1>
      <p class="text-[14px] text-text-secondary mt-1">
        Seluruh guru aktif di sekolah ini. Akun guru ditambahkan di Pengaturan → Pengguna.
      </p>
    </div>

    <!-- Loading State -->
    <div
      v-if="loading"
      class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs overflow-hidden"
    >
      <div class="px-6 py-5 bg-primary-50 border-b-2 border-primary-200">
        <div class="animate-pulse h-5 bg-primary-100 rounded w-36"></div>
      </div>
      <div class="p-6 space-y-3">
        <div v-for="n in 5" :key="n" class="animate-pulse h-10 bg-surface-100 rounded"></div>
      </div>
    </div>

    <!-- Error State -->
    <div
      v-else-if="error"
      class="bg-white border-2 border-stone-200 rounded-[16px] shadow-xs p-12 text-center"
    >
      <p class="text-[15px] text-text-secondary mb-4">{{ error }}</p>
      <button
        class="px-4.5 py-2.5 text-[14px] font-semibold text-white bg-primary-600 rounded-xs"
        @click="fetchGuru"
      >
        Coba Lagi
      </button>
    </div>

    <template v-else>
      <!-- Ringkasan kelengkapan -->
      <div
        v-if="guruList.length > 0"
        class="flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-3 rounded-xl border-2"
        :class="
          jumlahBelumLengkap > 0
            ? 'bg-warning-50 border-warning-100'
            : 'bg-success-50 border-success-100'
        "
      >
        <p
          class="text-[14px] font-semibold"
          :class="jumlahBelumLengkap > 0 ? 'text-warning-700' : 'text-success-700'"
        >
          <template v-if="jumlahBelumLengkap > 0">
            {{ jumlahBelumLengkap }} dari {{ guruList.length }} guru datanya belum lengkap
          </template>
          <template v-else>Data semua guru sudah lengkap</template>
        </p>
        <div v-if="jumlahBelumLengkap > 0" class="inline-flex rounded-lg bg-white/70 p-1">
          <button
            v-for="f in [
              { id: 'semua', label: 'Semua' },
              { id: 'belum', label: 'Belum lengkap' },
            ] as const"
            :key="f.id"
            type="button"
            class="px-3 py-1 rounded-md text-[13px] font-semibold transition-colors"
            :class="
              filter === f.id
                ? 'bg-white text-text-primary shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            "
            @click="filter = f.id"
          >
            {{ f.label }}
          </button>
        </div>
      </div>

      <!-- Tabel -->
      <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
        <div
          class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200 flex items-center justify-between"
        >
          <h3 class="text-[16px] font-bold text-primary-800">Daftar Guru</h3>
          <span class="text-[13px] font-semibold text-stone-500">{{ guruList.length }} guru</span>
        </div>

        <div v-if="guruTampil.length > 0" class="overflow-x-auto">
          <table class="w-full">
            <thead class="border-b-2 border-stone-200">
              <tr
                class="text-left text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                <th class="px-4 py-3.5 font-bold">No</th>
                <th class="px-4 py-3.5 font-bold">Nama</th>
                <th class="px-4 py-3.5 font-bold">Telepon</th>
                <th class="px-4 py-3.5 font-bold">NUPTK / NIP</th>
                <th class="px-4 py-3.5 font-bold">Tgl lahir</th>
                <th class="px-4 py-3.5 font-bold">Pendidikan</th>
                <th class="px-4 py-3.5 font-bold">Alamat</th>
                <th class="px-4 py-3.5 font-bold">Status</th>
                <th v-if="bisaEdit" class="px-4 py-3.5 font-bold">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-200">
              <tr
                v-for="(guru, index) in guruTampil"
                :key="guru.id"
                class="transition-colors"
                :class="
                  dataKurang(guru).length > 0
                    ? 'bg-warning-50 hover:bg-warning-100/60'
                    : 'hover:bg-primary-50'
                "
              >
                <td class="px-4 py-3.5 text-[15px] text-stone-400 tabular-nums w-12">
                  {{ index + 1 }}
                </td>
                <td class="px-4 py-3.5 min-w-52">
                  <p class="text-[15px] text-stone-800 font-medium">{{ guru.nama }}</p>
                  <p class="text-[13px] text-stone-500">{{ guru.email }}</p>
                  <p v-if="dataKurang(guru).length > 0" class="text-[12px] text-warning-700 mt-1">
                    Kurang: {{ dataKurang(guru).join(', ') }}
                  </p>
                </td>
                <td class="px-4 py-3.5 text-[14px] text-stone-600 font-mono whitespace-nowrap">
                  {{ guru.telepon ?? '-' }}
                </td>
                <td class="px-4 py-3.5 text-[14px] text-stone-600 font-mono">
                  {{ guru.nomorInduk ?? '-' }}
                </td>
                <td class="px-4 py-3.5 text-[14px] text-stone-600 whitespace-nowrap">
                  {{ formatTanggal(guru.tanggalLahir) }}
                </td>
                <td class="px-4 py-3.5 text-[14px] text-stone-600">{{ pendidikanLabel(guru) }}</td>
                <td class="px-4 py-3.5 text-[14px] text-stone-600 max-w-48">
                  <p class="truncate" :title="guru.alamat ?? ''">{{ guru.alamat ?? '-' }}</p>
                </td>
                <td class="px-4 py-3.5 whitespace-nowrap">
                  <span
                    v-if="dataKurang(guru).length === 0"
                    class="inline-flex items-center px-2.5 py-1 rounded-md text-[12px] font-semibold bg-success-50 text-success-700"
                    >Lengkap</span
                  >
                  <span
                    v-else
                    class="inline-flex items-center px-2.5 py-1 rounded-md text-[12px] font-semibold bg-warning-100 text-warning-700"
                    >Belum lengkap</span
                  >
                </td>
                <td v-if="bisaEdit" class="px-4 py-3.5 whitespace-nowrap">
                  <ActionButton
                    :variant="dataKurang(guru).length > 0 ? 'primary' : 'warning'"
                    icon="edit"
                    @click="openModal(guru)"
                    >{{ dataKurang(guru).length > 0 ? 'Lengkapi' : 'Edit' }}</ActionButton
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="py-12 text-center">
          <p class="text-[15px] text-stone-500">
            {{ guruList.length === 0 ? 'Belum ada guru aktif.' : 'Semua data guru sudah lengkap.' }}
          </p>
        </div>
      </div>
    </template>

    <!-- Modal lengkapi / edit data guru -->
    <ProfilGuruModal
      :show="showModal"
      :title="`Data Guru · ${editing?.nama ?? ''}`"
      :profil="editing"
      :endpoint="`/users/${editing?.id}/profil-guru`"
      keterangan="Nama dan email diubah di Pengaturan → Pengguna."
      @close="showModal = false"
      @saved="onSaved"
    />
  </div>
</template>
