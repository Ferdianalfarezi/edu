<script setup lang="ts">
/**
 * StatCard — Dashboard metric card with colored gradient variants.
 *
 * Displays a single key metric with an icon badge, value, label,
 * and optional change indicator. Supports 4 color variants.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */

export type StatCardVariant = 'blue' | 'green' | 'amber' | 'purple';

interface Props {
  label: string;
  value: string | number;
  variant: StatCardVariant;
  icon: string;
  change?: string;
  /** Teks rincian kecil di bawah label, mis. "14 aktif · 1 tidak aktif" */
  detail?: string;
}

withDefaults(defineProps<Props>(), {
  change: undefined,
  detail: undefined,
});
</script>

<template>
  <div :class="['stat-card', `stat-card--${variant}`]">
    <!-- Icon Badge (top-right) -->
    <div :class="['stat-card__icon-badge', `stat-card__icon-badge--${variant}`]">
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" :d="icon" />
      </svg>
    </div>

    <!-- Content (bottom-left) -->
    <div class="stat-card__content">
      <span class="stat-card__value">{{ value }}</span>
      <span class="stat-card__label">{{ label }}</span>
      <span v-if="detail" class="stat-card__detail">{{ detail }}</span>

      <!-- Change indicator badge -->
      <span v-if="change" :class="['stat-card__change', `stat-card__change--${variant}`]">
        {{ change }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.stat-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 22px;
  border-radius: 16px;
  border: 2px solid;
  transition: all 200ms ease;
  cursor: default;
}

.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-hover-lift);
}

/* ===== Variant Backgrounds & Borders ===== */

.stat-card--blue {
  background: linear-gradient(135deg, #eef4ff, #dbeafe);
  border-color: var(--color-primary-200);
}

.stat-card--green {
  background: linear-gradient(135deg, #ecfdf5, #d1fae5);
  border-color: #bbf7d0;
}

.stat-card--amber {
  background: linear-gradient(135deg, #fffbeb, #fef3c7);
  border-color: var(--color-accent-200);
}

.stat-card--purple {
  background: linear-gradient(135deg, #faf5ff, #f3e8ff);
  border-color: var(--color-purple-200);
}

/* ===== Icon Badge ===== */

.stat-card__icon-badge {
  position: absolute;
  top: 22px;
  right: 22px;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.stat-card__icon-badge--blue {
  background-color: var(--color-primary-600);
}

.stat-card__icon-badge--green {
  background-color: var(--color-success-600);
}

.stat-card__icon-badge--amber {
  background-color: var(--color-accent-600);
}

.stat-card__icon-badge--purple {
  background-color: var(--color-purple-600);
}

/* ===== Content ===== */

.stat-card__content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 32px;
}

.stat-card__value {
  font-size: 32px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--color-text-primary);
}

.stat-card__label {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.stat-card__detail {
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* ===== Change Indicator Badge ===== */

.stat-card__change {
  display: inline-flex;
  align-items: center;
  margin-top: 8px;
  padding: 4px 10px;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 700;
  width: fit-content;
}

.stat-card__change--blue {
  background-color: rgba(37, 99, 235, 0.1);
  color: var(--color-primary-700);
}

.stat-card__change--green {
  background-color: rgba(22, 163, 74, 0.1);
  color: var(--color-success-700);
}

.stat-card__change--amber {
  background-color: rgba(217, 119, 6, 0.1);
  color: var(--color-accent-700);
}

.stat-card__change--purple {
  background-color: rgba(147, 51, 234, 0.1);
  color: var(--color-purple-700);
}
</style>
