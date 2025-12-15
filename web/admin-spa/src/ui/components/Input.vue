<template>
  <input
    v-bind="$attrs"
    :class="[
      'ds-input',
      `ds-input--${size}`,
      {
        'ds-input--error': error,
        'ds-input--with-icon': hasIcon
      }
    ]"
    :disabled="disabled"
  />
</template>

<script setup>
defineOptions({
  inheritAttrs: false
})

defineProps({
  /**
   * Input size
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
  },

  /**
   * Has icon (adds left padding)
   */
  hasIcon: {
    type: Boolean,
    default: false
  }
})
</script>

<style scoped>
/**
 * Input Component Styles
 * Modern design system implementation
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-input {
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
}

.ds-input:focus {
  outline: none;
  border-color: #000;
}

.ds-input:disabled {
  background: #fafafa;
  color: #999;
  cursor: not-allowed;
}

/* Sizes */
.ds-input--sm {
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
}

.ds-input--lg {
  padding: 1rem;
  font-size: 1rem;
}

/* Error state */
.ds-input--error {
  border-color: #e00;
}

.ds-input--error:focus {
  border-color: #e00;
}

/* With icon */
.ds-input--with-icon {
  padding-left: 2.5rem;
}

/* Dark mode support */
:global(.dark) .ds-input {
  background: #1a1a1a;
  border-color: #2c2c2c;
  color: #fff;
}

:global(.dark) .ds-input:focus {
  border-color: #fff;
}

:global(.dark) .ds-input:disabled {
  background: #0a0a0a;
  color: #666;
}

:global(.dark) .ds-input--error {
  border-color: #e00;
}
</style>
