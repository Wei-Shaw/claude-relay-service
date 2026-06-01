<template>
  <div class="space-y-5">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div class="min-w-0">
        <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
          路由规则可视化
        </h2>
        <p class="mt-2 text-sm font-medium text-gray-600 dark:text-gray-300">
          Live 查看 endpoint 接受的模型、5 分钟 QPM/TPM，以及这些模型按调度规则流向哪些账户。
        </p>
      </div>

      <div class="grid grid-cols-2 gap-3 sm:min-w-[360px]">
        <div class="metric-card">
          <div class="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-300">
            <span class="live-dot bg-emerald-500" />
            <span>实时 QPM (5分钟)</span>
          </div>
          <div class="mt-2 text-3xl font-black text-orange-600 dark:text-orange-400">
            {{ formatMetric(liveSummary.rpm) }}
          </div>
        </div>
        <div class="metric-card">
          <div class="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-300">
            <span class="live-dot bg-pink-500" />
            <span>实时 TPM (5分钟)</span>
          </div>
          <div class="mt-2 text-3xl font-black text-pink-600 dark:text-pink-400">
            {{ formatMetric(liveSummary.tpm) }}
          </div>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <label class="filter-control">
        <span>Endpoint</span>
        <select v-model="selectedEndpoint" @change="handleEndpointChange">
          <option v-for="endpoint in endpointOptions" :key="endpoint.id" :value="endpoint.id">
            {{ endpoint.label }}
          </option>
        </select>
      </label>

      <label class="filter-control">
        <span>API Key</span>
        <select v-model="selectedApiKeyId" @change="reloadExplain">
          <option value="">全部 / 未指定</option>
          <option v-for="apiKey in apiKeyOptions" :key="apiKey.id" :value="apiKey.id">
            {{ apiKey.name }}
          </option>
        </select>
      </label>

      <div class="filter-pill">
        <span class="live-dot bg-emerald-500" />
        <span>Live: {{ liveWindowLabel }}</span>
      </div>

      <div class="filter-pill">
        <i class="fas fa-sort-amount-down text-indigo-500" />
        <span>权重优先</span>
      </div>

      <button class="action-btn" :disabled="loading || liveLoading" @click="refreshAll">
        <i :class="['fas fa-sync-alt', loading || liveLoading ? 'fa-spin' : '']" />
        <span>刷新</span>
      </button>
    </div>

    <div
      v-if="errorMessage"
      class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
    >
      {{ errorMessage }}
    </div>

    <div class="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <section class="panel-card h-fit">
        <div class="text-xs font-black uppercase text-gray-500 dark:text-gray-400">Endpoint</div>
        <div class="mt-2 text-2xl font-black text-gray-950 dark:text-gray-100">
          {{ selectedEndpointMeta?.label || 'Claude' }}
        </div>
        <div
          class="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-black text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200"
        >
          {{ selectedEndpointMeta?.path || '/api/v1/messages' }}
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <span class="tag tag-green">{{ selectedEndpointMeta?.acceptedFormat }}</span>
          <span class="tag tag-blue">{{ selectedEndpointMeta?.modelSource }}</span>
        </div>

        <div class="mt-6 flex items-center justify-between">
          <div class="text-xs font-black uppercase text-gray-500 dark:text-gray-400">
            接受的 Model
          </div>
          <div class="text-xs font-bold text-gray-400">{{ modelRoutes.length }}</div>
        </div>
        <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1">
          <button
            v-for="model in modelRoutes"
            :key="model.id"
            :class="[
              'model-btn',
              selectedModel === model.id
                ? 'model-btn-active'
                : 'bg-gray-50 text-gray-700 hover:bg-indigo-50 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:bg-indigo-950/30'
            ]"
            @click="selectModel(model.id)"
          >
            <span class="min-w-0 flex-1 truncate text-left">{{ model.label }}</span>
            <span class="model-count">{{ model.routableCount ?? 0 }}</span>
          </button>
        </div>
      </section>

      <section class="panel-card min-w-0 overflow-hidden">
        <div
          class="flex flex-col gap-3 border-b border-gray-100 pb-4 dark:border-gray-800 md:flex-row md:items-start md:justify-between"
        >
          <div class="min-w-0">
            <div class="text-sm font-bold text-gray-500 dark:text-gray-400">当前选中 Model</div>
            <div class="mt-1 truncate text-xl font-black text-gray-950 dark:text-gray-100">
              {{ selectedModel || '-' }}
            </div>
            <div class="mt-2 flex flex-wrap gap-2">
              <span class="tag tag-green">可路由 {{ explainSummary.routableCount }}</span>
              <span class="tag tag-amber">降级 {{ explainSummary.degradedCount }}</span>
              <span class="tag tag-red">排除 {{ explainSummary.excludedCount }}</span>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div class="mini-stat">
              <span>QPM</span>
              <strong>{{ formatMetric(liveSummary.rpm) }}</strong>
            </div>
            <div class="mini-stat">
              <span>TPM</span>
              <strong>{{ formatMetric(liveSummary.tpm) }}</strong>
            </div>
            <div class="mini-stat">
              <span>P95</span>
              <strong>{{ formatLatency(liveSummary.p95Ms) }}</strong>
            </div>
            <div class="mini-stat">
              <span>429</span>
              <strong>{{ liveSummary.rateLimitedCount || 0 }}</strong>
            </div>
          </div>
        </div>

        <div
          class="route-grid-bg mt-4 rounded-2xl border border-blue-100/80 p-3 dark:border-blue-900/50"
        >
          <div
            v-if="loading && !displayAccounts.length"
            class="flex min-h-[360px] items-center justify-center text-sm font-semibold text-gray-500 dark:text-gray-400"
          >
            <i class="fas fa-circle-notch fa-spin mr-2" />
            加载路由候选...
          </div>

          <div
            v-else-if="!displayAccounts.length"
            class="flex min-h-[360px] items-center justify-center text-sm font-semibold text-gray-500 dark:text-gray-400"
          >
            暂无可展示账户
          </div>

          <div v-else class="grid gap-3 2xl:grid-cols-2">
            <article
              v-for="account in displayAccounts"
              :key="account.sourceType + ':' + account.id"
              :class="['account-card', accountCardClass(account)]"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate text-base font-black text-gray-950 dark:text-gray-100">
                    {{ account.name }}
                  </div>
                  <div class="mt-1 truncate text-xs font-bold text-gray-500 dark:text-gray-400">
                    {{ account.platformLabel }} · {{ normalizeAccountKind(account.accountKind) }}
                  </div>
                </div>
                <div class="flex flex-shrink-0 items-center gap-2">
                  <span :class="['status-badge', routeStatusClass(account.routeStatus)]">
                    {{ routeStatusLabel(account.routeStatus) }}
                  </span>
                  <button
                    class="icon-action-btn"
                    title="编辑账户"
                    type="button"
                    @click="openAccountEditor(account)"
                  >
                    <i class="fas fa-edit" />
                  </button>
                </div>
              </div>

              <div class="mt-3 flex flex-wrap gap-2">
                <span class="tag tag-blue">{{ account.platform }}</span>
                <span class="tag tag-slate">priority {{ account.priority }}</span>
                <span v-if="account.routeStatus !== 'routable'" class="tag tag-red">
                  {{ account.routeReason }}
                </span>
              </div>

              <div class="mapping-line">
                <i class="fas fa-random text-indigo-500" />
                <span>{{ formatModelMapping(account) }}</span>
              </div>

              <div class="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div class="account-stat">
                  <span>QPM/TPM</span>
                  <strong>
                    {{ formatMetric(account.live.rpm) }} / {{ formatMetric(account.live.tpm) }}
                  </strong>
                </div>
                <div class="account-stat">
                  <span>今日/限额</span>
                  <strong>{{ formatDaily(account.daily) }}</strong>
                </div>
                <div class="account-stat">
                  <span>并发</span>
                  <strong>{{ formatConcurrency(account.concurrency) }}</strong>
                </div>
                <div class="account-stat">
                  <span>权重</span>
                  <strong>{{ account.effectiveWeight }}</strong>
                </div>
              </div>

              <div class="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div class="text-xs font-black uppercase text-gray-400">
                      可用性 {{ account.health.availabilityWindowLabel }}
                    </div>
                    <div class="mt-1 text-lg font-black text-gray-950 dark:text-gray-100">
                      {{ formatAvailability(account.health.availabilityPercent) }}
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-xs font-black uppercase text-gray-400">P95</div>
                    <div class="mt-1 text-lg font-black text-gray-950 dark:text-gray-100">
                      {{ formatLatency(account.live.p95Ms) }}
                    </div>
                  </div>
                </div>

                <div class="mt-3 flex h-8 items-end gap-1 overflow-hidden">
                  <span
                    v-for="(bucket, index) in historyBars(account)"
                    :key="index"
                    :class="['history-bar', historyClass(bucket)]"
                  />
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>

    <CcrAccountForm
      v-if="showEditAccountModal && editingAccount && editingAccount.platform === 'ccr'"
      :account="editingAccount"
      @close="closeAccountEditor"
      @success="handleAccountEditSuccess"
    />
    <AccountForm
      v-else-if="showEditAccountModal"
      :account="editingAccount"
      @close="closeAccountEditor"
      @success="handleAccountEditSuccess"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  getRouteRuleEndpointsApi,
  getRouteRuleExplainApi,
  getRouteRuleLiveApi
} from '@/utils/http_apis'
import { showToast } from '@/utils/tools'
import AccountForm from '@/components/accounts/AccountForm.vue'
import CcrAccountForm from '@/components/accounts/CcrAccountForm.vue'

const endpointOptions = ref([])
const apiKeyOptions = ref([])
const selectedEndpoint = ref('claude')
const selectedApiKeyId = ref('')
const selectedModel = ref('')
const explain = ref(null)
const live = ref(null)
const loading = ref(false)
const liveLoading = ref(false)
const errorMessage = ref('')
const showEditAccountModal = ref(false)
const editingAccount = ref(null)
let refreshTimer = null

const selectedEndpointMeta = computed(
  () =>
    endpointOptions.value.find((endpoint) => endpoint.id === selectedEndpoint.value) ||
    explain.value?.endpoint ||
    null
)

const modelRoutes = computed(() => {
  if (explain.value?.modelRoutes?.length) {
    return explain.value.modelRoutes
  }
  return selectedEndpointMeta.value?.models || []
})

const liveSummary = computed(
  () =>
    live.value?.summary || {
      rpm: 0,
      tpm: 0,
      p95Ms: null,
      rateLimitedCount: 0
    }
)

const liveWindowLabel = computed(() => live.value?.windowLabel || '5分钟')

const explainSummary = computed(
  () =>
    explain.value?.summary || {
      routableCount: 0,
      degradedCount: 0,
      excludedCount: 0
    }
)

const displayAccounts = computed(() => {
  const liveAccounts = live.value?.accounts || {}
  return (explain.value?.accounts || []).map((account) => {
    const liveStats =
      liveAccounts[account.id] || liveAccounts[`${account.sourceType}:${account.id}`]
    if (!liveStats) {
      return account
    }
    return {
      ...account,
      live: {
        ...account.live,
        ...liveStats
      },
      health: {
        ...account.health,
        availabilityPercent:
          liveStats.totalCount > 0
            ? Number(((liveStats.successCount / liveStats.totalCount) * 100).toFixed(2))
            : account.health.availabilityPercent
      }
    }
  })
})

const getQueryParams = () => ({
  endpoint: selectedEndpoint.value,
  model: selectedModel.value,
  apiKeyId: selectedApiKeyId.value || undefined,
  windowSeconds: 300
})

const formatMetric = (value) => {
  const num = Number(value || 0)
  const abs = Math.abs(num)
  if (abs >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`
  }
  if (abs >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num % 1 === 0 ? String(num) : num.toFixed(1)
}

const formatLatency = (value) => {
  if (!value) {
    return '-'
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}s`
  }
  return `${Math.round(value)}ms`
}

const formatDaily = (daily = {}) => {
  if (daily.hasQuota) {
    return `$${Number(daily.usage || 0).toFixed(2)} / $${Number(daily.quota || 0).toFixed(0)}`
  }
  if (daily.utilizationPercent !== null && daily.utilizationPercent !== undefined) {
    return `${daily.utilizationPercent}%`
  }
  return '-'
}

const formatConcurrency = (concurrency = {}) => {
  if (concurrency.unlimited) {
    return `${concurrency.active || 0} / ∞`
  }
  return `${concurrency.active || 0} / ${concurrency.limit || 0}`
}

const formatAvailability = (value) => {
  if (value === null || value === undefined) {
    return '-'
  }
  return `${Number(value).toFixed(2)}%`
}

const formatModelMapping = (account) => {
  const mapping = account.modelMapping
  if (!mapping) {
    return '未读取到模型映射'
  }
  if (mapping.selected) {
    return `命中映射: ${mapping.selected.sourceModel} -> ${mapping.selected.mappedModel}`
  }
  if (mapping.entries?.length) {
    const preview = mapping.entries
      .slice(0, 3)
      .map((entry) => `${entry.sourceModel} -> ${entry.mappedModel}`)
      .join(' / ')
    const suffix = mapping.entryCount > 3 ? ` 等 ${mapping.entryCount} 项` : ''
    return `当前 model 未命中；可用映射: ${preview}${suffix}`
  }
  if (mapping.mode === 'all') {
    return '未配置白名单，默认支持全部模型'
  }
  return '未配置模型映射'
}

const normalizeAccountKind = (kind) => {
  if (!kind || kind === 'shared') {
    return '共享'
  }
  return kind
}

const routeStatusLabel = (status) => {
  const labels = {
    routable: '可路由',
    degraded: '降级',
    excluded: '不可路由'
  }
  return labels[status] || status
}

const routeStatusClass = (status) => {
  const classes = {
    routable: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    degraded: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    excluded: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
  }
  return classes[status] || classes.excluded
}

const accountCardClass = (account) => {
  if (account.routeStatus === 'routable') {
    return 'border-emerald-300 bg-white/95 shadow-emerald-100/80 dark:border-emerald-800 dark:bg-gray-900/95 dark:shadow-none'
  }
  if (account.routeStatus === 'degraded') {
    return 'border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/20'
  }
  return 'border-gray-200 bg-white/70 opacity-70 dark:border-gray-800 dark:bg-gray-900/70'
}

const historyClass = (bucket) => {
  const classes = {
    ok: 'bg-emerald-500',
    warn: 'bg-amber-500',
    down: 'bg-red-500',
    empty: 'bg-gray-200 dark:bg-gray-700'
  }
  return classes[bucket] || classes.empty
}

const historyBars = (account) => account.live?.history || Array.from({ length: 60 }, () => 'empty')

const loadEndpoints = async () => {
  const response = await getRouteRuleEndpointsApi()
  if (!response.success) {
    throw new Error(response.message || '加载 endpoint 失败')
  }

  endpointOptions.value = response.data.endpoints || []
  apiKeyOptions.value = response.data.apiKeys || []
  selectedEndpoint.value = response.data.defaultEndpoint || 'claude'

  const endpoint = endpointOptions.value.find((item) => item.id === selectedEndpoint.value)
  selectedModel.value = endpoint?.defaultModel || endpoint?.models?.[0]?.id || ''
}

const loadExplain = async () => {
  if (!selectedEndpoint.value || !selectedModel.value) {
    return
  }

  loading.value = true
  try {
    const response = await getRouteRuleExplainApi(getQueryParams())
    if (!response.success) {
      throw new Error(response.message || '加载路由规则失败')
    }
    explain.value = response.data
    live.value = response.data.live
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error.message
    showToast(error.message, 'error')
  } finally {
    loading.value = false
  }
}

const refreshLive = async () => {
  if (!selectedEndpoint.value || !selectedModel.value) {
    return
  }

  liveLoading.value = true
  try {
    const response = await getRouteRuleLiveApi(getQueryParams())
    if (response.success) {
      live.value = response.data
    }
  } finally {
    liveLoading.value = false
  }
}

const reloadExplain = () => {
  loadExplain()
}

const refreshAll = async () => {
  await loadExplain()
  await refreshLive()
}

const handleEndpointChange = async () => {
  const endpoint = endpointOptions.value.find((item) => item.id === selectedEndpoint.value)
  selectedModel.value = endpoint?.defaultModel || endpoint?.models?.[0]?.id || ''
  await loadExplain()
}

const selectModel = async (modelId) => {
  if (selectedModel.value === modelId) {
    return
  }
  selectedModel.value = modelId
  await loadExplain()
}

const openAccountEditor = (account) => {
  editingAccount.value = account.editAccount || account
  showEditAccountModal.value = true
}

const closeAccountEditor = () => {
  showEditAccountModal.value = false
  editingAccount.value = null
}

const handleAccountEditSuccess = async () => {
  closeAccountEditor()
  showToast('账户更新成功', 'success')
  await refreshAll()
}

onMounted(async () => {
  try {
    await loadEndpoints()
    await loadExplain()
    refreshTimer = window.setInterval(refreshLive, 5000)
  } catch (error) {
    errorMessage.value = error.message
    showToast(error.message, 'error')
  }
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
  }
})
</script>

<style scoped>
.metric-card {
  border: 1px solid rgba(199, 210, 254, 0.9);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.86);
  padding: 14px 16px;
  box-shadow: 0 18px 34px rgba(79, 70, 229, 0.1);
}

:global(.dark) .metric-card {
  border-color: rgba(67, 56, 202, 0.45);
  background: rgba(17, 24, 39, 0.8);
}

.live-dot {
  display: inline-block;
  height: 8px;
  width: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  animation: livePulse 1.5s ease-in-out infinite;
}

.filter-control,
.filter-pill,
.action-btn {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(199, 210, 254, 0.9);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  padding: 0 14px;
  font-size: 14px;
  font-weight: 800;
  color: rgb(31, 41, 55);
  box-shadow: 0 8px 18px rgba(79, 70, 229, 0.08);
}

:global(.dark) .filter-control,
:global(.dark) .filter-pill,
:global(.dark) .action-btn {
  border-color: rgba(55, 65, 81, 0.9);
  background: rgba(17, 24, 39, 0.82);
  color: rgb(229, 231, 235);
}

.filter-control span {
  color: rgb(75, 85, 99);
}

:global(.dark) .filter-control span {
  color: rgb(209, 213, 219);
}

.filter-control select {
  min-width: 110px;
  border: 0;
  background: transparent;
  color: rgb(79, 70, 229);
  font-weight: 900;
  outline: none;
}

:global(.dark) .filter-control select {
  color: rgb(165, 180, 252);
}

.action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.icon-action-btn {
  display: inline-flex;
  height: 30px;
  width: 30px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(199, 210, 254, 0.9);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
  color: rgb(37, 99, 235);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}

.icon-action-btn:hover {
  transform: translateY(-1px);
  background: rgba(239, 246, 255, 0.98);
  box-shadow: 0 10px 18px rgba(37, 99, 235, 0.14);
}

:global(.dark) .icon-action-btn {
  border-color: rgba(55, 65, 81, 0.9);
  background: rgba(17, 24, 39, 0.9);
  color: rgb(147, 197, 253);
}

:global(.dark) .icon-action-btn:hover {
  background: rgba(30, 41, 59, 0.95);
}

.panel-card {
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.9);
  padding: 16px;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.06);
}

:global(.dark) .panel-card {
  border-color: rgba(55, 65, 81, 0.9);
  background: rgba(17, 24, 39, 0.84);
}

.tag {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  border-radius: 999px;
  padding: 0 9px;
  font-size: 12px;
  font-weight: 900;
}

.tag-green {
  background: rgb(220, 252, 231);
  color: rgb(22, 101, 52);
}

.tag-blue {
  background: rgb(224, 231, 255);
  color: rgb(67, 56, 202);
}

.tag-amber {
  background: rgb(254, 243, 199);
  color: rgb(146, 64, 14);
}

.tag-red {
  background: rgb(254, 226, 226);
  color: rgb(185, 28, 28);
}

.tag-slate {
  background: rgb(241, 245, 249);
  color: rgb(71, 85, 105);
}

:global(.dark) .tag-green {
  background: rgba(20, 83, 45, 0.45);
  color: rgb(134, 239, 172);
}

:global(.dark) .tag-blue {
  background: rgba(49, 46, 129, 0.5);
  color: rgb(199, 210, 254);
}

:global(.dark) .tag-amber {
  background: rgba(120, 53, 15, 0.45);
  color: rgb(253, 230, 138);
}

:global(.dark) .tag-red {
  background: rgba(127, 29, 29, 0.45);
  color: rgb(252, 165, 165);
}

:global(.dark) .tag-slate {
  background: rgba(51, 65, 85, 0.7);
  color: rgb(203, 213, 225);
}

.model-btn {
  display: flex;
  min-height: 38px;
  width: 100%;
  align-items: center;
  gap: 8px;
  border-radius: 12px;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 900;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}

.model-btn:hover {
  transform: translateY(-1px);
}

.model-btn-active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 10px 20px rgba(102, 126, 234, 0.28);
}

.model-count {
  display: inline-flex;
  min-width: 26px;
  justify-content: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.8);
  padding: 2px 7px;
  color: rgb(79, 70, 229);
  font-size: 12px;
}

.model-btn-active .model-count {
  color: rgb(79, 70, 229);
}

.mapping-line {
  margin-top: 12px;
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 8px;
  color: rgb(71, 85, 105);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.5;
}

:global(.dark) .mapping-line {
  color: rgb(203, 213, 225);
}

.mapping-line i {
  margin-top: 3px;
  flex: 0 0 auto;
}

.mapping-line span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.mini-stat,
.account-stat {
  min-width: 0;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.9);
  padding: 10px;
}

:global(.dark) .mini-stat,
:global(.dark) .account-stat {
  background: rgba(15, 23, 42, 0.66);
}

.mini-stat span,
.account-stat span {
  display: block;
  font-size: 11px;
  font-weight: 900;
  color: rgb(100, 116, 139);
  text-transform: uppercase;
}

.mini-stat strong,
.account-stat strong {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  color: rgb(15, 23, 42);
  font-size: 15px;
  font-weight: 950;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.dark) .mini-stat strong,
:global(.dark) .account-stat strong {
  color: rgb(243, 244, 246);
}

.route-grid-bg {
  background-color: rgba(239, 246, 255, 0.68);
  background-image:
    linear-gradient(rgba(59, 130, 246, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(59, 130, 246, 0.08) 1px, transparent 1px);
  background-size: 24px 24px;
}

:global(.dark) .route-grid-bg {
  background-color: rgba(15, 23, 42, 0.65);
  background-image:
    linear-gradient(rgba(99, 102, 241, 0.13) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99, 102, 241, 0.13) 1px, transparent 1px);
}

.account-card {
  min-width: 0;
  border-width: 1px;
  border-style: solid;
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.08);
  transition:
    opacity 0.18s ease,
    transform 0.18s ease,
    border-color 0.18s ease;
}

.account-card:hover {
  transform: translateY(-2px);
}

.status-badge {
  display: inline-flex;
  min-height: 26px;
  flex: 0 0 auto;
  align-items: center;
  border-radius: 999px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 950;
}

.history-bar {
  height: 100%;
  width: 5px;
  min-width: 5px;
  border-radius: 4px;
}

@keyframes livePulse {
  0%,
  100% {
    opacity: 0.7;
    transform: scale(0.86);
  }
  50% {
    opacity: 1;
    transform: scale(1.12);
  }
}
</style>
