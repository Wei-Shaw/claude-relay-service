const express = require('express')
const { authenticateAdmin } = require('../middleware/auth')
const historyService = require('../services/history/historyService')
const logger = require('../utils/logger')

const router = express.Router()

router.use(authenticateAdmin)

router.get('/sessions', async (req, res) => {
  if (!historyService.config.enabled) {
    return res.status(503).json({
      error: 'HistoryDisabled',
      message: 'Conversation history is currently disabled'
    })
  }

  const { apiKeyId, page = 1, pageSize = 20 } = req.query

  if (!apiKeyId) {
    return res.status(400).json({
      error: 'MissingApiKeyId',
      message: 'Parameter "apiKeyId" is required'
    })
  }

  const numericPage = Number.parseInt(page, 10) || 1
  const numericPageSize = Math.min(Number.parseInt(pageSize, 10) || 20, 100)

  const result = await historyService.listSessions({
    apiKeyId,
    page: numericPage,
    pageSize: numericPageSize
  })

  return res.json({
    success: true,
    sessions: result.sessions,
    total: result.total,
    page: numericPage,
    pageSize: numericPageSize
  })
})

router.get('/sessions/:sessionId/messages', async (req, res) => {
  if (!historyService.config.enabled) {
    return res.status(503).json({
      error: 'HistoryDisabled',
      message: 'Conversation history is currently disabled'
    })
  }

  const { sessionId } = req.params
  const messages = await historyService.getSessionMessages({ sessionId })

  if (!messages.length) {
    return res.status(404).json({
      success: false,
      error: 'SessionNotFound',
      message: 'Session not found or no messages recorded'
    })
  }

  return res.json({
    success: true,
    sessionId,
    messages
  })
})

router.delete('/sessions/:sessionId', async (req, res) => {
  if (!historyService.config.enabled) {
    return res.status(503).json({
      error: 'HistoryDisabled',
      message: 'Conversation history is currently disabled'
    })
  }

  const { sessionId } = req.params

  try {
    const deleted = await historyService.deleteSession({ sessionId })
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'SessionNotFound',
        message: 'Session not found'
      })
    }

    return res.status(200).json({ success: true })
  } catch (error) {
    logger.error('❌ Failed to delete history session:', error)
    return res.status(500).json({
      success: false,
      error: 'DeleteFailed',
      message: 'Failed to delete session'
    })
  }
})

module.exports = router
