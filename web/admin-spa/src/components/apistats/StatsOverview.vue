<template>
  <div class="mb-6 grid grid-cols-1 gap-4 md:mb-8 md:gap-6 lg:grid-cols-2">
    <!-- API Key 基本信息 -->
    <div class="card p-4 md:p-6">
      <h3
        class="mb-3 flex items-center text-lg font-bold text-gray-900 dark:text-gray-100 md:mb-4 md:text-xl"
      >
        <i class="fas fa-info-circle mr-2 text-sm text-blue-500 md:mr-3 md:text-base" />
        API Key 信息
      </h3>
      <div class="space-y-2 md:space-y-3">
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
          <div v-if="statsData.expiresAt" class="text-right">
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
          <div v-else class="text-sm font-medium text-gray-400 dark:text-gray-500 md:text-base">
            <i class="fas fa-infinity mr-1 text-xs md:text-sm" />
            永不过期
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
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'
import dayjs from 'dayjs'

const apiStatsStore = useApiStatsStore()
const { statsData, statsPeriod, currentPeriodData } = storeToRefs(apiStatsStore)

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
