<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-[1050] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm"
    >
      <div class="absolute inset-0" @click="handleClose" />
      <div
        class="relative z-10 mx-3 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-200/70 bg-white/95 shadow-2xl ring-1 ring-black/5 transition-all dark:border-gray-700/60 dark:bg-gray-900/95 dark:ring-white/10 sm:mx-4 sm:p-1"
      >
        <!-- 顶部栏 -->
        <div
          class="flex flex-col gap-3 border-b border-gray-100 bg-white/80 px-5 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="flex flex-1 items-start gap-3">
            <div
              class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg"
            >
              <i class="fas fa-chart-area text-lg" />
            </div>
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                  {{ account?.name || account?.email || t('accountModals.usageDetail.title') }}
                </h3>
                <span
                  v-if="account?.platform"
                  class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                >
                  <i class="fas fa-layer-group mr-1" />{{ platformLabel }}
                </span>
                <span
                  v-if="account?.accountType"
                  class="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-500/10 dark:text-purple-300"
                >
                  <i class="fas fa-user-tag mr-1" />{{ accountTypeLabel }}
                </span>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                {{ t('accountModals.usageDetail.subtitle', { days: summary?.days || 30 }) }}
                <span v-if="summary?.actualDaysUsed && summary?.actualDaysUsed < summary?.days">
                  {{
                    t('accountModals.usageDetail.actualDaysNote', { days: summary.actualDaysUsed })
                  }}
                </span>
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="flex items-center gap-2 rounded-full bg-purple-100 px-3 py-2 text-xs font-semibold text-purple-700 transition hover:bg-purple-200 dark:bg-purple-500/10 dark:text-purple-200 dark:hover:bg-purple-500/20"
              @click="goTimeline"
            >
              <i class="fas fa-clock" /> {{ t('accountModals.usageDetail.requestTimeline') }}
            </button>
            <button
              class="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              @click="handleClose"
            >
              <i class="fas fa-times" />
            </button>
          </div>
        </div>

        <!-- 内容区域 -->
        <div class="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <div v-if="loading" class="flex h-[50vh] items-center justify-center">
            <div class="loading-spinner h-12 w-12 border-4 border-blue-500" />
          </div>
          <template v-else>
            <!-- 关键指标 -->
            <div class="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div
                v-for="metric in primaryMetrics"
                :key="metric.key"
                class="rounded-2xl border border-gray-100 bg-white/80 p-4 shadow-sm transition dark:border-gray-700 dark:bg-gray-900/70"
              >
                <div class="flex items-start justify-between">
                  <div>
                    <p
                      class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                    >
                      {{ metric.label }}
                    </p>
                    <p class="mt-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
                      {{ metric.value }}
                    </p>
                    <p class="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      {{ metric.subtitle }}
                    </p>
                  </div>
                  <div
                    class="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800"
                  >
                    <i :class="['fas', metric.icon, metric.iconClass]"></i>
                  </div>
                </div>
              </div>
            </div>

            <!-- 今日与峰值 -->
            <div class="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div
                class="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-500/20 dark:bg-blue-900/20"
              >
                <div
                  class="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300"
                >
                  <i class="fas fa-sun" />
                  {{ t('accountModals.usageDetail.todayOverview') }}
                </div>
                <div
                  class="rounded-xl bg-white/80 p-3 text-sm text-gray-600 shadow-sm ring-1 ring-blue-100 dark:bg-gray-900/80 dark:text-gray-300 dark:ring-blue-500/20"
                >
                  <div class="flex items-center justify-between">
                    <span>{{ t('accountModals.usageDetail.cost') }}</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      summary?.today?.costFormatted || '$0.000000'
                    }}</span>
                  </div>
                  <div class="mt-2 flex items-center justify-between">
                    <span>{{ t('accountModals.usageDetail.requests') }}</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      formatNumber(summary?.today?.requests || 0)
                    }}</span>
                  </div>
                  <div
                    class="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
                  >
                    <span>Tokens</span>
                    <span>{{ formatNumber(summary?.today?.tokens || 0) }}</span>
                  </div>
                </div>
              </div>

              <div
                class="space-y-3 rounded-2xl border border-amber-100 bg-amber-50/70 p-4 dark:border-amber-500/20 dark:bg-amber-900/20"
              >
                <div
                  class="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300"
                >
                  <i class="fas fa-crown" />
                  {{ t('accountModals.usageDetail.highestCostDay') }}
                </div>
                <div
                  class="rounded-xl bg-white/80 p-3 text-sm text-gray-600 shadow-sm ring-1 ring-amber-100 dark:bg-gray-900/80 dark:text-gray-300 dark:ring-amber-500/20"
                >
                  <div class="flex items-center justify-between">
                    <span>{{ t('accountModals.usageDetail.date') }}</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      formatDate(summary?.highestCostDay?.date)
                    }}</span>
                  </div>
                  <div class="mt-2 flex items-center justify-between">
                    <span>{{ t('accountModals.usageDetail.cost') }}</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      summary?.highestCostDay?.formattedCost || '$0.000000'
                    }}</span>
                  </div>
                  <div
                    class="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
                  >
                    <span>{{ t('accountModals.usageDetail.requests') }}</span>
                    <span>{{
                      formatNumber(findHistoryValue(summary?.highestCostDay?.date, 'requests'))
                    }}</span>
                  </div>
                </div>
              </div>

              <div
                class="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 dark:border-emerald-500/20 dark:bg-emerald-900/20"
              >
                <div
                  class="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"
                >
                  <i class="fas fa-chart-bar" />
                  {{ t('accountModals.usageDetail.highestRequestDay') }}
                </div>
                <div
                  class="rounded-xl bg-white/80 p-3 text-sm text-gray-600 shadow-sm ring-1 ring-emerald-100 dark:bg-gray-900/80 dark:text-gray-300 dark:ring-emerald-500/20"
                >
                  <div class="flex items-center justify-between">
                    <span>{{ t('accountModals.usageDetail.date') }}</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      formatDate(summary?.highestRequestDay?.date)
                    }}</span>
                  </div>
                  <div class="mt-2 flex items-center justify-between">
                    <span>{{ t('accountModals.usageDetail.requests') }}</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      formatNumber(summary?.highestRequestDay?.requests || 0)
                    }}</span>
                  </div>
                  <div
                    class="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
                  >
                    <span>{{ t('accountModals.usageDetail.cost') }}</span>
                    <span>{{
                      formatCost(findHistoryValue(summary?.highestRequestDay?.date, 'cost'))
                    }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 综合统计 -->
            <div class="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div
                class="rounded-2xl border border-gray-100 bg-white/80 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70"
              >
                <h4
                  class="mb-3 flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-database mr-2 text-indigo-500" />
                  {{ t('accountModals.usageDetail.totalTokensTitle') }}
                </h4>
                <div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                  <div class="flex items-center justify-between">
                    <span>{{ t('accountModals.usageDetail.total30Days') }}</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      formatNumber(totalTokens)
                    }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span>{{ t('accountModals.usageDetail.avgDailyToken') }}</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      formatNumber(Math.round(summary?.avgDailyTokens || 0))
                    }}</span>
                  </div>
                  <div
                    class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
                  >
                    <span>{{ t('accountModals.usageDetail.inputOutput') }}</span>
                    <span
                      >{{ formatNumber(overviewInputTokens) }} /
                      {{ formatNumber(overviewOutputTokens) }}</span
                    >
                  </div>
                </div>
              </div>
              <div
                class="rounded-2xl border border-gray-100 bg-white/80 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70"
              >
                <h4
                  class="mb-3 flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-tachometer-alt mr-2 text-purple-500" />
                  {{ t('accountModals.usageDetail.averageRate') }}
                </h4>
                <div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                  <div class="flex items-center justify-between">
                    <span>RPM</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      overview?.averages?.rpm ?? 0
                    }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span>TPM</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      overview?.averages?.tpm ?? 0
                    }}</span>
                  </div>
                  <div
                    class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
                  >
                    <span>{{ t('accountModals.usageDetail.avgDailyRequestsToken') }}</span>
                    <span
                      >{{
                        formatNumber(
                          Math.round((overview?.averages?.dailyRequests || 0) * 100) / 100
                        )
                      }}
                      /
                      {{
                        formatNumber(Math.round((overview?.averages?.dailyTokens || 0) * 100) / 100)
                      }}</span
                    >
                  </div>
                </div>
              </div>
              <div
                class="rounded-2xl border border-gray-100 bg-white/80 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70"
              >
                <h4
                  class="mb-3 flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-layer-group mr-2 text-teal-500" />
                  {{ t('accountModals.usageDetail.recentStats') }}
                </h4>
                <div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                  <div class="flex items-center justify-between">
                    <span>{{ t('accountModals.usageDetail.todayRequests') }}</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      formatNumber(overview?.daily?.requests || 0)
                    }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span>{{ t('accountModals.usageDetail.todayToken') }}</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      formatNumber(overview?.daily?.allTokens || 0)
                    }}</span>
                  </div>
                  <div
                    class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
                  >
                    <span>{{ t('accountModals.usageDetail.todayCost') }}</span>
                    <span>{{ formatCost(overview?.daily?.cost || 0) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 折线图 -->
            <div
              class="mb-6 rounded-2xl border border-gray-100 bg-white/80 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70"
            >
              <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h4
                  class="flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-chart-line mr-2 text-blue-500" />
                  {{ t('accountModals.usageDetail.trendTitle') }}
                </h4>
                <span class="text-xs text-gray-400 dark:text-gray-500">
                  {{ t('accountModals.usageDetail.updatedAt') }}:
                  {{ formatDateTime(generatedAtDisplay) }}
                </span>
              </div>
              <div class="h-[260px] sm:h-[300px]">
                <canvas ref="chartCanvas" class="h-full w-full" />
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import Chart from 'chart.js/auto'
import { useThemeStore } from '@/stores/theme'

import { formatNumber } from '@/utils/tools'

const props = defineProps({
  show: { type: Boolean, default: false },
  account: { type: Object, default: () => ({}) },
  history: { type: Array, default: () => [] },
  summary: { type: Object, default: () => ({}) },
  overview: { type: Object, default: () => ({}) },
  generatedAt: { type: String, default: '' },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['close'])

const themeStore = useThemeStore()
const { isDarkMode } = storeToRefs(themeStore)
const router = useRouter()
const { t } = useI18n()

const chartCanvas = ref(null)
let chartInstance = null

const platformLabelMap = {
  claude: 'Claude',
  'claude-console': 'Claude Console',
  openai: 'OpenAI',
  'openai-responses': 'OpenAI Responses',
  gemini: 'Gemini',
  'gemini-api': 'Gemini API',
  droid: 'Droid',
  bedrock: 'Claude AWS Bedrock'
}

const platformLabel = computed(
  () => platformLabelMap[props.account?.platform] || t('accountModals.usageDetail.unknownPlatform')
)

const accountTypeLabel = computed(() => {
  if (!props.account?.accountType) return t('accountModals.usageDetail.shared')
  if (props.account.accountType === 'dedicated') return t('accountModals.usageDetail.dedicated')
  if (props.account.accountType === 'group') return t('accountModals.usageDetail.group')
  return t('accountModals.usageDetail.shared')
})

const chartColors = computed(() => ({
  text: isDarkMode.value ? '#e5e7eb' : '#374151',
  grid: isDarkMode.value ? 'rgba(75, 85, 99, 0.25)' : 'rgba(209, 213, 219, 0.4)',
  cost: '#3b82f6',
  costFill: 'rgba(59, 130, 246, 0.15)',
  requests: '#f97316'
}))

const totalTokens = computed(() => props.summary?.totalTokens || 0)
const overviewInputTokens = computed(() => props.overview?.total?.inputTokens || 0)
const overviewOutputTokens = computed(() => props.overview?.total?.outputTokens || 0)

const formatCost = (value) => {
  const num = Number(value || 0)
  if (Number.isNaN(num)) return '$0.000000'
  if (num >= 1) return `$${num.toFixed(2)}`
  if (num >= 0.01) return `$${num.toFixed(3)}`
  return `$${num.toFixed(6)}`
}

const roundToTwo = (value) => Math.round((Number(value) || 0) * 100) / 100

const formatDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    const parts = value.split('-')
    if (parts.length === 3) return `${parts[1]}-${parts[2]}`
    return value
  }
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

const formatDateTime = (value) => {
  if (!value) return t('accountModals.common.none')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const findHistoryValue = (date, field) => {
  if (!date) return 0
  const target = props.history.find((item) => item.date === date)
  return target ? target[field] || 0 : 0
}

const generatedAtDisplay = computed(
  () => props.generatedAt || props.summary?.generatedAt || props.summary?.generated_at || ''
)

const primaryMetrics = computed(() => [
  {
    key: 'totalCost',
    label: t('accountModals.usageDetail.totalCost30Days'),
    value: props.summary?.totalCostFormatted || '$0.000000',
    subtitle: t('accountModals.usageDetail.cumulativeCost'),
    icon: 'fa-file-invoice-dollar',
    iconClass: 'text-emerald-500'
  },
  {
    key: 'totalRequests',
    label: t('accountModals.usageDetail.totalRequests30Days'),
    value: formatNumber(props.summary?.totalRequests || 0),
    subtitle: t('accountModals.usageDetail.callCount'),
    icon: 'fa-paper-plane',
    iconClass: 'text-blue-500'
  },
  {
    key: 'avgCost',
    label: t('accountModals.usageDetail.avgDailyCost'),
    value: props.summary?.avgDailyCostFormatted || formatCost(props.summary?.avgDailyCost || 0),
    subtitle:
      props.summary?.actualDaysUsed && props.summary?.actualDaysUsed < props.summary?.days
        ? t('accountModals.usageDetail.basedOnActualDays', {
            days: props.summary.actualDaysUsed
          })
        : t('accountModals.usageDetail.avgDailyCostSubtitle'),
    icon: 'fa-wave-square',
    iconClass: 'text-purple-500'
  },
  {
    key: 'avgRequests',
    label: t('accountModals.usageDetail.avgDailyRequests'),
    value: formatNumber(roundToTwo(props.summary?.avgDailyRequests || 0)),
    subtitle: t('accountModals.usageDetail.avgDailyCalls'),
    icon: 'fa-chart-line',
    iconClass: 'text-orange-500'
  }
])

const renderChart = async () => {
  await nextTick()

  if (!props.show || !chartCanvas.value) {
    return
  }

  if (chartInstance) {
    chartInstance.destroy()
  }

  if (!props.history || props.history.length === 0) {
    chartInstance = null
    return
  }

  const labels = props.history.map((item) => item.label)
  const costs = props.history.map((item) => item.cost || 0)
  const requests = props.history.map((item) => item.requests || 0)

  chartInstance = new Chart(chartCanvas.value, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: t('accountModals.usageDetail.costUsd'),
          data: costs,
          borderColor: chartColors.value.cost,
          backgroundColor: chartColors.value.costFill,
          tension: 0.35,
          fill: true,
          yAxisID: 'y'
        },
        {
          label: t('accountModals.usageDetail.requestCount'),
          data: requests,
          borderColor: chartColors.value.requests,
          backgroundColor: 'transparent',
          tension: 0.35,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: chartColors.value.text
          }
        },
        tooltip: {
          callbacks: {
            label(context) {
              if (context.dataset.label === t('accountModals.usageDetail.costUsd')) {
                return `${context.dataset.label}: ${formatCost(context.parsed.y)}`
              }
              return t('accountModals.usageDetail.tooltipCount', {
                label: context.dataset.label,
                count: formatNumber(context.parsed.y)
              })
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: chartColors.value.text
          },
          grid: {
            color: chartColors.value.grid
          }
        },
        y: {
          position: 'left',
          ticks: {
            color: chartColors.value.text,
            callback: (value) => formatCost(value)
          },
          grid: {
            color: chartColors.value.grid
          }
        },
        y1: {
          position: 'right',
          ticks: {
            color: chartColors.value.text,
            callback: (value) => formatNumber(value)
          },
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }
  })
}

const cleanupChart = () => {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
}

const handleClose = () => {
  cleanupChart()
  emit('close')
}

const goTimeline = () => {
  if (!props.account?.id) return
  router.push({
    path: `/accounts/${props.account.id}/usage-records`,
    query: { platform: props.account.platform || props.account.accountType }
  })
}

watch(
  () => props.show,
  (visible) => {
    if (visible && !props.loading) {
      renderChart()
    } else if (!visible) {
      cleanupChart()
    }
  }
)

watch(
  () => props.loading,
  (loading) => {
    if (!loading && props.show) {
      renderChart()
    }
  }
)

watch(
  () => props.history,
  () => {
    if (props.show && !props.loading) {
      renderChart()
    }
  },
  { deep: true }
)

watch(isDarkMode, () => {
  if (props.show && !props.loading) {
    renderChart()
  }
})

onUnmounted(() => {
  cleanupChart()
})
</script>

<style scoped>
.loading-spinner {
  border-top-color: transparent;
  border-radius: 9999px;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
