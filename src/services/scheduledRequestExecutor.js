const axios = require('axios')
const logger = require('../utils/logger')
const ProxyHelper = require('../utils/proxyHelper')
const {
  getAccountService,
  getDefaultModelForAccountType,
  getAccountTypeName
} = require('../utils/scheduledRequestHelper')

/**
 * 定时请求执行器
 * 负责执行账户的定时ping请求
 */
class ScheduledRequestExecutor {
  constructor() {
    this.EXECUTION_TIMEOUT = 30000 // 30秒超时
  }

  /**
   * 执行某个账户的定时任务
   * @param {string} accountId - 账户ID
   * @param {string} accountType - 账户类型
   * @returns {Promise<Object>} 执行结果
   */
  async executeForAccount(accountId, accountType) {
    const startTime = Date.now()

    try {
      logger.info(`[Scheduled] Executing for ${accountType}:${accountId}`)

      // 1. 获取账户信息
      const accountService = getAccountService(accountType)
      if (!accountService) {
        throw new Error(`Unknown account type: ${accountType}`)
      }

      const account = await accountService.getAccountById(accountId)

      if (!account || Object.keys(account).length === 0) {
        throw new Error('Account not found')
      }

      if (account.status !== 'active' && account.isActive !== 'true') {
        throw new Error('Account is not active')
      }

      // 2. 构建请求
      const model = getDefaultModelForAccountType(accountType)
      const result = await this._sendRequestByAccountType(
        accountType,
        account,
        accountService,
        model
      )

      // 3. 记录成功
      const responseTime = Date.now() - startTime
      await this._updateExecutionResult(accountId, accountType, {
        status: 'success',
        responseTime,
        tokensUsed: result.usage || { input: 5, output: 2 },
        error: null
      })

      logger.success(
        `[Scheduled] ✅ Success for ${getAccountTypeName(accountType)}:${account.name} (${accountId}) in ${responseTime}ms`
      )

      return {
        success: true,
        status: 'success',
        responseTime,
        tokensUsed: result.usage,
        accountName: account.name
      }
    } catch (error) {
      // 4. 记录失败
      const responseTime = Date.now() - startTime
      await this._updateExecutionResult(accountId, accountType, {
        status: 'failed',
        responseTime,
        tokensUsed: null,
        error: error.message
      })

      logger.error(`[Scheduled] ❌ Failed for ${accountType}:${accountId}:`, error.message)

      return {
        success: false,
        status: 'failed',
        responseTime,
        error: error.message
      }
    }
  }

  /**
   * 根据账户类型发送请求
   * @param {string} accountType - 账户类型
   * @param {Object} account - 账户信息
   * @param {Object} accountService - 账户服务实例
   * @param {string} model - 模型ID
   * @returns {Promise<Object>} 响应结果
   */
  async _sendRequestByAccountType(accountType, account, accountService, model) {
    // Claude系列（claude-official, claude-console, bedrock, ccr, droid）
    if (['claude-official', 'claude-console', 'bedrock', 'ccr', 'droid'].includes(accountType)) {
      return await this._sendClaudeRequest(account, accountService, model, accountType)
    }

    // Gemini
    if (accountType === 'gemini') {
      return await this._sendGeminiRequest(account, accountService, model)
    }

    // OpenAI兼容（openai-responses, azure-openai）
    if (['openai-responses', 'azure-openai'].includes(accountType)) {
      return await this._sendOpenAIRequest(account, accountService, model, accountType)
    }

    throw new Error(`Unsupported account type: ${accountType}`)
  }

  /**
   * 发送Claude格式请求
   */
  async _sendClaudeRequest(account, accountService, model, accountType) {
    // 获取有效的access token
    const accessToken = await accountService.getValidAccessToken(account.id)

    if (!accessToken) {
      throw new Error('Failed to get valid access token')
    }

    // 构建请求
    const payload = {
      model,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'ping' }]
    }

    // 确定API端点
    let apiUrl
    if (accountType === 'bedrock') {
      apiUrl = `https://bedrock-runtime.us-east-1.amazonaws.com/model/${model}/invoke`
    } else if (accountType === 'droid') {
      apiUrl = 'https://api.factory.ai/v1/messages'
    } else {
      apiUrl = 'https://api.anthropic.com/v1/messages'
    }

    // 准备请求头
    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    }

    if (accountType !== 'bedrock') {
      headers['x-api-key'] = accessToken
    }

    // 获取代理配置
    const proxyConfig = account.proxy ? JSON.parse(account.proxy) : null
    const axiosConfig = {
      headers,
      timeout: this.EXECUTION_TIMEOUT
    }

    if (proxyConfig) {
      const proxyAgent = ProxyHelper.createProxyAgent(proxyConfig)
      if (proxyAgent) {
        axiosConfig.httpsAgent = proxyAgent
        axiosConfig.httpAgent = proxyAgent
      }
    }

    const response = await axios.post(apiUrl, payload, axiosConfig)

    return {
      usage: response.data.usage || { input_tokens: 5, output_tokens: 2 }
    }
  }

  /**
   * 发送Gemini格式请求
   */
  async _sendGeminiRequest(account, accountService, model) {
    // 获取有效的access token
    const accessToken = await accountService.getValidAccessToken(account.id)

    if (!accessToken) {
      throw new Error('Failed to get valid access token')
    }

    const apiUrl = `https://cloudcode.googleapis.com/v1/${model}:generateContent`

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'ping' }]
        }
      ],
      generationConfig: {
        maxOutputTokens: 10
      }
    }

    const proxyConfig = account.proxy ? JSON.parse(account.proxy) : null
    const axiosConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      timeout: this.EXECUTION_TIMEOUT
    }

    if (proxyConfig) {
      const proxyAgent = ProxyHelper.createProxyAgent(proxyConfig)
      if (proxyAgent) {
        axiosConfig.httpsAgent = proxyAgent
        axiosConfig.httpAgent = proxyAgent
      }
    }

    const response = await axios.post(apiUrl, payload, axiosConfig)

    return {
      usage: {
        input_tokens: response.data.usageMetadata?.promptTokenCount || 5,
        output_tokens: response.data.usageMetadata?.candidatesTokenCount || 2
      }
    }
  }

  /**
   * 发送OpenAI格式请求
   */
  async _sendOpenAIRequest(account, accountService, model, accountType) {
    // 获取API Key或凭据
    let apiKey
    let apiUrl = 'https://api.openai.com/v1/chat/completions'

    if (accountType === 'openai-responses') {
      apiKey = account.apiKey // OpenAI Responses使用apiKey字段
    } else if (accountType === 'azure-openai') {
      apiKey = account.apiKey
      // Azure OpenAI使用不同的端点
      if (account.endpoint) {
        apiUrl = `${account.endpoint}/openai/deployments/${model}/chat/completions?api-version=2024-02-15-preview`
      }
    }

    if (!apiKey) {
      throw new Error('API key not found')
    }

    const payload = {
      model,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'ping' }]
    }

    const proxyConfig = account.proxy ? JSON.parse(account.proxy) : null
    const axiosConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      timeout: this.EXECUTION_TIMEOUT
    }

    if (accountType === 'azure-openai') {
      axiosConfig.headers['api-key'] = apiKey
      delete axiosConfig.headers.Authorization
    }

    if (proxyConfig) {
      const proxyAgent = ProxyHelper.createProxyAgent(proxyConfig)
      if (proxyAgent) {
        axiosConfig.httpsAgent = proxyAgent
        axiosConfig.httpAgent = proxyAgent
      }
    }

    const response = await axios.post(apiUrl, payload, axiosConfig)

    return {
      usage: response.data.usage || { prompt_tokens: 5, completion_tokens: 2 }
    }
  }

  /**
   * 更新执行结果到账户数据
   * @param {string} accountId - 账户ID
   * @param {string} accountType - 账户类型
   * @param {Object} result - 执行结果
   */
  async _updateExecutionResult(accountId, accountType, result) {
    const accountService = getAccountService(accountType)
    if (!accountService) {
      logger.error(`[Scheduled] Unknown account type: ${accountType}`)
      return
    }

    const account = await accountService.getAccountById(accountId)
    if (!account) {
      logger.error(`[Scheduled] Account not found: ${accountId}`)
      return
    }

    // 更新 scheduledRequest 字段
    const scheduledRequest = account.scheduledRequest || {}
    scheduledRequest.lastExecutedAt = new Date().toISOString()
    scheduledRequest.lastStatus = result.status
    scheduledRequest.lastError = result.error || null

    // 调用账户服务的更新方法
    await accountService.updateAccount(accountId, { scheduledRequest })
  }
}

module.exports = new ScheduledRequestExecutor()
