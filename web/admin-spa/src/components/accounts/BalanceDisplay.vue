<template>
  <div class="min-w-[200px] space-y-1">
    <div v-if="loading" class="flex items-center gap-2">
      <i class="fas fa-spinner fa-spin text-gray-400 dark:text-gray-500"></i>
      <span class="text-xs text-gray-500 dark:text-gray-400">加载中...</span>
    </div>

    <div v-else-if="requestError" class="flex items-center gap-2">
      <i class="fas fa-exclamation-circle text-red-500"></i>
      <span class="text-xs text-red-600 dark:text-red-400">{{ requestError }}</span>
      <button
        class="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400"
        :disabled="refreshing"
        @click="reload"
      >
        重试
      </button>
    </div>

    <div v-else-if="balanceData" class="space-y-1">
      <div v-if="balanceData.status === 'error' && balanceData.error" class="text-xs text-red-500">
        {{ balanceData.error }}
      </div>

      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <i
            class="fas"
            :class="
              balanceData.balance
                ? 'fa-wallet text-green-600 dark:text-green-400'
                : 'fa-chart-line text-gray-500 dark:text-gray-400'
            "
          ></i>
          <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {{ primaryText }}
          </span>
          <span class="rounded px-1.5 py-0.5 text-xs" :class="sourceClass">
            {{ sourceLabel }}
          </span>
        </div>

        <button
          v-if="!hideRefresh"
          class="text-xs text-gray-500 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:text-blue-400"
          :disabled="refreshing || !canRefresh"
          :title="refreshTitle"
          @click="refresh"
        >
          <i class="fas fa-sync-alt" :class="{ 'fa-spin': refreshing }"></i>
        </button>
      </div>

      <!-- 配额（如适用） -->
      <div v-if="quotaInfo && isAntigravityQuota" class="space-y-2">
        <div class="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>剩余</span>
          <span>{{ formatQuotaNumber(quotaInfo.remaining) }}</span>
        </div>

        <div class="space-y-1">
          <div
            v-for="row in antigravityRows"
            :key="row.category"
            class="flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5 dark:bg-gray-700/60"
          >
            <span class="h-2 w-2 shrink-0 rounded-full" :class="row.dotClass"></span>
            <span
              class="min-w-0 flex-1 truncate text-xs font-medium text-gray-800 dark:text-gray-100"
              :title="row.category"
            >
              {{ row.category }}
            </span>

            <div class="flex w-[94px] flex-col gap-0.5">
              <div class="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-600">
                <div
                  class="h-1.5 rounded-full transition-all"
                  :class="row.barClass"
                  :style="{ width: `${row.remainingPercent ?? 0}%` }"
                ></div>
              </div>
              <div
                class="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-300"
              >
                <span>{{ row.remainingText }}</span>
                <span v-if="row.resetAt" class="text-gray-400 dark:text-gray-400">{{
                  formatResetTime(row.resetAt)
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="quotaInfo" class="space-y-1">
        <div class="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>已用: {{ formatQuotaNumber(quotaInfo.used) }}</span>
          <span>剩余: {{ formatQuotaNumber(quotaInfo.remaining) }}</span>
        </div>
        <div class="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            class="h-1.5 rounded-full transition-all"
            :class="quotaBarClass"
            :style="{ width: `${Math.min(100, quotaInfo.percentage)}%` }"
          ></div>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-500 dark:text-gray-400">
            {{ quotaInfo.percentage.toFixed(1) }}% 已使用
          </span>
          <span v-if="quotaInfo.resetAt" class="text-gray-400 dark:text-gray-500">
            重置: {{ formatResetTime(quotaInfo.resetAt) }}
          </span>
        </div>
      </div>

      <div v-else-if="balanceData.quota?.unlimited" class="flex items-center gap-2">
        <i class="fas fa-infinity text-blue-500 dark:text-blue-400"></i>
        <span class="text-xs text-gray-600 dark:text-gray-400">无限制</span>
      </div>

      <div
        v-if="balanceData.cacheExpiresAt && balanceData.source === 'cache'"
        class="text-xs text-gray-400 dark:text-gray-500"
      >
        缓存至: {{ formatCacheExpiry(balanceData.cacheExpiresAt) }}
      </div>
    </div>

    <div v-else class="text-xs text-gray-400 dark:text-gray-500">暂无余额数据</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'

import { getAccountBalanceApi, refreshAccountBalanceApi } from '@/utils/http_apis'
import { formatNumber } from '@/utils/tools'

const props = defineProps({
  accountId: { type: String, required: true },
  platform: { type: String, required: true },
  initialBalance: { type: Object, default: null },
  hideRefresh: { type: Boolean, default: false },
  autoLoad: { type: Boolean, default: true },
  queryMode: { type: String, default: 'local' } // local | auto | api
})

const emit = defineEmits(['refreshed', 'error'])

const balanceData = ref(props.initialBalance)
const loading = ref(false)
const refreshing = ref(false)
const requestError = ref(null)

const sourceClass = computed(() => {
  const source = balanceData.value?.source
  return {
    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300': source === 'api',
    'bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-300': source === 'cache',
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300': source === 'local'
  }
})

const sourceLabel = computed(() => {
  const source = balanceData.value?.source
  return { api: 'API', cache: '缓存', local: '本地' }[source] || '未知'
})

const quotaInfo = computed(() => {
  const quota = balanceData.value?.quota
  if (!quota || quota.unlimited) return null
  if (typeof quota.percentage !== 'number' || !Number.isFinite(quota.percentage)) return null
  return {
    used: quota.used ?? 0,
    remaining: quota.remaining ?? 0,
    percentage: quota.percentage,
    resetAt: quota.resetAt || null
  }
})

const isAntigravityQuota = computed(() => {
  return balanceData.value?.quota?.type === 'antigravity'
})

const antigravityRows = computed(() => {
  if (!isAntigravityQuota.value) return []

  const buckets = balanceData.value?.quota?.buckets
  const list = Array.isArray(buckets) ? buckets : []
  const map = new Map(list.map((b) => [b?.category, b]))

  const order = ['Gemini Pro', 'Claude', 'Gemini Flash', 'Gemini Image']
  const styles = {
    'Gemini Pro': { dotClass: 'bg-blue-500', barClass: 'bg-blue-500 dark:bg-blue-400' },
    Claude: { dotClass: 'bg-purple-500', barClass: 'bg-purple-500 dark:bg-purple-400' },
    'Gemini Flash': { dotClass: 'bg-cyan-500', barClass: 'bg-cyan-500 dark:bg-cyan-400' },
    'Gemini Image': { dotClass: 'bg-emerald-500', barClass: 'bg-emerald-500 dark:bg-emerald-400' }
  }

  return order.map((category) => {
    const raw = map.get(category) || null
    const remaining = raw?.remaining
    const remainingPercent = Number.isFinite(Number(remaining))
      ? Math.max(0, Math.min(100, Number(remaining)))
      : null

    return {
      category,
      remainingPercent,
      remainingText: remainingPercent === null ? '—' : `${Math.round(remainingPercent)}%`,
      resetAt: raw?.resetAt || null,
      dotClass: styles[category]?.dotClass || 'bg-gray-400',
      barClass: styles[category]?.barClass || 'bg-gray-400'
    }
  })
})

const quotaBarClass = computed(() => {
  const percentage = quotaInfo.value?.percentage || 0
  if (percentage >= 90) return 'bg-red-500 dark:bg-red-600'
  if (percentage >= 70) return 'bg-yellow-500 dark:bg-yellow-600'
  return 'bg-green-500 dark:bg-green-600'
})

const canRefresh = computed(() => {
  // antigravity 配额：允许直接触发 Provider 刷新（无需脚本）
  if (props.queryMode === 'api' || props.queryMode === 'auto') {
    return true
  }

  // 其他平台：仅在“已启用脚本且该账户配置了脚本”时允许刷新，避免误导（非脚本 Provider 多为降级策略）
  const data = balanceData.value
  if (!data) return false
  if (data.scriptEnabled === false) return false
  return !!data.scriptConfigured
})

const refreshTitle = computed(() => {
  if (refreshing.value) return '刷新中...'
  if (!canRefresh.value) {
    if (balanceData.value?.scriptEnabled === false) {
      return '余额脚本功能已禁用'
    }
    return '请先配置余额脚本'
  }
  if (isAntigravityQuota.value) {
    return '刷新配额（调用 Antigravity API）'
  }
  return '刷新余额（调用脚本配置的余额 API）'
})

const primaryText = computed(() => {
  if (balanceData.value?.balance?.formattedAmount) {
    return balanceData.value.balance.formattedAmount
  }
  const dailyCost = Number(balanceData.value?.statistics?.dailyCost || 0)
  return `今日成本 ${formatCurrency(dailyCost)}`
})

const load = async () => {
  if (!props.autoLoad) return
  if (!props.accountId || !props.platform) return

  loading.value = true
  requestError.value = null

  const params = {
    platform: props.platform,
    queryApi: props.queryMode === 'api' ? true : props.queryMode === 'auto' ? 'auto' : false
  }
  const response = await getAccountBalanceApi(props.accountId, params)
  if (response?.success) {
    balanceData.value = response.data
  } else {
    requestError.value = response?.error || '加载失败'
  }
  loading.value = false
}

const refresh = async () => {
  if (!props.accountId || !props.platform) return
  if (refreshing.value) return
  if (!canRefresh.value) return

  refreshing.value = true
  requestError.value = null

  const response = await refreshAccountBalanceApi(props.accountId, { platform: props.platform })
  if (response?.success) {
    balanceData.value = response.data
    emit('refreshed', response.data)
  } else {
    requestError.value = response?.error || '刷新失败'
  }
  refreshing.value = false
}

const reload = async () => {
  await load()
}

const formatQuotaNumber = (num) => {
  if (num === Infinity) return '∞'
  const value = Number(num)
  if (!Number.isFinite(value)) return 'N/A'
  if (isAntigravityQuota.value) {
    return `${Math.round(value)}%`
  }
  return formatNumber(value)
}

const formatCurrency = (amount) => {
  const value = Number(amount)
  if (!Number.isFinite(value)) return '$0.00'
  if (value >= 1) return `$${value.toFixed(2)}`
  if (value >= 0.01) return `$${value.toFixed(3)}`
  return `$${value.toFixed(6)}`
}

const formatResetTime = (isoString) => {
  const date = new Date(isoString)
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  if (!Number.isFinite(diff)) return '未知'
  if (diff < 0) return '已过期'

  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `${days}天后`
  }
  return `${hours}小时${remainMinutes}分钟`
}

const formatCacheExpiry = (isoString) => {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return '未知'
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

watch(
  () => props.initialBalance,
  (newVal) => {
    if (newVal) {
      balanceData.value = newVal
    }
  }
)

onMounted(() => {
  if (!props.initialBalance) {
    load()
  }
})

defineExpose({ refresh, reload })
</script>
