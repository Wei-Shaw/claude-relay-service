<template>
  <div class="space-y-6 md:space-y-8">
    <div
      class="grid grid-cols-1 items-stretch gap-4 md:gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"
    >
      <!-- 基础信息 / 批量概要 -->
      <div class="card-section">
        <header class="section-header">
          <i
            class="header-icon"
            :class="
              multiKeyMode
                ? 'fas fa-layer-group text-purple-500'
                : 'fas fa-info-circle text-blue-500'
            "
          />
          <h3 class="header-title">{{ multiKeyMode ? '批量查询概要' : 'API Key 信息' }}</h3>
        </header>

        <div v-if="multiKeyMode && aggregatedStats" class="info-grid">
          <div class="info-item">
            <p class="info-label">查询 Keys 数</p>
            <p class="info-value">{{ aggregatedStats.totalKeys }} 个</p>
          </div>
          <div class="info-item">
            <p class="info-label">有效 Keys 数</p>
            <p class="info-value text-green-600 dark:text-emerald-400">
              <i class="fas fa-check-circle mr-1" />{{ aggregatedStats.activeKeys }} 个
            </p>
          </div>
          <div v-if="invalidKeys.length > 0" class="info-item">
            <p class="info-label">无效 Keys 数</p>
            <p class="info-value text-red-500 dark:text-red-400">
              <i class="fas fa-times-circle mr-1" />{{ invalidKeys.length }} 个
            </p>
          </div>
          <div class="info-item">
            <p class="info-label">总请求数</p>
            <p class="info-value">{{ formatNumber(aggregatedStats.usage.requests) }}</p>
          </div>
          <div class="info-item">
            <p class="info-label">总 Token 数</p>
            <p class="info-value">{{ formatNumber(aggregatedStats.usage.allTokens) }}</p>
          </div>
          <div class="info-item">
            <p class="info-label">总费用</p>
            <p class="info-value text-indigo-600 dark:text-indigo-300">
              {{ aggregatedStats.usage.formattedCost }}
            </p>
          </div>
          <div v-if="individualStats.length > 1" class="info-item xl:col-span-2">
            <p class="info-label">Top 3 贡献占比</p>
            <div class="space-y-2">
              <div v-for="stat in topContributors" :key="stat.apiId" class="contributor-item">
                <span class="truncate">{{ stat.name }}</span>
                <span class="font-semibold">{{ calculateContribution(stat) }}%</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="info-grid">
          <div class="info-item">
            <p class="info-label">名称</p>
            <p class="info-value break-all">{{ statsData.name }}</p>
          </div>
          <div class="info-item">
            <p class="info-label">状态</p>
            <p
              class="info-value font-semibold"
              :class="
                statsData.isActive
                  ? 'text-green-600 dark:text-emerald-400'
                  : 'text-red-500 dark:text-red-400'
              "
            >
              <i
                class="mr-1"
                :class="statsData.isActive ? 'fas fa-check-circle' : 'fas fa-times-circle'"
              />
              {{ statsData.isActive ? '活跃' : '已停用' }}
            </p>
          </div>
          <div class="info-item">
            <p class="info-label">权限</p>
            <p class="info-value">{{ formatPermissions(statsData.permissions) }}</p>
          </div>
          <div class="info-item">
            <p class="info-label">创建时间</p>
            <p class="info-value break-all">{{ formatDate(statsData.createdAt) }}</p>
          </div>
          <div class="info-item xl:col-span-2">
            <p class="info-label">过期时间</p>
            <div class="info-value">
              <template v-if="statsData.expirationMode === 'activation' && !statsData.isActivated">
                <span class="text-amber-600 dark:text-amber-400">
                  <i class="fas fa-pause-circle mr-1" />未激活
                </span>
                <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">
                  首次使用后
                  {{ statsData.activationDays || (statsData.activationUnit === 'hours' ? 24 : 30) }}
                  {{ statsData.activationUnit === 'hours' ? '小时' : '天' }}过期
                </span>
              </template>
              <template v-else-if="statsData.expiresAt">
                <span
                  v-if="isApiKeyExpired(statsData.expiresAt)"
                  class="text-red-500 dark:text-red-400"
                >
                  <i class="fas fa-exclamation-circle mr-1" />已过期
                </span>
                <span
                  v-else-if="isApiKeyExpiringSoon(statsData.expiresAt)"
                  class="text-orange-500 dark:text-orange-400"
                >
                  <i class="fas fa-clock mr-1" />{{ formatExpireDate(statsData.expiresAt) }}
                </span>
                <span v-else>{{ formatExpireDate(statsData.expiresAt) }}</span>
              </template>
              <template v-else>
                <span class="text-gray-400 dark:text-gray-500">
                  <i class="fas fa-infinity mr-1" />永不过期
                </span>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- 使用统计概览 -->
      <div class="card-section">
        <header class="section-header">
          <i class="header-icon fas fa-chart-bar text-green-500" />
          <h3 class="header-title">使用统计概览</h3>
          <span class="header-tag">{{ statsPeriod === 'daily' ? '今日' : '本月' }}</span>
        </header>
        <div class="metric-grid">
          <div class="metric-card">
            <p class="metric-value text-green-600 dark:text-emerald-300">
              {{ formatNumber(currentPeriodData.requests) }}
            </p>
            <p class="metric-label">{{ statsPeriod === 'daily' ? '今日' : '本月' }}请求数</p>
          </div>
          <div class="metric-card">
            <p class="metric-value text-gray-900 dark:text-gray-100 dark:text-sky-300">
              {{ formatNumber(currentPeriodData.allTokens) }}
            </p>
            <p class="metric-label">{{ statsPeriod === 'daily' ? '今日' : '本月' }}Token 数</p>
          </div>
          <div class="metric-card">
            <p class="metric-value text-purple-600 dark:text-violet-300">
              {{ currentPeriodData.formattedCost || '$0.000000' }}
            </p>
            <p class="metric-label">{{ statsPeriod === 'daily' ? '今日' : '本月' }}费用</p>
          </div>
          <div class="metric-card">
            <p class="metric-value text-amber-500 dark:text-amber-300">
              {{ formatNumber(currentPeriodData.inputTokens) }}
            </p>
            <p class="metric-label">{{ statsPeriod === 'daily' ? '今日' : '本月' }}输入 Token</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 专属账号运行状态，仅在单 key 且存在绑定时显示 -->
    <div v-if="!multiKeyMode && boundAccountList.length > 0" class="card-section">
      <header class="section-header">
        <i class="header-icon fas fa-plug text-indigo-500" />
        <h3 class="header-title">专属账号运行状态</h3>
        <span class="header-tag">实时更新</span>
      </header>

      <div class="grid grid-cols-1 gap-4" :class="accountGridClass">
        <div
          v-for="account in boundAccountList"
          :key="account.id || account.key"
          class="account-card"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <span
                class="account-icon"
                :class="account.platform === 'claude' ? 'icon-claude' : 'icon-openai'"
              >
                <i :class="account.platform === 'claude' ? 'fas fa-meteor' : 'fas fa-robot'" />
              </span>
              <div>
                <p class="account-name">{{ getAccountLabel(account) }}</p>
                <p class="account-sub">
                  {{ account.platform === 'claude' ? '会话窗口' : '额度窗口' }}
                </p>
              </div>
            </div>
            <div
              v-if="getRateLimitDisplay(account.rateLimitStatus)"
              :class="['rate-badge', getRateLimitDisplay(account.rateLimitStatus).class]"
            >
              <i class="fas fa-tachometer-alt mr-1" />
              {{ getRateLimitDisplay(account.rateLimitStatus).text }}
            </div>
          </div>

          <div v-if="account.platform === 'claude'" class="mt-3 space-y-2">
            <div class="progress-row">
              <div class="progress-track">
                <div
                  class="progress-bar"
                  :class="
                    getSessionProgressBarClass(account.sessionWindow?.sessionWindowStatus, account)
                  "
                  :style="{
                    width: `${Math.min(100, Math.max(0, account.sessionWindow?.progress || 0))}%`
                  }"
                />
              </div>
              <span class="progress-value">
                {{ Math.min(100, Math.max(0, Math.round(account.sessionWindow?.progress || 0))) }}%
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <span>
                {{
                  formatSessionWindowRange(
                    account.sessionWindow?.windowStart,
                    account.sessionWindow?.windowEnd
                  )
                }}
              </span>
              <span
                v-if="account.sessionWindow?.remainingTime > 0"
                class="font-medium text-indigo-600 dark:text-indigo-400"
              >
                剩余 {{ formatSessionRemaining(account.sessionWindow.remainingTime) }}
              </span>
            </div>
          </div>

          <div v-else-if="account.platform === 'openai'" class="mt-3">
            <div v-if="account.codexUsage" class="space-y-2">
              <div
                v-for="type in ['primary', 'secondary']"
                :key="`${account.key}-${type}`"
                class="quota-row"
              >
                <div class="quota-header">
                  <span class="quota-tag" :class="type === 'primary' ? 'tag-indigo' : 'tag-blue'">
                    {{ getCodexWindowLabel(type) }}
                  </span>
                  <span class="quota-percent">
                    {{ formatCodexUsagePercent(account.codexUsage?.[type]) }}
                  </span>
                </div>
                <div class="progress-track">
                  <div
                    class="progress-bar"
                    :class="getCodexUsageBarClass(account.codexUsage?.[type])"
                    :style="{ width: getCodexUsageWidth(account.codexUsage?.[type]) }"
                  />
                </div>
                <div class="quota-foot">
                  重置剩余 {{ formatCodexRemaining(account.codexUsage?.[type]) }}
                </div>
              </div>
            </div>
            <p
              v-else
              class="rounded bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300"
            >
              暂无额度使用数据
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/* eslint-disable no-unused-vars */
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import dayjs from 'dayjs'
import { useApiStatsStore } from '@/stores/apistats'

const apiStatsStore = useApiStatsStore()
const {
  statsData,
  statsPeriod,
  currentPeriodData,
  multiKeyMode,
  aggregatedStats,
  individualStats,
  invalidKeys
} = storeToRefs(apiStatsStore)

const topContributors = computed(() => {
  if (!individualStats.value || individualStats.value.length === 0) return []
  return [...individualStats.value]
    .sort((a, b) => (b.usage?.allTokens || 0) - (a.usage?.allTokens || 0))
    .slice(0, 3)
})

const calculateContribution = (stat) => {
  if (!aggregatedStats.value || !aggregatedStats.value.usage.allTokens) return 0
  const percentage = ((stat.usage?.allTokens || 0) / aggregatedStats.value.usage.allTokens) * 100
  return percentage.toFixed(1)
}

const formatDate = (dateString) => {
  if (!dateString) return '无'
  try {
    return dayjs(dateString).format('YYYY年MM月DD日 HH:mm')
  } catch (error) {
    return '格式错误'
  }
}

const formatExpireDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const isApiKeyExpired = (expiresAt) => {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

const isApiKeyExpiringSoon = (expiresAt) => {
  if (!expiresAt) return false
  const expireDate = new Date(expiresAt)
  const now = new Date()
  const daysUntilExpire = (expireDate - now) / (1000 * 60 * 60 * 24)
  return daysUntilExpire > 0 && daysUntilExpire <= 7
}

const formatNumber = (num) => {
  if (typeof num !== 'number') num = parseInt(num) || 0
  if (num === 0) return '0'
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return num.toLocaleString()
}

const formatPermissions = (permissions) => {
  const map = {
    claude: 'Claude',
    gemini: 'Gemini',
    all: '全部模型'
  }
  return map[permissions] || permissions || '未知'
}

const boundAccountList = computed(() => {
  const accounts = statsData.value?.accounts?.details
  if (!accounts) return []
  const result = []
  if (accounts.claude && accounts.claude.accountType === 'dedicated') {
    result.push({ key: 'claude', ...accounts.claude })
  }
  if (accounts.openai && accounts.openai.accountType === 'dedicated') {
    result.push({ key: 'openai', ...accounts.openai })
  }
  return result
})

const accountGridClass = computed(() => {
  const count = boundAccountList.value.length
  if (count <= 1) {
    return 'md:grid-cols-1 lg:grid-cols-1'
  }
  if (count === 2) {
    return 'md:grid-cols-2'
  }
  return 'md:grid-cols-2 xl:grid-cols-3'
})

const getAccountLabel = (account) => {
  if (!account) return '专属账号'
  return account.platform === 'openai' ? 'OpenAI 专属账号' : 'Claude 专属账号'
}

const formatRateLimitTime = (minutes) => {
  if (!minutes || minutes <= 0) return ''
  const total = Math.floor(minutes)
  const days = Math.floor(total / 1440)
  const hours = Math.floor((total % 1440) / 60)
  const mins = total % 60
  if (days > 0) return hours > 0 ? `${days}天${hours}小时` : `${days}天`
  if (hours > 0) return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`
  return `${mins}分钟`
}

const getRateLimitDisplay = (status) => {
  if (!status) {
    return {
      text: '状态未知',
      class: 'text-gray-400'
    }
  }
  if (status.isRateLimited) {
    const remaining = formatRateLimitTime(status.minutesRemaining)
    const suffix = remaining ? ` · 剩余约 ${remaining}` : ''
    return {
      text: `限流中${suffix}`,
      class: 'text-red-500 dark:text-red-400'
    }
  }
  return {
    text: '未限流',
    class: 'text-green-600 dark:text-emerald-400'
  }
}

const formatSessionWindowRange = (start, end) => {
  if (!start || !end) return '暂无时间窗口信息'
  const s = new Date(start)
  const e = new Date(end)
  const fmt = (d) => `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
  return `${fmt(s)} - ${fmt(e)}`
}

const formatSessionRemaining = (minutes) => {
  if (!minutes || minutes <= 0) return ''
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return hours > 0 ? `${hours}小时${mins}分钟` : `${mins}分钟`
}

const getSessionProgressBarClass = (status, account) => {
  if (!status) return 'bg-black dark:bg-white'
  if (account?.rateLimitStatus?.isRateLimited) return 'bg-red-600'
  const normalized = String(status).toLowerCase()
  if (normalized === 'rejected') return 'bg-red-600'
  if (normalized === 'allowed_warning') return 'bg-orange-500'
  return 'bg-black dark:bg-white'
}

const normalizeCodexUsagePercent = (usageItem) => {
  if (!usageItem) return null
  const percent =
    typeof usageItem.usedPercent === 'number' && !Number.isNaN(usageItem.usedPercent)
      ? usageItem.usedPercent
      : null
  const resetAfterSeconds =
    typeof usageItem.resetAfterSeconds === 'number' && !Number.isNaN(usageItem.resetAfterSeconds)
      ? usageItem.resetAfterSeconds
      : null
  const remainingSeconds =
    typeof usageItem.remainingSeconds === 'number' ? usageItem.remainingSeconds : null
  const resetAtMs = usageItem.resetAt ? Date.parse(usageItem.resetAt) : null
  const resetElapsed =
    resetAfterSeconds !== null &&
    ((remainingSeconds !== null && remainingSeconds <= 0) ||
      (resetAtMs !== null && !Number.isNaN(resetAtMs) && Date.now() >= resetAtMs))
  if (resetElapsed) return 0
  if (percent === null) return null
  return Math.max(0, Math.min(100, percent))
}

const getCodexUsageBarClass = (usageItem) => {
  const percent = normalizeCodexUsagePercent(usageItem)
  if (percent === null) return 'bg-gray-400'
  if (percent >= 90) return 'bg-red-600'
  if (percent >= 75) return 'bg-orange-500'
  return 'bg-black dark:bg-white'
}

const getCodexUsageWidth = (usageItem) => {
  const percent = normalizeCodexUsagePercent(usageItem)
  if (percent === null) return '0%'
  return `${percent}%`
}

const formatCodexUsagePercent = (usageItem) => {
  const percent = normalizeCodexUsagePercent(usageItem)
  if (percent === null) return '--'
  return `${percent.toFixed(1)}%`
}

const formatCodexRemaining = (usageItem) => {
  if (!usageItem) return '--'
  let seconds = usageItem.remainingSeconds
  if (seconds === null || seconds === undefined) {
    seconds = usageItem.resetAfterSeconds
  }
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) {
    return '--'
  }
  seconds = Math.max(0, Math.floor(Number(seconds)))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (days > 0) return hours > 0 ? `${days}天${hours}小时` : `${days}天`
  if (hours > 0) return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`
  if (minutes > 0) return `${minutes}分钟`
  return `${secs}秒`
}

const getCodexWindowLabel = (type) => (type === 'secondary' ? '周限' : '5h')
</script>

<style scoped>
.card-section {
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-card);
  padding: var(--card-padding);
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--card-gap);
  box-shadow: var(--shadow-card);
}

@media (max-width: 768px) {
  .card-section {
    padding: var(--card-padding-sm);
  }
}

/* Section Header */
.section-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: 0;
}

.header-icon {
  font-size: var(--font-size-xl);
}

.header-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.header-tag {
  margin-left: auto;
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
}

/* Info Grid */
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-4);
}

@media (max-width: 768px) {
  .info-grid {
    grid-template-columns: 1fr;
  }
}

.info-item {
  padding: var(--space-4);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  min-height: 80px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.info-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  margin-bottom: var(--space-2);
}

.info-value {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  word-break: break-word;
}

/* Contributor Items */
.contributor-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
}

/* Metric Grid */
.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
}

@media (max-width: 768px) {
  .metric-grid {
    gap: var(--space-3);
  }
}

.metric-card {
  padding: var(--card-gap);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  text-align: center;
}

.metric-value {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-tight);
  margin-bottom: var(--space-2);
}

@media (max-width: 768px) {
  .metric-value {
    font-size: var(--font-size-3xl);
  }
}

.metric-label {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

/* Account Card */
.account-card {
  padding: var(--card-gap);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  transition: var(--transition-all);
}

.account-card:hover {
  border-color: var(--border-strong);
}

.account-icon {
  width: var(--size-button-md);
  height: var(--size-button-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  color: var(--color-white);
}

.icon-claude {
  background: var(--color-black);
}

:global(.dark) .icon-claude {
  background: var(--color-white);
  color: var(--color-black);
}

.icon-openai {
  background: var(--color-gray-600);
}

:global(.dark) .icon-openai {
  background: var(--text-muted);
  color: var(--color-black);
}

.account-name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.account-sub {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.rate-badge {
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
}

/* Progress */
.progress-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.progress-track {
  flex: 1;
  height: 6px;
  background: var(--border-default);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: var(--radius-sm);
  transition: width var(--transition-slow);
}

.progress-value {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  min-width: 40px;
  text-align: right;
}

/* Quota Row */
.quota-row {
  padding: var(--space-4);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
}

.quota-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.quota-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  padding: var(--space-1) 10px;
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  border-radius: var(--radius-xl);
}

.tag-indigo {
  background: #eef2ff;
  color: #4f46e5;
}

:global(.dark) .tag-indigo {
  background: #312e81;
  color: #a5b4fc;
}

.tag-blue {
  background: #f0f9ff;
  color: #0284c7;
}

:global(.dark) .tag-blue {
  background: #0c4a6e;
  color: #7dd3fc;
}

.quota-percent {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.quota-foot {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: var(--space-2);
}
</style>
