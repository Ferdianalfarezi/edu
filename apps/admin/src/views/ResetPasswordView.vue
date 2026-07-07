<script setup lang="ts">
import { ref } from 'vue';
import { api } from '@/api/client';
import type { ResetPasswordRequest } from '@edu/shared';

const email = ref('');
const loading = ref(false);
const error = ref('');
const submitted = ref(false);

async function handleSubmit() {
  error.value = '';
  loading.value = true;

  try {
    const payload: ResetPasswordRequest = { email: email.value };
    await api.post('/auth/reset-password/request', payload);
    submitted.value = true;
  } catch (err: unknown) {
    // Always show success message to prevent email enumeration
    submitted.value = true;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-surface-50 px-4">
    <div class="w-full max-w-[400px] bg-white border border-border rounded-xl p-8 shadow-sm">
      <h1 class="text-center text-xl font-semibold text-text-primary mb-3">Reset Password</h1>

      <template v-if="!submitted">
        <p class="text-sm text-text-secondary text-center mb-6">
          Masukkan alamat email Anda. Kami akan mengirim tautan untuk mengatur ulang password.
        </p>
        <form @submit.prevent="handleSubmit" class="flex flex-col gap-4">
          <div>
            <label for="email" class="block text-sm font-medium text-text-primary mb-1.5"
              >Email</label
            >
            <input
              id="email"
              v-model="email"
              type="email"
              required
              autocomplete="email"
              placeholder="email@sekolah.com"
              class="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
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
            :disabled="loading"
            class="w-full px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {{ loading ? 'Mengirim...' : 'Kirim Link Reset' }}
          </button>
        </form>
      </template>

      <template v-else>
        <div class="text-center p-4 bg-success-50 rounded-lg mb-4">
          <p class="text-sm text-success-700">
            Jika email tersebut terdaftar dalam sistem, kami telah mengirimkan tautan reset
            password. Silakan periksa inbox dan folder spam Anda.
          </p>
          <p class="mt-2 text-xs text-text-secondary">Tautan berlaku selama 30 menit.</p>
        </div>
      </template>

      <router-link
        to="/login"
        class="block text-center mt-4 text-xs text-primary-600 hover:underline"
      >
        &larr; Kembali ke halaman login
      </router-link>
    </div>
  </div>
</template>
