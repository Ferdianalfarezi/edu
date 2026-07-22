<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const showPassword = ref(false);

async function handleLogin() {
  error.value = '';
  loading.value = true;

  try {
    await authStore.login(email.value, password.value);

    if (authStore.mustChangePassword) {
      router.push({ name: 'dashboard' });
      return;
    }

    const redirect = (route.query.redirect as string) || '/';
    router.push(redirect);
  } catch (err) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status?: number; data?: { message?: string } } };
      if (axiosErr.response?.status === 423) {
        error.value = 'Akun terkunci. Silakan coba lagi dalam 15 menit.';
      } else {
        error.value = axiosErr.response?.data?.message || 'Login gagal';
      }
    } else {
      error.value = 'Terjadi kesalahan jaringan';
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex bg-surface-warm">
    <!-- Left: Brand panel -->
    <div
      class="hidden lg:flex lg:w-1/2 xl:w-[60%] relative overflow-hidden items-center justify-center p-12"
      style="background-image: url('/bg.webp'); background-size: cover; background-position: center"
    >
      <!-- Dark overlay for text readability -->
      <div class="absolute inset-0 bg-white/70 backdrop-blur-sm" />

      <div class="relative z-10 max-w-md text-stone-900">
        <img
          src="/logo-text.png"
          alt="Teman Sekolah"
          class="h-18 w-64 object-right object-cover -ml-8 mb-8"
        />
        <h1 class="text-3xl font-semibold leading-tight mb-4">
          Kelola sekolah dengan lebih efisien
        </h1>
        <p class="text-base leading-relaxed text-stone-700">
          Absensi, pembayaran SPP, rapor, dan komunikasi orang tua — semua dalam satu platform
          terintegrasi.
        </p>
      </div>
    </div>

    <!-- Right: Login form -->
    <div class="flex-1 flex items-center justify-center p-6 sm:p-12">
      <div class="w-full max-w-sm bg-white rounded-[16px] border-2 border-stone-200 shadow-xs p-8">
        <!-- Mobile logo -->
        <div class="lg:hidden flex items-center gap-2.5 mb-8">
          <img src="/logo-text.png" alt="Teman Sekolah" class="h-16 w-36 -ml-4 object-cover" />
        </div>

        <div class="mb-8">
          <h2 class="text-xl font-semibold text-text-primary mb-1">Masuk ke akun Anda</h2>
          <p class="text-[15px] text-text-secondary">
            Masukkan email dan password untuk melanjutkan
          </p>
        </div>

        <form class="space-y-4" @submit.prevent="handleLogin">
          <div>
            <label for="email" class="block text-sm font-medium text-text-primary mb-1.5">
              Email
            </label>
            <input
              id="email"
              v-model="email"
              type="email"
              required
              autocomplete="email"
              placeholder="nama@sekolah.com"
              class="w-full px-3 py-2.5 text-[15px] border-2 border-stone-200 rounded-xs bg-white placeholder:text-text-tertiary focus:outline-2 focus:outline-primary-500 focus:outline-offset-2 transition-colors"
            />
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-text-primary mb-1.5">
              Password
            </label>
            <div class="relative">
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                required
                autocomplete="current-password"
                placeholder="Masukkan password"
                class="w-full px-3 py-2.5 pr-10 text-[15px] border-2 border-stone-200 rounded-xs bg-white placeholder:text-text-tertiary focus:outline-2 focus:outline-primary-500 focus:outline-offset-2 transition-colors"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                @click="showPassword = !showPassword"
              >
                <svg
                  v-if="!showPassword"
                  class="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.75"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
                <svg
                  v-else
                  class="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.75"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- Error message -->
          <div
            v-if="error"
            class="flex items-start gap-2 p-3 bg-danger-50 border-2 border-danger-500/20 rounded-xs"
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
            <span class="text-[15px] text-danger-700">{{ error }}</span>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full py-2.5 px-[18px] bg-primary-600 hover:bg-primary-700 hover:-translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[14px] font-semibold rounded-xs transition-all focus:outline-2 focus:outline-primary-500 focus:outline-offset-2"
            style="box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3)"
          >
            <span v-if="loading" class="flex items-center justify-center gap-2">
              <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
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
              Memproses...
            </span>
            <span v-else>Masuk</span>
          </button>

          <div class="text-center">
            <router-link
              to="/reset-password"
              class="text-[14px] text-primary-600 hover:text-primary-700 transition-colors"
            >
              Lupa password?
            </router-link>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
