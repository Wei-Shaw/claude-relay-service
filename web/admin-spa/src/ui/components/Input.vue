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
  height: var(--size-input-md);
  padding: 0 var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-input);
  font-size: var(--font-size-base);
  color: var(--text-primary);
  transition: var(--transition-colors);
  font-family: inherit;
  background: var(--bg-secondary);
}

.ds-input::placeholder {
  color: var(--text-muted);
}

.ds-input:focus {
  outline: none;
  border-color: var(--border-strong);
}

.ds-input:focus-visible {
  box-shadow: var(--ds-focus-ring);
}

.ds-input:disabled {
  background: var(--bg-elevated);
  color: var(--text-muted);
  cursor: not-allowed;
}

/* Sizes */
.ds-input--sm {
  height: var(--size-input-sm);
  padding: 0 var(--space-3);
  font-size: var(--font-size-sm);
}

.ds-input--lg {
  height: var(--size-input-lg);
  padding: 0 var(--space-4);
  font-size: var(--font-size-lg);
}

/* Error state */
.ds-input--error {
  border-color: var(--color-red);
}

.ds-input--error:focus {
  border-color: var(--color-red);
}

.ds-input--error:focus-visible {
  box-shadow: var(--ds-focus-ring-error);
}

/* With icon */
.ds-input--with-icon {
  padding-left: calc(var(--space-3) + 1.5rem);
}
</style>
