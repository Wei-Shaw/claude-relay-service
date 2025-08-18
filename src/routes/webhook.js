const express = require('express')
const router = express.Router()
const logger = require('../utils/logger')
const webhookNotifier = require('../utils/webhookNotifier')
const { authenticateAdmin } = require('../middleware/auth')

// 测试Webhook连通性
router.post('/test', authenticateAdmin, async (req, res) => {
  try {
    const { url } = req.body

    if (!url) {
      return res.status(400).json({
        error: 'Missing webhook URL',
        message: 'Please provide a webhook URL to test'
      })
    }

    // 验证URL格式
    try {
      new URL(url)
    } catch (urlError) {
      return res.status(400).json({
        error: 'Invalid URL format',
        message: 'Please provide a valid webhook URL'
      })
    }

    logger.info(`🧪 Testing webhook URL: ${url}`)

    const result = await webhookNotifier.testWebhook(url)

    if (result.success) {
      logger.info(`✅ Webhook test successful for: ${url}`)
      res.json({
        success: true,
        message: 'Webhook test successful',
        url
      })
    } else {
      logger.warn(`❌ Webhook test failed for: ${url} - ${result.error}`)
      res.status(400).json({
        success: false,
        message: 'Webhook test failed',
        url,
        error: result.error
      })
    }
  } catch (error) {
    logger.error('❌ Webhook test error:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to test webhook'
    })
  }
})

// 手动触发账号异常通知（用于测试）
router.post('/test-notification', authenticateAdmin, async (req, res) => {
  try {
    const {
      accountId = 'test-account-id',
      accountName = 'Test Account',
      platform = 'claude-oauth',
      status = 'error',
      errorCode = 'TEST_ERROR',
      reason = 'Manual test notification'
    } = req.body

    logger.info(`🧪 Sending test notification for account: ${accountName}`)

    await webhookNotifier.sendAccountAnomalyNotification({
      accountId,
      accountName,
      platform,
      status,
      errorCode,
      reason
    })

    logger.info(`✅ Test notification sent successfully`)

    res.json({
      success: true,
      message: 'Test notification sent successfully',
      data: {
        accountId,
        accountName,
        platform,
        status,
        errorCode,
        reason
      }
    })
  } catch (error) {
    logger.error('❌ Failed to send test notification:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to send test notification'
    })
  }
})

// 获取Webhook配置信息
router.get('/config', authenticateAdmin, (req, res) => {
  const config = require('../../config/config')

  res.json({
    success: true,
    config: {
      enabled: config.webhook?.enabled !== false,
      urls: config.webhook?.urls || [],
      timeout: config.webhook?.timeout || 10000,
      retries: config.webhook?.retries || 3,
      urlCount: (config.webhook?.urls || []).length
    }
  })
})

module.exports = router
