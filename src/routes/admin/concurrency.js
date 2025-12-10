/**
 * 并发管理 API 路由
 * 提供并发状态查看和手动清理功能
 */

const express = require('express')
const router = express.Router()
const redis = require('../../models/redis')
const logger = require('../../utils/logger')
const { authenticateAdmin } = require('../../middleware/auth')

/**
 * GET /admin/concurrency
 * 获取所有并发状态
 */
router.get('/concurrency', authenticateAdmin, async (req, res) => {
  try {
    const status = await redis.getAllConcurrencyStatus()

    // 计算汇总统计
    const summary = {
      totalKeys: status.length,
      totalActiveRequests: status.reduce((sum, s) => sum + s.activeCount, 0),
      totalExpiredRequests: status.reduce((sum, s) => sum + s.expiredCount, 0)
    }

    res.json({
      success: true,
      summary,
      concurrencyStatus: status
    })
  } catch (error) {
    logger.error('❌ Failed to get concurrency status:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get concurrency status',
      message: error.message
    })
  }
})

/**
 * GET /admin/concurrency/:apiKeyId
 * 获取特定 API Key 的并发状态详情
 */
router.get('/concurrency/:apiKeyId', authenticateAdmin, async (req, res) => {
  try {
    const { apiKeyId } = req.params
    const status = await redis.getConcurrencyStatus(apiKeyId)

    res.json({
      success: true,
      concurrencyStatus: status
    })
  } catch (error) {
    logger.error(`❌ Failed to get concurrency status for ${req.params.apiKeyId}:`, error)
    res.status(500).json({
      success: false,
      error: 'Failed to get concurrency status',
      message: error.message
    })
  }
})

/**
 * DELETE /admin/concurrency/:apiKeyId
 * 强制清理特定 API Key 的并发计数
 */
router.delete('/concurrency/:apiKeyId', authenticateAdmin, async (req, res) => {
  try {
    const { apiKeyId } = req.params
    const result = await redis.forceClearConcurrency(apiKeyId)

    logger.warn(
      `🧹 Admin ${req.admin?.username || 'unknown'} force cleared concurrency for key ${apiKeyId}`
    )

    res.json({
      success: true,
      message: `Successfully cleared concurrency for API key ${apiKeyId}`,
      result
    })
  } catch (error) {
    logger.error(`❌ Failed to clear concurrency for ${req.params.apiKeyId}:`, error)
    res.status(500).json({
      success: false,
      error: 'Failed to clear concurrency',
      message: error.message
    })
  }
})

/**
 * DELETE /admin/concurrency
 * 强制清理所有并发计数
 */
router.delete('/concurrency', authenticateAdmin, async (req, res) => {
  try {
    const result = await redis.forceClearAllConcurrency()

    logger.warn(`🧹 Admin ${req.admin?.username || 'unknown'} force cleared ALL concurrency`)

    res.json({
      success: true,
      message: 'Successfully cleared all concurrency',
      result
    })
  } catch (error) {
    logger.error('❌ Failed to clear all concurrency:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to clear all concurrency',
      message: error.message
    })
  }
})

/**
 * POST /admin/concurrency/cleanup
 * 清理过期的并发条目（不影响活跃请求）
 */
router.post('/concurrency/cleanup', authenticateAdmin, async (req, res) => {
  try {
    const { apiKeyId } = req.body
    const result = await redis.cleanupExpiredConcurrency(apiKeyId || null)

    logger.info(`🧹 Admin ${req.admin?.username || 'unknown'} cleaned up expired concurrency`)

    res.json({
      success: true,
      message: apiKeyId
        ? `Successfully cleaned up expired concurrency for API key ${apiKeyId}`
        : 'Successfully cleaned up all expired concurrency',
      result
    })
  } catch (error) {
    logger.error('❌ Failed to cleanup expired concurrency:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup expired concurrency',
      message: error.message
    })
  }
})

module.exports = router
