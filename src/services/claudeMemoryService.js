const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const config = require('../../config/config')
const logger = require('../utils/logger')
const ClaudeCodeValidator = require('../validators/clients/claudeCodeValidator')

/**
 * Claude 团队 Memory 服务
 * 负责管理和注入团队级别的 Claude Code Memory
 * 仅用于 Claude 相关的服务（官方、Console、Bedrock、CCR）
 */
class ClaudeMemoryService {
  constructor() {
    this.cachedMemory = null
    this.lastLoadedSource = null // 'content' | 'url' | 'file'
    this.lastLoadedTime = null
    this.refreshTimer = null

    // 启动时初始化（异步预加载）
    this._initializeMemory()
  }

  /**
   * 判断是否是真实的 Claude Code 请求
   * 使用 ClaudeCodeValidator 的相似度匹配来判断
   * @param {Object} body - 请求体
   * @returns {boolean}
   */
  isRealClaudeCodeRequest(body) {
    if (!body || !body.model) {
      return false
    }

    // 使用 ClaudeCodeValidator 的 includesClaudeCodeSystemPrompt 方法
    // 这个方法会检查 system 数组中是否有任何一个 prompt 与 Claude Code system prompt 相似
    return ClaudeCodeValidator.includesClaudeCodeSystemPrompt(body)
  }

  /**
   * 注入团队 Memory 到请求 body 中
   * 采用合并策略：将 Team Memory 合并到 system[1].text 开头
   * 这样不会增加新的 cache_control 块，避免超过4个缓存块的限制
   * @param {Object} body - 请求体
   * @param isRealClaudeCode
   */
  injectTeamMemory(body, isRealClaudeCode = null) {
    // 检查是否启用
    if (!this.isEnabled()) {
      return
    }

    const model = typeof body.model === 'string' ? body.model : null
    const teamMemoryConfig = this.getConfig()

    // 检查模型是否匹配配置的前缀
    if (model === null) {
      return
    }

    const modelPrefixes = teamMemoryConfig.modelPrefixes || ['claude-sonnet']
    const matchesPrefix = modelPrefixes.some((prefix) => model.startsWith(prefix))
    if (!matchesPrefix) {
      return
    }

    // 如果没有传入 isRealClaudeCode，自动判断
    const isRealCC =
      isRealClaudeCode !== null ? isRealClaudeCode : this.isRealClaudeCodeRequest(body)

    // 检查是否仅对真实 Claude Code 请求注入
    if (teamMemoryConfig.onlyForRealClaudeCode && !isRealCC) {
      return
    }

    // 获取团队 Memory 内容（使用统一加载方法）
    const memoryContent = this.loadTeamMemory()

    // 如果为空，跳过注入
    if (!memoryContent || !memoryContent.trim()) {
      return
    }

    // 确保 system 是数组
    if (!Array.isArray(body.system)) {
      body.system = []
    }

    // 🔍 生成带时间戳的标记（使用加载时间或当前时间）
    const timestamp = this.lastLoadedTime ? this.lastLoadedTime.getTime() : Date.now()
    const memoryStartMarker = `<!-- TEAM_MEMORY_START:${timestamp} -->`
    const memoryEndMarker = `<!-- TEAM_MEMORY_END:${timestamp} -->`
    const wrappedMemory = `${memoryStartMarker}\n${memoryContent.trim()}\n${memoryEndMarker}`

    // 正则匹配已存在的 Team Memory 块（任意时间戳）
    const memoryBlockRegex = /<!-- TEAM_MEMORY_START:\d+ -->[\s\S]*?<!-- TEAM_MEMORY_END:\d+ -->/

    // 📝 合并到 system[1].text（不增加新的 cache_control 块）
    if (body.system.length > 1) {
      const originalText = body.system[1].text || ''

      // 检查是否已存在 Team Memory 块
      const existingMatch = originalText.match(memoryBlockRegex)

      if (existingMatch) {
        // 已存在，检查时间戳是否相同
        const existingTimestampMatch = existingMatch[0].match(/TEAM_MEMORY_START:(\d+)/)
        const existingTimestamp = existingTimestampMatch
          ? parseInt(existingTimestampMatch[1], 10)
          : 0

        if (existingTimestamp === timestamp) {
          logger.debug('🔄 Team memory already injected with same timestamp, skipping', {
            timestamp
          })
          return
        }

        // 时间戳不同，替换整个块
        body.system[1].text = originalText.replace(memoryBlockRegex, wrappedMemory)

        logger.info('🔄 Updated team memory in system[1]', {
          source: this.lastLoadedSource,
          size: memoryContent.length,
          oldTimestamp: existingTimestamp,
          newTimestamp: timestamp
        })
      } else {
        // 不存在，插入到开头
        body.system[1].text = `${wrappedMemory}\n\n${originalText}`

        logger.info('🧠 Merged team memory into system[1]', {
          source: this.lastLoadedSource,
          size: memoryContent.length,
          timestamp
        })
      }

      // 如果配置启用缓存控制，且 system[1] 还没有 cache_control，添加它
      if (teamMemoryConfig.useCacheControl && !body.system[1].cache_control) {
        body.system[1].cache_control = {
          type: 'ephemeral'
        }
      }
    } else {
      // 只有 system[0] 或为空，追加一个新的 system block
      const teamMemoryBlock = {
        type: 'text',
        text: wrappedMemory
      }

      if (teamMemoryConfig.useCacheControl) {
        teamMemoryBlock.cache_control = {
          type: 'ephemeral'
        }
      }

      body.system.push(teamMemoryBlock)

      logger.info('🧠 Appended team memory as system[1]', {
        source: this.lastLoadedSource,
        size: memoryContent.length,
        timestamp
      })
    }

    logger.debug('🔧 Request body after team memory injection:', body)
  }

  /**
   * 初始化 Memory（启动时调用）
   */
  async _initializeMemory() {
    if (!this.isEnabled()) {
      return
    }

    // 预加载内容
    try {
      await this.refreshMemory()
    } catch (error) {
      logger.warn('⚠️ Failed to initialize team memory:', error.message)
    }

    // 启动自动刷新
    this.startAutoRefresh()
  }

  /**
   * 统一的团队 Memory 加载方法
   * @returns {string} Memory 内容
   */
  loadTeamMemory() {
    // 如果有缓存，直接返回
    if (this.cachedMemory !== null) {
      return this.cachedMemory
    }

    // 按优先级加载
    const teamMemoryConfig = this.getConfig()

    // 优先级 1: 直接配置的内容
    if (teamMemoryConfig.content && teamMemoryConfig.content.trim()) {
      this.cachedMemory = teamMemoryConfig.content
      this.lastLoadedSource = 'content'
      this.lastLoadedTime = new Date()
      logger.info('📝 Loaded team memory from config content')
      return this.cachedMemory
    }

    // 优先级 2: URL（同步返回缓存，异步加载在后台进行）
    if (teamMemoryConfig.url && teamMemoryConfig.url.trim()) {
      // 如果是首次加载且没有缓存，尝试同步加载（会有延迟）
      if (!this.cachedMemory) {
        logger.info('📡 Team memory URL configured, using async loading')
      }
      return this.cachedMemory || ''
    }

    // 优先级 3: 本地文件
    const fileContent = this._loadFromFile()
    if (fileContent) {
      this.cachedMemory = fileContent
      this.lastLoadedSource = 'file'
      this.lastLoadedTime = new Date()
      return this.cachedMemory
    }

    return ''
  }

  /**
   * 从文件读取团队 Memory（内部方法）
   * @returns {string} Memory 内容
   */
  _loadFromFile() {
    try {
      const memoryFilePaths = [
        path.join(process.cwd(), '.local', 'team-memory.md'),
        path.join(process.cwd(), '.local', 'TEAM_CLAUDE.md'),
        path.join(process.cwd(), 'data', 'team-memory.md')
      ]

      for (const filePath of memoryFilePaths) {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8')
          logger.info(`📂 Loaded team memory from file: ${filePath}`)
          return content
        }
      }

      return ''
    } catch (error) {
      logger.warn('⚠️ Failed to load team memory from file:', error.message)
      return ''
    }
  }

  /**
   * 从 URL 拉取团队 Memory
   * @returns {Promise<string>} Memory 内容
   */
  async loadTeamMemoryFromUrl() {
    const teamMemoryConfig = this.getConfig()
    const { url } = teamMemoryConfig

    if (!url || !url.trim()) {
      return ''
    }

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url)
      const protocol = urlObj.protocol === 'https:' ? https : http

      const request = protocol.get(
        url,
        {
          timeout: 30000 // 30秒超时
        },
        (res) => {
          // 检查状态码
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`))
            return
          }

          // 检查内容类型（可选，允许text/*）
          const contentType = res.headers['content-type'] || ''
          if (!contentType.includes('text/') && !contentType.includes('application/')) {
            logger.warn('⚠️ Unexpected content-type:', contentType)
          }

          let data = ''
          res.setEncoding('utf8')
          res.on('data', (chunk) => {
            data += chunk
          })
          res.on('end', () => {
            resolve(data)
          })
        }
      )

      request.on('error', (error) => {
        reject(error)
      })

      request.on('timeout', () => {
        request.destroy()
        reject(new Error('Request timeout'))
      })
    })
  }

  /**
   * 获取团队 Memory 配置
   * @returns {Object} 配置对象
   */
  getConfig() {
    return config.claude.teamMemory || {}
  }

  /**
   * 检查团队 Memory 是否启用
   * @returns {boolean}
   */
  isEnabled() {
    const teamMemoryConfig = this.getConfig()
    return teamMemoryConfig.enabled === true
  }

  /**
   * 刷新团队 Memory（手动或自动调用）
   */
  async refreshMemory() {
    const teamMemoryConfig = this.getConfig()

    // 优先级 1: 直接配置的内容（不刷新）
    if (teamMemoryConfig.content && teamMemoryConfig.content.trim()) {
      logger.debug('📝 Team memory using direct content, no refresh needed')
      return
    }

    // 优先级 2: URL
    if (teamMemoryConfig.url && teamMemoryConfig.url.trim()) {
      try {
        const content = await this.loadTeamMemoryFromUrl()
        if (content && content.trim()) {
          this.cachedMemory = content
          this.lastLoadedSource = 'url'
          this.lastLoadedTime = new Date()
          logger.info('📡 Refreshed team memory from URL', {
            url: teamMemoryConfig.url,
            size: content.length
          })
        } else {
          logger.warn('⚠️ URL returned empty content')
        }
      } catch (error) {
        logger.error('❌ Failed to refresh team memory from URL:', error.message)
        // 保留旧缓存，不清空
      }
      return
    }

    // 优先级 3: 本地文件
    const fileContent = this._loadFromFile()
    if (fileContent) {
      this.cachedMemory = fileContent
      this.lastLoadedSource = 'file'
      this.lastLoadedTime = new Date()
      logger.info('📂 Refreshed team memory from file', {
        size: fileContent.length
      })
    }
  }

  /**
   * 启动自动刷新
   */
  startAutoRefresh() {
    const teamMemoryConfig = this.getConfig()
    const refreshInterval = teamMemoryConfig.refreshInterval || 0

    // 如果已经有定时器，先清除
    if (this.refreshTimer) {
      this.stopAutoRefresh()
    }

    // 如果间隔为 0 或负数，不启动
    if (refreshInterval <= 0) {
      logger.debug('🔄 Auto-refresh disabled (interval: 0)')
      return
    }

    // 如果是直接配置的内容，不需要刷新
    if (teamMemoryConfig.content && teamMemoryConfig.content.trim()) {
      logger.debug('🔄 Auto-refresh not needed for direct content')
      return
    }

    // 启动定时器（转换为毫秒）
    const intervalMs = refreshInterval * 60 * 1000
    this.refreshTimer = setInterval(() => {
      logger.debug('🔄 Auto-refreshing team memory...')
      this.refreshMemory().catch((error) => {
        logger.error('❌ Auto-refresh failed:', error.message)
      })
    }, intervalMs)

    logger.info('🔄 Started team memory auto-refresh', {
      intervalMinutes: refreshInterval
    })
  }

  /**
   * 停止自动刷新
   */
  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
      logger.info('🛑 Stopped team memory auto-refresh')
    }
  }

  /**
   * 清除缓存的 Memory 内容
   */
  clearCache() {
    this.cachedMemory = null
    this.lastLoadedSource = null
    this.lastLoadedTime = null
  }

  /**
   * 获取状态信息（用于调试）
   */
  getStatus() {
    return {
      enabled: this.isEnabled(),
      source: this.lastLoadedSource,
      lastLoadedTime: this.lastLoadedTime,
      cacheSize: this.cachedMemory ? this.cachedMemory.length : 0,
      autoRefreshEnabled: !!this.refreshTimer,
      config: this.getConfig()
    }
  }
}

module.exports = new ClaudeMemoryService()
