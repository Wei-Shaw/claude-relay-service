<template>
  <div class="space-y-4 p-4 lg:p-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <button
          class="rounded-full border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          @click="goBack"
        >
          ← 返回
        </button>
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            API Key 请求详情时间线
          </p>
          <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">
            {{ apiKeyDisplayName }}
          </h2>
          <p class="text-xs text-gray-500 dark:text-gray-400">ID: {{ keyId }}</p>
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
        class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
      >
        <p class="text-xs uppercase text-gray-500 dark:text-gray-400">总请求</p>
        <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
          {{ formatNumber(summary.totalRequests) }}
        </p>
      </div>
      <div
        class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
      >
        <p class="text-xs uppercase text-gray-500 dark:text-gray-400">总 Token</p>
        <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
          {{ formatNumber(summary.totalTokens) }}
        </p>
      </div>
      <div
        class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
      >
        <p class="text-xs uppercase text-gray-500 dark:text-gray-400">总费用</p>
        <p class="mt-1 text-2xl font-bold text-yellow-600 dark:text-yellow-400">
          {{ formatCost(summary.totalCost) }}
        </p>
      </div>
      <div
        class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
      >
        <p class="text-xs uppercase text-gray-500 dark:text-gray-400">平均费用/次</p>
        <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
          {{ formatCost(summary.avgCost) }}
        </p>
      </div>
    </div>

    <div
      class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
    >
      <div class="flex flex-wrap items-center gap-3">
        <el-date-picker
          v-model="filters.dateRange"
          class="max-w-[320px]"
          clearable
          end-placeholder="结束时间"
          format="YYYY-MM-DD HH:mm:ss"
          start-placeholder="开始时间"
          type="datetimerange"
          unlink-panels
          value-format="YYYY-MM-DDTHH:mm:ss[Z]"
        />

        <el-select
          v-model="filters.model"
          class="w-[180px]"
          clearable
          filterable
          placeholder="所有模型"
        >
          <el-option
            v-for="modelOption in availableModels"
            :key="modelOption"
            :label="modelOption"
            :value="modelOption"
          />
        </el-select>

        <el-select
          v-model="filters.accountId"
          class="w-[220px]"
          clearable
          filterable
          placeholder="所有账户"
        >
          <el-option
            v-for="account in availableAccounts"
            :key="account.id"
            :label="`${account.name}（${account.accountTypeName}）`"
            :value="account.id"
          />
        </el-select>

        <el-select v-model="filters.sortOrder" class="w-[140px]" placeholder="排序">
          <el-option label="时间降序" value="desc" />
          <el-option label="时间升序" value="asc" />
        </el-select>

        <el-button @click="resetFilters"> <i class="fas fa-undo mr-2" /> 重置 </el-button>
        <el-button :loading="exporting" type="primary" @click="exportCsv">
          <i class="fas fa-file-export mr-2" /> 导出 CSV
        </el-button>
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
          <div class="hidden overflow-x-auto md:block">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead class="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th
                    class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    时间
                  </th>
                  <th
                    class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    账户
                  </th>
                  <th
                    class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    模型
                  </th>
                  <th
                    class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    输入
                  </th>
                  <th
                    class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    输出
                  </th>
                  <th
                    class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    缓存(创/读)
                  </th>
                  <th
                    class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    总 Token
                  </th>
                  <th
                    class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    费用
                  </th>
                  <th
                    class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                  >
                    操作
                  </th>
                </tr>
              </thead>
              <tbody
                class="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-gray-900"
              >
                <tr v-for="record in records" :key="record.timestamp + record.model">
                  <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-800 dark:text-gray-100">
                    {{ formatDate(record.timestamp) }}
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-800 dark:text-gray-100">
                    <div class="flex flex-col">
                      <span class="font-semibold">{{ record.accountName || '未知账户' }}</span>
                      <span class="text-xs text-gray-500 dark:text-gray-400">
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
                    {{ formatNumber(record.cacheCreateTokens) }} /
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

          <div class="space-y-3 md:hidden">
            <div
              v-for="record in records"
              :key="record.timestamp + record.model"
              class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {{ record.accountName || '未知账户' }}
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {{ formatDate(record.timestamp) }}
                  </p>
                </div>
                <el-button size="small" @click="openDetail(record)">详情</el-button>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-700 dark:text-gray-300">
                <div>模型：{{ record.model }}</div>
                <div>总 Token：{{ formatNumber(record.totalTokens) }}</div>
                <div>输入：{{ formatNumber(record.inputTokens) }}</div>
                <div>输出：{{ formatNumber(record.outputTokens) }}</div>
                <div>
                  缓存创/读：{{ formatNumber(record.cacheCreateTokens) }} /
                  {{ formatNumber(record.cacheReadTokens) }}
                </div>
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
import { useRoute, useRouter } from 'vue-router'
import { getApiKeyUsageRecordsApi } from '@/utils/http_apis'
import { showToast, formatNumber, formatDate } from '@/utils/tools'
import RecordDetailModal from '@/components/apikeys/RecordDetailModal.vue'

const route = useRoute()
const router = useRouter()

const keyId = computed(() => route.params.keyId)
const loading = ref(false)
const exporting = ref(false)
const records = ref([])
const availableModels = ref([])
const availableAccounts = ref([])

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

const summary = reactive({
  totalRequests: 0,
  totalTokens: 0,
  totalCost: 0,
  avgCost: 0
})

const apiKeyInfo = reactive({
  id: keyId.value,
  name: ''
})

const detailVisible = ref(false)
const activeRecord = ref(null)

const apiKeyDisplayName = computed(() => apiKeyInfo.name || apiKeyInfo.id || keyId.value)

const dateRangeHint = computed(() => {
  if (!filters.dateRange || filters.dateRange.length !== 2) return ''
  return `${formatDate(filters.dateRange[0])} ~ ${formatDate(filters.dateRange[1])}`
})

const formatCost = (value) => {
  const num = typeof value === 'number' ? value : 0
  if (num >= 1) return `$${num.toFixed(2)}`
  if (num >= 0.001) return `$${num.toFixed(4)}`
  return `$${num.toFixed(6)}`
}

const buildParams = (page) => {
  const params = {
    page,
    pageSize: pagination.pageSize,
    sortOrder: filters.sortOrder
  }

  if (filters.model) params.model = filters.model
  if (filters.accountId) params.accountId = filters.accountId
  if (filters.dateRange && filters.dateRange.length === 2) {
    params.startDate = dayjs(filters.dateRange[0]).toISOString()
    params.endDate = dayjs(filters.dateRange[1]).toISOString()
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
  if (filterEcho.accountId !== undefined) filters.accountId = filterEcho.accountId || ''
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
  summary.totalTokens = summaryData.totalTokens || 0
  summary.totalCost = summaryData.totalCost || 0
  summary.avgCost = summaryData.avgCost || 0

  apiKeyInfo.id = data.apiKeyInfo?.id || keyId.value
  apiKeyInfo.name = data.apiKeyInfo?.name || ''

  availableModels.value = data.availableFilters?.models || []
  availableAccounts.value = data.availableFilters?.accounts || []
}

const fetchRecords = async (page = pagination.currentPage) => {
  loading.value = true
  try {
    const response = await getApiKeyUsageRecordsApi(keyId.value, buildParams(page))
    syncResponseState(response.data || {})
  } catch (error) {
    showToast(`加载请求记录失败：${error.message || '未知错误'}`, 'error')
  } finally {
    loading.value = false
  }
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
  filters.dateRange = null
  filters.sortOrder = 'desc'
  pagination.currentPage = 1
  fetchRecords(1)
}

const openDetail = (record) => {
  activeRecord.value = record
  detailVisible.value = true
}

const closeDetail = () => {
  detailVisible.value = false
  activeRecord.value = null
}

const goBack = () => {
  router.push('/api-keys')
}

const exportCsv = async () => {
  if (exporting.value) return
  exporting.value = true
  try {
    const aggregated = []
    let page = 1
    let totalPages = 1
    const maxPages = 50 // 50 * 200 = 10000，超过后端 5000 上限已足够

    while (page <= totalPages && page <= maxPages) {
      const response = await getApiKeyUsageRecordsApi(keyId.value, {
        ...buildParams(page),
        pageSize: 200
      })
      const payload = response.data || {}
      aggregated.push(...(payload.records || []))
      totalPages = payload.pagination?.totalPages || 1
      page += 1
    }

    if (aggregated.length === 0) {
      showToast('没有可导出的记录', 'info')
      return
    }

    const headers = [
      '时间',
      '账户',
      '渠道',
      '模型',
      '输入Token',
      '输出Token',
      '缓存创建Token',
      '缓存读取Token',
      '总Token',
      '费用'
    ]

    const csvRows = [headers.join(',')]
    aggregated.forEach((record) => {
      const row = [
        formatDate(record.timestamp),
        record.accountName || '',
        record.accountTypeName || '',
        record.model || '',
        record.inputTokens || 0,
        record.outputTokens || 0,
        record.cacheCreateTokens || 0,
        record.cacheReadTokens || 0,
        record.totalTokens || 0,
        record.costFormatted || formatCost(record.cost)
      ]
      csvRows.push(row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    })

    const blob = new Blob([csvRows.join('\n')], {
      type: 'text/csv;charset=utf-8;'
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `api-key-${keyId.value}-usage-records.csv`
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
    pagination.currentPage = 1
    fetchRecords(1)
  },
  { deep: true }
)

onMounted(() => {
  fetchRecords()
})
</script>
