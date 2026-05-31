const axios = require('axios')
const crypto = require('crypto')
const nodemailer = require('nodemailer')
const { HttpsProxyAgent } = require('https-proxy-agent')
const { SocksProxyAgent } = require('socks-proxy-agent')
const logger = require('../utils/logger')
const webhookConfigService = require('./webhookConfigService')
const { getISOStringWithTimezone } = require('../utils/dateHelper')
const appConfig = require('../../config/config')
const { assertSafeOutboundHost, assertSafeOutboundUrl } = require('../utils/outboundNetworkPolicy')

class WebhookService {
  constructor() {
    this.platformHandlers = {
      wechat_work: this.sendToWechatWork.bind(this),
      dingtalk: this.sendToDingTalk.bind(this),
      feishu: this.sendToFeishu.bind(this),
      slack: this.sendToSlack.bind(this),
      discord: this.sendToDiscord.bind(this),
      telegram: this.sendToTelegram.bind(this),
      custom: this.sendToCustom.bind(this),
      bark: this.sendToBark.bind(this),
      smtp: this.sendToSMTP.bind(this)
    }
    this.timezone = appConfig.system.timezone || 'Asia/Shanghai'
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
      timestamp: getISOStringWithTimezone(new Date()),
      data
    }

    await this.sendHttpRequest(platform.url, payload, platform.timeout || 10000)
  }

  /**
   * Telegram Bot 通知
   */
  async sendToTelegram(platform, type, data) {
    if (!platform.botToken) {
      throw new Error('缺少 Telegram 机器人 Token')
    }
    if (!platform.chatId) {
      throw new Error('缺少 Telegram Chat ID')
    }

    const baseUrl = this.normalizeTelegramApiBase(platform.apiBaseUrl)
    const apiUrl = `${baseUrl}/bot${platform.botToken}/sendMessage`
    const payload = {
      chat_id: platform.chatId,
      text: this.formatMessageForTelegram(type, data),
      disable_web_page_preview: true
    }

    const axiosOptions = await this.buildTelegramAxiosOptions(platform)

    const response = await this.sendHttpRequest(
      apiUrl,
      payload,
      platform.timeout || 10000,
      axiosOptions
    )
    if (!response || response.ok !== true) {
      throw new Error(`Telegram API 错误: ${response?.description || '未知错误'}`)
    }
  }

  /**
   * Bark webhook
   */
  async sendToBark(platform, type, data) {
    const payload = {
      device_key: platform.deviceKey,
      title: this.getNotificationTitle(type),
      body: this.formatMessageForBark(type, data),
      level: platform.level || this.getBarkLevel(type),
      sound: platform.sound || this.getBarkSound(type),
      group: platform.group || 'claude-relay',
      badge: 1
    }

    // 添加可选参数
    if (platform.icon) {
      payload.icon = platform.icon
    }

    if (platform.clickUrl) {
      payload.url = platform.clickUrl
    }

    const url = platform.serverUrl || 'https://api.day.app/push'
    await this.sendHttpRequest(url, payload, platform.timeout || 10000)
  }

  /**
   * SMTP邮件通知
   */
  async sendToSMTP(platform, type, data) {
    try {
      await assertSafeOutboundHost(platform.host, { target: 'SMTP host' })

      // 创建SMTP传输器
      const transporter = nodemailer.createTransport({
        host: platform.host,
        port: platform.port || 587,
        secure: platform.secure || false, // true for 465, false for other ports
        auth: {
          user: platform.user,
          pass: platform.pass
        },
        // 可选的TLS配置
        tls: platform.ignoreTLS ? { rejectUnauthorized: false } : undefined,
        // 连接超时
        connectionTimeout: platform.timeout || 10000
      })

      // 构造邮件内容
      const subject = this.getNotificationTitle(type)
      const htmlContent = this.formatMessageForEmail(type, data)
      const textContent = this.formatMessageForEmailText(type, data)

      // 邮件选项
      const mailOptions = {
        from: platform.from || platform.user, // 发送者
        to: platform.to, // 接收者（必填）
        subject: `[Claude Relay Service] ${subject}`,
        text: textContent,
        html: htmlContent
      }

      // 发送邮件
      const info = await transporter.sendMail(mailOptions)
      logger.info(`✅ 邮件发送成功: ${info.messageId}`)

      return info
    } catch (error) {
      logger.error('SMTP邮件发送失败:', error)
      throw error
    }
  }

  /**
   * 发送HTTP请求
   */
  async sendHttpRequest(url, payload, timeout, axiosOptions = {}) {
    const urlValidation = await assertSafeOutboundUrl(url, { target: 'Webhook URL' })
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'claude-relay-service/2.0',
      ...(axiosOptions.headers || {})
    }

    const response = await axios.post(urlValidation.url, payload, {
      timeout,
      ...axiosOptions,
      headers,
      lookup: urlValidation.lookup,
      maxRedirects: 0
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
      `> **时间**: ${new Date().toLocaleString('zh-CN', { timeZone: this.timezone })}\n\n${details}`
    )
  }

  /**
   * 格式化钉钉消息
   */
  formatMessageForDingTalk(type, data) {
    const details = this.formatNotificationDetails(data)

    return (
      `#### 服务: Claude Relay Service\n` +
      `#### 时间: ${new Date().toLocaleString('zh-CN', { timeZone: this.timezone })}\n\n${details}`
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
   * 规范化Telegram基础地址
   */
  normalizeTelegramApiBase(baseUrl) {
    const defaultBase = 'https://api.telegram.org'
    if (!baseUrl) {
      return defaultBase
    }

    try {
      const parsed = new URL(baseUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Telegram API 基础地址必须使用 http 或 https 协议')
      }

      // 移除结尾的 /
      return parsed.href.replace(/\/$/, '')
    } catch (error) {
      logger.warn(`⚠️ Telegram API 基础地址无效，将使用默认值: ${error.message}`)
      return defaultBase
    }
  }

  /**
   * 构建 Telegram 请求的 axios 选项（代理等）
   */
  async buildTelegramAxiosOptions(platform) {
    const options = {}

    if (platform.proxyUrl) {
      try {
        await assertSafeOutboundUrl(platform.proxyUrl, {
          allowedProtocols: ['http:', 'https:', 'socks4:', 'socks4a:', 'socks5:'],
          target: 'Telegram proxy URL'
        })

        const proxyUrl = new URL(platform.proxyUrl)
        const { protocol } = proxyUrl

        if (protocol.startsWith('socks')) {
          const agent = new SocksProxyAgent(proxyUrl.toString())
          options.httpAgent = agent
          options.httpsAgent = agent
          options.proxy = false
        } else if (protocol === 'http:' || protocol === 'https:') {
          const agent = new HttpsProxyAgent(proxyUrl.toString())
          options.httpAgent = agent
          options.httpsAgent = agent
          options.proxy = false
        } else {
          logger.warn(`⚠️ 不支持的Telegram代理协议: ${protocol}`)
        }
      } catch (error) {
        logger.warn(`⚠️ Telegram代理配置无效: ${error.message}`)
        throw error
      }
    }

    return options
  }

  /**
   * 格式化 Telegram 消息
   */
  formatMessageForTelegram(type, data) {
    const title = this.getNotificationTitle(type)
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: this.timezone })
    const details = this.buildNotificationDetails(data)

    const lines = [`${title}`, '服务: Claude Relay Service']

    if (details.length > 0) {
      lines.push('')
      for (const detail of details) {
        lines.push(`${detail.label}: ${detail.value}`)
      }
    }

    lines.push('', `时间: ${timestamp}`)

    return lines.join('\n')
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
      timestamp: getISOStringWithTimezone(new Date()),
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
      rateLimitRecovery: '🎉 限流恢复通知',
      test: '🧪 测试通知'
    }

    return titles[type] || '📢 系统通知'
  }

  /**
   * 获取Bark通知级别
   */
  getBarkLevel(type) {
    const levels = {
      accountAnomaly: 'timeSensitive',
      quotaWarning: 'active',
      systemError: 'critical',
      securityAlert: 'critical',
      rateLimitRecovery: 'active',
      test: 'passive'
    }

    return levels[type] || 'active'
  }

  /**
   * 获取Bark声音
   */
  getBarkSound(type) {
    const sounds = {
      accountAnomaly: 'alarm',
      quotaWarning: 'bell',
      systemError: 'alert',
      securityAlert: 'alarm',
      rateLimitRecovery: 'success',
      test: 'default'
    }

    return sounds[type] || 'default'
  }

  /**
   * 格式化Bark消息
   */
  formatMessageForBark(type, data) {
    const lines = []

    if (data.accountName) {
      lines.push(`账号: ${data.accountName}`)
    }

    if (data.platform) {
      lines.push(`平台: ${data.platform}`)
    }

    if (data.status) {
      lines.push(`状态: ${data.status}`)
    }

    if (data.errorCode) {
      lines.push(`错误: ${data.errorCode}`)
    }

    if (data.reason) {
      lines.push(`原因: ${data.reason}`)
    }

    if (data.message) {
      lines.push(`消息: ${data.message}`)
    }

    if (data.quota) {
      lines.push(`剩余配额: ${data.quota.remaining}/${data.quota.total}`)
    }

    if (data.usage) {
      lines.push(`使用率: ${data.usage}%`)
    }

    // 添加服务标识和时间戳
    lines.push(`\n服务: Claude Relay Service`)
    lines.push(`时间: ${new Date().toLocaleString('zh-CN', { timeZone: this.timezone })}`)

    return lines.join('\n')
  }

  /**
   * 构建通知详情数据
   */
  buildNotificationDetails(data) {
    const details = []

    if (data.accountName) {
      details.push({ label: '账号', value: data.accountName })
    }
    if (data.platform) {
      details.push({ label: '平台', value: data.platform })
    }
    if (data.status) {
      details.push({ label: '状态', value: data.status, color: this.getStatusColor(data.status) })
    }
    if (data.errorCode) {
      details.push({ label: '错误代码', value: data.errorCode, isCode: true })
    }
    if (data.reason) {
      details.push({ label: '原因', value: data.reason })
    }
    if (data.message) {
      details.push({ label: '消息', value: data.message })
    }
    if (data.quota) {
      details.push({ label: '配额', value: `${data.quota.remaining}/${data.quota.total}` })
    }
    if (data.usage) {
      details.push({ label: '使用率', value: `${data.usage}%` })
    }

    return details
  }

  /**
   * 格式化邮件HTML内容
   */
  formatMessageForEmail(type, data) {
    const title = this.getNotificationTitle(type)
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: this.timezone })
    const details = this.buildNotificationDetails(data)

    let content = `
      <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">${title}</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Claude Relay Service</p>
        </div>
        <div style="background: #f8f9fa; padding: 20px; border: 1px solid #e9ecef; border-top: none; border-radius: 0 0 8px 8px;">
          <div style="background: white; padding: 16px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    `

    // 使用统一的详情数据渲染
    details.forEach((detail) => {
      if (detail.isCode) {
        content += `<p><strong>${detail.label}:</strong> <code style="background: #f1f3f4; padding: 2px 6px; border-radius: 4px;">${detail.value}</code></p>`
      } else if (detail.color) {
        content += `<p><strong>${detail.label}:</strong> <span style="color: ${detail.color};">${detail.value}</span></p>`
      } else {
        content += `<p><strong>${detail.label}:</strong> ${detail.value}</p>`
      }
    })

    content += `
          </div>
          <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e9ecef; font-size: 14px; color: #6c757d; text-align: center;">
            <p>发送时间: ${timestamp}</p>
            <p style="margin: 0;">此邮件由 Claude Relay Service 自动发送</p>
          </div>
        </div>
      </div>
    `

    return content
  }

  /**
   * 格式化邮件纯文本内容
   */
  formatMessageForEmailText(type, data) {
    const title = this.getNotificationTitle(type)
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: this.timezone })
    const details = this.buildNotificationDetails(data)

    let content = `${title}\n`
    content += `=====================================\n\n`

    // 使用统一的详情数据渲染
    details.forEach((detail) => {
      content += `${detail.label}: ${detail.value}\n`
    })

    content += `\n发送时间: ${timestamp}\n`
    content += `服务: Claude Relay Service\n`
    content += `=====================================\n`
    content += `此邮件由系统自动发送，请勿回复。`

    return content
  }

  /**
   * 获取状态颜色
   */
  getStatusColor(status) {
    const colors = {
      error: '#dc3545',
      unauthorized: '#fd7e14',
      blocked: '#6f42c1',
      disabled: '#6c757d',
      active: '#28a745',
      warning: '#ffc107'
    }
    return colors[status] || '#007bff'
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

    if (data.platforms) {
      lines.push(`**涉及平台**: ${data.platforms.join(', ')}`)
    }

    if (data.totalAccounts) {
      lines.push(`**恢复账户数**: ${data.totalAccounts}`)
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
      rateLimitRecovery: 'green',
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
      rateLimitRecovery: ':tada:',
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
      rateLimitRecovery: 0x4caf50, // 绿色
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
        timestamp: getISOStringWithTimezone(new Date())
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
