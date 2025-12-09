/**
 * Claude 转发配置 API 路由
 * 管理全局 Claude Code 限制和会话绑定配置
 */

const express = require('express')
const { authenticateAdmin } = require('../../middleware/auth')
const claudeRelayConfigService = require('../../services/claudeRelayConfigService')
const logger = require('../../utils/logger')

const router = express.Router()

/**
 * GET /admin/claude-relay-config
 * 获取 Claude 转发配置
 */
router.get('/claude-relay-config', authenticateAdmin, async (req, res) => {
  try {
    const config = await claudeRelayConfigService.getConfig()
    return res.json({
      success: true,
      config
    })
  } catch (error) {
    logger.error('❌ Failed to get Claude relay config:', error)
    return res.status(500).json({
      error: 'Failed to get configuration',
      message: error.message
    })
  }
})

/**
 * PUT /admin/claude-relay-config
 * 更新 Claude 转发配置
 */
router.put('/claude-relay-config', authenticateAdmin, async (req, res) => {
  try {
    const {
      claudeCodeOnlyEnabled,
      globalSessionBindingEnabled,
      sessionBindingErrorMessage,
      sessionBindingTtlDays,
      userMessageQueueEnabled,
      userMessageQueueDelayMs,
      userMessageQueueTimeoutMs
    } = req.body

    // 验证输入
    if (claudeCodeOnlyEnabled !== undefined && typeof claudeCodeOnlyEnabled !== 'boolean') {
      return res.status(400).json({ error: 'claudeCodeOnlyEnabled must be a boolean' })
    }

    if (
      globalSessionBindingEnabled !== undefined &&
      typeof globalSessionBindingEnabled !== 'boolean'
    ) {
      return res.status(400).json({ error: 'globalSessionBindingEnabled must be a boolean' })
    }

    if (sessionBindingErrorMessage !== undefined) {
      if (typeof sessionBindingErrorMessage !== 'string') {
        return res.status(400).json({ error: 'sessionBindingErrorMessage must be a string' })
      }
      if (sessionBindingErrorMessage.length > 500) {
        return res
          .status(400)
          .json({ error: 'sessionBindingErrorMessage must be less than 500 characters' })
      }
    }

    if (sessionBindingTtlDays !== undefined) {
      if (
        typeof sessionBindingTtlDays !== 'number' ||
        sessionBindingTtlDays < 1 ||
        sessionBindingTtlDays > 365
      ) {
        return res
          .status(400)
          .json({ error: 'sessionBindingTtlDays must be a number between 1 and 365' })
      }
    }

    // 验证用户消息队列配置
    if (userMessageQueueEnabled !== undefined && typeof userMessageQueueEnabled !== 'boolean') {
      return res.status(400).json({ error: 'userMessageQueueEnabled must be a boolean' })
    }

    if (userMessageQueueDelayMs !== undefined) {
      if (
        typeof userMessageQueueDelayMs !== 'number' ||
        userMessageQueueDelayMs < 0 ||
        userMessageQueueDelayMs > 10000
      ) {
        return res
          .status(400)
          .json({ error: 'userMessageQueueDelayMs must be a number between 0 and 10000' })
      }
    }

    if (userMessageQueueTimeoutMs !== undefined) {
      if (
        typeof userMessageQueueTimeoutMs !== 'number' ||
        userMessageQueueTimeoutMs < 1000 ||
        userMessageQueueTimeoutMs > 300000
      ) {
        return res
          .status(400)
          .json({ error: 'userMessageQueueTimeoutMs must be a number between 1000 and 300000' })
      }
    }

    const updateData = {}
    if (claudeCodeOnlyEnabled !== undefined) {
      updateData.claudeCodeOnlyEnabled = claudeCodeOnlyEnabled
    }
    if (globalSessionBindingEnabled !== undefined) {
      updateData.globalSessionBindingEnabled = globalSessionBindingEnabled
    }
    if (sessionBindingErrorMessage !== undefined) {
      updateData.sessionBindingErrorMessage = sessionBindingErrorMessage
    }
    if (sessionBindingTtlDays !== undefined) {
      updateData.sessionBindingTtlDays = sessionBindingTtlDays
    }
    if (userMessageQueueEnabled !== undefined) {
      updateData.userMessageQueueEnabled = userMessageQueueEnabled
    }
    if (userMessageQueueDelayMs !== undefined) {
      updateData.userMessageQueueDelayMs = userMessageQueueDelayMs
    }
    if (userMessageQueueTimeoutMs !== undefined) {
      updateData.userMessageQueueTimeoutMs = userMessageQueueTimeoutMs
    }

    const updatedConfig = await claudeRelayConfigService.updateConfig(
      updateData,
      req.admin?.username || 'unknown'
    )

    return res.json({
      success: true,
      message: 'Configuration updated successfully',
      config: updatedConfig
    })
  } catch (error) {
    logger.error('❌ Failed to update Claude relay config:', error)
    return res.status(500).json({
      error: 'Failed to update configuration',
      message: error.message
    })
  }
})

/**
 * GET /admin/claude-relay-config/session-bindings
 * 获取会话绑定统计
 */
router.get('/claude-relay-config/session-bindings', authenticateAdmin, async (req, res) => {
  try {
    const stats = await claudeRelayConfigService.getSessionBindingStats()
    return res.json({
      success: true,
      data: stats
    })
  } catch (error) {
    logger.error('❌ Failed to get session binding stats:', error)
    return res.status(500).json({
      error: 'Failed to get session binding statistics',
      message: error.message
    })
  }
})

module.exports = router
