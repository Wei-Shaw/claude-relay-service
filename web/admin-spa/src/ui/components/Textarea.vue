<template>
  <textarea
    v-bind="$attrs"
    :class="[
      'ds-textarea',
      `ds-textarea--${size}`,
      {
        'ds-textarea--error': error
      }
    ]"
    :disabled="disabled"
    :rows="rows"
  />
</template>

<script setup>
defineOptions({
  inheritAttrs: false
})

defineProps({
  /**
   * Textarea size
   * @values sm, md, lg
   */
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  },

  /**
   * Number of visible rows
   */
  rows: {
    type: Number,
    default: 4
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
 * Textarea Component Styles
 * Modern design system implementation
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-textarea {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-input);
  font-size: var(--font-size-base);
  color: var(--text-primary);
  transition: var(--transition-colors);
  font-family: inherit;
  background: var(--bg-secondary);
  resize: vertical;
  min-height: 100px;
}

.ds-textarea::placeholder {
  color: var(--text-muted);
}

.ds-textarea:focus {
  outline: none;
  border-color: var(--border-strong);
}

.ds-textarea:focus-visible {
  box-shadow: var(--ds-focus-ring);
}

.ds-textarea:disabled {
  background: var(--bg-elevated);
  color: var(--text-muted);
  cursor: not-allowed;
  resize: none;
}

/* Sizes */
.ds-textarea--sm {
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  min-height: 80px;
}

.ds-textarea--lg {
  padding: var(--space-4);
  font-size: var(--font-size-lg);
  min-height: 120px;
}

/* Error state */
.ds-textarea--error {
  border-color: var(--color-red);
}

.ds-textarea--error:focus {
  border-color: var(--color-red);
}

.ds-textarea--error:focus-visible {
  box-shadow: var(--ds-focus-ring-error);
}
</style>
