<template>
  <div class="api-stats-page">
    <header class="page-topbar">
      <div class="page-topbar-inner">
        <div class="site-brand">
          <div class="site-mark">
            <template v-if="!oemLoading">
              <img
                v-if="oemSettings.siteIconData || oemSettings.siteIcon"
                alt=""
                :src="oemSettings.siteIconData || oemSettings.siteIcon"
              />
              <span v-else />
            </template>
          </div>
          <div>
            <strong>{{ oemSettings.siteName || 'Relay' }}</strong>
            <small>API 使用控制台</small>
          </div>
        </div>

        <nav aria-label="页面导航" class="primary-nav">
          <button :class="{ active: currentTab === 'stats' }" @click="currentTab = 'stats'">
            用量查询
          </button>
          <button :class="{ active: currentTab === 'quota' }" @click="switchToQuota">额度卡</button>
          <button :class="{ active: currentTab === 'tutorial' }" @click="currentTab = 'tutorial'">
            使用教程
          </button>
        </nav>

        <div class="topbar-actions">
          <button
            class="theme-cycle-button"
            :title="isDarkMode ? '切换到浅色模式' : '切换到深色模式'"
            type="button"
            @click="themeStore.cycleThemeMode()"
          >
            <i :class="isDarkMode ? 'fas fa-moon' : 'fas fa-sun'" />
          </button>
          <router-link v-if="oemSettings.userSystemEnabled" to="/user-login">用户登录</router-link>
          <router-link v-if="oemSettings.showAdminButton !== false" to="/dashboard">
            管理后台
          </router-link>
        </div>
      </div>
    </header>

    <main class="page-frame">
      <!-- 统计内容 -->
      <div v-if="currentTab === 'stats'" class="tab-content stats-content">
        <!-- API Key 输入区域 -->
        <ApiKeyInput />

        <!-- 错误提示 -->
        <div v-if="error" class="query-error" role="alert">
          <i class="fas fa-exclamation-triangle" />
          {{ error }}
        </div>

        <div v-if="statsData && !multiKeyMode" class="single-key-result fade-in">
          <div class="verified-key-bar">
            <span><i />已验证 {{ statsData.name || '当前 API Key' }}</span>
            <div class="relative">
              <button
                class="api-test-trigger"
                :disabled="loading || !hasAnyTestPermission"
                :title="
                  hasAnyTestPermission ? '测试 API' : `当前 Key 可用服务: ${availableServicesText}`
                "
                @click="toggleTestMenu"
              >
                <i class="fas fa-vial" />
                测试 API
                <i class="fas fa-chevron-down" />
              </button>
              <div v-if="showTestMenu" class="api-test-menu">
                <button v-if="canTestClaude" @click="openTestModal('claude')">Claude</button>
                <button v-if="canTestGemini" @click="openTestModal('gemini')">Gemini</button>
                <button v-if="canTestOpenAI" @click="openTestModal('openai')">Codex</button>
              </div>
            </div>
          </div>
          <ApiStatsUsageWorkspace :api-key="apiKey" />
        </div>

        <!-- 聚合查询保留原有统计口径，请求明细仅支持单 Key 自查询。 -->
        <div v-if="statsData && multiKeyMode" class="legacy-stats fade-in">
          <div class="legacy-period-bar">
            <div>
              <strong>聚合用量</strong>
              <span>多 Key 查询不展示单笔请求明细</span>
            </div>
            <div class="legacy-period-switcher">
              <button
                :class="['period-btn', { active: statsPeriod === 'daily' }]"
                :disabled="loading"
                @click="switchPeriod('daily')"
              >
                今日
              </button>
              <button
                :class="['period-btn', { active: statsPeriod === 'monthly' }]"
                :disabled="loading"
                @click="switchPeriod('monthly')"
              >
                本月
              </button>
              <button
                :class="['period-btn', { active: statsPeriod === 'alltime' }]"
                :disabled="loading"
                @click="switchPeriod('alltime')"
              >
                全部
              </button>
            </div>
          </div>
          <div class="legacy-stats-body">
            <StatsOverview />
            <div class="legacy-stats-grid">
              <TokenDistribution class="h-full" />
              <AggregatedStatsCard class="h-full" />
            </div>
            <ServiceCostCards class="mb-4 sm:mb-6" />
            <div class="space-y-4 sm:space-y-6">
              <ModelUsageStats period="daily" />
              <ModelUsageStats period="monthly" />
              <ModelUsageStats period="alltime" />
            </div>
          </div>
        </div>
      </div>

      <!-- 教程内容 -->
      <div v-if="currentTab === 'tutorial'" class="tab-content">
        <div class="glass-strong rounded-3xl shadow-xl">
          <TutorialView />
        </div>
      </div>

      <!-- 额度卡内容（含二级 tab） -->
      <div v-if="currentTab === 'quota'" class="tab-content">
        <div class="glass-strong rounded-2xl p-4 shadow-xl sm:rounded-3xl sm:p-6 md:p-8">
          <!-- 二级 Tab -->
          <div
            class="mb-4 flex gap-2 border-b border-gray-200 pb-4 dark:border-gray-700 md:mb-6 md:pb-6"
          >
            <button
              :class="[
                'rounded-lg px-4 py-2 text-sm font-medium transition-all',
                quotaSubTab === 'redeem'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              ]"
              @click="quotaSubTab = 'redeem'"
            >
              <i class="fas fa-ticket-alt mr-2" />
              兑换额度卡
            </button>
            <button
              :class="[
                'rounded-lg px-4 py-2 text-sm font-medium transition-all',
                quotaSubTab === 'history'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              ]"
              @click="switchToHistorySubTab"
            >
              <i class="fas fa-history mr-2" />
              兑换记录
            </button>
          </div>

          <!-- 兑换额度卡子内容 -->
          <div v-if="quotaSubTab === 'redeem'">
            <!-- 需要先输入 API Key -->
            <div v-if="!apiId" class="py-8 text-center">
              <div class="mb-4 text-gray-500 dark:text-gray-400">
                <i class="fas fa-key mb-4 block text-4xl opacity-50" />
                <p>请先在「统计查询」页面输入您的 API Key</p>
              </div>
              <button
                class="rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-6 py-2.5 font-medium text-white transition-all hover:from-blue-600 hover:to-cyan-600"
                @click="currentTab = 'stats'"
              >
                前往输入 API Key
              </button>
            </div>

            <!-- 兑换表单 -->
            <div v-else>
              <div class="mb-6 rounded-xl bg-blue-50 p-4 dark:bg-blue-900/20">
                <p class="text-sm text-blue-700 dark:text-blue-300">
                  <i class="fas fa-info-circle mr-2" />
                  当前 API Key: <span class="font-medium">{{ statsData?.name || apiId }}</span>
                </p>
              </div>

              <div class="space-y-4">
                <div>
                  <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    额度卡卡号
                  </label>
                  <input
                    v-model="redeemCode"
                    class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                    placeholder="请输入额度卡卡号"
                    type="text"
                    @keyup.enter="handleRedeem"
                  />
                </div>

                <button
                  class="w-full rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 px-6 py-3 font-medium text-white transition-all hover:from-green-600 hover:to-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="!redeemCode.trim() || redeemLoading"
                  @click="handleRedeem"
                >
                  <i v-if="redeemLoading" class="fas fa-spinner fa-spin mr-2" />
                  <i v-else class="fas fa-check-circle mr-2" />
                  {{ redeemLoading ? '兑换中...' : '立即兑换' }}
                </button>
              </div>

              <!-- 兑换结果 -->
              <div v-if="redeemResult" class="mt-6">
                <div
                  :class="[
                    'rounded-xl p-4',
                    redeemResult.success
                      ? redeemResult.hasWarnings
                        ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300'
                        : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                      : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                  ]"
                >
                  <div class="flex items-start gap-3">
                    <i
                      :class="[
                        'mt-0.5 text-lg',
                        redeemResult.success
                          ? redeemResult.hasWarnings
                            ? 'fas fa-exclamation-triangle'
                            : 'fas fa-check-circle'
                          : 'fas fa-times-circle'
                      ]"
                    />
                    <div>
                      <p class="font-medium">
                        {{
                          redeemResult.success
                            ? redeemResult.hasWarnings
                              ? '兑换成功（部分截断）'
                              : '兑换成功'
                            : '兑换失败'
                        }}
                      </p>
                      <p class="mt-1 text-sm opacity-90">{{ redeemResult.message }}</p>
                      <div v-if="redeemResult.success && redeemResult.data" class="mt-2 text-sm">
                        <p v-if="redeemResult.data.quotaAdded">
                          额度增加:
                          <span class="font-medium">${{ redeemResult.data.quotaAdded }}</span>
                        </p>
                        <p v-if="redeemResult.data.timeAdded">
                          有效期延长:
                          <span class="font-medium"
                            >{{ redeemResult.data.timeAdded
                            }}{{
                              redeemResult.data.timeUnit === 'days'
                                ? '天'
                                : redeemResult.data.timeUnit === 'hours'
                                  ? '小时'
                                  : '月'
                            }}</span
                          >
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 兑换记录子内容 -->
          <div v-if="quotaSubTab === 'history'">
            <!-- 需要先输入 API Key -->
            <div v-if="!apiId" class="py-8 text-center">
              <div class="mb-4 text-gray-500 dark:text-gray-400">
                <i class="fas fa-key mb-4 block text-4xl opacity-50" />
                <p>请先在「统计查询」页面输入您的 API Key</p>
              </div>
              <button
                class="rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-6 py-2.5 font-medium text-white transition-all hover:from-blue-600 hover:to-cyan-600"
                @click="currentTab = 'stats'"
              >
                前往输入 API Key
              </button>
            </div>

            <!-- 记录列表 -->
            <div v-else>
              <div v-if="historyLoading" class="py-8 text-center">
                <i class="fas fa-spinner fa-spin text-2xl text-gray-400" />
                <p class="mt-2 text-gray-500 dark:text-gray-400">加载中...</p>
              </div>

              <div v-else-if="redemptionHistory.length === 0" class="py-8 text-center">
                <i class="fas fa-inbox text-4xl text-gray-300 dark:text-gray-600" />
                <p class="mt-2 text-gray-500 dark:text-gray-400">暂无兑换记录</p>
              </div>

              <div v-else class="space-y-3">
                <div
                  v-for="record in redemptionHistory"
                  :key="record.id"
                  class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                >
                  <div class="flex items-start justify-between gap-4">
                    <div class="min-w-0 flex-1">
                      <div class="mb-1 flex items-center gap-2">
                        <span
                          :class="[
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            record.cardType === 'quota'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                              : record.cardType === 'time'
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          ]"
                        >
                          {{
                            record.cardType === 'quota'
                              ? '额度卡'
                              : record.cardType === 'time'
                                ? '时间卡'
                                : '组合卡'
                          }}
                        </span>
                        <span
                          v-if="record.status === 'revoked'"
                          class="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300"
                        >
                          已撤销
                        </span>
                      </div>
                      <p class="text-sm text-gray-600 dark:text-gray-300">
                        <span v-if="record.quotaAdded">额度 +${{ record.quotaAdded }}</span>
                        <span v-if="record.quotaAdded && record.timeAdded"> · </span>
                        <span v-if="record.timeAdded"
                          >有效期 +{{ record.timeAmount
                          }}{{
                            record.timeUnit === 'days'
                              ? '天'
                              : record.timeUnit === 'hours'
                                ? '小时'
                                : '月'
                          }}</span
                        >
                      </p>
                    </div>
                    <div
                      class="whitespace-nowrap text-right text-xs text-gray-500 dark:text-gray-400"
                    >
                      {{ formatDateTime(record.redeemedAt) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- API Key 测试弹窗 -->
    <UnifiedTestModal
      :api-key-name="statsData?.name || ''"
      :api-key-value="apiKey"
      mode="apikey"
      :service-type="testServiceType"
      :show="showTestModal"
      @close="closeTestModal"
    />

    <!-- API Stats 通知弹框 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showNotice"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          @click.self="dismissNotice"
        >
          <div
            class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800"
            @click.stop
          >
            <div class="mb-4 flex items-center gap-3">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white"
              >
                <i class="fas fa-bell" />
              </div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {{ oemSettings.apiStatsNotice?.title || '通知' }}
              </h3>
            </div>
            <p
              class="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-600 dark:text-gray-300"
            >
              {{ oemSettings.apiStatsNotice?.content }}
            </p>
            <label class="mb-4 flex cursor-pointer items-center gap-2">
              <input
                v-model="dontShowAgain"
                class="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                type="checkbox"
              />
              <span class="text-sm text-gray-600 dark:text-gray-400">本次会话不再显示</span>
            </label>
            <button
              class="w-full rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2.5 font-medium text-white transition-all hover:from-blue-600 hover:to-cyan-600"
              @click="dismissNotice"
            >
              知道了
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'
import { useThemeStore } from '@/stores/theme'
import { redeemCardByApiIdApi, getRedemptionHistoryByApiIdApi } from '@/utils/http_apis'
import { formatDateTime, showToast } from '@/utils/tools'
import ApiKeyInput from '@/components/apistats/ApiKeyInput.vue'
import ApiStatsUsageWorkspace from '@/components/apistats/ApiStatsUsageWorkspace.vue'
import StatsOverview from '@/components/apistats/StatsOverview.vue'
import TokenDistribution from '@/components/apistats/TokenDistribution.vue'
import AggregatedStatsCard from '@/components/apistats/AggregatedStatsCard.vue'
import ModelUsageStats from '@/components/apistats/ModelUsageStats.vue'
import ServiceCostCards from '@/components/apistats/ServiceCostCards.vue'
import TutorialView from './TutorialView.vue'
import UnifiedTestModal from '@/components/common/UnifiedTestModal.vue'

const route = useRoute()
const apiStatsStore = useApiStatsStore()
const themeStore = useThemeStore()

// 当前标签页
const currentTab = ref('stats')
const isDarkMode = computed(() => themeStore.isDarkMode)

const {
  apiKey,
  apiId,
  loading,
  oemLoading,
  error,
  statsPeriod,
  statsData,
  oemSettings,
  multiKeyMode
} = storeToRefs(apiStatsStore)

const {
  queryStats,
  switchPeriod,
  loadStatsWithApiId,
  loadOemSettings,
  loadServiceRates,
  loadApiKeyFromStorage,
  reset
} = apiStatsStore

// 测试弹窗状态
const showTestModal = ref(false)
const showTestMenu = ref(false)
const testServiceType = ref('claude')

// 通知弹框状态
const showNotice = ref(false)
const dontShowAgain = ref(false)
const NOTICE_STORAGE_KEY = 'apiStatsNoticeRead'

// 额度卡兑换相关状态
const quotaSubTab = ref('redeem')
const redeemCode = ref('')
const redeemLoading = ref(false)
const redeemResult = ref(null)
const redemptionHistory = ref([])
const historyLoading = ref(false)

// 兑换额度卡
const handleRedeem = async () => {
  if (!redeemCode.value.trim() || !apiId.value) return

  redeemLoading.value = true
  redeemResult.value = null

  const res = await redeemCardByApiIdApi({
    apiId: apiId.value,
    code: redeemCode.value.trim()
  })

  redeemLoading.value = false

  if (res.success) {
    const warnings = res.data?.warnings || []
    const hasWarnings = warnings.length > 0
    redeemResult.value = {
      success: true,
      message: hasWarnings ? warnings.join('；') : '额度卡兑换成功！',
      data: res.data,
      hasWarnings
    }
    redeemCode.value = ''
    showToast(
      hasWarnings ? '兑换成功（部分截断）' : '兑换成功',
      hasWarnings ? 'warning' : 'success'
    )
    // 刷新统计数据
    loadStatsWithApiId()
  } else {
    redeemResult.value = {
      success: false,
      message: res.error || res.message || '兑换失败'
    }
    showToast(res.error || res.message || '兑换失败', 'error')
  }
}

// 加载兑换记录
const loadRedemptionHistory = async () => {
  if (!apiId.value) return

  historyLoading.value = true
  const res = await getRedemptionHistoryByApiIdApi(apiId.value)
  historyLoading.value = false

  if (res.success) {
    redemptionHistory.value = res.data?.records || res.data || []
  }
}

// 切换到额度卡 Tab
const switchToQuota = () => {
  currentTab.value = 'quota'
  // 如果子标签是记录，刷新数据
  if (quotaSubTab.value === 'history') {
    loadRedemptionHistory()
  }
}

// 切换到兑换记录子 Tab
const switchToHistorySubTab = () => {
  quotaSubTab.value = 'history'
  loadRedemptionHistory()
}

// 解析 permissions（可能是 JSON 字符串或数组）
const parsePermissions = (permissions) => {
  if (!permissions) return []
  if (Array.isArray(permissions)) return permissions
  if (typeof permissions === 'string') {
    if (permissions === 'all') return []
    try {
      const parsed = JSON.parse(permissions)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

// 检查是否可以测试 Claude（权限包含 claude 或全部）
const canTestClaude = computed(() => {
  const permissions = parsePermissions(statsData.value?.permissions)
  if (permissions.length === 0) return true
  return permissions.includes('claude')
})

// 检查是否可以测试 Gemini
const canTestGemini = computed(() => {
  const permissions = parsePermissions(statsData.value?.permissions)
  if (permissions.length === 0) return true
  return permissions.includes('gemini')
})

// 检查是否可以测试 OpenAI
const canTestOpenAI = computed(() => {
  const permissions = parsePermissions(statsData.value?.permissions)
  if (permissions.length === 0) return true
  return permissions.includes('openai')
})

// 检查是否有任何测试权限
const hasAnyTestPermission = computed(() => {
  return canTestClaude.value || canTestGemini.value || canTestOpenAI.value
})

// 可用服务文本
const availableServicesText = computed(() => {
  const permissions = parsePermissions(statsData.value?.permissions)
  if (permissions.length === 0) return '全部服务'
  const serviceNames = {
    claude: 'Claude',
    gemini: 'Gemini',
    openai: 'OpenAI',
    droid: 'Droid'
  }
  return permissions.map((s) => serviceNames[s] || s).join(', ')
})

// 切换测试菜单
const toggleTestMenu = () => {
  showTestMenu.value = !showTestMenu.value
}

// 打开测试弹窗
const openTestModal = (serviceType = 'claude') => {
  testServiceType.value = serviceType
  showTestMenu.value = false
  showTestModal.value = true
}

// 关闭测试弹窗
const closeTestModal = () => {
  showTestModal.value = false
}

// 关闭通知弹框
const dismissNotice = () => {
  showNotice.value = false
  if (dontShowAgain.value) {
    sessionStorage.setItem(NOTICE_STORAGE_KEY, '1')
  }
}

// 检查是否显示通知
const checkNotice = () => {
  const notice = oemSettings.value?.apiStatsNotice
  if (notice?.enabled && notice?.content && !sessionStorage.getItem(NOTICE_STORAGE_KEY)) {
    showNotice.value = true
  }
}

// 点击外部关闭菜单
const handleClickOutside = (event) => {
  if (showTestMenu.value && !event.target.closest('.relative')) {
    showTestMenu.value = false
  }
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
onMounted(async () => {
  // API Stats Page loaded

  // 初始化主题（因为该页面不在 MainLayout 内）
  themeStore.initTheme()

  // 加载 OEM 设置和服务倍率
  await Promise.all([loadOemSettings(), loadServiceRates()])
  checkNotice()

  // 检查 URL 参数
  const urlApiId = route.query.apiId
  const urlApiKey = route.query.apiKey

  if (
    urlApiId &&
    urlApiId.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
  ) {
    // 如果 URL 中有 apiId，直接使用 apiId 加载数据
    apiId.value = urlApiId
    // 同时从 localStorage 填充 API Key 到输入框
    const savedApiKey = loadApiKeyFromStorage()
    if (savedApiKey) {
      apiKey.value = savedApiKey
    }
    loadStatsWithApiId()
  } else if (urlApiKey && urlApiKey.length > 10) {
    // 向后兼容，支持 apiKey 参数
    apiKey.value = urlApiKey
  } else {
    // 没有 URL 参数，检查 localStorage
    const savedApiKey = loadApiKeyFromStorage()
    if (savedApiKey && savedApiKey.length > 10) {
      apiKey.value = savedApiKey
      queryStats()
    }
  }

  // 添加键盘事件监听
  document.addEventListener('keydown', handleKeyDown)
  // 添加点击外部关闭菜单监听
  document.addEventListener('click', handleClickOutside)
})

// 清理
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('click', handleClickOutside)
})

// 监听 API Key 变化
watch(apiKey, (newValue) => {
  if (!newValue) {
    apiStatsStore.clearData()
  }
})
</script>

<style scoped>
.api-stats-page {
  --page-bg: #f1f0eb;
  --page-card: #fafaf7;
  --page-ink: #18201d;
  --page-muted: #727a74;
  --page-line: #d8dad3;
  --page-forest: #1d3b33;
  --page-green: #55a782;
  min-height: 100vh;
  color: var(--page-ink);
  background:
    radial-gradient(circle at 92% 0%, rgba(116, 169, 143, 0.13), transparent 29rem),
    linear-gradient(rgba(29, 59, 51, 0.018) 1px, transparent 1px), var(--page-bg);
  background-size:
    auto,
    100% 2rem,
    auto;
  font-family: 'Avenir Next', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

:global(.dark) .api-stats-page {
  --page-bg: #171b19;
  --page-card: #202623;
  --page-ink: #eef2ed;
  --page-muted: #9ca69f;
  --page-line: #343c37;
  --page-forest: #20463b;
  --page-green: #6fc29d;
  background:
    radial-gradient(circle at 92% 0%, rgba(61, 110, 90, 0.16), transparent 29rem),
    linear-gradient(rgba(238, 242, 237, 0.014) 1px, transparent 1px), var(--page-bg);
  background-size:
    auto,
    100% 2rem,
    auto;
}

.page-topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  border-bottom: 1px solid var(--page-line);
  background: color-mix(in srgb, var(--page-bg) 94%, transparent);
  backdrop-filter: blur(12px);
}

.page-topbar-inner,
.page-frame {
  width: min(78rem, calc(100% - 2rem));
  margin: 0 auto;
}

.page-topbar-inner {
  min-height: 4.25rem;
  display: grid;
  grid-template-columns: minmax(12rem, 1fr) auto minmax(12rem, 1fr);
  align-items: center;
  gap: 1.5rem;
}

.site-brand {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-width: 0;
}

.site-mark {
  width: 1.9rem;
  height: 1.9rem;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--page-line);
  border-radius: 50%;
  background: var(--page-card);
}

.site-mark img {
  width: 1.25rem;
  height: 1.25rem;
  object-fit: contain;
}

.site-mark span {
  width: 0.55rem;
  height: 0.55rem;
  border: 2px solid var(--page-green);
  border-radius: 50%;
  box-shadow: 0 0 0 0.25rem color-mix(in srgb, var(--page-green) 13%, transparent);
}

.site-brand strong,
.site-brand small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-brand strong {
  font-size: 0.86rem;
  letter-spacing: -0.02em;
}

.site-brand small {
  margin-top: 0.08rem;
  color: var(--page-muted);
  font-size: 0.58rem;
  letter-spacing: 0.08em;
}

.primary-nav {
  display: flex;
  align-items: center;
  gap: 0.15rem;
}

.primary-nav button {
  border: 0;
  border-radius: 0.4rem;
  padding: 0.58rem 0.85rem;
  color: var(--page-muted);
  background: transparent;
  font-size: 0.72rem;
  cursor: pointer;
}

.primary-nav button:hover,
.primary-nav button.active {
  color: var(--page-ink);
  background: color-mix(in srgb, var(--page-card) 82%, transparent);
}

.primary-nav button.active {
  font-weight: 700;
  box-shadow: inset 0 -2px var(--page-green);
}

.topbar-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.45rem;
}

.topbar-actions > a {
  border: 1px solid var(--page-line);
  border-radius: 0.4rem;
  padding: 0.48rem 0.65rem;
  color: var(--page-muted);
  background: color-mix(in srgb, var(--page-card) 68%, transparent);
  font-size: 0.65rem;
  text-decoration: none;
}

.theme-cycle-button {
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  border: 1px solid var(--page-line);
  border-radius: 0.4rem;
  color: var(--page-muted);
  background: color-mix(in srgb, var(--page-card) 68%, transparent);
  font-size: 0.68rem;
  cursor: pointer;
}

.theme-cycle-button:hover {
  color: var(--page-ink);
  border-color: color-mix(in srgb, var(--page-green) 45%, var(--page-line));
}

.topbar-actions > a:hover {
  color: var(--page-ink);
  border-color: color-mix(in srgb, var(--page-green) 45%, var(--page-line));
}

.page-frame {
  padding: 2rem 0 5rem;
}

.stats-content {
  min-height: calc(100vh - 8rem);
}

.query-error {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0.8rem 0;
  border: 1px solid #d8aaa4;
  border-radius: 0.5rem;
  padding: 0.75rem 0.9rem;
  color: #8b403a;
  background: #fff0ed;
  font-size: 0.74rem;
}

:global(.dark) .query-error {
  border-color: #70413d;
  color: #e6a8a2;
  background: #30201e;
}

.verified-key-bar,
.legacy-period-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--page-line);
}

.verified-key-bar {
  margin-top: 1.25rem;
  padding: 0.65rem 0;
  color: var(--page-muted);
  font-size: 0.67rem;
}

.verified-key-bar > span {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.verified-key-bar > span i {
  width: 0.38rem;
  height: 0.38rem;
  border-radius: 50%;
  background: var(--page-green);
}

.api-test-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid var(--page-line);
  border-radius: 0.4rem;
  padding: 0.46rem 0.65rem;
  color: var(--page-ink);
  background: var(--page-card);
  font-size: 0.65rem;
  cursor: pointer;
}

.api-test-trigger:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.api-test-menu {
  position: absolute;
  top: calc(100% + 0.35rem);
  right: 0;
  z-index: 30;
  min-width: 7rem;
  overflow: hidden;
  border: 1px solid var(--page-line);
  border-radius: 0.45rem;
  background: var(--page-card);
  box-shadow: 0 0.8rem 2rem rgba(19, 29, 24, 0.12);
}

.api-test-menu button {
  width: 100%;
  border: 0;
  padding: 0.58rem 0.7rem;
  color: var(--page-ink);
  background: transparent;
  text-align: left;
  font-size: 0.68rem;
  cursor: pointer;
}

.api-test-menu button:hover {
  background: color-mix(in srgb, var(--page-green) 8%, var(--page-card));
}

.legacy-stats {
  margin-top: 1.5rem;
  border: 1px solid var(--page-line);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--page-card) 92%, transparent);
}

.legacy-period-bar {
  padding: 1rem 1.2rem;
}

.legacy-period-bar strong,
.legacy-period-bar span {
  display: block;
}

.legacy-period-bar strong {
  font-size: 0.85rem;
}

.legacy-period-bar span {
  margin-top: 0.2rem;
  color: var(--page-muted);
  font-size: 0.64rem;
}

.legacy-period-switcher {
  display: flex;
  gap: 0.25rem;
}

.period-btn {
  border: 1px solid var(--page-line);
  border-radius: 0.35rem;
  padding: 0.45rem 0.7rem;
  font-weight: 500;
  font-size: 0.66rem;
  cursor: pointer;
}

.period-btn.active {
  color: #f2f5f1;
  border-color: var(--page-forest);
  background: var(--page-forest);
}

.period-btn:not(.active) {
  color: var(--page-muted);
  background: var(--page-card);
}

.period-btn:not(.active):hover {
  color: var(--page-ink);
  border-color: color-mix(in srgb, var(--page-green) 45%, var(--page-line));
}

.legacy-stats-body {
  padding: 1.2rem;
}

.legacy-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin: 1rem 0;
}

.tab-content:not(.stats-content) {
  padding-top: 1rem;
}

.tab-content {
  animation: tab-fade 0.28s ease-out;
}

.fade-in {
  animation: tab-fade 0.34s ease-out;
}

@keyframes tab-fade {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 通知弹框动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 900px) {
  .page-topbar-inner {
    grid-template-columns: 1fr auto;
    gap: 0.8rem;
    padding: 0.65rem 0;
  }

  .primary-nav {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-content: center;
    border-top: 1px solid var(--page-line);
    padding-top: 0.55rem;
  }

  .legacy-stats-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .page-topbar-inner,
  .page-frame {
    width: min(100% - 1.25rem, 78rem);
  }

  .site-brand small,
  .topbar-actions > a:first-of-type {
    display: none;
  }

  .topbar-actions {
    gap: 0.3rem;
  }

  .topbar-actions > a {
    padding: 0.45rem 0.5rem;
  }

  .primary-nav {
    justify-content: stretch;
  }

  .primary-nav button {
    flex: 1;
    padding-left: 0.4rem;
    padding-right: 0.4rem;
  }

  .page-frame {
    padding-top: 1.25rem;
  }

  .verified-key-bar,
  .legacy-period-bar {
    align-items: flex-start;
    flex-direction: column;
  }

  .legacy-period-switcher,
  .legacy-period-switcher button {
    width: 100%;
  }
}
</style>
