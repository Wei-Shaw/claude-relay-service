<template>
  <div class="min-h-screen p-4 md:p-6" :class="isDarkMode ? 'gradient-bg-dark' : 'gradient-bg'">
    <!-- 顶部导航 -->
    <div class="mb-6 rounded border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 md:mb-8 md:p-6">
      <div class="flex flex-col items-center justify-between gap-4 md:flex-row">
        <LogoTitle
          :loading="oemLoading"
          :logo-src="oemSettings.siteIconData || oemSettings.siteIcon"
          :subtitle="currentTab === 'stats' ? 'API Key 使用统计' : '使用教程'"
          :title="oemSettings.siteName"
        />
        <div class="flex items-center gap-2 md:gap-4">
          <!-- 主题切换按钮 -->
          <div class="flex items-center">
            <ThemeToggle mode="dropdown" />
          </div>

          <!-- 分隔线 -->
          <div
            v-if="oemSettings.ldapEnabled || oemSettings.showAdminButton !== false"
            class="h-8 w-px bg-gray-300 dark:bg-gray-600"
          />

          <!-- 用户登录按钮 (仅在 LDAP 启用时显示) -->
          <router-link
            v-if="oemSettings.ldapEnabled"
            class="user-login-button flex items-center gap-2 rounded px-4 py-2 text-white transition-all duration-300 md:px-5 md:py-2.5"
            to="/user-login"
          >
            <i class="fas fa-user text-sm md:text-base" />
            <span class="text-xs font-semibold tracking-wide md:text-sm">用户登录</span>
          </router-link>
          <!-- 管理后台按钮 -->
          <router-link
            v-if="oemSettings.showAdminButton !== false"
            class="admin-button-refined flex items-center gap-2 rounded px-4 py-2 transition-all duration-300 md:px-5 md:py-2.5"
            to="/dashboard"
          >
            <i class="fas fa-shield-alt text-sm md:text-base" />
            <span class="text-xs font-semibold tracking-wide md:text-sm">管理后台</span>
          </router-link>
        </div>
      </div>
    </div>

    <!-- Tab 切换 -->
    <div class="mb-6 md:mb-8">
      <div class="flex justify-center">
        <div
          class="inline-flex w-full max-w-md rounded-full border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-700 dark:bg-gray-800 md:w-auto"
        >
          <button
            :class="['tab-pill-button', currentTab === 'stats' ? 'active' : '']"
            @click="currentTab = 'stats'"
          >
            <i class="fas fa-chart-line mr-1 md:mr-2" />
            <span class="text-sm md:text-base">统计查询</span>
          </button>
          <button
            :class="['tab-pill-button', currentTab === 'tutorial' ? 'active' : '']"
            @click="currentTab = 'tutorial'"
          >
            <i class="fas fa-graduation-cap mr-1 md:mr-2" />
            <span class="text-sm md:text-base">使用教程</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 统计内容 -->
    <div v-if="currentTab === 'stats'" class="tab-content">
      <!-- API Key 输入区域 -->
      <ApiKeyInput />

      <!-- 错误提示 -->
      <div v-if="error" class="mb-6 md:mb-8">
        <div
          class="rounded border border-red-500/30 bg-red-500/20 p-3 text-sm text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200 md:p-4 md:text-base"
        >
          <i class="fas fa-exclamation-triangle mr-2" />
          {{ error }}
        </div>
      </div>

      <!-- 统计数据展示区域 -->
      <div v-if="statsData" class="fade-in">
        <div class="rounded border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 md:p-6">
          <!-- 时间范围选择器 -->
          <div class="mb-4 border-b border-gray-200 pb-4 dark:border-gray-700 md:mb-6 md:pb-6">
            <div
              class="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center md:gap-4"
            >
              <div class="flex items-center gap-2 md:gap-3">
                <i class="fas fa-clock text-base text-gray-600 dark:text-gray-400 md:text-lg" />
                <span class="text-base font-medium text-gray-700 dark:text-gray-200 md:text-lg"
                  >统计时间范围</span
                >
              </div>
              <div class="flex w-full items-center gap-2 md:w-auto">
                <button
                  class="flex flex-1 items-center justify-center gap-1 px-4 py-2 text-xs font-medium md:flex-none md:gap-2 md:px-6 md:text-sm"
                  :class="['period-btn', { active: statsPeriod === 'daily' }]"
                  :disabled="loading || modelStatsLoading"
                  @click="switchPeriod('daily')"
                >
                  <i class="fas fa-calendar-day text-xs md:text-sm" />
                  今日
                </button>
                <button
                  class="flex flex-1 items-center justify-center gap-1 px-4 py-2 text-xs font-medium md:flex-none md:gap-2 md:px-6 md:text-sm"
                  :class="['period-btn', { active: statsPeriod === 'monthly' }]"
                  :disabled="loading || modelStatsLoading"
                  @click="switchPeriod('monthly')"
                >
                  <i class="fas fa-calendar-alt text-xs md:text-sm" />
                  本月
                </button>
                <!-- 测试按钮 - 仅在单Key模式下显示 -->
                <button
                  v-if="!multiKeyMode"
                  class="test-btn flex items-center justify-center gap-1 px-4 py-2 text-xs font-medium md:gap-2 md:px-6 md:text-sm"
                  :disabled="loading"
                  @click="openTestModal"
                >
                  <i class="fas fa-vial text-xs md:text-sm" />
                  测试
                </button>
              </div>
            </div>
          </div>

          <!-- 基本信息和统计概览 -->
          <StatsOverview />

          <!-- Token 分布和限制配置 -->
          <div
            class="mb-6 mt-6 grid grid-cols-1 gap-4 md:mb-8 md:mt-8 md:gap-6 xl:grid-cols-2 xl:items-stretch"
          >
            <TokenDistribution class="h-full" />
            <template v-if="multiKeyMode">
              <AggregatedStatsCard class="h-full" />
            </template>
            <template v-else>
              <LimitConfig class="h-full" />
            </template>
          </div>

          <!-- 模型使用统计 -->
          <ModelUsageStats />
        </div>
      </div>
    </div>

    <!-- 教程内容 -->
    <div v-if="currentTab === 'tutorial'" class="tab-content">
      <div class="rounded border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <TutorialView />
      </div>
    </div>

    <!-- API Key 测试弹窗 -->
    <ApiKeyTestModal
      :api-key-name="statsData?.name || ''"
      :api-key-value="apiKey"
      :show="showTestModal"
      @close="closeTestModal"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'
import { useThemeStore } from '@/stores/theme'
import LogoTitle from '@/components/common/LogoTitle.vue'
import ThemeToggle from '@/components/common/ThemeToggle.vue'
import ApiKeyInput from '@/components/apistats/ApiKeyInput.vue'
import StatsOverview from '@/components/apistats/StatsOverview.vue'
import TokenDistribution from '@/components/apistats/TokenDistribution.vue'
import LimitConfig from '@/components/apistats/LimitConfig.vue'
import AggregatedStatsCard from '@/components/apistats/AggregatedStatsCard.vue'
import ModelUsageStats from '@/components/apistats/ModelUsageStats.vue'
import TutorialView from './TutorialView.vue'
import ApiKeyTestModal from '@/components/apikeys/ApiKeyTestModal.vue'

const route = useRoute()
const apiStatsStore = useApiStatsStore()
const themeStore = useThemeStore()

// 当前标签页
const currentTab = ref('stats')

// 主题相关
const isDarkMode = computed(() => themeStore.isDarkMode)

const {
  apiKey,
  apiId,
  loading,
  modelStatsLoading,
  oemLoading,
  error,
  statsPeriod,
  statsData,
  oemSettings,
  multiKeyMode
} = storeToRefs(apiStatsStore)

const { queryStats, switchPeriod, loadStatsWithApiId, loadOemSettings, reset } = apiStatsStore

// 测试弹窗状态
const showTestModal = ref(false)

// 打开测试弹窗
const openTestModal = () => {
  showTestModal.value = true
}

// 关闭测试弹窗
const closeTestModal = () => {
  showTestModal.value = false
}

// 处理键盘快捷键
const handleKeyDown = (event) => {
  // Ctrl/Cmd + Enter 查询
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    if (!loading.value && apiKey.value.trim()) {
      queryStats()
    }
    event.preventDefault()
  }

  // ESC 清除数据
  if (event.key === 'Escape') {
    reset()
  }
}

// 初始化
onMounted(() => {
  // API Stats Page loaded

  // 初始化主题（因为该页面不在 MainLayout 内）
  themeStore.initTheme()

  // 加载 OEM 设置
  loadOemSettings()

  // 检查 URL 参数
  const urlApiId = route.query.apiId
  const urlApiKey = route.query.apiKey

  if (
    urlApiId &&
    urlApiId.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
  ) {
    // 如果 URL 中有 apiId，直接使用 apiId 加载数据
    apiId.value = urlApiId
    loadStatsWithApiId()
  } else if (urlApiKey && urlApiKey.length > 10) {
    // 向后兼容，支持 apiKey 参数
    apiKey.value = urlApiKey
  }

  // 添加键盘事件监听
  document.addEventListener('keydown', handleKeyDown)
})

// 清理
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})

// 监听 API Key 变化
watch(apiKey, (newValue) => {
  if (!newValue) {
    apiStatsStore.clearData()
  }
})
</script>

<style scoped>
/* Vercel flat backgrounds */
.gradient-bg {
  background: #fafafa;
  min-height: 100vh;
  position: relative;
}

.gradient-bg-dark {
  background: #000;
  min-height: 100vh;
  position: relative;
}

/* Removed old glass-strong and gradient styles - using Vercel flat design */

/* 标题 */
.header-title {
  color: #000;
  font-weight: 700;
  letter-spacing: -0.025em;
}

:global(.dark) .header-title {
  color: #fff;
}

/* 用户登录按钮 - Vercel flat style */
.user-login-button {
  background: #10b981;
  border: 1px solid #10b981;
  color: white;
  text-decoration: none;
  font-weight: 600;
  transition: all 0.2s;
}

.user-login-button:hover {
  background: #059669;
  border-color: #059669;
}

:global(.dark) .user-login-button {
  background: #10b981;
  border-color: #10b981;
  color: white;
}

:global(.dark) .user-login-button:hover {
  background: #059669;
  border-color: #059669;
}

/* 管理后台按钮 - Vercel flat style */
.admin-button-refined {
  background: #000;
  border: 1px solid #000;
  color: white;
  text-decoration: none;
  font-weight: 600;
  transition: all 0.2s;
}

.admin-button-refined:hover {
  background: #333;
  border-color: #333;
}

:global(.dark) .admin-button-refined {
  background: white;
  border-color: white;
  color: #000;
}

:global(.dark) .admin-button-refined:hover {
  background: #e5e5e5;
  border-color: #e5e5e5;
}

/* 时间范围按钮 - Vercel flat style */
.period-btn {
  border-radius: 5px;
  font-weight: 500;
  letter-spacing: 0.025em;
  transition: all 0.2s;
  border: 1px solid #eaeaea;
  cursor: pointer;
  background: white;
  color: #666;
}

.period-btn.active {
  background: #000;
  border-color: #000;
  color: white;
}

:global(.dark) .period-btn {
  background: #1f1f1f;
  border-color: #333;
  color: #999;
}

:global(.dark) .period-btn.active {
  background: white;
  border-color: white;
  color: #000;
}

.period-btn:not(.active):hover {
  background: #fafafa;
}

:global(.dark) .period-btn:not(.active):hover {
  background: #2a2a2a;
}

:global(html.dark) .period-btn:not(.active) {
  color: #e5e7eb;
  background: rgba(55, 65, 81, 0.4);
  border: 1px solid rgba(75, 85, 99, 0.5);
}

.period-btn:not(.active):hover {
  background: rgba(255, 255, 255, 0.8);
  color: #1f2937;
  border-color: rgba(209, 213, 219, 0.8);
}

:global(html.dark) .period-btn:not(.active):hover {
  background: rgba(75, 85, 99, 0.6);
  color: #ffffff;
  border-color: rgba(107, 114, 128, 0.8);
}

/* 测试按钮样式 - Vercel flat style */
.test-btn {
  border-radius: 5px;
  font-weight: 500;
  letter-spacing: 0.025em;
  transition: all 0.2s;
  border: 1px solid #06b6d4;
  cursor: pointer;
  background: #06b6d4;
  color: white;
}

.test-btn:hover:not(:disabled) {
  background: #0891b2;
  border-color: #0891b2;
}

.test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Tab 胶囊按钮样式 - Vercel flat style */
.tab-pill-button {
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-weight: 500;
  font-size: 0.875rem;
  color: #666;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  flex: 1;
  justify-content: center;
}

:global(html.dark) .tab-pill-button {
  color: #999;
}

@media (min-width: 768px) {
  .tab-pill-button {
    padding: 0.625rem 1.25rem;
    flex: none;
  }
}

.tab-pill-button:hover {
  color: #000;
  background: #fafafa;
}

:global(html.dark) .tab-pill-button:hover {
  color: #fff;
  background: #2a2a2a;
}

.tab-pill-button.active {
  background: #000;
  color: white;
}

:global(html.dark) .tab-pill-button.active {
  background: white;
  color: #000;
}

.tab-pill-button i {
  font-size: 0.875rem;
}

/* Tab 内容切换动画 */
.tab-content {
  animation: tabFadeIn 0.4s ease-out;
}

@keyframes tabFadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 动画效果 */
.fade-in {
  animation: fadeIn 0.6s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
