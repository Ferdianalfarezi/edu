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
  } catch (err: unknown) {
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
  <div class="login-container">
    <div class="login-card">
      <h1>Edu Admin Panel</h1>
      <form @submit.prevent="handleLogin" class="login-form">
        <div class="form-group">
          <label for="email">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            autocomplete="email"
            placeholder="email@sekolah.com"
          />
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            required
            autocomplete="current-password"
            placeholder="Masukkan password"
          />
        </div>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <button type="submit" :disabled="loading">
          {{ loading ? 'Memproses...' : 'Login' }}
        </button>
        <router-link to="/reset-password" class="forgot-link"> Lupa password? </router-link>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
}

.login-card {
  max-width: 400px;
  width: 100%;
  padding: 2rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.login-card h1 {
  text-align: center;
  margin-bottom: 1.5rem;
  font-size: 1.5rem;
  color: #1f2937;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-group label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

.form-group input {
  padding: 0.625rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
  transition: border-color 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.error {
  color: #dc2626;
  font-size: 0.8125rem;
  margin: 0;
  padding: 0.5rem 0.75rem;
  background: #fef2f2;
  border-radius: 4px;
}

button {
  padding: 0.75rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

button:hover:not(:disabled) {
  background: #2563eb;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.forgot-link {
  text-align: center;
  font-size: 0.8125rem;
  color: #3b82f6;
  text-decoration: none;
}

.forgot-link:hover {
  text-decoration: underline;
}
</style>
