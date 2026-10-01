/**
 * 限流状态自动清理服务
 * 定期检查并清理所有类型账号的过期限流状态
 */

const logger = require('../utils/logger')
const openaiAccountService = require('./account/openaiAccountService')
const claudeAccountService = require('./account/claudeAccountService')
const claudeConsoleAccountService = require('./account/claudeConsoleAccountService')
const unifiedOpenAIScheduler = require('./scheduler/unifiedOpenAIScheduler')
const webhookService = require('./webhookService')

class RateLimitCleanupService {
  constructor() {
    this.cleanupInterval = null
    this.isRunning = false
    // 默认每5分钟检查一次
    this.intervalMs = 5 * 60 * 1000
    // 存储已清理的账户信息，用于发送恢复通知
    this.clearedAccounts = []
  }

  /**
   * 启动自动清理服务
   * @param {number} intervalMinutes - 检查间隔（分钟），默认5分钟
   */
  start(intervalMinutes = 5) {
    if (this.cleanupInterval) {
      logger.warn('⚠️ Rate limit cleanup service is already running')
      return
    }

    this.intervalMs = intervalMinutes * 60 * 1000

    logger.info(`🧹 Starting rate limit cleanup service (interval: ${intervalMinutes} minutes)`)

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
      logger.info('🛑 Rate limit cleanup service stopped')
    }
  }

  /**
   * 执行一次清理检查
   */
  async performCleanup() {
    if (this.isRunning) {
      logger.debug('⏭️ Cleanup already in progress, skipping this cycle')
      return
    }

    this.isRunning = true
    const startTime = Date.now()

    try {
      logger.debug('🔍 Starting rate limit cleanup check...')

      const results = {
        openai: { checked: 0, cleared: 0, errors: [] },
        claude: { checked: 0, cleared: 0, errors: [] },
        claudeConsole: { checked: 0, cleared: 0, errors: [] },
        quotaExceeded: { checked: 0, cleared: 0, errors: [] },
        tokenRefresh: { checked: 0, refreshed: 0, errors: [] }
      }

      // 清理 OpenAI 账号
      await this.cleanupOpenAIAccounts(results.openai)

      // 清理 Claude 账号
      await this.cleanupClaudeAccounts(results.claude)

      // Re-read oauth usage so a family lock that no longer matches Anthropic
      // (for example Opus, which has no weekly_scoped row) is deleted on
      // startup and on each cleanup cycle, not only when an admin opens usage.
      try {
        await claudeAccountService.refreshAllOAuthUsageSnapshots()
      } catch (error) {
        logger.warn(`⚠️ Claude usage snapshot refresh failed: ${error.message}`)
      }

      // 清理 Claude Console 账号
      await this.cleanupClaudeConsoleAccounts(results.claudeConsole)

      // 清理 Claude Console 配额超限状态
      await this.cleanupClaudeConsoleQuotaExceeded(results.quotaExceeded)

      // 主动刷新等待重置的 Claude 账户 Token（防止 5小时/7天 等待期间 Token 过期）
      await this.proactiveRefreshClaudeTokens(results.tokenRefresh)

      const totalChecked =
        results.openai.checked +
        results.claude.checked +
        results.claudeConsole.checked +
        results.quotaExceeded.checked
      const totalCleared =
        results.openai.cleared +
        results.claude.cleared +
        results.claudeConsole.cleared +
        results.quotaExceeded.cleared
      const duration = Date.now() - startTime

      if (totalCleared > 0 || results.tokenRefresh.refreshed > 0) {
        logger.info(
          `✅ Rate limit cleanup completed: ${totalCleared}/${totalChecked} accounts cleared, ${results.tokenRefresh.refreshed} tokens refreshed (${duration}ms)`
        )
        logger.info(`   OpenAI: ${results.openai.cleared}/${results.openai.checked}`)
        logger.info(`   Claude: ${results.claude.cleared}/${results.claude.checked}`)
        logger.info(
          `   Claude Console: ${results.claudeConsole.cleared}/${results.claudeConsole.checked}`
        )
        logger.info(
          `   Quota Exceeded: ${results.quotaExceeded.cleared}/${results.quotaExceeded.checked}`
        )
        if (results.tokenRefresh.checked > 0 || results.tokenRefresh.refreshed > 0) {
          logger.info(
            `   Token Refresh: ${results.tokenRefresh.refreshed}/${results.tokenRefresh.checked} refreshed`
          )
        }

        // 发送 webhook 恢复通知
        if (this.clearedAccounts.length > 0) {
          await this.sendRecoveryNotifications()
        }
      } else {
        logger.debug(
          `🔍 Rate limit cleanup check completed: no expired limits found (${duration}ms)`
        )
      }

      // 记录错误
      const allErrors = [
        ...results.openai.errors,
        ...results.claude.errors,
        ...results.claudeConsole.errors,
        ...results.quotaExceeded.errors,
        ...results.tokenRefresh.errors
      ]
      if (allErrors.length > 0) {
        logger.warn(`⚠️ Encountered ${allErrors.length} errors during cleanup:`, allErrors)
      }
    } catch (error) {
      logger.error('❌ Rate limit cleanup failed:', error)
    } finally {
      // 确保无论成功或失败都重置列表，避免重复通知
      this.clearedAccounts = []
      this.isRunning = false
    }
  }

  /**
   * 清理 OpenAI 账号的过期限流
   */
  async cleanupOpenAIAccounts(result) {
    try {
      // 使用服务层获取账户数据
      const accounts = await openaiAccountService.getAllAccounts()

      for (const account of accounts) {
        const { rateLimitStatus } = account
        const isRateLimited =
          rateLimitStatus === 'limited' ||
          (rateLimitStatus &&
            typeof rateLimitStatus === 'object' &&
            (rateLimitStatus.status === 'limited' || rateLimitStatus.isRateLimited === true))

        if (isRateLimited) {
          result.checked++

          try {
            // 使用 unifiedOpenAIScheduler 的检查方法，它会自动清除过期的限流
            const isStillLimited = await unifiedOpenAIScheduler.isAccountRateLimited(account.id)

            if (!isStillLimited) {
              result.cleared++
              logger.info(
                `🧹 Auto-cleared expired rate limit for OpenAI account: ${account.name} (${account.id})`
              )

              // 记录已清理的账户信息
              this.clearedAccounts.push({
                platform: 'OpenAI',
                accountId: account.id,
                accountName: account.name,
                previousStatus: 'rate_limited',
                currentStatus: 'active'
              })
            }
          } catch (error) {
            result.errors.push({
              accountId: account.id,
              accountName: account.name,
              error: error.message
            })
          }
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup OpenAI accounts:', error)
      result.errors.push({ error: error.message })
    }
  }

  /**
   * 清理 Claude 账号的过期限流
   */
  async cleanupClaudeAccounts(result) {
    try {
      // 使用 Redis 获取账户数据
      const redis = require('../models/redis')
      const accounts = await redis.getAllClaudeAccounts()

      for (const account of accounts) {
        // 检查是否处于限流状态（兼容对象和字符串格式）
        const isRateLimited =
          account.rateLimitStatus === 'limited' ||
          (account.rateLimitStatus &&
            typeof account.rateLimitStatus === 'object' &&
            account.rateLimitStatus.status === 'limited')

        const autoStopped = account.rateLimitAutoStopped === 'true'
        const needsAutoStopRecovery =
          autoStopped && (account.rateLimitEndAt || account.schedulable === 'false')

        // 检查所有可能处于限流状态的账号，包括自动停止的账号
        if (isRateLimited || account.rateLimitedAt || needsAutoStopRecovery) {
          result.checked++

          try {
            // 使用 claudeAccountService 的检查方法，它会自动清除过期的限流
            const isStillLimited = await claudeAccountService.isAccountRateLimited(account.id)

            if (!isStillLimited) {
              if (!isRateLimited && autoStopped) {
                await claudeAccountService.removeAccountRateLimit(account.id)
              }
              result.cleared++
              logger.info(
                `🧹 Auto-cleared expired rate limit for Claude account: ${account.name} (${account.id})`
              )

              // 记录已清理的账户信息
              this.clearedAccounts.push({
                platform: 'Claude',
                accountId: account.id,
                accountName: account.name,
                previousStatus: 'rate_limited',
                currentStatus: 'active'
              })
            }
          } catch (error) {
            result.errors.push({
              accountId: account.id,
              accountName: account.name,
              error: error.message
            })
          }
        }
      }

      // 检查并恢复因5小时限制被自动停止的账号
      try {
        const fiveHourResult = await claudeAccountService.checkAndRecoverFiveHourStoppedAccounts()

        if (fiveHourResult.recovered > 0) {
          // 将5小时限制恢复的账号也加入到已清理账户列表中，用于发送通知
          for (const account of fiveHourResult.accounts) {
            this.clearedAccounts.push({
              platform: 'Claude',
              accountId: account.id,
              accountName: account.name,
              previousStatus: '5hour_limited',
              currentStatus: 'active',
              windowInfo: account.newWindow
            })
          }

          // 更新统计数据
          result.checked += fiveHourResult.checked
          result.cleared += fiveHourResult.recovered

          logger.info(
            `🕐 Claude 5-hour limit recovery: ${fiveHourResult.recovered}/${fiveHourResult.checked} accounts recovered`
          )
        }
      } catch (error) {
        logger.error('Failed to check and recover 5-hour stopped Claude accounts:', error)
        result.errors.push({
          type: '5hour_recovery',
          error: error.message
        })
      }
    } catch (error) {
      logger.error('Failed to cleanup Claude accounts:', error)
      result.errors.push({ error: error.message })
    }
  }

  /**
   * 清理 Claude Console 账号的过期限流
   */
  async cleanupClaudeConsoleAccounts(result) {
    try {
      // 使用服务层获取账户数据
      const accounts = await claudeConsoleAccountService.getAllAccounts()

      for (const account of accounts) {
        // 检查是否处于限流状态（兼容对象和字符串格式）
        const isRateLimited =
          account.rateLimitStatus === 'limited' ||
          (account.rateLimitStatus &&
            typeof account.rateLimitStatus === 'object' &&
            account.rateLimitStatus.status === 'limited')

        const autoStopped = account.rateLimitAutoStopped === 'true'
        const needsAutoStopRecovery = autoStopped && account.schedulable === 'false'

        // 检查两种状态字段：rateLimitStatus 和 status
        const hasStatusRateLimited = account.status === 'rate_limited'

        if (isRateLimited || hasStatusRateLimited || needsAutoStopRecovery) {
          result.checked++

          try {
            // 使用 claudeConsoleAccountService 的检查方法，它会自动清除过期的限流
            const isStillLimited = await claudeConsoleAccountService.isAccountRateLimited(
              account.id
            )

            if (!isStillLimited) {
              if (!isRateLimited && autoStopped) {
                await claudeConsoleAccountService.removeAccountRateLimit(account.id)
              }
              result.cleared++

              // 如果 status 字段是 rate_limited，需要额外清理
              if (hasStatusRateLimited && !isRateLimited) {
                await claudeConsoleAccountService.updateAccount(account.id, {
                  status: 'active'
                })
              }

              logger.info(
                `🧹 Auto-cleared expired rate limit for Claude Console account: ${account.name} (${account.id})`
              )

              // 记录已清理的账户信息
              this.clearedAccounts.push({
                platform: 'Claude Console',
                accountId: account.id,
                accountName: account.name,
                previousStatus: 'rate_limited',
                currentStatus: 'active'
              })
            }
          } catch (error) {
            result.errors.push({
              accountId: account.id,
              accountName: account.name,
              error: error.message
            })
          }
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup Claude Console accounts:', error)
      result.errors.push({ error: error.message })
    }
  }

  /**
   * 检查并恢复 Claude Console 账号的配额超限状态
   */
  async cleanupClaudeConsoleQuotaExceeded(result) {
    try {
      const accounts = await claudeConsoleAccountService.getAllAccounts()

      for (const account of accounts) {
        // 检查是否处于配额超限状态
        if (account.status === 'quota_exceeded' || account.quotaStoppedAt) {
          result.checked++

          try {
            // 使用 isAccountQuotaExceeded 方法，它会自动触发恢复
            const isStillExceeded = await claudeConsoleAccountService.isAccountQuotaExceeded(
              account.id
            )

            if (!isStillExceeded) {
              result.cleared++
              logger.info(
                `🧹 Auto-recovered quota exceeded for Claude Console account: ${account.name} (${account.id})`
              )

              // 记录已恢复的账户信息
              this.clearedAccounts.push({
                platform: 'Claude Console',
                accountId: account.id,
                accountName: account.name,
                previousStatus: 'quota_exceeded',
                currentStatus: 'active'
              })
            }
          } catch (error) {
            result.errors.push({
              accountId: account.id,
              accountName: account.name,
              error: error.message
            })
          }
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup Claude Console quota exceeded accounts:', error)
      result.errors.push({ error: error.message })
    }
  }

  /**
   * 主动刷新 Claude 账户 Token（防止等待重置期间 Token 过期）
   * 仅对因限流/配额限制而等待重置的账户执行刷新：
   * - 429 限流账户（rateLimitAutoStopped=true）
   * - 5小时限制自动停止账户（fiveHourAutoStopped=true）
   * 不处理错误状态账户（error/temp_error）
   */
  async proactiveRefreshClaudeTokens(result) {
    try {
      const redis = require('../models/redis')
      const accounts = await redis.getAllClaudeAccounts()
      const now = Date.now()
      const refreshAheadMs = 30 * 60 * 1000 // 提前30分钟刷新
      const recentRefreshMs = 5 * 60 * 1000 // 5分钟内刷新过则跳过

      for (const account of accounts) {
        // 1. 必须激活
        if (account.isActive !== 'true') {
          continue
        }

        // 2. 必须有 refreshToken
        if (!account.refreshToken) {
          continue
        }

        // 3. 【优化】仅处理因限流/配额限制而等待重置的账户
        // 正常调度的账户会在请求时自动刷新，无需主动刷新
        // 错误状态账户的 Token 可能已失效，刷新也会失败
        const isWaitingForReset =
          account.rateLimitAutoStopped === 'true' || // 429 限流
          account.fiveHourAutoStopped === 'true' // 5小时限制自动停止
        if (!isWaitingForReset) {
          continue
        }

        // 4. 【优化】如果最近 5 分钟内已刷新，跳过（避免重复刷新）
        const lastRefreshAt = account.lastRefreshAt ? new Date(account.lastRefreshAt).getTime() : 0
        if (now - lastRefreshAt < recentRefreshMs) {
          continue
        }

        // 5. 检查 Token 是否即将过期（30分钟内）
        const expiresAt = parseInt(account.expiresAt)
        if (expiresAt && now < expiresAt - refreshAheadMs) {
          continue
        }

        // 符合条件，执行刷新
        result.checked++
        try {
          await claudeAccountService.refreshAccountToken(account.id)
          result.refreshed++
          logger.info(`🔄 Proactively refreshed token: ${account.name} (${account.id})`)
        } catch (error) {
          result.errors.push({
            accountId: account.id,
            accountName: account.name,
            error: error.message
          })
          logger.warn(`⚠️ Proactive refresh failed for ${account.name}: ${error.message}`)
        }
      }
    } catch (error) {
      logger.error('Failed to proactively refresh Claude tokens:', error)
      result.errors.push({ error: error.message })
    }
  }

  /**
   * 手动触发一次清理（供 API 或 CLI 调用）
   */
  async manualCleanup() {
    logger.info('🧹 Manual rate limit cleanup triggered')
    await this.performCleanup()
  }

  /**
   * 发送限流恢复通知
   */
  async sendRecoveryNotifications() {
    try {
      // 按平台分组账户
      const groupedAccounts = {}
      for (const account of this.clearedAccounts) {
        if (!groupedAccounts[account.platform]) {
          groupedAccounts[account.platform] = []
        }
        groupedAccounts[account.platform].push(account)
      }

      // 构建通知消息
      const platforms = Object.keys(groupedAccounts)
      const totalAccounts = this.clearedAccounts.length

      let message = `🎉 共有 ${totalAccounts} 个账户的限流状态已恢复\n\n`

      for (const platform of platforms) {
        const accounts = groupedAccounts[platform]
        message += `**${platform}** (${accounts.length} 个):\n`
        for (const account of accounts) {
          message += `• ${account.accountName} (ID: ${account.accountId})\n`
        }
        message += '\n'
      }

      // 发送 webhook 通知
      await webhookService.sendNotification('rateLimitRecovery', {
        title: '限流恢复通知',
        message,
        totalAccounts,
        platforms: Object.keys(groupedAccounts),
        accounts: this.clearedAccounts,
        timestamp: new Date().toISOString()
      })

      logger.info(`📢 已发送限流恢复通知，涉及 ${totalAccounts} 个账户`)
    } catch (error) {
      logger.error('❌ 发送限流恢复通知失败:', error)
    }
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      running: !!this.cleanupInterval,
      intervalMinutes: this.intervalMs / (60 * 1000),
      isProcessing: this.isRunning
    }
  }
}

// 创建单例实例
const rateLimitCleanupService = new RateLimitCleanupService()

module.exports = rateLimitCleanupService
