<template>
  <div class="min-h-screen p-6">
    <!-- 顶部导航 -->
    <AppHeader />
    
    <!-- 主内容区域 -->
    <div class="glass-strong rounded-3xl p-6 shadow-xl" style="z-index: 1; min-height: calc(100vh - 240px);">
      <!-- 标签栏 -->
      <TabBar :active-tab="activeTab" @tab-change="handleTabChange" />
      
      <!-- 内容区域 -->
      <div class="tab-content">
        <router-view v-slot="{ Component }">
          <transition name="slide-up" mode="out-in">
            <keep-alive :include="['DashboardView', 'ApiKeysView']">
              <component :is="Component" />
            </keep-alive>
          </transition>
        </router-view>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from './AppHeader.vue'
import TabBar from './TabBar.vue'

const route = useRoute()
const router = useRouter()

// 根据路由设置当前激活的标签
const activeTab = ref('dashboard')

const tabRouteMap = {
  dashboard: '/dashboard',
  apiKeys: '/api-keys',
  accounts: '/accounts',
  tutorial: '/tutorial',
  settings: '/settings'
}

// 监听路由变化，更新激活的标签
watch(() => route.path, (newPath) => {
  const tabKey = Object.keys(tabRouteMap).find(
    key => tabRouteMap[key] === newPath
  )
  if (tabKey) {
    activeTab.value = tabKey
  }
}, { immediate: true })

// 处理标签切换
const handleTabChange = (tabKey) => {
  activeTab.value = tabKey
  router.push(tabRouteMap[tabKey])
}

// OEM设置已在App.vue中加载，无需重复加载
</script>

<style scoped>
/* 使用全局定义的过渡样式 */
</style>