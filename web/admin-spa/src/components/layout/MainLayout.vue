<template>
  <div class="min-h-screen p-3 sm:p-4 md:p-6">
    <!-- 顶部导航 -->
    <AppHeader />

    <!-- 主内容区域 -->
    <div
      class="glass-strong rounded-xl p-3 shadow-xl sm:rounded-2xl sm:p-4 md:rounded-3xl md:p-6"
      style="z-index: 1; min-height: calc(100vh - 120px)"
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
    tutorial: '/tutorial',
    settings: '/settings'
  }

  // 只有在 LDAP 启用时才包含用户管理路由
  if (authStore.oemSettings?.ldapEnabled) {
    baseMap.userManagement = '/user-management'
  }

  return baseMap
})

// 初始化当前激活的标签
const initActiveTab = () => {
  const currentPath = route.path
  const tabKey = Object.keys(tabRouteMap.value).find(
    (key) => tabRouteMap.value[key] === currentPath
  )

  if (tabKey) {
    activeTab.value = tabKey
  } else {
    // 如果路径不匹配任何标签，尝试从路由名称获取
    const routeName = route.name
    const nameToTabMap = {
      Dashboard: 'dashboard',
      ApiKeys: 'apiKeys',
      Accounts: 'accounts',
      Tutorial: 'tutorial',
      Settings: 'settings'
    }
    if (routeName && nameToTabMap[routeName]) {
      activeTab.value = nameToTabMap[routeName]
    } else {
      // 默认选中仪表板
      activeTab.value = 'dashboard'
    }
  }
}

// 初始化
initActiveTab()

// 监听路由变化，更新激活的标签
watch(
  () => route.path,
  (newPath) => {
    const tabKey = Object.keys(tabRouteMap.value).find((key) => tabRouteMap.value[key] === newPath)
    if (tabKey) {
      activeTab.value = tabKey
    } else {
      // 如果路径不匹配任何标签，尝试从路由名称获取
      const routeName = route.name
      const nameToTabMap = {
        Dashboard: 'dashboard',
        ApiKeys: 'apiKeys',
        Accounts: 'accounts',
        Tutorial: 'tutorial',
        Settings: 'settings'
      }
      if (routeName && nameToTabMap[routeName]) {
        activeTab.value = nameToTabMap[routeName]
      }
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

<style scoped>
/* 使用全局定义的过渡样式 */
</style>
