/**
 * Profil guru yang sedang login (state bersama sidebar, banner, dan modal profil).
 */
import { ref, computed } from 'vue';
import { api } from '@/api/client';
import { dataKurang, type ProfilGuru } from '@/utils/kelengkapan-guru';

const profil = ref<ProfilGuru | null>(null);
const showModal = ref(false);
let memuat: Promise<void> | null = null;

export function useProfilSaya() {
  const kurang = computed(() => (profil.value ? dataKurang(profil.value) : []));
  const belumLengkap = computed(() => kurang.value.length > 0);

  function muat(paksa = false): Promise<void> {
    if (memuat && !paksa) return memuat;
    memuat = api
      .get<ProfilGuru>('/users/me/profil-guru')
      .then(({ data }) => {
        profil.value = data;
      })
      .catch(() => {
        // Tidak kritis: penanda profil tidak tampil kalau gagal dimuat
        memuat = null;
      });
    return memuat;
  }

  function reset() {
    profil.value = null;
    memuat = null;
    showModal.value = false;
    try {
      // pengingat di layout muncul lagi untuk login berikutnya
      sessionStorage.removeItem('profil-guru-banner-ditutup');
    } catch {
      // abaikan
    }
  }

  return { profil, kurang, belumLengkap, showModal, muat, reset };
}
