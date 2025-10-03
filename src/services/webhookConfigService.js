const redis = require('../models/redis')
const logger = require('../utils/logger')
const { v4: uuidv4 } = require('uuid')

class WebhookConfigService {
  constructor() {
    this.KEY_PREFIX = 'webhook_config'
    this.DEFAULT_CONFIG_KEY = `${this.KEY_PREFIX}:default`
  }

  /**
   * 获取webhook配置
   */
  async getConfig() {
    try {
      const configStr = await redis.client.get(this.DEFAULT_CONFIG_KEY)
      if (!configStr) {
        // 返回默认配置
        return this.getDefaultConfig()
      }
      return JSON.parse(configStr)
    } catch (error) {
      logger.error('获取webhook配置失败:', error)
      return this.getDefaultConfig()
    }
  }

  /**
   * 保存webhook配置
   */
  async saveConfig(config) {
    try {
      // 验证配置
      this.validateConfig(config)

      // 添加更新时间
      config.updatedAt = new Date().toISOString()

      await redis.client.set(this.DEFAULT_CONFIG_KEY, JSON.stringify(config))
      logger.info('✅ Webhook配置已保存')

      return config
    } catch (error) {
      logger.error('保存webhook配置失败:', error)
      throw error
    }
  }

  /**
   * 验证配置
   */
  validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('无效的配置格式')
    }

    // 验证平台配置
    if (config.platforms) {
      const validPlatforms = [
        'wechat_work',
        'dingtalk',
        'feishu',
        'slack',
        'discord',
        'telegram',
        'custom',
        'bark',
        'smtp'
      ]

      for (const platform of config.platforms) {
        if (!validPlatforms.includes(platform.type)) {
          throw new Error(`不支持的平台类型: ${platform.type}`)
        }

        // Bark和SMTP平台不使用标准URL
        if (!['bark', 'smtp', 'telegram'].includes(platform.type)) {
          if (!platform.url || !this.isValidUrl(platform.url)) {
            throw new Error(`无效的webhook URL: ${platform.url}`)
          }
        }

        // 验证平台特定的配置
        this.validatePlatformConfig(platform)
      }
    }
  }

  /**
   * 验证平台特定配置
   */
  validatePlatformConfig(platform) {
    switch (platform.type) {
      case 'wechat_work':
        // 企业微信不需要额外配置
        break
      case 'dingtalk':
        // 钉钉可能需要secret用于签名
        if (platform.enableSign && !platform.secret) {
          throw new Error('钉钉启用签名时必须提供secret')
        }
        break
      case 'feishu':
        // 飞书可能需要签名
        if (platform.enableSign && !platform.secret) {
          throw new Error('飞书启用签名时必须提供secret')
        }
        break
      case 'slack':
        // Slack webhook URL通常包含token
        if (!platform.url.includes('hooks.slack.com')) {
          logger.warn('⚠️ Slack webhook URL格式可能不正确')
        }
        break
      case 'discord':
        // Discord webhook URL格式检查
        if (!platform.url.includes('discord.com/api/webhooks')) {
          logger.warn('⚠️ Discord webhook URL格式可能不正确')
        }
        break
      case 'telegram':
        if (!platform.botToken) {
          throw new Error('Telegram 平台必须提供机器人 Token')
        }
        if (!platform.chatId) {
          throw new Error('Telegram 平台必须提供 Chat ID')
        }

        if (!platform.botToken.includes(':')) {
          logger.warn('⚠️ Telegram 机器人 Token 格式可能不正确')
        }

        if (!/^[-\d]+$/.test(String(platform.chatId))) {
          logger.warn('⚠️ Telegram Chat ID 应该是数字，如为频道请确认已获取正确ID')
        }

        if (platform.apiBaseUrl) {
          if (!this.isValidUrl(platform.apiBaseUrl)) {
            throw new Error('Telegram API 基础地址格式无效')
          }
          const { protocol } = new URL(platform.apiBaseUrl)
          if (!['http:', 'https:'].includes(protocol)) {
            throw new Error('Telegram API 基础地址仅支持 http 或 https 协议')
          }
        }

        if (platform.proxyUrl) {
          if (!this.isValidUrl(platform.proxyUrl)) {
            throw new Error('Telegram 代理地址格式无效')
          }
          const proxyProtocol = new URL(platform.proxyUrl).protocol
          const supportedProtocols = ['http:', 'https:', 'socks4:', 'socks4a:', 'socks5:']
          if (!supportedProtocols.includes(proxyProtocol)) {
            throw new Error('Telegram 代理仅支持 http/https/socks 协议')
          }
        }
        break
      case 'custom':
        // 自定义webhook，用户自行负责格式
        break
      case 'bark':
        // 验证设备密钥
        if (!platform.deviceKey) {
          throw new Error('Bark平台必须提供设备密钥')
        }

        // 验证设备密钥格式（通常是22-24位字符）
        if (platform.deviceKey.length < 20 || platform.deviceKey.length > 30) {
          logger.warn('⚠️ Bark设备密钥长度可能不正确，请检查是否完整复制')
        }

        // 验证服务器URL（如果提供）
        if (platform.serverUrl) {
          if (!this.isValidUrl(platform.serverUrl)) {
            throw new Error('Bark服务器URL格式无效')
          }
          if (!platform.serverUrl.includes('/push')) {
            logger.warn('⚠️ Bark服务器URL应该以/push结尾')
          }
        }

        // 验证声音参数（如果提供）
        if (platform.sound) {
          const validSounds = [
            'default',
            'alarm',
            'anticipate',
            'bell',
            'birdsong',
            'bloom',
            'calypso',
            'chime',
            'choo',
            'descent',
            'electronic',
            'fanfare',
            'glass',
            'gotosleep',
            'healthnotification',
            'horn',
            'ladder',
            'mailsent',
            'minuet',
            'multiwayinvitation',
            'newmail',
            'newsflash',
            'noir',
            'paymentsuccess',
            'shake',
            'sherwoodforest',
            'silence',
            'spell',
            'suspense',
            'telegraph',
            'tiptoes',
            'typewriters',
            'update',
            'alert'
          ]
          if (!validSounds.includes(platform.sound)) {
            logger.warn(`⚠️ 未知的Bark声音: ${platform.sound}`)
          }
        }

        // 验证级别参数
        if (platform.level) {
          const validLevels = ['active', 'timeSensitive', 'passive', 'critical']
          if (!validLevels.includes(platform.level)) {
            throw new Error(`无效的Bark通知级别: ${platform.level}`)
          }
        }

        // 验证图标URL（如果提供）
        if (platform.icon && !this.isValidUrl(platform.icon)) {
          logger.warn('⚠️ Bark图标URL格式可能不正确')
        }

        // 验证点击跳转URL（如果提供）
        if (platform.clickUrl && !this.isValidUrl(platform.clickUrl)) {
          logger.warn('⚠️ Bark点击跳转URL格式可能不正确')
        }
        break
      case 'smtp': {
        // 验证SMTP必需配置
        if (!platform.host) {
          throw new Error('SMTP平台必须提供主机地址')
        }
        if (!platform.user) {
          throw new Error('SMTP平台必须提供用户名')
        }
        if (!platform.pass) {
          throw new Error('SMTP平台必须提供密码')
        }
        if (!platform.to) {
          throw new Error('SMTP平台必须提供接收邮箱')
        }

        // 验证端口
        if (platform.port && (platform.port < 1 || platform.port > 65535)) {
          throw new Error('SMTP端口必须在1-65535之间')
        }

        // 验证邮箱格式
        // 支持两种格式：1. 纯邮箱 user@domain.com  2. 带名称 Name <user@domain.com>
        const simpleEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

        // 验证接收邮箱
        const toEmails = Array.isArray(platform.to) ? platform.to : [platform.to]
        for (const email of toEmails) {
          // 提取实际邮箱地址（如果是 Name <email> 格式）
          const actualEmail = email.includes('<') ? email.match(/<([^>]+)>/)?.[1] : email
          if (!actualEmail || !simpleEmailRegex.test(actualEmail)) {
            throw new Error(`无效的接收邮箱格式: ${email}`)
          }
        }

        // 验证发送邮箱（支持 Name <email> 格式）
        if (platform.from) {
          const actualFromEmail = platform.from.includes('<')
            ? platform.from.match(/<([^>]+)>/)?.[1]
            : platform.from
          if (!actualFromEmail || !simpleEmailRegex.test(actualFromEmail)) {
            throw new Error(`无效的发送邮箱格式: ${platform.from}`)
          }
        }
        break
      }
    }
  }

  /**
   * 验证URL格式
   */
  isValidUrl(url) {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  /**
   * 获取默认配置
   */
  getDefaultConfig() {
    return {
      enabled: false,
      platforms: [],
      notificationTypes: {
        accountAnomaly: true, // 账号异常
        quotaWarning: true, // 配额警告
        systemError: true, // 系统错误
        securityAlert: true, // 安全警报
        test: true // 测试通知
      },
      retrySettings: {
        maxRetries: 3,
        retryDelay: 1000, // 毫秒
        timeout: 10000 // 毫秒
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }

  /**
   * 添加webhook平台
   */
  async addPlatform(platform) {
    try {
      const config = await this.getConfig()

      // 生成唯一ID
      platform.id = platform.id || uuidv4()
      platform.enabled = platform.enabled !== false
      platform.createdAt = new Date().toISOString()

      // 验证平台配置
      this.validatePlatformConfig(platform)

      // 添加到配置
      config.platforms = config.platforms || []
      config.platforms.push(platform)

      await this.saveConfig(config)

      return platform
    } catch (error) {
      logger.error('添加webhook平台失败:', error)
      throw error
    }
  }

  /**
   * 更新webhook平台
   */
  async updatePlatform(platformId, updates) {
    try {
      const config = await this.getConfig()

      const index = config.platforms.findIndex((p) => p.id === platformId)
      if (index === -1) {
        throw new Error('找不到指定的webhook平台')
      }

      // 合并更新
      config.platforms[index] = {
        ...config.platforms[index],
        ...updates,
        updatedAt: new Date().toISOString()
      }

      // 验证更新后的配置
      this.validatePlatformConfig(config.platforms[index])

      await this.saveConfig(config)

      return config.platforms[index]
    } catch (error) {
      logger.error('更新webhook平台失败:', error)
      throw error
    }
  }

  /**
   * 删除webhook平台
   */
  async deletePlatform(platformId) {
    try {
      const config = await this.getConfig()

      config.platforms = config.platforms.filter((p) => p.id !== platformId)

      await this.saveConfig(config)

      logger.info(`✅ 已删除webhook平台: ${platformId}`)
      return true
    } catch (error) {
      logger.error('删除webhook平台失败:', error)
      throw error
    }
  }

  /**
   * 切换webhook平台启用状态
   */
  async togglePlatform(platformId) {
    try {
      const config = await this.getConfig()

      const platform = config.platforms.find((p) => p.id === platformId)
      if (!platform) {
        throw new Error('找不到指定的webhook平台')
      }

      platform.enabled = !platform.enabled
      platform.updatedAt = new Date().toISOString()

      await this.saveConfig(config)

      logger.info(`✅ Webhook平台 ${platformId} 已${platform.enabled ? '启用' : '禁用'}`)
      return platform
    } catch (error) {
      logger.error('切换webhook平台状态失败:', error)
      throw error
    }
  }

  /**
   * 获取启用的平台列表
   */
  async getEnabledPlatforms() {
    try {
      const config = await this.getConfig()

      if (!config.enabled || !config.platforms) {
        return []
      }

      return config.platforms.filter((p) => p.enabled)
    } catch (error) {
      logger.error('获取启用的webhook平台失败:', error)
      return []
    }
  }
}

module.exports = new WebhookConfigService()
