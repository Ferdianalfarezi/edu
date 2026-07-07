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
    await api.post('/auth/reset-password', payload);
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
  <div class="reset-container">
    <div class="reset-card">
      <h1>Reset Password</h1>

      <template v-if="!submitted">
        <p class="description">
          Masukkan alamat email Anda. Kami akan mengirim tautan untuk mengatur ulang password.
        </p>
        <form @submit.prevent="handleSubmit" class="reset-form">
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
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <button type="submit" :disabled="loading">
            {{ loading ? 'Mengirim...' : 'Kirim Link Reset' }}
          </button>
        </form>
      </template>

      <template v-else>
        <div class="success-message">
          <p>
            Jika email tersebut terdaftar dalam sistem, kami telah mengirimkan tautan reset
            password. Silakan periksa inbox dan folder spam Anda.
          </p>
          <p class="hint">Tautan berlaku selama 30 menit.</p>
        </div>
      </template>

      <router-link to="/login" class="back-link"> &larr; Kembali ke halaman login </router-link>
    </div>
  </div>
</template>

<style scoped>
.reset-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
}

.reset-card {
  max-width: 400px;
  width: 100%;
  padding: 2rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.reset-card h1 {
  text-align: center;
  margin-bottom: 0.75rem;
  font-size: 1.5rem;
  color: #1f2937;
}

.description {
  color: #6b7280;
  font-size: 0.875rem;
  text-align: center;
  margin-bottom: 1.5rem;
}

.reset-form {
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

.success-message {
  text-align: center;
  padding: 1rem;
  background: #f0fdf4;
  border-radius: 6px;
  margin-bottom: 1rem;
}

.success-message p {
  color: #166534;
  font-size: 0.875rem;
  margin: 0;
}

.success-message .hint {
  margin-top: 0.5rem;
  color: #6b7280;
  font-size: 0.8125rem;
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

.back-link {
  display: block;
  text-align: center;
  margin-top: 1rem;
  font-size: 0.8125rem;
  color: #3b82f6;
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}
</style>
