import { ref } from 'vue';
import axios from 'axios';
import { api } from '@/api';
import { useToast } from '@/composables/useToast';
import type { ParseResult } from './useExcelParser';

export type Step = 'info' | 'upload' | 'preview' | 'submitting';

export interface TenantFormData {
  nama: string;
  alamat: string;
  telepon: string;
  email: string;
  jumlah_tingkat: number;
  hari_kerja: '5_hari' | '6_hari';
  admin_nama: string;
  admin_email: string;
}

const DEFAULT_TENANT_FORM: TenantFormData = {
  nama: '',
  alamat: '',
  telepon: '',
  email: '',
  jumlah_tingkat: 6,
  hari_kerja: '6_hari',
  admin_nama: '',
  admin_email: '',
};

export interface OnboardingFormCallbacks {
  onSuccess?: () => void;
}

export function useOnboardingForm(callbacks?: OnboardingFormCallbacks) {
  const step = ref<Step>('info');
  const tenantForm = ref<TenantFormData>({ ...DEFAULT_TENANT_FORM });
  const parseResult = ref<ParseResult | null>(null);
  const isSubmitting = ref<boolean>(false);
  const submitError = ref<string | null>(null);

  const toast = useToast();

  function goToStep(newStep: Step): void {
    // Lock navigation during submission
    if (step.value === 'submitting') return;
    step.value = newStep;
  }

  function handleFileParsed(result: ParseResult): void {
    parseResult.value = result;
    submitError.value = null; // clear any previous errors
    if (result.isValid) {
      step.value = 'preview';
    }
    // If not valid, stay on upload step — errors shown in UI
  }

  function handleGantiFile(): void {
    parseResult.value = null;
    submitError.value = null;
    step.value = 'upload';
  }

  async function submitOnboarding(): Promise<void> {
    if (!parseResult.value?.data || !parseResult.value?.isValid) return;

    isSubmitting.value = true;
    submitError.value = null;

    try {
      const data = parseResult.value.data;

      const payload = {
        // Tenant info fields
        ...tenantForm.value,
        // Onboarding arrays — filter out invalid rows before sending
        kelas: data.kelas, // ParsedKelas has no isValid flag; all entries are valid by construction
        mata_pelajaran: data.mataPelajaran
          .filter((r) => r.isValid !== false)
          .map((r) => ({ nama: r.nama, kode: r.kode })),
        siswa: data.siswa
          .filter((r) => r.isValid !== false)
          .map((s) => ({
            nama: s.nama,
            nisn: s.nisn,
            kelasNama: s.kelas, // backend DTO field name differs from parsed field name
            jenisKelamin: s.jenisKelamin,
            tanggalLahir: s.tanggalLahir,
            alamat: s.alamat,
            namaWali: s.namaWali,
            teleponWali: s.teleponWali,
          })),
        guru_staff: data.guruStaff
          .filter((r) => r.isValid !== false)
          .map((g) => ({
            nama: g.nama,
            email: g.email,
            telepon: g.telepon,
            role: g.role,
          })),
        spp_bulanan: data.sppBulanan
          .filter((r) => r.isValid !== false)
          .map((s) => ({
            tingkat: s.tingkat,
            nominal: s.nominal,
          })),
      };

      await api.post('/tenants', payload);

      toast.success('Tenant berhasil dibuat dengan data onboarding');
      callbacks?.onSuccess?.();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response) {
          // Server returned a response — display the server's error message inline.
          // The global axios interceptor also fires toast.error(), so the user sees
          // both inline (submitError) and a toast notification.
          const serverMessage = err.response.data?.message;
          submitError.value = Array.isArray(serverMessage)
            ? serverMessage.join(', ')
            : (serverMessage ?? 'Terjadi kesalahan pada server');
        } else {
          // Network error — no response received.
          // The global interceptor fires toast.error(err.message) here too, but
          // err.message is usually the raw "Network Error" string, not Indonesian.
          // We set submitError for the inline display with the proper Indonesian message.
          submitError.value = 'Gagal terhubung ke server. Periksa koneksi internet dan coba lagi';
        }
      } else {
        submitError.value = 'Terjadi kesalahan yang tidak diketahui';
      }
    } finally {
      isSubmitting.value = false;
    }
  }

  return {
    step,
    tenantForm,
    parseResult,
    isSubmitting,
    submitError,
    goToStep,
    handleFileParsed,
    handleGantiFile,
    submitOnboarding,
  };
}
