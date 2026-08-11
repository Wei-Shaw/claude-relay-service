<template>
  <div class="space-y-4" :class="showHeader ? 'p-4 lg:p-6' : ''">
    <div v-if="showHeader" class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <button
          v-if="showBack"
          class="rounded-full border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          @click="emit('back')"
        >
          ← 返回
        </button>
        <div>
          <p class="text-sm font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            {{ title }}
          </p>
          <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">
            {{ apiKeyDisplayName }}
          </h2>
          <p class="text-sm text-gray-500 dark:text-gray-400">ID: {{ keyId }}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <i class="fas fa-clock text-blue-500" />
        <span v-if="dateRangeHint">{{ dateRangeHint }}</span>
        <span v-else>显示近 5000 条记录</span>
      </div>
    </div>

    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="card in summaryCards"
        :key="card.key"
        class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm uppercase text-gray-500 dark:text-gray-400">{{ card.label }}</p>
            <p class="mt-1 text-2xl font-bold" :class="card.valueClass">
              {{ card.value }}
            </p>
            <p v-if="card.hint" class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ card.hint }}
            </p>
          </div>
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800"
          >
            <i class="fas text-base" :class="[card.icon, card.iconClass]" />
          </div>
        </div>
      </div>
    </div>

    <div
      class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
    >
      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="preset in timePresets"
            :key="preset.key"
            class="rounded-full border px-3 py-1.5 text-sm font-medium transition-all"
            :class="
              activeTimePreset === preset.key
                ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-blue-300 hover:text-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-blue-500 dark:hover:text-blue-300'
            "
            @click="applyTimePreset(preset.key)"
          >
            {{ preset.label }}
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <el-date-picker
            v-model="filters.dateRange"
            class="w-full sm:w-[360px] lg:w-[390px]"
            clearable
            end-placeholder="结束时间"
            format="YYYY-MM-DD HH:mm:ss"
            start-placeholder="开始时间"
            type="datetimerange"
            unlink-panels
            value-format="YYYY-MM-DD HH:mm:ss"
          />

          <div class="w-[180px]">
            <CustomDropdown
              v-model="filters.model"
              accent="blue"
              clearable
              icon="fa-cube"
              :options="modelDropdownOptions"
              placeholder="所有模型"
              searchable
            />
          </div>

          <div v-if="shouldShowAccountFilter" class="w-[220px]">
            <CustomDropdown
              v-model="filters.accountId"
              accent="purple"
              clearable
              icon="fa-server"
              :options="accountDropdownOptions"
              placeholder="所有账户"
              searchable
            />
          </div>

          <div class="w-[140px]">
            <CustomDropdown
              v-model="filters.sortOrder"
              accent="indigo"
              icon="fa-sort-amount-down"
              :options="sortOrderOptions"
              placeholder="排序"
            />
          </div>

          <el-button @click="resetFilters"> <i class="fas fa-undo mr-2" /> 重置 </el-button>
          <el-button :loading="exporting" type="primary" @click="exportCsv">
            <i class="fas fa-file-export mr-2" /> 导出 CSV
          </el-button>
        </div>
      </div>
    </div>

    <div
      class="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
    >
      <div
        v-if="loading"
        class="flex items-center justify-center p-10 text-gray-500 dark:text-gray-400"
      >
        <i class="fas fa-spinner fa-spin mr-2" /> 加载中...
      </div>
      <div v-else>
        <div
          v-if="records.length === 0"
          class="flex flex-col items-center gap-2 p-10 text-gray-500 dark:text-gray-400"
        >
          <i class="fas fa-inbox text-2xl" />
          <p>暂无记录</p>
        </div>
        <div v-else class="space-y-4">
          <div class="hidden overflow-x-auto md:block" :class="tableBodyClass">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead class="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th
                    class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    时间
                  </th>
                  <th
                    v-if="showAccountColumn"
                    class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    账户
                  </th>
                  <th
                    class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    模型
                  </th>
                  <th
                    class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    输入
                  </th>
                  <th
                    class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    输出
                  </th>
                  <th
                    class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    缓存写入
                  </th>
                  <th
                    class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    缓存读取
                  </th>
                  <th
                    class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    总 Token
                  </th>
                  <th
                    class="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    费用
                  </th>
                  <th
                    class="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    操作
                  </th>
                </tr>
              </thead>
              <tbody
                class="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-gray-900"
              >
                <tr v-for="(record, index) in records" :key="buildRecordKey(record, index)">
                  <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-800 dark:text-gray-100">
                    {{ formatDate(record.timestamp) }}
                  </td>
                  <td
                    v-if="showAccountColumn"
                    class="px-4 py-3 text-sm text-gray-800 dark:text-gray-100"
                  >
                    <div class="flex flex-col">
                      <span class="font-semibold">{{ record.accountName || '未知账户' }}</span>
                      <span class="text-sm text-gray-500 dark:text-gray-400">
                        {{ record.accountTypeName || '未知渠道' }}
                      </span>
                    </div>
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-800 dark:text-gray-100">
                    {{ record.model }}
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 text-sm text-blue-600 dark:text-blue-400">
                    {{ formatNumber(record.inputTokens) }}
                  </td>
                  <td
                    class="whitespace-nowrap px-4 py-3 text-sm text-green-600 dark:text-green-400"
                  >
                    {{ formatNumber(record.outputTokens) }}
                  </td>
                  <td
                    class="whitespace-nowrap px-4 py-3 text-sm text-purple-600 dark:text-purple-400"
                  >
                    {{ formatNumber(record.cacheCreateTokens) }}
                  </td>
                  <td
                    class="whitespace-nowrap px-4 py-3 text-sm text-orange-600 dark:text-orange-400"
                  >
                    {{ formatNumber(record.cacheReadTokens) }}
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-800 dark:text-gray-100">
                    {{ formatNumber(record.totalTokens) }}
                  </td>
                  <td
                    class="whitespace-nowrap px-4 py-3 text-sm text-yellow-600 dark:text-yellow-400"
                  >
                    {{ record.costFormatted || formatCost(record.cost) }}
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 text-right text-sm">
                    <el-button size="small" @click="openDetail(record)">详情</el-button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="space-y-3 md:hidden" :class="tableBodyClass">
            <div
              v-for="(record, index) in records"
              :key="buildRecordKey(record, index)"
              class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p
                    v-if="showAccountColumn"
                    class="text-sm font-semibold text-gray-900 dark:text-gray-100"
                  >
                    {{ record.accountName || '未知账户' }}
                  </p>
                  <p v-else class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {{ record.model }}
                  </p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ formatDate(record.timestamp) }}
                  </p>
                  <p v-if="showAccountColumn" class="text-sm text-gray-500 dark:text-gray-400">
                    {{ record.accountTypeName || '未知渠道' }} · {{ record.model }}
                  </p>
                </div>
                <el-button size="small" @click="openDetail(record)">详情</el-button>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-700 dark:text-gray-300">
                <div>输入：{{ formatNumber(record.inputTokens) }}</div>
                <div>输出：{{ formatNumber(record.outputTokens) }}</div>
                <div>缓存写入：{{ formatNumber(record.cacheCreateTokens) }}</div>
                <div>缓存读取：{{ formatNumber(record.cacheReadTokens) }}</div>
                <div>总 Token：{{ formatNumber(record.totalTokens) }}</div>
                <div class="text-yellow-600 dark:text-yellow-400">
                  费用：{{ record.costFormatted || formatCost(record.cost) }}
                </div>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between px-4 pb-4">
            <div class="text-sm text-gray-500 dark:text-gray-400">
              共 {{ pagination.totalRecords }} 条记录
            </div>
            <el-pagination
              background
              :current-page="pagination.currentPage"
              layout="prev, pager, next, sizes"
              :page-size="pagination.pageSize"
              :page-sizes="[20, 50, 100, 200]"
              :total="pagination.totalRecords"
              @current-change="handlePageChange"
              @size-change="handleSizeChange"
            />
          </div>
        </div>
      </div>
    </div>

    <RecordDetailModal :record="activeRecord" :show="detailVisible" @close="closeDetail" />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'

import RecordDetailModal from '@/components/apikeys/RecordDetailModal.vue'
import { showToast, formatNumber, formatDate } from '@/utils/tools'
import { formatLocalDateTime } from '@/utils/time'

const props = defineProps({
  keyId: {
    type: String,
    required: true
  },
  apiKeyName: {
    type: String,
    default: ''
  },
  fetchApi: {
    type: Function,
    required: true
  },
  title: {
    type: String,
    default: 'API Key 请求详情时间线'
  },
  showHeader: {
    type: Boolean,
    default: true
  },
  showBack: {
    type: Boolean,
    default: false
  },
  showAccountColumn: {
    type: Boolean,
    default: true
  },
  showAccountFilter: {
    type: Boolean,
    default: true
  },
  tableBodyClass: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['back'])

const loading = ref(false)
const exporting = ref(false)
const records = ref([])
const availableModels = ref([])
const availableAccounts = ref([])

const modelDropdownOptions = computed(() =>
  availableModels.value.map((model) => ({ value: model, label: model }))
)
const accountDropdownOptions = computed(() =>
  availableAccounts.value.map((account) => ({
    value: account.id,
    label: `${account.name}（${account.accountTypeName}）`
  }))
)
const sortOrderOptions = [
  { value: 'desc', label: '时间降序' },
  { value: 'asc', label: '时间升序' }
]

const pagination = reactive({
  currentPage: 1,
  pageSize: 50,
  totalRecords: 0
})

const filters = reactive({
  dateRange: null,
  model: '',
  accountId: '',
  sortOrder: 'desc'
})
const activeTimePreset = ref('24h')

const summary = reactive({
  totalRequests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheCreateTokens: 0,
  cacheReadTokens: 0,
  totalTokens: 0,
  totalCost: 0,
  avgCost: 0
})

const apiKeyInfo = reactive({
  id: props.keyId,
  name: props.apiKeyName
})

const detailVisible = ref(false)
const activeRecord = ref(null)

const apiKeyDisplayName = computed(() => apiKeyInfo.name || props.apiKeyName || props.keyId)
const shouldShowAccountFilter = computed(
  () => props.showAccountFilter && availableAccounts.value.length > 0
)
const timePresets = [
  { key: 'today', label: '今天' },
  { key: 'yesterday', label: '昨天' },
  { key: 'this_week', label: '本周' },
  { key: 'last_week', label: '上周' },
  { key: '1h', label: '1小时' },
  { key: '6h', label: '6小时' },
  { key: '24h', label: '24小时' },
  { key: '7d', label: '7天' },
  { key: '30d', label: '30天' },
  { key: 'all', label: '全部' }
]

const dateRangeHint = computed(() => {
  if (!filters.dateRange || filters.dateRange.length !== 2) return ''
  return `${formatDate(filters.dateRange[0])} ~ ${formatDate(filters.dateRange[1])}`
})

const summaryCards = computed(() => [
  {
    key: 'requests',
    label: '总请求',
    value: formatNumber(summary.totalRequests),
    icon: 'fa-paper-plane',
    iconClass: 'text-blue-500',
    valueClass: 'text-gray-900 dark:text-gray-100'
  },
  {
    key: 'total_tokens',
    label: '总 Token',
    value: formatNumber(summary.totalTokens),
    icon: 'fa-coins',
    iconClass: 'text-gray-500',
    valueClass: 'text-gray-900 dark:text-gray-100'
  },
  {
    key: 'input_tokens',
    label: '输入 Token',
    value: formatNumber(summary.inputTokens),
    icon: 'fa-arrow-down',
    iconClass: 'text-blue-500',
    valueClass: 'text-blue-600 dark:text-blue-400'
  },
  {
    key: 'output_tokens',
    label: '输出 Token',
    value: formatNumber(summary.outputTokens),
    icon: 'fa-arrow-up',
    iconClass: 'text-green-500',
    valueClass: 'text-green-600 dark:text-green-400'
  },
  {
    key: 'cache_create_tokens',
    label: '缓存写入',
    value: formatNumber(summary.cacheCreateTokens),
    icon: 'fa-database',
    iconClass: 'text-purple-500',
    valueClass: 'text-purple-600 dark:text-purple-400'
  },
  {
    key: 'cache_read_tokens',
    label: '缓存读取',
    value: formatNumber(summary.cacheReadTokens),
    icon: 'fa-download',
    iconClass: 'text-orange-500',
    valueClass: 'text-orange-600 dark:text-orange-400'
  },
  {
    key: 'total_cost',
    label: '总费用',
    value: formatCost(summary.totalCost),
    icon: 'fa-dollar-sign',
    iconClass: 'text-yellow-500',
    valueClass: 'text-yellow-600 dark:text-yellow-400'
  },
  {
    key: 'avg_cost',
    label: '平均费用/次',
    value: formatCost(summary.avgCost),
    icon: 'fa-calculator',
    iconClass: 'text-indigo-500',
    valueClass: 'text-gray-900 dark:text-gray-100'
  }
])

const formatCost = (value) => {
  const num = typeof value === 'number' ? value : 0
  if (num >= 1) return `$${num.toFixed(2)}`
  if (num >= 0.001) return `$${num.toFixed(4)}`
  return `$${num.toFixed(6)}`
}

const toLocalDateTimeString = (date) => formatLocalDateTime(date) || ''
const getStartOfIsoWeek = (date) => {
  const day = date.day()
  const offset = day === 0 ? 6 : day - 1
  return date.startOf('day').subtract(offset, 'day')
}
const getEndOfIsoWeek = (date) => {
  return getStartOfIsoWeek(date).add(6, 'day').endOf('day')
}

const applyTimePreset = (presetKey) => {
  activeTimePreset.value = presetKey
  const now = dayjs()

  if (presetKey === 'all') {
    filters.dateRange = null
    return
  }

  if (presetKey === 'today') {
    filters.dateRange = [toLocalDateTimeString(now.startOf('day')), toLocalDateTimeString(now)]
    return
  }

  if (presetKey === 'yesterday') {
    const yesterday = now.subtract(1, 'day')
    filters.dateRange = [
      toLocalDateTimeString(yesterday.startOf('day')),
      toLocalDateTimeString(yesterday.endOf('day'))
    ]
    return
  }

  if (presetKey === 'this_week') {
    filters.dateRange = [toLocalDateTimeString(getStartOfIsoWeek(now)), toLocalDateTimeString(now)]
    return
  }

  if (presetKey === 'last_week') {
    const lastWeek = now.subtract(1, 'week')
    filters.dateRange = [
      toLocalDateTimeString(getStartOfIsoWeek(lastWeek)),
      toLocalDateTimeString(getEndOfIsoWeek(lastWeek))
    ]
    return
  }

  const presetHours = {
    '1h': 1,
    '6h': 6,
    '24h': 24,
    '7d': 24 * 7,
    '30d': 24 * 30
  }
  const hours = presetHours[presetKey]
  if (!hours) return
  filters.dateRange = [
    toLocalDateTimeString(now.subtract(hours, 'hour')),
    toLocalDateTimeString(now)
  ]
}

const syncPresetByDateRange = (dateRange) => {
  if (!dateRange || dateRange.length !== 2) {
    activeTimePreset.value = 'all'
    return
  }

  const start = dayjs(dateRange[0])
  const end = dayjs(dateRange[1])
  if (!start.isValid() || !end.isValid()) {
    activeTimePreset.value = 'custom'
    return
  }

  const diffHours = end.diff(start, 'hour', true)
  const now = dayjs()
  const startOfToday = now.startOf('day')
  const startOfThisWeek = getStartOfIsoWeek(now)
  const startOfYesterday = now.subtract(1, 'day').startOf('day')
  const endOfYesterday = now.subtract(1, 'day').endOf('day')
  const startOfLastWeek = getStartOfIsoWeek(now.subtract(1, 'week'))
  const endOfLastWeek = getEndOfIsoWeek(now.subtract(1, 'week'))

  if (start.isSame(startOfToday) && Math.abs(end.diff(now, 'minute', true)) < 1) {
    activeTimePreset.value = 'today'
    return
  }
  if (start.isSame(startOfYesterday) && Math.abs(end.diff(endOfYesterday, 'minute', true)) < 1) {
    activeTimePreset.value = 'yesterday'
    return
  }
  if (start.isSame(startOfThisWeek) && Math.abs(end.diff(now, 'minute', true)) < 1) {
    activeTimePreset.value = 'this_week'
    return
  }
  if (start.isSame(startOfLastWeek) && Math.abs(end.diff(endOfLastWeek, 'minute', true)) < 1) {
    activeTimePreset.value = 'last_week'
    return
  }

  if (Math.abs(diffHours - 1) < 0.1) return (activeTimePreset.value = '1h')
  if (Math.abs(diffHours - 6) < 0.1) return (activeTimePreset.value = '6h')
  if (Math.abs(diffHours - 24) < 0.1) return (activeTimePreset.value = '24h')
  if (Math.abs(diffHours - 24 * 7) < 0.5) return (activeTimePreset.value = '7d')
  if (Math.abs(diffHours - 24 * 30) < 1) return (activeTimePreset.value = '30d')
  activeTimePreset.value = 'custom'
}

const buildParams = (page) => {
  const params = {
    page,
    pageSize: pagination.pageSize,
    sortOrder: filters.sortOrder
  }

  if (filters.model) params.model = filters.model
  if (filters.accountId && props.showAccountFilter) params.accountId = filters.accountId
  if (filters.dateRange && filters.dateRange.length === 2) {
    // 直接透传 picker 的本地时间字符串（与 value-format 一致），避免重新格式化导致回显格式不符、触发二次请求
    params.startDate = filters.dateRange[0]
    params.endDate = filters.dateRange[1]
  }

  return params
}

const syncResponseState = (data) => {
  records.value = data.records || []

  const pageInfo = data.pagination || {}
  pagination.currentPage = pageInfo.currentPage || 1
  pagination.pageSize = pageInfo.pageSize || pagination.pageSize
  pagination.totalRecords = pageInfo.totalRecords || 0

  const filterEcho = data.filters || {}
  if (filterEcho.model !== undefined) filters.model = filterEcho.model || ''
  if (filterEcho.accountId !== undefined && props.showAccountFilter) {
    filters.accountId = filterEcho.accountId || ''
  }
  if (filterEcho.sortOrder) filters.sortOrder = filterEcho.sortOrder
  if (filterEcho.startDate && filterEcho.endDate) {
    const nextRange = [filterEcho.startDate, filterEcho.endDate]
    const currentRange = filters.dateRange || []
    if (currentRange[0] !== nextRange[0] || currentRange[1] !== nextRange[1]) {
      filters.dateRange = nextRange
    }
  }

  const summaryData = data.summary || {}
  summary.totalRequests = summaryData.totalRequests || 0
  summary.inputTokens = summaryData.inputTokens || 0
  summary.outputTokens = summaryData.outputTokens || 0
  summary.cacheCreateTokens = summaryData.cacheCreateTokens || 0
  summary.cacheReadTokens = summaryData.cacheReadTokens || 0
  summary.totalTokens = summaryData.totalTokens || 0
  summary.totalCost = summaryData.totalCost || 0
  summary.avgCost = summaryData.avgCost || 0

  apiKeyInfo.id = data.apiKeyInfo?.id || props.keyId
  apiKeyInfo.name = data.apiKeyInfo?.name || props.apiKeyName || ''

  availableModels.value = data.availableFilters?.models || []
  availableAccounts.value = data.availableFilters?.accounts || []
}

const fetchRecords = async (page = pagination.currentPage) => {
  if (!props.keyId) return

  loading.value = true
  // request.js 为 resolve-only：失败也 resolve 成 { success:false }，不会抛异常，必须显式判 success
  const response = await props.fetchApi(props.keyId, buildParams(page))
  if (!response.success) {
    showToast(`加载请求记录失败：${response.message || '未知错误'}`, 'error')
    loading.value = false
    return
  }
  syncResponseState(response.data || {})
  loading.value = false
}

const handlePageChange = (page) => {
  pagination.currentPage = page
  fetchRecords(page)
}

const handleSizeChange = (size) => {
  pagination.pageSize = size
  pagination.currentPage = 1
  fetchRecords(1)
}

const resetFilters = () => {
  filters.model = ''
  filters.accountId = ''
  filters.sortOrder = 'desc'
  pagination.currentPage = 1
  applyTimePreset('24h')
}

const openDetail = (record) => {
  activeRecord.value = record
  detailVisible.value = true
}

const closeDetail = () => {
  detailVisible.value = false
  activeRecord.value = null
}

const buildRecordKey = (record, index) => {
  return [
    record.timestamp || 'no-time',
    record.model || 'no-model',
    record.accountId || 'no-account',
    index
  ].join(':')
}

const exportCsv = async () => {
  if (exporting.value || !props.keyId) return

  exporting.value = true
  try {
    const aggregated = []
    let page = 1
    let totalPages = 1
    const maxPages = 50

    while (page <= totalPages && page <= maxPages) {
      const response = await props.fetchApi(props.keyId, {
        ...buildParams(page),
        pageSize: 200
      })
      // resolve-only：接口失败需中断导出并提示，否则会误导出空 CSV
      if (!response.success) {
        showToast(`导出失败：${response.message || '未知错误'}`, 'error')
        return
      }
      const payload = response.data || {}
      aggregated.push(...(payload.records || []))
      totalPages = payload.pagination?.totalPages || 1
      page += 1
    }

    if (aggregated.length === 0) {
      showToast('没有可导出的记录', 'info')
      return
    }

    const headers = ['时间']
    if (props.showAccountColumn) {
      headers.push('账户', '渠道')
    }
    headers.push(
      '模型',
      '输入Token',
      '输出Token',
      '缓存创建Token',
      '缓存读取Token',
      '总Token',
      '费用'
    )

    const csvRows = [headers.join(',')]
    aggregated.forEach((record) => {
      const row = [formatDate(record.timestamp)]
      if (props.showAccountColumn) {
        row.push(record.accountName || '', record.accountTypeName || '')
      }
      row.push(
        record.model || '',
        record.inputTokens || 0,
        record.outputTokens || 0,
        record.cacheCreateTokens || 0,
        record.cacheReadTokens || 0,
        record.totalTokens || 0,
        record.costFormatted || formatCost(record.cost)
      )
      csvRows.push(row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    })

    const blob = new Blob([csvRows.join('\n')], {
      type: 'text/csv;charset=utf-8;'
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `api-key-${props.keyId}-usage-records.csv`
    link.click()
    URL.revokeObjectURL(url)
    showToast('导出 CSV 成功', 'success')
  } catch (error) {
    showToast(`导出失败：${error.message || '未知错误'}`, 'error')
  } finally {
    exporting.value = false
  }
}

watch(
  () => [filters.model, filters.accountId, filters.sortOrder],
  () => {
    pagination.currentPage = 1
    fetchRecords(1)
  }
)

watch(
  () => filters.dateRange,
  () => {
    syncPresetByDateRange(filters.dateRange)
    pagination.currentPage = 1
    fetchRecords(1)
  },
  { deep: true }
)

watch(
  () => props.keyId,
  (nextKeyId, prevKeyId) => {
    if (!nextKeyId || nextKeyId === prevKeyId) return
    pagination.currentPage = 1
    filters.model = ''
    filters.accountId = ''
    filters.sortOrder = 'desc'
    applyTimePreset('24h')
  }
)

onMounted(() => {
  applyTimePreset('24h')
})
</script>
