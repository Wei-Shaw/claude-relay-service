<template>
  <Teleport to="body">
    <div v-if="show" class="modal fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <!-- 背景遮罩 -->
      <div class="fixed inset-0 bg-gray-900 bg-opacity-50 backdrop-blur-sm" @click="close" />

      <!-- 模态框 -->
      <div
        class="modal-content relative mx-auto flex max-h-[90vh] w-[95%] max-w-6xl flex-col p-4 sm:w-full sm:p-6 md:p-8"
      >
        <!-- 标题栏 -->
        <div class="mb-4 flex items-center justify-between sm:mb-6">
          <div class="flex items-center gap-2 sm:gap-3">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 sm:h-10 sm:w-10 sm:rounded-xl"
            >
              <i class="fas fa-chart-line text-sm text-white sm:text-base" />
            </div>
            <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">
              使用统计详情 - {{ apiKey.name }}
            </h3>
          </div>
          <button class="p-1 text-gray-400 transition-colors hover:text-gray-600" @click="close">
            <i class="fas fa-times text-lg sm:text-xl" />
          </button>
        </div>

        <!-- 内容区 -->
        <div class="modal-scroll-content custom-scrollbar flex-1 overflow-y-auto">
          <div v-if="loading" class="flex h-[50vh] items-center justify-center">
            <div class="loading-spinner h-12 w-12 border-4 border-blue-500" />
          </div>
          <template v-else>
            <!-- 总体统计卡片 -->
            <div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <!-- 请求统计卡片 -->
              <div
                class="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 p-4 dark:border-blue-700 dark:from-blue-900/20 dark:to-blue-800/20"
              >
                <div class="mb-3 flex items-center justify-between">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">总请求数</span>
                  <i class="fas fa-paper-plane text-blue-500" />
                </div>
                <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {{ formatNumber(totalRequests) }}
                </div>
                <div class="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  今日: {{ formatNumber(dailyRequests) }} 次
                </div>
              </div>

              <!-- Token统计卡片 -->
              <div
                class="rounded-lg border border-green-200 bg-gradient-to-br from-green-50 to-green-100 p-4 dark:border-green-700 dark:from-green-900/20 dark:to-green-800/20"
              >
                <div class="mb-3 flex items-center justify-between">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300"
                    >总Token数</span
                  >
                  <i class="fas fa-coins text-green-500" />
                </div>
                <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {{ formatTokenCount(totalTokens) }}
                </div>
                <div class="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  今日: {{ formatTokenCount(dailyTokens) }}
                </div>
              </div>

              <!-- 费用统计卡片 -->
              <div
                class="rounded-lg border border-yellow-200 bg-gradient-to-br from-yellow-50 to-yellow-100 p-4 dark:border-yellow-700 dark:from-yellow-900/20 dark:to-yellow-800/20"
              >
                <div class="mb-3 flex items-center justify-between">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">总费用</span>
                  <i class="fas fa-dollar-sign text-yellow-600" />
                </div>
                <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  ${{ totalCost.toFixed(4) }}
                </div>
                <div class="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  今日: ${{ dailyCost.toFixed(4) }}
                </div>
              </div>

              <!-- 平均统计卡片 -->
              <div
                class="rounded-lg border border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100 p-4 dark:border-purple-700 dark:from-purple-900/20 dark:to-purple-800/20"
              >
                <div class="mb-3 flex items-center justify-between">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">平均速率</span>
                  <i class="fas fa-tachometer-alt text-purple-500" />
                </div>
                <div class="space-y-1 text-sm">
                  <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">RPM:</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{ rpm }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">TPM:</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{ tpm }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Token详细分布 -->
            <div class="mb-6">
              <h4
                class="mb-3 flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-chart-pie mr-2 text-indigo-500" />
                Token 使用分布
              </h4>
              <div class="space-y-3 rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
                <div class="flex items-center justify-between">
                  <div class="flex items-center">
                    <i class="fas fa-arrow-down mr-2 text-green-500" />
                    <span class="text-sm text-gray-600 dark:text-gray-400">输入 Token</span>
                  </div>
                  <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {{ formatTokenCount(inputTokens) }}
                  </span>
                </div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center">
                    <i class="fas fa-arrow-up mr-2 text-blue-500" />
                    <span class="text-sm text-gray-600 dark:text-gray-400">输出 Token</span>
                  </div>
                  <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {{ formatTokenCount(outputTokens) }}
                  </span>
                </div>
                <div v-if="cacheCreateTokens > 0" class="flex items-center justify-between">
                  <div class="flex items-center">
                    <i class="fas fa-save mr-2 text-purple-500" />
                    <span class="text-sm text-gray-600 dark:text-gray-400">缓存创建 Token</span>
                  </div>
                  <span class="text-sm font-semibold text-purple-600">
                    {{ formatTokenCount(cacheCreateTokens) }}
                  </span>
                </div>
                <div v-if="cacheReadTokens > 0" class="flex items-center justify-between">
                  <div class="flex items-center">
                    <i class="fas fa-download mr-2 text-purple-500" />
                    <span class="text-sm text-gray-600 dark:text-gray-400">缓存读取 Token</span>
                  </div>
                  <span class="text-sm font-semibold text-purple-600">
                    {{ formatTokenCount(cacheReadTokens) }}
                  </span>
                </div>
              </div>
            </div>

            <div class="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
              <div
                class="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-500/20 dark:bg-blue-900/20"
              >
                <div
                  class="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300"
                >
                  <i class="fas fa-sun" />
                  今日概览
                </div>
                <div
                  class="rounded-xl bg-white/80 p-3 text-sm text-gray-600 shadow-sm ring-1 ring-blue-100 dark:bg-gray-900/80 dark:text-gray-300 dark:ring-blue-500/20"
                >
                  <div class="flex items-center justify-between">
                    <span>费用</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      summary?.today?.costFormatted || formatCost(0)
                    }}</span>
                  </div>
                  <div class="mt-2 flex items-center justify-between">
                    <span>请求</span>
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
                class="space-y-3 rounded-2xl border border-violet-100 bg-violet-50/70 p-4 dark:border-violet-500/20 dark:bg-violet-900/20"
              >
                <div
                  class="flex items-center gap-2 text-sm font-semibold text-violet-700 dark:text-violet-300"
                >
                  <i class="fas fa-calendar-week" />
                  近7日平均
                </div>
                <div
                  class="rounded-xl bg-white/80 p-3 text-sm text-gray-600 shadow-sm ring-1 ring-violet-100 dark:bg-gray-900/80 dark:text-gray-300 dark:ring-violet-500/20"
                >
                  <div class="flex items-center justify-between">
                    <span>费用</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      formatCost(recentSevenDayStats.avgCost)
                    }}</span>
                  </div>
                  <div class="mt-2 flex items-center justify-between">
                    <span>请求</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      formatNumber(roundToTwo(recentSevenDayStats.avgRequests))
                    }}</span>
                  </div>
                  <div
                    class="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
                  >
                    <span>Tokens</span>
                    <span>{{ formatNumber(Math.round(recentSevenDayStats.avgTokens)) }}</span>
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
                  最高费用日
                </div>
                <div
                  class="rounded-xl bg-white/80 p-3 text-sm text-gray-600 shadow-sm ring-1 ring-amber-100 dark:bg-gray-900/80 dark:text-gray-300 dark:ring-amber-500/20"
                >
                  <div class="flex items-center justify-between">
                    <span>日期</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      formatDate(summary?.highestCostDay?.date)
                    }}</span>
                  </div>
                  <div class="mt-2 flex items-center justify-between">
                    <span>费用</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      summary?.highestCostDay?.formattedCost || formatCost(0)
                    }}</span>
                  </div>
                  <div
                    class="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
                  >
                    <span>请求</span>
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
                  最高请求日
                </div>
                <div
                  class="rounded-xl bg-white/80 p-3 text-sm text-gray-600 shadow-sm ring-1 ring-emerald-100 dark:bg-gray-900/80 dark:text-gray-300 dark:ring-emerald-500/20"
                >
                  <div class="flex items-center justify-between">
                    <span>日期</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      formatDate(summary?.highestRequestDay?.date)
                    }}</span>
                  </div>
                  <div class="mt-2 flex items-center justify-between">
                    <span>请求</span>
                    <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                      formatNumber(summary?.highestRequestDay?.requests || 0)
                    }}</span>
                  </div>
                  <div
                    class="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
                  >
                    <span>费用</span>
                    <span>{{
                      formatCost(findHistoryValue(summary?.highestRequestDay?.date, 'cost'))
                    }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div
              class="mb-6 rounded-2xl border border-gray-100 bg-white/80 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70"
            >
              <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h4
                  class="flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  <i class="fas fa-chart-line mr-2 text-blue-500" />
                  30天费用与请求趋势
                </h4>
                <span class="text-xs text-gray-400 dark:text-gray-500">
                  最新更新时间：{{ formatDateTime(generatedAt) }}
                </span>
              </div>
              <div v-if="history.length > 0" class="h-[260px] sm:h-[300px]">
                <canvas ref="chartCanvas" class="h-full w-full" />
              </div>
              <div
                v-else
                class="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500"
              >
                暂无近期消耗数据
              </div>
            </div>

            <!-- 限制信息 -->
            <div v-if="hasLimits" class="mb-6">
              <h4
                class="mb-3 flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300"
              >
                <i class="fas fa-shield-alt mr-2 text-red-500" />
                限制设置
              </h4>
              <div class="space-y-3 rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
                <div v-if="Number(apiKey.dailyCostLimit) > 0" class="space-y-1.5">
                  <LimitProgressBar
                    :current="Number(dailyCost) || 0"
                    label="每日费用限制"
                    :limit="Number(apiKey.dailyCostLimit) || 0"
                    :show-shine="true"
                    type="daily"
                  />
                  <div class="text-right text-xs text-gray-500 dark:text-gray-400">
                    已使用 {{ Math.min(dailyCostPercentage, 100).toFixed(1) }}%
                  </div>
                </div>

                <div v-if="Number(apiKey.weeklyOpusCostLimit) > 0" class="space-y-1.5">
                  <LimitProgressBar
                    :current="Number(weeklyOpusCost) || 0"
                    label="Claude 周费用限制"
                    :limit="Number(apiKey.weeklyOpusCostLimit) || 0"
                    :show-shine="true"
                    type="opus"
                  />
                  <div class="text-right text-xs text-gray-500 dark:text-gray-400">
                    已使用 {{ Math.min(opusUsagePercentage, 100).toFixed(1) }}%
                  </div>
                </div>

                <div v-if="Number(apiKey.totalCostLimit) > 0" class="space-y-1.5">
                  <LimitProgressBar
                    :current="Number(totalCost) || 0"
                    label="总费用限制"
                    :limit="Number(apiKey.totalCostLimit) || 0"
                    :show-shine="true"
                    type="total"
                  />
                  <div class="text-right text-xs text-gray-500 dark:text-gray-400">
                    已使用 {{ Math.min(totalUsagePercentage, 100).toFixed(1) }}%
                  </div>
                </div>

                <div
                  v-if="Number(apiKey.concurrencyLimit) > 0"
                  class="flex items-center justify-between rounded-lg border border-purple-200/70 bg-white/60 px-3 py-2 text-sm shadow-sm dark:border-purple-500/40 dark:bg-purple-950/20"
                >
                  <span class="text-gray-600 dark:text-gray-300">并发限制</span>
                  <span class="font-semibold text-purple-600 dark:text-purple-300">
                    {{ apiKey.currentConcurrency || 0 }} / {{ apiKey.concurrencyLimit }}
                  </span>
                </div>

                <div
                  v-if="
                    apiKey.rateLimitWindow > 0 ||
                    apiKey.rateLimitRequests > 0 ||
                    apiKey.tokenLimit > 0 ||
                    apiKey.rateLimitCost > 0
                  "
                  class="space-y-2"
                >
                  <h5 class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    <i class="fas fa-clock mr-1 text-blue-500" />
                    时间窗口限制
                  </h5>
                  <div
                    v-if="apiKey.rateLimitWindow <= 0"
                    class="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:border-yellow-700/50 dark:bg-yellow-900/20 dark:text-yellow-200"
                  >
                    未设置窗口时长（rateLimitWindow=0），窗口限制不会生效。
                  </div>
                  <WindowCountdown
                    :cost-limit="apiKey.rateLimitCost"
                    :current-cost="apiKey.currentWindowCost"
                    :current-requests="apiKey.currentWindowRequests"
                    :current-tokens="apiKey.currentWindowTokens"
                    label="窗口状态"
                    :rate-limit-window="apiKey.rateLimitWindow"
                    :request-limit="apiKey.rateLimitRequests"
                    :show-progress="true"
                    :show-tooltip="true"
                    :token-limit="apiKey.tokenLimit"
                    :window-end-time="apiKey.windowEndTime"
                    :window-remaining-seconds="apiKey.windowRemainingSeconds"
                    :window-start-time="apiKey.windowStartTime"
                  />
                </div>

                <!-- 访问控制限制（模型/客户端/服务权限） -->
                <div v-if="hasAccessRestrictions" class="space-y-2">
                  <h5 class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    <i class="fas fa-lock mr-1 text-gray-500" />
                    访问控制
                  </h5>

                  <div
                    class="rounded-lg border border-gray-200 bg-white/60 px-3 py-2 text-sm shadow-sm dark:border-gray-600/50 dark:bg-gray-800/40"
                  >
                    <div class="flex items-center justify-between">
                      <span class="text-gray-600 dark:text-gray-300">服务权限</span>
                      <span class="font-semibold text-gray-900 dark:text-gray-100">
                        {{ permissionsDisplay }}
                      </span>
                    </div>
                  </div>

                  <div
                    v-if="enableModelRestriction"
                    class="rounded-lg border border-gray-200 bg-white/60 px-3 py-2 text-sm shadow-sm dark:border-gray-600/50 dark:bg-gray-800/40"
                  >
                    <div class="mb-1 flex items-center justify-between">
                      <span class="text-gray-600 dark:text-gray-300">模型限制（禁用列表）</span>
                      <span class="font-semibold text-gray-900 dark:text-gray-100">
                        {{ restrictedModels.length }}
                      </span>
                    </div>
                    <div v-if="restrictedModels.length > 0" class="flex flex-wrap gap-1.5">
                      <span
                        v-for="model in restrictedModels"
                        :key="model"
                        class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                      >
                        {{ model }}
                      </span>
                    </div>
                    <div v-else class="text-xs text-gray-500 dark:text-gray-400">
                      未配置具体模型
                    </div>
                  </div>

                  <div
                    v-if="enableClientRestriction"
                    class="rounded-lg border border-gray-200 bg-white/60 px-3 py-2 text-sm shadow-sm dark:border-gray-600/50 dark:bg-gray-800/40"
                  >
                    <div class="mb-1 flex items-center justify-between">
                      <span class="text-gray-600 dark:text-gray-300">客户端限制（允许列表）</span>
                      <span class="font-semibold text-gray-900 dark:text-gray-100">
                        {{ allowedClients.length }}
                      </span>
                    </div>
                    <div v-if="allowedClients.length > 0" class="flex flex-wrap gap-1.5">
                      <span
                        v-for="client in allowedClients"
                        :key="client"
                        class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                      >
                        {{ client }}
                      </span>
                    </div>
                    <div v-else class="text-xs text-gray-500 dark:text-gray-400">未配置客户端</div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- 底部按钮 -->
        <div class="mt-4 flex justify-end gap-2 sm:mt-6 sm:gap-3">
          <button class="btn btn-primary px-4 py-2 text-sm" type="button" @click="openTimeline">
            查看请求时间线
          </button>
          <button class="btn btn-secondary px-4 py-2 text-sm" type="button" @click="close">
            关闭
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import Chart from 'chart.js/auto'
import { storeToRefs } from 'pinia'
import LimitProgressBar from './LimitProgressBar.vue'
import WindowCountdown from './WindowCountdown.vue'
import { useThemeStore } from '@/stores/theme'

import { formatNumber } from '@/utils/tools'

const props = defineProps({
  show: {
    type: Boolean,
    required: true
  },
  apiKey: {
    type: Object,
    required: true
  },
  history: {
    type: Array,
    default: () => []
  },
  summary: {
    type: Object,
    default: () => ({})
  },
  generatedAt: {
    type: String,
    default: ''
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'open-timeline'])
const themeStore = useThemeStore()
const { isDarkMode } = storeToRefs(themeStore)
const chartCanvas = ref(null)
let chartInstance = null

// 计算属性
const totalRequests = computed(() => props.apiKey.usage?.total?.requests || 0)
const dailyRequests = computed(() => props.apiKey.usage?.daily?.requests || 0)
const totalTokens = computed(() => props.apiKey.usage?.total?.tokens || 0)
const dailyTokens = computed(() => props.apiKey.usage?.daily?.tokens || 0)
const totalCost = computed(() => props.apiKey.usage?.total?.cost || 0)
const dailyCost = computed(() => props.apiKey.dailyCost || 0)
const totalCostLimit = computed(() => props.apiKey.totalCostLimit || 0)
const weeklyOpusCost = computed(() => props.apiKey.weeklyOpusCost || 0)
const weeklyOpusCostLimit = computed(() => props.apiKey.weeklyOpusCostLimit || 0)
const inputTokens = computed(() => props.apiKey.usage?.total?.inputTokens || 0)
const outputTokens = computed(() => props.apiKey.usage?.total?.outputTokens || 0)
const cacheCreateTokens = computed(() => props.apiKey.usage?.total?.cacheCreateTokens || 0)
const cacheReadTokens = computed(() => props.apiKey.usage?.total?.cacheReadTokens || 0)
const rpm = computed(() => props.apiKey.usage?.averages?.rpm || 0)
const tpm = computed(() => props.apiKey.usage?.averages?.tpm || 0)

const enableModelRestriction = computed(
  () =>
    props.apiKey.enableModelRestriction === true || props.apiKey.enableModelRestriction === 'true'
)
const restrictedModels = computed(() =>
  Array.isArray(props.apiKey.restrictedModels) ? props.apiKey.restrictedModels : []
)
const enableClientRestriction = computed(
  () =>
    props.apiKey.enableClientRestriction === true || props.apiKey.enableClientRestriction === 'true'
)
const allowedClients = computed(() =>
  Array.isArray(props.apiKey.allowedClients) ? props.apiKey.allowedClients : []
)
const permissions = computed(() => props.apiKey.permissions || [])

const permissionsDisplay = computed(() => {
  if (!Array.isArray(permissions.value) || permissions.value.length === 0) {
    return '全部'
  }
  return permissions.value.join(', ')
})

const hasAccessRestrictions = computed(() => {
  return (
    enableModelRestriction.value ||
    enableClientRestriction.value ||
    (Array.isArray(permissions.value) && permissions.value.length > 0)
  )
})

const hasLimits = computed(() => {
  return (
    Number(props.apiKey.dailyCostLimit) > 0 ||
    Number(props.apiKey.totalCostLimit) > 0 ||
    Number(props.apiKey.concurrencyLimit) > 0 ||
    Number(props.apiKey.weeklyOpusCostLimit) > 0 ||
    Number(props.apiKey.rateLimitWindow) > 0 ||
    Number(props.apiKey.rateLimitRequests) > 0 ||
    Number(props.apiKey.rateLimitCost) > 0 ||
    Number(props.apiKey.tokenLimit) > 0 ||
    hasAccessRestrictions.value
  )
})

const dailyCostPercentage = computed(() => {
  if (!props.apiKey.dailyCostLimit || props.apiKey.dailyCostLimit === 0) return 0
  return (dailyCost.value / props.apiKey.dailyCostLimit) * 100
})

const totalUsagePercentage = computed(() => {
  if (!totalCostLimit.value || totalCostLimit.value === 0) return 0
  return (totalCost.value / totalCostLimit.value) * 100
})

const opusUsagePercentage = computed(() => {
  if (!weeklyOpusCostLimit.value || weeklyOpusCostLimit.value === 0) return 0
  return (weeklyOpusCost.value / weeklyOpusCostLimit.value) * 100
})

const chartColors = computed(() => ({
  text: isDarkMode.value ? '#e5e7eb' : '#374151',
  grid: isDarkMode.value ? 'rgba(75, 85, 99, 0.25)' : 'rgba(209, 213, 219, 0.4)',
  cost: '#3b82f6',
  costFill: 'rgba(59, 130, 246, 0.15)',
  requests: '#f97316'
}))

// 方法

// 格式化Token数量（使用K/M单位）
const formatTokenCount = (count) => {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M'
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K'
  }
  return count.toString()
}

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
  if (!value) return '暂无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const findHistoryValue = (date, field) => {
  if (!date) return 0
  const target = props.history.find((item) => item.date === date)
  return target ? target[field] || 0 : 0
}

const recentSevenDayStats = computed(() => {
  const recentHistory = Array.isArray(props.history) ? props.history.slice(-7) : []
  const sampleDays = recentHistory.length

  if (sampleDays === 0) {
    return {
      avgCost: 0,
      avgRequests: 0,
      avgTokens: 0
    }
  }

  const totals = recentHistory.reduce(
    (accumulator, item) => {
      accumulator.cost += Number(item.cost || 0)
      accumulator.requests += Number(item.requests || 0)
      accumulator.tokens += Number(item.tokens || 0)
      return accumulator
    },
    { cost: 0, requests: 0, tokens: 0 }
  )

  return {
    avgCost: totals.cost / sampleDays,
    avgRequests: totals.requests / sampleDays,
    avgTokens: totals.tokens / sampleDays
  }
})

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
          label: '费用 (USD)',
          data: costs,
          borderColor: chartColors.value.cost,
          backgroundColor: chartColors.value.costFill,
          tension: 0.35,
          fill: true,
          yAxisID: 'y'
        },
        {
          label: '请求次数',
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
              if (context.dataset.label === '费用 (USD)') {
                return `${context.dataset.label}: ${formatCost(context.parsed.y)}`
              }
              return `${context.dataset.label}: ${formatNumber(context.parsed.y)} 次`
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

const close = () => {
  cleanupChart()
  emit('close')
}

const openTimeline = () => {
  emit('open-timeline', props.apiKey?.id)
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
