<template>
  <div class="flex h-full flex-col">
    <div class="token-card">
      <h3 class="card-title">
        <span class="title-text">
          <i class="fas fa-coins title-icon" />
          Token 使用分布
        </span>
        <span class="title-period">({{ statsPeriod === 'daily' ? '今日' : '本月' }})</span>
      </h3>
      <div class="token-list">
        <div class="token-item">
          <span class="token-label">
            <i class="fas fa-arrow-right token-icon token-icon-green" />
            输入 Token
          </span>
          <span class="token-value">{{ formatNumber(currentPeriodData.inputTokens) }}</span>
        </div>
        <div class="token-item">
          <span class="token-label">
            <i class="fas fa-arrow-left token-icon token-icon-blue" />
            输出 Token
          </span>
          <span class="token-value">{{ formatNumber(currentPeriodData.outputTokens) }}</span>
        </div>
        <div class="token-item">
          <span class="token-label">
            <i class="fas fa-save token-icon token-icon-purple" />
            缓存创建 Token
          </span>
          <span class="token-value">{{ formatNumber(currentPeriodData.cacheCreateTokens) }}</span>
        </div>
        <div class="token-item">
          <span class="token-label">
            <i class="fas fa-download token-icon token-icon-orange" />
            缓存读取 Token
          </span>
          <span class="token-value">{{ formatNumber(currentPeriodData.cacheReadTokens) }}</span>
        </div>
      </div>
      <div class="card-footer">
        <div class="footer-content">
          <span class="footer-label">{{ statsPeriod === 'daily' ? '今日' : '本月' }}总计</span>
          <span class="footer-value">{{ formatNumber(currentPeriodData.allTokens) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'

const apiStatsStore = useApiStatsStore()
const { statsPeriod, currentPeriodData } = storeToRefs(apiStatsStore)

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
.token-card {
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
  .token-card {
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
  color: #374151;
}

:global(.dark) .title-icon {
  color: #9ca3af;
}

.title-period {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-normal);
  color: var(--text-secondary);
}

/* Token List */
.token-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.token-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  transition: var(--transition-all);
}

.token-item:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-subtle);
}

.token-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium);
}

.token-icon {
  font-size: var(--font-size-base);
}

.token-icon-green {
  color: var(--color-green);
}

:global(.dark) .token-icon-green {
  color: #34d399;
}

.token-icon-blue {
  color: #3b82f6;
}

:global(.dark) .token-icon-blue {
  color: #60a5fa;
}

.token-icon-purple {
  color: #8b5cf6;
}

:global(.dark) .token-icon-purple {
  color: #a78bfa;
}

.token-icon-orange {
  color: #f97316;
}

:global(.dark) .token-icon-orange {
  color: #fb923c;
}

.token-value {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

/* Card Footer */
.card-footer {
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-default);
}

.footer-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.footer-label {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.footer-value {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .title-text {
    font-size: var(--font-size-lg);
  }

  .title-icon {
    font-size: var(--font-size-lg);
  }

  .token-item {
    padding: 10px;
  }

  .footer-value {
    font-size: var(--font-size-xl);
  }
}
</style>
