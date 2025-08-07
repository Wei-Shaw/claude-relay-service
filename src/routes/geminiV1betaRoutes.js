const express = require('express')
const router = express.Router()
const logger = require('../utils/logger')
const { authenticateApiKey } = require('../middleware/auth')
const geminiAccountService = require('../services/geminiAccountService')
const { countTokens, getAvailableModels } = require('../services/geminiRelayService')

// 检查 API Key 权限
function checkPermissions(apiKeyData, requiredPermission = 'gemini') {
  const permissions = apiKeyData.permissions || 'all'
  return permissions === 'all' || permissions === requiredPermission
}

// Gemini v1beta API: Count Tokens 端点
// GET/POST /api/v1beta/models/{model}:countTokens
router.all('/v1beta/models/:model\\:countTokens', authenticateApiKey, async (req, res) => {
  const startTime = Date.now()

  try {
    const apiKeyData = req.apiKey
    const modelName = req.params.model

    // 检查权限
    if (!checkPermissions(apiKeyData, 'gemini')) {
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access Gemini',
          type: 'permission_denied'
        }
      })
    }

    // 从请求体或查询参数获取内容
    const content = req.body?.contents || req.body?.content || req.query.content

    if (!content) {
      return res.status(400).json({
        error: {
          message: 'Missing required parameter: contents or content',
          type: 'invalid_request_error'
        }
      })
    }

    // 选择可用的 Gemini 账户
    const account = await geminiAccountService.selectAvailableAccount(apiKeyData.id)

    if (!account) {
      return res.status(503).json({
        error: {
          message: 'No available Gemini accounts',
          type: 'service_unavailable'
        }
      })
    }

    logger.info(`Using Gemini account: ${account.id} for countTokens request, model: ${modelName}`)

    // 调用 countTokens API
    const result = await countTokens({
      model: modelName,
      content,
      accessToken: account.accessToken,
      proxy: account.proxy,
      projectId: account.projectId
    })

    res.json(result)

    const duration = Date.now() - startTime
    logger.info(`Gemini countTokens request completed in ${duration}ms`)

    return undefined
  } catch (error) {
    logger.error('Gemini countTokens error:', error)

    const status = error.status || 500
    const errorResponse = {
      error: error.error || {
        message: error.message || 'Internal server error',
        type: 'api_error'
      }
    }

    return res.status(status).json(errorResponse)
  }
})

// Gemini v1beta API: List Models 端点
// GET /api/v1beta/models
router.get('/v1beta/models', authenticateApiKey, async (req, res) => {
  try {
    const apiKeyData = req.apiKey

    // 检查权限
    if (!checkPermissions(apiKeyData, 'gemini')) {
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access Gemini',
          type: 'permission_denied'
        }
      })
    }

    // 选择账户获取模型列表
    const account = await geminiAccountService.selectAvailableAccount(apiKeyData.id)

    if (!account) {
      // 返回默认模型列表
      return res.json({
        models: [
          {
            name: 'models/gemini-2.0-flash-exp',
            version: '001',
            displayName: 'Gemini 2.0 Flash Experimental',
            description: 'Fast and versatile multimodal model for scaling across diverse tasks',
            inputTokenLimit: 1048576,
            outputTokenLimit: 8192,
            supportedGenerationMethods: ['generateContent', 'countTokens'],
            temperature: 1.0,
            maxTemperature: 2.0
          },
          {
            name: 'models/gemini-2.5-pro',
            version: '001',
            displayName: 'Gemini 2.5 Pro',
            description: 'Mid-size multimodal model for scaling across diverse tasks',
            inputTokenLimit: 2097152,
            outputTokenLimit: 8192,
            supportedGenerationMethods: ['generateContent', 'countTokens'],
            temperature: 1.0,
            maxTemperature: 2.0
          }
        ]
      })
    }

    // 获取真实模型列表
    const models = await getAvailableModels(account.accessToken, account.proxy, account.projectId)

    // 转换为 v1beta 格式
    const v1betaModels = models.map((model) => ({
      name: `models/${model.id}`,
      version: '001',
      displayName: model.id.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      description: `${model.id} model`,
      inputTokenLimit: 1048576,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['generateContent', 'countTokens'],
      temperature: 1.0,
      maxTemperature: 2.0
    }))

    res.json({
      models: v1betaModels
    })

    return undefined
  } catch (error) {
    logger.error('Failed to get Gemini v1beta models:', error)
    return res.status(500).json({
      error: {
        message: 'Failed to retrieve models',
        type: 'api_error'
      }
    })
  }
})

module.exports = router
