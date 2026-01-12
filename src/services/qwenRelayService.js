const https = require('https')
const axios = require('axios')
const ProxyHelper = require('../utils/proxyHelper')
const qwenScheduler = require('./qwenScheduler')
const qwenAccountService = require('./qwenAccountService')
const apiKeyService = require('./apiKeyService')
const redis = require('../models/redis')
const { updateRateLimitCounters } = require('../utils/rateLimitHelper')
const logger = require('../utils/logger')

/**
 * Qwen API 转发服务
 * 兼容 OpenAI Chat Completions API 格式
 */
class QwenRelayService {
  constructor() {
    this.qwenApiBaseUrl = 'https://portal.qwen.ai'
    this.qwenApiPath = '/v1/chat/completions'
  }

  /**
   * 应用速率限制追踪
   */
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

  /**
   * 记录使用统计
   */
  async _recordUsage(usageData, apiKeyData, account, model) {
    try {
      const inputTokens = usageData.prompt_tokens || 0
      const outputTokens = usageData.completion_tokens || 0
      const totalTokens = usageData.total_tokens || inputTokens + outputTokens

      if (totalTokens <= 0) {
        logger.debug('🪙 Qwen usage 数据为空，跳过记录')
        return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      }

      const keyId = apiKeyData?.id
      const accountId = account?.id

      // 使用 apiKeyService 记录使用情况（会同时记录账户和 API Key 级别的统计）
      if (keyId) {
        await apiKeyService.recordUsage(
          keyId,
          inputTokens,
          outputTokens,
          0, // cacheCreateTokens
          0, // cacheReadTokens
          model,
          accountId
        )
      } else if (accountId) {
        // 如果没有 API Key，直接记录账户级别统计
        await redis.incrementAccountUsage(
          accountId,
          totalTokens,
          inputTokens,
          outputTokens,
          0, // cacheCreateTokens
          0, // cacheReadTokens
          model,
          false // isLongContextRequest
        )
      } else {
        logger.warn('⚠️ 无法记录 Qwen usage：缺少 API Key 和账户标识')
        return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      }

      logger.debug(
        `📊 Qwen usage recorded - Account: ${account.name}, Model: ${model}, Input: ${inputTokens}, Output: ${outputTokens}, Total: ${totalTokens}`
      )

      return { inputTokens, outputTokens, totalTokens }
    } catch (error) {
      logger.error('❌ Failed to record Qwen usage:', error)
      return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    }
  }

  /**
   * 处理上游错误
   */
  async _handleUpstreamError(statusCode, errorData, account, sessionHash) {
    const errorCode = errorData?.error?.code || ''
    const errorMessage = errorData?.error?.message || JSON.stringify(errorData)

    logger.error(`❌ Qwen API error ${statusCode}: ${errorMessage}`)

    // 401 - Token 过期或无效
    if (statusCode === 401 || errorCode === 'invalid_api_key') {
      try {
        logger.warn(`🔄 Qwen token expired for account ${account.id}, attempting refresh...`)
        await qwenAccountService.refreshAccessToken(account.id)
        // 刷新成功后可以重试
        return { shouldRetry: true }
      } catch (refreshError) {
        logger.error(`❌ Failed to refresh Qwen token for account ${account.id}:`, refreshError)
        await qwenScheduler.markAccountUnauthorized(account.id, sessionHash)
        return { shouldRetry: false }
      }
    }

    // 429 - 速率限制
    if (statusCode === 429 || errorCode === 'rate_limit_exceeded') {
      await qwenScheduler.markAccountRateLimited(account.id, sessionHash)
      return { shouldRetry: false }
    }

    // 其他错误
    if (statusCode >= 500) {
      await qwenScheduler.markAccountError(account.id, errorMessage)
    }

    return { shouldRetry: false }
  }

  /**
   * 非流式请求转发
   */
  async relayNonStreamRequest(
    requestBody,
    apiKeyData,
    clientRequest,
    clientResponse,
    options = {}
  ) {
    const { sessionHash = null, skipUsageRecord = false } = options
    let account = null

    try {
      // 1. 选择账户
      account = await qwenScheduler.selectAccount(apiKeyData, sessionHash)
      if (!account) {
        throw new Error('No available Qwen accounts')
      }

      const { accessToken } = account
      if (!accessToken) {
        throw new Error(`Qwen account ${account.id} has no access token`)
      }

      logger.info(
        `📤 Qwen non-stream request - Account: ${account.name}, Model: ${requestBody.model || 'default'}`
      )

      // 2. 准备请求
      const proxyAgent = account.proxy ? ProxyHelper.createProxyAgent(account.proxy) : null

      const requestOptions = {
        method: 'POST',
        url: `${this.qwenApiBaseUrl}${this.qwenApiPath}`,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'claude-relay-service/1.0'
        },
        data: {
          ...requestBody,
          stream: false
        },
        timeout: 120000,
        ...(proxyAgent && {
          httpAgent: proxyAgent,
          httpsAgent: proxyAgent,
          proxy: false
        })
      }

      // 3. 发送请求
      const response = await axios(requestOptions)

      // 4. 处理响应
      if (response.status !== 200) {
        throw new Error(`Qwen API returned status ${response.status}`)
      }

      const responseData = response.data

      // 5. 记录使用统计
      if (!skipUsageRecord && responseData.usage) {
        const normalizedUsage = await this._recordUsage(
          responseData.usage,
          apiKeyData,
          account,
          requestBody.model || 'unknown'
        )

        await this._applyRateLimitTracking(
          clientRequest?.rateLimitInfo,
          {
            inputTokens: normalizedUsage.inputTokens,
            outputTokens: normalizedUsage.outputTokens
          },
          requestBody.model || 'unknown'
        )
      }

      // 6. 返回响应
      clientResponse.json(responseData)

      logger.success(`✅ Qwen non-stream completed - Account: ${account.name}`)
    } catch (error) {
      logger.error('❌ Qwen non-stream request failed:', error)

      // 处理 Axios 错误
      if (error.response) {
        const { status, data } = error.response
        if (account) {
          const { shouldRetry } = await this._handleUpstreamError(
            status,
            data,
            account,
            sessionHash
          )
          if (shouldRetry && !options.retried) {
            // 重试一次
            return this.relayNonStreamRequest(
              requestBody,
              apiKeyData,
              clientRequest,
              clientResponse,
              {
                ...options,
                retried: true
              }
            )
          }
        }

        if (!clientResponse.headersSent) {
          clientResponse.status(status).json(data || { error: 'Qwen API error' })
        }
      } else {
        if (!clientResponse.headersSent) {
          clientResponse.status(500).json({
            error: {
              message: error.message || 'Internal server error',
              type: 'server_error'
            }
          })
        }
      }
    }
  }

  /**
   * 流式请求转发
   */
  async relayStreamRequest(requestBody, apiKeyData, clientRequest, clientResponse, options = {}) {
    const { sessionHash = null, skipUsageRecord = false } = options
    let account = null
    let responseCompleted = false

    try {
      // 1. 选择账户
      account = await qwenScheduler.selectAccount(apiKeyData, sessionHash)
      if (!account) {
        throw new Error('No available Qwen accounts')
      }

      const { accessToken } = account
      if (!accessToken) {
        throw new Error(`Qwen account ${account.id} has no access token`)
      }

      logger.info(
        `📤 Qwen stream request - Account: ${account.name}, Model: ${requestBody.model || 'default'}`
      )

      // 2. 准备代理
      const proxyAgent = account.proxy ? ProxyHelper.createProxyAgent(account.proxy) : null

      // 3. 准备请求体
      const bodyString = JSON.stringify({
        ...requestBody,
        stream: true
      })

      // 4. 创建 HTTPS 请求
      const requestOptions = {
        method: 'POST',
        hostname: 'portal.qwen.ai',
        path: this.qwenApiPath,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyString),
          'User-Agent': 'claude-relay-service/1.0'
        },
        timeout: 120000,
        ...(proxyAgent && { agent: proxyAgent })
      }

      return new Promise((resolve, reject) => {
        let settled = false
        const resolveOnce = (value) => {
          if (settled) {
            return
          }
          settled = true
          resolve(value)
        }

        const handleStreamError = (error) => {
          if (settled) {
            return
          }
          settled = true

          logger.error('❌ Qwen stream error:', error)

          if (!clientResponse.headersSent) {
            clientResponse.status(500).json({
              error: {
                message: error.message || 'Stream error',
                type: 'server_error'
              }
            })
          } else if (!clientResponse.writableEnded) {
            clientResponse.end()
          }

          reject(error)
        }

        const req = https.request(requestOptions, (res) => {
          logger.info(`✅ Qwen stream response status: ${res.statusCode}`)

          // 错误响应
          if (res.statusCode !== 200) {
            const chunks = []

            res.on('data', (chunk) => {
              chunks.push(chunk)
            })

            res.on('end', async () => {
              const body = Buffer.concat(chunks).toString()
              logger.error(`❌ Qwen error response: ${body}`)

              try {
                const { data: errorData } = { data: JSON.parse(body) }
                if (account) {
                  const { shouldRetry } = await this._handleUpstreamError(
                    res.statusCode,
                    errorData,
                    account,
                    sessionHash
                  )

                  if (shouldRetry && !options.retried) {
                    // 重试一次
                    return this.relayStreamRequest(
                      requestBody,
                      apiKeyData,
                      clientRequest,
                      clientResponse,
                      {
                        ...options,
                        retried: true
                      }
                    )
                  }
                }
              } catch (parseError) {
                // 忽略 JSON 解析错误
              }

              if (!clientResponse.headersSent) {
                clientResponse.status(res.statusCode).json({
                  error: 'upstream_error',
                  details: body
                })
              }
              resolveOnce({ statusCode: res.statusCode, streaming: true })
            })

            res.on('error', handleStreamError)
            return
          }

          // 设置流式响应头
          clientResponse.setHeader('Content-Type', 'text/event-stream')
          clientResponse.setHeader('Cache-Control', 'no-cache')
          clientResponse.setHeader('Connection', 'keep-alive')

          // Usage 数据收集
          let buffer = ''
          const currentUsageData = {}

          // 处理 SSE 流
          res.on('data', (chunk) => {
            const chunkStr = chunk.toString()

            // 转发数据到客户端
            clientResponse.write(chunk)

            // 解析 usage 数据
            buffer += chunkStr
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // 保留最后一行（可能不完整）

            for (const line of lines) {
              if (line.startsWith('data: ') && line.length > 6) {
                try {
                  const jsonStr = line.slice(6)
                  if (jsonStr === '[DONE]') {
                    responseCompleted = true
                    continue
                  }

                  const data = JSON.parse(jsonStr)

                  // OpenAI 格式的 usage
                  if (data.usage) {
                    currentUsageData.prompt_tokens = data.usage.prompt_tokens || 0
                    currentUsageData.completion_tokens = data.usage.completion_tokens || 0
                    currentUsageData.total_tokens =
                      data.usage.total_tokens ||
                      currentUsageData.prompt_tokens + currentUsageData.completion_tokens
                  }
                } catch (parseError) {
                  // 忽略解析错误
                }
              }
            }
          })

          res.on('end', async () => {
            responseCompleted = true
            clientResponse.end()

            // 记录 usage 数据
            if (!skipUsageRecord && Object.keys(currentUsageData).length > 0) {
              const normalizedUsage = await this._recordUsage(
                currentUsageData,
                apiKeyData,
                account,
                requestBody.model || 'unknown'
              )

              await this._applyRateLimitTracking(
                clientRequest?.rateLimitInfo,
                {
                  inputTokens: normalizedUsage.inputTokens,
                  outputTokens: normalizedUsage.outputTokens
                },
                requestBody.model || 'unknown',
                ' [stream]'
              )

              logger.success(`✅ Qwen stream completed - Account: ${account.name}`)
            } else {
              logger.success(
                `✅ Qwen stream completed - Account: ${account.name}, usage recording skipped`
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
            req.destroy(new Error('Client disconnected'))
          }
        })

        req.on('error', handleStreamError)

        req.on('timeout', () => {
          req.destroy()
          logger.error('❌ Qwen request timeout')
          handleStreamError(new Error('Request timeout'))
        })

        // 写入请求体
        req.end(bodyString)
      })
    } catch (error) {
      logger.error('❌ Qwen stream request failed:', error)

      if (!clientResponse.headersSent) {
        clientResponse.status(500).json({
          error: {
            message: error.message || 'Internal server error',
            type: 'server_error'
          }
        })
      }
    }
  }

  /**
   * 主要的请求转发入口
   */
  async relayRequest(requestBody, apiKeyData, clientRequest, clientResponse, options = {}) {
    const isStream = requestBody.stream === true

    if (isStream) {
      return this.relayStreamRequest(
        requestBody,
        apiKeyData,
        clientRequest,
        clientResponse,
        options
      )
    } else {
      return this.relayNonStreamRequest(
        requestBody,
        apiKeyData,
        clientRequest,
        clientResponse,
        options
      )
    }
  }
}

module.exports = new QwenRelayService()
