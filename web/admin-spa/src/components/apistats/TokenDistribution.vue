<template>
  <div class="card p-6">
    <h3 class="text-xl font-bold mb-4 flex items-center text-gray-900">
      <i class="fas fa-coins mr-3 text-yellow-500"></i>
      Token 使用分布 <span class="text-sm font-normal text-gray-600 ml-2">({{ statsPeriod === 'daily' ? '今日' : '本月' }})</span>
    </h3>
    <div class="space-y-3">
      <div class="flex justify-between items-center">
        <span class="text-gray-600 flex items-center">
          <i class="fas fa-arrow-right mr-2 text-green-500"></i>
          输入 Token
        </span>
        <span class="font-medium text-gray-900">{{ formatNumber(currentPeriodData.inputTokens) }}</span>
      </div>
      <div class="flex justify-between items-center">
        <span class="text-gray-600 flex items-center">
          <i class="fas fa-arrow-left mr-2 text-blue-500"></i>
          输出 Token
        </span>
        <span class="font-medium text-gray-900">{{ formatNumber(currentPeriodData.outputTokens) }}</span>
      </div>
      <div class="flex justify-between items-center">
        <span class="text-gray-600 flex items-center">
          <i class="fas fa-save mr-2 text-purple-500"></i>
          缓存创建 Token
        </span>
        <span class="font-medium text-gray-900">{{ formatNumber(currentPeriodData.cacheCreateTokens) }}</span>
      </div>
      <div class="flex justify-between items-center">
        <span class="text-gray-600 flex items-center">
          <i class="fas fa-download mr-2 text-orange-500"></i>
          缓存读取 Token
        </span>
        <span class="font-medium text-gray-900">{{ formatNumber(currentPeriodData.cacheReadTokens) }}</span>
      </div>
    </div>
    <div class="mt-4 pt-4 border-t border-gray-200">
      <div class="flex justify-between items-center font-bold text-gray-900">
        <span>{{ statsPeriod === 'daily' ? '今日' : '本月' }}总计</span>
        <span class="text-xl">{{ formatNumber(currentPeriodData.allTokens) }}</span>
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
</style>