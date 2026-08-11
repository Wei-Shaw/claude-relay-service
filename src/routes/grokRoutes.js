/**
 * Grok / xAI 公共 API 路由
 * /grok/v1/chat/completions
 * /grok/v1/responses
 * /grok/v1/images/*
 * /grok/v1/videos/*
 * /grok/v1/models
 */

const crypto = require('crypto')
const express = require('express')
const { authenticateApiKey } = require('../middleware/auth')
const grokRelayService = require('../services/relay/grokRelayService')
const apiKeyService = require('../services/apiKeyService')
const logger = require('../utils/logger')
const xaiHelper = require('../utils/xaiHelper')
const sessionHelper = require('../utils/sessionHelper')

const router = express.Router()

const hasGrokPermission = (apiKeyData) =>
  apiKeyService.hasPermission(apiKeyData?.permissions, 'grok')

const resolveSessionHash = (req) => {
  if (typeof sessionHelper.generateSessionHash === 'function' && req.body) {
    try {
      const fromHelper = sessionHelper.generateSessionHash(req.body)
      if (fromHelper) {
        return fromHelper
      }
    } catch {
      // fall through
    }
  }
  const sessionId =
    req.headers['session_id'] ||
    req.headers['x-session-id'] ||
    req.body?.session_id ||
    req.body?.conversation_id ||
    null
  return sessionId ? crypto.createHash('sha256').update(String(sessionId)).digest('hex') : null
}

const denyIfNoPermission = (req, res) => {
  if (hasGrokPermission(req.apiKey)) {
    return false
  }
  logger.security?.(
    `🚫 API Key ${req.apiKey?.id || 'unknown'} 缺少 Grok 权限，拒绝访问 ${req.originalUrl}`
  )
  res.status(403).json({
    error: 'permission_denied',
    message: '此 API Key 未启用 Grok 权限'
  })
  return true
}

const sendRouteError = (res, error) => {
  if (res.headersSent) {
    return
  }
  const statusCode = error.statusCode || error.response?.status || 500
  res.status(statusCode).json({
    error: {
      message: error.message,
      type: error.type || (statusCode >= 500 ? 'server_error' : 'api_error'),
      code: error.code || undefined
    }
  })
}

// 模型列表
router.get(['/v1/models', '/models'], authenticateApiKey, async (req, res) => {
  if (denyIfNoPermission(req, res)) {
    return
  }
  const models = xaiHelper.DEFAULT_MODELS.map((model) => ({
    id: model.id,
    object: 'model',
    owned_by: 'xai',
    display_name: model.displayName
  }))
  res.json({ object: 'list', data: models })
})

// Chat Completions
router.post(['/v1/chat/completions', '/chat/completions'], authenticateApiKey, async (req, res) => {
  try {
    if (denyIfNoPermission(req, res)) {
      return
    }
    await grokRelayService.relayChatCompletions(req, res, req.apiKey, resolveSessionHash(req))
  } catch (error) {
    console.error(error)
    sendRouteError(res, error)
  }
})

// Responses
router.post(['/v1/responses', '/responses'], authenticateApiKey, async (req, res) => {
  try {
    if (denyIfNoPermission(req, res)) {
      return
    }
    await grokRelayService.relayResponses(req, res, req.apiKey, resolveSessionHash(req))
  } catch (error) {
    console.error(error)
    sendRouteError(res, error)
  }
})

// Responses compact（Grok 无原生 compact，服务侧改写）
router.post(
  ['/v1/responses/compact', '/responses/compact'],
  authenticateApiKey,
  async (req, res) => {
    try {
      if (denyIfNoPermission(req, res)) {
        return
      }
      // 强制走 compact 路径
      req.url = '/v1/responses/compact'
      await grokRelayService.relayResponses(req, res, req.apiKey, resolveSessionHash(req))
    } catch (error) {
      console.error(error)
      sendRouteError(res, error)
    }
  }
)

// Images
router.post(
  ['/v1/images/generations', '/images/generations'],
  authenticateApiKey,
  async (req, res) => {
    try {
      if (denyIfNoPermission(req, res)) {
        return
      }
      await grokRelayService.relayMedia(
        req,
        res,
        req.apiKey,
        'images_generations',
        resolveSessionHash(req)
      )
    } catch (error) {
      console.error(error)
      sendRouteError(res, error)
    }
  }
)

router.post(['/v1/images/edits', '/images/edits'], authenticateApiKey, async (req, res) => {
  try {
    if (denyIfNoPermission(req, res)) {
      return
    }
    await grokRelayService.relayMedia(req, res, req.apiKey, 'images_edits', resolveSessionHash(req))
  } catch (error) {
    console.error(error)
    sendRouteError(res, error)
  }
})

// Videos
router.post(
  ['/v1/videos/generations', '/videos/generations'],
  authenticateApiKey,
  async (req, res) => {
    try {
      if (denyIfNoPermission(req, res)) {
        return
      }
      await grokRelayService.relayMedia(
        req,
        res,
        req.apiKey,
        'videos_generations',
        resolveSessionHash(req)
      )
    } catch (error) {
      console.error(error)
      sendRouteError(res, error)
    }
  }
)

router.post(['/v1/videos/edits', '/videos/edits'], authenticateApiKey, async (req, res) => {
  try {
    if (denyIfNoPermission(req, res)) {
      return
    }
    await grokRelayService.relayMedia(req, res, req.apiKey, 'videos_edits', resolveSessionHash(req))
  } catch (error) {
    console.error(error)
    sendRouteError(res, error)
  }
})

router.post(
  ['/v1/videos/extensions', '/videos/extensions'],
  authenticateApiKey,
  async (req, res) => {
    try {
      if (denyIfNoPermission(req, res)) {
        return
      }
      await grokRelayService.relayMedia(
        req,
        res,
        req.apiKey,
        'videos_extensions',
        resolveSessionHash(req)
      )
    } catch (error) {
      console.error(error)
      sendRouteError(res, error)
    }
  }
)

router.get(
  ['/v1/videos/:requestId', '/videos/:requestId'],
  authenticateApiKey,
  async (req, res) => {
    try {
      if (denyIfNoPermission(req, res)) {
        return
      }
      await grokRelayService.relayMedia(
        req,
        res,
        req.apiKey,
        'video_status',
        resolveSessionHash(req)
      )
    } catch (error) {
      console.error(error)
      sendRouteError(res, error)
    }
  }
)

router.get(
  ['/v1/videos/:requestId/content', '/videos/:requestId/content'],
  authenticateApiKey,
  async (req, res) => {
    try {
      if (denyIfNoPermission(req, res)) {
        return
      }
      await grokRelayService.relayMedia(
        req,
        res,
        req.apiKey,
        'video_content',
        resolveSessionHash(req)
      )
    } catch (error) {
      console.error(error)
      sendRouteError(res, error)
    }
  }
)

module.exports = router
