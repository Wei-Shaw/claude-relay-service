const crypto = require('crypto')
const express = require('express')
const { authenticateApiKey } = require('../middleware/auth')
const grokRelayService = require('../services/relay/grokRelayService')
const grokScheduler = require('../services/scheduler/grokScheduler')
const logger = require('../utils/logger')
const apiKeyService = require('../services/apiKeyService')

const router = express.Router()

function hasGrokPermission(apiKeyData) {
  return apiKeyService.hasPermission(apiKeyData?.permissions, 'grok')
}

function sessionHashFromRequest(req) {
  const sessionId =
    req.headers['session_id'] ||
    req.headers['x-session-id'] ||
    req.body?.session_id ||
    req.body?.conversation_id ||
    null
  return sessionId ? crypto.createHash('sha256').update(String(sessionId)).digest('hex') : null
}

async function handleGrokRelay(req, res) {
  try {
    if (!hasGrokPermission(req.apiKey)) {
      logger.security(
        `🚫 API Key ${req.apiKey?.id || 'unknown'} 缺少 Grok 权限，拒绝访问 ${req.originalUrl}`
      )
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access Grok',
          type: 'permission_denied',
          code: 'permission_denied'
        }
      })
    }

    const sessionHash = sessionHashFromRequest(req)
    const account = await grokScheduler.selectAccount(req.apiKey, sessionHash)
    return grokRelayService.handleRequest(req, res, account, req.apiKey)
  } catch (error) {
    logger.error('Grok relay error:', error)
    const status = error.statusCode || 500
    return res.status(status).json({
      error: {
        message: error.message || 'Internal server error',
        type: status === 402 ? 'no_available_account' : 'internal_error'
      }
    })
  }
}

router.post('/v1/responses', authenticateApiKey, handleGrokRelay)
router.post('/responses', authenticateApiKey, handleGrokRelay)
router.post('/v1/chat/completions', authenticateApiKey, handleGrokRelay)
router.post('/chat/completions', authenticateApiKey, handleGrokRelay)
router.post('/v1/images/generations', authenticateApiKey, handleGrokRelay)
router.post('/images/generations', authenticateApiKey, handleGrokRelay)
router.post('/v1/images/edits', authenticateApiKey, handleGrokRelay)
router.post('/images/edits', authenticateApiKey, handleGrokRelay)
router.post('/v1/videos/generations', authenticateApiKey, handleGrokRelay)
router.post('/videos/generations', authenticateApiKey, handleGrokRelay)

const GROK_MODELS = [
  'grok-4.5',
  'grok-4.3',
  'grok-build-0.1',
  'grok-composer-2.5-fast',
  'grok-4.20-0309-reasoning',
  'grok-4.20-0309-non-reasoning',
  'grok-4.20-multi-agent-0309'
]

router.get(['/v1/models', '/models'], authenticateApiKey, (req, res) => {
  if (!hasGrokPermission(req.apiKey)) {
    return res.status(403).json({
      error: {
        message: 'This API key does not have permission to access Grok',
        type: 'permission_denied',
        code: 'permission_denied'
      }
    })
  }
  return res.json({
    object: 'list',
    data: GROK_MODELS.map((id) => ({
      id,
      object: 'model',
      created: 0,
      owned_by: 'xai'
    }))
  })
})

module.exports = router
