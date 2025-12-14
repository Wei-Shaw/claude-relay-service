<template>
  <div class="vercel-model-card">
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
/* ============================================
   VERCEL MODEL USAGE STATS CARD
   ============================================ */
.vercel-model-card {
  background: #fff;
  border: 1px solid #eaeaea;
  border-radius: 8px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

:global(.dark) .vercel-model-card {
  background: #000;
  border-color: #333;
}

@media (max-width: 768px) {
  .vercel-model-card {
    padding: 20px;
  }
}

/* Card Header */
.card-header {
  margin-bottom: 4px;
}

.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
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
  color: #6366f1;
}

:global(.dark) .title-icon {
  color: #818cf8;
}

.title-period {
  font-size: 13px;
  font-weight: 400;
  color: #666;
}

:global(.dark) .title-period {
  color: #999;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  gap: 16px;
}

.loading-spinner {
  font-size: 24px;
  color: #666;
  animation: spin 1s linear infinite;
}

:global(.dark) .loading-spinner {
  color: #999;
}

.loading-text {
  font-size: 14px;
  color: #666;
}

:global(.dark) .loading-text {
  color: #999;
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
  gap: 16px;
}

/* Model Item */
.model-item {
  background: #fafafa;
  border: 1px solid #eaeaea;
  border-radius: 6px;
  padding: 20px;
  transition: all 0.15s ease;
}

.model-item:hover {
  background: #f5f5f5;
  border-color: #ddd;
}

:global(.dark) .model-item {
  background: #0a0a0a;
  border-color: #333;
}

:global(.dark) .model-item:hover {
  background: #111;
  border-color: #444;
}

@media (max-width: 768px) {
  .model-item {
    padding: 16px;
  }
}

/* Model Header */
.model-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.model-info {
  flex: 1;
  min-width: 0;
}

.model-name {
  font-size: 16px;
  font-weight: 600;
  color: #000;
  word-break: break-word;
  margin-bottom: 4px;
}

:global(.dark) .model-name {
  color: #fff;
}

.model-requests {
  font-size: 13px;
  color: #666;
}

:global(.dark) .model-requests {
  color: #999;
}

.model-cost {
  text-align: right;
  flex-shrink: 0;
}

.cost-value {
  font-size: 16px;
  font-weight: 600;
  color: #10b981;
  margin-bottom: 2px;
}

:global(.dark) .cost-value {
  color: #34d399;
}

.cost-label {
  font-size: 12px;
  color: #666;
}

:global(.dark) .cost-label {
  color: #999;
}

/* Model Stats */
.model-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
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
  padding: 12px;
  background: #fff;
  border: 1px solid #eaeaea;
  border-radius: 6px;
}

:global(.dark) .stat-box {
  background: #000;
  border-color: #333;
}

.stat-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

:global(.dark) .stat-label {
  color: #999;
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
  color: #000;
}

:global(.dark) .stat-value {
  color: #fff;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  gap: 16px;
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
}

:global(.dark) .empty-text {
  color: #666;
}
</style>
