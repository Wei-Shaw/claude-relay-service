const logger = require('../utils/logger')
const claudeConsoleAccountService = require('./claudeConsoleAccountService')
const { formatDateWithTimezone } = require('../utils/dateHelper')

class QuotaResetScheduler {
  constructor() {
    this.checkIntervalId = null
    this.isInitialized = false
    this.checkInterval = 60000 // 每分钟检查一次
    this.lastResetHour = null
  }

  // 🚀 初始化定时任务
  async initialize() {
    if (this.isInitialized) {
      logger.warn('⚠️ Quota reset scheduler already initialized')
      return
    }

    try {
      // 启动时立即检查并重置需要重置的账户
      await this.checkAndResetQuotas()

      // 设置定时检查任务（每分钟检查一次）
      this.checkIntervalId = setInterval(async () => {
        try {
          await this.checkAndResetQuotas()
        } catch (error) {
          logger.error('❌ Error in scheduled quota check:', error)
        }
      }, this.checkInterval)

      this.isInitialized = true
      logger.success('✅ Claude Console quota reset scheduler initialized successfully')
    } catch (error) {
      logger.error('❌ Failed to initialize quota reset scheduler:', error)
      // 清理已设置的interval（如果有）
      if (this.checkIntervalId) {
        clearInterval(this.checkIntervalId)
        this.checkIntervalId = null
      }
      throw error
    }
  }

  // 🔄 检查并重置需要重置的账户额度
  async checkAndResetQuotas() {
    try {
      const now = new Date()

      // 使用 dateHelper 获取系统时区的时间字符串
      const localTimeStr = formatDateWithTimezone(now, false) // 不包含时区后缀
      // 格式为 "YYYY-MM-DD HH:mm:ss"，提取时间部分
      const timeParts = localTimeStr.split(' ')[1].split(':')
      const currentHour = parseInt(timeParts[0])
      const currentMinute = parseInt(timeParts[1])

      // 优化：只获取有额度限制的账户
      const accounts = await claudeConsoleAccountService.getAllAccounts()
      const accountsWithQuota = accounts.filter(
        (account) => account.dailyQuota && parseFloat(account.dailyQuota) > 0
      )

      if (accountsWithQuota.length === 0) {
        return // 没有需要检查的账户
      }

      // 日志显示当前检查时间（带时区）
      const localTimeWithTZ = formatDateWithTimezone(now, true) // 包含时区信息
      logger.debug(
        `🔍 Checking quota reset for ${accountsWithQuota.length} accounts at ${localTimeWithTZ}`
      )

      for (const account of accountsWithQuota) {
        // 获取账户的重置时间（默认00:00）
        const resetTime = account.quotaResetTime || '00:00'
        const [resetHour, resetMinute] = resetTime.split(':').map((n) => parseInt(n))

        // 检查是否到了重置时间
        if (currentHour === resetHour && currentMinute === resetMinute) {
          // 避免在同一分钟内重复重置
          const today = now.toISOString().split('T')[0]
          if (account.lastResetDate !== today) {
            await claudeConsoleAccountService.resetDailyUsage(account.id)
            logger.info(
              `🔄 Reset quota for account: ${account.name} (${account.id}) at ${localTimeWithTZ}`
            )
          }
        }
      }
    } catch (error) {
      logger.error('❌ Failed to check and reset quotas:', error)
    }
  }

  // 🛑 停止定时任务
  stop() {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId)
      this.checkIntervalId = null
      this.isInitialized = false
      logger.info('🛑 Claude Console quota reset scheduler stopped')
    }
  }

  // 🔄 重新加载定时任务
  async reload() {
    logger.info('🔄 Reloading quota reset scheduler...')

    // 停止现有任务
    this.stop()

    // 重新初始化
    await this.initialize()
  }

  // 📊 获取调度器状态
  getStatus() {
    return {
      isRunning: this.isInitialized,
      checkInterval: this.checkInterval,
      nextCheckIn: this.checkIntervalId ? 'Active' : 'Stopped'
    }
  }

  // 🔧 手动触发所有账户的额度重置
  async manualResetAll() {
    logger.info('🔧 Manual quota reset triggered for all Claude Console accounts')

    try {
      await claudeConsoleAccountService.resetAllDailyUsage()
      logger.success('✅ Manual quota reset completed')
      return { success: true, message: 'All Claude Console quotas reset successfully' }
    } catch (error) {
      logger.error('❌ Manual quota reset failed:', error)
      return { success: false, error: error.message }
    }
  }

  // 🔧 手动触发单个账户的额度重置
  async manualResetAccount(accountId) {
    logger.info(`🔧 Manual quota reset triggered for account: ${accountId}`)

    try {
      await claudeConsoleAccountService.resetDailyUsage(accountId)
      logger.success(`✅ Manual quota reset completed for account: ${accountId}`)
      return { success: true, message: `Quota reset successfully for account: ${accountId}` }
    } catch (error) {
      logger.error(`❌ Manual quota reset failed for account ${accountId}:`, error)
      return { success: false, error: error.message }
    }
  }
}

// 创建单例实例
const quotaResetScheduler = new QuotaResetScheduler()

module.exports = quotaResetScheduler
