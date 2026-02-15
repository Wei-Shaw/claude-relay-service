/**
 * OpenAI 兼容的 Claude API 路由
 * 提供 OpenAI 格式的 API 接口，内部转发到 Claude
 */

const express = require('express')
const router = express.Router()
const logger = require('../utils/logger')
const { authenticateApiKey } = require('../middleware/auth')
const claudeRelayService = require('../services/relay/claudeRelayService')
const claudeConsoleRelayService = require('../services/relay/claudeConsoleRelayService')
const openaiToClaude = require('../services/openaiToClaude')
const apiKeyService = require('../services/apiKeyService')
const unifiedClaudeScheduler = require('../services/scheduler/unifiedClaudeScheduler')
const claudeCodeHeadersService = require('../services/claudeCodeHeadersService')
const { getSafeMessage } = require('../utils/errorSanitizer')
const sessionHelper = require('../utils/sessionHelper')
const { updateRateLimitCounters } = require('../utils/rateLimitHelper')
const pricingService = require('../services/pricingService')
const { getEffectiveModel } = require('../utils/modelHelper')

// 🔧 辅助函数：检查 API Key 权限
function checkPermissions(apiKeyData, requiredPermission = 'claude') {
  return apiKeyService.hasPermission(apiKeyData?.permissions, requiredPermission)
}

function queueRateLimitUpdate(
  rateLimitInfo,
  usageSummary,
  model,
  context = '',
  keyId = null,
  accountType = null
) {
  if (!rateLimitInfo) {
    return
  }

  const label = context ? ` (${context})` : ''

  updateRateLimitCounters(rateLimitInfo, usageSummary, model, keyId, accountType)
    .then(({ totalTokens, totalCost }) => {
      if (totalTokens > 0) {
        logger.api(`📊 Updated rate limit token count${label}: +${totalTokens} tokens`)
      }
      if (typeof totalCost === 'number' && totalCost > 0) {
        logger.api(`💰 Updated rate limit cost count${label}: +$${totalCost.toFixed(6)}`)
      }
    })
    .catch((error) => {
      logger.error(`❌ Failed to update rate limit counters${label}:`, error)
    })
}

// 📋 OpenAI 兼容的模型列表端点
router.get('/v1/models', authenticateApiKey, async (req, res) => {
  try {
    const apiKeyData = req.apiKey

    // 检查权限
    if (!checkPermissions(apiKeyData, 'claude')) {
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access Claude',
          type: 'permission_denied',
          code: 'permission_denied'
        }
      })
    }

    // Claude 模型列表 - 只返回 opus-4 和 sonnet-4
    let models = [
      {
        id: 'claude-opus-4-20250514',
        object: 'model',
        created: 1736726400, // 2025-01-13
        owned_by: 'anthropic'
      },
      {
        id: 'claude-sonnet-4-20250514',
        object: 'model',
        created: 1736726400, // 2025-01-13
        owned_by: 'anthropic'
      }
    ]

    // 如果启用了模型限制，视为黑名单：过滤掉受限模型
    if (apiKeyData.enableModelRestriction && apiKeyData.restrictedModels?.length > 0) {
      models = models.filter((model) => !apiKeyData.restrictedModels.includes(model.id))
    }

    res.json({
      object: 'list',
      data: models
    })
  } catch (error) {
    logger.error('❌ Failed to get OpenAI-Claude models:', error)
    res.status(500).json({
      error: {
        message: 'Failed to retrieve models',
        type: 'server_error',
        code: 'internal_error'
      }
    })
  }
  return undefined
})

// 📄 OpenAI 兼容的模型详情端点
router.get('/v1/models/:model', authenticateApiKey, async (req, res) => {
  try {
    const apiKeyData = req.apiKey
    const modelId = req.params.model

    // 检查权限
    if (!checkPermissions(apiKeyData, 'claude')) {
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access Claude',
          type: 'permission_denied',
          code: 'permission_denied'
        }
      })
    }

    // 模型限制（黑名单）：命中则直接拒绝
    if (apiKeyData.enableModelRestriction && apiKeyData.restrictedModels?.length > 0) {
      if (apiKeyData.restrictedModels.includes(modelId)) {
        return res.status(404).json({
          error: {
            message: `Model '${modelId}' not found`,
            type: 'invalid_request_error',
            code: 'model_not_found'
          }
        })
      }
    }

    // 从 model_pricing.json 获取模型信息
    const modelData = pricingService.getModelPricing(modelId)

    // 构建标准 OpenAI 格式的模型响应
    let modelInfo

    if (modelData) {
      // 如果在 pricing 文件中找到了模型
      modelInfo = {
        id: modelId,
        object: 'model',
        created: 1736726400, // 2025-01-13
        owned_by: 'anthropic',
        permission: [],
        root: modelId,
        parent: null
      }
    } else {
      // 如果没找到，返回默认信息（但仍保持正确格式）
      modelInfo = {
        id: modelId,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'anthropic',
        permission: [],
        root: modelId,
        parent: null
      }
    }

    res.json(modelInfo)
  } catch (error) {
    logger.error('❌ Failed to get model details:', error)
    res.status(500).json({
      error: {
        message: 'Failed to retrieve model details',
        type: 'server_error',
        code: 'internal_error'
      }
    })
  }
  return undefined
})

// 🔧 处理聊天完成请求的核心函数
async function handleChatCompletion(req, res, apiKeyData) {
  const startTime = Date.now()
  let abortController = null

  try {
    // 检查权限
    if (!checkPermissions(apiKeyData, 'claude')) {
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access Claude',
          type: 'permission_denied',
          code: 'permission_denied'
        }
      })
    }

    // 记录原始请求
    logger.debug('📥 Received OpenAI format request:', {
      model: req.body.model,
      messageCount: req.body.messages?.length,
      stream: req.body.stream,
      maxTokens: req.body.max_tokens
    })

    // 转换 OpenAI 请求为 Claude 格式
    const claudeRequest = openaiToClaude.convertRequest(req.body)

    // 模型限制（黑名单）：命中受限模型则拒绝
    if (apiKeyData.enableModelRestriction && apiKeyData.restrictedModels?.length > 0) {
      const effectiveModel = getEffectiveModel(claudeRequest.model || '')
      if (apiKeyData.restrictedModels.includes(effectiveModel)) {
        return res.status(403).json({
          error: {
            message: `Model ${req.body.model} is not allowed for this API key`,
            type: 'invalid_request_error',
            code: 'model_not_allowed'
          }
        })
      }
    }

    // 生成会话哈希用于sticky会话
    const sessionHash = sessionHelper.generateSessionHash(claudeRequest)

    // 选择可用的Claude账户
    let accountSelection
    try {
      accountSelection = await unifiedClaudeScheduler.selectAccountForApiKey(
        apiKeyData,
        sessionHash,
        claudeRequest.model
      )
    } catch (error) {
      if (error.code === 'CLAUDE_DEDICATED_RATE_LIMITED') {
        const limitMessage = claudeRelayService._buildStandardRateLimitMessage(error.rateLimitEndAt)
        return res.status(403).json({
          error: 'upstream_rate_limited',
          message: limitMessage
        })
      }
      throw error
    }
    const { accountId, accountType } = accountSelection

    // 获取该账号存储的 Claude Code headers
    const claudeCodeHeaders = await claudeCodeHeadersService.getAccountHeaders(accountId)

    logger.debug(`📋 Using Claude Code headers for account ${accountId}:`, {
      userAgent: claudeCodeHeaders['user-agent']
    })

    // 处理流式请求
    if (claudeRequest.stream) {
      logger.info(`🌊 Processing OpenAI stream request for model: ${req.body.model}`)

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

      // 使用转换后的响应流 (根据账户类型选择转发服务)
      // 创建 usage 回调函数
      const usageCallback = (usage) => {
        // 记录使用统计
        if (usage && usage.input_tokens !== undefined && usage.output_tokens !== undefined) {
          const model = usage.model || claudeRequest.model
          const cacheCreateTokens =
            (usage.cache_creation && typeof usage.cache_creation === 'object'
              ? (usage.cache_creation.ephemeral_5m_input_tokens || 0) +
                (usage.cache_creation.ephemeral_1h_input_tokens || 0)
              : usage.cache_creation_input_tokens || 0) || 0
          const cacheReadTokens = usage.cache_read_input_tokens || 0

          // 使用新的 recordUsageWithDetails 方法来支持详细的缓存数据
          apiKeyService
            .recordUsageWithDetails(
              apiKeyData.id,
              usage, // 直接传递整个 usage 对象，包含可能的 cache_creation 详细数据
              model,
              accountId,
              accountType
            )
            .catch((error) => {
              logger.error('❌ Failed to record usage:', error)
            })

          queueRateLimitUpdate(
            req.rateLimitInfo,
            {
              inputTokens: usage.input_tokens || 0,
              outputTokens: usage.output_tokens || 0,
              cacheCreateTokens,
              cacheReadTokens
            },
            model,
            `openai-${accountType}-stream`,
            req.apiKey?.id,
            accountType
          )
        }
      }

      // 创建流转换器
      const sessionId = `chatcmpl-${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`
      const streamTransformer = (chunk) =>
        openaiToClaude.convertStreamChunk(chunk, req.body.model, sessionId)

      // 根据账户类型选择转发服务
      if (accountType === 'claude-console') {
        // Claude Console 账户使用 Console 转发服务
        await claudeConsoleRelayService.relayStreamRequestWithUsageCapture(
          claudeRequest,
          apiKeyData,
          res,
          claudeCodeHeaders,
          usageCallback,
          accountId,
          streamTransformer
        )
      } else {
        // Claude Official 账户使用标准转发服务
        await claudeRelayService.relayStreamRequestWithUsageCapture(
          claudeRequest,
          apiKeyData,
          res,
          claudeCodeHeaders,
          usageCallback,
          streamTransformer,
          {
            betaHeader:
              'oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14'
          }
        )
      }
    } else {
      // 非流式请求
      logger.info(`📄 Processing OpenAI non-stream request for model: ${req.body.model}`)

      // 根据账户类型选择转发服务
      let claudeResponse
      if (accountType === 'claude-console') {
        // Claude Console 账户使用 Console 转发服务
        claudeResponse = await claudeConsoleRelayService.relayRequest(
          claudeRequest,
          apiKeyData,
          req,
          res,
          claudeCodeHeaders,
          accountId
        )
      } else {
        // Claude Official 账户使用标准转发服务
        claudeResponse = await claudeRelayService.relayRequest(
          claudeRequest,
          apiKeyData,
          req,
          res,
          claudeCodeHeaders,
          { betaHeader: 'oauth-2025-04-20' }
        )
      }

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
      const openaiResponse = openaiToClaude.convertResponse(claudeData, req.body.model)

      // 记录使用统计
      if (claudeData.usage) {
        const { usage } = claudeData
        const cacheCreateTokens =
          (usage.cache_creation && typeof usage.cache_creation === 'object'
            ? (usage.cache_creation.ephemeral_5m_input_tokens || 0) +
              (usage.cache_creation.ephemeral_1h_input_tokens || 0)
            : usage.cache_creation_input_tokens || 0) || 0
        const cacheReadTokens = usage.cache_read_input_tokens || 0
        // 使用新的 recordUsageWithDetails 方法来支持详细的缓存数据
        apiKeyService
          .recordUsageWithDetails(
            apiKeyData.id,
            usage, // 直接传递整个 usage 对象，包含可能的 cache_creation 详细数据
            claudeRequest.model,
            accountId,
            accountType
          )
          .catch((error) => {
            logger.error('❌ Failed to record usage:', error)
          })

        queueRateLimitUpdate(
          req.rateLimitInfo,
          {
            inputTokens: usage.input_tokens || 0,
            outputTokens: usage.output_tokens || 0,
            cacheCreateTokens,
            cacheReadTokens
          },
          claudeRequest.model,
          `openai-${accountType}-non-stream`,
          req.apiKey?.id,
          accountType
        )
      }

      // 返回 OpenAI 格式响应
      res.json(openaiResponse)
    }

    const duration = Date.now() - startTime
    logger.info(`✅ OpenAI-Claude request completed in ${duration}ms`)
  } catch (error) {
    // 客户端主动断开连接是正常情况，使用 INFO 级别
    if (error.message === 'Client disconnected') {
      logger.info('🔌 OpenAI-Claude stream ended: Client disconnected')
    } else {
      logger.error('❌ OpenAI-Claude request error:', error)
    }

    // 检查响应是否已发送（流式响应场景），避免 ERR_HTTP_HEADERS_SENT
    if (!res.headersSent) {
      // 客户端断开使用 499 状态码 (Client Closed Request)
      if (error.message === 'Client disconnected') {
        res.status(499).end()
      } else {
        const status = error.status || 500
        res.status(status).json({
          error: {
            message: getSafeMessage(error),
            type: 'server_error',
            code: 'internal_error'
          }
        })
      }
    }
  } finally {
    // 清理资源
    if (abortController) {
      abortController = null
    }
  }
  return undefined
}

// 🚀 OpenAI 兼容的聊天完成端点
router.post('/v1/chat/completions', authenticateApiKey, async (req, res) => {
  await handleChatCompletion(req, res, req.apiKey)
})

// 🔧 OpenAI 兼容的 completions 端点（传统格式，转换为 chat 格式）
router.post('/v1/completions', authenticateApiKey, async (req, res) => {
  try {
    const apiKeyData = req.apiKey

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
    const originalBody = req.body
    req.body = {
      model: originalBody.model,
      messages: [
        {
          role: 'user',
          content: originalBody.prompt
        }
      ],
      max_tokens: originalBody.max_tokens,
      temperature: originalBody.temperature,
      top_p: originalBody.top_p,
      stream: originalBody.stream,
      stop: originalBody.stop,
      n: originalBody.n || 1,
      presence_penalty: originalBody.presence_penalty,
      frequency_penalty: originalBody.frequency_penalty,
      logit_bias: originalBody.logit_bias,
      user: originalBody.user
    }

    // 使用共享的处理函数
    await handleChatCompletion(req, res, apiKeyData)
  } catch (error) {
    logger.error('❌ OpenAI completions error:', error)
    res.status(500).json({
      error: {
        message: 'Failed to process completion request',
        type: 'server_error',
        code: 'internal_error'
      }
    })
  }
  return undefined
})

module.exports = router
module.exports.handleChatCompletion = handleChatCompletion
