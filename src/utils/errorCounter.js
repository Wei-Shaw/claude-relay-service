/**
 * 通用的账户错误计数工具
 * 用于跟踪账户的5xx错误次数，避免因偶发错误而过早标记账户为不可用
 */

const redis = require('../models/redis')
const logger = require('./logger')

class ErrorCounter {
  constructor() {
    // 错误计数过期时间（秒），5分钟内的错误累计计数
    this.ERROR_TTL_SECONDS = 300
  }

  /**
   * 记录账户的服务器错误
   * @param {string} accountId - 账户ID
   * @param {string} accountType - 账户类型 (claude-official, claude-console, gemini, etc.)
   * @param {number} statusCode - HTTP状态码
   * @returns {Promise<number>} 当前错误计数
   */
  async recordError(accountId, accountType, statusCode) {
    try {
      const key = `error_count:${accountType}:${accountId}:5xx`
      const client = redis.getClientSafe()

      // 增加错误计数，设置5分钟过期时间
      const newCount = await client.incr(key)
      await client.expire(key, this.ERROR_TTL_SECONDS)

      logger.debug(
        `📝 Recorded ${statusCode} error for ${accountType} account ${accountId}, count: ${newCount}`
      )
      return newCount
    } catch (error) {
      logger.error(
        `❌ Failed to record ${statusCode} error for ${accountType} account ${accountId}:`,
        error
      )
      return 0
    }
  }

  /**
   * 获取账户的错误计数
   * @param {string} accountId - 账户ID
   * @param {string} accountType - 账户类型
   * @returns {Promise<number>} 错误计数
   */
  async getErrorCount(accountId, accountType) {
    try {
      const key = `error_count:${accountType}:${accountId}:5xx`
      const client = redis.getClientSafe()

      const count = await client.get(key)
      return parseInt(count) || 0
    } catch (error) {
      logger.error(`❌ Failed to get error count for ${accountType} account ${accountId}:`, error)
      return 0
    }
  }

  /**
   * 清除账户的错误计数
   * @param {string} accountId - 账户ID
   * @param {string} accountType - 账户类型
   * @returns {Promise<boolean>} 是否成功清除
   */
  async clearErrors(accountId, accountType) {
    try {
      const key = `error_count:${accountType}:${accountId}:5xx`
      const client = redis.getClientSafe()

      await client.del(key)
      logger.debug(`🧹 Cleared error count for ${accountType} account ${accountId}`)
      return true
    } catch (error) {
      logger.error(`❌ Failed to clear error count for ${accountType} account ${accountId}:`, error)
      return false
    }
  }

  /**
   * 检查是否应该标记账户为临时不可用
   * @param {string} accountId - 账户ID
   * @param {string} accountType - 账户类型
   * @param {number} threshold - 错误阈值（默认3次）
   * @returns {Promise<{shouldMark: boolean, errorCount: number}>}
   */
  async shouldMarkUnavailable(accountId, accountType, threshold = 3) {
    const errorCount = await this.getErrorCount(accountId, accountType)
    return {
      shouldMark: errorCount >= threshold,
      errorCount
    }
  }
}

module.exports = new ErrorCounter()
