<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();

const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const error = ref('');

const passwordMismatch = computed(
  () => confirmPassword.value.length > 0 && newPassword.value !== confirmPassword.value,
);

const passwordTooShort = computed(
  () => newPassword.value.length > 0 && newPassword.value.length < 8,
);

const canSubmit = computed(
  () =>
    oldPassword.value.length > 0 &&
    newPassword.value.length >= 8 &&
    newPassword.value === confirmPassword.value &&
    !loading.value,
);

async function handleChangePassword() {
  error.value = '';
  loading.value = true;

  try {
    await authStore.changePassword(oldPassword.value, newPassword.value);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      error.value = axiosErr.response?.data?.message || 'Gagal mengubah password.';
    } else {
      error.value = 'Terjadi kesalahan jaringan.';
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[9999] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div class="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
        <h2 id="modal-title" class="text-base font-semibold text-text-primary mb-1">
          Ubah Password
        </h2>
        <p class="text-sm text-text-secondary mb-5 leading-relaxed">
          Anda diharuskan mengubah password sebelum melanjutkan. Ini terjadi karena password Anda
          dibuat secara otomatis oleh admin.
        </p>

        <form class="space-y-4" @submit.prevent="handleChangePassword">
          <div>
            <label for="old-password" class="block text-sm font-medium text-text-primary mb-1.5"
              >Password Lama</label
            >
            <input
              id="old-password"
              v-model="oldPassword"
              type="password"
              required
              autocomplete="current-password"
              placeholder="Masukkan password saat ini"
              class="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
            />
          </div>
          <div>
            <label for="new-password" class="block text-sm font-medium text-text-primary mb-1.5"
              >Password Baru</label
            >
            <input
              id="new-password"
              v-model="newPassword"
              type="password"
              required
              autocomplete="new-password"
              placeholder="Minimal 8 karakter"
              minlength="8"
              class="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
            />
            <p v-if="passwordTooShort" class="text-xs text-danger-500 mt-1">
              Password minimal 8 karakter
            </p>
          </div>
          <div>
            <label for="confirm-password" class="block text-sm font-medium text-text-primary mb-1.5"
              >Konfirmasi Password Baru</label
            >
            <input
              id="confirm-password"
              v-model="confirmPassword"
              type="password"
              required
              autocomplete="new-password"
              placeholder="Ketik ulang password baru"
              class="w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
            />
            <p v-if="passwordMismatch" class="text-xs text-danger-500 mt-1">Password tidak cocok</p>
          </div>

          <div
            v-if="error"
            class="flex items-start gap-2 p-3 bg-danger-50 border border-danger-500/20 rounded-lg"
            role="alert"
          >
            <svg
              class="w-4 h-4 text-danger-500 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span class="text-sm text-danger-700">{{ error }}</span>
          </div>

          <button
            type="submit"
            :disabled="!canSubmit"
            class="w-full py-2.5 px-4 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 mt-2"
          >
            {{ loading ? 'Menyimpan...' : 'Ubah Password' }}
          </button>
        </form>
      </div>
    </div>
  </Teleport>
</template>
