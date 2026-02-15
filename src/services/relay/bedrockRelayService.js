const {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand
} = require('@aws-sdk/client-bedrock-runtime')
const { fromEnv } = require('@aws-sdk/credential-providers')
const logger = require('../../utils/logger')
const config = require('../../../config/config')
const userMessageQueueService = require('../userMessageQueueService')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')

class BedrockRelayService {
  constructor() {
    this.defaultRegion = process.env.AWS_REGION || config.bedrock?.defaultRegion || 'us-east-1'
    this.smallFastModelRegion =
      process.env.ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION || this.defaultRegion

    // 默认模型配置
    this.defaultModel = process.env.ANTHROPIC_MODEL || 'us.anthropic.claude-sonnet-4-20250514-v1:0'
    this.defaultSmallModel =
      process.env.ANTHROPIC_SMALL_FAST_MODEL || 'us.anthropic.claude-3-5-haiku-20241022-v1:0'

    // Token配置
    this.maxOutputTokens = parseInt(process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS) || 4096
    this.maxThinkingTokens = parseInt(process.env.MAX_THINKING_TOKENS) || 1024
    this.enablePromptCaching = process.env.DISABLE_PROMPT_CACHING !== '1'

    // 创建Bedrock客户端
    this.clients = new Map() // 缓存不同区域的客户端
  }

  // 获取或创建Bedrock客户端
  _getBedrockClient(region = null, bedrockAccount = null) {
    const targetRegion = region || this.defaultRegion
    const clientKey = `${targetRegion}-${bedrockAccount?.id || 'default'}`

    if (this.clients.has(clientKey)) {
      return this.clients.get(clientKey)
    }

    const clientConfig = {
      region: targetRegion
    }

    // 如果账户配置了特定的AWS凭证，使用它们
    if (bedrockAccount?.awsCredentials) {
      clientConfig.credentials = {
        accessKeyId: bedrockAccount.awsCredentials.accessKeyId,
        secretAccessKey: bedrockAccount.awsCredentials.secretAccessKey,
        sessionToken: bedrockAccount.awsCredentials.sessionToken
      }
    } else if (bedrockAccount?.bearerToken) {
      // Bearer Token 模式：AWS SDK >= 3.400.0 会自动检测环境变量
      clientConfig.token = { token: bedrockAccount.bearerToken }
      logger.debug(`🔑 使用 Bearer Token 认证 - 账户: ${bedrockAccount.name || 'unknown'}`)
    } else {
      // 检查是否有环境变量凭证
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        clientConfig.credentials = fromEnv()
      } else {
        throw new Error(
          'AWS凭证未配置。请在Bedrock账户中配置AWS访问密钥或Bearer Token，或设置环境变量AWS_ACCESS_KEY_ID和AWS_SECRET_ACCESS_KEY'
        )
      }
    }

    const client = new BedrockRuntimeClient(clientConfig)
    this.clients.set(clientKey, client)

    logger.debug(
      `🔧 Created Bedrock client for region: ${targetRegion}, account: ${bedrockAccount?.name || 'default'}`
    )
    return client
  }

  // 处理非流式请求
  async handleNonStreamRequest(requestBody, bedrockAccount = null) {
    const accountId = bedrockAccount?.id
    let queueLockAcquired = false
    let queueRequestId = null

    try {
      // 📬 用户消息队列处理
      if (userMessageQueueService.isUserMessageRequest(requestBody)) {
        // 校验 accountId 非空，避免空值污染队列锁键
        if (!accountId || accountId === '') {
          logger.error('❌ accountId missing for queue lock in Bedrock handleNonStreamRequest')
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
            backendError: isBackendError ? queueResult.errorMessage : undefined
          })

          logger.warn(
            `📬 User message queue ${errorType} for Bedrock account ${accountId}`,
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
            success: false
          }
        }
        if (queueResult.acquired && !queueResult.skipped) {
          queueLockAcquired = true
          queueRequestId = queueResult.requestId
          logger.debug(
            `📬 User message queue lock acquired for Bedrock account ${accountId}, requestId: ${queueRequestId}`
          )
        }
      }

      const modelId = this._selectModel(requestBody, bedrockAccount)
      const region = this._selectRegion(modelId, bedrockAccount)
      const client = this._getBedrockClient(region, bedrockAccount)

      // 转换请求格式为Bedrock格式
      const bedrockPayload = this._convertToBedrockFormat(requestBody)

      const command = new InvokeModelCommand({
        modelId,
        body: JSON.stringify(bedrockPayload),
        contentType: 'application/json',
        accept: 'application/json'
      })

      logger.debug(`🚀 Bedrock非流式请求 - 模型: ${modelId}, 区域: ${region}`)

      const startTime = Date.now()
      const response = await client.send(command)
      const duration = Date.now() - startTime

      // 📬 请求已发送成功，立即释放队列锁（无需等待响应处理完成）
      // 因为限流基于请求发送时刻计算（RPM），不是请求完成时刻
      if (queueLockAcquired && queueRequestId && accountId) {
        try {
          await userMessageQueueService.releaseQueueLock(accountId, queueRequestId)
          queueLockAcquired = false // 标记已释放，防止 finally 重复释放
          logger.debug(
            `📬 User message queue lock released early for Bedrock account ${accountId}, requestId: ${queueRequestId}`
          )
        } catch (releaseError) {
          logger.error(
            `❌ Failed to release user message queue lock early for Bedrock account ${accountId}:`,
            releaseError.message
          )
        }
      }

      // 解析响应
      const responseBody = JSON.parse(new TextDecoder().decode(response.body))
      const claudeResponse = this._convertFromBedrockFormat(responseBody)

      logger.info(`✅ Bedrock请求完成 - 模型: ${modelId}, 耗时: ${duration}ms`)

      return {
        success: true,
        data: claudeResponse,
        usage: claudeResponse.usage,
        model: modelId,
        duration
      }
    } catch (error) {
      logger.error('❌ Bedrock非流式请求失败:', error)
      throw this._handleBedrockError(error, accountId, bedrockAccount)
    } finally {
      // 📬 释放用户消息队列锁（兜底，正常情况下已在请求发送后提前释放）
      if (queueLockAcquired && queueRequestId && accountId) {
        try {
          await userMessageQueueService.releaseQueueLock(accountId, queueRequestId)
          logger.debug(
            `📬 User message queue lock released in finally for Bedrock account ${accountId}, requestId: ${queueRequestId}`
          )
        } catch (releaseError) {
          logger.error(
            `❌ Failed to release user message queue lock for Bedrock account ${accountId}:`,
            releaseError.message
          )
        }
      }
    }
  }

  // 处理流式请求
  async handleStreamRequest(requestBody, bedrockAccount = null, res) {
    const accountId = bedrockAccount?.id
    let queueLockAcquired = false
    let queueRequestId = null

    try {
      // 📬 用户消息队列处理
      if (userMessageQueueService.isUserMessageRequest(requestBody)) {
        // 校验 accountId 非空，避免空值污染队列锁键
        if (!accountId || accountId === '') {
          logger.error('❌ accountId missing for queue lock in Bedrock handleStreamRequest')
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
            backendError: isBackendError ? queueResult.errorMessage : undefined
          })

          logger.warn(
            `📬 User message queue ${errorType} for Bedrock account ${accountId} (stream)`,
            isBackendError ? { backendError: queueResult.errorMessage } : {}
          )
          if (!res.headersSent) {
            const existingConnection = res.getHeader ? res.getHeader('Connection') : null
            res.writeHead(statusCode, {
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
          res.write(errorEvent)
          res.write('data: [DONE]\n\n')
          res.end()
          return { success: false, error: errorType }
        }
        if (queueResult.acquired && !queueResult.skipped) {
          queueLockAcquired = true
          queueRequestId = queueResult.requestId
          logger.debug(
            `📬 User message queue lock acquired for Bedrock account ${accountId} (stream), requestId: ${queueRequestId}`
          )
        }
      }

      const modelId = this._selectModel(requestBody, bedrockAccount)
      const region = this._selectRegion(modelId, bedrockAccount)
      const client = this._getBedrockClient(region, bedrockAccount)

      // 转换请求格式为Bedrock格式
      const bedrockPayload = this._convertToBedrockFormat(requestBody)

      const command = new InvokeModelWithResponseStreamCommand({
        modelId,
        body: JSON.stringify(bedrockPayload),
        contentType: 'application/json',
        accept: 'application/json'
      })

      logger.debug(`🌊 Bedrock流式请求 - 模型: ${modelId}, 区域: ${region}`)

      const startTime = Date.now()
      const response = await client.send(command)

      // 📬 请求已发送成功，立即释放队列锁（无需等待响应处理完成）
      // 因为限流基于请求发送时刻计算（RPM），不是请求完成时刻
      if (queueLockAcquired && queueRequestId && accountId) {
        try {
          await userMessageQueueService.releaseQueueLock(accountId, queueRequestId)
          queueLockAcquired = false // 标记已释放，防止 finally 重复释放
          logger.debug(
            `📬 User message queue lock released early for Bedrock stream account ${accountId}, requestId: ${queueRequestId}`
          )
        } catch (releaseError) {
          logger.error(
            `❌ Failed to release user message queue lock early for Bedrock stream account ${accountId}:`,
            releaseError.message
          )
        }
      }

      // 设置SSE响应头
      // ⚠️ 关键修复：尊重 auth.js 提前设置的 Connection: close
      const existingConnection = res.getHeader ? res.getHeader('Connection') : null
      if (existingConnection) {
        logger.debug(
          `🔌 [Bedrock Stream] Preserving existing Connection header: ${existingConnection}`
        )
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: existingConnection || 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      })

      let totalUsage = null
      let isFirstChunk = true

      // 处理流式响应
      for await (const chunk of response.body) {
        if (chunk.chunk) {
          const chunkData = JSON.parse(new TextDecoder().decode(chunk.chunk.bytes))
          const claudeEvent = this._convertBedrockStreamToClaudeFormat(chunkData, isFirstChunk)

          if (claudeEvent) {
            // 发送SSE事件
            res.write(`event: ${claudeEvent.type}\n`)
            res.write(`data: ${JSON.stringify(claudeEvent.data)}\n\n`)

            // 提取使用统计 (usage is reported in message_delta per Claude API spec)
            if (claudeEvent.type === 'message_delta' && claudeEvent.data.usage) {
              totalUsage = claudeEvent.data.usage
            }

            isFirstChunk = false
          }
        }
      }

      const duration = Date.now() - startTime
      logger.info(`✅ Bedrock流式请求完成 - 模型: ${modelId}, 耗时: ${duration}ms`)

      // 发送结束事件
      res.write('event: done\n')
      res.write('data: [DONE]\n\n')
      res.end()

      return {
        success: true,
        usage: totalUsage,
        model: modelId,
        duration
      }
    } catch (error) {
      logger.error('❌ Bedrock流式请求失败:', error)

      // 发送错误事件
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
      }

      res.write('event: error\n')
      res.write(
        `data: ${JSON.stringify({ error: this._handleBedrockError(error, accountId, bedrockAccount).message })}\n\n`
      )
      res.end()

      throw this._handleBedrockError(error, accountId, bedrockAccount)
    } finally {
      // 📬 释放用户消息队列锁（兜底，正常情况下已在请求发送后提前释放）
      if (queueLockAcquired && queueRequestId && accountId) {
        try {
          await userMessageQueueService.releaseQueueLock(accountId, queueRequestId)
          logger.debug(
            `📬 User message queue lock released in finally for Bedrock stream account ${accountId}, requestId: ${queueRequestId}`
          )
        } catch (releaseError) {
          logger.error(
            `❌ Failed to release user message queue lock for Bedrock stream account ${accountId}:`,
            releaseError.message
          )
        }
      }
    }
  }

  // 选择使用的模型
  _selectModel(requestBody, bedrockAccount) {
    let selectedModel

    // 优先使用账户配置的模型
    if (bedrockAccount?.defaultModel) {
      selectedModel = bedrockAccount.defaultModel
      logger.info(`🎯 使用账户配置的模型: ${selectedModel}`, {
        metadata: { source: 'account', accountId: bedrockAccount.id }
      })
    }
    // 检查请求中指定的模型
    else if (requestBody.model) {
      selectedModel = requestBody.model
      logger.info(`🎯 使用请求指定的模型: ${selectedModel}`, { metadata: { source: 'request' } })
    }
    // 使用默认模型
    else {
      selectedModel = this.defaultModel
      logger.info(`🎯 使用系统默认模型: ${selectedModel}`, { metadata: { source: 'default' } })
    }

    // 如果是标准Claude模型名，需要映射为Bedrock格式
    const bedrockModel = this._mapToBedrockModel(selectedModel)
    if (bedrockModel !== selectedModel) {
      logger.info(`🔄 模型映射: ${selectedModel} → ${bedrockModel}`, {
        metadata: { originalModel: selectedModel, bedrockModel }
      })
    }

    return bedrockModel
  }

  // 将标准Claude模型名映射为Bedrock格式
  _mapToBedrockModel(modelName) {
    // 标准Claude模型名到Bedrock模型名的映射表
    const modelMapping = {
      // Claude 4.5 Opus
      'claude-opus-4-5': 'us.anthropic.claude-opus-4-5-20251101-v1:0',
      'claude-opus-4-5-20251101': 'us.anthropic.claude-opus-4-5-20251101-v1:0',

      // Claude 4.5 Sonnet
      'claude-sonnet-4-5': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      'claude-sonnet-4-5-20250929': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',

      // Claude 4.5 Haiku
      'claude-haiku-4-5': 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      'claude-haiku-4-5-20251001': 'us.anthropic.claude-haiku-4-5-20251001-v1:0',

      // Claude Sonnet 4
      'claude-sonnet-4': 'us.anthropic.claude-sonnet-4-20250514-v1:0',
      'claude-sonnet-4-20250514': 'us.anthropic.claude-sonnet-4-20250514-v1:0',

      // Claude Opus 4.1
      'claude-opus-4': 'us.anthropic.claude-opus-4-1-20250805-v1:0',
      'claude-opus-4-1': 'us.anthropic.claude-opus-4-1-20250805-v1:0',
      'claude-opus-4-1-20250805': 'us.anthropic.claude-opus-4-1-20250805-v1:0',

      // Claude 3.7 Sonnet
      'claude-3-7-sonnet': 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
      'claude-3-7-sonnet-20250219': 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',

      // Claude 3.5 Sonnet v2
      'claude-3-5-sonnet': 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
      'claude-3-5-sonnet-20241022': 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',

      // Claude 3.5 Haiku
      'claude-3-5-haiku': 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
      'claude-3-5-haiku-20241022': 'us.anthropic.claude-3-5-haiku-20241022-v1:0',

      // Claude 3 Sonnet
      'claude-3-sonnet': 'us.anthropic.claude-3-sonnet-20240229-v1:0',
      'claude-3-sonnet-20240229': 'us.anthropic.claude-3-sonnet-20240229-v1:0',

      // Claude 3 Haiku
      'claude-3-haiku': 'us.anthropic.claude-3-haiku-20240307-v1:0',
      'claude-3-haiku-20240307': 'us.anthropic.claude-3-haiku-20240307-v1:0'
    }

    // 如果已经是Bedrock格式，直接返回
    // Bedrock模型格式：{region}.anthropic.{model-name} 或 anthropic.{model-name}
    if (modelName.includes('.anthropic.') || modelName.startsWith('anthropic.')) {
      return modelName
    }

    // 查找映射
    const mappedModel = modelMapping[modelName]
    if (mappedModel) {
      return mappedModel
    }

    // 如果没有找到映射，返回原始模型名（可能会导致错误，但保持向后兼容）
    logger.warn(`⚠️ 未找到模型映射: ${modelName}，使用原始模型名`, {
      metadata: { originalModel: modelName }
    })
    return modelName
  }

  // 选择使用的区域
  _selectRegion(modelId, bedrockAccount) {
    // 优先使用账户配置的区域
    if (bedrockAccount?.region) {
      return bedrockAccount.region
    }

    // 对于小模型，使用专门的区域配置
    if (modelId.includes('haiku')) {
      return this.smallFastModelRegion
    }

    return this.defaultRegion
  }

  // 转换Claude格式请求到Bedrock格式
  _convertToBedrockFormat(requestBody) {
    const bedrockPayload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: Math.min(requestBody.max_tokens || this.maxOutputTokens, this.maxOutputTokens),
      messages: requestBody.messages || []
    }

    // 添加系统提示词
    if (requestBody.system) {
      bedrockPayload.system = requestBody.system
    }

    // 添加其他参数
    if (requestBody.temperature !== undefined) {
      bedrockPayload.temperature = requestBody.temperature
    }

    if (requestBody.top_p !== undefined) {
      bedrockPayload.top_p = requestBody.top_p
    }

    if (requestBody.top_k !== undefined) {
      bedrockPayload.top_k = requestBody.top_k
    }

    if (requestBody.stop_sequences) {
      bedrockPayload.stop_sequences = requestBody.stop_sequences
    }

    // 工具调用支持
    if (requestBody.tools) {
      bedrockPayload.tools = requestBody.tools
    }

    if (requestBody.tool_choice) {
      bedrockPayload.tool_choice = requestBody.tool_choice
    }

    return bedrockPayload
  }

  // 转换Bedrock响应到Claude格式
  _convertFromBedrockFormat(bedrockResponse) {
    return {
      id: `msg_${Date.now()}_bedrock`,
      type: 'message',
      role: 'assistant',
      content: bedrockResponse.content || [],
      model: bedrockResponse.model || this.defaultModel,
      stop_reason: bedrockResponse.stop_reason || 'end_turn',
      stop_sequence: bedrockResponse.stop_sequence || null,
      usage: bedrockResponse.usage || {
        input_tokens: 0,
        output_tokens: 0
      }
    }
  }

  // 转换Bedrock流事件到Claude SSE格式
  _convertBedrockStreamToClaudeFormat(bedrockChunk) {
    if (bedrockChunk.type === 'message_start') {
      return {
        type: 'message_start',
        data: {
          type: 'message_start',
          message: {
            id: `msg_${Date.now()}_bedrock`,
            type: 'message',
            role: 'assistant',
            content: [],
            model: this.defaultModel,
            stop_reason: null,
            stop_sequence: null,
            usage: bedrockChunk.message?.usage || { input_tokens: 0, output_tokens: 0 }
          }
        }
      }
    }

    if (bedrockChunk.type === 'content_block_start') {
      return {
        type: 'content_block_start',
        data: {
          type: 'content_block_start',
          index: bedrockChunk.index || 0,
          content_block: bedrockChunk.content_block || { type: 'text', text: '' }
        }
      }
    }

    if (bedrockChunk.type === 'content_block_delta') {
      return {
        type: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index: bedrockChunk.index || 0,
          delta: bedrockChunk.delta || {}
        }
      }
    }

    if (bedrockChunk.type === 'content_block_stop') {
      return {
        type: 'content_block_stop',
        data: {
          type: 'content_block_stop',
          index: bedrockChunk.index || 0
        }
      }
    }

    if (bedrockChunk.type === 'message_delta') {
      return {
        type: 'message_delta',
        data: {
          type: 'message_delta',
          delta: bedrockChunk.delta || {},
          usage: bedrockChunk.usage || {}
        }
      }
    }

    if (bedrockChunk.type === 'message_stop') {
      return {
        type: 'message_stop',
        data: {
          type: 'message_stop'
        }
      }
    }

    return null
  }

  // 处理Bedrock错误
  _handleBedrockError(error, accountId = null, bedrockAccount = null) {
    const autoProtectionDisabled =
      bedrockAccount?.disableAutoProtection === true ||
      bedrockAccount?.disableAutoProtection === 'true'
    if (accountId && !autoProtectionDisabled) {
      if (error.name === 'ThrottlingException') {
        upstreamErrorHelper.markTempUnavailable(accountId, 'bedrock', 429).catch(() => {})
      } else if (error.name === 'AccessDeniedException') {
        upstreamErrorHelper.markTempUnavailable(accountId, 'bedrock', 403).catch(() => {})
      } else if (
        error.name === 'ServiceUnavailableException' ||
        error.name === 'InternalServerException'
      ) {
        upstreamErrorHelper.markTempUnavailable(accountId, 'bedrock', 500).catch(() => {})
      } else if (error.name === 'ModelNotReadyException') {
        upstreamErrorHelper.markTempUnavailable(accountId, 'bedrock', 503).catch(() => {})
      }
    }

    const errorMessage = error.message || 'Unknown Bedrock error'

    if (error.name === 'ValidationException') {
      return new Error(`Bedrock参数验证失败: ${errorMessage}`)
    }

    if (error.name === 'ThrottlingException') {
      return new Error('Bedrock请求限流，请稍后重试')
    }

    if (error.name === 'AccessDeniedException') {
      return new Error('Bedrock访问被拒绝，请检查IAM权限')
    }

    if (error.name === 'ModelNotReadyException') {
      return new Error('Bedrock模型未就绪，请稍后重试')
    }

    return new Error(`Bedrock服务错误: ${errorMessage}`)
  }

  // 获取可用模型列表
  async getAvailableModels(bedrockAccount = null) {
    try {
      const region = bedrockAccount?.region || this.defaultRegion

      // Bedrock暂不支持列出推理配置文件的API，返回预定义的模型列表
      const models = [
        {
          id: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
          name: 'Claude Sonnet 4',
          provider: 'anthropic',
          type: 'bedrock'
        },
        {
          id: 'us.anthropic.claude-opus-4-1-20250805-v1:0',
          name: 'Claude Opus 4.1',
          provider: 'anthropic',
          type: 'bedrock'
        },
        {
          id: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
          name: 'Claude 3.7 Sonnet',
          provider: 'anthropic',
          type: 'bedrock'
        },
        {
          id: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
          name: 'Claude 3.5 Sonnet v2',
          provider: 'anthropic',
          type: 'bedrock'
        },
        {
          id: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
          name: 'Claude 3.5 Haiku',
          provider: 'anthropic',
          type: 'bedrock'
        }
      ]

      logger.debug(`📋 返回Bedrock可用模型 ${models.length} 个, 区域: ${region}`)
      return models
    } catch (error) {
      logger.error('❌ 获取Bedrock模型列表失败:', error)
      return []
    }
  }
}

module.exports = new BedrockRelayService()
