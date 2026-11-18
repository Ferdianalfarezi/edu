<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number | null | undefined;
    options: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    clearable?: boolean;
    searchable?: boolean;
    error?: boolean;
    errorMessage?: string;
    label?: string;
    required?: boolean;
    size?: 'sm' | 'md';
    emptyText?: string;
  }>(),
  {
    placeholder: '-- Pilih --',
    disabled: false,
    clearable: false,
    searchable: true,
    error: false,
    errorMessage: '',
    label: '',
    required: false,
    size: 'md',
    emptyText: 'Tidak ada data ditemukan',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | number | null | ''];
  change: [value: string | number | null | ''];
}>();

const isOpen = ref(false);
const searchQuery = ref('');
const highlightedIndex = ref(-1);
const triggerRef = ref<HTMLElement | null>(null);
const dropdownRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);

const dropdownStyle = ref<{ top: string; left: string; width: string }>({
  top: '0px',
  left: '0px',
  width: '0px',
});

const selectedOption = computed(() => {
  if (props.modelValue == null || props.modelValue === '') return undefined;
  return props.options.find((opt) => opt.value === props.modelValue);
});

const filteredOptions = computed(() => {
  if (!searchQuery.value) return props.options;
  const query = searchQuery.value.toLowerCase();
  return props.options.filter((opt) => opt.label.toLowerCase().includes(query));
});

function updateDropdownPosition() {
  if (!triggerRef.value) return;
  // Dropdown memakai position: fixed, jadi cukup koordinat layar (tanpa scrollX/scrollY)
  const rect = triggerRef.value.getBoundingClientRect();
  dropdownStyle.value = {
    top: `${rect.bottom}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
  };
}

function open() {
  if (props.disabled) return;
  // Hitung posisi SEBELUM dropdown tampil; kalau sesudahnya, dropdown pertama kali
  // muncul dari pojok kiri atas (0,0) lalu "terbang" ke tempatnya.
  updateDropdownPosition();
  isOpen.value = true;
  searchQuery.value = '';
  highlightedIndex.value = -1;
  nextTick(() => {
    inputRef.value?.focus();
    window.addEventListener('scroll', updateDropdownPosition, true);
    window.addEventListener('resize', updateDropdownPosition);
  });
}

function close() {
  isOpen.value = false;
  searchQuery.value = '';
  highlightedIndex.value = -1;
  window.removeEventListener('scroll', updateDropdownPosition, true);
  window.removeEventListener('resize', updateDropdownPosition);
}

function toggle() {
  if (isOpen.value) {
    close();
  } else {
    open();
  }
}

function selectOption(option: SelectOption) {
  if (option.disabled) return;
  emit('update:modelValue', option.value);
  emit('change', option.value);
  close();
}

function clear(e: Event) {
  e.stopPropagation();
  emit('update:modelValue', '');
  emit('change', '');
}

function handleKeydown(e: KeyboardEvent) {
  if (!isOpen.value) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      open();
    }
    return;
  }

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      highlightedIndex.value = Math.min(
        highlightedIndex.value + 1,
        filteredOptions.value.length - 1,
      );
      scrollToHighlighted();
      break;
    case 'ArrowUp':
      e.preventDefault();
      highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0);
      scrollToHighlighted();
      break;
    case 'Enter':
      e.preventDefault();
      if (highlightedIndex.value >= 0 && filteredOptions.value[highlightedIndex.value]) {
        selectOption(filteredOptions.value[highlightedIndex.value]);
      }
      break;
    case 'Escape':
      e.preventDefault();
      close();
      break;
  }
}

function scrollToHighlighted() {
  nextTick(() => {
    const list = listRef.value;
    if (!list) return;
    const item = list.children[highlightedIndex.value] as HTMLElement;
    if (item) {
      item.scrollIntoView({ block: 'nearest' });
    }
  });
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as Node;
  // Check if click is inside the trigger element
  const insideTrigger = triggerRef.value?.contains(target) ?? false;
  // Check if click is inside the teleported dropdown (which lives outside triggerRef in the DOM)
  const insideDropdown = dropdownRef.value?.contains(target) ?? false;
  if (!insideTrigger && !insideDropdown) {
    close();
  }
}

watch(
  () => searchQuery.value,
  () => {
    highlightedIndex.value = filteredOptions.value.length > 0 ? 0 : -1;
  },
);

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside);
  // Clean up listeners in case component is destroyed while dropdown is open
  window.removeEventListener('scroll', updateDropdownPosition, true);
  window.removeEventListener('resize', updateDropdownPosition);
});
</script>

<template>
  <div class="relative w-full">
    <!-- Label -->
    <label v-if="label" class="block text-[15px] font-medium text-text-primary mb-1.5">
      {{ label }}
      <span v-if="required" class="text-danger-500">*</span>
    </label>

    <!-- Trigger wrapper — used for getBoundingClientRect positioning -->
    <div ref="triggerRef" class="relative w-full">
      <button
        type="button"
        :disabled="disabled"
        :class="[
          'search-select-trigger w-full flex items-center justify-between gap-2 border bg-white text-left',
          size === 'sm' ? 'px-2.5 py-1.5 text-[13px]' : 'px-3 py-2.5 text-[15px]',
          disabled
            ? 'bg-surface-100 text-text-tertiary cursor-not-allowed border-border'
            : error
              ? 'border-danger-500 focus:outline-2 focus:outline-primary-500 focus:outline-offset-2'
              : isOpen
                ? 'border-primary-500 outline-2 outline-primary-500 outline-offset-2'
                : 'border-border hover:border-border-hover focus:outline-2 focus:outline-primary-500 focus:outline-offset-2',
        ]"
        @click="toggle"
        @keydown="handleKeydown"
      >
        <span
          :class="['truncate flex-1', selectedOption ? 'text-text-primary' : 'text-text-tertiary']"
        >
          {{ selectedOption ? selectedOption.label : placeholder }}
        </span>

        <div class="flex items-center gap-1 shrink-0">
          <!-- Clear button -->
          <span
            v-if="clearable && modelValue != null && modelValue !== '' && !disabled"
            class="p-0.5 rounded hover:bg-surface-200 text-text-tertiary hover:text-text-secondary transition-colors"
            @click="clear"
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
          </span>

          <!-- Chevron -->
          <svg
            :class="['w-4 h-4 text-text-tertiary transition-transform', isOpen ? 'rotate-180' : '']"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
    </div>

    <!-- Dropdown — teleported to body so it escapes overflow:hidden ancestors (e.g. BaseModal) -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-[opacity,transform] duration-150 ease-out"
        enter-from-class="opacity-0 translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-[opacity,transform] duration-100 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-1"
      >
        <div
          v-if="isOpen"
          ref="dropdownRef"
          :style="dropdownStyle"
          class="search-select-dropdown fixed z-9999 mt-1 bg-white border border-border shadow-lg overflow-hidden"
        >
          <!-- Search input -->
          <div v-if="searchable" class="p-2 border-b border-border">
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
                class="search-select-input w-full pl-8 pr-3 py-1.5 text-[15px] border border-border bg-white placeholder:text-text-tertiary focus:outline-2 focus:outline-primary-500 focus:outline-offset-2"
                placeholder="Cari..."
                @keydown="handleKeydown"
              />
            </div>
          </div>

          <!-- Options list -->
          <ul ref="listRef" class="max-h-50 overflow-y-auto py-1" role="listbox">
            <li
              v-for="(option, index) in filteredOptions"
              :key="option.value"
              role="option"
              :aria-selected="option.value === modelValue"
              :class="[
                'px-3 py-2 text-[15px] cursor-pointer transition-colors',
                option.disabled
                  ? 'text-text-tertiary cursor-not-allowed'
                  : option.value === modelValue
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : highlightedIndex === index
                      ? 'bg-primary-50 text-text-primary'
                      : 'text-text-primary hover:bg-primary-50',
              ]"
              @click="!option.disabled && selectOption(option)"
              @mouseenter="highlightedIndex = index"
            >
              <div class="flex items-center justify-between">
                <span class="truncate">{{ option.label }}</span>
                <svg
                  v-if="option.value === modelValue"
                  class="w-4 h-4 text-primary-600 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </li>

            <!-- Empty state -->
            <li v-if="filteredOptions.length === 0" class="px-3 py-4 text-center">
              <p class="text-[15px] text-text-tertiary">{{ emptyText }}</p>
            </li>
          </ul>
        </div>
      </Transition>
    </Teleport>

    <!-- Error message -->
    <p v-if="error && errorMessage" class="mt-1 text-[13px] text-danger-500">
      {{ errorMessage }}
    </p>
  </div>
</template>

<style scoped>
.search-select-trigger {
  border-radius: var(--radius-xs);
  transition: border-color 200ms ease;
}

.search-select-dropdown {
  border-radius: var(--radius-xs);
}

.search-select-input {
  border-radius: var(--radius-xs);
  transition: border-color 200ms ease;
}
</style>
