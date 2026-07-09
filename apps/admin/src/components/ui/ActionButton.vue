<script setup lang="ts">
/**
 * ActionButton — Standardized action button for tables and inline actions.
 *
 * Color variants (consistent UX meaning):
 * - primary: View, detail, info actions (blue)
 * - warning: Edit, modify actions (amber/yellow)
 * - danger: Delete, cancel, remove actions (red)
 * - success: Approve, pay, download, positive actions (green)
 * - neutral: Secondary/less important actions (gray)
 * - purple: Special/unique actions (purple)
 */

export type ActionVariant = 'primary' | 'warning' | 'danger' | 'success' | 'neutral' | 'purple';
export type ActionIcon =
  | 'edit'
  | 'delete'
  | 'view'
  | 'download'
  | 'check'
  | 'x'
  | 'log'
  | 'pay'
  | 'cancel'
  | 'activate'
  | 'remove'
  | 'assign'
  | 'revert'
  | 'none';

withDefaults(
  defineProps<{
    variant?: ActionVariant;
    icon?: ActionIcon;
    disabled?: boolean;
    size?: 'xs' | 'sm';
  }>(),
  {
    variant: 'primary',
    icon: 'none',
    disabled: false,
    size: 'xs',
  },
);

defineEmits<{
  click: [e: MouseEvent];
}>();
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    :class="[
      'inline-flex items-center gap-1 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
      size === 'xs' ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-xs',
      variant === 'primary' && 'text-primary-700 bg-primary-50 hover:bg-primary-100',
      variant === 'warning' && 'text-warning-700 bg-warning-50 hover:bg-warning-50/80',
      variant === 'danger' && 'text-danger-700 bg-danger-50 hover:bg-danger-50/80',
      variant === 'success' && 'text-success-700 bg-success-50 hover:bg-success-50/80',
      variant === 'neutral' && 'text-text-secondary bg-surface-100 hover:bg-surface-200',
      variant === 'purple' && 'text-purple-700 bg-purple-50 hover:bg-purple-100',
    ]"
    @click="$emit('click', $event)"
  >
    <!-- Icon -->
    <svg
      v-if="icon !== 'none'"
      class="w-3.5 h-3.5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
    >
      <!-- Edit (pencil) -->
      <path
        v-if="icon === 'edit'"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
      />
      <!-- Delete (trash) -->
      <path
        v-if="icon === 'delete'"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
      <!-- View (eye) -->
      <path
        v-if="icon === 'view'"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        v-if="icon === 'view'"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
      <!-- Download (arrow-down-tray) -->
      <path
        v-if="icon === 'download'"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
      />
      <!-- Check (checkmark) -->
      <path
        v-if="icon === 'check'"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M5 13l4 4L19 7"
      />
      <!-- X (close/cancel) -->
      <path
        v-if="icon === 'x'"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
      <!-- Log (clipboard-list) -->
      <path
        v-if="icon === 'log'"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
      <!-- Pay (banknotes) -->
      <path
        v-if="icon === 'pay'"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
      />
      <!-- Cancel (no-symbol) -->
      <path
        v-if="icon === 'cancel'"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
      />
      <!-- Activate (play) -->
      <path
        v-if="icon === 'activate'"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
      />
      <!-- Remove (minus-circle) -->
      <path
        v-if="icon === 'remove'"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
      <!-- Assign (user-plus) -->
      <path
        v-if="icon === 'assign'"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z"
      />
      <!-- Revert (arrow-uturn-left) -->
      <path
        v-if="icon === 'revert'"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
      />
    </svg>

    <!-- Label -->
    <slot />
  </button>
</template>
