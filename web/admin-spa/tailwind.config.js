/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 主题色 - 使用 CSS 变量
        primary: {
          DEFAULT: 'var(--primary-color)',
          rgb: 'rgb(var(--primary-rgb))'
        },
        secondary: {
          DEFAULT: 'var(--secondary-color)',
          rgb: 'rgb(var(--secondary-rgb))'
        },
        accent: {
          DEFAULT: 'var(--accent-color)',
          rgb: 'rgb(var(--accent-rgb))'
        },
        // 表面颜色
        surface: 'var(--surface-color)',
        'glass-strong': 'var(--glass-strong-color)',
        glass: 'var(--glass-color)'
      },
      backgroundColor: {
        'theme-surface': 'var(--surface-color)',
        'theme-glass': 'var(--glass-strong-color)'
      },
      borderColor: {
        'theme-border': 'var(--border-color)'
      },
      animation: {
        gradient: 'gradient 8s ease infinite',
        float: 'float 6s ease-in-out infinite',
        'float-delayed': 'float 6s ease-in-out infinite 2s',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite'
      },
      keyframes: {
        gradient: {
          '0%, 100%': {
            'background-size': '200% 200%',
            'background-position': 'left center'
          },
          '50%': {
            'background-size': '200% 200%',
            'background-position': 'right center'
          }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' }
        },
        'pulse-glow': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.8 }
        }
      }
    }
  },
  plugins: []
}
