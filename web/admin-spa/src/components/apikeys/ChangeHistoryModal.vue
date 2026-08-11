<template>
  <ModalTransition @after-leave="onClosed">
    <div v-if="visible" class="modal fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        class="modal-content mx-auto flex max-h-[90vh] w-full max-w-2xl flex-col p-6 dark:bg-gray-800 sm:p-8"
      >
        <div class="mb-5 flex items-center justify-between">
          <div class="min-w-0">
            <div class="flex items-center gap-3">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600"
              >
                <i class="fas fa-history text-white" />
              </div>
              <div class="min-w-0">
                <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">变更记录</h3>
                <p class="truncate text-sm text-gray-500 dark:text-gray-400">
                  {{ apiKeyName || keyId }}
                </p>
              </div>
            </div>
          </div>
          <button
            class="text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
            @click="requestClose"
          >
            <i class="fas fa-times text-xl" />
          </button>
        </div>

        <div class="modal-scroll-content custom-scrollbar flex-1">
          <div v-if="loading" class="py-12 text-center">
            <div class="loading-spinner mx-auto" />
            <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">加载变更记录...</p>
          </div>

          <div
            v-else-if="items.length === 0"
            class="rounded-xl border border-dashed border-gray-200 py-12 text-center dark:border-gray-700"
          >
            <i class="fas fa-inbox mb-3 text-3xl text-gray-300 dark:text-gray-600" />
            <p class="text-sm text-gray-500 dark:text-gray-400">暂无变更记录</p>
            <p class="mt-1 text-sm text-gray-400 dark:text-gray-500">
              快捷调整额度/有效期、禁用/激活会记在这里
            </p>
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="item in items"
              :key="item.id || item.time"
              class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40"
            >
              <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span
                  :class="[
                    'inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium',
                    actionBadgeClass(item.action)
                  ]"
                >
                  <i :class="['fas', actionIcon(item.action), 'mr-1.5']" />
                  {{ actionLabel(item.action) }}
                </span>
                <span class="text-sm text-gray-500 dark:text-gray-400">
                  {{ formatDateTime(item.time) }}
                </span>
              </div>

              <p class="text-sm text-gray-700 dark:text-gray-200">
                {{ formatChangeSummary(item) }}
              </p>

              <div
                class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400"
              >
                <span>
                  <i class="fas fa-user mr-1" />
                  {{ item.operator || 'system' }}
                  <span v-if="item.operatorType === 'system'" class="text-gray-400">（系统）</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="pagination.total > 0"
          class="mt-4 flex flex-col items-center justify-between gap-3 border-t border-gray-100 pt-4 dark:border-gray-700 sm:flex-row"
        >
          <span class="text-sm text-gray-500 dark:text-gray-400">
            共 {{ pagination.total }} 条 · 第 {{ pagination.page }} /
            {{ pagination.totalPages || 1 }} 页
          </span>
          <div class="flex items-center gap-2">
            <button
              class="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              :disabled="loading || pagination.page <= 1"
              type="button"
              @click="goPage(pagination.page - 1)"
            >
              上一页
            </button>
            <button
              class="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              :disabled="loading || pagination.page >= pagination.totalPages"
              type="button"
              @click="goPage(pagination.page + 1)"
            >
              下一页
            </button>
          </div>
        </div>

        <div class="mt-4 flex">
          <button
            class="flex-1 rounded-xl bg-gray-100 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            type="button"
            @click="requestClose"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  </ModalTransition>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'

import ModalTransition from '@/components/common/ModalTransition.vue'
import { formatDateTime } from '@/utils/tools'
import * as httpApis from '@/utils/http_apis'
import { showToast } from '@/utils/tools'

const props = defineProps({
  keyId: {
    type: String,
    required: true
  },
  apiKeyName: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close'])

const visible = ref(false)
const loading = ref(false)
const items = ref([])
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0
})

onMounted(() => {
  visible.value = true
  loadHistory(1)
})

const requestClose = () => {
  visible.value = false
}
const onClosed = () => emit('close')

const actionLabel = (action) => {
  if (action === 'add_cost_limit') return '增加额度'
  if (action === 'extend_expiry') return '延长有效期'
  if (action === 'enable') return '激活'
  if (action === 'disable') return '禁用'
  return action || '变更'
}

const actionIcon = (action) => {
  if (action === 'add_cost_limit') return 'fa-dollar-sign'
  if (action === 'extend_expiry') return 'fa-clock'
  if (action === 'enable') return 'fa-check-circle'
  if (action === 'disable') return 'fa-ban'
  return 'fa-exchange-alt'
}

const actionBadgeClass = (action) => {
  if (action === 'add_cost_limit') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  }
  if (action === 'extend_expiry') {
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  }
  if (action === 'enable') {
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  }
  if (action === 'disable') {
    return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
  }
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
}

const formatMoney = (value) => {
  // totalCostLimit <= 0 / 空 = 无限制（与快捷调整弹窗、业务判定一致）
  if (value === null || value === undefined || value === '') return '无限制'
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return '无限制'
  return `$${number}`
}

const formatExpiry = (value) => {
  if (!value) return '永不过期'
  return formatDateTime(value)
}

const unitLabel = (unit) => {
  if (unit === 'hours') return '小时'
  if (unit === 'months') return '月'
  return '天'
}

const formatChangeSummary = (item) => {
  if (item.action === 'add_cost_limit') {
    const before = item.before?.totalCostLimit
    const after = item.after?.totalCostLimit
    const amount = item.delta?.amount
    return `总额度 ${formatMoney(before)} → ${formatMoney(after)}（+${formatMoney(amount)}）`
  }
  if (item.action === 'extend_expiry') {
    const before = formatExpiry(item.before?.expiresAt)
    const after = formatExpiry(item.after?.expiresAt)
    const amount = item.delta?.amount
    const unit = unitLabel(item.delta?.unit)
    return `过期时间 ${before} → ${after}（+${amount}${unit}）`
  }
  if (item.action === 'enable') return '状态：禁用 → 激活'
  if (item.action === 'disable') return '状态：激活 → 禁用'
  return '配置已更新'
}

const loadHistory = async (page) => {
  loading.value = true
  try {
    const result = await httpApis.getApiKeyChangeHistoryApi(props.keyId, {
      page,
      pageSize: pagination.pageSize
    })
    if (result.success) {
      items.value = result.data?.items || []
      const pageInfo = result.data?.pagination || {}
      pagination.page = pageInfo.page || page
      pagination.pageSize = pageInfo.pageSize || pagination.pageSize
      pagination.total = pageInfo.total || 0
      pagination.totalPages = pageInfo.totalPages || 0
    } else {
      showToast(result.message || '加载变更记录失败', 'error')
    }
  } catch (error) {
    showToast('加载变更记录失败', 'error')
  } finally {
    loading.value = false
  }
}

const goPage = (page) => {
  if (page < 1 || (pagination.totalPages > 0 && page > pagination.totalPages)) return
  loadHistory(page)
}
</script>
