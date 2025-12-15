<template>
  <label
    :class="[
      'ds-toggle-label',
      {
        'ds-toggle-label--disabled': disabled
      }
    ]"
  >
    <input
      :checked="modelValue"
      class="ds-toggle-input"
      :disabled="disabled"
      type="checkbox"
      v-bind="$attrs"
      @change="handleChange"
    />
    <span class="ds-toggle-slider" />
    <span v-if="$slots.default || label" class="ds-toggle-text">
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
   * Toggle value (v-model)
   */
  modelValue: {
    type: Boolean,
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
 * Toggle Component Styles
 * Based on Vercel Design System Demo
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-toggle-label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: #000;
  margin-bottom: 0;
  user-select: none;
}

.ds-toggle-label--disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.ds-toggle-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.ds-toggle-slider {
  position: relative;
  width: 3rem;
  height: 1.5rem;
  background: #eaeaea;
  border-radius: 1.5rem;
  transition: all 0.2s;
  flex-shrink: 0;
}

.ds-toggle-slider::before {
  content: '';
  position: absolute;
  width: 1.25rem;
  height: 1.25rem;
  left: 0.125rem;
  top: 0.125rem;
  background: #fff;
  border-radius: 50%;
  transition: all 0.2s;
}

.ds-toggle-input:checked + .ds-toggle-slider {
  background: #000;
}

.ds-toggle-input:checked + .ds-toggle-slider::before {
  transform: translateX(1.5rem);
}

.ds-toggle-text {
  line-height: 1.5;
}

/* Dark mode support */
:global(.dark) .ds-toggle-label {
  color: #fff;
}

:global(.dark) .ds-toggle-slider {
  background: #2c2c2c;
}

:global(.dark) .ds-toggle-slider::before {
  background: #666;
}

:global(.dark) .ds-toggle-input:checked + .ds-toggle-slider {
  background: #fff;
}

:global(.dark) .ds-toggle-input:checked + .ds-toggle-slider::before {
  background: #000;
}
</style>
