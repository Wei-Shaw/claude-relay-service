<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- 导航栏 -->
    <nav class="bg-white shadow dark:bg-gray-800">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="flex h-16 justify-between">
          <div class="flex items-center">
            <div class="flex flex-shrink-0 items-center">
              <svg
                class="h-8 w-8 text-blue-600 dark:text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
              <span class="ml-2 text-xl font-bold text-gray-900 dark:text-white">Claude Relay</span>
            </div>
            <div class="ml-10">
              <div class="flex items-baseline space-x-4">
                <button
                  :class="[
                    'rounded-md px-3 py-2 text-sm font-medium',
                    activeTab === 'overview'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  ]"
                  @click="handleTabChange('overview')"
                >
                  Overview
                </button>
                <button
                  :class="[
                    'rounded-md px-3 py-2 text-sm font-medium',
                    activeTab === 'api-keys'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  ]"
                  @click="handleTabChange('api-keys')"
                >
                  API Keys
                </button>
                <button
                  :class="[
                    'rounded-md px-3 py-2 text-sm font-medium',
                    activeTab === 'usage'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  ]"
                  @click="handleTabChange('usage')"
                >
                  Usage Stats
                </button>
                <button
                  :class="[
                    'rounded-md px-3 py-2 text-sm font-medium',
                    activeTab === 'tutorial'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  ]"
                  @click="handleTabChange('tutorial')"
                >
                  Tutorial
                </button>
              </div>
            </div>
          </div>
          <div class="flex items-center space-x-4">
            <div class="text-sm text-gray-700 dark:text-gray-300">
              Welcome, <span class="font-medium">{{ userStore.userName }}</span>
            </div>

            <!-- 主题切换按钮 -->
            <ThemeToggle mode="icon" />

            <button
              class="rounded-md px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              @click="handleLogout"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>

    <!-- 主内容 -->
    <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <!-- Overview Tab -->
      <div v-if="activeTab === 'overview'" class="space-y-6">
        <div>
          <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Dashboard Overview</h1>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Welcome to your Claude Relay dashboard
          </p>
        </div>

        <!-- Stats Cards -->
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
          <div class="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
            <div class="p-5">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <svg
                    class="h-6 w-6 text-green-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M15 7a2 2 0 012 2m0 0a2 2 0 012 2m-2-2h-6m6 0v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9a2 2 0 012-2h6z"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                    />
                  </svg>
                </div>
                <div class="ml-5 w-0 flex-1">
                  <dl>
                    <dt class="truncate text-sm font-medium text-gray-500 dark:text-gray-400">
                      Active API Keys
                    </dt>
                    <dd class="text-lg font-medium text-gray-900 dark:text-white">
                      {{ apiKeysStats.active }}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div class="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
            <div class="p-5">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <svg
                    class="h-6 w-6 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                    />
                  </svg>
                </div>
                <div class="ml-5 w-0 flex-1">
                  <dl>
                    <dt class="truncate text-sm font-medium text-gray-500 dark:text-gray-400">
                      Deleted API Keys
                    </dt>
                    <dd class="text-lg font-medium text-gray-900 dark:text-white">
                      {{ apiKeysStats.deleted }}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div class="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
            <div class="p-5">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <svg
                    class="h-6 w-6 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                    />
                  </svg>
                </div>
                <div class="ml-5 w-0 flex-1">
                  <dl>
                    <dt class="truncate text-sm font-medium text-gray-500 dark:text-gray-400">
                      Total Requests
                    </dt>
                    <dd class="text-lg font-medium text-gray-900 dark:text-white">
                      {{ formatNumber(userProfile?.totalUsage?.requests || 0) }}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div class="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
            <div class="p-5">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <svg
                    class="h-6 w-6 text-purple-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                    />
                  </svg>
                </div>
                <div class="ml-5 w-0 flex-1">
                  <dl>
                    <dt class="truncate text-sm font-medium text-gray-500 dark:text-gray-400">
                      Input Tokens
                    </dt>
                    <dd class="text-lg font-medium text-gray-900 dark:text-white">
                      {{ formatNumber(userProfile?.totalUsage?.inputTokens || 0) }}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div class="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
            <div class="p-5">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <svg
                    class="h-6 w-6 text-yellow-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                    />
                  </svg>
                </div>
                <div class="ml-5 w-0 flex-1">
                  <dl>
                    <dt class="truncate text-sm font-medium text-gray-500 dark:text-gray-400">
                      Total Cost
                    </dt>
                    <dd class="text-lg font-medium text-gray-900 dark:text-white">
                      ${{ (userProfile?.totalUsage?.totalCost || 0).toFixed(4) }}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- User Info -->
        <div class="rounded-lg bg-white shadow dark:bg-gray-800">
          <div class="px-4 py-5 sm:p-6">
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
              Account Information
            </h3>
            <div class="mt-5 border-t border-gray-200 dark:border-gray-700">
              <dl class="divide-y divide-gray-200 dark:divide-gray-700">
                <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Username</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white sm:col-span-2 sm:mt-0">
                    {{ userProfile?.username }}
                  </dd>
                </div>
                <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Display Name</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white sm:col-span-2 sm:mt-0">
                    {{ userProfile?.displayName || 'N/A' }}
                  </dd>
                </div>
                <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white sm:col-span-2 sm:mt-0">
                    {{ userProfile?.email || 'N/A' }}
                  </dd>
                </div>
                <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Role</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white sm:col-span-2 sm:mt-0">
                    <span
                      class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    >
                      {{ userProfile?.role || 'user' }}
                    </span>
                  </dd>
                </div>
                <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Member Since</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white sm:col-span-2 sm:mt-0">
                    {{ formatDate(userProfile?.createdAt) }}
                  </dd>
                </div>
                <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Last Login</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white sm:col-span-2 sm:mt-0">
                    {{ formatDate(userProfile?.lastLoginAt) || 'N/A' }}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <!-- API Keys Tab -->
      <div v-else-if="activeTab === 'api-keys'">
        <UserApiKeysManager />
      </div>

      <!-- Usage Stats Tab -->
      <div v-else-if="activeTab === 'usage'">
        <UserUsageStats />
      </div>

      <!-- Tutorial Tab -->
      <div v-else-if="activeTab === 'tutorial'" class="space-y-6">
        <TutorialView />
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useThemeStore } from '@/stores/theme'
import { showToast } from '@/utils/toast'
import ThemeToggle from '@/components/common/ThemeToggle.vue'
import UserApiKeysManager from '@/components/user/UserApiKeysManager.vue'
import UserUsageStats from '@/components/user/UserUsageStats.vue'
import TutorialView from '@/views/TutorialView.vue'

const router = useRouter()
const userStore = useUserStore()
const themeStore = useThemeStore()

const activeTab = ref('overview')
const userProfile = ref(null)
const apiKeysStats = ref({ active: 0, deleted: 0 })

const formatNumber = (num) => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

const formatDate = (dateString) => {
  if (!dateString) return null
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const handleTabChange = (tab) => {
  activeTab.value = tab
  // Refresh API keys stats when switching to overview tab
  if (tab === 'overview') {
    loadApiKeysStats()
  }
}

const handleLogout = async () => {
  try {
    await userStore.logout()
    showToast('Logged out successfully', 'success')
    router.push('/user-login')
  } catch (error) {
    showToast('Logout failed', 'error')
  }
}

const loadUserProfile = async () => {
  try {
    userProfile.value = await userStore.getUserProfile()
  } catch (error) {
    console.error('Failed to load user profile:', error)
    showToast('Failed to load user profile', 'error')
  }
}

const loadApiKeysStats = async () => {
  try {
    const allApiKeys = await userStore.getUserApiKeys(true) // Include deleted keys
    console.log('All API Keys received:', allApiKeys)

    const activeKeys = allApiKeys.filter(
      (key) => !(key.isDeleted === 'true' || key.deletedAt) && key.isActive
    )
    const deletedKeys = allApiKeys.filter((key) => key.isDeleted === 'true' || key.deletedAt)

    console.log('Active keys:', activeKeys)
    console.log('Deleted keys:', deletedKeys)
    console.log('Active count:', activeKeys.length)
    console.log('Deleted count:', deletedKeys.length)

    apiKeysStats.value = { active: activeKeys.length, deleted: deletedKeys.length }
  } catch (error) {
    console.error('Failed to load API keys stats:', error)
    apiKeysStats.value = { active: 0, deleted: 0 }
  }
}

onMounted(() => {
  // 初始化主题
  themeStore.initTheme()
  loadUserProfile()
  loadApiKeysStats()
})
</script>

<style scoped>
/* 组件特定样式 */
</style>
