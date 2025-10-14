const logger = require('../utils/logger')

/**
 * 浏览器/Chrome插件兜底中间件
 * 专门处理第三方插件的兼容性问题
 */
const browserFallbackMiddleware = (req, res, next) => {
  const userAgent = req.headers['user-agent'] || ''
  const origin = req.headers['origin'] || ''

  const extractHeader = (value) => {
    let candidate = value

    if (Array.isArray(candidate)) {
      candidate = candidate.find((item) => typeof item === 'string' && item.trim())
    }

    if (typeof candidate !== 'string') {
      return ''
    }

    let trimmed = candidate.trim()
    if (!trimmed) {
      return ''
    }

    if (/^Bearer\s+/i.test(trimmed)) {
      trimmed = trimmed.replace(/^Bearer\s+/i, '').trim()
    }

    return trimmed
  }

  const apiKeyHeader =
    extractHeader(req.headers['x-api-key']) || extractHeader(req.headers['x-goog-api-key'])
  const normalizedKey = extractHeader(req.headers['authorization']) || apiKeyHeader

  // 检查是否为Chrome插件或浏览器请求
  const isChromeExtension = origin.startsWith('chrome-extension://')
  const isBrowserRequest = userAgent.includes('Mozilla/') && userAgent.includes('Chrome/')
  const hasApiKey = normalizedKey.startsWith('cr_') // 我们的API Key格式

  if ((isChromeExtension || isBrowserRequest) && hasApiKey) {
    // 为Chrome插件请求添加特殊标记
    req.isBrowserFallback = true
    req.originalUserAgent = userAgent

    // 🆕 关键修改：伪装成claude-cli请求以绕过客户端限制
    req.headers['user-agent'] = 'claude-cli/1.0.110 (external, cli, browser-fallback)'

    // 确保设置正确的认证头
    if (!req.headers['authorization'] && apiKeyHeader) {
      req.headers['authorization'] = `Bearer ${apiKeyHeader}`
    }

    // 添加必要的Anthropic头
    if (!req.headers['anthropic-version']) {
      req.headers['anthropic-version'] = '2023-06-01'
    }

    if (!req.headers['anthropic-dangerous-direct-browser-access']) {
      req.headers['anthropic-dangerous-direct-browser-access'] = 'true'
    }

    logger.api(
      `🔧 Browser fallback activated for ${isChromeExtension ? 'Chrome extension' : 'browser'} request`
    )
    logger.api(`   Original User-Agent: "${req.originalUserAgent}"`)
    logger.api(`   Origin: "${origin}"`)
    logger.api(`   Modified User-Agent: "${req.headers['user-agent']}"`)
  }

  next()
}

module.exports = {
  browserFallbackMiddleware
}
