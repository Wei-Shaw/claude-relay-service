<template>
  <el-dialog
    :append-to-body="true"
    class="request-detail-modal"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    :fullscreen="isMobileViewport"
    :model-value="show"
    :show-close="false"
    top="6vh"
    width="960px"
    @close="emitClose"
  >
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap sm:items-center">
        <div class="min-w-0 flex-1">
          <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">
            {{ detail?.model || '加载中...' }}
          </h3>
          <p class="mt-1 break-all text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
            Request ID: {{ requestId || '未知' }}
          </p>
        </div>
        <div class="flex items-center gap-2 self-start sm:self-center">
          <el-tag v-if="detail" effect="dark" :type="statusTagType(detail.statusCode)">
            {{ detail.statusCode || 200 }}
          </el-tag>
          <button aria-label="关闭" class="modal-close-button" type="button" @click="emitClose">
            <i class="fas fa-times" />
          </button>
        </div>
      </div>
    </template>

    <div v-loading="loading" class="space-y-4">
      <div
        v-if="!loading && !detail"
        class="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
      >
        未找到该请求详情
      </div>

      <template v-else-if="detail">
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div class="info-card">
            <p class="info-label">接口</p>
            <p class="info-value">{{ detail.endpoint || '-' }}</p>
            <p class="info-sub">{{ detail.method || 'POST' }}</p>
          </div>
          <div class="info-card">
            <p class="info-label">耗时</p>
            <p class="info-value">{{ formatDuration(detail.durationMs) }}</p>
            <p class="info-sub">{{ detail.stream ? '流式请求' : '非流式请求' }}</p>
          </div>
          <div class="info-card">
            <p class="info-label">费用</p>
            <p class="info-value text-amber-600 dark:text-amber-400">
              {{ formatCost(detail.cost) }}
            </p>
            <p class="info-sub">
              {{ detail.costRecomputed ? '估算成本' : '真实成本' }}
              {{ formatCost(detail.realCost) }}
              <span v-if="detail.usedFallbackPricing">unknown fallback</span>
            </p>
          </div>
          <div class="info-card">
            <p class="info-label">缓存命中率</p>
            <p class="info-value text-cyan-600 dark:text-cyan-400">
              {{ formatPercent(detail.cacheHitRate) }}
            </p>
            <p class="info-sub">{{ cacheHitRateLabel }}</p>
          </div>
        </div>

        <div class="grid gap-4 xl:grid-cols-[0.9fr,1.1fr]">
          <div
            class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <h4 class="section-title">基础信息</h4>
            <div class="grid gap-3 md:grid-cols-2">
              <div>
                <p class="field-label">时间</p>
                <p class="field-value">{{ formatDate(detail.timestamp) }}</p>
              </div>
              <div>
                <p class="field-label">API Key</p>
                <p class="field-value">{{ detail.apiKeyName || detail.apiKeyId || '-' }}</p>
                <p class="field-sub">{{ detail.apiKeyId || '-' }}</p>
              </div>
              <div>
                <p class="field-label">使用账户</p>
                <p class="field-value">{{ detail.accountName || detail.accountId || '-' }}</p>
                <p class="field-sub">{{ detail.accountTypeName || detail.accountType || '-' }}</p>
              </div>
              <div>
                <p class="field-label">模型</p>
                <p class="field-value">{{ detail.model || '-' }}</p>
                <p class="field-sub">
                  {{ detail.isLongContextRequest ? '长上下文请求' : '标准上下文' }}
                </p>
              </div>
              <div>
                <p class="field-label">推理</p>
                <p class="field-value">{{ formatReasoning(detail.reasoningDisplay) }}</p>
                <p class="field-sub">
                  {{ detail.reasoningSource ? `来源：${detail.reasoningSource}` : '未指定' }}
                </p>
              </div>
            </div>
          </div>

          <div
            class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 class="section-title mb-0">Token 明细</h4>
              <span class="pricing-unit">USD / 1M Token</span>
            </div>
            <div aria-label="Token 与费用明细" class="token-ledger" role="table">
              <div class="token-ledger__header" role="row">
                <span role="columnheader">
                  类别<span class="token-ledger__mobile-unit"> · $/M</span>
                </span>
                <span class="token-ledger__price" role="columnheader">单价 ($/M)</span>
                <span role="columnheader">Token</span>
                <span role="columnheader">费用</span>
              </div>
              <div
                v-for="row in tokenRows"
                :key="row.key"
                class="token-ledger__row"
                :class="`token-ledger__row--${row.key}`"
                role="row"
              >
                <span class="token-ledger__type" role="cell">
                  <span aria-hidden="true" class="token-ledger__dot"></span>
                  <span class="token-ledger__type-copy">
                    <span>{{ row.label }}</span>
                    <span class="token-ledger__mobile-price">{{ formatMobileUnitPrice(row) }}</span>
                  </span>
                </span>
                <span class="token-ledger__price" role="cell">{{ formatUnitPrice(row) }}</span>
                <span class="token-ledger__count" role="cell">{{ formatTokenRowCount(row) }}</span>
                <span class="token-ledger__cost" role="cell">{{ formatTokenRowCost(row) }}</span>
              </div>
              <div class="token-ledger__row token-ledger__total" role="row">
                <strong role="cell">总 Token</strong>
                <span class="token-ledger__price" role="cell">—</span>
                <strong class="token-ledger__count" role="cell">{{
                  formatNumber(detail.totalTokens)
                }}</strong>
                <strong class="token-ledger__cost" role="cell">
                  <span class="sr-only">总费用</span>{{ formatCost(costBreakdown.total) }}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div
          class="model-chain-card rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <div class="model-chain-heading">
            <h4 class="section-title mb-0">模型链路</h4>
            <span>请求 → 响应</span>
          </div>
          <div aria-label="模型请求与响应链路" class="model-chain" role="list">
            <template v-for="(stage, index) in modelStages" :key="stage.key">
              <div class="model-stage" :class="{ 'is-missing': !stage.value }" role="listitem">
                <span class="model-stage__index">{{ index + 1 }}</span>
                <span class="model-stage__copy">
                  <span class="model-stage__label">{{ stage.label }}</span>
                  <strong class="model-stage__value" :title="stage.displayValue">{{
                    stage.displayValue
                  }}</strong>
                </span>
              </div>
              <div
                v-if="index < modelStages.length - 1"
                aria-hidden="true"
                class="model-connector"
                :class="{ 'is-changed': isModelTransitionChanged(index) }"
              >
                <span v-if="isModelTransitionChanged(index)">变化</span>
                <i class="fas fa-arrow-right"></i>
              </div>
            </template>
          </div>
        </div>

        <div
          class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <div class="mb-3 flex items-center justify-between gap-3">
            <h4 class="section-title mb-0">
              {{ hasFullRequestBody ? '完整 Request Body' : 'Request Body 快照' }}
            </h4>
            <el-button v-if="hasStoredRequestBody" size="small" @click="copySnapshot">
              复制 JSON
            </el-button>
          </div>
          <div v-if="hasStoredRequestBody" class="snapshot-panel">
            <pre>{{ formattedSnapshot }}</pre>
          </div>
          <div
            v-else-if="!bodyPreviewEnabled"
            class="rounded-lg border border-dashed border-amber-300 bg-amber-50/70 px-4 py-6 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300"
          >
            请求体预览已关闭，当前仅保留请求摘要字段，不展示请求体快照。
          </div>
          <div
            v-else
            class="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
          >
            未保存请求体快照
          </div>
        </div>

        <div
          v-if="hasUpstreamResponseBody"
          class="rounded-xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/50 dark:bg-gray-900"
        >
          <div class="mb-3 flex items-center justify-between gap-3">
            <h4 class="section-title mb-0">上游返回</h4>
            <el-button size="small" @click="copyUpstreamResponse">复制返回</el-button>
          </div>
          <div class="snapshot-panel response-panel">
            <pre>{{ formattedUpstreamResponse }}</pre>
          </div>
        </div>

        <div
          v-if="canReplay"
          class="replay-card rounded-xl border border-amber-300 bg-amber-50/70 p-4 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20"
        >
          <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h4 class="section-title mb-1">编辑并重放</h4>
              <p class="text-xs leading-5 text-amber-700 dark:text-amber-300">
                将按原接口和原 API Key 重新发起真实请求；可能产生费用、限流和新的请求明细。
              </p>
            </div>
            <el-button :loading="replayLoading" type="warning" @click="replayRequest">
              <i class="fas fa-redo-alt mr-2"></i>
              重放请求
            </el-button>
          </div>
          <textarea
            v-model="replayBodyText"
            aria-label="重放请求体 JSON"
            class="replay-editor mt-4"
            spellcheck="false"
          ></textarea>
          <div
            v-if="replayResult"
            class="mt-4 rounded-lg border border-amber-200 bg-white/80 p-3 dark:border-amber-900/50 dark:bg-gray-900/70"
          >
            <div class="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <el-tag effect="dark" :type="statusTagType(replayResult.statusCode)">
                {{ replayResult.statusCode }}
              </el-tag>
              <span class="text-gray-600 dark:text-gray-300">
                {{ formatDuration(replayResult.durationMs) }}
              </span>
              <span v-if="replayResult.replayRequestId" class="break-all text-xs text-gray-500">
                Request ID: {{ replayResult.replayRequestId }}
              </span>
            </div>
            <div class="snapshot-panel replay-result-panel">
              <pre>{{ formatPayload(replayResult.body) }}</pre>
            </div>
          </div>
        </div>
      </template>
    </div>
  </el-dialog>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { getRequestDetailApi, replayRequestDetailApi } from '@/utils/http_apis'
import {
  showToast,
  formatDurationSeconds,
  formatNumber,
  formatRequestCost as formatCost
} from '@/utils/tools'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  requestId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close'])

const loading = ref(false)
const detail = ref(null)
const bodyPreviewEnabled = ref(false)
const replayEnabled = ref(false)
const replayLoading = ref(false)
const replayBodyText = ref('')
const replayResult = ref(null)
const isMobileViewport = ref(false)

const costBreakdown = computed(() => {
  const breakdown = detail.value?.realCostBreakdown || detail.value?.costBreakdown || {}
  return {
    input: breakdown.input || 0,
    output: breakdown.output || 0,
    cacheCreate: breakdown.cacheCreate || breakdown.cacheWrite || 0,
    cacheRead: breakdown.cacheRead || 0,
    total: breakdown.total || detail.value?.realCost || detail.value?.cost || 0
  }
})

const tokenRows = computed(() => {
  const currentDetail = detail.value || {}
  const unitPricing = currentDetail.unitPricing || {}

  return [
    {
      key: 'input',
      label: '输入',
      tokens: currentDetail.inputTokens,
      cost: costBreakdown.value.input,
      unitPrice: unitPricing.input
    },
    {
      key: 'output',
      label: '输出',
      tokens: currentDetail.outputTokens,
      cost: costBreakdown.value.output,
      unitPrice: unitPricing.output
    },
    {
      key: 'cacheRead',
      label: '缓存读取',
      tokens: currentDetail.cacheReadTokens,
      cost: costBreakdown.value.cacheRead,
      unitPrice: unitPricing.cacheRead
    },
    {
      key: 'cacheCreate',
      label: '缓存创建',
      tokens: currentDetail.cacheCreateTokens,
      cost: costBreakdown.value.cacheCreate,
      unitPrice: unitPricing.cacheCreate,
      notApplicable: currentDetail.cacheCreateNotApplicable === true
    }
  ]
})

const normalizeModelStageValue = (value) => {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

const modelStages = computed(() => {
  const currentDetail = detail.value || {}
  const stages = [
    { key: 'requested', label: '客户端请求模型', value: currentDetail.requestedModel },
    { key: 'mapped', label: '本地映射模型', value: currentDetail.mappedModel },
    { key: 'outbound', label: '实际上游请求模型', value: currentDetail.outboundModel },
    {
      key: 'response',
      label: '上游响应模型',
      value: currentDetail.responseModel,
      emptyText: '未返回'
    }
  ]

  return stages.map((stage) => {
    const value = normalizeModelStageValue(stage.value)
    return {
      ...stage,
      value,
      displayValue: value || stage.emptyText || '未记录'
    }
  })
})

const isModelTransitionChanged = (index) => {
  const currentValue = modelStages.value[index]?.value
  const nextValue = modelStages.value[index + 1]?.value
  return Boolean(currentValue && nextValue && currentValue !== nextValue)
}

const toFiniteDisplayNumber = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const getTokenRowUnitPrice = (row) => {
  if (row.notApplicable) return null

  const persistedPrice = toFiniteDisplayNumber(row.unitPrice)
  if (persistedPrice !== null) return persistedPrice

  const tokens = toFiniteDisplayNumber(row.tokens)
  const cost = toFiniteDisplayNumber(row.cost)
  return tokens !== null && tokens > 0 && cost !== null ? (cost / tokens) * 1_000_000 : null
}

const formatUnitPrice = (row) => {
  const unitPrice = getTokenRowUnitPrice(row)
  if (unitPrice === null) return '—'

  const absolutePrice = Math.abs(unitPrice)
  if (absolutePrice > 0 && absolutePrice < 0.000001) {
    return `$${unitPrice.toExponential(2)}`
  }

  const maximumFractionDigits = absolutePrice >= 1 ? 4 : 6
  return `$${unitPrice.toLocaleString('en-US', { maximumFractionDigits })}`
}

const formatMobileUnitPrice = (row) => {
  const formattedPrice = formatUnitPrice(row)
  return formattedPrice === '—' ? formattedPrice : `${formattedPrice}/M`
}

const formatTokenRowCount = (row) => (row.notApplicable ? '—' : formatNumber(row.tokens))
const formatTokenRowCost = (row) => (row.notApplicable ? '—' : formatCost(row.cost))

const previewSuffixPattern = /\.\.\.\[\d+ chars\]$/

const tryFormatJsonString = (value) => {
  if (typeof value !== 'string') {
    return null
  }

  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch (error) {
    return null
  }
}

const formatJsonLikeText = (value) => {
  if (typeof value !== 'string') {
    return ''
  }

  const suffix = value.match(previewSuffixPattern)?.[0] || ''
  const source = suffix ? value.slice(0, -suffix.length) : value
  let formatted = ''
  let indent = 0
  let inString = false
  let escaping = false

  const appendIndent = () => {
    formatted += '  '.repeat(Math.max(0, indent))
  }

  for (const char of source) {
    if (escaping) {
      formatted += char
      escaping = false
      continue
    }

    if (char === '\\') {
      formatted += char
      escaping = inString
      continue
    }

    if (char === '"') {
      inString = !inString
      formatted += char
      continue
    }

    if (inString) {
      formatted += char
      continue
    }

    if (char === '{' || char === '[') {
      formatted += `${char}\n`
      indent += 1
      appendIndent()
      continue
    }

    if (char === '}' || char === ']') {
      formatted = formatted.replace(/[ \t]+$/g, '')
      formatted = formatted.replace(/\n?$/, '\n')
      indent = Math.max(0, indent - 1)
      appendIndent()
      formatted += char
      continue
    }

    if (char === ',') {
      formatted += ',\n'
      appendIndent()
      continue
    }

    if (char === ':') {
      formatted += ': '
      continue
    }

    formatted += char
  }

  const trimmed = formatted.trim()
  if (!trimmed) {
    return suffix
  }

  return suffix ? `${trimmed}\n${suffix}` : trimmed
}

const extractSnapshotDisplaySource = (snapshot) => {
  if (!snapshot) {
    return ''
  }

  if (
    typeof snapshot === 'object' &&
    !Array.isArray(snapshot) &&
    typeof snapshot.preview === 'string'
  ) {
    return snapshot.preview
  }

  return snapshot
}

const hasFullRequestBody = computed(() => detail.value?.fullRequestBody !== undefined)
const hasRequestBodySnapshot = computed(() => detail.value?.requestBodySnapshot !== undefined)
const hasStoredRequestBody = computed(
  () => hasFullRequestBody.value || hasRequestBodySnapshot.value
)
const hasUpstreamResponseBody = computed(() => detail.value?.upstreamResponseBody !== undefined)
const canReplay = computed(
  () =>
    replayEnabled.value &&
    hasFullRequestBody.value &&
    detail.value?.replayCredentialStored === true &&
    Number(detail.value?.statusCode || 0) >= 400
)

const formattedSnapshot = computed(() => {
  if (!hasStoredRequestBody.value) {
    return ''
  }

  const snapshotSource = hasFullRequestBody.value
    ? detail.value.fullRequestBody
    : extractSnapshotDisplaySource(detail.value.requestBodySnapshot)

  if (typeof snapshotSource === 'string') {
    return tryFormatJsonString(snapshotSource) || formatJsonLikeText(snapshotSource)
  }

  return JSON.stringify(snapshotSource, null, 2)
})

const formatPayload = (payload) => {
  if (typeof payload === 'string') {
    return tryFormatJsonString(payload) || payload
  }
  return JSON.stringify(payload, null, 2)
}

const formattedUpstreamResponse = computed(() => formatPayload(detail.value?.upstreamResponseBody))

const cacheHitRateLabel = computed(() => '读 / (输入 + 读 + 建)')

const emitClose = () => emit('close')

const fetchDetail = async () => {
  if (!props.show || !props.requestId) {
    return
  }

  const targetRequestId = props.requestId

  loading.value = true
  detail.value = null
  try {
    const response = await getRequestDetailApi(targetRequestId)
    if (targetRequestId !== props.requestId || !props.show) return
    if (response?.success === false) {
      showToast(response.message || '加载请求详情失败', 'error')
      return
    }
    bodyPreviewEnabled.value = response.data?.bodyPreviewEnabled === true
    replayEnabled.value = response.data?.replayEnabled === true
    detail.value = response.data?.record || null
    replayBodyText.value = detail.value?.fullRequestBody
      ? JSON.stringify(detail.value.fullRequestBody, null, 2)
      : ''
    replayResult.value = null
  } catch (error) {
    if (targetRequestId !== props.requestId || !props.show) return
    detail.value = null
    bodyPreviewEnabled.value = false
    replayEnabled.value = false
    showToast(`加载请求详情失败：${error.message || '未知错误'}`, 'error')
  } finally {
    if (targetRequestId === props.requestId) {
      loading.value = false
    }
  }
}

const copyUpstreamResponse = async () => {
  try {
    await navigator.clipboard.writeText(formattedUpstreamResponse.value)
    showToast('已复制上游返回', 'success')
  } catch (error) {
    showToast('复制失败，请手动复制', 'error')
  }
}

const replayRequest = async () => {
  let body
  try {
    body = JSON.parse(replayBodyText.value)
  } catch (error) {
    showToast('请求体不是合法 JSON', 'error')
    return
  }

  replayLoading.value = true
  replayResult.value = null
  try {
    const response = await replayRequestDetailApi(props.requestId, { body })
    if (response?.success === false) {
      showToast(response.message || '请求重放失败', 'error')
      return
    }
    replayResult.value = response.data || null
    showToast(`重放完成：HTTP ${response.data?.statusCode || '-'}`, 'success')
  } finally {
    replayLoading.value = false
  }
}

const copySnapshot = async () => {
  if (!formattedSnapshot.value) {
    showToast('没有可复制的快照', 'info')
    return
  }

  try {
    await navigator.clipboard.writeText(formattedSnapshot.value)
    showToast('已复制请求快照', 'success')
  } catch (error) {
    showToast('复制失败，请手动复制', 'error')
  }
}

const formatDate = (value) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-')
const formatDuration = formatDurationSeconds
const formatPercent = (value) => `${Number(value || 0).toFixed(2)}%`
const formatReasoning = (value) => value || '-'

const statusTagType = (statusCode) => {
  if (statusCode >= 500) return 'danger'
  if (statusCode >= 400) return 'warning'
  return 'success'
}

const syncViewportState = () => {
  if (typeof window === 'undefined') {
    return
  }
  isMobileViewport.value = window.innerWidth < 768
}

watch(
  () => [props.show, props.requestId],
  () => {
    fetchDetail()
  },
  { immediate: true }
)

watch(
  () => props.show,
  (visible) => {
    if (!visible) {
      detail.value = null
      bodyPreviewEnabled.value = false
      replayEnabled.value = false
      replayBodyText.value = ''
      replayResult.value = null
    }
  }
)

onMounted(() => {
  syncViewportState()
  window.addEventListener('resize', syncViewportState)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewportState)
})
</script>

<style scoped>
.request-detail-modal :deep(.el-dialog) {
  width: min(960px, calc(100vw - 32px));
  max-width: calc(100vw - 32px);
  margin: 0 auto;
  overflow: hidden;
  border-radius: 24px;
}

.request-detail-modal :deep(.el-dialog__header) {
  margin: 0;
  padding: 18px 20px 0;
  position: sticky;
  top: 0;
  z-index: 3;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(10px);
}

.dark .request-detail-modal :deep(.el-dialog__header) {
  background: rgba(17, 24, 39, 0.98);
}

.request-detail-modal :deep(.el-dialog__body) {
  padding: 12px 20px 20px;
  max-height: min(78vh, 920px);
  overflow-y: auto;
}

.request-detail-modal :deep(.el-dialog.is-fullscreen) {
  width: 100vw !important;
  max-width: none;
  height: 100vh;
  margin: 0;
  border-radius: 0;
}

.request-detail-modal :deep(.el-dialog.is-fullscreen .el-dialog__header) {
  padding: 14px 16px 0;
}

.request-detail-modal :deep(.el-dialog.is-fullscreen .el-dialog__body) {
  padding: 12px 16px 24px;
  max-height: none;
  height: calc(100vh - 76px);
}

.modal-close-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 9999px;
  color: rgb(100 116 139);
  transition: all 0.2s ease;
}

.modal-close-button:hover {
  background: rgba(148, 163, 184, 0.14);
  color: rgb(51 65 85);
}

.dark .modal-close-button {
  color: rgb(203 213 225);
}

.dark .modal-close-button:hover {
  background: rgba(71, 85, 105, 0.35);
  color: rgb(248 250 252);
}

.info-card {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 16px;
  padding: 16px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(240, 249, 255, 0.94));
}

.dark .info-card {
  background: linear-gradient(135deg, rgba(17, 24, 39, 0.94), rgba(15, 23, 42, 0.92));
  border-color: rgba(71, 85, 105, 0.35);
}

.info-label,
.field-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(100 116 139);
}

.info-value,
.field-value {
  margin-top: 6px;
  font-size: 18px;
  font-weight: 700;
  color: rgb(15 23 42);
}

.dark .info-value,
.dark .field-value {
  color: rgb(241 245 249);
}

.info-sub,
.field-sub {
  margin-top: 4px;
  font-size: 12px;
  color: rgb(100 116 139);
}

.section-title {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 700;
  color: rgb(30 41 59);
}

.dark .section-title {
  color: rgb(226 232 240);
}

.pricing-unit {
  border: 1px solid rgba(14, 116, 144, 0.18);
  border-radius: 9999px;
  background: rgba(236, 254, 255, 0.8);
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: rgb(14 116 144);
}

.dark .pricing-unit {
  border-color: rgba(34, 211, 238, 0.2);
  background: rgba(8, 145, 178, 0.12);
  color: rgb(103 232 249);
}

.token-ledger {
  overflow: hidden;
  border: 1px solid rgb(226 232 240);
  border-radius: 14px;
  background: rgb(255 255 255);
  font-variant-numeric: tabular-nums;
}

.dark .token-ledger {
  border-color: rgb(51 65 85);
  background: rgba(15, 23, 42, 0.46);
}

.token-ledger__header,
.token-ledger__row {
  display: grid;
  grid-template-columns: minmax(88px, 1.1fr) minmax(78px, 0.9fr) minmax(62px, 0.72fr) minmax(
      88px,
      1fr
    );
  align-items: center;
  column-gap: 10px;
  padding: 9px 12px;
}

.token-ledger__header {
  background: rgb(248 250 252);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: rgb(100 116 139);
}

.dark .token-ledger__header {
  background: rgba(30, 41, 59, 0.76);
  color: rgb(148 163 184);
}

.token-ledger__header > span:not(:first-child),
.token-ledger__price,
.token-ledger__count,
.token-ledger__cost {
  text-align: right;
}

.token-ledger__row {
  --token-accent: 100 116 139;
  min-height: 42px;
  border-top: 1px solid rgb(241 245 249);
  font-size: 12px;
  color: rgb(71 85 105);
}

.dark .token-ledger__row {
  color: rgb(203 213 225);
  border-top-color: rgba(51, 65, 85, 0.72);
}

.token-ledger__row--input {
  --token-accent: 37 99 235;
}

.token-ledger__row--output {
  --token-accent: 22 163 74;
}

.token-ledger__row--cacheRead {
  --token-accent: 8 145 178;
}

.token-ledger__row--cacheCreate {
  --token-accent: 147 51 234;
}

.dark .token-ledger__row--input {
  --token-accent: 96 165 250;
}

.dark .token-ledger__row--output {
  --token-accent: 74 222 128;
}

.dark .token-ledger__row--cacheRead {
  --token-accent: 34 211 238;
}

.dark .token-ledger__row--cacheCreate {
  --token-accent: 192 132 252;
}

.token-ledger__type {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: rgb(51 65 85);
}

.dark .token-ledger__type {
  color: rgb(226 232 240);
}

.token-ledger__dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 9999px;
  background: rgb(var(--token-accent));
  box-shadow: 0 0 0 3px rgb(var(--token-accent) / 0.12);
}

.token-ledger__type-copy {
  min-width: 0;
}

.token-ledger__count {
  font-weight: 700;
  color: rgb(var(--token-accent));
}

.token-ledger__price {
  color: rgb(100 116 139);
}

.dark .token-ledger__price {
  color: rgb(148 163 184);
}

.token-ledger__cost {
  font-weight: 700;
  color: rgb(180 83 9);
}

.dark .token-ledger__cost {
  color: rgb(251 191 36);
}

.token-ledger__total {
  background: rgba(255, 251, 235, 0.78);
  color: rgb(15 23 42);
}

.token-ledger__total .token-ledger__count {
  color: rgb(15 23 42);
}

.dark .token-ledger__total {
  background: rgba(120, 53, 15, 0.15);
  color: rgb(241 245 249);
}

.dark .token-ledger__total .token-ledger__count {
  color: rgb(241 245 249);
}

.token-ledger__mobile-unit,
.token-ledger__mobile-price {
  display: none;
}

.model-chain-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.model-chain-heading > span {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: rgb(100 116 139);
}

.model-chain {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 52px minmax(0, 1fr) 52px minmax(0, 1fr) 52px minmax(0, 1fr);
  align-items: center;
}

.model-stage {
  display: flex;
  min-width: 0;
  min-height: 84px;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid rgb(226 232 240);
  border-radius: 14px;
  background: linear-gradient(145deg, rgb(248 250 252), rgb(255 255 255));
  padding: 13px;
}

.dark .model-stage {
  border-color: rgb(51 65 85);
  background: linear-gradient(145deg, rgba(30, 41, 59, 0.84), rgba(15, 23, 42, 0.72));
}

.model-stage.is-missing {
  border-style: dashed;
}

.model-stage__index {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgb(224 242 254);
  font-size: 10px;
  font-weight: 800;
  color: rgb(3 105 161);
}

.dark .model-stage__index {
  background: rgba(14, 116, 144, 0.24);
  color: rgb(103 232 249);
}

.model-stage__copy {
  min-width: 0;
}

.model-stage__label {
  display: block;
  font-size: 10px;
  line-height: 1.35;
  color: rgb(100 116 139);
}

.model-stage__value {
  display: -webkit-box;
  overflow: hidden;
  margin-top: 7px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  word-break: break-all;
  font-size: 13px;
  line-height: 1.4;
  color: rgb(15 23 42);
}

.dark .model-stage__value {
  color: rgb(241 245 249);
}

.model-stage.is-missing .model-stage__value {
  font-weight: 500;
  color: rgb(148 163 184);
}

.model-connector {
  position: relative;
  display: flex;
  height: 44px;
  align-items: center;
  justify-content: center;
  color: rgb(148 163 184);
}

.model-connector::before {
  position: absolute;
  right: 0;
  left: 0;
  height: 1px;
  background: rgb(203 213 225);
  content: '';
}

.dark .model-connector::before {
  background: rgb(71 85 105);
}

.model-connector i {
  position: relative;
  z-index: 1;
  background: rgb(255 255 255);
  padding: 3px;
  font-size: 10px;
}

.dark .model-connector i {
  background: rgb(17 24 39);
}

.model-connector > span {
  position: absolute;
  top: -1px;
  z-index: 2;
  border-radius: 9999px;
  background: rgb(255 247 237);
  padding: 2px 5px;
  font-size: 9px;
  font-weight: 700;
  color: rgb(194 65 12);
}

.dark .model-connector > span {
  background: rgb(67 20 7);
  color: rgb(253 186 116);
}

.model-connector.is-changed {
  color: rgb(234 88 12);
}

.model-connector.is-changed::before {
  height: 2px;
  background: rgb(251 146 60);
}

.snapshot-panel {
  max-height: 380px;
  overflow: auto;
  border-radius: 14px;
  background: rgb(15 23 42);
  padding: 16px;
}

.snapshot-panel pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.55;
  color: rgb(226 232 240);
}

.response-panel {
  box-shadow: inset 3px 0 0 rgb(239 68 68);
}

.replay-editor {
  width: 100%;
  min-height: 260px;
  resize: vertical;
  border: 1px solid rgba(217, 119, 6, 0.35);
  border-radius: 14px;
  background: rgb(15 23 42);
  padding: 16px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  color: rgb(226 232 240);
  outline: none;
}

.replay-editor:focus {
  border-color: rgb(245 158 11);
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.16);
}

.replay-result-panel {
  max-height: 300px;
  box-shadow: inset 3px 0 0 rgb(245 158 11);
}

@media (max-width: 899px) {
  .model-chain {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .model-stage {
    min-height: 0;
  }

  .model-connector {
    height: 34px;
    flex: 0 0 34px;
    justify-content: flex-start;
  }

  .model-connector::before {
    top: 0;
    bottom: 0;
    left: 25px;
    width: 1px;
    height: auto;
  }

  .model-connector.is-changed::before {
    width: 2px;
    height: auto;
  }

  .model-connector i {
    position: absolute;
    left: 18px;
    transform: rotate(90deg);
  }

  .model-connector > span {
    top: 50%;
    left: 43px;
    transform: translateY(-50%);
  }
}

@media (max-width: 767px) {
  .request-detail-modal :deep(.el-dialog__header) {
    padding: 14px 16px 0;
  }

  .request-detail-modal :deep(.el-dialog__body) {
    padding: 12px 16px 20px;
    max-height: calc(100vh - 88px);
  }

  .info-card {
    padding: 14px;
  }

  .info-value,
  .field-value {
    font-size: 16px;
  }

  .snapshot-panel {
    max-height: min(42vh, 420px);
    padding: 14px;
  }

  .snapshot-panel pre {
    font-size: 11px;
    line-height: 1.5;
  }
}

@media (max-width: 479px) {
  .pricing-unit {
    display: none;
  }

  .token-ledger__header,
  .token-ledger__row {
    grid-template-columns: minmax(92px, 1.15fr) minmax(48px, 0.65fr) minmax(76px, 1fr);
    column-gap: 8px;
    padding: 9px 10px;
  }

  .token-ledger__price {
    display: none;
  }

  .token-ledger__mobile-unit {
    display: inline;
  }

  .token-ledger__mobile-price {
    display: block;
    margin-top: 2px;
    font-size: 9px;
    font-weight: 500;
    color: rgb(100 116 139);
  }

  .dark .token-ledger__mobile-price {
    color: rgb(148 163 184);
  }

  .token-ledger__row {
    font-size: 11px;
  }
}
</style>
