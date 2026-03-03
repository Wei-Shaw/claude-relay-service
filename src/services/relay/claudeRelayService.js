const https = require('https')
const zlib = require('zlib')
const path = require('path')
const ProxyHelper = require('../../utils/proxyHelper')
const { filterForClaude } = require('../../utils/headerFilter')
const claudeAccountService = require('../account/claudeAccountService')
const unifiedClaudeScheduler = require('../scheduler/unifiedClaudeScheduler')
const sessionHelper = require('../../utils/sessionHelper')
const logger = require('../../utils/logger')
const config = require('../../../config/config')
const claudeCodeHeadersService = require('../claudeCodeHeadersService')
const redis = require('../../models/redis')
const ClaudeCodeValidator = require('../../validators/clients/claudeCodeValidator')
const { formatDateWithTimezone } = require('../../utils/dateHelper')
const requestIdentityService = require('../requestIdentityService')
const { createClaudeTestPayload } = require('../../utils/testPayloadHelper')
const userMessageQueueService = require('../userMessageQueueService')
const { isStreamWritable } = require('../../utils/streamHelper')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')
const {
  getHttpsAgentForStream,
  getHttpsAgentForNonStream,
  getPricingData
} = require('../../utils/performanceOptimizer')

// structuredClone polyfill for Node < 17
const safeClone =
  typeof structuredClone === 'function' ? structuredClone : (obj) => JSON.parse(JSON.stringify(obj))

class ClaudeRelayService {
  constructor() {
    this.claudeApiUrl = 'https://api.anthropic.com/v1/messages?beta=true'
    // 🧹 内存优化：用于存储请求体字符串，避免闭包捕获
    this.bodyStore = new Map()
    this._bodyStoreIdCounter = 0
    this.apiVersion = config.claude.apiVersion
    this.betaHeader = config.claude.betaHeader
    this.systemPrompt = config.claude.systemPrompt
    this.claudeCodeSystemPrompt = "You are Claude Code, Anthropic's official CLI for Claude."
    this.toolNameSuffix = null
    this.toolNameSuffixGeneratedAt = 0
    this.toolNameSuffixTtlMs = 60 * 60 * 1000
  }

  // 🔧 根据模型ID和客户端传递的 anthropic-beta 获取最终的 header
  _getBetaHeader(modelId, clientBetaHeader) {
    const OAUTH_BETA = 'oauth-2025-04-20'
    const CLAUDE_CODE_BETA = 'claude-code-20250219'
    const INTERLEAVED_THINKING_BETA = 'interleaved-thinking-2025-05-14'
    const TOOL_STREAMING_BETA = 'fine-grained-tool-streaming-2025-05-14'

    const isHaikuModel = modelId && modelId.toLowerCase().includes('haiku')
    const baseBetas = isHaikuModel
      ? [OAUTH_BETA, INTERLEAVED_THINKING_BETA]
      : [CLAUDE_CODE_BETA, OAUTH_BETA, INTERLEAVED_THINKING_BETA, TOOL_STREAMING_BETA]

    const betaList = []
    const seen = new Set()
    const addBeta = (beta) => {
      if (!beta || seen.has(beta)) {
        return
      }
      seen.add(beta)
      betaList.push(beta)
    }

    baseBetas.forEach(addBeta)

    if (clientBetaHeader) {
      clientBetaHeader
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .forEach(addBeta)
    }

    return betaList.join(',')
  }

  _buildStandardRateLimitMessage(resetTime) {
    if (!resetTime) {
      return '此专属账号已触发 Anthropic 限流控制。'
    }
    const formattedReset = formatDateWithTimezone(resetTime)
    return `此专属账号已触发 Anthropic 限流控制，将于 ${formattedReset} 自动恢复。`
  }

  _buildOpusLimitMessage(resetTime) {
    if (!resetTime) {
      return '此专属账号的Opus模型已达到周使用限制，请尝试切换其他模型后再试。'
    }
    const formattedReset = formatDateWithTimezone(resetTime)
    return `此专属账号的Opus模型已达到周使用限制，将于 ${formattedReset} 自动恢复，请尝试切换其他模型后再试。`
  }

  // 🧾 提取错误消息文本
  _extractErrorMessage(body) {
    if (!body) {
      return ''
    }

    if (typeof body === 'string') {
      const trimmed = body.trim()
      if (!trimmed) {
        return ''
      }
      try {
        const parsed = JSON.parse(trimmed)
        return this._extractErrorMessage(parsed)
      } catch (error) {
        return trimmed
      }
    }

    if (typeof body === 'object') {
      if (typeof body.error === 'string') {
        return body.error
      }
      if (body.error && typeof body.error === 'object') {
        if (typeof body.error.message === 'string') {
          return body.error.message
        }
        if (typeof body.error.error === 'string') {
          return body.error.error
        }
      }
      if (typeof body.message === 'string') {
        return body.message
      }
    }

    return ''
  }

  // 🚫 检查是否为组织被禁用/封禁错误
  // 支持两种场景：
  //   1. HTTP 400 + "this organization has been disabled"（原有）
  //   2. HTTP 403 + "OAuth authentication is currently not allowed for this organization"（封禁后新返回格式）
  _isOrganizationDisabledError(statusCode, body) {
    if (statusCode !== 400 && statusCode !== 403) {
      return false
    }
    const message = this._extractErrorMessage(body)
    if (!message) {
      return false
    }
    const lowerMessage = message.toLowerCase()
    return (
      lowerMessage.includes('this organization has been disabled') ||
      lowerMessage.includes('oauth authentication is currently not allowed')
    )
  }

  // 🔍 判断是否是真实的 Claude Code 请求
  isRealClaudeCodeRequest(requestBody) {
    return ClaudeCodeValidator.includesClaudeCodeSystemPrompt(requestBody, 1)
  }

  _isClaudeCodeUserAgent(clientHeaders) {
    const userAgent = clientHeaders?.['user-agent'] || clientHeaders?.['User-Agent']
    return typeof userAgent === 'string' && /^claude-cli\/[^\s]+\s+\(/i.test(userAgent)
  }

  _isActualClaudeCodeRequest(requestBody, clientHeaders) {
    return this.isRealClaudeCodeRequest(requestBody) && this._isClaudeCodeUserAgent(clientHeaders)
  }

  _getHeaderValueCaseInsensitive(headers, key) {
    if (!headers || typeof headers !== 'object') {
      return undefined
    }
    const lowerKey = key.toLowerCase()
    for (const candidate of Object.keys(headers)) {
      if (candidate.toLowerCase() === lowerKey) {
        return headers[candidate]
      }
    }
    return undefined
  }

  _isClaudeCodeCredentialError(body) {
    const message = this._extractErrorMessage(body)
    if (!message) {
      return false
    }
    const lower = message.toLowerCase()
    return (
      lower.includes('only authorized for use with claude code') ||
      lower.includes('cannot be used for other api requests')
    )
  }

  // 💰 检查是否为 "Extra usage required" 的非限流 429
  // Anthropic 对未开启 Extra Usage 的账户请求长上下文模型时返回此错误
  // 这不是真正的限流，不应标记账户为 rate limited
  _isExtraUsageRequired429(statusCode, body) {
    if (statusCode !== 429) return false
    const message = this._extractErrorMessage(body)
    if (!message) return false
    return message.toLowerCase().includes('extra usage')
  }

  _toPascalCaseToolName(name) {
    const parts = name.split(/[_-]/).filter(Boolean)
    if (parts.length === 0) {
      return name
    }
    const pascal = parts
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('')
    return `${pascal}_tool`
  }

  _getToolNameSuffix() {
    const now = Date.now()
    if (!this.toolNameSuffix || now - this.toolNameSuffixGeneratedAt > this.toolNameSuffixTtlMs) {
      this.toolNameSuffix = Math.random().toString(36).substring(2, 8)
      this.toolNameSuffixGeneratedAt = now
    }
    return this.toolNameSuffix
  }

  _toRandomizedToolName(name) {
    const suffix = this._getToolNameSuffix()
    return `${name}_${suffix}`
  }

  _transformToolNamesInRequestBody(body, options = {}) {
    if (!body || typeof body !== 'object') {
      return null
    }

    const useRandomized = options.useRandomizedToolNames === true
    const forwardMap = new Map()
    const reverseMap = new Map()

    const transformName = (name) => {
      if (typeof name !== 'string' || name.length === 0) {
        return name
      }
      if (forwardMap.has(name)) {
        return forwardMap.get(name)
      }
      const transformed = useRandomized
        ? this._toRandomizedToolName(name)
        : this._toPascalCaseToolName(name)
      if (transformed !== name) {
        forwardMap.set(name, transformed)
        reverseMap.set(transformed, name)
      }
      return transformed
    }

    if (Array.isArray(body.tools)) {
      body.tools.forEach((tool) => {
        if (tool && typeof tool.name === 'string') {
          tool.name = transformName(tool.name)
        }
      })
    }

    if (body.tool_choice && typeof body.tool_choice === 'object') {
      if (typeof body.tool_choice.name === 'string') {
        body.tool_choice.name = transformName(body.tool_choice.name)
      }
    }

    if (Array.isArray(body.messages)) {
      body.messages.forEach((message) => {
        const content = message?.content
        if (Array.isArray(content)) {
          content.forEach((block) => {
            if (block?.type === 'tool_use' && typeof block.name === 'string') {
              block.name = transformName(block.name)
            }
          })
        }
      })
    }

    return reverseMap.size > 0 ? reverseMap : null
  }

  _restoreToolName(name, toolNameMap) {
    if (!toolNameMap || toolNameMap.size === 0) {
      return name
    }
    return toolNameMap.get(name) || name
  }

  _restoreToolNamesInContentBlocks(content, toolNameMap) {
    if (!Array.isArray(content)) {
      return
    }

    content.forEach((block) => {
      if (block?.type === 'tool_use' && typeof block.name === 'string') {
        block.name = this._restoreToolName(block.name, toolNameMap)
      }
    })
  }

  _restoreToolNamesInResponseObject(responseBody, toolNameMap) {
    if (!responseBody || typeof responseBody !== 'object') {
      return
    }

    if (Array.isArray(responseBody.content)) {
      this._restoreToolNamesInContentBlocks(responseBody.content, toolNameMap)
    }

    if (responseBody.message && Array.isArray(responseBody.message.content)) {
      this._restoreToolNamesInContentBlocks(responseBody.message.content, toolNameMap)
    }
  }

  _restoreToolNamesInResponseBody(responseBody, toolNameMap) {
    if (!responseBody || !toolNameMap || toolNameMap.size === 0) {
      return responseBody
    }

    if (typeof responseBody === 'string') {
      try {
        const parsed = JSON.parse(responseBody)
        this._restoreToolNamesInResponseObject(parsed, toolNameMap)
        return JSON.stringify(parsed)
      } catch (error) {
        return responseBody
      }
    }

    if (typeof responseBody === 'object') {
      this._restoreToolNamesInResponseObject(responseBody, toolNameMap)
    }

    return responseBody
  }

  _restoreToolNamesInStreamEvent(event, toolNameMap) {
    if (!event || typeof event !== 'object') {
      return
    }

    if (event.content_block && event.content_block.type === 'tool_use') {
      if (typeof event.content_block.name === 'string') {
        event.content_block.name = this._restoreToolName(event.content_block.name, toolNameMap)
      }
    }

    if (event.delta && event.delta.type === 'tool_use') {
      if (typeof event.delta.name === 'string') {
        event.delta.name = this._restoreToolName(event.delta.name, toolNameMap)
      }
    }

    if (event.message && Array.isArray(event.message.content)) {
      this._restoreToolNamesInContentBlocks(event.message.content, toolNameMap)
    }

    if (Array.isArray(event.content)) {
      this._restoreToolNamesInContentBlocks(event.content, toolNameMap)
    }
  }

  _createToolNameStripperStreamTransformer(streamTransformer, toolNameMap) {
    if (!toolNameMap || toolNameMap.size === 0) {
      return streamTransformer
    }

    return (payload) => {
      const transformed = streamTransformer ? streamTransformer(payload) : payload
      if (!transformed || typeof transformed !== 'string') {
        return transformed
      }

      const lines = transformed.split('\n')
      const updated = lines.map((line) => {
        if (!line.startsWith('data:')) {
          return line
        }
        const jsonStr = line.slice(5).trimStart()
        if (!jsonStr || jsonStr === '[DONE]') {
          return line
        }
        try {
          const data = JSON.parse(jsonStr)
          this._restoreToolNamesInStreamEvent(data, toolNameMap)
          return `data: ${JSON.stringify(data)}`
        } catch (error) {
          return line
        }
      })

      return updated.join('\n')
    }
  }

  // 🚀 转发请求到Claude API
  async relayRequest(
    requestBody,
    apiKeyData,
    clientRequest,
    clientResponse,
    clientHeaders,
    options = {}
  ) {
    let upstreamRequest = null
    let queueLockAcquired = false
    let queueRequestId = null
    let selectedAccountId = null
    let bodyStoreIdNonStream = null // 🧹 在 try 块外声明，以便 finally 清理

    try {
      // 调试日志：查看API Key数据
      logger.info('🔍 API Key data received:', {
        apiKeyName: apiKeyData.name,
        enableModelRestriction: apiKeyData.enableModelRestriction,
        restrictedModels: apiKeyData.restrictedModels,
        requestedModel: requestBody.model
      })

      const isOpusModelRequest =
        typeof requestBody?.model === 'string' && requestBody.model.toLowerCase().includes('opus')

      // 生成会话哈希用于sticky会话
      const sessionHash = sessionHelper.generateSessionHash(requestBody)

      // 选择可用的Claude账户（支持专属绑定和sticky会话）
      let accountSelection
      try {
        accountSelection = await unifiedClaudeScheduler.selectAccountForApiKey(
          apiKeyData,
          sessionHash,
          requestBody.model
        )
      } catch (error) {
        if (error.code === 'CLAUDE_DEDICATED_RATE_LIMITED') {
          const limitMessage = this._buildStandardRateLimitMessage(error.rateLimitEndAt)
          logger.warn(
            `🚫 Dedicated account ${error.accountId} is rate limited for API key ${apiKeyData.name}, returning 403`
          )
          return {
            statusCode: 403,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              error: 'upstream_rate_limited',
              message: limitMessage
            }),
            accountId: error.accountId
          }
        }
        throw error
      }
      const { accountId } = accountSelection
      const { accountType } = accountSelection
      selectedAccountId = accountId

      logger.info(
        `📤 Processing API request for key: ${apiKeyData.name || apiKeyData.id}, account: ${accountId} (${accountType})${sessionHash ? `, session: ${sessionHash}` : ''}`
      )

      // 📬 用户消息队列处理：如果是用户消息请求，需要获取队列锁
      if (userMessageQueueService.isUserMessageRequest(requestBody)) {
        // 校验 accountId 非空，避免空值污染队列锁键
        if (!accountId || accountId === '') {
          logger.error('❌ accountId missing for queue lock in relayRequest')
          throw new Error('accountId missing for queue lock')
        }
        // 获取账户信息以检查账户级串行队列配置
        const accountForQueue = await claudeAccountService.getAccount(accountId)
        const accountConfig = accountForQueue
          ? { maxConcurrency: parseInt(accountForQueue.maxConcurrency || '0', 10) }
          : null
        const queueResult = await userMessageQueueService.acquireQueueLock(
          accountId,
          null,
          null,
          accountConfig
        )
        if (!queueResult.acquired && !queueResult.skipped) {
          // 区分 Redis 后端错误和队列超时
          const isBackendError = queueResult.error === 'queue_backend_error'
          const errorCode = isBackendError ? 'QUEUE_BACKEND_ERROR' : 'QUEUE_TIMEOUT'
          const errorType = isBackendError ? 'queue_backend_error' : 'queue_timeout'
          const errorMessage = isBackendError
            ? 'Queue service temporarily unavailable, please retry later'
            : 'User message queue wait timeout, please retry later'
          const statusCode = isBackendError ? 500 : 503

          // 结构化性能日志，用于后续统计
          logger.performance('user_message_queue_error', {
            errorType,
            errorCode,
            accountId,
            statusCode,
            apiKeyName: apiKeyData.name,
            backendError: isBackendError ? queueResult.errorMessage : undefined
          })

          logger.warn(
            `📬 User message queue ${errorType} for account ${accountId}, key: ${apiKeyData.name}`,
            isBackendError ? { backendError: queueResult.errorMessage } : {}
          )
          return {
            statusCode,
            headers: {
              'Content-Type': 'application/json',
              'x-user-message-queue-error': errorType
            },
            body: JSON.stringify({
              type: 'error',
              error: {
                type: errorType,
                code: errorCode,
                message: errorMessage
              }
            }),
            accountId
          }
        }
        if (queueResult.acquired && !queueResult.skipped) {
          queueLockAcquired = true
          queueRequestId = queueResult.requestId
          logger.debug(
            `📬 User message queue lock acquired for account ${accountId}, requestId: ${queueRequestId}`
          )
        }
      }

      // 获取账户信息
      let account = await claudeAccountService.getAccount(accountId)

      if (isOpusModelRequest) {
        await claudeAccountService.clearExpiredOpusRateLimit(accountId)
        account = await claudeAccountService.getAccount(accountId)
      }

      const isDedicatedOfficialAccount =
        accountType === 'claude-official' &&
        apiKeyData.claudeAccountId &&
        !apiKeyData.claudeAccountId.startsWith('group:') &&
        apiKeyData.claudeAccountId === accountId

      let opusRateLimitActive = false
      let opusRateLimitEndAt = null
      if (isOpusModelRequest) {
        opusRateLimitActive = await claudeAccountService.isAccountOpusRateLimited(accountId)
        opusRateLimitEndAt = account?.opusRateLimitEndAt || null
      }

      if (isOpusModelRequest && isDedicatedOfficialAccount && opusRateLimitActive) {
        const limitMessage = this._buildOpusLimitMessage(opusRateLimitEndAt)
        logger.warn(
          `🚫 Dedicated account ${account?.name || accountId} is under Opus weekly limit until ${opusRateLimitEndAt}`
        )
        return {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'opus_weekly_limit',
            message: limitMessage
          }),
          accountId
        }
      }

      // 获取有效的访问token
      const accessToken = await claudeAccountService.getValidAccessToken(accountId)

      const isRealClaudeCodeRequest = this._isActualClaudeCodeRequest(requestBody, clientHeaders)
      const processedBody = this._processRequestBody(requestBody, account)
      // 🧹 内存优化：存储到 bodyStore，避免闭包捕获
      const originalBodyString = JSON.stringify(processedBody)
      bodyStoreIdNonStream = ++this._bodyStoreIdCounter
      this.bodyStore.set(bodyStoreIdNonStream, originalBodyString)

      // 获取代理配置
      const proxyAgent = await this._getProxyAgent(accountId)

      // 设置客户端断开监听器
      const handleClientDisconnect = () => {
        logger.info('🔌 Client disconnected, aborting upstream request')
        if (upstreamRequest && !upstreamRequest.destroyed) {
          upstreamRequest.destroy()
        }
      }

      // 监听客户端断开事件
      if (clientRequest) {
        clientRequest.once('close', handleClientDisconnect)
      }
      if (clientResponse) {
        clientResponse.once('close', handleClientDisconnect)
      }

      const makeRequestWithRetries = async (requestOptions) => {
        const maxRetries = this._shouldRetryOn403(accountType) ? 2 : 0
        let retryCount = 0
        let response
        let shouldRetry = false

        do {
          // 🧹 每次重试从 bodyStore 解析新对象，避免闭包捕获
          let retryRequestBody
          try {
            retryRequestBody = JSON.parse(this.bodyStore.get(bodyStoreIdNonStream))
          } catch (parseError) {
            logger.error(`❌ Failed to parse body for retry: ${parseError.message}`)
            throw new Error(`Request body parse failed: ${parseError.message}`)
          }
          response = await this._makeClaudeRequest(
            retryRequestBody,
            accessToken,
            proxyAgent,
            clientHeaders,
            accountId,
            (req) => {
              upstreamRequest = req
            },
            {
              ...requestOptions,
              isRealClaudeCodeRequest
            }
          )

          shouldRetry = response.statusCode === 403 && retryCount < maxRetries
          if (shouldRetry) {
            retryCount++
            logger.warn(
              `🔄 403 error for account ${accountId}, retry ${retryCount}/${maxRetries} after 2s`
            )
            await this._sleep(2000)
          }
        } while (shouldRetry)

        return { response, retryCount }
      }

      let requestOptions = options
      let { response, retryCount } = await makeRequestWithRetries(requestOptions)

      if (
        this._isClaudeCodeCredentialError(response.body) &&
        requestOptions.useRandomizedToolNames !== true
      ) {
        requestOptions = { ...requestOptions, useRandomizedToolNames: true }
        ;({ response, retryCount } = await makeRequestWithRetries(requestOptions))
      }

      // 如果进行了重试，记录最终结果
      if (retryCount > 0) {
        if (response.statusCode === 403) {
          logger.error(`🚫 403 error persists for account ${accountId} after ${retryCount} retries`)
        } else {
          logger.info(
            `✅ 403 retry successful for account ${accountId} on attempt ${retryCount}, got status ${response.statusCode}`
          )
        }
      }

      // 📬 请求已发送成功，立即释放队列锁（无需等待响应处理完成）
      // 因为 Claude API 限流基于请求发送时刻计算（RPM），不是请求完成时刻
      if (queueLockAcquired && queueRequestId && selectedAccountId) {
        try {
          await userMessageQueueService.releaseQueueLock(selectedAccountId, queueRequestId)
          queueLockAcquired = false // 标记已释放，防止 finally 重复释放
          logger.debug(
            `📬 User message queue lock released early for account ${selectedAccountId}, requestId: ${queueRequestId}`
          )
        } catch (releaseError) {
          logger.error(
            `❌ Failed to release user message queue lock early for account ${selectedAccountId}:`,
            releaseError.message
          )
        }
      }

      response.accountId = accountId
      response.accountType = accountType

      // 移除监听器（请求成功完成）
      if (clientRequest) {
        clientRequest.removeListener('close', handleClientDisconnect)
      }
      if (clientResponse) {
        clientResponse.removeListener('close', handleClientDisconnect)
      }

      // 检查响应是否为限流错误或认证错误
      if (response.statusCode !== 200 && response.statusCode !== 201) {
        let isRateLimited = false
        let rateLimitResetTimestamp = null
        let dedicatedRateLimitMessage = null
        const organizationDisabledError = this._isOrganizationDisabledError(
          response.statusCode,
          response.body
        )

        // 检查是否为401状态码（未授权）
        if (response.statusCode === 401) {
          logger.warn(`🔐 Unauthorized error (401) detected for account ${accountId}`)

          // 记录401错误
          await this.recordUnauthorizedError(accountId)

          // 检查是否需要标记为异常（遇到1次401就停止调度）
          const errorCount = await this.getUnauthorizedErrorCount(accountId)
          logger.info(
            `🔐 Account ${accountId} has ${errorCount} consecutive 401 errors in the last 5 minutes`
          )

          if (errorCount >= 1) {
            logger.error(
              `❌ Account ${accountId} encountered 401 error (${errorCount} errors), temporarily pausing`
            )
          }
          await upstreamErrorHelper.markTempUnavailable(accountId, accountType, 401).catch(() => {})
          // 清除粘性会话，让后续请求路由到其他账户
          if (sessionHash) {
            await unifiedClaudeScheduler.clearSessionMapping(sessionHash).catch(() => {})
          }
        }
        // 检查是否为组织被禁用/封禁错误（400 或 403）
        // 必须在通用 403 处理之前检测，否则会被截断
        else if (organizationDisabledError) {
          logger.error(
            `🚫 Organization disabled/banned error (${response.statusCode}) detected for account ${accountId}, marking as blocked`
          )
          await unifiedClaudeScheduler.markAccountBlocked(accountId, accountType, sessionHash)
        }
        // 检查是否为403状态码（禁止访问，非封禁类）
        // 注意：如果进行了重试，retryCount > 0；这里的 403 是重试后最终的结果
        else if (response.statusCode === 403) {
          logger.error(
            `🚫 Forbidden error (403) detected for account ${accountId}${retryCount > 0 ? ` after ${retryCount} retries` : ''}, temporarily pausing`
          )
          await upstreamErrorHelper.markTempUnavailable(accountId, accountType, 403).catch(() => {})
          // 清除粘性会话，让后续请求路由到其他账户
          if (sessionHash) {
            await unifiedClaudeScheduler.clearSessionMapping(sessionHash).catch(() => {})
          }
        }
        // 检查是否为529状态码（服务过载）
        else if (response.statusCode === 529) {
          logger.warn(`🚫 Overload error (529) detected for account ${accountId}`)

          // 检查是否启用了529错误处理
          if (config.claude.overloadHandling.enabled > 0) {
            try {
              await claudeAccountService.markAccountOverloaded(accountId)
              logger.info(
                `🚫 Account ${accountId} marked as overloaded for ${config.claude.overloadHandling.enabled} minutes`
              )
            } catch (overloadError) {
              logger.error(`❌ Failed to mark account as overloaded: ${accountId}`, overloadError)
            }
          } else {
            logger.info(`🚫 529 error handling is disabled, skipping account overload marking`)
          }
          await upstreamErrorHelper.markTempUnavailable(accountId, accountType, 529).catch(() => {})
        }
        // 检查是否为5xx状态码
        else if (response.statusCode >= 500 && response.statusCode < 600) {
          logger.warn(`🔥 Server error (${response.statusCode}) detected for account ${accountId}`)
          await this._handleServerError(accountId, response.statusCode, sessionHash)
        }
        // 检查是否为429状态码
        else if (response.statusCode === 429) {
          // 💰 先检查是否为 "Extra usage required" 的非限流 429
          if (this._isExtraUsageRequired429(response.statusCode, response.body)) {
            logger.info(
              `💰 [Non-Stream] "Extra usage required" 429 for account ${accountId}, skipping rate limit marking`
            )
          } else {
            const resetHeader = response.headers
              ? response.headers['anthropic-ratelimit-unified-reset']
              : null
            const parsedResetTimestamp = resetHeader ? parseInt(resetHeader, 10) : NaN

            if (isOpusModelRequest && !Number.isNaN(parsedResetTimestamp)) {
              await claudeAccountService.markAccountOpusRateLimited(accountId, parsedResetTimestamp)
              logger.warn(
                `🚫 Account ${accountId} hit Opus limit, resets at ${new Date(parsedResetTimestamp * 1000).toISOString()}`
              )

              if (isDedicatedOfficialAccount) {
                const limitMessage = this._buildOpusLimitMessage(parsedResetTimestamp)
                return {
                  statusCode: 403,
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    error: 'opus_weekly_limit',
                    message: limitMessage
                  }),
                  accountId
                }
              }
            } else {
              isRateLimited = true
              if (!Number.isNaN(parsedResetTimestamp)) {
                rateLimitResetTimestamp = parsedResetTimestamp
                logger.info(
                  `🕐 Extracted rate limit reset timestamp: ${rateLimitResetTimestamp} (${new Date(rateLimitResetTimestamp * 1000).toISOString()})`
                )
              }
              if (isDedicatedOfficialAccount) {
                dedicatedRateLimitMessage = this._buildStandardRateLimitMessage(
                  rateLimitResetTimestamp || account?.rateLimitEndAt
                )
              }
            }
          }
        } else {
          // 检查响应体中的错误信息
          try {
            const responseBody =
              typeof response.body === 'string' ? JSON.parse(response.body) : response.body
            if (
              responseBody &&
              responseBody.error &&
              responseBody.error.message &&
              responseBody.error.message.toLowerCase().includes("exceed your account's rate limit")
            ) {
              isRateLimited = true
            }
          } catch (e) {
            // 如果解析失败，检查原始字符串
            if (
              response.body &&
              response.body.toLowerCase().includes("exceed your account's rate limit")
            ) {
              isRateLimited = true
            }
          }
        }

        if (isRateLimited) {
          if (isDedicatedOfficialAccount && !dedicatedRateLimitMessage) {
            dedicatedRateLimitMessage = this._buildStandardRateLimitMessage(
              rateLimitResetTimestamp || account?.rateLimitEndAt
            )
          }
          logger.warn(
            `🚫 Rate limit detected for account ${accountId}, status: ${response.statusCode}`
          )
          // 标记账号为限流状态并删除粘性会话映射，传递准确的重置时间戳
          await unifiedClaudeScheduler.markAccountRateLimited(
            accountId,
            accountType,
            sessionHash,
            rateLimitResetTimestamp
          )
          await upstreamErrorHelper
            .markTempUnavailable(
              accountId,
              accountType,
              429,
              upstreamErrorHelper.parseRetryAfter(response.headers)
            )
            .catch(() => {})

          if (dedicatedRateLimitMessage) {
            return {
              statusCode: 403,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                error: 'upstream_rate_limited',
                message: dedicatedRateLimitMessage
              }),
              accountId
            }
          }
        }
      } else if (response.statusCode === 200 || response.statusCode === 201) {
        // 提取5小时会话窗口状态
        // 使用大小写不敏感的方式获取响应头
        const get5hStatus = (headers) => {
          if (!headers) {
            return null
          }
          // HTTP头部名称不区分大小写，需要处理不同情况
          return (
            headers['anthropic-ratelimit-unified-5h-status'] ||
            headers['Anthropic-Ratelimit-Unified-5h-Status'] ||
            headers['ANTHROPIC-RATELIMIT-UNIFIED-5H-STATUS']
          )
        }

        const sessionWindowStatus = get5hStatus(response.headers)
        if (sessionWindowStatus) {
          logger.info(`📊 Session window status for account ${accountId}: ${sessionWindowStatus}`)
          // 保存会话窗口状态到账户数据
          await claudeAccountService.updateSessionWindowStatus(accountId, sessionWindowStatus)
        }

        // 请求成功，清除401和500错误计数
        await this.clearUnauthorizedErrors(accountId)
        await claudeAccountService.clearInternalErrors(accountId)
        // 如果请求成功，检查并移除限流状态
        const isRateLimited = await unifiedClaudeScheduler.isAccountRateLimited(
          accountId,
          accountType
        )
        if (isRateLimited) {
          await unifiedClaudeScheduler.removeAccountRateLimit(accountId, accountType)
        }

        // 如果请求成功，检查并移除过载状态
        try {
          const isOverloaded = await claudeAccountService.isAccountOverloaded(accountId)
          if (isOverloaded) {
            await claudeAccountService.removeAccountOverload(accountId)
          }
        } catch (overloadError) {
          logger.error(
            `❌ Failed to check/remove overload status for account ${accountId}:`,
            overloadError
          )
        }

        // 只有真实的 Claude Code 请求才更新 headers
        if (
          clientHeaders &&
          Object.keys(clientHeaders).length > 0 &&
          this.isRealClaudeCodeRequest(requestBody)
        ) {
          await claudeCodeHeadersService.storeAccountHeaders(accountId, clientHeaders)
        }
      }

      // 记录成功的API调用并打印详细的usage数据
      let responseBody = null
      try {
        responseBody = typeof response.body === 'string' ? JSON.parse(response.body) : response.body
      } catch (e) {
        logger.debug('Failed to parse response body for usage logging')
      }

      if (responseBody && responseBody.usage) {
        const { usage } = responseBody
        // 打印原始usage数据为JSON字符串
        logger.info(
          `📊 === Non-Stream Request Usage Summary === Model: ${requestBody.model}, Usage: ${JSON.stringify(usage)}`
        )
      } else {
        // 如果没有usage数据，使用估算值
        const inputTokens = requestBody.messages
          ? requestBody.messages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0) / 4
          : 0
        const outputTokens = response.content
          ? response.content.reduce((sum, content) => sum + (content.text?.length || 0), 0) / 4
          : 0

        logger.info(
          `✅ API request completed - Key: ${apiKeyData.name}, Account: ${accountId}, Model: ${requestBody.model}, Input: ~${Math.round(inputTokens)} tokens (estimated), Output: ~${Math.round(outputTokens)} tokens (estimated)`
        )
      }

      // 在响应中添加accountId，以便调用方记录账户级别统计
      response.accountId = accountId
      return response
    } catch (error) {
      logger.error(
        `❌ Claude relay request failed for key: ${apiKeyData.name || apiKeyData.id}:`,
        error.message
      )
      throw error
    } finally {
      // 🧹 清理 bodyStore
      if (bodyStoreIdNonStream !== null) {
        this.bodyStore.delete(bodyStoreIdNonStream)
      }
      // 📬 释放用户消息队列锁（兜底，正常情况下已在请求发送后提前释放）
      if (queueLockAcquired && queueRequestId && selectedAccountId) {
        try {
          await userMessageQueueService.releaseQueueLock(selectedAccountId, queueRequestId)
          logger.debug(
            `📬 User message queue lock released in finally for account ${selectedAccountId}, requestId: ${queueRequestId}`
          )
        } catch (releaseError) {
          logger.error(
            `❌ Failed to release user message queue lock for account ${selectedAccountId}:`,
            releaseError.message
          )
        }
      }
    }
  }

  // 🔧 修补孤立的 tool_use（缺少对应 tool_result）
  // 客户端在长对话中可能截断历史消息，导致 tool_use 丢失对应的 tool_result，
  // 上游 Claude API 严格校验每个 tool_use 必须紧跟 tool_result，否则返回 400。
  _patchOrphanedToolUse(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return messages
    }

    const SYNTHETIC_TEXT = '[tool_result missing; tool execution interrupted]'
    const makeSyntheticResult = (toolUseId) => ({
      type: 'tool_result',
      tool_use_id: toolUseId,
      is_error: true,
      content: [{ type: 'text', text: SYNTHETIC_TEXT }]
    })

    const pendingToolUseIds = []
    const patched = []

    for (const message of messages) {
      if (!message || !Array.isArray(message.content)) {
        patched.push(message)
        continue
      }

      if (message.role === 'assistant') {
        if (pendingToolUseIds.length > 0) {
          patched.push({
            role: 'user',
            content: pendingToolUseIds.map(makeSyntheticResult)
          })
          logger.warn(
            `🔧 Patched ${pendingToolUseIds.length} orphaned tool_use(s): ${pendingToolUseIds.join(', ')}`
          )
          pendingToolUseIds.length = 0
        }

        const toolUseIds = message.content
          .filter((part) => part?.type === 'tool_use' && typeof part.id === 'string')
          .map((part) => part.id)
        if (toolUseIds.length > 0) {
          pendingToolUseIds.push(...toolUseIds)
        }

        patched.push(message)
        continue
      }

      if (message.role === 'user' && pendingToolUseIds.length > 0) {
        const toolResultIds = new Set(
          message.content
            .filter((p) => p?.type === 'tool_result' && typeof p.tool_use_id === 'string')
            .map((p) => p.tool_use_id)
        )
        const missing = pendingToolUseIds.filter((id) => !toolResultIds.has(id))

        if (missing.length > 0) {
          const synthetic = missing.map(makeSyntheticResult)
          logger.warn(
            `🔧 Patched ${missing.length} missing tool_result(s) in user message: ${missing.join(', ')}`
          )
          message.content = [...synthetic, ...message.content]
        }

        pendingToolUseIds.length = 0
      }

      patched.push(message)
    }

    if (pendingToolUseIds.length > 0) {
      patched.push({
        role: 'user',
        content: pendingToolUseIds.map(makeSyntheticResult)
      })
      logger.warn(
        `🔧 Patched ${pendingToolUseIds.length} trailing orphaned tool_use(s): ${pendingToolUseIds.join(', ')}`
      )
    }

    return patched
  }

  // 🔄 处理请求体
  _processRequestBody(body, account = null) {
    if (!body) {
      return body
    }

    // 使用 safeClone 替代 JSON.parse(JSON.stringify()) 提升性能
    const processedBody = safeClone(body)

    processedBody.messages = this._patchOrphanedToolUse(processedBody.messages)

    // 验证并限制max_tokens参数
    this._validateAndLimitMaxTokens(processedBody)

    // 移除cache_control中的ttl字段
    this._stripTtlFromCacheControl(processedBody)

    // 判断是否是真实的 Claude Code 请求
    const isRealClaudeCode = this.isRealClaudeCodeRequest(processedBody)

    // 如果不是真实的 Claude Code 请求，需要设置 Claude Code 系统提示词
    if (!isRealClaudeCode) {
      const claudeCodePrompt = {
        type: 'text',
        text: this.claudeCodeSystemPrompt,
        cache_control: {
          type: 'ephemeral'
        }
      }

      if (processedBody.system) {
        if (typeof processedBody.system === 'string') {
          // 字符串格式：转换为数组，Claude Code 提示词在第一位
          const userSystemPrompt = {
            type: 'text',
            text: processedBody.system
          }
          // 如果用户的提示词与 Claude Code 提示词相同，只保留一个
          if (processedBody.system.trim() === this.claudeCodeSystemPrompt) {
            processedBody.system = [claudeCodePrompt]
          } else {
            processedBody.system = [claudeCodePrompt, userSystemPrompt]
          }
        } else if (Array.isArray(processedBody.system)) {
          // 检查第一个元素是否是 Claude Code 系统提示词
          const firstItem = processedBody.system[0]
          const isFirstItemClaudeCode =
            firstItem && firstItem.type === 'text' && firstItem.text === this.claudeCodeSystemPrompt

          if (!isFirstItemClaudeCode) {
            // 如果第一个不是 Claude Code 提示词，需要在开头插入
            // 同时检查数组中是否有其他位置包含 Claude Code 提示词，如果有则移除
            const filteredSystem = processedBody.system.filter(
              (item) => !(item && item.type === 'text' && item.text === this.claudeCodeSystemPrompt)
            )
            processedBody.system = [claudeCodePrompt, ...filteredSystem]
          }
        } else {
          // 其他格式，记录警告但不抛出错误，尝试处理
          logger.warn('⚠️ Unexpected system field type:', typeof processedBody.system)
          processedBody.system = [claudeCodePrompt]
        }
      } else {
        // 用户没有传递 system，需要添加 Claude Code 提示词
        processedBody.system = [claudeCodePrompt]
      }
    }

    // 移除 x-anthropic-billing-header 系统元素，避免将客户端 billing 标识传递给上游 API
    this._removeBillingHeaderFromSystem(processedBody)

    this._enforceCacheControlLimit(processedBody)

    // 处理原有的系统提示（如果配置了）
    if (this.systemPrompt && this.systemPrompt.trim()) {
      const systemPrompt = {
        type: 'text',
        text: this.systemPrompt
      }

      // 经过上面的处理，system 现在应该总是数组格式
      if (processedBody.system && Array.isArray(processedBody.system)) {
        // 不要重复添加相同的系统提示
        const hasSystemPrompt = processedBody.system.some(
          (item) => item && item.text && item.text === this.systemPrompt
        )
        if (!hasSystemPrompt) {
          processedBody.system.push(systemPrompt)
        }
      } else {
        // 理论上不应该走到这里，但为了安全起见
        processedBody.system = [systemPrompt]
      }
    } else {
      // 如果没有配置系统提示，且system字段为空，则删除它
      if (processedBody.system && Array.isArray(processedBody.system)) {
        const hasValidContent = processedBody.system.some(
          (item) => item && item.text && item.text.trim()
        )
        if (!hasValidContent) {
          delete processedBody.system
        }
      }
    }

    // Claude API只允许temperature或top_p其中之一，优先使用temperature
    if (processedBody.top_p !== undefined && processedBody.top_p !== null) {
      delete processedBody.top_p
    }

    // 处理统一的客户端标识
    if (account && account.useUnifiedClientId === 'true' && account.unifiedClientId) {
      this._replaceClientId(processedBody, account.unifiedClientId)
    }

    return processedBody
  }

  // 🔄 替换请求中的客户端标识
  _replaceClientId(body, unifiedClientId) {
    if (!body || !body.metadata || !body.metadata.user_id || !unifiedClientId) {
      return
    }

    const userId = body.metadata.user_id
    // user_id格式：user_{64位十六进制}_account__session_{uuid}
    // 只替换第一个下划线后到_account之前的部分（客户端标识）
    const match = userId.match(/^user_[a-f0-9]{64}(_account__session_[a-f0-9-]{36})$/)
    if (match && match[1]) {
      // 替换客户端标识部分
      body.metadata.user_id = `user_${unifiedClientId}${match[1]}`
      logger.info(`🔄 Replaced client ID with unified ID: ${body.metadata.user_id}`)
    }
  }

  // 🧹 移除 billing header 系统提示元素
  _removeBillingHeaderFromSystem(processedBody) {
    if (!processedBody || !processedBody.system) {
      return
    }

    if (typeof processedBody.system === 'string') {
      if (processedBody.system.trim().startsWith('x-anthropic-billing-header')) {
        logger.debug('🧹 Removed billing header from string system prompt')
        delete processedBody.system
      }
      return
    }

    if (Array.isArray(processedBody.system)) {
      const originalLength = processedBody.system.length
      processedBody.system = processedBody.system.filter(
        (item) =>
          !(
            item &&
            item.type === 'text' &&
            typeof item.text === 'string' &&
            item.text.trim().startsWith('x-anthropic-billing-header')
          )
      )
      if (processedBody.system.length < originalLength) {
        logger.debug(
          `🧹 Removed ${originalLength - processedBody.system.length} billing header element(s) from system array`
        )
      }
    }
  }

  // 🔢 验证并限制max_tokens参数
  _validateAndLimitMaxTokens(body) {
    if (!body || !body.max_tokens) {
      return
    }

    try {
      // 使用缓存的定价数据
      const pricingFilePath = path.join(__dirname, '../../data/model_pricing.json')
      const pricingData = getPricingData(pricingFilePath)

      if (!pricingData) {
        logger.warn('⚠️ Model pricing file not found, skipping max_tokens validation')
        return
      }

      const model = body.model || 'claude-sonnet-4-20250514'

      // 查找对应模型的配置
      const modelConfig = pricingData[model]

      if (!modelConfig) {
        // 如果找不到模型配置，直接透传客户端参数，不进行任何干预
        logger.info(
          `📝 Model ${model} not found in pricing file, passing through client parameters without modification`
        )
        return
      }

      // 获取模型的最大token限制
      const maxLimit = modelConfig.max_tokens || modelConfig.max_output_tokens

      if (!maxLimit) {
        logger.debug(`🔍 No max_tokens limit found for model ${model}, skipping validation`)
        return
      }

      // 检查并调整max_tokens
      if (body.max_tokens > maxLimit) {
        logger.warn(
          `⚠️ max_tokens ${body.max_tokens} exceeds limit ${maxLimit} for model ${model}, adjusting to ${maxLimit}`
        )
        body.max_tokens = maxLimit
      }
    } catch (error) {
      logger.error('❌ Failed to validate max_tokens from pricing file:', error)
      // 如果文件读取失败，不进行校验，让请求继续处理
    }
  }

  // 🧹 移除TTL字段
  _stripTtlFromCacheControl(body) {
    if (!body || typeof body !== 'object') {
      return
    }

    const processContentArray = (contentArray) => {
      if (!Array.isArray(contentArray)) {
        return
      }

      contentArray.forEach((item) => {
        if (item && typeof item === 'object' && item.cache_control) {
          if (item.cache_control.ttl) {
            delete item.cache_control.ttl
            logger.debug('🧹 Removed ttl from cache_control')
          }
        }
      })
    }

    if (Array.isArray(body.system)) {
      processContentArray(body.system)
    }

    if (Array.isArray(body.messages)) {
      body.messages.forEach((message) => {
        if (message && Array.isArray(message.content)) {
          processContentArray(message.content)
        }
      })
    }
  }

  // ⚖️ 限制带缓存控制的内容数量
  _enforceCacheControlLimit(body) {
    const MAX_CACHE_CONTROL_BLOCKS = 4

    if (!body || typeof body !== 'object') {
      return
    }

    const countCacheControlBlocks = () => {
      let total = 0

      if (Array.isArray(body.messages)) {
        body.messages.forEach((message) => {
          if (!message || !Array.isArray(message.content)) {
            return
          }
          message.content.forEach((item) => {
            if (item && item.cache_control) {
              total += 1
            }
          })
        })
      }

      if (Array.isArray(body.system)) {
        body.system.forEach((item) => {
          if (item && item.cache_control) {
            total += 1
          }
        })
      }

      return total
    }

    // 只移除 cache_control 属性，保留内容本身，避免丢失用户消息
    const removeCacheControlFromMessages = () => {
      if (!Array.isArray(body.messages)) {
        return false
      }

      for (let messageIndex = 0; messageIndex < body.messages.length; messageIndex += 1) {
        const message = body.messages[messageIndex]
        if (!message || !Array.isArray(message.content)) {
          continue
        }

        for (let contentIndex = 0; contentIndex < message.content.length; contentIndex += 1) {
          const contentItem = message.content[contentIndex]
          if (contentItem && contentItem.cache_control) {
            // 只删除 cache_control 属性，保留内容
            delete contentItem.cache_control
            return true
          }
        }
      }

      return false
    }

    // 只移除 cache_control 属性，保留 system 内容
    const removeCacheControlFromSystem = () => {
      if (!Array.isArray(body.system)) {
        return false
      }

      for (let index = 0; index < body.system.length; index += 1) {
        const systemItem = body.system[index]
        if (systemItem && systemItem.cache_control) {
          // 只删除 cache_control 属性，保留内容
          delete systemItem.cache_control
          return true
        }
      }

      return false
    }

    let total = countCacheControlBlocks()

    while (total > MAX_CACHE_CONTROL_BLOCKS) {
      // 优先从 messages 中移除 cache_control，再从 system 中移除
      if (removeCacheControlFromMessages()) {
        total -= 1
        continue
      }

      if (removeCacheControlFromSystem()) {
        total -= 1
        continue
      }

      break
    }
  }

  // 🌐 获取代理Agent（使用统一的代理工具）
  async _getProxyAgent(accountId, account = null) {
    try {
      // 优先使用传入的 account 对象，避免重复查询
      const accountData = account || (await claudeAccountService.getAccount(accountId))

      if (!accountData || !accountData.proxy) {
        logger.debug('🌐 No proxy configured for Claude account')
        return null
      }

      const proxyAgent = ProxyHelper.createProxyAgent(accountData.proxy)
      if (proxyAgent) {
        logger.info(
          `🌐 Using proxy for Claude request: ${ProxyHelper.getProxyDescription(accountData.proxy)}`
        )
      }
      return proxyAgent
    } catch (error) {
      logger.warn('⚠️ Failed to create proxy agent:', error)
      return null
    }
  }

  // 🔧 过滤客户端请求头
  _filterClientHeaders(clientHeaders) {
    // 使用统一的 headerFilter 工具类
    // 同时伪装成正常的直接客户端请求，避免触发上游 API 的安全检查
    return filterForClaude(clientHeaders)
  }

  // 🔧 准备请求头和 payload（抽离公共逻辑）
  async _prepareRequestHeadersAndPayload(
    body,
    clientHeaders,
    accountId,
    accessToken,
    options = {}
  ) {
    const { account, accountType, sessionHash, requestOptions = {}, isStream = false } = options

    // 获取统一的 User-Agent
    const unifiedUA = await this.captureAndGetUnifiedUserAgent(clientHeaders, account)

    // 获取过滤后的客户端 headers
    const filteredHeaders = this._filterClientHeaders(clientHeaders)

    const isRealClaudeCode =
      requestOptions.isRealClaudeCodeRequest === undefined
        ? this.isRealClaudeCodeRequest(body)
        : requestOptions.isRealClaudeCodeRequest === true

    // 如果不是真实的 Claude Code 请求，需要使用从账户获取的 Claude Code headers
    let finalHeaders = { ...filteredHeaders }
    let requestPayload = body

    if (!isRealClaudeCode) {
      const claudeCodeHeaders = await claudeCodeHeadersService.getAccountHeaders(accountId)
      Object.keys(claudeCodeHeaders).forEach((key) => {
        finalHeaders[key] = claudeCodeHeaders[key]
      })
    }

    // 应用请求身份转换
    const extensionResult = this._applyRequestIdentityTransform(requestPayload, finalHeaders, {
      account,
      accountId,
      accountType,
      sessionHash,
      clientHeaders,
      requestOptions,
      isStream
    })

    if (extensionResult.abortResponse) {
      return { abortResponse: extensionResult.abortResponse }
    }

    requestPayload = extensionResult.body
    finalHeaders = extensionResult.headers

    let toolNameMap = null
    if (!isRealClaudeCode) {
      toolNameMap = this._transformToolNamesInRequestBody(requestPayload, {
        useRandomizedToolNames: requestOptions.useRandomizedToolNames === true
      })
    }

    // 序列化请求体，计算 content-length
    const bodyString = JSON.stringify(requestPayload)
    const contentLength = Buffer.byteLength(bodyString, 'utf8')

    // 构建最终请求头（包含认证、版本、User-Agent、Beta 等）
    // Force identity encoding to prevent upstream (Cloudflare) from returning
    // gzip-compressed responses without a Content-Encoding header, which causes
    // binary data to be silently corrupted by UTF-8 text decoding in the stream
    // handler. See: https://github.com/Wei-Shaw/claude-relay-service/issues/1030
    const headers = {
      host: 'api.anthropic.com',
      connection: 'keep-alive',
      'content-type': 'application/json',
      'content-length': String(contentLength),
      'accept-encoding': 'identity',
      authorization: `Bearer ${accessToken}`,
      'anthropic-version': this.apiVersion,
      ...finalHeaders
    }

    // 强制 identity 编码：finalHeaders 可能携带客户端或 Redis 缓存中的 accept-encoding（如 zstd），
    // 必须在 spread 后覆盖回 identity，因为 https.request 的手动解压只支持 gzip/deflate
    headers['accept-encoding'] = 'identity'

    // 使用统一 User-Agent 或客户端提供的，最后使用默认值
    const userAgent = unifiedUA || headers['user-agent'] || 'claude-cli/1.0.119 (external, cli)'
    const acceptHeader = headers['accept'] || 'application/json'
    delete headers['user-agent']
    delete headers['accept']
    headers['User-Agent'] = userAgent
    headers['Accept'] = acceptHeader

    logger.debug(`🔗 Request User-Agent: ${headers['User-Agent']}`)

    // 根据模型和客户端传递的 anthropic-beta 动态设置 header
    const modelId = requestPayload?.model || body?.model
    const clientBetaHeader = this._getHeaderValueCaseInsensitive(clientHeaders, 'anthropic-beta')
    headers['anthropic-beta'] = this._getBetaHeader(modelId, clientBetaHeader)
    return {
      requestPayload,
      bodyString,
      headers,
      isRealClaudeCode,
      toolNameMap
    }
  }

  _applyRequestIdentityTransform(body, headers, context = {}) {
    const normalizedHeaders = headers && typeof headers === 'object' ? { ...headers } : {}

    try {
      const payload = {
        body,
        headers: normalizedHeaders,
        ...context
      }

      const result = requestIdentityService.transform(payload)
      if (!result || typeof result !== 'object') {
        return { body, headers: normalizedHeaders }
      }

      const nextBody = result.body && typeof result.body === 'object' ? result.body : body
      const nextHeaders =
        result.headers && typeof result.headers === 'object' ? result.headers : normalizedHeaders
      const abortResponse =
        result.abortResponse && typeof result.abortResponse === 'object'
          ? result.abortResponse
          : null

      return { body: nextBody, headers: nextHeaders, abortResponse }
    } catch (error) {
      logger.warn('⚠️ 应用请求身份转换失败:', error)
      return { body, headers: normalizedHeaders }
    }
  }

  // 🔗 发送请求到Claude API
  async _makeClaudeRequest(
    body,
    accessToken,
    proxyAgent,
    clientHeaders,
    accountId,
    onRequest,
    requestOptions = {}
  ) {
    const url = new URL(this.claudeApiUrl)

    // 获取账户信息用于统一 User-Agent
    const account = await claudeAccountService.getAccount(accountId)

    // 使用公共方法准备请求头和 payload
    const prepared = await this._prepareRequestHeadersAndPayload(
      body,
      clientHeaders,
      accountId,
      accessToken,
      {
        account,
        requestOptions,
        isStream: false
      }
    )

    if (prepared.abortResponse) {
      return prepared.abortResponse
    }

    let { bodyString } = prepared
    const { headers, isRealClaudeCode, toolNameMap } = prepared

    return new Promise((resolve, reject) => {
      // 支持自定义路径（如 count_tokens）
      let requestPath = url.pathname
      if (requestOptions.customPath) {
        const baseUrl = new URL('https://api.anthropic.com')
        const customUrl = new URL(requestOptions.customPath, baseUrl)
        requestPath = customUrl.pathname
      }

      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: requestPath + (url.search || ''),
        method: 'POST',
        headers,
        agent: proxyAgent || getHttpsAgentForNonStream(),
        timeout: config.requestTimeout || 600000
      }

      const req = https.request(options, (res) => {
        // 使用数组收集 chunks，避免 O(n²) 的 Buffer.concat
        const chunks = []

        res.on('data', (chunk) => {
          chunks.push(chunk)
        })

        res.on('end', () => {
          try {
            // 一次性合并所有 chunks
            const responseData = Buffer.concat(chunks)
            let responseBody = ''

            // 根据Content-Encoding处理响应数据
            const contentEncoding = res.headers['content-encoding']
            if (contentEncoding === 'gzip') {
              try {
                responseBody = zlib.gunzipSync(responseData).toString('utf8')
              } catch (unzipError) {
                logger.error('❌ Failed to decompress gzip response:', unzipError)
                responseBody = responseData.toString('utf8')
              }
            } else if (contentEncoding === 'deflate') {
              try {
                responseBody = zlib.inflateSync(responseData).toString('utf8')
              } catch (unzipError) {
                logger.error('❌ Failed to decompress deflate response:', unzipError)
                responseBody = responseData.toString('utf8')
              }
            } else {
              responseBody = responseData.toString('utf8')
            }

            if (!isRealClaudeCode) {
              responseBody = this._restoreToolNamesInResponseBody(responseBody, toolNameMap)
            }

            const response = {
              statusCode: res.statusCode,
              headers: res.headers,
              body: responseBody
            }

            logger.debug(`🔗 Claude API response: ${res.statusCode}`)

            resolve(response)
          } catch (error) {
            logger.error(`❌ Failed to parse Claude API response (Account: ${accountId}):`, error)
            reject(error)
          }
        })
      })

      // 如果提供了 onRequest 回调，传递请求对象
      if (onRequest && typeof onRequest === 'function') {
        onRequest(req)
      }

      req.on('error', async (error) => {
        logger.error(`❌ Claude API request error (Account: ${accountId}):`, error.message, {
          code: error.code,
          errno: error.errno,
          syscall: error.syscall,
          address: error.address,
          port: error.port
        })

        // 根据错误类型提供更具体的错误信息
        let errorMessage = 'Upstream request failed'
        if (error.code === 'ECONNRESET') {
          errorMessage = 'Connection reset by Claude API server'
        } else if (error.code === 'ENOTFOUND') {
          errorMessage = 'Unable to resolve Claude API hostname'
        } else if (error.code === 'ECONNREFUSED') {
          errorMessage = 'Connection refused by Claude API server'
        } else if (error.code === 'ETIMEDOUT') {
          errorMessage = 'Connection timed out to Claude API server'

          await this._handleServerError(accountId, 504, null, 'Network')
        }

        reject(new Error(errorMessage))
      })

      req.on('timeout', async () => {
        req.destroy()
        logger.error(`❌ Claude API request timeout (Account: ${accountId})`)

        await this._handleServerError(accountId, 504, null, 'Request')

        reject(new Error('Request timeout'))
      })

      // 写入请求体
      req.write(bodyString)
      // 🧹 内存优化：立即清空 bodyString 引用，避免闭包捕获
      bodyString = null
      req.end()
    })
  }

  // 🌊 处理流式响应（带usage数据捕获）
  async relayStreamRequestWithUsageCapture(
    requestBody,
    apiKeyData,
    responseStream,
    clientHeaders,
    usageCallback,
    streamTransformer = null,
    options = {}
  ) {
    let queueLockAcquired = false
    let queueRequestId = null
    let selectedAccountId = null

    try {
      // 调试日志：查看API Key数据（流式请求）
      logger.info('🔍 [Stream] API Key data received:', {
        apiKeyName: apiKeyData.name,
        enableModelRestriction: apiKeyData.enableModelRestriction,
        restrictedModels: apiKeyData.restrictedModels,
        requestedModel: requestBody.model
      })

      const isOpusModelRequest =
        typeof requestBody?.model === 'string' && requestBody.model.toLowerCase().includes('opus')

      // 生成会话哈希用于sticky会话
      const sessionHash = sessionHelper.generateSessionHash(requestBody)

      // 选择可用的Claude账户（支持专属绑定和sticky会话）
      let accountSelection
      try {
        accountSelection = await unifiedClaudeScheduler.selectAccountForApiKey(
          apiKeyData,
          sessionHash,
          requestBody.model
        )
      } catch (error) {
        if (error.code === 'CLAUDE_DEDICATED_RATE_LIMITED') {
          const limitMessage = this._buildStandardRateLimitMessage(error.rateLimitEndAt)
          if (!responseStream.headersSent) {
            responseStream.status(403)
            responseStream.setHeader('Content-Type', 'application/json')
          }
          responseStream.write(
            JSON.stringify({
              error: 'upstream_rate_limited',
              message: limitMessage
            })
          )
          responseStream.end()
          return
        }
        throw error
      }
      const { accountId } = accountSelection
      const { accountType } = accountSelection
      selectedAccountId = accountId

      // 📬 用户消息队列处理：如果是用户消息请求，需要获取队列锁
      if (userMessageQueueService.isUserMessageRequest(requestBody)) {
        // 校验 accountId 非空，避免空值污染队列锁键
        if (!accountId || accountId === '') {
          logger.error('❌ accountId missing for queue lock in relayStreamRequestWithUsageCapture')
          throw new Error('accountId missing for queue lock')
        }
        // 获取账户信息以检查账户级串行队列配置
        const accountForQueue = await claudeAccountService.getAccount(accountId)
        const accountConfig = accountForQueue
          ? { maxConcurrency: parseInt(accountForQueue.maxConcurrency || '0', 10) }
          : null
        const queueResult = await userMessageQueueService.acquireQueueLock(
          accountId,
          null,
          null,
          accountConfig
        )
        if (!queueResult.acquired && !queueResult.skipped) {
          // 区分 Redis 后端错误和队列超时
          const isBackendError = queueResult.error === 'queue_backend_error'
          const errorCode = isBackendError ? 'QUEUE_BACKEND_ERROR' : 'QUEUE_TIMEOUT'
          const errorType = isBackendError ? 'queue_backend_error' : 'queue_timeout'
          const errorMessage = isBackendError
            ? 'Queue service temporarily unavailable, please retry later'
            : 'User message queue wait timeout, please retry later'
          const statusCode = isBackendError ? 500 : 503

          // 结构化性能日志，用于后续统计
          logger.performance('user_message_queue_error', {
            errorType,
            errorCode,
            accountId,
            statusCode,
            stream: true,
            apiKeyName: apiKeyData.name,
            backendError: isBackendError ? queueResult.errorMessage : undefined
          })

          logger.warn(
            `📬 User message queue ${errorType} for account ${accountId} (stream), key: ${apiKeyData.name}`,
            isBackendError ? { backendError: queueResult.errorMessage } : {}
          )
          if (!responseStream.headersSent) {
            const existingConnection = responseStream.getHeader
              ? responseStream.getHeader('Connection')
              : null
            responseStream.writeHead(statusCode, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: existingConnection || 'keep-alive',
              'x-user-message-queue-error': errorType
            })
          }
          const errorEvent = `event: error\ndata: ${JSON.stringify({
            type: 'error',
            error: {
              type: errorType,
              code: errorCode,
              message: errorMessage
            }
          })}\n\n`
          responseStream.write(errorEvent)
          responseStream.write('data: [DONE]\n\n')
          responseStream.end()
          return
        }
        if (queueResult.acquired && !queueResult.skipped) {
          queueLockAcquired = true
          queueRequestId = queueResult.requestId
          logger.debug(
            `📬 User message queue lock acquired for account ${accountId} (stream), requestId: ${queueRequestId}`
          )
        }
      }

      logger.info(
        `📡 Processing streaming API request with usage capture for key: ${apiKeyData.name || apiKeyData.id}, account: ${accountId} (${accountType})${sessionHash ? `, session: ${sessionHash}` : ''}`
      )

      // 获取账户信息
      let account = await claudeAccountService.getAccount(accountId)

      if (isOpusModelRequest) {
        await claudeAccountService.clearExpiredOpusRateLimit(accountId)
        account = await claudeAccountService.getAccount(accountId)
      }

      const isDedicatedOfficialAccount =
        accountType === 'claude-official' &&
        apiKeyData.claudeAccountId &&
        !apiKeyData.claudeAccountId.startsWith('group:') &&
        apiKeyData.claudeAccountId === accountId

      let opusRateLimitActive = false
      if (isOpusModelRequest) {
        opusRateLimitActive = await claudeAccountService.isAccountOpusRateLimited(accountId)
      }

      if (isOpusModelRequest && isDedicatedOfficialAccount && opusRateLimitActive) {
        const limitMessage = this._buildOpusLimitMessage(account?.opusRateLimitEndAt)
        if (!responseStream.headersSent) {
          responseStream.status(403)
          responseStream.setHeader('Content-Type', 'application/json')
        }
        responseStream.write(
          JSON.stringify({
            error: 'opus_weekly_limit',
            message: limitMessage
          })
        )
        responseStream.end()
        return
      }

      // 获取有效的访问token
      const accessToken = await claudeAccountService.getValidAccessToken(accountId)

      const isRealClaudeCodeRequest = this._isActualClaudeCodeRequest(requestBody, clientHeaders)
      const processedBody = this._processRequestBody(requestBody, account)
      // 🧹 内存优化：存储到 bodyStore，不放入 requestOptions 避免闭包捕获
      const originalBodyString = JSON.stringify(processedBody)
      const bodyStoreId = ++this._bodyStoreIdCounter
      this.bodyStore.set(bodyStoreId, originalBodyString)

      // 获取代理配置
      const proxyAgent = await this._getProxyAgent(accountId)

      // 发送流式请求并捕获usage数据
      await this._makeClaudeStreamRequestWithUsageCapture(
        processedBody,
        accessToken,
        proxyAgent,
        clientHeaders,
        responseStream,
        (usageData) => {
          // 在usageCallback中添加accountId
          if (usageCallback && typeof usageCallback === 'function') {
            usageCallback({ ...usageData, accountId })
          }
        },
        accountId,
        accountType,
        sessionHash,
        streamTransformer,
        {
          ...options,
          bodyStoreId,
          isRealClaudeCodeRequest
        },
        isDedicatedOfficialAccount,
        // 📬 新增回调：在收到响应头时释放队列锁
        async () => {
          if (queueLockAcquired && queueRequestId && selectedAccountId) {
            try {
              await userMessageQueueService.releaseQueueLock(selectedAccountId, queueRequestId)
              queueLockAcquired = false // 标记已释放，防止 finally 重复释放
              logger.debug(
                `📬 User message queue lock released early for stream account ${selectedAccountId}, requestId: ${queueRequestId}`
              )
            } catch (releaseError) {
              logger.error(
                `❌ Failed to release user message queue lock early for stream account ${selectedAccountId}:`,
                releaseError.message
              )
            }
          }
        }
      )
    } catch (error) {
      // 客户端主动断开连接是正常情况，使用 INFO 级别
      if (error.message === 'Client disconnected') {
        logger.info(`🔌 Claude stream relay ended: Client disconnected`)
      } else {
        logger.error(`❌ Claude stream relay with usage capture failed:`, error)
      }
      throw error
    } finally {
      // 📬 释放用户消息队列锁（兜底，正常情况下已在收到响应头后提前释放）
      if (queueLockAcquired && queueRequestId && selectedAccountId) {
        try {
          await userMessageQueueService.releaseQueueLock(selectedAccountId, queueRequestId)
          logger.debug(
            `📬 User message queue lock released in finally for stream account ${selectedAccountId}, requestId: ${queueRequestId}`
          )
        } catch (releaseError) {
          logger.error(
            `❌ Failed to release user message queue lock for stream account ${selectedAccountId}:`,
            releaseError.message
          )
        }
      }
    }
  }

  // 🌊 发送流式请求到Claude API（带usage数据捕获）
  async _makeClaudeStreamRequestWithUsageCapture(
    body,
    accessToken,
    proxyAgent,
    clientHeaders,
    responseStream,
    usageCallback,
    accountId,
    accountType,
    sessionHash,
    streamTransformer = null,
    requestOptions = {},
    isDedicatedOfficialAccount = false,
    onResponseStart = null, // 📬 新增：收到响应头时的回调，用于提前释放队列锁
    retryCount = 0 // 🔄 403 重试计数器
  ) {
    const maxRetries = 2 // 最大重试次数
    // 获取账户信息用于统一 User-Agent
    const account = await claudeAccountService.getAccount(accountId)

    const isOpusModelRequest =
      typeof body?.model === 'string' && body.model.toLowerCase().includes('opus')

    // 使用公共方法准备请求头和 payload
    const prepared = await this._prepareRequestHeadersAndPayload(
      body,
      clientHeaders,
      accountId,
      accessToken,
      {
        account,
        accountType,
        sessionHash,
        requestOptions,
        isStream: true
      }
    )

    if (prepared.abortResponse) {
      return prepared.abortResponse
    }

    let { bodyString } = prepared
    const { headers, toolNameMap } = prepared
    const toolNameStreamTransformer = this._createToolNameStripperStreamTransformer(
      streamTransformer,
      toolNameMap
    )

    return new Promise((resolve, reject) => {
      const url = new URL(this.claudeApiUrl)
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + (url.search || ''),
        method: 'POST',
        headers,
        agent: proxyAgent || getHttpsAgentForStream(),
        timeout: config.requestTimeout || 600000
      }

      const req = https.request(options, async (res) => {
        logger.debug(`🌊 Claude stream response status: ${res.statusCode}`)

        // 错误响应处理
        if (res.statusCode !== 200) {
          if (res.statusCode === 429) {
            // 💰 先读取完整 body 以区分 "Extra usage required" 和真正的限流
            const bodyChunks429 = []
            await new Promise((resolveBody) => {
              res.on('data', (chunk) => bodyChunks429.push(chunk))
              res.on('end', resolveBody)
              res.on('error', resolveBody)
            })
            const errorBody429 = Buffer.concat(bodyChunks429).toString()

            // 检查是否为 "Extra usage required" 的非限流 429
            if (this._isExtraUsageRequired429(res.statusCode, errorBody429)) {
              logger.info(
                `💰 [Stream] "Extra usage required" 429 for account ${accountId}, skipping rate limit marking`
              )
              logger.error(
                `❌ Claude API returned error status: 429 | Account: ${account?.name || accountId}`
              )
              logger.error(
                `❌ Claude API error response (Account: ${account?.name || accountId}):`,
                errorBody429
              )
              if (isStreamWritable(responseStream)) {
                let errorMessage = `Claude API error: 429`
                try {
                  const parsedError = JSON.parse(errorBody429)
                  if (parsedError.error?.message) {
                    errorMessage = parsedError.error.message
                  } else if (parsedError.message) {
                    errorMessage = parsedError.message
                  }
                } catch {
                  // 使用默认错误消息
                }
                if (toolNameStreamTransformer) {
                  responseStream.write(
                    `data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`
                  )
                } else {
                  responseStream.write('event: error\n')
                  responseStream.write(
                    `data: ${JSON.stringify({
                      error: 'Claude API error',
                      status: 429,
                      details: errorBody429,
                      timestamp: new Date().toISOString()
                    })}\n\n`
                  )
                }
                responseStream.end()
              }
              reject(new Error(`Claude API error: 429`))
              return
            }

            // 真正的限流处理
            const resetHeader = res.headers
              ? res.headers['anthropic-ratelimit-unified-reset']
              : null
            const parsedResetTimestamp = resetHeader ? parseInt(resetHeader, 10) : NaN

            if (isOpusModelRequest) {
              if (!Number.isNaN(parsedResetTimestamp)) {
                await claudeAccountService.markAccountOpusRateLimited(
                  accountId,
                  parsedResetTimestamp
                )
                logger.warn(
                  `🚫 [Stream] Account ${accountId} hit Opus limit, resets at ${new Date(parsedResetTimestamp * 1000).toISOString()}`
                )
              }

              if (isDedicatedOfficialAccount) {
                const limitMessage = this._buildOpusLimitMessage(parsedResetTimestamp)
                if (!responseStream.headersSent) {
                  responseStream.status(403)
                  responseStream.setHeader('Content-Type', 'application/json')
                }
                responseStream.write(
                  JSON.stringify({
                    error: 'opus_weekly_limit',
                    message: limitMessage
                  })
                )
                responseStream.end()
                resolve()
                return
              }
            } else {
              const rateLimitResetTimestamp = Number.isNaN(parsedResetTimestamp)
                ? null
                : parsedResetTimestamp
              await unifiedClaudeScheduler.markAccountRateLimited(
                accountId,
                accountType,
                sessionHash,
                rateLimitResetTimestamp
              )
              await upstreamErrorHelper
                .markTempUnavailable(
                  accountId,
                  accountType,
                  429,
                  upstreamErrorHelper.parseRetryAfter(res.headers)
                )
                .catch(() => {})
              logger.warn(`🚫 [Stream] Rate limit detected for account ${accountId}, status 429`)

              if (isDedicatedOfficialAccount) {
                const limitMessage = this._buildStandardRateLimitMessage(
                  rateLimitResetTimestamp || account?.rateLimitEndAt
                )
                if (!responseStream.headersSent) {
                  responseStream.status(403)
                  responseStream.setHeader('Content-Type', 'application/json')
                }
                responseStream.write(
                  JSON.stringify({
                    error: 'upstream_rate_limited',
                    message: limitMessage
                  })
                )
                responseStream.end()
                resolve()
                return
              }
            }

            // 非专属账户的真正限流：透传错误给客户端（body 已读完，无需 fall-through）
            logger.error(
              `❌ Claude API returned error status: 429 | Account: ${account?.name || accountId}`
            )
            logger.error(
              `❌ Claude API error response (Account: ${account?.name || accountId}):`,
              errorBody429
            )
            if (isStreamWritable(responseStream)) {
              let errorMessage = `Claude API error: 429`
              try {
                const parsedError = JSON.parse(errorBody429)
                if (parsedError.error?.message) {
                  errorMessage = parsedError.error.message
                } else if (parsedError.message) {
                  errorMessage = parsedError.message
                }
              } catch {
                // 使用默认错误消息
              }
              if (toolNameStreamTransformer) {
                responseStream.write(
                  `data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`
                )
              } else {
                responseStream.write('event: error\n')
                responseStream.write(
                  `data: ${JSON.stringify({
                    error: 'Claude API error',
                    status: 429,
                    details: errorBody429,
                    timestamp: new Date().toISOString()
                  })}\n\n`
                )
              }
              responseStream.end()
            }
            reject(new Error(`Claude API error: 429`))
            return
          }

          // 🔄 403 重试机制（必须在设置 res.on('data')/res.on('end') 之前处理）
          // 否则重试时旧响应的 on('end') 会与新请求产生竞态条件
          if (res.statusCode === 403) {
            const canRetry =
              this._shouldRetryOn403(accountType) &&
              retryCount < maxRetries &&
              !responseStream.headersSent

            if (canRetry) {
              logger.warn(
                `🔄 [Stream] 403 error for account ${accountId}, retry ${retryCount + 1}/${maxRetries} after 2s`
              )
              // 消费当前响应并销毁请求
              res.resume()
              req.destroy()

              // 等待 2 秒后递归重试
              await this._sleep(2000)

              try {
                // 递归调用自身进行重试
                // 🧹 从 bodyStore 获取字符串用于重试
                if (
                  !requestOptions.bodyStoreId ||
                  !this.bodyStore.has(requestOptions.bodyStoreId)
                ) {
                  throw new Error('529 retry requires valid bodyStoreId')
                }
                let retryBody
                try {
                  retryBody = JSON.parse(this.bodyStore.get(requestOptions.bodyStoreId))
                } catch (parseError) {
                  logger.error(`❌ Failed to parse body for 529 retry: ${parseError.message}`)
                  throw new Error(`529 retry body parse failed: ${parseError.message}`)
                }
                const retryResult = await this._makeClaudeStreamRequestWithUsageCapture(
                  retryBody,
                  accessToken,
                  proxyAgent,
                  clientHeaders,
                  responseStream,
                  usageCallback,
                  accountId,
                  accountType,
                  sessionHash,
                  streamTransformer,
                  requestOptions,
                  isDedicatedOfficialAccount,
                  onResponseStart,
                  retryCount + 1
                )
                resolve(retryResult)
              } catch (retryError) {
                reject(retryError)
              }
              return // 重要：提前返回，不设置后续的错误处理器
            }
          }

          // 将错误处理逻辑封装在一个异步函数中
          const handleErrorResponse = async () => {
            if (res.statusCode === 401) {
              logger.warn(`🔐 [Stream] Unauthorized error (401) detected for account ${accountId}`)

              await this.recordUnauthorizedError(accountId)

              const errorCount = await this.getUnauthorizedErrorCount(accountId)
              logger.info(
                `🔐 [Stream] Account ${accountId} has ${errorCount} consecutive 401 errors in the last 5 minutes`
              )

              if (errorCount >= 1) {
                logger.error(
                  `❌ [Stream] Account ${accountId} encountered 401 error (${errorCount} errors), temporarily pausing`
                )
              }
              await upstreamErrorHelper
                .markTempUnavailable(accountId, accountType, 401)
                .catch(() => {})
              // 清除粘性会话，让后续请求路由到其他账户
              if (sessionHash) {
                await unifiedClaudeScheduler.clearSessionMapping(sessionHash).catch(() => {})
              }
            } else if (res.statusCode === 403) {
              // 403 处理：先检查是否为封禁性质的 403（组织被禁用/OAuth 被禁止）
              // 注意：重试逻辑已在 handleErrorResponse 外部提前处理
              if (this._isOrganizationDisabledError(res.statusCode, errorData)) {
                logger.error(
                  `🚫 [Stream] Organization disabled/banned error (403) detected for account ${accountId}, marking as blocked`
                )
                await unifiedClaudeScheduler
                  .markAccountBlocked(accountId, accountType, sessionHash)
                  .catch((markError) => {
                    logger.error(
                      `❌ [Stream] Failed to mark account ${accountId} as blocked:`,
                      markError
                    )
                  })
              } else {
                logger.error(
                  `🚫 [Stream] Forbidden error (403) detected for account ${accountId}${retryCount > 0 ? ` after ${retryCount} retries` : ''}, temporarily pausing`
                )
                await upstreamErrorHelper
                  .markTempUnavailable(accountId, accountType, 403)
                  .catch(() => {})
              }
              // 清除粘性会话，让后续请求路由到其他账户
              if (sessionHash) {
                await unifiedClaudeScheduler.clearSessionMapping(sessionHash).catch(() => {})
              }
            } else if (res.statusCode === 529) {
              logger.warn(`🚫 [Stream] Overload error (529) detected for account ${accountId}`)

              // 检查是否启用了529错误处理
              if (config.claude.overloadHandling.enabled > 0) {
                try {
                  await claudeAccountService.markAccountOverloaded(accountId)
                  logger.info(
                    `🚫 [Stream] Account ${accountId} marked as overloaded for ${config.claude.overloadHandling.enabled} minutes`
                  )
                } catch (overloadError) {
                  logger.error(
                    `❌ [Stream] Failed to mark account as overloaded: ${accountId}`,
                    overloadError
                  )
                }
              } else {
                logger.info(
                  `🚫 [Stream] 529 error handling is disabled, skipping account overload marking`
                )
              }
              await upstreamErrorHelper
                .markTempUnavailable(accountId, accountType, 529)
                .catch(() => {})
            } else if (res.statusCode >= 500 && res.statusCode < 600) {
              logger.warn(
                `🔥 [Stream] Server error (${res.statusCode}) detected for account ${accountId}`
              )
              await this._handleServerError(accountId, res.statusCode, sessionHash, '[Stream]')
            }
          }

          // 调用异步错误处理函数
          handleErrorResponse().catch((err) => {
            logger.error('❌ Error in stream error handler:', err)
          })

          logger.error(
            `❌ Claude API returned error status: ${res.statusCode} | Account: ${account?.name || accountId}`
          )
          let errorData = ''

          res.on('data', (chunk) => {
            errorData += chunk.toString()
          })

          res.on('end', async () => {
            logger.error(
              `❌ Claude API error response (Account: ${account?.name || accountId}):`,
              errorData
            )
            if (
              this._isClaudeCodeCredentialError(errorData) &&
              requestOptions.useRandomizedToolNames !== true &&
              requestOptions.bodyStoreId &&
              this.bodyStore.has(requestOptions.bodyStoreId)
            ) {
              let retryBody
              try {
                retryBody = JSON.parse(this.bodyStore.get(requestOptions.bodyStoreId))
              } catch (parseError) {
                logger.error(`❌ Failed to parse body for 403 retry: ${parseError.message}`)
                reject(new Error(`403 retry body parse failed: ${parseError.message}`))
                return
              }
              try {
                const retryResult = await this._makeClaudeStreamRequestWithUsageCapture(
                  retryBody,
                  accessToken,
                  proxyAgent,
                  clientHeaders,
                  responseStream,
                  usageCallback,
                  accountId,
                  accountType,
                  sessionHash,
                  streamTransformer,
                  { ...requestOptions, useRandomizedToolNames: true },
                  isDedicatedOfficialAccount,
                  onResponseStart,
                  retryCount
                )
                resolve(retryResult)
              } catch (retryError) {
                reject(retryError)
              }
              return
            }
            if (this._isOrganizationDisabledError(res.statusCode, errorData)) {
              ;(async () => {
                try {
                  logger.error(
                    `🚫 [Stream] Organization disabled error (400) detected for account ${accountId}, marking as blocked`
                  )
                  await unifiedClaudeScheduler.markAccountBlocked(
                    accountId,
                    accountType,
                    sessionHash
                  )
                } catch (markError) {
                  logger.error(
                    `❌ [Stream] Failed to mark account ${accountId} as blocked after organization disabled error:`,
                    markError
                  )
                }
              })()
            }
            if (isStreamWritable(responseStream)) {
              // 解析 Claude API 返回的错误详情
              let errorMessage = `Claude API error: ${res.statusCode}`
              try {
                const parsedError = JSON.parse(errorData)
                if (parsedError.error?.message) {
                  errorMessage = parsedError.error.message
                } else if (parsedError.message) {
                  errorMessage = parsedError.message
                }
              } catch {
                // 使用默认错误消息
              }

              // 如果有 streamTransformer（如测试请求），使用前端期望的格式
              if (toolNameStreamTransformer) {
                responseStream.write(
                  `data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`
                )
              } else {
                // 标准错误格式
                responseStream.write('event: error\n')
                responseStream.write(
                  `data: ${JSON.stringify({
                    error: 'Claude API error',
                    status: res.statusCode,
                    details: errorData,
                    timestamp: new Date().toISOString()
                  })}\n\n`
                )
              }
              responseStream.end()
            }
            reject(new Error(`Claude API error: ${res.statusCode}`))
          })
          return
        }

        // 📬 收到成功响应头（HTTP 200），立即调用回调释放队列锁
        // 此时请求已被 Claude API 接受并计入 RPM 配额，无需等待响应完成
        if (onResponseStart && typeof onResponseStart === 'function') {
          try {
            await onResponseStart()
          } catch (callbackError) {
            logger.error('❌ Error in onResponseStart callback:', callbackError.message)
          }
        }

        let buffer = ''
        const allUsageData = [] // 收集所有的usage事件
        let currentUsageData = {} // 当前正在收集的usage数据
        let rateLimitDetected = false // 限流检测标志

        // 监听数据块，解析SSE并寻找usage信息
        // 🧹 内存优化：在闭包创建前提取需要的值，避免闭包捕获 body 和 requestOptions
        // body 和 requestOptions 只在闭包外使用，闭包内只引用基本类型
        const requestedModel = body?.model || 'unknown'
        const { isRealClaudeCodeRequest } = requestOptions

        // 🔧 处理上游 gzip/deflate 压缩：Anthropic (经 Cloudflare) 可能返回压缩响应
        const upstreamEncoding = res.headers['content-encoding']
        let dataSource = res
        if (upstreamEncoding === 'gzip') {
          dataSource = res.pipe(zlib.createGunzip())
          dataSource.on('error', (err) => {
            logger.error('❌ Gzip decompression error in stream:', err.message)
            if (isStreamWritable(responseStream)) {
              responseStream.end()
            }
          })
        } else if (upstreamEncoding === 'deflate') {
          dataSource = res.pipe(zlib.createInflate())
          dataSource.on('error', (err) => {
            logger.error('❌ Deflate decompression error in stream:', err.message)
            if (isStreamWritable(responseStream)) {
              responseStream.end()
            }
          })
        }

        dataSource.on('data', (chunk) => {
          try {
            const chunkStr = chunk.toString()

            buffer += chunkStr

            // 处理完整的SSE行
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // 保留最后的不完整行

            // 转发已处理的完整行到客户端
            if (lines.length > 0) {
              if (isStreamWritable(responseStream)) {
                const linesToForward = lines.join('\n') + (lines.length > 0 ? '\n' : '')
                // 如果有流转换器，应用转换
                if (toolNameStreamTransformer) {
                  const transformed = toolNameStreamTransformer(linesToForward)
                  if (transformed) {
                    responseStream.write(transformed)
                  }
                } else {
                  responseStream.write(linesToForward)
                }
              } else {
                // 客户端连接已断开，记录警告（但仍继续解析usage）
                logger.warn(
                  `⚠️ [Official] Client disconnected during stream, skipping ${lines.length} lines for account: ${accountId}`
                )
              }
            }

            for (const line of lines) {
              // 解析SSE数据寻找usage信息
              if (line.startsWith('data:')) {
                const jsonStr = line.slice(5).trimStart()
                if (!jsonStr || jsonStr === '[DONE]') {
                  continue
                }
                try {
                  const data = JSON.parse(jsonStr)

                  // 收集来自不同事件的usage数据
                  if (data.type === 'message_start' && data.message && data.message.usage) {
                    // 新的消息开始，如果之前有数据，先保存
                    if (
                      currentUsageData.input_tokens !== undefined &&
                      currentUsageData.output_tokens !== undefined
                    ) {
                      allUsageData.push({ ...currentUsageData })
                      currentUsageData = {}
                    }

                    // message_start包含input tokens、cache tokens和模型信息
                    currentUsageData.input_tokens = data.message.usage.input_tokens || 0
                    currentUsageData.cache_creation_input_tokens =
                      data.message.usage.cache_creation_input_tokens || 0
                    currentUsageData.cache_read_input_tokens =
                      data.message.usage.cache_read_input_tokens || 0
                    currentUsageData.model = data.message.model

                    // 检查是否有详细的 cache_creation 对象
                    if (
                      data.message.usage.cache_creation &&
                      typeof data.message.usage.cache_creation === 'object'
                    ) {
                      currentUsageData.cache_creation = {
                        ephemeral_5m_input_tokens:
                          data.message.usage.cache_creation.ephemeral_5m_input_tokens || 0,
                        ephemeral_1h_input_tokens:
                          data.message.usage.cache_creation.ephemeral_1h_input_tokens || 0
                      }
                      logger.debug(
                        '📊 Collected detailed cache creation data:',
                        JSON.stringify(currentUsageData.cache_creation)
                      )
                    }

                    logger.debug(
                      '📊 Collected input/cache data from message_start:',
                      JSON.stringify(currentUsageData)
                    )
                  }

                  // message_delta包含最终的output tokens
                  if (
                    data.type === 'message_delta' &&
                    data.usage &&
                    data.usage.output_tokens !== undefined
                  ) {
                    currentUsageData.output_tokens = data.usage.output_tokens || 0

                    logger.debug(
                      '📊 Collected output data from message_delta:',
                      JSON.stringify(currentUsageData)
                    )

                    // 如果已经收集到了input数据和output数据，这是一个完整的usage
                    if (currentUsageData.input_tokens !== undefined) {
                      logger.debug(
                        '🎯 Complete usage data collected for model:',
                        currentUsageData.model,
                        '- Input:',
                        currentUsageData.input_tokens,
                        'Output:',
                        currentUsageData.output_tokens
                      )
                      // 保存到列表中，但不立即触发回调
                      allUsageData.push({ ...currentUsageData })
                      // 重置当前数据，准备接收下一个
                      currentUsageData = {}
                    }
                  }

                  // 检查是否有限流错误
                  if (
                    data.type === 'error' &&
                    data.error &&
                    data.error.message &&
                    data.error.message.toLowerCase().includes("exceed your account's rate limit")
                  ) {
                    rateLimitDetected = true
                    logger.warn(`🚫 Rate limit detected in stream for account ${accountId}`)
                  }
                } catch (parseError) {
                  // 忽略JSON解析错误，继续处理
                  logger.debug('🔍 SSE line not JSON or no usage data:', line.slice(0, 100))
                }
              }
            }
          } catch (error) {
            logger.error('❌ Error processing stream data:', error)
            // 发送错误但不破坏流，让它自然结束
            if (isStreamWritable(responseStream)) {
              responseStream.write('event: error\n')
              responseStream.write(
                `data: ${JSON.stringify({
                  error: 'Stream processing error',
                  message: error.message,
                  timestamp: new Date().toISOString()
                })}\n\n`
              )
            }
          }
        })

        dataSource.on('end', async () => {
          try {
            // 处理缓冲区中剩余的数据
            if (buffer.trim() && isStreamWritable(responseStream)) {
              if (toolNameStreamTransformer) {
                const transformed = toolNameStreamTransformer(buffer)
                if (transformed) {
                  responseStream.write(transformed)
                }
              } else {
                responseStream.write(buffer)
              }
            }

            // 确保流正确结束
            if (isStreamWritable(responseStream)) {
              responseStream.end()
              logger.debug(
                `🌊 Stream end called | bytesWritten: ${responseStream.bytesWritten || 'unknown'}`
              )
            } else {
              // 连接已断开，记录警告
              logger.warn(
                `⚠️ [Official] Client disconnected before stream end, data may not have been received | account: ${account?.name || accountId}`
              )
            }
          } catch (error) {
            logger.error('❌ Error processing stream end:', error)
          }

          // 如果还有未完成的usage数据，尝试保存
          if (currentUsageData.input_tokens !== undefined) {
            if (currentUsageData.output_tokens === undefined) {
              currentUsageData.output_tokens = 0 // 如果没有output，设为0
            }
            allUsageData.push(currentUsageData)
          }

          // 检查是否捕获到usage数据
          if (allUsageData.length === 0) {
            logger.warn(
              '⚠️ Stream completed but no usage data was captured! This indicates a problem with SSE parsing or Claude API response format.'
            )
          } else {
            // 打印此次请求的所有usage数据汇总
            const totalUsage = allUsageData.reduce(
              (acc, usage) => ({
                input_tokens: (acc.input_tokens || 0) + (usage.input_tokens || 0),
                output_tokens: (acc.output_tokens || 0) + (usage.output_tokens || 0),
                cache_creation_input_tokens:
                  (acc.cache_creation_input_tokens || 0) + (usage.cache_creation_input_tokens || 0),
                cache_read_input_tokens:
                  (acc.cache_read_input_tokens || 0) + (usage.cache_read_input_tokens || 0),
                models: [...(acc.models || []), usage.model].filter(Boolean)
              }),
              {}
            )

            // 打印原始的usage数据为JSON字符串，避免嵌套问题
            logger.info(
              `📊 === Stream Request Usage Summary === Model: ${requestedModel}, Total Events: ${allUsageData.length}, Usage Data: ${JSON.stringify(allUsageData)}`
            )

            // 一般一个请求只会使用一个模型，即使有多个usage事件也应该合并
            // 计算总的usage
            const finalUsage = {
              input_tokens: totalUsage.input_tokens,
              output_tokens: totalUsage.output_tokens,
              cache_creation_input_tokens: totalUsage.cache_creation_input_tokens,
              cache_read_input_tokens: totalUsage.cache_read_input_tokens,
              model: allUsageData[allUsageData.length - 1].model || requestedModel // 使用最后一个模型或请求模型
            }

            // 如果有详细的cache_creation数据，合并它们
            let totalEphemeral5m = 0
            let totalEphemeral1h = 0
            allUsageData.forEach((usage) => {
              if (usage.cache_creation && typeof usage.cache_creation === 'object') {
                totalEphemeral5m += usage.cache_creation.ephemeral_5m_input_tokens || 0
                totalEphemeral1h += usage.cache_creation.ephemeral_1h_input_tokens || 0
              }
            })

            // 如果有详细的缓存数据，添加到finalUsage
            if (totalEphemeral5m > 0 || totalEphemeral1h > 0) {
              finalUsage.cache_creation = {
                ephemeral_5m_input_tokens: totalEphemeral5m,
                ephemeral_1h_input_tokens: totalEphemeral1h
              }
              logger.info(
                '📊 Detailed cache creation breakdown:',
                JSON.stringify(finalUsage.cache_creation)
              )
            }

            // 调用一次usageCallback记录合并后的数据
            if (usageCallback && typeof usageCallback === 'function') {
              usageCallback(finalUsage)
            }
          }

          // 提取5小时会话窗口状态
          // 使用大小写不敏感的方式获取响应头
          const get5hStatus = (resHeaders) => {
            if (!resHeaders) {
              return null
            }
            // HTTP头部名称不区分大小写，需要处理不同情况
            return (
              resHeaders['anthropic-ratelimit-unified-5h-status'] ||
              resHeaders['Anthropic-Ratelimit-Unified-5h-Status'] ||
              resHeaders['ANTHROPIC-RATELIMIT-UNIFIED-5H-STATUS']
            )
          }

          const sessionWindowStatus = get5hStatus(res.headers)
          if (sessionWindowStatus) {
            logger.info(`📊 Session window status for account ${accountId}: ${sessionWindowStatus}`)
            // 保存会话窗口状态到账户数据
            await claudeAccountService.updateSessionWindowStatus(accountId, sessionWindowStatus)
          }

          // 处理限流状态
          if (rateLimitDetected || res.statusCode === 429) {
            const resetHeader = res.headers
              ? res.headers['anthropic-ratelimit-unified-reset']
              : null
            const parsedResetTimestamp = resetHeader ? parseInt(resetHeader, 10) : NaN

            if (isOpusModelRequest && !Number.isNaN(parsedResetTimestamp)) {
              await claudeAccountService.markAccountOpusRateLimited(accountId, parsedResetTimestamp)
              logger.warn(
                `🚫 [Stream] Account ${accountId} hit Opus limit, resets at ${new Date(parsedResetTimestamp * 1000).toISOString()}`
              )
            } else {
              const rateLimitResetTimestamp = Number.isNaN(parsedResetTimestamp)
                ? null
                : parsedResetTimestamp

              if (!Number.isNaN(parsedResetTimestamp)) {
                logger.info(
                  `🕐 Extracted rate limit reset timestamp from stream: ${parsedResetTimestamp} (${new Date(parsedResetTimestamp * 1000).toISOString()})`
                )
              }

              await unifiedClaudeScheduler.markAccountRateLimited(
                accountId,
                accountType,
                sessionHash,
                rateLimitResetTimestamp
              )
              await upstreamErrorHelper
                .markTempUnavailable(
                  accountId,
                  accountType,
                  429,
                  upstreamErrorHelper.parseRetryAfter(res.headers)
                )
                .catch(() => {})
            }
          } else if (res.statusCode === 200) {
            // 请求成功，清除401和500错误计数
            await this.clearUnauthorizedErrors(accountId)
            await claudeAccountService.clearInternalErrors(accountId)
            // 如果请求成功，检查并移除限流状态
            const isRateLimited = await unifiedClaudeScheduler.isAccountRateLimited(
              accountId,
              accountType
            )
            if (isRateLimited) {
              await unifiedClaudeScheduler.removeAccountRateLimit(accountId, accountType)
            }

            // 如果流式请求成功，检查并移除过载状态
            try {
              const isOverloaded = await claudeAccountService.isAccountOverloaded(accountId)
              if (isOverloaded) {
                await claudeAccountService.removeAccountOverload(accountId)
              }
            } catch (overloadError) {
              logger.error(
                `❌ [Stream] Failed to check/remove overload status for account ${accountId}:`,
                overloadError
              )
            }

            // 只有真实的 Claude Code 请求才更新 headers（流式请求）
            if (clientHeaders && Object.keys(clientHeaders).length > 0 && isRealClaudeCodeRequest) {
              await claudeCodeHeadersService.storeAccountHeaders(accountId, clientHeaders)
            }
          }

          // 🧹 清理 bodyStore
          if (requestOptions.bodyStoreId) {
            this.bodyStore.delete(requestOptions.bodyStoreId)
          }
          logger.debug('🌊 Claude stream response with usage capture completed')
          resolve()
        })
      })

      req.on('error', async (error) => {
        logger.error(
          `❌ Claude stream request error (Account: ${account?.name || accountId}):`,
          error.message,
          {
            code: error.code,
            errno: error.errno,
            syscall: error.syscall
          }
        )

        // 根据错误类型提供更具体的错误信息
        let errorMessage = 'Upstream request failed'
        let statusCode = 500
        if (error.code === 'ECONNRESET') {
          errorMessage = 'Connection reset by Claude API server'
          statusCode = 502
        } else if (error.code === 'ENOTFOUND') {
          errorMessage = 'Unable to resolve Claude API hostname'
          statusCode = 502
        } else if (error.code === 'ECONNREFUSED') {
          errorMessage = 'Connection refused by Claude API server'
          statusCode = 502
        } else if (error.code === 'ETIMEDOUT') {
          errorMessage = 'Connection timed out to Claude API server'
          statusCode = 504
        }

        if (!responseStream.headersSent) {
          const existingConnection = responseStream.getHeader
            ? responseStream.getHeader('Connection')
            : null
          responseStream.writeHead(statusCode, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: existingConnection || 'keep-alive'
          })
        }

        if (isStreamWritable(responseStream)) {
          // 发送 SSE 错误事件
          responseStream.write('event: error\n')
          responseStream.write(
            `data: ${JSON.stringify({
              error: errorMessage,
              code: error.code,
              timestamp: new Date().toISOString()
            })}\n\n`
          )
          responseStream.end()
        }
        // 🧹 清理 bodyStore
        if (requestOptions.bodyStoreId) {
          this.bodyStore.delete(requestOptions.bodyStoreId)
        }
        reject(error)
      })

      req.on('timeout', async () => {
        req.destroy()
        logger.error(`❌ Claude stream request timeout | Account: ${account?.name || accountId}`)

        if (!responseStream.headersSent) {
          const existingConnection = responseStream.getHeader
            ? responseStream.getHeader('Connection')
            : null
          responseStream.writeHead(504, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: existingConnection || 'keep-alive'
          })
        }
        if (isStreamWritable(responseStream)) {
          // 发送 SSE 错误事件
          responseStream.write('event: error\n')
          responseStream.write(
            `data: ${JSON.stringify({
              error: 'Request timeout',
              code: 'TIMEOUT',
              timestamp: new Date().toISOString()
            })}\n\n`
          )
          responseStream.end()
        }
        // 🧹 清理 bodyStore
        if (requestOptions.bodyStoreId) {
          this.bodyStore.delete(requestOptions.bodyStoreId)
        }
        reject(new Error('Request timeout'))
      })

      // 处理客户端断开连接
      responseStream.on('close', () => {
        logger.debug('🔌 Client disconnected, cleaning up stream')
        if (!req.destroyed) {
          req.destroy(new Error('Client disconnected'))
        }
      })

      // 写入请求体
      req.write(bodyString)
      // 🧹 内存优化：立即清空 bodyString 引用，避免闭包捕获
      bodyString = null
      req.end()
    })
  }

  // 🛠️ 统一的错误处理方法
  async _handleServerError(
    accountId,
    statusCode,
    sessionHash = null,
    context = '',
    accountType = 'claude-official'
  ) {
    try {
      await claudeAccountService.recordServerError(accountId, statusCode)
      const errorCount = await claudeAccountService.getServerErrorCount(accountId)

      // 根据错误类型设置不同的阈值和日志前缀
      const isTimeout = statusCode === 504
      const threshold = 3 // 统一使用3次阈值
      const prefix = context ? `${context} ` : ''

      logger.warn(
        `⏱️ ${prefix}${isTimeout ? 'Timeout' : 'Server'} error for account ${accountId}, error count: ${errorCount}/${threshold}`
      )

      // 标记账户为临时不可用（TTL 由 upstreamError 配置决定）
      try {
        await unifiedClaudeScheduler.markAccountTemporarilyUnavailable(
          accountId,
          accountType,
          sessionHash,
          null,
          statusCode
        )
      } catch (markError) {
        logger.error(`❌ Failed to mark account temporarily unavailable: ${accountId}`, markError)
      }

      if (errorCount > threshold) {
        const errorTypeLabel = isTimeout ? 'timeout' : '5xx'
        // ⚠️ 只记录5xx/504告警，不再自动停止调度，避免上游抖动导致误停
        logger.error(
          `❌ ${prefix}Account ${accountId} exceeded ${errorTypeLabel} error threshold (${errorCount} errors), please investigate upstream stability`
        )
      }
    } catch (handlingError) {
      logger.error(`❌ Failed to handle ${context} server error:`, handlingError)
    }
  }

  // 🔄 重试逻辑
  async _retryRequest(requestFunc, maxRetries = 3) {
    let lastError

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await requestFunc()
      } catch (error) {
        lastError = error

        if (i < maxRetries - 1) {
          const delay = Math.pow(2, i) * 1000 // 指数退避
          logger.warn(`⏳ Retry ${i + 1}/${maxRetries} in ${delay}ms: ${error.message}`)
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError
  }

  // 🔐 记录401未授权错误
  async recordUnauthorizedError(accountId) {
    try {
      const key = `claude_account:${accountId}:401_errors`

      // 增加错误计数，设置5分钟过期时间
      await redis.client.incr(key)
      await redis.client.expire(key, 300) // 5分钟

      logger.info(`📝 Recorded 401 error for account ${accountId}`)
    } catch (error) {
      logger.error(`❌ Failed to record 401 error for account ${accountId}:`, error)
    }
  }

  // 🔍 获取401错误计数
  async getUnauthorizedErrorCount(accountId) {
    try {
      const key = `claude_account:${accountId}:401_errors`

      const count = await redis.client.get(key)
      return parseInt(count) || 0
    } catch (error) {
      logger.error(`❌ Failed to get 401 error count for account ${accountId}:`, error)
      return 0
    }
  }

  // 🧹 清除401错误计数
  async clearUnauthorizedErrors(accountId) {
    try {
      const key = `claude_account:${accountId}:401_errors`

      await redis.client.del(key)
      logger.info(`✅ Cleared 401 error count for account ${accountId}`)
    } catch (error) {
      logger.error(`❌ Failed to clear 401 errors for account ${accountId}:`, error)
    }
  }

  // 🔧 动态捕获并获取统一的 User-Agent
  async captureAndGetUnifiedUserAgent(clientHeaders, account) {
    if (account.useUnifiedUserAgent !== 'true') {
      return null
    }

    const CACHE_KEY = 'claude_code_user_agent:daily'
    const TTL = 90000 // 25小时

    // ⚠️ 重要：这里通过正则表达式判断是否为 Claude Code 客户端
    // 如果未来 Claude Code 的 User-Agent 格式发生变化，需要更新这个正则表达式
    // 当前已知格式：claude-cli/1.0.102 (external, cli)
    const CLAUDE_CODE_UA_PATTERN = /^claude-cli\/[\d.]+\s+\(/i

    const clientUA = clientHeaders?.['user-agent'] || clientHeaders?.['User-Agent']
    let cachedUA = await redis.client.get(CACHE_KEY)

    if (clientUA && CLAUDE_CODE_UA_PATTERN.test(clientUA)) {
      if (!cachedUA) {
        // 没有缓存，直接存储
        await redis.client.setex(CACHE_KEY, TTL, clientUA)
        logger.info(`📱 Captured unified Claude Code User-Agent: ${clientUA}`)
        cachedUA = clientUA
      } else {
        // 有缓存，比较版本号，保存更新的版本
        const shouldUpdate = this.compareClaudeCodeVersions(clientUA, cachedUA)
        if (shouldUpdate) {
          await redis.client.setex(CACHE_KEY, TTL, clientUA)
          logger.info(`🔄 Updated to newer Claude Code User-Agent: ${clientUA} (was: ${cachedUA})`)
          cachedUA = clientUA
        } else {
          // 当前版本不比缓存版本新，仅刷新TTL
          await redis.client.expire(CACHE_KEY, TTL)
        }
      }
    }

    return cachedUA // 没有缓存返回 null
  }

  // 🔄 比较Claude Code版本号，判断是否需要更新
  // 返回 true 表示 newUA 版本更新，需要更新缓存
  compareClaudeCodeVersions(newUA, cachedUA) {
    try {
      // 提取版本号：claude-cli/1.0.102 (external, cli) -> 1.0.102
      // 支持多段版本号格式，如 1.0.102、2.1.0.beta1 等
      const newVersionMatch = newUA.match(/claude-cli\/([\d.]+(?:[a-zA-Z0-9-]*)?)/i)
      const cachedVersionMatch = cachedUA.match(/claude-cli\/([\d.]+(?:[a-zA-Z0-9-]*)?)/i)

      if (!newVersionMatch || !cachedVersionMatch) {
        // 无法解析版本号，优先使用新的
        logger.warn(`⚠️ Unable to parse Claude Code versions: new=${newUA}, cached=${cachedUA}`)
        return true
      }

      const newVersion = newVersionMatch[1]
      const cachedVersion = cachedVersionMatch[1]

      // 比较版本号 (semantic version)
      const compareResult = this.compareSemanticVersions(newVersion, cachedVersion)

      logger.debug(`🔍 Version comparison: ${newVersion} vs ${cachedVersion} = ${compareResult}`)

      return compareResult > 0 // 新版本更大则返回 true
    } catch (error) {
      logger.warn(`⚠️ Error comparing Claude Code versions, defaulting to update: ${error.message}`)
      return true // 出错时优先使用新的
    }
  }

  // 🔢 比较版本号
  // 返回：1 表示 v1 > v2，-1 表示 v1 < v2，0 表示相等
  compareSemanticVersions(version1, version2) {
    // 将版本号字符串按"."分割成数字数组
    const arr1 = version1.split('.')
    const arr2 = version2.split('.')

    // 获取两个版本号数组中的最大长度
    const maxLength = Math.max(arr1.length, arr2.length)

    // 循环遍历，逐段比较版本号
    for (let i = 0; i < maxLength; i++) {
      // 如果某个版本号的某一段不存在，则视为0
      const num1 = parseInt(arr1[i] || 0, 10)
      const num2 = parseInt(arr2[i] || 0, 10)

      if (num1 > num2) {
        return 1 // version1 大于 version2
      }
      if (num1 < num2) {
        return -1 // version1 小于 version2
      }
    }

    return 0 // 两个版本号相等
  }

  // 🧪 创建测试用的流转换器，将 Claude API SSE 格式转换为前端期望的格式
  _createTestStreamTransformer() {
    let testStartSent = false

    return (rawData) => {
      const lines = rawData.split('\n')
      const outputLines = []

      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          // 保留空行用于 SSE 分隔
          if (line.trim() === '') {
            outputLines.push('')
          }
          continue
        }

        const jsonStr = line.substring(6).trim()
        if (!jsonStr || jsonStr === '[DONE]') {
          continue
        }

        try {
          const data = JSON.parse(jsonStr)

          // 发送 test_start 事件（只在第一次 message_start 时发送）
          if (data.type === 'message_start' && !testStartSent) {
            testStartSent = true
            outputLines.push(`data: ${JSON.stringify({ type: 'test_start' })}`)
            outputLines.push('')
          }

          // 转换 content_block_delta 为 content
          if (data.type === 'content_block_delta' && data.delta && data.delta.text) {
            outputLines.push(`data: ${JSON.stringify({ type: 'content', text: data.delta.text })}`)
            outputLines.push('')
          }

          // 转换 message_stop 为 test_complete
          if (data.type === 'message_stop') {
            outputLines.push(`data: ${JSON.stringify({ type: 'test_complete', success: true })}`)
            outputLines.push('')
          }

          // 处理错误事件
          if (data.type === 'error') {
            const errorMsg = data.error?.message || data.message || '未知错误'
            outputLines.push(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}`)
            outputLines.push('')
          }
        } catch {
          // 忽略解析错误
        }
      }

      return outputLines.length > 0 ? outputLines.join('\n') : null
    }
  }

  // 🔧 准备测试请求的公共逻辑（供 testAccountConnection 和 testAccountConnectionSync 共用）
  async _prepareAccountForTest(accountId) {
    // 获取账户信息
    const account = await claudeAccountService.getAccount(accountId)
    if (!account) {
      throw new Error('Account not found')
    }

    // 获取有效的访问token
    const accessToken = await claudeAccountService.getValidAccessToken(accountId)
    if (!accessToken) {
      throw new Error('Failed to get valid access token')
    }

    // 获取代理配置
    const proxyAgent = await this._getProxyAgent(accountId)

    return { account, accessToken, proxyAgent }
  }

  // 🧪 测试账号连接（供Admin API使用，直接复用 _makeClaudeStreamRequestWithUsageCapture）
  async testAccountConnection(accountId, responseStream, model = 'claude-sonnet-4-5-20250929') {
    const testRequestBody = createClaudeTestPayload(model, { stream: true })

    try {
      const { account, accessToken, proxyAgent } = await this._prepareAccountForTest(accountId)

      logger.info(`🧪 Testing Claude account connection: ${account.name} (${accountId})`)

      // 设置响应头
      if (!responseStream.headersSent) {
        const existingConnection = responseStream.getHeader
          ? responseStream.getHeader('Connection')
          : null
        responseStream.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: existingConnection || 'keep-alive',
          'X-Accel-Buffering': 'no'
        })
      }

      // 创建流转换器，将 Claude API 格式转换为前端测试页面期望的格式
      const streamTransformer = this._createTestStreamTransformer()

      // 直接复用现有的流式请求方法
      await this._makeClaudeStreamRequestWithUsageCapture(
        testRequestBody,
        accessToken,
        proxyAgent,
        {}, // clientHeaders - 测试不需要客户端headers
        responseStream,
        null, // usageCallback - 测试不需要统计
        accountId,
        'claude-official', // accountType
        null, // sessionHash - 测试不需要会话
        streamTransformer, // 使用转换器将 Claude API 格式转为前端期望格式
        {}, // requestOptions
        false // isDedicatedOfficialAccount
      )

      logger.info(`✅ Test request completed for account: ${account.name}`)
    } catch (error) {
      logger.error(`❌ Test account connection failed:`, error)
      // 发送错误事件给前端
      if (isStreamWritable(responseStream)) {
        try {
          const errorMsg = error.message || '测试失败'
          responseStream.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`)
        } catch {
          // 忽略写入错误
        }
      }
      throw error
    }
  }

  // 🧪 非流式测试账号连接（供定时任务使用）
  // 复用流式请求方法，收集结果后返回
  async testAccountConnectionSync(accountId, model = 'claude-sonnet-4-5-20250929') {
    const testRequestBody = createClaudeTestPayload(model, { stream: true })
    const startTime = Date.now()

    try {
      // 使用公共方法准备测试所需的账户信息、token 和代理
      const { account, accessToken, proxyAgent } = await this._prepareAccountForTest(accountId)

      logger.info(`🧪 Testing Claude account connection (sync): ${account.name} (${accountId})`)

      // 创建一个收集器来捕获流式响应
      let responseText = ''
      let capturedUsage = null
      let capturedModel = model
      let hasError = false
      let errorMessage = ''

      // 创建模拟的响应流对象
      const mockResponseStream = {
        headersSent: true, // 跳过设置响应头
        write: (data) => {
          // 解析 SSE 数据
          if (typeof data === 'string' && data.startsWith('data: ')) {
            try {
              const jsonStr = data.replace('data: ', '').trim()
              if (jsonStr && jsonStr !== '[DONE]') {
                const parsed = JSON.parse(jsonStr)
                // 提取文本内容
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  responseText += parsed.delta.text
                }
                // 提取 usage 信息
                if (parsed.type === 'message_delta' && parsed.usage) {
                  capturedUsage = parsed.usage
                }
                // 提取模型信息
                if (parsed.type === 'message_start' && parsed.message?.model) {
                  capturedModel = parsed.message.model
                }
                // 检测错误
                if (parsed.type === 'error') {
                  hasError = true
                  errorMessage = parsed.error?.message || 'Unknown error'
                }
              }
            } catch {
              // 忽略解析错误
            }
          }
          return true
        },
        end: () => {},
        on: () => {},
        once: () => {},
        emit: () => {},
        writable: true
      }

      // 复用流式请求方法
      await this._makeClaudeStreamRequestWithUsageCapture(
        testRequestBody,
        accessToken,
        proxyAgent,
        {}, // clientHeaders - 测试不需要客户端headers
        mockResponseStream,
        null, // usageCallback - 测试不需要统计
        accountId,
        'claude-official', // accountType
        null, // sessionHash - 测试不需要会话
        null, // streamTransformer - 不需要转换，直接解析原始格式
        {}, // requestOptions
        false // isDedicatedOfficialAccount
      )

      const latencyMs = Date.now() - startTime

      if (hasError) {
        logger.warn(`⚠️ Test completed with error for account: ${account.name} - ${errorMessage}`)
        return {
          success: false,
          error: errorMessage,
          latencyMs,
          timestamp: new Date().toISOString()
        }
      }

      logger.info(`✅ Test completed for account: ${account.name} (${latencyMs}ms)`)

      return {
        success: true,
        message: responseText.substring(0, 200), // 截取前200字符
        latencyMs,
        model: capturedModel,
        usage: capturedUsage,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime
      logger.error(`❌ Test account connection (sync) failed:`, error.message)

      // 提取错误详情
      let errorMessage = error.message
      if (error.response) {
        errorMessage =
          error.response.data?.error?.message || error.response.statusText || error.message
      }

      return {
        success: false,
        error: errorMessage,
        statusCode: error.response?.status,
        latencyMs,
        timestamp: new Date().toISOString()
      }
    }
  }

  // 🎯 健康检查
  async healthCheck() {
    try {
      const accounts = await claudeAccountService.getAllAccounts()
      const activeAccounts = accounts.filter((acc) => acc.isActive && acc.status === 'active')

      return {
        healthy: activeAccounts.length > 0,
        activeAccounts: activeAccounts.length,
        totalAccounts: accounts.length,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      logger.error('❌ Health check failed:', error)
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }

  // 🔄 判断账户是否应该在 403 错误时进行重试
  // 仅 claude-official 类型账户（OAuth 或 Setup Token 授权）需要重试
  _shouldRetryOn403(accountType) {
    return accountType === 'claude-official'
  }

  // ⏱️ 等待指定毫秒数
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

module.exports = new ClaudeRelayService()
