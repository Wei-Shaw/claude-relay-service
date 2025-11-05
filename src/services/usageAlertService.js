const redis = require('../models/redis')
const logger = require('../utils/logger')
const webhookService = require('./webhookService')
const claudeAccountService = require('./claudeAccountService')
const claudeConsoleAccountService = require('./claudeConsoleAccountService')
const config = require('../../config/config')

/**
 * 使用额度告警服务
 * 监控 Claude 账号的使用情况，当达到阈值时发送告警
 */
class UsageAlertService {
  constructor() {
    // 告警阈值配置（百分比）
    this.thresholds = [
      { level: 80, key: '80' },
      { level: 90, key: '90' }
    ]

    // 检查间隔（默认每小时检查一次）
    this.checkInterval = parseInt(process.env.USAGE_ALERT_CHECK_INTERVAL) || 60 * 60 * 1000 // 1 hour

    // 告警抑制时间（避免重复告警，默认24小时）
    this.alertSuppressionTime =
      parseInt(process.env.USAGE_ALERT_SUPPRESSION_TIME) || 24 * 60 * 60 * 1000 // 24 hours

    // 是否启用告警
    this.enabled = process.env.USAGE_ALERT_ENABLED !== 'false'

    // 定时器引用
    this.intervalId = null

    logger.info('📊 Usage Alert Service initialized', {
      enabled: this.enabled,
      checkInterval: `${this.checkInterval / 1000}s`,
      alertSuppressionTime: `${this.alertSuppressionTime / 1000}s`,
      thresholds: this.thresholds.map((t) => `${t.level}%`)
    })
  }

  /**
   * 启动告警服务
   */
  async start() {
    if (!this.enabled) {
      logger.info('⏸️  Usage Alert Service is disabled')
      return
    }

    logger.info('🚀 Starting Usage Alert Service...')

    // 立即执行一次检查
    await this.checkAllAccounts()

    // 设置定期检查
    this.intervalId = setInterval(async () => {
      try {
        await this.checkAllAccounts()
      } catch (error) {
        logger.error('❌ Usage alert check failed:', error)
      }
    }, this.checkInterval)

    logger.info(`✅ Usage Alert Service started, checking every ${this.checkInterval / 1000}s`)
  }

  /**
   * 停止告警服务
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      logger.info('🛑 Usage Alert Service stopped')
    }
  }

  /**
   * 检查所有账号的使用情况
   */
  async checkAllAccounts() {
    try {
      logger.debug('🔍 Checking usage for all Claude accounts...')

      // 获取所有 Claude 账号（claude-official 和 claude-console）
      const officialAccounts = await claudeAccountService.getAllAccounts()
      const consoleAccounts = await claudeConsoleAccountService.getAllAccounts()

      const allAccounts = [
        ...officialAccounts.map((acc) => ({ ...acc, accountType: 'claude-official' })),
        ...consoleAccounts.map((acc) => ({ ...acc, accountType: 'claude-console' }))
      ]

      logger.debug(`📋 Found ${allAccounts.length} Claude accounts to check`)

      let alertCount = 0

      // 检查每个账号
      for (const account of allAccounts) {
        try {
          // 只检查活跃账号
          if (account.status !== 'active' || account.isActive !== 'true') {
            continue
          }

          const shouldAlert = await this.checkAccountUsage(account)
          if (shouldAlert) {
            alertCount++
          }
        } catch (error) {
          logger.error(`❌ Failed to check usage for account ${account.name}:`, error)
        }
      }

      if (alertCount > 0) {
        logger.info(`📢 Sent ${alertCount} usage alerts`)
      } else {
        logger.debug('✅ All accounts within usage limits')
      }
    } catch (error) {
      logger.error('❌ Failed to check all accounts:', error)
      throw error
    }
  }

  /**
   * 检查单个账号的使用情况
   * @param {Object} account - 账号信息
   * @returns {boolean} - 是否发送了告警
   */
  async checkAccountUsage(account) {
    try {
      // 获取账号的订阅信息
      const subscriptionInfo = this.getSubscriptionInfo(account)
      if (!subscriptionInfo || !subscriptionInfo.monthlyLimit) {
        logger.debug(`⏭️  Skipping account ${account.name}: no subscription info or monthly limit`)
        return false
      }

      // 获取账号的使用情况
      const usage = await this.getAccountUsage(account)
      if (!usage) {
        logger.debug(`⏭️  Skipping account ${account.name}: unable to get usage data`)
        return false
      }

      // 计算使用百分比
      const usagePercent = (usage.totalCost / subscriptionInfo.monthlyLimit) * 100

      logger.debug(
        `📊 Account ${account.name}: ${usage.totalCost.toFixed(2)}/${subscriptionInfo.monthlyLimit} USD (${usagePercent.toFixed(1)}%)`
      )

      // 检查是否超过任何阈值
      for (const threshold of this.thresholds) {
        if (usagePercent >= threshold.level) {
          // 检查是否已经发送过告警（避免重复告警）
          const alreadyAlerted = await this.hasRecentAlert(account.id, threshold.key)
          if (!alreadyAlerted) {
            await this.sendAlert(account, usage, subscriptionInfo, threshold.level, usagePercent)
            await this.markAlertSent(account.id, threshold.key)
            return true
          } else {
            logger.debug(
              `⏭️  Skipping alert for ${account.name} at ${threshold.level}%: recently alerted`
            )
          }
        }
      }

      return false
    } catch (error) {
      logger.error(`❌ Failed to check usage for account ${account.name}:`, error)
      return false
    }
  }

  /**
   * 获取账号的订阅信息
   * @param {Object} account - 账号信息
   * @returns {Object|null} - 订阅信息
   */
  getSubscriptionInfo(account) {
    try {
      if (!account.subscriptionInfo || account.subscriptionInfo === '') {
        return null
      }

      const subscriptionInfo =
        typeof account.subscriptionInfo === 'string'
          ? JSON.parse(account.subscriptionInfo)
          : account.subscriptionInfo

      // 支持不同格式的订阅信息
      // 格式1: { monthlyLimit: 100 } (USD)
      // 格式2: { plan: 'pro', limit: { monthly: 100 } }
      // 格式3: { quota: { monthly: 100 } }
      let monthlyLimit = null

      if (subscriptionInfo.monthlyLimit) {
        monthlyLimit = subscriptionInfo.monthlyLimit
      } else if (subscriptionInfo.limit && subscriptionInfo.limit.monthly) {
        monthlyLimit = subscriptionInfo.limit.monthly
      } else if (subscriptionInfo.quota && subscriptionInfo.quota.monthly) {
        monthlyLimit = subscriptionInfo.quota.monthly
      }

      if (!monthlyLimit || monthlyLimit <= 0) {
        return null
      }

      return {
        ...subscriptionInfo,
        monthlyLimit
      }
    } catch (error) {
      logger.error(`❌ Failed to parse subscription info for ${account.name}:`, error)
      return null
    }
  }

  /**
   * 获取账号的使用情况
   * @param {Object} account - 账号信息
   * @returns {Object|null} - 使用情况 { totalCost, inputTokens, outputTokens, requestCount }
   */
  async getAccountUsage(account) {
    try {
      // 获取当前月份的使用数据
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const currentMonth = `${year}-${month}`

      // 从 Redis 获取账号的月度使用统计
      // 键格式: account_usage:monthly:{accountId}:{month}
      const usageKey = `account_usage:monthly:${account.id}:${currentMonth}`
      const usageData = await redis.hgetall(usageKey)

      if (!usageData || Object.keys(usageData).length === 0) {
        // 如果没有月度统计，尝试获取总使用统计
        const totalUsageKey = `account_usage:${account.id}`
        const totalUsageData = await redis.hgetall(totalUsageKey)

        if (!totalUsageData || Object.keys(totalUsageData).length === 0) {
          return null
        }

        // 使用总统计数据
        return {
          totalCost: parseFloat(totalUsageData.totalCost || 0),
          inputTokens: parseInt(totalUsageData.inputTokens || 0),
          outputTokens: parseInt(totalUsageData.outputTokens || 0),
          requestCount: parseInt(totalUsageData.requestCount || 0)
        }
      }

      // 返回月度统计数据
      return {
        totalCost: parseFloat(usageData.totalCost || 0),
        inputTokens: parseInt(usageData.inputTokens || 0),
        outputTokens: parseInt(usageData.outputTokens || 0),
        requestCount: parseInt(usageData.requestCount || 0)
      }
    } catch (error) {
      logger.error(`❌ Failed to get usage for account ${account.name}:`, error)
      return null
    }
  }

  /**
   * 发送使用额度告警
   * @param {Object} account - 账号信息
   * @param {Object} usage - 使用情况
   * @param {Object} subscriptionInfo - 订阅信息
   * @param {number} threshold - 告警阈值
   * @param {number} usagePercent - 实际使用百分比
   */
  async sendAlert(account, usage, subscriptionInfo, threshold, usagePercent) {
    try {
      const alertData = {
        accountName: account.name,
        accountId: account.id,
        platform: account.accountType || account.platform || 'claude',
        threshold: `${threshold}%`,
        usage: usagePercent.toFixed(1),
        usageCost: usage.totalCost.toFixed(2),
        monthlyLimit: subscriptionInfo.monthlyLimit.toFixed(2),
        remainingCost: (subscriptionInfo.monthlyLimit - usage.totalCost).toFixed(2),
        inputTokens: usage.inputTokens.toLocaleString(),
        outputTokens: usage.outputTokens.toLocaleString(),
        requestCount: usage.requestCount.toLocaleString(),
        message: `账号 "${account.name}" 使用额度已达 ${usagePercent.toFixed(1)}%（${usage.totalCost.toFixed(2)}/${subscriptionInfo.monthlyLimit.toFixed(2)} USD），剩余额度 ${(subscriptionInfo.monthlyLimit - usage.totalCost).toFixed(2)} USD`
      }

      logger.warn(`⚠️  Usage alert for ${account.name}: ${alertData.message}`)

      // 发送 webhook 通知
      await webhookService.sendNotification('quotaWarning', alertData)

      logger.info(`✅ Usage alert sent for ${account.name} at ${threshold}% threshold`)
    } catch (error) {
      logger.error(`❌ Failed to send usage alert for ${account.name}:`, error)
    }
  }

  /**
   * 检查是否最近已发送过告警
   * @param {string} accountId - 账号ID
   * @param {string} thresholdKey - 阈值键（80, 90）
   * @returns {boolean} - 是否最近已告警
   */
  async hasRecentAlert(accountId, thresholdKey) {
    try {
      const alertKey = `usage_alert:${accountId}:${thresholdKey}`
      const lastAlertTime = await redis.get(alertKey)

      if (!lastAlertTime) {
        return false
      }

      const lastAlertTimestamp = parseInt(lastAlertTime)
      const now = Date.now()

      // 检查是否在抑制时间内
      return now - lastAlertTimestamp < this.alertSuppressionTime
    } catch (error) {
      logger.error('❌ Failed to check alert status:', error)
      return false
    }
  }

  /**
   * 标记告警已发送
   * @param {string} accountId - 账号ID
   * @param {string} thresholdKey - 阈值键（80, 90）
   */
  async markAlertSent(accountId, thresholdKey) {
    try {
      const alertKey = `usage_alert:${accountId}:${thresholdKey}`
      const now = Date.now()

      // 设置告警时间戳，带过期时间
      await redis.setex(alertKey, Math.floor(this.alertSuppressionTime / 1000), now.toString())
    } catch (error) {
      logger.error('❌ Failed to mark alert sent:', error)
    }
  }

  /**
   * 手动触发检查（用于测试）
   */
  async triggerCheck() {
    logger.info('🔧 Manually triggering usage check...')
    await this.checkAllAccounts()
  }

  /**
   * 清除指定账号的告警记录（用于测试）
   * @param {string} accountId - 账号ID
   */
  async clearAlertHistory(accountId) {
    try {
      for (const threshold of this.thresholds) {
        const alertKey = `usage_alert:${accountId}:${threshold.key}`
        await redis.del(alertKey)
      }
      logger.info(`✅ Cleared alert history for account ${accountId}`)
    } catch (error) {
      logger.error(`❌ Failed to clear alert history for account ${accountId}:`, error)
    }
  }
}

module.exports = new UsageAlertService()
