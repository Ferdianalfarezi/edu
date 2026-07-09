import type { AxiosError } from 'axios';

/**
 * Extract a user-friendly error message from an Axios error or generic Error.
 * Falls back to a default message if the error structure is unexpected.
 */
export function getApiErrorMessage(error: unknown, fallback = 'Terjadi kesalahan'): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (data?.message) {
      return Array.isArray(data.message) ? data.message[0] : data.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function isAxiosError(error: unknown): error is AxiosError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isAxiosError' in error &&
    (error as AxiosError).isAxiosError === true
  );
}
