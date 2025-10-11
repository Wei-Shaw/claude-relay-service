const logger = require('../../utils/logger')
const { CLIENT_DEFINITIONS } = require('../clientDefinitions')

/**
 * Codex CLI 验证器
 * 验证请求是否来自 Codex CLI
 */
class CodexCliValidator {
  /**
   * 获取客户端ID
   */
  static getId() {
    return CLIENT_DEFINITIONS.CODEX_CLI.id
  }

  /**
   * 获取客户端名称
   */
  static getName() {
    return CLIENT_DEFINITIONS.CODEX_CLI.name
  }

  /**
   * 获取客户端描述
   */
  static getDescription() {
    return CLIENT_DEFINITIONS.CODEX_CLI.description
  }

  /**
   * 验证请求是否来自 Codex CLI
   * @param {Object} req - Express 请求对象
   * @returns {boolean} 验证结果
   */
  static validate(req) {
    try {
      const userAgent = req.headers['user-agent'] || ''
      const originator = req.headers['originator'] || ''
      const sessionId = req.headers['session_id']

      // 1. 基础 User-Agent 检查
      // Codex CLI 的 UA 格式:
      // - codex_vscode/0.35.0 (Windows 10.0.26100; x86_64) unknown (Cursor; 0.4.10)
      // - codex_cli_rs/0.38.0 (Ubuntu 22.4.0; x86_64) WindowsTerminal
      const codexCliPattern = /^(codex_vscode|codex_cli_rs)\/[\d.]+/i
      const uaMatch = userAgent.match(codexCliPattern)

      if (!uaMatch) {
        logger.debug(`Codex CLI validation failed - UA mismatch: ${userAgent}`)
        return false
      }

      // 2. 对于特定路径，进行额外的严格验证
      // 对于 /openai 和 /azure 路径需要完整验证
      const strictValidationPaths = ['/openai', '/azure']
      const needsStrictValidation =
        req.path && strictValidationPaths.some((path) => req.path.startsWith(path))

      if (!needsStrictValidation) {
        // 其他路径，只要 User-Agent 匹配就认为是 Codex CLI
        logger.debug(`Codex CLI detected for path: ${req.path}, allowing access`)
        return true
      }

      // 3. 验证 originator 头必须与 UA 中的客户端类型匹配
      const clientType = uaMatch[1].toLowerCase()
      if (originator.toLowerCase() !== clientType) {
        logger.debug(
          `Codex CLI validation failed - originator mismatch. UA: ${clientType}, originator: ${originator}`
        )
        return false
      }

      // 4. 检查 session_id - 必须存在且长度大于20
      if (!sessionId || sessionId.length <= 20) {
        logger.debug(`Codex CLI validation failed - session_id missing or too short: ${sessionId}`)
        return false
      }

      // 5. 对于 /openai/responses 和 /azure/response 路径，额外检查 body 中的 instructions 字段
      if (
        req.path &&
        (req.path.includes('/openai/responses') || req.path.includes('/azure/response'))
      ) {
        if (!req.body || !req.body.instructions) {
          logger.debug(`Codex CLI validation failed - missing instructions in body for ${req.path}`)
          return false
        }

        const expectedPrefix =
          'You are Codex, based on GPT-5. You are running as a coding agent in the Codex CLI'
        if (!req.body.instructions.startsWith(expectedPrefix)) {
          logger.debug(`Codex CLI validation failed - invalid instructions prefix for ${req.path}`)
          logger.debug(`Expected: "${expectedPrefix}..."`)
          logger.debug(`Received: "${req.body.instructions.substring(0, 100)}..."`)
          return false
        }

        // 额外检查 model 字段应该是 gpt-5-codex
        if (req.body.model && req.body.model !== 'gpt-5-codex') {
          logger.debug(`Codex CLI validation warning - unexpected model: ${req.body.model}`)
          // 只记录警告，不拒绝请求
        }
      }

      // 所有必要检查通过
      logger.debug(`Codex CLI validation passed for UA: ${userAgent}`)
      return true
    } catch (error) {
      logger.error('Error in CodexCliValidator:', error)
      // 验证出错时默认拒绝
      return false
    }
  }

  /**
   * 比较版本号
   * @returns {number} -1: v1 < v2, 0: v1 = v2, 1: v1 > v2
   */
  static compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number)
    const parts2 = v2.split('.').map(Number)

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0
      const part2 = parts2[i] || 0

      if (part1 < part2) {
        return -1
      }
      if (part1 > part2) {
        return 1
      }
    }

    return 0
  }

  /**
   * 获取验证器信息
   */
  static getInfo() {
    return {
      id: this.getId(),
      name: this.getName(),
      description: this.getDescription(),
      icon: CLIENT_DEFINITIONS.CODEX_CLI.icon
    }
  }
}

module.exports = CodexCliValidator
