import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AuthUser, LoginRequest, LoginResponse, ChangePasswordRequest } from '@edu/shared';
import { Role, Platform } from '@edu/shared';
import { api, clearTokens, setAccessToken } from '@/api/client';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(loadUserFromStorage());
  const mustChangePassword = ref(loadMustChangePasswordFromStorage());
  const isAuthenticated = computed(() => !!user.value);

  function loadUserFromStorage(): AuthUser | null {
    const stored = localStorage.getItem('user');
    if (!stored) return null;
    try {
      return JSON.parse(stored) as AuthUser;
    } catch {
      return null;
    }
  }

  function loadMustChangePasswordFromStorage(): boolean {
    return localStorage.getItem('must_change_password') === 'true';
  }

  async function login(email: string, password: string): Promise<void> {
    const payload: LoginRequest = {
      email,
      password,
      platform: Platform.ADMIN_PANEL,
    };

    const { data } = await api.post<LoginResponse>('/auth/login', payload);

    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setAccessToken(data.access_token);

    if (data.must_change_password) {
      localStorage.setItem('must_change_password', 'true');
      mustChangePassword.value = true;
    } else {
      localStorage.removeItem('must_change_password');
      mustChangePassword.value = false;
    }

    user.value = data.user;
  }

  async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const payload: ChangePasswordRequest = {
      old_password: oldPassword,
      new_password: newPassword,
    };

    await api.post('/auth/change-password', payload);

    localStorage.removeItem('must_change_password');
    mustChangePassword.value = false;
  }

  function logout() {
    // Notify server to blacklist tokens before clearing local state
    const refreshToken = localStorage.getItem('refresh_token');
    api
      .post('/auth/logout', { refresh_token: refreshToken })
      .catch(() => {
        // Best-effort: even if the API call fails, clear local state
      })
      .finally(() => {
        clearTokens();
        localStorage.removeItem('must_change_password');
        mustChangePassword.value = false;
        user.value = null;
      });

    // Clear local state immediately for responsive UX
    clearTokens();
    localStorage.removeItem('must_change_password');
    mustChangePassword.value = false;
    user.value = null;
  }

  function hasRole(...roles: Role[]): boolean {
    if (!user.value) return false;
    return roles.includes(user.value.role);
  }

  return {
    user,
    isAuthenticated,
    mustChangePassword,
    login,
    logout,
    changePassword,
    hasRole,
  };
});
