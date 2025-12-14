<template>
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
  background: #fff;
  border: 1px solid #eaeaea;
  border-radius: 8px;
  padding: 24px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

:global(.dark) .token-card {
  background: #000;
  border-color: #333;
}

@media (max-width: 768px) {
  .token-card {
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
  color: #f59e0b;
}

:global(.dark) .title-icon {
  color: #fbbf24;
}

.title-period {
  font-size: 13px;
  font-weight: 400;
  color: #666;
}

:global(.dark) .title-period {
  color: #999;
}

/* Token List */
.token-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.token-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: #fafafa;
  border: 1px solid #eaeaea;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.token-item:hover {
  background: #f5f5f5;
  border-color: #ddd;
}

:global(.dark) .token-item {
  background: #0a0a0a;
  border-color: #333;
}

:global(.dark) .token-item:hover {
  background: #111;
  border-color: #444;
}

.token-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #666;
  font-weight: 500;
}

:global(.dark) .token-label {
  color: #999;
}

.token-icon {
  font-size: 14px;
}

.token-icon-green {
  color: #10b981;
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
  font-size: 15px;
  font-weight: 600;
  color: #000;
}

:global(.dark) .token-value {
  color: #fff;
}

/* Card Footer */
.card-footer {
  padding-top: 16px;
  border-top: 1px solid #eaeaea;
}

:global(.dark) .card-footer {
  border-top-color: #333;
}

.footer-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.footer-label {
  font-size: 14px;
  font-weight: 600;
  color: #000;
}

:global(.dark) .footer-label {
  color: #fff;
}

.footer-value {
  font-size: 20px;
  font-weight: 700;
  color: #000;
}

:global(.dark) .footer-value {
  color: #fff;
}

@media (max-width: 768px) {
  .title-text {
    font-size: 16px;
  }

  .title-icon {
    font-size: 16px;
  }

  .token-item {
    padding: 10px;
  }

  .footer-value {
    font-size: 18px;
  }
}
</style>
