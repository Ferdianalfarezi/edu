<script setup lang="ts">
/**
 * QuickActionCard — Clickable shortcut card for frequent operations.
 *
 * Renders a horizontal card with a colored icon badge and descriptive text.
 * Supports optional router-link navigation via the `to` prop, or emits
 * a `click` event when used as a plain div.
 */

export interface QuickActionCardProps {
  title: string;
  description: string;
  icon: string; // SVG path data
  iconColor: string; // Tailwind bg class e.g. 'bg-primary-600'
  to?: string; // Optional route path
}

const props = defineProps<QuickActionCardProps>();

const emit = defineEmits<{
  (e: 'click'): void;
}>();

function handleClick() {
  if (!props.to) {
    emit('click');
  }
}
</script>

<template>
  <component
    :is="to ? 'router-link' : 'div'"
    :to="to || undefined"
    class="quick-action-card"
    @click="handleClick"
  >
    <!-- Icon Badge -->
    <div class="icon-badge" :class="iconColor">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" :d="icon" />
      </svg>
    </div>

    <!-- Text Content -->
    <div class="card-text">
      <span class="card-title">{{ title }}</span>
      <span class="card-description">{{ description }}</span>
    </div>
  </component>
</template>

<style scoped>
.quick-action-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: #ffffff;
  border-radius: 12px;
  padding: 20px;
  border: 2px solid var(--color-surface-200);
  cursor: pointer;
  transition: all 200ms ease;
  text-decoration: none;
  color: inherit;
}

.quick-action-card:hover {
  transform: translateY(-2px);
  border-color: var(--color-primary-300);
  box-shadow: 0 6px 20px rgba(37, 99, 235, 0.12);
}

.icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  min-width: 48px;
  border-radius: 12px;
}

.card-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.3;
}

.card-description {
  font-size: 13px;
  color: var(--color-text-tertiary);
  line-height: 1.4;
}
</style>
