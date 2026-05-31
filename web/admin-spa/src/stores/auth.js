import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import router from '@/router'
import i18n from '@/i18n'

import { loginApi, logoutApi, getAuthUserApi, getOemSettingsApi } from '@/utils/http_apis'

export const useAuthStore = defineStore('auth', () => {
  // 状态
  const isLoggedIn = ref(false)
  const authToken = ref(localStorage.getItem('authToken') || '')
  const username = ref('')
  const loginError = ref('')
  const loginLoading = ref(false)
  const oemSettings = ref({
    siteName: 'Claude Relay Service',
    siteIcon: '',
    siteIconData: '',
    faviconData: ''
  })
  const oemLoading = ref(true)

  // 计算属性
  const isAuthenticated = computed(() => !!authToken.value && isLoggedIn.value)
  const token = computed(() => authToken.value)
  const user = computed(() => ({ username: username.value }))

  // 方法
  async function login(credentials) {
    loginLoading.value = true
    loginError.value = ''

    try {
      const result = await loginApi(credentials)

      if (result.success) {
        authToken.value = result.token
        username.value = result.username || credentials.username
        isLoggedIn.value = true
        localStorage.setItem('authToken', result.token)

        await router.push('/dashboard')
      } else {
        loginError.value = result.message || i18n.global.t('auth.loginFailed')
      }
    } catch (error) {
      loginError.value = error.message || i18n.global.t('auth.loginFailedCheck')
    } finally {
      loginLoading.value = false
    }
  }

  async function logout() {
    const tokenToInvalidate = authToken.value
    try {
      if (tokenToInvalidate) {
        await logoutApi()
      }
    } catch {
      // Backend session may already be gone; local logout must still complete.
    } finally {
      isLoggedIn.value = false
      authToken.value = ''
      username.value = ''
      localStorage.removeItem('authToken')
      router.push('/login')
    }
  }

  async function checkAuth() {
    if (!authToken.value) {
      isLoggedIn.value = false
      return false
    }

    isLoggedIn.value = true
    // 验证token有效性
    return verifyToken()
  }

  async function verifyToken() {
    try {
      const userResult = await getAuthUserApi()
      if (!userResult.success || !userResult.user) {
        await logout()
        return false
      }
      username.value = userResult.user.username
      return true
    } catch (error) {
      await logout()
      return false
    }
  }

  async function loadOemSettings() {
    oemLoading.value = true
    try {
      const result = await getOemSettingsApi()
      if (result.success && result.data) {
        oemSettings.value = { ...oemSettings.value, ...result.data }

        if (result.data.siteIconData || result.data.siteIcon) {
          const link = document.querySelector("link[rel*='icon']") || document.createElement('link')
          link.type = 'image/x-icon'
          link.rel = 'shortcut icon'
          link.href = result.data.siteIconData || result.data.siteIcon
          document.getElementsByTagName('head')[0].appendChild(link)
        }

        if (result.data.siteName) {
          document.title = `${result.data.siteName} - ${i18n.global.t('auth.adminPanel')}`
        }
      }
    } catch (error) {
      console.error('Failed to load OEM settings:', error)
    } finally {
      oemLoading.value = false
    }
  }

  return {
    // 状态
    isLoggedIn,
    authToken,
    username,
    loginError,
    loginLoading,
    oemSettings,
    oemLoading,

    // 计算属性
    isAuthenticated,
    token,
    user,

    // 方法
    login,
    logout,
    checkAuth,
    loadOemSettings
  }
})
