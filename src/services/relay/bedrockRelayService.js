const crypto = require('crypto')
const {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand
} = require('@aws-sdk/client-bedrock-runtime')
const { BedrockClient, ListInferenceProfilesCommand } = require('@aws-sdk/client-bedrock')
const logger = require('../../utils/logger')
const config = require('../../../config/config')
const { BEDROCK_MODELS, BEDROCK_TEST_MODEL } = require('../../../config/models')
const { normalizeBedrockRegion, assertSupportedBedrockModel } = require('../../utils/bedrockConfig')
const userMessageQueueService = require('../userMessageQueueService')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')

class BedrockRelayService {
  constructor() {
    this.defaultRegion = normalizeBedrockRegion(
      process.env.AWS_REGION || config.bedrock?.defaultRegion,
      'us-east-1'
    )
    this.smallFastModelRegion = normalizeBedrockRegion(
      process.env.ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION || config.bedrock?.smallFastModelRegion,
      this.defaultRegion
    )

    // 默认模型配置
    this.defaultModel = process.env.ANTHROPIC_MODEL || 'us.anthropic.claude-sonnet-4-20250514-v1:0'

    // Token配置 — 仅作为客户端未指定 max_tokens 时的回退默认值，不用于截断
    this.maxOutputTokens = parseInt(process.env.BEDROCK_MAX_OUTPUT_TOKENS) || 128000

    // 创建Bedrock客户端
    this.clients = new Map() // 缓存不同区域的客户端
  }

  _getCredentialType(bedrockAccount) {
    if (!bedrockAccount) {
      return 'default'
    }
    if (['access_key', 'bearer_token', 'default'].includes(bedrockAccount.credentialType)) {
      return bedrockAccount.credentialType
    }
    if (bedrockAccount.awsCredentials) {
      return 'access_key'
    }
    if (bedrockAccount.bearerToken) {
      return 'bearer_token'
    }
    return 'default'
  }

  _getCredentialFingerprint(bedrockAccount, credentialType) {
    let credentialMaterial = 'default-provider-chain'

    if (credentialType === 'access_key') {
      const credentials = bedrockAccount?.awsCredentials
      if (!credentials?.accessKeyId || !credentials?.secretAccessKey) {
        throw new Error('AWS access key credentials are incomplete')
      }
      credentialMaterial = JSON.stringify([
        credentials.accessKeyId,
        credentials.secretAccessKey,
        credentials.sessionToken || ''
      ])
    } else if (credentialType === 'bearer_token') {
      if (!bedrockAccount?.bearerToken) {
        throw new Error('AWS Bedrock bearer token is missing')
      }
      credentialMaterial = bedrockAccount.bearerToken
    }

    return crypto.createHash('sha256').update(credentialMaterial).digest('hex')
  }

  _createAwsClientConfig(region, bedrockAccount, credentialType) {
    const clientConfig = {
      region,
      requestHandler: {
        requestTimeout: config.requestTimeout || 600000,
        connectionTimeout: 10000
      }
    }

    if (credentialType === 'access_key') {
      clientConfig.credentials = {
        accessKeyId: bedrockAccount.awsCredentials.accessKeyId,
        secretAccessKey: bedrockAccount.awsCredentials.secretAccessKey,
        sessionToken: bedrockAccount.awsCredentials.sessionToken
      }
    } else if (credentialType === 'bearer_token') {
      // The runtime client still runs SigV4 middleware before the bearer token replaces it.
      clientConfig.credentials = {
        accessKeyId: 'BEDROCK_API_KEY_PLACEHOLDER',
        secretAccessKey: 'BEDROCK_API_KEY_PLACEHOLDER'
      }
    }

    return clientConfig
  }

  _addBearerTokenMiddleware(client, bearerToken) {
    client.middlewareStack.add(
      (next) => async (args) => {
        for (const key of Object.keys(args.request.headers)) {
          if (key.toLowerCase() === 'authorization') {
            delete args.request.headers[key]
          }
        }
        args.request.headers.Authorization = `Bearer ${bearerToken}`
        delete args.request.headers['x-amz-date']
        delete args.request.headers['x-amz-security-token']
        delete args.request.headers['x-amz-content-sha256']
        return next(args)
      },
      { step: 'finalizeRequest', name: 'bedrockBearerTokenAuth', override: true, priority: 'low' }
    )
  }

  // 获取或创建Bedrock客户端
  _getBedrockClient(region = null, bedrockAccount = null) {
    const targetRegion = normalizeBedrockRegion(region, this.defaultRegion)
    const credentialType = this._getCredentialType(bedrockAccount)
    const credentialFingerprint = this._getCredentialFingerprint(bedrockAccount, credentialType)
    const accountId = bedrockAccount?.id || 'default'
    const clientKey = `${targetRegion}::${accountId}::${credentialType}::${credentialFingerprint}`

    if (this.clients.has(clientKey)) {
      return this.clients.get(clientKey)
    }

    const clientConfig = this._createAwsClientConfig(targetRegion, bedrockAccount, credentialType)

    const client = new BedrockRuntimeClient(clientConfig)

    if (credentialType === 'bearer_token') {
      this._addBearerTokenMiddleware(client, bedrockAccount.bearerToken)
      logger.debug(`🔑 Bearer Token middleware 已注入 - 账户: ${bedrockAccount.name || 'unknown'}`)
    }

    this.clients.set(clientKey, client)

    logger.debug(
      `🔧 Created Bedrock client for region: ${targetRegion}, account: ${bedrockAccount?.name || 'default'}`
    )
    return client
  }

  invalidateAccountClients(accountId) {
    if (!accountId) {
      return 0
    }

    let removed = 0
    for (const clientKey of this.clients.keys()) {
      if (clientKey.split('::')[1] === accountId) {
        this.clients.get(clientKey)?.destroy?.()
        this.clients.delete(clientKey)
        removed += 1
      }
    }
    return removed
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
      const bedrockPayload = this._convertToBedrockFormat(requestBody, modelId)

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
  async handleStreamRequest(requestBody, bedrockAccount = null, res, req = null) {
    const accountId = bedrockAccount?.id
    let queueLockAcquired = false
    let queueRequestId = null
    let abortController = null

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
      const bedrockPayload = this._convertToBedrockFormat(requestBody, modelId)

      const command = new InvokeModelWithResponseStreamCommand({
        modelId,
        body: JSON.stringify(bedrockPayload),
        contentType: 'application/json',
        accept: 'application/json'
      })

      logger.debug(`🌊 Bedrock流式请求 - 模型: ${modelId}, 区域: ${region}`)

      // 创建 AbortController 用于客户端断开时取消上游请求
      abortController = new AbortController()
      if (req) {
        req.on('close', () => {
          if (abortController && !abortController.signal.aborted) {
            logger.info(`🔌 客户端断开，取消 Bedrock 上游请求 - 账户: ${accountId}`)
            abortController.abort()
          }
        })
      }

      const startTime = Date.now()
      const response = await client.send(command, { abortSignal: abortController.signal })

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

      // 处理流式响应
      // Bedrock InvokeModelWithResponseStream 返回的 JSON 事件结构与 Claude API 完全一致，
      // 直接透传即可，无需重新构造。避免丢失字段或与新版本 API 不兼容。
      for await (const chunk of response.body) {
        // 客户端已断开，停止处理
        if (abortController.signal.aborted) {
          logger.debug(`🔌 Bedrock 流处理中止 - 客户端已断开`)
          break
        }

        if (chunk.chunk) {
          const chunkData = JSON.parse(new TextDecoder().decode(chunk.chunk.bytes))

          // 透传 Bedrock 事件到客户端（格式与 Claude SSE 一致）
          // 修正 message_start 中的模型名：Bedrock 格式 → 标准 Claude 格式
          // 客户端依赖标准模型名判定上下文窗口，否则可能过早触发 "Context limit reached"
          if (chunkData.type) {
            if (chunkData.type === 'message_start' && chunkData.message?.model) {
              chunkData.message.model = this._mapFromBedrockModel(chunkData.message.model)
            }
            res.write(`event: ${chunkData.type}\n`)
            res.write(`data: ${JSON.stringify(chunkData)}\n\n`)
          }

          // 提取使用统计 (usage is reported in message_delta per Claude API spec)
          if (chunkData.type === 'message_delta' && chunkData.usage) {
            totalUsage = chunkData.usage
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
      // 客户端主动断开，不算错误
      if (abortController?.signal?.aborted) {
        logger.info(`🔌 Bedrock 流请求因客户端断开而中止 - 账户: ${accountId}`)
        if (!res.writableEnded) {
          res.end()
        }
        return { success: false, aborted: true }
      }

      logger.error('❌ Bedrock流式请求失败:', error)

      const bedrockError = this._handleBedrockError(error, accountId, bedrockAccount)
      const statusCode = this._getErrorStatusCode(error)

      // 发送错误事件并关闭连接
      try {
        if (!res.headersSent) {
          res.writeHead(statusCode, { 'Content-Type': 'text/event-stream' })
        }
        if (!res.writableEnded) {
          res.write('event: error\n')
          res.write(`data: ${JSON.stringify({ error: bedrockError.message })}\n\n`)
          res.end()
        }
      } catch (writeError) {
        logger.error('❌ Failed to write error response:', writeError.message)
        if (!res.writableEnded) {
          res.end()
        }
      }

      throw bedrockError
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

    // The caller's explicit model must not be silently overridden by an account default.
    if (requestBody?.model) {
      selectedModel = requestBody.model
      logger.info(`🎯 使用请求指定的模型: ${selectedModel}`, { metadata: { source: 'request' } })
    } else if (bedrockAccount?.defaultModel) {
      selectedModel = bedrockAccount.defaultModel
      logger.info(`🎯 使用账户配置的模型: ${selectedModel}`, {
        metadata: { source: 'account', accountId: bedrockAccount.id }
      })
    }
    // 使用默认模型
    else {
      selectedModel = this.defaultModel
      logger.info(`🎯 使用系统默认模型: ${selectedModel}`, { metadata: { source: 'default' } })
    }

    const supportedModel = assertSupportedBedrockModel(selectedModel)
    const bedrockModel = this._mapToBedrockModel(supportedModel)
    if (bedrockModel !== selectedModel) {
      logger.info(`🔄 模型映射: ${selectedModel} → ${bedrockModel}`, {
        metadata: { originalModel: selectedModel, bedrockModel }
      })
    }

    return bedrockModel
  }

  // 将Bedrock模型名反向映射为标准Claude格式
  // 客户端（如 Claude Code）依赖标准模型名来判定上下文窗口大小，
  // 若收到 Bedrock 格式名称则可能使用保守默认值，导致过早触发 "Context limit reached"。
  _mapFromBedrockModel(bedrockModelId) {
    if (!bedrockModelId) {
      return bedrockModelId
    }

    // 已经是标准格式，直接返回
    if (!bedrockModelId.includes('.anthropic.') && !bedrockModelId.startsWith('anthropic.')) {
      return bedrockModelId
    }

    // 从 Bedrock ID 中提取核心模型名
    // 格式: {region}.anthropic.{model-name}-v{version}:{variant}
    // 或:   anthropic.{model-name}-v{version}:{variant}
    const match = bedrockModelId.match(/(?:.*\.)?anthropic\.(claude-.+?)(?:-v\d+)?(?::\d+)?$/)
    if (match) {
      return match[1]
    }

    return bedrockModelId
  }

  // 将标准Claude模型名映射为Bedrock格式
  _mapToBedrockModel(modelName) {
    // Strip [1m] suffix (long context variant) — Bedrock uses the same model ID
    // but supports 1M context natively for models that have it
    const cleanModelName = modelName.replace(/\[1m\]$/, '')

    // 标准Claude模型名到Bedrock模型名的映射表
    const modelMapping = {
      // Claude Opus 5
      'claude-opus-5': 'global.anthropic.claude-opus-5',

      // Claude Opus 4.6
      'claude-opus-4-6': 'global.anthropic.claude-opus-4-6-v1',

      // Claude Sonnet 4.6
      'claude-sonnet-4-6': 'us.anthropic.claude-sonnet-4-6',

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
      // Claude Opus 4
      'claude-opus-4-20250514': 'us.anthropic.claude-opus-4-20250514-v1:0',

      // Claude 3.7 Sonnet
      'claude-3-7-sonnet': 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
      'claude-3-7-sonnet-20250219': 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',

      // Claude 3.5 Sonnet v2
      'claude-3-5-sonnet': 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
      'claude-3-5-sonnet-20241022': 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',

      // Claude 3 Sonnet
      'claude-3-sonnet': 'us.anthropic.claude-3-sonnet-20240229-v1:0',
      'claude-3-sonnet-20240229': 'us.anthropic.claude-3-sonnet-20240229-v1:0',

      // Claude 3 Haiku
      'claude-3-haiku': 'us.anthropic.claude-3-haiku-20240307-v1:0',
      'claude-3-haiku-20240307': 'us.anthropic.claude-3-haiku-20240307-v1:0',

      // Claude 3 Opus
      'claude-3-opus': 'us.anthropic.claude-3-opus-20240229-v1:0',
      'claude-3-opus-20240229': 'us.anthropic.claude-3-opus-20240229-v1:0'
    }

    // 如果已经是Bedrock格式，直接返回
    // Bedrock模型格式：{region}.anthropic.{model-name} 或 anthropic.{model-name}
    if (cleanModelName.includes('.anthropic.') || cleanModelName.startsWith('anthropic.')) {
      return cleanModelName
    }

    // 查找映射
    const mappedModel = modelMapping[cleanModelName]
    if (mappedModel) {
      return mappedModel
    }

    // 如果没有找到映射，返回原始模型名（可能会导致错误，但保持向后兼容）
    logger.warn(`⚠️ 未找到模型映射: ${cleanModelName}，使用原始模型名`, {
      metadata: { originalModel: modelName }
    })
    return cleanModelName
  }

  // 选择使用的区域
  _selectRegion(modelId, bedrockAccount) {
    // 优先使用账户配置的区域
    if (bedrockAccount?.region) {
      return normalizeBedrockRegion(bedrockAccount.region, this.defaultRegion)
    }

    // 对于小模型，使用专门的区域配置
    if (modelId.includes('haiku')) {
      return normalizeBedrockRegion(this.smallFastModelRegion, this.defaultRegion)
    }

    return normalizeBedrockRegion(this.defaultRegion, 'us-east-1')
  }

  // Sanitize cache_control fields for Bedrock compatibility.
  // Bedrock only supports { type: "ephemeral" } — extra fields like "scope"
  // (added in Claude Code v2.1.38+) cause ValidationException.
  _sanitizeCacheControl(obj) {
    if (obj === null || obj === undefined || typeof obj !== 'object') {
      return obj
    }

    if (Array.isArray(obj)) {
      obj.forEach((item) => this._sanitizeCacheControl(item))
      return obj
    }

    if (obj.cache_control && typeof obj.cache_control === 'object') {
      // Keep only the "type" field that Bedrock accepts
      obj.cache_control = { type: obj.cache_control.type || 'ephemeral' }
    }

    // Recurse into known nested structures (messages[].content, tool input_schema, etc.)
    for (const key of Object.keys(obj)) {
      const val = obj[key]
      if (val && typeof val === 'object') {
        this._sanitizeCacheControl(val)
      }
    }

    return obj
  }

  _supportsAdaptiveThinking(modelId) {
    const normalizedModel = (modelId || '').replace(/\[1m\]$/, '')
    return ['claude-opus-5', 'claude-opus-4-6', 'claude-sonnet-4-6'].some((model) =>
      normalizedModel.includes(model)
    )
  }

  _requiresAdaptiveThinking(modelId) {
    return (modelId || '').replace(/\[1m\]$/, '').includes('claude-opus-5')
  }

  // 转换Claude格式请求到Bedrock格式
  _convertToBedrockFormat(requestBody, modelId = null) {
    // 透传客户端的 max_tokens，仅在未指定时使用默认值作为回退
    const maxTokens = requestBody.max_tokens || this.maxOutputTokens

    // Bedrock 通过 Command 类型区分流式/非流式，payload 中不需要 stream 字段
    const bedrockPayload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
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

    const anthropicBetas = Array.isArray(requestBody.anthropic_beta)
      ? [...requestBody.anthropic_beta]
      : []
    if (requestBody.context_management) {
      bedrockPayload.context_management = requestBody.context_management
      if (!anthropicBetas.includes('context-management-2025-06-27')) {
        anthropicBetas.push('context-management-2025-06-27')
      }
    }
    if (anthropicBetas.length > 0) {
      bedrockPayload.anthropic_beta = anthropicBetas
    }

    // Newer Claude models use adaptive thinking; older Bedrock models still need a token budget.
    const supportsAdaptiveThinking = this._supportsAdaptiveThinking(modelId || requestBody.model)
    const requiresAdaptiveThinking = this._requiresAdaptiveThinking(modelId || requestBody.model)

    if (requestBody.thinking) {
      bedrockPayload.thinking = { ...requestBody.thinking }

      if (requiresAdaptiveThinking && bedrockPayload.thinking.type === 'enabled') {
        bedrockPayload.thinking.type = 'adaptive'
      }

      if (bedrockPayload.thinking.type === 'adaptive' && supportsAdaptiveThinking) {
        delete bedrockPayload.thinking.budget_tokens
      } else if (bedrockPayload.thinking.type === 'adaptive') {
        bedrockPayload.thinking.type = 'enabled'
        if (!bedrockPayload.thinking.budget_tokens) {
          bedrockPayload.thinking.budget_tokens = maxTokens - 1
        }
      }
    }

    if (
      supportsAdaptiveThinking &&
      requestBody.output_config &&
      typeof requestBody.output_config === 'object' &&
      !Array.isArray(requestBody.output_config)
    ) {
      bedrockPayload.output_config = { ...requestBody.output_config }
    } else if (requiresAdaptiveThinking && requestBody.thinking?.type === 'enabled') {
      bedrockPayload.output_config = { effort: 'high' }
    }

    // metadata 透传
    if (requestBody.metadata) {
      bedrockPayload.metadata = requestBody.metadata
    }

    // Sanitize cache_control for Bedrock compatibility (strip unsupported fields like "scope")
    this._sanitizeCacheControl(bedrockPayload)

    return bedrockPayload
  }

  // 转换Bedrock响应到Claude格式
  _convertFromBedrockFormat(bedrockResponse) {
    return {
      ...bedrockResponse,
      id: bedrockResponse.id || `msg_${Date.now()}_bedrock`,
      type: 'message',
      role: bedrockResponse.role || 'assistant',
      content: bedrockResponse.content || [],
      model: this._mapFromBedrockModel(bedrockResponse.model) || this.defaultModel,
      stop_reason: bedrockResponse.stop_reason || 'end_turn',
      stop_sequence: bedrockResponse.stop_sequence || null,
      usage: bedrockResponse.usage || {
        input_tokens: 0,
        output_tokens: 0
      }
    }
  }

  async testConnection(bedrockAccount, model = BEDROCK_TEST_MODEL, onContent = null) {
    const modelId = this._selectModel({ model }, bedrockAccount)
    const region = this._selectRegion(modelId, bedrockAccount)
    const client = this._getBedrockClient(region, bedrockAccount)
    const command = new InvokeModelWithResponseStreamCommand({
      modelId,
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 32,
        messages: [{ role: 'user', content: 'Reply with OK.' }]
      }),
      contentType: 'application/json',
      accept: 'application/json'
    })

    const startedAt = Date.now()
    const response = await client.send(command)
    if (!response?.body) {
      throw new Error('Bedrock Runtime returned no response stream')
    }

    let responseText = ''
    let eventCount = 0
    let messageStopped = false

    for await (const event of response.body) {
      if (!event.chunk) {
        const errorKey = [
          'internalServerException',
          'modelStreamErrorException',
          'validationException',
          'throttlingException',
          'modelTimeoutException',
          'serviceUnavailableException'
        ].find((key) => event[key])
        if (errorKey) {
          throw new Error(event[errorKey].message || `Bedrock Runtime stream error: ${errorKey}`)
        }
        throw new Error('Bedrock Runtime returned an unknown stream event')
      }
      eventCount += 1
      const chunkData = JSON.parse(new TextDecoder().decode(event.chunk.bytes))
      if (chunkData.type === 'error') {
        throw new Error(chunkData.error?.message || 'Bedrock API error')
      }
      if (chunkData.type === 'content_block_delta' && chunkData.delta?.text) {
        responseText += chunkData.delta.text
        if (onContent) {
          onContent(chunkData.delta.text)
        }
      }
      if (chunkData.type === 'message_stop') {
        messageStopped = true
      }
    }

    if (!messageStopped || !responseText.trim()) {
      throw new Error('Bedrock Runtime returned an incomplete response stream')
    }

    return {
      status: 'connected',
      model: modelId,
      region,
      responseText,
      eventCount,
      duration: Date.now() - startedAt
    }
  }

  // 从 Bedrock 错误中提取 HTTP 状态码
  _getErrorStatusCode(error) {
    // AWS SDK v3 错误的 $metadata 包含 httpStatusCode
    if (error.$metadata?.httpStatusCode) {
      return error.$metadata.httpStatusCode
    }

    // 根据错误类型映射状态码
    const errorStatusMap = {
      ThrottlingException: 429,
      AccessDeniedException: 403,
      ValidationException: 400,
      ModelNotReadyException: 503,
      ServiceUnavailableException: 503,
      InternalServerException: 500,
      ModelTimeoutException: 408
    }

    return errorStatusMap[error.name] || 500
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
    const fallbackModels = BEDROCK_MODELS.map((model) => ({
      id: model.value,
      name: model.label,
      provider: 'anthropic',
      type: 'bedrock'
    }))

    try {
      const region = normalizeBedrockRegion(bedrockAccount?.region, this.defaultRegion)
      const credentialType = this._getCredentialType(bedrockAccount)

      // Bedrock API keys authenticate runtime requests, not control-plane discovery.
      if (credentialType === 'bearer_token') {
        return fallbackModels
      }

      const client = new BedrockClient(
        this._createAwsClientConfig(region, bedrockAccount, credentialType)
      )
      const profiles = []
      let nextToken

      do {
        const response = await client.send(
          new ListInferenceProfilesCommand({
            typeEquals: 'SYSTEM_DEFINED',
            maxResults: 100,
            nextToken
          })
        )
        profiles.push(...(response.inferenceProfileSummaries || []))
        const { nextToken: responseNextToken } = response
        nextToken = responseNextToken
      } while (nextToken)

      const models = profiles
        .filter((profile) => profile.inferenceProfileId?.includes('.anthropic.claude-'))
        .map((profile) => ({
          id: profile.inferenceProfileId,
          name: profile.inferenceProfileName || profile.inferenceProfileId,
          provider: 'anthropic',
          type: 'bedrock'
        }))

      logger.debug(`📋 发现Bedrock推理配置 ${models.length} 个, 区域: ${region}`)
      return models.length > 0 ? models : fallbackModels
    } catch (error) {
      logger.warn(`⚠️ 无法列出Bedrock推理配置，使用官方模型目录: ${error.message}`)
      return fallbackModels
    }
  }
}

module.exports = new BedrockRelayService()
