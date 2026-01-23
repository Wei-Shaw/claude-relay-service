<template>
  <div class="card h-full p-4 md:p-6">
    <h3
      class="mb-3 flex flex-col text-lg font-bold text-gray-900 dark:text-gray-100 sm:flex-row sm:items-center md:mb-4 md:text-xl"
    >
      <span class="flex items-center">
        <i class="fas fa-chart-pie mr-2 text-sm text-orange-500 md:mr-3 md:text-base" />
        使用占比
      </span>
      <span class="text-xs font-normal text-gray-600 dark:text-gray-400 sm:ml-2 md:text-sm"
        >({{ statsPeriod === 'daily' ? '今日' : '本月' }})</span
      >
    </h3>

    <div v-if="aggregatedStats && individualStats.length > 0" class="space-y-2 md:space-y-3">
      <!-- 各Key使用占比列表 -->
      <div v-for="(stat, index) in topKeys" :key="stat.apiId" class="relative">
        <div class="mb-1 flex items-center justify-between text-sm">
          <span class="truncate font-medium text-gray-700 dark:text-gray-300">
            {{ stat.name || `Key ${index + 1}` }}
          </span>
          <span class="text-xs text-gray-600 dark:text-gray-400">
            {{ calculatePercentage(stat) }}%
          </span>
        </div>
        <div class="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            class="h-2 rounded-full transition-all duration-300"
            :class="getProgressColor(index)"
            :style="{ width: calculatePercentage(stat) + '%' }"
          />
        </div>
        <div
          class="mt-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
        >
          <span>{{ formatNumber(getStatUsage(stat)?.requests || 0) }}次</span>
          <span>{{ getStatUsage(stat)?.formattedCost || '$0.00' }}</span>
        </div>
      </div>

      <!-- 其他Keys汇总 -->
      <div v-if="otherKeysCount > 0" class="border-t border-gray-200 pt-2 dark:border-gray-700">
        <div class="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>其他 {{ otherKeysCount }} 个Keys</span>
          <span>{{ otherPercentage }}%</span>
        </div>
      </div>
    </div>

    <!-- 单个Key模式提示 -->
    <div
      v-else-if="!multiKeyMode"
      class="flex h-32 items-center justify-center text-sm text-gray-500 dark:text-gray-400"
    >
      <div class="text-center">
        <i class="fas fa-chart-pie mb-2 text-2xl" />
        <p>使用占比仅在多Key查询时显示</p>
      </div>
    </div>

    <div
      v-else
      class="flex h-32 items-center justify-center text-sm text-gray-500 dark:text-gray-400"
    >
      <i class="fas fa-chart-pie mr-2" />
      暂无数据
    </div>
  </div>
</template>

<script setup>
import { formatNumber } from '@/utils/tools'
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'

const apiStatsStore = useApiStatsStore()
const { aggregatedStats, individualStats, statsPeriod, multiKeyMode } = storeToRefs(apiStatsStore)

// 获取当前时间段的使用数据
const getStatUsage = (stat) => {
  if (!stat) return null

  if (statsPeriod.value === 'daily') {
    return stat.dailyUsage || stat.usage
  } else {
    return stat.monthlyUsage || stat.usage
  }
}

// 获取TOP Keys（最多显示5个）
const topKeys = computed(() => {
  if (!individualStats.value || individualStats.value.length === 0) return []

  return [...individualStats.value]
    .sort((a, b) => {
      const aUsage = getStatUsage(a)
      const bUsage = getStatUsage(b)
      return (bUsage?.cost || 0) - (aUsage?.cost || 0)
    })
    .slice(0, 5)
})

// 计算其他Keys数量
const otherKeysCount = computed(() => {
  if (!individualStats.value) return 0
  return Math.max(0, individualStats.value.length - 5)
})

// 计算其他Keys的占比
const otherPercentage = computed(() => {
  if (!individualStats.value || !aggregatedStats.value) return 0

  const topKeysCost = topKeys.value.reduce((sum, stat) => {
    const usage = getStatUsage(stat)
    return sum + (usage?.cost || 0)
  }, 0)
  const totalCost =
    statsPeriod.value === 'daily'
      ? aggregatedStats.value.dailyUsage?.cost || 0
      : aggregatedStats.value.monthlyUsage?.cost || 0

  if (totalCost === 0) return 0
  const otherCost = totalCost - topKeysCost
  return Math.max(0, Math.round((otherCost / totalCost) * 100))
})

// 计算单个Key的百分比
const calculatePercentage = (stat) => {
  if (!aggregatedStats.value) return 0

  const totalCost =
    statsPeriod.value === 'daily'
      ? aggregatedStats.value.dailyUsage?.cost || 0
      : aggregatedStats.value.monthlyUsage?.cost || 0

  if (totalCost === 0) return 0
  const usage = getStatUsage(stat)
  const percentage = ((usage?.cost || 0) / totalCost) * 100
  return Math.round(percentage)
}

// 获取进度条颜色
const getProgressColor = (index) => {
  const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-yellow-500', 'bg-pink-500']
  return colors[index] || 'bg-gray-400'
}

// 格式化数字
</script>

<style scoped>
/* 卡片样式 - 使用CSS变量 */
.card {
  background: var(--surface-color);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  box-shadow:
    0 10px 15px -3px rgba(0, 0, 0, 0.1),
    0 4px 6px -2px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
}

.card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.15),
    0 10px 10px -5px rgba(0, 0, 0, 0.08);
}

:global(.dark) .card:hover {
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.5),
    0 10px 10px -5px rgba(0, 0, 0, 0.35);
}
</style>
