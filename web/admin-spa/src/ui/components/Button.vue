<template>
  <button
    :class="[
      'ds-button',
      `ds-button--${variant}`,
      `ds-button--${size}`,
      {
        'ds-button--loading': loading,
        'ds-button--icon-only': iconOnly,
        'ds-button--block': block
      }
    ]"
    :disabled="disabled || loading"
    :type="type"
    v-bind="$attrs"
  >
    <span v-if="loading" class="ds-button__spinner" />
    <slot />
  </button>
</template>

<script setup>
defineOptions({
  inheritAttrs: false
})

defineProps({
  /**
   * Button variant
   * @values primary, secondary, outline, danger, danger-outline, ghost
   */
  variant: {
    type: String,
    default: 'secondary',
    validator: (value) =>
      ['primary', 'secondary', 'outline', 'danger', 'danger-outline', 'ghost'].includes(value)
  },

  /**
   * Button size
   * @values sm, md, lg
   */
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  },

  /**
   * Loading state
   */
  loading: {
    type: Boolean,
    default: false
  },

  /**
   * Disabled state
   */
  disabled: {
    type: Boolean,
    default: false
  },

  /**
   * Icon-only button (square shape)
   */
  iconOnly: {
    type: Boolean,
    default: false
  },

  /**
   * Full width button
   */
  block: {
    type: Boolean,
    default: false
  },

  /**
   * Button type attribute
   */
  type: {
    type: String,
    default: 'button'
  }
})
</script>

<style scoped>
/**
 * Button Component Styles
 * Based on Vercel Design System Demo
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border: 1px solid;
  border-radius: 5px;
  font-size: 0.875rem;
  font-weight: 500;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell',
    sans-serif;
  cursor: pointer;
  transition:
    background-color 0.25s ease,
    border-color 0.25s ease,
    color 0.25s ease,
    transform 0.15s ease,
    box-shadow 0.25s ease;
  white-space: nowrap;
  user-select: none;
  position: relative;
  overflow: hidden;
}

/* Sizes */
.ds-button--sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
}

.ds-button--lg {
  padding: 0.875rem 1.75rem;
  font-size: 1rem;
}

/* Icon-only */
.ds-button--icon-only {
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
}

.ds-button--icon-only.ds-button--sm {
  width: 2rem;
  height: 2rem;
}

.ds-button--icon-only.ds-button--lg {
  width: 3rem;
  height: 3rem;
}

/* Block */
.ds-button--block {
  width: 100%;
}

/* Variants */
.ds-button--primary {
  background: #000;
  color: #fff;
  border-color: #000;
  box-shadow: 0 0 0 0 rgba(0, 0, 0, 0);
}

.ds-button--primary:hover:not(:disabled) {
  background: #333;
  border-color: #333;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.ds-button--primary:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.ds-button--secondary {
  background: #fff;
  color: #000;
  border-color: #eaeaea;
  box-shadow: 0 0 0 0 rgba(0, 0, 0, 0);
}

.ds-button--secondary:hover:not(:disabled) {
  background: #fafafa;
  border-color: #000;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.ds-button--secondary:active:not(:disabled) {
  transform: translateY(0);
  background: #f5f5f5;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.ds-button--outline {
  background: transparent;
  color: #000;
  border-color: #eaeaea;
  box-shadow: 0 0 0 0 rgba(0, 0, 0, 0);
}

.ds-button--outline:hover:not(:disabled) {
  background: #fafafa;
  border-color: #000;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}

.ds-button--outline:active:not(:disabled) {
  transform: translateY(0);
  background: #f5f5f5;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.ds-button--danger {
  background: #e00;
  color: #fff;
  border-color: #e00;
  box-shadow: 0 0 0 0 rgba(238, 0, 0, 0);
}

.ds-button--danger:hover:not(:disabled) {
  background: #c00;
  border-color: #c00;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(238, 0, 0, 0.25);
}

.ds-button--danger:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 6px rgba(238, 0, 0, 0.15);
}

.ds-button--danger-outline {
  background: #fff;
  color: #e00;
  border-color: #eaeaea;
  box-shadow: 0 0 0 0 rgba(238, 0, 0, 0);
}

.ds-button--danger-outline:hover:not(:disabled) {
  background: #e00;
  color: #fff;
  border-color: #e00;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(238, 0, 0, 0.15);
}

.ds-button--danger-outline:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 1px 4px rgba(238, 0, 0, 0.1);
}

.ds-button--ghost {
  background: transparent;
  color: #666;
  border-color: transparent;
  box-shadow: 0 0 0 0 rgba(0, 0, 0, 0);
}

.ds-button--ghost:hover:not(:disabled) {
  background: #fafafa;
  color: #000;
  transform: translateY(-1px);
}

.ds-button--ghost:active:not(:disabled) {
  transform: translateY(0);
  background: #f5f5f5;
}

/* States */
.ds-button:focus-visible {
  outline: 2px solid #0070f3;
  outline-offset: 2px;
}

.ds-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

.ds-button--loading {
  position: relative;
  color: transparent;
  pointer-events: none;
  transform: none !important;
}

/* Spinner */
.ds-button__spinner {
  position: absolute;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #fff;
  animation: ds-button-spin 0.8s linear infinite;
}

.ds-button--secondary .ds-button__spinner,
.ds-button--outline .ds-button__spinner,
.ds-button--ghost .ds-button__spinner {
  border-color: rgba(0, 0, 0, 0.2);
  border-top-color: #000;
}

@keyframes ds-button-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Dark mode support */
:global(.dark) .ds-button--primary {
  background: #fff;
  color: #000;
  border-color: #fff;
}

:global(.dark) .ds-button--primary:hover:not(:disabled) {
  background: #e0e0e0;
  border-color: #e0e0e0;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 255, 255, 0.15);
}

:global(.dark) .ds-button--primary:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 6px rgba(255, 255, 255, 0.1);
}

:global(.dark) .ds-button--secondary {
  background: #2c2c2c;
  color: #fff;
  border-color: #4b4b4b;
}

:global(.dark) .ds-button--secondary:hover:not(:disabled) {
  background: #3a3a3a;
  border-color: #fff;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(255, 255, 255, 0.08);
}

:global(.dark) .ds-button--secondary:active:not(:disabled) {
  transform: translateY(0);
  background: #333;
  box-shadow: 0 1px 4px rgba(255, 255, 255, 0.05);
}

:global(.dark) .ds-button--outline {
  color: #fff;
  border-color: #4b4b4b;
}

:global(.dark) .ds-button--outline:hover:not(:disabled) {
  background: #3a3a3a;
  border-color: #fff;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(255, 255, 255, 0.06);
}

:global(.dark) .ds-button--outline:active:not(:disabled) {
  transform: translateY(0);
  background: #333;
  box-shadow: 0 1px 3px rgba(255, 255, 255, 0.04);
}

:global(.dark) .ds-button--ghost {
  color: #b3b3b3;
}

:global(.dark) .ds-button--ghost:hover:not(:disabled) {
  background: #2c2c2c;
  color: #fff;
  transform: translateY(-1px);
}

:global(.dark) .ds-button--ghost:active:not(:disabled) {
  transform: translateY(0);
  background: #262626;
}

:global(.dark) .ds-button--danger-outline {
  background: #2c2c2c;
}

:global(.dark) .ds-button--danger-outline:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(238, 0, 0, 0.15);
}

:global(.dark) .ds-button--danger-outline:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 1px 4px rgba(238, 0, 0, 0.1);
}
</style>
