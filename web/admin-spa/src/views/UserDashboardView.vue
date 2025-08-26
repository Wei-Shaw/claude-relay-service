<template>
  <div class="min-h-screen p-4 md:p-6" :class="isDarkMode ? 'gradient-bg-dark' : 'gradient-bg'">
    <!-- 顶部导航 -->
    <div class="glass-strong mb-6 rounded-3xl p-4 shadow-xl md:mb-8 md:p-6">
      <div class="flex flex-col items-center justify-between gap-4 md:flex-row">
        <div class="flex items-center gap-4">
          <LogoTitle
            :loading="false"
            logo-src="/assets/logo.png"
            :subtitle="`欢迎，${userInfo.displayName || userInfo.username}`"
            title="Claude Relay Service"
          />
          <div class="text-sm text-gray-600 dark:text-gray-400">
            <i class="fas fa-building mr-1"></i
            >{{
              userInfo.groups && userInfo.groups.length > 0
                ? extractGroupName(userInfo.groups[0])
                : '未知部门'
            }}
          </div>
        </div>
        <div class="flex items-center gap-2 md:gap-4">
          <!-- 主题切换按钮 -->
          <ThemeToggle mode="dropdown" />

          <!-- 分隔线 -->
          <div
            class="h-8 w-px bg-gradient-to-b from-transparent via-gray-300 to-transparent opacity-50 dark:via-gray-600"
          />

          <!-- 退出登录按钮 -->
          <button
            class="logout-button flex items-center gap-2 rounded-2xl px-4 py-2 transition-all duration-300 md:px-5 md:py-2.5"
            @click="handleLogout"
          >
            <i class="fas fa-sign-out-alt text-sm md:text-base" />
            <span class="text-xs font-semibold tracking-wide md:text-sm">退出登录</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Tab 切换 -->
    <div class="mb-6 md:mb-8">
      <div class="flex justify-center">
        <div
          class="inline-flex w-full max-w-2xl rounded-full border border-white/20 bg-white/10 p-1 shadow-lg backdrop-blur-xl md:w-auto"
        >
          <button
            :class="['tab-pill-button', currentTab === 'api-keys' ? 'active' : '']"
            @click="currentTab = 'api-keys'"
          >
            <i class="fas fa-key mr-1 md:mr-2" />
            <span class="text-sm md:text-base">API Keys 管理</span>
          </button>
          <button
            :class="['tab-pill-button', currentTab === 'tutorial' ? 'active' : '']"
            @click="currentTab = 'tutorial'"
          >
            <i class="fas fa-graduation-cap mr-1 md:mr-2" />
            <span class="text-sm md:text-base">使用教程</span>
          </button>
        </div>
      </div>
    </div>

    <!-- API Keys 管理 -->
    <div v-if="currentTab === 'api-keys'" class="tab-content">
      <UserApiKeysView :user-info="userInfo" />
    </div>

    <!-- 使用教程 -->
    <div v-if="currentTab === 'tutorial'" class="tab-content">
      <div class="glass-strong rounded-3xl shadow-xl">
        <TutorialView />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useThemeStore } from '@/stores/theme'
import LogoTitle from '@/components/common/LogoTitle.vue'
import ThemeToggle from '@/components/common/ThemeToggle.vue'
import TutorialView from './TutorialView.vue'
import UserApiKeysView from '@/components/user/UserApiKeysView.vue'
const themeStore = useThemeStore()

// 当前标签页
const currentTab = ref('api-keys')

// 主题相关
const isDarkMode = computed(() => themeStore.isDarkMode)

// 用户信息
const userInfo = ref({})

// 从组名中提取部门名称
const extractGroupName = (group) => {
  if (!group) return '未知部门'
  // 从 "CN=总裁办,OU=微店,DC=corp,DC=weidian-inc,DC=com" 中提取 "总裁办"
  const match = group.match(/CN=([^,]+)/)
  return match ? match[1] : '未知部门'
}

// 退出登录
const handleLogout = () => {
  localStorage.removeItem('user_token')
  localStorage.removeItem('user_info')
  window.location.href = '/admin-next/api-stats'
}

// 验证用户token
const verifyToken = async () => {
  const token = localStorage.getItem('user_token')
  if (!token) {
    window.location.href = '/admin-next/api-stats'
    return false
  }

  try {
    const response = await fetch('/admin/ldap/verify-token', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    const result = await response.json()
    if (result.success) {
      userInfo.value = result.user
      return true
    } else {
      localStorage.removeItem('user_token')
      localStorage.removeItem('user_info')
      window.location.href = '/admin-next/api-stats'
      return false
    }
  } catch (error) {
    console.error('Token验证失败:', error)
    localStorage.removeItem('user_token')
    localStorage.removeItem('user_info')
    window.location.href = '/admin-next/api-stats'
    return false
  }
}

// 初始化
onMounted(async () => {
  // 初始化主题
  themeStore.initTheme()

  // 验证token
  const isValid = await verifyToken()
  if (!isValid) return

  // 从localStorage获取用户信息作为备份
  const storedUserInfo = localStorage.getItem('user_info')
  if (storedUserInfo && !userInfo.value.username) {
    userInfo.value = JSON.parse(storedUserInfo)
  }
})
</script>

<style scoped>
/* 渐变背景 */
.gradient-bg {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  background-attachment: fixed;
  min-height: 100vh;
  position: relative;
}

.gradient-bg-dark {
  background: linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%);
  background-attachment: fixed;
  min-height: 100vh;
  position: relative;
}

.gradient-bg::before,
.gradient-bg-dark::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 0;
}

.gradient-bg::before {
  background:
    radial-gradient(circle at 20% 80%, rgba(240, 147, 251, 0.2) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(102, 126, 234, 0.2) 0%, transparent 50%),
    radial-gradient(circle at 40% 40%, rgba(118, 75, 162, 0.1) 0%, transparent 50%);
}

.gradient-bg-dark::before {
  background:
    radial-gradient(circle at 20% 80%, rgba(100, 116, 139, 0.1) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(71, 85, 105, 0.1) 0%, transparent 50%),
    radial-gradient(circle at 40% 40%, rgba(30, 41, 59, 0.1) 0%, transparent 50%);
}

/* 玻璃态效果 */
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

/* 退出登录按钮 */
.logout-button {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  text-decoration: none;
  box-shadow:
    0 4px 12px rgba(239, 68, 68, 0.25),
    inset 0 1px 1px rgba(255, 255, 255, 0.2);
  position: relative;
  overflow: hidden;
  font-weight: 600;
  cursor: pointer;
}

:global(.dark) .logout-button {
  background: rgba(239, 68, 68, 0.8);
  border: 1px solid rgba(107, 114, 128, 0.4);
  color: #f3f4f6;
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.3),
    inset 0 1px 1px rgba(255, 255, 255, 0.05);
}

.logout-button:hover {
  transform: translateY(-2px) scale(1.02);
  background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
  box-shadow:
    0 8px 20px rgba(220, 38, 38, 0.35),
    inset 0 1px 1px rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.4);
}

:global(.dark) .logout-button:hover {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  border-color: rgba(239, 68, 68, 0.4);
  box-shadow:
    0 8px 20px rgba(239, 68, 68, 0.3),
    inset 0 1px 1px rgba(255, 255, 255, 0.1);
}

.logout-button:active {
  transform: translateY(-1px) scale(1);
}

/* Tab 胶囊按钮样式 */
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
  color: #764ba2;
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

/* Tab 内容切换动画 */
.tab-content {
  animation: tabFadeIn 0.4s ease-out;
}

@keyframes tabFadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
