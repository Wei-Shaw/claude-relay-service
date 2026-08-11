<template>
  <div class="flex min-h-screen flex-col p-3 sm:p-4 md:p-6">
    <!-- 顶部导航 -->
    <AppHeader />

    <!-- 主内容区域：flex-1 自动填满 header 之外的剩余高度，避免魔数算高导致页面恒定溢出 -->
    <div
      class="glass-strong flex-1 rounded-xl p-3 shadow-xl sm:rounded-2xl sm:p-4 md:rounded-3xl md:p-6"
      style="z-index: 1"
    >
      <!-- 标签栏 -->
      <TabBar :active-tab="activeTab" @tab-change="handleTabChange" />

      <!-- 内容区域 -->
      <div class="tab-content">
        <router-view />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppHeader from './AppHeader.vue'
import TabBar from './TabBar.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// 根据路由设置当前激活的标签
const activeTab = ref('dashboard')

// 根据 LDAP 配置动态生成路由映射
const tabRouteMap = computed(() => {
  const baseMap = {
    dashboard: '/dashboard',
    apiKeys: '/api-keys',
    accounts: '/accounts',
    requestDetails: '/request-details',
    quotaCards: '/quota-cards',
    paymentManage: '/payment-manage',
    proxyPool: '/proxy-pool',
    settings: '/settings/branding'
  }

  // 只有在 LDAP 启用时才包含用户管理路由
  if (authStore.oemSettings?.ldapEnabled) {
    baseMap.userManagement = '/user-management'
  }

  return baseMap
})

// 路由名称 → 父标签（含使用记录等子路由，保证详情页也能高亮到对应栏目）
const nameToTabMap = {
  Dashboard: 'dashboard',
  ApiKeys: 'apiKeys',
  ApiKeyUsageRecords: 'apiKeys',
  Accounts: 'accounts',
  AccountUsageRecords: 'accounts',
  RequestDetails: 'requestDetails',
  QuotaCards: 'quotaCards',
  PaymentManage: 'paymentManage',
  ProxyPool: 'proxyPool',
  UserManagement: 'userManagement',
  Settings: 'settings'
}

// 解析当前路由所属标签：优先精确路径匹配，再前缀匹配，再回退到路由名映射
const resolveTabKey = () => {
  const byPath = Object.keys(tabRouteMap.value).find((key) => tabRouteMap.value[key] === route.path)
  if (byPath) return byPath

  // 子路由（如 /settings/branding、/api-keys/:id/usage-records）按路径前缀归属到父 tab
  if (route.path.startsWith('/settings')) return 'settings'
  if (route.path.startsWith('/api-keys')) return 'apiKeys'
  if (route.path.startsWith('/accounts')) return 'accounts'

  return route.name ? nameToTabMap[route.name] : undefined
}

// 初始化当前激活的标签（无法识别时默认仪表板）
const initActiveTab = () => {
  activeTab.value = resolveTabKey() ?? 'dashboard'
}

// 初始化
initActiveTab()

// 监听路由变化，更新激活的标签（无法识别时保持当前标签不变）
watch(
  () => route.path,
  () => {
    const tabKey = resolveTabKey()
    if (tabKey) {
      activeTab.value = tabKey
    }
  }
)

// 处理标签切换
const handleTabChange = async (tabKey) => {
  // 如果已经在目标路由，不需要做任何事
  if (tabRouteMap.value[tabKey] === route.path) {
    return
  }

  // 先更新activeTab状态
  activeTab.value = tabKey

  // 使用 await 确保路由切换完成
  try {
    await router.push(tabRouteMap.value[tabKey])
    // 等待下一个DOM更新周期，确保组件正确渲染
    await nextTick()
  } catch (err) {
    // 如果路由切换失败，恢复activeTab状态
    if (err.name !== 'NavigationDuplicated') {
      console.error('路由切换失败:', err)
      // 恢复到当前路由对应的tab
      initActiveTab()
    }
  }
}

// OEM设置已在App.vue中加载，无需重复加载
</script>
