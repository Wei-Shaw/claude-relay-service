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
 * Modern design system implementation
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-toggle-label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  font-size: var(--font-size-base);
  color: var(--text-primary);
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
  background: var(--border-default);
  border-radius: 1.5rem;
  transition: var(--transition-colors);
  flex-shrink: 0;
}

.ds-toggle-input:focus-visible + .ds-toggle-slider {
  outline: none;
  box-shadow: var(--ds-focus-ring);
}

.ds-toggle-slider::before {
  content: '';
  position: absolute;
  width: 1.25rem;
  height: 1.25rem;
  left: 0.125rem;
  top: 0.125rem;
  background: var(--color-white);
  border-radius: 50%;
  transition: var(--transition-transform);
}

.ds-toggle-input:checked + .ds-toggle-slider {
  background: var(--color-black);
}

.ds-toggle-input:checked + .ds-toggle-slider::before {
  transform: translateX(1.5rem);
}

.ds-toggle-text {
  line-height: 1.5;
}

/* Dark mode tweaks (keep the same Vercel-like “invert” behavior) */
::global(.dark) .ds-toggle-slider::before {
  background: var(--color-gray-700);
}

::global(.dark) .ds-toggle-input:checked + .ds-toggle-slider {
  background: var(--color-white);
}

::global(.dark) .ds-toggle-input:checked + .ds-toggle-slider::before {
  background: var(--color-black);
}
</style>
