<template>
  <div class="ds-tooltip-wrapper">
    <div
      ref="triggerRef"
      class="ds-tooltip-trigger"
      @blur="hide"
      @focus="show"
      @mouseenter="show"
      @mouseleave="hide"
    >
      <slot />
    </div>
    <Teleport to="body">
      <div
        v-if="isVisible"
        ref="tooltipRef"
        :class="['ds-tooltip', `ds-tooltip--${placement}`]"
        role="tooltip"
        :style="tooltipStyle"
      >
        <slot name="content">{{ content }}</slot>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  /**
   * Tooltip content (alternative to content slot)
   */
  content: {
    type: String,
    default: ''
  },

  /**
   * Tooltip placement
   * @values top, bottom, left, right
   */
  placement: {
    type: String,
    default: 'top',
    validator: (value) => ['top', 'bottom', 'left', 'right'].includes(value)
  },

  /**
   * Delay before showing (ms)
   */
  delay: {
    type: Number,
    default: 200
  }
})

const isVisible = ref(false)
const triggerRef = ref(null)
const tooltipRef = ref(null)
const tooltipStyle = ref({})
let showTimeout = null

const show = () => {
  clearTimeout(showTimeout)
  showTimeout = setTimeout(() => {
    isVisible.value = true
    updatePosition()
  }, props.delay)
}

const hide = () => {
  clearTimeout(showTimeout)
  isVisible.value = false
}

const updatePosition = () => {
  if (!triggerRef.value || !tooltipRef.value) return

  const trigger = triggerRef.value.getBoundingClientRect()
  const tooltip = tooltipRef.value.getBoundingClientRect()

  let top = 0
  let left = 0

  switch (props.placement) {
    case 'top':
      top = trigger.top - tooltip.height - 8
      left = trigger.left + trigger.width / 2 - tooltip.width / 2
      break
    case 'bottom':
      top = trigger.bottom + 8
      left = trigger.left + trigger.width / 2 - tooltip.width / 2
      break
    case 'left':
      top = trigger.top + trigger.height / 2 - tooltip.height / 2
      left = trigger.left - tooltip.width - 8
      break
    case 'right':
      top = trigger.top + trigger.height / 2 - tooltip.height / 2
      left = trigger.right + 8
      break
  }

  tooltipStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    zIndex: 9999
  }
}
</script>

<style scoped>
/**
 * Tooltip Component Styles
 * Based on Vercel Design System Demo
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-tooltip-wrapper {
  display: inline-block;
}

.ds-tooltip-trigger {
  display: inline-block;
}

.ds-tooltip {
  background: #000;
  color: #fff;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  font-size: 0.8125rem;
  white-space: nowrap;
  pointer-events: none;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell',
    sans-serif;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  animation: ds-tooltip-fade-in 0.2s ease-out;
}

@keyframes ds-tooltip-fade-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Dark mode support */
:global(.dark) .ds-tooltip {
  background: #fff;
  color: #000;
  box-shadow: 0 2px 8px rgba(255, 255, 255, 0.15);
}
</style>
