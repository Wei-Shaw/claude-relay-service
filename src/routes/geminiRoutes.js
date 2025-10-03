const express = require('express')
const router = express.Router()
const logger = require('../utils/logger')
const { authenticateApiKey } = require('../middleware/auth')
const geminiAccountService = require('../services/geminiAccountService')
const { sendGeminiRequest, getAvailableModels } = require('../services/geminiRelayService')
const crypto = require('crypto')
const sessionHelper = require('../utils/sessionHelper')
const unifiedGeminiScheduler = require('../services/unifiedGeminiScheduler')
const apiKeyService = require('../services/apiKeyService')
// const { OAuth2Client } = require('google-auth-library'); // OAuth2Client is not used in this file

// 生成会话哈希
function generateSessionHash(req) {
  const sessionData = [
    req.headers['user-agent'],
    req.ip,
    req.headers['x-api-key']?.substring(0, 10)
  ]
    .filter(Boolean)
    .join(':')

  return crypto.createHash('sha256').update(sessionData).digest('hex')
}

// 检查 API Key 权限
function checkPermissions(apiKeyData, requiredPermission = 'gemini') {
  const permissions = apiKeyData.permissions || 'all'
  return permissions === 'all' || permissions === requiredPermission
}

// 确保请求具有 Gemini 访问权限
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

// Gemini 消息处理端点
router.post('/messages', authenticateApiKey, async (req, res) => {
  const startTime = Date.now()
  let abortController = null

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
    const sessionHash = generateSessionHash(req)

    // 使用统一调度选择可用的 Gemini 账户（传递请求的模型）
    let accountId
    try {
      const schedulerResult = await unifiedGeminiScheduler.selectAccountForApiKey(
        apiKeyData,
        sessionHash,
        model // 传递请求的模型进行过滤
      )
      const { accountId: selectedAccountId } = schedulerResult
      accountId = selectedAccountId
    } catch (error) {
      logger.error('Failed to select Gemini account:', error)
      return res.status(503).json({
        error: {
          message: error.message || 'No available Gemini accounts',
          type: 'service_unavailable'
        }
      })
    }

    // 获取账户详情
    const account = await geminiAccountService.getAccount(accountId)
    if (!account) {
      return res.status(503).json({
        error: {
          message: 'Selected account not found',
          type: 'service_unavailable'
        }
      })
    }

    logger.info(`Using Gemini account: ${account.id} for API key: ${apiKeyData.id}`)

    // 标记账户被使用
    await geminiAccountService.markAccountUsed(account.id)

    // 创建中止控制器
    abortController = new AbortController()

    // 处理客户端断开连接
    req.on('close', () => {
      if (abortController && !abortController.signal.aborted) {
        logger.info('Client disconnected, aborting Gemini request')
        abortController.abort()
      }
    })

    // 发送请求到 Gemini
    const geminiResponse = await sendGeminiRequest({
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

    if (stream) {
      // 设置流式响应头
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')

      // 流式传输响应
      for await (const chunk of geminiResponse) {
        if (abortController.signal.aborted) {
          break
        }
        res.write(chunk)
      }

      res.end()
    } else {
      // 非流式响应
      res.json(geminiResponse)
    }

    const duration = Date.now() - startTime
    logger.info(`Gemini request completed in ${duration}ms`)
  } catch (error) {
    logger.error('Gemini request error:', error)

    // 处理速率限制
    if (error.status === 429) {
      if (req.apiKey && req.account) {
        await geminiAccountService.setAccountRateLimited(req.account.id, true)
      }
    }

    // 返回错误响应
    const status = error.status || 500
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
})

// 获取可用模型列表
router.get('/models', authenticateApiKey, async (req, res) => {
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
})

// 使用情况统计（与 Claude 共用）
router.get('/usage', authenticateApiKey, async (req, res) => {
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
})

// API Key 信息（与 Claude 共用）
router.get('/key-info', authenticateApiKey, async (req, res) => {
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
})

// 共用的 loadCodeAssist 处理函数
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
    let proxyConfig = null
    if (account.proxy) {
      try {
        proxyConfig = typeof account.proxy === 'string' ? JSON.parse(account.proxy) : account.proxy
      } catch (e) {
        logger.warn('Failed to parse proxy configuration:', e)
      }
    }

    const client = await geminiAccountService.getOauthClient(accessToken, refreshToken, proxyConfig)

    // 智能处理项目ID：
    // 1. 如果账户配置了项目ID -> 使用账户的项目ID（覆盖请求中的）
    // 2. 如果账户没有项目ID -> 使用请求中的cloudaicompanionProject
    // 3. 都没有 -> 传null
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

// 共用的 onboardUser 处理函数
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
    let proxyConfig = null
    if (account.proxy) {
      try {
        proxyConfig = typeof account.proxy === 'string' ? JSON.parse(account.proxy) : account.proxy
      } catch (e) {
        logger.warn('Failed to parse proxy configuration:', e)
      }
    }

    const client = await geminiAccountService.getOauthClient(accessToken, refreshToken, proxyConfig)

    // 智能处理项目ID：
    // 1. 如果账户配置了项目ID -> 使用账户的项目ID（覆盖请求中的）
    // 2. 如果账户没有项目ID -> 使用请求中的cloudaicompanionProject
    // 3. 都没有 -> 传null
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
        effectiveProjectId, // 使用处理后的项目ID
        metadata,
        proxyConfig
      )

      res.json(response)
    } else {
      // 否则执行完整的 setupUser 流程
      const response = await geminiAccountService.setupUser(
        client,
        effectiveProjectId, // 使用处理后的项目ID
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

// 共用的 countTokens 处理函数
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
    let proxyConfig = null
    if (account.proxy) {
      try {
        proxyConfig = typeof account.proxy === 'string' ? JSON.parse(account.proxy) : account.proxy
      } catch (e) {
        logger.warn('Failed to parse proxy configuration:', e)
      }
    }

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

// 共用的 generateContent 处理函数
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

    // 使用统一调度选择账号
    const { accountId } = await unifiedGeminiScheduler.selectAccountForApiKey(
      req.apiKey,
      sessionHash,
      model
    )
    const account = await geminiAccountService.getAccount(accountId)
    const { accessToken, refreshToken } = account

    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal'
    logger.info(`GenerateContent request (${version})`, {
      model,
      userPromptId: user_prompt_id,
      projectId: project || account.projectId,
      apiKeyId: req.apiKey?.id || 'unknown'
    })

    // 解析账户的代理配置
    let proxyConfig = null
    if (account.proxy) {
      try {
        proxyConfig = typeof account.proxy === 'string' ? JSON.parse(account.proxy) : account.proxy
      } catch (e) {
        logger.warn('Failed to parse proxy configuration:', e)
      }
    }

    const client = await geminiAccountService.getOauthClient(accessToken, refreshToken, proxyConfig)

    // 智能处理项目ID：
    // 1. 如果账户配置了项目ID -> 使用账户的项目ID（覆盖请求中的）
    // 2. 如果账户没有项目ID -> 使用请求中的项目ID（如果有的话）
    // 3. 都没有 -> 传null
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
      effectiveProjectId, // 使用智能决策的项目ID
      req.apiKey?.id, // 使用 API Key ID 作为 session ID
      proxyConfig // 传递代理配置
    )

    // 记录使用统计
    if (response?.response?.usageMetadata) {
      try {
        const usage = response.response.usageMetadata
        await apiKeyService.recordUsage(
          req.apiKey.id,
          usage.promptTokenCount || 0,
          usage.candidatesTokenCount || 0,
          0, // cacheCreateTokens
          0, // cacheReadTokens
          model,
          account.id
        )
        logger.info(
          `📊 Recorded Gemini usage - Input: ${usage.promptTokenCount}, Output: ${usage.candidatesTokenCount}, Total: ${usage.totalTokenCount}`
        )
      } catch (error) {
        logger.error('Failed to record Gemini usage:', error)
      }
    }

    res.json(version === 'v1beta' ? response.response : response)
  } catch (error) {
    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal'
    // 打印详细的错误信息
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

// 共用的 streamGenerateContent 处理函数
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

    // 使用统一调度选择账号
    const { accountId } = await unifiedGeminiScheduler.selectAccountForApiKey(
      req.apiKey,
      sessionHash,
      model
    )
    const account = await geminiAccountService.getAccount(accountId)
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
    let proxyConfig = null
    if (account.proxy) {
      try {
        proxyConfig = typeof account.proxy === 'string' ? JSON.parse(account.proxy) : account.proxy
      } catch (e) {
        logger.warn('Failed to parse proxy configuration:', e)
      }
    }

    const client = await geminiAccountService.getOauthClient(accessToken, refreshToken, proxyConfig)

    // 智能处理项目ID：
    // 1. 如果账户配置了项目ID -> 使用账户的项目ID（覆盖请求中的）
    // 2. 如果账户没有项目ID -> 使用请求中的项目ID（如果有的话）
    // 3. 都没有 -> 传null
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
      effectiveProjectId, // 使用智能决策的项目ID
      req.apiKey?.id, // 使用 API Key ID 作为 session ID
      abortController.signal, // 传递中止信号
      proxyConfig // 传递代理配置
    )

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // SSE 解析函数
    const parseSSELine = (line) => {
      if (!line.startsWith('data: ')) {
        return { type: 'other', line, data: null }
      }

      const jsonStr = line.substring(6).trim()

      if (!jsonStr || jsonStr === '[DONE]') {
        return { type: 'control', line, data: null, jsonStr }
      }

      try {
        const data = JSON.parse(jsonStr)
        return { type: 'data', line, data, jsonStr }
      } catch (e) {
        return { type: 'invalid', line, data: null, jsonStr, error: e }
      }
    }

    // 处理流式响应并捕获usage数据
    let streamBuffer = '' // 统一的流处理缓冲区
    let totalUsage = {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0
    }
    const usageReported = false

    streamResponse.on('data', (chunk) => {
      try {
        const chunkStr = chunk.toString()

        if (!chunkStr.trim()) {
          return
        }

        // 使用统一缓冲区处理不完整的行
        streamBuffer += chunkStr
        const lines = streamBuffer.split('\n')
        streamBuffer = lines.pop() || '' // 保留最后一个不完整的行

        const processedLines = []

        for (const line of lines) {
          if (!line.trim()) {
            continue // 跳过空行，不添加到处理队列
          }

          // 解析 SSE 行
          const parsed = parseSSELine(line)

          // 提取 usage 数据（适用于所有版本）
          if (parsed.type === 'data' && parsed.data.response?.usageMetadata) {
            totalUsage = parsed.data.response.usageMetadata
            logger.debug('📊 Captured Gemini usage data:', totalUsage)
          }

          // 根据版本处理输出
          if (version === 'v1beta') {
            if (parsed.type === 'data') {
              if (parsed.data.response) {
                // 有 response 字段，只返回 response 的内容
                processedLines.push(`data: ${JSON.stringify(parsed.data.response)}`)
              } else {
                // 没有 response 字段，返回整个数据对象
                processedLines.push(`data: ${JSON.stringify(parsed.data)}`)
              }
            } else if (parsed.type === 'control') {
              // 控制消息（如 [DONE]）保持原样
              processedLines.push(line)
            }
            // 跳过其他类型的行（'other', 'invalid'）
          }
        }

        // 发送数据到客户端
        if (version === 'v1beta') {
          for (const line of processedLines) {
            if (!res.destroyed) {
              res.write(`${line}\n\n`)
            }
          }
        } else {
          // v1internal 直接转发原始数据
          if (!res.destroyed) {
            res.write(chunkStr)
          }
        }
      } catch (error) {
        logger.error('Error processing stream chunk:', error)
      }
    })

    streamResponse.on('end', async () => {
      logger.info('Stream completed successfully')

      // 记录使用统计
      if (!usageReported && totalUsage.totalTokenCount > 0) {
        try {
          await apiKeyService.recordUsage(
            req.apiKey.id,
            totalUsage.promptTokenCount || 0,
            totalUsage.candidatesTokenCount || 0,
            0, // cacheCreateTokens
            0, // cacheReadTokens
            model,
            account.id
          )
          logger.info(
            `📊 Recorded Gemini stream usage - Input: ${totalUsage.promptTokenCount}, Output: ${totalUsage.candidatesTokenCount}, Total: ${totalUsage.totalTokenCount}`
          )
        } catch (error) {
          logger.error('Failed to record Gemini usage:', error)
        }
      }

      res.end()
    })

    streamResponse.on('error', (error) => {
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
  } catch (error) {
    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1internal'
    // 打印详细的错误信息
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
    // 清理资源
    if (abortController) {
      abortController = null
    }
  }
  return undefined
}

// 注册所有路由端点
// v1internal 版本的端点
router.post('/v1internal\\:loadCodeAssist', authenticateApiKey, handleLoadCodeAssist)
router.post('/v1internal\\:onboardUser', authenticateApiKey, handleOnboardUser)
router.post('/v1internal\\:countTokens', authenticateApiKey, handleCountTokens)
router.post('/v1internal\\:generateContent', authenticateApiKey, handleGenerateContent)
router.post('/v1internal\\:streamGenerateContent', authenticateApiKey, handleStreamGenerateContent)

// v1beta 版本的端点 - 支持动态模型名称
router.post('/v1beta/models/:modelName\\:loadCodeAssist', authenticateApiKey, handleLoadCodeAssist)
router.post('/v1beta/models/:modelName\\:onboardUser', authenticateApiKey, handleOnboardUser)
router.post('/v1beta/models/:modelName\\:countTokens', authenticateApiKey, handleCountTokens)
router.post(
  '/v1beta/models/:modelName\\:generateContent',
  authenticateApiKey,
  handleGenerateContent
)
router.post(
  '/v1beta/models/:modelName\\:streamGenerateContent',
  authenticateApiKey,
  handleStreamGenerateContent
)

// 导出处理函数供标准路由使用
module.exports = router
module.exports.handleLoadCodeAssist = handleLoadCodeAssist
module.exports.handleOnboardUser = handleOnboardUser
module.exports.handleCountTokens = handleCountTokens
module.exports.handleGenerateContent = handleGenerateContent
module.exports.handleStreamGenerateContent = handleStreamGenerateContent
