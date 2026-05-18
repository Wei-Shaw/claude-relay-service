const axios = require('axios')
const logger = require('../../utils/logger')
const config = require('../../../config/config')
const userMessageQueueService = require('../userMessageQueueService')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')
const ProxyHelper = require('../../utils/proxyHelper')
const { IncrementalSSEParser } = require('../../utils/sseParser')

const VERTEX_ANTHROPIC_VERSION = 'vertex-2023-10-16'

class VertexRelayService {
  constructor() {
    this.defaultRegion = process.env.VERTEX_REGION || config.vertex?.defaultRegion || 'global'
    this.defaultModel = process.env.VERTEX_DEFAULT_MODEL || 'claude-sonnet-4-5@20250929'

    // Token 配置 — 仅作为客户端未指定 max_tokens 时的回退默认值
    this.maxOutputTokens = parseInt(process.env.VERTEX_MAX_OUTPUT_TOKENS) || 32000
  }

  // ---- 公共辅助 ----

  // 从带 @ 后缀的模型 ID 中提取核心名称（用于 usage / pricing 匹配）
  // 例如：claude-opus-4-1@20250805 -> claude-opus-4-1
  _stripModelSuffix(modelId) {
    if (!modelId || typeof modelId !== 'string') {
      return modelId
    }
    const atIndex = modelId.indexOf('@')
    return atIndex > 0 ? modelId.substring(0, atIndex) : modelId
  }

  // 选择最终请求的模型 ID（保留 @<date> 后缀，用于 URL）
  _selectModel(requestBody, vertexAccount) {
    if (vertexAccount?.defaultModel) {
      logger.debug(`🎯 使用账户配置的 Vertex 模型: ${vertexAccount.defaultModel}`)
      return vertexAccount.defaultModel
    }
    if (requestBody.model) {
      logger.debug(`🎯 使用请求指定的 Vertex 模型: ${requestBody.model}`)
      return requestBody.model
    }
    logger.debug(`🎯 使用系统默认 Vertex 模型: ${this.defaultModel}`)
    return this.defaultModel
  }

  _selectRegion(vertexAccount) {
    return vertexAccount?.region || this.defaultRegion
  }

  // 构造 Vertex AI rawPredict / streamRawPredict URL
  // global 区域使用无前缀主机名 aiplatform.googleapis.com
  // 其它区域使用 {region}-aiplatform.googleapis.com
  _buildEndpointUrl({ projectId, region, modelId, stream }) {
    const action = stream ? 'streamRawPredict' : 'rawPredict'
    const encodedModel = encodeURIComponent(modelId)
    const host =
      region === 'global' ? 'aiplatform.googleapis.com' : `${region}-aiplatform.googleapis.com`
    return `https://${host}/v1/projects/${projectId}/locations/${region}/publishers/anthropic/models/${encodedModel}:${action}`
  }

  // 转换 Anthropic 格式请求 → Vertex 兼容 payload
  // 删除 model 字段（在 URL 中），加上 anthropic_version
  _convertToVertexFormat(requestBody) {
    const payload = { ...(requestBody || {}) }
    delete payload.model

    payload.anthropic_version = VERTEX_ANTHROPIC_VERSION

    if (!payload.max_tokens) {
      payload.max_tokens = this.maxOutputTokens
    }

    return payload
  }

  // 处理流式请求（SSE）
  async handleStreamRequest(requestBody, vertexAccount, res, req = null) {
    const accountId = vertexAccount?.id
    let queueLockAcquired = false
    let queueRequestId = null
    let abortController = null

    try {
      // 📬 用户消息队列处理
      if (userMessageQueueService.isUserMessageRequest(requestBody)) {
        if (!accountId || accountId === '') {
          logger.error('❌ accountId missing for queue lock in Vertex handleStreamRequest')
          throw new Error('accountId missing for queue lock')
        }
        const queueResult = await userMessageQueueService.acquireQueueLock(accountId)
        if (!queueResult.acquired && !queueResult.skipped) {
          const isBackendError = queueResult.error === 'queue_backend_error'
          const errorCode = isBackendError ? 'QUEUE_BACKEND_ERROR' : 'QUEUE_TIMEOUT'
          const errorType = isBackendError ? 'queue_backend_error' : 'queue_timeout'
          const errorMessage = isBackendError
            ? 'Queue service temporarily unavailable, please retry later'
            : 'User message queue wait timeout, please retry later'
          const statusCode = isBackendError ? 500 : 503

          logger.performance('user_message_queue_error', {
            errorType,
            errorCode,
            accountId,
            statusCode,
            stream: true,
            backendError: isBackendError ? queueResult.errorMessage : undefined
          })

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
            error: { type: errorType, code: errorCode, message: errorMessage }
          })}\n\n`
          res.write(errorEvent)
          res.write('data: [DONE]\n\n')
          res.end()
          return { success: false, error: errorType }
        }
        if (queueResult.acquired && !queueResult.skipped) {
          queueLockAcquired = true
          queueRequestId = queueResult.requestId
        }
      }

      const modelId = this._selectModel(requestBody, vertexAccount)
      const region = this._selectRegion(vertexAccount)
      const projectId = vertexAccount?.projectId
      if (!projectId) {
        throw new Error('Vertex account missing projectId')
      }

      const url = this._buildEndpointUrl({ projectId, region, modelId, stream: true })
      const vertexPayload = this._convertToVertexFormat(requestBody)

      // 获取 access token（延迟 require 防止循环依赖）
      const vertexAccountService = require('../account/vertexAccountService')
      const accessToken = await vertexAccountService.getAccessToken(vertexAccount)

      logger.debug(`🌊 Vertex 流式请求 - 模型: ${modelId}, 区域: ${region}, 项目: ${projectId}`)

      // AbortController：客户端断开时取消上游请求
      abortController = new AbortController()
      if (req) {
        req.on('close', () => {
          if (abortController && !abortController.signal.aborted) {
            logger.info(`🔌 客户端断开，取消 Vertex 上游请求 - 账户: ${accountId}`)
            abortController.abort()
          }
        })
      }

      const proxyAgent = ProxyHelper.createProxyAgent(vertexAccount?.proxy)
      const axiosConfig = {
        method: 'POST',
        url,
        data: vertexPayload,
        responseType: 'stream',
        signal: abortController.signal,
        timeout: config.requestTimeout || 600000,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${accessToken}`
        },
        validateStatus: () => true
      }
      if (proxyAgent) {
        axiosConfig.httpAgent = proxyAgent
        axiosConfig.httpsAgent = proxyAgent
        axiosConfig.proxy = false
      }

      const startTime = Date.now()
      const response = await axios(axiosConfig)

      // 请求已发送成功，提前释放队列锁
      if (queueLockAcquired && queueRequestId && accountId) {
        try {
          await userMessageQueueService.releaseQueueLock(accountId, queueRequestId)
          queueLockAcquired = false
        } catch (releaseError) {
          logger.error(
            `❌ Failed to release user message queue lock early for Vertex stream account ${accountId}:`,
            releaseError.message
          )
        }
      }

      // 校验上游响应状态
      if (response.status >= 400) {
        const errorBody = await this._readStreamToString(response.data)
        logger.error(
          `❌ Vertex 上游返回错误状态 ${response.status} - 账户: ${accountId}, body: ${errorBody.substring(0, 500)}`
        )
        await this._handleUpstreamError(response.status, accountId, vertexAccount)

        if (!res.headersSent) {
          res.writeHead(response.status, { 'Content-Type': 'text/event-stream' })
        }
        if (!res.writableEnded) {
          res.write('event: error\n')
          res.write(
            `data: ${JSON.stringify({ error: `Vertex upstream error ${response.status}`, detail: errorBody.substring(0, 500) })}\n\n`
          )
          res.end()
        }
        return { success: false, statusCode: response.status }
      }

      // 设置 SSE 响应头
      const existingConnection = res.getHeader ? res.getHeader('Connection') : null
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: existingConnection || 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      })

      let totalUsage = null
      const parser = new IncrementalSSEParser()

      // 流式转发：解析 + 转发 + 提取 usage
      for await (const chunk of response.data) {
        if (abortController.signal.aborted) {
          logger.debug(`🔌 Vertex 流处理中止 - 客户端已断开`)
          break
        }

        const text = chunk.toString('utf8')
        const events = parser.feed(text)

        for (const evt of events) {
          if (evt.type === 'data' && evt.data && evt.data.type) {
            const chunkData = evt.data
            // 透传到客户端（与 Claude SSE 一致）
            res.write(`event: ${chunkData.type}\n`)
            res.write(`data: ${JSON.stringify(chunkData)}\n\n`)

            // 提取 usage（来自 message_delta 事件）
            if (chunkData.type === 'message_delta' && chunkData.usage) {
              totalUsage = chunkData.usage
            }
          }
        }
      }

      const duration = Date.now() - startTime
      logger.info(`✅ Vertex 流式请求完成 - 模型: ${modelId}, 耗时: ${duration}ms`)

      res.write('event: done\n')
      res.write('data: [DONE]\n\n')
      res.end()

      return {
        success: true,
        usage: totalUsage,
        // ⚠️ 返回去除 @<date> 后缀的模型名，便于 pricingService 匹配
        model: this._stripModelSuffix(modelId),
        duration
      }
    } catch (error) {
      if (abortController?.signal?.aborted) {
        logger.info(`🔌 Vertex 流请求因客户端断开而中止 - 账户: ${accountId}`)
        if (!res.writableEnded) {
          res.end()
        }
        return { success: false, aborted: true }
      }

      logger.error('❌ Vertex 流式请求失败:', error)
      const statusCode = error.response?.status || 500
      await this._handleUpstreamError(statusCode, accountId, vertexAccount)

      try {
        if (!res.headersSent) {
          res.writeHead(statusCode, { 'Content-Type': 'text/event-stream' })
        }
        if (!res.writableEnded) {
          res.write('event: error\n')
          res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
          res.end()
        }
      } catch (writeError) {
        logger.error('❌ Failed to write Vertex error response:', writeError.message)
        if (!res.writableEnded) {
          res.end()
        }
      }

      throw error
    } finally {
      if (queueLockAcquired && queueRequestId && accountId) {
        try {
          await userMessageQueueService.releaseQueueLock(accountId, queueRequestId)
        } catch (releaseError) {
          logger.error(
            `❌ Failed to release user message queue lock for Vertex stream account ${accountId}:`,
            releaseError.message
          )
        }
      }
    }
  }

  // 处理非流式请求
  async handleNonStreamRequest(requestBody, vertexAccount) {
    const accountId = vertexAccount?.id
    let queueLockAcquired = false
    let queueRequestId = null

    try {
      if (userMessageQueueService.isUserMessageRequest(requestBody)) {
        if (!accountId || accountId === '') {
          logger.error('❌ accountId missing for queue lock in Vertex handleNonStreamRequest')
          throw new Error('accountId missing for queue lock')
        }
        const queueResult = await userMessageQueueService.acquireQueueLock(accountId)
        if (!queueResult.acquired && !queueResult.skipped) {
          const isBackendError = queueResult.error === 'queue_backend_error'
          const errorCode = isBackendError ? 'QUEUE_BACKEND_ERROR' : 'QUEUE_TIMEOUT'
          const errorType = isBackendError ? 'queue_backend_error' : 'queue_timeout'
          const errorMessage = isBackendError
            ? 'Queue service temporarily unavailable, please retry later'
            : 'User message queue wait timeout, please retry later'
          const statusCode = isBackendError ? 500 : 503

          logger.performance('user_message_queue_error', {
            errorType,
            errorCode,
            accountId,
            statusCode,
            backendError: isBackendError ? queueResult.errorMessage : undefined
          })

          return {
            statusCode,
            headers: {
              'Content-Type': 'application/json',
              'x-user-message-queue-error': errorType
            },
            body: JSON.stringify({
              type: 'error',
              error: { type: errorType, code: errorCode, message: errorMessage }
            }),
            success: false
          }
        }
        if (queueResult.acquired && !queueResult.skipped) {
          queueLockAcquired = true
          queueRequestId = queueResult.requestId
        }
      }

      const modelId = this._selectModel(requestBody, vertexAccount)
      const region = this._selectRegion(vertexAccount)
      const projectId = vertexAccount?.projectId
      if (!projectId) {
        throw new Error('Vertex account missing projectId')
      }

      const url = this._buildEndpointUrl({ projectId, region, modelId, stream: false })
      const vertexPayload = this._convertToVertexFormat(requestBody)

      const vertexAccountService = require('../account/vertexAccountService')
      const accessToken = await vertexAccountService.getAccessToken(vertexAccount)

      logger.debug(`🚀 Vertex 非流式请求 - 模型: ${modelId}, 区域: ${region}, 项目: ${projectId}`)

      const proxyAgent = ProxyHelper.createProxyAgent(vertexAccount?.proxy)
      const axiosConfig = {
        method: 'POST',
        url,
        data: vertexPayload,
        timeout: config.requestTimeout || 600000,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        validateStatus: () => true
      }
      if (proxyAgent) {
        axiosConfig.httpAgent = proxyAgent
        axiosConfig.httpsAgent = proxyAgent
        axiosConfig.proxy = false
      }

      const startTime = Date.now()
      const response = await axios(axiosConfig)
      const duration = Date.now() - startTime

      // 请求已发送成功，立即释放队列锁
      if (queueLockAcquired && queueRequestId && accountId) {
        try {
          await userMessageQueueService.releaseQueueLock(accountId, queueRequestId)
          queueLockAcquired = false
        } catch (releaseError) {
          logger.error(
            `❌ Failed to release user message queue lock early for Vertex account ${accountId}:`,
            releaseError.message
          )
        }
      }

      if (response.status >= 400) {
        await this._handleUpstreamError(response.status, accountId, vertexAccount)
        const bodyText =
          typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
        logger.error(
          `❌ Vertex 非流式上游错误 ${response.status} - 账户: ${accountId}, body: ${bodyText.substring(0, 500)}`
        )
        throw Object.assign(new Error(`Vertex upstream error ${response.status}`), {
          statusCode: response.status,
          body: bodyText
        })
      }

      const responseData = response.data
      logger.info(`✅ Vertex 非流式请求完成 - 模型: ${modelId}, 耗时: ${duration}ms`)

      return {
        success: true,
        data: responseData,
        usage: responseData?.usage,
        // ⚠️ 返回去除 @<date> 后缀的模型名
        model: this._stripModelSuffix(modelId),
        duration
      }
    } catch (error) {
      logger.error('❌ Vertex 非流式请求失败:', error)
      throw error
    } finally {
      if (queueLockAcquired && queueRequestId && accountId) {
        try {
          await userMessageQueueService.releaseQueueLock(accountId, queueRequestId)
        } catch (releaseError) {
          logger.error(
            `❌ Failed to release user message queue lock for Vertex account ${accountId}:`,
            releaseError.message
          )
        }
      }
    }
  }

  // 读取 stream 完整内容（用于错误响应）
  async _readStreamToString(stream) {
    const chunks = []
    try {
      for await (const chunk of stream) {
        chunks.push(chunk)
      }
    } catch (e) {
      logger.warn('⚠️ Failed to drain Vertex error stream:', e.message)
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  // 上游错误处理 - 自动标记账户临时不可用
  async _handleUpstreamError(statusCode, accountId, vertexAccount) {
    if (!accountId) {
      return
    }
    const autoProtectionDisabled =
      vertexAccount?.disableAutoProtection === true ||
      vertexAccount?.disableAutoProtection === 'true'
    if (autoProtectionDisabled) {
      return
    }
    if ([401, 403, 429, 500, 502, 503, 529].includes(statusCode)) {
      upstreamErrorHelper.markTempUnavailable(accountId, 'vertex', statusCode).catch(() => {})
    }
  }

  // 获取可用模型列表（硬编码，Vertex AI 暂不支持枚举 publisher 模型）
  async getAvailableModels(vertexAccount = null) {
    const region = vertexAccount?.region || this.defaultRegion
    const models = [
      {
        id: 'claude-opus-4-1@20250805',
        name: 'Claude Opus 4.1',
        provider: 'anthropic',
        type: 'vertex'
      },
      {
        id: 'claude-sonnet-4-5@20250929',
        name: 'Claude Sonnet 4.5',
        provider: 'anthropic',
        type: 'vertex'
      },
      {
        id: 'claude-haiku-4-5@20251001',
        name: 'Claude Haiku 4.5',
        provider: 'anthropic',
        type: 'vertex'
      },
      {
        id: 'claude-3-7-sonnet@20250219',
        name: 'Claude 3.7 Sonnet',
        provider: 'anthropic',
        type: 'vertex'
      },
      {
        id: 'claude-3-5-haiku@20241022',
        name: 'Claude 3.5 Haiku',
        provider: 'anthropic',
        type: 'vertex'
      }
    ]
    logger.debug(`📋 返回 Vertex AI 可用模型 ${models.length} 个, 区域: ${region}`)
    return models
  }
}

module.exports = new VertexRelayService()
