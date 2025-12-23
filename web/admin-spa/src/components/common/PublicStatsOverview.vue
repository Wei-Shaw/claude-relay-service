<template>
  <div v-if="authStore.publicStats" class="public-stats-overview">
    <!-- 服务状态徽章 -->
    <div class="mb-4 flex items-center justify-center gap-2">
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

    <!-- 平台可用性指示器 -->
    <div class="mb-4 flex flex-wrap justify-center gap-2">
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

    <!-- 今日统计 -->
    <div class="stats-grid">
      <div class="stat-item">
        <div class="stat-value">{{ formatNumber(authStore.publicStats.todayStats.requests) }}</div>
        <div class="stat-label">今日请求</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ formatTokens(authStore.publicStats.todayStats.tokens) }}</div>
        <div class="stat-label">今日 Tokens</div>
      </div>
    </div>

    <!-- 模型使用分布 -->
    <div
      v-if="
        authStore.publicStats.showOptions?.modelDistribution &&
        authStore.publicStats.modelDistribution?.length > 0
      "
      class="mt-4"
    >
      <div class="section-title">模型使用分布</div>
      <div class="model-distribution">
        <div
          v-for="model in authStore.publicStats.modelDistribution"
          :key="model.model"
          class="model-bar-item"
        >
          <div class="model-name">{{ formatModelName(model.model) }}</div>
          <div class="model-bar">
            <div class="model-bar-fill" :style="{ width: `${model.percentage}%` }"></div>
          </div>
          <div class="model-percentage">{{ model.percentage }}%</div>
        </div>
      </div>
    </div>

    <!-- Token使用趋势 -->
    <div
      v-if="
        authStore.publicStats.showOptions?.tokenTrends && authStore.publicStats.tokenTrends?.length
      "
      class="mt-4"
    >
      <div class="section-title">Token 使用趋势（近7天）</div>
      <div class="trend-chart">
        <div
          v-for="(item, index) in authStore.publicStats.tokenTrends"
          :key="index"
          class="trend-bar-wrapper"
        >
          <div
            class="trend-bar trend-bar-tokens"
            :style="{ height: `${getTrendBarHeight(item.tokens, 'tokens')}%` }"
            :title="`${formatDate(item.date)}: ${formatTokens(item.tokens)} tokens`"
          ></div>
          <div class="trend-label">{{ formatDateShort(item.date) }}</div>
        </div>
      </div>
    </div>

    <!-- API Keys 使用趋势 -->
    <div
      v-if="
        authStore.publicStats.showOptions?.apiKeysTrends &&
        authStore.publicStats.apiKeysTrends?.length
      "
      class="mt-4"
    >
      <div class="section-title">API Keys 活跃趋势（近7天）</div>
      <div class="trend-chart">
        <div
          v-for="(item, index) in authStore.publicStats.apiKeysTrends"
          :key="index"
          class="trend-bar-wrapper"
        >
          <div
            class="trend-bar trend-bar-keys"
            :style="{ height: `${getTrendBarHeight(item.activeKeys, 'apiKeys')}%` }"
            :title="`${formatDate(item.date)}: ${item.activeKeys} 个活跃 Key`"
          ></div>
          <div class="trend-label">{{ formatDateShort(item.date) }}</div>
        </div>
      </div>
    </div>

    <!-- 账号使用趋势 -->
    <div
      v-if="
        authStore.publicStats.showOptions?.accountTrends &&
        authStore.publicStats.accountTrends?.length
      "
      class="mt-4"
    >
      <div class="section-title">账号活跃趋势（近7天）</div>
      <div class="trend-chart">
        <div
          v-for="(item, index) in authStore.publicStats.accountTrends"
          :key="index"
          class="trend-bar-wrapper"
        >
          <div
            class="trend-bar trend-bar-accounts"
            :style="{ height: `${getTrendBarHeight(item.activeAccounts, 'accounts')}%` }"
            :title="`${formatDate(item.date)}: ${item.activeAccounts} 个活跃账号`"
          ></div>
          <div class="trend-label">{{ formatDateShort(item.date) }}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- 加载状态 -->
  <div v-else-if="authStore.publicStatsLoading" class="public-stats-loading">
    <div class="loading-spinner"></div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

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

// 格式化日期
function formatDate(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    return `${parts[1]}月${parts[2]}日`
  }
  return dateStr
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

// 计算趋势图柱高度
const maxValues = computed(() => {
  const stats = authStore.publicStats
  if (!stats) return { tokens: 1, apiKeys: 1, accounts: 1 }

  return {
    tokens: Math.max(...(stats.tokenTrends?.map((t) => t.tokens) || [1]), 1),
    apiKeys: Math.max(...(stats.apiKeysTrends?.map((t) => t.activeKeys) || [1]), 1),
    accounts: Math.max(...(stats.accountTrends?.map((t) => t.activeAccounts) || [1]), 1)
  }
})

function getTrendBarHeight(value, type) {
  const max = maxValues.value[type] || 1
  const height = (value / max) * 100
  return Math.max(height, 5) // 最小高度5%
}
</script>

<style scoped>
.public-stats-overview {
  @apply rounded-xl border border-gray-200/50 bg-white/80 p-4 backdrop-blur-sm dark:border-gray-700/50 dark:bg-gray-800/80;
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

/* 章节标题 */
.section-title {
  @apply mb-2 text-center text-xs text-gray-600 dark:text-gray-400;
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
  @apply rounded-lg bg-gray-50 p-3 text-center dark:bg-gray-700/50;
}

.stat-value {
  @apply text-lg font-bold text-gray-900 dark:text-gray-100;
}

.stat-label {
  @apply text-xs text-gray-500 dark:text-gray-400;
}

/* 模型分布 */
.model-distribution {
  @apply space-y-2;
}

.model-bar-item {
  @apply flex items-center gap-2 text-xs;
}

.model-name {
  @apply w-20 truncate text-gray-600 dark:text-gray-400;
}

.model-bar {
  @apply relative h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700;
}

.model-bar-fill {
  @apply absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 to-purple-500;
  transition: width 0.5s ease-out;
}

.model-percentage {
  @apply w-10 text-right text-gray-500 dark:text-gray-400;
}

/* 趋势图表 */
.trend-chart {
  @apply flex h-24 items-end justify-between gap-1 rounded-lg bg-gray-50 p-2 dark:bg-gray-700/50;
}

.trend-bar-wrapper {
  @apply flex flex-1 flex-col items-center;
}

.trend-bar {
  @apply w-full max-w-8 rounded-t transition-all duration-300;
  min-height: 4px;
}

.trend-bar-tokens {
  @apply bg-gradient-to-t from-blue-500 to-blue-400;
}

.trend-bar-keys {
  @apply bg-gradient-to-t from-green-500 to-green-400;
}

.trend-bar-accounts {
  @apply bg-gradient-to-t from-purple-500 to-purple-400;
}

.trend-label {
  @apply mt-1 text-center text-[10px] text-gray-500 dark:text-gray-400;
}

/* 加载状态 */
.public-stats-loading {
  @apply flex items-center justify-center py-8;
}

.loading-spinner {
  @apply h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent;
}
</style>
