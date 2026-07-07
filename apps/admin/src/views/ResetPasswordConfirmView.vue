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
  } catch (err: unknown) {
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
  <div class="reset-confirm-container">
    <div class="reset-confirm-card">
      <h1>Atur Password Baru</h1>

      <template v-if="tokenMissing">
        <div class="error-box">
          <p>
            Tautan reset password tidak valid. Silakan minta tautan baru dari halaman reset
            password.
          </p>
        </div>
        <router-link to="/reset-password" class="back-link"> Minta tautan reset baru </router-link>
      </template>

      <template v-else-if="success">
        <div class="success-message">
          <p>Password berhasil diubah! Silakan login dengan password baru Anda.</p>
        </div>
        <button @click="goToLogin" class="login-btn">Login</button>
      </template>

      <template v-else>
        <form @submit.prevent="handleSubmit" class="reset-form">
          <div class="form-group">
            <label for="new-password">Password Baru</label>
            <input
              id="new-password"
              v-model="newPassword"
              type="password"
              required
              autocomplete="new-password"
              placeholder="Minimal 8 karakter"
              minlength="8"
            />
            <span v-if="passwordTooShort" class="field-error"> Password minimal 8 karakter </span>
          </div>
          <div class="form-group">
            <label for="confirm-password">Konfirmasi Password</label>
            <input
              id="confirm-password"
              v-model="confirmPassword"
              type="password"
              required
              autocomplete="new-password"
              placeholder="Ketik ulang password"
            />
            <span v-if="passwordMismatch" class="field-error"> Password tidak cocok </span>
          </div>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <button type="submit" :disabled="!canSubmit">
            {{ loading ? 'Menyimpan...' : 'Simpan Password Baru' }}
          </button>
        </form>
      </template>

      <router-link v-if="!success && !tokenMissing" to="/login" class="back-link">
        &larr; Kembali ke halaman login
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.reset-confirm-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
}

.reset-confirm-card {
  max-width: 400px;
  width: 100%;
  padding: 2rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.reset-confirm-card h1 {
  text-align: center;
  margin-bottom: 1.5rem;
  font-size: 1.5rem;
  color: #1f2937;
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

.field-error {
  color: #dc2626;
  font-size: 0.75rem;
}

.error {
  color: #dc2626;
  font-size: 0.8125rem;
  margin: 0;
  padding: 0.5rem 0.75rem;
  background: #fef2f2;
  border-radius: 4px;
}

.error-box {
  text-align: center;
  padding: 1rem;
  background: #fef2f2;
  border-radius: 6px;
  margin-bottom: 1rem;
}

.error-box p {
  color: #dc2626;
  font-size: 0.875rem;
  margin: 0;
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

.login-btn {
  width: 100%;
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
