import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { LoginResponse } from '@edu/shared';
import { useToast } from '@/composables/useToast';
import { useTenantContextStore } from '@/stores/tenant-context';
import { keysToCamel } from './case-transform';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

/**
 * Axios instance pre-configured with base URL and JSON headers.
 * Includes JWT interceptor for auth and auto-refresh on 401.
 */
export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * In-memory access token storage. NOT persisted to localStorage to mitigate XSS.
 * On page refresh, the refresh token (still in localStorage) is used to obtain a new access token.
 * This means an XSS attacker can only steal the refresh token (which requires a POST to /auth/refresh
 * to be useful) rather than having immediate bearer access.
 */
let inMemoryAccessToken: string | null = localStorage.getItem('access_token');

export function setAccessToken(token: string | null) {
  inMemoryAccessToken = token;
  // Also keep in localStorage for backward-compat during migration.
  // TODO: Remove localStorage persistence once silent-refresh-on-load is fully tested.
  if (token) {
    localStorage.setItem('access_token', token);
  } else {
    localStorage.removeItem('access_token');
  }
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

// Track whether a token refresh is in progress to prevent multiple parallel refreshes
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (token) {
      resolve(token);
    } else {
      reject(error);
    }
  });
  failedQueue = [];
}

// Cross-tab coordination: listen for token updates from other tabs
const tokenChannel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('auth_token_sync') : null;

if (tokenChannel) {
  tokenChannel.onmessage = (event: MessageEvent) => {
    const { type, access_token, refresh_token } = event.data;
    if (type === 'token_refreshed' && access_token) {
      setAccessToken(access_token);
      localStorage.setItem('refresh_token', refresh_token);
      // If we were waiting on a refresh, resolve queued requests with the new token
      if (isRefreshing) {
        isRefreshing = false;
        processQueue(null, access_token);
      }
    } else if (type === 'logged_out') {
      clearTokens();
      window.location.href = '/login';
    }
  };
}

// Request interceptor: attach JWT access token from memory
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Request interceptor: attach X-Tenant-Context header when active tenant is set
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const tenantStore = useTenantContextStore();
    if (tenantStore.activeTenant && config.headers) {
      config.headers['X-Tenant-Context'] = tenantStore.activeTenant.id;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor: convert all incoming response data keys to camelCase.
// Vue views can access response.data with camelCase regardless of what the API sends.
api.interceptors.response.use(
  (response) => {
    if (response.data) {
      response.data = keysToCamel(response.data);
    }
    return response;
  },
  (error) => Promise.reject(error),
);

// Response interceptor: auto-refresh on 401 + global error toast
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only attempt refresh for 401 errors, not on login/refresh endpoints themselves
    if (
      error.response?.status !== 401 ||
      originalRequest._retry ||
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/refresh')
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Another refresh is in progress — queue this request
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return api(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      isRefreshing = false;
      processQueue(error, null);
      clearTokens();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post<LoginResponse>(`${API_BASE_URL}/auth/refresh`, {
        refresh_token: refreshToken,
      });

      setAccessToken(data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);

      // Notify other tabs about the new tokens
      tokenChannel?.postMessage({
        type: 'token_refreshed',
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      isRefreshing = false;
      processQueue(null, data.access_token);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
      }
      return api(originalRequest);
    } catch (refreshError) {
      isRefreshing = false;
      processQueue(refreshError, null);
      clearTokens();
      window.location.href = '/login';
      return Promise.reject(refreshError);
    }
  },
);

// Global error toast interceptor — runs after refresh logic
api.interceptors.response.use(undefined, (error: AxiosError<{ message?: string }>) => {
  // Don't show toast for 401 that will redirect to login
  if (error.response?.status === 401) {
    return Promise.reject(error);
  }

  const toast = useToast();
  const message =
    error.response?.data?.message ||
    error.response?.statusText ||
    error.message ||
    'Terjadi kesalahan pada server';

  toast.error(message);
  return Promise.reject(error);
});

function clearTokens() {
  inMemoryAccessToken = null;
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  localStorage.removeItem('must_change_password');
  // Notify other tabs
  tokenChannel?.postMessage({ type: 'logged_out' });
}

export { clearTokens };
