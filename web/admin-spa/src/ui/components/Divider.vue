<template>
  <div
    v-if="withText && ($slots.default || text)"
    :class="['ds-divider-with-text', `ds-divider--${variant}`]"
  >
    <span class="ds-divider-text">
      <slot>{{ text }}</slot>
    </span>
  </div>
  <hr v-else :class="['ds-divider', `ds-divider--${variant}`]" />
</template>

<script setup>
defineProps({
  /**
   * Text content (alternative to slot)
   */
  text: {
    type: String,
    default: ''
  },

  /**
   * Show divider with text
   */
  withText: {
    type: Boolean,
    default: false
  },

  /**
   * Visual variant
   * @values default, strong
   */
  variant: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'strong'].includes(value)
  }
})
</script>

<style scoped>
/**
 * Divider Component Styles
 * Based on Vercel Design System Demo
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-divider {
  border: none;
  border-top: 1px solid #eaeaea;
  margin: 1rem 0;
}

.ds-divider--strong {
  border-top-width: 2px;
  border-top-color: #000;
}

.ds-divider-with-text {
  display: flex;
  align-items: center;
  text-align: center;
  margin: 1rem 0;
}

.ds-divider-with-text::before,
.ds-divider-with-text::after {
  content: '';
  flex: 1;
  border-top: 1px solid #eaeaea;
}

.ds-divider-with-text.ds-divider--strong::before,
.ds-divider-with-text.ds-divider--strong::after {
  border-top-width: 2px;
  border-top-color: #000;
}

.ds-divider-text {
  padding: 0 1rem;
  font-size: 0.875rem;
  color: #666;
  font-weight: 500;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell',
    sans-serif;
}

/* Dark mode support */
:global(.dark) .ds-divider {
  border-top-color: #2c2c2c;
}

:global(.dark) .ds-divider--strong {
  border-top-color: #fff;
}

:global(.dark) .ds-divider-with-text::before,
:global(.dark) .ds-divider-with-text::after {
  border-top-color: #2c2c2c;
}

:global(.dark) .ds-divider-with-text.ds-divider--strong::before,
:global(.dark) .ds-divider-with-text.ds-divider--strong::after {
  border-top-color: #fff;
}

:global(.dark) .ds-divider-text {
  color: #b3b3b3;
}
</style>
