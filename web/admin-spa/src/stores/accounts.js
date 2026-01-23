import { defineStore } from 'pinia'
import { ref } from 'vue'

import * as httpApis from '@/utils/http_apis'

// 平台配置映射
const PLATFORM_CONFIG = {
  claude: { endpoint: 'claude-accounts', stateKey: 'claudeAccounts' },
  'claude-console': { endpoint: 'claude-console-accounts', stateKey: 'claudeConsoleAccounts' },
  bedrock: { endpoint: 'bedrock-accounts', stateKey: 'bedrockAccounts' },
  gemini: { endpoint: 'gemini-accounts', stateKey: 'geminiAccounts' },
  openai: { endpoint: 'openai-accounts', stateKey: 'openaiAccounts' },
  azure_openai: { endpoint: 'azure-openai-accounts', stateKey: 'azureOpenaiAccounts' },
  'openai-responses': {
    endpoint: 'openai-responses-accounts',
    stateKey: 'openaiResponsesAccounts'
  },
  droid: { endpoint: 'droid-accounts', stateKey: 'droidAccounts' }
}

export const useAccountsStore = defineStore('accounts', () => {
  const claudeAccounts = ref([])
  const claudeConsoleAccounts = ref([])
  const bedrockAccounts = ref([])
  const geminiAccounts = ref([])
  const openaiAccounts = ref([])
  const azureOpenaiAccounts = ref([])
  const openaiResponsesAccounts = ref([])
  const droidAccounts = ref([])
  const loading = ref(false)
  const error = ref(null)
  const sortBy = ref('')
  const sortOrder = ref('asc')

  // 状态映射
  const stateMap = {
    claudeAccounts,
    claudeConsoleAccounts,
    bedrockAccounts,
    geminiAccounts,
    openaiAccounts,
    azureOpenaiAccounts,
    openaiResponsesAccounts,
    droidAccounts
  }

  // 通用获取账户
  const fetchAccounts = async (apiFunc, stateRef) => {
    loading.value = true
    const res = await apiFunc()
    if (res.success) stateRef.value = res.data || []
    else error.value = res.message
    loading.value = false
  }

  // 通用创建/更新账户
  const mutateAccount = async (apiFunc, fetchFunc, ...args) => {
    loading.value = true
    const res = await apiFunc(...args)
    if (res.success) await fetchFunc()
    else error.value = res.message
    loading.value = false
    return res
  }

  // 获取各平台账户
  const fetchClaudeAccounts = () => fetchAccounts(httpApis.getClaudeAccountsApi, claudeAccounts)
  const fetchClaudeConsoleAccounts = () =>
    fetchAccounts(httpApis.getClaudeConsoleAccountsApi, claudeConsoleAccounts)
  const fetchBedrockAccounts = () => fetchAccounts(httpApis.getBedrockAccountsApi, bedrockAccounts)
  const fetchGeminiAccounts = () => fetchAccounts(httpApis.getGeminiAccountsApi, geminiAccounts)
  const fetchOpenAIAccounts = () => fetchAccounts(httpApis.getOpenAIAccountsApi, openaiAccounts)
  const fetchAzureOpenAIAccounts = () =>
    fetchAccounts(httpApis.getAzureOpenAIAccountsApi, azureOpenaiAccounts)
  const fetchOpenAIResponsesAccounts = () =>
    fetchAccounts(httpApis.getOpenAIResponsesAccountsApi, openaiResponsesAccounts)
  const fetchDroidAccounts = () => fetchAccounts(httpApis.getDroidAccountsApi, droidAccounts)

  const fetchAllAccounts = async () => {
    loading.value = true
    await Promise.all([
      fetchClaudeAccounts(),
      fetchClaudeConsoleAccounts(),
      fetchBedrockAccounts(),
      fetchGeminiAccounts(),
      fetchOpenAIAccounts(),
      fetchAzureOpenAIAccounts(),
      fetchOpenAIResponsesAccounts(),
      fetchDroidAccounts()
    ])
    loading.value = false
  }

  // 创建账户
  const createClaudeAccount = (data) =>
    mutateAccount(httpApis.createClaudeAccountApi, fetchClaudeAccounts, data)
  const createClaudeConsoleAccount = (data) =>
    mutateAccount(httpApis.createClaudeConsoleAccountApi, fetchClaudeConsoleAccounts, data)
  const createBedrockAccount = (data) =>
    mutateAccount(httpApis.createBedrockAccountApi, fetchBedrockAccounts, data)
  const createGeminiAccount = (data) =>
    mutateAccount(httpApis.createGeminiAccountApi, fetchGeminiAccounts, data)
  const createOpenAIAccount = (data) =>
    mutateAccount(httpApis.createOpenAIAccountApi, fetchOpenAIAccounts, data)
  const createDroidAccount = (data) =>
    mutateAccount(httpApis.createDroidAccountApi, fetchDroidAccounts, data)
  const createAzureOpenAIAccount = (data) =>
    mutateAccount(httpApis.createAzureOpenAIAccountApi, fetchAzureOpenAIAccounts, data)
  const createOpenAIResponsesAccount = (data) =>
    mutateAccount(httpApis.createOpenAIResponsesAccountApi, fetchOpenAIResponsesAccounts, data)
  const createGeminiApiAccount = (data) =>
    mutateAccount(httpApis.createGeminiApiAccountApi, fetchGeminiAccounts, data)

  // 更新账户
  const updateClaudeAccount = (id, data) =>
    mutateAccount(httpApis.updateClaudeAccountApi, fetchClaudeAccounts, id, data)
  const updateClaudeConsoleAccount = (id, data) =>
    mutateAccount(httpApis.updateClaudeConsoleAccountApi, fetchClaudeConsoleAccounts, id, data)
  const updateBedrockAccount = (id, data) =>
    mutateAccount(httpApis.updateBedrockAccountApi, fetchBedrockAccounts, id, data)
  const updateGeminiAccount = (id, data) =>
    mutateAccount(httpApis.updateGeminiAccountApi, fetchGeminiAccounts, id, data)
  const updateOpenAIAccount = (id, data) =>
    mutateAccount(httpApis.updateOpenAIAccountApi, fetchOpenAIAccounts, id, data)
  const updateAzureOpenAIAccount = (id, data) =>
    mutateAccount(httpApis.updateAzureOpenAIAccountApi, fetchAzureOpenAIAccounts, id, data)
  const updateOpenAIResponsesAccount = (id, data) =>
    mutateAccount(httpApis.updateOpenAIResponsesAccountApi, fetchOpenAIResponsesAccounts, id, data)
  const updateGeminiApiAccount = (id, data) =>
    mutateAccount(httpApis.updateGeminiApiAccountApi, fetchGeminiAccounts, id, data)
  const updateDroidAccount = (id, data) =>
    mutateAccount(httpApis.updateDroidAccountApi, fetchDroidAccounts, id, data)

  // 切换账户状态
  const toggleAccount = async (platform, id) => {
    const config = PLATFORM_CONFIG[platform]
    if (!config) return { success: false, message: '未知平台' }
    loading.value = true
    const res = await httpApis.toggleAccountStatusApi(`/admin/${config.endpoint}/${id}/toggle`)
    if (res.success)
      await fetchAccounts(
        httpApis[
          `get${config.stateKey.charAt(0).toUpperCase() + config.stateKey.slice(1).replace('Accounts', '')}AccountsApi`
        ],
        stateMap[config.stateKey]
      )
    else error.value = res.message
    loading.value = false
    return res
  }

  // 删除账户
  const deleteAccount = async (platform, id) => {
    const config = PLATFORM_CONFIG[platform]
    if (!config) return { success: false, message: '未知平台' }
    loading.value = true
    const res = await httpApis.deleteAccountByEndpointApi(`/admin/${config.endpoint}/${id}`)
    if (res.success) {
      const fetchMap = {
        claude: fetchClaudeAccounts,
        'claude-console': fetchClaudeConsoleAccounts,
        bedrock: fetchBedrockAccounts,
        gemini: fetchGeminiAccounts,
        openai: fetchOpenAIAccounts,
        azure_openai: fetchAzureOpenAIAccounts,
        'openai-responses': fetchOpenAIResponsesAccounts,
        droid: fetchDroidAccounts
      }
      await fetchMap[platform]()
    } else {
      error.value = res.message
    }
    loading.value = false
    return res
  }

  // 刷新Claude Token
  const refreshClaudeToken = async (id) => {
    loading.value = true
    const res = await httpApis.refreshClaudeAccountApi(id)
    if (res.success) await fetchClaudeAccounts()
    else error.value = res.message
    loading.value = false
    return res
  }

  // OAuth 相关
  const generateClaudeAuthUrl = async (proxyConfig) => {
    const res = await httpApis.generateClaudeAuthUrlApi(proxyConfig)
    if (!res.success) error.value = res.message
    return res.success ? res.data : null
  }

  const exchangeClaudeCode = async (data) => {
    const res = await httpApis.exchangeClaudeCodeApi(data)
    if (!res.success) error.value = res.message
    return res.success ? res.data : null
  }

  const generateClaudeSetupTokenUrl = async (proxyConfig) => {
    const res = await httpApis.generateClaudeSetupTokenUrlApi(proxyConfig)
    if (!res.success) error.value = res.message
    return res.success ? res.data : null
  }

  const exchangeClaudeSetupTokenCode = async (data) => {
    const res = await httpApis.exchangeClaudeSetupTokenApi(data)
    if (!res.success) error.value = res.message
    return res.success ? res.data : null
  }

  const oauthWithCookie = async (payload) => {
    const res = await httpApis.claudeOAuthWithCookieApi(payload)
    if (!res.success) error.value = res.message
    return res.success ? res.data : null
  }

  const oauthSetupTokenWithCookie = async (payload) => {
    const res = await httpApis.claudeSetupTokenWithCookieApi(payload)
    if (!res.success) error.value = res.message
    return res.success ? res.data : null
  }

  const generateGeminiAuthUrl = async (proxyConfig) => {
    const res = await httpApis.generateGeminiAuthUrlApi(proxyConfig)
    if (!res.success) error.value = res.message
    return res.success ? res.data : null
  }

  const exchangeGeminiCode = async (data) => {
    const res = await httpApis.exchangeGeminiCodeApi(data)
    if (!res.success) error.value = res.message
    return res.success ? res.data : null
  }

  const generateOpenAIAuthUrl = async (proxyConfig) => {
    const res = await httpApis.generateOpenAIAuthUrlApi(proxyConfig)
    if (!res.success) error.value = res.message
    return res.success ? res.data : null
  }

  const exchangeOpenAICode = async (data) => {
    const res = await httpApis.exchangeOpenAICodeApi(data)
    if (!res.success) error.value = res.message
    return res.success ? res.data : null
  }

  const generateDroidAuthUrl = async (proxyConfig) => {
    const res = await httpApis.generateDroidAuthUrlApi(proxyConfig)
    if (!res.success) error.value = res.message
    return res.success ? res.data : null
  }

  const exchangeDroidCode = (data) => httpApis.exchangeDroidCodeApi(data)

  const sortAccounts = (field) => {
    if (sortBy.value === field) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortBy.value = field
      sortOrder.value = 'asc'
    }
  }

  const reset = () => {
    claudeAccounts.value = []
    claudeConsoleAccounts.value = []
    bedrockAccounts.value = []
    geminiAccounts.value = []
    openaiAccounts.value = []
    azureOpenaiAccounts.value = []
    openaiResponsesAccounts.value = []
    droidAccounts.value = []
    loading.value = false
    error.value = null
    sortBy.value = ''
    sortOrder.value = 'asc'
  }

  return {
    claudeAccounts,
    claudeConsoleAccounts,
    bedrockAccounts,
    geminiAccounts,
    openaiAccounts,
    azureOpenaiAccounts,
    openaiResponsesAccounts,
    droidAccounts,
    loading,
    error,
    sortBy,
    sortOrder,
    fetchClaudeAccounts,
    fetchClaudeConsoleAccounts,
    fetchBedrockAccounts,
    fetchGeminiAccounts,
    fetchOpenAIAccounts,
    fetchAzureOpenAIAccounts,
    fetchOpenAIResponsesAccounts,
    fetchDroidAccounts,
    fetchAllAccounts,
    createClaudeAccount,
    createClaudeConsoleAccount,
    createBedrockAccount,
    createGeminiAccount,
    createOpenAIAccount,
    createDroidAccount,
    updateDroidAccount,
    createAzureOpenAIAccount,
    createOpenAIResponsesAccount,
    createGeminiApiAccount,
    updateClaudeAccount,
    updateClaudeConsoleAccount,
    updateBedrockAccount,
    updateGeminiAccount,
    updateOpenAIAccount,
    updateAzureOpenAIAccount,
    updateOpenAIResponsesAccount,
    updateGeminiApiAccount,
    toggleAccount,
    deleteAccount,
    refreshClaudeToken,
    generateClaudeAuthUrl,
    exchangeClaudeCode,
    generateClaudeSetupTokenUrl,
    exchangeClaudeSetupTokenCode,
    oauthWithCookie,
    oauthSetupTokenWithCookie,
    generateGeminiAuthUrl,
    exchangeGeminiCode,
    generateOpenAIAuthUrl,
    exchangeOpenAICode,
    generateDroidAuthUrl,
    exchangeDroidCode,
    sortAccounts,
    reset
  }
})
