<template>
  <div class="ds-tabs">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      :class="['ds-tab', { 'ds-tab--active': modelValue === tab.value }]"
      :disabled="tab.disabled"
      type="button"
      @click="$emit('update:modelValue', tab.value)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<script setup>
defineEmits(['update:modelValue'])

defineProps({
  /**
   * Active tab value (v-model)
   */
  modelValue: {
    type: [String, Number],
    required: true
  },

  /**
   * Tab items array
   * @example [{ label: 'Tab 1', value: 'tab1', disabled: false }]
   */
  tabs: {
    type: Array,
    required: true,
    validator: (tabs) => tabs.every((tab) => tab.label && tab.value !== undefined)
  }
})
</script>

<style scoped>
/**
 * Tabs Component Styles
 * Based on Vercel Design System Demo
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid #eaeaea;
}

.ds-tab {
  padding: 0.75rem 1.5rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  color: #666;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell',
    sans-serif;
}

.ds-tab:hover:not(:disabled) {
  color: #000;
}

.ds-tab--active {
  color: #000;
  border-bottom-color: #000;
}

.ds-tab:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Dark mode support */
:global(.dark) .ds-tabs {
  border-bottom-color: #2c2c2c;
}

:global(.dark) .ds-tab {
  color: #b3b3b3;
}

:global(.dark) .ds-tab:hover:not(:disabled) {
  color: #fff;
}

:global(.dark) .ds-tab--active {
  color: #fff;
  border-bottom-color: #fff;
}
</style>
