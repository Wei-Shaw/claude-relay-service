<template>
  <div class="space-y-6">
    <!-- 统计概览卡片 -->
    <div class="glass-strong rounded-3xl p-6 shadow-xl">
      <div class="mb-6 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <i class="fas fa-chart-line text-2xl text-blue-500" />
          <div>
            <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100">使用统计</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">您的 API 使用情况概览</p>
          </div>
        </div>
        <button
          class="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
          :disabled="loading"
          @click="refreshStats"
        >
          <i class="fas fa-sync-alt mr-1" :class="{ 'animate-spin': loading }" />
          刷新
        </button>
      </div>

      <!-- 统计卡片网格 -->
      <div v-if="stats" class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <!-- API Key 数量 -->
        <div
          class="rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-600/10 p-4 dark:from-blue-500/5 dark:to-blue-600/5"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-blue-800 dark:text-blue-300">API Keys</p>
              <p class="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {{ stats.keyCount }}
              </p>
            </div>
            <div class="rounded-full bg-blue-500/20 p-2">
              <i class="fas fa-key text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <!-- 总使用量 -->
        <div
          class="rounded-xl bg-gradient-to-br from-green-500/10 to-green-600/10 p-4 dark:from-green-500/5 dark:to-green-600/5"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-green-800 dark:text-green-300">总使用量</p>
              <p class="text-2xl font-bold text-green-900 dark:text-green-100">
                {{ stats.totalUsage.toLocaleString() }}
              </p>
            </div>
            <div class="rounded-full bg-green-500/20 p-2">
              <i class="fas fa-chart-bar text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        <!-- 总额度 -->
        <div
          class="rounded-xl bg-gradient-to-br from-purple-500/10 to-purple-600/10 p-4 dark:from-purple-500/5 dark:to-purple-600/5"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-purple-800 dark:text-purple-300">总额度</p>
              <p class="text-2xl font-bold text-purple-900 dark:text-purple-100">
                {{ stats.totalLimit.toLocaleString() }}
              </p>
            </div>
            <div class="rounded-full bg-purple-500/20 p-2">
              <i class="fas fa-battery-three-quarters text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </div>

        <!-- 使用率 -->
        <div
          class="rounded-xl bg-gradient-to-br from-orange-500/10 to-orange-600/10 p-4 dark:from-orange-500/5 dark:to-orange-600/5"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-orange-800 dark:text-orange-300">使用率</p>
              <p class="text-2xl font-bold text-orange-900 dark:text-orange-100">
                {{ stats.percentage }}%
              </p>
            </div>
            <div class="rounded-full bg-orange-500/20 p-2">
              <i class="fas fa-percentage text-orange-600 dark:text-orange-400" />
            </div>
          </div>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading && !stats" class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="i in 4"
          :key="i"
          class="animate-pulse rounded-xl bg-gray-200/50 p-4 dark:bg-gray-700/50"
        >
          <div class="space-y-3">
            <div class="h-4 w-20 rounded bg-gray-300/70 dark:bg-gray-600/70"></div>
            <div class="h-8 w-16 rounded bg-gray-300/70 dark:bg-gray-600/70"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 各个 API Key 详细统计 -->
    <div v-if="stats && stats.keys.length > 0" class="space-y-4">
      <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-100">API Key 详细统计</h4>

      <div
        v-for="keyStats in stats.keys"
        :key="keyStats.id"
        class="glass-strong rounded-2xl p-5 shadow-lg"
      >
        <div class="mb-4 flex items-start justify-between">
          <div class="flex items-start gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20"
            >
              <i class="fas fa-key text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h5 class="font-semibold text-gray-800 dark:text-gray-100">
                {{ keyStats.name || '未命名 API Key' }}
              </h5>
              <p class="text-sm text-gray-600 dark:text-gray-400">ID: {{ keyStats.id }}</p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-sm text-gray-600 dark:text-gray-400">使用率</p>
            <p class="text-lg font-bold text-gray-800 dark:text-gray-100">
              {{ keyStats.percentage }}%
            </p>
          </div>
        </div>

        <!-- 使用统计条 -->
        <div class="mb-3 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span class="text-gray-600 dark:text-gray-400">已使用：</span>
            <span class="font-semibold text-gray-800 dark:text-gray-100">{{
              keyStats.used.toLocaleString()
            }}</span>
          </div>
          <div>
            <span class="text-gray-600 dark:text-gray-400">总额度：</span>
            <span class="font-semibold text-gray-800 dark:text-gray-100">{{
              keyStats.limit.toLocaleString()
            }}</span>
          </div>
        </div>

        <!-- 进度条 -->
        <div class="relative h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            class="h-full rounded-full bg-gradient-to-r transition-all duration-500"
            :class="getProgressColor(keyStats.percentage)"
            :style="{ width: `${Math.min(keyStats.percentage, 100)}%` }"
          ></div>
        </div>

        <!-- 状态警告 -->
        <div
          v-if="keyStats.percentage >= 90"
          class="mt-3 flex items-center gap-2 text-sm text-red-600 dark:text-red-400"
        >
          <i class="fas fa-exclamation-triangle" />
          <span>额度即将用尽，请注意使用</span>
        </div>
        <div
          v-else-if="keyStats.percentage >= 75"
          class="mt-3 flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400"
        >
          <i class="fas fa-info-circle" />
          <span>额度使用较多，建议关注使用情况</span>
        </div>
      </div>
    </div>

    <!-- 无数据提示 -->
    <div
      v-if="!loading && stats && stats.keys.length === 0"
      class="glass-strong rounded-2xl p-8 text-center shadow-lg"
    >
      <i class="fas fa-chart-line mb-3 text-4xl text-gray-400" />
      <h4 class="mb-2 text-lg font-medium text-gray-700 dark:text-gray-300">暂无使用数据</h4>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        创建 API Key 后开始使用即可查看详细统计
      </p>
    </div>

    <!-- 错误提示 -->
    <div
      v-if="error"
      class="rounded-xl border border-red-500/30 bg-red-500/20 p-4 text-center text-red-800 dark:text-red-400"
    >
      <i class="fas fa-exclamation-triangle mr-2" />{{ error }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

defineProps({
  userInfo: {
    type: Object,
    required: true
  }
})

// 响应式数据
const loading = ref(false)
const error = ref('')
const stats = ref(null)

// 获取用户统计数据
const fetchStats = async () => {
  loading.value = true
  error.value = ''

  try {
    const token = localStorage.getItem('user_token')
    const response = await fetch('/admin/ldap/user/usage-stats', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    const result = await response.json()
    if (result.success) {
      stats.value = result.stats
    } else {
      error.value = result.message || '获取统计数据失败'
    }
  } catch (err) {
    console.error('获取统计数据错误:', err)
    error.value = '网络错误，请重试'
  } finally {
    loading.value = false
  }
}

// 刷新统计数据
const refreshStats = () => {
  fetchStats()
}

// 获取进度条颜色
const getProgressColor = (percentage) => {
  if (percentage >= 90) return 'from-red-500 to-red-600'
  if (percentage >= 75) return 'from-orange-500 to-orange-600'
  if (percentage >= 50) return 'from-yellow-500 to-yellow-600'
  return 'from-green-500 to-green-600'
}

// 初始化
onMounted(() => {
  fetchStats()
})
</script>

<style scoped>
/* 使用全局样式 */
</style>
