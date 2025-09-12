<template>
  <div id="app">
    <router-view />

    <!-- 全局组件 -->
    <ToastNotification ref="toastRef" />
    <ConfirmDialog ref="confirmRef" />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import ToastNotification from '@/components/common/ToastNotification.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'

const authStore = useAuthStore()
const themeStore = useThemeStore()
const toastRef = ref()
const confirmRef = ref()

onMounted(() => {
  // 初始化主题
  themeStore.initTheme()

  // 监听系统主题变化
  themeStore.watchSystemTheme()

  // 检查本地存储的认证状态
  authStore.checkAuth()

  // 加载OEM设置（包括网站图标）
  authStore.loadOemSettings()
})
</script>

<style scoped>
#app {
  min-height: 100vh;
}
</style>
