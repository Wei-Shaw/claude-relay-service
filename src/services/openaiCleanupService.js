/**
 * OpenAI账户定期清理服务
 * 定期检查并恢复临时错误状态的账户
 */

const logger = require('../utils/logger')
const openaiAccountService = require('./openaiAccountService')
const webhookService = require('./webhookService')
const openaiResponsesAccountService = require('./openaiResponsesAccountService')

class OpenAICleanupService {
  constructor() {
    this.cleanupInterval = null
    this.isRunning = false
    // 默认每分钟检查一次（比限流清理更频繁，确保及时恢复）
    this.intervalMs = 60 * 1000
  }

  /**
   * 启动自动清理服务
   * @param {number} intervalSeconds - 检查间隔（秒），默认60秒
   */
  start(intervalSeconds = 60) {
    if (this.cleanupInterval) {
      logger.warn('⚠️ OpenAI cleanup service is already running')
      return
    }

    this.intervalMs = intervalSeconds * 1000

    logger.info(`🧹 Starting OpenAI cleanup service (interval: ${intervalSeconds} seconds)`)

    // 立即执行一次清理
    this.performCleanup()

    // 设置定期执行
    this.cleanupInterval = setInterval(() => {
      this.performCleanup()
    }, this.intervalMs)
  }

  /**
   * 停止自动清理服务
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
      logger.info('🛑 OpenAI cleanup service stopped')
    }
  }

  /**
   * 执行一次清理检查
   */
  async performCleanup() {
    if (this.isRunning) {
      logger.debug('⏭️ OpenAI cleanup already in progress, skipping this cycle')
      return
    }

    this.isRunning = true
    const startTime = Date.now()

    try {
      logger.debug('🔍 Starting OpenAI temp error cleanup check...')

      // 检查并恢复临时错误账户
      const [oaResult, responsesResult] = await Promise.all([
        openaiAccountService.checkAndRecoverTempErrorAccounts(),
        openaiResponsesAccountService.checkAndRecoverTempErrorAccounts()
      ])

      const duration = Date.now() - startTime

      const recoveredTotal = (oaResult?.recovered || 0) + (responsesResult?.recovered || 0)
      if (recoveredTotal > 0) {
        logger.info(
          `✅ OpenAI cleanup completed: ${recoveredTotal} accounts recovered (openai: ${oaResult.recovered || 0}, responses: ${responsesResult.recovered || 0}) in ${duration}ms`
        )

        // 如果有账户恢复，发送汇总通知（使用统一 sendNotification 接口）
        try {
          await webhookService.sendNotification('rateLimitRecovery', {
            platform: 'openai',
            totalAccounts: recoveredTotal,
            message: `${recoveredTotal} OpenAI/OpenAI-Responses account(s) auto-recovered from temporary error state`
          })
        } catch (webhookError) {
          logger.error('Failed to send recovery notification:', webhookError)
        }
      } else if ((oaResult.checked || 0) + (responsesResult.checked || 0) > 0) {
        logger.debug(
          `🔍 OpenAI cleanup check completed: ${(oaResult.checked || 0) + (responsesResult.checked || 0)} accounts checked, none needed recovery (${duration}ms)`
        )
      }
    } catch (error) {
      logger.error('❌ OpenAI cleanup service error:', error)
    } finally {
      this.isRunning = false
    }
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      running: !!this.cleanupInterval,
      intervalMs: this.intervalMs,
      isProcessing: this.isRunning
    }
  }
}

// 创建单例实例
const openaiCleanupService = new OpenAICleanupService()

module.exports = openaiCleanupService
