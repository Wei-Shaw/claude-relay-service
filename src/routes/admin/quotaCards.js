/**
 * 额度卡/时间卡管理路由
 */
const express = require('express')
const router = express.Router()
const quotaCardService = require('../../services/quotaCardService')
const apiKeyService = require('../../services/apiKeyService')
const logger = require('../../utils/logger')
const { authenticateAdmin } = require('../../middleware/auth')

// ═══════════════════════════════════════════════════════════════════════════
// 额度卡管理
// ═══════════════════════════════════════════════════════════════════════════

// 获取额度卡上限配置
router.get('/quota-cards/limits', authenticateAdmin, async (req, res) => {
  try {
    const config = await quotaCardService.getLimitsConfig()
    res.json({ success: true, data: config })
  } catch (error) {
    logger.error('❌ Failed to get quota card limits:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 更新额度卡上限配置
router.put('/quota-cards/limits', authenticateAdmin, async (req, res) => {
  try {
    const { enabled, maxExpiryDays, maxTotalCostLimit } = req.body
    const config = await quotaCardService.saveLimitsConfig({
      enabled,
      maxExpiryDays,
      maxTotalCostLimit
    })
    res.json({ success: true, data: config })
  } catch (error) {
    logger.error('❌ Failed to save quota card limits:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 获取额度卡列表
router.get('/quota-cards', authenticateAdmin, async (req, res) => {
  try {
    const { status, limit = 100, offset = 0 } = req.query
    const result = await quotaCardService.getAllCards({
      status,
      limit: parseInt(limit),
      offset: parseInt(offset)
    })

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('❌ Failed to get quota cards:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 获取额度卡统计
router.get('/quota-cards/stats', authenticateAdmin, async (req, res) => {
  try {
    const stats = await quotaCardService.getCardStats()
    res.json({
      success: true,
      data: stats
    })
  } catch (error) {
    logger.error('❌ Failed to get quota card stats:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 获取单个额度卡详情
router.get('/quota-cards/:id', authenticateAdmin, async (req, res) => {
  try {
    const card = await quotaCardService.getCardById(req.params.id)
    if (!card) {
      return res.status(404).json({
        success: false,
        error: 'Card not found'
      })
    }

    res.json({
      success: true,
      data: card
    })
  } catch (error) {
    logger.error('❌ Failed to get quota card:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 创建额度卡
router.post('/quota-cards', authenticateAdmin, async (req, res) => {
  try {
    const { type, quotaAmount, timeAmount, timeUnit, expiresAt, note, count = 1 } = req.body

    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'type is required'
      })
    }

    const createdBy = req.session?.username || 'admin'
    const options = {
      type,
      quotaAmount: parseFloat(quotaAmount || 0),
      timeAmount: parseInt(timeAmount || 0),
      timeUnit: timeUnit || 'days',
      expiresAt,
      note,
      createdBy
    }

    let result
    if (count > 1) {
      result = await quotaCardService.createCardsBatch(options, Math.min(count, 100))
    } else {
      result = await quotaCardService.createCard(options)
    }

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('❌ Failed to create quota card:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 删除未使用的额度卡
router.delete('/quota-cards/:id', authenticateAdmin, async (req, res) => {
  try {
    const result = await quotaCardService.deleteCard(req.params.id)
    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('❌ Failed to delete quota card:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// 核销记录管理
// ═══════════════════════════════════════════════════════════════════════════

// 获取核销记录列表
router.get('/redemptions', authenticateAdmin, async (req, res) => {
  try {
    const { userId, apiKeyId, limit = 100, offset = 0 } = req.query
    const result = await quotaCardService.getRedemptions({
      userId,
      apiKeyId,
      limit: parseInt(limit),
      offset: parseInt(offset)
    })

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('❌ Failed to get redemptions:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 撤销核销
router.post('/redemptions/:id/revoke', authenticateAdmin, async (req, res) => {
  try {
    const { reason } = req.body
    const revokedBy = req.session?.username || 'admin'

    const result = await quotaCardService.revokeRedemption(req.params.id, revokedBy, reason)

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('❌ Failed to revoke redemption:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 延长有效期
router.post('/api-keys/:id/extend-expiry', authenticateAdmin, async (req, res) => {
  try {
    const { amount, unit = 'days' } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'amount must be a positive number'
      })
    }

    const result = await apiKeyService.extendExpiry(req.params.id, parseInt(amount), unit)

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('❌ Failed to extend expiry:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

module.exports = router
