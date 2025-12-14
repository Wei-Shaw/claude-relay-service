<template>
  <div
    :class="['ds-alert', `ds-alert--${variant}`, { 'ds-alert--dismissible': dismissible }]"
    role="alert"
  >
    <div class="ds-alert__content">
      <slot />
    </div>
    <button
      v-if="dismissible"
      aria-label="Close alert"
      class="ds-alert__close"
      type="button"
      @click="$emit('dismiss')"
    >
      ×
    </button>
  </div>
</template>

<script setup>
defineEmits(['dismiss'])

defineProps({
  /**
   * Alert variant
   * @values success, error, warning, info
   */
  variant: {
    type: String,
    default: 'info',
    validator: (value) => ['success', 'error', 'warning', 'info'].includes(value)
  },

  /**
   * Show dismiss button
   */
  dismissible: {
    type: Boolean,
    default: false
  }
})
</script>

<style scoped>
/**
 * Alert Component Styles
 * Based on Vercel Design System Demo
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-alert {
  padding: 1rem 1.25rem;
  border: 1px solid;
  border-radius: 5px;
  font-size: 0.875rem;
  line-height: 1.5;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell',
    sans-serif;
}

.ds-alert--dismissible {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 1rem;
}

.ds-alert__content {
  flex: 1;
}

.ds-alert__close {
  background: none;
  border: none;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: inherit;
  opacity: 0.7;
  transition: opacity 0.2s;
  padding: 0;
  flex-shrink: 0;
}

.ds-alert__close:hover {
  opacity: 1;
}

/* Variants */
.ds-alert--success {
  background: #f0f9ff;
  color: #0070f3;
  border-color: #0070f3;
}

.ds-alert--error {
  background: #fff0f0;
  color: #e00;
  border-color: #e00;
}

.ds-alert--warning {
  background: #fffbeb;
  color: #f5a623;
  border-color: #f5a623;
}

.ds-alert--info {
  background: #f0f9ff;
  color: #0070f3;
  border-color: #0070f3;
}

/* Dark mode support */
:global(.dark) .ds-alert--success {
  background: rgba(0, 112, 243, 0.1);
  border-color: #0070f3;
}

:global(.dark) .ds-alert--error {
  background: rgba(238, 0, 0, 0.1);
  border-color: #e00;
}

:global(.dark) .ds-alert--warning {
  background: rgba(245, 166, 35, 0.1);
  border-color: #f5a623;
}

:global(.dark) .ds-alert--info {
  background: rgba(0, 112, 243, 0.1);
  border-color: #0070f3;
}
</style>
