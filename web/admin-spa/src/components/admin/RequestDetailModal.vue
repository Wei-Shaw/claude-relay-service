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
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
            <p class="info-label">首词</p>
            <p class="info-value">{{ formatNullableDuration(detail.timeToFirstTokenMs) }}</p>
            <p class="info-sub">
              首包 {{ formatNullableDuration(detail.timeToFirstByteMs) }} · 生成
              {{ formatNullableDuration(detail.contentGenerationMs) }}
            </p>
          </div>
          <div class="info-card">
            <p class="info-label">生成速度</p>
            <p class="info-value">{{ formatGenerationSpeed(detail) }}</p>
            <p class="info-sub">按输出 Token / 内容生成耗时计算</p>
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

        <div class="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
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
              <div class="md:col-span-2">
                <p class="field-label">User-Agent</p>
                <p class="field-value-compact break-all">{{ detail.userAgent || '-' }}</p>
              </div>
            </div>
          </div>

          <div
            class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <h4 class="section-title">Token 明细</h4>
            <div class="space-y-2 text-sm">
              <div class="metric-row">
                <span>输入</span>
                <span class="font-semibold text-blue-600 dark:text-blue-400">{{
                  formatNumber(detail.inputTokens)
                }}</span>
              </div>
              <div class="metric-row">
                <span>输出</span>
                <span class="font-semibold text-green-600 dark:text-green-400">{{
                  formatNumber(detail.outputTokens)
                }}</span>
              </div>
              <div class="metric-row">
                <span>缓存读取</span>
                <span class="font-semibold text-cyan-600 dark:text-cyan-400">{{
                  formatNumber(detail.cacheReadTokens)
                }}</span>
              </div>
              <div class="metric-row">
                <span>缓存创建</span>
                <span class="font-semibold text-purple-600 dark:text-purple-400">{{
                  formatCacheCreate(detail.cacheCreateTokens, detail.cacheCreateNotApplicable)
                }}</span>
              </div>
              <div
                class="metric-row border-t border-dashed border-gray-200 pt-2 dark:border-gray-700"
              >
                <span>总 Token</span>
                <span class="font-semibold text-gray-900 dark:text-gray-100">{{
                  formatNumber(detail.totalTokens)
                }}</span>
              </div>
            </div>
          </div>
        </div>

        <div
          class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <h4 class="section-title">费用拆分</h4>
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div class="cost-chip">
              <span>输入</span>
              <strong>{{ formatCost(costBreakdown.input) }}</strong>
            </div>
            <div class="cost-chip">
              <span>输出</span>
              <strong>{{ formatCost(costBreakdown.output) }}</strong>
            </div>
            <div class="cost-chip">
              <span>缓存创建</span>
              <strong>{{
                formatCacheCreateCost(costBreakdown.cacheCreate, detail.cacheCreateNotApplicable)
              }}</strong>
            </div>
            <div class="cost-chip">
              <span>缓存读取</span>
              <strong>{{ formatCost(costBreakdown.cacheRead) }}</strong>
            </div>
            <div class="cost-chip">
              <span>总计</span>
              <strong>{{ formatCost(costBreakdown.total || detail.cost) }}</strong>
            </div>
          </div>
        </div>

        <div
          class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <div class="mb-3 flex items-center justify-between gap-3">
            <h4 class="section-title mb-0">Request Body 快照</h4>
            <el-button v-if="hasRequestBodySnapshot" size="small" @click="copySnapshot">
              复制 JSON
            </el-button>
          </div>
          <div v-if="hasRequestBodySnapshot" class="snapshot-panel">
            <VueJsonPretty
              v-if="snapshotCanRenderAsJson"
              class="snapshot-json-viewer"
              :collapsed-node-length="12"
              :collapsed-on-click-brackets="true"
              :data="snapshotJsonData"
              :deep="3"
              :show-icon="true"
              :show-length="true"
              theme="dark"
            />
            <pre v-else class="snapshot-plain-text">{{ formattedSnapshot }}</pre>
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
          class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 class="section-title mb-0">Response Body 快照</h4>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ responsePayloadSummary }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <el-tag v-if="detail.responseBodyTruncated" size="small" type="warning">
                已截断
              </el-tag>
              <el-button v-if="hasResponsePayload" size="small" @click="copyResponseSnapshot">
                {{ responseSnapshotCanRenderAsJson ? '复制 JSON' : '复制文本' }}
              </el-button>
            </div>
          </div>

          <div v-if="hasResponseMeta" class="response-meta-grid">
            <div class="response-meta-item">
              <span>大小</span>
              <strong>{{ formatBytes(detail.responseBodySizeBytes) }}</strong>
            </div>
            <div class="response-meta-item">
              <span>Finish</span>
              <strong>{{ detail.finishReason || '-' }}</strong>
            </div>
            <div class="response-meta-item">
              <span>Upstream ID</span>
              <strong class="break-all">{{ detail.upstreamResponseId || '-' }}</strong>
            </div>
            <div class="response-meta-item">
              <span>捕获模式</span>
              <strong>{{ formatCaptureMode(detail.responseMetadata?.captureMode) }}</strong>
            </div>
          </div>

          <div v-if="hasResponsePayload" class="snapshot-panel mt-3">
            <VueJsonPretty
              v-if="responseSnapshotCanRenderAsJson"
              class="snapshot-json-viewer"
              :collapsed-node-length="12"
              :collapsed-on-click-brackets="true"
              :data="responseSnapshotJsonData"
              :deep="3"
              :show-icon="true"
              :show-length="true"
              theme="dark"
            />
            <pre v-else class="snapshot-plain-text">{{ formattedResponseSnapshot }}</pre>
          </div>
          <div
            v-else
            class="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
          >
            未保存响应报文
          </div>

          <div v-if="hasResponseHeaders" class="mt-3">
            <p class="field-label mb-2">Response Headers</p>
            <div class="snapshot-panel snapshot-panel-compact">
              <VueJsonPretty
                class="snapshot-json-viewer"
                :collapsed-node-length="12"
                :collapsed-on-click-brackets="true"
                :data="detail.responseHeaders"
                :deep="2"
                :show-icon="true"
                :show-length="true"
                theme="dark"
              />
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
import VueJsonPretty from 'vue-json-pretty'
import 'vue-json-pretty/lib/styles.css'
import { getRequestDetailApi } from '@/utils/http_apis'
import { showToast, formatNumber } from '@/utils/tools'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  requestId: {
    type: String,
    default: ''
  },
  fetchDetail: {
    type: Function,
    default: null
  }
})

const emit = defineEmits(['close'])

const loading = ref(false)
const detail = ref(null)
const bodyPreviewEnabled = ref(false)
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

const tryParseJsonString = (value) => {
  if (typeof value !== 'string') {
    return {
      success: false,
      data: null
    }
  }

  try {
    return {
      success: true,
      data: JSON.parse(value)
    }
  } catch (error) {
    return {
      success: false,
      data: null
    }
  }
}

const tryParseSseDataString = (value) => {
  if (typeof value !== 'string' || !value.includes('data:')) {
    return {
      success: false,
      data: null
    }
  }

  const events = []
  let sawDataLine = false
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line.startsWith('data:')) {
      continue
    }

    sawDataLine = true
    const dataText = line.slice(5).trim()
    if (!dataText || dataText === '[DONE]') {
      continue
    }

    try {
      events.push(JSON.parse(dataText))
    } catch (error) {
      events.push(dataText)
    }
  }

  if (!sawDataLine || events.length === 0) {
    return {
      success: false,
      data: null
    }
  }

  return {
    success: true,
    data: events
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

const hasPayloadValue = (value) => value !== null && value !== undefined && value !== ''

const extractSnapshotDisplaySource = (snapshot) => {
  if (!hasPayloadValue(snapshot)) {
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

const createSnapshotDisplay = (snapshot) => {
  if (!hasPayloadValue(snapshot)) {
    return {
      canRenderAsJson: false,
      jsonData: null,
      text: ''
    }
  }

  const snapshotSource = extractSnapshotDisplaySource(snapshot)

  if (typeof snapshotSource === 'string') {
    const parsed = tryParseJsonString(snapshotSource)
    const sseParsed = parsed.success ? parsed : tryParseSseDataString(snapshotSource)
    const text = tryFormatJsonString(snapshotSource) || formatJsonLikeText(snapshotSource)

    return {
      canRenderAsJson: sseParsed.success,
      jsonData: sseParsed.success ? sseParsed.data : null,
      text
    }
  }

  return {
    canRenderAsJson: true,
    jsonData: snapshotSource,
    text: JSON.stringify(snapshotSource, null, 2)
  }
}

const hasRequestBodySnapshot = computed(() => hasPayloadValue(detail.value?.requestBodySnapshot))

const snapshotDisplay = computed(() => createSnapshotDisplay(detail.value?.requestBodySnapshot))

const snapshotCanRenderAsJson = computed(() => snapshotDisplay.value.canRenderAsJson)
const snapshotJsonData = computed(() => snapshotDisplay.value.jsonData)
const formattedSnapshot = computed(() => snapshotDisplay.value.text)

const responsePayloadSource = computed(() =>
  hasPayloadValue(detail.value?.responseBodySnapshot)
    ? detail.value.responseBodySnapshot
    : detail.value?.responseTextPreview
)
const hasResponsePayload = computed(() => hasPayloadValue(responsePayloadSource.value))
const responseSnapshotDisplay = computed(() => createSnapshotDisplay(responsePayloadSource.value))
const responseSnapshotCanRenderAsJson = computed(
  () => responseSnapshotDisplay.value.canRenderAsJson
)
const responseSnapshotJsonData = computed(() => responseSnapshotDisplay.value.jsonData)
const formattedResponseSnapshot = computed(() => responseSnapshotDisplay.value.text)
const hasResponseHeaders = computed(
  () =>
    detail.value?.responseHeaders &&
    typeof detail.value.responseHeaders === 'object' &&
    Object.keys(detail.value.responseHeaders).length > 0
)
const hasResponseMeta = computed(() =>
  Boolean(
    detail.value?.responseBodySizeBytes !== undefined ||
      detail.value?.finishReason ||
      detail.value?.upstreamResponseId ||
      detail.value?.responseMetadata?.captureMode
  )
)

const responsePayloadSummary = computed(() => {
  if (!detail.value) {
    return '-'
  }

  const parts = []
  if (detail.value.responseBodySizeBytes !== undefined) {
    parts.push(`大小 ${formatBytes(detail.value.responseBodySizeBytes)}`)
  }
  if (detail.value.responseMetadata?.capturedBytes !== undefined) {
    parts.push(`已捕获 ${formatBytes(detail.value.responseMetadata.capturedBytes)}`)
  }
  if (detail.value.responseBodyTruncated) {
    parts.push('超过上限已截断')
  }
  if (!hasResponsePayload.value && parts.length === 0) {
    return '当前记录没有响应报文快照'
  }

  return parts.length > 0 ? parts.join(' · ') : '已保存响应报文快照'
})

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
    const response = props.fetchDetail
      ? await props.fetchDetail(targetRequestId)
      : await getRequestDetailApi(targetRequestId)
    if (targetRequestId !== props.requestId || !props.show) return
    if (response?.success === false) {
      showToast(response.message || '加载请求详情失败', 'error')
      return
    }
    bodyPreviewEnabled.value = response.data?.bodyPreviewEnabled === true
    detail.value = response.data?.record || null
  } catch (error) {
    if (targetRequestId !== props.requestId || !props.show) return
    detail.value = null
    bodyPreviewEnabled.value = false
    showToast(`加载请求详情失败：${error.message || '未知错误'}`, 'error')
  } finally {
    if (targetRequestId === props.requestId) {
      loading.value = false
    }
  }
}

const copyText = async (text, label) => {
  if (!text) {
    showToast(`没有可复制的${label}`, 'info')
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    showToast(`已复制${label}`, 'success')
  } catch (error) {
    showToast('复制失败，请手动复制', 'error')
  }
}

const copySnapshot = () => copyText(formattedSnapshot.value, '请求快照')
const copyResponseSnapshot = () => copyText(formattedResponseSnapshot.value, '响应快照')

const formatDate = (value) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-')
const formatDuration = (value) => `${Number(value || 0)}ms`
const formatNullableDuration = (value) =>
  value === null || value === undefined || value === '' ? '-' : `${Number(value)}ms`
const getGenerationSpeed = (record) => {
  const outputTokens = Number(record?.outputTokens || 0)
  const contentGenerationMs = Number(record?.contentGenerationMs || 0)
  if (outputTokens <= 0 || contentGenerationMs <= 0) {
    return null
  }

  return Number(((outputTokens * 1000) / contentGenerationMs).toFixed(2))
}
const formatGenerationSpeed = (record) => {
  const speed = getGenerationSpeed(record)
  return speed === null ? '-' : `${speed} tok/s`
}
const formatPercent = (value) => `${Number(value || 0).toFixed(2)}%`
const formatCacheCreate = (value, notApplicable = false) =>
  notApplicable ? '-' : formatNumber(value)
const formatReasoning = (value) => value || '-'
const formatCost = (value) => {
  const num = Number(value || 0)
  if (num >= 1) return `$${num.toFixed(2)}`
  if (num >= 0.001) return `$${num.toFixed(4)}`
  return `$${num.toFixed(6)}`
}
const formatCacheCreateCost = (value, notApplicable = false) =>
  notApplicable ? '-' : formatCost(value)
const formatBytes = (value) => {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '-'
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
}
const formatCaptureMode = (value) => {
  if (value === 'full') return '完整'
  if (value === 'preview') return '预览'
  if (value === 'off') return '关闭'
  return value || '-'
}

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

.field-value-compact {
  margin-top: 6px;
  font-size: 13px;
  font-weight: 500;
  color: rgb(31 41 55);
}

.dark .field-value-compact {
  color: rgb(226 232 240);
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

.metric-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cost-chip {
  border-radius: 14px;
  background: rgb(248 250 252);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.dark .cost-chip {
  background: rgba(30, 41, 59, 0.75);
}

.response-meta-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.response-meta-item {
  min-width: 0;
  border-radius: 12px;
  background: rgb(248 250 252);
  padding: 10px 12px;
  font-size: 12px;
}

.dark .response-meta-item {
  background: rgba(30, 41, 59, 0.75);
}

.response-meta-item span {
  display: block;
  color: rgb(100 116 139);
}

.response-meta-item strong {
  display: block;
  margin-top: 4px;
  color: rgb(30 41 59);
  font-weight: 700;
}

.dark .response-meta-item strong {
  color: rgb(226 232 240);
}

.snapshot-panel {
  max-height: 380px;
  overflow: auto;
  border-radius: 14px;
  background: rgb(15 23 42);
  padding: 16px;
}

.snapshot-panel-compact {
  max-height: 220px;
}

.snapshot-plain-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.55;
  color: rgb(226 232 240);
}

.snapshot-json-viewer {
  min-width: 100%;
  color: rgb(226 232 240);
}

.snapshot-panel :deep(.vjs-tree) {
  font-size: 12px;
  line-height: 1.55;
  color: rgb(226 232 240);
}

.snapshot-panel :deep(.vjs-tree-node) {
  min-height: 20px;
}

.snapshot-panel :deep(.vjs-tree-node:hover),
.snapshot-panel :deep(.vjs-tree-node.dark:hover),
.snapshot-panel :deep(.vjs-tree-node.dark.is-highlight) {
  background: rgba(51, 65, 85, 0.72);
}

.snapshot-panel :deep(.vjs-tree-node .vjs-indent-unit.has-line) {
  border-left-color: rgba(148, 163, 184, 0.32);
}

.snapshot-panel :deep(.vjs-key) {
  color: rgb(191 219 254);
}

.snapshot-panel :deep(.vjs-comment) {
  color: rgb(148 163 184);
}

.snapshot-panel :deep(.vjs-carets),
.snapshot-panel :deep(.vjs-tree-brackets) {
  color: rgb(148 163 184);
}

.snapshot-panel :deep(.vjs-carets:hover),
.snapshot-panel :deep(.vjs-tree-brackets:hover) {
  color: rgb(96 165 250);
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

  .cost-chip {
    padding: 10px 12px;
  }

  .snapshot-panel {
    max-height: min(42vh, 420px);
    padding: 14px;
  }

  .snapshot-plain-text,
  .snapshot-panel :deep(.vjs-tree) {
    font-size: 11px;
    line-height: 1.5;
  }
}
</style>
