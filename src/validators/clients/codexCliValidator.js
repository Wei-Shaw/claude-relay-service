const logger = require('../../utils/logger')
const { CLIENT_DEFINITIONS } = require('../clientDefinitions')

/**
 * Codex CLI 验证器
 * 验证请求是否来自 Codex CLI / VS Code / TUI 等官方客户端
 *
 * 身份特征只用协议头（UA / originator / session-id），
 * 不用 body.instructions 文案——官方远端模型模板可换成任意 system prompt
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
   * 获取客户端信息
   */
  static getInfo() {
    return {
      id: this.getId(),
      name: this.getName(),
      description: this.getDescription(),
      icon: CLIENT_DEFINITIONS.CODEX_CLI.icon
    }
  }

  // 子路由挂载后 req.path 是相对路径（如 /models、/responses），
  // 必须拼 baseUrl 或回退 originalUrl，才能匹配 /openai、/azure 前缀
  static getFullRequestPath(req) {
    const mountedPath = `${req?.baseUrl || ''}${req?.path || ''}`
    if (mountedPath) {
      return mountedPath
    }
    const originalUrl = typeof req?.originalUrl === 'string' ? req.originalUrl : ''
    return originalUrl.split('?')[0] || ''
  }

  static isResponsesPath(fullPath) {
    const path = (fullPath || '').toLowerCase()
    return path.includes('/responses') || path.includes('/azure/response')
  }

  // 对齐官方 is_first_party_originator + 已知客户端 + 常见 env override（codex_*）
  static isAllowedCodexOriginator(originatorValue) {
    if (!originatorValue || typeof originatorValue !== 'string') {
      return false
    }
    if (
      originatorValue === 'codex_cli_rs' ||
      originatorValue === 'codex-tui' ||
      originatorValue === 'codex_vscode' ||
      originatorValue === 'codex_exec'
    ) {
      return true
    }
    // 官方：originator.starts_with("Codex ")
    if (originatorValue.startsWith('Codex ')) {
      return true
    }
    // CODEX_INTERNAL_ORIGINATOR_OVERRIDE 常见形态：codex_* / codex-*
    if (/^codex[_-]/i.test(originatorValue)) {
      return true
    }
    return false
  }

  // 官方 UA：`${originator}/${version} (...)`；env override 时前缀随 originator 变化
  static userAgentMatchesOriginator(userAgent, originatorValue) {
    if (!userAgent || !originatorValue) {
      return false
    }
    const escaped = originatorValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`^${escaped}\\/[\\d.]+`, 'i')
    return pattern.test(userAgent)
  }

  // 仅看 UA 是否像 Codex 客户端（无 originator 时的宽松探测）
  static looksLikeCodexUserAgent(userAgent) {
    if (!userAgent || typeof userAgent !== 'string') {
      return false
    }
    return (
      /^(codex_vscode|codex_cli_rs|codex_exec|codex-tui)\//i.test(userAgent) ||
      /^Codex [^/]+\//.test(userAgent) ||
      /^codex[_-][^/\s]+\//i.test(userAgent)
    )
  }

  // 官方会话头是 session-id / thread-id；兼容历史 session_id / x-session-id
  static extractSessionId(req) {
    const headers = req?.headers || {}
    const candidates = [
      headers['session-id'],
      headers.session_id,
      headers['x-session-id'],
      headers['thread-id'],
      req?.body?.session_id,
      req?.body?.conversation_id,
      req?.body?.prompt_cache_key
    ]
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
    return null
  }

  // Codex 客户端完整判定（单一契约）：
  // - /openai、/azure、responses：必须 originator 合法且 UA 前缀一致（禁止仅 UA 退化）
  // - 其他路径：无 originator 时可仅看 UA
  // - responses 路径：额外要求 session-id
  // 用于：客户端限制硬门 + 路由层是否跳过适配改包
  static isCodexClientRequest(req) {
    const userAgent = req?.headers?.['user-agent'] || ''
    const originator = req?.headers?.originator || ''
    const fullPath = CodexCliValidator.getFullRequestPath(req)
    const lowerPath = fullPath.toLowerCase()
    const requireOriginator =
      lowerPath.startsWith('/openai') ||
      lowerPath.startsWith('/azure') ||
      CodexCliValidator.isResponsesPath(fullPath)

    if (requireOriginator) {
      // 严格：伪造 UA + session 但无 originator 不得过
      if (
        !CodexCliValidator.isAllowedCodexOriginator(originator) ||
        !CodexCliValidator.userAgentMatchesOriginator(userAgent, originator)
      ) {
        return false
      }
    } else if (originator) {
      if (
        !CodexCliValidator.isAllowedCodexOriginator(originator) ||
        !CodexCliValidator.userAgentMatchesOriginator(userAgent, originator)
      ) {
        return false
      }
    } else if (!CodexCliValidator.looksLikeCodexUserAgent(userAgent)) {
      return false
    }

    // responses 写路径：缺 session-id 不视为完整 Codex 请求
    // /models 只带 UA+originator，不要求 session-id
    if (CodexCliValidator.isResponsesPath(fullPath)) {
      const sessionId = CodexCliValidator.extractSessionId(req)
      if (!sessionId || sessionId.length <= 20) {
        return false
      }
    }

    return true
  }

  /**
   * 验证请求是否来自 Codex CLI（客户端限制硬门）
   * @param {Object} req - Express 请求对象
   * @returns {boolean} 验证结果
   */
  static validate(req) {
    try {
      const userAgent = req.headers['user-agent'] || ''
      const fullPath = CodexCliValidator.getFullRequestPath(req)

      const strictValidationPaths = ['/openai', '/azure']
      const needsStrictValidation = strictValidationPaths.some((prefix) =>
        fullPath.toLowerCase().startsWith(prefix)
      )

      if (!needsStrictValidation) {
        if (!CodexCliValidator.looksLikeCodexUserAgent(userAgent)) {
          logger.debug(`Codex CLI validation failed - UA mismatch: ${userAgent}`)
          return false
        }
        logger.debug(`Codex CLI detected for path: ${fullPath}, allowing access`)
        return true
      }

      // /openai、/azure：与 isCodexClientRequest 完全同源，禁止再分叉
      if (!CodexCliValidator.isCodexClientRequest(req)) {
        logger.debug(
          `Codex CLI validation failed - isCodexClientRequest=false path=${fullPath} UA=${userAgent}`
        )
        return false
      }

      logger.debug(`Codex CLI validation passed for UA: ${userAgent}, path: ${fullPath}`)
      return true
    } catch (error) {
      logger.error('Error in CodexCliValidator:', error)
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
}

module.exports = CodexCliValidator
