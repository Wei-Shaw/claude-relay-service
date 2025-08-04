<template>
  <div class="card p-4 md:p-6">
    <div class="mb-4 md:mb-6">
      <h3 class="text-lg md:text-xl font-bold flex flex-col sm:flex-row sm:items-center text-gray-900">
        <span class="flex items-center">
          <i class="fas fa-robot mr-2 md:mr-3 text-indigo-500 text-sm md:text-base" />
          模型使用统计
        </span>
        <span class="text-xs md:text-sm font-normal text-gray-600 sm:ml-2">({{ statsPeriod === 'daily' ? '今日' : '本月' }})</span>
      </h3>
    </div>

    <!-- 模型统计加载状态 -->
    <div
      v-if="modelStatsLoading"
      class="text-center py-6 md:py-8"
    >
      <i class="fas fa-spinner loading-spinner text-xl md:text-2xl mb-2 text-gray-600" />
      <p class="text-gray-600 text-sm md:text-base">
        加载模型统计数据中...
      </p>
    </div>

    <!-- 模型统计数据 -->
    <div
      v-else-if="modelStats.length > 0"
      class="space-y-3 md:space-y-4"
    >
      <div 
        v-for="(model, index) in modelStats" 
        :key="index"
        class="model-usage-item"
      >
        <div class="flex justify-between items-start mb-2 md:mb-3">
          <div class="flex-1 min-w-0">
            <h4 class="font-bold text-base md:text-lg text-gray-900 break-all">
              {{ model.model }}
            </h4>
            <p class="text-gray-600 text-xs md:text-sm">
              {{ model.requests }} 次请求
            </p>
          </div>
          <div class="text-right flex-shrink-0 ml-3">
            <div class="text-base md:text-lg font-bold text-green-600">
              {{ model.formatted?.total || '$0.000000' }}
            </div>
            <div class="text-xs md:text-sm text-gray-600">
              总费用
            </div>
          </div>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 text-xs md:text-sm">
          <div class="bg-gray-50 rounded p-2">
            <div class="text-gray-600">
              输入 Token
            </div>
            <div class="font-medium text-gray-900">
              {{ formatNumber(model.inputTokens) }}
            </div>
          </div>
          <div class="bg-gray-50 rounded p-2">
            <div class="text-gray-600">
              输出 Token
            </div>
            <div class="font-medium text-gray-900">
              {{ formatNumber(model.outputTokens) }}
            </div>
          </div>
          <div class="bg-gray-50 rounded p-2">
            <div class="text-gray-600">
              缓存创建
            </div>
            <div class="font-medium text-gray-900">
              {{ formatNumber(model.cacheCreateTokens) }}
            </div>
          </div>
          <div class="bg-gray-50 rounded p-2">
            <div class="text-gray-600">
              缓存读取
            </div>
            <div class="font-medium text-gray-900">
              {{ formatNumber(model.cacheReadTokens) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 无模型数据 -->
    <div
      v-else
      class="text-center py-6 md:py-8 text-gray-500"
    >
      <i class="fas fa-chart-pie text-2xl md:text-3xl mb-3" />
      <p class="text-sm md:text-base">
        暂无{{ statsPeriod === 'daily' ? '今日' : '本月' }}模型使用数据
      </p>
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
/* 卡片样式 */
.card {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
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

/* 模型使用项样式 */
.model-usage-item {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 12px;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

@media (min-width: 768px) {
  .model-usage-item {
    padding: 16px;
  }
}

.model-usage-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
}

.model-usage-item:hover {
  transform: translateY(-2px);
  box-shadow: 
    0 10px 15px -3px rgba(0, 0, 0, 0.1),
    0 4px 6px -2px rgba(0, 0, 0, 0.05);
  border-color: rgba(255, 255, 255, 0.3);
}

/* 加载动画 */
.loading-spinner {
  animation: spin 1s linear infinite;
  filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.5));
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 响应式优化 */
@media (max-width: 768px) {
  .model-usage-item .grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 480px) {
  .model-usage-item {
    padding: 10px;
  }
  
  .model-usage-item .grid {
    grid-template-columns: 1fr;
  }
}
</style>