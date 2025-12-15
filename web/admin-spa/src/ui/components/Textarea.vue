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
  resize: vertical;
  min-height: 100px;
}

.ds-textarea:focus {
  outline: none;
  border-color: #000;
}

.ds-textarea:disabled {
  background: #fafafa;
  color: #999;
  cursor: not-allowed;
  resize: none;
}

/* Sizes */
.ds-textarea--sm {
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  min-height: 80px;
}

.ds-textarea--lg {
  padding: 1rem;
  font-size: 1rem;
  min-height: 120px;
}

/* Error state */
.ds-textarea--error {
  border-color: #e00;
}

.ds-textarea--error:focus {
  border-color: #e00;
}

/* Dark mode support */
:global(.dark) .ds-textarea {
  background: #1a1a1a;
  border-color: #2c2c2c;
  color: #fff;
}

:global(.dark) .ds-textarea:focus {
  border-color: #fff;
}

:global(.dark) .ds-textarea:disabled {
  background: #0a0a0a;
  color: #666;
}

:global(.dark) .ds-textarea--error {
  border-color: #e00;
}
</style>
