<template>
  <div class="flex min-h-screen items-center justify-center p-4 sm:p-6">
    <!-- 主题切换按钮 - 固定在右上角 -->
    <div class="fixed right-4 top-4 z-50">
      <ThemeToggle mode="dropdown" />
    </div>

    <div
      class="glass-strong w-full max-w-md rounded-xl p-6 shadow-2xl sm:rounded-2xl sm:p-8 md:rounded-3xl md:p-10"
    >
      <div class="mb-6 text-center sm:mb-8">
        <!-- 使用自定义布局来保持登录页面的居中大logo样式 -->
        <div
          class="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-gray-300/30 bg-gradient-to-br from-blue-500/20 to-purple-500/20 backdrop-blur-sm sm:mb-6 sm:h-20 sm:w-20 sm:rounded-2xl"
        >
          <template v-if="!oemLoading">
            <img
              v-if="authStore.oemSettings.siteIconData || authStore.oemSettings.siteIcon"
              alt="Logo"
              class="h-10 w-10 object-contain sm:h-12 sm:w-12"
              :src="authStore.oemSettings.siteIconData || authStore.oemSettings.siteIcon"
              @error="(e) => (e.target.style.display = 'none')"
            />
            <i v-else class="fas fa-cloud text-2xl text-gray-700 sm:text-3xl" />
          </template>
          <div v-else class="h-10 w-10 animate-pulse rounded bg-gray-300/50 sm:h-12 sm:w-12" />
        </div>
        <template v-if="!oemLoading && authStore.oemSettings.siteName">
          <h1 class="header-title mb-2 text-2xl font-bold text-white sm:text-3xl">
            {{ authStore.oemSettings.siteName }}
          </h1>
        </template>
        <div
          v-else-if="oemLoading"
          class="mx-auto mb-2 h-8 w-48 animate-pulse rounded bg-gray-300/50 sm:h-9 sm:w-64"
        />
        <p class="text-base text-gray-600 dark:text-gray-400 sm:text-lg">管理后台</p>
      </div>

      <form class="space-y-4 sm:space-y-6" @submit.prevent="handleLogin">
        <div>
          <label class="mb-2 block text-sm font-semibold text-gray-900 dark:text-gray-100 sm:mb-3"
            >用户名</label
          >
          <input
            v-model="loginForm.username"
            class="form-input w-full"
            placeholder="请输入用户名"
            required
            type="text"
          />
        </div>

        <div>
          <label class="mb-2 block text-sm font-semibold text-gray-900 dark:text-gray-100 sm:mb-3"
            >密码</label
          >
          <input
            v-model="loginForm.password"
            class="form-input w-full"
            placeholder="请输入密码"
            required
            type="password"
          />
        </div>

        <button
          class="btn btn-primary w-full px-4 py-3 text-base font-semibold sm:px-6 sm:py-4 sm:text-lg"
          :disabled="authStore.loginLoading"
          type="submit"
        >
          <i v-if="!authStore.loginLoading" class="fas fa-sign-in-alt mr-2" />
          <div v-if="authStore.loginLoading" class="loading-spinner mr-2" />
          {{ authStore.loginLoading ? '登录中...' : '登录' }}
        </button>
      </form>

      <div
        v-if="authStore.loginError"
        class="mt-4 rounded-lg border border-red-500/30 bg-red-500/20 p-3 text-center text-xs text-red-800 backdrop-blur-sm dark:text-red-400 sm:mt-6 sm:rounded-xl sm:p-4 sm:text-sm"
      >
        <i class="fas fa-exclamation-triangle mr-2" />{{ authStore.loginError }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import ThemeToggle from '@/components/common/ThemeToggle.vue'

const authStore = useAuthStore()
const themeStore = useThemeStore()
const oemLoading = computed(() => authStore.oemLoading)

const loginForm = ref({
  username: '',
  password: ''
})

onMounted(() => {
  // 初始化主题
  themeStore.initTheme()
  // 加载OEM设置
  authStore.loadOemSettings()
})

const handleLogin = async () => {
  await authStore.login(loginForm.value)
}
</script>

<style scoped>
/* 组件特定样式已经在全局样式中定义 */
</style>
