<template>
  <div class="card p-3 sm:p-4 md:p-6">
    <div class="mb-2 sm:mb-3 md:mb-4">
      <h3
        class="flex flex-col text-base font-bold text-gray-900 dark:text-gray-100 sm:flex-row sm:items-center sm:text-lg md:text-xl"
      >
        <span class="flex items-center">
          <i class="fas fa-robot mr-2 text-sm text-indigo-500 md:mr-3 md:text-base" />
          模型使用统计
        </span>
        <span class="text-xs font-normal text-gray-600 dark:text-gray-400 sm:ml-2 md:text-sm"
          >({{ periodLabel }})</span
        >
      </h3>
    </div>

    <!-- 模型统计加载状态 -->
    <div v-if="loading" class="py-6 text-center md:py-8">
      <i
        class="fas fa-spinner loading-spinner mb-2 text-xl text-gray-600 dark:text-gray-400 md:text-2xl"
      />
      <p class="text-sm text-gray-600 dark:text-gray-400 md:text-base">加载模型统计数据中...</p>
    </div>

    <!-- 模型统计数据 -->
    <div v-else-if="stats.length > 0" class="space-y-2">
      <div v-for="(model, index) in stats" :key="index" class="model-usage-item">
        <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <h4
              class="cursor-pointer text-sm font-bold text-gray-900 hover:text-indigo-600 dark:text-gray-100 dark:hover:text-indigo-400"
              title="点击复制"
              @click="copyModelName(model.model)"
            >
              {{ model.model }}
              <i class="fas fa-copy ml-1 text-xs text-gray-400" />
            </h4>
            <div class="flex flex-wrap gap-x-2 text-xs text-gray-500 dark:text-gray-400">
              <span>{{ model.requests }}次</span>
              <span>输入:{{ formatNumber(model.inputTokens) }}</span>
              <span>输出:{{ formatNumber(model.outputTokens) }}</span>
              <span v-if="model.cacheCreateTokens"
                >缓存创建:{{ formatNumber(model.cacheCreateTokens) }}</span
              >
              <span v-if="model.cacheReadTokens"
                >缓存读取:{{ formatNumber(model.cacheReadTokens) }}</span
              >
            </div>
          </div>
          <div class="flex-shrink-0 text-xs sm:text-sm">
            <span class="text-gray-500">官方API</span>
            <span class="ml-1 font-semibold text-green-600">
              {{ model.formatted?.total || '$0.00' }}
            </span>
            <template v-if="serviceRates?.rates">
              <span class="ml-2 text-gray-500">计费</span>
              <span class="ml-1 font-semibold text-amber-600 dark:text-amber-400">
                {{ calculateCcCost(model) }}
              </span>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 无模型数据 -->
    <div v-else class="py-6 text-center text-gray-500 dark:text-gray-400 md:py-8">
      <i class="fas fa-chart-pie mb-3 text-2xl md:text-3xl" />
      <p class="text-sm md:text-base">暂无{{ periodLabel }}模型使用数据</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'
import { copyText, formatNumber } from '@/utils/tools'

const props = defineProps({
  period: {
    type: String,
    default: 'daily',
    validator: (value) => ['daily', 'monthly', 'alltime'].includes(value)
  }
})

const apiStatsStore = useApiStatsStore()
const { dailyModelStats, monthlyModelStats, alltimeModelStats, modelStatsLoading, serviceRates } =
  storeToRefs(apiStatsStore)

// 根据 period 选择对应的数据
const stats = computed(() => {
  if (props.period === 'daily') return dailyModelStats.value
  if (props.period === 'monthly') return monthlyModelStats.value
  if (props.period === 'alltime') return alltimeModelStats.value
  return []
})

const loading = computed(() => modelStatsLoading.value)

const periodLabel = computed(() => {
  if (props.period === 'daily') return '今日'
  if (props.period === 'monthly') return '本月'
  if (props.period === 'alltime') return '所有时间'
  return ''
})

// 复制模型名称
const copyModelName = (name) => copyText(name, '模型名称已复制')

// 根据模型名称判断服务类型
const getServiceFromModel = (model) => {
  if (!model) return 'claude'
  const m = model.toLowerCase()
  if (m.includes('claude') || m.includes('sonnet') || m.includes('opus') || m.includes('haiku'))
    return 'claude'
  if (m.includes('gpt') || m.includes('o1') || m.includes('o3') || m.includes('o4')) return 'codex'
  if (m.includes('gemini')) return 'gemini'
  if (m.includes('droid') || m.includes('factory')) return 'droid'
  if (m.includes('bedrock') || m.includes('amazon')) return 'bedrock'
  if (m.includes('azure')) return 'azure'
  return 'claude'
}

// 计算 CC 扣费
const calculateCcCost = (model) => {
  // 使用 isLegacy 判断是否有存储的计费费用
  if (!model.isLegacy && model.costs?.rated !== undefined) {
    const ccCost = model.costs.rated
    if (ccCost >= 1) return '$' + ccCost.toFixed(2)
    if (ccCost >= 0.01) return '$' + ccCost.toFixed(4)
    return '$' + ccCost.toFixed(6)
  }
  // 回退到重新计算（历史数据）
  const cost = model.costs?.total || 0
  if (!cost || !serviceRates.value?.rates) return '$0.00'
  const service = getServiceFromModel(model.model)
  const rate = serviceRates.value.rates[service] || 1.0
  const ccCost = cost * rate
  if (ccCost >= 1) return '$' + ccCost.toFixed(2)
  if (ccCost >= 0.01) return '$' + ccCost.toFixed(4)
  return '$' + ccCost.toFixed(6)
}

// 格式化数字
</script>

<style scoped>
/* 卡片样式 - 使用CSS变量 */
.card {
  background: var(--surface-color);
  border-radius: 16px;
  border: 1px solid var(--border-color);
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

:global(.dark) .card:hover {
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.5),
    0 10px 10px -5px rgba(0, 0, 0, 0.35);
}

/* 模型使用项样式 - 使用CSS变量 */
.model-usage-item {
  background: var(--surface-color);
  border: 1px solid var(--border-color);
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

:global(.dark) .model-usage-item:hover {
  box-shadow:
    0 10px 15px -3px rgba(0, 0, 0, 0.4),
    0 4px 6px -2px rgba(0, 0, 0, 0.25);
  border-color: rgba(75, 85, 99, 0.6);
}

/* 加载动画 */
.loading-spinner {
  animation: spin 1s linear infinite;
  filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.5));
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
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
