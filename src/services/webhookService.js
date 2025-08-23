const axios = require('axios')
const crypto = require('crypto')
const logger = require('../utils/logger')
const webhookConfigService = require('./webhookConfigService')

class WebhookService {
  constructor() {
    this.platformHandlers = {
      wechat_work: this.sendToWechatWork.bind(this),
      dingtalk: this.sendToDingTalk.bind(this),
      feishu: this.sendToFeishu.bind(this),
      slack: this.sendToSlack.bind(this),
      discord: this.sendToDiscord.bind(this),
      custom: this.sendToCustom.bind(this)
    }
  }

  /**
   * 发送通知到所有启用的平台
   */
  async sendNotification(type, data) {
    try {
      const config = await webhookConfigService.getConfig()

      // 检查是否启用webhook
      if (!config.enabled) {
        logger.debug('Webhook通知已禁用')
        return
      }

      // 检查通知类型是否启用（test类型始终允许发送）
      if (type !== 'test' && config.notificationTypes && !config.notificationTypes[type]) {
        logger.debug(`通知类型 ${type} 已禁用`)
        return
      }

      // 获取启用的平台
      const enabledPlatforms = await webhookConfigService.getEnabledPlatforms()
      if (enabledPlatforms.length === 0) {
        logger.debug('没有启用的webhook平台')
        return
      }

      logger.info(`📢 发送 ${type} 通知到 ${enabledPlatforms.length} 个平台`)

      // 并发发送到所有平台
      const promises = enabledPlatforms.map((platform) =>
        this.sendToPlatform(platform, type, data, config.retrySettings)
      )

      const results = await Promise.allSettled(promises)

      // 记录结果
      const succeeded = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.filter((r) => r.status === 'rejected').length

      if (failed > 0) {
        logger.warn(`⚠️ Webhook通知: ${succeeded}成功, ${failed}失败`)
      } else {
        logger.info(`✅ 所有webhook通知发送成功`)
      }

      return { succeeded, failed }
    } catch (error) {
      logger.error('发送webhook通知失败:', error)
      throw error
    }
  }

  /**
   * 发送到特定平台
   */
  async sendToPlatform(platform, type, data, retrySettings) {
    try {
      const handler = this.platformHandlers[platform.type]
      if (!handler) {
        throw new Error(`不支持的平台类型: ${platform.type}`)
      }

      // 使用平台特定的处理器
      await this.retryWithBackoff(
        () => handler(platform, type, data),
        retrySettings?.maxRetries || 3,
        retrySettings?.retryDelay || 1000
      )

      logger.info(`✅ 成功发送到 ${platform.name || platform.type}`)
    } catch (error) {
      logger.error(`❌ 发送到 ${platform.name || platform.type} 失败:`, error.message)
      throw error
    }
  }

  /**
   * 企业微信webhook
   */
  async sendToWechatWork(platform, type, data) {
    const content = this.formatMessageForWechatWork(type, data)

    const payload = {
      msgtype: 'markdown',
      markdown: {
        content
      }
    }

    await this.sendHttpRequest(platform.url, payload, platform.timeout || 10000)
  }

  /**
   * 钉钉webhook
   */
  async sendToDingTalk(platform, type, data) {
    const content = this.formatMessageForDingTalk(type, data)

    let { url } = platform
    const payload = {
      msgtype: 'markdown',
      markdown: {
        title: this.getNotificationTitle(type),
        text: content
      }
    }

    // 如果启用签名
    if (platform.enableSign && platform.secret) {
      const timestamp = Date.now()
      const sign = this.generateDingTalkSign(platform.secret, timestamp)
      url = `${url}&timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`
    }

    await this.sendHttpRequest(url, payload, platform.timeout || 10000)
  }

  /**
   * 飞书webhook
   */
  async sendToFeishu(platform, type, data) {
    const content = this.formatMessageForFeishu(type, data)

    const payload = {
      msg_type: 'interactive',
      card: {
        elements: [
          {
            tag: 'markdown',
            content
          }
        ],
        header: {
          title: {
            tag: 'plain_text',
            content: this.getNotificationTitle(type)
          },
          template: this.getFeishuCardColor(type)
        }
      }
    }

    // 如果启用签名
    if (platform.enableSign && platform.secret) {
      const timestamp = Math.floor(Date.now() / 1000)
      const sign = this.generateFeishuSign(platform.secret, timestamp)
      payload.timestamp = timestamp.toString()
      payload.sign = sign
    }

    await this.sendHttpRequest(platform.url, payload, platform.timeout || 10000)
  }

  /**
   * Slack webhook
   */
  async sendToSlack(platform, type, data) {
    const text = this.formatMessageForSlack(type, data)

    const payload = {
      text,
      username: 'Claude Relay Service',
      icon_emoji: this.getSlackEmoji(type)
    }

    await this.sendHttpRequest(platform.url, payload, platform.timeout || 10000)
  }

  /**
   * Discord webhook
   */
  async sendToDiscord(platform, type, data) {
    const embed = this.formatMessageForDiscord(type, data)

    const payload = {
      username: 'Claude Relay Service',
      embeds: [embed]
    }

    await this.sendHttpRequest(platform.url, payload, platform.timeout || 10000)
  }

  /**
   * 自定义webhook
   */
  async sendToCustom(platform, type, data) {
    // 使用通用格式
    const payload = {
      type,
      service: 'claude-relay-service',
      timestamp: new Date().toISOString(),
      data
    }

    await this.sendHttpRequest(platform.url, payload, platform.timeout || 10000)
  }

  /**
   * 发送HTTP请求
   */
  async sendHttpRequest(url, payload, timeout) {
    const response = await axios.post(url, payload, {
      timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'claude-relay-service/2.0'
      }
    })

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response.data
  }

  /**
   * 重试机制
   */
  async retryWithBackoff(fn, maxRetries, baseDelay) {
    let lastError

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error

        if (i < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, i) // 指数退避
          logger.debug(`🔄 重试 ${i + 1}/${maxRetries}，等待 ${delay}ms`)
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError
  }

  /**
   * 生成钉钉签名
   */
  generateDingTalkSign(secret, timestamp) {
    const stringToSign = `${timestamp}\n${secret}`
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(stringToSign)
    return hmac.digest('base64')
  }

  /**
   * 生成飞书签名
   */
  generateFeishuSign(secret, timestamp) {
    const stringToSign = `${timestamp}\n${secret}`
    const hmac = crypto.createHmac('sha256', stringToSign)
    hmac.update('')
    return hmac.digest('base64')
  }

  /**
   * 格式化企业微信消息
   */
  formatMessageForWechatWork(type, data) {
    const title = this.getNotificationTitle(type)
    const details = this.formatNotificationDetails(data)

    return (
      `## ${title}\n\n` +
      `> **服务**: Claude Relay Service\n` +
      `> **时间**: ${new Date().toLocaleString('zh-CN')}\n\n${details}`
    )
  }

  /**
   * 格式化钉钉消息
   */
  formatMessageForDingTalk(type, data) {
    const details = this.formatNotificationDetails(data)

    return (
      `#### 服务: Claude Relay Service\n` +
      `#### 时间: ${new Date().toLocaleString('zh-CN')}\n\n${details}`
    )
  }

  /**
   * 格式化飞书消息
   */
  formatMessageForFeishu(type, data) {
    return this.formatNotificationDetails(data)
  }

  /**
   * 格式化Slack消息
   */
  formatMessageForSlack(type, data) {
    const title = this.getNotificationTitle(type)
    const details = this.formatNotificationDetails(data)

    return `*${title}*\n${details}`
  }

  /**
   * 格式化Discord消息
   */
  formatMessageForDiscord(type, data) {
    const title = this.getNotificationTitle(type)
    const color = this.getDiscordColor(type)
    const fields = this.formatNotificationFields(data)

    return {
      title,
      color,
      fields,
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Claude Relay Service'
      }
    }
  }

  /**
   * 获取通知标题
   */
  getNotificationTitle(type) {
    const titles = {
      accountAnomaly: '⚠️ 账号异常通知',
      quotaWarning: '📊 配额警告',
      systemError: '❌ 系统错误',
      securityAlert: '🔒 安全警报',
      test: '🧪 测试通知'
    }

    return titles[type] || '📢 系统通知'
  }

  /**
   * 格式化通知详情
   */
  formatNotificationDetails(data) {
    const lines = []

    if (data.accountName) {
      lines.push(`**账号**: ${data.accountName}`)
    }

    if (data.platform) {
      lines.push(`**平台**: ${data.platform}`)
    }

    if (data.status) {
      lines.push(`**状态**: ${data.status}`)
    }

    if (data.errorCode) {
      lines.push(`**错误代码**: ${data.errorCode}`)
    }

    if (data.reason) {
      lines.push(`**原因**: ${data.reason}`)
    }

    if (data.message) {
      lines.push(`**消息**: ${data.message}`)
    }

    if (data.quota) {
      lines.push(`**剩余配额**: ${data.quota.remaining}/${data.quota.total}`)
    }

    if (data.usage) {
      lines.push(`**使用率**: ${data.usage}%`)
    }

    return lines.join('\n')
  }

  /**
   * 格式化Discord字段
   */
  formatNotificationFields(data) {
    const fields = []

    if (data.accountName) {
      fields.push({ name: '账号', value: data.accountName, inline: true })
    }

    if (data.platform) {
      fields.push({ name: '平台', value: data.platform, inline: true })
    }

    if (data.status) {
      fields.push({ name: '状态', value: data.status, inline: true })
    }

    if (data.errorCode) {
      fields.push({ name: '错误代码', value: data.errorCode, inline: false })
    }

    if (data.reason) {
      fields.push({ name: '原因', value: data.reason, inline: false })
    }

    if (data.message) {
      fields.push({ name: '消息', value: data.message, inline: false })
    }

    return fields
  }

  /**
   * 获取飞书卡片颜色
   */
  getFeishuCardColor(type) {
    const colors = {
      accountAnomaly: 'orange',
      quotaWarning: 'yellow',
      systemError: 'red',
      securityAlert: 'red',
      test: 'blue'
    }

    return colors[type] || 'blue'
  }

  /**
   * 获取Slack emoji
   */
  getSlackEmoji(type) {
    const emojis = {
      accountAnomaly: ':warning:',
      quotaWarning: ':chart_with_downwards_trend:',
      systemError: ':x:',
      securityAlert: ':lock:',
      test: ':test_tube:'
    }

    return emojis[type] || ':bell:'
  }

  /**
   * 获取Discord颜色
   */
  getDiscordColor(type) {
    const colors = {
      accountAnomaly: 0xff9800, // 橙色
      quotaWarning: 0xffeb3b, // 黄色
      systemError: 0xf44336, // 红色
      securityAlert: 0xf44336, // 红色
      test: 0x2196f3 // 蓝色
    }

    return colors[type] || 0x9e9e9e // 灰色
  }

  /**
   * 测试webhook连接
   */
  async testWebhook(platform) {
    try {
      const testData = {
        message: 'Claude Relay Service webhook测试',
        timestamp: new Date().toISOString()
      }

      await this.sendToPlatform(platform, 'test', testData, { maxRetries: 1, retryDelay: 1000 })

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }
}

module.exports = new WebhookService()
