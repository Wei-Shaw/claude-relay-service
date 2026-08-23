import request from '@/utils/request'

// 模型
export const getModelsApi = () => request({ url: '/apiStats/models', method: 'GET' })

// 模型价格管理
export const getModelPricingApi = () => request({ url: '/admin/models/pricing', method: 'GET' })
export const getModelPricingStatusApi = () =>
  request({ url: '/admin/models/pricing/status', method: 'GET' })
export const refreshModelPricingApi = () =>
  request({ url: '/admin/models/pricing/refresh', method: 'POST' })
export const updateModelPricingSourceApi = (data) =>
  request({ url: '/admin/models/pricing/source', method: 'PUT', data })
// 拉取定价文件（只更新价格，不改模型目录）
export const pullModelPricingApi = () =>
  request({ url: '/admin/models/pricing/pull', method: 'POST' })
// 模型目录导入（从定价源把新模型加进 /v1/models）
export const getImportableModelsApi = () =>
  request({ url: '/admin/models/importable', method: 'GET' })
export const getImportedModelsApi = () =>
  request({ url: '/admin/models/imported', method: 'GET' })
export const importModelsApi = (models) =>
  request({ url: '/admin/models/import', method: 'POST', data: { models } })
export const removeImportedModelsApi = (models) =>
  request({ url: '/admin/models/import', method: 'DELETE', data: { models } })
// 模型价格（公开只读，api-stats 用户页）
export const getPublicModelPricingApi = () =>
  request({ url: '/apiStats/model-pricing', method: 'GET' })

// API Stats
export const getKeyIdApi = (apiKey) =>
  request({ url: '/apiStats/api/get-key-id', method: 'POST', data: { apiKey } })
export const getUserStatsApi = (apiId) =>
  request({ url: '/apiStats/api/user-stats', method: 'POST', data: { apiId } })
export const getUserModelStatsApi = (apiId, period = 'daily') =>
  request({ url: '/apiStats/api/user-model-stats', method: 'POST', data: { apiId, period } })
export const getPublicApiKeyUsageRecordsApi = (apiId, params = {}) =>
  request({ url: '/apiStats/api/user-usage-records', method: 'GET', params: { apiId, ...params } })
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

// 代理池管理
export const getProxyPoolOverviewApi = () =>
  request({ url: '/admin/proxy-pool/overview', method: 'GET' })
export const getProxiesApi = () => request({ url: '/admin/proxy-pool/proxies', method: 'GET' })
export const createProxyApi = (data) =>
  request({ url: '/admin/proxy-pool/proxies', method: 'POST', data })
export const updateProxyApi = (id, data) =>
  request({ url: `/admin/proxy-pool/proxies/${id}`, method: 'PUT', data })
export const deleteProxyApi = (id) =>
  request({ url: `/admin/proxy-pool/proxies/${id}`, method: 'DELETE' })
export const healthCheckProxyApi = (id) =>
  request({ url: `/admin/proxy-pool/proxies/${id}/health-check`, method: 'POST' })
export const qualityCheckProxyApi = (id) =>
  request({ url: `/admin/proxy-pool/proxies/${id}/quality-check`, method: 'POST' })
export const getProxyHealthHistoryApi = (id) =>
  request({ url: `/admin/proxy-pool/proxies/${id}/health-history`, method: 'GET' })
export const getProxyGroupsApi = () => request({ url: '/admin/proxy-pool/groups', method: 'GET' })
export const createProxyGroupApi = (data) =>
  request({ url: '/admin/proxy-pool/groups', method: 'POST', data })
export const updateProxyGroupApi = (id, data) =>
  request({ url: `/admin/proxy-pool/groups/${id}`, method: 'PUT', data })
export const deleteProxyGroupApi = (id) =>
  request({ url: `/admin/proxy-pool/groups/${id}`, method: 'DELETE' })
export const getProxyPoolSettingsApi = () =>
  request({ url: '/admin/proxy-pool/settings', method: 'GET' })
export const updateProxyPoolSettingsApi = (data) =>
  request({ url: '/admin/proxy-pool/settings', method: 'PUT', data })

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
export const getRequestDetailsApi = (params) =>
  request({ url: '/admin/request-details', method: 'GET', params })
export const getRequestDetailBodyPreviewStatsApi = (config) =>
  request({ url: '/admin/request-details/body-preview-stats', method: 'GET', ...config })
export const purgeRequestDetailBodyPreviewApi = (config) =>
  request({ url: '/admin/request-details/body-preview-purge', method: 'POST', ...config })
export const getRequestDetailApi = (requestId) =>
  request({ url: `/admin/request-details/${requestId}`, method: 'GET' })

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
export const getDeletedApiKeysApi = (params) =>
  request({ url: '/admin/api-keys/deleted', method: 'GET', params })
export const getApiKeysCostSortStatusApi = () =>
  request({ url: '/admin/api-keys/cost-sort-status', method: 'GET' })
export const restoreApiKeyApi = (id) =>
  request({ url: `/admin/api-keys/${id}/restore`, method: 'POST' })
export const permanentDeleteApiKeyApi = (id) =>
  request({ url: `/admin/api-keys/${id}/permanent`, method: 'DELETE' })
export const clearAllDeletedApiKeysApi = () =>
  request({ url: '/admin/api-keys/deleted/clear-all', method: 'DELETE' })
export const batchPermanentDeleteApiKeysApi = (data) =>
  request({ url: '/admin/api-keys/deleted/batch', method: 'DELETE', data })
export const batchDeleteApiKeysApi = (data) =>
  request({ url: '/admin/api-keys/batch', method: 'DELETE', data })
export const updateApiKeyExpirationApi = (id, data) =>
  request({ url: `/admin/api-keys/${id}/expiration`, method: 'PATCH', data })
export const quickAdjustApiKeyApi = (id, data) =>
  request({ url: `/admin/api-keys/${id}/quick-adjust`, method: 'POST', data })
export const getApiKeyChangeHistoryApi = (id, params) =>
  request({ url: `/admin/api-keys/${id}/change-history`, method: 'GET', params })
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

// Claude 账户定时测试配置
export const getClaudeAccountTestConfigApi = (id) =>
  request({ url: `/admin/claude-accounts/${id}/test-config`, method: 'GET' })
export const updateClaudeAccountTestConfigApi = (id, data) =>
  request({ url: `/admin/claude-accounts/${id}/test-config`, method: 'PUT', data })
export const getClaudeAccountTestHistoryApi = (id) =>
  request({ url: `/admin/claude-accounts/${id}/test-history`, method: 'GET' })

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

// Grok / xAI 账户
export const getGrokAccountsApi = () => request({ url: '/admin/grok-accounts', method: 'GET' })
export const createGrokAccountApi = (data) =>
  request({ url: '/admin/grok-accounts', method: 'POST', data })
export const updateGrokAccountApi = (id, data) =>
  request({ url: `/admin/grok-accounts/${id}`, method: 'PUT', data })
export const generateGrokAuthUrlApi = (data) =>
  request({ url: '/admin/grok-accounts/generate-auth-url', method: 'POST', data })
export const exchangeGrokCodeApi = (data) =>
  request({ url: '/admin/grok-accounts/exchange-code', method: 'POST', data })
export const createGrokAccountFromOAuthApi = (data) =>
  request({ url: '/admin/grok-accounts/create-from-oauth', method: 'POST', data })
export const getGrokAccountByIdApi = (id) =>
  request({ url: `/admin/grok-accounts/${id}`, method: 'GET' })
export const refreshGrokAccountTokenApi = (id) =>
  request({ url: `/admin/grok-accounts/${id}/refresh-token`, method: 'POST' })
export const getGrokAccountQuotaApi = (id) =>
  request({ url: `/admin/grok-accounts/${id}/quota`, method: 'GET' })
export const importGrokSsoAccountsApi = (data) =>
  request({ url: '/admin/grok-accounts/sso-to-oauth', method: 'POST', data })
export const getGrokMediaEligibilityApi = (id) =>
  request({ url: `/admin/grok-accounts/${id}/media-eligibility`, method: 'GET' })

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
export const toggleQuotaCardApi = (id, enabled) =>
  request({ url: `/admin/quota-cards/${id}/toggle`, method: 'POST', data: { enabled } })
export const getQuotaCardsWithParamsApi = (params) =>
  request({ url: '/admin/quota-cards', method: 'GET', params })
export const getQuotaCardsStatsApi = () =>
  request({ url: '/admin/quota-cards/stats', method: 'GET' })
export const getRedemptionsApi = (params = {}) =>
  request({ url: '/admin/redemptions', method: 'GET', params })
export const revokeRedemptionApi = (id, data) =>
  request({ url: `/admin/redemptions/${id}/revoke`, method: 'POST', data })
export const getQuotaCardLimitsApi = () =>
  request({ url: '/admin/quota-cards/limits', method: 'GET' })
export const updateQuotaCardLimitsApi = (data) =>
  request({ url: '/admin/quota-cards/limits', method: 'PUT', data })

// 账户余额
export const getAccountBalanceApi = (id, params) =>
  request({ url: `/admin/accounts/${id}/balance`, method: 'GET', params })

// 账户错误历史
export const getAccountErrorHistoryApi = (accountType, accountId, params) =>
  request({ url: `/admin/accounts/${accountType}/${accountId}/error-history`, params })
export const clearAccountErrorHistoryApi = (accountType, accountId) =>
  request({ url: `/admin/accounts/${accountType}/${accountId}/error-history`, method: 'DELETE' })
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

// 连通性测试默认模型配置
export const getTestModelConfigApi = (config) =>
  request({ url: '/admin/test-model-config', method: 'GET', ...config })
export const updateTestModelConfigApi = (data, config) =>
  request({ url: '/admin/test-model-config', method: 'PUT', data, ...config })

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

// 支付 - 用户侧（充值页）。涉及具体 key 的接口都用【完整 apiKey】验证持有（POST），不传裸 apiId
export const getPaymentPlansApi = () => request({ url: '/payment/plans', method: 'GET' })
// 用完整 apiKey 换取短期会话 token（仅此一次上行明文 apiKey）
export const createPaymentSessionApi = (apiKey) =>
  request({ url: '/payment/session', method: 'POST', data: { apiKey } })
export const getPaymentBalanceApi = (token) =>
  request({ url: '/payment/balance', method: 'POST', data: { token } })
export const createPaymentOrderApi = (data) =>
  request({ url: '/payment/orders', method: 'POST', data })
export const getMyPaymentOrdersApi = (data = {}) =>
  request({ url: '/payment/orders/query', method: 'POST', data })
export const getPaymentOrderApi = (id, token) =>
  request({ url: `/payment/orders/${id}/get`, method: 'POST', data: { token } })
export const verifyPaymentOrderApi = (id, token) =>
  request({ url: `/payment/orders/${id}/verify`, method: 'POST', data: { token } })
export const cancelPaymentOrderApi = (id, token) =>
  request({ url: `/payment/orders/${id}/cancel`, method: 'POST', data: { token } })

// 支付 - 管理侧
export const getPaymentConfigApi = () => request({ url: '/admin/payment/config', method: 'GET' })
export const updatePaymentConfigApi = (data) =>
  request({ url: '/admin/payment/config', method: 'PUT', data })
export const getPaymentPlansAdminApi = () => request({ url: '/admin/payment/plans', method: 'GET' })
export const createPaymentPlanApi = (data) =>
  request({ url: '/admin/payment/plans', method: 'POST', data })
export const updatePaymentPlanApi = (id, data) =>
  request({ url: `/admin/payment/plans/${id}`, method: 'PUT', data })
export const deletePaymentPlanApi = (id) =>
  request({ url: `/admin/payment/plans/${id}`, method: 'DELETE' })
export const getPaymentProvidersApi = () =>
  request({ url: '/admin/payment/providers', method: 'GET' })
export const getPaymentProviderApi = (id) =>
  request({ url: `/admin/payment/providers/${id}`, method: 'GET' })
export const createPaymentProviderApi = (data) =>
  request({ url: '/admin/payment/providers', method: 'POST', data })
export const updatePaymentProviderApi = (id, data) =>
  request({ url: `/admin/payment/providers/${id}`, method: 'PUT', data })
export const deletePaymentProviderApi = (id) =>
  request({ url: `/admin/payment/providers/${id}`, method: 'DELETE' })
export const getPaymentOrdersAdminApi = (params = {}) =>
  request({ url: '/admin/payment/orders', method: 'GET', params })
export const verifyPaymentOrderAdminApi = (id) =>
  request({ url: `/admin/payment/orders/${id}/verify`, method: 'POST' })
export const manualCompletePaymentOrderApi = (id, data) =>
  request({ url: `/admin/payment/orders/${id}/manual-complete`, method: 'POST', data })
export const refundPaymentOrderApi = (id) =>
  request({ url: `/admin/payment/orders/${id}/refund`, method: 'POST' })
export const resolvePaymentRefundApi = (id, outcome) =>
  request({ url: `/admin/payment/orders/${id}/refund/resolve`, method: 'POST', data: { outcome } })
export const getPaymentDashboardApi = () =>
  request({ url: '/admin/payment/dashboard', method: 'GET' })
export const getPaymentOrderAuditApi = (id) =>
  request({ url: `/admin/payment/orders/${id}/audit`, method: 'GET' })

// 账户导入/导出（迁移）
// 导出返回原始 Response，便于读取 Content-Disposition 文件名与 X-Export-*-Count 计数头
export const exportAccountsApi = ({ format = 'crs', ids = null } = {}) => {
  const params = { format, include_secrets: true }
  if (Array.isArray(ids) && ids.length > 0) {
    params.ids = ids.join(',')
  }
  return request({ url: '/admin/accounts/export', method: 'GET', params, responseType: 'response' })
}
export const inspectAccountImportApi = (data) =>
  request({ url: '/admin/accounts/import/inspect', method: 'POST', data })
export const importAccountsApi = (data) =>
  request({ url: '/admin/accounts/import', method: 'POST', data })
