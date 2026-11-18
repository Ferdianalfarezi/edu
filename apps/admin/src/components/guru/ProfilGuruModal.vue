<script setup lang="ts">
/**
 * Form data diri guru. Dipakai admin (halaman Guru) dan guru sendiri (modal profil).
 * Kolom wajib yang masih kosong ditandai supaya mudah dikenali.
 */
import { reactive, ref, computed, watch } from 'vue';
import { api } from '@/api/client';
import { BaseModal, ActionButton } from '@/components/ui';
import {
  PENDIDIKAN,
  fieldKurang,
  type FieldWajib,
  type ProfilGuru,
} from '@/utils/kelengkapan-guru';
import { getApiErrorMessage } from '@/utils/error';

const props = defineProps<{
  show: boolean;
  title: string;
  profil: ProfilGuru | null;
  /** endpoint PATCH, mis. /users/me/profil-guru atau /users/:id/profil-guru */
  endpoint: string;
  /** teks pengantar di atas form */
  keterangan?: string;
}>();

const emit = defineEmits<{
  close: [];
  saved: [profil: ProfilGuru];
}>();

const form = reactive({
  telepon: '',
  nomorInduk: '',
  tanggalLahir: '',
  pendidikanTerakhir: '',
  kampus: '',
  alamat: '',
});
const saving = ref(false);
const formError = ref('');

watch(
  () => props.show,
  (buka) => {
    if (!buka) return;
    const p = props.profil;
    form.telepon = p?.telepon ?? '';
    form.nomorInduk = p?.nomorInduk ?? '';
    form.tanggalLahir = p?.tanggalLahir ?? '';
    form.pendidikanTerakhir = p?.pendidikanTerakhir ?? '';
    form.kampus = p?.kampus ?? '';
    form.alamat = p?.alamat ?? '';
    formError.value = '';
  },
  { immediate: true },
);

const butuhKampus = computed(() => form.pendidikanTerakhir !== 'SMA/SMK');
const kurang = computed(() => new Set(fieldKurang(form)));

const INPUT =
  'w-full px-3 py-2.5 text-[15px] border-2 rounded-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500';
function inputClass(f: FieldWajib) {
  return [INPUT, kurang.value.has(f) ? 'border-warning-500 bg-warning-50' : 'border-stone-200'];
}

async function simpan() {
  saving.value = true;
  formError.value = '';
  try {
    const { data } = await api.patch<ProfilGuru>(props.endpoint, {
      ...form,
      kampus: butuhKampus.value ? form.kampus : '',
    });
    emit('saved', data);
  } catch (err) {
    formError.value = getApiErrorMessage(err, 'Gagal menyimpan data.');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BaseModal :show="show" :title="title" @close="emit('close')">
    <form id="form-profil-guru" class="space-y-4" @submit.prevent="simpan">
      <p v-if="keterangan" class="text-[13px] text-text-secondary">{{ keterangan }}</p>

      <div
        v-if="kurang.size > 0"
        class="flex items-start gap-2 p-3 rounded-lg bg-warning-50 border border-warning-100 text-[13px] text-warning-700"
      >
        <span class="mt-1 w-2 h-2 rounded-full bg-warning-500 shrink-0" />
        <span
          >Masih ada {{ kurang.size }} kolom wajib yang kosong (ditandai kuning). Kolom bertanda
          <span class="text-danger-500">*</span> wajib diisi.</span
        >
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-[14px] font-medium text-stone-800 mb-1.5"
            >Telepon <span class="text-danger-500">*</span></label
          >
          <input
            v-model="form.telepon"
            type="tel"
            maxlength="20"
            placeholder="081234567890"
            :class="inputClass('telepon')"
          />
        </div>
        <div>
          <label class="block text-[14px] font-medium text-stone-800 mb-1.5">NUPTK / NIP</label>
          <input
            v-model="form.nomorInduk"
            type="text"
            maxlength="30"
            placeholder="Opsional"
            :class="[INPUT, 'border-stone-200']"
          />
        </div>
        <div>
          <label class="block text-[14px] font-medium text-stone-800 mb-1.5"
            >Tanggal lahir <span class="text-danger-500">*</span></label
          >
          <input v-model="form.tanggalLahir" type="date" :class="inputClass('tanggalLahir')" />
        </div>
        <div>
          <label class="block text-[14px] font-medium text-stone-800 mb-1.5"
            >Pendidikan terakhir <span class="text-danger-500">*</span></label
          >
          <select v-model="form.pendidikanTerakhir" :class="inputClass('pendidikanTerakhir')">
            <option value="">Pilih</option>
            <option v-for="p in PENDIDIKAN" :key="p" :value="p">{{ p }}</option>
          </select>
        </div>
        <div v-if="butuhKampus" class="sm:col-span-2">
          <label class="block text-[14px] font-medium text-stone-800 mb-1.5"
            >Kampus <span class="text-danger-500">*</span></label
          >
          <input
            v-model="form.kampus"
            type="text"
            maxlength="255"
            placeholder="Universitas Negeri Yogyakarta"
            :class="inputClass('kampus')"
          />
        </div>
        <div class="sm:col-span-2">
          <label class="block text-[14px] font-medium text-stone-800 mb-1.5"
            >Alamat <span class="text-danger-500">*</span></label
          >
          <textarea v-model="form.alamat" rows="2" maxlength="1000" :class="inputClass('alamat')" />
        </div>
      </div>
      <p v-if="formError" class="text-[13px] text-danger-500">{{ formError }}</p>
    </form>
    <template #footer>
      <ActionButton variant="neutral" @click="emit('close')">Batal</ActionButton>
      <ActionButton variant="primary" type="submit" form="form-profil-guru" :disabled="saving">
        Simpan
      </ActionButton>
    </template>
  </BaseModal>
</template>
