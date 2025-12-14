<template>
  <div
    :aria-valuemax="100"
    :aria-valuemin="0"
    :aria-valuenow="clampedValue"
    :class="[
      'ds-progress',
      `ds-progress--${variant}`,
      `ds-progress--${size}`,
      { 'ds-progress--animated': animated }
    ]"
    role="progressbar"
  >
    <div class="ds-progress__fill" :style="{ width: `${clampedValue}%` }" />
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /**
   * Progress value (0-100)
   */
  value: {
    type: Number,
    required: true,
    validator: (value) => value >= 0 && value <= 100
  },

  /**
   * Visual variant
   * @values default, success, warning, error
   */
  variant: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'success', 'warning', 'error'].includes(value)
  },

  /**
   * Size variant
   * @values sm, md, lg
   */
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  },

  /**
   * Enable smooth animation
   */
  animated: {
    type: Boolean,
    default: true
  }
})

const clampedValue = computed(() => Math.max(0, Math.min(100, props.value)))
</script>

<style scoped>
/**
 * Progress Component Styles
 * Based on Vercel Design System Demo
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-progress {
  width: 100%;
  background: #eaeaea;
  border-radius: 4px;
  overflow: hidden;
}

/* Sizes */
.ds-progress--sm {
  height: 0.25rem; /* 4px */
}

.ds-progress--md {
  height: 0.5rem; /* 8px */
}

.ds-progress--lg {
  height: 0.75rem; /* 12px */
}

/* Fill */
.ds-progress__fill {
  height: 100%;
  border-radius: inherit;
}

/* Variants */
.ds-progress--default .ds-progress__fill {
  background: #000;
}

.ds-progress--success .ds-progress__fill {
  background: #0070f3;
}

.ds-progress--warning .ds-progress__fill {
  background: #f5a623;
}

.ds-progress--error .ds-progress__fill {
  background: #ee0000;
}

/* Animation */
.ds-progress--animated .ds-progress__fill {
  transition: width 0.3s ease;
}

/* Dark mode support */
:global(.dark) .ds-progress {
  background: #2c2c2c;
}

:global(.dark) .ds-progress--default .ds-progress__fill {
  background: #ffffff;
}
</style>
