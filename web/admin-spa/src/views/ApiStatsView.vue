<template>
  <div class="min-h-screen" :class="isDarkMode ? 'gradient-bg-dark' : 'gradient-bg'">
    <!-- 顶栏 + Tab 吸顶：教程等内容较长时保持可切换 -->
    <div class="api-stats-sticky-header sticky top-0 z-40 p-2 sm:p-4 md:p-6">
      <!-- 顶部导航 -->
      <div
        class="glass-strong mb-4 rounded-2xl p-3 shadow-xl sm:mb-6 sm:rounded-3xl sm:p-4 md:mb-6 md:p-6"
      >
        <div class="flex flex-col items-center justify-between gap-3 sm:gap-4 md:flex-row">
          <LogoTitle
            :loading="oemLoading"
            :logo-src="oemSettings.siteIconData || oemSettings.siteIcon"
            :subtitle="pageSubtitle"
            :title="oemSettings.siteName"
          />
          <div class="flex items-center gap-2 md:gap-4">
            <div class="flex items-center">
              <ThemeToggle mode="dropdown" />
            </div>

            <div
              v-if="oemSettings.ldapEnabled || oemSettings.showAdminButton !== false"
              class="h-8 w-px bg-gradient-to-b from-transparent via-gray-300 to-transparent opacity-50 dark:via-gray-600"
            />

            <router-link
              v-if="oemSettings.ldapEnabled"
              class="user-login-button flex items-center gap-2 rounded-2xl px-4 py-2 text-white transition-all duration-300 md:px-5 md:py-2.5"
              to="/user-login"
            >
              <i class="fas fa-user text-sm md:text-base" />
              <span class="text-sm font-semibold tracking-wide md:text-sm">用户登录</span>
            </router-link>
            <router-link
              v-if="oemSettings.showAdminButton !== false"
              class="admin-button-refined flex items-center gap-2 rounded-2xl px-4 py-2 transition-all duration-300 md:px-5 md:py-2.5"
              to="/dashboard"
            >
              <i class="fas fa-shield-alt text-sm md:text-base" />
              <span class="text-sm font-semibold tracking-wide md:text-sm">管理后台</span>
            </router-link>
          </div>
        </div>
      </div>

      <!-- Tab 切换（路由） -->
      <div class="flex justify-center">
        <div
          class="inline-flex w-full max-w-2xl flex-wrap justify-center gap-1 rounded-full border border-white/20 bg-white/10 p-1 shadow-lg backdrop-blur-xl sm:w-auto sm:flex-nowrap"
        >
          <router-link
            v-for="tab in tabs"
            :key="tab.key"
            :class="['tab-pill-button', { active: currentTab === tab.key }]"
            :to="{ name: tab.name, query: route.query }"
          >
            <i :class="['fas', tab.icon, 'mr-1 md:mr-2']" />
            <span class="text-sm md:text-base">{{ tab.label }}</span>
          </router-link>
        </div>
      </div>
    </div>

    <!-- 子路由内容 -->
    <div class="relative z-[1] px-2 pb-2 sm:px-4 sm:pb-4 md:px-6 md:pb-6">
      <router-view />
    </div>

    <!-- API Stats 通知弹框 -->
    <ModalTransition>
      <div
        v-if="showNotice"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        @click.self="dismissNotice"
      >
        <div
          class="modal-panel w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800"
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
    </ModalTransition>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'
import { useThemeStore } from '@/stores/theme'
import LogoTitle from '@/components/common/LogoTitle.vue'
import ModalTransition from '@/components/common/ModalTransition.vue'
import ThemeToggle from '@/components/common/ThemeToggle.vue'

const route = useRoute()
const apiStatsStore = useApiStatsStore()
const themeStore = useThemeStore()

const tabs = [
  { key: 'stats', name: 'ApiStatsQuery', label: '统计查询', icon: 'fa-chart-line' },
  { key: 'quota', name: 'ApiStatsQuota', label: '额度卡', icon: 'fa-ticket-alt' },
  { key: 'recharge', name: 'ApiStatsRecharge', label: '充值', icon: 'fa-wallet' },
  { key: 'pricing', name: 'ApiStatsPricing', label: '模型价格', icon: 'fa-tags' },
  { key: 'tutorial', name: 'ApiStatsTutorial', label: '使用教程', icon: 'fa-graduation-cap' }
]

const currentTab = computed(() => route.meta.tab || 'stats')
const pageSubtitle = computed(() => route.meta.subtitle || 'API Key 使用统计')
const isDarkMode = computed(() => themeStore.isDarkMode)

const { apiKey, apiId, oemLoading, oemSettings } = storeToRefs(apiStatsStore)
const {
  queryStats,
  loadStatsWithApiId,
  loadOemSettings,
  loadServiceRates,
  loadApiKeyFromStorage,
  reset
} = apiStatsStore

const showNotice = ref(false)
const dontShowAgain = ref(false)
const NOTICE_STORAGE_KEY = 'apiStatsNoticeRead'

const dismissNotice = () => {
  showNotice.value = false
  if (dontShowAgain.value) {
    sessionStorage.setItem(NOTICE_STORAGE_KEY, '1')
  }
}

const checkNotice = () => {
  const notice = oemSettings.value?.apiStatsNotice
  if (notice?.enabled && notice?.content && !sessionStorage.getItem(NOTICE_STORAGE_KEY)) {
    showNotice.value = true
  }
}

const handleKeyDown = (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    if (apiKey.value.trim()) {
      queryStats()
    }
    event.preventDefault()
  }

  if (event.key === 'Escape') {
    reset()
  }
}

onMounted(async () => {
  themeStore.initTheme()

  await Promise.all([loadOemSettings(), loadServiceRates()])
  checkNotice()

  const urlApiId = route.query.apiId
  const urlApiKey = route.query.apiKey

  if (
    urlApiId &&
    urlApiId.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
  ) {
    apiId.value = urlApiId
    const savedApiKey = loadApiKeyFromStorage()
    if (savedApiKey) {
      apiKey.value = savedApiKey
    }
    loadStatsWithApiId()
  } else if (urlApiKey && urlApiKey.length > 10) {
    apiKey.value = urlApiKey
  } else {
    const savedApiKey = loadApiKeyFromStorage()
    if (savedApiKey && savedApiKey.length > 10) {
      apiKey.value = savedApiKey
      queryStats()
    }
  }

  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})

watch(apiKey, (newValue) => {
  if (!newValue) {
    apiStatsStore.clearData()
  }
})
</script>

<style scoped>
/* 吸顶区域：毛玻璃底，避免正文滚过时透出；与页面渐变同色系 */
.api-stats-sticky-header {
  background: color-mix(in srgb, var(--bg-gradient-start) 82%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.gradient-bg {
  background: linear-gradient(
    135deg,
    var(--bg-gradient-start) 0%,
    var(--bg-gradient-mid) 50%,
    var(--bg-gradient-end) 100%
  );
  background-attachment: fixed;
  min-height: 100vh;
  position: relative;
}

.gradient-bg-dark {
  background: linear-gradient(
    135deg,
    var(--bg-gradient-start) 0%,
    var(--bg-gradient-mid) 50%,
    var(--bg-gradient-end) 100%
  );
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
    radial-gradient(circle at 20% 80%, rgba(var(--accent-rgb), 0.2) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(var(--primary-rgb), 0.2) 0%, transparent 50%),
    radial-gradient(circle at 40% 40%, rgba(var(--secondary-rgb), 0.1) 0%, transparent 50%);
  pointer-events: none;
  z-index: 0;
}

.gradient-bg-dark::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background:
    radial-gradient(circle at 20% 80%, rgba(var(--accent-rgb), 0.1) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(var(--primary-rgb), 0.1) 0%, transparent 50%),
    radial-gradient(circle at 40% 40%, rgba(var(--secondary-rgb), 0.1) 0%, transparent 50%);
  pointer-events: none;
  z-index: 0;
}

.glass-strong {
  background: var(--glass-strong-color);
  backdrop-filter: blur(25px);
  border: 1px solid var(--border-color);
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba(255, 255, 255, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  position: relative;
  z-index: 1;
}

:global(.dark) .glass-strong {
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.7),
    0 0 0 1px rgba(55, 65, 81, 0.3),
    inset 0 1px 0 rgba(75, 85, 99, 0.2);
}

.user-login-button {
  background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  text-decoration: none;
  box-shadow:
    0 4px 12px rgba(52, 211, 153, 0.25),
    inset 0 1px 1px rgba(255, 255, 255, 0.2);
  position: relative;
  overflow: hidden;
  font-weight: 600;
}

:global(.dark) .user-login-button {
  background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
  border: 1px solid rgba(52, 211, 153, 0.4);
  color: white;
  box-shadow:
    0 4px 12px rgba(52, 211, 153, 0.3),
    inset 0 1px 1px rgba(255, 255, 255, 0.1);
}

.user-login-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.user-login-button:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow:
    0 8px 20px rgba(52, 211, 153, 0.35),
    inset 0 1px 1px rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.4);
}

.user-login-button:hover::before {
  opacity: 1;
}

:global(.dark) .user-login-button:hover {
  box-shadow:
    0 8px 20px rgba(52, 211, 153, 0.4),
    inset 0 1px 1px rgba(255, 255, 255, 0.2);
  border-color: rgba(52, 211, 153, 0.5);
}

.user-login-button:active {
  transform: translateY(-1px) scale(1);
}

.user-login-button i,
.user-login-button span {
  position: relative;
  z-index: 1;
}

.admin-button-refined {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  text-decoration: none;
  box-shadow:
    0 4px 12px rgba(var(--primary-rgb), 0.25),
    inset 0 1px 1px rgba(255, 255, 255, 0.2);
  position: relative;
  overflow: hidden;
  font-weight: 600;
}

:global(.dark) .admin-button-refined {
  background: rgba(55, 65, 81, 0.8);
  border: 1px solid rgba(107, 114, 128, 0.4);
  color: #f3f4f6;
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.3),
    inset 0 1px 1px rgba(255, 255, 255, 0.05);
}

.admin-button-refined::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, var(--secondary-color) 0%, var(--primary-color) 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.admin-button-refined:hover {
  transform: translateY(-2px) scale(1.02);
  background: linear-gradient(135deg, var(--secondary-color) 0%, var(--primary-color) 100%);
  box-shadow:
    0 8px 20px rgba(var(--secondary-rgb), 0.35),
    inset 0 1px 1px rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.4);
  color: white;
}

.admin-button-refined:hover::before {
  opacity: 1;
}

:global(.dark) .admin-button-refined:hover {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  border-color: rgba(var(--secondary-rgb), 0.4);
  box-shadow:
    0 8px 20px rgba(var(--primary-rgb), 0.3),
    inset 0 1px 1px rgba(255, 255, 255, 0.1);
  color: white;
}

.admin-button-refined:active {
  transform: translateY(-1px) scale(1);
}

.admin-button-refined i,
.admin-button-refined span {
  position: relative;
  z-index: 1;
}

.tab-pill-button {
  padding: 0.5rem 1rem;
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
  flex: 1;
  justify-content: center;
  text-decoration: none;
}

:global(html.dark) .tab-pill-button {
  color: rgba(209, 213, 219, 0.8);
}

@media (min-width: 768px) {
  .tab-pill-button {
    padding: 0.625rem 1.25rem;
    flex: none;
  }
}

.tab-pill-button:hover {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

:global(html.dark) .tab-pill-button:hover {
  color: #f3f4f6;
  background: rgba(100, 116, 139, 0.2);
}

.tab-pill-button.active {
  background: white;
  color: var(--secondary-color);
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

:global(html.dark) .tab-pill-button.active {
  background: rgba(71, 85, 105, 0.9);
  color: #f3f4f6;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.3),
    0 2px 4px -1px rgba(0, 0, 0, 0.2);
}

.tab-pill-button i {
  font-size: 0.875rem;
}
</style>
