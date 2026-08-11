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
  getModelPricingApi,
  getModelPricingStatusApi,
  getPublicModelPricingApi,
  refreshModelPricingApi
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

onMounted(() => {
  loadData()
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
