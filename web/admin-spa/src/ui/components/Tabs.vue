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
 * Modern design system implementation
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border-default);
}

.ds-tab {
  padding: 0.75rem 1.5rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: var(--transition-colors);
  color: var(--text-secondary);
  font-family: inherit;
}

.ds-tab:focus-visible {
  outline: none;
  box-shadow: var(--ds-focus-ring);
  border-radius: var(--radius-button);
}

.ds-tab:hover:not(:disabled) {
  color: var(--text-primary);
}

.ds-tab--active {
  color: var(--text-primary);
  border-bottom-color: var(--text-primary);
}

.ds-tab:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
