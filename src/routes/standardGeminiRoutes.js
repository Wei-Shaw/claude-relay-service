const express = require('express')
const router = express.Router()
const { authenticateApiKey } = require('../middleware/auth')
const logger = require('../utils/logger')
const geminiAccountService = require('../services/geminiAccountService')
const unifiedGeminiScheduler = require('../services/unifiedGeminiScheduler')
const apiKeyService = require('../services/apiKeyService')
const sessionHelper = require('../utils/sessionHelper')
const { parseSSELine } = require('../utils/sseParser')

// 导入 geminiRoutes 中导出的处理函数
const { handleLoadCodeAssist, handleOnboardUser, handleCountTokens } = require('./geminiRoutes')

// 检查 API Key 是否具备 Gemini 权限
function hasGeminiPermission(apiKeyData, requiredPermission = 'gemini') {
  const permissions = apiKeyData?.permissions || 'all'
  return permissions === 'all' || permissions === requiredPermission
}

// 确保请求拥有 Gemini 权限
function ensureGeminiPermission(req, res) {
  const apiKeyData = req.apiKey || {}
  if (hasGeminiPermission(apiKeyData, 'gemini')) {
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

// 供路由中间件复用的权限检查
function ensureGeminiPermissionMiddleware(req, res, next) {
  if (ensureGeminiPermission(req, res)) {
    return next()
  }
  return undefined
}

// 判断对象是否为可读流
function isReadableStream(value) {
  return value && typeof value.on === 'function' && typeof value.pipe === 'function'
}

// 读取可读流内容为字符串
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

// 规范化上游 Axios 错误信息
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

// 标准 Gemini API 路由处理器
// 这些路由将挂载在 /gemini 路径下，处理标准 Gemini API 格式的请求
// 标准格式: /gemini/v1beta/models/{model}:generateContent

// 专门处理标准 Gemini API 格式的 generateContent
async function handleStandardGenerateContent(req, res) {
  try {
    if (!ensureGeminiPermission(req, res)) {
      return undefined
    }

    // 从路径参数中获取模型名
    const model = req.params.modelName || 'gemini-2.0-flash-exp'
    const sessionHash = sessionHelper.generateSessionHash(req.body)

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

    // 添加工具配置（tools 和 toolConfig）
    if (tools) {
      actualRequestData.tools = tools
    }

    if (toolConfig) {
      actualRequestData.toolConfig = toolConfig
    }

    // 如果有 system instruction，修正格式并添加到请求体
    // Gemini CLI 的内部 API 需要 role: "user" 字段
    if (systemInstruction) {
      // 确保 systemInstruction 格式正确
      if (typeof systemInstruction === 'string' && systemInstruction.trim()) {
        actualRequestData.systemInstruction = {
          role: 'user', // Gemini CLI 内部 API 需要这个字段
          parts: [{ text: systemInstruction }]
        }
      } else if (systemInstruction.parts && systemInstruction.parts.length > 0) {
        // 检查是否有实际内容
        const hasContent = systemInstruction.parts.some(
          (part) => part.text && part.text.trim() !== ''
        )
        if (hasContent) {
          // 添加 role 字段（Gemini CLI 格式）
          actualRequestData.systemInstruction = {
            role: 'user', // Gemini CLI 内部 API 需要这个字段
            parts: systemInstruction.parts
          }
        }
      }
    }

    // 使用统一调度选择账号
    const { accountId } = await unifiedGeminiScheduler.selectAccountForApiKey(
      req.apiKey,
      sessionHash,
      model
    )
    const account = await geminiAccountService.getAccount(accountId)
    const { accessToken, refreshToken } = account

    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1'
    logger.info(`Standard Gemini API generateContent request (${version})`, {
      model,
      projectId: account.projectId,
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

    // 项目ID优先级：账户配置的项目ID > 临时项目ID > 尝试获取
    let effectiveProjectId = account.projectId || account.tempProjectId || null

    // 如果没有任何项目ID，尝试调用 loadCodeAssist 获取
    if (!effectiveProjectId) {
      try {
        logger.info('📋 No projectId available, attempting to fetch from loadCodeAssist...')
        const loadResponse = await geminiAccountService.loadCodeAssist(client, null, proxyConfig)

        if (loadResponse.cloudaicompanionProject) {
          effectiveProjectId = loadResponse.cloudaicompanionProject
          // 保存临时项目ID
          await geminiAccountService.updateTempProjectId(accountId, effectiveProjectId)
          logger.info(`📋 Fetched and cached temporary projectId: ${effectiveProjectId}`)
        }
      } catch (loadError) {
        logger.warn('Failed to fetch projectId from loadCodeAssist:', loadError.message)
      }
    }

    // 如果还是没有项目ID，返回错误
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

    // 生成一个符合 Gemini CLI 格式的 user_prompt_id
    const userPromptId = `${require('crypto').randomUUID()}########0`

    // 调用内部 API（cloudcode-pa）
    const response = await geminiAccountService.generateContent(
      client,
      { model, request: actualRequestData },
      userPromptId, // 使用生成的 user_prompt_id
      effectiveProjectId, // 使用处理后的项目ID
      req.apiKey?.id, // 使用 API Key ID 作为 session ID
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

    // 返回标准 Gemini API 格式的响应
    // 内部 API 返回的是 { response: {...} } 格式，需要提取
    // 注意：不过滤 thought 字段，因为 gemini-cli 会自行处理
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

// 专门处理标准 Gemini API 格式的 streamGenerateContent
async function handleStandardStreamGenerateContent(req, res) {
  let abortController = null

  try {
    if (!ensureGeminiPermission(req, res)) {
      return undefined
    }

    // 从路径参数中获取模型名
    const model = req.params.modelName || 'gemini-2.0-flash-exp'
    const sessionHash = sessionHelper.generateSessionHash(req.body)

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

    // 添加工具配置（tools 和 toolConfig）
    if (tools) {
      actualRequestData.tools = tools
    }

    if (toolConfig) {
      actualRequestData.toolConfig = toolConfig
    }

    // 如果有 system instruction，修正格式并添加到请求体
    // Gemini CLI 的内部 API 需要 role: "user" 字段
    if (systemInstruction) {
      // 确保 systemInstruction 格式正确
      if (typeof systemInstruction === 'string' && systemInstruction.trim()) {
        actualRequestData.systemInstruction = {
          role: 'user', // Gemini CLI 内部 API 需要这个字段
          parts: [{ text: systemInstruction }]
        }
      } else if (systemInstruction.parts && systemInstruction.parts.length > 0) {
        // 检查是否有实际内容
        const hasContent = systemInstruction.parts.some(
          (part) => part.text && part.text.trim() !== ''
        )
        if (hasContent) {
          // 添加 role 字段（Gemini CLI 格式）
          actualRequestData.systemInstruction = {
            role: 'user', // Gemini CLI 内部 API 需要这个字段
            parts: systemInstruction.parts
          }
        }
      }
    }

    // 使用统一调度选择账号
    const { accountId } = await unifiedGeminiScheduler.selectAccountForApiKey(
      req.apiKey,
      sessionHash,
      model
    )
    const account = await geminiAccountService.getAccount(accountId)
    const { accessToken, refreshToken } = account

    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1'
    logger.info(`Standard Gemini API streamGenerateContent request (${version})`, {
      model,
      projectId: account.projectId,
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

    // 项目ID优先级：账户配置的项目ID > 临时项目ID > 尝试获取
    let effectiveProjectId = account.projectId || account.tempProjectId || null

    // 如果没有任何项目ID，尝试调用 loadCodeAssist 获取
    if (!effectiveProjectId) {
      try {
        logger.info('📋 No projectId available, attempting to fetch from loadCodeAssist...')
        const loadResponse = await geminiAccountService.loadCodeAssist(client, null, proxyConfig)

        if (loadResponse.cloudaicompanionProject) {
          effectiveProjectId = loadResponse.cloudaicompanionProject
          // 保存临时项目ID
          await geminiAccountService.updateTempProjectId(accountId, effectiveProjectId)
          logger.info(`📋 Fetched and cached temporary projectId: ${effectiveProjectId}`)
        }
      } catch (loadError) {
        logger.warn('Failed to fetch projectId from loadCodeAssist:', loadError.message)
      }
    }

    // 如果还是没有项目ID，返回错误
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

    // 生成一个符合 Gemini CLI 格式的 user_prompt_id
    const userPromptId = `${require('crypto').randomUUID()}########0`

    // 调用内部 API（cloudcode-pa）的流式接口
    const streamResponse = await geminiAccountService.generateContentStream(
      client,
      { model, request: actualRequestData },
      userPromptId, // 使用生成的 user_prompt_id
      effectiveProjectId, // 使用处理后的项目ID
      req.apiKey?.id, // 使用 API Key ID 作为 session ID
      abortController.signal,
      proxyConfig
    )

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // 处理流式响应并捕获usage数据
    let streamBuffer = '' // 统一的流处理缓冲区
    let totalUsage = {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0
    }

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

        for (const line of lines) {
          if (!line.trim()) {
            continue // 跳过空行
          }

          // 解析 SSE 行
          const parsed = parseSSELine(line)

          // 记录无效的解析（用于调试）
          if (parsed.type === 'invalid') {
            logger.warn('Failed to parse SSE line:', {
              line: parsed.line.substring(0, 100),
              error: parsed.error.message
            })
            continue
          }

          // 捕获 usage 数据
          if (parsed.type === 'data' && parsed.data.response?.usageMetadata) {
            totalUsage = parsed.data.response.usageMetadata
            logger.debug('📊 Captured Gemini usage data:', totalUsage)
          }

          // 转换格式并发送
          if (!res.destroyed) {
            if (parsed.type === 'data') {
              // 转换格式：移除 response 包装，直接返回标准 Gemini API 格式
              if (parsed.data.response) {
                res.write(`data: ${JSON.stringify(parsed.data.response)}\n\n`)
              } else {
                res.write(`data: ${JSON.stringify(parsed.data)}\n\n`)
              }
            } else if (parsed.type === 'control') {
              // 保持控制消息（如 [DONE]）原样
              res.write(`${parsed.line}\n\n`)
            }
          }
        }
      } catch (error) {
        logger.error('Error processing stream chunk:', error)
      }
    })

    streamResponse.on('end', async () => {
      logger.info('Stream completed successfully')

      // 记录使用统计
      if (totalUsage.totalTokenCount > 0) {
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
      } else {
        logger.warn(
          `⚠️ Stream completed without usage data - totalTokenCount: ${totalUsage.totalTokenCount}`
        )
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
    // 清理资源
    if (abortController) {
      abortController = null
    }
  }
}

// v1beta 版本的标准路由 - 支持动态模型名称
router.post(
  '/v1beta/models/:modelName\\:loadCodeAssist',
  authenticateApiKey,
  ensureGeminiPermissionMiddleware,
  (req, res, next) => {
    logger.info(`Standard Gemini API request: ${req.method} ${req.originalUrl}`)
    handleLoadCodeAssist(req, res, next)
  }
)

router.post(
  '/v1beta/models/:modelName\\:onboardUser',
  authenticateApiKey,
  ensureGeminiPermissionMiddleware,
  (req, res, next) => {
    logger.info(`Standard Gemini API request: ${req.method} ${req.originalUrl}`)
    handleOnboardUser(req, res, next)
  }
)

router.post(
  '/v1beta/models/:modelName\\:countTokens',
  authenticateApiKey,
  ensureGeminiPermissionMiddleware,
  (req, res, next) => {
    logger.info(`Standard Gemini API request: ${req.method} ${req.originalUrl}`)
    handleCountTokens(req, res, next)
  }
)

// 使用专门的处理函数处理标准 Gemini API 格式
router.post(
  '/v1beta/models/:modelName\\:generateContent',
  authenticateApiKey,
  ensureGeminiPermissionMiddleware,
  handleStandardGenerateContent
)

router.post(
  '/v1beta/models/:modelName\\:streamGenerateContent',
  authenticateApiKey,
  ensureGeminiPermissionMiddleware,
  handleStandardStreamGenerateContent
)

// v1 版本的标准路由（为了完整性，虽然 Gemini 主要使用 v1beta）
router.post(
  '/v1/models/:modelName\\:generateContent',
  authenticateApiKey,
  ensureGeminiPermissionMiddleware,
  handleStandardGenerateContent
)

router.post(
  '/v1/models/:modelName\\:streamGenerateContent',
  authenticateApiKey,
  ensureGeminiPermissionMiddleware,
  handleStandardStreamGenerateContent
)

router.post(
  '/v1/models/:modelName\\:countTokens',
  authenticateApiKey,
  ensureGeminiPermissionMiddleware,
  (req, res, next) => {
    logger.info(`Standard Gemini API request (v1): ${req.method} ${req.originalUrl}`)
    handleCountTokens(req, res, next)
  }
)

// v1internal 版本的标准路由（这些使用原有的处理函数，因为格式不同）
router.post(
  '/v1internal\\:loadCodeAssist',
  authenticateApiKey,
  ensureGeminiPermissionMiddleware,
  (req, res, next) => {
    logger.info(`Standard Gemini API request (v1internal): ${req.method} ${req.originalUrl}`)
    handleLoadCodeAssist(req, res, next)
  }
)

router.post(
  '/v1internal\\:onboardUser',
  authenticateApiKey,
  ensureGeminiPermissionMiddleware,
  (req, res, next) => {
    logger.info(`Standard Gemini API request (v1internal): ${req.method} ${req.originalUrl}`)
    handleOnboardUser(req, res, next)
  }
)

router.post(
  '/v1internal\\:countTokens',
  authenticateApiKey,
  ensureGeminiPermissionMiddleware,
  (req, res, next) => {
    logger.info(`Standard Gemini API request (v1internal): ${req.method} ${req.originalUrl}`)
    handleCountTokens(req, res, next)
  }
)

// v1internal 使用不同的处理逻辑，因为它们不包含模型在 URL 中
router.post(
  '/v1internal\\:generateContent',
  authenticateApiKey,
  ensureGeminiPermissionMiddleware,
  (req, res, next) => {
    logger.info(`Standard Gemini API request (v1internal): ${req.method} ${req.originalUrl}`)
    // v1internal 格式不同，使用原有的处理函数
    const { handleGenerateContent } = require('./geminiRoutes')
    handleGenerateContent(req, res, next)
  }
)

router.post(
  '/v1internal\\:streamGenerateContent',
  authenticateApiKey,
  ensureGeminiPermissionMiddleware,
  (req, res, next) => {
    logger.info(`Standard Gemini API request (v1internal): ${req.method} ${req.originalUrl}`)
    // v1internal 格式不同，使用原有的处理函数
    const { handleStreamGenerateContent } = require('./geminiRoutes')
    handleStreamGenerateContent(req, res, next)
  }
)

// 添加标准 Gemini API 的模型列表端点
router.get(
  '/v1beta/models',
  authenticateApiKey,
  ensureGeminiPermissionMiddleware,
  async (req, res) => {
    try {
      logger.info('Standard Gemini API models request')
      // 直接调用 geminiRoutes 中的模型处理逻辑
      const geminiRoutes = require('./geminiRoutes')
      const modelHandler = geminiRoutes.stack.find(
        (layer) => layer.route && layer.route.path === '/models' && layer.route.methods.get
      )
      if (modelHandler && modelHandler.route.stack[1]) {
        // 调用处理函数（跳过第一个 authenticateApiKey 中间件）
        modelHandler.route.stack[1].handle(req, res)
      } else {
        res.status(500).json({ error: 'Models handler not found' })
      }
    } catch (error) {
      logger.error('Error in standard models endpoint:', error)
      res.status(500).json({
        error: {
          message: 'Failed to retrieve models',
          type: 'api_error'
        }
      })
    }
  }
)

router.get('/v1/models', authenticateApiKey, ensureGeminiPermissionMiddleware, async (req, res) => {
  try {
    logger.info('Standard Gemini API models request (v1)')
    // 直接调用 geminiRoutes 中的模型处理逻辑
    const geminiRoutes = require('./geminiRoutes')
    const modelHandler = geminiRoutes.stack.find(
      (layer) => layer.route && layer.route.path === '/models' && layer.route.methods.get
    )
    if (modelHandler && modelHandler.route.stack[1]) {
      modelHandler.route.stack[1].handle(req, res)
    } else {
      res.status(500).json({ error: 'Models handler not found' })
    }
  } catch (error) {
    logger.error('Error in standard models endpoint (v1):', error)
    res.status(500).json({
      error: {
        message: 'Failed to retrieve models',
        type: 'api_error'
      }
    })
  }
})

// 添加模型详情端点
router.get(
  '/v1beta/models/:modelName',
  authenticateApiKey,
  ensureGeminiPermissionMiddleware,
  (req, res) => {
    const { modelName } = req.params
    logger.info(`Standard Gemini API model details request: ${modelName}`)

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
)

router.get(
  '/v1/models/:modelName',
  authenticateApiKey,
  ensureGeminiPermissionMiddleware,
  (req, res) => {
    const { modelName } = req.params
    logger.info(`Standard Gemini API model details request (v1): ${modelName}`)

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
)

logger.info('Standard Gemini API routes initialized')

module.exports = router
