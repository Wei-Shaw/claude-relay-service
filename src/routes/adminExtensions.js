const express = require('express')
const router = express.Router()
const { authenticateAdminOrPermanentKey } = require('../middleware/permanentAuth')
const apiKeyService = require('../services/apiKeyService')
const logger = require('../utils/logger')

// POST /admin/api-keys - 支持永久API-KEY认证
router.post('/api-keys', authenticateAdminOrPermanentKey, async (req, res) => {
  try {
    const {
      name,
      description,
      tokenLimit,
      expiresAt,
      claudeAccountId,
      claudeConsoleAccountId,
      geminiAccountId,
      openaiAccountId,
      bedrockAccountId,
      droidAccountId,
      permissions,
      concurrencyLimit,
      rateLimitWindow,
      rateLimitRequests,
      rateLimitCost,
      enableModelRestriction,
      restrictedModels,
      enableClientRestriction,
      allowedClients,
      dailyCostLimit,
      totalCostLimit,
      weeklyOpusCostLimit,
      tags,
      activationDays,
      activationUnit,
      expirationMode,
      icon
    } = req.body

    // 输入验证
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required and must be a non-empty string' })
    }
    if (name.length > 100) {
      return res.status(400).json({ error: 'Name must be less than 100 characters' })
    }
    if (description && (typeof description !== 'string' || description.length > 500)) {
      return res
        .status(400)
        .json({ error: 'Description must be a string with less than 500 characters' })
    }
    if (tokenLimit && (!Number.isInteger(Number(tokenLimit)) || Number(tokenLimit) < 0)) {
      return res.status(400).json({ error: 'Token limit must be a non-negative integer' })
    }

    // 查找并删除所有同名的API Keys（仅在存在时处理）
    const allApiKeys = await apiKeyService.getAllApiKeys()
    const sameNameKeys = allApiKeys.filter(key => key.name === name.trim())

    if (sameNameKeys.length > 0) {
      logger.info(`🔍 Found ${sameNameKeys.length} API key(s) with name "${name}", deleting them first...`)

      for (const key of sameNameKeys) {
        try {
          await apiKeyService.deleteApiKey(key.id, createdBy, 'admin')
          logger.info(`🗑️ Deleted existing API key: ${key.name} (${key.id})`)
        } catch (deleteError) {
          logger.error(`❌ Failed to delete existing API key ${key.id}:`, deleteError)
          throw new Error(`Failed to delete existing API key ${key.id}: ${deleteError.message}`)
        }
      }
    }

    // 创建API Key
    const createdBy =
      req.admin.username === 'permanent-admin' ? 'permanent-admin' : req.admin.username
    const newKey = await apiKeyService.generateApiKey({
      name,
      description,
      tokenLimit,
      expiresAt,
      claudeAccountId,
      claudeConsoleAccountId,
      geminiAccountId,
      openaiAccountId,
      bedrockAccountId,
      droidAccountId,
      permissions,
      concurrencyLimit,
      rateLimitWindow,
      rateLimitRequests,
      rateLimitCost,
      enableModelRestriction,
      restrictedModels,
      enableClientRestriction,
      allowedClients,
      dailyCostLimit,
      totalCostLimit,
      weeklyOpusCostLimit,
      tags,
      activationDays,
      activationUnit,
      expirationMode,
      icon,
      createdBy
    })

    logger.success(`🔑 ${createdBy} created new API key: ${name}`)
    return res.json({ success: true, data: newKey })
  } catch (error) {
    logger.error('❌ Failed to create API key:', error)
    return res.status(500).json({ error: 'Failed to create API key', message: error.message })
  }
})

// GET /admin/api-keys - 支持永久API-KEY认证
router.get('/api-keys', authenticateAdminOrPermanentKey, async (req, res) => {
  try {
    const apiKeys = await apiKeyService.getAllApiKeys()
    return res.json({
      success: true,
      data: apiKeys.map((key) => ({
        ...key,
        apiKey: key.apiKey ? `${key.apiKey.substring(0, 8)}...` : undefined
      }))
    })
  } catch (error) {
    logger.error('❌ Failed to get API keys:', error)
    return res.status(500).json({ error: 'Failed to get API keys', message: error.message })
  }
})

module.exports = router
