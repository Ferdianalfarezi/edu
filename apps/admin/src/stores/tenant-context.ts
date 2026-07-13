import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

const SESSION_STORAGE_KEY = 'tenant_context';

function loadFromSessionStorage(): { id: string; nama: string } | null {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Invalid JSON — clear and return null
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }
  return null;
}

export const useTenantContextStore = defineStore('tenantContext', () => {
  const activeTenant = ref<{ id: string; nama: string } | null>(loadFromSessionStorage());

  const hasTenantContext = computed(() => activeTenant.value !== null);

  function setTenant(tenant: { id: string; nama: string }) {
    activeTenant.value = tenant;
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(tenant));
  }

  function clearTenant() {
    activeTenant.value = null;
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }

  return { activeTenant, hasTenantContext, setTenant, clearTenant };
});
