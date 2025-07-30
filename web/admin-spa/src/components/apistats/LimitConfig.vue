<template>
  <div>
    <!-- 限制配置 -->
    <div class="card p-6">
      <h3 class="text-xl font-bold mb-4 flex items-center text-gray-900">
        <i class="fas fa-shield-alt mr-3 text-red-500" />
        限制配置
      </h3>
      <div class="space-y-3">
        <div class="flex justify-between items-center">
          <span class="text-gray-600">Token 限制</span>
          <span class="font-medium text-gray-900">{{ statsData.limits.tokenLimit > 0 ? formatNumber(statsData.limits.tokenLimit) : '无限制' }}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-gray-600">并发限制</span>
          <span class="font-medium text-gray-900">{{ statsData.limits.concurrencyLimit > 0 ? statsData.limits.concurrencyLimit : '无限制' }}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-gray-600">速率限制</span>
          <span class="font-medium text-gray-900">
            {{ statsData.limits.rateLimitRequests > 0 && statsData.limits.rateLimitWindow > 0 
              ? `${statsData.limits.rateLimitRequests}次/${statsData.limits.rateLimitWindow}分钟` 
              : '无限制' }}
          </span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-gray-600">每日费用限制</span>
          <span class="font-medium text-gray-900">{{ statsData.limits.dailyCostLimit > 0 ? '$' + statsData.limits.dailyCostLimit : '无限制' }}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-gray-600">模型限制</span>
          <span class="font-medium text-gray-900">
            <span
              v-if="statsData.restrictions.enableModelRestriction && statsData.restrictions.restrictedModels.length > 0" 
              class="text-orange-600"
            >
              <i class="fas fa-exclamation-triangle mr-1" />
              限制 {{ statsData.restrictions.restrictedModels.length }} 个模型
            </span>
            <span
              v-else
              class="text-green-600"
            >
              <i class="fas fa-check-circle mr-1" />
              允许所有模型
            </span>
          </span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-gray-600">客户端限制</span>
          <span class="font-medium text-gray-900">
            <span
              v-if="statsData.restrictions.enableClientRestriction && statsData.restrictions.allowedClients.length > 0" 
              class="text-orange-600"
            >
              <i class="fas fa-exclamation-triangle mr-1" />
              限制 {{ statsData.restrictions.allowedClients.length }} 个客户端
            </span>
            <span
              v-else
              class="text-green-600"
            >
              <i class="fas fa-check-circle mr-1" />
              允许所有客户端
            </span>
          </span>
        </div>
      </div>
    </div>

    <!-- 详细限制信息 -->
    <div
      v-if="(statsData.restrictions.enableModelRestriction && statsData.restrictions.restrictedModels.length > 0) || 
        (statsData.restrictions.enableClientRestriction && statsData.restrictions.allowedClients.length > 0)" 
      class="card p-6 mt-6"
    >
      <h3 class="text-xl font-bold mb-4 flex items-center text-gray-900">
        <i class="fas fa-list-alt mr-3 text-amber-500" />
        详细限制信息
      </h3>
      
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- 模型限制详情 -->
        <div
          v-if="statsData.restrictions.enableModelRestriction && statsData.restrictions.restrictedModels.length > 0" 
          class="bg-amber-50 border border-amber-200 rounded-lg p-4"
        >
          <h4 class="font-bold text-amber-800 mb-3 flex items-center">
            <i class="fas fa-robot mr-2" />
            受限模型列表
          </h4>
          <div class="space-y-2">
            <div
              v-for="model in statsData.restrictions.restrictedModels" 
              :key="model" 
              class="bg-white rounded px-3 py-2 text-sm border border-amber-200"
            >
              <i class="fas fa-ban mr-2 text-red-500" />
              <span class="text-gray-800">{{ model }}</span>
            </div>
          </div>
          <p class="text-xs text-amber-700 mt-3">
            <i class="fas fa-info-circle mr-1" />
            此 API Key 不能访问以上列出的模型
          </p>
        </div>
        
        <!-- 客户端限制详情 -->
        <div
          v-if="statsData.restrictions.enableClientRestriction && statsData.restrictions.allowedClients.length > 0" 
          class="bg-blue-50 border border-blue-200 rounded-lg p-4"
        >
          <h4 class="font-bold text-blue-800 mb-3 flex items-center">
            <i class="fas fa-desktop mr-2" />
            允许的客户端
          </h4>
          <div class="space-y-2">
            <div
              v-for="client in statsData.restrictions.allowedClients" 
              :key="client" 
              class="bg-white rounded px-3 py-2 text-sm border border-blue-200"
            >
              <i class="fas fa-check mr-2 text-green-500" />
              <span class="text-gray-800">{{ client }}</span>
            </div>
          </div>
          <p class="text-xs text-blue-700 mt-3">
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