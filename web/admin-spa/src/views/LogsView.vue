<template>
  <div>
    <div class="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">请求日志</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">最新请求，支持分页与聚合查看</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          聚合
          <select
            v-model="groupByLocal"
            class="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800"
            @change="handleGroupByChange"
          >
            <option value="key">按 Key</option>
            <option value="model">按模型</option>
            <option value="account">按账户</option>
            <option value="none">不聚合</option>
          </select>
        </label>
        <button
          class="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-blue-600 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 sm:text-sm"
          :disabled="loading"
          @click="loadLogs"
        >
          <i :class="['fas fa-sync-alt', { 'animate-spin': loading }]" />
          刷新
        </button>
      </div>
    </div>

    <!-- 过滤器 -->
    <div
      class="mb-4 grid grid-cols-1 gap-3 rounded-xl bg-gray-50 p-3 shadow-sm dark:bg-gray-800/60 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div class="flex flex-col gap-1">
        <label class="text-xs font-semibold text-gray-600 dark:text-gray-300">API Key ID</label>
        <input
          v-model="filtersLocal.keyId"
          class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          placeholder="可选，精确匹配"
          @keyup.enter="applyFilters"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs font-semibold text-gray-600 dark:text-gray-300">模型</label>
        <input
          v-model="filtersLocal.model"
          class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          placeholder="可选，包含匹配"
          @keyup.enter="applyFilters"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs font-semibold text-gray-600 dark:text-gray-300">账户 ID</label>
        <input
          v-model="filtersLocal.accountId"
          class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          placeholder="可选"
          @keyup.enter="applyFilters"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs font-semibold text-gray-600 dark:text-gray-300">账户类型</label>
        <input
          v-model="filtersLocal.accountType"
          class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          placeholder="如 claude/openai/gemini 等"
          @keyup.enter="applyFilters"
        />
      </div>
      <div class="sm:col-span-2 lg:col-span-4 flex items-center gap-2">
        <button
          class="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          :disabled="loading"
          @click="applyFilters"
        >
          应用筛选
        </button>
        <button
          class="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          :disabled="loading"
          @click="resetFilters"
        >
          重置
        </button>
      </div>
    </div>

    <!-- 聚合视图 -->
    <div v-if="showGroups" class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="group in groups"
        :key="group.key"
        class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-sm font-semibold text-gray-800 dark:text-gray-100">{{ group.label }}</div>
            <div class="text-[11px] text-gray-500 dark:text-gray-400">{{ groupByLabel }}</div>
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">{{ group.count }} 次</div>
        </div>
        <div class="mt-2 flex items-center gap-4 text-sm">
          <div class="text-indigo-600 dark:text-indigo-300">{{ formatNumber(group.tokens) }} tokens</div>
          <div class="text-green-600 dark:text-green-300">{{ formatCostValue(group.cost) }}</div>
        </div>
      </div>
    </div>

    <!-- 日志表格 -->
    <div class="overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <table class="min-w-full text-sm">
        <thead class="bg-gray-50 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-200">
          <tr>
            <th class="px-3 py-2 text-left">时间</th>
            <th class="px-3 py-2 text-left">API Key</th>
            <th class="px-3 py-2 text-left">模型</th>
            <th class="px-3 py-2 text-left">Token</th>
            <th class="px-3 py-2 text-left">费用</th>
            <th class="px-3 py-2 text-left">账户</th>
            <th class="px-3 py-2 text-left">标记</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 text-xs text-gray-800 dark:divide-gray-700 dark:text-gray-100">
          <tr v-if="!loading && logs.length === 0">
            <td colspan="7" class="px-3 py-6 text-center text-gray-500 dark:text-gray-400">暂无日志</td>
          </tr>
          <tr v-for="log in logs" :key="`${log.timestamp}-${log.keyId || ''}-${log.model || ''}`">
            <td class="whitespace-nowrap px-3 py-2">{{ formatDateTime(log.timestamp) }}</td>
            <td class="px-3 py-2">
              <div class="font-semibold text-gray-900 dark:text-gray-100">{{ getKeyLabel(log) }}</div>
              <div class="text-[11px] text-gray-500 dark:text-gray-400" v-if="log.keyId">{{ log.keyId }}</div>
            </td>
            <td class="px-3 py-2">
              <div class="font-medium">{{ log.model || 'unknown' }}</div>
              <div class="text-[11px] text-gray-500 dark:text-gray-400" v-if="log.accountType">来源: {{ log.accountType }}</div>
            </td>
            <td class="px-3 py-2">
              <div class="font-semibold text-indigo-600 dark:text-indigo-300">{{ formatNumber(log.totalTokens || 0) }}</div>
              <div class="text-[11px] text-gray-500 dark:text-gray-400">
                in {{ formatNumber(log.inputTokens || 0) }} / out {{ formatNumber(log.outputTokens || 0) }}
                <span v-if="log.cacheCreateTokens || log.cacheReadTokens">
                  / cache {{ formatNumber((log.cacheCreateTokens || 0) + (log.cacheReadTokens || 0)) }}
                </span>
              </div>
            </td>
            <td class="px-3 py-2 text-green-600 dark:text-green-300">{{ formatCostValue(Number(log.cost || 0)) }}</td>
            <td class="px-3 py-2">{{ getAccountLabel(log) }}</td>
            <td class="px-3 py-2">
              <div class="flex flex-wrap gap-1">
                <span
                  v-if="log.isLongContext"
                  class="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:bg-orange-900/40 dark:text-orange-200"
                  >1M上下文</span
                >
                <span
                  v-if="log.cacheCreateTokens > 0"
                  class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                  >缓存写 {{ formatNumber(log.cacheCreateTokens || 0) }}</span
                >
                <span
                  v-if="log.cacheReadTokens > 0"
                  class="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-200"
                  >缓存读 {{ formatNumber(log.cacheReadTokens || 0) }}</span
                >
                <span
                  v-if="log.ephemeral5mTokens > 0 || log.ephemeral1hTokens > 0"
                  class="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                >
                  短缓存 {{ formatNumber((log.ephemeral5mTokens || 0) + (log.ephemeral1hTokens || 0)) }}
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 分页 -->
    <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        <span>共 {{ pagination.total }} 条</span>
        <span class="hidden sm:inline">|</span>
        <label class="flex items-center gap-1">
          每页
          <select
            v-model.number="pageSizeLocal"
            class="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800"
            @change="handlePageSizeChange"
          >
            <option :value="50">50</option>
            <option :value="100">100</option>
            <option :value="200">200</option>
            <option :value="500">500</option>
          </select>
        </label>
      </div>
      <div class="flex items-center gap-2 text-xs">
        <button
          class="rounded-md border border-gray-300 px-3 py-1 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200"
          :disabled="pagination.page <= 1 || loading"
          @click="changePage(pagination.page - 1)
          "
        >上一页</button>
        <span class="text-gray-700 dark:text-gray-200">第 {{ pagination.page }} / {{ totalPages }} 页</span>
        <button
          class="rounded-md border border-gray-300 px-3 py-1 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200"
          :disabled="pagination.page >= totalPages || loading"
          @click="changePage(pagination.page + 1)
          "
        >下一页</button>
        <input
          v-model.number="jumpPage"
          class="w-16 rounded-md border border-gray-300 px-2 py-1 text-center text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          type="number"
          min="1"
          :max="totalPages"
          placeholder="跳转"
          @keyup.enter="changePage(jumpPage)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useLogsStore } from '@/stores/logs'

const store = useLogsStore()

const logs = store.logs
const loading = store.loading
const groups = store.groups
const groupBy = store.groupBy
const pagination = store.pagination

const filtersLocal = reactive({ ...store.filters })
const groupByLocal = ref(groupBy.value)
const pageSizeLocal = ref(pagination.value.pageSize)
const jumpPage = ref('')

const totalPages = computed(() => {
  const size = pagination.value.pageSize || 1
  return Math.max(1, Math.ceil((pagination.value.total || 0) / size))
})

const showGroups = computed(() => groupByLocal.value !== 'none' && groups.value.length > 0)
const groupByLabel = computed(() => {
  if (groupByLocal.value === 'key') return '按 API Key 聚合'
  if (groupByLocal.value === 'model') return '按模型聚合'
  if (groupByLocal.value === 'account') return '按账户聚合'
  return '不聚合'
})

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(2) + 'K'
  return (num || 0).toString()
}

function formatCostValue(cost) {
  if (!Number.isFinite(cost)) return '$0.000000'
  if (cost >= 1) return `$${cost.toFixed(2)}`
  if (cost >= 0.01) return `$${cost.toFixed(3)}`
  return `$${cost.toFixed(6)}`
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${mi}:${s}`
}

function getKeyLabel(log) {
  if (log.apiKeyName) return log.apiKeyName
  if (log.keyId) return `Key ${log.keyId}`
  return '未知'
}

function getAccountLabel(log) {
  if (log.accountId && log.accountType) return `${log.accountType} / ${log.accountId}`
  if (log.accountId) return log.accountId
  return '未关联'
}

function applyFilters() {
  store.setFilters({ ...filtersLocal })
}

function resetFilters() {
  filtersLocal.keyId = ''
  filtersLocal.model = ''
  filtersLocal.accountId = ''
  filtersLocal.accountType = ''
  store.setFilters({ ...filtersLocal })
}

function handleGroupByChange() {
  store.setGroupBy(groupByLocal.value)
}

function handlePageSizeChange() {
  store.setPageSize(pageSizeLocal.value)
}

function changePage(page) {
  const target = Math.min(Math.max(1, Number(page) || 1), totalPages.value)
  jumpPage.value = ''
  store.setPage(target)
}

onMounted(() => {
  store.loadLogs()
})
</script>
