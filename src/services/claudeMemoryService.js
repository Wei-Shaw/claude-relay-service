const fs = require('fs')
const path = require('path')
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
    // this.lastLoadedFilePath = null
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
   * @param {Object} body - 请求体
   * @param isRealClaudeCode
   */
  injectTeamMemory(body, isRealClaudeCode = null) {
    // 检查是否启用
    if (!this.isEnabled()) {
      return
    }

    const teamMemoryConfig = this.getConfig()

    // 如果没有传入 isRealClaudeCode，自动判断
    const isRealCC =
      isRealClaudeCode !== null ? isRealClaudeCode : this.isRealClaudeCodeRequest(body)

    // 检查是否仅对真实 Claude Code 请求注入
    if (teamMemoryConfig.onlyForRealClaudeCode && !isRealCC) {
      return
    }

    // 获取团队 Memory 内容
    let memoryContent = teamMemoryConfig.content || ''

    // 如果配置为空，尝试从文件读取
    if (!memoryContent) {
      memoryContent = this.loadTeamMemoryFromFile()
    }

    // 如果仍然为空，跳过注入
    if (!memoryContent || !memoryContent.trim()) {
      return
    }

    // 构建团队 Memory 块
    const teamMemoryBlock = {
      type: 'text',
      text: memoryContent.trim()
    }

    // 如果启用缓存控制，添加 cache_control
    if (teamMemoryConfig.useCacheControl) {
      teamMemoryBlock.cache_control = {
        type: 'ephemeral'
      }
    }

    // 确保 system 是数组
    if (!Array.isArray(body.system)) {
      body.system = []
    }

    // 插入到第二个位置（Claude Code prompt 之后）
    // system[0] = Claude Code prompt
    // system[1] = Team Memory (新插入)
    // system[2+] = 用户的 system prompts
    body.system.splice(1, 0, teamMemoryBlock)

    logger.info('🧠 Injected team memory into system prompts')
  }

  /**
   * 从文件读取团队 Memory
   * @returns {string} Memory 内容
   */
  loadTeamMemoryFromFile() {
    if (this.cachedMemory !== null) {
      return this.cachedMemory
    }
    try {
      const memoryFilePaths = [
        path.join(process.cwd(), '.local', 'team-memory.md'),
        path.join(process.cwd(), '.local', 'TEAM_CLAUDE.md'),
        path.join(process.cwd(), 'data', 'team-memory.md')
      ]

      for (const filePath of memoryFilePaths) {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8')
          logger.info(`📂 Loaded team memory from: ${filePath}`)
          // this.lastLoadedFilePath = filePath
          this.cachedMemory = content
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
   * 清除缓存的 Memory 内容
   */
  clearCache() {
    this.cachedMemory = null
    // this.lastLoadedFilePath = null
  }
}

module.exports = new ClaudeMemoryService()
