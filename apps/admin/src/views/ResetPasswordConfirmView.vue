<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api/client';
import type { ResetPasswordConfirm } from '@edu/shared';

const route = useRoute();
const router = useRouter();

const newPassword = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const error = ref('');
const success = ref(false);
const tokenMissing = ref(false);

const token = computed(() => (route.query.token as string) || '');

const passwordMismatch = computed(
  () => confirmPassword.value.length > 0 && newPassword.value !== confirmPassword.value,
);

const passwordTooShort = computed(
  () => newPassword.value.length > 0 && newPassword.value.length < 8,
);

const canSubmit = computed(
  () =>
    newPassword.value.length >= 8 && newPassword.value === confirmPassword.value && !loading.value,
);

onMounted(() => {
  if (!token.value) {
    tokenMissing.value = true;
  }
});

async function handleSubmit() {
  error.value = '';
  loading.value = true;

  try {
    const payload: ResetPasswordConfirm = {
      token: token.value,
      new_password: newPassword.value,
    };
    await api.post('/auth/reset-password/confirm', payload);
    success.value = true;
  } catch (err) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status?: number; data?: { message?: string } } };
      if (axiosErr.response?.status === 400 || axiosErr.response?.status === 410) {
        error.value = 'Tautan reset password tidak valid atau sudah kedaluwarsa.';
      } else {
        error.value = axiosErr.response?.data?.message || 'Gagal mengatur ulang password.';
      }
    } else {
      error.value = 'Terjadi kesalahan jaringan.';
    }
  } finally {
    loading.value = false;
  }
}

function goToLogin() {
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-surface-50 px-4">
    <div class="w-full max-w-[400px] bg-white border border-border rounded-xl p-8 shadow-sm">
      <h1 class="text-center text-xl font-semibold text-text-primary mb-6">Atur Password Baru</h1>

      <template v-if="tokenMissing">
        <div class="text-center p-4 bg-danger-50 rounded-lg mb-4">
          <p class="text-sm text-danger-700">
            Tautan reset password tidak valid. Silakan minta tautan baru dari halaman reset
            password.
          </p>
        </div>
        <router-link
          to="/reset-password"
          class="block text-center text-xs text-primary-600 hover:underline"
        >
          Minta tautan reset baru
        </router-link>
      </template>

      <template v-else-if="success">
        <div class="text-center p-4 bg-success-50 rounded-lg mb-4">
          <p class="text-sm text-success-700">
            Password berhasil diubah! Silakan login dengan password baru Anda.
          </p>
        </div>
        <button
          class="w-full px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          @click="goToLogin"
        >
          Login
        </button>
      </template>

      <template v-else>
        <form class="flex flex-col gap-4" @submit.prevent="handleSubmit">
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
              class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
            <span v-if="passwordTooShort" class="text-xs text-danger-500 mt-1"
              >Password minimal 8 karakter</span
            >
          </div>
          <div>
            <label for="confirm-password" class="block text-sm font-medium text-text-primary mb-1.5"
              >Konfirmasi Password</label
            >
            <input
              id="confirm-password"
              v-model="confirmPassword"
              type="password"
              required
              autocomplete="new-password"
              placeholder="Ketik ulang password"
              class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
            <span v-if="passwordMismatch" class="text-xs text-danger-500 mt-1"
              >Password tidak cocok</span
            >
          </div>
          <p
            v-if="error"
            class="text-xs text-danger-500 bg-danger-50 rounded-md px-3 py-2"
            role="alert"
          >
            {{ error }}
          </p>
          <button
            type="submit"
            :disabled="!canSubmit"
            class="w-full px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {{ loading ? 'Menyimpan...' : 'Simpan Password Baru' }}
          </button>
        </form>
      </template>

      <router-link
        v-if="!success && !tokenMissing"
        to="/login"
        class="block text-center mt-4 text-xs text-primary-600 hover:underline"
      >
        &larr; Kembali ke halaman login
      </router-link>
    </div>
  </div>
</template>
