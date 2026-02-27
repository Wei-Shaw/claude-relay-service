const express = require('express')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')

const router = express.Router()

// 查询账户错误历史
router.get(
  '/accounts/:accountType/:accountId/error-history',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountType, accountId } = req.params
      const offset = parseInt(req.query.offset) || 0
      const limit = parseInt(req.query.limit) || 50
      const data = await upstreamErrorHelper.getErrorHistory(accountType, accountId, offset, limit)
      return res.json({ success: true, data })
    } catch (error) {
      logger.error('Failed to get error history:', error)
      return res.status(500).json({ error: 'Failed to get error history', message: error.message })
    }
  }
)

// 清除账户错误历史
router.delete(
  '/accounts/:accountType/:accountId/error-history',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountType, accountId } = req.params
      await upstreamErrorHelper.clearErrorHistory(accountType, accountId)
      return res.json({ success: true })
    } catch (error) {
      logger.error('Failed to clear error history:', error)
      return res
        .status(500)
        .json({ error: 'Failed to clear error history', message: error.message })
    }
  }
)

module.exports = router
