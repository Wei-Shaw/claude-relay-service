/**
 * 并发管理 API 路由
 * 提供并发状态查看和手动清理功能
 */

const express = require('express')
const router = express.Router()
const redis = require('../../models/redis')
const logger = require('../../utils/logger')
const { authenticateAdmin } = require('../../middleware/auth')
const { calculateWaitTimeStats } = require('../../utils/statsHelper')

/**
 * GET /admin/concurrency
 * 获取所有并发状态
 */
router.get('/concurrency', authenticateAdmin, async (req, res) => {
  try {
    const status = await redis.getAllConcurrencyStatus()

    // 为每个 API Key 获取排队计数
    const statusWithQueue = await Promise.all(
      status.map(async (s) => {
        const queueCount = await redis.getConcurrencyQueueCount(s.apiKeyId)
        return {
          ...s,
          queueCount
        }
      })
    )

    // 计算汇总统计
    const summary = {
      totalKeys: statusWithQueue.length,
      totalActiveRequests: statusWithQueue.reduce((sum, s) => sum + s.activeCount, 0),
      totalExpiredRequests: statusWithQueue.reduce((sum, s) => sum + s.expiredCount, 0),
      totalQueuedRequests: statusWithQueue.reduce((sum, s) => sum + s.queueCount, 0)
    }

    res.json({
      success: true,
      summary,
      concurrencyStatus: statusWithQueue
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
 * GET /admin/concurrency-queue/stats
 * 获取排队统计信息
 */
router.get('/concurrency-queue/stats', authenticateAdmin, async (req, res) => {
  try {
    // 获取所有有统计数据的 API Key
    const statsKeys = await redis.scanConcurrencyQueueStatsKeys()
    const queueKeys = await redis.scanConcurrencyQueueKeys()

    // 合并所有相关的 API Key
    const allApiKeyIds = [...new Set([...statsKeys, ...queueKeys])]

    // 获取各 API Key 的详细统计
    const perKeyStats = await Promise.all(
      allApiKeyIds.map(async (apiKeyId) => {
        const [queueCount, stats, waitTimes] = await Promise.all([
          redis.getConcurrencyQueueCount(apiKeyId),
          redis.getConcurrencyQueueStats(apiKeyId),
          redis.getQueueWaitTimes(apiKeyId)
        ])

        return {
          apiKeyId,
          currentQueueCount: queueCount,
          stats,
          waitTimeStats: calculateWaitTimeStats(waitTimes)
        }
      })
    )

    // 获取全局等待时间统计
    const globalWaitTimes = await redis.getGlobalQueueWaitTimes()
    const globalWaitTimeStats = calculateWaitTimeStats(globalWaitTimes)

    // 计算全局汇总
    const globalStats = {
      totalEntered: perKeyStats.reduce((sum, s) => sum + s.stats.entered, 0),
      totalSuccess: perKeyStats.reduce((sum, s) => sum + s.stats.success, 0),
      totalTimeout: perKeyStats.reduce((sum, s) => sum + s.stats.timeout, 0),
      totalCancelled: perKeyStats.reduce((sum, s) => sum + s.stats.cancelled, 0),
      totalSocketChanged: perKeyStats.reduce((sum, s) => sum + (s.stats.socket_changed || 0), 0),
      totalRejectedOverload: perKeyStats.reduce(
        (sum, s) => sum + (s.stats.rejected_overload || 0),
        0
      ),
      currentTotalQueued: perKeyStats.reduce((sum, s) => sum + s.currentQueueCount, 0),
      // 队列资源利用率指标
      peakQueueSize:
        perKeyStats.length > 0 ? Math.max(...perKeyStats.map((s) => s.currentQueueCount)) : 0,
      avgQueueSize:
        perKeyStats.length > 0
          ? Math.round(
              perKeyStats.reduce((sum, s) => sum + s.currentQueueCount, 0) / perKeyStats.length
            )
          : 0,
      activeApiKeys: perKeyStats.filter((s) => s.currentQueueCount > 0).length
    }

    // 计算成功率
    if (globalStats.totalEntered > 0) {
      globalStats.successRate = Math.round(
        (globalStats.totalSuccess / globalStats.totalEntered) * 100
      )
      globalStats.timeoutRate = Math.round(
        (globalStats.totalTimeout / globalStats.totalEntered) * 100
      )
      globalStats.cancelledRate = Math.round(
        (globalStats.totalCancelled / globalStats.totalEntered) * 100
      )
    }

    // 从全局等待时间统计中提取关键指标
    if (globalWaitTimeStats) {
      globalStats.avgWaitTimeMs = globalWaitTimeStats.avg
      globalStats.p50WaitTimeMs = globalWaitTimeStats.p50
      globalStats.p90WaitTimeMs = globalWaitTimeStats.p90
      globalStats.p99WaitTimeMs = globalWaitTimeStats.p99
      // 多实例采样策略标记（详见 design.md Decision 9）
      // 全局 P90 仅用于可视化和监控，不用于系统决策
      // 健康检查使用 API Key 级别的 P90（每 Key 独立采样）
      globalWaitTimeStats.globalP90ForVisualizationOnly = true
    }

    res.json({
      success: true,
      globalStats,
      globalWaitTimeStats,
      perKeyStats
    })
  } catch (error) {
    logger.error('❌ Failed to get queue stats:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get queue stats',
      message: error.message
    })
  }
})

/**
 * DELETE /admin/concurrency-queue/:apiKeyId
 * 清理特定 API Key 的排队计数
 */
router.delete('/concurrency-queue/:apiKeyId', authenticateAdmin, async (req, res) => {
  try {
    const { apiKeyId } = req.params
    await redis.clearConcurrencyQueue(apiKeyId)

    logger.warn(`🧹 Admin ${req.admin?.username || 'unknown'} cleared queue for key ${apiKeyId}`)

    res.json({
      success: true,
      message: `Successfully cleared queue for API key ${apiKeyId}`
    })
  } catch (error) {
    logger.error(`❌ Failed to clear queue for ${req.params.apiKeyId}:`, error)
    res.status(500).json({
      success: false,
      error: 'Failed to clear queue',
      message: error.message
    })
  }
})

/**
 * DELETE /admin/concurrency-queue
 * 清理所有排队计数
 */
router.delete('/concurrency-queue', authenticateAdmin, async (req, res) => {
  try {
    const cleared = await redis.clearAllConcurrencyQueues()

    logger.warn(`🧹 Admin ${req.admin?.username || 'unknown'} cleared ALL queues`)

    res.json({
      success: true,
      message: 'Successfully cleared all queues',
      cleared
    })
  } catch (error) {
    logger.error('❌ Failed to clear all queues:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to clear all queues',
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
    const queueCount = await redis.getConcurrencyQueueCount(apiKeyId)

    res.json({
      success: true,
      concurrencyStatus: {
        ...status,
        queueCount
      }
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
