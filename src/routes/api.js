const express = require('express')
const claudeRelayService = require('../services/claudeRelayService')
const claudeConsoleRelayService = require('../services/claudeConsoleRelayService')
const bedrockRelayService = require('../services/bedrockRelayService')
const bedrockAccountService = require('../services/bedrockAccountService')
const unifiedClaudeScheduler = require('../services/unifiedClaudeScheduler')
const apiKeyService = require('../services/apiKeyService')
const pricingService = require('../services/pricingService')
const { authenticateApiKey } = require('../middleware/auth')
const logger = require('../utils/logger')
const redis = require('../models/redis')
const sessionHelper = require('../utils/sessionHelper')
const openaiToClaude = require('../services/openaiToClaude')
const claudeCodeHeadersService = require('../services/claudeCodeHeadersService')

const router = express.Router()

// 🔍 检测模型对应的后端服务
function detectBackendFromModel(modelName) {
  if (!modelName) {
    return 'claude'
  }
  if (modelName.startsWith('claude-')) {
    return 'claude'
  }
  if (modelName.startsWith('gpt-')) {
    return 'openai'
  }
  if (modelName.startsWith('gemini-')) {
    return 'gemini'
  }
  return 'claude' // 默认使用 Claude
}

// 🔧 共享的消息处理函数
async function handleMessagesRequest(req, res) {
  try {
    const startTime = Date.now()

    // 严格的输入验证
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Request body must be a valid JSON object'
      })
    }

    if (!req.body.messages || !Array.isArray(req.body.messages)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Missing or invalid field: messages (must be an array)'
      })
    }

    if (req.body.messages.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Messages array cannot be empty'
      })
    }

    // 检查是否为流式请求
    const isStream = req.body.stream === true

    logger.api(
      `🚀 Processing ${isStream ? 'stream' : 'non-stream'} request for key: ${req.apiKey.name}`
    )

    if (isStream) {
      // 流式响应 - 只使用官方真实usage数据
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('X-Accel-Buffering', 'no') // 禁用 Nginx 缓冲

      // 禁用 Nagle 算法，确保数据立即发送
      if (res.socket && typeof res.socket.setNoDelay === 'function') {
        res.socket.setNoDelay(true)
      }

      // 流式响应不需要额外处理，中间件已经设置了监听器

      let usageDataCaptured = false

      // 生成会话哈希用于sticky会话
      const sessionHash = sessionHelper.generateSessionHash(req.body)

      // 使用统一调度选择账号（传递请求的模型）
      const requestedModel = req.body.model
      const { accountId, accountType } = await unifiedClaudeScheduler.selectAccountForApiKey(
        req.apiKey,
        sessionHash,
        requestedModel
      )

      // 根据账号类型选择对应的转发服务并调用
      if (accountType === 'claude-official') {
        // 官方Claude账号使用原有的转发服务（会自己选择账号）
        await claudeRelayService.relayStreamRequestWithUsageCapture(
          req.body,
          req.apiKey,
          res,
          req.headers,
          (usageData) => {
            // 回调函数：当检测到完整usage数据时记录真实token使用量
            logger.info(
              '🎯 Usage callback triggered with complete data:',
              JSON.stringify(usageData, null, 2)
            )

            if (
              usageData &&
              usageData.input_tokens !== undefined &&
              usageData.output_tokens !== undefined
            ) {
              const inputTokens = usageData.input_tokens || 0
              const outputTokens = usageData.output_tokens || 0
              // 兼容处理：如果有详细的 cache_creation 对象，使用它；否则使用总的 cache_creation_input_tokens
              let cacheCreateTokens = usageData.cache_creation_input_tokens || 0
              let ephemeral5mTokens = 0
              let ephemeral1hTokens = 0

              if (usageData.cache_creation && typeof usageData.cache_creation === 'object') {
                ephemeral5mTokens = usageData.cache_creation.ephemeral_5m_input_tokens || 0
                ephemeral1hTokens = usageData.cache_creation.ephemeral_1h_input_tokens || 0
                // 总的缓存创建 tokens 是两者之和
                cacheCreateTokens = ephemeral5mTokens + ephemeral1hTokens
              }

              const cacheReadTokens = usageData.cache_read_input_tokens || 0
              const model = usageData.model || 'unknown'

              // 记录真实的token使用量（包含模型信息和所有4种token以及账户ID）
              const { accountId: usageAccountId } = usageData

              // 构建 usage 对象以传递给 recordUsage
              const usageObject = {
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                cache_creation_input_tokens: cacheCreateTokens,
                cache_read_input_tokens: cacheReadTokens
              }

              // 如果有详细的缓存创建数据，添加到 usage 对象中
              if (ephemeral5mTokens > 0 || ephemeral1hTokens > 0) {
                usageObject.cache_creation = {
                  ephemeral_5m_input_tokens: ephemeral5mTokens,
                  ephemeral_1h_input_tokens: ephemeral1hTokens
                }
              }

              apiKeyService
                .recordUsageWithDetails(req.apiKey.id, usageObject, model, usageAccountId, 'claude')
                .catch((error) => {
                  logger.error('❌ Failed to record stream usage:', error)
                })

              // 更新时间窗口内的token计数和费用
              if (req.rateLimitInfo) {
                const totalTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

                // 更新Token计数（向后兼容）
                redis
                  .getClient()
                  .incrby(req.rateLimitInfo.tokenCountKey, totalTokens)
                  .catch((error) => {
                    logger.error('❌ Failed to update rate limit token count:', error)
                  })
                logger.api(`📊 Updated rate limit token count: +${totalTokens} tokens`)

                // 计算并更新费用计数（新功能）
                if (req.rateLimitInfo.costCountKey) {
                  const costInfo = pricingService.calculateCost(usageData, model)
                  if (costInfo.totalCost > 0) {
                    redis
                      .getClient()
                      .incrbyfloat(req.rateLimitInfo.costCountKey, costInfo.totalCost)
                      .catch((error) => {
                        logger.error('❌ Failed to update rate limit cost count:', error)
                      })
                    logger.api(
                      `💰 Updated rate limit cost count: +$${costInfo.totalCost.toFixed(6)}`
                    )
                  }
                }
              }

              usageDataCaptured = true
              logger.api(
                `📊 Stream usage recorded (real) - Model: ${model}, Input: ${inputTokens}, Output: ${outputTokens}, Cache Create: ${cacheCreateTokens}, Cache Read: ${cacheReadTokens}, Total: ${inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens} tokens`
              )
            } else {
              logger.warn(
                '⚠️ Usage callback triggered but data is incomplete:',
                JSON.stringify(usageData)
              )
            }
          }
        )
      } else if (accountType === 'claude-console') {
        // Claude Console账号使用Console转发服务（需要传递accountId）
        await claudeConsoleRelayService.relayStreamRequestWithUsageCapture(
          req.body,
          req.apiKey,
          res,
          req.headers,
          (usageData) => {
            // 回调函数：当检测到完整usage数据时记录真实token使用量
            logger.info(
              '🎯 Usage callback triggered with complete data:',
              JSON.stringify(usageData, null, 2)
            )

            if (
              usageData &&
              usageData.input_tokens !== undefined &&
              usageData.output_tokens !== undefined
            ) {
              const inputTokens = usageData.input_tokens || 0
              const outputTokens = usageData.output_tokens || 0
              // 兼容处理：如果有详细的 cache_creation 对象，使用它；否则使用总的 cache_creation_input_tokens
              let cacheCreateTokens = usageData.cache_creation_input_tokens || 0
              let ephemeral5mTokens = 0
              let ephemeral1hTokens = 0

              if (usageData.cache_creation && typeof usageData.cache_creation === 'object') {
                ephemeral5mTokens = usageData.cache_creation.ephemeral_5m_input_tokens || 0
                ephemeral1hTokens = usageData.cache_creation.ephemeral_1h_input_tokens || 0
                // 总的缓存创建 tokens 是两者之和
                cacheCreateTokens = ephemeral5mTokens + ephemeral1hTokens
              }

              const cacheReadTokens = usageData.cache_read_input_tokens || 0
              const model = usageData.model || 'unknown'

              // 记录真实的token使用量（包含模型信息和所有4种token以及账户ID）
              const usageAccountId = usageData.accountId

              // 构建 usage 对象以传递给 recordUsage
              const usageObject = {
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                cache_creation_input_tokens: cacheCreateTokens,
                cache_read_input_tokens: cacheReadTokens
              }

              // 如果有详细的缓存创建数据，添加到 usage 对象中
              if (ephemeral5mTokens > 0 || ephemeral1hTokens > 0) {
                usageObject.cache_creation = {
                  ephemeral_5m_input_tokens: ephemeral5mTokens,
                  ephemeral_1h_input_tokens: ephemeral1hTokens
                }
              }

              apiKeyService
                .recordUsageWithDetails(
                  req.apiKey.id,
                  usageObject,
                  model,
                  usageAccountId,
                  'claude-console'
                )
                .catch((error) => {
                  logger.error('❌ Failed to record stream usage:', error)
                })

              // 更新时间窗口内的token计数和费用
              if (req.rateLimitInfo) {
                const totalTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

                // 更新Token计数（向后兼容）
                redis
                  .getClient()
                  .incrby(req.rateLimitInfo.tokenCountKey, totalTokens)
                  .catch((error) => {
                    logger.error('❌ Failed to update rate limit token count:', error)
                  })
                logger.api(`📊 Updated rate limit token count: +${totalTokens} tokens`)

                // 计算并更新费用计数（新功能）
                if (req.rateLimitInfo.costCountKey) {
                  const costInfo = pricingService.calculateCost(usageData, model)
                  if (costInfo.totalCost > 0) {
                    redis
                      .getClient()
                      .incrbyfloat(req.rateLimitInfo.costCountKey, costInfo.totalCost)
                      .catch((error) => {
                        logger.error('❌ Failed to update rate limit cost count:', error)
                      })
                    logger.api(
                      `💰 Updated rate limit cost count: +$${costInfo.totalCost.toFixed(6)}`
                    )
                  }
                }
              }

              usageDataCaptured = true
              logger.api(
                `📊 Stream usage recorded (real) - Model: ${model}, Input: ${inputTokens}, Output: ${outputTokens}, Cache Create: ${cacheCreateTokens}, Cache Read: ${cacheReadTokens}, Total: ${inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens} tokens`
              )
            } else {
              logger.warn(
                '⚠️ Usage callback triggered but data is incomplete:',
                JSON.stringify(usageData)
              )
            }
          },
          accountId
        )
      } else if (accountType === 'bedrock') {
        // Bedrock账号使用Bedrock转发服务
        try {
          const bedrockAccountResult = await bedrockAccountService.getAccount(accountId)
          if (!bedrockAccountResult.success) {
            throw new Error('Failed to get Bedrock account details')
          }

          const result = await bedrockRelayService.handleStreamRequest(
            req.body,
            bedrockAccountResult.data,
            res
          )

          // 记录Bedrock使用统计
          if (result.usage) {
            const inputTokens = result.usage.input_tokens || 0
            const outputTokens = result.usage.output_tokens || 0

            apiKeyService
              .recordUsage(req.apiKey.id, inputTokens, outputTokens, 0, 0, result.model, accountId)
              .catch((error) => {
                logger.error('❌ Failed to record Bedrock stream usage:', error)
              })

            // 更新时间窗口内的token计数和费用
            if (req.rateLimitInfo) {
              const totalTokens = inputTokens + outputTokens

              // 更新Token计数（向后兼容）
              redis
                .getClient()
                .incrby(req.rateLimitInfo.tokenCountKey, totalTokens)
                .catch((error) => {
                  logger.error('❌ Failed to update rate limit token count:', error)
                })
              logger.api(`📊 Updated rate limit token count: +${totalTokens} tokens`)

              // 计算并更新费用计数（新功能）
              if (req.rateLimitInfo.costCountKey) {
                const costInfo = pricingService.calculateCost(result.usage, result.model)
                if (costInfo.totalCost > 0) {
                  redis
                    .getClient()
                    .incrbyfloat(req.rateLimitInfo.costCountKey, costInfo.totalCost)
                    .catch((error) => {
                      logger.error('❌ Failed to update rate limit cost count:', error)
                    })
                  logger.api(`💰 Updated rate limit cost count: +$${costInfo.totalCost.toFixed(6)}`)
                }
              }
            }

            usageDataCaptured = true
            logger.api(
              `📊 Bedrock stream usage recorded - Model: ${result.model}, Input: ${inputTokens}, Output: ${outputTokens}, Total: ${inputTokens + outputTokens} tokens`
            )
          }
        } catch (error) {
          logger.error('❌ Bedrock stream request failed:', error)
          if (!res.headersSent) {
            return res.status(500).json({ error: 'Bedrock service error', message: error.message })
          }
          return undefined
        }
      }

      // 流式请求完成后 - 如果没有捕获到usage数据，记录警告但不进行估算
      setTimeout(() => {
        if (!usageDataCaptured) {
          logger.warn(
            '⚠️ No usage data captured from SSE stream - no statistics recorded (official data only)'
          )
        }
      }, 1000) // 1秒后检查
    } else {
      // 非流式响应 - 只使用官方真实usage数据
      logger.info('📄 Starting non-streaming request', {
        apiKeyId: req.apiKey.id,
        apiKeyName: req.apiKey.name
      })

      // 生成会话哈希用于sticky会话
      const sessionHash = sessionHelper.generateSessionHash(req.body)

      // 使用统一调度选择账号（传递请求的模型）
      const requestedModel = req.body.model
      const { accountId, accountType } = await unifiedClaudeScheduler.selectAccountForApiKey(
        req.apiKey,
        sessionHash,
        requestedModel
      )

      // 根据账号类型选择对应的转发服务
      let response
      logger.debug(`[DEBUG] Request query params: ${JSON.stringify(req.query)}`)
      logger.debug(`[DEBUG] Request URL: ${req.url}`)
      logger.debug(`[DEBUG] Request path: ${req.path}`)

      if (accountType === 'claude-official') {
        // 官方Claude账号使用原有的转发服务
        response = await claudeRelayService.relayRequest(
          req.body,
          req.apiKey,
          req,
          res,
          req.headers
        )
      } else if (accountType === 'claude-console') {
        // Claude Console账号使用Console转发服务
        logger.debug(
          `[DEBUG] Calling claudeConsoleRelayService.relayRequest with accountId: ${accountId}`
        )
        response = await claudeConsoleRelayService.relayRequest(
          req.body,
          req.apiKey,
          req,
          res,
          req.headers,
          accountId
        )
      } else if (accountType === 'bedrock') {
        // Bedrock账号使用Bedrock转发服务
        try {
          const bedrockAccountResult = await bedrockAccountService.getAccount(accountId)
          if (!bedrockAccountResult.success) {
            throw new Error('Failed to get Bedrock account details')
          }

          const result = await bedrockRelayService.handleNonStreamRequest(
            req.body,
            bedrockAccountResult.data,
            req.headers
          )

          // 构建标准响应格式
          response = {
            statusCode: result.success ? 200 : 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.success ? result.data : { error: result.error }),
            accountId
          }

          // 如果成功，添加使用统计到响应数据中
          if (result.success && result.usage) {
            const responseData = JSON.parse(response.body)
            responseData.usage = result.usage
            response.body = JSON.stringify(responseData)
          }
        } catch (error) {
          logger.error('❌ Bedrock non-stream request failed:', error)
          response = {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Bedrock service error', message: error.message }),
            accountId
          }
        }
      }

      logger.info('📡 Claude API response received', {
        statusCode: response.statusCode,
        headers: JSON.stringify(response.headers),
        bodyLength: response.body ? response.body.length : 0
      })

      res.status(response.statusCode)

      // 设置响应头，避免 Content-Length 和 Transfer-Encoding 冲突
      const skipHeaders = ['content-encoding', 'transfer-encoding', 'content-length']
      Object.keys(response.headers).forEach((key) => {
        if (!skipHeaders.includes(key.toLowerCase())) {
          res.setHeader(key, response.headers[key])
        }
      })

      let usageRecorded = false

      // 尝试解析JSON响应并提取usage信息
      try {
        const jsonData = JSON.parse(response.body)

        logger.info('📊 Parsed Claude API response:', JSON.stringify(jsonData, null, 2))

        // 从Claude API响应中提取usage信息（完整的token分类体系）
        if (
          jsonData.usage &&
          jsonData.usage.input_tokens !== undefined &&
          jsonData.usage.output_tokens !== undefined
        ) {
          const inputTokens = jsonData.usage.input_tokens || 0
          const outputTokens = jsonData.usage.output_tokens || 0
          const cacheCreateTokens = jsonData.usage.cache_creation_input_tokens || 0
          const cacheReadTokens = jsonData.usage.cache_read_input_tokens || 0
          const model = jsonData.model || req.body.model || 'unknown'

          // 记录真实的token使用量（包含模型信息和所有4种token以及账户ID）
          const { accountId: responseAccountId } = response
          await apiKeyService.recordUsage(
            req.apiKey.id,
            inputTokens,
            outputTokens,
            cacheCreateTokens,
            cacheReadTokens,
            model,
            responseAccountId
          )

          // 更新时间窗口内的token计数和费用
          if (req.rateLimitInfo) {
            const totalTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

            // 更新Token计数（向后兼容）
            await redis.getClient().incrby(req.rateLimitInfo.tokenCountKey, totalTokens)
            logger.api(`📊 Updated rate limit token count: +${totalTokens} tokens`)

            // 计算并更新费用计数（新功能）
            if (req.rateLimitInfo.costCountKey) {
              const costInfo = pricingService.calculateCost(jsonData.usage, model)
              if (costInfo.totalCost > 0) {
                await redis
                  .getClient()
                  .incrbyfloat(req.rateLimitInfo.costCountKey, costInfo.totalCost)
                logger.api(`💰 Updated rate limit cost count: +$${costInfo.totalCost.toFixed(6)}`)
              }
            }
          }

          usageRecorded = true
          logger.api(
            `📊 Non-stream usage recorded (real) - Model: ${model}, Input: ${inputTokens}, Output: ${outputTokens}, Cache Create: ${cacheCreateTokens}, Cache Read: ${cacheReadTokens}, Total: ${inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens} tokens`
          )
        } else {
          logger.warn('⚠️ No usage data found in Claude API JSON response')
        }

        res.json(jsonData)
      } catch (parseError) {
        logger.warn('⚠️ Failed to parse Claude API response as JSON:', parseError.message)
        logger.info('📄 Raw response body:', response.body)
        res.send(response.body)
      }

      // 如果没有记录usage，只记录警告，不进行估算
      if (!usageRecorded) {
        logger.warn(
          '⚠️ No usage data recorded for non-stream request - no statistics recorded (official data only)'
        )
      }
    }

    const duration = Date.now() - startTime
    logger.api(`✅ Request completed in ${duration}ms for key: ${req.apiKey.name}`)
    return undefined
  } catch (error) {
    logger.error('❌ Claude relay error:', error.message, {
      code: error.code,
      stack: error.stack
    })

    // 确保在任何情况下都能返回有效的JSON响应
    if (!res.headersSent) {
      // 根据错误类型设置适当的状态码
      let statusCode = 500
      let errorType = 'Relay service error'

      if (error.message.includes('Connection reset') || error.message.includes('socket hang up')) {
        statusCode = 502
        errorType = 'Upstream connection error'
      } else if (error.message.includes('Connection refused')) {
        statusCode = 502
        errorType = 'Upstream service unavailable'
      } else if (error.message.includes('timeout')) {
        statusCode = 504
        errorType = 'Upstream timeout'
      } else if (error.message.includes('resolve') || error.message.includes('ENOTFOUND')) {
        statusCode = 502
        errorType = 'Upstream hostname resolution failed'
      }

      return res.status(statusCode).json({
        error: errorType,
        message: error.message || 'An unexpected error occurred',
        timestamp: new Date().toISOString()
      })
    } else {
      // 如果响应头已经发送，尝试结束响应
      if (!res.destroyed && !res.finished) {
        res.end()
      }
      return undefined
    }
  }
}

// 🚀 Claude API messages 端点 - /api/v1/messages
router.post('/v1/messages', authenticateApiKey, handleMessagesRequest)

// 🚀 Claude API messages 端点 - /claude/v1/messages (别名)
router.post('/claude/v1/messages', authenticateApiKey, handleMessagesRequest)

// 📋 模型列表端点 - OpenAI 兼容，返回所有支持的模型
router.get('/v1/models', authenticateApiKey, async (req, res) => {
  try {
    // 返回支持的模型列表（Claude + OpenAI + Gemini）
    const models = [
      // Claude 模型
      {
        id: 'claude-sonnet-4-5-20250929',
        object: 'model',
        created: 1669599635,
        owned_by: 'anthropic'
      },
      {
        id: 'claude-opus-4-1-20250805',
        object: 'model',
        created: 1669599635,
        owned_by: 'anthropic'
      },
      {
        id: 'claude-sonnet-4-20250514',
        object: 'model',
        created: 1669599635,
        owned_by: 'anthropic'
      },
      {
        id: 'claude-opus-4-20250514',
        object: 'model',
        created: 1669599635,
        owned_by: 'anthropic'
      },
      {
        id: 'claude-3-7-sonnet-20250219',
        object: 'model',
        created: 1669599635,
        owned_by: 'anthropic'
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        object: 'model',
        created: 1729036800,
        owned_by: 'anthropic'
      },
      {
        id: 'claude-3-5-haiku-20241022',
        object: 'model',
        created: 1729036800,
        owned_by: 'anthropic'
      },
      {
        id: 'claude-3-haiku-20240307',
        object: 'model',
        created: 1709251200,
        owned_by: 'anthropic'
      },
      {
        id: 'claude-3-opus-20240229',
        object: 'model',
        created: 1736726400,
        owned_by: 'anthropic'
      },
      {
        id: 'claude-opus-4-20250514',
        object: 'model',
        created: 1736726400,
        owned_by: 'anthropic'
      },
      // OpenAI 模型
      {
        id: 'gpt-4o',
        object: 'model',
        created: 1715367600,
        owned_by: 'openai'
      },
      {
        id: 'gpt-4o-mini',
        object: 'model',
        created: 1721088000,
        owned_by: 'openai'
      },
      {
        id: 'gpt-4-turbo',
        object: 'model',
        created: 1712102400,
        owned_by: 'openai'
      },
      {
        id: 'gpt-4',
        object: 'model',
        created: 1687132800,
        owned_by: 'openai'
      },
      {
        id: 'gpt-3.5-turbo',
        object: 'model',
        created: 1677649200,
        owned_by: 'openai'
      },
      // Gemini 模型
      {
        id: 'gemini-1.5-pro',
        object: 'model',
        created: 1707868800,
        owned_by: 'google'
      },
      {
        id: 'gemini-1.5-flash',
        object: 'model',
        created: 1715990400,
        owned_by: 'google'
      },
      {
        id: 'gemini-2.0-flash-exp',
        object: 'model',
        created: 1733011200,
        owned_by: 'google'
      }
    ]

    res.json({
      object: 'list',
      data: models
    })
  } catch (error) {
    logger.error('❌ Models list error:', error)
    res.status(500).json({
      error: 'Failed to get models list',
      message: error.message
    })
  }
})

// 🏥 健康检查端点
router.get('/health', async (req, res) => {
  try {
    const healthStatus = await claudeRelayService.healthCheck()

    res.status(healthStatus.healthy ? 200 : 503).json({
      status: healthStatus.healthy ? 'healthy' : 'unhealthy',
      service: 'claude-relay-service',
      version: '1.0.0',
      ...healthStatus
    })
  } catch (error) {
    logger.error('❌ Health check error:', error)
    res.status(503).json({
      status: 'unhealthy',
      service: 'claude-relay-service',
      error: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

// 📊 API Key状态检查端点 - /api/v1/key-info
router.get('/v1/key-info', authenticateApiKey, async (req, res) => {
  try {
    const usage = await apiKeyService.getUsageStats(req.apiKey.id)

    res.json({
      keyInfo: {
        id: req.apiKey.id,
        name: req.apiKey.name,
        tokenLimit: req.apiKey.tokenLimit,
        usage
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ Key info error:', error)
    res.status(500).json({
      error: 'Failed to get key info',
      message: error.message
    })
  }
})

// 📈 使用统计端点 - /api/v1/usage
router.get('/v1/usage', authenticateApiKey, async (req, res) => {
  try {
    const usage = await apiKeyService.getUsageStats(req.apiKey.id)

    res.json({
      usage,
      limits: {
        tokens: req.apiKey.tokenLimit,
        requests: 0 // 请求限制已移除
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ Usage stats error:', error)
    res.status(500).json({
      error: 'Failed to get usage stats',
      message: error.message
    })
  }
})

// 👤 用户信息端点 - Claude Code 客户端需要
router.get('/v1/me', authenticateApiKey, async (req, res) => {
  try {
    // 返回基础用户信息
    res.json({
      id: `user_${req.apiKey.id}`,
      type: 'user',
      display_name: req.apiKey.name || 'API User',
      created_at: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ User info error:', error)
    res.status(500).json({
      error: 'Failed to get user info',
      message: error.message
    })
  }
})

// 💰 余额/限制端点 - Claude Code 客户端需要
router.get('/v1/organizations/:org_id/usage', authenticateApiKey, async (req, res) => {
  try {
    const usage = await apiKeyService.getUsageStats(req.apiKey.id)

    res.json({
      object: 'usage',
      data: [
        {
          type: 'credit_balance',
          credit_balance: req.apiKey.tokenLimit - (usage.totalTokens || 0)
        }
      ]
    })
  } catch (error) {
    logger.error('❌ Organization usage error:', error)
    res.status(500).json({
      error: 'Failed to get usage info',
      message: error.message
    })
  }
})

// 🔢 Token计数端点 - count_tokens beta API
router.post('/v1/messages/count_tokens', authenticateApiKey, async (req, res) => {
  try {
    // 检查权限
    if (
      req.apiKey.permissions &&
      req.apiKey.permissions !== 'all' &&
      req.apiKey.permissions !== 'claude'
    ) {
      return res.status(403).json({
        error: {
          type: 'permission_error',
          message: 'This API key does not have permission to access Claude'
        }
      })
    }

    logger.info(`🔢 Processing token count request for key: ${req.apiKey.name}`)

    // 生成会话哈希用于sticky会话
    const sessionHash = sessionHelper.generateSessionHash(req.body)

    // 选择可用的Claude账户
    const requestedModel = req.body.model
    const { accountId, accountType } = await unifiedClaudeScheduler.selectAccountForApiKey(
      req.apiKey,
      sessionHash,
      requestedModel
    )

    let response
    if (accountType === 'claude-official') {
      // 使用官方Claude账号转发count_tokens请求
      response = await claudeRelayService.relayRequest(
        req.body,
        req.apiKey,
        req,
        res,
        req.headers,
        {
          skipUsageRecord: true, // 跳过usage记录，这只是计数请求
          customPath: '/v1/messages/count_tokens' // 指定count_tokens路径
        }
      )
    } else if (accountType === 'claude-console') {
      // 使用Console Claude账号转发count_tokens请求
      response = await claudeConsoleRelayService.relayRequest(
        req.body,
        req.apiKey,
        req,
        res,
        req.headers,
        accountId,
        {
          skipUsageRecord: true, // 跳过usage记录，这只是计数请求
          customPath: '/v1/messages/count_tokens' // 指定count_tokens路径
        }
      )
    } else {
      // Bedrock不支持count_tokens
      return res.status(501).json({
        error: {
          type: 'not_supported',
          message: 'Token counting is not supported for Bedrock accounts'
        }
      })
    }

    // 直接返回响应，不记录token使用量
    res.status(response.statusCode)

    // 设置响应头
    const skipHeaders = ['content-encoding', 'transfer-encoding', 'content-length']
    Object.keys(response.headers).forEach((key) => {
      if (!skipHeaders.includes(key.toLowerCase())) {
        res.setHeader(key, response.headers[key])
      }
    })

    // 尝试解析并返回JSON响应
    try {
      const jsonData = JSON.parse(response.body)
      res.json(jsonData)
    } catch (parseError) {
      res.send(response.body)
    }

    logger.info(`✅ Token count request completed for key: ${req.apiKey.name}`)
  } catch (error) {
    logger.error('❌ Token count error:', error)
    res.status(500).json({
      error: {
        type: 'server_error',
        message: 'Failed to count tokens'
      }
    })
  }
})

// 🚀 OpenAI 兼容的 chat/completions 处理器（智能路由）
async function handleChatCompletions(req, res) {
  const startTime = Date.now()
  let abortController = null

  try {
    const apiKeyData = req.apiKey

    // 验证必需参数
    if (!req.body || !req.body.messages || !Array.isArray(req.body.messages)) {
      return res.status(400).json({
        error: {
          message: 'Missing or invalid field: messages (must be an array)',
          type: 'invalid_request_error',
          code: 'invalid_request'
        }
      })
    }

    if (req.body.messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Messages array cannot be empty',
          type: 'invalid_request_error',
          code: 'invalid_request'
        }
      })
    }

    // 检测模型对应的后端
    const requestedModel = req.body.model || 'claude-3-5-sonnet-20241022'
    const backend = detectBackendFromModel(requestedModel)

    logger.debug(
      `📥 Received OpenAI format request for model: ${requestedModel}, backend: ${backend}`
    )

    // 根据后端选择处理逻辑
    if (backend === 'claude') {
      // 转换 OpenAI 请求为 Claude 格式
      const claudeRequest = openaiToClaude.convertRequest(req.body)

      // 检查模型限制
      if (apiKeyData.enableModelRestriction && apiKeyData.restrictedModels?.length > 0) {
        if (!apiKeyData.restrictedModels.includes(claudeRequest.model)) {
          return res.status(403).json({
            error: {
              message: `Model ${requestedModel} is not allowed for this API key`,
              type: 'invalid_request_error',
              code: 'model_not_allowed'
            }
          })
        }
      }

      // 生成会话哈希用于 sticky 会话
      const sessionHash = sessionHelper.generateSessionHash(claudeRequest)

      // 选择可用的 Claude 账户
      const accountSelection = await unifiedClaudeScheduler.selectAccountForApiKey(
        apiKeyData,
        sessionHash,
        claudeRequest.model
      )
      const { accountId } = accountSelection

      // 获取该账号存储的 Claude Code headers
      const claudeCodeHeaders = await claudeCodeHeadersService.getAccountHeaders(accountId)

      // 处理流式请求
      if (claudeRequest.stream) {
        logger.info(`🌊 Processing OpenAI stream request for model: ${requestedModel}`)

        // 设置 SSE 响应头
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')

        // 创建中止控制器
        abortController = new AbortController()

        // 处理客户端断开
        req.on('close', () => {
          if (abortController && !abortController.signal.aborted) {
            logger.info('🔌 Client disconnected, aborting Claude request')
            abortController.abort()
          }
        })

        // 使用转换后的响应流
        await claudeRelayService.relayStreamRequestWithUsageCapture(
          claudeRequest,
          apiKeyData,
          res,
          claudeCodeHeaders,
          (usage) => {
            // 记录使用统计
            if (usage && usage.input_tokens !== undefined && usage.output_tokens !== undefined) {
              const model = usage.model || claudeRequest.model

              apiKeyService
                .recordUsageWithDetails(apiKeyData.id, usage, model, accountId)
                .catch((error) => {
                  logger.error('❌ Failed to record usage:', error)
                })
            }
          },
          // 流转换器：将 Claude SSE 转换为 OpenAI SSE
          (() => {
            const sessionId = `chatcmpl-${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`
            return (chunk) => openaiToClaude.convertStreamChunk(chunk, requestedModel, sessionId)
          })(),
          {
            betaHeader:
              'oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14'
          }
        )
      } else {
        // 非流式请求
        logger.info(`📄 Processing OpenAI non-stream request for model: ${requestedModel}`)

        // 发送请求到 Claude
        const claudeResponse = await claudeRelayService.relayRequest(
          claudeRequest,
          apiKeyData,
          req,
          res,
          claudeCodeHeaders,
          { betaHeader: 'oauth-2025-04-20' }
        )

        // 解析 Claude 响应
        let claudeData
        try {
          claudeData = JSON.parse(claudeResponse.body)
        } catch (error) {
          logger.error('❌ Failed to parse Claude response:', error)
          return res.status(502).json({
            error: {
              message: 'Invalid response from Claude API',
              type: 'api_error',
              code: 'invalid_response'
            }
          })
        }

        // 处理错误响应
        if (claudeResponse.statusCode >= 400) {
          return res.status(claudeResponse.statusCode).json({
            error: {
              message: claudeData.error?.message || 'Claude API error',
              type: claudeData.error?.type || 'api_error',
              code: claudeData.error?.code || 'unknown_error'
            }
          })
        }

        // 转换为 OpenAI 格式
        const openaiResponse = openaiToClaude.convertResponse(claudeData, requestedModel)

        // 记录使用统计
        if (claudeData.usage) {
          const { usage } = claudeData
          apiKeyService
            .recordUsageWithDetails(apiKeyData.id, usage, claudeRequest.model, accountId)
            .catch((error) => {
              logger.error('❌ Failed to record usage:', error)
            })
        }

        // 返回 OpenAI 格式响应
        res.json(openaiResponse)
      }
    } else if (backend === 'openai') {
      // TODO: 实现 OpenAI/GPT 转发逻辑
      return res.status(501).json({
        error: {
          message: 'OpenAI backend not yet implemented for this endpoint',
          type: 'not_implemented',
          code: 'not_implemented'
        }
      })
    } else if (backend === 'gemini') {
      // TODO: 实现 Gemini 转发逻辑
      return res.status(501).json({
        error: {
          message: 'Gemini backend not yet implemented for this endpoint',
          type: 'not_implemented',
          code: 'not_implemented'
        }
      })
    }

    const duration = Date.now() - startTime
    logger.info(`✅ OpenAI chat/completions request completed in ${duration}ms`)
    return undefined
  } catch (error) {
    logger.error('❌ OpenAI chat/completions error:', error)

    const status = error.status || 500
    if (!res.headersSent) {
      res.status(status).json({
        error: {
          message: error.message || 'Internal server error',
          type: 'server_error',
          code: 'internal_error'
        }
      })
    }
    return undefined
  } finally {
    // 清理资源
    if (abortController) {
      abortController = null
    }
  }
}

// 🔧 OpenAI 兼容的 completions 处理器（传统格式，转换为 chat 格式）
async function handleCompletions(req, res) {
  try {
    // 验证必需参数
    if (!req.body.prompt) {
      return res.status(400).json({
        error: {
          message: 'Prompt is required',
          type: 'invalid_request_error',
          code: 'invalid_request'
        }
      })
    }

    // 将传统 completions 格式转换为 chat 格式
    const chatRequest = {
      model: req.body.model || 'claude-3-5-sonnet-20241022',
      messages: [
        {
          role: 'user',
          content: req.body.prompt
        }
      ],
      max_tokens: req.body.max_tokens,
      temperature: req.body.temperature,
      top_p: req.body.top_p,
      stream: req.body.stream,
      stop: req.body.stop,
      n: req.body.n || 1,
      presence_penalty: req.body.presence_penalty,
      frequency_penalty: req.body.frequency_penalty,
      logit_bias: req.body.logit_bias,
      user: req.body.user
    }

    // 使用 chat/completions 处理器
    req.body = chatRequest
    await handleChatCompletions(req, res)
    return undefined
  } catch (error) {
    logger.error('❌ OpenAI completions error:', error)
    if (!res.headersSent) {
      res.status(500).json({
        error: {
          message: 'Failed to process completion request',
          type: 'server_error',
          code: 'internal_error'
        }
      })
    }
    return undefined
  }
}

// 📋 OpenAI 兼容的 chat/completions 端点
router.post('/v1/chat/completions', authenticateApiKey, handleChatCompletions)

// 🔧 OpenAI 兼容的 completions 端点（传统格式）
router.post('/v1/completions', authenticateApiKey, handleCompletions)

module.exports = router
