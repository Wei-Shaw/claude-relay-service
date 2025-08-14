const axios = require('axios')
const logger = require('./logger')
const config = require('../../config/config')

class WebhookNotifier {
  constructor() {
    this.webhookUrls = config.webhook?.urls || []
    this.timeout = config.webhook?.timeout || 10000
    this.retries = config.webhook?.retries || 3
    this.enabled = config.webhook?.enabled !== false
  }

  /**
   * 发送账号异常通知
   * @param {Object} notification - 通知内容
   * @param {string} notification.accountId - 账号ID
   * @param {string} notification.accountName - 账号名称
   * @param {string} notification.platform - 平台类型 (claude-oauth, claude-console, gemini)
   * @param {string} notification.status - 异常状态 (unauthorized, blocked, error)
   * @param {string} notification.errorCode - 异常代码
   * @param {string} notification.reason - 异常原因
   * @param {string} notification.timestamp - 时间戳
   */
  async sendAccountAnomalyNotification(notification) {
    if (!this.enabled || this.webhookUrls.length === 0) {
      logger.debug('Webhook notification disabled or no URLs configured')
      return
    }

    const payload = {
      type: 'account_anomaly',
      data: {
        accountId: notification.accountId,
        accountName: notification.accountName,
        platform: notification.platform,
        status: notification.status,
        errorCode: notification.errorCode,
        reason: notification.reason,
        timestamp: notification.timestamp || new Date().toISOString(),
        service: 'claude-relay-service'
      }
    }

    logger.info(
      `📢 Sending account anomaly webhook notification: ${notification.accountName} (${notification.accountId}) - ${notification.status}`
    )

    const promises = this.webhookUrls.map((url) => this._sendWebhook(url, payload))

    try {
      await Promise.allSettled(promises)
    } catch (error) {
      logger.error('Failed to send webhook notifications:', error)
    }
  }

  /**
   * 发送Webhook请求
   * @param {string} url - Webhook URL
   * @param {Object} payload - 请求载荷
   */
  async _sendWebhook(url, payload, attempt = 1) {
    try {
      const response = await axios.post(url, payload, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'claude-relay-service/webhook-notifier'
        }
      })

      if (response.status >= 200 && response.status < 300) {
        logger.info(`✅ Webhook sent successfully to ${url}`)
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    } catch (error) {
      logger.error(
        `❌ Failed to send webhook to ${url} (attempt ${attempt}/${this.retries}):`,
        error.message
      )

      // 重试机制
      if (attempt < this.retries) {
        const delay = Math.pow(2, attempt - 1) * 1000 // 指数退避
        logger.info(`🔄 Retrying webhook to ${url} in ${delay}ms...`)

        await new Promise((resolve) => setTimeout(resolve, delay))
        return this._sendWebhook(url, payload, attempt + 1)
      }

      logger.error(`💥 All ${this.retries} webhook attempts failed for ${url}`)
    }
  }

  /**
   * 测试Webhook连通性
   * @param {string} url - Webhook URL
   */
  async testWebhook(url) {
    const testPayload = {
      type: 'test',
      data: {
        message: 'Claude Relay Service webhook test',
        timestamp: new Date().toISOString(),
        service: 'claude-relay-service'
      }
    }

    try {
      await this._sendWebhook(url, testPayload)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 获取错误代码映射
   * @param {string} platform - 平台类型
   * @param {string} status - 状态
   * @param {string} _reason - 原因 (未使用)
   */
  _getErrorCode(platform, status, _reason) {
    const errorCodes = {
      'claude-oauth': {
        unauthorized: 'CLAUDE_OAUTH_UNAUTHORIZED',
        error: 'CLAUDE_OAUTH_ERROR'
      },
      'claude-console': {
        blocked: 'CLAUDE_CONSOLE_BLOCKED',
        error: 'CLAUDE_CONSOLE_ERROR'
      },
      gemini: {
        error: 'GEMINI_ERROR',
        unauthorized: 'GEMINI_UNAUTHORIZED'
      }
    }

    return errorCodes[platform]?.[status] || 'UNKNOWN_ERROR'
  }
}

module.exports = new WebhookNotifier()
