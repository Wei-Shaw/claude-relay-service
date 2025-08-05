<template>
  <Teleport to="body">
    <div 
      v-if="show" 
      class="fixed inset-0 modal z-50 flex items-center justify-center p-3 sm:p-4"
    >
      <!-- 背景遮罩 -->
      <div 
        class="fixed inset-0 bg-gray-900 bg-opacity-50 backdrop-blur-sm" 
        @click="close"
      />
      
      <!-- 模态框 -->
      <div class="modal-content w-[95%] sm:w-full max-w-2xl sm:max-w-3xl p-4 sm:p-6 md:p-8 mx-auto max-h-[90vh] flex flex-col relative">
        <!-- 标题栏 -->
        <div class="flex items-center justify-between mb-4 sm:mb-6">
          <div class="flex items-center gap-2 sm:gap-3">
            <div class="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg sm:rounded-xl flex items-center justify-center">
              <i class="fas fa-chart-line text-white text-sm sm:text-base" />
            </div>
            <h3 class="text-lg sm:text-xl font-bold text-gray-900">
              使用统计详情 - {{ apiKey.name }}
            </h3>
          </div>
          <button 
            class="text-gray-400 hover:text-gray-600 transition-colors p-1"
            @click="close"
          >
            <i class="fas fa-times text-lg sm:text-xl" />
          </button>
        </div>
        
        <!-- 内容区 -->
        <div class="modal-scroll-content custom-scrollbar flex-1 overflow-y-auto">
          <!-- 总体统计卡片 -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <!-- 请求统计卡片 -->
            <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
              <div class="flex items-center justify-between mb-3">
                <span class="text-sm font-medium text-gray-700">总请求数</span>
                <i class="fas fa-paper-plane text-blue-500" />
              </div>
              <div class="text-2xl font-bold text-gray-900">
                {{ formatNumber(totalRequests) }}
              </div>
              <div class="text-xs text-gray-600 mt-1">
                今日: {{ formatNumber(dailyRequests) }} 次
              </div>
            </div>

            <!-- Token统计卡片 -->
            <div class="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
              <div class="flex items-center justify-between mb-3">
                <span class="text-sm font-medium text-gray-700">总Token数</span>
                <i class="fas fa-coins text-green-500" />
              </div>
              <div class="text-2xl font-bold text-gray-900">
                {{ formatTokenCount(totalTokens) }}
              </div>
              <div class="text-xs text-gray-600 mt-1">
                今日: {{ formatTokenCount(dailyTokens) }}
              </div>
            </div>

            <!-- 费用统计卡片 -->
            <div class="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
              <div class="flex items-center justify-between mb-3">
                <span class="text-sm font-medium text-gray-700">总费用</span>
                <i class="fas fa-dollar-sign text-yellow-600" />
              </div>
              <div class="text-2xl font-bold text-gray-900">
                ${{ totalCost.toFixed(4) }}
              </div>
              <div class="text-xs text-gray-600 mt-1">
                今日: ${{ dailyCost.toFixed(4) }}
              </div>
            </div>

            <!-- 平均统计卡片 -->
            <div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
              <div class="flex items-center justify-between mb-3">
                <span class="text-sm font-medium text-gray-700">平均速率</span>
                <i class="fas fa-tachometer-alt text-purple-500" />
              </div>
              <div class="text-sm space-y-1">
                <div class="flex justify-between">
                  <span class="text-gray-600">RPM:</span>
                  <span class="font-semibold">{{ rpm }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">TPM:</span>
                  <span class="font-semibold">{{ tpm }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Token详细分布 -->
          <div class="mb-6">
            <h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center">
              <i class="fas fa-chart-pie text-indigo-500 mr-2" />
              Token 使用分布
            </h4>
            <div class="bg-gray-50 rounded-lg p-4 space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center">
                  <i class="fas fa-arrow-down text-green-500 mr-2" />
                  <span class="text-sm text-gray-600">输入 Token</span>
                </div>
                <span class="text-sm font-semibold text-gray-900">
                  {{ formatTokenCount(inputTokens) }}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <div class="flex items-center">
                  <i class="fas fa-arrow-up text-blue-500 mr-2" />
                  <span class="text-sm text-gray-600">输出 Token</span>
                </div>
                <span class="text-sm font-semibold text-gray-900">
                  {{ formatTokenCount(outputTokens) }}
                </span>
              </div>
              <div
                v-if="cacheCreateTokens > 0"
                class="flex items-center justify-between"
              >
                <div class="flex items-center">
                  <i class="fas fa-save text-purple-500 mr-2" />
                  <span class="text-sm text-gray-600">缓存创建 Token</span>
                </div>
                <span class="text-sm font-semibold text-purple-600">
                  {{ formatTokenCount(cacheCreateTokens) }}
                </span>
              </div>
              <div
                v-if="cacheReadTokens > 0"
                class="flex items-center justify-between"
              >
                <div class="flex items-center">
                  <i class="fas fa-download text-purple-500 mr-2" />
                  <span class="text-sm text-gray-600">缓存读取 Token</span>
                </div>
                <span class="text-sm font-semibold text-purple-600">
                  {{ formatTokenCount(cacheReadTokens) }}
                </span>
              </div>
            </div>
          </div>

          <!-- 限制信息 -->
          <div
            v-if="hasLimits"
            class="mb-6"
          >
            <h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center">
              <i class="fas fa-shield-alt text-red-500 mr-2" />
              限制设置
            </h4>
            <div class="bg-gray-50 rounded-lg p-4 space-y-3">
              <div
                v-if="apiKey.dailyCostLimit > 0"
                class="space-y-2"
              >
                <div class="flex items-center justify-between text-sm">
                  <span class="text-gray-600">每日费用限制</span>
                  <span class="font-semibold text-gray-900">
                    ${{ apiKey.dailyCostLimit.toFixed(2) }}
                  </span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    class="h-2 rounded-full transition-all duration-300"
                    :class="dailyCostPercentage >= 100 ? 'bg-red-500' : dailyCostPercentage >= 80 ? 'bg-yellow-500' : 'bg-green-500'"
                    :style="{ width: Math.min(dailyCostPercentage, 100) + '%' }"
                  />
                </div>
                <div class="text-xs text-gray-500 text-right">
                  已使用 {{ dailyCostPercentage.toFixed(1) }}%
                </div>
              </div>

              <div
                v-if="apiKey.concurrencyLimit > 0"
                class="flex items-center justify-between text-sm"
              >
                <span class="text-gray-600">并发限制</span>
                <span class="font-semibold text-purple-600">
                  {{ apiKey.currentConcurrency || 0 }} / {{ apiKey.concurrencyLimit }}
                </span>
              </div>

              <div
                v-if="apiKey.rateLimitWindow > 0"
                class="space-y-2"
              >
                <div class="flex items-center justify-between text-sm">
                  <span class="text-gray-600">时间窗口</span>
                  <span class="font-semibold text-indigo-600">
                    {{ apiKey.rateLimitWindow }} 分钟
                  </span>
                </div>
                
                <!-- 请求次数限制 -->
                <div
                  v-if="apiKey.rateLimitRequests > 0"
                  class="space-y-1"
                >
                  <div class="flex items-center justify-between text-sm">
                    <span class="text-gray-600">请求限制</span>
                    <span class="font-semibold text-gray-900">
                      {{ apiKey.currentWindowRequests || 0 }} / {{ apiKey.rateLimitRequests }}
                    </span>
                  </div>
                  <div class="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      class="h-2 rounded-full transition-all duration-300"
                      :class="windowRequestProgressColor"
                      :style="{ width: windowRequestProgress + '%' }"
                    />
                  </div>
                </div>
                
                <!-- Token使用量限制 -->
                <div
                  v-if="apiKey.tokenLimit > 0"
                  class="space-y-1"
                >
                  <div class="flex items-center justify-between text-sm">
                    <span class="text-gray-600">Token限制</span>
                    <span class="font-semibold text-gray-900">
                      {{ formatTokenCount(apiKey.currentWindowTokens || 0) }} / {{ formatTokenCount(apiKey.tokenLimit) }}
                    </span>
                  </div>
                  <div class="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      class="h-2 rounded-full transition-all duration-300"
                      :class="windowTokenProgressColor"
                      :style="{ width: windowTokenProgress + '%' }"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="mt-4 sm:mt-6 flex justify-end gap-2 sm:gap-3">
          <button
            type="button"
            class="btn btn-secondary px-4 py-2 text-sm"
            @click="close"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    required: true
  },
  apiKey: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close'])

// 计算属性
const totalRequests = computed(() => (props.apiKey.usage?.total?.requests) || 0)
const dailyRequests = computed(() => (props.apiKey.usage?.daily?.requests) || 0)
const totalTokens = computed(() => (props.apiKey.usage?.total?.tokens) || 0)
const dailyTokens = computed(() => (props.apiKey.usage?.daily?.tokens) || 0)
const totalCost = computed(() => (props.apiKey.usage?.total?.cost) || 0)
const dailyCost = computed(() => props.apiKey.dailyCost || 0)
const inputTokens = computed(() => (props.apiKey.usage?.total?.inputTokens) || 0)
const outputTokens = computed(() => (props.apiKey.usage?.total?.outputTokens) || 0)
const cacheCreateTokens = computed(() => (props.apiKey.usage?.total?.cacheCreateTokens) || 0)
const cacheReadTokens = computed(() => (props.apiKey.usage?.total?.cacheReadTokens) || 0)
const rpm = computed(() => (props.apiKey.usage?.averages?.rpm) || 0)
const tpm = computed(() => (props.apiKey.usage?.averages?.tpm) || 0)

const hasLimits = computed(() => {
  return props.apiKey.dailyCostLimit > 0 || 
         props.apiKey.concurrencyLimit > 0 || 
         props.apiKey.rateLimitWindow > 0 ||
         props.apiKey.tokenLimit > 0
})

const dailyCostPercentage = computed(() => {
  if (!props.apiKey.dailyCostLimit || props.apiKey.dailyCostLimit === 0) return 0
  return (dailyCost.value / props.apiKey.dailyCostLimit) * 100
})

// 窗口请求进度
const windowRequestProgress = computed(() => {
  if (!props.apiKey.rateLimitRequests || props.apiKey.rateLimitRequests === 0) return 0
  const percentage = ((props.apiKey.currentWindowRequests || 0) / props.apiKey.rateLimitRequests) * 100
  return Math.min(percentage, 100)
})

const windowRequestProgressColor = computed(() => {
  const progress = windowRequestProgress.value
  if (progress >= 100) return 'bg-red-500'
  if (progress >= 80) return 'bg-yellow-500'
  return 'bg-blue-500'
})

// 窗口Token进度
const windowTokenProgress = computed(() => {
  if (!props.apiKey.tokenLimit || props.apiKey.tokenLimit === 0) return 0
  const percentage = ((props.apiKey.currentWindowTokens || 0) / props.apiKey.tokenLimit) * 100
  return Math.min(percentage, 100)
})

const windowTokenProgressColor = computed(() => {
  const progress = windowTokenProgress.value
  if (progress >= 100) return 'bg-red-500'
  if (progress >= 80) return 'bg-yellow-500'
  return 'bg-purple-500'
})

// 方法
const formatNumber = (num) => {
  if (!num && num !== 0) return '0'
  return num.toLocaleString('zh-CN')
}

// 格式化Token数量（使用K/M单位）
const formatTokenCount = (count) => {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M'
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K'
  }
  return count.toString()
}

const close = () => {
  emit('close')
}
</script>

<style scoped>
/* 使用项目的通用样式，不需要额外定义 */
</style>