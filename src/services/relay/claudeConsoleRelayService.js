const axios = require('axios')
const { v4: uuidv4 } = require('uuid')
const claudeConsoleAccountService = require('../account/claudeConsoleAccountService')
const redis = require('../../models/redis')
const logger = require('../../utils/logger')
const config = require('../../../config/config')
const {
  sanitizeUpstreamError,
  sanitizeErrorMessage,
  isAccountDisabledError
} = require('../../utils/errorSanitizer')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')
const userMessageQueueService = require('../userMessageQueueService')
const { isStreamWritable } = require('../../utils/streamHelper')
const { filterForClaude } = require('../../utils/headerFilter')

class ClaudeConsoleRelayService {
  constructor() {
    this.defaultUserAgent = 'claude-cli/2.0.52 (external, cli)'
  }

  // 🚀 转发请求到Claude Console API
  async relayRequest(
    requestBody,
    apiKeyData,
    clientRequest,
    clientResponse,
    clientHeaders,
    accountId,
    options = {}
  ) {
    let abortController = null
    let account = null
    const requestId = uuidv4() // 用于并发追踪
    let concurrencyAcquired = false
    let queueLockAcquired = false
    let queueRequestId = null

    try {
      // 📬 用户消息队列处理：如果是用户消息请求，需要获取队列锁
      if (userMessageQueueService.isUserMessageRequest(requestBody)) {
        // 校验 accountId 非空，避免空值污染队列锁键
        if (!accountId || accountId === '') {
          logger.error('❌ accountId missing for queue lock in console relayRequest')
          throw new Error('accountId missing for queue lock')
        }
        const queueResult = await userMessageQueueService.acquireQueueLock(accountId)
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
            `📬 User message queue ${errorType} for console account ${accountId}, key: ${apiKeyData.name}`,
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
            `📬 User message queue lock acquired for console account ${accountId}, requestId: ${queueRequestId}`
          )
        }
      }

      // 获取账户信息
      account = await claudeConsoleAccountService.getAccount(accountId)
      if (!account) {
        throw new Error('Claude Console Claude account not found')
      }

      const autoProtectionDisabled = account.disableAutoProtection === true

      logger.info(
        `📤 Processing Claude Console API request for key: ${apiKeyData.name || apiKeyData.id}, account: ${account.name} (${accountId}), request: ${requestId}`
      )

      // 🔒 并发控制：原子性抢占槽位
      if (account.maxConcurrentTasks > 0) {
        // 先抢占，再检查 - 避免竞态条件
        const newConcurrency = Number(
          await redis.incrConsoleAccountConcurrency(accountId, requestId, 600)
        )
        concurrencyAcquired = true

        // 检查是否超过限制
        if (newConcurrency > account.maxConcurrentTasks) {
          // 超限，立即回滚
          await redis.decrConsoleAccountConcurrency(accountId, requestId)
          concurrencyAcquired = false

          logger.warn(
            `⚠️ Console account ${account.name} (${accountId}) concurrency limit exceeded: ${newConcurrency}/${account.maxConcurrentTasks} (request: ${requestId}, rolled back)`
          )

          const error = new Error('Console account concurrency limit reached')
          error.code = 'CONSOLE_ACCOUNT_CONCURRENCY_FULL'
          error.accountId = accountId
          throw error
        }

        logger.debug(
          `🔓 Acquired concurrency slot for account ${account.name} (${accountId}), current: ${newConcurrency}/${account.maxConcurrentTasks}, request: ${requestId}`
        )
      }
      logger.debug(`🌐 Account API URL: ${account.apiUrl}`)
      logger.debug(`🔍 Account supportedModels: ${JSON.stringify(account.supportedModels)}`)
      logger.debug(`🔑 Account has apiKey: ${!!account.apiKey}`)
      logger.debug(`📝 Request model: ${requestBody.model}`)

      // 处理模型映射
      let mappedModel = requestBody.model
      if (
        account.supportedModels &&
        typeof account.supportedModels === 'object' &&
        !Array.isArray(account.supportedModels)
      ) {
        const newModel = claudeConsoleAccountService.getMappedModel(
          account.supportedModels,
          requestBody.model
        )
        if (newModel !== requestBody.model) {
          logger.info(`🔄 Mapping model from ${requestBody.model} to ${newModel}`)
          mappedModel = newModel
        }
      }

      // 创建修改后的请求体
      const modifiedRequestBody = {
        ...requestBody,
        model: mappedModel
      }

      // 模型兼容性检查已经在调度器中完成，这里不需要再检查

      // 创建代理agent
      const proxyAgent = claudeConsoleAccountService._createProxyAgent(account.proxy)

      // 创建AbortController用于取消请求
      abortController = new AbortController()

      // 设置客户端断开监听器
      const handleClientDisconnect = () => {
        logger.info('🔌 Client disconnected, aborting Claude Console Claude request')
        if (abortController && !abortController.signal.aborted) {
          abortController.abort()
        }
      }

      // 监听客户端断开事件
      if (clientRequest) {
        clientRequest.once('close', handleClientDisconnect)
      }
      if (clientResponse) {
        clientResponse.once('close', handleClientDisconnect)
      }

      // 构建完整的API URL
      const cleanUrl = account.apiUrl.replace(/\/$/, '') // 移除末尾斜杠
      let apiEndpoint

      if (options.customPath) {
        // 如果指定了自定义路径（如 count_tokens），使用它
        const baseUrl = cleanUrl.replace(/\/v1\/messages$/, '') // 移除已有的 /v1/messages
        apiEndpoint = `${baseUrl}${options.customPath}`
      } else {
        // 默认使用 messages 端点
        apiEndpoint = cleanUrl.endsWith('/v1/messages') ? cleanUrl : `${cleanUrl}/v1/messages`
      }

      logger.debug(`🎯 Final API endpoint: ${apiEndpoint}`)
      logger.debug(`[DEBUG] Options passed to relayRequest: ${JSON.stringify(options)}`)
      logger.debug(`[DEBUG] Client headers received: ${JSON.stringify(clientHeaders)}`)

      // 过滤客户端请求头
      const filteredHeaders = this._filterClientHeaders(clientHeaders)
      logger.debug(`[DEBUG] Filtered client headers: ${JSON.stringify(filteredHeaders)}`)

      // 决定使用的 User-Agent：优先使用账户自定义的，否则透传客户端的，最后才使用默认值
      const userAgent =
        account.userAgent ||
        clientHeaders?.['user-agent'] ||
        clientHeaders?.['User-Agent'] ||
        this.defaultUserAgent

      // 准备请求配置
      const requestConfig = {
        method: 'POST',
        url: apiEndpoint,
        data: modifiedRequestBody,
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'User-Agent': userAgent,
          ...filteredHeaders
        },
        timeout: config.requestTimeout || 600000,
        signal: abortController.signal,
        validateStatus: () => true // 接受所有状态码
      }

      if (proxyAgent) {
        requestConfig.httpAgent = proxyAgent
        requestConfig.httpsAgent = proxyAgent
        requestConfig.proxy = false
      }

      // 根据 API Key 格式选择认证方式
      if (account.apiKey && account.apiKey.startsWith('sk-ant-')) {
        // Anthropic 官方 API Key 使用 x-api-key
        requestConfig.headers['x-api-key'] = account.apiKey
        logger.debug('[DEBUG] Using x-api-key authentication for sk-ant-* API key')
      } else {
        // 其他 API Key 使用 Authorization Bearer
        requestConfig.headers['Authorization'] = `Bearer ${account.apiKey}`
        logger.debug('[DEBUG] Using Authorization Bearer authentication')
      }

      logger.debug(
        `[DEBUG] Initial headers before beta: ${JSON.stringify(requestConfig.headers, null, 2)}`
      )

      // 添加beta header如果需要
      if (options.betaHeader) {
        logger.debug(`[DEBUG] Adding beta header: ${options.betaHeader}`)
        requestConfig.headers['anthropic-beta'] = options.betaHeader
      } else {
        logger.debug('[DEBUG] No beta header to add')
      }

      // 发送请求
      logger.debug(
        '📤 Sending request to Claude Console API with headers:',
        JSON.stringify(requestConfig.headers, null, 2)
      )
      const response = await axios(requestConfig)

      // 📬 请求已发送成功，立即释放队列锁（无需等待响应处理完成）
      // 因为 Claude API 限流基于请求发送时刻计算（RPM），不是请求完成时刻
      if (queueLockAcquired && queueRequestId && accountId) {
        try {
          await userMessageQueueService.releaseQueueLock(accountId, queueRequestId)
          queueLockAcquired = false // 标记已释放，防止 finally 重复释放
          logger.debug(
            `📬 User message queue lock released early for console account ${accountId}, requestId: ${queueRequestId}`
          )
        } catch (releaseError) {
          logger.error(
            `❌ Failed to release user message queue lock early for console account ${accountId}:`,
            releaseError.message
          )
        }
      }

      // 移除监听器（请求成功完成）
      if (clientRequest) {
        clientRequest.removeListener('close', handleClientDisconnect)
      }
      if (clientResponse) {
        clientResponse.removeListener('close', handleClientDisconnect)
      }

      logger.debug(`🔗 Claude Console API response: ${response.status}`)
      logger.debug(`[DEBUG] Response headers: ${JSON.stringify(response.headers)}`)
      logger.debug(`[DEBUG] Response data type: ${typeof response.data}`)
      logger.debug(
        `[DEBUG] Response data length: ${response.data ? (typeof response.data === 'string' ? response.data.length : JSON.stringify(response.data).length) : 0}`
      )

      // 对于错误响应，记录原始错误和清理后的预览
      if (response.status < 200 || response.status >= 300) {
        // 记录原始错误响应（包含供应商信息，用于调试）
        const rawData =
          typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
        logger.error(
          `📝 Upstream error response from ${account?.name || accountId}: ${rawData.substring(0, 500)}`
        )

        // 记录清理后的数据到error
        try {
          const responseData =
            typeof response.data === 'string' ? JSON.parse(response.data) : response.data
          const sanitizedData = sanitizeUpstreamError(responseData)
          logger.error(`🧹 [SANITIZED] Error response to client: ${JSON.stringify(sanitizedData)}`)
        } catch (e) {
          const rawText =
            typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
          const sanitizedText = sanitizeErrorMessage(rawText)
          logger.error(`🧹 [SANITIZED] Error response to client: ${sanitizedText}`)
        }
      } else {
        logger.debug(
          `[DEBUG] Response data preview: ${typeof response.data === 'string' ? response.data.substring(0, 200) : JSON.stringify(response.data).substring(0, 200)}`
        )
      }

      // 检查是否为账户禁用/不可用的 400 错误
      const accountDisabledError = isAccountDisabledError(response.status, response.data)

      // 检查错误状态并相应处理
      if (response.status === 401) {
        logger.warn(
          `🚫 Unauthorized error detected for Claude Console account ${accountId}${autoProtectionDisabled ? ' (auto-protection disabled, skipping status change)' : ''}`
        )
        if (!autoProtectionDisabled) {
          await upstreamErrorHelper
            .markTempUnavailable(accountId, 'claude-console', 401)
            .catch(() => {})
        }
      } else if (accountDisabledError) {
        logger.error(
          `🚫 Account disabled error (400) detected for Claude Console account ${accountId}${autoProtectionDisabled ? ' (auto-protection disabled, skipping status change)' : ''}`
        )
        // 传入完整的错误详情到 webhook
        const errorDetails =
          typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
        if (!autoProtectionDisabled) {
          await claudeConsoleAccountService.markConsoleAccountBlocked(accountId, errorDetails)
        }
      } else if (response.status === 429) {
        logger.warn(
          `🚫 Rate limit detected for Claude Console account ${accountId}${autoProtectionDisabled ? ' (auto-protection disabled, skipping status change)' : ''}`
        )
        // 收到429先检查是否因为超过了手动配置的每日额度
        await claudeConsoleAccountService.checkQuotaUsage(accountId).catch((err) => {
          logger.error('❌ Failed to check quota after 429 error:', err)
        })

        if (!autoProtectionDisabled) {
          await claudeConsoleAccountService.markAccountRateLimited(accountId)
          await upstreamErrorHelper
            .markTempUnavailable(
              accountId,
              'claude-console',
              429,
              upstreamErrorHelper.parseRetryAfter(response.headers)
            )
            .catch(() => {})
        }
      } else if (response.status === 529) {
        logger.warn(
          `🚫 Overload error detected for Claude Console account ${accountId}${autoProtectionDisabled ? ' (auto-protection disabled, skipping status change)' : ''}`
        )
        if (!autoProtectionDisabled) {
          await claudeConsoleAccountService.markAccountOverloaded(accountId)
          await upstreamErrorHelper
            .markTempUnavailable(accountId, 'claude-console', 529)
            .catch(() => {})
        }
      } else if (response.status >= 500) {
        logger.warn(
          `🔥 Server error (${response.status}) detected for Claude Console account ${accountId}${autoProtectionDisabled ? ' (auto-protection disabled, skipping status change)' : ''}`
        )
        if (!autoProtectionDisabled) {
          await upstreamErrorHelper
            .markTempUnavailable(accountId, 'claude-console', response.status)
            .catch(() => {})
        }
      } else if (response.status === 200 || response.status === 201) {
        // 如果请求成功，检查并移除错误状态
        const isRateLimited = await claudeConsoleAccountService.isAccountRateLimited(accountId)
        if (isRateLimited) {
          await claudeConsoleAccountService.removeAccountRateLimit(accountId)
        }
        const isOverloaded = await claudeConsoleAccountService.isAccountOverloaded(accountId)
        if (isOverloaded) {
          await claudeConsoleAccountService.removeAccountOverload(accountId)
        }
      }

      // 更新最后使用时间
      await this._updateLastUsedTime(accountId)

      // 准备响应体并清理错误信息（如果是错误响应）
      let responseBody
      if (response.status < 200 || response.status >= 300) {
        // 错误响应，清理供应商信息
        try {
          const responseData =
            typeof response.data === 'string' ? JSON.parse(response.data) : response.data
          const sanitizedData = sanitizeUpstreamError(responseData)
          responseBody = JSON.stringify(sanitizedData)
          logger.debug(`🧹 Sanitized error response`)
        } catch (parseError) {
          // 如果无法解析为JSON，尝试清理文本
          const rawText =
            typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
          responseBody = sanitizeErrorMessage(rawText)
          logger.debug(`🧹 Sanitized error text`)
        }
      } else {
        // 成功响应，不需要清理
        responseBody =
          typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
      }

      logger.debug(`[DEBUG] Final response body to return: ${responseBody.substring(0, 200)}...`)

      return {
        statusCode: response.status,
        headers: response.headers,
        body: responseBody,
        accountId
      }
    } catch (error) {
      // 处理特定错误
      if (
        error.name === 'AbortError' ||
        error.name === 'CanceledError' ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ERR_CANCELED'
      ) {
        logger.info('Request aborted due to client disconnect')
        throw new Error('Client disconnected')
      }

      logger.error(
        `❌ Claude Console relay request failed (Account: ${account?.name || accountId}):`,
        error.message
      )

      // 不再因为模型不支持而block账号

      throw error
    } finally {
      // 🔓 并发控制：释放并发槽位
      if (concurrencyAcquired) {
        try {
          await redis.decrConsoleAccountConcurrency(accountId, requestId)
          logger.debug(
            `🔓 Released concurrency slot for account ${account?.name || accountId}, request: ${requestId}`
          )
        } catch (releaseError) {
          logger.error(
            `❌ Failed to release concurrency slot for account ${accountId}, request: ${requestId}:`,
            releaseError.message
          )
        }
      }

      // 📬 释放用户消息队列锁（兜底，正常情况下已在请求发送后提前释放）
      if (queueLockAcquired && queueRequestId && accountId) {
        try {
          await userMessageQueueService.releaseQueueLock(accountId, queueRequestId)
          logger.debug(
            `📬 User message queue lock released in finally for console account ${accountId}, requestId: ${queueRequestId}`
          )
        } catch (releaseError) {
          logger.error(
            `❌ Failed to release user message queue lock for account ${accountId}:`,
            releaseError.message
          )
        }
      }
    }
  }

  // 🌊 处理流式响应
  async relayStreamRequestWithUsageCapture(
    requestBody,
    apiKeyData,
    responseStream,
    clientHeaders,
    usageCallback,
    accountId,
    streamTransformer = null,
    options = {}
  ) {
    let account = null
    const requestId = uuidv4() // 用于并发追踪
    let concurrencyAcquired = false
    let leaseRefreshInterval = null // 租约刷新定时器
    let queueLockAcquired = false
    let queueRequestId = null

    try {
      // 📬 用户消息队列处理：如果是用户消息请求，需要获取队列锁
      if (userMessageQueueService.isUserMessageRequest(requestBody)) {
        // 校验 accountId 非空，避免空值污染队列锁键
        if (!accountId || accountId === '') {
          logger.error(
            '❌ accountId missing for queue lock in console relayStreamRequestWithUsageCapture'
          )
          throw new Error('accountId missing for queue lock')
        }
        const queueResult = await userMessageQueueService.acquireQueueLock(accountId)
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
            `📬 User message queue ${errorType} for console account ${accountId} (stream), key: ${apiKeyData.name}`,
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
          const errorEvent = `event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: errorType, code: errorCode, message: errorMessage } })}\n\n`
          responseStream.write(errorEvent)
          responseStream.write('data: [DONE]\n\n')
          responseStream.end()
          return
        }
        if (queueResult.acquired && !queueResult.skipped) {
          queueLockAcquired = true
          queueRequestId = queueResult.requestId
          logger.debug(
            `📬 User message queue lock acquired for console account ${accountId} (stream), requestId: ${queueRequestId}`
          )
        }
      }

      // 获取账户信息
      account = await claudeConsoleAccountService.getAccount(accountId)
      if (!account) {
        throw new Error('Claude Console Claude account not found')
      }

      logger.info(
        `📡 Processing streaming Claude Console API request for key: ${apiKeyData.name || apiKeyData.id}, account: ${account.name} (${accountId}), request: ${requestId}`
      )

      // 🔒 并发控制：原子性抢占槽位
      if (account.maxConcurrentTasks > 0) {
        // 先抢占，再检查 - 避免竞态条件
        const newConcurrency = Number(
          await redis.incrConsoleAccountConcurrency(accountId, requestId, 600)
        )
        concurrencyAcquired = true

        // 检查是否超过限制
        if (newConcurrency > account.maxConcurrentTasks) {
          // 超限，立即回滚
          await redis.decrConsoleAccountConcurrency(accountId, requestId)
          concurrencyAcquired = false

          logger.warn(
            `⚠️ Console account ${account.name} (${accountId}) concurrency limit exceeded: ${newConcurrency}/${account.maxConcurrentTasks} (stream request: ${requestId}, rolled back)`
          )

          const error = new Error('Console account concurrency limit reached')
          error.code = 'CONSOLE_ACCOUNT_CONCURRENCY_FULL'
          error.accountId = accountId
          throw error
        }

        logger.debug(
          `🔓 Acquired concurrency slot for stream account ${account.name} (${accountId}), current: ${newConcurrency}/${account.maxConcurrentTasks}, request: ${requestId}`
        )

        // 🔄 启动租约刷新定时器（每5分钟刷新一次，防止长连接租约过期）
        leaseRefreshInterval = setInterval(
          async () => {
            try {
              await redis.refreshConsoleAccountConcurrencyLease(accountId, requestId, 600)
              logger.debug(
                `🔄 Refreshed concurrency lease for stream account ${account.name} (${accountId}), request: ${requestId}`
              )
            } catch (refreshError) {
              logger.error(
                `❌ Failed to refresh concurrency lease for account ${accountId}, request: ${requestId}:`,
                refreshError.message
              )
            }
          },
          5 * 60 * 1000
        ) // 5分钟刷新一次
      }

      logger.debug(`🌐 Account API URL: ${account.apiUrl}`)

      // 处理模型映射
      let mappedModel = requestBody.model
      if (
        account.supportedModels &&
        typeof account.supportedModels === 'object' &&
        !Array.isArray(account.supportedModels)
      ) {
        const newModel = claudeConsoleAccountService.getMappedModel(
          account.supportedModels,
          requestBody.model
        )
        if (newModel !== requestBody.model) {
          logger.info(`🔄 [Stream] Mapping model from ${requestBody.model} to ${newModel}`)
          mappedModel = newModel
        }
      }

      // 创建修改后的请求体
      const modifiedRequestBody = {
        ...requestBody,
        model: mappedModel
      }

      // 模型兼容性检查已经在调度器中完成，这里不需要再检查

      // 创建代理agent
      const proxyAgent = claudeConsoleAccountService._createProxyAgent(account.proxy)

      // 发送流式请求
      await this._makeClaudeConsoleStreamRequest(
        modifiedRequestBody,
        account,
        proxyAgent,
        clientHeaders,
        responseStream,
        accountId,
        usageCallback,
        streamTransformer,
        options,
        // 📬 回调：在收到响应头时释放队列锁
        async () => {
          if (queueLockAcquired && queueRequestId && accountId) {
            try {
              await userMessageQueueService.releaseQueueLock(accountId, queueRequestId)
              queueLockAcquired = false // 标记已释放，防止 finally 重复释放
              logger.debug(
                `📬 User message queue lock released early for console stream account ${accountId}, requestId: ${queueRequestId}`
              )
            } catch (releaseError) {
              logger.error(
                `❌ Failed to release user message queue lock early for console stream account ${accountId}:`,
                releaseError.message
              )
            }
          }
        }
      )

      // 更新最后使用时间
      await this._updateLastUsedTime(accountId)
    } catch (error) {
      // 客户端主动断开连接是正常情况，使用 INFO 级别
      if (error.message === 'Client disconnected') {
        logger.info(
          `🔌 Claude Console stream relay ended: Client disconnected (Account: ${account?.name || accountId})`
        )
      } else {
        logger.error(
          `❌ Claude Console stream relay failed (Account: ${account?.name || accountId}):`,
          error
        )
      }
      throw error
    } finally {
      // 🛑 清理租约刷新定时器
      if (leaseRefreshInterval) {
        clearInterval(leaseRefreshInterval)
        logger.debug(
          `🛑 Cleared lease refresh interval for stream account ${account?.name || accountId}, request: ${requestId}`
        )
      }

      // 🔓 并发控制:释放并发槽位
      if (concurrencyAcquired) {
        try {
          await redis.decrConsoleAccountConcurrency(accountId, requestId)
          logger.debug(
            `🔓 Released concurrency slot for stream account ${account?.name || accountId}, request: ${requestId}`
          )
        } catch (releaseError) {
          logger.error(
            `❌ Failed to release concurrency slot for stream account ${accountId}, request: ${requestId}:`,
            releaseError.message
          )
        }
      }

      // 📬 释放用户消息队列锁（兜底，正常情况下已在收到响应头后提前释放）
      if (queueLockAcquired && queueRequestId && accountId) {
        try {
          await userMessageQueueService.releaseQueueLock(accountId, queueRequestId)
          logger.debug(
            `📬 User message queue lock released in finally for console stream account ${accountId}, requestId: ${queueRequestId}`
          )
        } catch (releaseError) {
          logger.error(
            `❌ Failed to release user message queue lock for stream account ${accountId}:`,
            releaseError.message
          )
        }
      }
    }
  }

  // 🌊 发送流式请求到Claude Console API
  async _makeClaudeConsoleStreamRequest(
    body,
    account,
    proxyAgent,
    clientHeaders,
    responseStream,
    accountId,
    usageCallback,
    streamTransformer = null,
    requestOptions = {},
    onResponseHeaderReceived = null
  ) {
    return new Promise((resolve, reject) => {
      let aborted = false

      // 构建完整的API URL
      const cleanUrl = account.apiUrl.replace(/\/$/, '') // 移除末尾斜杠
      const apiEndpoint = cleanUrl.endsWith('/v1/messages') ? cleanUrl : `${cleanUrl}/v1/messages`

      logger.debug(`🎯 Final API endpoint for stream: ${apiEndpoint}`)

      // 过滤客户端请求头
      const filteredHeaders = this._filterClientHeaders(clientHeaders)
      logger.debug(`[DEBUG] Filtered client headers: ${JSON.stringify(filteredHeaders)}`)

      // 决定使用的 User-Agent：优先使用账户自定义的，否则透传客户端的，最后才使用默认值
      const userAgent =
        account.userAgent ||
        clientHeaders?.['user-agent'] ||
        clientHeaders?.['User-Agent'] ||
        this.defaultUserAgent

      // 准备请求配置
      const requestConfig = {
        method: 'POST',
        url: apiEndpoint,
        data: body,
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'User-Agent': userAgent,
          ...filteredHeaders
        },
        timeout: config.requestTimeout || 600000,
        responseType: 'stream',
        validateStatus: () => true // 接受所有状态码
      }

      if (proxyAgent) {
        requestConfig.httpAgent = proxyAgent
        requestConfig.httpsAgent = proxyAgent
        requestConfig.proxy = false
      }

      // 根据 API Key 格式选择认证方式
      if (account.apiKey && account.apiKey.startsWith('sk-ant-')) {
        // Anthropic 官方 API Key 使用 x-api-key
        requestConfig.headers['x-api-key'] = account.apiKey
        logger.debug('[DEBUG] Using x-api-key authentication for sk-ant-* API key')
      } else {
        // 其他 API Key 使用 Authorization Bearer
        requestConfig.headers['Authorization'] = `Bearer ${account.apiKey}`
        logger.debug('[DEBUG] Using Authorization Bearer authentication')
      }

      // 添加beta header如果需要
      if (requestOptions.betaHeader) {
        requestConfig.headers['anthropic-beta'] = requestOptions.betaHeader
      }

      // 发送请求
      const request = axios(requestConfig)

      // 注意：使用 .then(async ...) 模式处理响应
      // - 内部的 releaseQueueLock 有独立的 try-catch，不会导致未捕获异常
      // - queueLockAcquired = false 的赋值会在 finally 执行前完成（JS 单线程保证）
      request
        .then(async (response) => {
          logger.debug(`🌊 Claude Console Claude stream response status: ${response.status}`)

          // 错误响应处理
          if (response.status !== 200) {
            logger.error(
              `❌ Claude Console API returned error status: ${response.status} | Account: ${account?.name || accountId}`
            )

            // 收集错误数据用于检测
            let errorDataForCheck = ''
            const errorChunks = []

            response.data.on('data', (chunk) => {
              errorChunks.push(chunk)
              errorDataForCheck += chunk.toString()
            })

            response.data.on('end', async () => {
              const autoProtectionDisabled = account.disableAutoProtection === true
              // 记录原始错误消息到日志（方便调试，包含供应商信息）
              logger.error(
                `📝 [Stream] Upstream error response from ${account?.name || accountId}: ${errorDataForCheck.substring(0, 500)}`
              )

              // 检查是否为账户禁用错误
              const accountDisabledError = isAccountDisabledError(
                response.status,
                errorDataForCheck
              )

              if (response.status === 401) {
                logger.warn(
                  `🚫 [Stream] Unauthorized error detected for Claude Console account ${accountId}${autoProtectionDisabled ? ' (auto-protection disabled, skipping status change)' : ''}`
                )
                if (!autoProtectionDisabled) {
                  await upstreamErrorHelper
                    .markTempUnavailable(accountId, 'claude-console', 401)
                    .catch(() => {})
                }
              } else if (accountDisabledError) {
                logger.error(
                  `🚫 [Stream] Account disabled error (400) detected for Claude Console account ${accountId}${autoProtectionDisabled ? ' (auto-protection disabled, skipping status change)' : ''}`
                )
                // 传入完整的错误详情到 webhook
                if (!autoProtectionDisabled) {
                  await claudeConsoleAccountService.markConsoleAccountBlocked(
                    accountId,
                    errorDataForCheck
                  )
                }
              } else if (response.status === 429) {
                logger.warn(
                  `🚫 [Stream] Rate limit detected for Claude Console account ${accountId}${autoProtectionDisabled ? ' (auto-protection disabled, skipping status change)' : ''}`
                )
                // 检查是否因为超过每日额度
                claudeConsoleAccountService.checkQuotaUsage(accountId).catch((err) => {
                  logger.error('❌ Failed to check quota after 429 error:', err)
                })
                if (!autoProtectionDisabled) {
                  await claudeConsoleAccountService.markAccountRateLimited(accountId)
                  await upstreamErrorHelper
                    .markTempUnavailable(
                      accountId,
                      'claude-console',
                      429,
                      upstreamErrorHelper.parseRetryAfter(response.headers)
                    )
                    .catch(() => {})
                }
              } else if (response.status === 529) {
                logger.warn(
                  `🚫 [Stream] Overload error detected for Claude Console account ${accountId}${autoProtectionDisabled ? ' (auto-protection disabled, skipping status change)' : ''}`
                )
                if (!autoProtectionDisabled) {
                  await claudeConsoleAccountService.markAccountOverloaded(accountId)
                  await upstreamErrorHelper
                    .markTempUnavailable(accountId, 'claude-console', 529)
                    .catch(() => {})
                }
              } else if (response.status >= 500) {
                logger.warn(
                  `🔥 [Stream] Server error (${response.status}) detected for Claude Console account ${accountId}${autoProtectionDisabled ? ' (auto-protection disabled, skipping status change)' : ''}`
                )
                if (!autoProtectionDisabled) {
                  await upstreamErrorHelper
                    .markTempUnavailable(accountId, 'claude-console', response.status)
                    .catch(() => {})
                }
              }

              // 设置响应头
              if (!responseStream.headersSent) {
                responseStream.writeHead(response.status, {
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-cache'
                })
              }

              // 清理并发送错误响应
              try {
                const fullErrorData = Buffer.concat(errorChunks).toString()
                const errorJson = JSON.parse(fullErrorData)
                const sanitizedError = sanitizeUpstreamError(errorJson)

                // 记录清理后的错误消息（发送给客户端的，完整记录）
                logger.error(
                  `🧹 [Stream] [SANITIZED] Error response to client: ${JSON.stringify(sanitizedError)}`
                )

                if (isStreamWritable(responseStream)) {
                  responseStream.write(JSON.stringify(sanitizedError))
                  responseStream.end()
                }
              } catch (parseError) {
                const sanitizedText = sanitizeErrorMessage(errorDataForCheck)
                logger.error(`🧹 [Stream] [SANITIZED] Error response to client: ${sanitizedText}`)

                if (isStreamWritable(responseStream)) {
                  responseStream.write(sanitizedText)
                  responseStream.end()
                }
              }
              resolve() // 不抛出异常，正常完成流处理
            })

            return
          }

          // 📬 收到成功响应头（HTTP 200），调用回调释放队列锁
          // 此时请求已被 Claude API 接受并计入 RPM 配额，无需等待响应完成
          if (onResponseHeaderReceived && typeof onResponseHeaderReceived === 'function') {
            try {
              await onResponseHeaderReceived()
            } catch (callbackError) {
              logger.error(
                `❌ Failed to execute onResponseHeaderReceived callback for console stream account ${accountId}:`,
                callbackError.message
              )
            }
          }

          // 成功响应，检查并移除错误状态
          claudeConsoleAccountService.isAccountRateLimited(accountId).then((isRateLimited) => {
            if (isRateLimited) {
              claudeConsoleAccountService.removeAccountRateLimit(accountId)
            }
          })
          claudeConsoleAccountService.isAccountOverloaded(accountId).then((isOverloaded) => {
            if (isOverloaded) {
              claudeConsoleAccountService.removeAccountOverload(accountId)
            }
          })

          // 设置响应头
          // ⚠️ 关键修复：尊重 auth.js 提前设置的 Connection: close
          // 当并发队列功能启用时，auth.js 会设置 Connection: close 来禁用 Keep-Alive
          if (!responseStream.headersSent) {
            const existingConnection = responseStream.getHeader
              ? responseStream.getHeader('Connection')
              : null
            const connectionHeader = existingConnection || 'keep-alive'
            if (existingConnection) {
              logger.debug(
                `🔌 [Console Stream] Preserving existing Connection header: ${existingConnection}`
              )
            }
            responseStream.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: connectionHeader,
              'X-Accel-Buffering': 'no'
            })
          }

          let buffer = ''
          let finalUsageReported = false
          const collectedUsageData = {
            model: body.model || account?.defaultModel || null
          }

          // 处理流数据
          response.data.on('data', (chunk) => {
            try {
              if (aborted) {
                return
              }

              const chunkStr = chunk.toString()
              buffer += chunkStr

              // 处理完整的SSE行
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''

              // 转发数据并解析usage
              if (lines.length > 0) {
                // 检查流是否可写（客户端连接是否有效）
                if (isStreamWritable(responseStream)) {
                  const linesToForward = lines.join('\n') + (lines.length > 0 ? '\n' : '')

                  // 应用流转换器如果有
                  let dataToWrite = linesToForward
                  if (streamTransformer) {
                    const transformed = streamTransformer(linesToForward)
                    if (transformed) {
                      dataToWrite = transformed
                    } else {
                      dataToWrite = null
                    }
                  }

                  if (dataToWrite) {
                    responseStream.write(dataToWrite)
                  }
                } else {
                  // 客户端连接已断开，记录警告（但仍继续解析usage）
                  logger.warn(
                    `⚠️ [Console] Client disconnected during stream, skipping ${lines.length} lines for account: ${account?.name || accountId}`
                  )
                }

                // 解析SSE数据寻找usage信息（无论连接状态如何）
                for (const line of lines) {
                  if (line.startsWith('data:')) {
                    const jsonStr = line.slice(5).trimStart()
                    if (!jsonStr || jsonStr === '[DONE]') {
                      continue
                    }
                    try {
                      const data = JSON.parse(jsonStr)

                      // 收集usage数据
                      if (data.type === 'message_start' && data.message && data.message.usage) {
                        collectedUsageData.input_tokens = data.message.usage.input_tokens || 0
                        collectedUsageData.cache_creation_input_tokens =
                          data.message.usage.cache_creation_input_tokens || 0
                        collectedUsageData.cache_read_input_tokens =
                          data.message.usage.cache_read_input_tokens || 0
                        collectedUsageData.model = data.message.model

                        // 检查是否有详细的 cache_creation 对象
                        if (
                          data.message.usage.cache_creation &&
                          typeof data.message.usage.cache_creation === 'object'
                        ) {
                          collectedUsageData.cache_creation = {
                            ephemeral_5m_input_tokens:
                              data.message.usage.cache_creation.ephemeral_5m_input_tokens || 0,
                            ephemeral_1h_input_tokens:
                              data.message.usage.cache_creation.ephemeral_1h_input_tokens || 0
                          }
                          logger.info(
                            '📊 Collected detailed cache creation data:',
                            JSON.stringify(collectedUsageData.cache_creation)
                          )
                        }
                      }

                      if (data.type === 'message_delta' && data.usage) {
                        // 提取所有usage字段，message_delta可能包含完整的usage信息
                        if (data.usage.output_tokens !== undefined) {
                          collectedUsageData.output_tokens = data.usage.output_tokens || 0
                        }

                        // 提取input_tokens（如果存在）
                        if (data.usage.input_tokens !== undefined) {
                          collectedUsageData.input_tokens = data.usage.input_tokens || 0
                        }

                        // 提取cache相关的tokens
                        if (data.usage.cache_creation_input_tokens !== undefined) {
                          collectedUsageData.cache_creation_input_tokens =
                            data.usage.cache_creation_input_tokens || 0
                        }
                        if (data.usage.cache_read_input_tokens !== undefined) {
                          collectedUsageData.cache_read_input_tokens =
                            data.usage.cache_read_input_tokens || 0
                        }

                        // 检查是否有详细的 cache_creation 对象
                        if (
                          data.usage.cache_creation &&
                          typeof data.usage.cache_creation === 'object'
                        ) {
                          collectedUsageData.cache_creation = {
                            ephemeral_5m_input_tokens:
                              data.usage.cache_creation.ephemeral_5m_input_tokens || 0,
                            ephemeral_1h_input_tokens:
                              data.usage.cache_creation.ephemeral_1h_input_tokens || 0
                          }
                        }

                        logger.info(
                          '📊 [Console] Collected usage data from message_delta:',
                          JSON.stringify(collectedUsageData)
                        )

                        // 如果已经收集到了完整数据，触发回调
                        if (
                          collectedUsageData.input_tokens !== undefined &&
                          collectedUsageData.output_tokens !== undefined &&
                          !finalUsageReported
                        ) {
                          if (!collectedUsageData.model) {
                            collectedUsageData.model = body.model || account?.defaultModel || null
                          }
                          logger.info(
                            '🎯 [Console] Complete usage data collected:',
                            JSON.stringify(collectedUsageData)
                          )
                          if (usageCallback && typeof usageCallback === 'function') {
                            usageCallback({ ...collectedUsageData, accountId })
                          }
                          finalUsageReported = true
                        }
                      }

                      // 不再因为模型不支持而block账号
                    } catch (e) {
                      // 忽略解析错误
                    }
                  }
                }
              }
            } catch (error) {
              logger.error(
                `❌ Error processing Claude Console stream data (Account: ${account?.name || accountId}):`,
                error
              )
              if (isStreamWritable(responseStream)) {
                // 如果有 streamTransformer（如测试请求），使用前端期望的格式
                if (streamTransformer) {
                  responseStream.write(
                    `data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`
                  )
                } else {
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
            }
          })

          response.data.on('end', () => {
            try {
              // 处理缓冲区中剩余的数据
              if (buffer.trim() && isStreamWritable(responseStream)) {
                if (streamTransformer) {
                  const transformed = streamTransformer(buffer)
                  if (transformed) {
                    responseStream.write(transformed)
                  }
                } else {
                  responseStream.write(buffer)
                }
              }

              // 🔧 兜底逻辑：确保所有未保存的usage数据都不会丢失
              if (!finalUsageReported) {
                if (
                  collectedUsageData.input_tokens !== undefined ||
                  collectedUsageData.output_tokens !== undefined
                ) {
                  // 补全缺失的字段
                  if (collectedUsageData.input_tokens === undefined) {
                    collectedUsageData.input_tokens = 0
                    logger.warn(
                      '⚠️ [Console] message_delta missing input_tokens, setting to 0. This may indicate incomplete usage data.'
                    )
                  }
                  if (collectedUsageData.output_tokens === undefined) {
                    collectedUsageData.output_tokens = 0
                    logger.warn(
                      '⚠️ [Console] message_delta missing output_tokens, setting to 0. This may indicate incomplete usage data.'
                    )
                  }
                  // 确保有 model 字段
                  if (!collectedUsageData.model) {
                    collectedUsageData.model = body.model || account?.defaultModel || null
                  }
                  logger.info(
                    `📊 [Console] Saving incomplete usage data via fallback: ${JSON.stringify(collectedUsageData)}`
                  )
                  if (usageCallback && typeof usageCallback === 'function') {
                    usageCallback({ ...collectedUsageData, accountId })
                  }
                  finalUsageReported = true
                } else {
                  logger.warn(
                    '⚠️ [Console] Stream completed but no usage data was captured! This indicates a problem with SSE parsing or API response format.'
                  )
                }
              }

              // 确保流正确结束
              if (isStreamWritable(responseStream)) {
                // 📊 诊断日志：流结束前状态
                logger.info(
                  `📤 [STREAM] Ending response | destroyed: ${responseStream.destroyed}, ` +
                    `socketDestroyed: ${responseStream.socket?.destroyed}, ` +
                    `socketBytesWritten: ${responseStream.socket?.bytesWritten || 0}`
                )

                // 禁用 Nagle 算法确保数据立即发送
                if (responseStream.socket && !responseStream.socket.destroyed) {
                  responseStream.socket.setNoDelay(true)
                }

                // 等待数据完全 flush 到客户端后再 resolve
                responseStream.end(() => {
                  logger.info(
                    `✅ [STREAM] Response ended and flushed | socketBytesWritten: ${responseStream.socket?.bytesWritten || 'unknown'}`
                  )
                  resolve()
                })
              } else {
                // 连接已断开，记录警告
                logger.warn(
                  `⚠️ [Console] Client disconnected before stream end, data may not have been received | account: ${account?.name || accountId}`
                )
                resolve()
              }
            } catch (error) {
              logger.error('❌ Error processing stream end:', error)
              reject(error)
            }
          })

          response.data.on('error', (error) => {
            logger.error(
              `❌ Claude Console stream error (Account: ${account?.name || accountId}):`,
              error
            )
            if (isStreamWritable(responseStream)) {
              // 如果有 streamTransformer（如测试请求），使用前端期望的格式
              if (streamTransformer) {
                responseStream.write(
                  `data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`
                )
              } else {
                responseStream.write('event: error\n')
                responseStream.write(
                  `data: ${JSON.stringify({
                    error: 'Stream error',
                    message: error.message,
                    timestamp: new Date().toISOString()
                  })}\n\n`
                )
              }
              responseStream.end()
            }
            reject(error)
          })
        })
        .catch((error) => {
          if (aborted) {
            return
          }

          logger.error(
            `❌ Claude Console stream request error (Account: ${account?.name || accountId}):`,
            error.message
          )

          // 检查错误状态
          if (error.response) {
            const catchAutoProtectionDisabled =
              account?.disableAutoProtection === true || account?.disableAutoProtection === 'true'
            if (error.response.status === 401) {
              if (!catchAutoProtectionDisabled) {
                upstreamErrorHelper
                  .markTempUnavailable(accountId, 'claude-console', 401)
                  .catch(() => {})
              }
            } else if (error.response.status === 429) {
              if (!catchAutoProtectionDisabled) {
                claudeConsoleAccountService.markAccountRateLimited(accountId)
                // 检查是否因为超过每日额度
                claudeConsoleAccountService.checkQuotaUsage(accountId).catch((err) => {
                  logger.error('❌ Failed to check quota after 429 error:', err)
                })
                upstreamErrorHelper
                  .markTempUnavailable(
                    accountId,
                    'claude-console',
                    429,
                    upstreamErrorHelper.parseRetryAfter(error.response.headers)
                  )
                  .catch(() => {})
              }
            } else if (error.response.status === 529) {
              if (!catchAutoProtectionDisabled) {
                claudeConsoleAccountService.markAccountOverloaded(accountId)
                upstreamErrorHelper
                  .markTempUnavailable(accountId, 'claude-console', 529)
                  .catch(() => {})
              }
            }
          }

          // 发送错误响应
          if (!responseStream.headersSent) {
            const existingConnection = responseStream.getHeader
              ? responseStream.getHeader('Connection')
              : null
            responseStream.writeHead(error.response?.status || 500, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: existingConnection || 'keep-alive'
            })
          }

          if (isStreamWritable(responseStream)) {
            // 如果有 streamTransformer（如测试请求），使用前端期望的格式
            if (streamTransformer) {
              responseStream.write(
                `data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`
              )
            } else {
              responseStream.write('event: error\n')
              responseStream.write(
                `data: ${JSON.stringify({
                  error: error.message,
                  code: error.code,
                  timestamp: new Date().toISOString()
                })}\n\n`
              )
            }
            responseStream.end()
          }

          reject(error)
        })

      // 处理客户端断开连接
      responseStream.on('close', () => {
        logger.debug('🔌 Client disconnected, cleaning up Claude Console stream')
        aborted = true
      })
    })
  }

  // 🔧 过滤客户端请求头
  _filterClientHeaders(clientHeaders) {
    // 使用统一的 headerFilter 工具类（白名单模式）
    // 与 claudeRelayService 保持一致，避免透传 CDN headers 触发上游 API 安全检查
    return filterForClaude(clientHeaders)
  }

  // 🕐 更新最后使用时间
  async _updateLastUsedTime(accountId) {
    try {
      const client = require('../../models/redis').getClientSafe()
      const accountKey = `claude_console_account:${accountId}`
      const exists = await client.exists(accountKey)

      if (!exists) {
        logger.debug(`🔎 跳过更新已删除的Claude Console账号最近使用时间: ${accountId}`)
        return
      }

      await client.hset(accountKey, 'lastUsedAt', new Date().toISOString())
    } catch (error) {
      logger.warn(
        `⚠️ Failed to update last used time for Claude Console account ${accountId}:`,
        error.message
      )
    }
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

  // 🧪 测试账号连接（供Admin API使用）
  async testAccountConnection(accountId, responseStream) {
    const { sendStreamTestRequest } = require('../../utils/testPayloadHelper')

    try {
      const account = await claudeConsoleAccountService.getAccount(accountId)
      if (!account) {
        throw new Error('Account not found')
      }

      logger.info(`🧪 Testing Claude Console account connection: ${account.name} (${accountId})`)

      const cleanUrl = account.apiUrl.replace(/\/$/, '')
      const apiUrl = cleanUrl.endsWith('/v1/messages')
        ? cleanUrl
        : `${cleanUrl}/v1/messages?beta=true`

      await sendStreamTestRequest({
        apiUrl,
        authorization: `Bearer ${account.apiKey}`,
        responseStream,
        proxyAgent: claudeConsoleAccountService._createProxyAgent(account.proxy),
        extraHeaders: account.userAgent ? { 'User-Agent': account.userAgent } : {}
      })
    } catch (error) {
      logger.error(`❌ Test account connection failed:`, error)
      if (!responseStream.headersSent) {
        responseStream.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache'
        })
      }
      if (isStreamWritable(responseStream)) {
        responseStream.write(
          `data: ${JSON.stringify({ type: 'test_complete', success: false, error: error.message })}\n\n`
        )
        responseStream.end()
      }
    }
  }

  // 🎯 健康检查
  async healthCheck() {
    try {
      const accounts = await claudeConsoleAccountService.getAllAccounts()
      const activeAccounts = accounts.filter((acc) => acc.isActive && acc.status === 'active')

      return {
        healthy: activeAccounts.length > 0,
        activeAccounts: activeAccounts.length,
        totalAccounts: accounts.length,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      logger.error('❌ Claude Console Claude health check failed:', error)
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }
}

module.exports = new ClaudeConsoleRelayService()
