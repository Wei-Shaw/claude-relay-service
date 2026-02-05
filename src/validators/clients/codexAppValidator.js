const logger = require('../../utils/logger')
const { CLIENT_DEFINITIONS } = require('../clientDefinitions')

/**
 * Codex App 验证器
 * 验证请求是否来自 Codex Desktop App
 */
class CodexAppValidator {
  /**
   * 获取客户端ID
   */
  static getId() {
    return CLIENT_DEFINITIONS.CODEX_APP.id
  }

  /**
   * 获取客户端名称
   */
  static getName() {
    return CLIENT_DEFINITIONS.CODEX_APP.name
  }

  /**
   * 获取客户端描述
   */
  static getDescription() {
    return CLIENT_DEFINITIONS.CODEX_APP.description
  }

  /**
   * 验证请求是否来自 Codex App
   * @param {Object} req - Express 请求对象
   * @returns {boolean} 验证结果
   */
  static validate(req) {
    try {
      const userAgent = req.headers['user-agent'] || ''
      const originator = req.headers['originator'] || ''
      const sessionId = req.headers['session_id']

      // 1. 基础 User-Agent 检查
      // Codex App 的 UA 格式:
      // - Codex Desktop/0.95.0-alpha.7 (Mac OS 15.7.1; arm64) Apple_Terminal/455.1 (Codex Desktop; 260204.1342)
      const codexAppPattern = /^Codex Desktop\/[\w.-]+/i
      const uaMatch = userAgent.match(codexAppPattern)

      if (!uaMatch) {
        logger.debug(`Codex App validation failed - UA mismatch: ${userAgent}`)
        return false
      }

      // 2. 对于特定路径，进行额外的严格验证
      // 对于 /openai 和 /azure 路径需要完整验证
      const strictValidationPaths = ['/openai', '/azure']
      const needsStrictValidation =
        req.path && strictValidationPaths.some((path) => req.path.startsWith(path))

      if (!needsStrictValidation) {
        logger.debug(`Codex App detected for path: ${req.path}, allowing access`)
        return true
      }

      // 3. 验证 originator 头
      if (!originator || originator.toLowerCase() !== 'codex desktop') {
        logger.debug(
          `Codex App validation failed - originator mismatch: ${originator || 'missing'}`
        )
        return false
      }

      // 4. 检查 session_id - 必须存在且长度大于20
      if (!sessionId || sessionId.length <= 20) {
        logger.debug(`Codex App validation failed - session_id missing or too short: ${sessionId}`)
        return false
      }

      // 5. 对于 /openai/responses 和 /azure/response 路径，额外检查 body 中的 instructions 字段
      if (
        req.path &&
        (req.path.includes('/openai/responses') || req.path.includes('/azure/response'))
      ) {
        if (!req.body || !req.body.instructions) {
          logger.debug(`Codex App validation failed - missing instructions in body for ${req.path}`)
          return false
        }

        const expectedPrefix = 'You are Codex, a coding agent based on GPT-5.'
        if (!req.body.instructions.startsWith(expectedPrefix)) {
          logger.debug(`Codex App validation failed - invalid instructions prefix for ${req.path}`)
          logger.debug(`Expected: "${expectedPrefix}..."`)
          logger.debug(`Received: "${req.body.instructions.substring(0, 100)}..."`)
          return false
        }

        // 额外检查 model 字段应包含 codex
        if (req.body.model && !String(req.body.model).toLowerCase().includes('codex')) {
          logger.debug(`Codex App validation warning - unexpected model: ${req.body.model}`)
          // 只记录警告，不拒绝请求
        }
      }

      logger.debug(`Codex App validation passed for UA: ${userAgent}`)
      return true
    } catch (error) {
      logger.error('Error in CodexAppValidator:', error)
      return false
    }
  }

  /**
   * 获取验证器信息
   */
  static getInfo() {
    return {
      id: this.getId(),
      name: this.getName(),
      description: this.getDescription(),
      icon: CLIENT_DEFINITIONS.CODEX_APP.icon
    }
  }
}

module.exports = CodexAppValidator
