<template>
  <label
    :class="
      labelClass ||
      [
        'ds-checkbox-label',
        {
          'ds-checkbox-label--disabled': disabled
        }
      ]
    "
  >
    <input
      :checked="modelValue"
      type="checkbox"
      :class="inputClass || 'ds-checkbox'"
      :disabled="disabled"
      v-bind="$attrs"
      @change="handleChange"
    />
    <span v-if="$slots.default || label" :class="textClass || 'ds-checkbox-text'">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>

<script setup>
defineOptions({
  inheritAttrs: false
})

const props = defineProps({
  /**
   * Checkbox value (v-model)
   */
  modelValue: {
    type: [Boolean, Array],
    default: false
  },

  /**
   * Label text (alternative to slot)
   */
  label: {
    type: String,
    default: ''
  },

  /**
   * Disabled state
   */
  disabled: {
    type: Boolean,
    default: false
  },

  /**
   * Custom class for label wrapper
   */
  labelClass: {
    type: [String, Array, Object],
    default: null
  },

  /**
   * Custom class for input element
   */
  inputClass: {
    type: [String, Array, Object],
    default: null
  },

  /**
   * Custom class for text span
   */
  textClass: {
    type: [String, Array, Object],
    default: null
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const handleChange = (event) => {
  const checked = event.target.checked
  emit('update:modelValue', checked)
  emit('change', checked)
}
</script>

<style scoped>
/**
 * Checkbox Component Styles
 * Based on Vercel Design System Demo
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: #000;
  margin-bottom: 0;
  user-select: none;
}

.ds-checkbox-label--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ds-checkbox {
  width: 1.125rem;
  height: 1.125rem;
  cursor: pointer;
  accent-color: #000;
  flex-shrink: 0;
}

.ds-checkbox:disabled {
  cursor: not-allowed;
}

.ds-checkbox-text {
  line-height: 1.5;
}

/* Dark mode support */
:global(.dark) .ds-checkbox-label {
  color: #fff;
}

:global(.dark) .ds-checkbox {
  accent-color: #fff;
}
</style>
