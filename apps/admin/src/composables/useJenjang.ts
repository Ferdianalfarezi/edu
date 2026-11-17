import { ref } from 'vue';
import { api } from '@/api/client';
import { kelasLabel } from '@/utils/kelas-label';

interface TenantProfile {
  jumlahTingkat: number;
  jenjang: string | null;
}

/**
 * Jenjang & jumlah tingkat sekolah aktif, plus helper label "Kelas 7".
 * Panggil `load()` di onMounted (diambil ulang tiap halaman supaya
 * tidak tertukar kalau ganti akun / ganti sekolah).
 */
export function useJenjang() {
  const jenjang = ref<string | null>(null);
  const jumlahTingkat = ref<number>(6);

  async function load() {
    try {
      const { data } = await api.get<TenantProfile>('/tenants/profile');
      jenjang.value = data?.jenjang ?? null;
      if (data?.jumlahTingkat) jumlahTingkat.value = data.jumlahTingkat;
    } catch (error) {
      console.error('Failed to fetch tenant profile:', error);
    }
  }

  return {
    jenjang,
    jumlahTingkat,
    load,
    label: (tingkat: number | null | undefined) => kelasLabel(tingkat, jenjang.value),
  };
}
