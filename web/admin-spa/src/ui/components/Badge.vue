<template>
  <span
    :class="[
      'ds-badge',
      `ds-badge--${variant}`,
      `ds-badge--${size}`,
      {
        'ds-badge--dot': dot,
        'ds-badge--count': count
      }
    ]"
  >
    <span v-if="dot" class="ds-badge__dot" />
    <slot />
  </span>
</template>

<script setup>
defineProps({
  /**
   * Badge variant
   * @values success, inactive, warning, error, info, neutral
   */
  variant: {
    type: String,
    default: 'neutral',
    validator: (value) =>
      ['success', 'inactive', 'warning', 'error', 'info', 'neutral'].includes(value)
  },

  /**
   * Badge size
   * @values sm, md, lg
   */
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  },

  /**
   * Show status dot
   */
  dot: {
    type: Boolean,
    default: false
  },

  /**
   * Count badge style (pill-shaped)
   */
  count: {
    type: Boolean,
    default: false
  }
})
</script>

<style scoped>
/**
 * Badge Component Styles
 * Based on Vercel Design System Demo
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.625rem;
  border: 1px solid;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 4px;
  white-space: nowrap;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell',
    sans-serif;
}

/* Sizes */
.ds-badge--sm {
  padding: 0.125rem 0.375rem;
  font-size: 0.6875rem;
}

.ds-badge--lg {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
}

/* Dot badge */
.ds-badge--dot {
  gap: 0.375rem;
}

.ds-badge__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: currentColor;
}

/* Count badge */
.ds-badge--count {
  padding: 0.125rem 0.375rem;
  border-radius: 10px;
  font-size: 0.6875rem;
  margin-left: 0.5rem;
}

/* Variants */
.ds-badge--success {
  background: #fff;
  color: #0070f3;
  border-color: #0070f3;
}

.ds-badge--inactive {
  background: #fff;
  color: #666;
  border-color: #eaeaea;
}

.ds-badge--warning {
  background: #fff;
  color: #f5a623;
  border-color: #f5a623;
}

.ds-badge--error {
  background: #fff;
  color: #e00;
  border-color: #e00;
}

.ds-badge--info {
  background: #fff;
  color: #0070f3;
  border-color: #0070f3;
}

.ds-badge--neutral {
  background: #fff;
  color: #000;
  border-color: #eaeaea;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .ds-badge--success,
  .ds-badge--inactive,
  .ds-badge--warning,
  .ds-badge--error,
  .ds-badge--info,
  .ds-badge--neutral {
    background: #2c2c2c;
  }

  .ds-badge--inactive {
    color: #b3b3b3;
    border-color: #4b4b4b;
  }

  .ds-badge--neutral {
    color: #fff;
    border-color: #4b4b4b;
  }
}
</style>
