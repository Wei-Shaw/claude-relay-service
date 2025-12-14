<template>
  <div
    :class="[
      'ds-card',
      `ds-card--${variant}`,
      {
        'ds-card--hoverable': hoverable,
        'ds-card--interactive': interactive
      }
    ]"
  >
    <div v-if="$slots.header" class="ds-card__header">
      <slot name="header" />
    </div>

    <div class="ds-card__body">
      <slot />
    </div>

    <div v-if="$slots.footer" class="ds-card__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  /**
   * Card variant
   * @values default, stat, content, interactive
   */
  variant: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'stat', 'content', 'interactive'].includes(value)
  },

  /**
   * Add hover effect
   */
  hoverable: {
    type: Boolean,
    default: false
  },

  /**
   * Interactive card (hover + transform)
   */
  interactive: {
    type: Boolean,
    default: false
  }
})
</script>

<style scoped>
/**
 * Card Component Styles
 * Based on Vercel Design System Demo
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-card {
  background: #fff;
  border: 1px solid #eaeaea;
  border-radius: 0; /* Sharp edges per Vercel design */
  transition: all 0.2s;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
}

/* Hover effects */
.ds-card--hoverable:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.ds-card--interactive:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

/* Header */
.ds-card__header {
  padding: 1.5rem;
  border-bottom: 1px solid #eaeaea;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Body */
.ds-card__body {
  padding: 1.5rem;
}

.ds-card--stat .ds-card__body {
  padding: 1.5rem;
}

/* Footer */
.ds-card__footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #eaeaea;
  background: #fafafa;
}

/* Stat variant (no header/footer padding adjustments) */
.ds-card--stat {
  transition: background 0.2s;
}

.ds-card--stat:hover {
  background: #fafafa;
}

/* Interactive variant (centered content) */
.ds-card--interactive .ds-card__body {
  text-align: center;
  padding: 2rem;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .ds-card {
    background: #1a1a1a;
    border-color: #2c2c2c;
  }

  .ds-card__header,
  .ds-card__footer {
    border-color: #2c2c2c;
  }

  .ds-card__footer {
    background: #0a0a0a;
  }

  .ds-card--stat:hover {
    background: #0a0a0a;
  }

  .ds-card--hoverable:hover,
  .ds-card--interactive:hover {
    box-shadow: 0 4px 12px rgba(255, 255, 255, 0.05);
  }
}
</style>





