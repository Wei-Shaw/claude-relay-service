<template>
  <Teleport to="body">
    <div v-if="show" class="modal fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4">
      <div
        class="modal-content custom-scrollbar mx-auto max-h-[90vh] w-full max-w-4xl overflow-y-auto p-4 sm:p-6 md:p-8"
      >
        <div class="mb-4 flex items-center justify-between sm:mb-6">
          <div class="flex items-center gap-2 sm:gap-3">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 sm:h-10 sm:w-10 sm:rounded-xl"
            >
              <i class="fas fa-key text-sm text-white sm:text-base" />
            </div>
            <div>
              <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">
                API Key 管理
              </h3>
              <p class="text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                {{ accountName }}
              </p>
            </div>
          </div>
          <button
            class="p-1 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
            @click="$emit('close')"
          >
            <i class="fas fa-times text-lg sm:text-xl" />
          </button>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="py-8 text-center">
          <div class="loading-spinner-lg mx-auto mb-4" />
          <p class="text-gray-500 dark:text-gray-400">加载中...</p>
        </div>

        <!-- API Key 列表 -->
        <div
          v-else-if="apiKeys.length === 0"
          class="rounded-lg bg-gray-50 py-8 text-center dark:bg-gray-800"
        >
          <i class="fas fa-key mb-4 text-4xl text-gray-300 dark:text-gray-600" />
          <p class="text-gray-500 dark:text-gray-400">暂无 API Key</p>
        </div>

        <div v-else>
          <!-- API Key 网格布局 -->
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div
              v-for="(apiKey, index) in paginatedApiKeys"
              :key="index"
              class="relative rounded-lg border border-gray-200 bg-white p-4 transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
            >
              <!-- 左上角错误状态码角标 -->
              <div
                v-if="
                  (apiKey.status === 'error' || apiKey.status === 'disabled') && apiKey.errorMessage
                "
                class="absolute -left-2 -top-2 z-10"
              >
                <span
                  class="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm"
                  :class="[
                    apiKey.status === 'error'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  ]"
                  :title="`错误状态码: ${apiKey.errorMessage}`"
                >
                  {{ apiKey.errorMessage }}
                </span>
              </div>

              <div class="flex flex-col gap-3">
                <!-- API Key 信息 -->
                <div class="flex items-start justify-between gap-2">
                  <span
                    class="flex-1 break-all font-mono text-xs font-medium text-gray-900 dark:text-gray-100"
                    :title="apiKey.key"
                  >
                    {{ maskApiKey(apiKey.key) }}
                  </span>
                  <div class="flex items-center gap-1">
                    <button
                      class="text-xs text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      title="复制 API Key"
                      @click="copyApiKey(apiKey.key)"
                    >
                      <i class="fas fa-copy" />
                    </button>
                    <button
                      v-if="apiKey.status === 'error' || apiKey.status === 'disabled'"
                      class="text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      :class="[
                        apiKey.status === 'error'
                          ? 'text-orange-500 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300'
                          : 'text-yellow-500 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-300'
                      ]"
                      :disabled="resetting === getOriginalIndex(index)"
                      title="重置状态"
                      @click="resetApiKeyStatus(apiKey, getOriginalIndex(index))"
                    >
                      <div
                        v-if="resetting === getOriginalIndex(index)"
                        class="loading-spinner-sm"
                      />
                      <i v-else class="fas fa-redo"></i>
                    </button>
                    <button
                      class="text-xs text-red-500 transition-colors hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:text-red-600"
                      :disabled="deleting === getOriginalIndex(index)"
                      @click="deleteApiKey(apiKey, getOriginalIndex(index))"
                    >
                      <div v-if="deleting === getOriginalIndex(index)" class="loading-spinner-sm" />
                      <i v-else class="fas fa-trash" />
                    </button>
                  </div>
                </div>

                <!-- 统计信息（一行显示） -->
                <div
                  class="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-400"
                >
                  <div>
                    <span
                      :class="[
                        apiKey.status === 'active'
                          ? 'text-green-600 dark:text-green-400'
                          : apiKey.status === 'error'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-yellow-600 dark:text-yellow-400'
                      ]"
                    >
                      <i
                        class="mr-1"
                        :class="[
                          apiKey.status === 'active'
                            ? 'fas fa-check-circle'
                            : apiKey.status === 'error'
                              ? 'fas fa-exclamation-triangle'
                              : 'fas fa-exclamation-circle'
                        ]"
                      />
                      {{
                        apiKey.status === 'active'
                          ? '正常'
                          : apiKey.status === 'error'
                            ? '异常'
                            : apiKey.status === 'disabled'
                              ? '禁用'
                              : apiKey.status || '未知'
                      }}
                    </span>
                  </div>
                  <div>
                    <span
                      >使用: <strong>{{ apiKey.usageCount || 0 }}</strong
                      >次</span
                    >
                  </div>
                  <div v-if="apiKey.lastUsedAt">
                    <span>{{ formatTime(apiKey.lastUsedAt) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 分页控制（底部） -->
          <div v-if="totalPages > 1" class="mt-4 flex items-center justify-between">
            <div class="text-sm text-gray-600 dark:text-gray-400">
              显示 {{ (currentPage - 1) * pageSize + 1 }}-{{
                Math.min(currentPage * pageSize, totalItems)
              }}
              项，共 {{ totalItems }} 项
            </div>
            <div class="flex items-center gap-2">
              <button
                class="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                :disabled="currentPage === 1"
                @click="currentPage = 1"
              >
                <i class="fas fa-angle-double-left" />
              </button>
              <button
                class="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                :disabled="currentPage === 1"
                @click="currentPage--"
              >
                <i class="fas fa-angle-left" />
              </button>
              <span class="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ currentPage }} / {{ totalPages }}
              </span>
              <button
                class="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                :disabled="currentPage === totalPages"
                @click="currentPage++"
              >
                <i class="fas fa-angle-right" />
              </button>
              <button
                class="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                :disabled="currentPage === totalPages"
                @click="currentPage = totalPages"
              >
                <i class="fas fa-angle-double-right" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { showToast } from '@/utils/toast'
import { apiClient } from '@/config/api'

const props = defineProps({
  accountId: {
    type: String,
    required: true
  },
  accountName: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close', 'refresh'])

const show = ref(true)
const loading = ref(false)
const deleting = ref(null)
const resetting = ref(null)
const apiKeys = ref([])
const currentPage = ref(1)
const pageSize = ref(18)

// 计算属性
const totalItems = computed(() => apiKeys.value.length)
const totalPages = computed(() => Math.ceil(totalItems.value / pageSize.value))
const paginatedApiKeys = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return apiKeys.value.slice(start, end)
})

// 获取原始索引的方法
const getOriginalIndex = (paginatedIndex) => {
  return (currentPage.value - 1) * pageSize.value + paginatedIndex
}

// 加载 API Keys
const loadApiKeys = async () => {
  loading.value = true
  try {
    const response = await apiClient.get(`/admin/droid-accounts/${props.accountId}`)
    const account = response.data

    // 解析 apiKeys
    let parsedKeys = []
    if (Array.isArray(account.apiKeys)) {
      parsedKeys = account.apiKeys
    } else if (typeof account.apiKeys === 'string') {
      try {
        parsedKeys = JSON.parse(account.apiKeys)
      } catch (error) {
        console.error('Failed to parse apiKeys:', error)
      }
    }

    // 转换为统一格式
    const formattedKeys = parsedKeys.map((item) => {
      if (typeof item === 'string') {
        // 对于字符串类型的API Key，保持默认状态为active
        return {
          key: item,
          usageCount: 0,
          status: 'active',
          lastUsedAt: null,
          errorMessage: ''
        }
      } else if (typeof item === 'object' && item !== null) {
        // 对于对象类型的API Key，保留所有状态信息
        return {
          key: item.key || item.apiKey || '',
          usageCount: item.usageCount || item.count || 0,
          status: item.status || 'active', // 保留后端返回的状态
          lastUsedAt: item.lastUsedAt || item.lastUsed || null,
          errorMessage: item.errorMessage || '' // 保留后端返回的错误信息
        }
      }
      // 其他情况，默认为active状态
      return {
        key: String(item),
        usageCount: 0,
        status: 'active',
        lastUsedAt: null,
        errorMessage: ''
      }
    })

    // 按最新使用时间排序（最近使用的在前，未使用的在后）
    apiKeys.value = formattedKeys.sort((a, b) => {
      // 如果都有 lastUsedAt，按时间降序排序
      if (a.lastUsedAt && b.lastUsedAt) {
        return new Date(b.lastUsedAt) - new Date(a.lastUsedAt)
      }
      // 如果 a 有时间，b 没有，a 排在前面
      if (a.lastUsedAt && !b.lastUsedAt) {
        return -1
      }
      // 如果 b 有时间，a 没有，b 排在前面
      if (!a.lastUsedAt && b.lastUsedAt) {
        return 1
      }
      // 如果都没有时间，按使用次数降序排序
      return (b.usageCount || 0) - (a.usageCount || 0)
    })
  } catch (error) {
    console.error('Failed to load API keys:', error)
    showToast('加载 API Key 失败', 'error')
  } finally {
    loading.value = false
    // 重置到第一页
    currentPage.value = 1
  }
}

// 删除 API Key
const deleteApiKey = async (apiKey, index) => {
  if (!confirm(`确定要删除 API Key "${maskApiKey(apiKey.key)}" 吗？`)) {
    return
  }

  deleting.value = index
  try {
    // 准备更新数据：删除指定的 key
    const updateData = {
      removeApiKeys: [apiKey.key],
      apiKeyUpdateMode: 'delete'
    }

    await apiClient.put(`/admin/droid-accounts/${props.accountId}`, updateData)

    showToast('API Key 已删除', 'success')
    await loadApiKeys()
    emit('refresh')
  } catch (error) {
    console.error('Failed to delete API key:', error)
    showToast(error.response?.data?.error || '删除 API Key 失败', 'error')
  } finally {
    deleting.value = null
  }
}

// 重置 API Key 状态
const resetApiKeyStatus = async (apiKey, index) => {
  if (
    !confirm(
      `确定要重置 API Key "${maskApiKey(apiKey.key)}" 的状态吗？这将清除错误信息并恢复为正常状态。`
    )
  ) {
    return
  }

  resetting.value = index
  try {
    // 准备更新数据：重置指定 key 的状态
    const updateData = {
      apiKeys: [
        {
          key: apiKey.key,
          status: 'active',
          errorMessage: ''
        }
      ],
      apiKeyUpdateMode: 'update'
    }

    await apiClient.put(`/admin/droid-accounts/${props.accountId}`, updateData)

    showToast('API Key 状态已重置', 'success')
    await loadApiKeys()
    emit('refresh')
  } catch (error) {
    console.error('Failed to reset API key status:', error)
    showToast(error.response?.data?.error || '重置 API Key 状态失败', 'error')
  } finally {
    resetting.value = null
  }
}

// 掩码显示 API Key
const maskApiKey = (key) => {
  if (!key || key.length < 12) {
    return key
  }
  return `${key.substring(0, 8)}...${key.substring(key.length - 4)}`
}

// 复制 API Key
const copyApiKey = async (key) => {
  try {
    await navigator.clipboard.writeText(key)
    showToast('API Key 已复制', 'success')
  } catch (error) {
    console.error('Failed to copy:', error)
    showToast('复制失败', 'error')
  }
}

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return '-'
  try {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (error) {
    return '-'
  }
}

onMounted(() => {
  loadApiKeys()
})
</script>
