<template>
  <div
    :class="[
      'ds-spinner',
      `ds-spinner--${size}`,
      `ds-spinner--${variant}`
    ]"
    role="status"
    aria-label="Loading"
  />
</template>

<script setup>
defineProps({
  /**
   * Spinner size
   * @values sm, md, lg, xl
   */
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg', 'xl'].includes(value)
  },

  /**
   * Spinner color variant
   * @values default, primary, light
   */
  variant: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'primary', 'light'].includes(value)
  }
})
</script>

<style scoped>
/**
 * Spinner Component Styles
 * Based on Vercel Design System Demo
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-spinner {
  border: 2px solid #eaeaea;
  border-radius: 50%;
  border-top-color: #000;
  animation: ds-spinner-spin 0.8s linear infinite;
}

/* Sizes */
.ds-spinner--sm {
  width: 1rem;
  height: 1rem;
  border-width: 1.5px;
}

.ds-spinner--md {
  width: 2rem;
  height: 2rem;
  border-width: 2px;
}

.ds-spinner--lg {
  width: 3rem;
  height: 3rem;
  border-width: 3px;
}

.ds-spinner--xl {
  width: 4rem;
  height: 4rem;
  border-width: 4px;
}

/* Variants */
.ds-spinner--primary {
  border-color: rgba(0, 112, 243, 0.2);
  border-top-color: #0070f3;
}

.ds-spinner--light {
  border-color: rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
}

@keyframes ds-spinner-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .ds-spinner--default {
    border-color: #2c2c2c;
    border-top-color: #fff;
  }
}
</style>





