const logger = require('../../utils/logger')
const { CLIENT_DEFINITIONS } = require('../clientDefinitions')

/**
 * Gemini CLI 验证器
 * 验证请求是否来自 Gemini CLI
 */
class GeminiCliValidator {
  /**
   * 获取客户端ID
   */
  static getId() {
    return CLIENT_DEFINITIONS.GEMINI_CLI.id
  }

  /**
   * 获取客户端名称
   */
  static getName() {
    return CLIENT_DEFINITIONS.GEMINI_CLI.name
  }

  /**
   * 获取客户端描述
   */
  static getDescription() {
    return CLIENT_DEFINITIONS.GEMINI_CLI.description
  }

  /**
   * 获取客户端图标
   */
  static getIcon() {
    return CLIENT_DEFINITIONS.GEMINI_CLI.icon || '💎'
  }

  /**
   * 验证请求是否来自 Gemini CLI
   * @param {Object} req - Express 请求对象
   * @returns {boolean} 验证结果
   */
  static validate(req) {
    try {
      const userAgent = req.headers['user-agent'] || ''
      const path = req.originalUrl || ''

      // 1. 必须是 /gemini 开头的路径
      if (!path.startsWith('/gemini')) {
        // 非 /gemini 路径不属于 Gemini
        return false
      }

      // 2. 对于 /gemini 路径，检查是否包含 generateContent
      if (path.includes('generateContent')) {
        // 包含 generateContent 的路径需要验证 User-Agent
        const geminiCliPattern = /^GeminiCLI\/v?[\d.]+/i
        if (!geminiCliPattern.test(userAgent)) {
          logger.debug(
            `Gemini CLI validation failed - UA mismatch for generateContent: ${userAgent}`
          )
          return false
        }
      }

      // 所有必要检查通过
      logger.debug(`Gemini CLI validation passed for path: ${path}`)
      return true
    } catch (error) {
      logger.error('Error in GeminiCliValidator:', error)
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
      icon: CLIENT_DEFINITIONS.GEMINI_CLI.icon
    }
  }
}

module.exports = GeminiCliValidator
