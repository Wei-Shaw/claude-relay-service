import axios from 'axios'
import { APP_CONFIG, getLoginUrl } from '@/config/app'

export const API_PREFIX = APP_CONFIG.apiPrefix

const axiosInstance = axios.create({
  baseURL: APP_CONFIG.apiPrefix,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken')
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

axiosInstance.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      const path = window.location.pathname + window.location.hash
      if (!path.includes('/login') && !path.endsWith('/')) {
        localStorage.removeItem('authToken')
        window.location.href = getLoginUrl()
      }
    }
    return Promise.reject(error)
  }
)

// 通用请求函数 - 只会 resolve，调用方无需 try-catch
const request = async (config) => {
  try {
    return await axiosInstance(config)
  } catch (error) {
    console.error('Request failed:', error)
    const data = error.response?.data
    if (data && typeof data.success !== 'undefined') return data
    const status = error.response?.status
    const messages = {
      401: '未授权，请重新登录',
      403: '无权限访问',
      404: '请求的资源不存在',
      500: '服务器内部错误'
    }
    return { success: false, message: messages[status] || error.message || '请求失败' }
  }
}

const get = (url, config) => request({ method: 'get', url, ...config })
const post = (url, data, config) => request({ method: 'post', url, data, ...config })
const put = (url, data, config) => request({ method: 'put', url, data, ...config })
const patch = (url, data, config) => request({ method: 'patch', url, data, ...config })
const del = (url, config) => request({ method: 'delete', url, ...config })

// 模型
export const getModels = () => get('/apiStats/models')
export const getModelsByService = (service) => get('/apiStats/models', { params: { service } })

// API Key 测试
export const testClaudeApiKey = (data) => post('/apiStats/api-key/test', data)
export const testGeminiApiKey = (data) => post('/apiStats/api-key/test-gemini', data)
export const testOpenAIApiKey = (data) => post('/apiStats/api-key/test-openai', data)

// API Stats
export const getKeyId = (apiKey) => post('/apiStats/api/get-key-id', { apiKey })
export const getUserStats = (apiId) => post('/apiStats/api/user-stats', { apiId })
export const getUserModelStats = (apiId, period = 'daily') =>
  post('/apiStats/api/user-model-stats', { apiId, period })
export const getBatchStats = (apiIds) => post('/apiStats/api/batch-stats', { apiIds })
export const getBatchModelStats = (apiIds, period = 'daily') =>
  post('/apiStats/api/batch-model-stats', { apiIds, period })

// 认证
export const login = (credentials) => post('/web/auth/login', credentials)
export const getAuthUser = () => get('/web/auth/user')

// OEM 设置
export const getOemSettings = () => get('/admin/oem-settings')
export const updateOemSettings = (data) => put('/admin/oem-settings', data)

// 服务倍率配置（公开接口）
export const getServiceRates = () => get('/apiStats/service-rates')

// 仪表板
export const getDashboard = () => get('/admin/dashboard')
export const getUsageCosts = (period) => get(`/admin/usage-costs?period=${period}`)
export const getUsageStats = (url) => get(url)

// 客户端
export const getSupportedClients = () => get('/admin/supported-clients')

// API Keys
export const getApiKeys = () => get('/admin/api-keys')
export const getApiKeysWithParams = (params) => get(`/admin/api-keys?${params}`)
export const createApiKey = (data) => post('/admin/api-keys', data)
export const updateApiKey = (id, data) => put(`/admin/api-keys/${id}`, data)
export const toggleApiKey = (id) => put(`/admin/api-keys/${id}/toggle`)
export const deleteApiKey = (id) => del(`/admin/api-keys/${id}`)
export const getApiKeyStats = (id, params) => get(`/admin/api-keys/${id}/stats`, { params })
export const getApiKeyTags = () => get('/admin/api-keys/tags')
export const getApiKeyUsedModels = () => get('/admin/api-keys/used-models')
export const getApiKeysBatchStats = (data) => post('/admin/api-keys/batch-stats', data)
export const getApiKeysBatchLastUsage = (data) => post('/admin/api-keys/batch-last-usage', data)
export const getDeletedApiKeys = () => get('/admin/api-keys/deleted')
export const getApiKeysCostSortStatus = () => get('/admin/api-keys/cost-sort-status')
export const restoreApiKey = (id) => post(`/admin/api-keys/${id}/restore`)
export const permanentDeleteApiKey = (id) => del(`/admin/api-keys/${id}/permanent`)
export const clearAllDeletedApiKeys = () => del('/admin/api-keys/deleted/clear-all')
export const batchDeleteApiKeys = (data) => del('/admin/api-keys/batch', { data })
export const updateApiKeyExpiration = (id, data) =>
  request({ method: 'patch', url: `/admin/api-keys/${id}/expiration`, data })

// Claude 账户
export const getClaudeAccounts = () => get('/admin/claude-accounts')
export const createClaudeAccount = (data) => post('/admin/claude-accounts', data)
export const updateClaudeAccount = (id, data) => put(`/admin/claude-accounts/${id}`, data)
export const deleteClaudeAccount = (id) => del(`/admin/claude-accounts/${id}`)
export const refreshClaudeAccount = (id) => post(`/admin/claude-accounts/${id}/refresh`)
export const generateClaudeAuthUrl = (data) =>
  post('/admin/claude-accounts/generate-auth-url', data)
export const exchangeClaudeCode = (data) => post('/admin/claude-accounts/exchange-code', data)
export const generateClaudeSetupTokenUrl = (data) =>
  post('/admin/claude-accounts/generate-setup-token-url', data)
export const exchangeClaudeSetupToken = (data) =>
  post('/admin/claude-accounts/exchange-setup-token', data)
export const claudeOAuthWithCookie = (data) =>
  post('/admin/claude-accounts/oauth-with-cookie', data)
export const claudeSetupTokenWithCookie = (data) =>
  post('/admin/claude-accounts/setup-token-with-cookie', data)
export const generateClaudeWorkosAuthUrl = (data) =>
  post('/admin/claude-accounts/generate-workos-auth-url', data)

// Claude Console 账户
export const getClaudeConsoleAccounts = () => get('/admin/claude-console-accounts')
export const createClaudeConsoleAccount = (data) => post('/admin/claude-console-accounts', data)
export const updateClaudeConsoleAccount = (id, data) =>
  put(`/admin/claude-console-accounts/${id}`, data)
export const deleteClaudeConsoleAccount = (id) => del(`/admin/claude-console-accounts/${id}`)

// Bedrock 账户
export const getBedrockAccounts = () => get('/admin/bedrock-accounts')
export const createBedrockAccount = (data) => post('/admin/bedrock-accounts', data)
export const updateBedrockAccount = (id, data) => put(`/admin/bedrock-accounts/${id}`, data)
export const deleteBedrockAccount = (id) => del(`/admin/bedrock-accounts/${id}`)

// Gemini 账户
export const getGeminiAccounts = () => get('/admin/gemini-accounts')
export const createGeminiAccount = (data) => post('/admin/gemini-accounts', data)
export const updateGeminiAccount = (id, data) => put(`/admin/gemini-accounts/${id}`, data)
export const deleteGeminiAccount = (id) => del(`/admin/gemini-accounts/${id}`)
export const generateGeminiAuthUrl = (data) =>
  post('/admin/gemini-accounts/generate-auth-url', data)
export const exchangeGeminiCode = (data) => post('/admin/gemini-accounts/exchange-code', data)

// Gemini API 账户
export const createGeminiApiAccount = (data) => post('/admin/gemini-api-accounts', data)
export const updateGeminiApiAccount = (id, data) => put(`/admin/gemini-api-accounts/${id}`, data)

// OpenAI 账户
export const getOpenAIAccounts = () => get('/admin/openai-accounts')
export const createOpenAIAccount = (data) => post('/admin/openai-accounts', data)
export const updateOpenAIAccount = (id, data) => put(`/admin/openai-accounts/${id}`, data)
export const deleteOpenAIAccount = (id) => del(`/admin/openai-accounts/${id}`)
export const generateOpenAIAuthUrl = (data) =>
  post('/admin/openai-accounts/generate-auth-url', data)
export const exchangeOpenAICode = (data) => post('/admin/openai-accounts/exchange-code', data)

// OpenAI Responses 账户
export const getOpenAIResponsesAccounts = () => get('/admin/openai-responses-accounts')
export const createOpenAIResponsesAccount = (data) => post('/admin/openai-responses-accounts', data)
export const updateOpenAIResponsesAccount = (id, data) =>
  put(`/admin/openai-responses-accounts/${id}`, data)
export const deleteOpenAIResponsesAccount = (id) => del(`/admin/openai-responses-accounts/${id}`)

// Azure OpenAI 账户
export const getAzureOpenAIAccounts = () => get('/admin/azure-openai-accounts')
export const createAzureOpenAIAccount = (data) => post('/admin/azure-openai-accounts', data)
export const updateAzureOpenAIAccount = (id, data) =>
  put(`/admin/azure-openai-accounts/${id}`, data)
export const deleteAzureOpenAIAccount = (id) => del(`/admin/azure-openai-accounts/${id}`)

// Droid 账户
export const getDroidAccounts = () => get('/admin/droid-accounts')
export const createDroidAccount = (data) => post('/admin/droid-accounts', data)
export const updateDroidAccount = (id, data) => put(`/admin/droid-accounts/${id}`, data)
export const deleteDroidAccount = (id) => del(`/admin/droid-accounts/${id}`)
export const generateDroidAuthUrl = (data) => post('/admin/droid-accounts/generate-auth-url', data)
export const exchangeDroidCode = (data) => post('/admin/droid-accounts/exchange-code', data)

// CCR 账户
export const getCcrAccounts = () => get('/admin/ccr-accounts')
export const createCcrAccount = (data) => post('/admin/ccr-accounts', data)
export const updateCcrAccount = (id, data) => put(`/admin/ccr-accounts/${id}`, data)
export const deleteCcrAccount = (id) => del(`/admin/ccr-accounts/${id}`)

// Gemini API 账户
export const getGeminiApiAccounts = () => get('/admin/gemini-api-accounts')

// 账户通用操作
export const toggleAccountStatus = (endpoint) => put(endpoint)
export const deleteAccountByEndpoint = (endpoint) => del(endpoint)
export const testAccountByEndpoint = (endpoint) => post(endpoint)
export const updateAccountByEndpoint = (endpoint, data) => put(endpoint, data)

// 账户使用统计
export const getClaudeAccountsUsage = () => get('/admin/claude-accounts/usage')
export const getAccountsBindingCounts = () => get('/admin/accounts/binding-counts')
export const getAccountUsageHistory = (id, platform, days = 30) =>
  get(`/admin/accounts/${id}/usage-history?platform=${platform}&days=${days}`)

// 账户组
export const getAccountGroups = () => get('/admin/account-groups')
export const createAccountGroup = (data) => post('/admin/account-groups', data)
export const updateAccountGroup = (id, data) => put(`/admin/account-groups/${id}`, data)
export const deleteAccountGroup = (id) => del(`/admin/account-groups/${id}`)

// 用户管理
export const getUsers = () => get('/admin/users')
export const createUser = (data) => post('/admin/users', data)
export const updateUser = (id, data) => put(`/admin/users/${id}`, data)
export const deleteUser = (id) => del(`/admin/users/${id}`)
export const updateUserRole = (id, data) => put(`/admin/users/${id}/role`, data)
export const getUserUsageStats = (id, params) => get(`/admin/users/${id}/usage-stats`, { params })

// 使用记录
export const getApiKeyUsageRecords = (id, params) =>
  get(`/admin/api-keys/${id}/usage-records`, { params })
export const getAccountUsageRecords = (type, id, params) =>
  get(`/admin/${type}-accounts/${id}/usage-records`, { params })

// 系统日志
export const getSystemLogs = (params) => get('/admin/logs', { params })

// 配额卡片
export const getQuotaCards = () => get('/admin/quota-cards')
export const createQuotaCard = (data) => post('/admin/quota-cards', data)
export const updateQuotaCard = (id, data) => put(`/admin/quota-cards/${id}`, data)
export const deleteQuotaCard = (id) => del(`/admin/quota-cards/${id}`)
export const redeemQuotaCard = (data) => post('/admin/quota-cards/redeem', data)

// 账户测试
export const testAccount = (type, id) => post(`/admin/${type}-accounts/${id}/test`)
export const getAccountTestHistory = (type, id) => get(`/admin/${type}-accounts/${id}/test-history`)

// 定时测试
export const getScheduledTests = () => get('/admin/scheduled-tests')
export const createScheduledTest = (data) => post('/admin/scheduled-tests', data)
export const updateScheduledTest = (id, data) => put(`/admin/scheduled-tests/${id}`, data)
export const deleteScheduledTest = (id) => del(`/admin/scheduled-tests/${id}`)

// 统一 User-Agent
export const getUnifiedUserAgent = () => get('/admin/unified-user-agent')

// 账户 API Keys 管理
export const getAccountApiKeys = (type, id) => get(`/admin/${type}-accounts/${id}/api-keys`)
export const updateAccountApiKeys = (type, id, data) =>
  put(`/admin/${type}-accounts/${id}/api-keys`, data)

export default { get, post, put, patch, del, request }
export { get, post, put, patch, del }
