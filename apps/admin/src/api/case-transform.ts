/**
 * Utilities to convert object keys between snake_case and camelCase recursively.
 *
 * Used by the Axios interceptors so that:
 * - All outgoing request bodies/params are sent as snake_case (matching the API's DTOs and query params)
 * - All incoming responses are normalized to camelCase (so Vue views use consistent JS conventions)
 *
 * Skips plain values, arrays of primitives, null, File, FormData, Blob, etc.
 */

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  if (value === null || typeof value !== 'object') return false;
  // Skip browser/Node native types that should not be transformed
  if (
    value instanceof File ||
    value instanceof FormData ||
    value instanceof Blob ||
    value instanceof ArrayBuffer ||
    value instanceof Date
  ) {
    return false;
  }
  return true;
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

function camelToSnake(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

/**
 * Recursively convert all object keys from snake_case to camelCase.
 * Arrays are walked element by element. Primitives are returned as-is.
 */
export function keysToCamel<T>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map((item) => keysToCamel(item)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const result: PlainObject = {};
    for (const key of Object.keys(value)) {
      result[snakeToCamel(key)] = keysToCamel(value[key]);
    }
    return result as unknown as T;
  }
  return value as T;
}

/**
 * Recursively convert all object keys from camelCase to snake_case.
 * Arrays are walked element by element. Primitives are returned as-is.
 * FormData instances are returned untouched (multipart file uploads).
 */
export function keysToSnake<T>(value: unknown): T {
  if (value instanceof FormData) {
    // FormData is sent as-is; keys are controlled by the upload code
    return value as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => keysToSnake(item)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const result: PlainObject = {};
    for (const key of Object.keys(value)) {
      result[camelToSnake(key)] = keysToSnake(value[key]);
    }
    return result as unknown as T;
  }
  return value as T;
}
