/**
 * Design System - Typography Tokens
 * Modern design system implementation
 * DO NOT modify without design approval
 */

export const typography = {
  // Font Families
  fontFamily: {
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif",
    mono: "'Monaco', 'Menlo', monospace"
  },

  // Font Sizes
  fontSize: {
    xs: '0.6875rem', // 11px - count badges
    sm: '0.75rem', // 12px - captions, table headers
    base: '0.8125rem', // 13px - form errors, help text
    md: '0.875rem', // 14px - body text, buttons, inputs
    lg: '1rem', // 16px - large body text, button lg
    xl: '1.25rem', // 20px - large text, card titles
    '2xl': '1.5rem', // 24px - heading 4
    '3xl': '2rem', // 32px - heading 3
    '4xl': '2.5rem', // 40px - heading 2
    '5xl': '3rem' // 48px - heading 1, demo title
  },

  // Font Weights
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700
  },

  // Line Heights
  lineHeight: {
    none: 1,
    tight: 1.1,
    snug: 1.2,
    normal: 1.3,
    relaxed: 1.4,
    loose: 1.5,
    extraLoose: 1.6
  },

  // Letter Spacing
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.04em',
    normal: '-0.03em',
    snug: '-0.02em',
    wide: '0.05em'
  },

  // Typography Styles (Presets)
  styles: {
    h1: {
      fontSize: '3rem',
      fontWeight: 700,
      lineHeight: 1.1,
      letterSpacing: '-0.05em',
      color: '#000000'
    },
    h2: {
      fontSize: '2.5rem',
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: '-0.04em',
      color: '#000000'
    },
    h3: {
      fontSize: '2rem',
      fontWeight: 600,
      lineHeight: 1.3,
      letterSpacing: '-0.03em',
      color: '#000000'
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.4,
      letterSpacing: '-0.02em',
      color: '#000000'
    },
    large: {
      fontSize: '1.25rem',
      lineHeight: 1.6,
      color: '#000000'
    },
    body: {
      fontSize: '1rem',
      lineHeight: 1.6,
      color: '#000000'
    },
    small: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
      color: '#666666'
    },
    caption: {
      fontSize: '0.75rem',
      lineHeight: 1.4,
      letterSpacing: '0.05em',
      fontWeight: 500,
      color: '#666666',
      textTransform: 'uppercase'
    }
  }
}
