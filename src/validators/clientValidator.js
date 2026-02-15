/**
 * 客户端验证器
 * 用于验证请求是否来自特定的客户端
 */

const logger = require('../utils/logger')
const {
  CLIENT_IDS,
  getAllClientDefinitions,
  getClientDefinitionById,
  isPathAllowedForClient
} = require('./clientDefinitions')
const ClaudeCodeValidator = require('./clients/claudeCodeValidator')
const GeminiCliValidator = require('./clients/geminiCliValidator')
const CodexCliValidator = require('./clients/codexCliValidator')
const DroidCliValidator = require('./clients/droidCliValidator')

// 客户端ID到验证器的映射表
const VALIDATOR_MAP = {
  [CLIENT_IDS.CLAUDE_CODE]: ClaudeCodeValidator,
  [CLIENT_IDS.GEMINI_CLI]: GeminiCliValidator,
  [CLIENT_IDS.CODEX_CLI]: CodexCliValidator,
  [CLIENT_IDS.DROID_CLI]: DroidCliValidator
}

/**
 * 客户端验证器类
 */
class ClientValidator {
  /**
   * 获取客户端验证器
   * @param {string} clientId - 客户端ID
   * @returns {Object|null} 验证器实例
   */
  static getValidator(clientId) {
    const validator = VALIDATOR_MAP[clientId]
    if (!validator) {
      logger.warn(`Unknown client ID: ${clientId}`)
      return null
    }
    return validator
  }

  /**
   * 获取所有支持的客户端ID列表
   * @returns {Array<string>} 客户端ID列表
   */
  static getSupportedClients() {
    return Object.keys(VALIDATOR_MAP)
  }

  /**
   * 验证单个客户端
   * @param {string} clientId - 客户端ID
   * @param {Object} req - Express请求对象
   * @returns {boolean} 验证结果
   */
  static validateClient(clientId, req) {
    const validator = this.getValidator(clientId)

    if (!validator) {
      logger.warn(`No validator found for client: ${clientId}`)
      return false
    }

    try {
      return validator.validate(req)
    } catch (error) {
      logger.error(`Error validating client ${clientId}:`, error)
      return false
    }
  }

  /**
   * 验证请求是否来自允许的客户端列表中的任一客户端
   * 包含路径白名单检查，防止通过其他兼容端点绕过客户端限制
   * @param {Array<string>} allowedClients - 允许的客户端ID列表
   * @param {Object} req - Express请求对象
   * @returns {Object} 验证结果对象
   */
  static validateRequest(allowedClients, req) {
    const userAgent = req.headers['user-agent'] || ''
    const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'
    const requestPath = req.originalUrl || req.path || ''

    // 记录验证开始
    logger.api(`🔍 Starting client validation for User-Agent: "${userAgent}"`)
    logger.api(`   Allowed clients: ${allowedClients.join(', ')}`)
    logger.api(`   Request path: ${requestPath}`)
    logger.api(`   Request from IP: ${clientIP}`)

    // 遍历所有允许的客户端进行验证
    for (const clientId of allowedClients) {
      const validator = this.getValidator(clientId)

      if (!validator) {
        logger.warn(`Skipping unknown client ID: ${clientId}`)
        continue
      }

      // 路径白名单检查：先检查路径是否允许该客户端访问
      if (!isPathAllowedForClient(clientId, requestPath)) {
        logger.debug(`Path "${requestPath}" not allowed for ${validator.getName()}, skipping`)
        continue
      }

      logger.debug(`Checking against ${validator.getName()}...`)

      try {
        if (validator.validate(req)) {
          // 验证成功
          logger.api(`✅ Client validated: ${validator.getName()} (${clientId})`)
          logger.api(`   Matched User-Agent: "${userAgent}"`)
          logger.api(`   Allowed path: "${requestPath}"`)

          return {
            allowed: true,
            matchedClient: clientId,
            clientName: validator.getName(),
            clientInfo: getClientDefinitionById(clientId)
          }
        }
      } catch (error) {
        logger.error(`Error during validation for ${clientId}:`, error)
        continue
      }
    }

    // 没有匹配的客户端
    logger.api(
      `❌ No matching client found for User-Agent: "${userAgent}" and path: "${requestPath}"`
    )
    return {
      allowed: false,
      matchedClient: null,
      reason: 'No matching client found or path not allowed',
      userAgent,
      requestPath
    }
  }

  /**
   * 获取客户端信息
   * @param {string} clientId - 客户端ID
   * @returns {Object} 客户端信息
   */
  static getClientInfo(clientId) {
    const validator = this.getValidator(clientId)
    if (!validator) {
      return null
    }

    return validator.getInfo()
  }

  /**
   * 获取所有可用的客户端信息
   * @returns {Array<Object>} 客户端信息数组
   */
  static getAvailableClients() {
    // 直接从 CLIENT_DEFINITIONS 返回所有客户端信息
    return getAllClientDefinitions()
  }
}

module.exports = ClientValidator
