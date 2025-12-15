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
 * Based on Vercel Design System Demo
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-select {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #eaeaea;
  border-radius: 5px;
  font-size: 0.875rem;
  color: #000;
  transition: all 0.2s;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell',
    sans-serif;
  background: #fff;
  cursor: pointer;
}

.ds-select:focus {
  outline: none;
  border-color: #000;
}

.ds-select:disabled {
  background: #fafafa;
  color: #999;
  cursor: not-allowed;
}

/* Sizes */
.ds-select--sm {
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
}

.ds-select--lg {
  padding: 1rem;
  font-size: 1rem;
}

/* Error state */
.ds-select--error {
  border-color: #e00;
}

.ds-select--error:focus {
  border-color: #e00;
}

/* Dark mode support */
:global(.dark) .ds-select {
  background: #1a1a1a;
  border-color: #2c2c2c;
  color: #fff;
}

:global(.dark) .ds-select:focus {
  border-color: #fff;
}

:global(.dark) .ds-select:disabled {
  background: #0a0a0a;
  color: #666;
}

:global(.dark) .ds-select--error {
  border-color: #e00;
}
</style>
