import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { LoginResponse } from '@edu/shared';
import { useToast } from '@/composables/useToast';

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

// Request interceptor: attach JWT access token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
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

      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);

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
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  localStorage.removeItem('must_change_password');
}

export { clearTokens };
