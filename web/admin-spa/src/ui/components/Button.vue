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
 * Based on Vercel Design System with proper hover effects
 * DO NOT add Tailwind classes here - all styles are token-based
 */

.ds-button {
  /* Base structure */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  max-width: 100%;

  /* Spacing */
  gap: 0.5rem;
  padding: 0 var(--ds-button-x-padding, 10px);
  height: var(--ds-button-height, 40px);

  /* Typography */
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.5;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell',
    sans-serif;

  /* Visual */
  border: 0;
  border-radius: 6px;
  outline: none;
  outline-offset: 2px;
  transform: translateZ(0);

  /* Themed colors - set by variants */
  color: var(--ds-button-fg, #000);
  background: var(--ds-button-bg, #fff);
  box-shadow: var(--ds-button-shadow, 0 0 0 1px #eaeaea);

  /* Smooth transitions matching Vercel */
  transition-property: border-color, background, color, transform, box-shadow;
  transition-duration: 0.15s;
  transition-timing-function: ease;
}

.ds-button:focus-visible {
  outline: 2px solid #0070f3;
  outline-offset: 2px;
}

/* ============================================
   SIZE VARIANTS
   ============================================ */

.ds-button--sm {
  --ds-button-x-padding: 6px;
  --ds-button-height: 32px;
  font-size: 0.8125rem;
}

.ds-button--md {
  --ds-button-x-padding: 10px;
  --ds-button-height: 40px;
  font-size: 0.875rem;
}

.ds-button--lg {
  --ds-button-x-padding: 14px;
  --ds-button-height: 48px;
  font-size: 1rem;
}

/* Icon-only buttons */
.ds-button--icon-only {
  width: var(--ds-button-height, 40px);
  padding: 0;
}

.ds-button--icon-only.ds-button--sm {
  width: 32px;
}

.ds-button--icon-only.ds-button--lg {
  width: 48px;
}

/* Block button */
.ds-button--block {
  width: 100%;
}

/* ============================================
   PRIMARY VARIANT
   ============================================ */

.ds-button--primary {
  --ds-button-bg: #000;
  --ds-button-hover-bg: #333;
  --ds-button-fg: #fff;
  --ds-button-shadow: none;
}

.ds-button--primary:hover:not(:disabled) {
  background: var(--ds-button-hover-bg);
}

.ds-button--primary:active:not(:disabled) {
  transform: scale(0.98);
}

/* ============================================
   SECONDARY VARIANT (Vercel-style)
   ============================================ */

.ds-button--secondary {
  --ds-button-bg: #fff;
  --ds-button-hover-bg: rgba(0, 0, 0, 0.05);
  --ds-button-fg: #000;
  --ds-button-border: #eaeaea;
  --ds-button-shadow: 0 0 0 1px var(--ds-button-border);
}

.ds-button--secondary:hover:not(:disabled) {
  background: var(--ds-button-hover-bg);
}

.ds-button--secondary:active:not(:disabled) {
  transform: scale(0.98);
}

/* ============================================
   OUTLINE VARIANT
   ============================================ */

.ds-button--outline {
  --ds-button-bg: transparent;
  --ds-button-hover-bg: rgba(0, 0, 0, 0.03);
  --ds-button-fg: #000;
  --ds-button-border: #eaeaea;
  --ds-button-hover-border: #000;
  --ds-button-shadow: 0 0 0 1px var(--ds-button-border);
}

.ds-button--outline:hover:not(:disabled) {
  background: var(--ds-button-hover-bg);
  box-shadow: 0 0 0 1px var(--ds-button-hover-border);
}

/* ============================================
   DANGER VARIANT
   ============================================ */

.ds-button--danger {
  --ds-button-bg: #e00;
  --ds-button-hover-bg: #c00;
  --ds-button-fg: #fff;
  --ds-button-shadow: none;
}

.ds-button--danger:hover:not(:disabled) {
  background: var(--ds-button-hover-bg);
}

.ds-button--danger:active:not(:disabled) {
  transform: scale(0.98);
}

/* ============================================
   DANGER OUTLINE VARIANT
   ============================================ */

.ds-button--danger-outline {
  --ds-button-bg: #fff;
  --ds-button-hover-bg: #e00;
  --ds-button-fg: #e00;
  --ds-button-hover-fg: #fff;
  --ds-button-border: #eaeaea;
  --ds-button-shadow: 0 0 0 1px var(--ds-button-border);
}

.ds-button--danger-outline:hover:not(:disabled) {
  background: var(--ds-button-hover-bg);
  color: var(--ds-button-hover-fg);
  box-shadow: 0 0 0 1px var(--ds-button-hover-bg);
}

/* ============================================
   GHOST VARIANT
   ============================================ */

.ds-button--ghost {
  --ds-button-bg: transparent;
  --ds-button-hover-bg: #fafafa;
  --ds-button-fg: #666;
  --ds-button-hover-fg: #000;
  --ds-button-shadow: none;
}

.ds-button--ghost:hover:not(:disabled) {
  background: var(--ds-button-hover-bg);
  color: var(--ds-button-hover-fg);
}

/* ============================================
   STATES
   ============================================ */

.ds-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ds-button--loading {
  position: relative;
  color: transparent;
  pointer-events: none;
}

/* ============================================
   LOADING SPINNER
   ============================================ */

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
.ds-button--ghost .ds-button__spinner,
.ds-button--danger-outline .ds-button__spinner {
  border-color: rgba(0, 0, 0, 0.2);
  border-top-color: #000;
}

@keyframes ds-button-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ============================================
   DARK MODE SUPPORT
   ============================================ */

:global(.dark) .ds-button--primary {
  --ds-button-bg: #fff;
  --ds-button-hover-bg: #e0e0e0;
  --ds-button-fg: #000;
}

:global(.dark) .ds-button--secondary {
  --ds-button-bg: #1a1a1a;
  --ds-button-hover-bg: rgba(255, 255, 255, 0.1);
  --ds-button-fg: #fff;
  --ds-button-border: #333;
}

:global(.dark) .ds-button--outline {
  --ds-button-bg: transparent;
  --ds-button-hover-bg: rgba(255, 255, 255, 0.05);
  --ds-button-fg: #fff;
  --ds-button-border: #333;
  --ds-button-hover-border: #fff;
}

:global(.dark) .ds-button--ghost {
  --ds-button-bg: transparent;
  --ds-button-hover-bg: #1a1a1a;
  --ds-button-fg: #b3b3b3;
  --ds-button-hover-fg: #fff;
}

:global(.dark) .ds-button--danger-outline {
  --ds-button-bg: #1a1a1a;
  --ds-button-border: #333;
}

:global(.dark) .ds-button--primary .ds-button__spinner {
  border-color: rgba(0, 0, 0, 0.2);
  border-top-color: #000;
}

:global(.dark) .ds-button--secondary .ds-button__spinner,
:global(.dark) .ds-button--outline .ds-button__spinner,
:global(.dark) .ds-button--ghost .ds-button__spinner {
  border-color: rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
}
</style>
