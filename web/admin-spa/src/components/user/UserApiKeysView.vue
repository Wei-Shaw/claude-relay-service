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
          <form class="mx-auto max-w-md space-y-3" @submit.prevent="createApiKey">
            <input
              v-model="newKeyForm.name"
              class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-800 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-400"
              placeholder="API Key 名称（可选）"
              type="text"
            />
            <input
              v-model.number="newKeyForm.limit"
              class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-800 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-400"
              max="1000000"
              min="1000"
              placeholder="使用额度（默认 100,000）"
              type="number"
            />
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
              <div class="mt-2 flex items-center gap-2">
                <span
                  class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium"
                  :class="
                    apiKey.status === 'active'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                  "
                >
                  <i
                    :class="
                      apiKey.status === 'active' ? 'fas fa-check-circle' : 'fas fa-times-circle'
                    "
                  />
                  {{ apiKey.status === 'active' ? '活跃' : '已禁用' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- API Key 显示 -->
        <div class="mb-4 space-y-3">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            API Key
          </label>
          <div class="flex gap-2">
            <input
              class="flex-1 rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 font-mono text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400"
              readonly
              type="text"
              :value="showApiKey[apiKey.id] ? apiKey.key : maskApiKey(apiKey.key)"
            />
            <button
              class="rounded-xl border border-gray-300 px-4 py-3 text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
              @click="toggleApiKeyVisibility(apiKey.id)"
            >
              <i :class="showApiKey[apiKey.id] ? 'fas fa-eye-slash' : 'fas fa-eye'" />
            </button>
            <button
              class="rounded-xl border border-gray-300 px-4 py-3 text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
              @click="copyApiKey(apiKey.key)"
            >
              <i class="fas fa-copy" />
            </button>
          </div>
        </div>

        <!-- 使用统计 -->
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div class="rounded-xl bg-blue-50 p-4 dark:bg-blue-900/20">
            <div class="flex items-center gap-3">
              <i class="fas fa-chart-bar text-blue-500" />
              <div>
                <p class="text-sm font-medium text-blue-800 dark:text-blue-300">已使用</p>
                <p class="text-xl font-bold text-blue-900 dark:text-blue-100">
                  {{ apiKey.used?.toLocaleString() || 0 }}
                </p>
              </div>
            </div>
          </div>
          <div class="rounded-xl bg-green-50 p-4 dark:bg-green-900/20">
            <div class="flex items-center gap-3">
              <i class="fas fa-battery-three-quarters text-green-500" />
              <div>
                <p class="text-sm font-medium text-green-800 dark:text-green-300">总额度</p>
                <p class="text-xl font-bold text-green-900 dark:text-green-100">
                  {{ apiKey.limit?.toLocaleString() || 0 }}
                </p>
              </div>
            </div>
          </div>
          <div class="rounded-xl bg-purple-50 p-4 dark:bg-purple-900/20">
            <div class="flex items-center gap-3">
              <i class="fas fa-percentage text-purple-500" />
              <div>
                <p class="text-sm font-medium text-purple-800 dark:text-purple-300">使用率</p>
                <p class="text-xl font-bold text-purple-900 dark:text-purple-100">
                  {{ calculateUsagePercentage(apiKey.used, apiKey.limit) }}%
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- 使用进度条 -->
        <div class="mt-4">
          <div class="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>使用进度</span>
            <span>{{ calculateUsagePercentage(apiKey.used, apiKey.limit) }}%</span>
          </div>
          <div class="mt-2 h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              class="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-500"
              :style="{
                width: `${Math.min(calculateUsagePercentage(apiKey.used, apiKey.limit), 100)}%`
              }"
            ></div>
          </div>
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
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'

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
const showApiKey = reactive({})

const newKeyForm = ref({
  name: '',
  limit: 100000
})

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
        name: newKeyForm.value.name || 'AD用户密钥',
        limit: newKeyForm.value.limit || 100000
      })
    })

    const result = await response.json()
    if (result.success) {
      successMessage.value = 'API Key 创建成功'
      apiKeys.value = [result.apiKey]
      newKeyForm.value = { name: '', limit: 100000 }

      // 3秒后清除成功消息
      setTimeout(() => {
        successMessage.value = ''
      }, 3000)
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

// 切换 API Key 显示/隐藏
const toggleApiKeyVisibility = (keyId) => {
  showApiKey[keyId] = !showApiKey[keyId]
}

// 复制 API Key
const copyApiKey = async (apiKey) => {
  try {
    await navigator.clipboard.writeText(apiKey)
    successMessage.value = 'API Key 已复制到剪贴板'
    setTimeout(() => {
      successMessage.value = ''
    }, 2000)
  } catch (err) {
    console.error('复制失败:', err)
    error.value = '复制失败，请手动选择复制'
  }
}

// 遮盖 API Key
const maskApiKey = (key) => {
  if (!key) return ''
  const start = key.substring(0, 8)
  const end = key.substring(key.length - 8)
  return `${start}${'*'.repeat(20)}${end}`
}

// 计算使用百分比
const calculateUsagePercentage = (used, limit) => {
  if (!limit || limit === 0) return 0
  return Math.round((used / limit) * 100)
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

// 初始化
onMounted(() => {
  fetchApiKeys()
})
</script>

<style scoped>
/* 使用全局样式 */
</style>
