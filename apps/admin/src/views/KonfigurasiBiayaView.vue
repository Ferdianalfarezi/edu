<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { api } from '@/api/client';
import { PageHeader, BaseModal, SearchSelect, ActionButton } from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import { useToast } from '@/composables/useToast';

// ===== Types =====
type KonfigBiayaType = 'per_kelas' | 'per_siswa';

interface KonfigBiaya {
  id: string;
  type: KonfigBiayaType;
  kelasId: string | null;
  kelasNama: string | null;
  siswaId: string | null;
  siswaNama: string | null;
  nominal: number;
  createdAt: string;
}

interface Kelas {
  id: string;
  nama: string;
}

interface Siswa {
  id: string;
  nama: string;
  nisn: string | null;
}

// ===== State =====
const toast = useToast();
const loading = ref(false);
const saving = ref(false);
const deletingId = ref<string | null>(null);

const konfigList = ref<KonfigBiaya[]>([]);
const kelasList = ref<Kelas[]>([]);
const siswaList = ref<Siswa[]>([]);

// Form modal
const showFormModal = ref(false);

const form = reactive({
  type: 'per_kelas' as KonfigBiayaType,
  kelasId: '' as string,
  siswaId: '' as string,
  nominal: '' as string | number,
});

const formErrors = reactive({
  type: '',
  kelasId: '',
  siswaId: '',
  nominal: '',
});

// Delete confirmation
const showDeleteModal = ref(false);
const deletingItem = ref<KonfigBiaya | null>(null);

// ===== Options =====
const kelasOptions = computed<SelectOption[]>(() =>
  kelasList.value.map((k) => ({ value: k.id, label: k.nama })),
);

const siswaOptions = computed<SelectOption[]>(() =>
  siswaList.value.map((s) => ({
    value: s.id,
    label: s.nisn ? `${s.nama} (${s.nisn})` : s.nama,
  })),
);

// ===== Helpers =====
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

function getTypeLabel(type: KonfigBiayaType): string {
  return type === 'per_kelas' ? 'Per Kelas' : 'Per Siswa';
}

function getTargetLabel(item: KonfigBiaya): string {
  if (item.type === 'per_kelas') return item.kelasNama ?? item.kelasId ?? '-';
  return item.siswaNama ?? item.siswaId ?? '-';
}

// ===== Validation =====
function validateNominal(value: string | number): string {
  const num = typeof value === 'string' ? parseInt(value, 10) : value;
  if (value === '' || value === null || value === undefined) {
    return 'Nominal wajib diisi.';
  }
  if (!Number.isInteger(num) || String(value).includes('.')) {
    return 'Nominal harus berupa angka bulat antara 1 dan 999.999.999.';
  }
  if (num < 1 || num > 999_999_999) {
    return 'Nominal harus berupa angka bulat antara 1 dan 999.999.999.';
  }
  return '';
}

function validateForm(): boolean {
  formErrors.type = '';
  formErrors.kelasId = '';
  formErrors.siswaId = '';
  formErrors.nominal = '';

  let valid = true;

  if (form.type === 'per_kelas' && !form.kelasId) {
    formErrors.kelasId = 'Kelas wajib dipilih.';
    valid = false;
  }

  if (form.type === 'per_siswa' && !form.siswaId) {
    formErrors.siswaId = 'Siswa wajib dipilih.';
    valid = false;
  }

  const nominalError = validateNominal(form.nominal);
  if (nominalError) {
    formErrors.nominal = nominalError;
    valid = false;
  }

  return valid;
}

// ===== API =====
async function fetchKonfigurasi() {
  loading.value = true;
  try {
    const { data } = await api.get<KonfigBiaya[]>('/konfigurasi-biaya');
    konfigList.value = data;
  } catch (error) {
    console.error('Failed to fetch konfigurasi biaya:', error);
    toast.error('Gagal memuat konfigurasi biaya');
  } finally {
    loading.value = false;
  }
}

async function fetchKelas() {
  try {
    const { data } = await api.get<{ data: Kelas[] }>('/kelas');
    kelasList.value = data.data;
  } catch (error) {
    console.error('Failed to fetch kelas:', error);
  }
}

async function fetchSiswa() {
  try {
    const { data } = await api.get<{ data: Siswa[] }>('/siswa', {
      params: { page_size: 1000 },
    });
    siswaList.value = data.data;
  } catch (error) {
    console.error('Failed to fetch siswa:', error);
  }
}

function openFormModal() {
  form.type = 'per_kelas';
  form.kelasId = '';
  form.siswaId = '';
  form.nominal = '';
  formErrors.type = '';
  formErrors.kelasId = '';
  formErrors.siswaId = '';
  formErrors.nominal = '';
  showFormModal.value = true;
}

async function saveKonfigurasi() {
  if (!validateForm()) return;

  saving.value = true;
  try {
    const payload: Record<string, unknown> = {
      type: form.type,
      nominal: parseInt(String(form.nominal), 10),
    };
    if (form.type === 'per_kelas') {
      payload.kelasId = form.kelasId;
    } else {
      payload.siswaId = form.siswaId;
    }

    await api.post('/konfigurasi-biaya', payload);
    showFormModal.value = false;
    toast.success('Konfigurasi biaya berhasil disimpan.');
    await fetchKonfigurasi();
  } catch (error) {
    const message = error?.response?.data?.message;
    toast.error(message || 'Gagal menyimpan konfigurasi biaya');
  } finally {
    saving.value = false;
  }
}

function openDeleteConfirm(item: KonfigBiaya) {
  deletingItem.value = item;
  showDeleteModal.value = true;
}

async function confirmDelete() {
  if (!deletingItem.value) return;
  deletingId.value = deletingItem.value.id;
  try {
    await api.delete(`/konfigurasi-biaya/${deletingItem.value.id}`);
    showDeleteModal.value = false;
    toast.success('Override berhasil dihapus.');
    await fetchKonfigurasi();
  } catch (error) {
    toast.error(error?.response?.data?.message || 'Gagal menghapus override');
  } finally {
    deletingId.value = null;
    deletingItem.value = null;
  }
}

// Reset target field when type changes
watch(
  () => form.type,
  () => {
    form.kelasId = '';
    form.siswaId = '';
    formErrors.kelasId = '';
    formErrors.siswaId = '';
  },
);

// ===== Init =====
onMounted(() => {
  fetchKonfigurasi();
  fetchKelas();
  fetchSiswa();
});
</script>

<template>
  <div class="p-8 max-w-7xl mx-auto">
    <PageHeader
      title="Konfigurasi Biaya Sekolah"
      description="Atur nominal biaya SPP per siswa atau per kelas. Override ini menggantikan nominal global pada saat generate tagihan."
    >
      <template #actions>
        <ActionButton variant="primary" @click="openFormModal">Tambah Override</ActionButton>
      </template>
    </PageHeader>

    <!-- Info box -->
    <div class="mb-6 p-4 bg-primary-50 border-2 border-primary-200 rounded-[12px]">
      <p class="text-[14px] text-primary-800 font-medium">
        Prioritas nominal: <strong>Per Siswa</strong> &gt; <strong>Per Kelas</strong> &gt;
        <strong>Nominal Global</strong>. Override per siswa selalu menang atas override per kelas
        maupun nominal global.
      </p>
    </div>

    <!-- Table Card -->
    <div class="bg-white rounded-[16px] border-2 border-stone-200 shadow-xs overflow-hidden">
      <div
        class="bg-primary-50 px-6 py-5 border-b-2 border-primary-200 flex items-center justify-between"
      >
        <h3 class="text-[16px] font-bold text-primary-800">Daftar Override Biaya</h3>
        <span class="text-[13px] font-semibold text-stone-500">{{ konfigList.length }} data</span>
      </div>

      <div class="overflow-x-auto">
        <table v-if="!loading && konfigList.length > 0" class="w-full">
          <thead class="border-b-2 border-stone-200">
            <tr>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Tipe
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Target (Kelas / Siswa)
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Nominal
              </th>
              <th
                class="px-5 py-4 text-left font-bold text-text-secondary text-[13px] uppercase tracking-[0.04em] bg-surface-warm"
              >
                Aksi
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-200">
            <tr
              v-for="item in konfigList"
              :key="item.id"
              class="hover:bg-primary-50 transition-colors"
            >
              <td class="px-5 py-4">
                <span
                  :class="[
                    'inline-flex items-center px-2.5 py-1 rounded-md text-[13px] font-semibold',
                    item.type === 'per_kelas'
                      ? 'bg-primary-50 text-primary-700'
                      : 'bg-warning-50 text-warning-700',
                  ]"
                >
                  {{ getTypeLabel(item.type) }}
                </span>
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-800 font-medium">
                {{ getTargetLabel(item) }}
              </td>
              <td class="px-5 py-4 text-[15px] text-stone-800 font-semibold tabular-nums">
                {{ formatCurrency(item.nominal) }}
              </td>
              <td class="px-5 py-4">
                <ActionButton
                  variant="danger"
                  icon="delete"
                  :disabled="deletingId === item.id"
                  @click="openDeleteConfirm(item)"
                >
                  {{ deletingId === item.id ? 'Menghapus...' : 'Hapus' }}
                </ActionButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Loading state -->
      <div v-if="loading" class="py-12 text-center">
        <svg class="w-7 h-7 animate-spin text-primary-500 mx-auto" fill="none" viewBox="0 0 24 24">
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
        <p class="mt-3 text-[15px] text-text-secondary">Memuat data...</p>
      </div>

      <!-- Empty state -->
      <p
        v-else-if="konfigList.length === 0 && !loading"
        class="text-center text-[15px] text-stone-500 py-12"
      >
        Belum ada override biaya. Klik "Tambah Override" untuk membuat konfigurasi baru.
      </p>
    </div>

    <!-- Form Modal: Tambah Override -->
    <BaseModal
      :show="showFormModal"
      title="Tambah Override Biaya"
      size="lg"
      @close="showFormModal = false"
    >
      <div class="space-y-5">
        <!-- Type radio -->
        <div>
          <label class="block text-[15px] font-semibold text-stone-800 mb-2">
            Tipe Override <span class="text-danger-500">*</span>
          </label>
          <div class="flex gap-6">
            <label class="flex items-center gap-2 text-[15px] cursor-pointer">
              <input v-model="form.type" type="radio" value="per_kelas" class="text-primary-600" />
              Per Kelas
            </label>
            <label class="flex items-center gap-2 text-[15px] cursor-pointer">
              <input v-model="form.type" type="radio" value="per_siswa" class="text-primary-600" />
              Per Siswa
            </label>
          </div>
          <p v-if="formErrors.type" class="mt-1 text-[13px] text-danger-500">
            {{ formErrors.type }}
          </p>
        </div>

        <!-- Kelas picker (shown when type = per_kelas) -->
        <div v-if="form.type === 'per_kelas'">
          <SearchSelect
            v-model="form.kelasId"
            label="Kelas"
            :options="kelasOptions"
            placeholder="Pilih kelas..."
            :required="true"
            :error="!!formErrors.kelasId"
            :error-message="formErrors.kelasId"
            empty-text="Tidak ada kelas ditemukan"
          />
        </div>

        <!-- Siswa picker (shown when type = per_siswa) -->
        <div v-if="form.type === 'per_siswa'">
          <SearchSelect
            v-model="form.siswaId"
            label="Siswa"
            :options="siswaOptions"
            placeholder="Cari nama siswa..."
            :required="true"
            :error="!!formErrors.siswaId"
            :error-message="formErrors.siswaId"
            empty-text="Tidak ada siswa ditemukan"
          />
        </div>

        <!-- Nominal input -->
        <div>
          <label class="block text-[15px] font-semibold text-stone-800 mb-1.5">
            Nominal (Rp) <span class="text-danger-500">*</span>
          </label>
          <input
            v-model="form.nominal"
            type="number"
            min="1"
            max="999999999"
            step="1"
            placeholder="Contoh: 500000"
            :class="[
              'w-full px-3 py-2.5 text-[15px] border-2 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500',
              formErrors.nominal ? 'border-danger-500 focus:border-danger-500' : 'border-stone-200',
            ]"
            @input="formErrors.nominal = ''"
            @blur="formErrors.nominal = validateNominal(form.nominal)"
          />
          <p v-if="formErrors.nominal" class="mt-1 text-[13px] text-danger-500">
            {{ formErrors.nominal }}
          </p>
          <p v-else class="mt-1 text-[13px] text-stone-400">
            Masukkan angka bulat antara 1 dan 999.999.999.
          </p>
        </div>
      </div>

      <template #footer>
        <ActionButton variant="neutral" @click="showFormModal = false">Batal</ActionButton>
        <ActionButton variant="primary" :disabled="saving" @click="saveKonfigurasi">
          {{ saving ? 'Menyimpan...' : 'Simpan' }}
        </ActionButton>
      </template>
    </BaseModal>

    <!-- Delete Confirmation Modal -->
    <BaseModal
      :show="showDeleteModal"
      title="Hapus Override Biaya"
      size="lg"
      @close="showDeleteModal = false"
    >
      <p class="text-[15px] text-stone-600">
        Apakah Anda yakin ingin menghapus override
        <strong class="text-stone-800">{{
          getTypeLabel(deletingItem?.type ?? 'per_kelas')
        }}</strong>
        untuk
        <strong class="text-stone-800">{{
          deletingItem ? getTargetLabel(deletingItem) : ''
        }}</strong>
        dengan nominal
        <strong class="text-stone-800">{{
          deletingItem ? formatCurrency(deletingItem.nominal) : ''
        }}</strong
        >?
      </p>
      <p
        class="mt-2 text-[14px] text-warning-700 bg-warning-50 border border-warning-200 rounded-md px-3 py-2"
      >
        Setelah dihapus, siswa atau kelas terkait akan kembali menggunakan nominal dari level
        hierarki di bawahnya (per kelas atau global).
      </p>
      <template #footer>
        <ActionButton variant="neutral" @click="showDeleteModal = false">Batal</ActionButton>
        <ActionButton variant="danger" :disabled="!!deletingId" @click="confirmDelete">
          {{ deletingId ? 'Menghapus...' : 'Hapus' }}
        </ActionButton>
      </template>
    </BaseModal>
  </div>
</template>
