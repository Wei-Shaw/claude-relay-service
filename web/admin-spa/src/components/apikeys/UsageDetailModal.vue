<template>
  <Teleport to="body">
    <div v-if="show" class="modal fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <!-- 背景遮罩 -->
      <div class="fixed inset-0 bg-gray-900 bg-opacity-50 backdrop-blur-sm" @click="close" />

      <!-- 模态框 -->
      <div
        class="modal-content relative mx-auto flex max-h-[90vh] w-[95%] max-w-2xl flex-col p-4 sm:w-full sm:max-w-3xl sm:p-6 md:p-8"
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
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">总Token数</span>
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

          <!-- 限制信息 -->
          <div v-if="hasLimits" class="mb-6">
            <h4
              class="mb-3 flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300"
            >
              <i class="fas fa-shield-alt mr-2 text-red-500" />
              限制设置
            </h4>
            <div class="space-y-3 rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
              <div v-if="apiKey.dailyCostLimit > 0" class="space-y-2">
                <div class="flex items-center justify-between text-sm">
                  <span class="text-gray-600 dark:text-gray-400">每日费用限制</span>
                  <span class="font-semibold text-gray-900 dark:text-gray-100">
                    ${{ apiKey.dailyCostLimit.toFixed(2) }}
                  </span>
                </div>
                <div class="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-600">
                  <div
                    class="h-2 rounded-full transition-all duration-300"
                    :class="
                      dailyCostPercentage >= 100
                        ? 'bg-red-500'
                        : dailyCostPercentage >= 80
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    "
                    :style="{ width: Math.min(dailyCostPercentage, 100) + '%' }"
                  />
                </div>
                <div class="text-right text-xs text-gray-500 dark:text-gray-400">
                  已使用 {{ dailyCostPercentage.toFixed(1) }}%
                </div>
              </div>

              <div
                v-if="apiKey.concurrencyLimit > 0"
                class="flex items-center justify-between text-sm"
              >
                <span class="text-gray-600 dark:text-gray-400">并发限制</span>
                <span class="font-semibold text-purple-600">
                  {{ apiKey.currentConcurrency || 0 }} / {{ apiKey.concurrencyLimit }}
                </span>
              </div>

              <div v-if="apiKey.rateLimitWindow > 0" class="space-y-2">
                <h5 class="text-sm font-medium text-gray-700 dark:text-gray-300">
                  <i class="fas fa-clock mr-1 text-blue-500" />
                  时间窗口限制
                </h5>
                <WindowCountdown
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
            </div>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="mt-4 flex justify-end gap-2 sm:mt-6 sm:gap-3">
          <button class="btn btn-secondary px-4 py-2 text-sm" type="button" @click="close">
            关闭
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import WindowCountdown from './WindowCountdown.vue'

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
const dailyRequests = computed(() => props.apiKey.usage?.daily?.requests || 0)
const totalTokens = computed(() => props.apiKey.usage?.total?.tokens || 0)
const dailyTokens = computed(() => props.apiKey.usage?.daily?.tokens || 0)
const totalCost = computed(() => props.apiKey.usage?.total?.cost || 0)
const dailyCost = computed(() => props.apiKey.dailyCost || 0)
const inputTokens = computed(() => props.apiKey.usage?.total?.inputTokens || 0)
const outputTokens = computed(() => props.apiKey.usage?.total?.outputTokens || 0)
const cacheCreateTokens = computed(() => props.apiKey.usage?.total?.cacheCreateTokens || 0)
const cacheReadTokens = computed(() => props.apiKey.usage?.total?.cacheReadTokens || 0)
const rpm = computed(() => props.apiKey.usage?.averages?.rpm || 0)
const tpm = computed(() => props.apiKey.usage?.averages?.tpm || 0)

const hasLimits = computed(() => {
  return (
    props.apiKey.dailyCostLimit > 0 ||
    props.apiKey.concurrencyLimit > 0 ||
    props.apiKey.rateLimitWindow > 0 ||
    props.apiKey.tokenLimit > 0
  )
})

const dailyCostPercentage = computed(() => {
  if (!props.apiKey.dailyCostLimit || props.apiKey.dailyCostLimit === 0) return 0
  return (dailyCost.value / props.apiKey.dailyCostLimit) * 100
})

// 方法
const formatNumber = (num) => {
  if (!num && num !== 0) return '0'
  return num.toLocaleString('zh-CN')
}

// 格式化Token数量（使用K/M单位）
const formatTokenCount = (count) => {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M'
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K'
  }
  return count.toString()
}

const close = () => {
  emit('close')
}
</script>

<style scoped>
/* 使用项目的通用样式，不需要额外定义 */
</style>
