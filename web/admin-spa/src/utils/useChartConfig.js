import { Chart } from 'chart.js/auto'
import { useThemeStore } from '@/stores/theme'

export function useChartConfig() {
  const themeStore = useThemeStore()

  // 设置Chart.js默认配置
  Chart.defaults.font.family =
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  Chart.defaults.color = '#6b7280'
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(0, 0, 0, 0.8)'
  Chart.defaults.plugins.tooltip.padding = 12
  Chart.defaults.plugins.tooltip.cornerRadius = 8
  Chart.defaults.plugins.tooltip.titleFont.size = 14
  Chart.defaults.plugins.tooltip.bodyFont.size = 12

  // 创建渐变色
  const getGradient = (ctx, color, opacity = 0.2) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, 300)
    gradient.addColorStop(
      0,
      `${color}${Math.round(opacity * 255)
        .toString(16)
        .padStart(2, '0')}`
    )
    gradient.addColorStop(1, `${color}00`)
    return gradient
  }

  // 获取当前主题的颜色方案
  const getThemeColors = () => {
    const scheme = themeStore.currentColorScheme
    return [scheme.primary, scheme.secondary, scheme.accent, '#4facfe', '#00f2fe']
  }

  // 通用图表选项
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
            weight: '500'
          }
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: function (context) {
            let label = context.dataset.label || ''
            if (label) {
              label += ': '
            }
            if (context.parsed.y !== null) {
              label += new Intl.NumberFormat('zh-CN').format(context.parsed.y)
            }
            return label
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 11
          }
        }
      },
      y: {
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
          drawBorder: false
        },
        ticks: {
          font: {
            size: 11
          },
          callback: function (value) {
            if (value >= 1000000) {
              return (value / 1000000).toFixed(1) + 'M'
            } else if (value >= 1000) {
              return (value / 1000).toFixed(1) + 'K'
            }
            return value
          }
        }
      }
    }
  }

  // 颜色方案 - 动态获取主题色
  const colorSchemes = {
    get primary() {
      const scheme = themeStore.currentColorScheme
      return [scheme.primary, scheme.secondary, scheme.accent, '#4facfe', '#00f2fe']
    },
    success: ['#10b981', '#059669', '#34d399', '#6ee7b7', '#a7f3d0'],
    warning: ['#f59e0b', '#d97706', '#fbbf24', '#fcd34d', '#fde68a'],
    danger: ['#ef4444', '#dc2626', '#f87171', '#fca5a5', '#fecaca']
  }

  return {
    getGradient,
    getThemeColors,
    commonOptions,
    colorSchemes
  }
}
