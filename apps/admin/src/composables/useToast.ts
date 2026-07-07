import { ref } from 'vue';

export interface Toast {
  id: number;
  message: string;
  type: 'error' | 'success' | 'warning' | 'info';
}

const toasts = ref<Toast[]>([]);
let nextId = 0;

export function useToast() {
  function addToast(message: string, type: Toast['type'] = 'error', duration = 5000) {
    const id = nextId++;
    toasts.value.push({ id, message, type });

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }

  function removeToast(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function error(message: string, duration?: number) {
    addToast(message, 'error', duration);
  }

  function success(message: string, duration?: number) {
    addToast(message, 'success', duration);
  }

  function warning(message: string, duration?: number) {
    addToast(message, 'warning', duration);
  }

  function info(message: string, duration?: number) {
    addToast(message, 'info', duration);
  }

  return {
    toasts,
    addToast,
    removeToast,
    error,
    success,
    warning,
    info,
  };
}
