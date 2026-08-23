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
              模型总数:
              <span class="font-bold text-blue-600 dark:text-blue-400">{{ modelCount }}</span>
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">上次更新: {{ lastUpdated }}</p>
          </div>
        </div>
        <button
          v-if="!readonly"
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
          {{ refreshing ? '刷新中...' : '立即刷新' }}
        </button>
      </div>
      <p v-if="readonly" class="mt-3 text-sm text-gray-500 dark:text-gray-400">
        以下为官方参考单价（$/百万 tokens）。实际扣费可能叠加服务倍率与 API Key 倍率。
      </p>
    </div>

    <!-- 数据源配置（管理端可改，改完点“拉取最新价格”即时生效，无需重启） -->
    <div
      v-if="!readonly"
      class="mb-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <i class="fas fa-cloud-download-alt text-blue-500" />
          <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">模型定价数据源</span>
          <span
            v-if="pricingStatus.source"
            :class="[
              'rounded px-2 py-0.5 text-sm',
              pricingStatus.source.custom
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
            ]"
          >
            {{ pricingStatus.source.custom ? '自定义' : '默认' }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            :disabled="savingSource || importing"
            @click="handleResetSource"
          >
            恢复默认
          </button>
          <button
            class="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            :disabled="savingSource || importing"
            @click="handleSaveSource"
          >
            <i :class="['fas mr-1', savingSource ? 'fa-spinner fa-spin' : 'fa-save']" />
            保存
          </button>
          <button
            class="rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="savingSource || importing"
            @click="handleImport"
          >
            <i :class="['fas mr-1', importing ? 'fa-spinner fa-spin' : 'fa-download']" />
            {{ importing ? '拉取中...' : '拉取最新价格' }}
          </button>
        </div>
      </div>
      <div
        class="mb-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900/50"
      >
        <p class="break-all text-sm text-gray-600 dark:text-gray-400">
          当前生效：<span class="font-mono">{{ pricingStatus.source?.pricingUrl || '-' }}</span>
        </p>
        <p class="mt-1 break-all text-sm text-gray-500 dark:text-gray-500">
          校验文件：<span class="font-mono">{{ pricingStatus.source?.hashUrl || '未配置' }}</span>
        </p>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">
            定价 JSON 地址
          </label>
          <input
            v-model="sourceForm.pricingUrl"
            class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 placeholder-gray-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            :placeholder="pricingStatus.source?.defaultPricingUrl || 'https://...'"
            type="text"
          />
        </div>
        <div>
          <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">
            sha256 校验地址（可留空）
          </label>
          <input
            v-model="sourceForm.hashUrl"
            class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 placeholder-gray-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            :placeholder="pricingStatus.source?.defaultHashUrl || '留空则跳过哈希校验'"
            type="text"
          />
        </div>
      </div>
      <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
        上方“当前生效”只显示来源站点，路径与查询参数已隐去（它们加密存储，因为令牌既可能在
        <span class="font-mono">?token=</span> 也可能在路径里），故不回填到输入框。填入新地址点保存即替换；
        用“恢复默认”回到内置源。配了 sha256 地址时系统每 10 分钟比对哈希、有变更自动拉取；留空则仅靠每
        24 小时定时更新与手动拉取。地址不得包含用户名/密码；保存时校验字面量，请求前还会校验域名的
        DNS 解析结果，指向回环/私网/链路本地的地址会被拒绝（含重定向目标）。
      </p>
    </div>

    <!-- 模型目录导入：把定价源里有、/v1/models 还没有的模型加进目录 -->
    <div
      v-if="!readonly"
      class="mb-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <i class="fas fa-layer-group text-emerald-500" />
          <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">模型目录</span>
          <span class="text-sm text-gray-500 dark:text-gray-400">
            已导入 {{ importedModels.length }} 个 · 可导入 {{ importableModels.length }} 个
          </span>
        </div>
        <button
          class="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          :disabled="modelsLoading"
          @click="loadModelCatalog"
        >
          <i :class="['fas mr-1', modelsLoading ? 'fa-spinner fa-spin' : 'fa-rotate']" />
          刷新列表
        </button>
      </div>

      <p class="mb-3 text-sm text-gray-500 dark:text-gray-400">
        这里管的是 <span class="font-mono">/v1/models</span> 对客户端暴露的模型列表。导入不影响转发能力（能不能用取决于账户的模型映射），
        只决定模型是否出现在列表里。仅列出定价源中的对话类模型。
      </p>

      <!-- 可导入 -->
      <div class="mb-4">
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <span class="text-sm font-medium text-gray-600 dark:text-gray-300">可导入</span>
          <el-select
            v-model="selectedImportable"
            class="min-w-0 flex-1"
            clearable
            collapse-tags
            collapse-tags-tooltip
            filterable
            multiple
            placeholder="选择要导入的模型（可搜索）"
          >
            <el-option
              v-for="model in importableModels"
              :key="model.id"
              :label="`${model.id}　·　${model.provider}`"
              :value="model.id"
            />
          </el-select>
          <button
            class="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="modelsLoading || selectedImportable.length === 0"
            @click="handleImportModels"
          >
            <i class="fas fa-plus mr-1" />
            导入 {{ selectedImportable.length || '' }}
          </button>
        </div>
        <p v-if="importableModels.length === 0" class="text-sm text-gray-500 dark:text-gray-400">
          定价源里没有目录之外的新模型。
        </p>
      </div>

      <!-- 已导入 -->
      <div>
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <span class="text-sm font-medium text-gray-600 dark:text-gray-300">已导入</span>
          <el-select
            v-model="selectedImported"
            class="min-w-0 flex-1"
            clearable
            collapse-tags
            collapse-tags-tooltip
            filterable
            multiple
            placeholder="选择要移除的模型（内置模型不在此列）"
          >
            <el-option
              v-for="model in importedModels"
              :key="model.id"
              :label="`${model.id}　·　${model.provider}`"
              :value="model.id"
            />
          </el-select>
          <button
            class="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
            :disabled="modelsLoading || selectedImported.length === 0"
            @click="handleRemoveModels"
          >
            <i class="fas fa-minus mr-1" />
            移除 {{ selectedImported.length || '' }}
          </button>
        </div>
        <p v-if="importedModels.length === 0" class="text-sm text-gray-500 dark:text-gray-400">
          还没有导入的模型（内置模型始终可用，不受此处影响）。
        </p>
      </div>
    </div>

    <!-- 搜索 + 供应商筛选 -->
    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <div class="relative min-w-0 flex-1">
        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          v-model="searchQuery"
          class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 placeholder-gray-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          placeholder="搜索模型名称..."
          type="text"
        />
      </div>
      <el-select
        v-model="activeProvider"
        class="w-full sm:w-56"
        clearable
        filterable
        placeholder="全部供应商"
      >
        <el-option
          v-for="provider in providerOptions"
          :key="provider"
          :label="provider"
          :value="provider"
        />
      </el-select>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="py-12 text-center">
      <i class="fas fa-spinner fa-spin mb-4 text-2xl text-blue-500" />
      <p class="text-gray-500 dark:text-gray-400">加载价格数据中...</p>
    </div>

    <!-- 表格 -->
    <div
      v-else
      ref="tableWrapper"
      class="overflow-auto rounded-lg border border-gray-200 dark:border-gray-700"
      :style="{ maxHeight: tableMaxHeight }"
    >
      <table class="min-w-full text-base">
        <thead class="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
          <tr>
            <th
              class="cursor-pointer px-3 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              @click="toggleSort('name')"
            >
              模型名称
              <i
                v-if="sortField === 'name'"
                :class="['fas ml-1', sortAsc ? 'fa-sort-up' : 'fa-sort-down']"
              />
            </th>
            <th
              class="cursor-pointer px-3 py-3 text-right text-sm font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              @click="toggleSort('input')"
            >
              输入 $/MTok
              <i
                v-if="sortField === 'input'"
                :class="['fas ml-1', sortAsc ? 'fa-sort-up' : 'fa-sort-down']"
              />
            </th>
            <th
              class="cursor-pointer px-3 py-3 text-right text-sm font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              @click="toggleSort('output')"
            >
              输出 $/MTok
              <i
                v-if="sortField === 'output'"
                :class="['fas ml-1', sortAsc ? 'fa-sort-up' : 'fa-sort-down']"
              />
            </th>
            <th
              class="hidden px-3 py-3 text-right text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 md:table-cell"
            >
              缓存创建
            </th>
            <th
              class="hidden px-3 py-3 text-right text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 md:table-cell"
            >
              缓存读取
            </th>
            <th
              class="hidden px-3 py-3 text-right text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 lg:table-cell"
            >
              上下文窗口
            </th>
            <th
              v-if="!readonly"
              class="px-3 py-3 text-right text-sm font-medium uppercase tracking-wider"
            >
              <button
                class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-blue-600 transition hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                @click="showRawAll"
              >
                <i class="fas fa-code" />查看全部
              </button>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
          <tr
            v-for="model in sortedModels"
            :key="model.name"
            class="transition hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            <td class="whitespace-nowrap px-3 py-3">
              <div class="text-base font-semibold text-gray-900 dark:text-gray-100">
                {{ model.name }}
              </div>
              <div v-if="model.provider" class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                {{ model.provider }}
              </div>
            </td>
            <td
              class="whitespace-nowrap px-3 py-3 text-right font-mono text-base font-medium text-gray-800 dark:text-gray-200"
            >
              {{ formatPrice(model.inputCost) }}
            </td>
            <td
              class="whitespace-nowrap px-3 py-3 text-right font-mono text-base font-medium text-gray-800 dark:text-gray-200"
            >
              {{ formatPrice(model.outputCost) }}
            </td>
            <td
              class="hidden whitespace-nowrap px-3 py-3 text-right font-mono text-base text-gray-600 dark:text-gray-300 md:table-cell"
            >
              {{ formatPrice(model.cacheCreateCost) }}
            </td>
            <td
              class="hidden whitespace-nowrap px-3 py-3 text-right font-mono text-base text-gray-600 dark:text-gray-300 md:table-cell"
            >
              {{ formatPrice(model.cacheReadCost) }}
            </td>
            <td
              class="hidden whitespace-nowrap px-3 py-3 text-right text-base text-gray-600 dark:text-gray-300 lg:table-cell"
            >
              {{ formatContext(model.maxTokens) }}
            </td>
            <td v-if="!readonly" class="whitespace-nowrap px-3 py-3 text-right">
              <button
                class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-blue-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-blue-400"
                @click="showRawOne(model.name)"
              >
                <i class="fas fa-code" />查看原始数据
              </button>
            </td>
          </tr>
          <tr v-if="sortedModels.length === 0">
            <td
              class="px-3 py-8 text-center text-base text-gray-500 dark:text-gray-400"
              :colspan="readonly ? 6 : 7"
            >
              <i class="fas fa-search mb-2 text-2xl text-gray-300 dark:text-gray-600" />
              <p>没有匹配的模型</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 模型数量统计 -->
    <div v-if="!loading" class="mt-3 text-right text-sm text-gray-400 dark:text-gray-500">
      显示 {{ sortedModels.length }} / {{ allModels.length }} 个模型
    </div>

    <!-- 原始数据查看弹窗 -->
    <ModalTransition>
      <div
        v-if="rawModal.show"
        class="modal fixed inset-0 z-50 flex items-center justify-center p-4"
        @click.self="rawModal.show = false"
      >
        <div
          class="modal-content flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl dark:bg-gray-800"
        >
          <div
            class="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700"
          >
            <h3 class="truncate text-base font-bold text-gray-900 dark:text-white">
              {{ rawModal.title }}
            </h3>
            <div class="flex items-center gap-2">
              <button
                class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                @click="copyRaw"
              >
                <i class="fas fa-copy" />复制
              </button>
              <button
                class="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                @click="rawModal.show = false"
              >
                <i class="fas fa-times" />
              </button>
            </div>
          </div>
          <pre
            class="flex-1 overflow-auto px-5 py-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300"
            >{{ rawModal.content }}</pre
          >
        </div>
      </div>
    </ModalTransition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import ModalTransition from '@/components/common/ModalTransition.vue'
import {
  getImportableModelsApi,
  getImportedModelsApi,
  getModelPricingApi,
  getModelPricingStatusApi,
  getPublicModelPricingApi,
  importModelsApi,
  pullModelPricingApi,
  refreshModelPricingApi,
  removeImportedModelsApi,
  updateModelPricingSourceApi
} from '@/utils/http_apis'
import { showToast, copyText } from '@/utils/tools'
import { formatLocalDateTime } from '@/utils/time'

const props = defineProps({
  // 用户统计页只读模式：走公开接口，隐藏刷新与原始数据操作
  readonly: {
    type: Boolean,
    default: false
  }
})

// ========== 状态 ==========
const loading = ref(false)
const refreshing = ref(false)
const pricingData = ref({})
const pricingStatus = ref({})
const searchQuery = ref('')
const activeProvider = ref('')
const sortField = ref('name')
const sortAsc = ref(true)
const tableWrapper = ref(null)
const tableMaxHeight = ref('60vh')
const rawModal = ref({ show: false, title: '', content: '' })
const savingSource = ref(false)
const importing = ref(false)
// 数据源表单:只回显自定义值,默认源走 placeholder 展示(留空保存 = 恢复默认)
const sourceForm = ref({ pricingUrl: '', hashUrl: '' })
// 模型目录
const modelsLoading = ref(false)
const importableModels = ref([])
const importedModels = ref([])
const selectedImportable = ref([])
const selectedImported = ref([])
let visibilityObserver = null
let layoutObserver = null

// ========== 计算属性 ==========
const modelCount = computed(() => Object.keys(pricingData.value).length)

const lastUpdated = computed(() => {
  if (!pricingStatus.value.lastUpdated) return '未知'
  return formatLocalDateTime(pricingStatus.value.lastUpdated) || '未知'
})

const allModels = computed(() =>
  Object.entries(pricingData.value).map(([name, data]) => {
    const litellmProvider = (data.litellm_provider || '').trim()
    return {
      name,
      // 优先用价格表官方供应商字段，缺失时按模型名推断
      provider: litellmProvider || detectProvider(name) || '其他',
      inputCost: (data.input_cost_per_token || 0) * 1e6,
      outputCost: (data.output_cost_per_token || 0) * 1e6,
      cacheCreateCost: (data.cache_creation_input_token_cost || 0) * 1e6,
      cacheReadCost: (data.cache_read_input_token_cost || 0) * 1e6,
      maxTokens: data.max_input_tokens || data.max_tokens || data.max_output_tokens || 0
    }
  })
)

// 从当前数据动态收集供应商列表，供可搜索下拉使用
const providerOptions = computed(() => {
  const set = new Set()
  for (const model of allModels.value) {
    if (model.provider) set.add(model.provider)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
})

const filteredModels = computed(() => {
  let models = allModels.value

  // 供应商筛选
  if (activeProvider.value) {
    models = models.filter((model) => model.provider === activeProvider.value)
  }

  // 搜索筛选（模型名 / 供应商）
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    models = models.filter(
      (model) =>
        model.name.toLowerCase().includes(query) || model.provider.toLowerCase().includes(query)
    )
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

  models.sort((a, b) => {
    const valueA = getter(a)
    const valueB = getter(b)
    if (typeof valueA === 'string') {
      return sortAsc.value ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA)
    }
    return sortAsc.value ? valueA - valueB : valueB - valueA
  })
  return models
})

// ========== 方法 ==========
const detectProvider = (name) => {
  const lowerName = name.toLowerCase()
  if (lowerName.includes('claude')) return 'anthropic'
  if (lowerName.includes('gemini')) return 'gemini'
  if (
    lowerName.includes('gpt') ||
    lowerName.includes('o1') ||
    lowerName.includes('o3') ||
    lowerName.includes('o4') ||
    lowerName.includes('codex')
  ) {
    return 'openai'
  }
  if (lowerName.includes('deepseek')) return 'deepseek'
  if (lowerName.includes('llama') || lowerName.includes('meta')) return 'meta_llama'
  if (lowerName.includes('mistral')) return 'mistral'
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

const showRawOne = (name) => {
  rawModal.value = {
    show: true,
    title: name,
    content: JSON.stringify(pricingData.value[name], null, 2)
  }
}

const showRawAll = () => {
  rawModal.value = {
    show: true,
    title: `全部原始数据 (${modelCount.value} 个模型)`,
    content: JSON.stringify(pricingData.value, null, 2)
  }
}

const copyRaw = () => copyText(rawModal.value.content)

// 累加表格下方到视口底的固定占用，跨断点自适应，无需写死常量。每层算三块：
// ① 节点自身的下外边距 ② 该节点之后兄弟的(上外边距+高度+下外边距) ③ 父级的下内边距+下边框
// getBoundingClientRect().height 是 border-box，不含 margin，必须单独累加，
// 否则会稳定少算（如统计行的 mt-3、卡片层的 1px 边框），表现为页面差一点点能滑
const calcBottomReserve = (el) => {
  const px = (v) => parseFloat(v) || 0
  let reserve = 8 // 安全垫，吸收子像素取整
  for (
    let node = el;
    node && node !== document.body && node.parentElement;
    node = node.parentElement
  ) {
    const parent = node.parentElement
    reserve += px(getComputedStyle(node).marginBottom)
    for (let sib = node.nextElementSibling; sib; sib = sib.nextElementSibling) {
      const ss = getComputedStyle(sib)
      // 跳过浮层（模态框等），它们不占文档流
      if (ss.position === 'fixed' || ss.position === 'absolute') continue
      reserve += px(ss.marginTop) + sib.getBoundingClientRect().height + px(ss.marginBottom)
    }
    const ps = getComputedStyle(parent)
    reserve += px(ps.paddingBottom) + px(ps.borderBottomWidth)
  }
  return reserve
}

// 按视口剩余空间动态计算表格高度。不设固定下限——固定下限会在剩余空间小于它时
// 把表格强行撑高，反而撑出视口（常见于 ~768px 笔记本，剩余恰好略小于旧的 240px）。
// 直接用剩余高度：多则多、少则少并内部滚动，maxHeight 永不超过剩余，页面绝不超高；负值兜底 0
const MOBILE_BREAKPOINT = 768
const calcTableHeight = () => {
  const el = tableWrapper.value
  // offsetParent 为 null 说明所在 tab 被 v-show 隐藏，此时 rect 不可信，跳过
  if (!el || el.offsetParent === null) return
  // 移动端（< md 768px）不锁高度：让表格自然撑开、整页滚动，避免顶部内容变高时剩余被压到接近 0
  if (window.innerWidth < MOBILE_BREAKPOINT) {
    tableMaxHeight.value = 'none'
    return
  }
  const top = el.getBoundingClientRect().top
  const avail = window.innerHeight - top - calcBottomReserve(el)
  tableMaxHeight.value = `${Math.max(0, Math.floor(avail))}px`
}

// tab 由隐藏变可见时重新计算（refresh 重建表格 DOM 后也需重新绑定）
const observeVisibility = () => {
  if (!tableWrapper.value) return
  if (visibilityObserver) visibilityObserver.disconnect()
  visibilityObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) calcTableHeight()
  })
  visibilityObserver.observe(tableWrapper.value)
}

// 后端回显的地址已脱敏(隐去 query),不能回填输入框——否则保存会把脱敏值当真值写回、丢掉参数。
// 输入框始终清空:填了才改,不填不动;要回默认走"恢复默认"按钮。
const syncSourceForm = () => {
  sourceForm.value = { pricingUrl: '', hashUrl: '' }
}

const loadData = async () => {
  loading.value = true
  if (props.readonly) {
    const result = await getPublicModelPricingApi()
    if (result.success) {
      pricingData.value = result.data?.pricing || {}
      pricingStatus.value = result.data?.status || {}
    } else {
      showToast(result.message || '加载模型价格失败', 'error')
    }
  } else {
    const [pricingResult, statusResult] = await Promise.all([
      getModelPricingApi(),
      getModelPricingStatusApi()
    ])
    if (pricingResult.success) {
      pricingData.value = pricingResult.data
    } else {
      showToast(pricingResult.message || '加载模型价格失败', 'error')
    }
    if (statusResult.success) {
      pricingStatus.value = statusResult.data
      syncSourceForm()
    } else {
      showToast(statusResult.message || '获取价格状态失败', 'error')
    }
  }
  loading.value = false
  await nextTick()
  calcTableHeight()
  observeVisibility()
}

const handleRefresh = async () => {
  refreshing.value = true
  const result = await refreshModelPricingApi()
  if (result.success) {
    showToast('价格数据已刷新', 'success')
    await loadData()
  } else {
    showToast(result.message || '刷新失败', 'error')
  }
  refreshing.value = false
}

const saveSource = async (payload) => {
  savingSource.value = true
  const result = await updateModelPricingSourceApi(payload)
  if (result.success) {
    showToast('数据源已保存', 'success')
    await loadData()
  } else {
    showToast(result.message || '保存数据源失败', 'error')
  }
  savingSource.value = false
  return result.success
}

const handleSaveSource = () => {
  // 两框皆空时不当作"恢复默认":那是"恢复默认"按钮的语义,避免误清配置
  if (!sourceForm.value.pricingUrl.trim()) {
    showToast('请填写定价 JSON 地址；要回到内置源请点「恢复默认」', 'error')
    return
  }
  return saveSource({
    pricingUrl: sourceForm.value.pricingUrl,
    hashUrl: sourceForm.value.hashUrl
  })
}

const handleResetSource = () => saveSource({ pricingUrl: '', hashUrl: '' })

// 模型目录:可导入 + 已导入并行拉,两个列表独立无依赖
const loadModelCatalog = async () => {
  modelsLoading.value = true
  const [importableResult, importedResult] = await Promise.all([
    getImportableModelsApi(),
    getImportedModelsApi()
  ])
  if (importableResult.success) {
    importableModels.value = importableResult.data?.models || []
  } else {
    showToast(importableResult.message || '获取可导入模型失败', 'error')
  }
  if (importedResult.success) {
    importedModels.value = importedResult.data?.models || []
  } else {
    showToast(importedResult.message || '获取已导入模型失败', 'error')
  }
  modelsLoading.value = false
}

const handleImportModels = async () => {
  modelsLoading.value = true
  const result = await importModelsApi(selectedImportable.value)
  if (result.success) {
    showToast(result.message || '导入完成', 'success')
    selectedImportable.value = []
  } else {
    showToast(result.message || '导入失败', 'error')
  }
  modelsLoading.value = false
  await loadModelCatalog()
}

const handleRemoveModels = async () => {
  modelsLoading.value = true
  const result = await removeImportedModelsApi(selectedImported.value)
  if (result.success) {
    showToast(result.message || '移除完成', 'success')
    selectedImported.value = []
  } else {
    showToast(result.message || '移除失败', 'error')
  }
  modelsLoading.value = false
  await loadModelCatalog()
}

const handleImport = async () => {
  importing.value = true
  const result = await pullModelPricingApi()
  if (result.success) {
    showToast(`已拉取最新价格，共 ${result.data?.modelCount ?? 0} 个模型`, 'success')
  } else {
    showToast(result.message || '拉取失败', 'error')
  }
  // 失败时也刷新:后端会回落 fallback 数据,展示需与实际一致
  await loadData()
  // 价格变了,可导入清单跟着变
  await loadModelCatalog()
  importing.value = false
}

onMounted(() => {
  loadData()
  if (!props.readonly) {
    loadModelCatalog()
  }
  window.addEventListener('resize', calcTableHeight)
  // 上方布局（AppHeader 更新提示出现、站点标题加载后换行等）异步变化会改变表格 top，
  // 这些不触发 resize，用 ResizeObserver 兜住；计算幂等（不依赖表格自身高度）故不会循环
  layoutObserver = new ResizeObserver(() => calcTableHeight())
  layoutObserver.observe(document.body)
})

onUnmounted(() => {
  window.removeEventListener('resize', calcTableHeight)
  if (visibilityObserver) visibilityObserver.disconnect()
  if (layoutObserver) layoutObserver.disconnect()
})
</script>
