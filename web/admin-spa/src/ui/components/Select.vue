<template>
  <select
    v-bind="$attrs"
    :class="[
      'ds-select',
      `ds-select--${size}`,
      {
        'ds-select--error': error
      }
    ]"
    :disabled="disabled"
  >
    <slot />
  </select>
</template>

<script setup>
defineOptions({
  inheritAttrs: false
})

defineProps({
  /**
   * Select size
   * @values sm, md, lg
   */
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  },

  /**
   * Error state
   */
  error: {
    type: Boolean,
    default: false
  },

  /**
   * Disabled state
   */
  disabled: {
    type: Boolean,
    default: false
  }
})
</script>

<style scoped>
/**
 * Select Component Styles
 * Modern design system implementation
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-select {
  width: 100%;
  height: var(--size-input-md);
  padding: 0 var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-input);
  font-size: var(--font-size-base);
  color: var(--text-primary);
  transition: var(--transition-colors);
  font-family: inherit;
  background: var(--bg-secondary);
  cursor: pointer;
}

.ds-select:focus {
  outline: none;
  border-color: var(--border-strong);
}

.ds-select:focus-visible {
  box-shadow: var(--ds-focus-ring);
}

.ds-select:disabled {
  background: var(--bg-elevated);
  color: var(--text-muted);
  cursor: not-allowed;
}

/* Sizes */
.ds-select--sm {
  height: var(--size-input-sm);
  padding: 0 var(--space-3);
  font-size: var(--font-size-sm);
}

.ds-select--lg {
  height: var(--size-input-lg);
  padding: 0 var(--space-4);
  font-size: var(--font-size-lg);
}

/* Error state */
.ds-select--error {
  border-color: var(--color-red);
}

.ds-select--error:focus {
  border-color: var(--color-red);
}

.ds-select--error:focus-visible {
  box-shadow: var(--ds-focus-ring-error);
}
</style>
