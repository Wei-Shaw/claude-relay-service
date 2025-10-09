const express = require('express')
const { authenticateApiKey } = require('../middleware/auth')
const droidRelayService = require('../services/droidRelayService')
const logger = require('../utils/logger')

const router = express.Router()

/**
 * Droid API 转发路由
 *
 * 支持多种 Factory.ai 端点:
 * - /droid/claude - Anthropic (Claude) Messages API
 * - /droid/openai - OpenAI Responses API
 * - /droid/chat - OpenAI Chat Completions API (通用)
 */

// Claude (Anthropic) 端点 - /v1/messages
router.post('/claude/v1/messages', authenticateApiKey, async (req, res) => {
  try {
    const result = await droidRelayService.relayRequest(
      req.body,
      req.apiKey,
      req,
      res,
      req.headers,
      { endpointType: 'anthropic' }
    )

    // 如果是流式响应，已经在 relayService 中处理了
    if (result.streaming) {
      return
    }

    // 非流式响应
    res.status(result.statusCode).set(result.headers).send(result.body)
  } catch (error) {
    logger.error('Droid Claude relay error:', error)
    res.status(500).json({
      error: 'internal_server_error',
      message: error.message
    })
  }
})

// OpenAI 端点 - /v1/responses
router.post('/openai/v1/responses', authenticateApiKey, async (req, res) => {
  try {
    const result = await droidRelayService.relayRequest(
      req.body,
      req.apiKey,
      req,
      res,
      req.headers,
      { endpointType: 'openai' }
    )

    if (result.streaming) {
      return
    }

    res.status(result.statusCode).set(result.headers).send(result.body)
  } catch (error) {
    logger.error('Droid OpenAI relay error:', error)
    res.status(500).json({
      error: 'internal_server_error',
      message: error.message
    })
  }
})

// 通用 OpenAI Chat Completions 端点
router.post('/chat/v1/chat/completions', authenticateApiKey, async (req, res) => {
  try {
    const result = await droidRelayService.relayRequest(
      req.body,
      req.apiKey,
      req,
      res,
      req.headers,
      { endpointType: 'common' }
    )

    if (result.streaming) {
      return
    }

    res.status(result.statusCode).set(result.headers).send(result.body)
  } catch (error) {
    logger.error('Droid Chat relay error:', error)
    res.status(500).json({
      error: 'internal_server_error',
      message: error.message
    })
  }
})

// 模型列表端点（兼容性）
router.get('/*/v1/models', authenticateApiKey, async (req, res) => {
  try {
    // 返回可用的模型列表
    const models = [
      {
        id: 'claude-opus-4-1-20250805',
        object: 'model',
        created: Date.now(),
        owned_by: 'anthropic'
      },
      {
        id: 'claude-sonnet-4-5-20250929',
        object: 'model',
        created: Date.now(),
        owned_by: 'anthropic'
      },
      {
        id: 'gpt-5-2025-08-07',
        object: 'model',
        created: Date.now(),
        owned_by: 'openai'
      }
    ]

    res.json({
      object: 'list',
      data: models
    })
  } catch (error) {
    logger.error('Droid models list error:', error)
    res.status(500).json({
      error: 'internal_server_error',
      message: error.message
    })
  }
})

module.exports = router
