import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import router from '@/router'

import { loginApi, getAuthUserApi, getOemSettingsApi } from '@/utils/http_apis'

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
        loginError.value = result.message || '登录失败'
      }
    } catch (error) {
      loginError.value = error.message || '登录失败，请检查用户名和密码'
    } finally {
      loginLoading.value = false
    }
  }

  function logout() {
    isLoggedIn.value = false
    authToken.value = ''
    username.value = ''
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

  // 把 OEM 数据应用到状态/页头/标题/favicon；保存成功后可用 PUT 返回的归一化数据直接同步，无需二次 GET（也就没有 GET 失败却提示成功的窗口）
  function applyOemSettings(data) {
    if (!data) {
      return
    }
    oemSettings.value = { ...oemSettings.value, ...data }

    // 图标字段存在才处理：有值则创建/更新 favicon；被清空（重置/删除图标）则移除动态 link，回退浏览器默认（项目无默认 favicon 文件）
    if ('siteIcon' in data || 'siteIconData' in data) {
      const iconHref = data.siteIconData || data.siteIcon
      const existing = document.querySelector("link[rel*='icon']")
      if (iconHref) {
        const link = existing || document.createElement('link')
        link.type = 'image/x-icon'
        link.rel = 'shortcut icon'
        link.href = iconHref
        if (!existing) {
          document.getElementsByTagName('head')[0].appendChild(link)
        }
      } else if (existing) {
        existing.remove()
      }
    }

    if (data.siteName) {
      document.title = `${data.siteName} - 管理后台`
    }
  }

  async function loadOemSettings() {
    oemLoading.value = true
    try {
      const result = await getOemSettingsApi()
      if (result.success && result.data) {
        applyOemSettings(result.data)
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
    loadOemSettings,
    applyOemSettings
  }
})
