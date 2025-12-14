<template>
  <div class="aggregated-card">
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
.aggregated-card {
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-card);
  padding: var(--card-padding);
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--card-gap);
  box-shadow: var(--shadow-card);
}

@media (max-width: 768px) {
  .aggregated-card {
    padding: var(--card-padding-sm);
  }
}

/* Card Title */
.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.title-text {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.title-icon {
  font-size: var(--font-size-xl);
  color: #f97316;
}

:global(.dark) .title-icon {
  color: #fb923c;
}

.title-period {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-normal);
  color: var(--text-secondary);
}

/* Keys List */
.keys-list {
  display: flex;
  flex-direction: column;
  gap: var(--card-gap);
}

.key-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.key-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.key-name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.key-percentage {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  flex-shrink: 0;
}

.key-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.key-requests {
  font-weight: var(--font-weight-medium);
}

.key-cost {
  font-weight: var(--font-weight-semibold);
  color: var(--color-green);
}

:global(.dark) .key-cost {
  color: #34d399;
}

/* Other Keys */
.other-keys {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.other-label {
  font-weight: var(--font-weight-medium);
}

.other-percentage {
  font-weight: var(--font-weight-semibold);
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12) var(--space-6);
  gap: var(--space-4);
  min-height: 200px;
}

.empty-icon {
  font-size: var(--font-size-4xl);
  color: var(--text-muted);
}

.empty-text {
  font-size: var(--font-size-base);
  color: var(--text-muted);
  text-align: center;
}
</style>
