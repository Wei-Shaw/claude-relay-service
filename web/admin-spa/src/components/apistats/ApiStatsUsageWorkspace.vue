<template>
  <div class="usage-shell">
    <header class="usage-heading">
      <div>
        <p class="usage-eyebrow">工作区 / 用量</p>
        <h1>用量，一目了然。</h1>
        <p class="usage-subtitle">查看消费趋势、额度状态，以及每一笔请求如何计费。</p>
      </div>
      <div aria-label="统计周期" class="period-switcher">
        <button
          v-for="period in periodOptions"
          :key="period.value"
          :class="{ active: selectedPeriod === period.value }"
          type="button"
          @click="changePeriod(period.value)"
        >
          {{ period.label }}
        </button>
      </div>
    </header>

    <div v-if="loading" class="usage-loading">
      <span class="loading-spinner" />
      <span>正在汇总用量...</span>
    </div>

    <div v-else-if="loadError" class="usage-error" role="alert">
      <div>
        <strong>用量数据加载失败</strong>
        <p>{{ loadError }}</p>
      </div>
      <button type="button" @click="loadUsage">重试</button>
    </div>

    <template v-else>
      <div v-if="usageStats?.isPartial" class="partial-notice">
        当前周期内的请求记录超过保留上限，统计结果可能只包含最近一部分请求。
      </div>

      <section class="overview-grid">
        <article class="hero-card">
          <div class="hero-card-head">
            <span>{{ currentPeriodLabel }} · {{ formattedRange }}</span>
            <span>{{ lastUpdatedText }}</span>
          </div>
          <div class="hero-cost">
            <strong>{{ formatHeroMoney(usageStats?.totalCost) }}</strong>
            <span>本周期消费</span>
          </div>
          <template v-if="budgetSummary.hasLimit">
            <div class="budget-label">
              <span>{{ budgetSummary.label }} {{ formatMoney(budgetSummary.used) }}</span>
              <span>额度 {{ formatMoney(budgetSummary.limit) }}</span>
            </div>
            <div class="budget-track">
              <i :style="{ width: `${budgetSummary.percent}%` }" />
            </div>
          </template>
          <p v-else class="unlimited-note">当前可用密钥未设置累计费用额度</p>
          <div class="hero-metrics">
            <div>
              <b>{{ formatInteger(usageStats?.totalRequests) }}</b
              ><span>请求</span>
            </div>
            <div>
              <b>{{ formatCompact(usageStats?.totalTokens) }}</b
              ><span>Token</span>
            </div>
            <div><b>1</b><span>可用密钥</span></div>
          </div>
        </article>

        <article class="pulse-card surface-card">
          <h2>使用状态</h2>
          <dl>
            <div>
              <dt>最近请求</dt>
              <dd>
                {{
                  usageStats?.lastRequestAt ? formatRelativeTime(usageStats.lastRequestAt) : '暂无'
                }}
              </dd>
            </div>
            <div>
              <dt>平均请求费用</dt>
              <dd class="mono">{{ formatRequestCost(usageStats?.averageRequestCost) }}</dd>
            </div>
            <div>
              <dt>成功请求</dt>
              <dd class="mono">{{ formatInteger(usageStats?.completedRequests) }}</dd>
            </div>
            <div>
              <dt>Key 状态</dt>
              <dd class="key-health"><i />可用</dd>
            </div>
          </dl>
        </article>
      </section>

      <section class="metric-grid">
        <article class="metric-card surface-card">
          <span>请求数</span>
          <strong>{{ formatInteger(usageStats?.totalRequests) }}</strong>
          <small>失败 {{ formatInteger(usageStats?.failedRequests) }} 次</small>
        </article>
        <article class="metric-card surface-card">
          <span>输入 Token</span>
          <strong>{{ formatCompact(usageStats?.totalInputTokens) }}</strong>
          <small>缓存 {{ formatCompact(usageStats?.totalCacheTokens) }}</small>
        </article>
        <article class="metric-card surface-card">
          <span>输出 Token</span>
          <strong>{{ formatCompact(usageStats?.totalOutputTokens) }}</strong>
          <small>合计 {{ formatCompact(usageStats?.totalTokens) }}</small>
        </article>
      </section>

      <section class="usage-section">
        <div class="section-heading">
          <h2>消费趋势</h2>
          <p>每日请求费用</p>
        </div>
        <article class="trend-card surface-card">
          <div
            v-if="hasTrendData"
            ref="trendChart"
            class="trend-chart"
            @mouseleave="hoveredTrendIndex = null"
            @mousemove="handleTrendMove"
          >
            <div class="trend-y-label trend-y-label-top">{{ formatRequestCost(maxTrendCost) }}</div>
            <div class="trend-y-label trend-y-label-bottom">$0</div>
            <svg
              aria-label="消费趋势图"
              preserveAspectRatio="none"
              role="img"
              viewBox="0 0 960 220"
            >
              <line
                v-for="row in 4"
                :key="row"
                class="chart-grid-line"
                x1="0"
                x2="960"
                :y1="row * 44"
                :y2="row * 44"
              />
              <path class="chart-area" :d="trendAreaPath" />
              <path class="chart-line" :d="trendLinePath" />
              <line
                v-if="hoveredTrendPoint"
                class="chart-hover-line"
                :x1="hoveredTrendPoint.x"
                :x2="hoveredTrendPoint.x"
                y1="0"
                y2="220"
              />
              <circle
                v-if="hoveredTrendPoint"
                class="chart-point"
                :cx="hoveredTrendPoint.x"
                :cy="hoveredTrendPoint.y"
                r="5"
              />
            </svg>
            <div
              v-if="hoveredTrendPoint"
              class="trend-tooltip"
              :style="{
                left: `${hoveredTrendPoint.leftPercent}%`,
                top: `${hoveredTrendPoint.topPercent}%`
              }"
            >
              <span>{{ formatChartDate(hoveredTrendPoint.item.date) }}</span>
              <b>{{ formatRequestCost(hoveredTrendPoint.item.cost) }}</b>
              <small>{{ formatInteger(hoveredTrendPoint.item.requests) }} 次请求</small>
            </div>
            <div class="trend-axis">
              <span
                v-for="label in trendAxisLabels"
                :key="label.date"
                :style="{ left: `${label.leftPercent}%` }"
              >
                {{ formatChartDate(label.date) }}
              </span>
            </div>
          </div>
          <div v-else class="empty-panel">所选周期内暂无消费数据</div>
        </article>
      </section>

      <section class="usage-section">
        <div class="section-heading">
          <h2>当前 API 密钥</h2>
          <p>仅展示本次查询的 Key</p>
        </div>
        <div v-if="usageStats?.keyStats?.length" class="key-list">
          <article v-for="key in usageStats.keyStats" :key="key.name" class="key-row surface-card">
            <div class="key-identity">
              <strong>{{ key.name }}</strong>
              <span>{{ keyStatusText(key) }}</span>
            </div>
            <div class="key-limit">
              <div class="key-limit-label">
                <span>{{ keyLimitLabel(key) }}</span>
                <b>{{ keyLimitValue(key) }}</b>
              </div>
              <div class="key-limit-track" :class="{ unlimited: !getKeyLimit(key).limit }">
                <i :style="{ width: `${getKeyLimit(key).percent}%` }" />
              </div>
            </div>
            <div class="key-period-usage">
              <b>{{ formatMoney(key.periodCost) }}</b>
              <span>{{ currentPeriodLabel }} · {{ formatInteger(key.requests) }} 次请求</span>
            </div>
            <div class="key-state" :class="keyStateClass(key)">
              <i />
              <span>{{ keyStateLabel(key) }}</span>
            </div>
          </article>
        </div>
        <div v-else class="empty-panel surface-card">还没有 API 密钥</div>
      </section>

      <section v-if="usageStats?.modelStats?.length" class="usage-section">
        <div class="section-heading">
          <h2>模型费用构成</h2>
          <p>按本周期消费排序</p>
        </div>
        <article class="model-card surface-card">
          <div
            v-for="model in usageStats.modelStats.slice(0, 6)"
            :key="model.name"
            class="model-row"
          >
            <span class="model-name">{{ model.name }}</span>
            <div class="model-track">
              <i :style="{ width: `${modelCostPercent(model.cost)}%` }" />
            </div>
            <b>{{ formatRequestCost(model.cost) }}</b>
            <small>{{ modelCostPercent(model.cost).toFixed(0) }}%</small>
          </div>
        </article>
      </section>

      <section class="usage-section request-section">
        <div class="section-heading">
          <div>
            <h2>API 请求明细</h2>
            <p>仅展示你的用量和计费数据</p>
          </div>
          <p>记录最多保留 {{ requestData?.recordRetentionDays || 90 }} 天</p>
        </div>

        <div class="request-toolbar">
          <select v-model="requestFilters.model" @change="applyRequestFilters">
            <option value="">全部模型</option>
            <option
              v-for="model in requestData?.availableFilters?.models || []"
              :key="model"
              :value="model"
            >
              {{ model }}
            </option>
          </select>
          <select v-model="requestFilters.outcome" @change="applyRequestFilters">
            <option value="">全部状态</option>
            <option value="completed">请求成功</option>
            <option value="failed">请求失败</option>
            <option value="unavailable">用量未确认</option>
            <option value="pending">处理中</option>
          </select>
          <span>{{ requestCountText }}</span>
        </div>

        <article class="request-table surface-card">
          <div class="request-table-head">
            <span>时间</span><span>模型</span><span>Token</span><span>缓存</span><span>状态</span
            ><span>费用</span><span />
          </div>

          <div v-if="requestLoading" class="empty-panel">正在加载请求明细...</div>
          <div v-else-if="!displayRequestRecords.length" class="empty-panel">
            所选条件下暂无请求记录
          </div>
          <article
            v-for="record in displayRequestRecords"
            v-else
            :key="record._rowKey"
            class="request-item"
            :class="{ open: expandedRequests.has(record._rowKey) }"
          >
            <button class="request-row" type="button" @click="toggleRequest(record._rowKey)">
              <span class="request-time mono"
                >{{ formatTime(record.timestamp)
                }}<small>{{ formatShortDate(record.timestamp) }}</small></span
              >
              <span class="request-model mono">{{ record.model }}</span>
              <span class="request-token mono"
                >{{ formatCompact(record.tokens.input + record.tokens.output)
                }}<small>输入 + 输出</small></span
              >
              <span class="request-token request-cache mono"
                >{{ formatCompact(record.tokens.cacheCreate + record.tokens.cacheRead)
                }}<small>缓存</small></span
              >
              <span class="request-outcome" :class="record.outcome"
                ><i />{{ record.outcomeLabel }}</span
              >
              <span class="request-cost mono">{{ formatRequestCost(record.cost) }}</span>
              <span class="request-chevron">⌄</span>
            </button>
            <div v-if="expandedRequests.has(record._rowKey)" class="billing-detail">
              <div class="billing-formula">
                <h3>本次请求如何计费</h3>
                <div v-for="item in record.billing.items" :key="item.type" class="billing-line">
                  <span>
                    {{ item.label }}
                    <template v-if="item.tokens > 0 && item.ratePerMillion > 0">
                      · {{ formatInteger(item.tokens) }} × {{ formatRate(item.ratePerMillion) }} /
                      1M
                    </template>
                  </span>
                  <b>{{ formatRequestCost(item.cost) }}</b>
                </div>
                <div v-if="!record.billing.items.length" class="billing-line">
                  <span>无可计费的模型用量</span><b>$0.0000</b>
                </div>
                <div class="billing-line total">
                  <span>最终费用</span><b>{{ formatRequestCost(record.billing.total) }}</b>
                </div>
              </div>
              <div class="billing-explanation">
                <strong :class="record.outcome">{{ record.outcomeLabel }}</strong>
                <p>当前 API Key：{{ record.apiKeyName }}</p>
                <p v-if="record.outcome === 'failed' && record.cost === 0">
                  请求未产生可计费的模型用量，因此费用为零。
                </p>
                <p v-else-if="record.outcome === 'unavailable'">
                  本次请求没有可确认的结算用量，当前仅展示已记录的费用。
                </p>
                <p v-else>按照请求发生时的模型费率计算；缓存写入和缓存读取使用各自的费率。</p>
                <p>明细金额为展示精度，最终费用按完整精度结算。</p>
              </div>
            </div>
          </article>
        </article>

        <div v-if="requestData?.pagination?.totalPages > 1" class="pagination">
          <button
            :disabled="!requestData.pagination.hasPreviousPage || requestLoading"
            @click="changeRequestPage(requestData.pagination.currentPage - 1)"
          >
            上一页
          </button>
          <span
            >{{ requestData.pagination.currentPage }} /
            {{ requestData.pagination.totalPages }}</span
          >
          <button
            :disabled="!requestData.pagination.hasNextPage || requestLoading"
            @click="changeRequestPage(requestData.pagination.currentPage + 1)"
          >
            下一页
          </button>
        </div>

        <p class="privacy-note">
          <span>i</span>
          请求明细不会展示上游账户、路由决策、内部节点、供应商凭据、代理信息或其他基础设施元数据。
        </p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { getApiStatsUsageWorkspaceApi } from '@/utils/http_apis'
import { formatRelativeTime, showToast } from '@/utils/tools'

const props = defineProps({
  apiKey: { type: String, required: true }
})
const periodOptions = [
  { value: 'day', label: '24h', name: '最近 24 小时' },
  { value: 'week', label: '7d', name: '最近 7 天' },
  { value: 'month', label: '30d', name: '最近 30 天' },
  { value: 'quarter', label: '90d', name: '最近 90 天' }
]

const selectedPeriod = ref('week')
const usageStats = ref(null)
const requestData = ref(null)
const loading = ref(true)
const requestLoading = ref(false)
const loadError = ref('')
const lastUpdatedAt = ref(null)
const trendChart = ref(null)
const hoveredTrendIndex = ref(null)
const expandedRequests = ref(new Set())
const requestFilters = reactive({ model: '', outcome: '', page: 1 })

const currentPeriodLabel = computed(
  () => periodOptions.find((period) => period.value === selectedPeriod.value)?.name || '最近 7 天'
)

const formattedRange = computed(() => {
  if (!usageStats.value?.range) return ''
  return `${formatShortDate(usageStats.value.range.start)} — ${formatShortDate(usageStats.value.range.end)}`
})

const lastUpdatedText = computed(() =>
  lastUpdatedAt.value ? `${formatRelativeTime(lastUpdatedAt.value)}更新` : ''
)

const budgetSummary = computed(() => {
  const key = usageStats.value?.keyStats?.[0] || {}
  const dailyLimit = Number(key.dailyCostLimit || 0)
  const useDailyLimit = dailyLimit > 0
  const used = useDailyLimit ? Number(key.dailyCost || 0) : Number(key.totalCost || 0)
  const limit = useDailyLimit ? dailyLimit : Number(key.totalCostLimit || 0)
  return {
    hasLimit: limit > 0,
    label: useDailyLimit ? '当前 Key 今日已用' : '当前 Key 累计已用',
    used,
    limit,
    percent: limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  }
})

const trendItems = computed(() => usageStats.value?.dailyStats || [])
const hasTrendData = computed(() => trendItems.value.some((item) => Number(item.cost) > 0))
const maxTrendCost = computed(() =>
  Math.max(...trendItems.value.map((item) => Number(item.cost) || 0), 0)
)
const trendPoints = computed(() => {
  const items = trendItems.value
  if (!items.length) return []
  const maximum = maxTrendCost.value || 1
  return items.map((item, index) => ({
    item,
    x: items.length === 1 ? 480 : (index / (items.length - 1)) * 960,
    y: 202 - (Number(item.cost || 0) / maximum) * 174
  }))
})
const trendLinePath = computed(() =>
  trendPoints.value.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
)
const trendAreaPath = computed(() => {
  if (!trendPoints.value.length) return ''
  return `${trendLinePath.value} L 960 220 L 0 220 Z`
})
const trendAxisLabels = computed(() => {
  const points = trendPoints.value
  if (!points.length) return []
  const step = Math.max(1, Math.ceil((points.length - 1) / 6))
  return points
    .filter((_, index) => index === 0 || index === points.length - 1 || index % step === 0)
    .map((point) => ({ date: point.item.date, leftPercent: (point.x / 960) * 100 }))
})
const hoveredTrendPoint = computed(() => {
  const point = trendPoints.value[hoveredTrendIndex.value]
  if (!point) return null
  return {
    ...point,
    leftPercent: Math.min(88, Math.max(8, (point.x / 960) * 100)),
    topPercent: Math.min(72, Math.max(4, (point.y / 220) * 100 - 8))
  }
})

const displayRequestRecords = computed(() =>
  (requestData.value?.records || []).map((record, index) => ({
    ...record,
    _rowKey: `${record.timestamp}-${record.model}-${index}`
  }))
)
const requestCountText = computed(() => {
  const pagination = requestData.value?.pagination
  if (!pagination) return ''
  return `共 ${formatInteger(pagination.totalRecords)} 条`
})

const loadRequestRecords = async () => {
  requestLoading.value = true
  try {
    const result = await getApiStatsUsageWorkspaceApi({
      apiKey: props.apiKey,
      period: selectedPeriod.value,
      model: requestFilters.model || undefined,
      outcome: requestFilters.outcome || undefined,
      page: requestFilters.page,
      pageSize: 20
    })
    if (!result.success) throw new Error(result.message || '加载用量数据失败')
    requestData.value = result.data
    expandedRequests.value = new Set()
  } finally {
    requestLoading.value = false
  }
}

const loadUsage = async () => {
  loading.value = true
  loadError.value = ''
  try {
    await loadRequestRecords()
    usageStats.value = requestData.value
    lastUpdatedAt.value = new Date().toISOString()
  } catch (error) {
    loadError.value = error?.message || '请检查 API Key 后重试'
  } finally {
    loading.value = false
  }
}

const changePeriod = async (period) => {
  if (selectedPeriod.value === period || loading.value) return
  selectedPeriod.value = period
  requestFilters.page = 1
  await loadUsage()
}

const applyRequestFilters = async () => {
  requestFilters.page = 1
  try {
    await loadRequestRecords()
  } catch (error) {
    showToast(error?.message || '筛选请求明细失败', 'error')
  }
}

const changeRequestPage = async (page) => {
  requestFilters.page = page
  try {
    await loadRequestRecords()
  } catch (error) {
    showToast(error?.message || '切换请求明细分页失败', 'error')
  }
}

const toggleRequest = (rowKey) => {
  const next = new Set(expandedRequests.value)
  if (next.has(rowKey)) next.delete(rowKey)
  else next.add(rowKey)
  expandedRequests.value = next
}

const handleTrendMove = (event) => {
  if (!trendChart.value || !trendPoints.value.length) return
  const bounds = trendChart.value.getBoundingClientRect()
  const x = Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width)
  const ratio = bounds.width > 0 ? x / bounds.width : 0
  hoveredTrendIndex.value = Math.round(ratio * (trendPoints.value.length - 1))
}

const getKeyLimit = (key) => {
  const dailyLimit = Number(key.dailyCostLimit || 0)
  const totalLimit = Number(key.totalCostLimit || 0)
  const type = dailyLimit > 0 ? 'daily' : totalLimit > 0 ? 'total' : 'none'
  const used = type === 'daily' ? Number(key.dailyCost || 0) : Number(key.totalCost || 0)
  const limit = type === 'daily' ? dailyLimit : totalLimit
  return { type, used, limit, percent: limit > 0 ? Math.min(100, (used / limit) * 100) : 0 }
}
const keyLimitLabel = (key) => {
  const limit = getKeyLimit(key)
  if (limit.type === 'daily') return `今日已用 ${formatMoney(limit.used)}`
  if (limit.type === 'total') return `累计已用 ${formatMoney(limit.used)}`
  return '未设置费用额度'
}
const keyLimitValue = (key) => {
  const limit = getKeyLimit(key)
  return limit.limit > 0 ? formatMoney(limit.limit) : '不限额'
}
const keyStateLabel = (key) => {
  if (key.isDeleted) return '已归档'
  if (!key.isActive) return '已停用'
  if (!key.lastUsedAt) return '未使用'
  return '可用'
}
const keyStateClass = (key) => {
  if (key.isDeleted || !key.isActive) return 'muted'
  if (!key.lastUsedAt) return 'idle'
  return 'active'
}
const keyStatusText = (key) => {
  if (key.expiresAt) return `过期时间 ${formatShortDate(key.expiresAt)}`
  if (key.lastUsedAt) return `最近使用 ${formatRelativeTime(key.lastUsedAt)}`
  return '从未使用'
}

const modelCostPercent = (cost) => {
  const total = Number(usageStats.value?.totalCost || 0)
  return total > 0 ? Math.min(100, (Number(cost || 0) / total) * 100) : 0
}

const formatInteger = (value) => Math.max(0, Number(value) || 0).toLocaleString('zh-CN')
const formatCompact = (value) =>
  new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(
    Math.max(0, Number(value) || 0)
  )
const formatMoney = (value) =>
  `$${Math.max(0, Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const formatHeroMoney = (value) => {
  const cost = Math.max(0, Number(value) || 0)
  return `$${cost.toLocaleString('en-US', {
    minimumFractionDigits: cost > 0 && cost < 0.01 ? 4 : 2,
    maximumFractionDigits: cost > 0 && cost < 0.01 ? 6 : 2
  })}`
}
const formatRequestCost = (value) => {
  const cost = Math.max(0, Number(value) || 0)
  if (cost === 0) return '$0.0000'
  if (cost < 0.0001) return '< $0.0001'
  return `$${cost.toFixed(cost < 0.01 ? 6 : 4)}`
}
const formatRate = (value) => `$${Number(value || 0).toFixed(Number(value || 0) < 0.01 ? 4 : 2)}`
const formatShortDate = (value) =>
  value ? new Date(value).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : ''
const formatChartDate = (value) => {
  const [, month, day] = String(value || '').split('-')
  return month && day ? `${Number(month)}月${Number(day)}日` : ''
}
const formatTime = (value) =>
  value ? new Date(value).toLocaleTimeString('zh-CN', { hour12: false }) : '--:--:--'

watch(
  () => props.apiKey,
  () => {
    requestFilters.model = ''
    requestFilters.outcome = ''
    requestFilters.page = 1
    loadUsage()
  },
  { immediate: true }
)
</script>

<style scoped>
.usage-shell {
  --usage-bg: #f1f0eb;
  --usage-card: #fafaf7;
  --usage-ink: #18201d;
  --usage-muted: #727a74;
  --usage-line: #d8dad3;
  --usage-forest: #1d3b33;
  --usage-green: #55a782;
  --usage-soft-green: #a9d7c4;
  --usage-red: #b8655f;
  color: var(--usage-ink);
  width: 100%;
  padding: 2.75rem 0 5rem;
  font-family: 'Avenir Next', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

:global(.dark) .usage-shell {
  --usage-bg: #171b19;
  --usage-card: #202623;
  --usage-ink: #eef2ed;
  --usage-muted: #9ca69f;
  --usage-line: #343c37;
  --usage-forest: #193b32;
  --usage-green: #6fc29d;
  --usage-soft-green: #9ad1ba;
}

.usage-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 2rem;
  margin-bottom: 2rem;
}
.usage-eyebrow {
  margin: 0 0 0.7rem;
  color: var(--usage-muted);
  font:
    500 0.65rem ui-monospace,
    monospace;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}
.usage-heading h1 {
  margin: 0;
  font-size: clamp(2.35rem, 5vw, 3.75rem);
  line-height: 1;
  letter-spacing: -0.07em;
  font-weight: 700;
}
.usage-subtitle {
  margin: 0.8rem 0 0;
  color: var(--usage-muted);
  font-size: 0.86rem;
}
.period-switcher {
  display: flex;
  gap: 0.15rem;
  padding: 0.25rem;
  border: 1px solid var(--usage-line);
  border-radius: 0.55rem;
  background: color-mix(in srgb, var(--usage-card) 42%, transparent);
}
.period-switcher button {
  min-width: 3rem;
  border: 0;
  border-radius: 0.35rem;
  padding: 0.48rem 0.65rem;
  color: var(--usage-muted);
  background: transparent;
  font-size: 0.72rem;
  cursor: pointer;
}
.period-switcher button.active {
  color: var(--usage-ink);
  background: var(--usage-card);
  box-shadow: 0 1px 3px rgba(23, 31, 27, 0.08);
  font-weight: 700;
}

.surface-card {
  border: 1px solid var(--usage-line);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--usage-card) 92%, transparent);
}
.usage-loading,
.empty-panel {
  min-height: 13rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  color: var(--usage-muted);
  font-size: 0.82rem;
}
.loading-spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--usage-line);
  border-top-color: var(--usage-green);
  border-radius: 50%;
  animation: usage-spin 0.8s linear infinite;
}
.partial-notice {
  margin-bottom: 1rem;
  border: 1px solid #dec69e;
  background: #fff5df;
  color: #805a20;
  padding: 0.7rem 0.85rem;
  font-size: 0.75rem;
  border-radius: 0.5rem;
}
.usage-error {
  min-height: 11rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  border: 1px solid color-mix(in srgb, var(--usage-red) 48%, var(--usage-line));
  border-radius: 0.75rem;
  padding: 1.5rem;
  background: color-mix(in srgb, var(--usage-card) 94%, var(--usage-red) 6%);
}
.usage-error strong {
  font-size: 0.9rem;
}
.usage-error p {
  margin: 0.35rem 0 0;
  color: var(--usage-muted);
  font-size: 0.72rem;
}
.usage-error button {
  flex: 0 0 auto;
  border: 1px solid var(--usage-forest);
  border-radius: 0.4rem;
  padding: 0.5rem 0.8rem;
  color: #f2f5f1;
  background: var(--usage-forest);
  font-size: 0.7rem;
  cursor: pointer;
}
:global(.dark) .partial-notice {
  border-color: #66512f;
  background: #30281b;
  color: #e1bd7c;
}

.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(17rem, 0.85fr);
  gap: 1rem;
}
.hero-card {
  min-height: 15.5rem;
  position: relative;
  overflow: hidden;
  padding: 1.65rem 1.85rem;
  border-radius: 0.75rem;
  color: #f2f5f1;
  background: var(--usage-forest);
}
.hero-card::after {
  content: '';
  position: absolute;
  width: 16rem;
  height: 16rem;
  right: -5rem;
  bottom: -9rem;
  border: 1px solid rgba(169, 215, 196, 0.25);
  border-radius: 50%;
  box-shadow:
    0 0 0 1.8rem rgba(169, 215, 196, 0.03),
    0 0 0 3.6rem rgba(169, 215, 196, 0.02);
}
.hero-card-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  color: #9db9ae;
  font-size: 0.67rem;
}
.hero-cost {
  display: flex;
  align-items: flex-end;
  gap: 0.6rem;
  margin: 2.1rem 0 1.6rem;
}
.hero-cost strong {
  font-size: clamp(3rem, 6vw, 4.2rem);
  line-height: 0.85;
  letter-spacing: -0.08em;
  font-weight: 500;
}
.hero-cost span {
  color: #a9beb5;
  font-size: 0.72rem;
}
.budget-label {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  color: #b7c9c1;
  font-size: 0.67rem;
  margin-bottom: 0.45rem;
}
.budget-track,
.key-limit-track {
  height: 0.35rem;
  overflow: hidden;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.13);
}
.budget-track i,
.key-limit-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--usage-soft-green);
}
.unlimited-note {
  margin: 0;
  color: #a9beb5;
  font-size: 0.7rem;
}
.hero-metrics {
  display: flex;
  gap: 2rem;
  margin-top: 1.5rem;
  color: #a9beb5;
  font-size: 0.68rem;
}
.hero-metrics b {
  display: block;
  margin-bottom: 0.2rem;
  color: #f2f5f1;
  font:
    500 0.9rem ui-monospace,
    monospace;
}
.hero-metrics span {
  display: block;
}
.pulse-card {
  padding: 1.55rem;
}
.pulse-card h2,
.section-heading h2 {
  margin: 0;
  font-size: 0.95rem;
  letter-spacing: -0.025em;
  font-weight: 700;
}
.pulse-card dl {
  margin: 1.35rem 0 0;
}
.pulse-card dl div {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0.8rem 0;
  border-bottom: 1px solid var(--usage-line);
}
.pulse-card dl div:last-child {
  border-bottom: 0;
}
.pulse-card dt {
  color: var(--usage-muted);
  font-size: 0.72rem;
}
.pulse-card dd {
  margin: 0;
  font-size: 0.75rem;
}
.key-health {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--usage-green);
}
.key-health i {
  width: 0.36rem;
  height: 0.36rem;
  border-radius: 50%;
  background: currentColor;
}
.mono {
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-top: 1rem;
}
.metric-card {
  padding: 1.25rem 1.35rem;
}
.metric-card > span {
  color: var(--usage-muted);
  font:
    500 0.62rem ui-monospace,
    monospace;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.metric-card strong {
  display: block;
  margin-top: 0.7rem;
  font:
    500 1.55rem ui-monospace,
    monospace;
  letter-spacing: -0.05em;
}
.metric-card small {
  display: block;
  margin-top: 0.35rem;
  color: var(--usage-muted);
  font-size: 0.68rem;
}

.usage-section {
  margin-top: 2.5rem;
}
.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.8rem;
}
.section-heading > div p {
  margin-top: 0.35rem;
}
.section-heading p {
  margin: 0;
  color: var(--usage-muted);
  font-size: 0.68rem;
}
.trend-card {
  padding: 1.35rem 1.5rem 1rem;
}
.trend-chart {
  height: 16rem;
  position: relative;
  padding: 0 0 1.8rem 2.2rem;
}
.trend-chart svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.chart-grid-line {
  stroke: var(--usage-line);
  stroke-width: 1;
  stroke-dasharray: 3 4;
  vector-effect: non-scaling-stroke;
}
.chart-area {
  fill: color-mix(in srgb, var(--usage-green) 18%, transparent);
}
.chart-line {
  fill: none;
  stroke: var(--usage-green);
  stroke-width: 2.5;
  vector-effect: non-scaling-stroke;
}
.chart-hover-line {
  stroke: color-mix(in srgb, var(--usage-green) 55%, transparent);
  stroke-dasharray: 3 3;
  vector-effect: non-scaling-stroke;
}
.chart-point {
  fill: var(--usage-card);
  stroke: var(--usage-green);
  stroke-width: 3;
  vector-effect: non-scaling-stroke;
}
.trend-y-label {
  position: absolute;
  left: 0;
  color: var(--usage-muted);
  font:
    0.58rem ui-monospace,
    monospace;
}
.trend-y-label-top {
  top: 0;
}
.trend-y-label-bottom {
  bottom: 1.9rem;
}
.trend-axis {
  position: absolute;
  left: 2.2rem;
  right: 0;
  bottom: 0.25rem;
  height: 1rem;
}
.trend-axis span {
  position: absolute;
  transform: translateX(-50%);
  white-space: nowrap;
  color: var(--usage-muted);
  font:
    0.58rem ui-monospace,
    monospace;
}
.trend-tooltip {
  position: absolute;
  z-index: 2;
  min-width: 8.2rem;
  transform: translate(-50%, -100%);
  border: 1px solid var(--usage-line);
  border-radius: 0.45rem;
  padding: 0.55rem 0.65rem;
  background: var(--usage-card);
  box-shadow: 0 0.5rem 1.5rem rgba(21, 34, 28, 0.09);
  pointer-events: none;
}
.trend-tooltip span,
.trend-tooltip small {
  display: block;
  color: var(--usage-muted);
  font-size: 0.62rem;
}
.trend-tooltip b {
  display: block;
  margin: 0.2rem 0;
  font:
    500 0.75rem ui-monospace,
    monospace;
}

.key-list {
  display: grid;
  gap: 0.5rem;
}
.key-row {
  display: grid;
  grid-template-columns: minmax(10rem, 1.1fr) minmax(13rem, 1fr) minmax(9rem, 0.7fr) 5rem;
  align-items: center;
  gap: 1.3rem;
  padding: 1rem 1.15rem;
}
.key-identity strong {
  display: block;
  font-size: 0.8rem;
}
.key-identity span,
.key-period-usage span {
  display: block;
  margin-top: 0.3rem;
  color: var(--usage-muted);
  font-size: 0.65rem;
}
.key-limit-label {
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  margin-bottom: 0.45rem;
  font:
    0.64rem ui-monospace,
    monospace;
}
.key-limit-label b {
  color: var(--usage-muted);
  font-weight: 400;
}
.key-limit-track {
  background: var(--usage-line);
}
.key-limit-track i {
  background: var(--usage-green);
}
.key-limit-track.unlimited i {
  width: 0 !important;
}
.key-period-usage b {
  font:
    500 0.75rem ui-monospace,
    monospace;
}
.key-state {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.66rem;
  color: var(--usage-green);
}
.key-state i,
.request-outcome i {
  width: 0.36rem;
  height: 0.36rem;
  border-radius: 50%;
  background: currentColor;
}
.key-state.muted {
  color: var(--usage-muted);
}
.key-state.idle {
  color: #9b8b5b;
}

.model-card {
  padding: 1rem 1.2rem;
}
.model-row {
  display: grid;
  grid-template-columns: minmax(10rem, 0.9fr) minmax(12rem, 1.8fr) 6rem 2.5rem;
  align-items: center;
  gap: 1rem;
  padding: 0.65rem 0;
}
.model-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font:
    0.68rem ui-monospace,
    monospace;
}
.model-track {
  height: 0.35rem;
  overflow: hidden;
  border-radius: 99px;
  background: var(--usage-line);
}
.model-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--usage-green);
}
.model-row b {
  text-align: right;
  font:
    500 0.67rem ui-monospace,
    monospace;
}
.model-row small {
  color: var(--usage-muted);
  font:
    0.62rem ui-monospace,
    monospace;
}

.request-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.7rem;
}
.request-toolbar select {
  min-width: 8.5rem;
  border: 1px solid var(--usage-line);
  border-radius: 0.42rem;
  padding: 0.5rem 2rem 0.5rem 0.65rem;
  color: var(--usage-ink);
  background: var(--usage-card);
  font-size: 0.68rem;
}
.request-toolbar > span {
  margin-left: auto;
  color: var(--usage-muted);
  font-size: 0.66rem;
}
.request-table {
  overflow: hidden;
}
.request-table-head,
.request-row {
  display: grid;
  grid-template-columns: 7.5rem minmax(9rem, 1.3fr) 6.7rem 5.5rem 5.4rem 5.2rem 1rem;
  gap: 0.8rem;
  align-items: center;
}
.request-table-head {
  padding: 0.65rem 1rem;
  border-bottom: 1px solid var(--usage-line);
  color: var(--usage-muted);
  font:
    0.58rem ui-monospace,
    monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.request-item {
  border-bottom: 1px solid var(--usage-line);
}
.request-item:last-child {
  border-bottom: 0;
}
.request-row {
  width: 100%;
  border: 0;
  padding: 0.9rem 1rem;
  color: var(--usage-ink);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.request-row:hover,
.request-item.open .request-row {
  background: color-mix(in srgb, var(--usage-card) 62%, var(--usage-green) 3%);
}
.request-row small {
  display: block;
  margin-top: 0.25rem;
  color: var(--usage-muted);
  font:
    0.58rem 'Avenir Next',
    sans-serif;
}
.request-time,
.request-model,
.request-key,
.request-token,
.request-cost {
  min-width: 0;
  font-size: 0.65rem;
}
.request-model,
.request-key {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.request-outcome {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--usage-green);
  font-size: 0.62rem;
}
.request-outcome.failed,
.billing-explanation strong.failed {
  color: var(--usage-red);
}
.request-outcome.pending {
  color: #9b8b5b;
}
.request-outcome.unavailable,
.billing-explanation strong.unavailable {
  color: #9b8b5b;
}
.request-cost {
  text-align: right;
  font-weight: 600;
}
.request-chevron {
  color: var(--usage-muted);
  transition: transform 0.2s ease;
}
.request-item.open .request-chevron {
  transform: rotate(180deg);
}
.billing-detail {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(13rem, 0.85fr);
  gap: 1.3rem;
  padding: 0 1rem 1rem 8.3rem;
  background: color-mix(in srgb, var(--usage-card) 72%, transparent);
}
.billing-formula {
  border: 1px solid var(--usage-line);
  padding: 0.85rem;
  background: color-mix(in srgb, var(--usage-card) 82%, transparent);
}
.billing-formula h3 {
  margin: 0 0 0.65rem;
  font-size: 0.7rem;
}
.billing-line {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--usage-line);
  font:
    0.62rem ui-monospace,
    monospace;
}
.billing-line span {
  color: var(--usage-muted);
}
.billing-line b {
  font-weight: 500;
}
.billing-line.total {
  border-bottom: 0;
  color: var(--usage-green);
}
.billing-explanation {
  color: var(--usage-muted);
  font-size: 0.65rem;
  line-height: 1.65;
}
.billing-explanation strong {
  color: var(--usage-green);
  font-size: 0.72rem;
}
.billing-explanation p {
  margin: 0.45rem 0 0;
}
.privacy-note {
  display: flex;
  gap: 0.55rem;
  align-items: flex-start;
  margin: 0.75rem 0 0;
  color: var(--usage-muted);
  font-size: 0.62rem;
  line-height: 1.55;
}
.privacy-note span {
  width: 1rem;
  height: 1rem;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid currentColor;
  border-radius: 50%;
  font:
    0.55rem ui-monospace,
    monospace;
}
.pagination {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.7rem;
  margin-top: 0.75rem;
}
.pagination button {
  border: 1px solid var(--usage-line);
  border-radius: 0.35rem;
  padding: 0.4rem 0.65rem;
  color: var(--usage-ink);
  background: var(--usage-card);
  font-size: 0.66rem;
}
.pagination button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.pagination span {
  color: var(--usage-muted);
  font:
    0.62rem ui-monospace,
    monospace;
}

@keyframes usage-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .overview-grid {
    grid-template-columns: 1fr;
  }
  .key-row {
    grid-template-columns: 1fr 1fr;
  }
  .request-table-head {
    display: none;
  }
  .request-table-head,
  .request-row {
    grid-template-columns: 6.5rem minmax(8rem, 1fr) 5rem 4.8rem 1rem;
  }
  .request-cache,
  .request-outcome {
    display: none;
  }
  .billing-detail {
    padding-left: 1rem;
  }
}

@media (max-width: 640px) {
  .usage-shell {
    padding: 2.25rem 1rem 4rem;
  }
  .usage-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 1.2rem;
  }
  .usage-heading h1 {
    font-size: 2.55rem;
  }
  .period-switcher {
    width: 100%;
  }
  .period-switcher button {
    flex: 1;
  }
  .hero-card {
    padding: 1.35rem;
  }
  .hero-card-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.3rem;
  }
  .hero-cost strong {
    font-size: 3.25rem;
  }
  .hero-metrics {
    gap: 1.25rem;
  }
  .metric-grid {
    grid-template-columns: 1fr;
    gap: 0.55rem;
  }
  .metric-card {
    padding: 1rem 1.1rem;
  }
  .metric-card strong {
    margin-top: 0.4rem;
  }
  .usage-section {
    margin-top: 2rem;
  }
  .key-row {
    grid-template-columns: 1fr;
    gap: 0.85rem;
  }
  .model-row {
    grid-template-columns: minmax(7rem, 1fr) 4.5rem 2rem;
    gap: 0.6rem;
  }
  .model-track {
    display: none;
  }
  .request-toolbar {
    flex-wrap: wrap;
  }
  .request-toolbar select {
    flex: 1;
    min-width: 7rem;
  }
  .request-toolbar > span {
    width: 100%;
    margin-left: 0;
  }
  .request-table-head,
  .request-row {
    grid-template-columns: 5.5rem minmax(7rem, 1fr) 4.6rem 1rem;
    gap: 0.45rem;
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }
  .request-token,
  .request-outcome {
    display: none;
  }
  .billing-detail {
    grid-template-columns: 1fr;
    gap: 0.75rem;
    padding: 0 0.75rem 0.75rem;
  }
  .section-heading {
    align-items: flex-start;
  }
  .section-heading > p {
    text-align: right;
  }
}
</style>
