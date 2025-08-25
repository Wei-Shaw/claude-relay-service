import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiClient } from '@/config/api'

export const useAccountsStore = defineStore('accounts', () => {
  // 状态
  const claudeAccounts = ref([])
  const claudeConsoleAccounts = ref([])
  const bedrockAccounts = ref([])
  const geminiAccounts = ref([])
  const openaiAccounts = ref([])
  const azureOpenaiAccounts = ref([])
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

  // 获取Claude Console账户列表
  const fetchClaudeConsoleAccounts = async () => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.get('/admin/claude-console-accounts')
      if (response.success) {
        claudeConsoleAccounts.value = response.data || []
      } else {
        throw new Error(response.message || '获取Claude Console账户失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  // 获取Bedrock账户列表
  const fetchBedrockAccounts = async () => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.get('/admin/bedrock-accounts')
      if (response.success) {
        bedrockAccounts.value = response.data || []
      } else {
        throw new Error(response.message || '获取Bedrock账户失败')
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

  // 获取OpenAI账户列表
  const fetchOpenAIAccounts = async () => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.get('/admin/openai-accounts')
      if (response.success) {
        openaiAccounts.value = response.data || []
      } else {
        throw new Error(response.message || '获取OpenAI账户失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  // 获取Azure OpenAI账户列表
  const fetchAzureOpenAIAccounts = async () => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.get('/admin/azure-openai-accounts')
      if (response.success) {
        azureOpenaiAccounts.value = response.data || []
      } else {
        throw new Error(response.message || '获取Azure OpenAI账户失败')
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
        fetchClaudeConsoleAccounts(),
        fetchBedrockAccounts(),
        fetchGeminiAccounts(),
        fetchOpenAIAccounts(),
        fetchAzureOpenAIAccounts()
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

  // 创建Claude Console账户
  const createClaudeConsoleAccount = async (data) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.post('/admin/claude-console-accounts', data)
      if (response.success) {
        await fetchClaudeConsoleAccounts()
        return response.data
      } else {
        throw new Error(response.message || '创建Claude Console账户失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  // 创建Bedrock账户
  const createBedrockAccount = async (data) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.post('/admin/bedrock-accounts', data)
      if (response.success) {
        await fetchBedrockAccounts()
        return response.data
      } else {
        throw new Error(response.message || '创建Bedrock账户失败')
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

  // 创建OpenAI账户
  const createOpenAIAccount = async (data) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.post('/admin/openai-accounts', data)
      if (response.success) {
        await fetchOpenAIAccounts()
        return response.data
      } else {
        throw new Error(response.message || '创建OpenAI账户失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  // 创建Azure OpenAI账户
  const createAzureOpenAIAccount = async (data) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.post('/admin/azure-openai-accounts', data)
      if (response.success) {
        await fetchAzureOpenAIAccounts()
        return response.data
      } else {
        throw new Error(response.message || '创建Azure OpenAI账户失败')
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

  // 更新Claude Console账户
  const updateClaudeConsoleAccount = async (id, data) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.put(`/admin/claude-console-accounts/${id}`, data)
      if (response.success) {
        await fetchClaudeConsoleAccounts()
        return response
      } else {
        throw new Error(response.message || '更新Claude Console账户失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  // 更新Bedrock账户
  const updateBedrockAccount = async (id, data) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.put(`/admin/bedrock-accounts/${id}`, data)
      if (response.success) {
        await fetchBedrockAccounts()
        return response
      } else {
        throw new Error(response.message || '更新Bedrock账户失败')
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

  // 更新OpenAI账户
  const updateOpenAIAccount = async (id, data) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.put(`/admin/openai-accounts/${id}`, data)
      if (response.success) {
        await fetchOpenAIAccounts()
        return response
      } else {
        throw new Error(response.message || '更新OpenAI账户失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  // 更新Azure OpenAI账户
  const updateAzureOpenAIAccount = async (id, data) => {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient.put(`/admin/azure-openai-accounts/${id}`, data)
      if (response.success) {
        await fetchAzureOpenAIAccounts()
        return response
      } else {
        throw new Error(response.message || '更新Azure OpenAI账户失败')
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
      let endpoint
      if (platform === 'claude') {
        endpoint = `/admin/claude-accounts/${id}/toggle`
      } else if (platform === 'claude-console') {
        endpoint = `/admin/claude-console-accounts/${id}/toggle`
      } else if (platform === 'bedrock') {
        endpoint = `/admin/bedrock-accounts/${id}/toggle`
      } else if (platform === 'gemini') {
        endpoint = `/admin/gemini-accounts/${id}/toggle`
      } else if (platform === 'openai') {
        endpoint = `/admin/openai-accounts/${id}/toggle`
      } else if (platform === 'azure_openai') {
        endpoint = `/admin/azure-openai-accounts/${id}/toggle`
      } else {
        endpoint = `/admin/openai-accounts/${id}/toggle`
      }

      const response = await apiClient.put(endpoint)
      if (response.success) {
        if (platform === 'claude') {
          await fetchClaudeAccounts()
        } else if (platform === 'claude-console') {
          await fetchClaudeConsoleAccounts()
        } else if (platform === 'bedrock') {
          await fetchBedrockAccounts()
        } else if (platform === 'gemini') {
          await fetchGeminiAccounts()
        } else if (platform === 'openai') {
          await fetchOpenAIAccounts()
        } else if (platform === 'azure_openai') {
          await fetchAzureOpenAIAccounts()
        } else {
          await fetchOpenAIAccounts()
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
      let endpoint
      if (platform === 'claude') {
        endpoint = `/admin/claude-accounts/${id}`
      } else if (platform === 'claude-console') {
        endpoint = `/admin/claude-console-accounts/${id}`
      } else if (platform === 'bedrock') {
        endpoint = `/admin/bedrock-accounts/${id}`
      } else if (platform === 'gemini') {
        endpoint = `/admin/gemini-accounts/${id}`
      } else if (platform === 'openai') {
        endpoint = `/admin/openai-accounts/${id}`
      } else if (platform === 'azure_openai') {
        endpoint = `/admin/azure-openai-accounts/${id}`
      } else {
        endpoint = `/admin/openai-accounts/${id}`
      }

      const response = await apiClient.delete(endpoint)
      if (response.success) {
        if (platform === 'claude') {
          await fetchClaudeAccounts()
        } else if (platform === 'claude-console') {
          await fetchClaudeConsoleAccounts()
        } else if (platform === 'bedrock') {
          await fetchBedrockAccounts()
        } else if (platform === 'gemini') {
          await fetchGeminiAccounts()
        } else if (platform === 'openai') {
          await fetchOpenAIAccounts()
        } else if (platform === 'azure_openai') {
          await fetchAzureOpenAIAccounts()
        } else {
          await fetchOpenAIAccounts()
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

  // 生成Claude Setup Token URL
  const generateClaudeSetupTokenUrl = async (proxyConfig) => {
    try {
      const response = await apiClient.post(
        '/admin/claude-accounts/generate-setup-token-url',
        proxyConfig
      )
      if (response.success) {
        return response.data // 返回整个对象，包含authUrl和sessionId
      } else {
        throw new Error(response.message || '生成Setup Token URL失败')
      }
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  // 交换Claude Setup Token Code
  const exchangeClaudeSetupTokenCode = async (data) => {
    try {
      const response = await apiClient.post(
        '/admin/claude-accounts/exchange-setup-token-code',
        data
      )
      if (response.success) {
        return response.data
      } else {
        throw new Error(response.message || '交换Setup Token授权码失败')
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

  // 生成OpenAI OAuth URL
  const generateOpenAIAuthUrl = async (proxyConfig) => {
    try {
      const response = await apiClient.post('/admin/openai-accounts/generate-auth-url', proxyConfig)
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

  // 交换OpenAI OAuth Code
  const exchangeOpenAICode = async (data) => {
    try {
      const response = await apiClient.post('/admin/openai-accounts/exchange-code', data)
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
    claudeConsoleAccounts.value = []
    bedrockAccounts.value = []
    geminiAccounts.value = []
    openaiAccounts.value = []
    azureOpenaiAccounts.value = []
    loading.value = false
    error.value = null
    sortBy.value = ''
    sortOrder.value = 'asc'
  }

  return {
    // State
    claudeAccounts,
    claudeConsoleAccounts,
    bedrockAccounts,
    geminiAccounts,
    openaiAccounts,
    azureOpenaiAccounts,
    loading,
    error,
    sortBy,
    sortOrder,

    // Actions
    fetchClaudeAccounts,
    fetchClaudeConsoleAccounts,
    fetchBedrockAccounts,
    fetchGeminiAccounts,
    fetchOpenAIAccounts,
    fetchAzureOpenAIAccounts,
    fetchAllAccounts,
    createClaudeAccount,
    createClaudeConsoleAccount,
    createBedrockAccount,
    createGeminiAccount,
    createOpenAIAccount,
    createAzureOpenAIAccount,
    updateClaudeAccount,
    updateClaudeConsoleAccount,
    updateBedrockAccount,
    updateGeminiAccount,
    updateOpenAIAccount,
    updateAzureOpenAIAccount,
    toggleAccount,
    deleteAccount,
    refreshClaudeToken,
    generateClaudeAuthUrl,
    exchangeClaudeCode,
    generateClaudeSetupTokenUrl,
    exchangeClaudeSetupTokenCode,
    generateGeminiAuthUrl,
    exchangeGeminiCode,
    generateOpenAIAuthUrl,
    exchangeOpenAICode,
    sortAccounts,
    reset
  }
})
