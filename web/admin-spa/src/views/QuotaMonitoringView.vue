<template>
  <div class="tab-content">
    <div class="card p-4 sm:p-6">
      <!-- Header -->
      <div class="mb-4 flex items-center justify-between sm:mb-6">
        <div>
          <h3 class="mb-1 text-lg font-bold text-gray-900 dark:text-gray-100 sm:mb-2 sm:text-xl">
            配额监控
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 sm:text-base">
            实时监控 Claude 账户池状态与 API Key 用量
          </p>
        </div>
        <div class="flex items-center gap-3">
          <span v-if="autoRefreshCountdown > 0" class="text-xs text-gray-500 dark:text-gray-400">
            {{ autoRefreshCountdown }}s 后刷新
          </span>
          <button
            class="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            :disabled="loading"
            @click="fetchData"
          >
            <i class="fas fa-sync-alt mr-2" :class="{ 'animate-spin': loading }" />
            刷新
          </button>
        </div>
      </div>

      <!-- 区域 1: 池子概览卡片 -->
      <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div class="stat-card">
          <div class="flex items-center justify-between">
            <div>
              <p class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400 sm:text-sm">
                总账户数
              </p>
              <p class="text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                {{ poolSummary.totalAccounts }}
              </p>
            </div>
            <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-blue-500 to-blue-600">
              <i class="fas fa-server" />
            </div>
          </div>
        </div>

        <div class="stat-card">
          <div class="flex items-center justify-between">
            <div>
              <p class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400 sm:text-sm">
                正常
              </p>
              <p class="text-xl font-bold text-green-600 dark:text-green-400 sm:text-2xl">
                {{ poolSummary.statusCounts.allowed }}
              </p>
            </div>
            <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-green-500 to-green-600">
              <i class="fas fa-check-circle" />
            </div>
          </div>
        </div>

        <div class="stat-card">
          <div class="flex items-center justify-between">
            <div>
              <p class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400 sm:text-sm">
                告警
              </p>
              <p class="text-xl font-bold text-yellow-600 dark:text-yellow-400 sm:text-2xl">
                {{ poolSummary.statusCounts.warning }}
              </p>
            </div>
            <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-yellow-500 to-yellow-600">
              <i class="fas fa-exclamation-triangle" />
            </div>
          </div>
        </div>

        <div class="stat-card">
          <div class="flex items-center justify-between">
            <div>
              <p class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400 sm:text-sm">
                限流
              </p>
              <p class="text-xl font-bold text-red-600 dark:text-red-400 sm:text-2xl">
                {{ poolSummary.statusCounts.rejected }}
              </p>
            </div>
            <div class="stat-icon flex-shrink-0 bg-gradient-to-br from-red-500 to-red-600">
              <i class="fas fa-ban" />
            </div>
          </div>
        </div>
      </div>

      <!-- 区域 2: 账户状态表格 -->
      <div class="mb-6">
        <h4 class="mb-3 text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
          <i class="fas fa-user-circle mr-2 text-blue-500" />
          账户 5h 窗口状态
        </h4>
        <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th class="table-header">账户</th>
                <th class="table-header">订阅类型</th>
                <th class="table-header">5h 状态</th>
                <th class="table-header">窗口进度</th>
                <th class="table-header">剩余时间</th>
                <th class="table-header">最近使用</th>
                <th class="table-header">调度状态</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
              <tr
                v-for="account in accounts"
                :key="account.accountId"
                class="hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <td class="table-cell">
                  <div class="flex flex-col">
                    <span class="font-medium text-gray-900 dark:text-gray-100">
                      {{ account.name || account.email || account.accountId }}
                    </span>
                    <span v-if="account.email" class="text-xs text-gray-500">
                      {{ account.email }}
                    </span>
                  </div>
                </td>
                <td class="table-cell">
                  <span
                    class="inline-flex rounded-full px-2 py-1 text-xs font-semibold"
                    :class="accountTypeBadge(account.accountType)"
                  >
                    {{ account.accountType }}
                  </span>
                </td>
                <td class="table-cell">
                  <span
                    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    :class="statusBadgeClass(account)"
                  >
                    <span class="mr-1.5 h-2 w-2 rounded-full" :class="statusDotClass(account)" />
                    {{ statusText(account) }}
                  </span>
                </td>
                <td class="table-cell">
                  <div v-if="account.sessionWindowStart" class="flex items-center gap-2">
                    <div class="h-2 w-20 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        class="h-full rounded-full transition-all duration-500"
                        :class="progressBarColor(account.sessionWindowProgress)"
                        :style="{
                          width: (account.sessionWindowProgress || 0) + '%'
                        }"
                      />
                    </div>
                    <span class="text-xs text-gray-500">
                      {{ Math.round(account.sessionWindowProgress || 0) }}%
                    </span>
                  </div>
                  <span v-else class="text-xs text-gray-400">-</span>
                </td>
                <td class="table-cell">
                  <span
                    v-if="account.remainingTime"
                    class="text-sm text-gray-700 dark:text-gray-300"
                  >
                    {{ formatRemainingTime(account.remainingTime) }}
                  </span>
                  <span v-else class="text-xs text-gray-400">-</span>
                </td>
                <td class="table-cell">
                  <span class="text-sm text-gray-700 dark:text-gray-300">
                    {{ formatTime(account.lastUsedAt) }}
                  </span>
                </td>
                <td class="table-cell">
                  <span
                    v-if="!account.isActive"
                    class="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                  >
                    已禁用
                  </span>
                  <span
                    v-else-if="!account.schedulable"
                    class="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                  >
                    已停调
                  </span>
                  <span
                    v-else
                    class="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  >
                    正常
                  </span>
                </td>
              </tr>
              <tr v-if="accounts.length === 0">
                <td class="px-6 py-8 text-center text-gray-500 dark:text-gray-400" colspan="7">
                  <i class="fas fa-inbox mb-2 text-2xl" />
                  <p>暂无账户数据</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 区域 3: API Key 管理 -->
      <div>
        <div class="mb-3 flex items-center justify-between">
          <h4 class="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
            <i class="fas fa-key mr-2 text-purple-500" />
            API Key 用量
          </h4>
          <button
            class="inline-flex items-center rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            @click="showCreateKeyModal = true"
          >
            <i class="fas fa-plus mr-2" />
            添加 Key
          </button>
        </div>
        <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th class="table-header">名称</th>
                <th class="table-header">状态</th>
                <th class="table-header">Token 限额</th>
                <th class="table-header">已用 Token</th>
                <th class="table-header">费用限额</th>
                <th class="table-header">今日费用</th>
                <th class="table-header">总费用</th>
                <th class="table-header">最近使用</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
              <tr
                v-for="key in apiKeys"
                :key="key.keyId"
                class="hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <td class="table-cell">
                  <span class="font-medium text-gray-900 dark:text-gray-100">
                    {{ key.name || key.keyId }}
                  </span>
                </td>
                <td class="table-cell">
                  <span
                    class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
                    :class="
                      key.status === 'active'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    "
                  >
                    {{ key.status === 'active' ? '启用' : '禁用' }}
                  </span>
                </td>
                <td class="table-cell">
                  <span v-if="key.tokenLimit" class="text-sm text-gray-700 dark:text-gray-300">
                    {{ formatNumber(key.tokenLimit) }}
                  </span>
                  <span v-else class="text-xs text-gray-400">无限制</span>
                </td>
                <td class="table-cell">
                  <span class="text-sm text-gray-700 dark:text-gray-300">
                    {{ formatNumber(key.tokensUsed) }}
                  </span>
                </td>
                <td class="table-cell">
                  <span v-if="key.totalCostLimit" class="text-sm text-gray-700 dark:text-gray-300">
                    ${{ key.totalCostLimit.toFixed(2) }}
                  </span>
                  <span v-else class="text-xs text-gray-400">无限制</span>
                </td>
                <td class="table-cell">
                  <span
                    class="text-sm font-medium"
                    :class="
                      key.dailyCost > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500'
                    "
                  >
                    ${{ (key.dailyCost || 0).toFixed(4) }}
                  </span>
                </td>
                <td class="table-cell">
                  <span
                    class="text-sm font-medium"
                    :class="
                      key.totalCost > 0 ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500'
                    "
                  >
                    ${{ (key.totalCost || 0).toFixed(4) }}
                  </span>
                </td>
                <td class="table-cell">
                  <span class="text-sm text-gray-700 dark:text-gray-300">
                    {{ formatTime(key.lastUsedAt) }}
                  </span>
                </td>
              </tr>
              <tr v-if="apiKeys.length === 0">
                <td class="px-6 py-8 text-center text-gray-500 dark:text-gray-400" colspan="8">
                  <i class="fas fa-key mb-2 text-2xl" />
                  <p>暂无 API Key</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- API Key 汇总 -->
        <div v-if="apiKeySummary" class="mt-3 flex gap-4 text-sm text-gray-600 dark:text-gray-400">
          <span>总计: {{ apiKeySummary.total }}</span>
          <span class="text-green-600 dark:text-green-400"> 启用: {{ apiKeySummary.active }} </span>
          <span class="text-red-600 dark:text-red-400"> 禁用: {{ apiKeySummary.disabled }} </span>
          <span class="text-blue-600 dark:text-blue-400">
            今日总费用: ${{ poolSummary.todayTotalCost.toFixed(4) }}
          </span>
        </div>
      </div>

      <!-- 创建 API Key 弹窗 -->
      <div
        v-if="showCreateKeyModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        @click.self="showCreateKeyModal = false"
      >
        <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800">
          <h3 class="mb-4 text-lg font-bold text-gray-900 dark:text-gray-100">
            <i class="fas fa-plus-circle mr-2 text-green-500" />
            添加 API Key
          </h3>
          <div class="space-y-4">
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Key 名称
              </label>
              <input
                v-model="newKeyForm.name"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                placeholder="输入 Key 名称"
                type="text"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Token 限额
              </label>
              <input
                v-model.number="newKeyForm.tokenLimit"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                min="0"
                placeholder="留空为无限制"
                type="number"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                费用限额 ($)
              </label>
              <input
                v-model.number="newKeyForm.totalCostLimit"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                min="0"
                placeholder="留空为无限制"
                step="0.01"
                type="number"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                备注
              </label>
              <textarea
                v-model="newKeyForm.description"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                placeholder="可选备注"
                rows="2"
              />
            </div>
          </div>
          <div class="mt-6 flex justify-end gap-3">
            <button
              class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              @click="showCreateKeyModal = false"
            >
              取消
            </button>
            <button
              class="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              :disabled="creatingKey || !newKeyForm.name"
              @click="handleCreateKey"
            >
              <i v-if="creatingKey" class="fas fa-spinner mr-2 animate-spin" />
              创建
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { getQuotaMonitoringApi, createApiKeyApi } from '@/utils/http_apis'

const loading = ref(false)
const accounts = ref([])
const apiKeys = ref([])
const poolSummary = ref({
  totalAccounts: 0,
  activeAccounts: 0,
  statusCounts: { allowed: 0, warning: 0, rejected: 0 },
  todayTotalTokens: 0,
  todayTotalCost: 0
})
const apiKeySummary = ref(null)
const autoRefreshCountdown = ref(30)
const showCreateKeyModal = ref(false)
const creatingKey = ref(false)

const newKeyForm = reactive({
  name: '',
  tokenLimit: null,
  totalCostLimit: null,
  description: ''
})

let countdownTimer = null

async function fetchData() {
  loading.value = true
  autoRefreshCountdown.value = 30
  try {
    const res = await getQuotaMonitoringApi()
    if (res.success && res.data) {
      accounts.value = res.data.accounts || []
      apiKeys.value = res.data.apiKeys || []
      poolSummary.value = res.data.poolSummary || poolSummary.value
      apiKeySummary.value = res.data.apiKeySummary || null
    }
  } catch (e) {
    console.error('Failed to fetch quota monitoring data:', e)
  } finally {
    loading.value = false
  }
}

async function handleCreateKey() {
  if (!newKeyForm.name) return
  creatingKey.value = true
  try {
    const data = {
      name: newKeyForm.name,
      description: newKeyForm.description || ''
    }
    if (newKeyForm.tokenLimit) data.tokenLimit = newKeyForm.tokenLimit
    if (newKeyForm.totalCostLimit) data.totalCostLimit = newKeyForm.totalCostLimit
    await createApiKeyApi(data)
    showCreateKeyModal.value = false
    newKeyForm.name = ''
    newKeyForm.tokenLimit = null
    newKeyForm.totalCostLimit = null
    newKeyForm.description = ''
    await fetchData()
  } catch (e) {
    console.error('Failed to create API key:', e)
    alert('创建失败: ' + (e.message || '未知错误'))
  } finally {
    creatingKey.value = false
  }
}

function statusBadgeClass(account) {
  if (account.fiveHourAutoStopped || account.rateLimitStatus?.isRateLimited) {
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  }
  if (account.overloadStatus?.isOverloaded) {
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
  }
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
}

function statusDotClass(account) {
  if (account.fiveHourAutoStopped || account.rateLimitStatus?.isRateLimited) {
    return 'bg-red-500'
  }
  if (account.overloadStatus?.isOverloaded) return 'bg-yellow-500'
  return 'bg-green-500'
}

function statusText(account) {
  if (account.fiveHourAutoStopped) return '5h 限流'
  if (account.rateLimitStatus?.isRateLimited) return '限流中'
  if (account.overloadStatus?.isOverloaded) return '过载'
  return '正常'
}

function accountTypeBadge(type) {
  if (!type) return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
  const t = type.toLowerCase()
  if (t.includes('max')) {
    return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
  }
  if (t.includes('pro')) {
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  }
  if (t.includes('team')) {
    return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
  }
  return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
}

function progressBarColor(progress) {
  if (progress >= 80) return 'bg-red-500'
  if (progress >= 50) return 'bg-yellow-500'
  return 'bg-green-500'
}

function formatRemainingTime(ms) {
  if (!ms || ms <= 0) return '-'
  const totalMin = Math.floor(ms / 60000)
  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function formatTime(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return d.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatNumber(n) {
  if (!n && n !== 0) return '0'
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

function startAutoRefresh() {
  stopAutoRefresh()
  countdownTimer = setInterval(() => {
    autoRefreshCountdown.value--
    if (autoRefreshCountdown.value <= 0) {
      fetchData()
    }
  }, 1000)
}

function stopAutoRefresh() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

onMounted(() => {
  fetchData()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<style scoped>
.stat-card {
  @apply rounded-xl border border-gray-200/50 bg-white/80 p-3 shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-md dark:border-gray-700/50 dark:bg-gray-800/80 sm:p-4;
}

.stat-icon {
  @apply flex h-10 w-10 items-center justify-center rounded-xl text-white sm:h-12 sm:w-12;
}

.table-header {
  @apply whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400;
}

.table-cell {
  @apply whitespace-nowrap px-4 py-3;
}
</style>
