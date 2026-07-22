<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <div
    class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-(--spacing-section)"
  >
    <div>
      <h1 class="text-[26px] font-extrabold leading-tight text-text-primary">{{ title }}</h1>
      <p v-if="description" class="text-[15px] text-text-secondary mt-1">{{ description }}</p>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <slot name="actions" />
    </div>
  </div>
</template>
