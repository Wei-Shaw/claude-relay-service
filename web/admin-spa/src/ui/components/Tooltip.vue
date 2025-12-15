<template>
  <div
    class="ds-tooltip-wrapper"
    @focusin="show(true)"
    @focusout="hide"
    @keydown.esc.prevent="hide"
    @mouseenter="show(false)"
    @mouseleave="hide"
  >
    <div ref="triggerRef" class="ds-tooltip-trigger">
      <slot />
    </div>

    <Teleport to="body">
      <div
        v-if="isVisible"
        :id="tooltipId"
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
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

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

const tooltipId = `ds-tooltip-${Math.random().toString(36).slice(2, 10)}`

const isVisible = ref(false)
const triggerRef = ref(null)
const tooltipRef = ref(null)
const tooltipStyle = ref({})

let showTimeout = null
let describedEl = null

const getFocusableInTrigger = () => {
  if (!triggerRef.value) return null

  const selector =
    'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]'

  const el = triggerRef.value.querySelector(selector)
  if (el) return el

  if (triggerRef.value.tabIndex >= 0) return triggerRef.value

  return null
}

const attachAriaDescribedBy = () => {
  describedEl = getFocusableInTrigger()
  if (!describedEl) return
  describedEl.setAttribute('aria-describedby', tooltipId)
}

const detachAriaDescribedBy = () => {
  if (!describedEl) return
  if (describedEl.getAttribute('aria-describedby') === tooltipId) {
    describedEl.removeAttribute('aria-describedby')
  }
  describedEl = null
}

const show = (immediate = false) => {
  clearTimeout(showTimeout)

  const delay = immediate ? 0 : props.delay
  showTimeout = setTimeout(async () => {
    isVisible.value = true
    await nextTick()
    attachAriaDescribedBy()
    updatePosition()
  }, delay)
}

const hide = () => {
  clearTimeout(showTimeout)
  isVisible.value = false
  detachAriaDescribedBy()
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const updatePosition = () => {
  if (!triggerRef.value || !tooltipRef.value) return

  const trigger = triggerRef.value.getBoundingClientRect()
  const tooltip = tooltipRef.value.getBoundingClientRect()

  const gutter = 8
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let top = 0
  let left = 0

  switch (props.placement) {
    case 'top':
      top = trigger.top - tooltip.height - gutter
      left = trigger.left + trigger.width / 2 - tooltip.width / 2
      break
    case 'bottom':
      top = trigger.bottom + gutter
      left = trigger.left + trigger.width / 2 - tooltip.width / 2
      break
    case 'left':
      top = trigger.top + trigger.height / 2 - tooltip.height / 2
      left = trigger.left - tooltip.width - gutter
      break
    case 'right':
      top = trigger.top + trigger.height / 2 - tooltip.height / 2
      left = trigger.right + gutter
      break
  }

  // Flip if it would go offscreen.
  if (props.placement === 'top' && top < gutter) {
    top = trigger.bottom + gutter
  }
  if (props.placement === 'bottom' && top + tooltip.height > viewportHeight - gutter) {
    top = trigger.top - tooltip.height - gutter
  }
  if (props.placement === 'left' && left < gutter) {
    left = trigger.right + gutter
  }
  if (props.placement === 'right' && left + tooltip.width > viewportWidth - gutter) {
    left = trigger.left - tooltip.width - gutter
  }

  top = clamp(top, gutter, viewportHeight - tooltip.height - gutter)
  left = clamp(left, gutter, viewportWidth - tooltip.width - gutter)

  tooltipStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    zIndex: 9999
  }
}

const onWindowChange = () => updatePosition()

watch(isVisible, (visible) => {
  if (!visible) return

  // Keep the tooltip positioned correctly during scroll/resize.
  window.addEventListener('resize', onWindowChange)
  window.addEventListener('scroll', onWindowChange, true)
})

watch(isVisible, (visible) => {
  if (visible) return

  window.removeEventListener('resize', onWindowChange)
  window.removeEventListener('scroll', onWindowChange, true)
})

onBeforeUnmount(() => {
  clearTimeout(showTimeout)
  window.removeEventListener('resize', onWindowChange)
  window.removeEventListener('scroll', onWindowChange, true)
  detachAriaDescribedBy()
})
</script>

<style scoped>
/**
 * Tooltip Component Styles
 * Modern design system implementation
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
::global(.dark) .ds-tooltip {
  background: #fff;
  color: #000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
</style>
