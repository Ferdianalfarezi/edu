<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  loading?: boolean;
  pageSizeOptions?: number[];
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  pageSizeOptions: () => [10, 15, 25, 50],
});

const emit = defineEmits<{
  (e: 'page-change', page: number): void;
  (e: 'page-size-change', size: number): void;
}>();

const visiblePages = computed(() => {
  const pages: number[] = [];
  const total = props.totalPages;
  const current = props.currentPage;

  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current > 3) pages.push(-1);
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push(-1);
    pages.push(total);
  }
  return pages;
});

const displayedItems = computed(() => {
  if (props.totalCount === 0) return 0;
  const start = (props.currentPage - 1) * props.pageSize;
  return Math.min(props.pageSize, Math.max(0, props.totalCount - start));
});

function onPrev() {
  if (props.currentPage > 1) {
    emit('page-change', props.currentPage - 1);
  }
}

function onNext() {
  if (props.currentPage < props.totalPages) {
    emit('page-change', props.currentPage + 1);
  }
}

function onPageClick(page: number) {
  if (page !== props.currentPage) {
    emit('page-change', page);
  }
}

function onPageSizeChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  emit('page-size-change', Number(target.value));
}
</script>

<template>
  <div v-if="totalPages > 1" class="pagination-container">
    <!-- Pagination controls -->
    <div class="pagination-controls">
      <!-- Previous button -->
      <button
        :disabled="currentPage === 1"
        class="pagination-arrow"
        :class="{ 'pagination-arrow--disabled': currentPage === 1 }"
        @click="onPrev"
      >
        <span>←</span>
      </button>

      <!-- Page numbers -->
      <span
        v-for="(page, idx) in visiblePages"
        :key="page === -1 ? `ellipsis-${idx}` : `page-${page}`"
        class="inline-flex"
      >
        <span v-if="page === -1" class="pagination-ellipsis"> ... </span>
        <button
          v-else
          class="pagination-page"
          :class="page === currentPage ? 'pagination-page--active' : 'pagination-page--inactive'"
          @click="onPageClick(page)"
        >
          {{ page }}
        </button>
      </span>

      <!-- Next button -->
      <button
        :disabled="currentPage === totalPages"
        class="pagination-arrow"
        :class="{ 'pagination-arrow--disabled': currentPage === totalPages }"
        @click="onNext"
      >
        <span>→</span>
      </button>

      <!-- Page size dropdown -->
      <select
        :value="pageSize"
        :disabled="loading"
        class="pagination-select"
        @change="onPageSizeChange"
      >
        <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }} Items</option>
      </select>
    </div>

    <!-- Info text -->
    <p class="pagination-info">
      Menampilkan {{ displayedItems }} dari {{ totalCount }} entri (Halaman {{ currentPage }} dari
      {{ totalPages }})
    </p>
  </div>
</template>

<style scoped>
.pagination-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
}

.pagination-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

/* Page number buttons — 40px touch targets */
.pagination-page {
  min-width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-xs);
  font-size: 14px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
  border: none;
}

.pagination-page--active {
  background-color: var(--color-primary-600);
  color: #ffffff;
}

.pagination-page--inactive {
  background-color: #ffffff;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.pagination-page--inactive:hover {
  background-color: var(--color-primary-50);
  color: var(--color-primary-700);
}

/* Prev/Next arrow buttons — 40px touch targets */
.pagination-arrow {
  min-width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-xs);
  font-size: 14px;
  font-weight: 600;
  background-color: #ffffff;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: all 200ms ease;
}

.pagination-arrow:hover:not(:disabled) {
  background-color: var(--color-primary-50);
  color: var(--color-primary-700);
}

.pagination-arrow--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Ellipsis */
.pagination-ellipsis {
  color: var(--color-text-tertiary);
  font-size: 14px;
  padding: 0 4px;
  align-self: center;
}

/* Page size select */
.pagination-select {
  height: 40px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--color-border);
  background-color: #ffffff;
  padding: 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  appearance: none;
  cursor: pointer;
  transition: all 200ms ease;
}

.pagination-select:hover {
  border-color: var(--color-border-hover);
}

.pagination-select:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Info text */
.pagination-info {
  font-size: 14px;
  color: var(--color-text-secondary);
  text-align: center;
  margin-top: 8px;
}
</style>
