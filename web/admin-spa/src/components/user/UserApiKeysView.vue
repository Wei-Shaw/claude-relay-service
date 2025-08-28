<template>
  <div class="space-y-6">
    <!-- API Key 创建区域 -->
    <div class="glass-strong rounded-3xl p-6 shadow-xl">
      <div class="mb-6 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <i class="fas fa-key text-2xl text-blue-500" />
          <div>
            <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100">API Keys 管理</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">每个用户只能创建一个 API Key</p>
          </div>
        </div>
        <div class="text-sm text-gray-500 dark:text-gray-400">{{ apiKeys.length }}/1 个 Key</div>
      </div>

      <!-- 创建新 API Key -->
      <div v-if="apiKeys.length === 0" class="space-y-4">
        <div
          class="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 p-6 text-center dark:border-gray-600 dark:bg-gray-800/50"
        >
          <i class="fas fa-plus-circle mb-3 text-3xl text-gray-400" />
          <h4 class="mb-2 text-lg font-medium text-gray-700 dark:text-gray-300">
            创建您的第一个 API Key
          </h4>
          <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
            API Key 将用于访问 Claude Relay Service
          </p>
          <form class="mx-auto max-w-md space-y-4" @submit.prevent="createApiKey">
            <div class="text-center">
              <p class="mb-2 text-sm text-gray-600 dark:text-gray-400">
                API Key 名称将自动设置为您的用户名
              </p>
              <p class="text-sm text-gray-500 dark:text-gray-500">使用额度：无限制</p>
            </div>
            <button
              class="w-full rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-3 font-medium text-white transition-all hover:from-blue-600 hover:to-purple-700 disabled:opacity-50"
              :disabled="createLoading"
              type="submit"
            >
              <div v-if="createLoading" class="flex items-center justify-center gap-2">
                <div
                  class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                ></div>
                创建中...
              </div>
              <div v-else class="flex items-center justify-center gap-2">
                <i class="fas fa-plus" />
                创建 API Key
              </div>
            </button>
          </form>
        </div>
      </div>
    </div>

    <!-- 现有 API Keys 显示 -->
    <div v-if="apiKeys.length > 0" class="space-y-4">
      <div
        v-for="apiKey in apiKeys"
        :key="apiKey.id"
        class="glass-strong rounded-3xl p-6 shadow-xl"
      >
        <div class="mb-4 flex items-start justify-between">
          <div class="flex items-start gap-4">
            <div
              class="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20"
            >
              <i class="fas fa-key text-lg text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
                {{ apiKey.name || '未命名 API Key' }}
              </h4>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                创建时间：{{ formatDate(apiKey.createdAt) }}
              </p>
              <div class="mt-2 flex items-center justify-between">
                <span
                  class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium"
                  :class="
                    apiKey.isActive
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                  "
                >
                  <i :class="apiKey.isActive ? 'fas fa-check-circle' : 'fas fa-times-circle'" />
                  {{ apiKey.isActive ? '活跃' : '已禁用' }}
                </span>

                <!-- 操作按钮 -->
                <div class="flex items-center gap-2">
                  <button
                    :class="[
                      apiKey.isActive
                        ? 'text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-900/20'
                        : 'text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20',
                      'rounded-lg px-3 py-1 text-xs font-medium transition-colors'
                    ]"
                    @click="toggleApiKeyStatus(apiKey)"
                  >
                    <i :class="['fas mr-1', apiKey.isActive ? 'fa-ban' : 'fa-check-circle']" />
                    {{ apiKey.isActive ? '禁用' : '激活' }}
                  </button>
                  <button
                    class="rounded-lg px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    @click="deleteApiKey(apiKey)"
                  >
                    <i class="fas fa-trash mr-1" />删除
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- API Key 显示 - 历史Key无法显示原始内容 -->
        <div class="mb-4 space-y-3">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            API Key
          </label>
          <div
            class="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-600 dark:bg-amber-900/20"
          >
            <div class="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <i class="fas fa-info-circle" />
              <span class="text-sm">
                已关联的历史API
                Key无法显示原始内容，仅在创建时可见。如需查看完整Key，请删除原key创建新Key。
              </span>
            </div>
            <div class="mt-2 text-xs text-amber-600 dark:text-amber-400">
              Key ID: {{ apiKey.id }}
            </div>
          </div>
        </div>

        <!-- 使用统计 -->
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div class="rounded-xl bg-blue-50 p-4 dark:bg-blue-900/20">
            <div class="flex items-center gap-3">
              <i class="fas fa-chart-bar text-blue-500" />
              <div>
                <p class="text-sm font-medium text-blue-800 dark:text-blue-300">今日请求</p>
                <p class="text-xl font-bold text-blue-900 dark:text-blue-100">
                  {{ apiKey.usage?.daily?.requests?.toLocaleString() || 0 }}
                </p>
              </div>
            </div>
          </div>
          <div class="rounded-xl bg-green-50 p-4 dark:bg-green-900/20">
            <div class="flex items-center gap-3">
              <i class="fas fa-coins text-green-500" />
              <div>
                <p class="text-sm font-medium text-green-800 dark:text-green-300">今日Token</p>
                <p class="text-xl font-bold text-green-900 dark:text-green-100">
                  {{ apiKey.usage?.daily?.tokens?.toLocaleString() || 0 }}
                </p>
              </div>
            </div>
          </div>
          <div class="rounded-xl bg-purple-50 p-4 dark:bg-purple-900/20">
            <div class="flex items-center gap-3">
              <i class="fas fa-dollar-sign text-purple-500" />
              <div>
                <p class="text-sm font-medium text-purple-800 dark:text-purple-300">今日费用</p>
                <p class="text-xl font-bold text-purple-900 dark:text-purple-100">
                  ${{ (apiKey.dailyCost || 0).toFixed(4) }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Token 额度进度条 -->
        <div v-if="apiKey.tokenLimit > 0" class="mt-4">
          <div class="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>Token 使用进度</span>
            <span>
              {{ apiKey.usage?.total?.tokens?.toLocaleString() || 0 }} /
              {{ apiKey.tokenLimit?.toLocaleString() || 0 }}
            </span>
          </div>
          <div class="mt-2 h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              class="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-500"
              :style="{
                width: `${Math.min(calculateTokenUsagePercentage(apiKey.usage?.total?.tokens || 0, apiKey.tokenLimit || 0), 100)}%`
              }"
            ></div>
          </div>
        </div>

        <!-- 费用限制进度条 -->
        <div v-if="apiKey.dailyCostLimit > 0" class="mt-4">
          <div class="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>每日费用限制</span>
            <span>
              ${{ (apiKey.dailyCost || 0).toFixed(4) }} / ${{
                (apiKey.dailyCostLimit || 0).toFixed(2)
              }}
            </span>
          </div>
          <div class="mt-2 h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              class="h-full rounded-full bg-gradient-to-r from-green-500 to-red-500 transition-all duration-500"
              :style="{
                width: `${Math.min(calculateCostUsagePercentage(apiKey.dailyCost || 0, apiKey.dailyCostLimit || 0), 100)}%`
              }"
            ></div>
          </div>
        </div>

        <!-- 查看详细统计按钮 -->
        <div class="mt-4">
          <button
            class="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:from-indigo-600 hover:to-purple-700 hover:shadow-lg"
            @click="showUsageDetails(apiKey)"
          >
            <i class="fas fa-chart-line" />
            查看详细统计
          </button>
        </div>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <div class="flex items-center gap-3">
        <div
          class="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"
        ></div>
        <span class="text-gray-600 dark:text-gray-400">加载中...</span>
      </div>
    </div>

    <!-- 错误提示 -->
    <div
      v-if="error"
      class="rounded-xl border border-red-500/30 bg-red-500/20 p-4 text-center text-red-800 dark:text-red-400"
    >
      <i class="fas fa-exclamation-triangle mr-2" />{{ error }}
    </div>

    <!-- 成功提示 -->
    <div
      v-if="successMessage"
      class="rounded-xl border border-green-500/30 bg-green-500/20 p-4 text-center text-green-800 dark:text-green-400"
    >
      <i class="fas fa-check-circle mr-2" />{{ successMessage }}
    </div>

    <!-- 使用详情模态框 -->
    <UsageDetailModal
      :api-key="selectedApiKeyForDetail || {}"
      :show="showUsageDetailModal"
      @close="showUsageDetailModal = false"
    />

    <!-- 新API Key模态框 -->
    <NewApiKeyModal
      v-if="showNewApiKeyModal"
      :api-key="newApiKeyData"
      @close="showNewApiKeyModal = false"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import UsageDetailModal from '@/components/apikeys/UsageDetailModal.vue'
import NewApiKeyModal from '@/components/apikeys/NewApiKeyModal.vue'

defineProps({
  userInfo: {
    type: Object,
    required: true
  }
})

// 响应式数据
const loading = ref(false)
const createLoading = ref(false)
const error = ref('')
const successMessage = ref('')
const apiKeys = ref([])

// 使用详情模态框相关
const showUsageDetailModal = ref(false)
const selectedApiKeyForDetail = ref(null)

// 新API Key模态框相关
const showNewApiKeyModal = ref(false)
const newApiKeyData = ref(null)

const newKeyForm = ref({})

// 获取用户的 API Keys
const fetchApiKeys = async () => {
  loading.value = true
  error.value = ''

  try {
    const token = localStorage.getItem('user_token')
    const response = await fetch('/admin/ldap/user/api-keys', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    const result = await response.json()
    if (result.success) {
      apiKeys.value = result.apiKeys
    } else {
      error.value = result.message || '获取 API Keys 失败'
    }
  } catch (err) {
    console.error('获取 API Keys 错误:', err)
    error.value = '网络错误，请重试'
  } finally {
    loading.value = false
  }
}

// 创建新的 API Key
const createApiKey = async () => {
  createLoading.value = true
  error.value = ''
  successMessage.value = ''

  try {
    const token = localStorage.getItem('user_token')
    const response = await fetch('/admin/ldap/user/api-keys', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // name和limit字段都由后端自动生成/设置
        // name: 用户displayName
        // limit: 0 (无限制)
      })
    })

    const result = await response.json()
    if (result.success) {
      // 显示新API Key模态框
      newApiKeyData.value = result.apiKey
      showNewApiKeyModal.value = true

      // 更新API Keys列表
      apiKeys.value = [result.apiKey]
      newKeyForm.value = {}

      // 清除错误信息
      error.value = ''
    } else {
      error.value = result.message || 'API Key 创建失败'
    }
  } catch (err) {
    console.error('创建 API Key 错误:', err)
    error.value = '网络错误，请重试'
  } finally {
    createLoading.value = false
  }
}

// 计算Token使用百分比
const calculateTokenUsagePercentage = (used, limit) => {
  if (!limit || limit === 0) return 0
  return Math.round((used / limit) * 100)
}

// 计算费用使用百分比
const calculateCostUsagePercentage = (used, limit) => {
  if (!limit || limit === 0) return 0
  return Math.round((used / limit) * 100)
}

// 切换API Key状态
const toggleApiKeyStatus = async (apiKey) => {
  const action = apiKey.isActive ? '禁用' : '激活'
  if (confirm(`确定要${action}这个API Key吗？`)) {
    await updateApiKey(apiKey.id, { isActive: !apiKey.isActive })
  }
}

// 删除API Key
const deleteApiKey = async (apiKey) => {
  if (confirm(`确定要删除API Key "${apiKey.name}" 吗？删除后将无法恢复！`)) {
    try {
      const token = localStorage.getItem('user_token')
      const response = await fetch(`/admin/ldap/user/api-keys/${apiKey.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      const result = await response.json()
      if (result.success) {
        successMessage.value = 'API Key 删除成功'
        // 从本地数组中移除
        const index = apiKeys.value.findIndex((k) => k.id === apiKey.id)
        if (index > -1) {
          apiKeys.value.splice(index, 1)
        }
        setTimeout(() => {
          successMessage.value = ''
        }, 3000)
      } else {
        error.value = result.message || 'API Key 删除失败'
      }
    } catch (err) {
      console.error('删除 API Key 错误:', err)
      error.value = '网络错误，请重试'
    }
  }
}

// 更新API Key
const updateApiKey = async (keyId, updates) => {
  try {
    const token = localStorage.getItem('user_token')
    const response = await fetch(`/admin/ldap/user/api-keys/${keyId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    })

    const result = await response.json()
    if (result.success) {
      successMessage.value = 'API Key 更新成功'
      // 更新本地数据
      const apiKey = apiKeys.value.find((k) => k.id === keyId)
      if (apiKey) {
        Object.assign(apiKey, updates)
      }
      setTimeout(() => {
        successMessage.value = ''
      }, 3000)
    } else {
      error.value = result.message || 'API Key 更新失败'
    }
  } catch (err) {
    console.error('更新 API Key 错误:', err)
    error.value = '网络错误，请重试'
  }
}

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 显示使用详情
const showUsageDetails = (apiKey) => {
  selectedApiKeyForDetail.value = apiKey
  showUsageDetailModal.value = true
}

// 初始化
onMounted(() => {
  fetchApiKeys()
})
</script>

<style scoped>
/* 使用全局样式 */
</style>
