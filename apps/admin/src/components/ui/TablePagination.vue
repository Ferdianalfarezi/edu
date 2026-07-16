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
  <div v-if="totalPages > 1" class="flex flex-col items-center gap-2 py-4">
    <!-- Pagination controls -->
    <div class="flex items-center justify-center gap-2">
      <!-- Previous button -->
      <button
        :disabled="currentPage === 1"
        :class="[
          'inline-flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-full transition-colors',
          currentPage === 1
            ? 'border border-border text-text-tertiary opacity-50 cursor-not-allowed'
            : 'bg-primary-600 text-white hover:bg-primary-700',
        ]"
        @click="onPrev"
      >
        <span>←</span>
        <span>Previous</span>
      </button>

      <!-- Page numbers -->
      <span
        v-for="(page, idx) in visiblePages"
        :key="page === -1 ? `ellipsis-${idx}` : `page-${page}`"
        class="inline-flex"
      >
        <span v-if="page === -1" class="text-text-tertiary text-sm px-1 self-center"> ... </span>
        <button
          v-else
          :class="[
            'w-9 h-9 flex items-center justify-center rounded-full text-sm font-medium transition-colors',
            page === currentPage
              ? 'bg-primary-600 text-white'
              : 'bg-surface-50 text-text-primary hover:bg-primary-100',
          ]"
          @click="onPageClick(page)"
        >
          {{ page }}
        </button>
      </span>

      <!-- Next button -->
      <button
        :disabled="currentPage === totalPages"
        :class="[
          'inline-flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-full transition-colors',
          currentPage === totalPages
            ? 'border border-border text-text-tertiary opacity-50 cursor-not-allowed'
            : 'bg-primary-600 text-white hover:bg-primary-700',
        ]"
        @click="onNext"
      >
        <span>Next</span>
        <span>→</span>
      </button>

      <!-- Page size dropdown -->
      <select
        :value="pageSize"
        :disabled="loading"
        class="rounded-full border border-border bg-white px-3 py-2 text-sm font-medium text-text-primary appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        @change="onPageSizeChange"
      >
        <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }} Items</option>
      </select>
    </div>

    <!-- Info text -->
    <p class="text-sm text-text-secondary text-center mt-2">
      Menampilkan {{ displayedItems }} dari {{ totalCount }} entri (Halaman {{ currentPage }} dari
      {{ totalPages }})
    </p>
  </div>
</template>
