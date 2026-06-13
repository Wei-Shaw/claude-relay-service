<template>
  <div class="service-quality-container">
    <div class="card p-4 sm:p-6">
      <div class="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">服务质量</h3>
            <span
              :class="[
                'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
                captureEnabled
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
              ]"
            >
              <span
                :class="[
                  'mr-2 h-2 w-2 rounded-full',
                  captureEnabled ? 'bg-emerald-500' : 'bg-gray-400'
                ]"
              />
              {{ captureEnabled ? '采集已开启' : '采集已关闭' }}
            </span>
            <span
              class="inline-flex items-center rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300"
            >
              保留 {{ retentionHours }} 小时
            </span>
          </div>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            这里展示系统可用性、错误口径和延迟分布；点击分布项可下钻到请求明细。
          </p>
        </div>

        <div class="flex flex-col gap-2 sm:flex-row">
          <button class="quality-button" :disabled="loading" @click="fetchSummary">
            <i :class="['fas', loading ? 'fa-spinner fa-spin' : 'fa-sync-alt']" />
            刷新
          </button>
          <button class="quality-button" @click="resetFilters">
            <i class="fas fa-undo" />
            重置
          </button>
        </div>
      </div>

      <div
        class="mb-5 grid gap-3 rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-800/40 md:grid-cols-2 xl:grid-cols-5"
      >
        <div class="quality-control xl:col-span-2">
          <el-date-picker
            v-model="filters.dateRange"
            class="w-full"
            clearable
            end-placeholder="结束时间"
            format="YYYY-MM-DD HH:mm:ss"
            start-placeholder="开始时间"
            type="datetimerange"
            unlink-panels
          />
        </div>
        <div class="quality-control">
          <el-select v-model="filters.outcome" clearable filterable placeholder="所有结果">
            <el-option
              v-for="item in availableOutcomes"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </div>
        <div class="quality-control">
          <el-select v-model="filters.failureStage" clearable filterable placeholder="所有阶段">
            <el-option
              v-for="item in availableFailureStages"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </div>
        <div class="quality-control">
          <el-select v-model="filters.endpoint" clearable filterable placeholder="所有接口">
            <el-option v-for="item in availableEndpoints" :key="item" :label="item" :value="item" />
          </el-select>
        </div>
        <div class="quality-control">
          <el-select v-model="filters.model" clearable filterable placeholder="所有模型">
            <el-option v-for="item in availableModels" :key="item" :label="item" :value="item" />
          </el-select>
        </div>
        <div class="quality-control">
          <el-select v-model="filters.accountId" clearable filterable placeholder="所有账户">
            <el-option
              v-for="item in availableAccounts"
              :key="item.id"
              :label="`${item.name}（${item.accountTypeName}）`"
              :value="item.id"
            />
          </el-select>
        </div>
        <div class="quality-control">
          <el-select v-model="filters.apiKeyId" clearable filterable placeholder="所有 API Key">
            <el-option
              v-for="item in availableApiKeys"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </div>
      </div>

      <div v-if="loading" class="flex items-center justify-center p-14 text-gray-500">
        <i class="fas fa-spinner fa-spin mr-2" />加载中...
      </div>

      <template v-else>
        <div class="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div class="quality-metric">
            <p class="metric-label">SLA 成功率</p>
            <p class="metric-value text-emerald-600 dark:text-emerald-400">
              {{ formatPercent(summary.slaSuccessRate) }}
            </p>
            <p class="metric-sub">
              {{ formatNumber(summary.slaSuccessRequests) }} /
              {{ formatNumber(summary.slaEligibleRequests) }}
            </p>
          </div>
          <div class="quality-metric">
            <p class="metric-label">SLA 失败率</p>
            <p class="metric-value text-rose-600 dark:text-rose-400">
              {{ formatPercent(summary.slaFailureRate) }}
            </p>
            <p class="metric-sub">失败 {{ formatNumber(summary.slaFailureRequests) }}</p>
          </div>
          <div class="quality-metric">
            <p class="metric-label">P95 / P99</p>
            <p class="metric-value">{{ formatDuration(summary.p95DurationMs) }}</p>
            <p class="metric-sub">P99 {{ formatDuration(summary.p99DurationMs) }}</p>
          </div>
          <div class="quality-metric">
            <p class="metric-label">上游 / 超时</p>
            <p class="metric-value text-amber-600 dark:text-amber-400">
              {{ formatNumber(summary.upstreamErrorRequests) }}
            </p>
            <p class="metric-sub">超时 {{ formatNumber(summary.timeoutRequests) }}</p>
          </div>
          <div class="quality-metric">
            <p class="metric-label">总请求</p>
            <p class="metric-value">{{ formatNumber(summary.totalRequests) }}</p>
            <p class="metric-sub">4xx {{ formatNumber(summary.clientErrorRequests) }}</p>
          </div>
        </div>

        <div class="grid gap-4 xl:grid-cols-3">
          <section class="quality-panel">
            <div class="panel-header">
              <h4>结果分布</h4>
              <button class="panel-link" @click="goToDetails()">全部明细</button>
            </div>
            <div class="space-y-3">
              <button
                v-for="item in distributions.outcomes"
                :key="item.value"
                class="distribution-row"
                @click="goToDetails({ outcome: item.value })"
              >
                <span>{{ item.label }}</span>
                <span>{{ formatNumber(item.count) }}</span>
              </button>
              <p v-if="distributions.outcomes.length === 0" class="empty-note">暂无数据</p>
            </div>
          </section>

          <section class="quality-panel">
            <div class="panel-header">
              <h4>失败阶段</h4>
              <button class="panel-link" @click="goToDetails({ slaOnly: 'true' })">SLA 请求</button>
            </div>
            <div class="space-y-3">
              <button
                v-for="item in distributions.failureStages"
                :key="item.value"
                class="distribution-row"
                @click="goToDetails({ failureStage: item.value })"
              >
                <span>{{ item.label }}</span>
                <span>{{ formatNumber(item.count) }}</span>
              </button>
              <p v-if="distributions.failureStages.length === 0" class="empty-note">暂无数据</p>
            </div>
          </section>

          <section class="quality-panel">
            <div class="panel-header">
              <h4>延迟分布</h4>
              <span class="text-xs text-gray-500">按完成耗时</span>
            </div>
            <div class="space-y-3">
              <div
                v-for="bucket in distributions.latencyBuckets"
                :key="bucket.key"
                class="latency-row"
              >
                <div class="flex items-center justify-between text-xs">
                  <span>{{ bucket.label }}</span>
                  <span>{{ formatNumber(bucket.count) }}</span>
                </div>
                <div class="mt-1 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                  <div
                    class="h-full rounded-full bg-cyan-500"
                    :style="{ width: bucketWidth(bucket.count) }"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>

        <div class="mt-4 grid gap-4 xl:grid-cols-2">
          <GroupTable
            :items="topGroups.endpoints"
            title="接口 Top"
            @drill="goToDetails({ endpoint: $event.key })"
          />
          <GroupTable
            :items="topGroups.models"
            title="模型 Top"
            @drill="goToDetails({ model: $event.key })"
          />
          <GroupTable
            :items="topGroups.accounts"
            title="账户 Top"
            @drill="goToDetails({ accountId: $event.key })"
          />
          <GroupTable
            :items="topGroups.apiKeys"
            title="API Key Top"
            @drill="goToDetails({ apiKeyId: $event.key })"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { debounce } from 'lodash-es'
import { getServiceQualityApi } from '@/utils/http_apis'
import { formatNumber, showToast } from '@/utils/tools'

const GroupTable = defineComponent({
  name: 'GroupTable',
  props: {
    title: { type: String, required: true },
    items: { type: Array, default: () => [] }
  },
  emits: ['drill'],
  setup(props, { emit }) {
    const formatPercentLocal = (value) => `${Number(value || 0).toFixed(2)}%`
    const formatDurationLocal = (value) => `${Number(value || 0)}ms`
    return () =>
      h('section', { class: 'quality-panel' }, [
        h('div', { class: 'panel-header' }, [h('h4', props.title)]),
        props.items.length === 0
          ? h('p', { class: 'empty-note' }, '暂无数据')
          : h(
              'div',
              { class: 'overflow-x-auto' },
              h('table', { class: 'quality-table' }, [
                h('thead', [
                  h('tr', [
                    h('th', '名称'),
                    h('th', '请求'),
                    h('th', 'SLA'),
                    h('th', 'P95'),
                    h('th', '')
                  ])
                ]),
                h(
                  'tbody',
                  props.items.map((item) =>
                    h('tr', { key: item.key }, [
                      h('td', { class: 'max-w-[260px] truncate', title: item.label }, item.label),
                      h('td', formatNumber(item.totalRequests)),
                      h('td', formatPercentLocal(item.slaSuccessRate)),
                      h('td', formatDurationLocal(item.p95DurationMs)),
                      h('td', [
                        h(
                          'button',
                          {
                            class: 'panel-link',
                            onClick: () => emit('drill', item)
                          },
                          '下钻'
                        )
                      ])
                    ])
                  )
                )
              ])
            )
      ])
  }
})

const router = useRouter()
const loading = ref(false)
const captureEnabled = ref(false)
const retentionHours = ref(6)
const availableOutcomes = ref([])
const availableFailureStages = ref([])
const availableEndpoints = ref([])
const availableModels = ref([])
const availableAccounts = ref([])
const availableApiKeys = ref([])

const filters = reactive({
  dateRange: null,
  outcome: '',
  failureStage: '',
  endpoint: '',
  model: '',
  accountId: '',
  apiKeyId: ''
})

const summary = reactive({
  totalRequests: 0,
  slaEligibleRequests: 0,
  slaSuccessRequests: 0,
  slaFailureRequests: 0,
  slaSuccessRate: 0,
  slaFailureRate: 0,
  clientErrorRequests: 0,
  upstreamErrorRequests: 0,
  timeoutRequests: 0,
  p95DurationMs: 0,
  p99DurationMs: 0
})

const distributions = reactive({
  outcomes: [],
  failureStages: [],
  statusClasses: [],
  latencyBuckets: []
})

const topGroups = reactive({
  endpoints: [],
  models: [],
  accounts: [],
  apiKeys: []
})

const maxLatencyBucketCount = computed(() =>
  Math.max(...distributions.latencyBuckets.map((item) => Number(item.count || 0)), 1)
)

const formatPercent = (value) => `${Number(value || 0).toFixed(2)}%`
const formatDuration = (value) => `${Number(value || 0)}ms`
const bucketWidth = (count) =>
  `${Math.max(4, (Number(count || 0) / maxLatencyBucketCount.value) * 100)}%`

const buildParams = () => {
  const params = {}
  if (filters.outcome) params.outcome = filters.outcome
  if (filters.failureStage) params.failureStage = filters.failureStage
  if (filters.endpoint) params.endpoint = filters.endpoint
  if (filters.model) params.model = filters.model
  if (filters.accountId) params.accountId = filters.accountId
  if (filters.apiKeyId) params.apiKeyId = filters.apiKeyId

  if (filters.dateRange && filters.dateRange.length === 2) {
    const [startDate, endDate] = filters.dateRange
    const parsedStart = dayjs(startDate)
    const parsedEnd = dayjs(endDate)
    if (parsedStart.isValid() && parsedEnd.isValid()) {
      params.startDate = parsedStart.toISOString()
      params.endDate = parsedEnd.toISOString()
    }
  }
  return params
}

const syncData = (data = {}) => {
  captureEnabled.value = data.captureEnabled === true
  retentionHours.value = data.retentionHours || 6

  const available = data.availableFilters || {}
  availableOutcomes.value = available.outcomes || []
  availableFailureStages.value = available.failureStages || []
  availableEndpoints.value = available.endpoints || []
  availableModels.value = available.models || []
  availableAccounts.value = available.accounts || []
  availableApiKeys.value = available.apiKeys || []

  Object.assign(summary, data.summary || {})
  distributions.outcomes = data.distributions?.outcomes || []
  distributions.failureStages = data.distributions?.failureStages || []
  distributions.statusClasses = data.distributions?.statusClasses || []
  distributions.latencyBuckets = data.distributions?.latencyBuckets || []
  topGroups.endpoints = data.topGroups?.endpoints || []
  topGroups.models = data.topGroups?.models || []
  topGroups.accounts = data.topGroups?.accounts || []
  topGroups.apiKeys = data.topGroups?.apiKeys || []
}

const fetchSummary = async () => {
  loading.value = true
  try {
    const response = await getServiceQualityApi(buildParams())
    if (response?.success === false) {
      showToast(response.message || '加载服务质量失败', 'error')
      return
    }
    syncData(response.data || {})
  } catch (error) {
    showToast(`加载服务质量失败：${error.message || '未知错误'}`, 'error')
  } finally {
    loading.value = false
  }
}

const debouncedFetch = debounce(fetchSummary, 250)

const resetFilters = () => {
  filters.dateRange = null
  filters.outcome = ''
  filters.failureStage = ''
  filters.endpoint = ''
  filters.model = ''
  filters.accountId = ''
  filters.apiKeyId = ''
  fetchSummary()
}

const goToDetails = (extra = {}) => {
  const query = {
    ...buildParams(),
    ...extra
  }
  router.push({ path: '/request-details', query })
}

watch(filters, () => debouncedFetch(), { deep: true })

onMounted(() => {
  fetchSummary()
})
</script>

<style scoped>
.service-quality-container {
  min-height: calc(100vh - 300px);
}

.quality-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid rgb(229 231 235);
  background: rgb(255 255 255);
  padding: 0 14px;
  font-size: 13px;
  font-weight: 700;
  color: rgb(55 65 81);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}

.dark .quality-button {
  border-color: rgb(75 85 99);
  background: rgb(31 41 55);
  color: rgb(209 213 219);
}

.quality-control :deep(.el-select),
.quality-control :deep(.el-date-editor) {
  width: 100%;
}

.quality-metric,
.quality-panel {
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
}

.quality-metric {
  padding: 18px;
}

.quality-panel {
  padding: 16px;
}

.dark .quality-metric,
.dark .quality-panel {
  border-color: rgba(75, 85, 99, 0.6);
  background: rgba(31, 41, 55, 0.92);
}

.metric-label {
  font-size: 13px;
  font-weight: 700;
  color: rgb(100 116 139);
}

.metric-value {
  margin-top: 8px;
  font-size: 26px;
  font-weight: 850;
  color: rgb(15 23 42);
}

.dark .metric-value {
  color: rgb(241 245 249);
}

.metric-sub {
  margin-top: 6px;
  font-size: 12px;
  color: rgb(100 116 139);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.panel-header h4 {
  font-size: 14px;
  font-weight: 800;
  color: rgb(17 24 39);
}

.dark .panel-header h4 {
  color: rgb(243 244 246);
}

.panel-link {
  font-size: 12px;
  font-weight: 700;
  color: rgb(8 145 178);
}

.distribution-row {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 10px;
  background: rgb(248 250 252);
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 700;
  color: rgb(55 65 81);
}

.dark .distribution-row {
  background: rgba(17, 24, 39, 0.6);
  color: rgb(209 213 219);
}

.latency-row {
  font-size: 13px;
  color: rgb(75 85 99);
}

.quality-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.quality-table th,
.quality-table td {
  border-bottom: 1px solid rgb(229 231 235);
  padding: 10px 8px;
  text-align: left;
  white-space: nowrap;
}

.dark .quality-table th,
.dark .quality-table td {
  border-color: rgb(55 65 81);
}

.quality-table th {
  font-size: 11px;
  font-weight: 800;
  color: rgb(100 116 139);
}

.empty-note {
  padding: 18px 0;
  text-align: center;
  font-size: 13px;
  color: rgb(100 116 139);
}
</style>
