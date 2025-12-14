/**
 * Design System - Border Radius Tokens
 * Based on Vercel-inspired Design System Demo
 * DO NOT modify without design approval
 */

export const radius = {
  none: '0',
  sm: '3px',
  md: '4px',
  base: '5px', // Primary radius used throughout
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
  '3xl': '24px',
  full: '9999px' // Circles
}

// Component-specific radius
export const componentRadius = {
  button: '5px',
  input: '5px',
  card: '0', // Sharp edges per Vercel design
  badge: '4px',
  alert: '5px',
  progressBar: '4px',
  toggle: '1.5rem',
  pagination: '5px',
  tab: '0', // No radius for tabs
  tooltip: '4px',
  skeleton: '4px'
}
