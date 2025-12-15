<template>
  <label
    :class="[
      'ds-radio-label',
      {
        'ds-radio-label--disabled': disabled
      }
    ]"
  >
    <input
      :checked="modelValue === value"
      :class="'ds-radio'"
      :disabled="disabled"
      :name="name"
      type="radio"
      :value="value"
      v-bind="$attrs"
      @change="handleChange"
    />
    <span v-if="$slots.default || label" class="ds-radio-text">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>

<script setup>
defineOptions({
  inheritAttrs: false
})

defineProps({
  /**
   * Radio value (v-model)
   */
  modelValue: {
    type: [String, Number, Boolean],
    default: null
  },

  /**
   * Radio value
   */
  value: {
    type: [String, Number, Boolean],
    required: true
  },

  /**
   * Label text (alternative to slot)
   */
  label: {
    type: String,
    default: ''
  },

  /**
   * Radio group name
   */
  name: {
    type: String,
    required: true
  },

  /**
   * Disabled state
   */
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const handleChange = (event) => {
  const value = event.target.value
  emit('update:modelValue', value)
  emit('change', value)
}
</script>

<style scoped>
/**
 * Radio Component Styles
 * Modern design system implementation
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-radio-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: var(--font-size-base);
  color: var(--text-primary);
  margin-bottom: 0;
  user-select: none;
}

.ds-radio-label--disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.ds-radio {
  width: 1.125rem;
  height: 1.125rem;
  cursor: pointer;
  accent-color: var(--text-primary);
  flex-shrink: 0;
}

.ds-radio:focus-visible {
  outline: none;
  box-shadow: var(--ds-focus-ring);
  border-radius: 999px;
}

.ds-radio:disabled {
  cursor: not-allowed;
}

.ds-radio-text {
  line-height: 1.5;
}
</style>
