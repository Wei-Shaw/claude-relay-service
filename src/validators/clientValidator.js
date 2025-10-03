/**
 * 客户端验证器
 * 用于验证请求是否来自特定的客户端
 */

const logger = require('../utils/logger')
const { CLIENT_DEFINITIONS, getAllClientDefinitions } = require('./clientDefinitions')
const ClaudeCodeValidator = require('./clients/claudeCodeValidator')
const GeminiCliValidator = require('./clients/geminiCliValidator')
const CodexCliValidator = require('./clients/codexCliValidator')

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
    switch (clientId) {
      case 'claude_code':
        return ClaudeCodeValidator
      case 'gemini_cli':
        return GeminiCliValidator
      case 'codex_cli':
        return CodexCliValidator
      default:
        logger.warn(`Unknown client ID: ${clientId}`)
        return null
    }
  }

  /**
   * 获取所有支持的客户端ID列表
   * @returns {Array<string>} 客户端ID列表
   */
  static getSupportedClients() {
    return ['claude_code', 'gemini_cli', 'codex_cli']
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
   * @param {Array<string>} allowedClients - 允许的客户端ID列表
   * @param {Object} req - Express请求对象
   * @returns {Object} 验证结果对象
   */
  static validateRequest(allowedClients, req) {
    const userAgent = req.headers['user-agent'] || ''
    const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'

    // 记录验证开始
    logger.api(`🔍 Starting client validation for User-Agent: "${userAgent}"`)
    logger.api(`   Allowed clients: ${allowedClients.join(', ')}`)
    logger.api(`   Request from IP: ${clientIP}`)

    // 遍历所有允许的客户端进行验证
    for (const clientId of allowedClients) {
      const validator = this.getValidator(clientId)

      if (!validator) {
        logger.warn(`Skipping unknown client ID: ${clientId}`)
        continue
      }

      logger.debug(`Checking against ${validator.getName()}...`)

      try {
        if (validator.validate(req)) {
          // 验证成功
          logger.api(`✅ Client validated: ${validator.getName()} (${clientId})`)
          logger.api(`   Matched User-Agent: "${userAgent}"`)

          return {
            allowed: true,
            matchedClient: clientId,
            clientName: validator.getName(),
            clientInfo: Object.values(CLIENT_DEFINITIONS).find((def) => def.id === clientId)
          }
        }
      } catch (error) {
        logger.error(`Error during validation for ${clientId}:`, error)
        continue
      }
    }

    // 没有匹配的客户端
    logger.api(`❌ No matching client found for User-Agent: "${userAgent}"`)
    return {
      allowed: false,
      matchedClient: null,
      reason: 'No matching client found'
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
