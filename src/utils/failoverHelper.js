/**
 * 🔄 上游故障转移工具类
 * 用于处理上游5xx错误时的自动故障转移
 */

const config = require('../../config/config')
const logger = require('./logger')

class FailoverHelper {
  constructor() {
    this.config = config.failover || {
      enabled: true,
      maxRetries: 3,
      tempUnavailableTTL: 300,
      // 上游账户问题导致的错误，应该触发 failover 尝试其他账户
      // 401: 上游账户认证失败
      // 402: 上游账户欠费/支付问题
      // 403: 上游账户权限不足/被封禁
      // 429: 上游账户限流
      // 5xx: 上游服务错误 (500, 502, 503, 504, 529)
      retryableStatusCodes: [401, 402, 403, 429, 500, 502, 503, 504, 529],
      retryableErrorCodes: [
        'ECONNABORTED',
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'EPIPE',
        'EHOSTUNREACH'
      ]
    }
  }

  /**
   * 检查是否启用了故障转移
   */
  isEnabled() {
    return this.config.enabled !== false
  }

  /**
   * 获取最大重试次数
   */
  getMaxRetries() {
    return this.config.maxRetries || 3
  }

  /**
   * 获取临时不可用 TTL（秒）
   */
  getTempUnavailableTTL() {
    return this.config.tempUnavailableTTL || 300
  }

  /**
   * 检查 HTTP 状态码是否可重试
   * @param {number} statusCode - HTTP 状态码
   * @returns {boolean}
   */
  isRetryableStatusCode(statusCode) {
    if (!statusCode) {
      return false
    }
    return this.config.retryableStatusCodes.includes(statusCode)
  }

  /**
   * 检查错误码是否可重试（连接级别错误）
   * @param {string} errorCode - 错误码 (如 ECONNRESET)
   * @returns {boolean}
   */
  isRetryableErrorCode(errorCode) {
    if (!errorCode) {
      return false
    }
    return this.config.retryableErrorCodes.includes(errorCode)
  }

  /**
   * 检查错误是否可重试
   * @param {Error|Object} error - 错误对象
   * @returns {boolean}
   */
  isRetryableError(error) {
    if (!error) {
      return false
    }

    // 检查 HTTP 状态码
    const statusCode = error.status || error.statusCode || error.response?.status
    if (statusCode && this.isRetryableStatusCode(statusCode)) {
      return true
    }

    // 检查连接错误码
    const errorCode = error.code || error.errno
    if (errorCode && this.isRetryableErrorCode(errorCode)) {
      return true
    }

    return false
  }

  /**
   * 检查是否应该进行故障转移重试
   * @param {Object} context - 上下文
   * @param {number} context.retryCount - 当前重试次数
   * @param {number} context.statusCode - HTTP 状态码
   * @param {string} context.errorCode - 错误码
   * @param {boolean} context.isStreamStarted - 流式响应是否已开始
   * @returns {boolean}
   */
  shouldRetry(context) {
    // 未启用故障转移
    if (!this.isEnabled()) {
      return false
    }

    // 检查显式的 noRetry 标志
    if (context.error?.noRetry || context.error?.noFailover) {
      logger.debug('🔄 Failover: Error marked as noRetry, skipping failover')
      return false
    }

    // 流式响应已开始发送，无法重试
    if (context.isStreamStarted) {
      logger.debug('🔄 Failover: Cannot retry, stream already started')
      return false
    }

    // 超过最大重试次数
    if (context.retryCount >= this.getMaxRetries()) {
      logger.debug(`🔄 Failover: Max retries (${this.getMaxRetries()}) exceeded`)
      return false
    }

    // 检查是否是可重试的错误
    const isRetryable =
      this.isRetryableStatusCode(context.statusCode) || this.isRetryableErrorCode(context.errorCode)

    if (!isRetryable) {
      logger.debug(
        `🔄 Failover: Error not retryable (status=${context.statusCode}, code=${context.errorCode})`
      )
    }

    return isRetryable
  }

  /**
   * 创建故障转移上下文
   * @param {Object} options - 选项
   * @returns {Object} 故障转移上下文
   */
  createContext(options = {}) {
    return {
      retryCount: 0,
      excludeAccountIds: [],
      startTime: Date.now(),
      isStreamStarted: false,
      ...options
    }
  }

  /**
   * 更新故障转移上下文
   * @param {Object} context - 上下文
   * @param {string} failedAccountId - 失败的账户 ID
   * @returns {Object} 更新后的上下文
   */
  updateContext(context, failedAccountId) {
    return {
      ...context,
      retryCount: context.retryCount + 1,
      excludeAccountIds: [...context.excludeAccountIds, failedAccountId]
    }
  }

  /**
   * 记录故障转移日志
   * @param {Object} options - 选项
   */
  logRetry(options) {
    const { accountId, accountType, statusCode, errorCode, retryCount, maxRetries } = options
    logger.warn(
      `🔄 Failover: Retrying request (${retryCount}/${maxRetries}) after error | ` +
        `account=${accountId} (${accountType}), status=${statusCode || 'N/A'}, code=${errorCode || 'N/A'}`
    )
  }

  /**
   * 记录故障转移成功日志
   * @param {Object} options - 选项
   */
  logSuccess(options) {
    const { accountId, accountType, retryCount } = options
    logger.info(
      `✅ Failover: Request succeeded after ${retryCount} retry(s) | account=${accountId} (${accountType})`
    )
  }

  /**
   * 记录故障转移失败日志
   * @param {Object} options - 选项
   */
  logFailure(options) {
    const { retryCount, maxRetries, lastError } = options
    logger.error(
      `❌ Failover: All retries exhausted (${retryCount}/${maxRetries}) | lastError=${lastError?.message || 'Unknown'}`
    )
  }

  /**
   * 获取状态码描述
   * @param {number} statusCode - HTTP 状态码
   * @returns {string}
   */
  getStatusCodeDescription(statusCode) {
    const descriptions = {
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
      529: 'Over Capacity (Claude)'
    }
    return descriptions[statusCode] || 'Unknown Error'
  }
}

module.exports = new FailoverHelper()
