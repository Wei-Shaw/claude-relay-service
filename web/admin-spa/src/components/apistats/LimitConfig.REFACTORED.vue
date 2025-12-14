<template>
  <div class="flex h-full flex-col gap-4 md:gap-6">
    <!-- 限制配置 / 聚合模式提示 -->
    <div class="card flex h-full flex-col p-4 md:p-6">
      <h3
        class="mb-3 flex items-center text-lg font-bold text-gray-900 dark:text-gray-100 md:mb-4 md:text-xl"
      >
        <i class="fas fa-shield-alt mr-2 text-sm text-red-500 md:mr-3 md:text-base" />
        {{ multiKeyMode ? '限制配置（聚合查询模式）' : '限制配置' }}
      </h3>

      <!-- 多 Key 模式下的聚合统计信息 -->
      <div v-if="multiKeyMode && aggregatedStats" class="space-y-4">
        <!-- API Keys 概况 -->
        <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
          <div class="mb-3 flex items-center justify-between">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
              <i class="fas fa-layer-group mr-2 text-blue-500" />
              API Keys 概况
            </span>
            <span
              class="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-gray-900 dark:bg-blue-800 dark:text-blue-200 dark:text-white"
            >
              {{ aggregatedStats.activeKeys }}/{{ aggregatedStats.totalKeys }}
            </span>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="text-center">
              <div class="text-lg font-bold text-gray-900 dark:text-gray-100">
                {{ aggregatedStats.totalKeys }}
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400">总计 Keys</div>
            </div>
            <div class="text-center">
              <div class="text-lg font-bold text-green-600">
                {{ aggregatedStats.activeKeys }}
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400">激活 Keys</div>
            </div>
          </div>
        </div>

        <!-- 聚合统计数据 -->
        <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
          <div class="mb-3 flex items-center">
            <i class="fas fa-chart-pie mr-2 text-purple-500" />
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">聚合统计摘要</span>
          </div>
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-600 dark:text-gray-400">
                <i class="fas fa-database mr-1 text-gray-400" />
                总请求数
              </span>
              <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                {{ formatNumber(aggregatedStats.usage.requests) }}
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-600 dark:text-gray-400">
                <i class="fas fa-coins mr-1 text-yellow-500" />
                总 Tokens
              </span>
              <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                {{ formatNumber(aggregatedStats.usage.allTokens) }}
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-600 dark:text-gray-400">
                <i class="fas fa-dollar-sign mr-1 text-green-500" />
                总费用
              </span>
              <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                {{ aggregatedStats.usage.formattedCost }}
              </span>
            </div>
          </div>
        </div>

        <!-- 无效 Keys 提示 -->
        <div
          v-if="invalidKeys && invalidKeys.length > 0"
          class="rounded-lg bg-red-50 p-3 text-sm dark:bg-red-900/20"
        >
          <i class="fas fa-exclamation-triangle mr-2 text-red-600 dark:text-red-400" />
          <span class="text-red-700 dark:text-red-300">
            {{ invalidKeys.length }} 个无效的 API Key
          </span>
        </div>

        <!-- 提示信息 -->
        <div
          class="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
        >
          <i class="fas fa-info-circle mr-1" />
          每个 API Key 有独立的限制设置,聚合模式下不显示单个限制配置
        </div>
      </div>

      <!-- ✅ REFACTORED: Using Design System Progress component -->
      <div v-if="!multiKeyMode" class="space-y-4 md:space-y-5">
        <!-- 每日费用限制 -->
        <div>
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600 dark:text-gray-400 md:text-base"
              >每日费用限制</span
            >
            <span class="text-xs text-gray-500 dark:text-gray-400 md:text-sm">
              <span v-if="statsData.limits.dailyCostLimit > 0">
                ${{ statsData.limits.currentDailyCost.toFixed(4) }} / ${{
                  statsData.limits.dailyCostLimit.toFixed(2)
                }}
              </span>
              <span v-else class="flex items-center gap-1">
                ${{ statsData.limits.currentDailyCost.toFixed(4) }} / <i class="fas fa-infinity" />
              </span>
            </span>
          </div>
          <!-- ✅ NEW: Design System Progress -->
          <Progress
            v-if="statsData.limits.dailyCostLimit > 0"
            size="md"
            :value="dailyCostPercentage"
            :variant="dailyCostVariant"
          />
          <Progress v-else size="md" :value="0" variant="success" />
        </div>

        <!-- 总费用限制 -->
        <div>
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600 dark:text-gray-400 md:text-base"
              >总费用限制</span
            >
            <span class="text-xs text-gray-500 dark:text-gray-400 md:text-sm">
              <span v-if="statsData.limits.totalCostLimit > 0">
                ${{ statsData.limits.currentTotalCost.toFixed(4) }} / ${{
                  statsData.limits.totalCostLimit.toFixed(2)
                }}
              </span>
              <span v-else class="flex items-center gap-1">
                ${{ statsData.limits.currentTotalCost.toFixed(4) }} /
                <i class="fas fa-infinity" />
              </span>
            </span>
          </div>
          <!-- ✅ NEW: Design System Progress -->
          <Progress
            v-if="statsData.limits.totalCostLimit > 0"
            size="md"
            :value="totalCostPercentage"
            :variant="totalCostVariant"
          />
          <Progress v-else size="md" :value="0" variant="default" />
        </div>

        <!-- Opus 模型周费用限制 -->
        <div v-if="statsData.limits.weeklyOpusCostLimit > 0">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600 dark:text-gray-400 md:text-base"
              >Opus 模型周费用限制</span
            >
            <span class="text-xs text-gray-500 dark:text-gray-400 md:text-sm">
              ${{ statsData.limits.weeklyOpusCost.toFixed(4) }} / ${{
                statsData.limits.weeklyOpusCostLimit.toFixed(2)
              }}
            </span>
          </div>
          <!-- ✅ NEW: Design System Progress -->
          <Progress size="md" :value="opusWeeklyCostPercentage" :variant="opusWeeklyCostVariant" />
        </div>

        <!-- 时间窗口限制 -->
        <div
          v-if="
            statsData.limits.rateLimitWindow > 0 &&
            (statsData.limits.rateLimitRequests > 0 ||
              statsData.limits.tokenLimit > 0 ||
              statsData.limits.rateLimitCost > 0)
          "
        >
          <WindowCountdown
            :current-window-requests="statsData.limits.currentWindowRequests"
            :current-window-cost="statsData.limits.currentWindowCost"
            :current-window-tokens="statsData.limits.currentWindowTokens"
            :last-used-time="statsData.limits.lastUsedTime"
            :rate-limit-cost="statsData.limits.rateLimitCost"
            :rate-limit-requests="statsData.limits.rateLimitRequests"
            :rate-limit-window="statsData.limits.rateLimitWindow"
            :token-limit="statsData.limits.tokenLimit"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Progress } from '@/ui'
import WindowCountdown from '../apikeys/WindowCountdown.vue'
import { formatNumber } from '@/utils/format'

const props = defineProps({
  statsData: {
    type: Object,
    required: true
  },
  multiKeyMode: {
    type: Boolean,
    default: false
  },
  aggregatedStats: {
    type: Object,
    default: null
  },
  invalidKeys: {
    type: Array,
    default: () => []
  }
})

// ✅ NEW: Business logic for progress calculations
// Helper function to determine variant based on percentage
const getVariantFromPercentage = (percentage) => {
  if (percentage >= 90) return 'error'
  if (percentage >= 70) return 'warning'
  return 'success'
}

// Daily cost calculations
const dailyCostPercentage = computed(() => {
  const limit = props.statsData.limits.dailyCostLimit
  const current = props.statsData.limits.currentDailyCost
  if (limit <= 0) return 0
  return Math.min((current / limit) * 100, 100)
})

const dailyCostVariant = computed(() => getVariantFromPercentage(dailyCostPercentage.value))

// Total cost calculations
const totalCostPercentage = computed(() => {
  const limit = props.statsData.limits.totalCostLimit
  const current = props.statsData.limits.currentTotalCost
  if (limit <= 0) return 0
  return Math.min((current / limit) * 100, 100)
})

const totalCostVariant = computed(() => getVariantFromPercentage(totalCostPercentage.value))

// Opus weekly cost calculations
const opusWeeklyCostPercentage = computed(() => {
  const limit = props.statsData.limits.weeklyOpusCostLimit
  const current = props.statsData.limits.weeklyOpusCost
  if (limit <= 0) return 0
  return Math.min((current / limit) * 100, 100)
})

const opusWeeklyCostVariant = computed(() =>
  getVariantFromPercentage(opusWeeklyCostPercentage.value)
)
</script>

<style scoped>
/* Removed old progress bar styles - now handled by Design System */
</style>
