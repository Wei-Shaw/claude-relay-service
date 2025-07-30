<template>
  <div class="min-h-screen gradient-bg p-6">
    <!-- 顶部导航 -->
    <div class="glass-strong rounded-3xl p-6 mb-8 shadow-xl">
      <div class="flex flex-col md:flex-row justify-between items-center gap-4">
        <LogoTitle 
          :loading="oemLoading"
          :title="oemSettings.siteName"
          :subtitle="currentTab === 'stats' ? 'API Key 使用统计' : '使用教程'"
          :logo-src="oemSettings.siteIconData || oemSettings.siteIcon"
        />
        <div class="flex items-center gap-3">
          <router-link
            to="/dashboard"
            class="admin-button rounded-xl px-4 py-2 text-white transition-all duration-300 flex items-center gap-2"
          >
            <i class="fas fa-cog text-sm" />
            <span class="text-sm font-medium">管理后台</span>
          </router-link>
        </div>
      </div>
    </div>

    <!-- Tab 切换 -->
    <div class="mb-8">
      <div class="flex justify-center">
        <div class="inline-flex bg-white/10 backdrop-blur-xl rounded-full p-1 shadow-lg border border-white/20">
          <button
            :class="[
              'tab-pill-button',
              currentTab === 'stats' ? 'active' : ''
            ]"
            @click="currentTab = 'stats'"
          >
            <i class="fas fa-chart-line mr-2" />
            <span>统计查询</span>
          </button>
          <button
            :class="[
              'tab-pill-button',
              currentTab === 'tutorial' ? 'active' : ''
            ]"
            @click="currentTab = 'tutorial'"
          >
            <i class="fas fa-graduation-cap mr-2" />
            <span>使用教程</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 统计内容 -->
    <div
      v-if="currentTab === 'stats'"
      class="tab-content"
    >
      <!-- API Key 输入区域 -->
      <ApiKeyInput />

      <!-- 错误提示 -->
      <div
        v-if="error"
        class="mb-8"
      >
        <div class="bg-red-500/20 border border-red-500/30 rounded-xl p-4 text-red-800 backdrop-blur-sm">
          <i class="fas fa-exclamation-triangle mr-2" />
          {{ error }}
        </div>
      </div>

      <!-- 统计数据展示区域 -->
      <div
        v-if="statsData"
        class="fade-in"
      >
        <div class="glass-strong rounded-3xl p-6 shadow-xl">
          <!-- 时间范围选择器 -->
          <div class="mb-6 pb-6 border-b border-gray-200">
            <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <i class="fas fa-clock text-blue-500 text-lg" />
                <span class="text-lg font-medium text-gray-700">统计时间范围</span>
              </div>
              <div class="flex gap-2">
                <button 
                  :class="['period-btn', { 'active': statsPeriod === 'daily' }]"
                  class="px-6 py-2 text-sm font-medium flex items-center gap-2"
                  :disabled="loading || modelStatsLoading"
                  @click="switchPeriod('daily')"
                >
                  <i class="fas fa-calendar-day" />
                  今日
                </button>
                <button 
                  :class="['period-btn', { 'active': statsPeriod === 'monthly' }]"
                  class="px-6 py-2 text-sm font-medium flex items-center gap-2"
                  :disabled="loading || modelStatsLoading"
                  @click="switchPeriod('monthly')"
                >
                  <i class="fas fa-calendar-alt" />
                  本月
                </button>
              </div>
            </div>
          </div>

          <!-- 基本信息和统计概览 -->
          <StatsOverview />

          <!-- Token 分布和限制配置 -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <TokenDistribution />
            <LimitConfig />
          </div>

          <!-- 模型使用统计 -->
          <ModelUsageStats />
        </div>
      </div>
    </div>

    <!-- 教程内容 -->
    <div
      v-if="currentTab === 'tutorial'"
      class="tab-content"
    >
      <div class="glass-strong rounded-3xl shadow-xl">
        <TutorialView />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'
import LogoTitle from '@/components/common/LogoTitle.vue'
import ApiKeyInput from '@/components/apistats/ApiKeyInput.vue'
import StatsOverview from '@/components/apistats/StatsOverview.vue'
import TokenDistribution from '@/components/apistats/TokenDistribution.vue'
import LimitConfig from '@/components/apistats/LimitConfig.vue'
import ModelUsageStats from '@/components/apistats/ModelUsageStats.vue'
import TutorialView from './TutorialView.vue'

const route = useRoute()
const apiStatsStore = useApiStatsStore()

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
  oemSettings
} = storeToRefs(apiStatsStore)

const {
  queryStats,
  switchPeriod,
  loadStatsWithApiId,
  loadOemSettings,
  reset
} = apiStatsStore

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
  console.log('API Stats Page loaded')
  
  // 加载 OEM 设置
  loadOemSettings()
  
  // 检查 URL 参数
  const urlApiId = route.query.apiId
  const urlApiKey = route.query.apiKey
  
  if (urlApiId && urlApiId.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)) {
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
/* 渐变背景 */
.gradient-bg {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  background-attachment: fixed;
  min-height: 100vh;
  position: relative;
}

.gradient-bg::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: 
    radial-gradient(circle at 20% 80%, rgba(240, 147, 251, 0.2) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(102, 126, 234, 0.2) 0%, transparent 50%),
    radial-gradient(circle at 40% 40%, rgba(118, 75, 162, 0.1) 0%, transparent 50%);
  pointer-events: none;
  z-index: 0;
}

/* 玻璃态效果 */
.glass-strong {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(25px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 
    0 25px 50px -12px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba(255, 255, 255, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  position: relative;
  z-index: 1;
}

/* 标题渐变 */
.header-title {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 700;
  letter-spacing: -0.025em;
}

/* 管理后台按钮 */
.admin-button {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  text-decoration: none;
  box-shadow: 0 4px 6px -1px rgba(102, 126, 234, 0.3), 0 2px 4px -1px rgba(102, 126, 234, 0.1);
  position: relative;
  overflow: hidden;
}

.admin-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s;
}

.admin-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgba(102, 126, 234, 0.4), 0 4px 6px -2px rgba(102, 126, 234, 0.15);
}

.admin-button:hover::before {
  left: 100%;
}

/* 时间范围按钮 */
.period-btn {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  font-weight: 500;
  letter-spacing: 0.025em;
  transition: all 0.3s ease;
  border: none;
  cursor: pointer;
}

.period-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 
    0 10px 15px -3px rgba(102, 126, 234, 0.3),
    0 4px 6px -2px rgba(102, 126, 234, 0.05);
  transform: translateY(-1px);
}

.period-btn:not(.active) {
  color: #374151;
  background: transparent;
}

.period-btn:not(.active):hover {
  background: rgba(255, 255, 255, 0.1);
  color: #1f2937;
}

/* Tab 胶囊按钮样式 */
.tab-pill-button {
  padding: 0.625rem 1.25rem;
  border-radius: 9999px;
  font-weight: 500;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.8);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.tab-pill-button:hover {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

.tab-pill-button.active {
  background: white;
  color: #764ba2;
  box-shadow: 
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
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