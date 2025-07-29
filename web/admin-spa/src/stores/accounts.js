import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiClient } from '@/config/api'

export const useAccountsStore = defineStore('accounts', () => {
  // 状态
  const claudeAccounts = ref([])
  const geminiAccounts = ref([])
  const loading = ref(false)
  const error = ref(null)
  const sortBy = ref('')
  const sortOrder = ref('asc')
  
  // Actions
  
  // 获取Claude账户列表
  const fetchClaudeAccounts = async () => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.get('/admin/claude-accounts')
      if (response.success) {
        claudeAccounts.value = response.data || []
      } else {
        throw new Error(response.message || '获取Claude账户失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }
  
  // 获取Gemini账户列表
  const fetchGeminiAccounts = async () => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.get('/admin/gemini-accounts')
      if (response.success) {
        geminiAccounts.value = response.data || []
      } else {
        throw new Error(response.message || '获取Gemini账户失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }
  
  // 获取所有账户
  const fetchAllAccounts = async () => {
    loading.value = true
    error.value = null
    try {
      await Promise.all([
        fetchClaudeAccounts(),
        fetchGeminiAccounts()
      ])
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }
  
  // 创建Claude账户
  const createClaudeAccount = async (data) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.post('/admin/claude-accounts', data)
      if (response.success) {
        await fetchClaudeAccounts()
        return response.data
      } else {
        throw new Error(response.message || '创建Claude账户失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }
  
  // 创建Gemini账户
  const createGeminiAccount = async (data) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.post('/admin/gemini-accounts', data)
      if (response.success) {
        await fetchGeminiAccounts()
        return response.data
      } else {
        throw new Error(response.message || '创建Gemini账户失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }
  
  // 更新Claude账户
  const updateClaudeAccount = async (id, data) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.put(`/admin/claude-accounts/${id}`, data)
      if (response.success) {
        await fetchClaudeAccounts()
        return response
      } else {
        throw new Error(response.message || '更新Claude账户失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }
  
  // 更新Gemini账户
  const updateGeminiAccount = async (id, data) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.put(`/admin/gemini-accounts/${id}`, data)
      if (response.success) {
        await fetchGeminiAccounts()
        return response
      } else {
        throw new Error(response.message || '更新Gemini账户失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }
  
  // 切换账户状态
  const toggleAccount = async (platform, id) => {
    loading.value = true
    error.value = null
    try {
      const endpoint = platform === 'claude' 
        ? `/admin/claude-accounts/${id}/toggle`
        : `/admin/gemini-accounts/${id}/toggle`
      
      const response = await apiClient.put(endpoint)
      if (response.success) {
        if (platform === 'claude') {
          await fetchClaudeAccounts()
        } else {
          await fetchGeminiAccounts()
        }
        return response
      } else {
        throw new Error(response.message || '切换状态失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }
  
  // 删除账户
  const deleteAccount = async (platform, id) => {
    loading.value = true
    error.value = null
    try {
      const endpoint = platform === 'claude' 
        ? `/admin/claude-accounts/${id}`
        : `/admin/gemini-accounts/${id}`
      
      const response = await apiClient.delete(endpoint)
      if (response.success) {
        if (platform === 'claude') {
          await fetchClaudeAccounts()
        } else {
          await fetchGeminiAccounts()
        }
        return response
      } else {
        throw new Error(response.message || '删除失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }
  
  // 刷新Claude Token
  const refreshClaudeToken = async (id) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.post(`/admin/claude-accounts/${id}/refresh`)
      if (response.success) {
        await fetchClaudeAccounts()
        return response
      } else {
        throw new Error(response.message || 'Token刷新失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }
  
  // 生成Claude OAuth URL
  const generateClaudeAuthUrl = async (proxyConfig) => {
    try {
      const response = await apiClient.post('/admin/claude-accounts/generate-auth-url', proxyConfig)
      if (response.success) {
        return response.data // 返回整个对象，包含authUrl和sessionId
      } else {
        throw new Error(response.message || '生成授权URL失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    }
  }
  
  // 交换Claude OAuth Code
  const exchangeClaudeCode = async (data) => {
    try {
      const response = await apiClient.post('/admin/claude-accounts/exchange-code', data)
      if (response.success) {
        return response.data
      } else {
        throw new Error(response.message || '交换授权码失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    }
  }
  
  // 生成Gemini OAuth URL
  const generateGeminiAuthUrl = async (proxyConfig) => {
    try {
      const response = await apiClient.post('/admin/gemini-accounts/generate-auth-url', proxyConfig)
      if (response.success) {
        return response.data // 返回整个对象，包含authUrl和sessionId
      } else {
        throw new Error(response.message || '生成授权URL失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    }
  }
  
  // 交换Gemini OAuth Code
  const exchangeGeminiCode = async (data) => {
    try {
      const response = await apiClient.post('/admin/gemini-accounts/exchange-code', data)
      if (response.success) {
        return response.data
      } else {
        throw new Error(response.message || '交换授权码失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    }
  }
  
  // 排序账户
  const sortAccounts = (field) => {
    if (sortBy.value === field) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortBy.value = field
      sortOrder.value = 'asc'
    }
  }
  
  // 重置store
  const reset = () => {
    claudeAccounts.value = []
    geminiAccounts.value = []
    loading.value = false
    error.value = null
    sortBy.value = ''
    sortOrder.value = 'asc'
  }
  
  return {
    // State
    claudeAccounts,
    geminiAccounts,
    loading,
    error,
    sortBy,
    sortOrder,
    
    // Actions
    fetchClaudeAccounts,
    fetchGeminiAccounts,
    fetchAllAccounts,
    createClaudeAccount,
    createGeminiAccount,
    updateClaudeAccount,
    updateGeminiAccount,
    toggleAccount,
    deleteAccount,
    refreshClaudeToken,
    generateClaudeAuthUrl,
    exchangeClaudeCode,
    generateGeminiAuthUrl,
    exchangeGeminiCode,
    sortAccounts,
    reset
  }
})