<template>
  <div class="min-h-screen p-4 md:p-6">
    <!-- 顶部导航 -->
    <div class="glass-strong mb-6 rounded-3xl p-4 md:mb-8 md:p-6">
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
            class="h-8 w-px bg-gradient-to-b from-transparent via-gray-300 to-transparent opacity-50 dark:via-gray-600"
          />

          <!-- 用户登录按钮 (仅在 LDAP 启用时显示) -->
          <router-link
            v-if="oemSettings.ldapEnabled"
            class="btn btn-success flex items-center gap-2 px-4 py-2 text-white md:px-5 md:py-2.5"
            to="/user-login"
          >
            <i class="fas fa-user text-sm md:text-base" />
            <span class="text-xs font-semibold tracking-wide md:text-sm">用户登录</span>
          </router-link>
          <!-- 管理后台按钮 -->
          <router-link
            v-if="oemSettings.showAdminButton !== false"
            class="btn btn-primary flex items-center gap-2 px-4 py-2 text-white md:px-5 md:py-2.5"
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
          class="inline-flex w-full max-w-md rounded-full border border-black/5 bg-white/40 p-1 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-black/20 md:w-auto"
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
          class="rounded-xl border border-red-500/30 bg-red-500/20 p-3 text-sm text-red-800 backdrop-blur-sm dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200 md:p-4 md:text-base"
        >
          <i class="fas fa-exclamation-triangle mr-2" />
          {{ error }}
        </div>
      </div>

      <!-- 统计数据展示区域 -->
      <div v-if="statsData" class="fade-in">
        <div class="glass-strong rounded-3xl p-4 md:p-6">
          <!-- 时间范围选择器 -->
          <div class="mb-4 border-b border-gray-200 pb-4 dark:border-gray-700 md:mb-6 md:pb-6">
            <div
              class="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center md:gap-4"
            >
              <div class="flex items-center gap-2 md:gap-3">
                <i class="fas fa-clock text-base text-blue-500 md:text-lg" />
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
          <KeyMergeRenewal />
          <FuelPackRedeem />

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
      <div class="glass-strong rounded-3xl p-4 md:p-6">
        <TutorialView read-only hide-header />
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
import { ref, onMounted, onUnmounted, watch } from 'vue'
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
import KeyMergeRenewal from '@/components/apistats/KeyMergeRenewal.vue'
import FuelPackRedeem from '@/components/apistats/FuelPackRedeem.vue'
import TutorialView from './TutorialView.vue'
import ApiKeyTestModal from '@/components/apikeys/ApiKeyTestModal.vue'

const route = useRoute()
const apiStatsStore = useApiStatsStore()
const themeStore = useThemeStore()

// 当前标签页
const currentTab = ref('stats')

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
/* 时间范围按钮 */
.period-btn {
  position: relative;
  overflow: hidden;
  border-radius: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: all 0.25s ease;
  border: 1px solid transparent;
  cursor: pointer;
}

.period-btn.active {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  color: white;
  box-shadow:
    0 16px 30px -24px rgba(96, 165, 250, 0.35),
    0 8px 14px -12px rgba(167, 139, 250, 0.22);
  transform: translateY(-1px);
}

.period-btn:not(.active) {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid var(--border-color);
}

:global(html.dark) .period-btn:not(.active) {
  color: var(--text-primary);
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid var(--border-color);
}

.period-btn:not(.active):hover {
  background: rgba(255, 255, 255, 0.75);
  transform: translateY(-1px);
}

:global(html.dark) .period-btn:not(.active):hover {
  background: rgba(15, 23, 42, 0.65);
}

/* 测试按钮样式 */
.test-btn {
  position: relative;
  overflow: hidden;
  border-radius: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: all 0.25s ease;
  border: none;
  cursor: pointer;
  background: linear-gradient(135deg, #38bdf8 0%, #60a5fa 100%);
  color: white;
  box-shadow:
    0 4px 10px -2px rgba(96, 165, 250, 0.3),
    0 2px 4px -1px rgba(96, 165, 250, 0.1);
}

.test-btn:hover:not(:disabled) {
  transform: translateY(-1px) scale(1.02);
  box-shadow:
    0 8px 15px -3px rgba(96, 165, 250, 0.4),
    0 4px 6px -2px rgba(96, 165, 250, 0.15);
}

.test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Tab 胶囊按钮样式 */
.tab-pill-button {
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  flex: 1;
  justify-content: center;
}

/* 暗夜模式下的Tab按钮基础样式 */
:global(html.dark) .tab-pill-button {
  color: rgba(203, 213, 225, 0.85);
}

@media (min-width: 768px) {
  .tab-pill-button {
    padding: 0.625rem 1.25rem;
    flex: none;
  }
}

.tab-pill-button:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.35);
}

:global(html.dark) .tab-pill-button:hover {
  color: var(--text-primary);
  background: rgba(148, 163, 184, 0.14);
}

.tab-pill-button.active {
  background: rgba(255, 255, 255, 0.85);
  color: var(--secondary-color);
  box-shadow:
    0 18px 34px -28px rgba(15, 23, 42, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
}

:global(html.dark) .tab-pill-button.active {
  background: rgba(15, 23, 42, 0.75);
  color: var(--text-primary);
  box-shadow:
    0 22px 44px -34px rgba(0, 0, 0, 0.65),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.tab-pill-button i {
  font-size: 0.875rem;
}

.fade-in {
  animation: fadeInUp 0.35s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
