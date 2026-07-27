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
          <button :class="{ active: currentTab === 'tutorial' }" @click="currentTab = 'tutorial'">
            使用帮助
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

        <section class="quota-workbench fade-in" :class="{ locked: !canUseQuotaCard }">
          <div class="quota-workbench-head">
            <div class="quota-heading">
              <p>CREDIT DESK / 02</p>
              <div>
                <h2>为当前 Key 补充额度</h2>
                <span>验证 API Key 后，可直接兑换额度卡并查看历史记录。</span>
              </div>
            </div>

            <div class="quota-head-actions">
              <span :class="['quota-key-status', { ready: canUseQuotaCard }]">
                <i :class="canUseQuotaCard ? 'fas fa-check' : 'fas fa-lock'" />
                {{ quotaStatusText }}
              </span>
              <div aria-label="额度卡功能" class="quota-view-switcher">
                <button
                  :class="{ active: quotaPanelMode === 'redeem' }"
                  type="button"
                  @click="quotaPanelMode = 'redeem'"
                >
                  兑换
                </button>
                <button
                  :class="{ active: quotaPanelMode === 'history' }"
                  type="button"
                  @click="switchToHistory"
                >
                  记录
                </button>
              </div>
            </div>
          </div>

          <div v-if="quotaPanelMode === 'redeem'" class="quota-panel-body">
            <div class="quota-context-panel">
              <span class="quota-step-number">01</span>
              <div>
                <small>兑换目标</small>
                <strong>{{
                  canUseQuotaCard ? statsData?.name || apiId : '等待验证 API Key'
                }}</strong>
                <p>
                  {{
                    canUseQuotaCard
                      ? '卡内额度或有效期将直接叠加到这个 Key。'
                      : '请先在上方输入并验证需要补充额度的 API Key。'
                  }}
                </p>
              </div>
            </div>

            <div class="quota-redeem-panel">
              <label for="quota-card-code">
                <span>额度卡卡号</span>
                <small>一次仅兑换一张卡</small>
              </label>
              <div class="quota-redeem-entry">
                <input
                  id="quota-card-code"
                  v-model="redeemCode"
                  autocomplete="off"
                  :disabled="!canUseQuotaCard || redeemLoading"
                  placeholder="输入兑换码"
                  spellcheck="false"
                  type="text"
                  @keyup.enter="handleRedeem"
                />
                <button
                  :disabled="!canUseQuotaCard || !redeemCode.trim() || redeemLoading"
                  type="button"
                  @click="handleRedeem"
                >
                  <i v-if="redeemLoading" class="fas fa-spinner fa-spin" />
                  <span>{{ redeemLoading ? '兑换中' : '确认兑换' }}</span>
                  <i v-if="!redeemLoading" class="fas fa-arrow-right" />
                </button>
              </div>

              <div
                v-if="redeemResult"
                :class="[
                  'quota-result',
                  redeemResult.success
                    ? redeemResult.hasWarnings
                      ? 'warning'
                      : 'success'
                    : 'error'
                ]"
                role="status"
              >
                <i
                  :class="
                    redeemResult.success
                      ? redeemResult.hasWarnings
                        ? 'fas fa-exclamation-triangle'
                        : 'fas fa-check-circle'
                      : 'fas fa-times-circle'
                  "
                />
                <div>
                  <strong>
                    {{
                      redeemResult.success
                        ? redeemResult.hasWarnings
                          ? '兑换成功，部分额度已截断'
                          : '兑换成功'
                        : '兑换失败'
                    }}
                  </strong>
                  <p>{{ redeemResult.message }}</p>
                  <div v-if="redeemResult.success && redeemResult.data" class="quota-result-meta">
                    <span v-if="redeemResult.data.quotaAdded">
                      额度 +${{ redeemResult.data.quotaAdded }}
                    </span>
                    <span v-if="redeemResult.data.timeAdded">
                      有效期 +{{ redeemResult.data.timeAdded
                      }}{{ formatTimeUnit(redeemResult.data.timeUnit) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="quota-history-panel">
            <div class="quota-history-intro">
              <span class="quota-step-number">02</span>
              <div>
                <small>兑换记录</small>
                <strong>额度变更轨迹</strong>
                <p>仅展示当前已验证 API Key 的兑换记录。</p>
              </div>
              <button
                :disabled="!canUseQuotaCard || historyLoading"
                title="刷新兑换记录"
                type="button"
                @click="loadRedemptionHistory"
              >
                <i :class="['fas fa-rotate', { 'fa-spin': historyLoading }]" />
              </button>
            </div>

            <div v-if="!canUseQuotaCard" class="quota-history-empty locked-message">
              <i class="fas fa-lock" />
              <span>{{ quotaStatusText }}</span>
            </div>
            <div v-else-if="historyLoading" class="quota-history-empty">
              <i class="fas fa-spinner fa-spin" />
              <span>正在读取兑换记录</span>
            </div>
            <div v-else-if="redemptionHistory.length === 0" class="quota-history-empty">
              <i class="fas fa-ticket" />
              <span>当前 Key 还没有兑换记录</span>
            </div>
            <div v-else class="quota-history-list">
              <article v-for="record in redemptionHistory" :key="record.id">
                <div>
                  <span :class="['quota-record-type', record.cardType]">
                    {{ formatCardType(record.cardType) }}
                  </span>
                  <span v-if="record.status === 'revoked'" class="quota-record-revoked">
                    已撤销
                  </span>
                </div>
                <p>
                  <span v-if="record.quotaAdded">额度 +${{ record.quotaAdded }}</span>
                  <span v-if="record.quotaAdded && record.timeAdded"> / </span>
                  <span v-if="record.timeAdded">
                    有效期 +{{ record.timeAmount }}{{ formatTimeUnit(record.timeUnit) }}
                  </span>
                </p>
                <time>{{ formatDateTime(record.redeemedAt) }}</time>
              </article>
            </div>
          </div>
        </section>

        <div v-if="statsData" class="single-key-result fade-in">
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
      </div>

      <!-- 教程内容 -->
      <div v-if="currentTab === 'tutorial'" class="tab-content">
        <TutorialView />
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
import TutorialView from './TutorialView.vue'
import UnifiedTestModal from '@/components/common/UnifiedTestModal.vue'

const route = useRoute()
const apiStatsStore = useApiStatsStore()
const themeStore = useThemeStore()

// 当前标签页
const currentTab = ref('stats')
const isDarkMode = computed(() => themeStore.isDarkMode)

const { apiKey, apiId, loading, oemLoading, error, statsData, oemSettings } =
  storeToRefs(apiStatsStore)

const { queryStats, loadStatsWithApiId, loadOemSettings, loadApiKeyFromStorage, reset } =
  apiStatsStore

// 测试弹窗状态
const showTestModal = ref(false)
const showTestMenu = ref(false)
const testServiceType = ref('claude')

// 通知弹框状态
const showNotice = ref(false)
const dontShowAgain = ref(false)
const NOTICE_STORAGE_KEY = 'apiStatsNoticeRead'

// 额度卡兑换相关状态
const quotaPanelMode = ref('redeem')
const redeemCode = ref('')
const redeemLoading = ref(false)
const redeemResult = ref(null)
const redemptionHistory = ref([])
const historyLoading = ref(false)
const canUseQuotaCard = computed(() => Boolean(apiId.value && statsData.value))
const quotaStatusText = computed(() => {
  if (canUseQuotaCard.value) return statsData.value?.name || 'API Key 已验证'
  return '先验证 API Key'
})

const formatTimeUnit = (unit) => {
  if (unit === 'days') return '天'
  if (unit === 'hours') return '小时'
  return '月'
}

const formatCardType = (type) => {
  if (type === 'quota') return '额度卡'
  if (type === 'time') return '时间卡'
  return '组合卡'
}

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

const switchToHistory = () => {
  quotaPanelMode.value = 'history'
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

  // 加载 OEM 设置
  await loadOemSettings()
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

watch(apiId, (newValue, previousValue) => {
  if (newValue !== previousValue) {
    redeemResult.value = null
    redemptionHistory.value = []
    if (!newValue) {
      quotaPanelMode.value = 'redeem'
    }
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

:global(.dark .api-stats-page) {
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

:global(.dark .query-error) {
  border-color: #70413d;
  color: #e6a8a2;
  background: #30201e;
}

.quota-workbench {
  position: relative;
  overflow: hidden;
  margin: 1.2rem 0 2rem;
  border: 1px solid var(--page-line);
  border-radius: 0.78rem;
  background: color-mix(in srgb, var(--page-card) 91%, transparent);
  box-shadow: 0 1.2rem 3rem rgba(26, 43, 35, 0.045);
}

.quota-workbench::before {
  position: absolute;
  top: 0;
  right: 0;
  width: 11rem;
  height: 11rem;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--page-green) 13%, transparent),
    transparent 68%
  );
  content: '';
  pointer-events: none;
  transform: translate(38%, -48%);
}

.quota-workbench-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  border-bottom: 1px solid var(--page-line);
  padding: 1rem 1.15rem;
}

.quota-heading {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-width: 0;
}

.quota-heading > p {
  flex: 0 0 auto;
  margin: 0;
  color: var(--page-green);
  font:
    700 0.58rem ui-monospace,
    monospace;
  letter-spacing: 0.11em;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
}

.quota-heading h2,
.quota-heading span {
  display: block;
}

.quota-heading h2 {
  margin: 0;
  font-size: 0.95rem;
  letter-spacing: -0.025em;
}

.quota-heading span {
  margin-top: 0.25rem;
  color: var(--page-muted);
  font-size: 0.65rem;
  line-height: 1.55;
}

.quota-head-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.quota-key-status {
  max-width: 13rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  overflow: hidden;
  border: 1px solid var(--page-line);
  border-radius: 999px;
  padding: 0.38rem 0.58rem;
  color: var(--page-muted);
  background: color-mix(in srgb, var(--page-bg) 68%, transparent);
  font-size: 0.59rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quota-key-status.ready {
  color: var(--page-forest);
  border-color: color-mix(in srgb, var(--page-green) 42%, var(--page-line));
  background: color-mix(in srgb, var(--page-green) 10%, var(--page-card));
}

:global(.dark .quota-key-status.ready) {
  color: var(--page-green);
}

.quota-view-switcher {
  display: flex;
  gap: 0.12rem;
  border: 1px solid var(--page-line);
  border-radius: 0.38rem;
  padding: 0.16rem;
  background: color-mix(in srgb, var(--page-bg) 64%, transparent);
}

.quota-view-switcher button {
  border: 0;
  border-radius: 0.25rem;
  padding: 0.38rem 0.58rem;
  color: var(--page-muted);
  background: transparent;
  font-size: 0.61rem;
  cursor: pointer;
}

.quota-view-switcher button.active {
  color: var(--page-ink);
  background: var(--page-card);
  box-shadow: 0 1px 4px rgba(26, 43, 35, 0.1);
  font-weight: 700;
}

.quota-panel-body {
  display: grid;
  grid-template-columns: minmax(15rem, 0.72fr) minmax(24rem, 1.28fr);
}

.quota-context-panel,
.quota-history-intro {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.85rem;
}

.quota-context-panel {
  align-content: center;
  border-right: 1px solid var(--page-line);
  padding: 1.35rem 1.2rem;
  background: color-mix(in srgb, var(--page-green) 5%, var(--page-bg));
}

.quota-step-number {
  width: 1.75rem;
  height: 1.75rem;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--page-green) 46%, var(--page-line));
  border-radius: 50%;
  color: var(--page-green);
  background: var(--page-card);
  font:
    700 0.6rem ui-monospace,
    monospace;
}

.quota-context-panel small,
.quota-context-panel strong,
.quota-context-panel p,
.quota-history-intro small,
.quota-history-intro strong,
.quota-history-intro p {
  display: block;
}

.quota-context-panel small,
.quota-history-intro small {
  color: var(--page-muted);
  font:
    600 0.56rem ui-monospace,
    monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.quota-context-panel strong,
.quota-history-intro strong {
  overflow: hidden;
  margin-top: 0.18rem;
  color: var(--page-ink);
  font-size: 0.78rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quota-context-panel p,
.quota-history-intro p {
  margin: 0.35rem 0 0;
  color: var(--page-muted);
  font-size: 0.63rem;
  line-height: 1.55;
}

.quota-redeem-panel {
  padding: 1.35rem 1.2rem;
}

.quota-redeem-panel label {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.52rem;
  color: var(--page-ink);
  font:
    600 0.65rem ui-monospace,
    monospace;
}

.quota-redeem-panel label small {
  color: var(--page-muted);
  font-family: 'Avenir Next', 'PingFang SC', sans-serif;
  font-weight: 400;
}

.quota-redeem-entry {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.55rem;
}

.quota-redeem-entry input {
  min-width: 0;
  border: 1px solid var(--page-line);
  border-radius: 0.45rem;
  padding: 0.76rem 0.82rem;
  color: var(--page-ink);
  background: var(--page-card);
  font:
    0.72rem ui-monospace,
    'SFMono-Regular',
    Consolas,
    monospace;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.quota-redeem-entry input:focus {
  outline: none;
  border-color: var(--page-green);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--page-green) 14%, transparent);
}

.quota-redeem-entry input::placeholder {
  color: color-mix(in srgb, var(--page-muted) 68%, transparent);
}

.quota-redeem-entry button {
  min-width: 7.6rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.48rem;
  border: 1px solid var(--page-forest);
  border-radius: 0.45rem;
  padding: 0.72rem 0.85rem;
  color: #f2f5f1;
  background: var(--page-forest);
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    opacity 0.18s ease;
}

.quota-redeem-entry button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.quota-redeem-entry input:disabled,
.quota-redeem-entry button:disabled,
.quota-history-intro button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.quota-result {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  margin-top: 0.75rem;
  border: 1px solid;
  border-radius: 0.45rem;
  padding: 0.72rem 0.8rem;
  font-size: 0.64rem;
}

.quota-result.success {
  color: #2f6b50;
  border-color: #a7cdb8;
  background: #edf7f1;
}

.quota-result.warning {
  color: #80611d;
  border-color: #dac68f;
  background: #fff8e6;
}

.quota-result.error {
  color: #8b403a;
  border-color: #d8aaa4;
  background: #fff0ed;
}

:global(.dark .quota-result.success) {
  color: #91d4ae;
  border-color: #3f7256;
  background: #203429;
}

:global(.dark .quota-result.warning) {
  color: #e2c775;
  border-color: #725f31;
  background: #352e1d;
}

:global(.dark .quota-result.error) {
  color: #e6a8a2;
  border-color: #70413d;
  background: #30201e;
}

.quota-result strong {
  display: block;
  font-size: 0.68rem;
}

.quota-result p {
  margin: 0.2rem 0 0;
  line-height: 1.5;
}

.quota-result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  margin-top: 0.35rem;
  font-family: ui-monospace, monospace;
}

.quota-history-panel {
  display: grid;
  grid-template-columns: minmax(15rem, 0.72fr) minmax(24rem, 1.28fr);
}

.quota-history-intro {
  position: relative;
  align-content: center;
  border-right: 1px solid var(--page-line);
  padding: 1.35rem 3.8rem 1.35rem 1.2rem;
  background: color-mix(in srgb, var(--page-green) 5%, var(--page-bg));
}

.quota-history-intro > button {
  position: absolute;
  top: 50%;
  right: 1.15rem;
  width: 1.9rem;
  height: 1.9rem;
  display: grid;
  place-items: center;
  border: 1px solid var(--page-line);
  border-radius: 50%;
  color: var(--page-muted);
  background: var(--page-card);
  font-size: 0.62rem;
  cursor: pointer;
  transform: translateY(-50%);
}

.quota-history-empty,
.quota-history-list {
  min-height: 7rem;
}

.quota-history-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1.5rem;
  color: var(--page-muted);
  font-size: 0.66rem;
}

.quota-history-empty i {
  color: var(--page-green);
}

.quota-history-list {
  max-height: 17rem;
  overflow-y: auto;
  padding: 0.45rem 1.2rem;
}

.quota-history-list article {
  display: grid;
  grid-template-columns: minmax(7rem, 0.65fr) minmax(10rem, 1fr) auto;
  align-items: center;
  gap: 0.85rem;
  border-bottom: 1px solid var(--page-line);
  padding: 0.72rem 0;
}

.quota-history-list article:last-child {
  border-bottom: 0;
}

.quota-record-type,
.quota-record-revoked {
  display: inline-flex;
  border-radius: 999px;
  padding: 0.25rem 0.48rem;
  font-size: 0.56rem;
  font-weight: 700;
}

.quota-record-type {
  color: var(--page-forest);
  background: color-mix(in srgb, var(--page-green) 13%, var(--page-card));
}

:global(.dark .quota-record-type) {
  color: var(--page-green);
}

.quota-record-type.time {
  color: #6e5630;
  background: #f6edda;
}

:global(.dark .quota-record-type.time) {
  color: #dec286;
  background: #352f22;
}

.quota-record-revoked {
  margin-left: 0.3rem;
  color: #8b403a;
  background: #fff0ed;
}

.quota-history-list p,
.quota-history-list time {
  margin: 0;
  color: var(--page-muted);
  font-size: 0.62rem;
}

.quota-history-list time {
  font-family: ui-monospace, monospace;
  white-space: nowrap;
}

.verified-key-bar {
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

  .quota-workbench-head {
    align-items: flex-start;
  }

  .quota-panel-body,
  .quota-history-panel {
    grid-template-columns: 1fr;
  }

  .quota-context-panel,
  .quota-history-intro {
    border-right: 0;
    border-bottom: 1px solid var(--page-line);
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
  .quota-workbench-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .quota-head-actions,
  .quota-view-switcher {
    width: 100%;
  }

  .quota-key-status {
    max-width: calc(100% - 7.5rem);
  }

  .quota-view-switcher {
    flex: 1;
  }

  .quota-view-switcher button {
    flex: 1;
  }

  .quota-heading > p {
    display: none;
  }

  .quota-panel-body,
  .quota-history-panel {
    display: block;
  }

  .quota-context-panel,
  .quota-history-intro,
  .quota-redeem-panel {
    padding: 1rem;
  }

  .quota-history-intro {
    padding-right: 3.8rem;
  }

  .quota-redeem-entry {
    grid-template-columns: 1fr;
  }

  .quota-redeem-entry button {
    min-height: 2.7rem;
  }

  .quota-history-list {
    padding: 0.35rem 1rem;
  }

  .quota-history-list article {
    grid-template-columns: 1fr auto;
  }

  .quota-history-list article p {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
