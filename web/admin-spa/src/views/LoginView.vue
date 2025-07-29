<template>
  <div class="flex items-center justify-center min-h-screen p-6">
    <div class="glass-strong rounded-3xl p-10 w-full max-w-md shadow-2xl">
      <div class="text-center mb-8">
        <!-- 使用自定义布局来保持登录页面的居中大logo样式 -->
        <div class="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-gray-300/30 rounded-2xl flex items-center justify-center backdrop-blur-sm overflow-hidden">
          <template v-if="!oemLoading">
            <img v-if="authStore.oemSettings.siteIconData || authStore.oemSettings.siteIcon" 
                 :src="authStore.oemSettings.siteIconData || authStore.oemSettings.siteIcon" 
                 alt="Logo"
                 class="w-12 h-12 object-contain"
                 @error="(e) => e.target.style.display = 'none'">
            <i v-else class="fas fa-cloud text-3xl text-gray-700"></i>
          </template>
          <div v-else class="w-12 h-12 bg-gray-300/50 rounded animate-pulse"></div>
        </div>
        <template v-if="!oemLoading && authStore.oemSettings.siteName">
          <h1 class="text-3xl font-bold text-white mb-2 header-title">{{ authStore.oemSettings.siteName }}</h1>
        </template>
        <div v-else-if="oemLoading" class="h-9 w-64 bg-gray-300/50 rounded animate-pulse mx-auto mb-2"></div>
        <p class="text-gray-600 text-lg">管理后台</p>
      </div>
      
      <form @submit.prevent="handleLogin" class="space-y-6">
        <div>
          <label class="block text-sm font-semibold text-gray-900 mb-3">用户名</label>
          <input 
            v-model="loginForm.username" 
            type="text" 
            required 
            class="form-input w-full"
            placeholder="请输入用户名"
          >
        </div>
        
        <div>
          <label class="block text-sm font-semibold text-gray-900 mb-3">密码</label>
          <input 
            v-model="loginForm.password" 
            type="password" 
            required 
            class="form-input w-full"
            placeholder="请输入密码"
          >
        </div>
        
        <button 
          type="submit" 
          :disabled="authStore.loginLoading"
          class="btn btn-primary w-full py-4 px-6 text-lg font-semibold"
        >
          <i v-if="!authStore.loginLoading" class="fas fa-sign-in-alt mr-2"></i>
          <div v-if="authStore.loginLoading" class="loading-spinner mr-2"></div>
          {{ authStore.loginLoading ? '登录中...' : '登录' }}
        </button>
      </form>
      
      <div v-if="authStore.loginError" class="mt-6 p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-800 text-sm text-center backdrop-blur-sm">
        <i class="fas fa-exclamation-triangle mr-2"></i>{{ authStore.loginError }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import LogoTitle from '@/components/common/LogoTitle.vue'

const authStore = useAuthStore()
const oemLoading = computed(() => authStore.oemLoading)

const loginForm = ref({
  username: '',
  password: ''
})

onMounted(() => {
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