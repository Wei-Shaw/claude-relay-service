<template>
  <div
    :class="[
      'ds-skeleton',
      `ds-skeleton--${variant}`,
      {
        'ds-skeleton--animated': animated
      }
    ]"
    :style="customStyle"
  />
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /**
   * Skeleton variant
   * @values text, rect, circle
   */
  variant: {
    type: String,
    default: 'text',
    validator: (value) => ['text', 'rect', 'circle'].includes(value)
  },

  /**
   * Width (CSS value)
   */
  width: {
    type: String,
    default: null
  },

  /**
   * Height (CSS value)
   */
  height: {
    type: String,
    default: null
  },

  /**
   * Enable animation
   */
  animated: {
    type: Boolean,
    default: true
  }
})

const customStyle = computed(() => {
  const style = {}
  if (props.width) style.width = props.width
  if (props.height) style.height = props.height
  return style
})
</script>

<style scoped>
/**
 * Skeleton Component Styles
 * Modern design system implementation
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-skeleton {
  background: linear-gradient(90deg, #fafafa 25%, #eaeaea 50%, #fafafa 75%);
  background-size: 200% 100%;
  border-radius: 4px;
}

.ds-skeleton--animated {
  animation: ds-skeleton-loading 1.5s ease-in-out infinite;
}

@keyframes ds-skeleton-loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Variants */
.ds-skeleton--text {
  height: 1rem;
  width: 100%;
}

.ds-skeleton--rect {
  width: 100%;
  height: 100px;
}

.ds-skeleton--circle {
  width: 4rem;
  height: 4rem;
  border-radius: 50%;
}

/* Dark mode support */
:global(.dark) .ds-skeleton {
  background: linear-gradient(90deg, #1a1a1a 25%, #2c2c2c 50%, #1a1a1a 75%);
  background-size: 200% 100%;
}
</style>
