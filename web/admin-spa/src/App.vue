<template>
  <div id="app">
    <el-config-provider :locale="elLocale">
      <router-view />

      <!-- 全局组件 -->
      <ToastNotification ref="toastRef" />
      <ConfirmDialog ref="confirmRef" />
    </el-config-provider>
  </div>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import ToastNotification from '@/components/common/ToastNotification.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import i18n from '@/i18n'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import zhTw from 'element-plus/dist/locale/zh-tw.mjs'
import en from 'element-plus/dist/locale/en.mjs'

const authStore = useAuthStore()
const themeStore = useThemeStore()
const toastRef = ref()
const confirmRef = ref()

// Element Plus 语言随 i18n 切换
const elLocale = computed(() => {
  const l = i18n.global.locale.value
  if (l === 'zh-tw') return zhTw
  if (l === 'en') return en
  return zhCn
})

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
