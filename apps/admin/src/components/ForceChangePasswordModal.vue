<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();

const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const error = ref('');

const showOldPassword = ref(false);
const showNewPassword = ref(false);
const showConfirmPassword = ref(false);

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
            <div class="relative">
              <input
                id="old-password"
                v-model="oldPassword"
                :type="showOldPassword ? 'text' : 'password'"
                required
                autocomplete="current-password"
                placeholder="Masukkan password saat ini"
                class="w-full px-3 py-2.5 pr-10 text-sm border border-border rounded-lg bg-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                @click="showOldPassword = !showOldPassword"
              >
                <svg
                  v-if="!showOldPassword"
                  class="w-4.5 h-4.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <svg
                  v-else
                  class="w-4.5 h-4.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                  />
                </svg>
              </button>
            </div>
          </div>
          <div>
            <label for="new-password" class="block text-sm font-medium text-text-primary mb-1.5"
              >Password Baru</label
            >
            <div class="relative">
              <input
                id="new-password"
                v-model="newPassword"
                :type="showNewPassword ? 'text' : 'password'"
                required
                autocomplete="new-password"
                placeholder="Minimal 8 karakter"
                minlength="8"
                class="w-full px-3 py-2.5 pr-10 text-sm border border-border rounded-lg bg-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                @click="showNewPassword = !showNewPassword"
              >
                <svg
                  v-if="!showNewPassword"
                  class="w-4.5 h-4.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <svg
                  v-else
                  class="w-4.5 h-4.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                  />
                </svg>
              </button>
            </div>
            <p v-if="passwordTooShort" class="text-xs text-danger-500 mt-1">
              Password minimal 8 karakter
            </p>
          </div>
          <div>
            <label for="confirm-password" class="block text-sm font-medium text-text-primary mb-1.5"
              >Konfirmasi Password Baru</label
            >
            <div class="relative">
              <input
                id="confirm-password"
                v-model="confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                required
                autocomplete="new-password"
                placeholder="Ketik ulang password baru"
                class="w-full px-3 py-2.5 pr-10 text-sm border border-border rounded-lg bg-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                @click="showConfirmPassword = !showConfirmPassword"
              >
                <svg
                  v-if="!showConfirmPassword"
                  class="w-4.5 h-4.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <svg
                  v-else
                  class="w-4.5 h-4.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                  />
                </svg>
              </button>
            </div>
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
