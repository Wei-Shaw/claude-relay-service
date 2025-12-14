<template>
  <div class="model-card">
    <div class="card-header">
      <h3 class="card-title">
        <span class="title-text">
          <i class="fas fa-robot title-icon" />
          模型使用统计
        </span>
        <span class="title-period">({{ statsPeriod === 'daily' ? '今日' : '本月' }})</span>
      </h3>
    </div>

    <!-- 模型统计加载状态 -->
    <div v-if="modelStatsLoading" class="loading-state">
      <i class="fas fa-spinner loading-spinner" />
      <p class="loading-text">加载模型统计数据中...</p>
    </div>

    <!-- 模型统计数据 -->
    <div v-else-if="modelStats.length > 0" class="models-list">
      <div v-for="(model, index) in modelStats" :key="index" class="model-item">
        <div class="model-header">
          <div class="model-info">
            <h4 class="model-name">{{ model.model }}</h4>
            <p class="model-requests">{{ model.requests }} 次请求</p>
          </div>
          <div class="model-cost">
            <div class="cost-value">{{ model.formatted?.total || '$0.000000' }}</div>
            <div class="cost-label">总费用</div>
          </div>
        </div>

        <div class="model-stats">
          <div class="stat-box">
            <div class="stat-label">输入 Token</div>
            <div class="stat-value">{{ formatNumber(model.inputTokens) }}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">输出 Token</div>
            <div class="stat-value">{{ formatNumber(model.outputTokens) }}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">缓存创建</div>
            <div class="stat-value">{{ formatNumber(model.cacheCreateTokens) }}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">缓存读取</div>
            <div class="stat-value">{{ formatNumber(model.cacheReadTokens) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 无模型数据 -->
    <div v-else class="empty-state">
      <i class="fas fa-chart-pie empty-icon" />
      <p class="empty-text">暂无{{ statsPeriod === 'daily' ? '今日' : '本月' }}模型使用数据</p>
    </div>
  </div>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'

const apiStatsStore = useApiStatsStore()
const { statsPeriod, modelStats, modelStatsLoading } = storeToRefs(apiStatsStore)

// 格式化数字
const formatNumber = (num) => {
  if (typeof num !== 'number') {
    num = parseInt(num) || 0
  }

  if (num === 0) return '0'

  // 大数字使用简化格式
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
.model-card {
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-card);
  padding: var(--card-padding);
  display: flex;
  flex-direction: column;
  gap: var(--card-gap);
  box-shadow: var(--shadow-card);
}

@media (max-width: 768px) {
  .model-card {
    padding: var(--card-padding-sm);
  }
}

/* Card Header */
.card-header {
  margin-bottom: var(--space-1);
}

.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2);
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
  color: #6366f1;
}

:global(.dark) .title-icon {
  color: #818cf8;
}

.title-period {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-normal);
  color: var(--text-secondary);
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12) var(--space-6);
  gap: var(--space-4);
}

.loading-spinner {
  font-size: var(--font-size-3xl);
  color: var(--text-secondary);
  animation: spin 1s linear infinite;
}

.loading-text {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Models List */
.models-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* Model Item */
.model-item {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: var(--card-gap);
  transition: var(--transition-all);
}

.model-item:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-subtle);
}

@media (max-width: 768px) {
  .model-item {
    padding: var(--space-4);
  }
}

/* Model Header */
.model-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.model-info {
  flex: 1;
  min-width: 0;
}

.model-name {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  word-break: break-word;
  margin-bottom: var(--space-1);
}

.model-requests {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.model-cost {
  text-align: right;
  flex-shrink: 0;
}

.cost-value {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-green);
  margin-bottom: 2px;
}

:global(.dark) .cost-value {
  color: #34d399;
}

.cost-label {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

/* Model Stats */
.model-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
}

@media (min-width: 768px) {
  .model-stats {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 480px) {
  .model-stats {
    grid-template-columns: 1fr;
  }
}

.stat-box {
  padding: var(--space-3);
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
}

.stat-label {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin-bottom: var(--space-1);
}

.stat-value {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12) var(--space-6);
  gap: var(--space-4);
}

.empty-icon {
  font-size: var(--font-size-4xl);
  color: var(--text-muted);
}

.empty-text {
  font-size: var(--font-size-base);
  color: var(--text-muted);
}
</style>
