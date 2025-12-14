<template>
  <div class="vercel-aggregated-card">
    <h3 class="card-title">
      <span class="title-text">
        <i class="fas fa-chart-pie title-icon" />
        使用占比
      </span>
      <span class="title-period">({{ statsPeriod === 'daily' ? '今日' : '本月' }})</span>
    </h3>

    <div v-if="aggregatedStats && individualStats.length > 0" class="keys-list">
      <!-- 各Key使用占比列表 -->
      <div v-for="(stat, index) in topKeys" :key="stat.apiId" class="key-item">
        <div class="key-header">
          <span class="key-name">{{ stat.name || `Key ${index + 1}` }}</span>
          <span class="key-percentage">{{ calculatePercentage(stat) }}%</span>
        </div>
        <Progress
          size="md"
          :value="calculatePercentage(stat)"
          :variant="getProgressVariant(index)"
        />
        <div class="key-stats">
          <span class="key-requests">{{ formatNumber(getStatUsage(stat)?.requests || 0) }}次</span>
          <span class="key-cost">{{ getStatUsage(stat)?.formattedCost || '$0.00' }}</span>
        </div>
      </div>

      <!-- 其他Keys汇总 -->
      <div v-if="otherKeysCount > 0" class="other-keys">
        <span class="other-label">其他 {{ otherKeysCount }} 个Keys</span>
        <span class="other-percentage">{{ otherPercentage }}%</span>
      </div>
    </div>

    <!-- 单个Key模式提示 -->
    <div v-else-if="!multiKeyMode" class="empty-state">
      <i class="fas fa-chart-pie empty-icon" />
      <p class="empty-text">使用占比仅在多Key查询时显示</p>
    </div>

    <div v-else class="empty-state">
      <i class="fas fa-chart-pie empty-icon" />
      <span class="empty-text">暂无数据</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'
import { Progress } from '@/ui'

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

// 获取进度条变体
const getProgressVariant = (index) => {
  const variants = ['success', 'success', 'default', 'warning', 'error']
  return variants[index] || 'default'
}

// 格式化数字
const formatNumber = (num) => {
  if (typeof num !== 'number') {
    num = parseInt(num) || 0
  }

  if (num === 0) return '0'

  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  } else {
    return num.toLocaleString()
  }
}
</script>

<style scoped>
/* ============================================
   VERCEL AGGREGATED STATS CARD
   ============================================ */
.vercel-aggregated-card {
  background: #fff;
  border: 1px solid #eaeaea;
  border-radius: 8px;
  padding: 24px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

:global(.dark) .vercel-aggregated-card {
  background: #000;
  border-color: #333;
}

@media (max-width: 768px) {
  .vercel-aggregated-card {
    padding: 20px;
  }
}

/* Card Title */
.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 4px;
}

.title-text {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 600;
  color: #000;
}

:global(.dark) .title-text {
  color: #fff;
}

.title-icon {
  font-size: 18px;
  color: #f97316;
}

:global(.dark) .title-icon {
  color: #fb923c;
}

.title-period {
  font-size: 13px;
  font-weight: 400;
  color: #666;
}

:global(.dark) .title-period {
  color: #999;
}

/* Keys List */
.keys-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.key-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.key-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.key-name {
  font-size: 14px;
  font-weight: 500;
  color: #000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

:global(.dark) .key-name {
  color: #fff;
}

.key-percentage {
  font-size: 13px;
  font-weight: 600;
  color: #666;
  flex-shrink: 0;
}

:global(.dark) .key-percentage {
  color: #999;
}

.key-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #999;
}

:global(.dark) .key-stats {
  color: #666;
}

.key-requests {
  font-weight: 500;
}

.key-cost {
  font-weight: 600;
  color: #10b981;
}

:global(.dark) .key-cost {
  color: #34d399;
}

/* Other Keys */
.other-keys {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: #fafafa;
  border: 1px solid #eaeaea;
  border-radius: 6px;
  font-size: 13px;
  color: #666;
}

:global(.dark) .other-keys {
  background: #0a0a0a;
  border-color: #333;
  color: #999;
}

.other-label {
  font-weight: 500;
}

.other-percentage {
  font-weight: 600;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  gap: 16px;
  min-height: 200px;
}

.empty-icon {
  font-size: 32px;
  color: #999;
}

:global(.dark) .empty-icon {
  color: #666;
}

.empty-text {
  font-size: 14px;
  color: #999;
  text-align: center;
}

:global(.dark) .empty-text {
  color: #666;
}
</style>
