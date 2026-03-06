<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-[1050] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm"
    >
      <div class="absolute inset-0" @click="handleClose" />
      <div
        class="relative z-10 mx-3 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200/70 bg-white/95 shadow-2xl ring-1 ring-black/5 dark:border-gray-700/60 dark:bg-gray-900/95 dark:ring-white/10 sm:mx-4"
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
              <p class="text-xs text-gray-500 dark:text-gray-400">错误历史 (最近 3 天)</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="list.length > 0"
              class="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
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
                  class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold"
                  :class="statusClass(item.status)"
                >
                  {{ item.status }}
                </span>
                <span
                  v-if="item.errorType"
                  class="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                >
                  {{ item.errorType }}
                </span>
                <span class="ml-auto text-xs text-gray-400 dark:text-gray-500">
                  {{ formatTime(item.time) }}
                </span>
              </div>

              <!-- 上下文摘要 -->
              <div
                v-if="item.context"
                class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400"
              >
                <span v-if="item.context.model">
                  <i class="fas fa-robot mr-1" />{{ item.context.model }}
                </span>
                <span v-if="item.context.path">
                  <i class="fas fa-route mr-1" />{{ item.context.path }}
                </span>
                <span v-if="item.context.apiKeyName">
                  <i class="fas fa-key mr-1" />{{ item.context.apiKeyName }}
                </span>
              </div>

              <!-- 可折叠错误详情 -->
              <div v-if="item.context?.errorBody" class="mt-2">
                <button
                  class="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400"
                  @click="toggleDetail(idx)"
                >
                  {{ expandedIdx === idx ? '收起详情' : '查看详情' }}
                  <i
                    class="ml-1"
                    :class="expandedIdx === idx ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"
                  />
                </button>
                <pre
                  v-if="expandedIdx === idx"
                  class="mt-2 max-h-48 overflow-auto rounded bg-gray-100 p-2 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >{{ formatBody(item.context.errorBody) }}</pre
                >
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
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import dayjs from 'dayjs'

import * as httpApis from '@/utils/http_apis'

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

const fetchHistory = async (offset = 0) => {
  const res = await httpApis.getAccountErrorHistoryApi(props.accountType, props.accountId, {
    offset,
    limit: PAGE_SIZE
  })
  if (res.success) {
    const data = res.data || []
    if (offset === 0) {
      list.value = data
    } else {
      list.value.push(...data)
    }
    hasMore.value = data.length >= PAGE_SIZE
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
  await httpApis.clearAccountErrorHistoryApi(props.accountType, props.accountId)
  list.value = []
  hasMore.value = false
}

const toggleDetail = (idx) => {
  expandedIdx.value = expandedIdx.value === idx ? null : idx
}

const formatTime = (time) => dayjs(time).format('YYYY-MM-DD HH:mm:ss')

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
