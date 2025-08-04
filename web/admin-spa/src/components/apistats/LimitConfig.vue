<template>
  <div>
    <!-- 限制配置 -->
    <div class="card p-4 md:p-6">
      <h3 class="text-lg md:text-xl font-bold mb-3 md:mb-4 flex items-center text-gray-900">
        <i class="fas fa-shield-alt mr-2 md:mr-3 text-red-500 text-sm md:text-base" />
        限制配置
      </h3>
      <div class="space-y-4 md:space-y-5">
        <!-- 每日费用限制 -->
        <div>
          <div class="flex justify-between items-center mb-2">
            <span class="text-gray-600 text-sm md:text-base font-medium">每日费用限制</span>
            <span class="text-xs md:text-sm text-gray-500">
              <span v-if="statsData.limits.dailyCostLimit > 0">
                ${{ statsData.limits.currentDailyCost.toFixed(4) }} / ${{ statsData.limits.dailyCostLimit.toFixed(2) }}
              </span>
              <span v-else class="flex items-center gap-1">
                ${{ statsData.limits.currentDailyCost.toFixed(4) }} / <i class="fas fa-infinity" />
              </span>
            </span>
          </div>
          <div v-if="statsData.limits.dailyCostLimit > 0" class="w-full bg-gray-200 rounded-full h-2">
            <div 
              :class="getDailyCostProgressColor()"
              class="h-2 rounded-full transition-all duration-300"
              :style="{ width: getDailyCostProgress() + '%' }"
            />
          </div>
          <div v-else class="w-full bg-gray-200 rounded-full h-2">
            <div class="bg-green-500 h-2 rounded-full" style="width: 0%" />
          </div>
        </div>
        
        <!-- 时间窗口限制 -->
        <div v-if="statsData.limits.rateLimitWindow > 0 && (statsData.limits.rateLimitRequests > 0 || statsData.limits.tokenLimit > 0)">
          <div class="flex justify-between items-center mb-2">
            <span class="text-gray-600 text-sm md:text-base font-medium">
              时间窗口限制 ({{ statsData.limits.rateLimitWindow }}分钟)
            </span>
          </div>
          
          <!-- 请求次数限制 -->
          <div v-if="statsData.limits.rateLimitRequests > 0" class="space-y-1.5 mb-3">
            <div class="flex justify-between items-center text-xs md:text-sm">
              <span class="text-gray-500">请求次数</span>
              <span class="text-gray-700">
                {{ formatNumber(statsData.limits.currentWindowRequests) }} / {{ formatNumber(statsData.limits.rateLimitRequests) }}
              </span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-1.5">
              <div 
                :class="getWindowRequestProgressColor()"
                class="h-1.5 rounded-full transition-all duration-300"
                :style="{ width: getWindowRequestProgress() + '%' }"
              />
            </div>
          </div>
          
          <!-- Token使用量限制 -->
          <div v-if="statsData.limits.tokenLimit > 0" class="space-y-1.5">
            <div class="flex justify-between items-center text-xs md:text-sm">
              <span class="text-gray-500">Token 使用量</span>
              <span class="text-gray-700">
                {{ formatNumber(statsData.limits.currentWindowTokens) }} / {{ formatNumber(statsData.limits.tokenLimit) }}
              </span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-1.5">
              <div 
                :class="getWindowTokenProgressColor()"
                class="h-1.5 rounded-full transition-all duration-300"
                :style="{ width: getWindowTokenProgress() + '%' }"
              />
            </div>
          </div>
          
          <div class="mt-2 text-xs text-gray-500">
            <i class="fas fa-info-circle mr-1" />
            请求次数和Token使用量为"或"的关系，任一达到限制即触发限流
          </div>
        </div>
        
        <!-- 其他限制信息 -->
        <div class="pt-2 border-t border-gray-100 space-y-2">
          <div class="flex justify-between items-center">
            <span class="text-gray-600 text-sm md:text-base">并发限制</span>
            <span class="font-medium text-gray-900 text-sm md:text-base">
              <span v-if="statsData.limits.concurrencyLimit > 0">
                {{ statsData.limits.concurrencyLimit }}
              </span>
              <span v-else class="flex items-center gap-1">
                <i class="fas fa-infinity text-gray-400" />
              </span>
            </span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-gray-600 text-sm md:text-base">模型限制</span>
            <span class="font-medium text-gray-900 text-sm md:text-base">
              <span
                v-if="statsData.restrictions.enableModelRestriction && statsData.restrictions.restrictedModels.length > 0" 
                class="text-orange-600"
              >
                <i class="fas fa-exclamation-triangle mr-1 text-xs md:text-sm" />
                限制 {{ statsData.restrictions.restrictedModels.length }} 个模型
              </span>
              <span
                v-else
                class="text-green-600"
              >
                <i class="fas fa-check-circle mr-1 text-xs md:text-sm" />
                允许所有模型
              </span>
            </span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-gray-600 text-sm md:text-base">客户端限制</span>
            <span class="font-medium text-gray-900 text-sm md:text-base">
              <span
                v-if="statsData.restrictions.enableClientRestriction && statsData.restrictions.allowedClients.length > 0" 
                class="text-orange-600"
              >
                <i class="fas fa-exclamation-triangle mr-1 text-xs md:text-sm" />
                限制 {{ statsData.restrictions.allowedClients.length }} 个客户端
              </span>
              <span
                v-else
                class="text-green-600"
              >
                <i class="fas fa-check-circle mr-1 text-xs md:text-sm" />
                允许所有客户端
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 详细限制信息 -->
    <div
      v-if="(statsData.restrictions.enableModelRestriction && statsData.restrictions.restrictedModels.length > 0) || 
        (statsData.restrictions.enableClientRestriction && statsData.restrictions.allowedClients.length > 0)" 
      class="card p-4 md:p-6 mt-4 md:mt-6"
    >
      <h3 class="text-lg md:text-xl font-bold mb-3 md:mb-4 flex items-center text-gray-900">
        <i class="fas fa-list-alt mr-2 md:mr-3 text-amber-500 text-sm md:text-base" />
        详细限制信息
      </h3>
      
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <!-- 模型限制详情 -->
        <div
          v-if="statsData.restrictions.enableModelRestriction && statsData.restrictions.restrictedModels.length > 0" 
          class="bg-amber-50 border border-amber-200 rounded-lg p-3 md:p-4"
        >
          <h4 class="font-bold text-amber-800 mb-2 md:mb-3 flex items-center text-sm md:text-base">
            <i class="fas fa-robot mr-1 md:mr-2 text-xs md:text-sm" />
            受限模型列表
          </h4>
          <div class="space-y-1 md:space-y-2">
            <div
              v-for="model in statsData.restrictions.restrictedModels" 
              :key="model" 
              class="bg-white rounded px-2 md:px-3 py-1 md:py-2 text-xs md:text-sm border border-amber-200"
            >
              <i class="fas fa-ban mr-1 md:mr-2 text-red-500 text-xs" />
              <span class="text-gray-800 break-all">{{ model }}</span>
            </div>
          </div>
          <p class="text-xs text-amber-700 mt-2 md:mt-3">
            <i class="fas fa-info-circle mr-1" />
            此 API Key 不能访问以上列出的模型
          </p>
        </div>
        
        <!-- 客户端限制详情 -->
        <div
          v-if="statsData.restrictions.enableClientRestriction && statsData.restrictions.allowedClients.length > 0" 
          class="bg-blue-50 border border-blue-200 rounded-lg p-3 md:p-4"
        >
          <h4 class="font-bold text-blue-800 mb-2 md:mb-3 flex items-center text-sm md:text-base">
            <i class="fas fa-desktop mr-1 md:mr-2 text-xs md:text-sm" />
            允许的客户端
          </h4>
          <div class="space-y-1 md:space-y-2">
            <div
              v-for="client in statsData.restrictions.allowedClients" 
              :key="client" 
              class="bg-white rounded px-2 md:px-3 py-1 md:py-2 text-xs md:text-sm border border-blue-200"
            >
              <i class="fas fa-check mr-1 md:mr-2 text-green-500 text-xs" />
              <span class="text-gray-800 break-all">{{ client }}</span>
            </div>
          </div>
          <p class="text-xs text-blue-700 mt-2 md:mt-3">
            <i class="fas fa-info-circle mr-1" />
            此 API Key 只能被以上列出的客户端使用
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'

const apiStatsStore = useApiStatsStore()
const { statsData } = storeToRefs(apiStatsStore)

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

// 获取每日费用进度
const getDailyCostProgress = () => {
  if (!statsData.value.limits.dailyCostLimit || statsData.value.limits.dailyCostLimit === 0) return 0
  const percentage = (statsData.value.limits.currentDailyCost / statsData.value.limits.dailyCostLimit) * 100
  return Math.min(percentage, 100)
}

// 获取每日费用进度条颜色
const getDailyCostProgressColor = () => {
  const progress = getDailyCostProgress()
  if (progress >= 100) return 'bg-red-500'
  if (progress >= 80) return 'bg-yellow-500'
  return 'bg-green-500'
}

// 获取窗口请求进度
const getWindowRequestProgress = () => {
  if (!statsData.value.limits.rateLimitRequests || statsData.value.limits.rateLimitRequests === 0) return 0
  const percentage = (statsData.value.limits.currentWindowRequests / statsData.value.limits.rateLimitRequests) * 100
  return Math.min(percentage, 100)
}

// 获取窗口请求进度条颜色
const getWindowRequestProgressColor = () => {
  const progress = getWindowRequestProgress()
  if (progress >= 100) return 'bg-red-500'
  if (progress >= 80) return 'bg-yellow-500'
  return 'bg-blue-500'
}

// 获取窗口Token进度
const getWindowTokenProgress = () => {
  if (!statsData.value.limits.tokenLimit || statsData.value.limits.tokenLimit === 0) return 0
  const percentage = (statsData.value.limits.currentWindowTokens / statsData.value.limits.tokenLimit) * 100
  return Math.min(percentage, 100)
}

// 获取窗口Token进度条颜色
const getWindowTokenProgressColor = () => {
  const progress = getWindowTokenProgress()
  if (progress >= 100) return 'bg-red-500'
  if (progress >= 80) return 'bg-yellow-500'
  return 'bg-purple-500'
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