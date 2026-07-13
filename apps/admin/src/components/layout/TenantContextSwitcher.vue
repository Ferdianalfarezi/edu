<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useTenantContextStore } from '@/stores/tenant-context';
import { useToast } from '@/composables/useToast';
import { api } from '@/api/client';
import { Role } from '@edu/shared';

interface TenantOption {
  id: string;
  nama: string;
}

const authStore = useAuthStore();
const tenantContextStore = useTenantContextStore();
const toast = useToast();

const isSuperAdmin = computed(() => authStore.hasRole(Role.SUPER_ADMIN));

// Dropdown state
const isOpen = ref(false);
const searchQuery = ref('');
const tenantOptions = ref<TenantOption[]>([]);
const isLoading = ref(false);
const highlightedIndex = ref(-1);
const containerRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// Debounced search
watch(searchQuery, (query) => {
  if (debounceTimer) clearTimeout(debounceTimer);

  if (query.length < 1) {
    tenantOptions.value = [];
    isOpen.value = false;
    return;
  }

  debounceTimer = setTimeout(() => {
    searchTenants(query);
  }, 300);
});

async function searchTenants(query: string) {
  isLoading.value = true;
  try {
    const { data } = await api.get<TenantOption[]>('/tenants/search', {
      params: { q: query },
    });
    tenantOptions.value = data;
    isOpen.value = data.length > 0;
    highlightedIndex.value = data.length > 0 ? 0 : -1;
  } catch (err: unknown) {
    const error = err as { response?: { status?: number } };
    if (error.response?.status === 400) {
      tenantContextStore.clearTenant();
      toast.error('Tenant tidak tersedia atau tidak aktif');
    }
    tenantOptions.value = [];
    isOpen.value = false;
  } finally {
    isLoading.value = false;
  }
}

function selectTenant(tenant: TenantOption) {
  tenantContextStore.setTenant({ id: tenant.id, nama: tenant.nama });
  searchQuery.value = '';
  tenantOptions.value = [];
  isOpen.value = false;
}

function handleClearContext() {
  tenantContextStore.clearTenant();
  searchQuery.value = '';
  tenantOptions.value = [];
}

function handleKeydown(e: KeyboardEvent) {
  if (!isOpen.value) return;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      highlightedIndex.value = Math.min(highlightedIndex.value + 1, tenantOptions.value.length - 1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0);
      break;
    case 'Enter':
      e.preventDefault();
      if (highlightedIndex.value >= 0 && tenantOptions.value[highlightedIndex.value]) {
        selectTenant(tenantOptions.value[highlightedIndex.value]);
      }
      break;
    case 'Escape':
      e.preventDefault();
      isOpen.value = false;
      break;
  }
}

function handleClickOutside(e: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside);
  if (debounceTimer) clearTimeout(debounceTimer);
});
</script>

<template>
  <div v-if="isSuperAdmin" class="flex items-center gap-2">
    <!-- Active tenant badge -->
    <div
      v-if="tenantContextStore.activeTenant"
      class="flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 border border-primary-200 rounded-md"
    >
      <svg
        class="w-3.5 h-3.5 text-primary-600 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
        />
      </svg>
      <span class="text-xs font-medium text-primary-700 max-w-[140px] truncate">
        {{ tenantContextStore.activeTenant.nama }}
      </span>
      <button
        class="p-0.5 rounded hover:bg-primary-100 text-primary-500 hover:text-primary-700 transition-colors"
        title="Hapus konteks tenant"
        @click="handleClearContext"
      >
        <svg
          class="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Tenant search input with dropdown -->
    <div v-else ref="containerRef" class="relative w-56">
      <div class="relative">
        <svg
          class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          ref="inputRef"
          v-model="searchQuery"
          type="text"
          class="w-full pl-8 pr-3 py-1.5 text-xs border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 placeholder:text-text-tertiary transition-colors"
          placeholder="Cari tenant..."
          @keydown="handleKeydown"
        />
        <svg
          v-if="isLoading"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </div>

      <!-- Dropdown results -->
      <Transition
        enter-active-class="transition-all duration-150 ease-out"
        enter-from-class="opacity-0 translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-100 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-1"
      >
        <div
          v-if="isOpen && tenantOptions.length > 0"
          class="absolute z-50 w-full mt-1 bg-white border border-border rounded-lg shadow-lg overflow-hidden"
        >
          <ul class="max-h-[200px] overflow-y-auto py-1" role="listbox">
            <li
              v-for="(tenant, index) in tenantOptions"
              :key="tenant.id"
              role="option"
              :aria-selected="highlightedIndex === index"
              :class="[
                'px-3 py-2 text-xs cursor-pointer transition-colors',
                highlightedIndex === index
                  ? 'bg-surface-100 text-text-primary'
                  : 'text-text-primary hover:bg-surface-50',
              ]"
              @click="selectTenant(tenant)"
              @mouseenter="highlightedIndex = index"
            >
              <span class="truncate block">{{ tenant.nama }}</span>
            </li>
          </ul>
        </div>
      </Transition>
    </div>
  </div>
</template>
