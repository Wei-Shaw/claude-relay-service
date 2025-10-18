const https = require('https')
const axios = require('axios')
const ProxyHelper = require('../utils/proxyHelper')
const droidScheduler = require('./droidScheduler')
const droidAccountService = require('./droidAccountService')
const apiKeyService = require('./apiKeyService')
const redis = require('../models/redis')
const { updateRateLimitCounters } = require('../utils/rateLimitHelper')
const logger = require('../utils/logger')
const runtimeAddon = require('../utils/runtimeAddon')

const SYSTEM_PROMPT = 'You are Droid, an AI software engineering agent built by Factory.'
const RUNTIME_EVENT_FMT_PAYLOAD = 'fmtPayload'

/**
 * Droid API 转发服务
 */

class DroidRelayService {
  constructor() {
    this.factoryApiBaseUrl = 'https://app.factory.ai/api/llm'

    this.endpoints = {
      anthropic: '/a/v1/messages',
      openai: '/o/v1/responses'
    }

    this.userAgent = 'factory-cli/0.19.12'
    this.systemPrompt = SYSTEM_PROMPT
    this.API_KEY_STICKY_PREFIX = 'droid_api_key'
  }

  _normalizeEndpointType(endpointType) {
    if (!endpointType) {
      return 'anthropic'
    }

    const normalized = String(endpointType).toLowerCase()
    if (normalized === 'openai' || normalized === 'common') {
      return 'openai'
    }

    if (normalized === 'anthropic') {
      return 'anthropic'
    }

    return 'anthropic'
  }

  _normalizeRequestBody(requestBody, endpointType) {
    if (!requestBody || typeof requestBody !== 'object') {
      return requestBody
    }

    const normalizedBody = { ...requestBody }

    if (endpointType === 'anthropic' && typeof normalizedBody.model === 'string') {
      const originalModel = normalizedBody.model
      const trimmedModel = originalModel.trim()
      const lowerModel = trimmedModel.toLowerCase()

      if (lowerModel.includes('haiku')) {
        const mappedModel = 'claude-sonnet-4-20250514'
        if (originalModel !== mappedModel) {
          logger.info(`🔄 将请求模型从 ${originalModel} 映射为 ${mappedModel}`)
        }
        normalizedBody.model = mappedModel
      }
    }

    if (endpointType === 'openai' && typeof normalizedBody.model === 'string') {
      const originalModel = normalizedBody.model
      const trimmedModel = originalModel.trim()
      const lowerModel = trimmedModel.toLowerCase()

      if (lowerModel === 'gpt-5') {
        const mappedModel = 'gpt-5-2025-08-07'
        if (originalModel !== mappedModel) {
          logger.info(`🔄 将请求模型从 ${originalModel} 映射为 ${mappedModel}`)
        }
        normalizedBody.model = mappedModel
      }
    }

    return normalizedBody
  }

  async _applyRateLimitTracking(rateLimitInfo, usageSummary, model, context = '') {
    if (!rateLimitInfo) {
      return
    }

    try {
      const { totalTokens, totalCost } = await updateRateLimitCounters(
        rateLimitInfo,
        usageSummary,
        model
      )

      if (totalTokens > 0) {
        logger.api(`📊 Updated rate limit token count${context}: +${totalTokens}`)
      }
      if (typeof totalCost === 'number' && totalCost > 0) {
        logger.api(`💰 Updated rate limit cost count${context}: +$${totalCost.toFixed(6)}`)
      }
    } catch (error) {
      logger.error(`❌ Failed to update rate limit counters${context}:`, error)
    }
  }

  _composeApiKeyStickyKey(accountId, endpointType, sessionHash) {
    if (!accountId || !sessionHash) {
      return null
    }

    const normalizedEndpoint = this._normalizeEndpointType(endpointType)
    return `${this.API_KEY_STICKY_PREFIX}:${accountId}:${normalizedEndpoint}:${sessionHash}`
  }

  async _selectApiKey(account, endpointType, sessionHash) {
    const entries = await droidAccountService.getDecryptedApiKeyEntries(account.id)
    if (!entries || entries.length === 0) {
      throw new Error(`Droid account ${account.id} 未配置任何 API Key`)
    }

    // 过滤掉异常状态的API Key
    const activeEntries = entries.filter((entry) => entry.status !== 'error')
    if (!activeEntries || activeEntries.length === 0) {
      throw new Error(`Droid account ${account.id} 没有可用的 API Key（所有API Key均已异常）`)
    }

    const stickyKey = this._composeApiKeyStickyKey(account.id, endpointType, sessionHash)

    if (stickyKey) {
      const mappedKeyId = await redis.getSessionAccountMapping(stickyKey)
      if (mappedKeyId) {
        const mappedEntry = activeEntries.find((entry) => entry.id === mappedKeyId)
        if (mappedEntry) {
          await redis.extendSessionAccountMappingTTL(stickyKey)
          await droidAccountService.touchApiKeyUsage(account.id, mappedEntry.id)
          logger.info(`🔐 使用已绑定的 Droid API Key ${mappedEntry.id}（Account: ${account.id}）`)
          return mappedEntry
        }

        await redis.deleteSessionAccountMapping(stickyKey)
      }
    }

    const selectedEntry = activeEntries[Math.floor(Math.random() * activeEntries.length)]
    if (!selectedEntry) {
      throw new Error(`Droid account ${account.id} 没有可用的 API Key`)
    }

    if (stickyKey) {
      await redis.setSessionAccountMapping(stickyKey, selectedEntry.id)
    }

    await droidAccountService.touchApiKeyUsage(account.id, selectedEntry.id)

    logger.info(
      `🔐 随机选取 Droid API Key ${selectedEntry.id}（Account: ${account.id}, Active Keys: ${activeEntries.length}/${entries.length}）`
    )

    return selectedEntry
  }

  async relayRequest(
    requestBody,
    apiKeyData,
    clientRequest,
    clientResponse,
    clientHeaders,
    options = {}
  ) {
    const {
      endpointType = 'anthropic',
      sessionHash = null,
      customPath = null,
      skipUsageRecord = false,
      disableStreaming = false
    } = options
    const keyInfo = apiKeyData || {}
    const clientApiKeyId = keyInfo.id || null
    const normalizedEndpoint = this._normalizeEndpointType(endpointType)
    const normalizedRequestBody = this._normalizeRequestBody(requestBody, normalizedEndpoint)
    let account = null
    let selectedApiKey = null
    let accessToken = null

    try {
      logger.info(
        `📤 Processing Droid API request for key: ${
          keyInfo.name || keyInfo.id || 'unknown'
        }, endpoint: ${normalizedEndpoint}${sessionHash ? `, session: ${sessionHash}` : ''}`
      )

      // 选择一个可用的 Droid 账户（支持粘性会话和分组调度）
      account = await droidScheduler.selectAccount(keyInfo, normalizedEndpoint, sessionHash)

      if (!account) {
        throw new Error(`No available Droid account for endpoint type: ${normalizedEndpoint}`)
      }

      // 获取认证凭据：支持 Access Token 和 API Key 两种模式
      if (
        typeof account.authenticationMethod === 'string' &&
        account.authenticationMethod.toLowerCase().trim() === 'api_key'
      ) {
        selectedApiKey = await this._selectApiKey(account, normalizedEndpoint, sessionHash)
        accessToken = selectedApiKey.key
      } else {
        accessToken = await droidAccountService.getValidAccessToken(account.id)
      }

      // 获取 Factory.ai API URL
      let endpointPath = this.endpoints[normalizedEndpoint]

      if (typeof customPath === 'string' && customPath.trim()) {
        endpointPath = customPath.startsWith('/') ? customPath : `/${customPath}`
      }

      const apiUrl = `${this.factoryApiBaseUrl}${endpointPath}`

      logger.info(`🌐 Forwarding to Factory.ai: ${apiUrl}`)

      // 获取代理配置
      const proxyConfig = account.proxy ? JSON.parse(account.proxy) : null
      const proxyAgent = proxyConfig ? ProxyHelper.createProxyAgent(proxyConfig) : null

      if (proxyAgent) {
        logger.info(`🌐 Using proxy: ${ProxyHelper.getProxyDescription(proxyConfig)}`)
      }

      // 构建请求头
      const headers = this._buildHeaders(
        accessToken,
        normalizedRequestBody,
        normalizedEndpoint,
        clientHeaders
      )

      if (selectedApiKey) {
        logger.info(
          `🔑 Forwarding request with Droid API Key ${selectedApiKey.id} (Account: ${account.id})`
        )
      }

      // 处理请求体（注入 system prompt 等）
      const streamRequested = !disableStreaming && this._isStreamRequested(normalizedRequestBody)

      let processedBody = this._processRequestBody(normalizedRequestBody, normalizedEndpoint, {
        disableStreaming,
        streamRequested
      })

      const extensionPayload = {
        body: processedBody,
        endpoint: normalizedEndpoint,
        rawRequest: normalizedRequestBody,
        originalRequest: requestBody
      }

      const extensionResult = runtimeAddon.emitSync(RUNTIME_EVENT_FMT_PAYLOAD, extensionPayload)
      const resolvedPayload =
        extensionResult && typeof extensionResult === 'object' ? extensionResult : extensionPayload

      if (resolvedPayload && typeof resolvedPayload === 'object') {
        if (resolvedPayload.abortResponse && typeof resolvedPayload.abortResponse === 'object') {
          return resolvedPayload.abortResponse
        }

        if (resolvedPayload.body && typeof resolvedPayload.body === 'object') {
          processedBody = resolvedPayload.body
        } else if (resolvedPayload !== extensionPayload) {
          processedBody = resolvedPayload
        }
      }

      // 发送请求
      const isStreaming = streamRequested

      // 根据是否流式选择不同的处理方式
      if (isStreaming) {
        // 流式响应：使用原生 https 模块以更好地控制流
        return await this._handleStreamRequest(
          apiUrl,
          headers,
          processedBody,
          proxyAgent,
          clientRequest,
          clientResponse,
          account,
          keyInfo,
          normalizedRequestBody,
          normalizedEndpoint,
          skipUsageRecord,
          selectedApiKey,
          sessionHash,
          clientApiKeyId
        )
      } else {
        // 非流式响应：使用 axios
        const requestOptions = {
          method: 'POST',
          url: apiUrl,
          headers,
          data: processedBody,
          timeout: 600 * 1000, // 10分钟超时
          responseType: 'json',
          ...(proxyAgent && {
            httpAgent: proxyAgent,
            httpsAgent: proxyAgent,
            proxy: false
          })
        }

        const response = await axios(requestOptions)

        logger.info(`✅ Factory.ai response status: ${response.status}`)

        // 处理非流式响应
        return this._handleNonStreamResponse(
          response,
          account,
          keyInfo,
          normalizedRequestBody,
          clientRequest,
          normalizedEndpoint,
          skipUsageRecord
        )
      }
    } catch (error) {
      logger.error(`❌ Droid relay error: ${error.message}`, error)

      const status = error?.response?.status
      if (status >= 400 && status < 500) {
        try {
          await this._handleUpstreamClientError(status, {
            account,
            selectedAccountApiKey: selectedApiKey,
            endpointType: normalizedEndpoint,
            sessionHash,
            clientApiKeyId
          })
        } catch (handlingError) {
          logger.error('❌ 处理 Droid 4xx 异常失败:', handlingError)
        }
      }

      if (error.response) {
        // HTTP 错误响应
        return {
          statusCode: error.response.status,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            error.response.data || {
              error: 'upstream_error',
              message: error.message
            }
          )
        }
      }

      // 网络错误或其他错误（统一返回 4xx）
      const mappedStatus = this._mapNetworkErrorStatus(error)
      return {
        statusCode: mappedStatus,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this._buildNetworkErrorBody(error))
      }
    }
  }

  /**
   * 处理流式请求
   */
  async _handleStreamRequest(
    apiUrl,
    headers,
    processedBody,
    proxyAgent,
    clientRequest,
    clientResponse,
    account,
    apiKeyData,
    requestBody,
    endpointType,
    skipUsageRecord = false,
    selectedAccountApiKey = null,
    sessionHash = null,
    clientApiKeyId = null
  ) {
    return new Promise((resolve, reject) => {
      const url = new URL(apiUrl)
      const bodyString = JSON.stringify(processedBody)
      const contentLength = Buffer.byteLength(bodyString)
      const requestHeaders = {
        ...headers,
        'content-length': contentLength.toString()
      }

      let responseStarted = false
      let responseCompleted = false
      let settled = false
      let upstreamResponse = null
      let completionWindow = ''
      let hasForwardedData = false

      const resolveOnce = (value) => {
        if (settled) {
          return
        }
        settled = true
        resolve(value)
      }

      const rejectOnce = (error) => {
        if (settled) {
          return
        }
        settled = true
        reject(error)
      }

      const handleStreamError = (error) => {
        if (responseStarted) {
          const isConnectionReset =
            error && (error.code === 'ECONNRESET' || error.message === 'aborted')
          const upstreamComplete =
            responseCompleted || upstreamResponse?.complete || clientResponse.writableEnded

          if (isConnectionReset && (upstreamComplete || hasForwardedData)) {
            logger.debug('🔁 Droid stream连接在响应阶段被重置，视为正常结束:', {
              message: error?.message,
              code: error?.code
            })
            if (!clientResponse.destroyed && !clientResponse.writableEnded) {
              clientResponse.end()
            }
            resolveOnce({ statusCode: 200, streaming: true })
            return
          }

          logger.error('❌ Droid stream error:', error)
          const mappedStatus = this._mapNetworkErrorStatus(error)
          const errorBody = this._buildNetworkErrorBody(error)

          if (!clientResponse.destroyed) {
            if (!clientResponse.writableEnded) {
              const canUseJson =
                !hasForwardedData &&
                typeof clientResponse.status === 'function' &&
                typeof clientResponse.json === 'function'

              if (canUseJson) {
                clientResponse.status(mappedStatus).json(errorBody)
              } else {
                const errorPayload = JSON.stringify(errorBody)

                if (!hasForwardedData) {
                  if (typeof clientResponse.setHeader === 'function') {
                    clientResponse.setHeader('Content-Type', 'application/json')
                  }
                  clientResponse.write(errorPayload)
                  clientResponse.end()
                } else {
                  clientResponse.write(`event: error\ndata: ${errorPayload}\n\n`)
                  clientResponse.end()
                }
              }
            }
          }

          resolveOnce({ statusCode: mappedStatus, streaming: true, error })
        } else {
          rejectOnce(error)
        }
      }

      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: requestHeaders,
        agent: proxyAgent,
        timeout: 600 * 1000
      }

      const req = https.request(options, (res) => {
        upstreamResponse = res
        logger.info(`✅ Factory.ai stream response status: ${res.statusCode}`)

        // 错误响应
        if (res.statusCode !== 200) {
          const chunks = []

          res.on('data', (chunk) => {
            chunks.push(chunk)
            logger.info(`📦 got ${chunk.length} bytes of data`)
          })

          res.on('end', () => {
            logger.info('✅ res.end() reached')
            const body = Buffer.concat(chunks).toString()
            logger.error(`❌ Factory.ai error response body: ${body || '(empty)'}`)
            if (res.statusCode >= 400 && res.statusCode < 500) {
              this._handleUpstreamClientError(res.statusCode, {
                account,
                selectedAccountApiKey,
                endpointType,
                sessionHash,
                clientApiKeyId
              }).catch((handlingError) => {
                logger.error('❌ 处理 Droid 流式4xx 异常失败:', handlingError)
              })
            }
            if (!clientResponse.headersSent) {
              clientResponse.status(res.statusCode).json({
                error: 'upstream_error',
                details: body
              })
            }
            resolveOnce({ statusCode: res.statusCode, streaming: true })
          })

          res.on('close', () => {
            logger.warn('⚠️ response closed before end event')
          })

          res.on('error', handleStreamError)

          return
        }

        responseStarted = true

        // 设置流式响应头
        clientResponse.setHeader('Content-Type', 'text/event-stream')
        clientResponse.setHeader('Cache-Control', 'no-cache')
        clientResponse.setHeader('Connection', 'keep-alive')

        // Usage 数据收集
        let buffer = ''
        const currentUsageData = {}
        const model = requestBody.model || 'unknown'

        // 处理 SSE 流
        res.on('data', (chunk) => {
          const chunkStr = chunk.toString()
          completionWindow = (completionWindow + chunkStr).slice(-1024)
          hasForwardedData = true

          // 转发数据到客户端
          clientResponse.write(chunk)
          hasForwardedData = true

          // 解析 usage 数据（根据端点类型）
          if (endpointType === 'anthropic') {
            // Anthropic Messages API 格式
            this._parseAnthropicUsageFromSSE(chunkStr, buffer, currentUsageData)
          } else if (endpointType === 'openai') {
            // OpenAI Chat Completions 格式
            this._parseOpenAIUsageFromSSE(chunkStr, buffer, currentUsageData)
          }

          if (!responseCompleted && this._detectStreamCompletion(completionWindow, endpointType)) {
            responseCompleted = true
          }

          buffer += chunkStr
        })

        res.on('end', async () => {
          responseCompleted = true
          clientResponse.end()

          // 记录 usage 数据
          if (!skipUsageRecord) {
            const normalizedUsage = await this._recordUsageFromStreamData(
              currentUsageData,
              apiKeyData,
              account,
              model
            )

            const usageSummary = {
              inputTokens: normalizedUsage.input_tokens || 0,
              outputTokens: normalizedUsage.output_tokens || 0,
              cacheCreateTokens: normalizedUsage.cache_creation_input_tokens || 0,
              cacheReadTokens: normalizedUsage.cache_read_input_tokens || 0
            }

            await this._applyRateLimitTracking(
              clientRequest?.rateLimitInfo,
              usageSummary,
              model,
              ' [stream]'
            )

            logger.success(`✅ Droid stream completed - Account: ${account.name}`)
          } else {
            logger.success(
              `✅ Droid stream completed - Account: ${account.name}, usage recording skipped`
            )
          }
          resolveOnce({ statusCode: 200, streaming: true })
        })

        res.on('error', handleStreamError)

        res.on('close', () => {
          if (settled) {
            return
          }

          if (responseCompleted) {
            if (!clientResponse.destroyed && !clientResponse.writableEnded) {
              clientResponse.end()
            }
            resolveOnce({ statusCode: 200, streaming: true })
          } else {
            handleStreamError(new Error('Upstream stream closed unexpectedly'))
          }
        })
      })

      // 客户端断开连接时清理
      clientResponse.on('close', () => {
        if (req && !req.destroyed) {
          req.destroy()
        }
      })

      req.on('error', handleStreamError)

      req.on('timeout', () => {
        req.destroy()
        logger.error('❌ Droid request timeout')
        handleStreamError(new Error('Request timeout'))
      })

      // 写入请求体
      req.end(bodyString)
    })
  }

  /**
   * 从 SSE 流中解析 Anthropic usage 数据
   */
  _parseAnthropicUsageFromSSE(chunkStr, buffer, currentUsageData) {
    try {
      // 分割成行
      const lines = (buffer + chunkStr).split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ') && line.length > 6) {
          try {
            const jsonStr = line.slice(6)
            const data = JSON.parse(jsonStr)

            // message_start 包含 input tokens 和 cache tokens
            if (data.type === 'message_start' && data.message && data.message.usage) {
              currentUsageData.input_tokens = data.message.usage.input_tokens || 0
              currentUsageData.cache_creation_input_tokens =
                data.message.usage.cache_creation_input_tokens || 0
              currentUsageData.cache_read_input_tokens =
                data.message.usage.cache_read_input_tokens || 0

              // 详细的缓存类型
              if (data.message.usage.cache_creation) {
                currentUsageData.cache_creation = {
                  ephemeral_5m_input_tokens:
                    data.message.usage.cache_creation.ephemeral_5m_input_tokens || 0,
                  ephemeral_1h_input_tokens:
                    data.message.usage.cache_creation.ephemeral_1h_input_tokens || 0
                }
              }

              logger.debug('📊 Droid Anthropic input usage:', currentUsageData)
            }

            // message_delta 包含 output tokens
            if (data.type === 'message_delta' && data.usage) {
              currentUsageData.output_tokens = data.usage.output_tokens || 0
              logger.debug('📊 Droid Anthropic output usage:', currentUsageData.output_tokens)
            }
          } catch (parseError) {
            // 忽略解析错误
          }
        }
      }
    } catch (error) {
      logger.debug('Error parsing Anthropic usage:', error)
    }
  }

  /**
   * 从 SSE 流中解析 OpenAI usage 数据
   */
  _parseOpenAIUsageFromSSE(chunkStr, buffer, currentUsageData) {
    try {
      // OpenAI Chat Completions 流式格式
      const lines = (buffer + chunkStr).split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ') && line.length > 6) {
          try {
            const jsonStr = line.slice(6)
            if (jsonStr === '[DONE]') {
              continue
            }

            const data = JSON.parse(jsonStr)

            // 兼容传统 Chat Completions usage 字段
            if (data.usage) {
              currentUsageData.input_tokens = data.usage.prompt_tokens || 0
              currentUsageData.output_tokens = data.usage.completion_tokens || 0
              currentUsageData.total_tokens = data.usage.total_tokens || 0

              logger.debug('📊 Droid OpenAI usage:', currentUsageData)
            }

            // 新 Response API 在 response.usage 中返回统计
            if (data.response && data.response.usage) {
              const { usage } = data.response
              currentUsageData.input_tokens =
                usage.input_tokens || usage.prompt_tokens || usage.total_tokens || 0
              currentUsageData.output_tokens = usage.output_tokens || usage.completion_tokens || 0
              currentUsageData.total_tokens = usage.total_tokens || 0

              logger.debug('📊 Droid OpenAI response usage:', currentUsageData)
            }
          } catch (parseError) {
            // 忽略解析错误
          }
        }
      }
    } catch (error) {
      logger.debug('Error parsing OpenAI usage:', error)
    }
  }

  /**
   * 检测流式响应是否已经包含终止标记
   */
  _detectStreamCompletion(windowStr, endpointType) {
    if (!windowStr) {
      return false
    }

    const lower = windowStr.toLowerCase()
    const compact = lower.replace(/\s+/g, '')

    if (endpointType === 'anthropic') {
      if (lower.includes('event: message_stop')) {
        return true
      }
      if (compact.includes('"type":"message_stop"')) {
        return true
      }
      return false
    }

    if (endpointType === 'openai') {
      if (lower.includes('data: [done]')) {
        return true
      }

      if (compact.includes('"finish_reason"')) {
        return true
      }

      if (lower.includes('event: response.done') || lower.includes('event: response.completed')) {
        return true
      }

      if (
        compact.includes('"type":"response.done"') ||
        compact.includes('"type":"response.completed"')
      ) {
        return true
      }
    }

    return false
  }

  /**
   * 记录从流中解析的 usage 数据
   */
  async _recordUsageFromStreamData(usageData, apiKeyData, account, model) {
    const normalizedUsage = this._normalizeUsageSnapshot(usageData)
    await this._recordUsage(apiKeyData, account, model, normalizedUsage)
    return normalizedUsage
  }

  /**
   * 标准化 usage 数据，确保字段完整且为数字
   */
  _normalizeUsageSnapshot(usageData = {}) {
    const toNumber = (value) => {
      if (value === undefined || value === null || value === '') {
        return 0
      }
      const num = Number(value)
      if (!Number.isFinite(num)) {
        return 0
      }
      return Math.max(0, num)
    }

    const inputTokens = toNumber(
      usageData.input_tokens ??
        usageData.prompt_tokens ??
        usageData.inputTokens ??
        usageData.total_input_tokens
    )
    const outputTokens = toNumber(
      usageData.output_tokens ?? usageData.completion_tokens ?? usageData.outputTokens
    )
    const cacheReadTokens = toNumber(
      usageData.cache_read_input_tokens ??
        usageData.cacheReadTokens ??
        usageData.input_tokens_details?.cached_tokens
    )

    const rawCacheCreateTokens =
      usageData.cache_creation_input_tokens ??
      usageData.cacheCreateTokens ??
      usageData.cache_tokens ??
      0
    let cacheCreateTokens = toNumber(rawCacheCreateTokens)

    const ephemeral5m = toNumber(
      usageData.cache_creation?.ephemeral_5m_input_tokens ?? usageData.ephemeral_5m_input_tokens
    )
    const ephemeral1h = toNumber(
      usageData.cache_creation?.ephemeral_1h_input_tokens ?? usageData.ephemeral_1h_input_tokens
    )

    if (cacheCreateTokens === 0 && (ephemeral5m > 0 || ephemeral1h > 0)) {
      cacheCreateTokens = ephemeral5m + ephemeral1h
    }

    const normalized = {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: cacheCreateTokens,
      cache_read_input_tokens: cacheReadTokens
    }

    if (ephemeral5m > 0 || ephemeral1h > 0) {
      normalized.cache_creation = {
        ephemeral_5m_input_tokens: ephemeral5m,
        ephemeral_1h_input_tokens: ephemeral1h
      }
    }

    return normalized
  }

  /**
   * 计算 usage 对象的总 token 数
   */
  _getTotalTokens(usageObject = {}) {
    const toNumber = (value) => {
      if (value === undefined || value === null || value === '') {
        return 0
      }
      const num = Number(value)
      if (!Number.isFinite(num)) {
        return 0
      }
      return Math.max(0, num)
    }

    return (
      toNumber(usageObject.input_tokens) +
      toNumber(usageObject.output_tokens) +
      toNumber(usageObject.cache_creation_input_tokens) +
      toNumber(usageObject.cache_read_input_tokens)
    )
  }

  /**
   * 提取账户 ID
   */
  _extractAccountId(account) {
    if (!account || typeof account !== 'object') {
      return null
    }
    return account.id || account.accountId || account.account_id || null
  }

  /**
   * 构建请求头
   */
  _buildHeaders(accessToken, requestBody, endpointType, clientHeaders = {}) {
    const headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      'user-agent': this.userAgent,
      'x-factory-client': 'cli',
      connection: 'keep-alive'
    }

    // Anthropic 特定头
    if (endpointType === 'anthropic') {
      headers['accept'] = 'application/json'
      headers['anthropic-version'] = '2023-06-01'
      headers['x-api-key'] = 'placeholder'
      headers['x-api-provider'] = 'anthropic'

      if (this._isThinkingRequested(requestBody)) {
        headers['anthropic-beta'] = 'interleaved-thinking-2025-05-14'
      }
    }

    // OpenAI 特定头
    if (endpointType === 'openai') {
      headers['x-api-provider'] = 'azure_openai'
    }

    // 生成会话 ID（如果客户端没有提供）
    headers['x-session-id'] = clientHeaders['x-session-id'] || this._generateUUID()

    return headers
  }

  /**
   * 判断请求是否要求流式响应
   */
  _isStreamRequested(requestBody) {
    if (!requestBody || typeof requestBody !== 'object') {
      return false
    }

    const value = requestBody.stream

    if (value === true) {
      return true
    }

    if (typeof value === 'string') {
      return value.toLowerCase() === 'true'
    }

    return false
  }

  /**
   * 判断请求是否启用 Anthropic 推理模式
   */
  _isThinkingRequested(requestBody) {
    const thinking = requestBody && typeof requestBody === 'object' ? requestBody.thinking : null
    if (!thinking) {
      return false
    }

    if (thinking === true) {
      return true
    }

    if (typeof thinking === 'string') {
      return thinking.trim().toLowerCase() === 'enabled'
    }

    if (typeof thinking === 'object') {
      if (thinking.enabled === true) {
        return true
      }

      if (typeof thinking.type === 'string') {
        return thinking.type.trim().toLowerCase() === 'enabled'
      }
    }

    return false
  }

  /**
   * 处理请求体（注入 system prompt 等）
   */
  _processRequestBody(requestBody, endpointType, options = {}) {
    const { disableStreaming = false, streamRequested = false } = options
    const processedBody = { ...requestBody }

    const hasStreamField =
      requestBody && Object.prototype.hasOwnProperty.call(requestBody, 'stream')

    if (processedBody && Object.prototype.hasOwnProperty.call(processedBody, 'metadata')) {
      delete processedBody.metadata
    }

    if (disableStreaming || !streamRequested) {
      if (hasStreamField) {
        processedBody.stream = false
      } else if ('stream' in processedBody) {
        delete processedBody.stream
      }
    } else {
      processedBody.stream = true
    }

    // Anthropic 端点：仅注入系统提示
    if (endpointType === 'anthropic') {
      if (this.systemPrompt) {
        const promptBlock = { type: 'text', text: this.systemPrompt }
        if (Array.isArray(processedBody.system)) {
          const hasPrompt = processedBody.system.some(
            (item) => item && item.type === 'text' && item.text === this.systemPrompt
          )
          if (!hasPrompt) {
            processedBody.system = [promptBlock, ...processedBody.system]
          }
        } else {
          processedBody.system = [promptBlock]
        }
      }
    }

    // OpenAI 端点：仅前置系统提示
    if (endpointType === 'openai') {
      if (this.systemPrompt) {
        if (processedBody.instructions) {
          if (!processedBody.instructions.startsWith(this.systemPrompt)) {
            processedBody.instructions = `${this.systemPrompt}${processedBody.instructions}`
          }
        } else {
          processedBody.instructions = this.systemPrompt
        }
      }
    }

    // 处理 temperature 和 top_p 参数
    const hasValidTemperature =
      processedBody.temperature !== undefined && processedBody.temperature !== null
    const hasValidTopP = processedBody.top_p !== undefined && processedBody.top_p !== null

    if (hasValidTemperature && hasValidTopP) {
      // 仅允许 temperature 或 top_p 其一，同时优先保留 temperature
      delete processedBody.top_p
    }

    return processedBody
  }

  /**
   * 处理非流式响应
   */
  async _handleNonStreamResponse(
    response,
    account,
    apiKeyData,
    requestBody,
    clientRequest,
    endpointType,
    skipUsageRecord = false
  ) {
    const { data } = response

    // 从响应中提取 usage 数据
    const usage = data.usage || {}

    const model = requestBody.model || 'unknown'

    const normalizedUsage = this._normalizeUsageSnapshot(usage)

    if (!skipUsageRecord) {
      await this._recordUsage(apiKeyData, account, model, normalizedUsage)

      const totalTokens = this._getTotalTokens(normalizedUsage)

      const usageSummary = {
        inputTokens: normalizedUsage.input_tokens || 0,
        outputTokens: normalizedUsage.output_tokens || 0,
        cacheCreateTokens: normalizedUsage.cache_creation_input_tokens || 0,
        cacheReadTokens: normalizedUsage.cache_read_input_tokens || 0
      }

      await this._applyRateLimitTracking(
        clientRequest?.rateLimitInfo,
        usageSummary,
        model,
        endpointType === 'anthropic' ? ' [anthropic]' : ' [openai]'
      )

      logger.success(
        `✅ Droid request completed - Account: ${account.name}, Tokens: ${totalTokens}`
      )
    } else {
      logger.success(
        `✅ Droid request completed - Account: ${account.name}, usage recording skipped`
      )
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }
  }

  /**
   * 记录使用统计
   */
  async _recordUsage(apiKeyData, account, model, usageObject = {}) {
    const totalTokens = this._getTotalTokens(usageObject)

    if (totalTokens <= 0) {
      logger.debug('🪙 Droid usage 数据为空，跳过记录')
      return
    }

    try {
      const keyId = apiKeyData?.id
      const accountId = this._extractAccountId(account)

      if (keyId) {
        await apiKeyService.recordUsageWithDetails(keyId, usageObject, model, accountId, 'droid')
      } else if (accountId) {
        await redis.incrementAccountUsage(
          accountId,
          totalTokens,
          usageObject.input_tokens || 0,
          usageObject.output_tokens || 0,
          usageObject.cache_creation_input_tokens || 0,
          usageObject.cache_read_input_tokens || 0,
          model,
          false
        )
      } else {
        logger.warn('⚠️ 无法记录 Droid usage：缺少 API Key 和账户标识')
        return
      }

      logger.debug(
        `📊 Droid usage recorded - Key: ${keyId || 'unknown'}, Account: ${accountId || 'unknown'}, Model: ${model}, Input: ${usageObject.input_tokens || 0}, Output: ${usageObject.output_tokens || 0}, Cache Create: ${usageObject.cache_creation_input_tokens || 0}, Cache Read: ${usageObject.cache_read_input_tokens || 0}, Total: ${totalTokens}`
      )
    } catch (error) {
      logger.error('❌ Failed to record Droid usage:', error)
    }
  }

  /**
   * 处理上游 4xx 响应，移除问题 API Key 或停止账号调度
   */
  async _handleUpstreamClientError(statusCode, context = {}) {
    if (!statusCode || statusCode < 400 || statusCode >= 500) {
      return
    }

    const {
      account,
      selectedAccountApiKey = null,
      endpointType = null,
      sessionHash = null,
      clientApiKeyId = null
    } = context

    const accountId = this._extractAccountId(account)
    if (!accountId) {
      logger.warn('⚠️ 上游 4xx 处理被跳过：缺少有效的账户信息')
      return
    }

    const normalizedEndpoint = this._normalizeEndpointType(
      endpointType || account?.endpointType || 'anthropic'
    )
    const authMethod =
      typeof account?.authenticationMethod === 'string'
        ? account.authenticationMethod.toLowerCase().trim()
        : ''

    if (authMethod === 'api_key') {
      if (selectedAccountApiKey?.id) {
        let markResult = null
        const errorMessage = `${statusCode}`

        try {
          // 标记API Key为异常状态而不是删除
          markResult = await droidAccountService.markApiKeyAsError(
            accountId,
            selectedAccountApiKey.id,
            errorMessage
          )
        } catch (error) {
          logger.error(
            `❌ 标记 Droid API Key ${selectedAccountApiKey.id} 异常状态（Account: ${accountId}）失败：`,
            error
          )
        }

        await this._clearApiKeyStickyMapping(accountId, normalizedEndpoint, sessionHash)

        if (markResult?.marked) {
          logger.warn(
            `⚠️ 上游返回 ${statusCode}，已标记 Droid API Key ${selectedAccountApiKey.id} 为异常状态（Account: ${accountId}）`
          )
        } else {
          logger.warn(
            `⚠️ 上游返回 ${statusCode}，但未能标记 Droid API Key ${selectedAccountApiKey.id} 异常状态（Account: ${accountId}）：${markResult?.error || '未知错误'}`
          )
        }

        // 检查是否还有可用的API Key
        try {
          const availableEntries = await droidAccountService.getDecryptedApiKeyEntries(accountId)
          const activeEntries = availableEntries.filter((entry) => entry.status !== 'error')

          if (activeEntries.length === 0) {
            await this._stopDroidAccountScheduling(accountId, statusCode, '所有API Key均已异常')
            await this._clearAccountStickyMapping(normalizedEndpoint, sessionHash, clientApiKeyId)
          } else {
            logger.info(`ℹ️ Droid 账号 ${accountId} 仍有 ${activeEntries.length} 个可用 API Key`)
          }
        } catch (error) {
          logger.error(`❌ 检查可用API Key失败（Account: ${accountId}）：`, error)
          await this._stopDroidAccountScheduling(accountId, statusCode, 'API Key检查失败')
          await this._clearAccountStickyMapping(normalizedEndpoint, sessionHash, clientApiKeyId)
        }

        return
      }

      logger.warn(
        `⚠️ 上游返回 ${statusCode}，但未获取到对应的 Droid API Key（Account: ${accountId}）`
      )
      await this._stopDroidAccountScheduling(accountId, statusCode, '缺少可用 API Key')
      await this._clearAccountStickyMapping(normalizedEndpoint, sessionHash, clientApiKeyId)
      return
    }

    await this._stopDroidAccountScheduling(accountId, statusCode, '凭证不可用')
    await this._clearAccountStickyMapping(normalizedEndpoint, sessionHash, clientApiKeyId)
  }

  /**
   * 停止指定 Droid 账号的调度
   */
  async _stopDroidAccountScheduling(accountId, statusCode, reason = '') {
    if (!accountId) {
      return
    }

    const message = reason ? `${reason}` : '上游返回 4xx 错误'

    try {
      await droidAccountService.updateAccount(accountId, {
        schedulable: 'false',
        status: 'error',
        errorMessage: `上游返回 ${statusCode}：${message}`
      })
      logger.warn(`🚫 已停止调度 Droid 账号 ${accountId}（状态码 ${statusCode}，原因：${message}）`)
    } catch (error) {
      logger.error(`❌ 停止调度 Droid 账号失败：${accountId}`, error)
    }
  }

  /**
   * 清理账号层面的粘性调度映射
   */
  async _clearAccountStickyMapping(endpointType, sessionHash, clientApiKeyId) {
    if (!sessionHash) {
      return
    }

    const normalizedEndpoint = this._normalizeEndpointType(endpointType)
    const apiKeyPart = clientApiKeyId || 'default'
    const stickyKey = `droid:${normalizedEndpoint}:${apiKeyPart}:${sessionHash}`

    try {
      await redis.deleteSessionAccountMapping(stickyKey)
      logger.debug(`🧹 已清理 Droid 粘性会话映射：${stickyKey}`)
    } catch (error) {
      logger.warn(`⚠️ 清理 Droid 粘性会话映射失败：${stickyKey}`, error)
    }
  }

  /**
   * 清理 API Key 级别的粘性映射
   */
  async _clearApiKeyStickyMapping(accountId, endpointType, sessionHash) {
    if (!accountId || !sessionHash) {
      return
    }

    try {
      const stickyKey = this._composeApiKeyStickyKey(accountId, endpointType, sessionHash)
      if (stickyKey) {
        await redis.deleteSessionAccountMapping(stickyKey)
        logger.debug(`🧹 已清理 Droid API Key 粘性映射：${stickyKey}`)
      }
    } catch (error) {
      logger.warn(
        `⚠️ 清理 Droid API Key 粘性映射失败：${accountId}（endpoint: ${endpointType}）`,
        error
      )
    }
  }

  _mapNetworkErrorStatus(error) {
    const code = (error && error.code ? String(error.code) : '').toUpperCase()

    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
      return 408
    }

    if (code === 'ECONNRESET' || code === 'EPIPE') {
      return 424
    }

    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      return 424
    }

    if (typeof error === 'object' && error !== null) {
      const message = (error.message || '').toLowerCase()
      if (message.includes('timeout')) {
        return 408
      }
    }

    return 424
  }

  _buildNetworkErrorBody(error) {
    const body = {
      error: 'relay_upstream_failure',
      message: error?.message || '上游请求失败'
    }

    if (error?.code) {
      body.code = error.code
    }

    if (error?.config?.url) {
      body.upstream = error.config.url
    }

    return body
  }

  /**
   * 生成 UUID
   */
  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }
}

// 导出单例
module.exports = new DroidRelayService()
