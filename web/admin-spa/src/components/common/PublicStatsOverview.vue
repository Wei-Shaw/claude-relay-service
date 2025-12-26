<template>
  <div v-if="authStore.publicStats" class="public-stats-overview">
    <!-- 顶部状态栏：服务状态 + 平台可用性 -->
    <div class="header-section">
      <div class="flex items-center gap-2">
        <div
          class="status-badge"
          :class="{
            'status-healthy': authStore.publicStats.serviceStatus === 'healthy',
            'status-degraded': authStore.publicStats.serviceStatus === 'degraded'
          }"
        >
          <span class="status-dot"></span>
          <span class="status-text">{{
            authStore.publicStats.serviceStatus === 'healthy' ? '服务正常' : '服务降级'
          }}</span>
        </div>
        <span class="text-xs text-gray-500 dark:text-gray-400">
          运行 {{ formatUptime(authStore.publicStats.uptime) }}
        </span>
      </div>
      <div class="flex flex-wrap justify-center gap-2 md:justify-end">
        <div
          v-for="(available, platform) in authStore.publicStats.platforms"
          :key="platform"
          class="platform-badge"
          :class="{ available: available, unavailable: !available }"
        >
          <i class="mr-1" :class="getPlatformIcon(platform)"></i>
          <span>{{ getPlatformName(platform) }}</span>
        </div>
      </div>
    </div>

    <!-- 主内容区：今日统计 + 模型分布 -->
    <div class="main-content">
      <!-- 左侧：今日统计 -->
      <div class="stats-section">
        <div class="section-title-left">今日统计</div>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value">
              {{ formatNumber(authStore.publicStats.todayStats.requests) }}
            </div>
            <div class="stat-label">请求数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">
              {{ formatTokens(authStore.publicStats.todayStats.tokens) }}
            </div>
            <div class="stat-label">Tokens</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">
              {{ formatTokens(authStore.publicStats.todayStats.inputTokens) }}
            </div>
            <div class="stat-label">输入</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">
              {{ formatTokens(authStore.publicStats.todayStats.outputTokens) }}
            </div>
            <div class="stat-label">输出</div>
          </div>
        </div>
      </div>

      <!-- 右侧：模型使用分布 -->
      <div
        v-if="
          authStore.publicStats.showOptions?.modelDistribution &&
          authStore.publicStats.modelDistribution?.length > 0
        "
        class="model-section"
      >
        <div class="section-title-left">
          模型使用分布
          <span class="period-label">{{
            formatPeriodLabel(authStore.publicStats.modelDistributionPeriod)
          }}</span>
        </div>
        <div class="model-chart-container">
          <Doughnut :data="modelChartData" :options="modelChartOptions" />
        </div>
      </div>
    </div>

    <!-- 趋势图表（三合一双Y轴折线图） -->
    <div v-if="hasAnyTrendData" class="chart-section">
      <div class="section-title-left">使用趋势（近7天）</div>
      <div class="chart-container">
        <Line :data="chartData" :options="chartOptions" />
      </div>
      <!-- 图例 -->
      <div class="chart-legend">
        <div v-if="authStore.publicStats.showOptions?.tokenTrends" class="legend-item">
          <span class="legend-dot legend-tokens"></span>
          <span class="legend-text">Tokens</span>
        </div>
        <div v-if="authStore.publicStats.showOptions?.apiKeysTrends" class="legend-item">
          <span class="legend-dot legend-keys"></span>
          <span class="legend-text">活跃 Keys</span>
        </div>
        <div v-if="authStore.publicStats.showOptions?.accountTrends" class="legend-item">
          <span class="legend-dot legend-accounts"></span>
          <span class="legend-text">活跃账号</span>
        </div>
      </div>
    </div>

    <!-- 暂无趋势数据 -->
    <div v-else-if="hasTrendOptionsEnabled" class="empty-state">
      <i class="fas fa-chart-line empty-icon"></i>
      <p class="empty-text">暂无趋势数据</p>
      <p class="empty-hint">数据将在有请求后自动更新</p>
    </div>
  </div>

  <!-- 加载状态 -->
  <div v-else-if="authStore.publicStatsLoading" class="public-stats-loading">
    <div class="loading-spinner"></div>
  </div>

  <!-- 无数据状态 -->
  <div v-else class="public-stats-empty">
    <i class="fas fa-chart-pie empty-icon"></i>
    <p class="empty-text">暂无统计数据</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { Line, Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

// 注册 Chart.js 组件
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const authStore = useAuthStore()

// 检查是否有任何趋势选项启用
const hasTrendOptionsEnabled = computed(() => {
  const opts = authStore.publicStats?.showOptions
  return opts?.tokenTrends || opts?.apiKeysTrends || opts?.accountTrends
})

// 检查是否有实际趋势数据
const hasAnyTrendData = computed(() => {
  const stats = authStore.publicStats
  if (!stats) return false

  const opts = stats.showOptions || {}
  const hasTokens = opts.tokenTrends && stats.tokenTrends?.length > 0
  const hasKeys = opts.apiKeysTrends && stats.apiKeysTrends?.length > 0
  const hasAccounts = opts.accountTrends && stats.accountTrends?.length > 0

  return hasTokens || hasKeys || hasAccounts
})

// 模型分布颜色
const modelColors = [
  'rgb(99, 102, 241)', // indigo
  'rgb(59, 130, 246)', // blue
  'rgb(16, 185, 129)', // emerald
  'rgb(245, 158, 11)', // amber
  'rgb(239, 68, 68)', // red
  'rgb(139, 92, 246)', // violet
  'rgb(236, 72, 153)', // pink
  'rgb(20, 184, 166)' // teal
]

// 模型分布环形图数据
const modelChartData = computed(() => {
  const stats = authStore.publicStats
  if (!stats?.modelDistribution?.length) {
    return { labels: [], datasets: [] }
  }

  const models = stats.modelDistribution
  return {
    labels: models.map((m) => formatModelName(m.model)),
    datasets: [
      {
        data: models.map((m) => m.percentage),
        backgroundColor: models.map((_, i) => modelColors[i % modelColors.length]),
        borderColor: 'transparent',
        borderWidth: 0,
        hoverOffset: 4
      }
    ]
  }
})

// 模型分布环形图选项
const modelChartOptions = computed(() => {
  const isDark = document.documentElement.classList.contains('dark')
  const textColor = isDark ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)'

  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: textColor,
          padding: 12,
          usePointStyle: true,
          pointStyle: 'circle',
          font: {
            size: 11
          },
          generateLabels: (chart) => {
            const data = chart.data
            if (data.labels.length && data.datasets.length) {
              return data.labels.map((label, i) => ({
                text: `${label} ${data.datasets[0].data[i]}%`,
                fillStyle: data.datasets[0].backgroundColor[i],
                strokeStyle: 'transparent',
                lineWidth: 0,
                pointStyle: 'circle',
                hidden: false,
                index: i
              }))
            }
            return []
          }
        }
      },
      tooltip: {
        backgroundColor: isDark ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        titleColor: isDark ? 'rgb(243, 244, 246)' : 'rgb(17, 24, 39)',
        bodyColor: isDark ? 'rgb(209, 213, 219)' : 'rgb(75, 85, 99)',
        borderColor: isDark ? 'rgba(75, 85, 99, 0.3)' : 'rgba(209, 213, 219, 0.5)',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (context) => {
            return ` ${context.label}: ${context.parsed}%`
          }
        }
      }
    }
  }
})

// 趋势图表数据
const chartData = computed(() => {
  const stats = authStore.publicStats
  if (!stats) return { labels: [], datasets: [] }

  const opts = stats.showOptions || {}

  // 获取日期标签（优先使用 tokenTrends）
  const labels =
    stats.tokenTrends?.map((t) => formatDateShort(t.date)) ||
    stats.apiKeysTrends?.map((t) => formatDateShort(t.date)) ||
    stats.accountTrends?.map((t) => formatDateShort(t.date)) ||
    []

  const datasets = []

  // Token 趋势（左Y轴）
  if (opts.tokenTrends && stats.tokenTrends?.length > 0) {
    datasets.push({
      label: 'Tokens',
      data: stats.tokenTrends.map((t) => t.tokens),
      borderColor: 'rgb(59, 130, 246)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      yAxisID: 'y',
      tension: 0.3,
      fill: true,
      pointRadius: 3,
      pointHoverRadius: 5
    })
  }

  // API Keys 趋势（右Y轴）
  if (opts.apiKeysTrends && stats.apiKeysTrends?.length > 0) {
    datasets.push({
      label: '活跃 Keys',
      data: stats.apiKeysTrends.map((t) => t.activeKeys),
      borderColor: 'rgb(34, 197, 94)',
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      yAxisID: 'y1',
      tension: 0.3,
      fill: false,
      pointRadius: 3,
      pointHoverRadius: 5
    })
  }

  // 账号趋势（右Y轴）
  if (opts.accountTrends && stats.accountTrends?.length > 0) {
    datasets.push({
      label: '活跃账号',
      data: stats.accountTrends.map((t) => t.activeAccounts),
      borderColor: 'rgb(168, 85, 247)',
      backgroundColor: 'rgba(168, 85, 247, 0.1)',
      yAxisID: 'y1',
      tension: 0.3,
      fill: false,
      pointRadius: 3,
      pointHoverRadius: 5
    })
  }

  return { labels, datasets }
})

// 图表配置
const chartOptions = computed(() => {
  const isDark = document.documentElement.classList.contains('dark')
  const textColor = isDark ? 'rgba(156, 163, 175, 1)' : 'rgba(107, 114, 128, 1)'
  const gridColor = isDark ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)'

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: isDark ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        titleColor: isDark ? '#e5e7eb' : '#1f2937',
        bodyColor: isDark ? '#d1d5db' : '#4b5563',
        borderColor: isDark ? 'rgba(75, 85, 99, 0.5)' : 'rgba(229, 231, 235, 1)',
        borderWidth: 1,
        padding: 10,
        displayColors: true,
        callbacks: {
          label: function (context) {
            let label = context.dataset.label || ''
            if (label) {
              label += ': '
            }
            if (context.dataset.yAxisID === 'y') {
              label += formatTokens(context.parsed.y)
            } else {
              label += context.parsed.y
            }
            return label
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          color: gridColor,
          drawBorder: false
        },
        ticks: {
          color: textColor,
          font: {
            size: 10
          }
        }
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        min: 0,
        beginAtZero: true,
        title: {
          display: true,
          text: 'Tokens',
          color: 'rgb(59, 130, 246)',
          font: {
            size: 10
          }
        },
        grid: {
          color: gridColor,
          drawBorder: false
        },
        ticks: {
          color: textColor,
          font: {
            size: 10
          },
          callback: function (value) {
            return formatTokensShort(value)
          }
        }
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        min: 0,
        beginAtZero: true,
        title: {
          display: true,
          text: '数量',
          color: 'rgb(34, 197, 94)',
          font: {
            size: 10
          }
        },
        grid: {
          drawOnChartArea: false
        },
        ticks: {
          color: textColor,
          font: {
            size: 10
          },
          stepSize: 1
        }
      }
    }
  }
})

// 格式化运行时间
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) {
    return `${days}天 ${hours}小时`
  } else if (hours > 0) {
    return `${hours}小时 ${minutes}分钟`
  } else {
    return `${minutes}分钟`
  }
}

// 格式化数字
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

// 格式化 tokens
function formatTokens(tokens) {
  if (tokens >= 1000000000) {
    return (tokens / 1000000000).toFixed(2) + 'B'
  } else if (tokens >= 1000000) {
    return (tokens / 1000000).toFixed(2) + 'M'
  } else if (tokens >= 1000) {
    return (tokens / 1000).toFixed(1) + 'K'
  }
  return tokens.toString()
}

// 格式化 tokens（简短版，用于Y轴）
function formatTokensShort(tokens) {
  if (tokens >= 1000000000) {
    return (tokens / 1000000000).toFixed(0) + 'B'
  } else if (tokens >= 1000000) {
    return (tokens / 1000000).toFixed(0) + 'M'
  } else if (tokens >= 1000) {
    return (tokens / 1000).toFixed(0) + 'K'
  }
  return tokens.toString()
}

// 格式化时间范围标签
function formatPeriodLabel(period) {
  const labels = {
    today: '今天',
    '24h': '过去24小时',
    '7d': '过去7天',
    '30d': '过去30天',
    all: '全部'
  }
  return labels[period] || labels['today']
}

// 获取平台图标
function getPlatformIcon(platform) {
  const icons = {
    claude: 'fas fa-robot',
    gemini: 'fas fa-gem',
    bedrock: 'fab fa-aws',
    droid: 'fas fa-microchip'
  }
  return icons[platform] || 'fas fa-server'
}

// 获取平台名称
function getPlatformName(platform) {
  const names = {
    claude: 'Claude',
    gemini: 'Gemini',
    bedrock: 'Bedrock',
    droid: 'Droid'
  }
  return names[platform] || platform
}

// 格式化模型名称
function formatModelName(model) {
  if (!model) return 'Unknown'
  // 简化长模型名称
  const parts = model.split('-')
  if (parts.length > 2) {
    return parts.slice(0, 2).join('-')
  }
  return model
}

// 格式化日期（短格式）
function formatDateShort(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    return `${parts[1]}/${parts[2]}`
  }
  return dateStr
}
</script>

<style scoped>
.public-stats-overview {
  @apply rounded-xl border border-gray-200/50 bg-white/80 p-4 backdrop-blur-sm dark:border-gray-700/50 dark:bg-gray-800/80 md:p-6;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 顶部状态栏 */
.header-section {
  @apply mb-4 flex flex-col items-center justify-between gap-3 border-b border-gray-200 pb-4 dark:border-gray-700 md:mb-6 md:flex-row md:pb-6;
}

/* 主内容区 */
.main-content {
  @apply grid gap-4 md:grid-cols-2 md:gap-6;
}

/* 统计区块 */
.stats-section {
  @apply rounded-lg bg-gray-50/50 p-4 dark:bg-gray-700/30;
}

/* 模型区块 */
.model-section {
  @apply rounded-lg bg-gray-50/50 p-4 dark:bg-gray-700/30;
}

/* 图表区块 */
.chart-section {
  @apply mt-4 rounded-lg bg-gray-50/50 p-4 dark:bg-gray-700/30 md:mt-6;
}

/* 章节标题（居中） */
.section-title {
  @apply mb-2 text-center text-xs text-gray-600 dark:text-gray-400;
}

/* 章节标题（左对齐） */
.section-title-left {
  @apply mb-3 text-sm font-medium text-gray-700 dark:text-gray-300;
}

/* 时间范围标签 */
.period-label {
  @apply ml-1 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-normal text-gray-500 dark:bg-gray-600 dark:text-gray-400;
}

/* 状态徽章 */
.status-badge {
  @apply inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium;
}

.status-healthy {
  @apply bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400;
}

.status-degraded {
  @apply bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400;
}

.status-dot {
  @apply inline-block h-2 w-2 rounded-full;
}

.status-healthy .status-dot {
  @apply bg-green-500;
  animation: pulse 2s infinite;
}

.status-degraded .status-dot {
  @apply bg-yellow-500;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* 平台徽章 */
.platform-badge {
  @apply inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-all;
}

.platform-badge.available {
  @apply bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400;
}

.platform-badge.unavailable {
  @apply bg-gray-100 text-gray-400 line-through dark:bg-gray-800 dark:text-gray-600;
}

/* 统计网格 */
.stats-grid {
  @apply grid grid-cols-2 gap-3;
}

.stat-item {
  @apply rounded-lg bg-white p-3 text-center shadow-sm dark:bg-gray-800/50;
}

.stat-value {
  @apply text-lg font-bold text-gray-900 dark:text-gray-100 md:text-xl;
}

.stat-label {
  @apply text-xs text-gray-500 dark:text-gray-400;
}

/* 模型分布环形图容器 */
.model-chart-container {
  height: 160px;
}

@media (min-width: 768px) {
  .model-chart-container {
    height: 180px;
  }
}

/* 趋势图表容器 */
.chart-container {
  @apply rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50;
  height: 180px;
}

/* 图例 */
.chart-legend {
  @apply mt-2 flex flex-wrap items-center justify-center gap-4;
}

.legend-item {
  @apply flex items-center gap-1.5;
}

.legend-dot {
  @apply inline-block h-2.5 w-2.5 rounded-full;
}

.legend-tokens {
  @apply bg-blue-500;
}

.legend-keys {
  @apply bg-green-500;
}

.legend-accounts {
  @apply bg-purple-500;
}

.legend-text {
  @apply text-xs text-gray-600 dark:text-gray-400;
}

/* 空状态 */
.empty-state {
  @apply flex flex-col items-center justify-center rounded-lg bg-gray-50 py-6 dark:bg-gray-700/50;
}

.empty-icon {
  @apply mb-2 text-2xl text-gray-400 dark:text-gray-500;
}

.empty-text {
  @apply text-sm text-gray-500 dark:text-gray-400;
}

.empty-hint {
  @apply mt-1 text-xs text-gray-400 dark:text-gray-500;
}

/* 加载状态 */
.public-stats-loading {
  @apply flex items-center justify-center py-8;
}

.public-stats-empty {
  @apply flex flex-col items-center justify-center rounded-xl border border-gray-200/50 bg-white/80 py-8 backdrop-blur-sm dark:border-gray-700/50 dark:bg-gray-800/80;
}

.loading-spinner {
  @apply h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent;
}
</style>
