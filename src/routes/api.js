const express = require('express')
const claudeRelayService = require('../services/claudeRelayService')
const claudeConsoleRelayService = require('../services/claudeConsoleRelayService')
const bedrockRelayService = require('../services/bedrockRelayService')
const ccrRelayService = require('../services/ccrRelayService')
const bedrockAccountService = require('../services/bedrockAccountService')
const unifiedClaudeScheduler = require('../services/unifiedClaudeScheduler')
const apiKeyService = require('../services/apiKeyService')
const { authenticateApiKey } = require('../middleware/auth')
const logger = require('../utils/logger')
const { getEffectiveModel, parseVendorPrefixedModel } = require('../utils/modelHelper')
const sessionHelper = require('../utils/sessionHelper')
const { updateRateLimitCounters } = require('../utils/rateLimitHelper')
const claudeRelayConfigService = require('../services/claudeRelayConfigService')
const { sanitizeUpstreamError } = require('../utils/errorSanitizer')
const { dumpAnthropicMessagesRequest } = require('../utils/anthropicRequestDump')
const {
  handleAnthropicMessagesToGemini,
  handleAnthropicCountTokensToGemini
} = require('../services/anthropicGeminiBridgeService')
const router = express.Router()

function queueRateLimitUpdate(rateLimitInfo, usageSummary, model, context = '') {
  if (!rateLimitInfo) {
    return Promise.resolve({ totalTokens: 0, totalCost: 0 })
  }

  const label = context ? ` (${context})` : ''

  return updateRateLimitCounters(rateLimitInfo, usageSummary, model)
    .then(({ totalTokens, totalCost }) => {
      if (totalTokens > 0) {
        logger.api(`📊 Updated rate limit token count${label}: +${totalTokens} tokens`)
      }
      if (typeof totalCost === 'number' && totalCost > 0) {
        logger.api(`💰 Updated rate limit cost count${label}: +$${totalCost.toFixed(6)}`)
      }
      return { totalTokens, totalCost }
    })
    .catch((error) => {
      logger.error(`❌ Failed to update rate limit counters${label}:`, error)
      return { totalTokens: 0, totalCost: 0 }
    })
}

/**
 * 判断是否为旧会话（污染的会话）
 * Claude Code 发送的请求特点：
 * - messages 数组通常只有 1 个元素
 * - 历史对话记录嵌套在单个 message 的 content 数组中
 * - content 数组中包含 <system-reminder> 开头的系统注入内容
 *
 * 污染会话的特征：
 * 1. messages.length > 1
 * 2. messages.length === 1 但 content 中有多个用户输入
 * 3. "warmup" 请求：单条简单消息 + 无 tools（真正新会话会带 tools）
 *
 * @param {Object} body - 请求体
 * @returns {boolean} 是否为旧会话
 */
function isOldSession(body) {
  const messages = body?.messages
  const tools = body?.tools

  if (!messages || messages.length === 0) {
    return false
  }

  // 1. 多条消息 = 旧会话
  if (messages.length > 1) {
    return true
  }

  // 2. 单条消息，分析 content
  const firstMessage = messages[0]
  const content = firstMessage?.content

  if (!content) {
    return false
  }

  // 如果 content 是字符串，只有一条输入，需要检查 tools
  if (typeof content === 'string') {
    // 有 tools = 正常新会话，无 tools = 可疑
    return !tools || tools.length === 0
  }

  // 如果 content 是数组，统计非 system-reminder 的元素
  if (Array.isArray(content)) {
    const userInputs = content.filter((item) => {
      if (item.type !== 'text') {
        return false
      }
      const text = item.text || ''
      // 剔除以 <system-reminder> 开头的
      return !text.trimStart().startsWith('<system-reminder>')
    })

    // 多个用户输入 = 旧会话
    if (userInputs.length > 1) {
      return true
    }

    // Warmup 检测：单个消息 + 无 tools = 旧会话
    if (userInputs.length === 1 && (!tools || tools.length === 0)) {
      return true
    }
  }

  return false
}

// 🔧 共享的消息处理函数
async function handleMessagesRequest(req, res) {
  try {
    const startTime = Date.now()

    // 🔄 并发满额重试标志：最多重试一次（使用req对象存储状态）
    if (req._concurrencyRetryAttempted === undefined) {
      req._concurrencyRetryAttempted = false
    }

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

    // 模型限制（黑名单）校验：统一在此处处理（去除供应商前缀）
    if (
      req.apiKey.enableModelRestriction &&
      Array.isArray(req.apiKey.restrictedModels) &&
      req.apiKey.restrictedModels.length > 0
    ) {
      const effectiveModel = getEffectiveModel(req.body.model || '')
      if (req.apiKey.restrictedModels.includes(effectiveModel)) {
        return res.status(403).json({
          error: {
            type: 'forbidden',
            message: '暂无该模型访问权限'
          }
        })
      }
    }

    const forcedVendor = req._anthropicVendor || null
    logger.api('📥 /v1/messages request received', {
      model: req.body.model || null,
      forcedVendor,
      stream: req.body.stream === true
    })

    dumpAnthropicMessagesRequest(req, {
      route: '/v1/messages',
      forcedVendor,
      model: req.body?.model || null,
      stream: req.body?.stream === true
    })

    // /v1/messages 的扩展：按路径强制分流到 Gemini OAuth 账户（避免 model 前缀混乱）
    if (forcedVendor === 'gemini-cli' || forcedVendor === 'antigravity') {
      const permissions = req.apiKey?.permissions || 'all'
      if (permissions !== 'all' && permissions !== 'gemini') {
        return res.status(403).json({
          error: {
            type: 'permission_error',
            message: '此 API Key 无权访问 Gemini 服务'
          }
        })
      }

      const baseModel = (req.body.model || '').trim()
      return await handleAnthropicMessagesToGemini(req, res, { vendor: forcedVendor, baseModel })
    }

    // Claude 服务权限校验，阻止未授权的 Key（默认路径保持不变）
    if (
      req.apiKey.permissions &&
      req.apiKey.permissions !== 'all' &&
      req.apiKey.permissions !== 'claude'
    ) {
      return res.status(403).json({
        error: {
          type: 'permission_error',
          message: '此 API Key 无权访问 Claude 服务'
        }
      })
    }

    // 检查是否为流式请求
    const isStream = req.body.stream === true

    // 临时修复新版本客户端，删除context_management字段，避免报错
    // if (req.body.context_management) {
    //   delete req.body.context_management
    // }

    // 遍历tools数组，删除input_examples字段
    // if (req.body.tools && Array.isArray(req.body.tools)) {
    //   req.body.tools.forEach((tool) => {
    //     if (tool && typeof tool === 'object' && tool.input_examples) {
    //       delete tool.input_examples
    //     }
    //   })
    // }

    logger.api(
      `🚀 Processing ${isStream ? 'stream' : 'non-stream'} request for key: ${req.apiKey.name}`
    )

    if (isStream) {
      // 🔍 检查客户端连接是否仍然有效（可能在并发排队等待期间断开）
      if (res.destroyed || res.socket?.destroyed || res.writableEnded) {
        logger.warn(
          `⚠️ Client disconnected before stream response could start for key: ${req.apiKey?.name || 'unknown'}`
        )
        return undefined
      }

      // 流式响应 - 只使用官方真实usage数据
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('X-Accel-Buffering', 'no') // 禁用 Nginx 缓冲
      // ⚠️ 检查 headers 是否已发送（可能在排队心跳时已设置）
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        // ⚠️ 关键修复：尊重 auth.js 提前设置的 Connection: close
        // 当并发队列功能启用时，auth.js 会设置 Connection: close 来禁用 Keep-Alive
        // 这里只在没有设置过 Connection 头时才设置 keep-alive
        const existingConnection = res.getHeader('Connection')
        if (!existingConnection) {
          res.setHeader('Connection', 'keep-alive')
        } else {
          logger.api(
            `🔌 [STREAM] Preserving existing Connection header: ${existingConnection} for key: ${req.apiKey?.name || 'unknown'}`
          )
        }
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('X-Accel-Buffering', 'no') // 禁用 Nginx 缓冲
      } else {
        logger.debug(
          `📤 [STREAM] Headers already sent, skipping setHeader for key: ${req.apiKey?.name || 'unknown'}`
        )
      }

      // 禁用 Nagle 算法，确保数据立即发送
      if (res.socket && typeof res.socket.setNoDelay === 'function') {
        res.socket.setNoDelay(true)
      }

      // 流式响应不需要额外处理，中间件已经设置了监听器

      let usageDataCaptured = false

      // 生成会话哈希用于sticky会话
      const sessionHash = sessionHelper.generateSessionHash(req.body)

      // 🔒 全局会话绑定验证
      let forcedAccount = null
      let needSessionBinding = false
      let originalSessionIdForBinding = null

      try {
        const globalBindingEnabled = await claudeRelayConfigService.isGlobalSessionBindingEnabled()

        if (globalBindingEnabled) {
          const originalSessionId = claudeRelayConfigService.extractOriginalSessionId(req.body)

          if (originalSessionId) {
            const validation = await claudeRelayConfigService.validateNewSession(
              req.body,
              originalSessionId
            )

            if (!validation.valid) {
              logger.api(
                `❌ Session binding validation failed: ${validation.code} for session ${originalSessionId}`
              )
              return res.status(403).json({
                error: {
                  type: 'session_binding_error',
                  message: validation.error
                }
              })
            }

            // 如果已有绑定，使用绑定的账户
            if (validation.binding) {
              forcedAccount = validation.binding
              logger.api(
                `🔗 Using bound account for session ${originalSessionId}: ${forcedAccount.accountId}`
              )
            }

            // 标记需要在调度成功后建立绑定
            if (validation.isNewSession) {
              needSessionBinding = true
              originalSessionIdForBinding = originalSessionId
              logger.api(`📝 New session detected, will create binding: ${originalSessionId}`)
            }
          }
        }
      } catch (error) {
        logger.error('❌ Error in global session binding check:', error)
        // 配置服务出错时不阻断请求
      }

      // 使用统一调度选择账号（传递请求的模型）
      const requestedModel = req.body.model
      let accountId
      let accountType
      try {
        const selection = await unifiedClaudeScheduler.selectAccountForApiKey(
          req.apiKey,
          sessionHash,
          requestedModel,
          forcedAccount
        )
        ;({ accountId, accountType } = selection)
      } catch (error) {
        // 处理会话绑定账户不可用的错误
        if (error.code === 'SESSION_BINDING_ACCOUNT_UNAVAILABLE') {
          const errorMessage = await claudeRelayConfigService.getSessionBindingErrorMessage()
          return res.status(403).json({
            error: {
              type: 'session_binding_error',
              message: errorMessage
            }
          })
        }
        if (error.code === 'CLAUDE_DEDICATED_RATE_LIMITED') {
          const limitMessage = claudeRelayService._buildStandardRateLimitMessage(
            error.rateLimitEndAt
          )
          res.status(403)
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: 'upstream_rate_limited',
              message: limitMessage
            })
          )
          return
        }
        throw error
      }

      // 🔗 在成功调度后建立会话绑定（仅 claude-official 类型）
      // claude-official 只接受：1) 新会话 2) 已绑定的会话
      if (
        needSessionBinding &&
        originalSessionIdForBinding &&
        accountId &&
        accountType === 'claude-official'
      ) {
        // 🚫 检测旧会话（污染的会话）
        if (isOldSession(req.body)) {
          const cfg = await claudeRelayConfigService.getConfig()
          logger.warn(
            `🚫 Old session rejected: sessionId=${originalSessionIdForBinding}, messages.length=${req.body?.messages?.length}, tools.length=${req.body?.tools?.length || 0}, isOldSession=true`
          )
          return res.status(400).json({
            error: {
              type: 'session_binding_error',
              message: cfg.sessionBindingErrorMessage || '你的本地session已污染，请清理后使用。'
            }
          })
        }

        // 创建绑定
        try {
          await claudeRelayConfigService.setOriginalSessionBinding(
            originalSessionIdForBinding,
            accountId,
            accountType
          )
        } catch (bindingError) {
          logger.warn(`⚠️ Failed to create session binding:`, bindingError)
        }
      }

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

              queueRateLimitUpdate(
                req.rateLimitInfo,
                {
                  inputTokens,
                  outputTokens,
                  cacheCreateTokens,
                  cacheReadTokens
                },
                model,
                'claude-stream'
              )

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

              queueRateLimitUpdate(
                req.rateLimitInfo,
                {
                  inputTokens,
                  outputTokens,
                  cacheCreateTokens,
                  cacheReadTokens
                },
                model,
                'claude-console-stream'
              )

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

            queueRateLimitUpdate(
              req.rateLimitInfo,
              {
                inputTokens,
                outputTokens,
                cacheCreateTokens: 0,
                cacheReadTokens: 0
              },
              result.model,
              'bedrock-stream'
            )

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
      } else if (accountType === 'ccr') {
        // CCR账号使用CCR转发服务（需要传递accountId）
        await ccrRelayService.relayStreamRequestWithUsageCapture(
          req.body,
          req.apiKey,
          res,
          req.headers,
          (usageData) => {
            // 回调函数：当检测到完整usage数据时记录真实token使用量
            logger.info(
              '🎯 CCR usage callback triggered with complete data:',
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
                .recordUsageWithDetails(req.apiKey.id, usageObject, model, usageAccountId, 'ccr')
                .catch((error) => {
                  logger.error('❌ Failed to record CCR stream usage:', error)
                })

              queueRateLimitUpdate(
                req.rateLimitInfo,
                {
                  inputTokens,
                  outputTokens,
                  cacheCreateTokens,
                  cacheReadTokens
                },
                model,
                'ccr-stream'
              )

              usageDataCaptured = true
              logger.api(
                `📊 CCR stream usage recorded (real) - Model: ${model}, Input: ${inputTokens}, Output: ${outputTokens}, Cache Create: ${cacheCreateTokens}, Cache Read: ${cacheReadTokens}, Total: ${inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens} tokens`
              )
            } else {
              logger.warn(
                '⚠️ CCR usage callback triggered but data is incomplete:',
                JSON.stringify(usageData)
              )
            }
          },
          accountId
        )
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
      // 🔍 检查客户端连接是否仍然有效（可能在并发排队等待期间断开）
      if (res.destroyed || res.socket?.destroyed || res.writableEnded) {
        logger.warn(
          `⚠️ Client disconnected before non-stream request could start for key: ${req.apiKey?.name || 'unknown'}`
        )
        return undefined
      }

      // 非流式响应 - 只使用官方真实usage数据
      logger.info('📄 Starting non-streaming request', {
        apiKeyId: req.apiKey.id,
        apiKeyName: req.apiKey.name
      })

      // 📊 监听 socket 事件以追踪连接状态变化
      const nonStreamSocket = res.socket
      let _clientClosedConnection = false
      let _socketCloseTime = null

      if (nonStreamSocket) {
        const onSocketEnd = () => {
          _clientClosedConnection = true
          _socketCloseTime = Date.now()
          logger.warn(
            `⚠️ [NON-STREAM] Socket 'end' event - client sent FIN | key: ${req.apiKey?.name}, ` +
              `requestId: ${req.requestId}, elapsed: ${Date.now() - startTime}ms`
          )
        }
        const onSocketClose = () => {
          _clientClosedConnection = true
          logger.warn(
            `⚠️ [NON-STREAM] Socket 'close' event | key: ${req.apiKey?.name}, ` +
              `requestId: ${req.requestId}, elapsed: ${Date.now() - startTime}ms, ` +
              `hadError: ${nonStreamSocket.destroyed}`
          )
        }
        const onSocketError = (err) => {
          logger.error(
            `❌ [NON-STREAM] Socket error | key: ${req.apiKey?.name}, ` +
              `requestId: ${req.requestId}, error: ${err.message}`
          )
        }

        nonStreamSocket.once('end', onSocketEnd)
        nonStreamSocket.once('close', onSocketClose)
        nonStreamSocket.once('error', onSocketError)

        // 清理监听器（在响应结束后）
        res.once('finish', () => {
          nonStreamSocket.removeListener('end', onSocketEnd)
          nonStreamSocket.removeListener('close', onSocketClose)
          nonStreamSocket.removeListener('error', onSocketError)
        })
      }

      // 生成会话哈希用于sticky会话
      const sessionHash = sessionHelper.generateSessionHash(req.body)

      // 🔒 全局会话绑定验证（非流式）
      let forcedAccountNonStream = null
      let needSessionBindingNonStream = false
      let originalSessionIdForBindingNonStream = null

      try {
        const globalBindingEnabled = await claudeRelayConfigService.isGlobalSessionBindingEnabled()

        if (globalBindingEnabled) {
          const originalSessionId = claudeRelayConfigService.extractOriginalSessionId(req.body)

          if (originalSessionId) {
            const validation = await claudeRelayConfigService.validateNewSession(
              req.body,
              originalSessionId
            )

            if (!validation.valid) {
              logger.api(
                `❌ Session binding validation failed (non-stream): ${validation.code} for session ${originalSessionId}`
              )
              return res.status(403).json({
                error: {
                  type: 'session_binding_error',
                  message: validation.error
                }
              })
            }

            if (validation.binding) {
              forcedAccountNonStream = validation.binding
              logger.api(
                `🔗 Using bound account for session (non-stream) ${originalSessionId}: ${forcedAccountNonStream.accountId}`
              )
            }

            if (validation.isNewSession) {
              needSessionBindingNonStream = true
              originalSessionIdForBindingNonStream = originalSessionId
              logger.api(
                `📝 New session detected (non-stream), will create binding: ${originalSessionId}`
              )
            }
          }
        }
      } catch (error) {
        logger.error('❌ Error in global session binding check (non-stream):', error)
      }

      // 使用统一调度选择账号（传递请求的模型）
      const requestedModel = req.body.model
      let accountId
      let accountType
      try {
        const selection = await unifiedClaudeScheduler.selectAccountForApiKey(
          req.apiKey,
          sessionHash,
          requestedModel,
          forcedAccountNonStream
        )
        ;({ accountId, accountType } = selection)
      } catch (error) {
        if (error.code === 'SESSION_BINDING_ACCOUNT_UNAVAILABLE') {
          const errorMessage = await claudeRelayConfigService.getSessionBindingErrorMessage()
          return res.status(403).json({
            error: {
              type: 'session_binding_error',
              message: errorMessage
            }
          })
        }
        if (error.code === 'CLAUDE_DEDICATED_RATE_LIMITED') {
          const limitMessage = claudeRelayService._buildStandardRateLimitMessage(
            error.rateLimitEndAt
          )
          return res.status(403).json({
            error: 'upstream_rate_limited',
            message: limitMessage
          })
        }
        throw error
      }

      // 🔗 在成功调度后建立会话绑定（非流式，仅 claude-official 类型）
      // claude-official 只接受：1) 新会话 2) 已绑定的会话
      if (
        needSessionBindingNonStream &&
        originalSessionIdForBindingNonStream &&
        accountId &&
        accountType === 'claude-official'
      ) {
        // 🚫 检测旧会话（污染的会话）
        if (isOldSession(req.body)) {
          const cfg = await claudeRelayConfigService.getConfig()
          logger.warn(
            `🚫 Old session rejected (non-stream): sessionId=${originalSessionIdForBindingNonStream}, messages.length=${req.body?.messages?.length}, tools.length=${req.body?.tools?.length || 0}, isOldSession=true`
          )
          return res.status(400).json({
            error: {
              type: 'session_binding_error',
              message: cfg.sessionBindingErrorMessage || '你的本地session已污染，请清理后使用。'
            }
          })
        }

        // 创建绑定
        try {
          await claudeRelayConfigService.setOriginalSessionBinding(
            originalSessionIdForBindingNonStream,
            accountId,
            accountType
          )
        } catch (bindingError) {
          logger.warn(`⚠️ Failed to create session binding (non-stream):`, bindingError)
        }
      }

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
      } else if (accountType === 'ccr') {
        // CCR账号使用CCR转发服务
        logger.debug(`[DEBUG] Calling ccrRelayService.relayRequest with accountId: ${accountId}`)
        response = await ccrRelayService.relayRequest(
          req.body,
          req.apiKey,
          req,
          res,
          req.headers,
          accountId
        )
      }

      logger.info('📡 Claude API response received', {
        statusCode: response.statusCode,
        headers: JSON.stringify(response.headers),
        bodyLength: response.body ? response.body.length : 0
      })

      // 🔍 检查客户端连接是否仍然有效
      // 在长时间请求过程中，客户端可能已经断开连接（超时、用户取消等）
      if (res.destroyed || res.socket?.destroyed || res.writableEnded) {
        logger.warn(
          `⚠️ Client disconnected before non-stream response could be sent for key: ${req.apiKey?.name || 'unknown'}`
        )
        return undefined
      }

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
          // Parse the model to remove vendor prefix if present (e.g., "ccr,gemini-2.5-pro" -> "gemini-2.5-pro")
          const rawModel = jsonData.model || req.body.model || 'unknown'
          const { baseModel: usageBaseModel } = parseVendorPrefixedModel(rawModel)
          const model = usageBaseModel || rawModel

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

          await queueRateLimitUpdate(
            req.rateLimitInfo,
            {
              inputTokens,
              outputTokens,
              cacheCreateTokens,
              cacheReadTokens
            },
            model,
            'claude-non-stream'
          )

          usageRecorded = true
          logger.api(
            `📊 Non-stream usage recorded (real) - Model: ${model}, Input: ${inputTokens}, Output: ${outputTokens}, Cache Create: ${cacheCreateTokens}, Cache Read: ${cacheReadTokens}, Total: ${inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens} tokens`
          )
        } else {
          logger.warn('⚠️ No usage data found in Claude API JSON response')
        }

        // 使用 Express 内建的 res.json() 发送响应（简单可靠）
        res.json(jsonData)
      } catch (parseError) {
        logger.warn('⚠️ Failed to parse Claude API response as JSON:', parseError.message)
        logger.info('📄 Raw response body:', response.body)
        // 使用 Express 内建的 res.send() 发送响应（简单可靠）
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
    let handledError = error

    // 🔄 并发满额降级处理：捕获CONSOLE_ACCOUNT_CONCURRENCY_FULL错误
    if (
      handledError.code === 'CONSOLE_ACCOUNT_CONCURRENCY_FULL' &&
      !req._concurrencyRetryAttempted
    ) {
      req._concurrencyRetryAttempted = true
      logger.warn(
        `⚠️ Console account ${handledError.accountId} concurrency full, attempting fallback to other accounts...`
      )

      // 只有在响应头未发送时才能重试
      if (!res.headersSent) {
        try {
          // 清理粘性会话映射（如果存在）
          const sessionHash = sessionHelper.generateSessionHash(req.body)
          await unifiedClaudeScheduler.clearSessionMapping(sessionHash)

          logger.info('🔄 Session mapping cleared, retrying handleMessagesRequest...')

          // 递归重试整个请求处理（会选择新账户）
          return await handleMessagesRequest(req, res)
        } catch (retryError) {
          // 重试失败
          if (retryError.code === 'CONSOLE_ACCOUNT_CONCURRENCY_FULL') {
            logger.error('❌ All Console accounts reached concurrency limit after retry')
            return res.status(503).json({
              error: 'service_unavailable',
              message:
                'All available Claude Console accounts have reached their concurrency limit. Please try again later.'
            })
          }
          // 其他错误继续向下处理
          handledError = retryError
        }
      } else {
        // 响应头已发送，无法重试
        logger.error('❌ Cannot retry concurrency full error - response headers already sent')
        if (!res.destroyed && !res.finished) {
          res.end()
        }
        return undefined
      }
    }

    // 🚫 第二次并发满额错误：已经重试过，直接返回503
    if (
      handledError.code === 'CONSOLE_ACCOUNT_CONCURRENCY_FULL' &&
      req._concurrencyRetryAttempted
    ) {
      logger.error('❌ All Console accounts reached concurrency limit (retry already attempted)')
      if (!res.headersSent) {
        return res.status(503).json({
          error: 'service_unavailable',
          message:
            'All available Claude Console accounts have reached their concurrency limit. Please try again later.'
        })
      } else {
        if (!res.destroyed && !res.finished) {
          res.end()
        }
        return undefined
      }
    }

    logger.error('❌ Claude relay error:', handledError.message, {
      code: handledError.code,
      stack: handledError.stack
    })

    // 确保在任何情况下都能返回有效的JSON响应
    if (!res.headersSent) {
      // 根据错误类型设置适当的状态码
      let statusCode = 500
      let errorType = 'Relay service error'

      if (
        handledError.message.includes('Connection reset') ||
        handledError.message.includes('socket hang up')
      ) {
        statusCode = 502
        errorType = 'Upstream connection error'
      } else if (handledError.message.includes('Connection refused')) {
        statusCode = 502
        errorType = 'Upstream service unavailable'
      } else if (handledError.message.includes('timeout')) {
        statusCode = 504
        errorType = 'Upstream timeout'
      } else if (
        handledError.message.includes('resolve') ||
        handledError.message.includes('ENOTFOUND')
      ) {
        statusCode = 502
        errorType = 'Upstream hostname resolution failed'
      }

      return res.status(statusCode).json({
        error: errorType,
        message: handledError.message || 'An unexpected error occurred',
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

// 📋 模型列表端点 - 支持 Claude, OpenAI, Gemini
router.get('/v1/models', authenticateApiKey, async (req, res) => {
  try {
    // Claude Code / Anthropic baseUrl 的分流：/antigravity/api/v1/models 返回 Antigravity 实时模型列表
    //（通过 v1internal:fetchAvailableModels），避免依赖静态 modelService 列表。
    const forcedVendor = req._anthropicVendor || null
    if (forcedVendor === 'antigravity') {
      const permissions = req.apiKey?.permissions || 'all'
      if (permissions !== 'all' && permissions !== 'gemini') {
        return res.status(403).json({
          error: {
            type: 'permission_error',
            message: '此 API Key 无权访问 Gemini 服务'
          }
        })
      }

      const unifiedGeminiScheduler = require('../services/unifiedGeminiScheduler')
      const geminiAccountService = require('../services/geminiAccountService')

      let accountSelection
      try {
        accountSelection = await unifiedGeminiScheduler.selectAccountForApiKey(
          req.apiKey,
          null,
          null,
          { oauthProvider: 'antigravity' }
        )
      } catch (error) {
        logger.error('Failed to select Gemini OAuth account (antigravity models):', error)
        return res.status(503).json({ error: 'No available Gemini OAuth accounts' })
      }

      const account = await geminiAccountService.getAccount(accountSelection.accountId)
      if (!account) {
        return res.status(503).json({ error: 'Gemini OAuth account not found' })
      }

      let proxyConfig = null
      if (account.proxy) {
        try {
          proxyConfig =
            typeof account.proxy === 'string' ? JSON.parse(account.proxy) : account.proxy
        } catch (e) {
          logger.warn('Failed to parse proxy configuration:', e)
        }
      }

      const models = await geminiAccountService.fetchAvailableModelsAntigravity(
        account.accessToken,
        proxyConfig,
        account.refreshToken
      )

      // 可选：根据 API Key 的模型限制过滤（黑名单语义）
      let filteredModels = models
      if (req.apiKey.enableModelRestriction && req.apiKey.restrictedModels?.length > 0) {
        filteredModels = models.filter((model) => !req.apiKey.restrictedModels.includes(model.id))
      }

      return res.json({ object: 'list', data: filteredModels })
    }

    const modelService = require('../services/modelService')

    // 从 modelService 获取所有支持的模型
    const models = modelService.getAllModels()

    // 可选：根据 API Key 的模型限制过滤
    let filteredModels = models
    if (req.apiKey.enableModelRestriction && req.apiKey.restrictedModels?.length > 0) {
      // 将 restrictedModels 视为黑名单：过滤掉受限模型
      filteredModels = models.filter((model) => !req.apiKey.restrictedModels.includes(model.id))
    }

    res.json({
      object: 'list',
      data: filteredModels
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
  // 按路径强制分流到 Gemini OAuth 账户（避免 model 前缀混乱）
  const forcedVendor = req._anthropicVendor || null
  if (forcedVendor === 'gemini-cli' || forcedVendor === 'antigravity') {
    const permissions = req.apiKey?.permissions || 'all'
    if (permissions !== 'all' && permissions !== 'gemini') {
      return res.status(403).json({
        error: {
          type: 'permission_error',
          message: 'This API key does not have permission to access Gemini'
        }
      })
    }

    return await handleAnthropicCountTokensToGemini(req, res, { vendor: forcedVendor })
  }

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

  // 🔗 会话绑定验证（与 messages 端点保持一致）
  const originalSessionId = claudeRelayConfigService.extractOriginalSessionId(req.body)
  const sessionValidation = await claudeRelayConfigService.validateNewSession(
    req.body,
    originalSessionId
  )

  if (!sessionValidation.valid) {
    logger.warn(
      `🚫 Session binding validation failed (count_tokens): ${sessionValidation.code} for session ${originalSessionId}`
    )
    return res.status(400).json({
      error: {
        type: 'session_binding_error',
        message: sessionValidation.error
      }
    })
  }

  // 🔗 检测旧会话（污染的会话）- 仅对需要绑定的新会话检查
  if (sessionValidation.isNewSession && originalSessionId) {
    if (isOldSession(req.body)) {
      const cfg = await claudeRelayConfigService.getConfig()
      logger.warn(
        `🚫 Old session rejected (count_tokens): sessionId=${originalSessionId}, messages.length=${req.body?.messages?.length}, tools.length=${req.body?.tools?.length || 0}, isOldSession=true`
      )
      return res.status(400).json({
        error: {
          type: 'session_binding_error',
          message: cfg.sessionBindingErrorMessage || '你的本地session已污染，请清理后使用。'
        }
      })
    }
  }

  logger.info(`🔢 Processing token count request for key: ${req.apiKey.name}`)

  const sessionHash = sessionHelper.generateSessionHash(req.body)
  const requestedModel = req.body.model
  const maxAttempts = 2
  let attempt = 0

  // 引入 claudeConsoleAccountService 用于检查 count_tokens 可用性
  const claudeConsoleAccountService = require('../services/claudeConsoleAccountService')

  const processRequest = async () => {
    const { accountId, accountType } = await unifiedClaudeScheduler.selectAccountForApiKey(
      req.apiKey,
      sessionHash,
      requestedModel
    )

    if (accountType === 'ccr') {
      throw Object.assign(new Error('Token counting is not supported for CCR accounts'), {
        httpStatus: 501,
        errorPayload: {
          error: {
            type: 'not_supported',
            message: 'Token counting is not supported for CCR accounts'
          }
        }
      })
    }

    if (accountType === 'bedrock') {
      throw Object.assign(new Error('Token counting is not supported for Bedrock accounts'), {
        httpStatus: 501,
        errorPayload: {
          error: {
            type: 'not_supported',
            message: 'Token counting is not supported for Bedrock accounts'
          }
        }
      })
    }

    // 🔍 claude-console 账户特殊处理：检查 count_tokens 端点是否可用
    if (accountType === 'claude-console') {
      const isUnavailable = await claudeConsoleAccountService.isCountTokensUnavailable(accountId)
      if (isUnavailable) {
        logger.info(
          `⏭️ count_tokens unavailable for Claude Console account ${accountId}, returning fallback response`
        )
        return { fallbackResponse: true }
      }
    }

    const relayOptions = {
      skipUsageRecord: true,
      customPath: '/v1/messages/count_tokens'
    }

    const response =
      accountType === 'claude-official'
        ? await claudeRelayService.relayRequest(
            req.body,
            req.apiKey,
            req,
            res,
            req.headers,
            relayOptions
          )
        : await claudeConsoleRelayService.relayRequest(
            req.body,
            req.apiKey,
            req,
            res,
            req.headers,
            accountId,
            relayOptions
          )

    // 🔍 claude-console 账户：检测上游 404 响应并标记
    if (accountType === 'claude-console' && response.statusCode === 404) {
      logger.warn(
        `⚠️ count_tokens endpoint returned 404 for Claude Console account ${accountId}, marking as unavailable`
      )
      // 标记失败不应影响 fallback 响应
      try {
        await claudeConsoleAccountService.markCountTokensUnavailable(accountId)
      } catch (markError) {
        logger.error(
          `❌ Failed to mark count_tokens unavailable for account ${accountId}, but will still return fallback:`,
          markError
        )
      }
      return { fallbackResponse: true }
    }

    res.status(response.statusCode)

    const skipHeaders = ['content-encoding', 'transfer-encoding', 'content-length']
    Object.keys(response.headers).forEach((key) => {
      if (!skipHeaders.includes(key.toLowerCase())) {
        res.setHeader(key, response.headers[key])
      }
    })

    try {
      const jsonData = JSON.parse(response.body)
      if (response.statusCode < 200 || response.statusCode >= 300) {
        const sanitizedData = sanitizeUpstreamError(jsonData)
        res.json(sanitizedData)
      } else {
        res.json(jsonData)
      }
    } catch (parseError) {
      res.send(response.body)
    }

    logger.info(`✅ Token count request completed for key: ${req.apiKey.name}`)
    return { fallbackResponse: false }
  }

  while (attempt < maxAttempts) {
    try {
      const result = await processRequest()

      // 🔍 处理 fallback 响应（claude-console 账户 count_tokens 不可用）
      if (result && result.fallbackResponse) {
        if (!res.headersSent) {
          return res.status(200).json({ input_tokens: 0 })
        }
        return
      }

      return
    } catch (error) {
      if (error.code === 'CONSOLE_ACCOUNT_CONCURRENCY_FULL') {
        logger.warn(
          `⚠️ Console account concurrency full during count_tokens (attempt ${attempt + 1}/${maxAttempts})`
        )
        if (attempt < maxAttempts - 1) {
          try {
            await unifiedClaudeScheduler.clearSessionMapping(sessionHash)
          } catch (clearError) {
            logger.error('❌ Failed to clear session mapping for count_tokens retry:', clearError)
            if (!res.headersSent) {
              return res.status(500).json({
                error: {
                  type: 'server_error',
                  message: 'Failed to count tokens'
                }
              })
            }
            if (!res.destroyed && !res.finished) {
              res.end()
            }
            return
          }
          attempt += 1
          continue
        }
        if (!res.headersSent) {
          return res.status(503).json({
            error: 'service_unavailable',
            message:
              'All available Claude Console accounts have reached their concurrency limit. Please try again later.'
          })
        }
        if (!res.destroyed && !res.finished) {
          res.end()
        }
        return
      }

      if (error.httpStatus) {
        return res.status(error.httpStatus).json(error.errorPayload)
      }

      // 客户端断开连接不是错误，使用 INFO 级别
      if (error.message === 'Client disconnected') {
        logger.info('🔌 Client disconnected during token count request')
        if (!res.headersSent) {
          return res.status(499).end() // 499 Client Closed Request
        }
        if (!res.destroyed && !res.finished) {
          res.end()
        }
        return
      }

      logger.error('❌ Token count error:', error)
      if (!res.headersSent) {
        return res.status(500).json({
          error: {
            type: 'server_error',
            message: 'Failed to count tokens'
          }
        })
      }

      if (!res.destroyed && !res.finished) {
        res.end()
      }
      return
    }
  }
})

module.exports = router
module.exports.handleMessagesRequest = handleMessagesRequest
