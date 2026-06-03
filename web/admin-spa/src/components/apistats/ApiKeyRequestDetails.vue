<template>
  <div class="request-details-panel mt-6 rounded-2xl p-4 shadow-xl sm:p-5">
    <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">
          <i class="fas fa-list-alt mr-2 text-blue-500" />
          调用明细
        </h3>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          当前 API Key 的请求明细、Token、费用和耗时
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="detail-action-button" :disabled="loading || !canQuery" @click="refresh">
          <i class="fas fa-sync-alt" :class="{ 'fa-spin': loading }" />
          刷新
        </button>
        <button
          class="detail-action-button"
          :disabled="exporting || loading || records.length === 0"
          @click="exportCsv"
        >
          <i class="fas fa-file-csv" />
          导出 CSV
        </button>
      </div>
    </div>

    <div
      v-if="!canQuery"
      class="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
    >
      输入并查询单个 API Key 后可查看调用明细。
    </div>

    <template v-else>
      <div class="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        <label class="filter-field xl:col-span-2">
          <span>关键词</span>
          <input
            v-model="filters.keyword"
            class="filter-input"
            placeholder="模型、接口、User-Agent"
            type="search"
            @keyup.enter="fetchRecords(1)"
          />
        </label>
        <label class="filter-field">
          <span>Session</span>
          <input
            v-model="filters.session"
            class="filter-input"
            placeholder="session / hash / conversation"
            type="search"
            @keyup.enter="fetchRecords(1)"
          />
        </label>
        <label class="filter-field">
          <span>模型</span>
          <select v-model="filters.model" class="filter-input" @change="fetchRecords(1)">
            <option value="">全部模型</option>
            <option v-for="model in availableModels" :key="model" :value="model">
              {{ model }}
            </option>
          </select>
        </label>
        <label class="filter-field">
          <span>接口</span>
          <select v-model="filters.endpoint" class="filter-input" @change="fetchRecords(1)">
            <option value="">全部接口</option>
            <option v-for="endpoint in availableEndpoints" :key="endpoint" :value="endpoint">
              {{ endpoint }}
            </option>
          </select>
        </label>
        <label class="filter-field">
          <span>排序</span>
          <select v-model="filters.sortBy" class="filter-input" @change="fetchRecords(1)">
            <option value="timestamp">统计时间</option>
            <option value="inputTokens">输入 Token</option>
            <option value="outputTokens">输出 Token</option>
            <option value="cacheReadTokens">缓存读取</option>
            <option value="cacheCreateTokens">缓存创建</option>
            <option value="cost">费用</option>
            <option value="durationMs">耗时</option>
            <option value="timeToFirstTokenMs">首词</option>
          </select>
        </label>
        <label class="filter-field">
          <span>方向</span>
          <select v-model="filters.sortOrder" class="filter-input" @change="fetchRecords(1)">
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </select>
        </label>
      </div>

      <div class="mb-4 grid gap-3 md:grid-cols-[1fr,auto] md:items-end">
        <label class="filter-field">
          <span>时间范围</span>
          <el-date-picker
            v-model="filters.dateRange"
            class="w-full"
            end-placeholder="结束时间"
            format="YYYY-MM-DD HH:mm"
            range-separator="至"
            start-placeholder="开始时间"
            type="datetimerange"
            value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
            @change="fetchRecords(1)"
          />
        </label>
        <button class="detail-action-button h-[42px]" @click="resetFilters">
          <i class="fas fa-undo" />
          重置
        </button>
      </div>

      <div class="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div class="summary-chip">
          <span>请求数</span>
          <strong>{{ formatNumber(summary.totalRequests) }}</strong>
        </div>
        <div class="summary-chip">
          <span>输入</span>
          <strong>{{ formatNumber(summary.inputTokens) }}</strong>
        </div>
        <div class="summary-chip">
          <span>输出</span>
          <strong>{{ formatNumber(summary.outputTokens) }}</strong>
        </div>
        <div class="summary-chip">
          <span>缓存建</span>
          <strong>{{
            formatCacheCreate(summary.cacheCreateTokens, summary.cacheCreateNotApplicable)
          }}</strong>
        </div>
        <div class="summary-chip">
          <span>费用</span>
          <strong>{{ formatCost(summary.totalCost) }}</strong>
        </div>
        <div class="summary-chip">
          <span>平均耗时</span>
          <strong>{{ formatDuration(summary.avgDurationMs) }}</strong>
        </div>
      </div>

      <div
        v-if="sessionSummaries.length > 0"
        class="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
      >
        <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h4 class="text-sm font-bold text-gray-900 dark:text-gray-100">Session 汇总</h4>
          <div class="flex items-center gap-3">
            <span class="text-xs text-gray-500 dark:text-gray-400">
              共 {{ sessionPagination.totalSessions }} 个 session
            </span>
            <button
              v-if="hasMoreSessionSummaries"
              class="session-more-button"
              type="button"
              @click="openSessionDialog"
            >
              查看全部 Session
            </button>
          </div>
        </div>
        <div class="grid gap-3 lg:grid-cols-2">
          <button
            v-for="session in sessionSummaries"
            :key="session.sessionKey"
            class="session-summary-card"
            type="button"
            @click="applySessionValue(session.sessionKey)"
          >
            <div class="min-w-0">
              <div class="truncate font-semibold text-gray-900 dark:text-gray-100">
                {{ formatSessionSummaryTitle(session) }}
              </div>
              <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ formatDate(session.firstTimestamp) }} → {{ formatDate(session.latestTimestamp) }}
              </div>
              <div class="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                {{ formatSessionModels(session.models) }}
              </div>
            </div>
            <div class="grid shrink-0 grid-cols-2 gap-x-4 gap-y-1 text-right text-xs">
              <span class="text-gray-500 dark:text-gray-400">请求</span>
              <strong>{{ formatNumber(session.requestCount) }}</strong>
              <span class="text-gray-500 dark:text-gray-400">费用</span>
              <strong>{{ formatCost(session.totalCost) }}</strong>
              <span class="text-gray-500 dark:text-gray-400">首词P95</span>
              <strong>{{ formatNullableDuration(session.p95TimeToFirstTokenMs) }}</strong>
            </div>
          </button>
        </div>
      </div>

      <div v-if="loading" class="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
        <i class="fas fa-spinner fa-spin mr-2" />
        加载中...
      </div>
      <div
        v-else-if="records.length === 0"
        class="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
      >
        当前条件下没有调用明细。
      </div>
      <template v-else>
        <div
          class="hidden overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 xl:block"
        >
          <table class="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-800/80">
              <tr>
                <th class="detail-th min-w-[170px]">
                  <button class="sortable-th-button" type="button" @click="setSort('timestamp')">
                    <span>时间</span>
                    <i :class="getSortIcon('timestamp')" />
                  </button>
                </th>
                <th class="detail-th min-w-[140px]">模型</th>
                <th class="detail-th min-w-[180px]">接口</th>
                <th class="detail-th min-w-[220px]">User-Agent</th>
                <th class="detail-th min-w-[90px]">
                  <button class="sortable-th-button" type="button" @click="setSort('inputTokens')">
                    <span>输入</span>
                    <i :class="getSortIcon('inputTokens')" />
                  </button>
                </th>
                <th class="detail-th min-w-[90px]">
                  <button class="sortable-th-button" type="button" @click="setSort('outputTokens')">
                    <span>输出</span>
                    <i :class="getSortIcon('outputTokens')" />
                  </button>
                </th>
                <th class="detail-th min-w-[100px]">
                  <button
                    class="sortable-th-button"
                    type="button"
                    @click="setSort('cacheReadTokens')"
                  >
                    <span>缓存读</span>
                    <i :class="getSortIcon('cacheReadTokens')" />
                  </button>
                </th>
                <th class="detail-th min-w-[100px]">
                  <button
                    class="sortable-th-button"
                    type="button"
                    @click="setSort('cacheCreateTokens')"
                  >
                    <span>缓存建</span>
                    <i :class="getSortIcon('cacheCreateTokens')" />
                  </button>
                </th>
                <th class="detail-th min-w-[100px]">
                  <button class="sortable-th-button" type="button" @click="setSort('cost')">
                    <span>费用</span>
                    <i :class="getSortIcon('cost')" />
                  </button>
                </th>
                <th class="detail-th min-w-[90px]">
                  <button class="sortable-th-button" type="button" @click="setSort('durationMs')">
                    <span>耗时</span>
                    <i :class="getSortIcon('durationMs')" />
                  </button>
                </th>
                <th class="detail-th min-w-[90px]">
                  <button
                    class="sortable-th-button"
                    type="button"
                    @click="setSort('timeToFirstTokenMs')"
                  >
                    <span>首词</span>
                    <i :class="getSortIcon('timeToFirstTokenMs')" />
                  </button>
                </th>
                <th class="detail-th min-w-[110px]">生成速度</th>
                <th class="detail-th min-w-[80px] text-right">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
              <tr v-for="record in records" :key="record.requestId" class="detail-row">
                <td class="detail-td">
                  <div class="font-medium">{{ formatDate(record.timestamp) }}</div>
                  <button
                    v-if="getSessionValue(record)"
                    class="mt-1 block whitespace-normal break-all text-left text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200"
                    :title="getSessionValue(record)"
                    type="button"
                    @click="applySessionFilter(record)"
                  >
                    {{ getSessionValue(record) }}
                  </button>
                </td>
                <td class="detail-td">{{ record.model || '-' }}</td>
                <td class="detail-td">
                  <div>{{ record.endpoint || '-' }}</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    {{ record.method || 'POST' }}
                  </div>
                </td>
                <td class="detail-td">
                  <div class="max-w-[260px] truncate text-xs" :title="record.userAgent || '-'">
                    {{ record.userAgent || '-' }}
                  </div>
                </td>
                <td class="detail-td text-blue-600 dark:text-blue-400">
                  {{ formatNumber(record.inputTokens) }}
                </td>
                <td class="detail-td text-green-600 dark:text-green-400">
                  {{ formatNumber(record.outputTokens) }}
                </td>
                <td class="detail-td text-cyan-600 dark:text-cyan-400">
                  {{ formatNumber(record.cacheReadTokens) }}
                </td>
                <td class="detail-td text-purple-600 dark:text-purple-400">
                  {{ formatCacheCreate(record.cacheCreateTokens, record.cacheCreateNotApplicable) }}
                </td>
                <td class="detail-td text-amber-600 dark:text-amber-400">
                  {{ formatCost(record.cost) }}
                </td>
                <td class="detail-td">{{ formatDuration(record.durationMs) }}</td>
                <td class="detail-td">{{ formatNullableDuration(record.timeToFirstTokenMs) }}</td>
                <td class="detail-td">{{ formatGenerationSpeed(record) }}</td>
                <td class="detail-td text-right">
                  <button class="detail-link-button" @click="openDetail(record.requestId)">
                    详情
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="space-y-3 xl:hidden">
          <div
            v-for="record in records"
            :key="record.requestId"
            class="rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <div class="mb-3 flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="font-bold text-gray-900 dark:text-gray-100">{{ record.model }}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  {{ formatDate(record.timestamp) }}
                </div>
              </div>
              <button class="detail-link-button" @click="openDetail(record.requestId)">详情</button>
            </div>
            <div class="grid grid-cols-2 gap-2 text-gray-700 dark:text-gray-300">
              <div class="col-span-2 break-all text-xs">接口：{{ record.endpoint || '-' }}</div>
              <div class="col-span-2 break-all text-xs">
                User-Agent：{{ record.userAgent || '-' }}
              </div>
              <button
                v-if="getSessionValue(record)"
                class="col-span-2 break-all text-left text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200"
                type="button"
                @click="applySessionFilter(record)"
              >
                {{ getSessionValue(record) }}
              </button>
              <div>输入：{{ formatNumber(record.inputTokens) }}</div>
              <div>输出：{{ formatNumber(record.outputTokens) }}</div>
              <div>缓存读：{{ formatNumber(record.cacheReadTokens) }}</div>
              <div>
                缓存建：{{
                  formatCacheCreate(record.cacheCreateTokens, record.cacheCreateNotApplicable)
                }}
              </div>
              <div>费用：{{ formatCost(record.cost) }}</div>
              <div>耗时：{{ formatDuration(record.durationMs) }}</div>
              <div>首词：{{ formatNullableDuration(record.timeToFirstTokenMs) }}</div>
              <div>速度：{{ formatGenerationSpeed(record) }}</div>
            </div>
          </div>
        </div>

        <div
          class="mt-4 flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between"
        >
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
      </template>
    </template>

    <RequestDetailModal
      :fetch-detail="fetchDetailRecord"
      :request-id="activeRequestId"
      :show="detailVisible"
      @close="closeDetail"
    />

    <el-dialog
      v-model="sessionDialogVisible"
      class="session-dialog"
      destroy-on-close
      title="全部 Session"
      width="min(920px, 94vw)"
    >
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <el-input
          v-model="sessionDialogKeyword"
          class="sm:max-w-[360px]"
          clearable
          placeholder="搜索 session / hash / conversation / user_id"
          @clear="fetchSessionDialog(1)"
          @keyup.enter="fetchSessionDialog(1)"
        >
          <template #prefix>
            <i class="fas fa-search text-blue-500" />
          </template>
        </el-input>
        <button
          class="detail-action-button"
          :disabled="sessionDialogLoading"
          type="button"
          @click="fetchSessionDialog(1)"
        >
          <i class="fas fa-search" />
          查询
        </button>
      </div>

      <el-table v-loading="sessionDialogLoading" border class="w-full" :data="sessionDialogRecords">
        <el-table-column label="Session" min-width="260">
          <template #default="{ row }">
            <button
              class="max-w-full truncate text-left text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
              :title="getSessionSummaryValue(row)"
              type="button"
              @click="selectSessionFromDialog(row)"
            >
              {{ formatSessionSummaryTitle(row) }}
            </button>
            <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ formatDate(row.firstTimestamp) }} → {{ formatDate(row.latestTimestamp) }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="模型" min-width="180">
          <template #default="{ row }">
            <span class="text-sm">{{ formatSessionModels(row.models) }}</span>
          </template>
        </el-table-column>
        <el-table-column align="right" label="请求" width="90">
          <template #default="{ row }">{{ formatNumber(row.requestCount) }}</template>
        </el-table-column>
        <el-table-column align="right" label="费用" width="110">
          <template #default="{ row }">{{ formatCost(row.totalCost) }}</template>
        </el-table-column>
        <el-table-column align="right" label="首词P95" width="110">
          <template #default="{ row }">
            {{ formatNullableDuration(row.p95TimeToFirstTokenMs) }}
          </template>
        </el-table-column>
        <el-table-column align="right" label="操作" width="90">
          <template #default="{ row }">
            <button class="detail-link-button" type="button" @click="selectSessionFromDialog(row)">
              过滤
            </button>
          </template>
        </el-table-column>
      </el-table>

      <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="text-sm text-gray-500 dark:text-gray-400">
          共 {{ sessionDialogPagination.totalSessions }} 个 session
        </div>
        <el-pagination
          background
          :current-page="sessionDialogPagination.currentPage"
          layout="prev, pager, next, sizes"
          :page-size="sessionDialogPagination.pageSize"
          :page-sizes="[20, 50, 100]"
          :total="sessionDialogPagination.totalSessions"
          @current-change="handleSessionDialogPageChange"
          @size-change="handleSessionDialogSizeChange"
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { debounce } from 'lodash-es'
import {
  getApiStatsRequestDetailApi,
  getApiStatsRequestDetailSessionsApi,
  getApiStatsRequestDetailsApi
} from '@/utils/http_apis'
import { formatNumber, showToast } from '@/utils/tools'
import RequestDetailModal from '@/components/admin/RequestDetailModal.vue'

const props = defineProps({
  apiKey: {
    type: String,
    default: ''
  },
  apiId: {
    type: String,
    default: ''
  }
})

let fetchVersion = 0
let suppressDateRangeWatch = false

const loading = ref(false)
const exporting = ref(false)
const detailVisible = ref(false)
const sessionDialogVisible = ref(false)
const sessionDialogLoading = ref(false)
const activeRequestId = ref('')
const activeSnapshotId = ref(null)
const records = ref([])
const sessionSummaries = ref([])
const sessionDialogRecords = ref([])
const sessionDialogKeyword = ref('')
const availableModels = ref([])
const availableEndpoints = ref([])

const pagination = reactive({
  currentPage: 1,
  pageSize: 50,
  totalRecords: 0
})

const sessionPagination = reactive({
  totalSessions: 0
})

const sessionDialogPagination = reactive({
  currentPage: 1,
  pageSize: 20,
  totalSessions: 0
})

const filters = reactive({
  dateRange: null,
  keyword: '',
  session: '',
  model: '',
  endpoint: '',
  sortBy: 'timestamp',
  sortOrder: 'desc'
})

const summary = reactive({
  totalRequests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreateTokens: 0,
  cacheCreateNotApplicable: false,
  totalCost: 0,
  avgDurationMs: 0
})

const canQuery = computed(() => Boolean(props.apiKey?.trim() && props.apiId))
const hasMoreSessionSummaries = computed(
  () => sessionPagination.totalSessions > sessionSummaries.value.length
)

const buildPayload = (page = pagination.currentPage, snapshotId = activeSnapshotId.value) => {
  const payload = {
    apiKey: props.apiKey.trim(),
    apiId: props.apiId,
    page,
    pageSize: pagination.pageSize,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder
  }

  if (filters.keyword) payload.keyword = filters.keyword
  if (filters.session) payload.session = filters.session
  if (filters.model) payload.model = filters.model
  if (filters.endpoint) payload.endpoint = filters.endpoint
  if (filters.dateRange && filters.dateRange.length === 2) {
    const [startDate, endDate] = filters.dateRange
    const parsedStart = dayjs(startDate)
    const parsedEnd = dayjs(endDate)
    if (parsedStart.isValid() && parsedEnd.isValid()) {
      payload.startDate = parsedStart.toISOString()
      payload.endDate = parsedEnd.toISOString()
    }
  }
  if (snapshotId) payload.snapshotId = snapshotId

  return payload
}

const buildSessionPayload = ({
  page = 1,
  pageSize = 6,
  keyword = filters.keyword,
  includeSession = true
} = {}) => {
  const payload = {
    ...buildPayload(1, null),
    page,
    pageSize
  }

  if (!keyword) {
    delete payload.keyword
  } else {
    payload.keyword = keyword
  }

  if (!includeSession) {
    delete payload.session
  }

  return payload
}

const resetData = () => {
  activeSnapshotId.value = null
  records.value = []
  sessionSummaries.value = []
  sessionDialogRecords.value = []
  availableModels.value = []
  availableEndpoints.value = []
  pagination.currentPage = 1
  pagination.totalRecords = 0
  sessionPagination.totalSessions = 0
  sessionDialogPagination.currentPage = 1
  sessionDialogPagination.totalSessions = 0
  summary.totalRequests = 0
  summary.inputTokens = 0
  summary.outputTokens = 0
  summary.cacheReadTokens = 0
  summary.cacheCreateTokens = 0
  summary.cacheCreateNotApplicable = false
  summary.totalCost = 0
  summary.avgDurationMs = 0
}

const syncSessionSummaryState = (data = {}) => {
  sessionSummaries.value = data.sessions || []
  sessionPagination.totalSessions = data.pagination?.totalSessions || 0
}

const fetchSessionSummaries = async () => {
  if (!canQuery.value) {
    sessionSummaries.value = []
    sessionPagination.totalSessions = 0
    return
  }

  const response = await getApiStatsRequestDetailSessionsApi(buildSessionPayload())
  if (response?.success === false) {
    showToast(response.message || '加载 Session 汇总失败', 'error')
    return
  }

  syncSessionSummaryState(response.data || {})
}

const syncSessionDialogState = (data = {}) => {
  sessionDialogRecords.value = data.sessions || []
  const pageInfo = data.pagination || {}
  sessionDialogPagination.currentPage = pageInfo.currentPage || 1
  sessionDialogPagination.pageSize = pageInfo.pageSize || sessionDialogPagination.pageSize
  sessionDialogPagination.totalSessions = pageInfo.totalSessions || 0
}

const fetchSessionDialog = async (page = sessionDialogPagination.currentPage) => {
  if (!canQuery.value) {
    sessionDialogRecords.value = []
    sessionDialogPagination.totalSessions = 0
    return
  }

  sessionDialogLoading.value = true
  try {
    const response = await getApiStatsRequestDetailSessionsApi(
      buildSessionPayload({
        page,
        pageSize: sessionDialogPagination.pageSize,
        keyword: sessionDialogKeyword.value.trim() || filters.keyword,
        includeSession: false
      })
    )
    if (response?.success === false) {
      showToast(response.message || '加载 Session 列表失败', 'error')
      return
    }
    syncSessionDialogState(response.data || {})
  } catch (error) {
    showToast(`加载 Session 列表失败：${error.message || '未知错误'}`, 'error')
  } finally {
    sessionDialogLoading.value = false
  }
}

const syncResponseState = (data = {}) => {
  activeSnapshotId.value = data.snapshotId || null
  records.value = data.records || []

  const pageInfo = data.pagination || {}
  pagination.currentPage = pageInfo.currentPage || 1
  pagination.pageSize = pageInfo.pageSize || pagination.pageSize
  pagination.totalRecords = pageInfo.totalRecords || 0

  const filterEcho = data.filters || {}
  filters.model = filterEcho.model || ''
  filters.endpoint = filterEcho.endpoint || ''
  filters.session = filterEcho.session || ''
  filters.sortBy = filterEcho.sortBy || 'timestamp'
  filters.sortOrder = filterEcho.sortOrder || 'desc'
  if (filterEcho.startDate && filterEcho.endDate) {
    suppressDateRangeWatch = true
    filters.dateRange = [filterEcho.startDate, filterEcho.endDate]
    nextTick(() => {
      suppressDateRangeWatch = false
    })
  }

  availableModels.value = data.availableFilters?.models || []
  availableEndpoints.value = data.availableFilters?.endpoints || []

  const summaryData = data.summary || {}
  summary.totalRequests = summaryData.totalRequests || 0
  summary.inputTokens = summaryData.inputTokens || 0
  summary.outputTokens = summaryData.outputTokens || 0
  summary.cacheReadTokens = summaryData.cacheReadTokens || 0
  summary.cacheCreateTokens = summaryData.cacheCreateTokens || 0
  summary.cacheCreateNotApplicable = summaryData.cacheCreateNotApplicable === true
  summary.totalCost = summaryData.totalCost || 0
  summary.avgDurationMs = summaryData.avgDurationMs || 0
}

const invalidateSnapshot = () => {
  activeSnapshotId.value = null
}

const fetchRecords = async (page = pagination.currentPage) => {
  debouncedKeywordFetch.cancel()
  if (!canQuery.value) {
    resetData()
    return
  }

  const version = ++fetchVersion
  loading.value = true
  try {
    const response = await getApiStatsRequestDetailsApi(buildPayload(page))
    if (version !== fetchVersion) return
    if (response?.success === false) {
      showToast(response.message || '加载调用明细失败', 'error')
      return
    }
    syncResponseState(response.data || {})
    await fetchSessionSummaries()
  } catch (error) {
    if (version !== fetchVersion) return
    showToast(`加载调用明细失败：${error.message || '未知错误'}`, 'error')
  } finally {
    if (version === fetchVersion) {
      loading.value = false
    }
  }
}

const handlePageChange = (page) => {
  pagination.currentPage = page
  fetchRecords(page)
}

const handleSizeChange = (size) => {
  pagination.pageSize = size
  pagination.currentPage = 1
  invalidateSnapshot()
  fetchRecords(1)
}

const refresh = () => {
  invalidateSnapshot()
  fetchRecords(pagination.currentPage)
}

const openSessionDialog = () => {
  sessionDialogVisible.value = true
  sessionDialogKeyword.value = ''
  sessionDialogPagination.currentPage = 1
  fetchSessionDialog(1)
}

const handleSessionDialogPageChange = (page) => {
  sessionDialogPagination.currentPage = page
  fetchSessionDialog(page)
}

const handleSessionDialogSizeChange = (size) => {
  sessionDialogPagination.pageSize = size
  sessionDialogPagination.currentPage = 1
  fetchSessionDialog(1)
}

const resetFilters = () => {
  invalidateSnapshot()
  filters.dateRange = null
  filters.keyword = ''
  filters.session = ''
  filters.model = ''
  filters.endpoint = ''
  filters.sortBy = 'timestamp'
  filters.sortOrder = 'desc'
  pagination.currentPage = 1
  fetchRecords(1)
  nextTick(() => debouncedKeywordFetch.cancel())
}

const openDetail = (requestId) => {
  activeRequestId.value = requestId
  detailVisible.value = true
}

const getSessionValue = (record) =>
  record?.sessionId || record?.sessionHash || record?.conversationId || record?.metadataUserId || ''

const applySessionFilter = (record) => {
  const session = getSessionValue(record)
  if (!session) return
  applySessionValue(session)
}

const applySessionValue = (session) => {
  if (!session) return
  invalidateSnapshot()
  filters.session = session
  pagination.currentPage = 1
  fetchRecords(1)
  nextTick(() => debouncedKeywordFetch.cancel())
}

const setSort = (field) => {
  if (filters.sortBy === field) {
    filters.sortOrder = filters.sortOrder === 'asc' ? 'desc' : 'asc'
    return
  }

  filters.sortBy = field
  filters.sortOrder = 'desc'
}

const getSortIcon = (field) => {
  if (filters.sortBy !== field) {
    return 'fas fa-sort text-gray-400'
  }

  return filters.sortOrder === 'asc'
    ? 'fas fa-sort-up text-blue-500'
    : 'fas fa-sort-down text-blue-500'
}

const getSessionSummaryValue = (session) =>
  session?.sessionKey ||
  session?.sessionId ||
  session?.conversationId ||
  session?.sessionHash ||
  session?.metadataUserId ||
  ''

const selectSessionFromDialog = (session) => {
  const value = getSessionSummaryValue(session)
  if (!value) return
  sessionDialogVisible.value = false
  applySessionValue(value)
}

const formatSessionSummaryTitle = (session) => {
  const value = getSessionSummaryValue(session)
  if (!value) return '-'
  return value.length > 42 ? `${value.slice(0, 18)}...${value.slice(-10)}` : value
}

const formatSessionModels = (models = []) => {
  if (!Array.isArray(models) || models.length === 0) {
    return '-'
  }

  return models.slice(0, 4).join(', ') + (models.length > 4 ? ` +${models.length - 4}` : '')
}

const closeDetail = () => {
  detailVisible.value = false
  activeRequestId.value = ''
}

const fetchDetailRecord = (requestId) =>
  getApiStatsRequestDetailApi(requestId, {
    apiKey: props.apiKey.trim(),
    apiId: props.apiId
  })

const exportCsv = async () => {
  if (exporting.value || !canQuery.value) return

  exporting.value = true
  try {
    const aggregated = []
    let page = 1
    let totalPages = 1
    let totalRecords = 0
    let snapshotId = activeSnapshotId.value
    const maxPages = 100

    while (page <= totalPages && page <= maxPages) {
      const response = await getApiStatsRequestDetailsApi({
        ...buildPayload(page, snapshotId),
        pageSize: 200
      })
      const payload = response.data || {}
      snapshotId = payload.snapshotId || null
      aggregated.push(...(payload.records || []))
      totalPages = payload.pagination?.totalPages || 1
      if (page === 1) {
        totalRecords = payload.pagination?.totalRecords || 0
      }
      page += 1
    }

    if (totalPages > maxPages) {
      showToast(
        `数据量超过导出上限（已导出 ${aggregated.length} 条，共 ${totalRecords} 条），建议缩小筛选范围后重试`,
        'warning'
      )
    }

    if (aggregated.length === 0) {
      showToast('没有可导出的记录', 'info')
      return
    }

    const headers = [
      '统计时间',
      '模型',
      '接口',
      'User-Agent',
      'Session',
      '输入',
      '输出',
      '缓存读取',
      '缓存创建',
      '费用',
      '耗时(ms)',
      '首包(ms)',
      '首词(ms)',
      '内容生成(ms)',
      '生成速度(tokens/s)'
    ]

    const rows = [headers.join(',')]
    aggregated.forEach((record) => {
      const row = [
        formatDate(record.timestamp),
        record.model || '',
        record.endpoint || '',
        record.userAgent || '',
        getSessionValue(record),
        record.inputTokens || 0,
        record.outputTokens || 0,
        record.cacheReadTokens || 0,
        formatCacheCreate(record.cacheCreateTokens, record.cacheCreateNotApplicable),
        formatCost(record.cost),
        record.durationMs || 0,
        record.timeToFirstByteMs ?? '',
        record.timeToFirstTokenMs ?? '',
        record.contentGenerationMs ?? '',
        getGenerationSpeed(record) ?? ''
      ]
      rows.push(row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    })

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `api-key-${props.apiId}-request-details.csv`
    link.click()
    URL.revokeObjectURL(url)
    showToast('导出 CSV 成功', 'success')
  } catch (error) {
    showToast(`导出失败：${error.message || '未知错误'}`, 'error')
  } finally {
    exporting.value = false
  }
}

const formatDate = (value) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-')
const formatCost = (value) => {
  const num = Number(value || 0)
  if (num >= 1) return `$${num.toFixed(2)}`
  if (num >= 0.001) return `$${num.toFixed(4)}`
  return `$${num.toFixed(6)}`
}
const formatDuration = (value) => `${Number(value || 0)}ms`
const formatNullableDuration = (value) =>
  value === null || value === undefined || value === '' ? '-' : `${Number(value)}ms`
const formatCacheCreate = (value, notApplicable = false) =>
  notApplicable ? '-' : formatNumber(value)
const getGenerationSpeed = (record) => {
  const outputTokens = Number(record?.outputTokens || 0)
  const contentGenerationMs = Number(record?.contentGenerationMs || 0)
  if (outputTokens <= 0 || contentGenerationMs <= 0) {
    return null
  }

  return Number(((outputTokens * 1000) / contentGenerationMs).toFixed(2))
}
const formatGenerationSpeed = (record) => {
  const speed = getGenerationSpeed(record)
  return speed === null ? '-' : `${speed} tok/s`
}

const debouncedKeywordFetch = debounce(() => {
  pagination.currentPage = 1
  invalidateSnapshot()
  fetchRecords(1)
}, 300)

watch(
  () => [filters.keyword, filters.session],
  () => {
    debouncedKeywordFetch()
  }
)

watch(
  () => [filters.model, filters.endpoint, filters.sortBy, filters.sortOrder],
  () => {
    invalidateSnapshot()
    pagination.currentPage = 1
    fetchRecords(1)
  }
)

watch(
  () => filters.dateRange,
  () => {
    if (suppressDateRangeWatch) return
    invalidateSnapshot()
    pagination.currentPage = 1
    fetchRecords(1)
  }
)

watch(
  () => [props.apiKey, props.apiId],
  () => {
    debouncedKeywordFetch.cancel()
    resetFilters()
  },
  { immediate: true }
)
</script>

<style scoped>
.request-details-panel {
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(25px);
}

.detail-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 96px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  background: rgba(255, 255, 255, 0.78);
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 600;
  color: rgb(51 65 85);
  transition: all 0.2s ease;
}

.detail-action-button:hover:not(:disabled) {
  border-color: rgb(59 130 246);
  color: rgb(37 99 235);
}

.detail-action-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

:global(.dark) .detail-action-button {
  border-color: rgba(71, 85, 105, 0.8);
  background: rgba(31, 41, 55, 0.82);
  color: rgb(226 232 240);
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: rgb(71 85 105);
}

:global(.dark) .filter-field {
  color: rgb(203 213 225);
}

.filter-input {
  min-height: 42px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.55);
  background: rgba(255, 255, 255, 0.9);
  padding: 9px 12px;
  font-size: 14px;
  color: rgb(15 23 42);
}

.filter-input:focus {
  border-color: rgb(59 130 246);
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16);
}

:global(.dark) .filter-input {
  border-color: rgba(71, 85, 105, 0.9);
  background: rgba(15, 23, 42, 0.82);
  color: rgb(241 245 249);
}

.summary-chip {
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(255, 255, 255, 0.7);
  padding: 12px 14px;
}

.summary-chip span {
  display: block;
  font-size: 12px;
  color: rgb(100 116 139);
}

.summary-chip strong {
  display: block;
  margin-top: 4px;
  font-size: 18px;
  color: rgb(15 23 42);
}

:global(.dark) .summary-chip {
  border-color: rgba(71, 85, 105, 0.55);
  background: rgba(15, 23, 42, 0.72);
}

:global(.dark) .summary-chip strong {
  color: rgb(241 245 249);
}

.session-summary-card {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(248, 250, 252, 0.86);
  padding: 12px;
  text-align: left;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.session-summary-card:hover {
  border-color: rgba(59, 130, 246, 0.55);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}

:global(.dark) .session-summary-card {
  border-color: rgba(71, 85, 105, 0.62);
  background: rgba(15, 23, 42, 0.72);
}

.session-more-button {
  border-radius: 8px;
  border: 1px solid rgba(59, 130, 246, 0.35);
  background: rgba(59, 130, 246, 0.08);
  padding: 5px 9px;
  font-size: 12px;
  font-weight: 700;
  color: rgb(37 99 235);
}

.session-more-button:hover {
  border-color: rgba(37, 99, 235, 0.65);
  background: rgba(59, 130, 246, 0.14);
}

:global(.dark) .session-more-button {
  border-color: rgba(96, 165, 250, 0.45);
  background: rgba(30, 64, 175, 0.24);
  color: rgb(147 197 253);
}

.detail-th {
  padding: 12px 14px;
  text-align: left;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgb(71 85 105);
}

:global(.dark) .detail-th {
  color: rgb(203 213 225);
}

.sortable-th-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  padding: 3px 5px;
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.sortable-th-button:hover {
  background: rgba(59, 130, 246, 0.1);
  color: rgb(37 99 235);
}

:global(.dark) .sortable-th-button:hover {
  background: rgba(59, 130, 246, 0.16);
  color: rgb(147 197 253);
}

.detail-td {
  padding: 12px 14px;
  vertical-align: top;
  color: rgb(31 41 55);
}

:global(.dark) .detail-td {
  color: rgb(226 232 240);
}

.detail-row:hover {
  background: rgba(248, 250, 252, 0.9);
}

:global(.dark) .detail-row:hover {
  background: rgba(30, 41, 59, 0.6);
}

.detail-link-button {
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  background: rgba(255, 255, 255, 0.82);
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: rgb(37 99 235);
}

:global(.dark) .detail-link-button {
  border-color: rgba(71, 85, 105, 0.8);
  background: rgba(31, 41, 55, 0.82);
  color: rgb(96 165 250);
}
</style>
