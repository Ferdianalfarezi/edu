import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

const SESSION_STORAGE_KEY = 'tenant_context';

export interface TenantContext {
  id: string;
  nama: string;
  logo_url?: string | null;
}

function loadFromSessionStorage(): TenantContext | null {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as TenantContext;
    }
  } catch {
    // Invalid JSON — clear and return null
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }
  return null;
}

export const useTenantContextStore = defineStore('tenantContext', () => {
  const activeTenant = ref<TenantContext | null>(loadFromSessionStorage());

  const hasTenantContext = computed(() => activeTenant.value !== null);

  /** logoUrl derived from active tenant — null/undefined treated as no logo */
  const logoUrl = computed<string | null>(() => activeTenant.value?.logo_url ?? null);

  function setTenant(tenant: TenantContext) {
    activeTenant.value = tenant;
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(tenant));
  }

  function clearTenant() {
    activeTenant.value = null;
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }

  return { activeTenant, hasTenantContext, logoUrl, setTenant, clearTenant };
});
