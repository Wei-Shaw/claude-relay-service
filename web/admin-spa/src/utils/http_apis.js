import request from '@/utils/request'

// 模型
export const getModelsApi = () => request({ url: '/apiStats/models', method: 'GET' })

// 模型价格管理
export const getModelPricingApi = () => request({ url: '/admin/models/pricing', method: 'GET' })
export const getModelPricingStatusApi = () =>
  request({ url: '/admin/models/pricing/status', method: 'GET' })
export const refreshModelPricingApi = () =>
  request({ url: '/admin/models/pricing/refresh', method: 'POST' })

// API Stats
export const getKeyIdApi = (apiKey) =>
  request({ url: '/apiStats/api/get-key-id', method: 'POST', data: { apiKey } })
export const getUserStatsApi = (apiId) =>
  request({ url: '/apiStats/api/user-stats', method: 'POST', data: { apiId } })
export const getUserModelStatsApi = (apiId, period = 'daily') =>
  request({ url: '/apiStats/api/user-model-stats', method: 'POST', data: { apiId, period } })
export const getBatchStatsApi = (apiIds) =>
  request({ url: '/apiStats/api/batch-stats', method: 'POST', data: { apiIds } })
export const getBatchModelStatsApi = (apiIds, period = 'daily') =>
  request({ url: '/apiStats/api/batch-model-stats', method: 'POST', data: { apiIds, period } })

// 认证
export const loginApi = (data) => request({ url: '/web/auth/login', method: 'POST', data })
export const getAuthUserApi = () => request({ url: '/web/auth/user', method: 'GET' })
export const changePasswordApi = (data) =>
  request({ url: '/web/auth/change-password', method: 'POST', data })

// OEM 设置
export const getOemSettingsApi = () => request({ url: '/admin/oem-settings', method: 'GET' })
export const updateOemSettingsApi = (data) =>
  request({ url: '/admin/oem-settings', method: 'PUT', data })

// 服务倍率配置（公开接口）
export const getServiceRatesApi = () => request({ url: '/apiStats/service-rates', method: 'GET' })

// 额度卡兑换（公开接口）
export const redeemCardByApiIdApi = (data) =>
  request({ url: '/apiStats/api/redeem-card', method: 'POST', data })
export const getRedemptionHistoryByApiIdApi = (apiId, params = {}) =>
  request({ url: '/apiStats/api/redemption-history', method: 'GET', params: { apiId, ...params } })

// 仪表板
export const getDashboardApi = () => request({ url: '/admin/dashboard', method: 'GET' })
export const getTempUnavailableApi = () =>
  request({ url: '/admin/temp-unavailable', method: 'GET' })
export const getUsageCostsApi = (period) =>
  request({ url: `/admin/usage-costs?period=${period}`, method: 'GET' })
export const getUsageStatsApi = (url) => request({ url, method: 'GET' })

// 客户端
export const getSupportedClientsApi = () =>
  request({ url: '/admin/supported-clients', method: 'GET' })

// API Keys
export const getApiKeysApi = () => request({ url: '/admin/api-keys', method: 'GET' })
export const getApiKeysWithParamsApi = (params) =>
  request({ url: `/admin/api-keys?${params}`, method: 'GET' })
export const createApiKeyApi = (data) => request({ url: '/admin/api-keys', method: 'POST', data })
export const updateApiKeyApi = (id, data) =>
  request({ url: `/admin/api-keys/${id}`, method: 'PUT', data })
export const toggleApiKeyApi = (id) =>
  request({ url: `/admin/api-keys/${id}/toggle`, method: 'PUT' })
export const deleteApiKeyApi = (id) => request({ url: `/admin/api-keys/${id}`, method: 'DELETE' })
export const getApiKeyStatsApi = (id, params) =>
  request({ url: `/admin/api-keys/${id}/stats`, method: 'GET', params })
export const getApiKeyModelStatsApi = (id, params) =>
  request({ url: `/admin/api-keys/${id}/model-stats`, method: 'GET', params })
export const getApiKeyTagsApi = () => request({ url: '/admin/api-keys/tags', method: 'GET' })
export const getApiKeyTagsDetailsApi = () =>
  request({ url: '/admin/api-keys/tags/details', method: 'GET' })
export const createApiKeyTagApi = (name) =>
  request({ url: '/admin/api-keys/tags', method: 'POST', data: { name } })
export const deleteApiKeyTagApi = (tagName) =>
  request({ url: `/admin/api-keys/tags/${encodeURIComponent(tagName)}`, method: 'DELETE' })
export const renameApiKeyTagApi = (tagName, newName) =>
  request({
    url: `/admin/api-keys/tags/${encodeURIComponent(tagName)}`,
    method: 'PUT',
    data: { newName }
  })
export const getApiKeyUsedModelsApi = () =>
  request({ url: '/admin/api-keys/used-models', method: 'GET' })
export const getApiKeysBatchStatsApi = (data) =>
  request({ url: '/admin/api-keys/batch-stats', method: 'POST', data })
export const getApiKeysBatchLastUsageApi = (data) =>
  request({ url: '/admin/api-keys/batch-last-usage', method: 'POST', data })
export const getDeletedApiKeysApi = () => request({ url: '/admin/api-keys/deleted', method: 'GET' })
export const getApiKeysCostSortStatusApi = () =>
  request({ url: '/admin/api-keys/cost-sort-status', method: 'GET' })
export const restoreApiKeyApi = (id) =>
  request({ url: `/admin/api-keys/${id}/restore`, method: 'POST' })
export const permanentDeleteApiKeyApi = (id) =>
  request({ url: `/admin/api-keys/${id}/permanent`, method: 'DELETE' })
export const clearAllDeletedApiKeysApi = () =>
  request({ url: '/admin/api-keys/deleted/clear-all', method: 'DELETE' })
export const batchDeleteApiKeysApi = (data) =>
  request({ url: '/admin/api-keys/batch', method: 'DELETE', data })
export const updateApiKeyExpirationApi = (id, data) =>
  request({ url: `/admin/api-keys/${id}/expiration`, method: 'PATCH', data })
export const batchCreateApiKeysApi = (data) =>
  request({ url: '/admin/api-keys/batch', method: 'POST', data })
export const batchUpdateApiKeysApi = (data) =>
  request({ url: '/admin/api-keys/batch', method: 'PUT', data })
export const getApiKeyUsageRecordsApi = (id, params) =>
  request({ url: `/admin/api-keys/${id}/usage-records`, method: 'GET', params })

// Claude 账户
export const getClaudeAccountsApi = () => request({ url: '/admin/claude-accounts', method: 'GET' })
export const createClaudeAccountApi = (data) =>
  request({ url: '/admin/claude-accounts', method: 'POST', data })
export const updateClaudeAccountApi = (id, data) =>
  request({ url: `/admin/claude-accounts/${id}`, method: 'PUT', data })
export const refreshClaudeAccountApi = (id) =>
  request({ url: `/admin/claude-accounts/${id}/refresh`, method: 'POST' })
export const generateClaudeAuthUrlApi = (data) =>
  request({ url: '/admin/claude-accounts/generate-auth-url', method: 'POST', data })
export const exchangeClaudeCodeApi = (data) =>
  request({ url: '/admin/claude-accounts/exchange-code', method: 'POST', data })
export const generateClaudeSetupTokenUrlApi = (data) =>
  request({ url: '/admin/claude-accounts/generate-setup-token-url', method: 'POST', data })
export const exchangeClaudeSetupTokenApi = (data) =>
  request({ url: '/admin/claude-accounts/exchange-setup-token-code', method: 'POST', data })
export const claudeOAuthWithCookieApi = (data) =>
  request({ url: '/admin/claude-accounts/oauth-with-cookie', method: 'POST', data })
export const claudeSetupTokenWithCookieApi = (data) =>
  request({ url: '/admin/claude-accounts/setup-token-with-cookie', method: 'POST', data })

// Claude Console 账户
export const getClaudeConsoleAccountsApi = () =>
  request({ url: '/admin/claude-console-accounts', method: 'GET' })
export const createClaudeConsoleAccountApi = (data) =>
  request({ url: '/admin/claude-console-accounts', method: 'POST', data })
export const updateClaudeConsoleAccountApi = (id, data) =>
  request({ url: `/admin/claude-console-accounts/${id}`, method: 'PUT', data })

// Bedrock 账户
export const getBedrockAccountsApi = () =>
  request({ url: '/admin/bedrock-accounts', method: 'GET' })
export const createBedrockAccountApi = (data) =>
  request({ url: '/admin/bedrock-accounts', method: 'POST', data })
export const updateBedrockAccountApi = (id, data) =>
  request({ url: `/admin/bedrock-accounts/${id}`, method: 'PUT', data })

// Gemini 账户
export const getGeminiAccountsApi = () => request({ url: '/admin/gemini-accounts', method: 'GET' })
export const createGeminiAccountApi = (data) =>
  request({ url: '/admin/gemini-accounts', method: 'POST', data })
export const updateGeminiAccountApi = (id, data) =>
  request({ url: `/admin/gemini-accounts/${id}`, method: 'PUT', data })
export const generateGeminiAuthUrlApi = (data) =>
  request({ url: '/admin/gemini-accounts/generate-auth-url', method: 'POST', data })
export const exchangeGeminiCodeApi = (data) =>
  request({ url: '/admin/gemini-accounts/exchange-code', method: 'POST', data })

// Gemini API 账户
export const getGeminiApiAccountsApi = () =>
  request({ url: '/admin/gemini-api-accounts', method: 'GET' })
export const createGeminiApiAccountApi = (data) =>
  request({ url: '/admin/gemini-api-accounts', method: 'POST', data })
export const updateGeminiApiAccountApi = (id, data) =>
  request({ url: `/admin/gemini-api-accounts/${id}`, method: 'PUT', data })

// OpenAI 账户
export const getOpenAIAccountsApi = () => request({ url: '/admin/openai-accounts', method: 'GET' })
export const createOpenAIAccountApi = (data) =>
  request({ url: '/admin/openai-accounts', method: 'POST', data })
export const updateOpenAIAccountApi = (id, data) =>
  request({ url: `/admin/openai-accounts/${id}`, method: 'PUT', data })
export const generateOpenAIAuthUrlApi = (data) =>
  request({ url: '/admin/openai-accounts/generate-auth-url', method: 'POST', data })
export const exchangeOpenAICodeApi = (data) =>
  request({ url: '/admin/openai-accounts/exchange-code', method: 'POST', data })

// OpenAI Responses 账户
export const getOpenAIResponsesAccountsApi = () =>
  request({ url: '/admin/openai-responses-accounts', method: 'GET' })
export const createOpenAIResponsesAccountApi = (data) =>
  request({ url: '/admin/openai-responses-accounts', method: 'POST', data })
export const updateOpenAIResponsesAccountApi = (id, data) =>
  request({ url: `/admin/openai-responses-accounts/${id}`, method: 'PUT', data })

// Azure OpenAI 账户
export const getAzureOpenAIAccountsApi = () =>
  request({ url: '/admin/azure-openai-accounts', method: 'GET' })
export const createAzureOpenAIAccountApi = (data) =>
  request({ url: '/admin/azure-openai-accounts', method: 'POST', data })
export const updateAzureOpenAIAccountApi = (id, data) =>
  request({ url: `/admin/azure-openai-accounts/${id}`, method: 'PUT', data })

// Droid 账户
export const getDroidAccountsApi = () => request({ url: '/admin/droid-accounts', method: 'GET' })
export const createDroidAccountApi = (data) =>
  request({ url: '/admin/droid-accounts', method: 'POST', data })
export const updateDroidAccountApi = (id, data) =>
  request({ url: `/admin/droid-accounts/${id}`, method: 'PUT', data })
export const generateDroidAuthUrlApi = (data) =>
  request({ url: '/admin/droid-accounts/generate-auth-url', method: 'POST', data })
export const exchangeDroidCodeApi = (data) =>
  request({ url: '/admin/droid-accounts/exchange-code', method: 'POST', data })
export const getDroidAccountByIdApi = (id) =>
  request({ url: `/admin/droid-accounts/${id}`, method: 'GET' })

// CCR 账户
export const getCcrAccountsApi = () => request({ url: '/admin/ccr-accounts', method: 'GET' })
export const createCcrAccountApi = (data) =>
  request({ url: '/admin/ccr-accounts', method: 'POST', data })
export const updateCcrAccountApi = (id, data) =>
  request({ url: `/admin/ccr-accounts/${id}`, method: 'PUT', data })

// 账户通用操作
export const toggleAccountStatusApi = (endpoint) => request({ url: endpoint, method: 'PUT' })
export const deleteAccountByEndpointApi = (endpoint) => request({ url: endpoint, method: 'DELETE' })
export const testAccountByEndpointApi = (endpoint) => request({ url: endpoint, method: 'POST' })
export const updateAccountByEndpointApi = (endpoint, data) =>
  request({ url: endpoint, method: 'PUT', data })

// 账户使用统计
export const getClaudeAccountsUsageApi = () =>
  request({ url: '/admin/claude-accounts/usage', method: 'GET' })
export const getAccountsBindingCountsApi = () =>
  request({ url: '/admin/accounts/binding-counts', method: 'GET' })
export const getAccountUsageHistoryApi = (id, platform, days = 30) =>
  request({
    url: `/admin/accounts/${id}/usage-history?platform=${platform}&days=${days}`,
    method: 'GET'
  })
export const getClaudeConsoleAccountUsageApi = (id) =>
  request({ url: `/admin/claude-console-accounts/${id}/usage`, method: 'GET' })
export const getAccountUsageRecordsByIdApi = (id, params) =>
  request({ url: `/admin/accounts/${id}/usage-records`, method: 'GET', params })

// 账户组
export const getAccountGroupsApi = () => request({ url: '/admin/account-groups', method: 'GET' })
export const createAccountGroupApi = (data) =>
  request({ url: '/admin/account-groups', method: 'POST', data })
export const updateAccountGroupApi = (id, data) =>
  request({ url: `/admin/account-groups/${id}`, method: 'PUT', data })
export const deleteAccountGroupApi = (id) =>
  request({ url: `/admin/account-groups/${id}`, method: 'DELETE' })
export const getAccountGroupMembersApi = (id) =>
  request({ url: `/admin/account-groups/${id}/members`, method: 'GET' })

// 用户管理（管理员）
export const getUsersApi = () => request({ url: '/admin/users', method: 'GET' })

// 配额卡片
export const createQuotaCardApi = (data) =>
  request({ url: '/admin/quota-cards', method: 'POST', data })
export const deleteQuotaCardApi = (id) =>
  request({ url: `/admin/quota-cards/${id}`, method: 'DELETE' })
export const getQuotaCardsWithParamsApi = (params) =>
  request({ url: '/admin/quota-cards', method: 'GET', params })
export const getQuotaCardsStatsApi = () =>
  request({ url: '/admin/quota-cards/stats', method: 'GET' })
export const getRedemptionsApi = () => request({ url: '/admin/redemptions', method: 'GET' })
export const revokeRedemptionApi = (id, data) =>
  request({ url: `/admin/redemptions/${id}/revoke`, method: 'POST', data })
export const getQuotaCardLimitsApi = () =>
  request({ url: '/admin/quota-cards/limits', method: 'GET' })
export const updateQuotaCardLimitsApi = (data) =>
  request({ url: '/admin/quota-cards/limits', method: 'PUT', data })

// 账户余额
export const getAccountBalanceApi = (id, params) =>
  request({ url: `/admin/accounts/${id}/balance`, method: 'GET', params })
export const refreshAccountBalanceApi = (id, data) =>
  request({ url: `/admin/accounts/${id}/balance/refresh`, method: 'POST', data })
export const getBalanceSummaryApi = () =>
  request({ url: '/admin/accounts/balance/summary', method: 'GET' })
export const getBalanceByPlatformApi = (platform, params) =>
  request({ url: `/admin/accounts/balance/platform/${platform}`, method: 'GET', params })

// 账户余额脚本
export const getAccountBalanceScriptApi = (id, platform) =>
  request({ url: `/admin/accounts/${id}/balance/script?platform=${platform}`, method: 'GET' })
export const updateAccountBalanceScriptApi = (id, platform, data) =>
  request({ url: `/admin/accounts/${id}/balance/script?platform=${platform}`, method: 'PUT', data })
export const testAccountBalanceScriptApi = (id, platform, data) =>
  request({
    url: `/admin/accounts/${id}/balance/script/test?platform=${platform}`,
    method: 'POST',
    data
  })

// 默认余额脚本
export const getDefaultBalanceScriptApi = () =>
  request({ url: '/admin/balance-scripts/default', method: 'GET' })
export const updateDefaultBalanceScriptApi = (data) =>
  request({ url: '/admin/balance-scripts/default', method: 'PUT', data })
export const testDefaultBalanceScriptApi = (data) =>
  request({ url: '/admin/balance-scripts/default/test', method: 'POST', data })

// 前台用户管理
export const getFrontUsersApi = (params) => request({ url: '/users', method: 'GET', params })
export const getFrontUsersStatsOverviewApi = () =>
  request({ url: '/users/stats/overview', method: 'GET' })
export const getFrontUserByIdApi = (id) => request({ url: `/users/${id}`, method: 'GET' })
export const updateFrontUserStatusApi = (id, data) =>
  request({ url: `/users/${id}/status`, method: 'PATCH', data })
export const disableFrontUserKeysApi = (id) =>
  request({ url: `/users/${id}/disable-keys`, method: 'POST' })
export const getFrontUserUsageStatsApi = (id, params) =>
  request({ url: `/users/${id}/usage-stats`, method: 'GET', params })
export const updateFrontUserRoleApi = (id, data) =>
  request({ url: `/users/${id}/role`, method: 'PATCH', data })

// Webhook 配置
export const getWebhookConfigApi = (config) =>
  request({ url: '/admin/webhook/config', method: 'GET', ...config })
export const updateWebhookConfigApi = (data, config) =>
  request({ url: '/admin/webhook/config', method: 'POST', data, ...config })
export const createWebhookPlatformApi = (data, config) =>
  request({ url: '/admin/webhook/platforms', method: 'POST', data, ...config })
export const deleteWebhookPlatformApi = (id, config) =>
  request({ url: `/admin/webhook/platforms/${id}`, method: 'DELETE', ...config })
export const updateWebhookPlatformApi = (id, data, config) =>
  request({ url: `/admin/webhook/platforms/${id}`, method: 'PUT', data, ...config })
export const toggleWebhookPlatformApi = (id, config) =>
  request({ url: `/admin/webhook/platforms/${id}/toggle`, method: 'POST', ...config })
export const testWebhookApi = (data, config) =>
  request({ url: '/admin/webhook/test', method: 'POST', data, ...config })
export const testWebhookNotificationApi = (config) =>
  request({ url: '/admin/webhook/test-notification', method: 'POST', ...config })

// Claude Relay 配置
export const getClaudeRelayConfigApi = (config) =>
  request({ url: '/admin/claude-relay-config', method: 'GET', ...config })
export const updateClaudeRelayConfigApi = (data, config) =>
  request({ url: '/admin/claude-relay-config', method: 'PUT', data, ...config })

// 服务倍率配置（管理端）
export const getAdminServiceRatesApi = (config) =>
  request({ url: '/admin/service-rates', method: 'GET', ...config })
export const updateAdminServiceRatesApi = (data, config) =>
  request({ url: '/admin/service-rates', method: 'PUT', data, ...config })

// 系统
export const checkUpdatesApi = () => request({ url: '/admin/check-updates', method: 'GET' })
export const getClaudeCodeVersionApi = () =>
  request({ url: '/admin/claude-code-version', method: 'GET' })
export const clearClaudeCodeVersionApi = () =>
  request({ url: '/admin/claude-code-version/clear', method: 'POST' })
