<template>
  <div>
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
              Effective 模型数:
              <span class="font-bold text-blue-600 dark:text-blue-400">{{ modelCount }}</span>
              <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">
                自定义 {{ customModelCount }}
              </span>
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              系统更新: {{ lastUpdated }}
              <span class="ml-2">自定义更新: {{ customLastUpdated }}</span>
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            class="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600 hover:shadow-md"
            type="button"
            @click="openCreatePricing"
          >
            <i class="fas fa-plus" />
            添加自定义价格
          </button>
          <button
            :class="[
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition',
              refreshing
                ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                : 'bg-blue-500 text-white hover:bg-blue-600 hover:shadow-md'
            ]"
            :disabled="refreshing"
            type="button"
            @click="handleRefresh"
          >
            <i :class="['fas', refreshing ? 'fa-spinner fa-spin' : 'fa-sync-alt']" />
            {{ refreshing ? '刷新中...' : '刷新系统价格' }}
          </button>
        </div>
      </div>
    </div>

    <div class="mb-4 flex flex-wrap items-center gap-3">
      <div class="relative min-w-64 flex-1">
        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          v-model="searchQuery"
          class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 placeholder-gray-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          placeholder="搜索模型名称..."
          type="text"
        />
      </div>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="tab in platformTabs"
          :key="tab.key"
          :class="[
            'rounded-lg px-3 py-2 text-xs font-medium transition',
            activePlatform === tab.key
              ? 'bg-blue-500 text-white shadow-sm'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
          ]"
          type="button"
          @click="activePlatform = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="py-12 text-center">
      <i class="fas fa-spinner fa-spin mb-4 text-2xl text-blue-500" />
      <p class="text-gray-500 dark:text-gray-400">加载价格数据中...</p>
    </div>

    <div v-else class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table class="min-w-full text-sm">
        <thead class="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th
              class="cursor-pointer px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              @click="toggleSort('name')"
            >
              模型名称
              <i
                v-if="sortField === 'name'"
                :class="['fas ml-1', sortAsc ? 'fa-sort-up' : 'fa-sort-down']"
              />
            </th>
            <th
              class="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              @click="toggleSort('input')"
            >
              输入 $/MTok
              <i
                v-if="sortField === 'input'"
                :class="['fas ml-1', sortAsc ? 'fa-sort-up' : 'fa-sort-down']"
              />
            </th>
            <th
              class="cursor-pointer px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              @click="toggleSort('output')"
            >
              输出 $/MTok
              <i
                v-if="sortField === 'output'"
                :class="['fas ml-1', sortAsc ? 'fa-sort-up' : 'fa-sort-down']"
              />
            </th>
            <th
              class="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 md:table-cell"
            >
              缓存创建
            </th>
            <th
              class="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 md:table-cell"
            >
              缓存读取
            </th>
            <th
              class="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 lg:table-cell"
            >
              上下文窗口
            </th>
            <th
              class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
            >
              来源
            </th>
            <th
              class="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
            >
              操作
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
            <td class="whitespace-nowrap px-3 py-2.5">
              <span
                class="rounded-full px-2 py-1 text-xs font-semibold"
                :class="sourceBadgeClass(model.source)"
              >
                {{ sourceLabel(model.source) }}
              </span>
            </td>
            <td class="whitespace-nowrap px-3 py-2.5 text-right">
              <button
                class="rounded-lg px-2 py-1 text-xs font-medium text-blue-600 transition hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30"
                type="button"
                @click="openEditPricing(model)"
              >
                编辑
              </button>
              <button
                v-if="model.hasCustomPricing"
                class="ml-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                type="button"
                @click="deleteCustomPricing(model)"
              >
                恢复系统价
              </button>
            </td>
          </tr>
          <tr v-if="sortedModels.length === 0">
            <td class="px-3 py-8 text-center text-gray-500 dark:text-gray-400" colspan="8">
              <i class="fas fa-search mb-2 text-2xl text-gray-300 dark:text-gray-600" />
              <p>没有匹配的模型</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!loading" class="mt-3 text-right text-xs text-gray-400 dark:text-gray-500">
      显示 {{ sortedModels.length }} / {{ allModels.length }} 个模型
    </div>

    <Teleport to="body">
      <div
        v-if="showPricingEditor"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      >
        <div
          class="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800"
        >
          <div class="mb-5 flex items-start justify-between gap-4">
            <div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {{ editingOriginalModel ? '编辑自定义价格' : '添加自定义价格' }}
              </h3>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                价格按 $/MTok 输入，保存时会写入 custom_model_pricing.json。
              </p>
            </div>
            <button
              class="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
              type="button"
              @click="closePricingEditor"
            >
              <i class="fas fa-times" />
            </button>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="md:col-span-2">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                模型名称
              </label>
              <input
                v-model.trim="pricingForm.model"
                class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:disabled:bg-gray-700/60"
                :disabled="!!editingOriginalModel"
                placeholder="例如 glm-5.1"
                type="text"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                输入 $/MTok
              </label>
              <input
                v-model.number="pricingForm.inputCost"
                class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                min="0"
                step="0.000001"
                type="number"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                输出 $/MTok
              </label>
              <input
                v-model.number="pricingForm.outputCost"
                class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                min="0"
                step="0.000001"
                type="number"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                缓存创建 $/MTok
              </label>
              <input
                v-model.number="pricingForm.cacheCreateCost"
                class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                min="0"
                step="0.000001"
                type="number"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                缓存读取 $/MTok
              </label>
              <input
                v-model.number="pricingForm.cacheReadCost"
                class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                min="0"
                step="0.000001"
                type="number"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Provider
              </label>
              <input
                v-model.trim="pricingForm.provider"
                class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder="例如 z_ai / moonshot"
                type="text"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                上下文窗口
              </label>
              <input
                v-model.number="pricingForm.maxTokens"
                class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                min="0"
                step="1"
                type="number"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Mode
              </label>
              <input
                v-model.trim="pricingForm.mode"
                class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder="chat"
                type="text"
              />
            </div>

            <label class="mt-7 flex cursor-pointer items-center gap-2 text-sm dark:text-gray-300">
              <input
                v-model="pricingForm.supportsPromptCaching"
                class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                type="checkbox"
              />
              支持 prompt cache
            </label>

            <div class="md:col-span-2">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                来源 URL
              </label>
              <input
                v-model.trim="pricingForm.sourceUrl"
                class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder="官方价格页面 URL"
                type="text"
              />
            </div>
          </div>

          <div class="mt-6 flex justify-end gap-2">
            <button
              class="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              type="button"
              @click="closePricingEditor"
            >
              取消
            </button>
            <button
              class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="savingPricing"
              type="button"
              @click="saveCustomPricing"
            >
              <i v-if="savingPricing" class="fas fa-spinner fa-spin mr-2" />
              保存
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  deleteCustomModelPricingApi,
  getModelPricingApi,
  getModelPricingStatusApi,
  refreshModelPricingApi,
  updateCustomModelPricingApi
} from '@/utils/http_apis'
import { showToast } from '@/utils/tools'

const loading = ref(false)
const refreshing = ref(false)
const savingPricing = ref(false)
const showPricingEditor = ref(false)
const editingOriginalModel = ref('')
const pricingData = ref({})
const pricingStatus = ref({})
const searchQuery = ref('')
const activePlatform = ref('all')
const sortField = ref('name')
const sortAsc = ref(true)

const createEmptyPricingForm = () => ({
  model: '',
  provider: '',
  inputCost: null,
  outputCost: null,
  cacheCreateCost: null,
  cacheReadCost: null,
  maxTokens: null,
  mode: 'chat',
  sourceUrl: '',
  supportsPromptCaching: false
})

const pricingForm = ref(createEmptyPricingForm())

const platformTabs = [
  { key: 'all', label: '全部' },
  { key: 'custom', label: '自定义' },
  { key: 'claude', label: 'Claude' },
  { key: 'gemini', label: 'Gemini' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'other', label: '其他' }
]

const modelCount = computed(() => Object.keys(pricingData.value).length)
const customModelCount = computed(() => pricingStatus.value.customModelCount || 0)

const lastUpdated = computed(() => formatDateTime(pricingStatus.value.lastUpdated))
const customLastUpdated = computed(() => formatDateTime(pricingStatus.value.customLastUpdated))

const allModels = computed(() =>
  Object.entries(pricingData.value).map(([name, data]) => ({
    name,
    provider: data.litellm_provider || detectProvider(name),
    inputCost: tokenToMillion(data.input_cost_per_token),
    outputCost: tokenToMillion(data.output_cost_per_token),
    cacheCreateCost: tokenToMillion(data.cache_creation_input_token_cost),
    cacheReadCost: tokenToMillion(data.cache_read_input_token_cost),
    maxTokens: data.max_tokens || data.max_output_tokens || 0,
    source: data.__pricingSource || data.pricing_source || 'system',
    hasCustomPricing: data.__hasCustomPricing === true,
    raw: data
  }))
)

const filteredModels = computed(() => {
  let models = allModels.value

  if (activePlatform.value !== 'all') {
    const platformFilters = {
      custom: (_name, model) => model.hasCustomPricing,
      claude: (name) => name.includes('claude'),
      gemini: (name) => name.includes('gemini'),
      openai: (name) =>
        name.includes('gpt') ||
        name.includes('o1') ||
        name.includes('o3') ||
        name.includes('o4') ||
        name.includes('codex'),
      other: (name) =>
        !name.includes('claude') &&
        !name.includes('gemini') &&
        !name.includes('gpt') &&
        !name.includes('o1') &&
        !name.includes('o3') &&
        !name.includes('o4') &&
        !name.includes('codex')
    }
    const filter = platformFilters[activePlatform.value]
    if (filter) {
      models = models.filter((model) => filter(model.name.toLowerCase(), model))
    }
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    models = models.filter((model) => model.name.toLowerCase().includes(query))
  }

  return models
})

const sortedModels = computed(() => {
  const models = [...filteredModels.value]
  const fieldMap = {
    name: (model) => model.name,
    input: (model) => model.inputCost,
    output: (model) => model.outputCost
  }
  const getter = fieldMap[sortField.value]
  if (!getter) return models

  models.sort((left, right) => {
    const leftValue = getter(left)
    const rightValue = getter(right)
    if (typeof leftValue === 'string') {
      return sortAsc.value
        ? leftValue.localeCompare(rightValue)
        : rightValue.localeCompare(leftValue)
    }
    return sortAsc.value ? leftValue - rightValue : rightValue - leftValue
  })
  return models
})

const formatDateTime = (value) => {
  if (!value) return '未知'
  return new Date(value).toLocaleString('zh-CN')
}

const tokenToMillion = (value) => (Number(value || 0) || 0) * 1e6
const millionToToken = (value) => Number(value) / 1e6

const detectProvider = (name) => {
  const normalized = name.toLowerCase()
  if (normalized.includes('claude')) return 'Anthropic'
  if (normalized.includes('gemini')) return 'Google'
  if (
    normalized.includes('gpt') ||
    normalized.includes('o1') ||
    normalized.includes('o3') ||
    normalized.includes('o4') ||
    normalized.includes('codex')
  ) {
    return 'OpenAI'
  }
  if (normalized.includes('deepseek')) return 'DeepSeek'
  if (normalized.includes('llama') || normalized.includes('meta')) return 'Meta'
  if (normalized.includes('mistral')) return 'Mistral'
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

const sourceLabel = (source) => {
  if (source === 'custom-override') return '自定义覆盖'
  if (source === 'custom') return '自定义'
  return '系统'
}

const sourceBadgeClass = (source) => {
  if (source === 'custom-override') {
    return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
  }
  if (source === 'custom') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
  }
  return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
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
  try {
    const [pricingResult, statusResult] = await Promise.all([
      getModelPricingApi(),
      getModelPricingStatusApi()
    ])
    if (pricingResult.success) {
      pricingData.value = pricingResult.data || {}
    } else {
      showToast(pricingResult.message || '加载模型价格失败', 'error')
    }
    if (statusResult.success) {
      pricingStatus.value = statusResult.data || {}
    } else {
      showToast(statusResult.message || '获取价格状态失败', 'error')
    }
  } finally {
    loading.value = false
  }
}

const handleRefresh = async () => {
  refreshing.value = true
  try {
    const result = await refreshModelPricingApi()
    if (result.success) {
      showToast('系统价格数据已刷新', 'success')
      await loadData()
    } else {
      showToast(result.message || '刷新失败', 'error')
    }
  } finally {
    refreshing.value = false
  }
}

const openCreatePricing = () => {
  editingOriginalModel.value = ''
  pricingForm.value = createEmptyPricingForm()
  showPricingEditor.value = true
}

const openEditPricing = (model) => {
  editingOriginalModel.value = model.name
  pricingForm.value = {
    model: model.name,
    provider: model.raw.litellm_provider || model.provider || '',
    inputCost: model.inputCost,
    outputCost: model.outputCost,
    cacheCreateCost: model.cacheCreateCost || null,
    cacheReadCost: model.cacheReadCost || null,
    maxTokens: model.maxTokens || null,
    mode: model.raw.mode || 'chat',
    sourceUrl: model.raw.source_url || '',
    supportsPromptCaching: model.raw.supports_prompt_caching === true
  }
  showPricingEditor.value = true
}

const closePricingEditor = () => {
  showPricingEditor.value = false
  savingPricing.value = false
}

const isBlank = (value) => value === '' || value === null || value === undefined

const normalizeRequiredPrice = (value, label) => {
  if (isBlank(value) || !Number.isFinite(Number(value)) || Number(value) < 0) {
    throw new Error(`${label} 必须是大于等于 0 的数字`)
  }
  return millionToToken(value)
}

const addOptionalPrice = (pricing, field, value) => {
  if (!isBlank(value)) {
    if (!Number.isFinite(Number(value)) || Number(value) < 0) {
      throw new Error(`${field} 必须是大于等于 0 的数字`)
    }
    pricing[field] = millionToToken(value)
  }
}

const buildPricingPayload = () => {
  const model = pricingForm.value.model.trim()
  if (!model) {
    throw new Error('模型名称不能为空')
  }

  const pricing = {
    input_cost_per_token: normalizeRequiredPrice(pricingForm.value.inputCost, '输入价格'),
    output_cost_per_token: normalizeRequiredPrice(pricingForm.value.outputCost, '输出价格'),
    pricing_source: 'custom'
  }

  addOptionalPrice(pricing, 'cache_creation_input_token_cost', pricingForm.value.cacheCreateCost)
  addOptionalPrice(pricing, 'cache_read_input_token_cost', pricingForm.value.cacheReadCost)

  if (pricingForm.value.provider) {
    pricing.litellm_provider = pricingForm.value.provider
  }
  if (pricingForm.value.mode) {
    pricing.mode = pricingForm.value.mode
  }
  if (pricingForm.value.sourceUrl) {
    pricing.source_url = pricingForm.value.sourceUrl
  }
  if (!isBlank(pricingForm.value.maxTokens)) {
    pricing.max_tokens = Number(pricingForm.value.maxTokens)
  }
  pricing.supports_prompt_caching = pricingForm.value.supportsPromptCaching === true

  return { model, pricing }
}

const saveCustomPricing = async () => {
  savingPricing.value = true
  try {
    const payload = buildPricingPayload()
    const result = await updateCustomModelPricingApi(payload)
    if (result.success) {
      showToast('自定义价格已保存', 'success')
      closePricingEditor()
      await loadData()
    } else {
      showToast(result.message || '保存自定义价格失败', 'error')
    }
  } catch (error) {
    showToast(error.message || '保存自定义价格失败', 'error')
  } finally {
    savingPricing.value = false
  }
}

const deleteCustomPricing = async (model) => {
  if (!window.confirm(`确认删除 ${model.name} 的自定义价格并恢复系统价？`)) {
    return
  }

  const result = await deleteCustomModelPricingApi({ model: model.name })
  if (result.success) {
    showToast('已恢复系统价格', 'success')
    await loadData()
  } else {
    showToast(result.message || '恢复系统价格失败', 'error')
  }
}

onMounted(loadData)
</script>
