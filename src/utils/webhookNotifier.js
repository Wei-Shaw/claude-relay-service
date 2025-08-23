const logger = require('./logger')
const webhookService = require('../services/webhookService')

class WebhookNotifier {
  constructor() {
    // 保留此类用于兼容性，实际功能委托给webhookService
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
    try {
      // 使用新的webhookService发送通知
      await webhookService.sendNotification('accountAnomaly', {
        accountId: notification.accountId,
        accountName: notification.accountName,
        platform: notification.platform,
        status: notification.status,
        errorCode:
          notification.errorCode || this._getErrorCode(notification.platform, notification.status),
        reason: notification.reason,
        timestamp: notification.timestamp || new Date().toISOString()
      })
    } catch (error) {
      logger.error('Failed to send account anomaly notification:', error)
    }
  }

  /**
   * 测试Webhook连通性（兼容旧接口）
   * @param {string} url - Webhook URL
   * @param {string} type - 平台类型（可选）
   */
  async testWebhook(url, type = 'custom') {
    try {
      // 创建临时平台配置
      const platform = {
        type,
        url,
        enabled: true,
        timeout: 10000
      }

      const result = await webhookService.testWebhook(platform)
      return result
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
        error: 'CLAUDE_OAUTH_ERROR',
        disabled: 'CLAUDE_OAUTH_MANUALLY_DISABLED'
      },
      'claude-console': {
        blocked: 'CLAUDE_CONSOLE_BLOCKED',
        error: 'CLAUDE_CONSOLE_ERROR',
        disabled: 'CLAUDE_CONSOLE_MANUALLY_DISABLED'
      },
      gemini: {
        error: 'GEMINI_ERROR',
        unauthorized: 'GEMINI_UNAUTHORIZED',
        disabled: 'GEMINI_MANUALLY_DISABLED'
      }
    }

    return errorCodes[platform]?.[status] || 'UNKNOWN_ERROR'
  }
}

module.exports = new WebhookNotifier()
