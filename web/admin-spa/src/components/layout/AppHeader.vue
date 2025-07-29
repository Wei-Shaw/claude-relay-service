<template>
  <!-- 顶部导航 -->
  <div class="glass-strong rounded-3xl p-6 mb-8 shadow-xl" style="z-index: 10; position: relative;">
    <div class="flex flex-col md:flex-row justify-between items-center gap-4">
      <div class="flex items-center gap-4">
        <LogoTitle 
          :loading="oemLoading"
          :title="oemSettings.siteName"
          subtitle="管理后台"
          :logo-src="oemSettings.siteIconData || oemSettings.siteIcon"
          title-class="text-white"
        >
          <template #after-title>
            <!-- 版本信息 -->
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-400 font-mono">v{{ versionInfo.current || '...' }}</span>
              <!-- 更新提示 -->
              <a 
                v-if="versionInfo.hasUpdate" 
                :href="versionInfo.releaseInfo?.htmlUrl || '#'"
                target="_blank"
                class="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500 border border-green-600 rounded-full text-xs text-white hover:bg-green-600 transition-colors animate-pulse"
                title="有新版本可用"
              >
                <i class="fas fa-arrow-up text-[10px]"></i>
                <span>新版本</span>
              </a>
            </div>
          </template>
        </LogoTitle>
      </div>
      <!-- 用户菜单 -->
      <div class="relative user-menu-container">
        <button 
          @click="userMenuOpen = !userMenuOpen"
          class="btn btn-primary px-4 py-3 flex items-center gap-2 relative"
        >
          <i class="fas fa-user-circle"></i>
          <span>{{ currentUser.username || 'Admin' }}</span>
          <i class="fas fa-chevron-down text-xs transition-transform duration-200" :class="{ 'rotate-180': userMenuOpen }"></i>
        </button>
        
        <!-- 悬浮菜单 -->
        <div 
          v-if="userMenuOpen" 
          class="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-200 py-2 user-menu-dropdown"
          style="z-index: 999999;"
          @click.stop
        >
          <!-- 版本信息 -->
          <div class="px-4 py-3 border-b border-gray-100">
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-500">当前版本</span>
              <span class="font-mono text-gray-700">v{{ versionInfo.current || '...' }}</span>
            </div>
            <div v-if="versionInfo.hasUpdate" class="mt-2">
              <div class="flex items-center justify-between text-sm mb-2">
                <span class="text-green-600 font-medium">
                  <i class="fas fa-arrow-up mr-1"></i>有新版本
                </span>
                <span class="font-mono text-green-600">v{{ versionInfo.latest }}</span>
              </div>
              <a 
                :href="versionInfo.releaseInfo?.htmlUrl || '#'"
                target="_blank"
                class="block w-full text-center px-3 py-1.5 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition-colors"
              >
                <i class="fas fa-external-link-alt mr-1"></i>查看更新
              </a>
            </div>
            <div v-else-if="versionInfo.checkingUpdate" class="mt-2 text-center text-xs text-gray-500">
              <i class="fas fa-spinner fa-spin mr-1"></i>检查更新中...
            </div>
            <div v-else class="mt-2 text-center">
              <!-- 已是最新版提醒 -->
              <transition name="fade" mode="out-in">
                <div v-if="versionInfo.noUpdateMessage" key="message" class="px-3 py-1.5 bg-green-100 border border-green-200 rounded-lg inline-block">
                  <p class="text-xs text-green-700 font-medium">
                    <i class="fas fa-check-circle mr-1"></i>当前已是最新版本
                  </p>
                </div>
                <button 
                  v-else
                  key="button"
                  @click="checkForUpdates()"
                  class="text-xs text-blue-500 hover:text-blue-700 transition-colors"
                >
                  <i class="fas fa-sync-alt mr-1"></i>检查更新
                </button>
              </transition>
            </div>
          </div>
          
          <button 
            @click="openChangePasswordModal"
            class="w-full px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
          >
            <i class="fas fa-key text-blue-500"></i>
            <span>修改账户信息</span>
          </button>
          
          <hr class="my-2 border-gray-200">
          
          <button 
            @click="logout"
            class="w-full px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
          >
            <i class="fas fa-sign-out-alt text-red-500"></i>
            <span>退出登录</span>
          </button>
        </div>
      </div>
    </div>
  </div>
  
  <!-- 修改账户信息模态框 -->
  <div v-if="showChangePasswordModal" class="fixed inset-0 modal z-50 flex items-center justify-center p-4">
    <div class="modal-content w-full max-w-md p-8 mx-auto max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
            <i class="fas fa-key text-white"></i>
          </div>
          <h3 class="text-xl font-bold text-gray-900">修改账户信息</h3>
        </div>
        <button 
          @click="closeChangePasswordModal"
          class="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <i class="fas fa-times text-xl"></i>
        </button>
      </div>
      
      <form @submit.prevent="changePassword" class="space-y-6 modal-scroll-content custom-scrollbar flex-1">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-3">当前用户名</label>
          <input 
            :value="currentUser.username || 'Admin'" 
            type="text" 
            disabled
            class="form-input w-full bg-gray-100 cursor-not-allowed"
          >
          <p class="text-xs text-gray-500 mt-2">当前用户名，输入新用户名以修改</p>
        </div>
        
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-3">新用户名</label>
          <input 
            v-model="changePasswordForm.newUsername" 
            type="text" 
            class="form-input w-full"
            placeholder="输入新用户名（留空保持不变）"
          >
          <p class="text-xs text-gray-500 mt-2">留空表示不修改用户名</p>
        </div>
        
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-3">当前密码</label>
          <input 
            v-model="changePasswordForm.currentPassword" 
            type="password" 
            required
            class="form-input w-full"
            placeholder="请输入当前密码"
          >
        </div>
        
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-3">新密码</label>
          <input 
            v-model="changePasswordForm.newPassword" 
            type="password" 
            required
            class="form-input w-full"
            placeholder="请输入新密码"
          >
          <p class="text-xs text-gray-500 mt-2">密码长度至少8位</p>
        </div>
        
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-3">确认新密码</label>
          <input 
            v-model="changePasswordForm.confirmPassword" 
            type="password" 
            required
            class="form-input w-full"
            placeholder="请再次输入新密码"
          >
        </div>
        
        <div class="flex gap-3 pt-4">
          <button 
            type="button" 
            @click="closeChangePasswordModal" 
            class="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
          >
            取消
          </button>
          <button 
            type="submit" 
            :disabled="changePasswordLoading"
            class="btn btn-primary flex-1 py-3 px-6 font-semibold"
          >
            <div v-if="changePasswordLoading" class="loading-spinner mr-2"></div>
            <i v-else class="fas fa-save mr-2"></i>
            {{ changePasswordLoading ? '保存中...' : '保存修改' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { showToast } from '@/utils/toast'
import { apiClient } from '@/config/api'
import LogoTitle from '@/components/common/LogoTitle.vue'

const router = useRouter()
const authStore = useAuthStore()

// 当前用户信息
const currentUser = computed(() => authStore.user || { username: 'Admin' })

// OEM设置
const oemSettings = computed(() => authStore.oemSettings || {})
const oemLoading = computed(() => authStore.oemLoading)

// 版本信息
const versionInfo = ref({
  current: '...',
  latest: '',
  hasUpdate: false,
  checkingUpdate: false,
  lastChecked: null,
  releaseInfo: null,
  noUpdateMessage: false
})

// 用户菜单状态
const userMenuOpen = ref(false)

// 修改密码模态框
const showChangePasswordModal = ref(false)
const changePasswordLoading = ref(false)
const changePasswordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
  newUsername: ''
})

// 检查更新（同时获取版本信息）
const checkForUpdates = async () => {
  if (versionInfo.value.checkingUpdate) {
    return
  }
  
  versionInfo.value.checkingUpdate = true
  
  try {
    const result = await apiClient.get('/admin/check-updates')
    
    if (result.success) {
      const data = result.data
      
      versionInfo.value.current = data.current
      versionInfo.value.latest = data.latest
      versionInfo.value.hasUpdate = data.hasUpdate
      versionInfo.value.releaseInfo = data.releaseInfo
      versionInfo.value.lastChecked = new Date()
      
      // 保存到localStorage
      localStorage.setItem('versionInfo', JSON.stringify({
        current: data.current,
        latest: data.latest,
        lastChecked: versionInfo.value.lastChecked,
        hasUpdate: data.hasUpdate,
        releaseInfo: data.releaseInfo
      }))
      
      // 如果没有更新，显示提醒
      if (!data.hasUpdate) {
        versionInfo.value.noUpdateMessage = true
        // 3秒后自动隐藏提醒
        setTimeout(() => {
          versionInfo.value.noUpdateMessage = false
        }, 3000)
      }
    }
  } catch (error) {
    console.error('Error checking for updates:', error)
    
    // 尝试从localStorage读取缓存的版本信息
    const cached = localStorage.getItem('versionInfo')
    if (cached) {
      const cachedInfo = JSON.parse(cached)
      versionInfo.value.current = cachedInfo.current || versionInfo.value.current
      versionInfo.value.latest = cachedInfo.latest
      versionInfo.value.hasUpdate = cachedInfo.hasUpdate
      versionInfo.value.releaseInfo = cachedInfo.releaseInfo
      versionInfo.value.lastChecked = new Date(cachedInfo.lastChecked)
    }
  } finally {
    versionInfo.value.checkingUpdate = false
  }
}

// 打开修改密码弹窗
const openChangePasswordModal = () => {
  changePasswordForm.currentPassword = ''
  changePasswordForm.newPassword = ''
  changePasswordForm.confirmPassword = ''
  changePasswordForm.newUsername = ''
  showChangePasswordModal.value = true
  userMenuOpen.value = false
}

// 关闭修改密码弹窗
const closeChangePasswordModal = () => {
  showChangePasswordModal.value = false
}

// 修改密码
const changePassword = async () => {
  if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) {
    showToast('两次输入的密码不一致', 'error')
    return
  }
  
  if (changePasswordForm.newPassword.length < 8) {
    showToast('新密码长度至少8位', 'error')
    return
  }
  
  changePasswordLoading.value = true
  
  try {
    const data = await apiClient.post('/admin/change-password', {
      currentPassword: changePasswordForm.currentPassword,
      newPassword: changePasswordForm.newPassword,
      newUsername: changePasswordForm.newUsername || undefined
    })
    
    if (data.success) {
      const message = changePasswordForm.newUsername ? '账户信息修改成功，请重新登录' : '密码修改成功，请重新登录'
      showToast(message, 'success')
      closeChangePasswordModal()
      
      // 延迟后退出登录
      setTimeout(() => {
        authStore.logout()
        router.push('/login')
      }, 1500)
    } else {
      showToast(data.message || '修改失败', 'error')
    }
  } catch (error) {
    showToast('修改密码失败', 'error')
  } finally {
    changePasswordLoading.value = false
  }
}

// 退出登录
const logout = () => {
  if (confirm('确定要退出登录吗？')) {
    authStore.logout()
    router.push('/login')
    showToast('已安全退出', 'success')
  }
  userMenuOpen.value = false
}

// 点击外部关闭菜单
const handleClickOutside = (event) => {
  const userMenuContainer = event.target.closest('.user-menu-container')
  if (!userMenuContainer && userMenuOpen.value) {
    userMenuOpen.value = false
  }
}

onMounted(() => {
  checkForUpdates()
  
  // 设置自动检查更新（每小时检查一次）
  setInterval(() => {
    checkForUpdates()
  }, 3600000) // 1小时
  
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
/* 用户菜单样式优化 */
.user-menu-dropdown {
  margin-top: 8px;
}

/* fade过渡动画 */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>