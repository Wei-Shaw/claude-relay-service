<template>
  <div>
    <!-- 状态卡片 -->
    <div
      class="mb-6 rounded-xl border border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 dark:border-gray-700 dark:from-blue-900/20 dark:to-indigo-900/20"
    >
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div
            class="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
          >
            <i class="fas fa-coins text-xl" />
          </div>
          <div>
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
              {{ t('adminUtility.modelPricing.modelCount') }}
              <span class="font-bold text-blue-600 dark:text-blue-400">{{ modelCount }}</span>
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {{ t('adminUtility.modelPricing.lastUpdated', { time: lastUpdated }) }}
            </p>
          </div>
        </div>
        <button
          :class="[
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition',
            refreshing
              ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
              : 'bg-blue-500 text-white hover:bg-blue-600 hover:shadow-md'
          ]"
          :disabled="refreshing"
          @click="handleRefresh"
        >
          <i :class="['fas', refreshing ? 'fa-spinner fa-spin' : 'fa-sync-alt']" />
          {{
            refreshing
              ? t('adminUtility.modelPricing.refreshing')
              : t('adminUtility.modelPricing.refreshNow')
          }}
        </button>
      </div>
    </div>

    <!-- 搜索 + 平台筛选 -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <div class="relative flex-1">
        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          v-model="searchQuery"
          class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 placeholder-gray-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          :placeholder="t('adminUtility.modelPricing.searchPlaceholder')"
          type="text"
        />
      </div>
      <div class="flex gap-1">
        <button
          v-for="tab in localizedPlatformTabs"
          :key="tab.key"
          :class="[
            'rounded-lg px-3 py-2 text-xs font-medium transition',
            activePlatform === tab.key
              ? 'bg-blue-500 text-white shadow-sm'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
          ]"
          @click="activePlatform = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="py-12 text-center">
      <i class="fas fa-spinner fa-spin mb-4 text-2xl text-blue-500" />
      <p class="text-gray-500 dark:text-gray-400">
        {{ t('adminUtility.modelPricing.loading') }}
      </p>
    </div>

    <!-- 表格 -->
    <div v-else class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table class="min-w-full text-sm">
        <thead class="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th
              class="cursor-pointer px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              @click="toggleSort('name')"
            >
              {{ t('adminUtility.modelPricing.modelName') }}
              <i
                v-if="sortField === 'name'"
                :class="['fas ml-1', sortAsc ? 'fa-sort-up' : 'fa-sort-down']"
              />
            </th>
            <th
              class="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              @click="toggleSort('input')"
            >
              {{ t('adminUtility.modelPricing.inputPrice') }}
              <i
                v-if="sortField === 'input'"
                :class="['fas ml-1', sortAsc ? 'fa-sort-up' : 'fa-sort-down']"
              />
            </th>
            <th
              class="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              @click="toggleSort('output')"
            >
              {{ t('adminUtility.modelPricing.outputPrice') }}
              <i
                v-if="sortField === 'output'"
                :class="['fas ml-1', sortAsc ? 'fa-sort-up' : 'fa-sort-down']"
              />
            </th>
            <th
              class="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 md:table-cell"
            >
              {{ t('adminUtility.modelPricing.cacheCreate') }}
            </th>
            <th
              class="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 md:table-cell"
            >
              {{ t('adminUtility.modelPricing.cacheRead') }}
            </th>
            <th
              class="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 lg:table-cell"
            >
              {{ t('adminUtility.modelPricing.contextWindow') }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
          <tr
            v-for="model in sortedModels"
            :key="model.name"
            class="transition hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            <td class="whitespace-nowrap px-3 py-2.5">
              <div class="font-medium text-gray-900 dark:text-gray-100">{{ model.name }}</div>
              <div v-if="model.provider" class="text-xs text-gray-400">{{ model.provider }}</div>
            </td>
            <td
              class="whitespace-nowrap px-3 py-2.5 text-right font-mono text-gray-700 dark:text-gray-300"
            >
              {{ formatPrice(model.inputCost) }}
            </td>
            <td
              class="whitespace-nowrap px-3 py-2.5 text-right font-mono text-gray-700 dark:text-gray-300"
            >
              {{ formatPrice(model.outputCost) }}
            </td>
            <td
              class="hidden whitespace-nowrap px-3 py-2.5 text-right font-mono text-gray-500 dark:text-gray-400 md:table-cell"
            >
              {{ formatPrice(model.cacheCreateCost) }}
            </td>
            <td
              class="hidden whitespace-nowrap px-3 py-2.5 text-right font-mono text-gray-500 dark:text-gray-400 md:table-cell"
            >
              {{ formatPrice(model.cacheReadCost) }}
            </td>
            <td
              class="hidden whitespace-nowrap px-3 py-2.5 text-right text-gray-500 dark:text-gray-400 lg:table-cell"
            >
              {{ formatContext(model.maxTokens) }}
            </td>
          </tr>
          <tr v-if="sortedModels.length === 0">
            <td class="px-3 py-8 text-center text-gray-500 dark:text-gray-400" colspan="6">
              <i class="fas fa-search mb-2 text-2xl text-gray-300 dark:text-gray-600" />
              <p>{{ t('adminUtility.modelPricing.noMatches') }}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 模型数量统计 -->
    <div v-if="!loading" class="mt-3 text-right text-xs text-gray-400 dark:text-gray-500">
      {{
        t('adminUtility.modelPricing.showing', {
          shown: sortedModels.length,
          total: allModels.length
        })
      }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  getModelPricingApi,
  getModelPricingStatusApi,
  refreshModelPricingApi
} from '@/utils/http_apis'
import { showToast } from '@/utils/tools'

const { t, locale } = useI18n()

// ========== 状态 ==========
const loading = ref(false)
const refreshing = ref(false)
const pricingData = ref({})
const pricingStatus = ref({})
const searchQuery = ref('')
const activePlatform = ref('all')
const sortField = ref('name')
const sortAsc = ref(true)

const platformTabs = [
  { key: 'all', labelKey: 'adminUtility.modelPricing.all' },
  { key: 'claude', label: 'Claude' },
  { key: 'gemini', label: 'Gemini' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'other', labelKey: 'adminUtility.modelPricing.other' }
]

const localizedPlatformTabs = computed(() =>
  platformTabs.map((tab) => ({
    ...tab,
    label: tab.labelKey ? t(tab.labelKey) : tab.label
  }))
)

// ========== 计算属性 ==========
const modelCount = computed(() => Object.keys(pricingData.value).length)

const lastUpdated = computed(() => {
  if (!pricingStatus.value.lastUpdated) return t('adminUtility.modelPricing.unknown')
  return new Date(pricingStatus.value.lastUpdated).toLocaleString(
    locale.value === 'zh-CN' ? 'zh-CN' : 'en-US'
  )
})

const allModels = computed(() =>
  Object.entries(pricingData.value).map(([name, data]) => ({
    name,
    provider: detectProvider(name),
    inputCost: (data.input_cost_per_token || 0) * 1e6,
    outputCost: (data.output_cost_per_token || 0) * 1e6,
    cacheCreateCost: (data.cache_creation_input_token_cost || 0) * 1e6,
    cacheReadCost: (data.cache_read_input_token_cost || 0) * 1e6,
    maxTokens: data.max_tokens || data.max_output_tokens || 0
  }))
)

const filteredModels = computed(() => {
  let models = allModels.value

  // 平台筛选
  if (activePlatform.value !== 'all') {
    const platformFilters = {
      claude: (n) => n.includes('claude'),
      gemini: (n) => n.includes('gemini'),
      openai: (n) =>
        n.includes('gpt') ||
        n.includes('o1') ||
        n.includes('o3') ||
        n.includes('o4') ||
        n.includes('codex'),
      other: (n) =>
        !n.includes('claude') &&
        !n.includes('gemini') &&
        !n.includes('gpt') &&
        !n.includes('o1') &&
        !n.includes('o3') &&
        !n.includes('o4') &&
        !n.includes('codex')
    }
    const filter = platformFilters[activePlatform.value]
    if (filter) models = models.filter((m) => filter(m.name.toLowerCase()))
  }

  // 搜索筛选
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    models = models.filter((m) => m.name.toLowerCase().includes(q))
  }

  return models
})

const sortedModels = computed(() => {
  const models = [...filteredModels.value]
  const fieldMap = {
    name: (m) => m.name,
    input: (m) => m.inputCost,
    output: (m) => m.outputCost
  }
  const getter = fieldMap[sortField.value]
  if (!getter) return models

  models.sort((a, b) => {
    const va = getter(a)
    const vb = getter(b)
    if (typeof va === 'string') return sortAsc.value ? va.localeCompare(vb) : vb.localeCompare(va)
    return sortAsc.value ? va - vb : vb - va
  })
  return models
})

// ========== 方法 ==========
const detectProvider = (name) => {
  const n = name.toLowerCase()
  if (n.includes('claude')) return 'Anthropic'
  if (n.includes('gemini')) return 'Google'
  if (
    n.includes('gpt') ||
    n.includes('o1') ||
    n.includes('o3') ||
    n.includes('o4') ||
    n.includes('codex')
  )
    return 'OpenAI'
  if (n.includes('deepseek')) return 'DeepSeek'
  if (n.includes('llama') || n.includes('meta')) return 'Meta'
  if (n.includes('mistral')) return 'Mistral'
  return ''
}

const formatPrice = (price) => {
  if (!price || price === 0) return '-'
  if (price < 0.01) return `$${price.toFixed(4)}`
  if (price < 1) return `$${price.toFixed(3)}`
  return `$${price.toFixed(2)}`
}

const formatContext = (tokens) => {
  if (!tokens) return '-'
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`
  return String(tokens)
}

const toggleSort = (field) => {
  if (sortField.value === field) {
    sortAsc.value = !sortAsc.value
  } else {
    sortField.value = field
    sortAsc.value = true
  }
}

const loadData = async () => {
  loading.value = true
  const [pricingResult, statusResult] = await Promise.all([
    getModelPricingApi(),
    getModelPricingStatusApi()
  ])
  if (pricingResult.success) {
    pricingData.value = pricingResult.data
  } else {
    showToast(pricingResult.message || t('adminUtility.modelPricing.loadFailed'), 'error')
  }
  if (statusResult.success) {
    pricingStatus.value = statusResult.data
  } else {
    showToast(statusResult.message || t('adminUtility.modelPricing.statusFailed'), 'error')
  }
  loading.value = false
}

const handleRefresh = async () => {
  refreshing.value = true
  const result = await refreshModelPricingApi()
  if (result.success) {
    showToast(t('adminUtility.modelPricing.refreshed'), 'success')
    await loadData()
  } else {
    showToast(result.message || t('adminUtility.modelPricing.refreshFailed'), 'error')
  }
  refreshing.value = false
}

onMounted(loadData)
</script>
