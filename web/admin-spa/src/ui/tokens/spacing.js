/**
 * Design System - Spacing Tokens
 * Modern design system implementation
 * DO NOT modify without design approval
 */

export const spacing = {
  // Base spacing scale
  0: '0',
  0.5: '0.125rem', // 2px
  1: '0.25rem', // 4px
  1.5: '0.375rem', // 6px
  2: '0.5rem', // 8px
  2.5: '0.625rem', // 10px
  3: '0.75rem', // 12px
  3.5: '0.875rem', // 14px
  4: '1rem', // 16px
  5: '1.25rem', // 20px
  6: '1.5rem', // 24px
  7: '1.75rem', // 28px
  8: '2rem', // 32px
  9: '2.25rem', // 36px
  10: '2.5rem', // 40px
  12: '3rem', // 48px
  14: '3.5rem', // 56px
  16: '4rem', // 64px
  20: '5rem', // 80px
  24: '6rem', // 96px
  32: '8rem', // 128px
  40: '10rem', // 160px
  48: '12rem', // 192px
  56: '14rem', // 224px
  64: '16rem' // 256px
}

// Component-specific spacing presets
export const componentSpacing = {
  button: {
    sm: {
      padding: '0.375rem 0.75rem'
    },
    md: {
      padding: '0.625rem 1.25rem'
    },
    lg: {
      padding: '0.875rem 1.75rem'
    },
    icon: {
      size: '2.5rem',
      sizeSm: '2rem'
    }
  },

  input: {
    padding: '0.75rem'
  },

  card: {
    padding: '1.5rem',
    gap: '1rem'
  },

  badge: {
    padding: '0.25rem 0.625rem'
  },

  alert: {
    padding: '1rem 1.25rem'
  },

  table: {
    cellPadding: '1rem',
    cellPaddingCompact: '0.625rem 1rem',
    headerPadding: '0.75rem 1rem',
    headerPaddingCompact: '0.5rem 1rem'
  },

  tab: {
    padding: '0.75rem 1.5rem'
  },

  pagination: {
    padding: '0.5rem 0.75rem'
  },

  toggle: {
    width: '3rem',
    height: '1.5rem',
    knobSize: '1.25rem'
  }
}
