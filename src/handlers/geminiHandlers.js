/**
 * Gemini API 处理函数模块
 *
 * 该模块包含所有 Gemini API 的处理函数，供 geminiRoutes.js 和 standardGeminiRoutes.js 共享使用。
 * 这样可以避免代码重复，确保处理逻辑的一致性。
 */

const logger = require('../utils/logger')
const geminiAccountService = require('../services/geminiAccountService')
const geminiApiAccountService = require('../services/geminiApiAccountService')
const { sendGeminiRequest, getAvailableModels } = require('../services/geminiRelayService')
const crypto = require('crypto')
const sessionHelper = require('../utils/sessionHelper')
const unifiedGeminiScheduler = require('../services/unifiedGeminiScheduler')
const apiKeyService = require('../services/apiKeyService')
const { updateRateLimitCounters } = require('../utils/rateLimitHelper')
const { parseSSELine } = require('../utils/sseParser')
const axios = require('axios')
const ProxyHelper = require('../utils/proxyHelper')

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 生成会话哈希
 */
function generateSessionHash(req) {
  const apiKeyPrefix =
    req.headers['x-api-key']?.substring(0, 10) || req.headers['x-goog-api-key']?.substring(0, 10)

  const sessionData = [req.headers['user-agent'], req.ip, apiKeyPrefix].filter(Boolean).join(':')

  return crypto.createHash('sha256').update(sessionData).digest('hex')
}

/**
 * 检查 API Key 权限
 */
function checkPermissions(apiKeyData, requiredPermission = 'gemini') {
  const permissions = apiKeyData?.permissions || 'all'
  return permissions === 'all' || permissions === requiredPermission
}

/**
 * 确保请求具有 Gemini 访问权限
 */
function ensureGeminiPermission(req, res) {
  const apiKeyData = req.apiKey || {}
  if (checkPermissions(apiKeyData, 'gemini')) {
    return true
  }

  logger.security(
    `🚫 API Key ${apiKeyData.id || 'unknown'} 缺少 Gemini 权限，拒绝访问 ${req.originalUrl}`
  )

  res.status(403).json({
    error: {
      message: 'This API key does not have permission to access Gemini',
      type: 'permission_denied'
    }
  })
  return false
}

/**
 * 权限检查中间件
 */
function ensureGeminiPermissionMiddleware(req, res, next) {
  if (ensureGeminiPermission(req, res)) {
    return next()
  }
  return undefined
}

/**
 * 应用速率限制跟踪
 */
async function applyRateLimitTracking(req, usageSummary, model, context = '') {
  if (!req.rateLimitInfo) {
    return
  }

  const label = context ? ` (${context})` : ''

  try {
    const { totalTokens, totalCost } = await updateRateLimitCounters(
      req.rateLimitInfo,
      usageSummary,
      model
    )

    if (totalTokens > 0) {
      logger.api(`📊 Updated rate limit token count${label}: +${totalTokens} tokens`)
    }
    if (typeof totalCost === 'number' && totalCost > 0) {
      logger.api(`💰 Updated rate limit cost count${label}: +$${totalCost.toFixed(6)}`)
    }
  } catch (error) {
    logger.error(`❌ Failed to update rate limit counters${label}:`, error)
  }
}

/**
 * 判断对象是否为可读流
 */
function isReadableStream(value) {
  return value && typeof value.on === 'function' && typeof value.pipe === 'function'
}

/**
 * 读取可读流内容为字符串
 */
async function readStreamToString(stream) {
  return new Promise((resolve, reject) => {
    let result = ''

    try {
      if (typeof stream.setEncoding === 'function') {
        stream.setEncoding('utf8')
      }
    } catch (error) {
      logger.warn('设置流编码失败:', error)
    }

    stream.on('data', (chunk) => {
      result += chunk
    })

    stream.on('end', () => {
      resolve(result)
    })

    stream.on('error', (error) => {
      reject(error)
    })
  })
}

/**
 * 规范化上游 Axios 错误信息
 */
async function normalizeAxiosStreamError(error) {
  const status = error.response?.status
  const statusText = error.response?.statusText
  const responseData = error.response?.data
  let rawBody = null
  let parsedBody = null

  if (responseData) {
    try {
      if (isReadableStream(responseData)) {
        rawBody = await readStreamToString(responseData)
      } else if (Buffer.isBuffer(responseData)) {
        rawBody = responseData.toString('utf8')
      } else if (typeof responseData === 'string') {
        rawBody = responseData
      } else {
        rawBody = JSON.stringify(responseData)
      }
    } catch (streamError) {
      logger.warn('读取 Gemini 上游错误流失败:', streamError)
    }
  }

  if (rawBody) {
    if (typeof rawBody === 'string') {
      try {
        parsedBody = JSON.parse(rawBody)
      } catch (parseError) {
        parsedBody = rawBody
      }
    } else {
      parsedBody = rawBody
    }
  }

  let finalMessage = error.message || 'Internal server error'
  if (parsedBody && typeof parsedBody === 'object') {
    finalMessage = parsedBody.error?.message || parsedBody.message || finalMessage
  } else if (typeof parsedBody === 'string' && parsedBody.trim()) {
    finalMessage = parsedBody.trim()
  }

  return {
    status,
    statusText,
    message: finalMessage,
    parsedBody,
    rawBody
  }
}

/**
 * 解析账户代理配置
 */
function parseProxyConfig(account) {
  let proxyConfig = null
  if (account.proxy) {
    try {
      proxyConfig = typeof account.proxy === 'string' ? JSON.parse(account.proxy) : account.proxy
    } catch (e) {
      logger.warn('Failed to parse proxy configuration:', e)
    }
  }
  return proxyConfig
}

// ============================================================================
// 处理函数 - OpenAI 兼容格式（/messages 端点）
// ============================================================================

/**
 * 处理 OpenAI 兼容格式的消息请求
 */
async function handleMessages(req, res) {
  const startTime = Date.now()
  let abortController = null
  let accountId
  let accountType
  let sessionHash

  try {
    const apiKeyData = req.apiKey

    // 检查权限
    if (!checkPermissions(apiKeyData, 'gemini')) {
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access Gemini',
          type: 'permission_denied'
        }
      })
    }

    // 提取请求参数
    const {
      messages,
      model = 'gemini-2.5-flash',
      temperature = 0.7,
      max_tokens = 4096,
      stream = false
    } = req.body

    // 验证必需参数
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Messages array is required',
          type: 'invalid_request_error'
        }
      })
    }

    // 生成会话哈希用于粘性会话
    sessionHash = generateSessionHash(req)

    // 使用统一调度选择可用的 Gemini 账户（传递请求的模型）
    try {
      const schedulerResult = await unifiedGeminiScheduler.selectAccountForApiKey(
        apiKeyData,
        sessionHash,
        model, // 传递请求的模型进行过滤
        { allowApiAccounts: true } // 允许调度 API 账户
      )
      ;({ accountId, accountType } = schedulerResult)
    } catch (error) {
      logger.error('Failed to select Gemini account:', error)
      return res.status(503).json({
        error: {
          message: error.message || 'No available Gemini accounts',
          type: 'service_unavailable'
        }
      })
    }

    // 判断账户类型：根据 accountType 判断，而非 accountId 前缀
    const isApiAccount = accountType === 'gemini-api'

    // 获取账户详情
    let account
    if (isApiAccount) {
      account = await geminiApiAccountService.getAccount(accountId)
      if (!account) {
        return res.status(503).json({
          error: {
            message: 'Gemini API account not found',
            type: 'service_unavailable'
          }
        })
      }
      logger.info(`Using Gemini API account: ${account.id} for API key: ${apiKeyData.id}`)
      // 标记 API 账户被使用
      await geminiApiAccountService.markAccountUsed(account.id)
    } else {
      account = await geminiAccountService.getAccount(accountId)
      if (!account) {
        return res.status(503).json({
          error: {
            message: 'Gemini OAuth account not found',
            type: 'service_unavailable'
          }
        })
      }
      logger.info(`Using Gemini OAuth account: ${account.id} for API key: ${apiKeyData.id}`)
      // 标记 OAuth 账户被使用
      await geminiAccountService.markAccountUsed(account.id)
    }

    // 创建中止控制器
    abortController = new AbortController()

    // 处理客户端断开连接
    req.on('close', () => {
      if (abortController && !abortController.signal.aborted) {
        logger.info('Client disconnected, aborting Gemini request')
        abortController.abort()
      }
    })

    let geminiResponse

    if (isApiAccount) {
      // API 账户：直接调用 Google Gemini API
      // 转换 OpenAI 格式的 messages 为 Gemini 格式的 contents
      const contents = messages.map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: [{ text: msg.content }]
      }))

      const requestBody = {
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: max_tokens,
          topP: 0.95,
          topK: 40
        }
      }

      // 解析代理配置
      const proxyConfig = parseProxyConfig(account)

      const apiUrl = stream
        ? `${account.baseUrl}/v1beta/models/${model}:streamGenerateContent?key=${account.apiKey}&alt=sse`
        : `${account.baseUrl}/v1beta/models/${model}:generateContent?key=${account.apiKey}`

      const axiosConfig = {
        method: 'POST',
        url: apiUrl,
        data: requestBody,
        headers: {
          'Content-Type': 'application/json'
        },
        responseType: stream ? 'stream' : 'json',
        signal: abortController.signal
      }

      // 添加代理配置
      if (proxyConfig) {
        const proxyHelper = new ProxyHelper()
        axiosConfig.httpsAgent = proxyHelper.createProxyAgent(proxyConfig)
        axiosConfig.httpAgent = proxyHelper.createProxyAgent(proxyConfig)
      }

      try {
        const apiResponse = await axios(axiosConfig)
        if (stream) {
          geminiResponse = apiResponse.data
        } else {
          // 转换为 OpenAI 兼容格式
          const geminiData = apiResponse.data
          geminiResponse = {
            id: crypto.randomUUID(),
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content:
                    geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated'
                },
                finish_reason: 'stop'
              }
            ],
            usage: {
              prompt_tokens: geminiData.usageMetadata?.promptTokenCount || 0,
              completion_tokens: geminiData.usageMetadata?.candidatesTokenCount || 0,
              total_tokens: geminiData.usageMetadata?.totalTokenCount || 0
            }
          }

          // 记录使用统计
          if (geminiData.usageMetadata) {
            await apiKeyService.recordUsage(
              apiKeyData.id,
              geminiData.usageMetadata.promptTokenCount || 0,
              geminiData.usageMetadata.candidatesTokenCount || 0,
              0,
              0,
              model,
              accountId
            )
          }
        }
      } catch (error) {
        logger.error('Gemini API request failed:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        })
        throw error
      }
    } else {
      // OAuth 账户：使用现有的 sendGeminiRequest
      geminiResponse = await sendGeminiRequest({
        messages,
        model,
        temperature,
        maxTokens: max_tokens,
        stream,
        accessToken: account.accessToken,
        proxy: account.proxy,
        apiKeyId: apiKeyData.id,
        signal: abortController.signal,
        projectId: account.projectId,
        accountId: account.id
      })
    }

    if (stream) {
      // 设置流式响应头
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')

      if (isApiAccount) {
        // API 账户：处理 SSE 流并记录使用统计
        let totalUsage = {
          promptTokenCount: 0,
          candidatesTokenCount: 0,
          totalTokenCount: 0
        }

        geminiResponse.on('data', (chunk) => {
          try {
            const chunkStr = chunk.toString()
            res.write(chunkStr)

            // 尝试从 SSE 流中提取 usage 数据
            const lines = chunkStr.split('\n')
            for (const line of lines) {
              if (line.startsWith('data:')) {
                const data = line.substring(5).trim()
                if (data && data !== '[DONE]') {
                  try {
                    const parsed = JSON.parse(data)
                    if (parsed.usageMetadata || parsed.response?.usageMetadata) {
                      totalUsage = parsed.usageMetadata || parsed.response.usageMetadata
                    }
                  } catch (e) {
                    // 解析失败，忽略
                  }
                }
              }
            }
          } catch (error) {
            logger.error('Error processing stream chunk:', error)
          }
        })

        geminiResponse.on('end', () => {
          res.end()

          // 异步记录使用统计
          if (totalUsage.totalTokenCount > 0) {
            apiKeyService
              .recordUsage(
                apiKeyData.id,
                totalUsage.promptTokenCount || 0,
                totalUsage.candidatesTokenCount || 0,
                0,
                0,
                model,
                accountId
              )
              .then(() => {
                logger.info(
                  `📊 Recorded Gemini API stream usage - Input: ${totalUsage.promptTokenCount}, Output: ${totalUsage.candidatesTokenCount}`
                )
              })
              .catch((error) => {
                logger.error('Failed to record Gemini API usage:', error)
              })
          }
        })

        geminiResponse.on('error', (error) => {
          logger.error('Stream error:', error)
          if (!res.headersSent) {
            res.status(500).json({
              error: {
                message: error.message || 'Stream error',
                type: 'api_error'
              }
            })
          } else {
            res.end()
          }
        })
      } else {
        // OAuth 账户：使用原有的流式传输逻辑
        for await (const chunk of geminiResponse) {
          if (abortController.signal.aborted) {
            break
          }
          res.write(chunk)
        }
        res.end()
      }
    } else {
      // 非流式响应
      res.json(geminiResponse)
    }

    const duration = Date.now() - startTime
    logger.info(`Gemini request completed in ${duration}ms`)
  } catch (error) {
    logger.error('Gemini request error:', error)

    // 处理速率限制
    const errorStatus = error.response?.status || error.status
    if (errorStatus === 429 && accountId) {
      try {
        const rateLimitAccountType = accountType || 'gemini'
        await unifiedGeminiScheduler.markAccountRateLimited(
          accountId,
          rateLimitAccountType,
          sessionHash
        )
        logger.warn(`⚠️ Gemini account ${accountId} rate limited (/messages), marking as limited`)
      } catch (limitError) {
        logger.warn('Failed to mark account as rate limited:', limitError)
      }
    }

    // 返回错误响应
    const status = errorStatus || 500
    const errorResponse = {
      error: error.error || {
        message: error.message || 'Internal server error',
        type: 'api_error'
      }
    }

    res.status(status).json(errorResponse)
  } finally {
    // 清理资源
    if (abortController) {
      abortController = null
    }
  }
  return undefined
}

// ============================================================================
// 处理函数 - 模型列表和详情
// ============================================================================

/**
 * 获取可用模型列表
 */
async function handleModels(req, res) {
  try {
    const apiKeyData = req.apiKey

    // 检查权限
    if (!checkPermissions(apiKeyData, 'gemini')) {
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access Gemini',
          type: 'permission_denied'
        }
      })
    }

    // 选择账户获取模型列表
    let account = null
    try {
      const accountSelection = await unifiedGeminiScheduler.selectAccountForApiKey(
        apiKeyData,
        null,
        null
      )
      account = await geminiAccountService.getAccount(accountSelection.accountId)
    } catch (error) {
      logger.warn('Failed to select Gemini account for models endpoint:', error)
    }

    if (!account) {
      // 返回默认模型列表
      return res.json({
        object: 'list',
        data: [
          {
            id: 'gemini-2.5-flash',
            object: 'model',
            created: Date.now() / 1000,
            owned_by: 'google'
          }
        ]
      })
    }

    // 获取模型列表
    const models = await getAvailableModels(account.accessToken, account.proxy)

    res.json({
      object: 'list',
      data: models
    })
  } catch (error) {
    logger.error('Failed to get Gemini models:', error)
    res.status(500).json({
      error: {
        message: 'Failed to retrieve models',
        type: 'api_error'
      }
    })
  }
  return undefined
}

/**
 * 获取模型详情（标准 Gemini API 格式）
 */
function handleModelDetails(req, res) {
  const { modelName } = req.params
  const version = req.path.includes('v1beta') ? 'v1beta' : 'v1'
  logger.info(`Standard Gemini API model details request (${version}): ${modelName}`)

  res.json({
    name: `models/${modelName}`,
    version: '001',
    displayName: modelName,
    description: `Gemini model: ${modelName}`,
    inputTokenLimit: 1048576,
    outputTokenLimit: 8192,
    supportedGenerationMethods: ['generateContent', 'streamGenerateContent', 'countTokens'],
    temperature: 1.0,
    topP: 0.95,
    topK: 40
  })
}

// ============================================================================
// 处理函数 - 使用统计和 API Key 信息
// ============================================================================

/**
 * 获取使用情况统计
 */
async function handleUsage(req, res) {
  try {
    const { usage } = req.apiKey

    res.json({
      object: 'usage',
      total_tokens: usage.total.tokens,
      total_requests: usage.total.requests,
      daily_tokens: usage.daily.tokens,
      daily_requests: usage.daily.requests,
      monthly_tokens: usage.monthly.tokens,
      monthly_requests: usage.monthly.requests
    })
  } catch (error) {
    logger.error('Failed to get usage stats:', error)
    res.status(500).json({
      error: {
        message: 'Failed to retrieve usage statistics',
        type: 'api_error'
      }
    })
  }
}

/**
 * 获取 API Key 信息
 */
async function handleKeyInfo(req, res) {
  try {
    const keyData = req.apiKey

    res.json({
      id: keyData.id,
      name: keyData.name,
      permissions: keyData.permissions || 'all',
      token_limit: keyData.tokenLimit,
      tokens_used: keyData.usage.total.tokens,
      tokens_remaining:
        keyData.tokenLimit > 0
          ? Math.max(0, keyData.tokenLimit - keyData.usage.total.tokens)
          : null,
      rate_limit: {
        window: keyData.rateLimitWindow,
        requests: keyData.rateLimitRequests
      },
      concurrency_limit: keyData.concurrencyLimit,
      model_restrictions: {
        enabled: keyData.enableModelRestriction,
        models: keyData.restrictedModels
      }
    })
  } catch (error) {
    logger.error('Failed to get key info:', error)
    res.status(500).json({
      error: {
        message: 'Failed to retrieve API key information',
        type: 'api_error'
      }
    })
  }
}

// ============================================================================
// 处理函数 - v1internal 格式（Gemini CLI 内部格式）
// ============================================================================

/**
 * 简单端点处理函数工厂（用于直接转发的端点）
 */
function handleSimpleEndpoint(apiMethod) {
  return async (req, res) => {
    try {
      if (!ensureGeminiPermission(req, res)) {
        return undefined
      }

      const sessionHash = sessionHelper.generateSessionHash(req.body)

      // 从路径参数或请求体中获取模型名
      const requestedModel = req.body.model || req.params.modelName || 'gemini-2.5-flash'
      const { accountId } = await unifiedGeminiScheduler.selectAccountForApiKey(
        req.apiKey,
        sessionHash,
        requestedModel
      )
      const account = await geminiAccountService.getAccount(accountId)
      const { accessToken, refreshToken } = account

      const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal'
      logger.info(`${apiMethod} request (${version})`, {
        apiKeyId: req.apiKey?.id || 'unknown',
        requestBody: req.body
      })

      // 解析账户的代理配置
      const proxyConfig = parseProxyConfig(account)

      const client = await geminiAccountService.getOauthClient(
        accessToken,
        refreshToken,
        proxyConfig
      )

      // 直接转发请求体，不做特殊处理
      const response = await geminiAccountService.forwardToCodeAssist(
        client,
        apiMethod,
        req.body,
        proxyConfig
      )

      res.json(response)
    } catch (error) {
      const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal'
      logger.error(`Error in ${apiMethod} endpoint (${version})`, { error: error.message })
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      })
    }
  }
}

/**
 * 处理 loadCodeAssist 请求
 */
async function handleLoadCodeAssist(req, res) {
  try {
    if (!ensureGeminiPermission(req, res)) {
      return undefined
    }

    const sessionHash = sessionHelper.generateSessionHash(req.body)

    // 从路径参数或请求体中获取模型名
    const requestedModel = req.body.model || req.params.modelName || 'gemini-2.5-flash'
    const { accountId } = await unifiedGeminiScheduler.selectAccountForApiKey(
      req.apiKey,
      sessionHash,
      requestedModel
    )
    const account = await geminiAccountService.getAccount(accountId)
    const { accessToken, refreshToken, projectId } = account

    const { metadata, cloudaicompanionProject } = req.body

    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal'
    logger.info(`LoadCodeAssist request (${version})`, {
      metadata: metadata || {},
      requestedProject: cloudaicompanionProject || null,
      accountProject: projectId || null,
      apiKeyId: req.apiKey?.id || 'unknown'
    })

    // 解析账户的代理配置
    const proxyConfig = parseProxyConfig(account)

    const client = await geminiAccountService.getOauthClient(accessToken, refreshToken, proxyConfig)

    // 智能处理项目ID
    const effectiveProjectId = projectId || cloudaicompanionProject || null

    logger.info('📋 loadCodeAssist项目ID处理逻辑', {
      accountProjectId: projectId,
      requestProjectId: cloudaicompanionProject,
      effectiveProjectId,
      decision: projectId
        ? '使用账户配置'
        : cloudaicompanionProject
          ? '使用请求参数'
          : '不使用项目ID'
    })

    const response = await geminiAccountService.loadCodeAssist(
      client,
      effectiveProjectId,
      proxyConfig
    )

    // 如果响应中包含 cloudaicompanionProject，保存到账户作为临时项目 ID
    if (response.cloudaicompanionProject && !account.projectId) {
      await geminiAccountService.updateTempProjectId(accountId, response.cloudaicompanionProject)
      logger.info(
        `📋 Cached temporary projectId from loadCodeAssist: ${response.cloudaicompanionProject}`
      )
    }

    res.json(response)
  } catch (error) {
    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal'
    logger.error(`Error in loadCodeAssist endpoint (${version})`, { error: error.message })
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
}

/**
 * 处理 onboardUser 请求
 */
async function handleOnboardUser(req, res) {
  try {
    if (!ensureGeminiPermission(req, res)) {
      return undefined
    }

    // 提取请求参数
    const { tierId, cloudaicompanionProject, metadata } = req.body
    const sessionHash = sessionHelper.generateSessionHash(req.body)

    // 从路径参数或请求体中获取模型名
    const requestedModel = req.body.model || req.params.modelName || 'gemini-2.5-flash'
    const { accountId } = await unifiedGeminiScheduler.selectAccountForApiKey(
      req.apiKey,
      sessionHash,
      requestedModel
    )
    const account = await geminiAccountService.getAccount(accountId)
    const { accessToken, refreshToken, projectId } = account

    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal'
    logger.info(`OnboardUser request (${version})`, {
      tierId: tierId || 'not provided',
      requestedProject: cloudaicompanionProject || null,
      accountProject: projectId || null,
      metadata: metadata || {},
      apiKeyId: req.apiKey?.id || 'unknown'
    })

    // 解析账户的代理配置
    const proxyConfig = parseProxyConfig(account)

    const client = await geminiAccountService.getOauthClient(accessToken, refreshToken, proxyConfig)

    // 智能处理项目ID
    const effectiveProjectId = projectId || cloudaicompanionProject || null

    logger.info('📋 onboardUser项目ID处理逻辑', {
      accountProjectId: projectId,
      requestProjectId: cloudaicompanionProject,
      effectiveProjectId,
      decision: projectId
        ? '使用账户配置'
        : cloudaicompanionProject
          ? '使用请求参数'
          : '不使用项目ID'
    })

    // 如果提供了 tierId，直接调用 onboardUser
    if (tierId) {
      const response = await geminiAccountService.onboardUser(
        client,
        tierId,
        effectiveProjectId,
        metadata,
        proxyConfig
      )

      res.json(response)
    } else {
      // 否则执行完整的 setupUser 流程
      const response = await geminiAccountService.setupUser(
        client,
        effectiveProjectId,
        metadata,
        proxyConfig
      )

      res.json(response)
    }
  } catch (error) {
    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal'
    logger.error(`Error in onboardUser endpoint (${version})`, { error: error.message })
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
}

/**
 * 处理 countTokens 请求
 */
async function handleCountTokens(req, res) {
  try {
    if (!ensureGeminiPermission(req, res)) {
      return undefined
    }

    // 处理请求体结构，支持直接 contents 或 request.contents
    const requestData = req.body.request || req.body
    const { contents } = requestData
    // 从路径参数或请求体中获取模型名
    const model = requestData.model || req.params.modelName || 'gemini-2.5-flash'
    const sessionHash = sessionHelper.generateSessionHash(req.body)

    // 验证必需参数
    if (!contents || !Array.isArray(contents)) {
      return res.status(400).json({
        error: {
          message: 'Contents array is required',
          type: 'invalid_request_error'
        }
      })
    }

    // 使用统一调度选择账号
    const { accountId } = await unifiedGeminiScheduler.selectAccountForApiKey(
      req.apiKey,
      sessionHash,
      model
    )
    const account = await geminiAccountService.getAccount(accountId)
    const { accessToken, refreshToken } = account

    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal'
    logger.info(`CountTokens request (${version})`, {
      model,
      contentsLength: contents.length,
      apiKeyId: req.apiKey?.id || 'unknown'
    })

    // 解析账户的代理配置
    const proxyConfig = parseProxyConfig(account)

    const client = await geminiAccountService.getOauthClient(accessToken, refreshToken, proxyConfig)
    const response = await geminiAccountService.countTokens(client, contents, model, proxyConfig)

    res.json(response)
  } catch (error) {
    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal'
    logger.error(`Error in countTokens endpoint (${version})`, { error: error.message })
    res.status(500).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'api_error'
      }
    })
  }
  return undefined
}

/**
 * 处理 generateContent 请求（v1internal 格式）
 */
async function handleGenerateContent(req, res) {
  try {
    if (!ensureGeminiPermission(req, res)) {
      return undefined
    }

    const { project, user_prompt_id, request: requestData } = req.body
    // 从路径参数或请求体中获取模型名
    const model = req.body.model || req.params.modelName || 'gemini-2.5-flash'
    const sessionHash = sessionHelper.generateSessionHash(req.body)

    // 处理不同格式的请求
    let actualRequestData = requestData
    if (!requestData) {
      if (req.body.messages) {
        // 这是 OpenAI 格式的请求，构建 Gemini 格式的 request 对象
        actualRequestData = {
          contents: req.body.messages.map((msg) => ({
            role: msg.role === 'assistant' ? 'model' : msg.role,
            parts: [{ text: msg.content }]
          })),
          generationConfig: {
            temperature: req.body.temperature !== undefined ? req.body.temperature : 0.7,
            maxOutputTokens: req.body.max_tokens !== undefined ? req.body.max_tokens : 4096,
            topP: req.body.top_p !== undefined ? req.body.top_p : 0.95,
            topK: req.body.top_k !== undefined ? req.body.top_k : 40
          }
        }
      } else if (req.body.contents) {
        // 直接的 Gemini 格式请求（没有 request 包装）
        actualRequestData = req.body
      }
    }

    // 验证必需参数
    if (!actualRequestData || !actualRequestData.contents) {
      return res.status(400).json({
        error: {
          message: 'Request contents are required',
          type: 'invalid_request_error'
        }
      })
    }

    // 使用统一调度选择账号（v1internal 不允许 API 账户）
    const schedulerResult = await unifiedGeminiScheduler.selectAccountForApiKey(
      req.apiKey,
      sessionHash,
      model
    )
    const { accountId, accountType } = schedulerResult

    // v1internal 路由只支持 OAuth 账户，不支持 API Key 账户
    if (accountType === 'gemini-api') {
      logger.error(`❌ v1internal routes do not support Gemini API accounts. Account: ${accountId}`)
      return res.status(400).json({
        error: {
          message:
            'This endpoint only supports Gemini OAuth accounts. Gemini API Key accounts are not compatible with v1internal format.',
          type: 'invalid_account_type'
        }
      })
    }

    const account = await geminiAccountService.getAccount(accountId)
    if (!account) {
      logger.error(`❌ Gemini account not found: ${accountId}`)
      return res.status(404).json({
        error: {
          message: 'Gemini account not found',
          type: 'account_not_found'
        }
      })
    }

    const { accessToken, refreshToken } = account

    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal'
    logger.info(`GenerateContent request (${version})`, {
      model,
      userPromptId: user_prompt_id,
      projectId: project || account.projectId,
      apiKeyId: req.apiKey?.id || 'unknown'
    })

    // 解析账户的代理配置
    const proxyConfig = parseProxyConfig(account)

    const client = await geminiAccountService.getOauthClient(accessToken, refreshToken, proxyConfig)

    // 智能处理项目ID
    const effectiveProjectId = account.projectId || project || null

    logger.info('📋 项目ID处理逻辑', {
      accountProjectId: account.projectId,
      requestProjectId: project,
      effectiveProjectId,
      decision: account.projectId ? '使用账户配置' : project ? '使用请求参数' : '不使用项目ID'
    })

    const response = await geminiAccountService.generateContent(
      client,
      { model, request: actualRequestData },
      user_prompt_id,
      effectiveProjectId,
      req.apiKey?.id,
      proxyConfig
    )

    // 记录使用统计
    if (response?.response?.usageMetadata) {
      try {
        const usage = response.response.usageMetadata
        await apiKeyService.recordUsage(
          req.apiKey.id,
          usage.promptTokenCount || 0,
          usage.candidatesTokenCount || 0,
          0,
          0,
          model,
          account.id
        )
        logger.info(
          `📊 Recorded Gemini usage - Input: ${usage.promptTokenCount}, Output: ${usage.candidatesTokenCount}, Total: ${usage.totalTokenCount}`
        )

        await applyRateLimitTracking(
          req,
          {
            inputTokens: usage.promptTokenCount || 0,
            outputTokens: usage.candidatesTokenCount || 0,
            cacheCreateTokens: 0,
            cacheReadTokens: 0
          },
          model,
          'gemini-non-stream'
        )
      } catch (error) {
        logger.error('Failed to record Gemini usage:', error)
      }
    }

    res.json(version === 'v1beta' ? response.response : response)
  } catch (error) {
    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal'
    logger.error(`Error in generateContent endpoint (${version})`, {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data,
      requestUrl: error.config?.url,
      requestMethod: error.config?.method,
      stack: error.stack
    })
    res.status(500).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'api_error'
      }
    })
  }
  return undefined
}

/**
 * 处理 streamGenerateContent 请求（v1internal 格式）
 */
async function handleStreamGenerateContent(req, res) {
  let abortController = null

  try {
    if (!ensureGeminiPermission(req, res)) {
      return undefined
    }

    const { project, user_prompt_id, request: requestData } = req.body
    // 从路径参数或请求体中获取模型名
    const model = req.body.model || req.params.modelName || 'gemini-2.5-flash'
    const sessionHash = sessionHelper.generateSessionHash(req.body)

    // 处理不同格式的请求
    let actualRequestData = requestData
    if (!requestData) {
      if (req.body.messages) {
        // 这是 OpenAI 格式的请求，构建 Gemini 格式的 request 对象
        actualRequestData = {
          contents: req.body.messages.map((msg) => ({
            role: msg.role === 'assistant' ? 'model' : msg.role,
            parts: [{ text: msg.content }]
          })),
          generationConfig: {
            temperature: req.body.temperature !== undefined ? req.body.temperature : 0.7,
            maxOutputTokens: req.body.max_tokens !== undefined ? req.body.max_tokens : 4096,
            topP: req.body.top_p !== undefined ? req.body.top_p : 0.95,
            topK: req.body.top_k !== undefined ? req.body.top_k : 40
          }
        }
      } else if (req.body.contents) {
        // 直接的 Gemini 格式请求（没有 request 包装）
        actualRequestData = req.body
      }
    }

    // 验证必需参数
    if (!actualRequestData || !actualRequestData.contents) {
      return res.status(400).json({
        error: {
          message: 'Request contents are required',
          type: 'invalid_request_error'
        }
      })
    }

    // 使用统一调度选择账号（v1internal 不允许 API 账户）
    const schedulerResult = await unifiedGeminiScheduler.selectAccountForApiKey(
      req.apiKey,
      sessionHash,
      model
    )
    const { accountId, accountType } = schedulerResult

    // v1internal 路由只支持 OAuth 账户，不支持 API Key 账户
    if (accountType === 'gemini-api') {
      logger.error(`❌ v1internal routes do not support Gemini API accounts. Account: ${accountId}`)
      return res.status(400).json({
        error: {
          message:
            'This endpoint only supports Gemini OAuth accounts. Gemini API Key accounts are not compatible with v1internal format.',
          type: 'invalid_account_type'
        }
      })
    }

    const account = await geminiAccountService.getAccount(accountId)
    if (!account) {
      logger.error(`❌ Gemini account not found: ${accountId}`)
      return res.status(404).json({
        error: {
          message: 'Gemini account not found',
          type: 'account_not_found'
        }
      })
    }

    const { accessToken, refreshToken } = account

    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal'
    logger.info(`StreamGenerateContent request (${version})`, {
      model,
      userPromptId: user_prompt_id,
      projectId: project || account.projectId,
      apiKeyId: req.apiKey?.id || 'unknown'
    })

    // 创建中止控制器
    abortController = new AbortController()

    // 处理客户端断开连接
    req.on('close', () => {
      if (abortController && !abortController.signal.aborted) {
        logger.info('Client disconnected, aborting stream request')
        abortController.abort()
      }
    })

    // 解析账户的代理配置
    const proxyConfig = parseProxyConfig(account)

    const client = await geminiAccountService.getOauthClient(accessToken, refreshToken, proxyConfig)

    // 智能处理项目ID
    const effectiveProjectId = account.projectId || project || null

    logger.info('📋 流式请求项目ID处理逻辑', {
      accountProjectId: account.projectId,
      requestProjectId: project,
      effectiveProjectId,
      decision: account.projectId ? '使用账户配置' : project ? '使用请求参数' : '不使用项目ID'
    })

    const streamResponse = await geminiAccountService.generateContentStream(
      client,
      { model, request: actualRequestData },
      user_prompt_id,
      effectiveProjectId,
      req.apiKey?.id,
      abortController.signal,
      proxyConfig
    )

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // 处理流式响应并捕获usage数据
    let streamBuffer = ''
    let totalUsage = {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0
    }
    let usageReported = false

    // SSE 心跳机制
    let heartbeatTimer = null
    let lastDataTime = Date.now()
    const HEARTBEAT_INTERVAL = 15000

    const sendHeartbeat = () => {
      const timeSinceLastData = Date.now() - lastDataTime
      if (timeSinceLastData >= HEARTBEAT_INTERVAL && !res.destroyed) {
        res.write('\n')
        logger.info(`💓 Sent SSE keepalive (gap: ${(timeSinceLastData / 1000).toFixed(1)}s)`)
      }
    }

    heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL)

    streamResponse.on('data', (chunk) => {
      try {
        lastDataTime = Date.now()

        // 立即转发原始数据
        if (!res.destroyed) {
          res.write(chunk)
        }

        // 异步提取 usage 数据
        setImmediate(() => {
          try {
            const chunkStr = chunk.toString()
            if (!chunkStr.trim() || !chunkStr.includes('usageMetadata')) {
              return
            }

            streamBuffer += chunkStr
            const lines = streamBuffer.split('\n')
            streamBuffer = lines.pop() || ''

            for (const line of lines) {
              if (!line.trim() || !line.includes('usageMetadata')) {
                continue
              }

              try {
                const parsed = parseSSELine(line)
                if (parsed.type === 'data' && parsed.data.response?.usageMetadata) {
                  totalUsage = parsed.data.response.usageMetadata
                  logger.debug('📊 Captured Gemini usage data:', totalUsage)
                }
              } catch (parseError) {
                logger.warn('⚠️ Failed to parse usage line:', parseError.message)
              }
            }
          } catch (error) {
            logger.warn('⚠️ Error extracting usage data:', error.message)
          }
        })
      } catch (error) {
        logger.error('Error processing stream chunk:', error)
      }
    })

    streamResponse.on('end', () => {
      logger.info('Stream completed successfully')

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }

      res.end()

      // 异步记录使用统计
      if (!usageReported && totalUsage.totalTokenCount > 0) {
        Promise.all([
          apiKeyService.recordUsage(
            req.apiKey.id,
            totalUsage.promptTokenCount || 0,
            totalUsage.candidatesTokenCount || 0,
            0,
            0,
            model,
            account.id
          ),
          applyRateLimitTracking(
            req,
            {
              inputTokens: totalUsage.promptTokenCount || 0,
              outputTokens: totalUsage.candidatesTokenCount || 0,
              cacheCreateTokens: 0,
              cacheReadTokens: 0
            },
            model,
            'gemini-stream'
          )
        ])
          .then(() => {
            logger.info(
              `📊 Recorded Gemini stream usage - Input: ${totalUsage.promptTokenCount}, Output: ${totalUsage.candidatesTokenCount}, Total: ${totalUsage.totalTokenCount}`
            )
            usageReported = true
          })
          .catch((error) => {
            logger.error('Failed to record Gemini usage:', error)
          })
      }
    })

    streamResponse.on('error', (error) => {
      logger.error('Stream error:', error)

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }

      if (!res.headersSent) {
        res.status(500).json({
          error: {
            message: error.message || 'Stream error',
            type: 'api_error'
          }
        })
      } else {
        if (!res.destroyed) {
          try {
            res.write(
              `data: ${JSON.stringify({
                error: {
                  message: error.message || 'Stream error',
                  type: 'stream_error',
                  code: error.code
                }
              })}\n\n`
            )
            res.write('data: [DONE]\n\n')
          } catch (writeError) {
            logger.error('Error sending error event:', writeError)
          }
        }
        res.end()
      }
    })
  } catch (error) {
    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal'
    logger.error(`Error in streamGenerateContent endpoint (${version})`, {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data,
      requestUrl: error.config?.url,
      requestMethod: error.config?.method,
      stack: error.stack
    })

    if (!res.headersSent) {
      res.status(500).json({
        error: {
          message: error.message || 'Internal server error',
          type: 'api_error'
        }
      })
    }
  } finally {
    if (abortController) {
      abortController = null
    }
  }
  return undefined
}

// ============================================================================
// 处理函数 - 标准 Gemini API 格式（/v1beta/models/:model:generateContent 等）
// ============================================================================

/**
 * 处理标准 Gemini API 格式的 generateContent（支持 OAuth 和 API 账户）
 */
async function handleStandardGenerateContent(req, res) {
  let account = null
  let sessionHash = null
  let accountId = null
  let isApiAccount = false

  try {
    if (!ensureGeminiPermission(req, res)) {
      return undefined
    }

    // 从路径参数中获取模型名
    const model = req.params.modelName || 'gemini-2.0-flash-exp'
    sessionHash = sessionHelper.generateSessionHash(req.body)

    // 标准 Gemini API 请求体直接包含 contents 等字段
    const { contents, generationConfig, safetySettings, systemInstruction, tools, toolConfig } =
      req.body

    // 验证必需参数
    if (!contents || !Array.isArray(contents) || contents.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Contents array is required',
          type: 'invalid_request_error'
        }
      })
    }

    // 构建内部 API 需要的请求格式
    const actualRequestData = {
      contents,
      generationConfig: generationConfig || {
        temperature: 0.7,
        maxOutputTokens: 4096,
        topP: 0.95,
        topK: 40
      }
    }

    // 只有在 safetySettings 存在且非空时才添加
    if (safetySettings && safetySettings.length > 0) {
      actualRequestData.safetySettings = safetySettings
    }

    // 添加工具配置
    if (tools) {
      actualRequestData.tools = tools
    }

    if (toolConfig) {
      actualRequestData.toolConfig = toolConfig
    }

    // 处理 system instruction
    if (systemInstruction) {
      if (typeof systemInstruction === 'string' && systemInstruction.trim()) {
        actualRequestData.systemInstruction = {
          role: 'user',
          parts: [{ text: systemInstruction }]
        }
      } else if (systemInstruction.parts && systemInstruction.parts.length > 0) {
        const hasContent = systemInstruction.parts.some(
          (part) => part.text && part.text.trim() !== ''
        )
        if (hasContent) {
          actualRequestData.systemInstruction = {
            role: 'user',
            parts: systemInstruction.parts
          }
        }
      }
    }

    // 使用统一调度选择账号
    const schedulerResult = await unifiedGeminiScheduler.selectAccountForApiKey(
      req.apiKey,
      sessionHash,
      model,
      { allowApiAccounts: true }
    )
    ;({ accountId } = schedulerResult)
    const { accountType } = schedulerResult

    isApiAccount = accountType === 'gemini-api'
    const actualAccountId = accountId

    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1'

    if (isApiAccount) {
      account = await geminiApiAccountService.getAccount(actualAccountId)
      if (!account) {
        return res.status(404).json({
          error: {
            message: 'Gemini API account not found',
            type: 'account_not_found'
          }
        })
      }

      logger.info(`Standard Gemini API generateContent request (${version}) - API Key Account`, {
        model,
        accountId: actualAccountId,
        apiKeyId: req.apiKey?.id || 'unknown'
      })
    } else {
      account = await geminiAccountService.getAccount(actualAccountId)

      logger.info(`Standard Gemini API generateContent request (${version}) - OAuth Account`, {
        model,
        projectId: account.projectId,
        apiKeyId: req.apiKey?.id || 'unknown'
      })
    }

    // 解析账户的代理配置
    const proxyConfig = parseProxyConfig(account)

    let response

    if (isApiAccount) {
      // Gemini API 账户：直接使用 API Key 请求
      const apiUrl = `${account.baseUrl}/v1beta/models/${model}:generateContent?key=${account.apiKey}`

      const axiosConfig = {
        method: 'POST',
        url: apiUrl,
        data: actualRequestData,
        headers: {
          'Content-Type': 'application/json'
        }
      }

      if (proxyConfig) {
        const proxyHelper = new ProxyHelper()
        axiosConfig.httpsAgent = proxyHelper.createProxyAgent(proxyConfig)
        axiosConfig.httpAgent = proxyHelper.createProxyAgent(proxyConfig)
      }

      try {
        const apiResponse = await axios(axiosConfig)
        response = { response: apiResponse.data }
      } catch (error) {
        logger.error('Gemini API request failed:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        })
        throw error
      }
    } else {
      // OAuth 账户
      const { accessToken, refreshToken } = account
      const client = await geminiAccountService.getOauthClient(
        accessToken,
        refreshToken,
        proxyConfig
      )

      let effectiveProjectId = account.projectId || account.tempProjectId || null

      if (!effectiveProjectId) {
        try {
          logger.info('📋 No projectId available, attempting to fetch from loadCodeAssist...')
          const loadResponse = await geminiAccountService.loadCodeAssist(client, null, proxyConfig)

          if (loadResponse.cloudaicompanionProject) {
            effectiveProjectId = loadResponse.cloudaicompanionProject
            await geminiAccountService.updateTempProjectId(actualAccountId, effectiveProjectId)
            logger.info(`📋 Fetched and cached temporary projectId: ${effectiveProjectId}`)
          }
        } catch (loadError) {
          logger.warn('Failed to fetch projectId from loadCodeAssist:', loadError.message)
        }
      }

      if (!effectiveProjectId) {
        return res.status(403).json({
          error: {
            message:
              'This account requires a project ID to be configured. Please configure a project ID in the account settings.',
            type: 'configuration_required'
          }
        })
      }

      logger.info('📋 Standard API 项目ID处理逻辑', {
        accountProjectId: account.projectId,
        tempProjectId: account.tempProjectId,
        effectiveProjectId,
        decision: account.projectId
          ? '使用账户配置'
          : account.tempProjectId
            ? '使用临时项目ID'
            : '从loadCodeAssist获取'
      })

      const userPromptId = `${crypto.randomUUID()}########0`

      response = await geminiAccountService.generateContent(
        client,
        { model, request: actualRequestData },
        userPromptId,
        effectiveProjectId,
        req.apiKey?.id,
        proxyConfig
      )
    }

    // 记录使用统计
    if (response?.response?.usageMetadata) {
      try {
        const usage = response.response.usageMetadata
        await apiKeyService.recordUsage(
          req.apiKey.id,
          usage.promptTokenCount || 0,
          usage.candidatesTokenCount || 0,
          0,
          0,
          model,
          accountId
        )
        logger.info(
          `📊 Recorded Gemini usage - Input: ${usage.promptTokenCount}, Output: ${usage.candidatesTokenCount}, Total: ${usage.totalTokenCount}`
        )
      } catch (error) {
        logger.error('Failed to record Gemini usage:', error)
      }
    }

    res.json(response.response || response)
  } catch (error) {
    logger.error(`Error in standard generateContent endpoint`, {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data,
      stack: error.stack
    })

    res.status(500).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'api_error'
      }
    })
  }
}

/**
 * 处理标准 Gemini API 格式的 streamGenerateContent（支持 OAuth 和 API 账户）
 */
async function handleStandardStreamGenerateContent(req, res) {
  let abortController = null
  let account = null
  let sessionHash = null
  let accountId = null
  let isApiAccount = false

  try {
    if (!ensureGeminiPermission(req, res)) {
      return undefined
    }

    // 从路径参数中获取模型名
    const model = req.params.modelName || 'gemini-2.0-flash-exp'
    sessionHash = sessionHelper.generateSessionHash(req.body)

    // 标准 Gemini API 请求体直接包含 contents 等字段
    const { contents, generationConfig, safetySettings, systemInstruction, tools, toolConfig } =
      req.body

    // 验证必需参数
    if (!contents || !Array.isArray(contents) || contents.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Contents array is required',
          type: 'invalid_request_error'
        }
      })
    }

    // 构建内部 API 需要的请求格式
    const actualRequestData = {
      contents,
      generationConfig: generationConfig || {
        temperature: 0.7,
        maxOutputTokens: 4096,
        topP: 0.95,
        topK: 40
      }
    }

    if (safetySettings && safetySettings.length > 0) {
      actualRequestData.safetySettings = safetySettings
    }

    if (tools) {
      actualRequestData.tools = tools
    }

    if (toolConfig) {
      actualRequestData.toolConfig = toolConfig
    }

    // 处理 system instruction
    if (systemInstruction) {
      if (typeof systemInstruction === 'string' && systemInstruction.trim()) {
        actualRequestData.systemInstruction = {
          role: 'user',
          parts: [{ text: systemInstruction }]
        }
      } else if (systemInstruction.parts && systemInstruction.parts.length > 0) {
        const hasContent = systemInstruction.parts.some(
          (part) => part.text && part.text.trim() !== ''
        )
        if (hasContent) {
          actualRequestData.systemInstruction = {
            role: 'user',
            parts: systemInstruction.parts
          }
        }
      }
    }

    // 使用统一调度选择账号
    const schedulerResult = await unifiedGeminiScheduler.selectAccountForApiKey(
      req.apiKey,
      sessionHash,
      model,
      { allowApiAccounts: true }
    )
    ;({ accountId } = schedulerResult)
    const { accountType } = schedulerResult

    isApiAccount = accountType === 'gemini-api'
    const actualAccountId = accountId

    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1'

    if (isApiAccount) {
      account = await geminiApiAccountService.getAccount(actualAccountId)
      if (!account) {
        return res.status(404).json({
          error: {
            message: 'Gemini API account not found',
            type: 'account_not_found'
          }
        })
      }

      logger.info(
        `Standard Gemini API streamGenerateContent request (${version}) - API Key Account`,
        {
          model,
          accountId: actualAccountId,
          apiKeyId: req.apiKey?.id || 'unknown'
        }
      )
    } else {
      account = await geminiAccountService.getAccount(actualAccountId)

      logger.info(
        `Standard Gemini API streamGenerateContent request (${version}) - OAuth Account`,
        {
          model,
          projectId: account.projectId,
          apiKeyId: req.apiKey?.id || 'unknown'
        }
      )
    }

    // 创建中止控制器
    abortController = new AbortController()

    // 处理客户端断开连接
    req.on('close', () => {
      if (abortController && !abortController.signal.aborted) {
        logger.info('Client disconnected, aborting stream request')
        abortController.abort()
      }
    })

    // 解析账户的代理配置
    const proxyConfig = parseProxyConfig(account)

    let streamResponse

    if (isApiAccount) {
      // Gemini API 账户：直接使用 API Key 请求流式接口
      const apiUrl = `${account.baseUrl}/v1beta/models/${model}:streamGenerateContent?key=${account.apiKey}&alt=sse`

      const axiosConfig = {
        method: 'POST',
        url: apiUrl,
        data: actualRequestData,
        headers: {
          'Content-Type': 'application/json'
        },
        responseType: 'stream',
        signal: abortController.signal
      }

      if (proxyConfig) {
        const proxyHelper = new ProxyHelper()
        axiosConfig.httpsAgent = proxyHelper.createProxyAgent(proxyConfig)
        axiosConfig.httpAgent = proxyHelper.createProxyAgent(proxyConfig)
      }

      try {
        const apiResponse = await axios(axiosConfig)
        streamResponse = apiResponse.data
      } catch (error) {
        logger.error('Gemini API stream request failed:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        })
        throw error
      }
    } else {
      // OAuth 账户
      const { accessToken, refreshToken } = account
      const client = await geminiAccountService.getOauthClient(
        accessToken,
        refreshToken,
        proxyConfig
      )

      let effectiveProjectId = account.projectId || account.tempProjectId || null

      if (!effectiveProjectId) {
        try {
          logger.info('📋 No projectId available, attempting to fetch from loadCodeAssist...')
          const loadResponse = await geminiAccountService.loadCodeAssist(client, null, proxyConfig)

          if (loadResponse.cloudaicompanionProject) {
            effectiveProjectId = loadResponse.cloudaicompanionProject
            await geminiAccountService.updateTempProjectId(actualAccountId, effectiveProjectId)
            logger.info(`📋 Fetched and cached temporary projectId: ${effectiveProjectId}`)
          }
        } catch (loadError) {
          logger.warn('Failed to fetch projectId from loadCodeAssist:', loadError.message)
        }
      }

      if (!effectiveProjectId) {
        return res.status(403).json({
          error: {
            message:
              'This account requires a project ID to be configured. Please configure a project ID in the account settings.',
            type: 'configuration_required'
          }
        })
      }

      logger.info('📋 Standard API 流式项目ID处理逻辑', {
        accountProjectId: account.projectId,
        tempProjectId: account.tempProjectId,
        effectiveProjectId,
        decision: account.projectId
          ? '使用账户配置'
          : account.tempProjectId
            ? '使用临时项目ID'
            : '从loadCodeAssist获取'
      })

      const userPromptId = `${crypto.randomUUID()}########0`

      streamResponse = await geminiAccountService.generateContentStream(
        client,
        { model, request: actualRequestData },
        userPromptId,
        effectiveProjectId,
        req.apiKey?.id,
        abortController.signal,
        proxyConfig
      )
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // 处理流式响应
    let totalUsage = {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0
    }

    let heartbeatTimer = null
    let lastDataTime = Date.now()
    const HEARTBEAT_INTERVAL = 15000

    const sendHeartbeat = () => {
      const timeSinceLastData = Date.now() - lastDataTime
      if (timeSinceLastData >= HEARTBEAT_INTERVAL && !res.destroyed) {
        res.write('\n')
        logger.info(`💓 Sent SSE keepalive (gap: ${(timeSinceLastData / 1000).toFixed(1)}s)`)
      }
    }

    heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL)

    let sseBuffer = ''

    const handleEventBlock = (evt) => {
      if (!evt.trim()) {
        return
      }

      const dataLines = evt.split(/\r?\n/).filter((line) => line.startsWith('data:'))
      if (dataLines.length === 0) {
        if (!res.destroyed) {
          res.write(`${evt}\n\n`)
        }
        return
      }

      const dataPayload = dataLines.map((line) => line.replace(/^data:\s?/, '')).join('\n')

      let processedPayload = null
      let parsed = null

      if (dataPayload === '[DONE]') {
        processedPayload = '[DONE]'
      } else {
        try {
          parsed = JSON.parse(dataPayload)

          if (parsed.usageMetadata) {
            totalUsage = parsed.usageMetadata
          } else if (parsed.response?.usageMetadata) {
            totalUsage = parsed.response.usageMetadata
          }

          processedPayload = JSON.stringify(parsed.response || parsed)
        } catch (e) {
          // 解析失败，直接转发原始 data
        }
      }

      const outputChunk = processedPayload === null ? `${evt}\n\n` : `data: ${processedPayload}\n\n`

      if (!res.destroyed) {
        res.write(outputChunk)
      }

      setImmediate(() => {
        try {
          const usageSource =
            processedPayload && processedPayload !== '[DONE]' ? processedPayload : dataPayload

          if (!usageSource || !usageSource.includes('usageMetadata')) {
            return
          }

          const usageObj = JSON.parse(usageSource)
          const usage = usageObj.usageMetadata || usageObj.response?.usageMetadata || usageObj.usage

          if (usage && typeof usage === 'object') {
            totalUsage = usage
            logger.debug('📊 Captured Gemini usage data (async):', totalUsage)
          }
        } catch (error) {
          // 提取用量失败时忽略
        }
      })
    }

    streamResponse.on('data', (chunk) => {
      try {
        lastDataTime = Date.now()

        sseBuffer += chunk.toString()
        const events = sseBuffer.split(/\r?\n\r?\n/)
        sseBuffer = events.pop() || ''

        for (const evt of events) {
          handleEventBlock(evt)
        }
      } catch (error) {
        logger.error('Error processing stream chunk:', error)
      }
    })

    streamResponse.on('end', () => {
      logger.info('Stream completed successfully')

      if (sseBuffer.trim()) {
        try {
          handleEventBlock(sseBuffer)
        } catch (flushError) {
          // 忽略 flush 期间的异常
        }
        sseBuffer = ''
      }

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }

      res.end()

      if (totalUsage.totalTokenCount > 0) {
        apiKeyService
          .recordUsage(
            req.apiKey.id,
            totalUsage.promptTokenCount || 0,
            totalUsage.candidatesTokenCount || 0,
            0,
            0,
            model,
            accountId
          )
          .then(() => {
            logger.info(
              `📊 Recorded Gemini stream usage - Input: ${totalUsage.promptTokenCount}, Output: ${totalUsage.candidatesTokenCount}, Total: ${totalUsage.totalTokenCount}`
            )
          })
          .catch((error) => {
            logger.error('Failed to record Gemini usage:', error)
          })
      } else {
        logger.warn(
          `⚠️ Stream completed without usage data - totalTokenCount: ${totalUsage.totalTokenCount}`
        )
      }
    })

    streamResponse.on('error', (error) => {
      logger.error('Stream error:', error)

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }

      if (!res.headersSent) {
        res.status(500).json({
          error: {
            message: error.message || 'Stream error',
            type: 'api_error'
          }
        })
      } else {
        if (!res.destroyed) {
          try {
            res.write(
              `data: ${JSON.stringify({
                error: {
                  message: error.message || 'Stream error',
                  type: 'stream_error',
                  code: error.code
                }
              })}\n\n`
            )
            res.write('data: [DONE]\n\n')
          } catch (writeError) {
            logger.error('Error sending error event:', writeError)
          }
        }
        res.end()
      }
    })
  } catch (error) {
    const normalizedError = await normalizeAxiosStreamError(error)

    logger.error(`Error in standard streamGenerateContent endpoint`, {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: normalizedError.parsedBody || normalizedError.rawBody,
      stack: error.stack
    })

    if (!res.headersSent) {
      const statusCode = normalizedError.status || 500
      const responseBody = {
        error: {
          message: normalizedError.message,
          type: 'api_error'
        }
      }

      if (normalizedError.status) {
        responseBody.error.upstreamStatus = normalizedError.status
      }
      if (normalizedError.statusText) {
        responseBody.error.upstreamStatusText = normalizedError.statusText
      }
      if (normalizedError.parsedBody && typeof normalizedError.parsedBody === 'object') {
        responseBody.error.upstreamResponse = normalizedError.parsedBody
      } else if (normalizedError.rawBody) {
        responseBody.error.upstreamRaw = normalizedError.rawBody
      }

      return res.status(statusCode).json(responseBody)
    }
  } finally {
    if (abortController) {
      abortController = null
    }
  }
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
  // 工具函数
  generateSessionHash,
  checkPermissions,
  ensureGeminiPermission,
  ensureGeminiPermissionMiddleware,
  applyRateLimitTracking,
  parseProxyConfig,
  normalizeAxiosStreamError,

  // OpenAI 兼容格式处理函数
  handleMessages,

  // 模型相关处理函数
  handleModels,
  handleModelDetails,

  // 使用统计和 API Key 信息
  handleUsage,
  handleKeyInfo,

  // v1internal 格式处理函数
  handleSimpleEndpoint,
  handleLoadCodeAssist,
  handleOnboardUser,
  handleCountTokens,
  handleGenerateContent,
  handleStreamGenerateContent,

  // 标准 Gemini API 格式处理函数
  handleStandardGenerateContent,
  handleStandardStreamGenerateContent
}
