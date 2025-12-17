<template>
  <pre :class="['ds-code-block', `ds-code-block--${variant}`]"><code><slot /></code></pre>
</template>

<script setup>
defineProps({
  /**
   * Visual variant
   * @values default, inline
   */
  variant: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'inline'].includes(value)
  }
})
</script>

<style scoped>
/**
 * CodeBlock Component Styles
 * Modern design system implementation
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-code-block {
  background: var(--color-black);
  color: var(--color-white);
  padding: var(--card-padding);
  border-radius: var(--radius-button);
  overflow-x: auto;
  font-family: 'Monaco', 'Menlo', 'Consolas', 'Courier New', monospace;
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed);
  margin: 0;
}

.ds-code-block code {
  color: inherit;
  background: none;
  padding: 0;
  border: none;
  border-radius: 0;
  font-family: inherit;
  font-size: inherit;
}

/* Inline variant */
.ds-code-block--inline {
  display: inline;
  padding: 0.125rem 0.375rem;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: 3px;
  font-size: 0.875em;
}

/* Dark mode support */
::global(.dark) .ds-code-block {
  background: #0a0a0a;
  color: var(--color-white);
}
</style>
