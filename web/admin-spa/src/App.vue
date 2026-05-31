<template>
  <ElConfigProvider :locale="elementLocale">
    <div id="app">
      <router-view />

      <!-- 全局组件 -->
      <ToastNotification ref="toastRef" />
    </div>
  </ElConfigProvider>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import elementEn from 'element-plus/dist/locale/en.mjs'
import elementZhCn from 'element-plus/dist/locale/zh-cn.mjs'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import ToastNotification from '@/components/common/ToastNotification.vue'

const authStore = useAuthStore()
const themeStore = useThemeStore()
const toastRef = ref()
const { locale, t } = useI18n()

const elementLocale = computed(() => (locale.value === 'zh-CN' ? elementZhCn : elementEn))

watch(
  () => [locale.value, authStore.oemSettings.siteName],
  () => {
    if (authStore.oemSettings.siteName) {
      document.title = `${authStore.oemSettings.siteName} - ${t('auth.adminPanel')}`
    }
  }
)

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
