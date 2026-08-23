import { defineStore } from 'pinia'

import { createHttp } from '@/utils/http'
import { showToast, APP_CONFIG } from '@/utils/tools'

// 清除前台用户的本地存储
const clearUserStorage = () => {
  localStorage.removeItem('userToken')
  localStorage.removeItem('userData')
  localStorage.removeItem('userConfig')
}

// 前台用户专用 fetch 客户端: 注入 x-user-token，非 2xx 抛错（携带 status/data）
const userHttp = createHttp({
  baseURL: `${APP_CONFIG.apiPrefix}/users`,
  onRequest: (_config, init) => {
    const token = localStorage.getItem('userToken')
    if (token) init.headers['x-user-token'] = token
  },
  onResponse: (res, json) => {
    // 网络异常 / 超时 / 取消
    if (!res) throw Object.assign(new Error(json.message || '请求失败'), { status: json.status })
    // 全局: 账户被禁用时清理并跳转登录页
    if (res.status === 403) {
      const message = json?.message
      if (message && (message.includes('disabled') || message.includes('Account disabled'))) {
        clearUserStorage()
        showToast(message, 'error')
        // 跳转地址需带上 SPA 的 basePath（生产为 /web/admin/），否则会打到站点根
        const userLoginPath = APP_CONFIG.basePath.replace(/\/$/, '') + '/user-login'
        if (window.location.pathname !== userLoginPath) {
          window.location.href = userLoginPath
        }
      }
    }
    if (!res.ok) {
      throw Object.assign(new Error(json?.message || `HTTP ${res.status}`), {
        status: res.status,
        data: json
      })
    }
    return json
  }
})

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null,
    isAuthenticated: false,
    sessionToken: null,
    loading: false,
    config: null
  }),

  getters: {
    isLoggedIn: (state) => state.isAuthenticated && state.user,
    userName: (state) => state.user?.displayName || state.user?.username,
    userRole: (state) => state.user?.role
  },

  actions: {
    // 🔐 用户登录
    async login(credentials) {
      this.loading = true
      try {
        const body = await userHttp({ url: '/login', method: 'POST', data: credentials })

        if (body.success) {
          this.user = body.user
          this.sessionToken = body.sessionToken
          this.isAuthenticated = true

          // 保存到 localStorage（后续请求由 userHttp 自动注入 token）
          localStorage.setItem('userToken', this.sessionToken)
          localStorage.setItem('userData', JSON.stringify(this.user))

          return body
        } else {
          throw new Error(body.message || 'Login failed')
        }
      } catch (error) {
        this.clearAuth()
        throw error
      } finally {
        this.loading = false
      }
    },

    // 🚪 用户登出
    async logout() {
      try {
        if (this.sessionToken) {
          await userHttp({ url: '/logout', method: 'POST', data: {} })
        }
      } catch (error) {
        console.error('Logout request failed:', error)
      } finally {
        this.clearAuth()
      }
    },

    // 🔄 检查认证状态
    async checkAuth() {
      const token = localStorage.getItem('userToken')
      const userData = localStorage.getItem('userData')
      const userConfig = localStorage.getItem('userConfig')

      if (!token || !userData) {
        this.clearAuth()
        return false
      }

      try {
        this.sessionToken = token
        this.user = JSON.parse(userData)
        this.config = userConfig ? JSON.parse(userConfig) : null
        this.isAuthenticated = true

        // 验证 token 是否仍然有效
        await this.getUserProfile()
        return true
      } catch (error) {
        console.error('Auth check failed:', error)
        this.clearAuth()
        return false
      }
    },

    // 👤 获取用户资料
    async getUserProfile() {
      try {
        const body = await userHttp({ url: '/profile', method: 'GET' })

        if (body.success) {
          this.user = body.user
          this.config = body.config
          localStorage.setItem('userData', JSON.stringify(this.user))
          localStorage.setItem('userConfig', JSON.stringify(this.config))
          return body.user
        }
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          // 401: 会话无效/过期, 403: 账户被禁用
          this.clearAuth()
          if (error.status === 403) {
            throw new Error(error.data?.message || 'Your account has been disabled')
          }
        }
        throw error
      }
    },

    // 🔑 获取用户API Keys
    async getUserApiKeys(includeDeleted = false) {
      try {
        const params = includeDeleted ? { includeDeleted: 'true' } : undefined
        const body = await userHttp({ url: '/api-keys', method: 'GET', params })
        return body.success ? body.apiKeys : []
      } catch (error) {
        console.error('Failed to fetch API keys:', error)
        throw error
      }
    },

    // 🔑 创建API Key
    async createApiKey(keyData) {
      try {
        return await userHttp({ url: '/api-keys', method: 'POST', data: keyData })
      } catch (error) {
        console.error('Failed to create API key:', error)
        throw error
      }
    },

    // 🗑️ 删除API Key
    async deleteApiKey(keyId) {
      try {
        return await userHttp({ url: `/api-keys/${keyId}`, method: 'DELETE' })
      } catch (error) {
        console.error('Failed to delete API key:', error)
        throw error
      }
    },

    // 📊 获取使用统计
    async getUserUsageStats(params = {}) {
      try {
        const body = await userHttp({ url: '/usage-stats', method: 'GET', params })
        return body.success ? body.stats : null
      } catch (error) {
        console.error('Failed to fetch usage stats:', error)
        throw error
      }
    },

    // 🧹 清除认证信息
    clearAuth() {
      this.user = null
      this.sessionToken = null
      this.isAuthenticated = false
      this.config = null

      clearUserStorage()
    }
  }
})
