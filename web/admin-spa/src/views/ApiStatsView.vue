<template>
  <div class="min-h-screen" :class="isDarkMode ? 'page-bg-dark' : 'page-bg'">
    <!-- Vercel-style header: maximalist whitespace, minimal design -->
    <div class="vercel-header">
      <div class="vercel-container">
        <div class="header-content">
          <LogoTitle
            :loading="oemLoading"
            :logo-src="oemSettings.siteIconData || oemSettings.siteIcon"
            :subtitle="currentTab === 'stats' ? 'API Key 使用统计' : '使用教程'"
            :title="oemSettings.siteName"
          />
          <div class="header-actions">
            <!-- 主题切换按钮 -->
            <ThemeToggle mode="dropdown" />

            <!-- 用户登录按钮 -->
            <router-link
              v-if="oemSettings.ldapEnabled"
              class="vercel-btn vercel-btn-secondary"
              to="/user-login"
            >
              <i class="fas fa-user" />
              <span>用户登录</span>
            </router-link>

            <!-- 管理后台按钮 -->
            <router-link
              v-if="oemSettings.showAdminButton !== false"
              class="vercel-btn vercel-btn-primary"
              to="/dashboard"
            >
              <i class="fas fa-shield-alt" />
              <span>管理后台</span>
            </router-link>
          </div>
        </div>
      </div>
    </div>

    <!-- Vercel-style tab navigation -->
    <div class="vercel-tabs">
      <div class="vercel-container">
        <div class="tabs-wrapper">
          <button
            :class="['tab-button', { active: currentTab === 'stats' }]"
            @click="currentTab = 'stats'"
          >
            <i class="fas fa-chart-line" />
            <span>统计查询</span>
          </button>
          <button
            :class="['tab-button', { active: currentTab === 'tutorial' }]"
            @click="currentTab = 'tutorial'"
          >
            <i class="fas fa-graduation-cap" />
            <span>使用教程</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Main content -->
    <div class="vercel-container">
      <!-- 统计内容 -->
      <div v-if="currentTab === 'stats'" class="content-wrapper">
        <!-- API Key 输入区域 -->
        <ApiKeyInput />

        <!-- 错误提示 -->
        <div v-if="error" class="vercel-error-card">
          <i class="fas fa-exclamation-triangle" />
          <span>{{ error }}</span>
        </div>

        <!-- 统计数据展示区域 -->
        <div v-if="statsData" class="stats-section fade-in">
          <!-- 时间范围选择器 -->
          <div class="period-selector">
            <div class="period-label">
              <i class="fas fa-clock" />
              <span>统计时间范围</span>
            </div>
            <div class="period-buttons">
              <button
                :class="['vercel-period-btn', { active: statsPeriod === 'daily' }]"
                :disabled="loading || modelStatsLoading"
                @click="switchPeriod('daily')"
              >
                <i class="fas fa-calendar-day" />
                <span>今日</span>
              </button>
              <button
                :class="['vercel-period-btn', { active: statsPeriod === 'monthly' }]"
                :disabled="loading || modelStatsLoading"
                @click="switchPeriod('monthly')"
              >
                <i class="fas fa-calendar-alt" />
                <span>本月</span>
              </button>
              <!-- 测试按钮 -->
              <button
                v-if="!multiKeyMode"
                class="vercel-test-btn"
                :disabled="loading"
                @click="openTestModal"
              >
                <i class="fas fa-vial" />
                <span>测试</span>
              </button>
            </div>
          </div>

          <!-- 基本信息和统计概览 -->
          <StatsOverview />

          <!-- Token 分布和限制配置 -->
          <div class="stats-grid">
            <TokenDistribution />
            <template v-if="multiKeyMode">
              <AggregatedStatsCard />
            </template>
            <template v-else>
              <LimitConfig />
            </template>
          </div>

          <!-- 模型使用统计 -->
          <ModelUsageStats />
        </div>
      </div>

      <!-- 教程内容 -->
      <div v-if="currentTab === 'tutorial'" class="content-wrapper">
        <div class="vercel-card">
          <TutorialView />
        </div>
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
/* ============================================
   VERCEL-INSPIRED DESIGN SYSTEM
   Clean, minimal, maximum whitespace
   ============================================ */

/* Background */
.page-bg {
  background: #fafafa;
  min-height: 100vh;
}

.page-bg-dark {
  background: #000;
  min-height: 100vh;
}

/* Container - Vercel's max-width approach */
.vercel-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}

@media (max-width: 768px) {
  .vercel-container {
    padding: 0 16px;
  }
}

/* ============================================
   HEADER SECTION
   ============================================ */
.vercel-header {
  border-bottom: 1px solid #eaeaea;
  background: #fff;
  padding: 24px 0;
  margin-bottom: 48px;
}

:global(.dark) .vercel-header {
  background: #000;
  border-bottom-color: #333;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    align-items: flex-start;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Vercel Button System */
.vercel-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  height: 40px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.15s ease;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
  border: 1px solid;
}

.vercel-btn i {
  font-size: 14px;
}

.vercel-btn-primary {
  background: #000;
  border-color: #000;
  color: #fff;
}

.vercel-btn-primary:hover {
  background: #1a1a1a;
  border-color: #1a1a1a;
}

:global(.dark) .vercel-btn-primary {
  background: #fff;
  border-color: #fff;
  color: #000;
}

:global(.dark) .vercel-btn-primary:hover {
  background: #e5e5e5;
  border-color: #e5e5e5;
}

.vercel-btn-secondary {
  background: transparent;
  border-color: #eaeaea;
  color: #666;
}

.vercel-btn-secondary:hover {
  border-color: #000;
  color: #000;
}

:global(.dark) .vercel-btn-secondary {
  border-color: #333;
  color: #999;
}

:global(.dark) .vercel-btn-secondary:hover {
  border-color: #fff;
  color: #fff;
}

/* ============================================
   TABS NAVIGATION
   ============================================ */
.vercel-tabs {
  margin-bottom: 48px;
}

.tabs-wrapper {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid #eaeaea;
}

:global(.dark) .tabs-wrapper {
  border-bottom-color: #333;
}

.tab-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 500;
  color: #666;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
  bottom: -1px;
}

.tab-button i {
  font-size: 14px;
}

.tab-button:hover {
  color: #000;
}

:global(.dark) .tab-button {
  color: #999;
}

:global(.dark) .tab-button:hover {
  color: #fff;
}

.tab-button.active {
  color: #000;
  border-bottom-color: #000;
}

:global(.dark) .tab-button.active {
  color: #fff;
  border-bottom-color: #fff;
}

/* ============================================
   CONTENT WRAPPER
   ============================================ */
.content-wrapper {
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding-bottom: 64px;
}

/* ============================================
   ERROR CARD
   ============================================ */
.vercel-error-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #fff;
  border: 1px solid #ff0000;
  border-radius: 8px;
  color: #ff0000;
  font-size: 14px;
}

:global(.dark) .vercel-error-card {
  background: #1a0000;
  border-color: #ff3333;
  color: #ff6666;
}

/* ============================================
   STATS SECTION
   ============================================ */
.stats-section {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* Period Selector */
.period-selector {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px;
  background: #fff;
  border: 1px solid #eaeaea;
  border-radius: 8px;
  flex-wrap: wrap;
  gap: 16px;
}

:global(.dark) .period-selector {
  background: #000;
  border-color: #333;
}

.period-label {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
  font-weight: 600;
  color: #000;
}

:global(.dark) .period-label {
  color: #fff;
}

.period-label i {
  font-size: 16px;
  color: #666;
}

:global(.dark) .period-label i {
  color: #999;
}

.period-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* Period Buttons */
.vercel-period-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  height: 36px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  background: transparent;
  border: 1px solid #eaeaea;
  color: #666;
  cursor: pointer;
  transition: all 0.15s ease;
}

.vercel-period-btn i {
  font-size: 14px;
}

.vercel-period-btn:hover:not(:disabled) {
  border-color: #000;
  color: #000;
}

.vercel-period-btn.active {
  background: #000;
  border-color: #000;
  color: #fff;
}

.vercel-period-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

:global(.dark) .vercel-period-btn {
  border-color: #333;
  color: #999;
}

:global(.dark) .vercel-period-btn:hover:not(:disabled) {
  border-color: #fff;
  color: #fff;
}

:global(.dark) .vercel-period-btn.active {
  background: #fff;
  border-color: #fff;
  color: #000;
}

/* Test Button */
.vercel-test-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  height: 36px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  background: #0070f3;
  border: 1px solid #0070f3;
  color: #fff;
  cursor: pointer;
  transition: all 0.15s ease;
}

.vercel-test-btn i {
  font-size: 14px;
}

.vercel-test-btn:hover:not(:disabled) {
  background: #0060df;
  border-color: #0060df;
}

.vercel-test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}

/* ============================================
   VERCEL CARD (Generic)
   ============================================ */
.vercel-card {
  background: #fff;
  border: 1px solid #eaeaea;
  border-radius: 8px;
  overflow: hidden;
}

:global(.dark) .vercel-card {
  background: #000;
  border-color: #333;
}

/* ============================================
   ANIMATIONS
   ============================================ */
.fade-in {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ============================================
   RESPONSIVE
   ============================================ */
@media (max-width: 768px) {
  .vercel-header {
    padding: 16px 0;
    margin-bottom: 32px;
  }

  .vercel-tabs {
    margin-bottom: 32px;
  }

  .content-wrapper {
    gap: 24px;
    padding-bottom: 48px;
  }

  .period-selector {
    padding: 16px;
    flex-direction: column;
    align-items: flex-start;
  }

  .period-buttons {
    width: 100%;
  }

  .vercel-period-btn,
  .vercel-test-btn {
    flex: 1;
    justify-content: center;
  }

  .stats-section {
    gap: 24px;
  }
}
</style>
