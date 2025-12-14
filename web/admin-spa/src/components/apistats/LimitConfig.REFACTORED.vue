<template>
  <div class="vercel-limit-card">
    <div class="card-header">
      <div class="header-title">
        <i class="fas fa-shield-alt" />
        <span>{{ multiKeyMode ? '限制配置（聚合模式）' : '限制配置' }}</span>
      </div>
    </div>

    <div class="card-body">
      <!-- 多 Key 模式下的聚合统计信息 -->
      <div v-if="multiKeyMode && aggregatedStats" class="aggregated-stats">
        <!-- API Keys 概况 -->
        <div class="stat-section">
          <div class="section-header">
            <div class="section-title">
              <i class="fas fa-layer-group" />
              <span>API Keys 概况</span>
            </div>
            <div class="key-badge">
              {{ aggregatedStats.activeKeys }}/{{ aggregatedStats.totalKeys }}
            </div>
          </div>
          <div class="keys-grid">
            <div class="key-stat">
              <div class="stat-value">{{ aggregatedStats.totalKeys }}</div>
              <div class="stat-label">总计 Keys</div>
            </div>
            <div class="key-stat">
              <div class="stat-value stat-active">{{ aggregatedStats.activeKeys }}</div>
              <div class="stat-label">激活 Keys</div>
            </div>
          </div>
        </div>

        <!-- 聚合统计数据 -->
        <div class="stat-section">
          <div class="section-title">
            <i class="fas fa-chart-pie" />
            <span>聚合统计摘要</span>
          </div>
          <div class="usage-list">
            <div class="usage-item">
              <div class="usage-label">
                <i class="fas fa-database" />
                <span>总请求数</span>
              </div>
              <div class="usage-value">{{ formatNumber(aggregatedStats.usage.requests) }}</div>
            </div>
            <div class="usage-item">
              <div class="usage-label">
                <i class="fas fa-coins" />
                <span>总 Tokens</span>
              </div>
              <div class="usage-value">{{ formatNumber(aggregatedStats.usage.allTokens) }}</div>
            </div>
            <div class="usage-item">
              <div class="usage-label">
                <i class="fas fa-dollar-sign" />
                <span>总费用</span>
              </div>
              <div class="usage-value">{{ aggregatedStats.usage.formattedCost }}</div>
            </div>
          </div>
        </div>

        <!-- 无效 Keys 提示 -->
        <div v-if="invalidKeys && invalidKeys.length > 0" class="error-notice">
          <i class="fas fa-exclamation-triangle" />
          <span>{{ invalidKeys.length }} 个无效的 API Key</span>
        </div>

        <!-- 提示信息 -->
        <div class="info-notice">
          <i class="fas fa-info-circle" />
          <span>每个 API Key 有独立的限制设置，聚合模式下不显示单个限制配置</span>
        </div>
      </div>

      <!-- Single Key 模式限制配置 -->
      <div v-if="!multiKeyMode" class="limits-list">
        <!-- 每日费用限制 -->
        <div class="limit-item">
          <div class="limit-header">
            <span class="limit-label">每日费用限制</span>
            <span class="limit-value">
              <span v-if="statsData.limits.dailyCostLimit > 0">
                ${{ statsData.limits.currentDailyCost.toFixed(4) }} / ${{
                  statsData.limits.dailyCostLimit.toFixed(2)
                }}
              </span>
              <span v-else class="unlimited">
                ${{ statsData.limits.currentDailyCost.toFixed(4) }} / <i class="fas fa-infinity" />
              </span>
            </span>
          </div>
          <Progress
            v-if="statsData.limits.dailyCostLimit > 0"
            size="md"
            :value="dailyCostPercentage"
            :variant="dailyCostVariant"
          />
          <Progress v-else size="md" :value="0" variant="success" />
        </div>

        <!-- 总费用限制 -->
        <div class="limit-item">
          <div class="limit-header">
            <span class="limit-label">总费用限制</span>
            <span class="limit-value">
              <span v-if="statsData.limits.totalCostLimit > 0">
                ${{ statsData.limits.currentTotalCost.toFixed(4) }} / ${{
                  statsData.limits.totalCostLimit.toFixed(2)
                }}
              </span>
              <span v-else class="unlimited">
                ${{ statsData.limits.currentTotalCost.toFixed(4) }} / <i class="fas fa-infinity" />
              </span>
            </span>
          </div>
          <Progress
            v-if="statsData.limits.totalCostLimit > 0"
            size="md"
            :value="totalCostPercentage"
            :variant="totalCostVariant"
          />
          <Progress v-else size="md" :value="0" variant="default" />
        </div>

        <!-- Opus 模型周费用限制 -->
        <div v-if="statsData.limits.weeklyOpusCostLimit > 0" class="limit-item">
          <div class="limit-header">
            <span class="limit-label">Opus 模型周费用限制</span>
            <span class="limit-value">
              ${{ statsData.limits.weeklyOpusCost.toFixed(4) }} / ${{
                statsData.limits.weeklyOpusCostLimit.toFixed(2)
              }}
            </span>
          </div>
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
          class="limit-item"
        >
          <WindowCountdown
            :current-window-cost="statsData.limits.currentWindowCost"
            :current-window-requests="statsData.limits.currentWindowRequests"
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
/* ============================================
   VERCEL LIMIT CONFIG CARD
   ============================================ */
.vercel-limit-card {
  background: #fff;
  border: 1px solid #eaeaea;
  border-radius: 8px;
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
}

:global(.dark) .vercel-limit-card {
  background: #000;
  border-color: #333;
}

/* Card Header */
.card-header {
  padding: 24px;
  border-bottom: 1px solid #eaeaea;
}

:global(.dark) .card-header {
  border-bottom-color: #333;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 600;
  color: #000;
}

.header-title i {
  font-size: 18px;
  color: #ef4444;
}

:global(.dark) .header-title {
  color: #fff;
}

/* Card Body */
.card-body {
  padding: 24px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

@media (max-width: 768px) {
  .card-header,
  .card-body {
    padding: 20px;
  }
}

/* ============================================
   AGGREGATED STATS (Multi-Key Mode)
   ============================================ */
.aggregated-stats {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stat-section {
  padding: 16px;
  background: #fafafa;
  border: 1px solid #eaeaea;
  border-radius: 6px;
}

:global(.dark) .stat-section {
  background: #0a0a0a;
  border-color: #333;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #000;
}

.section-title i {
  font-size: 14px;
  color: #666;
}

:global(.dark) .section-title {
  color: #fff;
}

:global(.dark) .section-title i {
  color: #999;
}

.key-badge {
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #0284c7;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 12px;
}

:global(.dark) .key-badge {
  color: #7dd3fc;
  background: #082f49;
  border-color: #0c4a6e;
}

/* Keys Grid */
.keys-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.key-stat {
  text-align: center;
  padding: 12px;
  background: #fff;
  border: 1px solid #eaeaea;
  border-radius: 6px;
}

:global(.dark) .key-stat {
  background: #000;
  border-color: #333;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: #000;
  line-height: 1.2;
  margin-bottom: 4px;
}

.stat-value.stat-active {
  color: #10b981;
}

:global(.dark) .stat-value {
  color: #fff;
}

.stat-label {
  font-size: 12px;
  color: #666;
}

:global(.dark) .stat-label {
  color: #999;
}

/* Usage List */
.usage-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.usage-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: #fff;
  border: 1px solid #eaeaea;
  border-radius: 6px;
}

:global(.dark) .usage-item {
  background: #000;
  border-color: #333;
}

.usage-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #666;
}

.usage-label i {
  font-size: 14px;
}

:global(.dark) .usage-label {
  color: #999;
}

.usage-value {
  font-size: 14px;
  font-weight: 600;
  color: #000;
}

:global(.dark) .usage-value {
  color: #fff;
}

/* Error Notice */
.error-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  font-size: 13px;
  color: #dc2626;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
}

:global(.dark) .error-notice {
  color: #fca5a5;
  background: #450a0a;
  border-color: #991b1b;
}

/* Info Notice */
.info-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  font-size: 12px;
  color: #666;
  background: #fafafa;
  border: 1px solid #eaeaea;
  border-radius: 6px;
}

:global(.dark) .info-notice {
  color: #999;
  background: #0a0a0a;
  border-color: #333;
}

/* ============================================
   LIMITS LIST (Single Key Mode)
   ============================================ */
.limits-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.limit-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.limit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.limit-label {
  font-size: 14px;
  font-weight: 500;
  color: #666;
}

:global(.dark) .limit-label {
  color: #999;
}

.limit-value {
  font-size: 13px;
  font-weight: 600;
  color: #000;
  white-space: nowrap;
}

:global(.dark) .limit-value {
  color: #fff;
}

.limit-value .unlimited {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #666;
}

:global(.dark) .limit-value .unlimited {
  color: #999;
}

/* ============================================
   RESPONSIVE
   ============================================ */
@media (max-width: 768px) {
  .keys-grid {
    grid-template-columns: 1fr;
  }

  .limit-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
</style>
