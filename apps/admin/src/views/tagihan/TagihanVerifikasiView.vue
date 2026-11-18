<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';
import { BaseModal, ActionButton } from '@/components/ui';
import { useToast } from '@/composables/useToast';

const toast = useToast();

// ===== Types =====
type StatusTransaksi = 'menunggu_verifikasi' | 'diterima' | 'ditolak';

interface TransaksiVerifikasi {
  id: string;
  tagihanId: string;
  siswaNama: string;
  kelasNama: string;
  bulan: number;
  tahun: number;
  nominalTagihan: number;
  jumlahBayar: number;
  buktiTransferUrl: string | null;
  metode: string;
  status: StatusTransaksi;
  uploadedByNama: string;
  createdAt: string;
}

// ===== State =====
const verifikasiList = ref<TransaksiVerifikasi[]>([]);
const verifikasiLoading = ref(false);
const showBuktiModal = ref(false);
const selectedTransaksi = ref<TransaksiVerifikasi | null>(null);
const rejectReason = ref('');
const verifyingId = ref<string | null>(null);
const showLightbox = ref(false);

// ===== Helpers =====
const bulanOptions = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

function getBulanLabel(bulan: number): string {
  return bulanOptions.find((b) => b.value === bulan)?.label || String(bulan);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

// ===== API Calls =====
async function fetchVerifikasi() {
  verifikasiLoading.value = true;
  try {
    const { data } = await api.get<{ data: TransaksiVerifikasi[] }>('/tagihan/verifikasi');
    verifikasiList.value = data.data;
  } catch (error) {
    console.error('Failed to fetch verifikasi:', error);
  } finally {
    verifikasiLoading.value = false;
  }
}

function openBuktiPreview(transaksi: TransaksiVerifikasi) {
  selectedTransaksi.value = transaksi;
  rejectReason.value = '';
  showBuktiModal.value = true;
}

async function verifyTransaksi(action: 'approve' | 'reject') {
  if (!selectedTransaksi.value) return;
  if (action === 'reject' && !rejectReason.value.trim()) {
    toast.warning('Alasan penolakan wajib diisi');
    return;
  }

  verifyingId.value = selectedTransaksi.value.id;
  try {
    const { data } = await api.patch(`/tagihan/${selectedTransaksi.value.tagihanId}/verify`, {
      action,
      alasan_penolakan: action === 'reject' ? rejectReason.value.trim() : undefined,
    });
    showBuktiModal.value = false;
    toast.success(
      data.message || (action === 'approve' ? 'Pembayaran disetujui' : 'Pembayaran ditolak'),
    );
    await fetchVerifikasi();
  } catch (error) {
    // Toast error sudah ditampilkan otomatis oleh api client
  } finally {
    verifyingId.value = null;
  }
}

// ===== Init =====
onMounted(() => {
  fetchVerifikasi();
});
</script>

<template>
  <div class="p-8">
    <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
      <div class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200">
        <h2 class="text-[16px] font-bold text-primary-800">Antrian Verifikasi Pembayaran</h2>
        <p class="text-[13px] text-stone-500 mt-1">
          Bukti transfer yang menunggu verifikasi dari bendahara.
        </p>
      </div>

      <div class="overflow-x-auto">
        <table v-if="!verifikasiLoading && verifikasiList.length > 0" class="w-full">
          <thead>
            <tr class="border-b-2 border-stone-200">
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Siswa
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Kelas
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Tagihan
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Nominal Bayar
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Pengirim
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Tanggal Upload
              </th>
              <th
                class="text-left px-5 py-4 text-[13px] font-bold uppercase tracking-[0.04em] text-text-secondary bg-surface-warm"
              >
                Aksi
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-100">
            <tr
              v-for="tx in verifikasiList"
              :key="tx.id"
              class="hover:bg-primary-50 transition-colors duration-200"
            >
              <td class="px-5 py-4 text-[15px] text-stone-800 font-medium">
                {{ tx.siswaNama }}
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-600">{{ tx.kelasNama }}</td>
              <td class="px-5 py-4 text-[15px] text-stone-600">
                {{ getBulanLabel(tx.bulan) }} {{ tx.tahun }}
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-800 font-medium">
                {{ formatCurrency(tx.jumlahBayar) }}
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-600">{{ tx.uploadedByNama }}</td>
              <td class="px-5 py-4 text-[15px] text-stone-600">
                {{ formatDate(tx.createdAt) }}
              </td>
              <td class="px-5 py-4">
                <ActionButton variant="primary" icon="view" @click="openBuktiPreview(tx)"
                  >Lihat Bukti</ActionButton
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="verifikasiLoading" class="text-center text-stone-500 text-[15px] py-8">
        Memuat data...
      </p>
      <p
        v-else-if="verifikasiList.length === 0 && !verifikasiLoading"
        class="text-center text-stone-500 text-[15px] py-8"
      >
        Tidak ada bukti yang menunggu verifikasi.
      </p>
    </div>

    <!-- ===== Bukti Transfer Preview Modal ===== -->
    <BaseModal
      :show="showBuktiModal"
      title="Verifikasi Bukti Transfer"
      size="lg"
      @close="showBuktiModal = false"
    >
      <div v-if="selectedTransaksi">
        <div class="grid grid-cols-2 gap-3 text-[15px] mb-5">
          <div>
            <strong class="text-stone-800">Siswa:</strong>
            <span class="text-stone-600">{{ selectedTransaksi.siswaNama }}</span>
          </div>
          <div>
            <strong class="text-stone-800">Kelas:</strong>
            <span class="text-stone-600">{{ selectedTransaksi.kelasNama }}</span>
          </div>
          <div>
            <strong class="text-stone-800">Tagihan:</strong>
            <span class="text-stone-600"
              >{{ getBulanLabel(selectedTransaksi.bulan) }} {{ selectedTransaksi.tahun }}</span
            >
          </div>
          <div>
            <strong class="text-stone-800">Nominal Tagihan:</strong>
            <span class="text-stone-600">{{
              formatCurrency(selectedTransaksi.nominalTagihan)
            }}</span>
          </div>
          <div>
            <strong class="text-stone-800">Nominal Bayar:</strong>
            <span class="text-stone-600">{{ formatCurrency(selectedTransaksi.jumlahBayar) }}</span>
          </div>
          <div>
            <strong class="text-stone-800">Pengirim:</strong>
            <span class="text-stone-600">{{ selectedTransaksi.uploadedByNama }}</span>
          </div>
        </div>

        <div v-if="selectedTransaksi.buktiTransferUrl" class="my-5 text-center">
          <img
            :src="selectedTransaksi.buktiTransferUrl"
            alt="Bukti Transfer"
            class="max-w-full max-h-[400px] rounded-[12px] border-2 border-stone-200 mx-auto cursor-zoom-in hover:opacity-90 transition-opacity"
            @click="showLightbox = true"
          />
          <p class="text-[13px] text-stone-500 mt-2">Klik gambar untuk memperbesar</p>
        </div>
        <p v-else class="text-center text-stone-500 text-[15px] py-4">
          Tidak ada bukti transfer tersedia.
        </p>

        <div class="mt-5">
          <label class="block text-[15px] font-semibold text-stone-800 mb-2"
            >Alasan Penolakan (wajib jika ditolak)</label
          >
          <textarea
            v-model="rejectReason"
            class="w-full px-4 py-3 text-[15px] border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 min-h-[60px] resize-y"
            placeholder="Alasan penolakan..."
          />
        </div>
      </div>
      <template #footer>
        <ActionButton variant="neutral" @click="showBuktiModal = false"> Tutup </ActionButton>
        <ActionButton variant="danger" :disabled="!!verifyingId" @click="verifyTransaksi('reject')">
          Tolak
        </ActionButton>
        <ActionButton
          variant="primary"
          :disabled="!!verifyingId"
          @click="verifyTransaksi('approve')"
        >
          Setujui
        </ActionButton>
      </template>
    </BaseModal>

    <!-- ===== Lightbox for Bukti Transfer ===== -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="showLightbox && selectedTransaksi?.buktiTransferUrl"
          class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
          @click="showLightbox = false"
        >
          <button
            class="absolute top-4 right-4 text-white/80 hover:text-white text-3xl font-light leading-none w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            @click.stop="showLightbox = false"
          >
            ×
          </button>
          <img
            :src="selectedTransaksi.buktiTransferUrl"
            alt="Bukti Transfer"
            class="max-w-[90vw] max-h-[90vh] object-contain rounded-[16px] shadow-2xl"
            @click.stop
          />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
