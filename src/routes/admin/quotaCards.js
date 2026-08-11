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
    const { status, type, search, limit = 100, offset = 0 } = req.query
    const result = await quotaCardService.getAllCards({
      status,
      type,
      search,
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
    const {
      type,
      quotaAmount,
      timeAmount,
      timeUnit,
      expiresAt,
      note,
      count = 1,
      codePrefix
    } = req.body

    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'type is required'
      })
    }

    // 批量数量：规范化为正整数并限制上限，避免 Infinity/超大数阻塞与非整数多创建
    const batchCount = Number(count)
    if (!Number.isInteger(batchCount) || batchCount < 1) {
      return res.status(400).json({
        success: false,
        error: 'count must be a positive integer'
      })
    }
    if (batchCount > quotaCardService.MAX_BATCH_COUNT) {
      return res.status(400).json({
        success: false,
        error: `count must not exceed ${quotaCardService.MAX_BATCH_COUNT}`
      })
    }

    // 卡号前缀：仅允许字符串（不传则使用默认前缀）
    if (codePrefix !== undefined && typeof codePrefix !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'codePrefix must be a string'
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
      codePrefix,
      createdBy
    }

    let result
    if (batchCount > 1) {
      result = await quotaCardService.createCardsBatch(options, batchCount)
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
    // 业务拒绝（卡不存在 404 / 状态不允许 409）按语义化状态码返回，仅未知错误才记为 500 故障
    const statusCode = error.statusCode || 500
    if (statusCode >= 500) {
      logger.error('❌ Failed to delete quota card:', error)
    }
    res.status(statusCode).json({
      success: false,
      error: error.message
    })
  }
})

// 启用/禁用未使用的额度卡
router.post('/quota-cards/:id/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { enabled } = req.body
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled must be a boolean'
      })
    }
    const result = await quotaCardService.setCardEnabled(req.params.id, enabled)
    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    // 业务拒绝（卡不存在 404 / 状态不允许 409）按语义化状态码返回，仅未知错误才记为 500 故障
    const statusCode = error.statusCode || 500
    if (statusCode >= 500) {
      logger.error('❌ Failed to toggle quota card status:', error)
    }
    res.status(statusCode).json({
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
    const { userId, apiKeyId, search, limit = 100, offset = 0 } = req.query
    const result = await quotaCardService.getRedemptions({
      userId,
      apiKeyId,
      search,
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

// 延长有效期（管理员操作；恢复启用 opt-in，但不记快捷调整流水——流水仅限 quick-adjust + 禁用/激活）
router.post('/api-keys/:id/extend-expiry', authenticateAdmin, async (req, res) => {
  try {
    const { amount, unit = 'days' } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'amount must be a positive number'
      })
    }

    const result = await apiKeyService.extendExpiry(req.params.id, parseInt(amount), unit, {
      restoreActiveOnExtend: true,
      operator: req.admin?.username || 'admin',
      operatorType: 'admin'
    })

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
