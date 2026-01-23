<template>
  <div v-if="serviceRates && modelStats.length > 0" class="card p-3 sm:p-4 md:p-6">
    <h3
      class="mb-2 flex items-center justify-between text-base font-bold text-gray-900 dark:text-gray-100 sm:mb-3 sm:text-lg md:mb-4 md:text-xl"
    >
      <span class="flex items-center">
        <i class="fas fa-coins mr-2 text-sm text-amber-500 md:mr-3 md:text-base" />
        服务费用统计
      </span>
      <span class="text-xs font-normal text-gray-500 dark:text-gray-400">
        计费 = 官方费用 × 全局倍率 × Key倍率
      </span>
    </h3>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div
        v-for="service in serviceStats"
        :key="service.name"
        class="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50"
      >
        <!-- 服务名和倍率 -->
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {{ service.label }}
          </span>
          <div class="flex items-center gap-1">
            <span
              class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              title="全局倍率"
            >
              全局 {{ service.globalRate }}x
            </span>
            <span
              v-if="!multiKeyMode"
              class="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
              title="Key倍率"
            >
              Key {{ service.keyRate }}x
            </span>
          </div>
        </div>

        <!-- Token 详情 -->
        <div class="mb-2 space-y-0.5 text-xs text-gray-600 dark:text-gray-400">
          <div class="flex justify-between">
            <span>输入</span>
            <span class="text-gray-900 dark:text-gray-200">{{
              formatNumber(service.inputTokens)
            }}</span>
          </div>
          <div class="flex justify-between">
            <span>输出</span>
            <span class="text-gray-900 dark:text-gray-200">{{
              formatNumber(service.outputTokens)
            }}</span>
          </div>
          <div v-if="service.cacheCreateTokens" class="flex justify-between">
            <span>缓存创建</span>
            <span class="text-gray-900 dark:text-gray-200">{{
              formatNumber(service.cacheCreateTokens)
            }}</span>
          </div>
          <div v-if="service.cacheReadTokens" class="flex justify-between">
            <span>缓存读取</span>
            <span class="text-gray-900 dark:text-gray-200">{{
              formatNumber(service.cacheReadTokens)
            }}</span>
          </div>
        </div>

        <!-- 费用 -->
        <div class="mb-2 space-y-0.5 border-t border-gray-200 pt-2 text-xs dark:border-gray-700">
          <div class="flex justify-between">
            <span class="text-gray-600 dark:text-gray-400">官方API</span>
            <span class="font-semibold text-green-600 dark:text-green-400">
              {{ service.officialCost }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600 dark:text-gray-400">计费费用</span>
            <span class="font-semibold text-amber-600 dark:text-amber-400">
              {{ service.ccCost }}
            </span>
          </div>
        </div>

        <!-- 价格参考 -->
        <div
          v-if="service.pricing"
          class="space-y-0.5 border-t border-gray-200 pt-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-500"
        >
          <div class="flex justify-between">
            <span>输入</span>
            <span>{{ service.pricing.input }}/M</span>
          </div>
          <div class="flex justify-between">
            <span>输出</span>
            <span>{{ service.pricing.output }}/M</span>
          </div>
          <div v-if="service.pricing.cacheCreate" class="flex justify-between">
            <span>缓存创建</span>
            <span>{{ service.pricing.cacheCreate }}/M</span>
          </div>
          <div v-if="service.pricing.cacheRead" class="flex justify-between">
            <span>缓存读取</span>
            <span>{{ service.pricing.cacheRead }}/M</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { formatNumber } from '@/utils/tools'
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'

const apiStatsStore = useApiStatsStore()
const { modelStats, serviceRates, keyServiceRates, multiKeyMode } = storeToRefs(apiStatsStore)

// 服务标签映射
const serviceLabels = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  droid: 'Droid',
  bedrock: 'Bedrock',
  azure: 'Azure',
  ccr: 'CCR'
}

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

// 按服务聚合统计
const serviceStats = computed(() => {
  if (!serviceRates.value?.rates || !modelStats.value?.length) return []

  const stats = {}

  // 初始化所有服务
  Object.keys(serviceRates.value.rates).forEach((service) => {
    stats[service] = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreateTokens: 0,
      cacheReadTokens: 0,
      realCost: 0,
      ratedCost: 0,
      pricing: null
    }
  })

  // 聚合模型数据 - 按模型逐个计算计费费用
  modelStats.value.forEach((model) => {
    const service = getServiceFromModel(model.model)
    if (stats[service]) {
      stats[service].inputTokens += model.inputTokens || 0
      stats[service].outputTokens += model.outputTokens || 0
      stats[service].cacheCreateTokens += model.cacheCreateTokens || 0
      stats[service].cacheReadTokens += model.cacheReadTokens || 0
      // 累加官方费用
      const modelRealCost = model.costs?.real ?? model.costs?.total ?? 0
      stats[service].realCost += modelRealCost
      // 按模型判断：有存储费用用存储的，否则用当前倍率计算
      const globalRate = serviceRates.value.rates[service] || 1.0
      const keyRate = multiKeyMode.value ? 1.0 : (keyServiceRates.value?.[service] ?? 1.0)
      const modelRatedCost =
        !model.isLegacy && model.costs?.rated !== undefined
          ? model.costs.rated
          : modelRealCost * globalRate * keyRate
      stats[service].ratedCost += modelRatedCost
      if (!stats[service].pricing && model.pricing) {
        stats[service].pricing = model.pricing
      }
    }
  })

  // 转换为数组
  return Object.entries(stats)
    .filter(
      ([, data]) =>
        data.inputTokens > 0 ||
        data.outputTokens > 0 ||
        data.cacheCreateTokens > 0 ||
        data.realCost > 0
    )
    .map(([service, data]) => {
      const globalRate = serviceRates.value.rates[service] || 1.0
      const keyRate = multiKeyMode.value ? 1.0 : (keyServiceRates.value?.[service] ?? 1.0)
      const p = data.pricing
      return {
        name: service,
        label: serviceLabels[service] || service,
        globalRate: globalRate,
        keyRate: keyRate,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        cacheCreateTokens: data.cacheCreateTokens,
        cacheReadTokens: data.cacheReadTokens,
        officialCost: formatCost(data.realCost),
        ccCost: formatCost(data.ratedCost),
        pricing: p
          ? {
              input: formatCost(p.input),
              output: formatCost(p.output),
              cacheCreate: p.cacheCreate ? formatCost(p.cacheCreate) : null,
              cacheRead: p.cacheRead ? formatCost(p.cacheRead) : null
            }
          : null
      }
    })
    .sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens))
})

// 格式化费用
const formatCost = (cost) => {
  if (!cost || cost === 0) return '$0.00'
  if (cost >= 1) return '$' + cost.toFixed(2)
  if (cost >= 0.01) return '$' + cost.toFixed(4)
  return '$' + cost.toFixed(6)
}

// 格式化数字
</script>

<style scoped>
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
</style>
