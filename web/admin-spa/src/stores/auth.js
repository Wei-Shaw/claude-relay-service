import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import router from '@/router'

import { loginApi, getAuthUserApi, getOemSettingsApi } from '@/utils/http_apis'

const DEFAULT_CODEX_TUTORIAL_MODEL = 'gpt-5.5'

export const useAuthStore = defineStore('auth', () => {
  // 状态
  const isLoggedIn = ref(false)
  const authToken = ref(localStorage.getItem('authToken') || '')
  const username = ref('')
  const loginError = ref('')
  const loginLoading = ref(false)
  /** 首次本地结论或服务端校验是否完成 */
  const authReady = ref(false)
  const oemSettings = ref({
    siteName: 'Claude Relay Service',
    siteIcon: '',
    siteIconData: '',
    faviconData: '',
    codexTutorialModel: DEFAULT_CODEX_TUTORIAL_MODEL,
    userSystemEnabled: false
  })
  const oemLoading = ref(true)

  // 仅合并首次并发校验；不导出
  let authCheckPromise = null

  // 计算属性
  const isAuthenticated = computed(() => !!authToken.value && isLoggedIn.value)
  const token = computed(() => authToken.value)
  const user = computed(() => ({ username: username.value }))

  /** 私有：清本地态，不跳转 */
  function clearAuthLocal() {
    isLoggedIn.value = false
    authToken.value = ''
    username.value = ''
    localStorage.removeItem('authToken')
  }

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
        authReady.value = true
        localStorage.setItem('authToken', result.token)

        await router.push('/dashboard')
      } else {
        loginError.value = result.message || '登录失败'
      }
    } catch (error) {
      loginError.value = error.message || '登录失败，请检查用户名和密码'
    } finally {
      loginLoading.value = false
    }
  }

  function logout() {
    clearAuthLocal()
    authReady.value = true
    router.push('/login')
  }

  /**
   * 管理员启动鉴权。始终返回 Promise<boolean>。
   * - authReady 时快速返回，不重复请求 /web/auth/user
   * - 启动校验使用 skipAuthRedirect，由本 store 清态、路由守卫导航
   */
  async function checkAuth() {
    if (authReady.value) {
      return isAuthenticated.value
    }

    if (authCheckPromise) {
      return authCheckPromise
    }

    if (!authToken.value) {
      isLoggedIn.value = false
      authReady.value = true
      return false
    }

    const tokenBeingChecked = authToken.value

    authCheckPromise = (async () => {
      try {
        const result = await getAuthUserApi({ skipAuthRedirect: true })

        // 防旧请求回写（logout / login 已改变 token）
        if (authToken.value !== tokenBeingChecked) {
          return isAuthenticated.value
        }

        if (result.success && result.user) {
          isLoggedIn.value = true
          username.value = result.user.username
          authReady.value = true
          return true
        }

        clearAuthLocal()
        authReady.value = true
        return false
      } catch {
        if (authToken.value !== tokenBeingChecked) {
          return isAuthenticated.value
        }
        clearAuthLocal()
        authReady.value = true
        return false
      }
    })()

    try {
      return await authCheckPromise
    } finally {
      authCheckPromise = null
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
    authReady,
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
