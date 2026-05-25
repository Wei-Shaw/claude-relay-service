import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import router from '@/router'

import {
  loginApi,
  verifyAdminTwoFactorApi,
  getAuthUserApi,
  getOemSettingsApi
} from '@/utils/http_apis'

export const useAuthStore = defineStore('auth', () => {
  // 状态
  const isLoggedIn = ref(false)
  const authToken = ref(localStorage.getItem('authToken') || '')
  const username = ref('')
  const loginError = ref('')
  const loginLoading = ref(false)
  const pendingTwoFactor = ref(null)
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
    pendingTwoFactor.value = null

    try {
      const result = await loginApi(credentials)

      if (result.success && result.requiresTwoFactor) {
        authToken.value = ''
        isLoggedIn.value = false
        pendingTwoFactor.value = {
          username: credentials.username,
          pendingLoginToken: result.pendingLoginToken,
          pendingLoginExpiresIn: result.pendingLoginExpiresIn,
          canUseRecoveryCode: !!result.canUseRecoveryCode
        }
        return result
      }

      if (result.success) {
        authToken.value = result.token
        username.value = result.username || credentials.username
        isLoggedIn.value = true
        pendingTwoFactor.value = null
        localStorage.setItem('authToken', result.token)

        await router.push('/dashboard')
        return result
      } else {
        loginError.value = result.message || '登录失败'
        return result
      }
    } catch (error) {
      loginError.value = error.message || '登录失败，请检查用户名和密码'
      throw error
    } finally {
      loginLoading.value = false
    }
  }

  async function verifyTwoFactor(payload) {
    if (!pendingTwoFactor.value?.pendingLoginToken) {
      loginError.value = '二次验证已过期，请重新登录'
      return { success: false, message: loginError.value }
    }

    loginLoading.value = true
    loginError.value = ''

    try {
      const result = await verifyAdminTwoFactorApi({
        pendingLoginToken: pendingTwoFactor.value.pendingLoginToken,
        ...payload
      })

      if (result.success) {
        authToken.value = result.token
        username.value = result.username || pendingTwoFactor.value.username
        isLoggedIn.value = true
        localStorage.setItem('authToken', result.token)
        pendingTwoFactor.value = null
        await router.push('/dashboard')
      } else {
        loginError.value = result.message || '二次验证失败'
      }

      return result
    } catch (error) {
      loginError.value = error.message || '二次验证失败'
      throw error
    } finally {
      loginLoading.value = false
    }
  }

  function cancelTwoFactorLogin() {
    pendingTwoFactor.value = null
    loginError.value = ''
  }

  function logout() {
    isLoggedIn.value = false
    authToken.value = ''
    username.value = ''
    pendingTwoFactor.value = null
    localStorage.removeItem('authToken')
    router.push('/login')
  }

  function checkAuth() {
    if (authToken.value) {
      isLoggedIn.value = true
      // 验证token有效性
      verifyToken()
    }
  }

  async function verifyToken() {
    try {
      const userResult = await getAuthUserApi()
      if (!userResult.success || !userResult.user) {
        logout()
        return
      }
      username.value = userResult.user.username
    } catch (error) {
      logout()
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
          document.title = `${result.data.siteName} - 管理后台`
        }
      }
    } catch (error) {
      console.error('加载OEM设置失败:', error)
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
    pendingTwoFactor,
    oemSettings,
    oemLoading,

    // 计算属性
    isAuthenticated,
    token,
    user,

    // 方法
    login,
    verifyTwoFactor,
    cancelTwoFactorLogin,
    logout,
    checkAuth,
    loadOemSettings
  }
})
