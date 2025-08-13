import { defineStore } from 'pinia'
import axios from 'axios'

const API_BASE = '/users'

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null,
    isAuthenticated: false,
    sessionToken: null,
    loading: false
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
        const response = await axios.post(`${API_BASE}/login`, credentials)

        if (response.data.success) {
          this.user = response.data.user
          this.sessionToken = response.data.sessionToken
          this.isAuthenticated = true

          // 保存到 localStorage
          localStorage.setItem('userToken', this.sessionToken)
          localStorage.setItem('userData', JSON.stringify(this.user))

          // 设置 axios 默认头部
          this.setAuthHeader()

          return response.data
        } else {
          throw new Error(response.data.message || 'Login failed')
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
          await axios.post(
            `${API_BASE}/logout`,
            {},
            {
              headers: { 'x-user-token': this.sessionToken }
            }
          )
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

      if (!token || !userData) {
        this.clearAuth()
        return false
      }

      try {
        this.sessionToken = token
        this.user = JSON.parse(userData)
        this.isAuthenticated = true
        this.setAuthHeader()

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
        const response = await axios.get(`${API_BASE}/profile`)

        if (response.data.success) {
          this.user = response.data.user
          localStorage.setItem('userData', JSON.stringify(this.user))
          return response.data.user
        }
      } catch (error) {
        if (error.response?.status === 401) {
          this.clearAuth()
        }
        throw error
      }
    },

    // 🔑 获取用户API Keys
    async getUserApiKeys() {
      try {
        const response = await axios.get(`${API_BASE}/api-keys`)
        return response.data.success ? response.data.apiKeys : []
      } catch (error) {
        console.error('Failed to fetch API keys:', error)
        throw error
      }
    },

    // 🔑 创建API Key
    async createApiKey(keyData) {
      try {
        const response = await axios.post(`${API_BASE}/api-keys`, keyData)
        return response.data
      } catch (error) {
        console.error('Failed to create API key:', error)
        throw error
      }
    },

    // 🔄 重新生成API Key
    async regenerateApiKey(keyId) {
      try {
        const response = await axios.post(`${API_BASE}/api-keys/${keyId}/regenerate`)
        return response.data
      } catch (error) {
        console.error('Failed to regenerate API key:', error)
        throw error
      }
    },

    // 🗑️ 删除API Key
    async deleteApiKey(keyId) {
      try {
        const response = await axios.delete(`${API_BASE}/api-keys/${keyId}`)
        return response.data
      } catch (error) {
        console.error('Failed to delete API key:', error)
        throw error
      }
    },

    // 📊 获取使用统计
    async getUserUsageStats(params = {}) {
      try {
        const response = await axios.get(`${API_BASE}/usage-stats`, { params })
        return response.data.success ? response.data.stats : null
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

      localStorage.removeItem('userToken')
      localStorage.removeItem('userData')

      // 清除 axios 默认头部
      delete axios.defaults.headers.common['x-user-token']
    },

    // 🔧 设置认证头部
    setAuthHeader() {
      if (this.sessionToken) {
        axios.defaults.headers.common['x-user-token'] = this.sessionToken
      }
    }
  }
})
