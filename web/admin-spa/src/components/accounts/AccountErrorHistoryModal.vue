<template>
  <ModalTransition>
    <div
      v-if="show"
      class="fixed inset-0 z-[1050] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm"
    >
      <div class="absolute inset-0" @click="handleClose" />
      <div
        class="modal-panel relative z-10 mx-3 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200/70 bg-white/95 shadow-2xl ring-1 ring-black/5 dark:border-gray-700/60 dark:bg-gray-900/95 dark:ring-white/10 sm:mx-4"
      >
        <!-- 顶部栏 -->
        <div
          class="flex items-center justify-between border-b border-gray-100 bg-white/80 px-5 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80"
        >
          <div class="flex items-center gap-3">
            <div
              class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-lg"
            >
              <i class="fas fa-exclamation-triangle text-sm" />
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {{ accountName }}
              </h3>
              <p class="text-sm text-gray-500 dark:text-gray-400">错误历史 (最近 3 天)</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="list.length > 0"
              class="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
              @click="handleClear"
            >
              清除历史
            </button>
            <button
              class="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              @click="handleClose"
            >
              <i class="fas fa-times" />
            </button>
          </div>
        </div>

        <!-- 机制说明 -->
        <div
          class="border-b border-gray-100 bg-blue-50/40 px-5 py-2.5 dark:border-gray-800 dark:bg-blue-500/5"
        >
          <button
            class="flex w-full items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400"
            @click="showHelp = !showHelp"
          >
            <i class="fas fa-circle-info text-blue-400" />
            <span>账户错误与自动暂停机制说明</span>
            <i class="ml-auto" :class="showHelp ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" />
          </button>
          <div
            v-if="showHelp"
            class="mt-2 space-y-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400"
          >
            <p>
              ·
              上游返回错误时，系统按状态码自动把账户标记为<b>临时不可用</b>，在冷却时间（TTL）内跳过该账户，到期自动恢复。
            </p>
            <p>
              · 冷却时长：401/403 约 30 分钟、429 优先按响应头 retry-after、529 约 10 分钟、503 约 1
              分钟、其它 5xx 约 5 分钟（均可在 upstreamError 配置调整）。
            </p>
            <p>
              · 每条记录采集出错时的请求与响应信息（上游
              URL、方法、请求/响应头、请求/响应体），可展开复制排查；流式错误响应会在流结束（含中断）后补全已收到的响应体。
            </p>
            <p>
              · 少数场景响应体有限：Bedrock 经 AWS SDK 调用、无原始 HTTP 响应，仅记录请求体 + SDK
              错误摘要（错误码/消息/requestId）；流式请求在
              <b>200 响应中途</b
              >被判限流时无独立错误体、仅记请求与限流响应头；流式在响应体收齐前中断时仅含已收到的部分。
            </p>
            <p>
              · 脱敏分三层：专指凭证的字段（Authorization、API
              Key、Cookie、access_token、client_secret
              等，大小写/驼峰/下划线均识别）整值脱敏；凭证形态的值（sk-、Bearer、JWT
              等）按值脱敏；token/secret/credentials/key/auth
              等宽泛字段<b>仅当值像不透明令牌</b>（16+ 位无分隔连续串）时脱敏，UUID/带分隔的业务
              ID/slug 予以保留。该启发式有边界，复制分享前请自行核对。
            </p>
            <p>· 历史最多保留最近 3 天、每账户 5000 条（均可在 upstreamError 配置调整）。</p>
          </div>
        </div>

        <!-- 内容区 -->
        <div class="flex-1 overflow-y-auto px-5 py-4">
          <!-- 加载中 -->
          <div v-if="loading" class="flex items-center justify-center py-12">
            <i class="fas fa-spinner fa-spin mr-2 text-gray-400" />
            <span class="text-sm text-gray-500 dark:text-gray-400">加载中...</span>
          </div>

          <!-- 空状态 -->
          <div
            v-else-if="!list.length"
            class="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500"
          >
            <i class="fas fa-check-circle mb-3 text-3xl text-green-400" />
            <span class="text-sm">暂无错误记录</span>
          </div>

          <!-- 错误列表 -->
          <div v-else class="space-y-3">
            <div
              v-for="(item, idx) in list"
              :key="idx"
              class="rounded-lg border border-gray-100 bg-gray-50/50 p-3 dark:border-gray-700/50 dark:bg-gray-800/50"
            >
              <!-- 头部: 时间 + 状态码 + 错误类型 -->
              <div class="flex items-center gap-2">
                <span
                  class="inline-flex items-center rounded px-1.5 py-0.5 text-sm font-bold"
                  :class="statusClass(item.status)"
                >
                  {{ item.status }}
                </span>
                <span
                  v-if="item.errorType"
                  class="rounded bg-gray-200 px-1.5 py-0.5 text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                >
                  {{ item.errorType }}
                </span>
                <span class="ml-auto text-sm text-gray-400 dark:text-gray-500">
                  {{ formatTime(item.time) }}
                </span>
              </div>

              <!-- 上下文摘要 -->
              <div
                v-if="item.context"
                class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400"
              >
                <span v-if="item.context.model">
                  <i class="fas fa-robot mr-1" />{{ item.context.model }}
                </span>
                <span v-if="item.context.method || item.context.url" class="break-all">
                  <i class="fas fa-paper-plane mr-1" />{{ item.context.method }}
                  {{ shortUrl(item.context.url) }}
                </span>
                <span v-if="item.context.path">
                  <i class="fas fa-route mr-1" />{{ item.context.path }}
                </span>
                <span v-if="item.context.apiKeyName">
                  <i class="fas fa-key mr-1" />{{ item.context.apiKeyName }}
                </span>
                <span v-if="item.context.reason">
                  <i class="fas fa-tag mr-1" />{{ item.context.reason }}
                </span>
              </div>

              <!-- 可折叠完整请求/响应详情 -->
              <div v-if="hasDetail(item.context)" class="mt-2">
                <button
                  class="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400"
                  @click="toggleDetail(idx)"
                >
                  {{ expandedIdx === idx ? '收起详情' : '查看请求/响应详情' }}
                  <i
                    class="ml-1"
                    :class="expandedIdx === idx ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"
                  />
                </button>
                <div v-if="expandedIdx === idx" class="mt-2 space-y-2">
                  <div v-for="field in detailFields(item.context)" :key="field.key">
                    <div class="mb-1 flex items-center gap-2">
                      <span class="text-sm font-medium text-gray-600 dark:text-gray-300">
                        {{ field.label }}
                      </span>
                      <button
                        class="text-sm text-gray-400 transition hover:text-blue-500"
                        :title="`复制${field.label}`"
                        @click="copyText(field.value, `${idx}-${field.key}`)"
                      >
                        <i
                          :class="
                            copiedKey === `${idx}-${field.key}`
                              ? 'fas fa-check text-green-500'
                              : 'far fa-copy'
                          "
                        />
                      </button>
                    </div>
                    <pre
                      class="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-100 p-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      >{{ field.value }}</pre
                    >
                  </div>
                </div>
              </div>
            </div>

            <!-- 加载更多 -->
            <div v-if="hasMore" class="flex justify-center pb-1 pt-2">
              <button
                class="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                :disabled="loadingMore"
                @click="loadMore"
              >
                <i v-if="loadingMore" class="fas fa-spinner fa-spin mr-1" />
                {{ loadingMore ? '加载中...' : '加载更多' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </ModalTransition>
</template>

<script setup>
import { ref, watch } from 'vue'
import ModalTransition from '@/components/common/ModalTransition.vue'

import * as httpApis from '@/utils/http_apis'
import { formatLocalDateTime } from '@/utils/time'
import { showToast } from '@/utils/tools'

const PAGE_SIZE = 50

const props = defineProps({
  show: Boolean,
  accountType: { type: String, default: '' },
  accountId: { type: String, default: '' },
  accountName: { type: String, default: '' }
})

const emit = defineEmits(['close'])

const loading = ref(false)
const loadingMore = ref(false)
const list = ref([])
const hasMore = ref(false)
const expandedIdx = ref(null)
const showHelp = ref(false)
const copiedKey = ref(null)

const fetchHistory = async (offset = 0) => {
  const res = await httpApis.getAccountErrorHistoryApi(props.accountType, props.accountId, {
    offset,
    limit: PAGE_SIZE
  })
  if (res.success) {
    // res.data 形状异常（非数组）时归空，避免首屏塞入异常结构、翻页 push(...data) 对非可迭代值抛错
    const data = Array.isArray(res.data) ? res.data : []
    if (offset === 0) {
      list.value = data
    } else {
      list.value.push(...data)
    }
    hasMore.value = data.length >= PAGE_SIZE
  } else {
    showToast(res.message || '加载错误历史失败', 'error')
  }
}

watch(
  () => props.show,
  async (val) => {
    if (val) {
      loading.value = true
      list.value = []
      expandedIdx.value = null
      await fetchHistory(0)
      loading.value = false
    }
  }
)

const loadMore = async () => {
  loadingMore.value = true
  await fetchHistory(list.value.length)
  loadingMore.value = false
}

const handleClose = () => emit('close')

const handleClear = async () => {
  const res = await httpApis.clearAccountErrorHistoryApi(props.accountType, props.accountId)
  if (res.success) {
    list.value = []
    hasMore.value = false
    showToast('已清空错误历史', 'success')
  } else {
    showToast(res.message || '清空错误历史失败', 'error')
  }
}

const toggleDetail = (idx) => {
  expandedIdx.value = expandedIdx.value === idx ? null : idx
}

const formatTime = (time) => formatLocalDateTime(time) || '-'

const formatBody = (body) => {
  if (typeof body === 'string') {
    try {
      return JSON.stringify(JSON.parse(body), null, 2)
    } catch {
      return body
    }
  }
  return JSON.stringify(body, null, 2)
}

const shortUrl = (url) => {
  if (!url) return ''
  return url.length > 60 ? `${url.slice(0, 60)}…` : url
}

// 详情字段：request/message 为纯文本，headers/body 做 JSON 美化
const DETAIL_DEFS = [
  {
    key: 'request',
    label: '请求地址',
    get: (c) => (c.method || c.url ? `${c.method || ''} ${c.url || ''}`.trim() : null)
  },
  { key: 'requestHeaders', label: '请求头', get: (c) => c.requestHeaders },
  { key: 'requestBody', label: '请求体', get: (c) => c.requestBody },
  { key: 'responseHeaders', label: '响应头', get: (c) => c.responseHeaders },
  { key: 'errorBody', label: '响应体', get: (c) => c.errorBody },
  { key: 'message', label: '错误信息', get: (c) => c.message }
]

const detailFields = (context) => {
  if (!context) return []
  return DETAIL_DEFS.map((def) => ({ key: def.key, label: def.label, value: def.get(context) }))
    .filter((field) => field.value)
    .map((field) => ({
      ...field,
      value:
        field.key === 'request' || field.key === 'message' ? field.value : formatBody(field.value)
    }))
}

const hasDetail = (context) => detailFields(context).length > 0

const copyText = async (text, key) => {
  try {
    await navigator.clipboard.writeText(text)
    copiedKey.value = key
    setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = null
    }, 1500)
  } catch {
    // 复制失败静默忽略
  }
}

const statusClass = (status) => {
  if (status >= 500 || status === 529)
    return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
  if (status === 429)
    return 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
  if (status === 401 || status === 403)
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
}
</script>
