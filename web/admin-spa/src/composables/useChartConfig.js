import { Chart } from 'chart.js/auto'

export function useChartConfig() {
  // 设置Chart.js默认配置
  Chart.defaults.font.family =
    "'Roboto', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  Chart.defaults.color = '#475569'
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

  // 颜色方案
  const colorSchemes = {
    primary: ['#60a5fa', '#a78bfa', '#93c5fd', '#38bdf8', '#c4b5fd'],
    success: ['#34d399', '#10b981', '#6ee7b7', '#a7f3d0', '#d1fae5'],
    warning: ['#fbbf24', '#f59e0b', '#fde68a', '#fcd34d', '#fef3c7'],
    danger: ['#f87171', '#ef4444', '#fca5a5', '#fecaca', '#ffe4e6']
  }

  return {
    getGradient,
    commonOptions,
    colorSchemes
  }
}
