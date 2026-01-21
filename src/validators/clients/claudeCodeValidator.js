const logger = require('../../utils/logger')
const { CLIENT_DEFINITIONS } = require('../clientDefinitions')
const { bestSimilarityByTemplates, SYSTEM_PROMPT_THRESHOLD } = require('../../utils/contents')

/**
 * Claude Code CLI 验证器
 * 验证请求是否来自 Claude Code CLI
 */
class ClaudeCodeValidator {
  /**
   * 获取客户端ID
   */
  static getId() {
    return CLIENT_DEFINITIONS.CLAUDE_CODE.id
  }

  /**
   * 获取客户端名称
   */
  static getName() {
    return CLIENT_DEFINITIONS.CLAUDE_CODE.name
  }

  /**
   * 获取客户端描述
   */
  static getDescription() {
    return CLIENT_DEFINITIONS.CLAUDE_CODE.description
  }

  /**
   * 获取客户端图标
   */
  static getIcon() {
    return CLIENT_DEFINITIONS.CLAUDE_CODE.icon || '🤖'
  }

  /**
   * 检查请求是否包含 Claude Code 系统提示词
   * @param {Object} body - 请求体
   * @returns {boolean} 是否包含 Claude Code 系统提示词
   */
  static hasClaudeCodeSystemPrompt(body, customThreshold) {
    if (!body || typeof body !== 'object') {
      return false
    }

    const model = typeof body.model === 'string' ? body.model : null
    if (!model) {
      return false
    }

    const systemEntries = Array.isArray(body.system) ? body.system : null
    if (!systemEntries) {
      return false
    }

    const threshold =
      typeof customThreshold === 'number' && Number.isFinite(customThreshold)
        ? customThreshold
        : SYSTEM_PROMPT_THRESHOLD

    for (const entry of systemEntries) {
      const rawText = typeof entry?.text === 'string' ? entry.text : ''
      const { bestScore, templateId, maskedRaw } = bestSimilarityByTemplates(rawText)
      if (bestScore < threshold) {
        logger.error(
          `Claude system prompt similarity below threshold: score=${bestScore.toFixed(4)}, threshold=${threshold}`
        )
        const preview = typeof maskedRaw === 'string' ? maskedRaw.slice(0, 200) : ''
        logger.warn(
          `Claude system prompt detail: templateId=${templateId || 'unknown'}, preview=${preview}${
            maskedRaw && maskedRaw.length > 200 ? '…' : ''
          }`
        )
        return false
      }
    }
    return true
  }

  /**
   * 判断是否存在 Claude Code 系统提示词（存在即返回 true）
   * @param {Object} body - 请求体
   * @param {number} [customThreshold] - 自定义阈值
   * @returns {boolean} 是否存在 Claude Code 系统提示词
   */
  static includesClaudeCodeSystemPrompt(body, customThreshold) {
    if (!body || typeof body !== 'object') {
      return false
    }

    const model = typeof body.model === 'string' ? body.model : null
    if (!model) {
      return false
    }

    const systemEntries = Array.isArray(body.system) ? body.system : null
    if (!systemEntries) {
      return false
    }

    const threshold =
      typeof customThreshold === 'number' && Number.isFinite(customThreshold)
        ? customThreshold
        : SYSTEM_PROMPT_THRESHOLD

    let bestMatchScore = 0

    for (const entry of systemEntries) {
      const rawText = typeof entry?.text === 'string' ? entry.text : ''
      const { bestScore } = bestSimilarityByTemplates(rawText)

      if (bestScore > bestMatchScore) {
        bestMatchScore = bestScore
      }

      if (bestScore >= threshold) {
        return true
      }
    }

    logger.debug(
      `Claude system prompt not detected: bestScore=${bestMatchScore.toFixed(4)}, threshold=${threshold}`
    )

    return false
  }

  /**
   * 验证请求是否来自 Claude Code CLI
   * @param {Object} req - Express 请求对象
   * @returns {boolean} 验证结果
   */
  static validate(req) {
    try {
      const userAgent = req.headers['user-agent'] || ''
      const path = req.path || ''

      const claudeCodePattern = /^claude-cli\/\d+\.\d+\.\d+/i

      if (!claudeCodePattern.test(userAgent)) {
        // 不是 Claude Code 的请求，此验证器不处理
        return false
      }

      // 2. Claude Code 检测到，对于特定路径进行额外的严格验证
      if (!path.includes('messages')) {
        // 其他路径，只要 User-Agent 匹配就认为是 Claude Code
        logger.debug(`Claude Code detected for path: ${path}, allowing access`)
        return true
      }

      // 3. 检查系统提示词是否为 Claude Code 的系统提示词
      if (!this.hasClaudeCodeSystemPrompt(req.body)) {
        logger.debug('Claude Code validation failed - missing or invalid Claude Code system prompt')
        return false
      }

      // 4. 检查必需的头部（值不为空即可）
      const xApp = req.headers['x-app']
      const anthropicBeta = req.headers['anthropic-beta']
      const anthropicVersion = req.headers['anthropic-version']

      if (!xApp || xApp.trim() === '') {
        logger.debug('Claude Code validation failed - missing or empty x-app header')
        return false
      }

      if (!anthropicBeta || anthropicBeta.trim() === '') {
        logger.debug('Claude Code validation failed - missing or empty anthropic-beta header')
        return false
      }

      if (!anthropicVersion || anthropicVersion.trim() === '') {
        logger.debug('Claude Code validation failed - missing or empty anthropic-version header')
        return false
      }

      logger.debug(
        `Claude Code headers - x-app: ${xApp}, anthropic-beta: ${anthropicBeta}, anthropic-version: ${anthropicVersion}`
      )

      // 5. 验证 body 中的 metadata.user_id
      if (!req.body || !req.body.metadata || !req.body.metadata.user_id) {
        logger.debug('Claude Code validation failed - missing metadata.user_id in body')
        return false
      }

      const userId = req.body.metadata.user_id
      // 格式: user_{64位字符串}_account__session_{哈希值}
      // user_d98385411c93cd074b2cefd5c9831fe77f24a53e4ecdcd1f830bba586fe62cb9_account__session_17cf0fd3-d51b-4b59-977d-b899dafb3022
      const userIdPattern = /^user_[a-fA-F0-9]{64}_account__session_[\w-]+$/

      if (!userIdPattern.test(userId)) {
        logger.debug(`Claude Code validation failed - invalid user_id format: ${userId}`)

        // 提供更详细的错误信息
        if (!userId.startsWith('user_')) {
          logger.debug('user_id must start with "user_"')
        } else {
          const parts = userId.split('_')
          if (parts.length < 4) {
            logger.debug('user_id format is incomplete')
          } else if (parts[1].length !== 64) {
            logger.debug(`user hash must be 64 characters, got ${parts[1].length}`)
          } else if (parts[2] !== 'account' || parts[3] !== '' || parts[4] !== 'session') {
            logger.debug('user_id must contain "_account__session_"')
          }
        }
        return false
      }

      // 6. 额外日志记录（用于调试）
      logger.debug(`Claude Code validation passed - UA: ${userAgent}, userId: ${userId}`)

      // 所有必要检查通过
      return true
    } catch (error) {
      logger.error('Error in ClaudeCodeValidator:', error)
      // 验证出错时默认拒绝
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
      icon: CLIENT_DEFINITIONS.CLAUDE_CODE.icon
    }
  }
}

module.exports = ClaudeCodeValidator
