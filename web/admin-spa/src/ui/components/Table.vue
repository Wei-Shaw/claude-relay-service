<template>
  <div class="ds-table-container">
    <table
      :class="[
        'ds-table',
        {
          'ds-table--compact': compact,
          'ds-table--bordered': bordered,
          'ds-table--striped': striped
        }
      ]"
    >
      <slot />
    </table>
  </div>
</template>

<script setup>
defineProps({
  /**
   * Compact spacing
   */
  compact: {
    type: Boolean,
    default: false
  },

  /**
   * Show all borders
   */
  bordered: {
    type: Boolean,
    default: false
  },

  /**
   * Striped rows
   */
  striped: {
    type: Boolean,
    default: false
  }
})
</script>

<style scoped>
/**
 * Table Component Styles
 * Based on Vercel Design System Demo
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-table-container {
  border: 1px solid #eaeaea;
  overflow-x: auto;
}

.ds-table {
  width: 100%;
  border-collapse: collapse;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell',
    sans-serif;
}

.ds-table :deep(th) {
  background: #fafafa;
  padding: 0.75rem 1rem;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #eaeaea;
}

.ds-table :deep(td) {
  padding: 1rem;
  border-bottom: 1px solid #eaeaea;
  color: #000;
  font-size: 0.875rem;
}

.ds-table :deep(tbody tr:hover) {
  background: #fafafa;
}

.ds-table :deep(tbody tr:last-child td) {
  border-bottom: none;
}

/* Compact variant */
.ds-table--compact :deep(th) {
  padding: 0.5rem 1rem;
}

.ds-table--compact :deep(td) {
  padding: 0.625rem 1rem;
}

/* Bordered variant */
.ds-table--bordered :deep(th),
.ds-table--bordered :deep(td) {
  border: 1px solid #eaeaea;
}

/* Striped variant */
.ds-table--striped :deep(tbody tr:nth-child(even)) {
  background: #fafafa;
}

/* Dark mode support */
:global(.dark) .ds-table-container {
  border-color: #2c2c2c;
}

:global(.dark) .ds-table :deep(th) {
  background: #0a0a0a;
  color: #b3b3b3;
  border-bottom-color: #2c2c2c;
}

:global(.dark) .ds-table :deep(td) {
  color: #fff;
  border-bottom-color: #2c2c2c;
}

:global(.dark) .ds-table :deep(tbody tr:hover) {
  background: #1a1a1a;
}

:global(.dark) .ds-table--striped :deep(tbody tr:nth-child(even)) {
  background: #0a0a0a;
}

:global(.dark) .ds-table--bordered :deep(th),
:global(.dark) .ds-table--bordered :deep(td) {
  border-color: #2c2c2c;
}
</style>
