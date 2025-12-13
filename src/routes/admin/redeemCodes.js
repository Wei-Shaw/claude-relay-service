const express = require('express')
const { authenticateAdmin } = require('../../middleware/auth')
const redeemCodeService = require('../../services/redeemCodeService')
const logger = require('../../utils/logger')

const router = express.Router()

// 🎟️ 创建兑换码（管理员）
router.post('/redeem-codes', authenticateAdmin, async (req, res) => {
  try {
    const { extendDays, extendValue, extendUnit, quantity } = req.body || {}
    const adminUsername = req.admin?.username || 'admin'

    const result = await redeemCodeService.createRedeemCodes({
      extendValue: extendValue ?? extendDays,
      extendUnit: extendUnit || 'days',
      quantity,
      createdBy: adminUsername
    })

    return res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('❌ Failed to create redeem codes:', error)
    return res.status(400).json({
      success: false,
      error: 'Failed to create redeem codes',
      message: error.message
    })
  }
})

// 🔍 查询兑换码列表（管理员）
router.get('/redeem-codes', authenticateAdmin, async (req, res) => {
  try {
    const { status, q, limit } = req.query || {}

    const result = await redeemCodeService.listRedeemCodes({
      status,
      q,
      limit
    })

    return res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('❌ Failed to list redeem codes:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to list redeem codes',
      message: error.message
    })
  }
})

// 🗑️ 批量删除未使用兑换码（管理员）
router.delete('/redeem-codes', authenticateAdmin, async (req, res) => {
  try {
    const { codes } = req.body || {}

    const result = await redeemCodeService.deleteRedeemCodes({ codes })

    return res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('❌ Failed to delete redeem codes:', error)
    return res.status(400).json({
      success: false,
      error: 'Failed to delete redeem codes',
      message: error.message
    })
  }
})

module.exports = router
