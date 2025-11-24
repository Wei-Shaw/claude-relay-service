const express = require('express')
const router = express.Router()
const { authenticateApiKey } = require('../middleware/auth')
const logger = require('../utils/logger')
const geminiAccountService = require('../services/geminiAccountService')
const geminiApiAccountService = require('../services/geminiApiAccountService')
const unifiedGeminiScheduler = require('../services/unifiedGeminiScheduler')
const apiKeyService = require('../services/apiKeyService')
const sessionHelper = require('../utils/sessionHelper')
const axios = require('axios')
const ProxyHelper = require('../utils/proxyHelper')

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
  let account = null
  let sessionHash = null
  let accountId = null // 提升到外部作用域
  let isApiAccount = false // 提升到外部作用域

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
    const schedulerResult = await unifiedGeminiScheduler.selectAccountForApiKey(
      req.apiKey,
      sessionHash,
      model,
      { allowApiAccounts: true } // 允许调度 API 账户
    )
    ;({ accountId } = schedulerResult)
    const { accountType } = schedulerResult

    // 判断账户类型：根据 accountType 判断，而非 accountId 前缀
    isApiAccount = accountType === 'gemini-api' // 赋值而不是声明
    const actualAccountId = accountId // accountId 已经是实际 ID，无需处理前缀

    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1'

    if (isApiAccount) {
      // Gemini API 账户：使用 API Key 直接请求
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
      // OAuth 账户：使用原有流程
      account = await geminiAccountService.getAccount(actualAccountId)

      logger.info(`Standard Gemini API generateContent request (${version}) - OAuth Account`, {
        model,
        projectId: account.projectId,
        apiKeyId: req.apiKey?.id || 'unknown'
      })
    }

    // 解析账户的代理配置
    let proxyConfig = null
    if (account.proxy) {
      try {
        proxyConfig = typeof account.proxy === 'string' ? JSON.parse(account.proxy) : account.proxy
      } catch (e) {
        logger.warn('Failed to parse proxy configuration:', e)
      }
    }

    let response

    if (isApiAccount) {
      // Gemini API 账户：直接使用 API Key 请求
      // baseUrl 填写域名，如 https://generativelanguage.googleapis.com，版本固定为 v1beta
      const apiUrl = `${account.baseUrl}/v1beta/models/${model}:generateContent?key=${account.apiKey}`

      // 构建 Axios 配置
      const axiosConfig = {
        method: 'POST',
        url: apiUrl,
        data: actualRequestData,
        headers: {
          'Content-Type': 'application/json'
        }
      }

      // 添加代理配置
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
      // OAuth 账户：使用原有流程
      const { accessToken, refreshToken } = account
      const client = await geminiAccountService.getOauthClient(
        accessToken,
        refreshToken,
        proxyConfig
      )

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
            await geminiAccountService.updateTempProjectId(actualAccountId, effectiveProjectId)
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
      response = await geminiAccountService.generateContent(
        client,
        { model, request: actualRequestData },
        userPromptId, // 使用生成的 user_prompt_id
        effectiveProjectId, // 使用处理后的项目ID
        req.apiKey?.id, // 使用 API Key ID 作为 session ID
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
          0, // cacheCreateTokens
          0, // cacheReadTokens
          model,
          accountId // 账户 ID
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

    // 处理速率限制 暂时去掉此处的标记限流的处理
    // if (error.response?.status === 429 && accountId) {
    //   logger.warn(`⚠️ Gemini account ${accountId} rate limited (Standard API), marking as limited`)
    //   try {
    //     const rateLimitAccountType = isApiAccount ? 'gemini-api' : 'gemini'
    //     await unifiedGeminiScheduler.markAccountRateLimited(
    //       accountId, // 账户 ID
    //       rateLimitAccountType,
    //       sessionHash
    //     )
    //   } catch (limitError) {
    //     logger.warn('Failed to mark account as rate limited in scheduler:', limitError)
    //   }
    // }

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
  let account = null
  let sessionHash = null
  let accountId = null // 提升到外部作用域
  let isApiAccount = false // 提升到外部作用域

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
    const schedulerResult = await unifiedGeminiScheduler.selectAccountForApiKey(
      req.apiKey,
      sessionHash,
      model,
      { allowApiAccounts: true } // 允许调度 API 账户
    )
    ;({ accountId } = schedulerResult)
    const { accountType } = schedulerResult

    // 判断账户类型：根据 accountType 判断，而非 accountId 前缀
    isApiAccount = accountType === 'gemini-api' // 赋值而不是声明
    const actualAccountId = accountId // accountId 已经是实际 ID，无需处理前缀

    const version = req.path.includes('v1beta') ? 'v1beta' : 'v1'

    if (isApiAccount) {
      // Gemini API 账户：使用 API Key 直接请求
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
      // OAuth 账户：使用原有流程
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
    let proxyConfig = null
    if (account.proxy) {
      try {
        proxyConfig = typeof account.proxy === 'string' ? JSON.parse(account.proxy) : account.proxy
      } catch (e) {
        logger.warn('Failed to parse proxy configuration:', e)
      }
    }

    let streamResponse

    if (isApiAccount) {
      // Gemini API 账户：直接使用 API Key 请求流式接口
      // baseUrl 填写域名，版本固定为 v1beta
      const apiUrl = `${account.baseUrl}/v1beta/models/${model}:streamGenerateContent?key=${account.apiKey}&alt=sse`

      // 构建 Axios 配置
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

      // 添加代理配置
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
      // OAuth 账户：使用原有流程
      const { accessToken, refreshToken } = account
      const client = await geminiAccountService.getOauthClient(
        accessToken,
        refreshToken,
        proxyConfig
      )

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
            await geminiAccountService.updateTempProjectId(actualAccountId, effectiveProjectId)
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
      streamResponse = await geminiAccountService.generateContentStream(
        client,
        { model, request: actualRequestData },
        userPromptId, // 使用生成的 user_prompt_id
        effectiveProjectId, // 使用处理后的项目ID
        req.apiKey?.id, // 使用 API Key ID 作为 session ID
        abortController.signal,
        proxyConfig
      )
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // 处理流式响应并捕获usage数据
    // 方案 A++：透明转发 + 异步 usage 提取 + SSE 心跳机制
    let totalUsage = {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0
    }

    // SSE 心跳机制：防止 Clash 等代理 120 秒超时
    let heartbeatTimer = null
    let lastDataTime = Date.now()
    const HEARTBEAT_INTERVAL = 15000 // 15 秒

    const sendHeartbeat = () => {
      const timeSinceLastData = Date.now() - lastDataTime
      if (timeSinceLastData >= HEARTBEAT_INTERVAL && !res.destroyed) {
        res.write('\n') // 发送空行保持连接活跃
        logger.info(`💓 Sent SSE keepalive (gap: ${(timeSinceLastData / 1000).toFixed(1)}s)`)
      }
    }

    heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL)

    // 缓冲区：有些 chunk 内会包含多条 SSE 事件，需要拆分
    let sseBuffer = ''

    // 处理单个 SSE 事件块（不含结尾空行）
    const handleEventBlock = (evt) => {
      if (!evt.trim()) {
        return
      }

      // 取出所有 data 行并拼接（兼容多行 data）
      const dataLines = evt.split(/\r?\n/).filter((line) => line.startsWith('data:'))
      if (dataLines.length === 0) {
        // 非 data 事件，直接原样转发
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

          // 捕获 usage（如果在顶层或 response 内都有可能）
          if (parsed.usageMetadata) {
            totalUsage = parsed.usageMetadata
          } else if (parsed.response?.usageMetadata) {
            totalUsage = parsed.response.usageMetadata
          }

          // 提取 response 并重新包装
          processedPayload = JSON.stringify(parsed.response || parsed)
        } catch (e) {
          // 解析失败，直接转发原始 data
        }
      }

      const outputChunk = processedPayload === null ? `${evt}\n\n` : `data: ${processedPayload}\n\n`

      // 1️⃣ 立即转发处理后的数据
      if (!res.destroyed) {
        res.write(outputChunk)
      }

      // 2️⃣ 异步提取 usage 数据（兜底，防止上面解析失败未捕获）
      setImmediate(() => {
        try {
          const usageSource =
            processedPayload && processedPayload !== '[DONE]' ? processedPayload : dataPayload

          if (!usageSource || !usageSource.includes('usageMetadata')) {
            return
          }

          // 再尝试一次解析
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
        // 更新最后数据时间
        lastDataTime = Date.now()

        // 追加到缓冲区后按双换行拆分事件
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

      // 处理可能残留在缓冲区的事件（上游未以空行结尾的情况）
      if (sseBuffer.trim()) {
        try {
          handleEventBlock(sseBuffer)
        } catch (flushError) {
          // 忽略 flush 期间的异常
        }
        sseBuffer = ''
      }

      // 清理心跳定时器
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }

      // 立即结束响应，不阻塞
      res.end()

      // 异步记录使用统计（不阻塞响应）
      if (totalUsage.totalTokenCount > 0) {
        apiKeyService
          .recordUsage(
            req.apiKey.id,
            totalUsage.promptTokenCount || 0,
            totalUsage.candidatesTokenCount || 0,
            0, // cacheCreateTokens
            0, // cacheReadTokens
            model,
            accountId // 使用原始 accountId（含前缀）
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

      // 清理心跳定时器
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }

      if (!res.headersSent) {
        // 如果还没发送响应头，可以返回正常的错误响应
        res.status(500).json({
          error: {
            message: error.message || 'Stream error',
            type: 'api_error'
          }
        })
      } else {
        // 如果已经开始流式传输，发送 SSE 格式的错误事件和结束标记
        // 这样客户端可以正确识别流的结束，避免 "Premature close" 错误
        if (!res.destroyed) {
          try {
            // 发送错误事件（SSE 格式）
            res.write(
              `data: ${JSON.stringify({
                error: {
                  message: error.message || 'Stream error',
                  type: 'stream_error',
                  code: error.code
                }
              })}\n\n`
            )

            // 发送 SSE 结束标记
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

    // 处理速率限制 暂时去掉此处的标记限流的处理
    // if (error.response?.status === 429 && accountId) {
    //   logger.warn(
    //     `⚠️ Gemini account ${accountId} rate limited (Standard Stream API), marking as limited`
    //   )
    //   try {
    //     const rateLimitAccountType = isApiAccount ? 'gemini-api' : 'gemini'
    //     await unifiedGeminiScheduler.markAccountRateLimited(
    //       accountId, // 账户 ID
    //       rateLimitAccountType,
    //       sessionHash
    //     )
    //   } catch (limitError) {
    //     logger.warn('Failed to mark account as rate limited in scheduler:', limitError)
    //   }
    // }

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
