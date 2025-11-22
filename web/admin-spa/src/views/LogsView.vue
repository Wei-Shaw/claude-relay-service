<template>
  <div>
    <div class="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">请求日志</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">最新请求，支持分页与聚合查看</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="group relative min-w-[160px]">
          <div
            class="pointer-events-none absolute -inset-0.5 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
          ></div>
          <CustomDropdown
            v-model="groupByLocal"
            icon="fa-layer-group"
            icon-color="text-blue-500"
            :options="groupByOptions"
            placeholder="聚合方式"
            @change="handleGroupByChange"
          />
        </div>
        <button
          class="group relative flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-500 sm:text-sm"
          :disabled="loading"
          @click="loadLogs"
        >
          <div
            class="pointer-events-none absolute -inset-0.5 rounded-lg bg-gradient-to-r from-green-500 to-teal-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
          ></div>
          <i
            :class="['fas relative text-green-500', loading ? 'fa-spinner fa-spin' : 'fa-sync-alt']"
          />
          <span class="relative">刷新</span>
        </button>
      </div>
    </div>

    <!-- 过滤器 -->
    <div
      class="mb-4 grid grid-cols-1 gap-3 rounded-xl bg-gray-50 p-3 shadow-sm dark:bg-gray-800/60 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div class="flex flex-col gap-1">
        <label class="text-xs font-semibold text-gray-600 dark:text-gray-300">API Key</label>
        <div class="group relative">
          <div
            class="pointer-events-none absolute -inset-0.5 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
          ></div>
          <CustomDropdown
            v-model="filtersLocal.keyId"
            icon="fa-key"
            icon-color="text-blue-500"
            :options="apiKeyOptions"
            placeholder="全部 API Key"
            @change="applyFilters"
          />
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs font-semibold text-gray-600 dark:text-gray-300">模型</label>
        <div class="group relative">
          <div
            class="pointer-events-none absolute -inset-0.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
          ></div>
          <CustomDropdown
            v-model="filtersLocal.model"
            icon="fa-robot"
            icon-color="text-purple-500"
            :options="modelOptions"
            placeholder="全部模型"
            @change="applyFilters"
          />
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs font-semibold text-gray-600 dark:text-gray-300">账户 ID</label>
        <div class="group relative">
          <div
            class="pointer-events-none absolute -inset-0.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
          ></div>
          <CustomDropdown
            v-model="filtersLocal.accountId"
            icon="fa-user"
            icon-color="text-emerald-500"
            :options="accountIdOptions"
            placeholder="全部账户"
            @change="applyFilters"
          />
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs font-semibold text-gray-600 dark:text-gray-300">账户类型</label>
        <div class="group relative">
          <div
            class="pointer-events-none absolute -inset-0.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 opacity-0 blur transition duration-300 group-hover:opacity-20"
          ></div>
          <CustomDropdown
            v-model="filtersLocal.accountType"
            icon="fa-database"
            icon-color="text-cyan-500"
            :options="accountTypeOptions"
            placeholder="全部类型"
            @change="applyFilters"
          />
        </div>
      </div>
      <div class="flex items-center gap-2 sm:col-span-2 lg:col-span-4">
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
            <div class="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {{ group.label }}
            </div>
            <div class="text-[11px] text-gray-500 dark:text-gray-400">{{ groupByLabel }}</div>
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">{{ group.count }} 次</div>
        </div>
        <div class="mt-2 flex items-center gap-4 text-sm">
          <div class="text-indigo-600 dark:text-indigo-300">
            {{ formatNumber(group.tokens) }} tokens
          </div>
          <div class="text-green-600 dark:text-green-300">{{ formatCostValue(group.cost) }}</div>
        </div>
      </div>
    </div>

    <!-- 日志表格 -->
    <div
      class="overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <table class="min-w-full text-sm">
        <thead
          class="bg-gray-50 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-200"
        >
          <tr>
            <th class="px-3 py-2 text-left">时间</th>
            <th class="px-3 py-2 text-left">API Key</th>
            <th class="px-3 py-2 text-left">模型</th>
            <th class="px-3 py-2 text-left">总 Tokens</th>
            <th class="px-3 py-2 text-left">输入 Tokens</th>
            <th class="px-3 py-2 text-left">输出 Tokens</th>
            <th class="px-3 py-2 text-left">缓存创建</th>
            <th class="px-3 py-2 text-left">缓存读取</th>
            <th class="px-3 py-2 text-left">费用</th>
            <th class="px-3 py-2 text-left">剩余额度</th>
            <th class="px-3 py-2 text-left">账户</th>
            <th class="px-3 py-2 text-left">标记</th>
            <th class="px-3 py-2 text-left">详情</th>
          </tr>
        </thead>
        <tbody
          class="divide-y divide-gray-200 text-xs text-gray-800 dark:divide-gray-700 dark:text-gray-100"
        >
          <tr v-if="!loading && logs.length === 0">
            <td class="px-3 py-6 text-center text-gray-500 dark:text-gray-400" colspan="13">
              暂无日志
            </td>
          </tr>
          <template v-for="log in logs" :key="rowKey(log)">
            <tr>
              <td class="whitespace-nowrap px-3 py-2">
                <div>{{ formatDateTime(log.timestamp) }}</div>
                <div class="text-[11px] text-gray-500 dark:text-gray-400">
                  {{ formatRelativeTime(log.timestamp) }}
                </div>
              </td>
              <td class="px-3 py-2">
                <div class="font-semibold text-gray-900 dark:text-gray-100">
                  {{ getKeyLabel(log) }}
                </div>
                <div v-if="log.keyId" class="text-[11px] text-gray-500 dark:text-gray-400">
                  {{ log.keyId }}
                </div>
              </td>
              <td class="px-3 py-2">
                <div class="font-medium">{{ log.model || 'unknown' }}</div>
                <div v-if="log.accountType" class="text-[11px] text-gray-500 dark:text-gray-400">
                  来源: {{ log.accountType }}
                </div>
              </td>
              <td class="px-3 py-2">
                <div class="font-semibold text-indigo-600 dark:text-indigo-300">
                  {{ formatNumber(log.totalTokens || 0) }}
                </div>
              </td>
              <td class="px-3 py-2">
                {{ formatNumber(log.inputTokens || 0) }}
              </td>
              <td class="px-3 py-2">
                {{ formatNumber(log.outputTokens || 0) }}
              </td>
              <td class="px-3 py-2">
                {{ formatNumber(log.cacheCreateTokens || 0) }}
              </td>
              <td class="px-3 py-2">
                {{ formatNumber(log.cacheReadTokens || 0) }}
              </td>
              <td class="px-3 py-2 text-green-600 dark:text-green-300">
                <div>{{ formatCostValue(Number(log.cost || 0)) }}</div>
                <div class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  {{ formatCostFormula(log) }}
                </div>
              </td>
              <td class="px-3 py-2">
                <div class="text-xs text-gray-800 dark:text-gray-100">
                  <div v-if="log.remainingTokens != null">
                    剩余: {{ formatNumber(log.remainingTokens) }}
                  </div>
                  <div v-else class="text-gray-400 dark:text-gray-500">无配额</div>
                </div>
              </td>
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
                    短缓存
                    {{ formatNumber((log.ephemeral5mTokens || 0) + (log.ephemeral1hTokens || 0)) }}
                  </span>
                  <span
                    v-if="
                      !log.isLongContext &&
                      !log.cacheCreateTokens &&
                      !log.cacheReadTokens &&
                      !log.ephemeral5mTokens &&
                      !log.ephemeral1hTokens
                    "
                    class="text-[11px] text-gray-500 dark:text-gray-400"
                    >--</span
                  >
                </div>
              </td>
              <td class="px-3 py-2">
                <button
                  class="text-blue-600 hover:underline dark:text-blue-300"
                  @click="toggleExpanded(log)"
                >
                  {{ isExpanded(log) ? '收起' : '查看' }}
                </button>
              </td>
            </tr>
            <tr v-if="isExpanded(log)" class="bg-gray-50/60 dark:bg-gray-800/40">
              <td class="px-3 py-3" colspan="13">
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div
                    class="rounded-lg border border-gray-200 bg-white p-3 text-[11px] dark:border-gray-700 dark:bg-gray-900"
                  >
                    <div class="mb-1 font-semibold text-gray-700 dark:text-gray-200">请求体</div>
                    <pre
                      class="whitespace-pre-wrap break-words text-gray-700 dark:text-gray-200"
                      v-text="formatJson(log.requestBody)"
                    ></pre>
                  </div>
                  <div
                    class="rounded-lg border border-gray-200 bg-white p-3 text-[11px] dark:border-gray-700 dark:bg-gray-900"
                  >
                    <div class="mb-1 font-semibold text-gray-700 dark:text-gray-200">响应体</div>
                    <pre
                      class="whitespace-pre-wrap break-words text-gray-700 dark:text-gray-200"
                      v-text="formatJson(log.responseBody)"
                    ></pre>
                  </div>
                  <div
                    class="rounded-lg border border-gray-200 bg-white p-3 text-[11px] dark:border-gray-700 dark:bg-gray-900"
                  >
                    <div class="mb-1 font-semibold text-gray-700 dark:text-gray-200">请求头</div>
                    <pre
                      class="whitespace-pre-wrap break-words text-gray-700 dark:text-gray-200"
                      v-text="formatJson(log.requestHeaders)"
                    ></pre>
                  </div>
                  <div
                    class="rounded-lg border border-gray-200 bg-white p-3 text-[11px] dark:border-gray-700 dark:bg-gray-900"
                  >
                    <div class="mb-1 font-semibold text-gray-700 dark:text-gray-200">元数据</div>
                    <div class="space-y-1 text-gray-700 dark:text-gray-200">
                      <div>路径: {{ log.path || '-' }}</div>
                      <div>方法: {{ log.method || '-' }}</div>
                      <div>状态码: {{ log.statusCode ?? '-' }}</div>
                      <div>耗时: {{ log.latencyMs ?? '-' }} ms</div>
                      <div>IP: {{ log.clientIp || '-' }}</div>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
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
          @click="changePage(pagination.page - 1)"
        >
          上一页
        </button>
        <span class="text-gray-700 dark:text-gray-200"
          >第 {{ pagination.page }} / {{ totalPages }} 页</span
        >
        <button
          class="rounded-md border border-gray-300 px-3 py-1 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200"
          :disabled="pagination.page >= totalPages || loading"
          @click="changePage(pagination.page + 1)"
        >
          下一页
        </button>
        <input
          v-model.number="jumpPage"
          class="w-16 rounded-md border border-gray-300 px-2 py-1 text-center text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          :max="totalPages"
          min="1"
          placeholder="跳转"
          type="number"
          @keyup.enter="changePage(jumpPage)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import CustomDropdown from '@/components/common/CustomDropdown.vue'
import { useLogsStore } from '@/stores/logs'
import { useApiKeysStore } from '@/stores/apiKeys'

const store = useLogsStore()
const { logs, loading, groups, groupBy, pagination, filters } = storeToRefs(store)
const loadLogs = store.loadLogs

const apiKeysStore = useApiKeysStore()
const { apiKeys } = storeToRefs(apiKeysStore)

const filtersLocal = reactive({ ...filters.value })
const groupByLocal = ref(groupBy.value)
const pageSizeLocal = ref(pagination.value.pageSize)
const jumpPage = ref('')
const expandedId = ref(null)

const groupByOptions = [
  { value: 'key', label: '按 API Key 聚合' },
  { value: 'model', label: '按模型聚合' },
  { value: 'account', label: '按账户聚合' },
  { value: 'none', label: '不聚合' }
]

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

const apiKeyOptions = computed(() => {
  const list = (apiKeys.value || []).map((k) => ({
    value: k.id,
    label: `${k.name || '未命名'} (${k.id})`
  }))
  return [{ value: '', label: '全部 API Key' }, ...list]
})

const modelOptions = computed(() => {
  const set = new Set()
  logs.value.forEach((l) => l.model && set.add(l.model))
  const list = Array.from(set).map((m) => ({ value: m, label: m }))
  return [{ value: '', label: '全部模型' }, ...list]
})

const accountIdOptions = computed(() => {
  const set = new Set()
  logs.value.forEach((l) => l.accountId && set.add(l.accountId))
  const list = Array.from(set).map((id) => ({ value: id, label: id }))
  return [{ value: '', label: '全部账户' }, ...list]
})

const accountTypeOptions = computed(() => {
  const set = new Set()
  logs.value.forEach((l) => l.accountType && set.add(l.accountType))
  const list = Array.from(set).map((type) => ({ value: type, label: type }))
  return [{ value: '', label: '全部类型' }, ...list]
})

const rowKey = (log) => `${log.timestamp}-${log.keyId || ''}-${log.model || ''}`
const isExpanded = (log) => expandedId.value === rowKey(log)
const toggleExpanded = (log) => {
  const key = rowKey(log)
  expandedId.value = expandedId.value === key ? null : key
}

const formatJson = (val) => {
  if (val === undefined || val === null || val === '') return '-'
  if (typeof val === 'string') {
    try {
      return JSON.stringify(JSON.parse(val), null, 2)
    } catch (e) {
      return val
    }
  }
  try {
    return JSON.stringify(val, null, 2)
  } catch (e) {
    return String(val)
  }
}

const formatCostFormula = (log) => {
  const breakdown = log?.costBreakdown || {}
  const parts = []

  const pushTerm = (label, tokens, cost) => {
    const t = Number(tokens || 0)
    const c = Number(cost || 0)
    if (!t || !c || !Number.isFinite(c) || !Number.isFinite(t)) return
    const unit = c / t
    parts.push(`${label} ${formatNumber(t)} * ${unit.toFixed(6)}`)
  }

  pushTerm('输入', log.inputTokens, breakdown.input)
  pushTerm('输出', log.outputTokens, breakdown.output)
  pushTerm('缓存创建', log.cacheCreateTokens, breakdown.cacheCreate)
  pushTerm('缓存读取', log.cacheReadTokens, breakdown.cacheRead)
  pushTerm('短缓存5m', log.ephemeral5mTokens, breakdown.ephemeral5m)
  pushTerm('短缓存1h', log.ephemeral1hTokens, breakdown.ephemeral1h)

  if (!parts.length) return ''
  return parts.join(' + ')
}

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

function formatRelativeTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 30) return '刚刚'
  if (diffSec < 60) return `${diffSec} 秒前`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 30) return `${diffDay} 天前`
  const diffMonth = Math.floor(diffDay / 30)
  if (diffMonth < 12) return `${diffMonth} 个月前`
  const diffYear = Math.floor(diffMonth / 12)
  return `${diffYear} 年前`
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

// 保持本地选择与 Store 同步（应对外部更新）
watch(groupBy, (val) => {
  groupByLocal.value = val
})

onMounted(() => {
  Promise.all([apiKeysStore.fetchApiKeys().catch(() => {}), loadLogs()])
})
</script>
