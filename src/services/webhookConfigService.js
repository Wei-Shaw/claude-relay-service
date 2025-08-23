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
      const validPlatforms = ['wechat_work', 'dingtalk', 'feishu', 'slack', 'discord', 'custom']

      for (const platform of config.platforms) {
        if (!validPlatforms.includes(platform.type)) {
          throw new Error(`不支持的平台类型: ${platform.type}`)
        }

        if (!platform.url || !this.isValidUrl(platform.url)) {
          throw new Error(`无效的webhook URL: ${platform.url}`)
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
      case 'custom':
        // 自定义webhook，用户自行负责格式
        break
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
