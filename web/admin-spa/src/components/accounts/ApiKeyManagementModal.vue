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
                {{ t('accountModals.apiKeys.title') }}
              </h3>
              <p class="text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                {{ accountName }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="flex items-center gap-2 rounded-lg border border-purple-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-purple-600 shadow-sm transition-all duration-200 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-purple-600/60 dark:bg-purple-900/20 dark:text-purple-200 dark:hover:border-purple-500 dark:hover:bg-purple-900/40 dark:hover:text-purple-100 dark:focus:ring-purple-500/40 sm:text-sm"
              :disabled="loading || apiKeys.length === 0 || copyingAll"
              @click="copyAllApiKeys"
            >
              <i
                :class="[
                  'text-sm sm:text-base',
                  copyingAll ? 'fas fa-spinner fa-spin' : 'fas fa-clipboard-list'
                ]"
              />
              <span>{{ t('accountModals.apiKeys.copyAllKeys') }}</span>
            </button>
            <button
              class="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:text-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:text-gray-200 sm:h-10 sm:w-10"
              :title="t('common.close')"
              @click="$emit('close')"
            >
              <i class="fas fa-times text-base sm:text-lg" />
            </button>
          </div>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="py-8 text-center">
          <div class="loading-spinner-lg mx-auto mb-4" />
          <p class="text-gray-500 dark:text-gray-400">{{ t('accountModals.common.loading') }}</p>
        </div>

        <!-- 空状态：没有加载且没有 API Key -->
        <div
          v-if="!loading && apiKeys.length === 0"
          class="rounded-lg bg-gray-50 py-8 text-center dark:bg-gray-800"
        >
          <i class="fas fa-key mb-4 text-4xl text-gray-300 dark:text-gray-600" />
          <p class="text-gray-500 dark:text-gray-400">{{ t('accountModals.apiKeys.empty') }}</p>
        </div>

        <!-- 有 API Key 时显示菜单和列表 -->
        <div v-if="!loading && apiKeys.length > 0">
          <!-- 菜单栏 -->
          <div class="mb-4 space-y-3">
            <!-- 工具栏：筛选、搜索和操作 -->
            <div
              class="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <!-- 第一行：筛选和搜索 -->
              <div class="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <!-- 左侧：状态筛选 -->
                <div class="flex items-center gap-2">
                  <i class="fas fa-filter text-gray-400 dark:text-gray-500" />
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{
                    t('accountModals.apiKeys.filterLabel')
                  }}</span>
                  <div class="flex gap-1">
                    <button
                      :class="[
                        'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                        statusFilter === 'all'
                          ? 'bg-purple-500 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                      ]"
                      @click="statusFilter = 'all'"
                    >
                      {{ t('accountModals.apiKeys.allCount', { count: apiKeys.length }) }}
                    </button>
                    <button
                      :class="[
                        'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                        statusFilter === 'active'
                          ? 'bg-green-500 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                      ]"
                      @click="statusFilter = 'active'"
                    >
                      <i class="fas fa-check-circle mr-1" />
                      {{ t('accountModals.apiKeys.activeCount', { count: activeKeysCount }) }}
                    </button>
                    <button
                      :class="[
                        'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                        statusFilter === 'error'
                          ? 'bg-red-500 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                      ]"
                      @click="statusFilter = 'error'"
                    >
                      <i class="fas fa-exclamation-triangle mr-1" />
                      {{ t('accountModals.apiKeys.errorCount', { count: errorKeysCount }) }}
                    </button>
                  </div>
                </div>

                <!-- 右侧：搜索框 -->
                <div class="flex flex-1 items-center gap-2 lg:max-w-md">
                  <div class="relative flex-1">
                    <input
                      v-model="searchQuery"
                      class="w-full rounded-md border border-gray-300 bg-gray-50 py-2 pl-10 pr-3 text-sm text-gray-700 transition-colors placeholder:text-gray-400 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:placeholder:text-gray-500 dark:focus:border-purple-400 dark:focus:bg-gray-800"
                      :placeholder="t('accountModals.apiKeys.searchPlaceholder')"
                      type="text"
                    />
                    <i
                      class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                    />
                  </div>
                  <div class="flex gap-1">
                    <button
                      :class="[
                        'rounded-md px-2.5 py-2 text-xs font-medium transition-colors',
                        searchMode === 'fuzzy'
                          ? 'bg-purple-500 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                      ]"
                      :title="t('accountModals.apiKeys.fuzzyTitle')"
                      @click="searchMode = 'fuzzy'"
                    >
                      <i class="fas fa-search mr-1" />
                      {{ t('accountModals.apiKeys.fuzzy') }}
                    </button>
                    <button
                      :class="[
                        'rounded-md px-2.5 py-2 text-xs font-medium transition-colors',
                        searchMode === 'exact'
                          ? 'bg-purple-500 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                      ]"
                      :title="t('accountModals.apiKeys.exactTitle')"
                      @click="searchMode = 'exact'"
                    >
                      <i class="fas fa-equals mr-1" />
                      {{ t('accountModals.apiKeys.exact') }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- 分隔线 -->
              <div class="my-3 border-t border-gray-200 dark:border-gray-700"></div>

              <!-- 第二行：批量操作 -->
              <div class="flex flex-wrap items-center justify-between gap-2">
                <!-- 左侧：操作按钮 -->
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-xs font-medium text-gray-500 dark:text-gray-400">{{
                    t('accountModals.apiKeys.batchActions')
                  }}</span>
                  <button
                    class="group rounded-md bg-gradient-to-r from-red-500 to-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:from-red-600 hover:to-red-700 hover:shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-sm"
                    :disabled="errorKeysCount === 0 || batchDeleting"
                    :title="t('accountModals.apiKeys.deleteErrorTitle')"
                    @click="deleteAllErrorKeys"
                  >
                    <i class="fas fa-trash-alt mr-1" />
                    {{ t('accountModals.apiKeys.deleteError') }}
                  </button>
                  <button
                    class="group rounded-md bg-gradient-to-r from-red-600 to-red-700 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:from-red-700 hover:to-red-800 hover:shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-sm"
                    :disabled="apiKeys.length === 0 || batchDeleting"
                    :title="t('accountModals.apiKeys.deleteAllTitle')"
                    @click="deleteAllKeys"
                  >
                    <i class="fas fa-trash mr-1" />
                    {{ t('accountModals.apiKeys.deleteAll') }}
                  </button>
                  <div class="mx-1 h-5 w-px bg-gray-300 dark:bg-gray-600"></div>
                  <button
                    class="rounded-md bg-gradient-to-r from-blue-500 to-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-sm"
                    :disabled="errorKeysCount === 0"
                    :title="t('accountModals.apiKeys.exportErrorTitle')"
                    @click="exportKeys('error')"
                  >
                    <i class="fas fa-download mr-1" />
                    {{ t('accountModals.apiKeys.exportError') }}
                  </button>
                  <button
                    class="rounded-md bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:from-blue-700 hover:to-blue-800 hover:shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-sm"
                    :disabled="apiKeys.length === 0"
                    :title="t('accountModals.apiKeys.exportAllTitle')"
                    @click="exportKeys('all')"
                  >
                    <i class="fas fa-file-export mr-1" />
                    {{ t('accountModals.apiKeys.exportAll') }}
                  </button>
                </div>

                <!-- 右侧：统计信息 -->
                <div
                  class="flex items-center gap-2 rounded-md bg-purple-50 px-3 py-1.5 dark:bg-purple-900/20"
                >
                  <i class="fas fa-info-circle text-purple-500 dark:text-purple-400" />
                  <span class="text-xs font-medium text-purple-700 dark:text-purple-300">
                    {{ t('accountModals.apiKeys.visibleCountPrefix') }}
                    <strong>{{ filteredApiKeys.length }}</strong>
                    {{ t('accountModals.apiKeys.visibleCountSuffix') }}
                  </span>
                </div>
              </div>
            </div>
          </div>
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
                  :title="
                    t('accountModals.apiKeys.errorStatusTitle', { message: apiKey.errorMessage })
                  "
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
                      :title="t('accountModals.apiKeys.copyApiKeyTitle')"
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
                      :disabled="resetting === apiKey.key"
                      :title="t('accountModals.apiKeys.resetStatusTitle')"
                      @click="resetApiKeyStatus(apiKey)"
                    >
                      <div v-if="resetting === apiKey.key" class="loading-spinner-sm" />
                      <i v-else class="fas fa-redo"></i>
                    </button>
                    <button
                      class="text-xs text-red-500 transition-colors hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:text-red-600"
                      :disabled="deleting === apiKey.key"
                      @click="deleteApiKey(apiKey)"
                    >
                      <div v-if="deleting === apiKey.key" class="loading-spinner-sm" />
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
                          ? t('accountModals.apiKeys.statusActive')
                          : apiKey.status === 'error'
                            ? t('accountModals.apiKeys.statusError')
                            : apiKey.status === 'disabled'
                              ? t('accountModals.apiKeys.statusDisabled')
                              : apiKey.status || t('accountModals.common.unknown')
                      }}
                    </span>
                  </div>
                  <div>
                    <span
                      >{{ t('accountModals.apiKeys.usagePrefix') }}
                      <strong>{{ apiKey.usageCount || 0 }}</strong>
                      {{ t('accountModals.apiKeys.usageSuffix') }}</span
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
              {{
                t('accountModals.apiKeys.pageRange', {
                  start: (currentPage - 1) * pageSize + 1,
                  end: Math.min(currentPage * pageSize, totalItems),
                  total: totalItems
                })
              }}
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
    <ConfirmModal
      :cancel-text="confirmModalConfig.cancelText"
      :confirm-text="confirmModalConfig.confirmText"
      :message="confirmModalConfig.message"
      :show="showConfirmModal"
      :title="confirmModalConfig.title"
      :type="confirmModalConfig.type"
      @cancel="handleCancelModal"
      @confirm="handleConfirmModal"
    />
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { showToast } from '@/utils/tools'
import { getDroidAccountByIdApi, updateDroidAccountApi } from '@/utils/http_apis'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

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
const { t, locale } = useI18n()

const show = ref(true)
const loading = ref(false)
const deleting = ref(null)
const resetting = ref(null)
const apiKeys = ref([])
const currentPage = ref(1)
const pageSize = ref(15)
const copyingAll = ref(false)

// 新增：筛选和搜索相关状态
const statusFilter = ref('all') // 'all' | 'active' | 'error'
const searchQuery = ref('')
const searchMode = ref('fuzzy') // 'fuzzy' | 'exact'
const batchDeleting = ref(false)

// ConfirmModal 状态
const showConfirmModal = ref(false)
const confirmModalConfig = ref({
  title: '',
  message: '',
  type: 'primary',
  confirmText: t('common.confirm'),
  cancelText: t('common.cancel')
})
const confirmResolve = ref(null)

const showConfirm = (
  title,
  message,
  confirmText = t('common.confirm'),
  cancelText = t('common.cancel'),
  type = 'primary'
) => {
  return new Promise((resolve) => {
    confirmModalConfig.value = { title, message, confirmText, cancelText, type }
    confirmResolve.value = resolve
    showConfirmModal.value = true
  })
}
const handleConfirmModal = () => {
  showConfirmModal.value = false
  confirmResolve.value?.(true)
}
const handleCancelModal = () => {
  showConfirmModal.value = false
  confirmResolve.value?.(false)
}

// 掩码显示 API Key（提前声明供 computed 使用）
const maskApiKey = (key) => {
  if (!key || key.length < 12) {
    return key
  }
  return `${key.substring(0, 8)}...${key.substring(key.length - 4)}`
}

// 计算属性：筛选后的 API Keys
const filteredApiKeys = computed(() => {
  let filtered = apiKeys.value

  // 状态筛选
  if (statusFilter.value !== 'all') {
    filtered = filtered.filter((key) => key.status === statusFilter.value)
  }

  // 搜索筛选（使用完整的 key 进行搜索）
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.trim()
    filtered = filtered.filter((key) => {
      const fullKey = key.key // 使用完整的 key
      if (searchMode.value === 'exact') {
        // 精确搜索：完全匹配完整的 key
        return fullKey === query
      } else {
        // 模糊搜索：完整 key 包含查询字符串（不区分大小写）
        return fullKey.toLowerCase().includes(query.toLowerCase())
      }
    })
  }

  return filtered
})

// 计算属性
const totalItems = computed(() => filteredApiKeys.value.length)
const totalPages = computed(() => Math.ceil(totalItems.value / pageSize.value))
const paginatedApiKeys = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredApiKeys.value.slice(start, end)
})

// 统计数量
const activeKeysCount = computed(() => {
  return apiKeys.value.filter((key) => key.status === 'active').length
})

const errorKeysCount = computed(() => {
  return apiKeys.value.filter((key) => key.status === 'error').length
})

// 加载 API Keys
const loadApiKeys = async () => {
  loading.value = true
  try {
    const response = await getDroidAccountByIdApi(props.accountId)
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
    showToast(t('accountModals.apiKeys.loadFailed'), 'error')
  } finally {
    loading.value = false
    // 重置到第一页
    currentPage.value = 1
  }
}

// 删除 API Key
const deleteApiKey = async (apiKey) => {
  if (
    !(await showConfirm(
      t('accountModals.apiKeys.deleteOneTitle'),
      t('accountModals.apiKeys.deleteOneMessage', { key: maskApiKey(apiKey.key) }),
      t('common.delete'),
      t('common.cancel'),
      'danger'
    ))
  ) {
    return
  }

  deleting.value = apiKey.key
  try {
    // 准备更新数据：删除指定的 key
    const updateData = {
      removeApiKeys: [apiKey.key],
      apiKeyUpdateMode: 'delete'
    }

    await updateDroidAccountApi(props.accountId, updateData)

    showToast(t('accountModals.apiKeys.deleteSuccess'), 'success')
    await loadApiKeys()
    emit('refresh')
  } catch (error) {
    console.error('Failed to delete API key:', error)
    showToast(error.response?.data?.error || t('accountModals.apiKeys.deleteFailed'), 'error')
  } finally {
    deleting.value = null
  }
}

// 重置 API Key 状态
const resetApiKeyStatus = async (apiKey) => {
  if (
    !(await showConfirm(
      t('accountModals.apiKeys.resetStatusTitle'),
      t('accountModals.apiKeys.resetStatusMessage', { key: maskApiKey(apiKey.key) }),
      t('accountModals.apiKeys.reset'),
      t('common.cancel'),
      'warning'
    ))
  ) {
    return
  }

  resetting.value = apiKey.key
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

    await updateDroidAccountApi(props.accountId, updateData)

    showToast(t('accountModals.apiKeys.resetSuccess'), 'success')
    await loadApiKeys()
    emit('refresh')
  } catch (error) {
    console.error('Failed to reset API key status:', error)
    showToast(error.response?.data?.error || t('accountModals.apiKeys.resetFailed'), 'error')
  } finally {
    resetting.value = null
  }
}

// 批量删除所有异常状态的 Key
const deleteAllErrorKeys = async () => {
  const errorKeys = apiKeys.value.filter((key) => key.status === 'error')
  if (errorKeys.length === 0) {
    showToast(t('accountModals.apiKeys.noErrorKeys'), 'warning')
    return
  }

  if (
    !(await showConfirm(
      t('accountModals.apiKeys.deleteErrorConfirmTitle'),
      t('accountModals.apiKeys.deleteErrorConfirmMessage', { count: errorKeys.length }),
      t('common.delete'),
      t('common.cancel'),
      'danger'
    ))
  ) {
    return
  }

  batchDeleting.value = true
  try {
    const keysToDelete = errorKeys.map((key) => key.key)
    const updateData = {
      removeApiKeys: keysToDelete,
      apiKeyUpdateMode: 'delete'
    }

    await updateDroidAccountApi(props.accountId, updateData)

    showToast(t('accountModals.apiKeys.deleteErrorSuccess', { count: errorKeys.length }), 'success')
    await loadApiKeys()
    emit('refresh')
  } catch (error) {
    console.error('Failed to delete error API keys:', error)
    showToast(error.response?.data?.error || t('accountModals.apiKeys.batchDeleteFailed'), 'error')
  } finally {
    batchDeleting.value = false
  }
}

// 批量删除所有 Key
const deleteAllKeys = async () => {
  if (apiKeys.value.length === 0) {
    showToast(t('accountModals.apiKeys.noKeysToDelete'), 'warning')
    return
  }

  if (
    !(await showConfirm(
      t('accountModals.apiKeys.deleteAllConfirmTitle'),
      t('accountModals.apiKeys.deleteAllConfirmMessage', { count: apiKeys.value.length }),
      t('common.delete'),
      t('common.cancel'),
      'danger'
    ))
  ) {
    return
  }

  // 二次确认
  if (
    !(await showConfirm(
      t('accountModals.apiKeys.finalConfirmTitle'),
      t('accountModals.apiKeys.finalConfirmMessage'),
      t('accountModals.apiKeys.confirmDelete'),
      t('common.cancel'),
      'danger'
    ))
  ) {
    return
  }

  batchDeleting.value = true
  try {
    const keysToDelete = apiKeys.value.map((key) => key.key)
    const updateData = {
      removeApiKeys: keysToDelete,
      apiKeyUpdateMode: 'delete'
    }

    await updateDroidAccountApi(props.accountId, updateData)

    showToast(
      t('accountModals.apiKeys.deleteAllSuccess', { count: keysToDelete.length }),
      'success'
    )
    await loadApiKeys()
    emit('refresh')
  } catch (error) {
    console.error('Failed to delete all API keys:', error)
    showToast(error.response?.data?.error || t('accountModals.apiKeys.batchDeleteFailed'), 'error')
  } finally {
    batchDeleting.value = false
  }
}

// 导出 Key
const exportKeys = (type) => {
  let keysToExport = []
  let filename = ''

  if (type === 'error') {
    keysToExport = apiKeys.value.filter((key) => key.status === 'error')
    filename = `error_api_keys_${props.accountName}_${new Date().toISOString().split('T')[0]}.txt`
  } else {
    keysToExport = apiKeys.value
    filename = `all_api_keys_${props.accountName}_${new Date().toISOString().split('T')[0]}.txt`
  }

  if (keysToExport.length === 0) {
    showToast(t('accountModals.apiKeys.noKeysToExport'), 'warning')
    return
  }

  // 生成 TXT 内容（每行一个完整的 key）
  const content = keysToExport.map((key) => key.key).join('\n')

  // 创建下载
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  showToast(t('accountModals.apiKeys.exportSuccess', { count: keysToExport.length }), 'success')
}

// 写入剪贴板（带回退逻辑）
const writeToClipboard = async (text) => {
  const canUseClipboardApi =
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function' &&
    (typeof window === 'undefined' || window.isSecureContext !== false)

  if (canUseClipboardApi) {
    await navigator.clipboard.writeText(text)
    return
  }

  if (typeof document === 'undefined') {
    throw new Error('clipboard unavailable')
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (!success) {
      throw new Error('execCommand failed')
    }
  } catch (error) {
    document.body.removeChild(textarea)
    throw error
  }
}

// 复制 API Key
const copyApiKey = async (key) => {
  try {
    await writeToClipboard(key)
    showToast(t('accountModals.apiKeys.copySuccess'), 'success')
  } catch (error) {
    console.error('Failed to copy:', error)
    showToast(t('accountModals.apiKeys.copyFailedManual'), 'error')
  }
}

// 复制全部 API Key
const copyAllApiKeys = async () => {
  if (!apiKeys.value.length || copyingAll.value) {
    return
  }

  copyingAll.value = true
  try {
    const allKeysText = apiKeys.value.map((item) => item.key).join('\n')
    await writeToClipboard(allKeysText)
    showToast(t('accountModals.apiKeys.copyAllSuccess', { count: apiKeys.value.length }), 'success')
  } catch (error) {
    console.error('Failed to copy all keys:', error)
    showToast(t('accountModals.apiKeys.copyAllFailedManual'), 'error')
  } finally {
    copyingAll.value = false
  }
}

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return '-'
  try {
    const date = new Date(timestamp)
    return date.toLocaleString(locale.value, {
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
