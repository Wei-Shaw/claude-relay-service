<template>
  <ModalTransition>
    <div v-if="show" class="modal fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <!-- 背景遮罩 -->
      <div class="fixed inset-0 bg-gray-900 bg-opacity-50 backdrop-blur-sm" @click="close" />

      <!-- 模态框 -->
      <div
        class="modal-content relative mx-auto flex max-h-[90vh] w-[95%] max-w-2xl flex-col p-4 sm:w-full sm:p-5"
      >
        <!-- 标题栏 -->
        <div class="mb-3 flex items-center justify-between">
          <div class="flex min-w-0 items-center gap-2">
            <div
              class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600"
            >
              <i class="fas fa-chart-line text-sm text-white" />
            </div>
            <h3 class="truncate text-base font-bold text-gray-900 dark:text-gray-100 sm:text-lg">
              使用统计详情 - {{ apiKey.name }}
            </h3>
          </div>
          <button class="p-1 text-gray-400 transition-colors hover:text-gray-600" @click="close">
            <i class="fas fa-times text-lg" />
          </button>
        </div>

        <!-- 内容区 -->
        <div class="modal-scroll-content custom-scrollbar flex-1 overflow-y-auto">
          <!-- 紧凑用量统计 -->
          <div
            class="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-600 dark:bg-gray-700/50"
          >
            <div class="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              <div class="flex items-center justify-between gap-3">
                <span class="text-gray-500 dark:text-gray-400">请求</span>
                <span class="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {{ formatNumber(totalRequests) }}
                </span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-gray-500 dark:text-gray-400">总Token</span>
                <span class="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {{ formatTokenCount(totalTokens) }}
                </span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-gray-500 dark:text-gray-400">输入</span>
                <span class="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {{ formatTokenCount(inputTokens) }}
                </span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-gray-500 dark:text-gray-400">输出</span>
                <span class="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {{ formatTokenCount(outputTokens) }}
                </span>
              </div>
              <div class="flex items-center justify-between gap-3 sm:col-span-2">
                <span class="text-gray-500 dark:text-gray-400">缓存写</span>
                <span
                  class="text-right font-semibold tabular-nums text-purple-600 dark:text-purple-400"
                >
                  {{ formatTokenCount(cacheCreateTokens)
                  }}<span
                    v-if="ephemeral5mTokens > 0 || ephemeral1hTokens > 0"
                    class="ml-1 font-normal text-gray-500 dark:text-gray-400"
                  >
                    (5m: {{ formatTokenCount(ephemeral5mTokens) }} / 1h:
                    {{ formatTokenCount(ephemeral1hTokens) }})
                  </span>
                </span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-gray-500 dark:text-gray-400">缓存读</span>
                <span class="font-semibold tabular-nums text-purple-600 dark:text-purple-400">
                  {{ formatTokenCount(cacheReadTokens) }}
                </span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-gray-500 dark:text-gray-400">命中率</span>
                <span class="font-semibold tabular-nums text-cyan-600 dark:text-cyan-400">
                  {{ formatPercent(cacheHitRate) }}
                </span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-gray-500 dark:text-gray-400">原始</span>
                <span class="font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                  {{ formatCost(realCost) }}
                </span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-gray-500 dark:text-gray-400">扣费</span>
                <span class="font-semibold tabular-nums text-green-600 dark:text-green-400">
                  {{ formatCost(totalCost) }}
                </span>
              </div>
            </div>
          </div>

          <!-- 限制信息 -->
          <div v-if="hasLimits" class="mb-4">
            <h4
              class="mb-2 flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300"
            >
              <i class="fas fa-shield-alt mr-2 text-red-500" />
              限制设置
            </h4>
            <div class="space-y-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
              <div v-if="Number(apiKey.dailyCostLimit) > 0" class="space-y-1.5">
                <LimitProgressBar
                  :current="Number(dailyCost) || 0"
                  label="每日费用限制"
                  :limit="Number(apiKey.dailyCostLimit) || 0"
                  :show-shine="true"
                  type="daily"
                />
                <div class="text-right text-sm text-gray-500 dark:text-gray-400">
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
                <div class="text-right text-sm text-gray-500 dark:text-gray-400">
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
                <div class="text-right text-sm text-gray-500 dark:text-gray-400">
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
                  class="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-700/50 dark:bg-yellow-900/20 dark:text-yellow-200"
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
                      class="rounded bg-gray-100 px-2 py-0.5 text-sm text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                    >
                      {{ model }}
                    </span>
                  </div>
                  <div v-else class="text-sm text-gray-500 dark:text-gray-400">未配置具体模型</div>
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
                      class="rounded bg-gray-100 px-2 py-0.5 text-sm text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                    >
                      {{ client }}
                    </span>
                  </div>
                  <div v-else class="text-sm text-gray-500 dark:text-gray-400">未配置客户端</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="mt-3 flex justify-end">
          <button class="btn btn-secondary px-4 py-2 text-sm" type="button" @click="close">
            关闭
          </button>
        </div>
      </div>
    </div>
  </ModalTransition>
</template>

<script setup>
import { computed } from 'vue'
import ModalTransition from '@/components/common/ModalTransition.vue'
import LimitProgressBar from './LimitProgressBar.vue'
import WindowCountdown from './WindowCountdown.vue'

import { formatCost, formatNumber } from '@/utils/tools'

const props = defineProps({
  show: {
    type: Boolean,
    required: true
  },
  apiKey: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close'])

// 计算属性
const totalRequests = computed(() => props.apiKey.usage?.total?.requests || 0)
const totalTokens = computed(() => props.apiKey.usage?.total?.tokens || 0)
const totalCost = computed(() => props.apiKey.usage?.total?.cost || 0)
const realCost = computed(() => {
  const value = props.apiKey.usage?.total?.realCost
  // 旧数据没有 realCost 时，回退到扣费金额
  return value > 0 ? value : totalCost.value
})
const dailyCost = computed(() => props.apiKey.dailyCost || 0)
const totalCostLimit = computed(() => props.apiKey.totalCostLimit || 0)
const weeklyOpusCost = computed(() => props.apiKey.weeklyOpusCost || 0)
const weeklyOpusCostLimit = computed(() => props.apiKey.weeklyOpusCostLimit || 0)
const inputTokens = computed(() => props.apiKey.usage?.total?.inputTokens || 0)
const outputTokens = computed(() => props.apiKey.usage?.total?.outputTokens || 0)
const cacheCreateTokens = computed(() => props.apiKey.usage?.total?.cacheCreateTokens || 0)
const cacheReadTokens = computed(() => props.apiKey.usage?.total?.cacheReadTokens || 0)
const ephemeral5mTokens = computed(() => props.apiKey.usage?.total?.ephemeral5mTokens || 0)
const ephemeral1hTokens = computed(() => props.apiKey.usage?.total?.ephemeral1hTokens || 0)

// 命中率：读 / (输入 + 读 + 写)
const cacheHitRate = computed(() => {
  const denominator = inputTokens.value + cacheReadTokens.value + cacheCreateTokens.value
  if (denominator <= 0) return 0
  return cacheReadTokens.value / denominator
})

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

// 格式化Token数量（使用K/M单位）
const formatTokenCount = (count) => {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M'
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K'
  }
  return String(count || 0)
}

const formatPercent = (value) => {
  const num = Number(value || 0)
  if (!Number.isFinite(num) || num <= 0) return '0%'
  return `${(num * 100).toFixed(1)}%`
}

const close = () => {
  emit('close')
}
</script>
