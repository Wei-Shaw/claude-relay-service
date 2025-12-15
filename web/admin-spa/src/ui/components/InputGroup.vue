<template>
  <div class="ds-input-group">
    <span v-if="$slots.icon || icon" class="ds-input-group__icon">
      <slot name="icon">{{ icon }}</slot>
    </span>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  /**
   * Icon text/emoji (alternative to slot)
   */
  icon: {
    type: String,
    default: ''
  }
})
</script>

<style scoped>
/**
 * InputGroup Component Styles
 * Based on Vercel Design System Demo
 * Wraps input with icon
 */

.ds-input-group {
  position: relative;
  width: 100%;
}

.ds-input-group__icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 1rem;
  color: #666;
  pointer-events: none;
  z-index: 1;
}

/* Ensure input inside has proper padding */
.ds-input-group :deep(.ds-input) {
  padding-left: 2.5rem;
}

/* Dark mode support */
:global(.dark) .ds-input-group__icon {
  color: #b3b3b3;
}
</style>
