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
  } catch (err) {
    // Always show success message to prevent email enumeration
    submitted.value = true;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-surface-warm px-4">
    <div
      class="w-full max-w-[400px] bg-white border-2 border-stone-200 rounded-[16px] p-8 shadow-xs"
    >
      <h1 class="text-center text-xl font-semibold text-text-primary mb-3">Reset Password</h1>

      <template v-if="!submitted">
        <p class="text-[15px] text-text-secondary text-center mb-6">
          Masukkan alamat email Anda. Kami akan mengirim tautan untuk mengatur ulang password.
        </p>
        <form class="flex flex-col gap-4" @submit.prevent="handleSubmit">
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
              class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs placeholder:text-text-tertiary focus:outline-2 focus:outline-primary-500 focus:outline-offset-2 transition-colors"
            />
          </div>
          <p
            v-if="error"
            class="text-[13px] text-danger-500 bg-danger-50 rounded-xs px-3 py-2"
            role="alert"
          >
            {{ error }}
          </p>
          <button
            type="submit"
            :disabled="loading"
            class="w-full py-2.5 px-[18px] text-[14px] font-semibold text-white bg-primary-600 rounded-xs hover:bg-primary-700 hover:-translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-2 focus:outline-primary-500 focus:outline-offset-2"
            style="box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3)"
          >
            {{ loading ? 'Mengirim...' : 'Kirim Link Reset' }}
          </button>
        </form>
      </template>

      <template v-else>
        <div class="text-center p-4 bg-success-50 rounded-xs mb-4">
          <p class="text-[15px] text-success-700">
            Jika email tersebut terdaftar dalam sistem, kami telah mengirimkan tautan reset
            password. Silakan periksa inbox dan folder spam Anda.
          </p>
          <p class="mt-2 text-[13px] text-text-secondary">Tautan berlaku selama 30 menit.</p>
        </div>
      </template>

      <router-link
        to="/login"
        class="block text-center mt-4 text-[13px] text-primary-600 hover:text-primary-700 transition-colors"
      >
        &larr; Kembali ke halaman login
      </router-link>
    </div>
  </div>
</template>
