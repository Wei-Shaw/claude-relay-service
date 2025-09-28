<template>
  <div class="mb-6 grid grid-cols-1 gap-4 md:mb-8 md:gap-6 lg:grid-cols-2">
    <!-- API Key 基本信息 / 批量查询概要 -->
    <div class="card p-4 md:p-6">
      <h3
        class="mb-3 flex items-center text-lg font-bold text-gray-900 dark:text-gray-100 md:mb-4 md:text-xl"
      >
        <i
          class="mr-2 text-sm md:mr-3 md:text-base"
          :class="
            multiKeyMode ? 'fas fa-layer-group text-purple-500' : 'fas fa-info-circle text-blue-500'
          "
        />
        {{ multiKeyMode ? '批量查询概要' : 'API Key 信息' }}
      </h3>

      <!-- 多 Key 模式下的概要信息 -->
      <div v-if="multiKeyMode && aggregatedStats" class="space-y-2 md:space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400 md:text-base">查询 Keys 数</span>
          <span class="text-sm font-medium text-gray-900 dark:text-gray-100 md:text-base">
            {{ aggregatedStats.totalKeys }} 个
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400 md:text-base">有效 Keys 数</span>
          <span class="text-sm font-medium text-green-600 md:text-base">
            <i class="fas fa-check-circle mr-1 text-xs md:text-sm" />
            {{ aggregatedStats.activeKeys }} 个
          </span>
        </div>
        <div v-if="invalidKeys.length > 0" class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400 md:text-base">无效 Keys 数</span>
          <span class="text-sm font-medium text-red-600 md:text-base">
            <i class="fas fa-times-circle mr-1 text-xs md:text-sm" />
            {{ invalidKeys.length }} 个
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400 md:text-base">总请求数</span>
          <span class="text-sm font-medium text-gray-900 dark:text-gray-100 md:text-base">
            {{ formatNumber(aggregatedStats.usage.requests) }}
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400 md:text-base">总 Token 数</span>
          <span class="text-sm font-medium text-gray-900 dark:text-gray-100 md:text-base">
            {{ formatNumber(aggregatedStats.usage.allTokens) }}
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400 md:text-base">总费用</span>
          <span class="text-sm font-medium text-indigo-600 md:text-base">
            {{ aggregatedStats.usage.formattedCost }}
          </span>
        </div>

        <!-- 各 Key 贡献占比（可选） -->
        <div
          v-if="individualStats.length > 1"
          class="border-t border-gray-200 pt-2 dark:border-gray-700"
        >
          <div class="mb-2 text-xs text-gray-500 dark:text-gray-400">各 Key 贡献占比</div>
          <div class="space-y-1">
            <div
              v-for="stat in topContributors"
              :key="stat.apiId"
              class="flex items-center justify-between text-xs"
            >
              <span class="truncate text-gray-600 dark:text-gray-400">{{ stat.name }}</span>
              <span class="text-gray-900 dark:text-gray-100"
                >{{ calculateContribution(stat) }}%</span
              >
            </div>
          </div>
        </div>
      </div>

      <!-- 单 Key 模式下的详细信息 -->
      <div v-else class="space-y-2 md:space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400 md:text-base">名称</span>
          <span
            class="break-all text-sm font-medium text-gray-900 dark:text-gray-100 md:text-base"
            >{{ statsData.name }}</span
          >
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400 md:text-base">状态</span>
          <span
            class="text-sm font-medium md:text-base"
            :class="statsData.isActive ? 'text-green-600' : 'text-red-600'"
          >
            <i
              class="mr-1 text-xs md:text-sm"
              :class="statsData.isActive ? 'fas fa-check-circle' : 'fas fa-times-circle'"
            />
            {{ statsData.isActive ? '活跃' : '已停用' }}
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400 md:text-base">权限</span>
          <span class="text-sm font-medium text-gray-900 dark:text-gray-100 md:text-base">{{
            formatPermissions(statsData.permissions)
          }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400 md:text-base">创建时间</span>
          <span
            class="break-all text-xs font-medium text-gray-900 dark:text-gray-100 md:text-base"
            >{{ formatDate(statsData.createdAt) }}</span
          >
        </div>
        <div class="flex items-start justify-between">
          <span class="mt-1 flex-shrink-0 text-sm text-gray-600 dark:text-gray-400 md:text-base"
            >过期时间</span
          >
          <!-- 未激活状态 -->
          <div
            v-if="statsData.expirationMode === 'activation' && !statsData.isActivated"
            class="text-sm font-medium text-amber-600 dark:text-amber-500 md:text-base"
          >
            <i class="fas fa-pause-circle mr-1 text-xs md:text-sm" />
            未激活
            <span class="ml-1 text-xs text-gray-500 dark:text-gray-400"
              >(首次使用后
              {{ statsData.activationDays || (statsData.activationUnit === 'hours' ? 24 : 30)
              }}{{ statsData.activationUnit === 'hours' ? '小时' : '天' }}过期)</span
            >
          </div>
          <!-- 已设置过期时间 -->
          <div v-else-if="statsData.expiresAt" class="text-right">
            <div
              v-if="isApiKeyExpired(statsData.expiresAt)"
              class="text-sm font-medium text-red-600 md:text-base"
            >
              <i class="fas fa-exclamation-circle mr-1 text-xs md:text-sm" />
              已过期
            </div>
            <div
              v-else-if="isApiKeyExpiringSoon(statsData.expiresAt)"
              class="break-all text-xs font-medium text-orange-600 md:text-base"
            >
              <i class="fas fa-clock mr-1 text-xs md:text-sm" />
              {{ formatExpireDate(statsData.expiresAt) }}
            </div>
            <div
              v-else
              class="break-all text-xs font-medium text-gray-900 dark:text-gray-100 md:text-base"
            >
              {{ formatExpireDate(statsData.expiresAt) }}
            </div>
          </div>
          <!-- 永不过期 -->
          <div v-else class="text-sm font-medium text-gray-400 dark:text-gray-500 md:text-base">
            <i class="fas fa-infinity mr-1 text-xs md:text-sm" />
            永不过期
          </div>
        </div>

        <div
          v-if="boundAccountList.length > 0"
          class="mt-4 rounded-2xl border border-indigo-100/60 bg-indigo-50/60 p-4 dark:border-indigo-500/40 dark:bg-indigo-500/10"
        >
          <div class="mb-4 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <i class="fas fa-link text-sm text-indigo-500 md:text-base" />
              <span class="text-sm font-semibold text-indigo-900 dark:text-indigo-200 md:text-base"
                >专属账号运行状态</span
              >
            </div>
            <span
              class="rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-indigo-500 shadow-sm dark:bg-slate-900/40 dark:text-indigo-200"
              >实时速览</span
            >
          </div>

          <div class="space-y-3 md:space-y-4">
            <div
              v-for="account in boundAccountList"
              :key="account.id"
              class="rounded-xl bg-white/80 p-3 shadow-sm backdrop-blur dark:bg-slate-900/50 md:p-4"
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                  <div
                    :class="[
                      'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-white shadow-inner',
                      account.platform === 'claude'
                        ? 'bg-gradient-to-br from-purple-500 to-purple-600'
                        : 'bg-gradient-to-br from-sky-500 to-indigo-500'
                    ]"
                  >
                    <i :class="account.platform === 'claude' ? 'fas fa-meteor' : 'fas fa-robot'" />
                  </div>
                  <div>
                    <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {{ account.name || '未命名账号' }}
                    </div>
                    <div class="mt-1 flex items-center gap-2 text-[11px]">
                      <span
                        v-if="account.platform === 'claude'"
                        class="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 font-medium text-purple-700 dark:bg-purple-500/20 dark:text-purple-200"
                        >Claude 专属</span
                      >
                      <span
                        v-else
                        class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-200"
                        >OpenAI 专属</span
                      >
                    </div>
                  </div>
                </div>
                <div
                  v-if="getRateLimitDisplay(account.rateLimitStatus)"
                  class="text-xs font-semibold"
                  :class="getRateLimitDisplay(account.rateLimitStatus).class"
                >
                  <i class="fas fa-tachometer-alt mr-1" />
                  {{ getRateLimitDisplay(account.rateLimitStatus).text }}
                </div>
              </div>

              <div v-if="account.platform === 'claude'" class="mt-3 space-y-3">
                <div v-if="account.sessionWindow?.hasActiveWindow" class="space-y-2">
                  <div class="flex items-center gap-2">
                    <div class="h-2 w-32 rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        :class="[
                          'h-2 rounded-full transition-all duration-300',
                          getSessionProgressBarClass(
                            account.sessionWindow?.sessionWindowStatus,
                            account
                          )
                        ]"
                        :style="{
                          width: `${Math.min(
                            100,
                            Math.max(0, account.sessionWindow?.progress || 0)
                          )}%`
                        }"
                      />
                    </div>
                    <span class="text-xs font-semibold text-gray-700 dark:text-gray-200">
                      {{
                        Math.min(
                          100,
                          Math.max(0, Math.round(account.sessionWindow?.progress || 0))
                        )
                      }}%
                    </span>
                  </div>
                  <div
                    class="flex flex-wrap items-center gap-3 text-[11px] text-gray-600 dark:text-gray-300"
                  >
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
                <div
                  v-else
                  class="rounded-lg bg-white/60 px-3 py-2 text-xs text-gray-500 dark:bg-slate-800/60 dark:text-gray-400"
                >
                  暂无活跃会话窗口
                </div>
              </div>

              <div v-else-if="account.platform === 'openai'" class="mt-3 space-y-3">
                <div v-if="account.codexUsage" class="space-y-3">
                  <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/70">
                    <div class="flex items-center gap-2">
                      <span
                        class="inline-flex min-w-[34px] justify-center rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300"
                      >
                        {{ getCodexWindowLabel('primary') }}
                      </span>
                      <div class="flex-1">
                        <div class="flex items-center gap-2">
                          <div class="h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-600">
                            <div
                              :class="[
                                'h-2 rounded-full transition-all duration-300',
                                getCodexUsageBarClass(account.codexUsage.primary)
                              ]"
                              :style="{ width: getCodexUsageWidth(account.codexUsage.primary) }"
                            />
                          </div>
                          <span
                            class="w-12 text-right text-xs font-semibold text-gray-800 dark:text-gray-100"
                          >
                            {{ formatCodexUsagePercent(account.codexUsage.primary) }}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      重置剩余 {{ formatCodexRemaining(account.codexUsage.primary) }}
                    </div>
                  </div>

                  <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/70">
                    <div class="flex items-center gap-2">
                      <span
                        class="inline-flex min-w-[34px] justify-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:bg-blue-500/20 dark:text-blue-200"
                      >
                        {{ getCodexWindowLabel('secondary') }}
                      </span>
                      <div class="flex-1">
                        <div class="flex items-center gap-2">
                          <div class="h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-600">
                            <div
                              :class="[
                                'h-2 rounded-full transition-all duration-300',
                                getCodexUsageBarClass(account.codexUsage.secondary)
                              ]"
                              :style="{ width: getCodexUsageWidth(account.codexUsage.secondary) }"
                            />
                          </div>
                          <span
                            class="w-12 text-right text-xs font-semibold text-gray-800 dark:text-gray-100"
                          >
                            {{ formatCodexUsagePercent(account.codexUsage.secondary) }}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      重置剩余 {{ formatCodexRemaining(account.codexUsage.secondary) }}
                    </div>
                  </div>
                </div>
                <div
                  v-else
                  class="rounded-lg bg-white/60 px-3 py-2 text-xs text-gray-500 dark:bg-slate-800/60 dark:text-gray-400"
                >
                  暂无额度使用数据
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 使用统计概览 -->
    <div class="card p-4 md:p-6">
      <h3
        class="mb-3 flex flex-col text-lg font-bold text-gray-900 dark:text-gray-100 sm:flex-row sm:items-center md:mb-4 md:text-xl"
      >
        <span class="flex items-center">
          <i class="fas fa-chart-bar mr-2 text-sm text-green-500 md:mr-3 md:text-base" />
          使用统计概览
        </span>
        <span class="text-xs font-normal text-gray-600 dark:text-gray-400 sm:ml-2 md:text-sm"
          >({{ statsPeriod === 'daily' ? '今日' : '本月' }})</span
        >
      </h3>
      <div class="grid grid-cols-2 gap-3 md:gap-4">
        <div class="stat-card text-center">
          <div class="text-lg font-bold text-green-600 md:text-3xl">
            {{ formatNumber(currentPeriodData.requests) }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400 md:text-sm">
            {{ statsPeriod === 'daily' ? '今日' : '本月' }}请求数
          </div>
        </div>
        <div class="stat-card text-center">
          <div class="text-lg font-bold text-blue-600 md:text-3xl">
            {{ formatNumber(currentPeriodData.allTokens) }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400 md:text-sm">
            {{ statsPeriod === 'daily' ? '今日' : '本月' }}Token数
          </div>
        </div>
        <div class="stat-card text-center">
          <div class="text-lg font-bold text-purple-600 md:text-3xl">
            {{ currentPeriodData.formattedCost || '$0.000000' }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400 md:text-sm">
            {{ statsPeriod === 'daily' ? '今日' : '本月' }}费用
          </div>
        </div>
        <div class="stat-card text-center">
          <div class="text-lg font-bold text-yellow-600 md:text-3xl">
            {{ formatNumber(currentPeriodData.inputTokens) }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400 md:text-sm">
            {{ statsPeriod === 'daily' ? '今日' : '本月' }}输入Token
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
import { useApiStatsStore } from '@/stores/apistats'
import dayjs from 'dayjs'

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

// 计算前3个贡献最大的 Key
const topContributors = computed(() => {
  if (!individualStats.value || individualStats.value.length === 0) return []

  return [...individualStats.value]
    .sort((a, b) => (b.usage?.allTokens || 0) - (a.usage?.allTokens || 0))
    .slice(0, 3)
})

// 计算单个 Key 的贡献占比
const calculateContribution = (stat) => {
  if (!aggregatedStats.value || !aggregatedStats.value.usage.allTokens) return 0
  const percentage = ((stat.usage?.allTokens || 0) / aggregatedStats.value.usage.allTokens) * 100
  return percentage.toFixed(1)
}

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return '无'

  try {
    const date = dayjs(dateString)
    return date.format('YYYY年MM月DD日 HH:mm')
  } catch (error) {
    return '格式错误'
  }
}

// 格式化过期日期
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

// 检查 API Key 是否已过期
const isApiKeyExpired = (expiresAt) => {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

// 检查 API Key 是否即将过期（7天内）
const isApiKeyExpiringSoon = (expiresAt) => {
  if (!expiresAt) return false
  const expireDate = new Date(expiresAt)
  const now = new Date()
  const daysUntilExpire = (expireDate - now) / (1000 * 60 * 60 * 24)
  return daysUntilExpire > 0 && daysUntilExpire <= 7
}

// 格式化数字
const formatNumber = (num) => {
  if (typeof num !== 'number') {
    num = parseInt(num) || 0
  }

  if (num === 0) return '0'

  // 大数字使用简化格式
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  } else {
    return num.toLocaleString()
  }
}

// 格式化权限
const formatPermissions = (permissions) => {
  const permissionMap = {
    claude: 'Claude',
    gemini: 'Gemini',
    all: '全部模型'
  }

  return permissionMap[permissions] || permissions || '未知'
}

// 绑定的专属账号列表（仅保留专属类型）
const boundAccountList = computed(() => {
  const accounts = statsData.value?.accounts?.details
  if (!accounts) {
    return []
  }

  const result = []

  if (accounts.claude && accounts.claude.accountType === 'dedicated') {
    result.push({ key: 'claude', ...accounts.claude })
  }

  if (accounts.openai && accounts.openai.accountType === 'dedicated') {
    result.push({ key: 'openai', ...accounts.openai })
  }

  return result
})

// 将分钟格式化为易读文本
const formatRateLimitTime = (minutes) => {
  if (!minutes || minutes <= 0) {
    return ''
  }

  const totalMinutes = Math.floor(minutes)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const mins = totalMinutes % 60

  if (days > 0) {
    if (hours > 0) {
      return `${days}天${hours}小时`
    }
    return `${days}天`
  }

  if (hours > 0) {
    if (mins > 0) {
      return `${hours}小时${mins}分钟`
    }
    return `${hours}小时`
  }

  return `${mins}分钟`
}

// 生成限流状态的展示信息
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
    class: 'text-green-600 dark:text-green-400'
  }
}

// 格式化会话窗口的时间范围
const formatSessionWindowRange = (start, end) => {
  if (!start || !end) {
    return '暂无时间窗口信息'
  }

  const startDate = new Date(start)
  const endDate = new Date(end)

  const formatPart = (date) => {
    const hours = `${date.getHours()}`.padStart(2, '0')
    const minutes = `${date.getMinutes()}`.padStart(2, '0')
    return `${hours}:${minutes}`
  }

  return `${formatPart(startDate)} - ${formatPart(endDate)}`
}

// 格式化会话窗口剩余时间
const formatSessionRemaining = (minutes) => {
  if (!minutes || minutes <= 0) {
    return ''
  }

  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  if (hours > 0) {
    return `${hours}小时${mins}分钟`
  }
  return `${mins}分钟`
}

// 会话窗口进度条颜色
const getSessionProgressBarClass = (status, account) => {
  if (!status) {
    return 'bg-gradient-to-r from-blue-500 to-indigo-600'
  }

  const isRateLimited = account?.rateLimitStatus?.isRateLimited

  if (isRateLimited) {
    return 'bg-gradient-to-r from-red-500 to-red-600'
  }

  const normalized = String(status).toLowerCase()

  if (normalized === 'rejected') {
    return 'bg-gradient-to-r from-red-500 to-red-600'
  }

  if (normalized === 'allowed_warning') {
    return 'bg-gradient-to-r from-yellow-500 to-orange-500'
  }

  return 'bg-gradient-to-r from-blue-500 to-indigo-600'
}

// 归一化 OpenAI 额度使用百分比
const normalizeCodexUsagePercent = (usageItem) => {
  if (!usageItem) {
    return null
  }

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

  if (resetElapsed) {
    return 0
  }

  if (percent === null) {
    return null
  }

  return Math.max(0, Math.min(100, percent))
}

// OpenAI 额度进度条颜色
const getCodexUsageBarClass = (usageItem) => {
  const percent = normalizeCodexUsagePercent(usageItem)

  if (percent === null) {
    return 'bg-gradient-to-r from-gray-300 to-gray-400'
  }

  if (percent >= 90) {
    return 'bg-gradient-to-r from-red-500 to-red-600'
  }

  if (percent >= 75) {
    return 'bg-gradient-to-r from-yellow-500 to-orange-500'
  }

  return 'bg-gradient-to-r from-emerald-500 to-teal-500'
}

// OpenAI 额度进度条宽度
const getCodexUsageWidth = (usageItem) => {
  const percent = normalizeCodexUsagePercent(usageItem)
  if (percent === null) {
    return '0%'
  }
  return `${percent}%`
}

// OpenAI 额度百分比文本
const formatCodexUsagePercent = (usageItem) => {
  const percent = normalizeCodexUsagePercent(usageItem)
  if (percent === null) {
    return '--'
  }
  return `${percent.toFixed(1)}%`
}

// OpenAI 额度剩余时间
const formatCodexRemaining = (usageItem) => {
  if (!usageItem) {
    return '--'
  }

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

  if (days > 0) {
    if (hours > 0) {
      return `${days}天${hours}小时`
    }
    return `${days}天`
  }

  if (hours > 0) {
    if (minutes > 0) {
      return `${hours}小时${minutes}分钟`
    }
    return `${hours}小时`
  }

  if (minutes > 0) {
    return `${minutes}分钟`
  }

  return `${secs}秒`
}

// OpenAI 窗口标签
const getCodexWindowLabel = (type) => {
  if (type === 'secondary') {
    return '周限'
  }
  return '5h'
}
</script>

<style scoped>
/* 卡片样式 - 使用CSS变量 */
.card {
  background: var(--surface-color);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  box-shadow:
    0 10px 15px -3px rgba(0, 0, 0, 0.1),
    0 4px 6px -2px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
}

.card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.15),
    0 10px 10px -5px rgba(0, 0, 0, 0.08);
}

:global(.dark) .card:hover {
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.5),
    0 10px 10px -5px rgba(0, 0, 0, 0.35);
}

/* 统计卡片样式 - 使用CSS变量 */
.stat-card {
  background: linear-gradient(135deg, var(--surface-color) 0%, var(--glass-strong-color) 100%);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  padding: 16px;
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
}

@media (min-width: 768px) {
  .stat-card {
    border-radius: 20px;
    padding: 24px;
  }
}

.stat-card::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

:global(.dark) .stat-card:hover {
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.4),
    0 10px 10px -5px rgba(0, 0, 0, 0.25);
}

.stat-card:hover::before {
  opacity: 1;
}

/* 响应式优化 */
@media (max-width: 768px) {
  .card {
    margin-bottom: 1rem;
  }
}

@media (max-width: 480px) {
  .stat-card {
    padding: 12px;
  }
}
</style>
