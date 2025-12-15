/**
 * Design System - Color Tokens
 * Modern design system implementation
 * DO NOT modify without design approval
 */

export const colors = {
  // Primary Colors (Black & White system)
  black: '#000000',
  white: '#ffffff',

  // Grays
  gray: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#eaeaea',
    300: '#e1e1e1',
    400: '#cacaca',
    500: '#b3b3b3',
    600: '#8e8e8e',
    700: '#6e6e6e',
    800: '#4b4b4b',
    900: '#2c2c2c'
  },

  // Semantic Colors
  text: {
    primary: '#000000',
    secondary: '#666666',
    muted: '#999999',
    link: '#0070f3',
    linkHover: '#0051bb',
    error: '#ee0000',
    success: '#0070f3'
  },

  // Status Colors
  status: {
    success: '#0070f3',
    error: '#ee0000',
    warning: '#f5a623',
    info: '#0070f3'
  },

  // Background Colors
  bg: {
    primary: '#ffffff',
    secondary: '#fafafa',
    tertiary: '#f5f5f5',
    hover: '#fafafa',
    disabled: '#fafafa'
  },

  // Border Colors
  border: {
    default: '#eaeaea',
    hover: '#000000',
    focus: '#000000',
    error: '#ee0000'
  },

  // Component-specific Colors
  button: {
    primary: {
      bg: '#000000',
      text: '#ffffff',
      border: '#000000',
      hoverBg: '#333333',
      hoverBorder: '#333333'
    },
    secondary: {
      bg: '#ffffff',
      text: '#000000',
      border: '#eaeaea',
      hoverBg: '#ffffff',
      hoverBorder: '#000000'
    },
    danger: {
      bg: '#ee0000',
      text: '#ffffff',
      border: '#ee0000',
      hoverBg: '#cc0000',
      hoverBorder: '#cc0000'
    },
    ghost: {
      bg: 'transparent',
      text: '#666666',
      border: 'transparent',
      hoverBg: '#fafafa',
      hoverText: '#000000'
    }
  },

  // Alert Colors
  alert: {
    success: {
      bg: '#f0f9ff',
      text: '#0070f3',
      border: '#0070f3'
    },
    error: {
      bg: '#fff0f0',
      text: '#ee0000',
      border: '#ee0000'
    },
    warning: {
      bg: '#fffbeb',
      text: '#f5a623',
      border: '#f5a623'
    },
    info: {
      bg: '#f0f9ff',
      text: '#0070f3',
      border: '#0070f3'
    }
  },

  // Badge Colors
  badge: {
    success: {
      bg: '#ffffff',
      text: '#0070f3',
      border: '#0070f3'
    },
    inactive: {
      bg: '#ffffff',
      text: '#666666',
      border: '#eaeaea'
    },
    warning: {
      bg: '#ffffff',
      text: '#f5a623',
      border: '#f5a623'
    },
    error: {
      bg: '#ffffff',
      text: '#ee0000',
      border: '#ee0000'
    },
    info: {
      bg: '#ffffff',
      text: '#0070f3',
      border: '#0070f3'
    },
    neutral: {
      bg: '#ffffff',
      text: '#000000',
      border: '#eaeaea'
    }
  },

  // Progress Bar Colors
  progress: {
    bg: '#eaeaea',
    fill: '#000000',
    fillSuccess: '#0070f3'
  },

  // Code Block Colors
  code: {
    bg: '#000000',
    text: '#ffffff',
    inlineBg: '#fafafa',
    inlineBorder: '#eaeaea'
  },

  // Skeleton Loading Colors
  skeleton: {
    from: '#fafafa',
    mid: '#eaeaea',
    to: '#fafafa'
  }
}
