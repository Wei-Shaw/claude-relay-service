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
 * Based on Vercel Design System Demo
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-code-block {
  background: #000;
  color: #fff;
  padding: 1.5rem;
  border-radius: 5px;
  overflow-x: auto;
  font-family: 'Monaco', 'Menlo', 'Consolas', 'Courier New', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
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
  background: #fafafa;
  color: #000;
  border: 1px solid #eaeaea;
  border-radius: 3px;
  font-size: 0.875em;
}

/* Dark mode support */
:global(.dark) .ds-code-block {
  background: #fff;
  color: #000;
}

:global(.dark) .ds-code-block--inline {
  background: #1a1a1a;
  color: #fff;
  border-color: #2c2c2c;
}
</style>
