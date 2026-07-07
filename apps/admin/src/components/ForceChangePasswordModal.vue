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
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-content">
        <h2 id="modal-title">Ubah Password</h2>
        <p class="modal-description">
          Anda diharuskan mengubah password sebelum melanjutkan. Ini terjadi karena password Anda
          dibuat secara otomatis oleh admin.
        </p>

        <form @submit.prevent="handleChangePassword" class="change-form">
          <div class="form-group">
            <label for="old-password">Password Lama</label>
            <input
              id="old-password"
              v-model="oldPassword"
              type="password"
              required
              autocomplete="current-password"
              placeholder="Masukkan password saat ini"
            />
          </div>
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
            <label for="confirm-password">Konfirmasi Password Baru</label>
            <input
              id="confirm-password"
              v-model="confirmPassword"
              type="password"
              required
              autocomplete="new-password"
              placeholder="Ketik ulang password baru"
            />
            <span v-if="passwordMismatch" class="field-error"> Password tidak cocok </span>
          </div>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <button type="submit" :disabled="!canSubmit">
            {{ loading ? 'Menyimpan...' : 'Ubah Password' }}
          </button>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-content {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  max-width: 420px;
  width: calc(100% - 2rem);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

.modal-content h2 {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
  color: #1f2937;
}

.modal-description {
  color: #6b7280;
  font-size: 0.8125rem;
  margin-bottom: 1.5rem;
  line-height: 1.5;
}

.change-form {
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
  margin-top: 0.5rem;
}

button:hover:not(:disabled) {
  background: #2563eb;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
