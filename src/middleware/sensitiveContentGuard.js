const logger = require('../utils/logger')

const SENSITIVE_PATTERNS = [
  {
    type: 'ssh_private_key',
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i
  },
  {
    type: 'openai_api_key',
    pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/
  },
  {
    type: 'anthropic_api_key',
    pattern: /\bsk-ant-[A-Za-z0-9_-]{10,}\b/
  },
  {
    type: 'aws_access_key',
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/
  },
  {
    type: 'aws_secret_key',
    pattern: /\b[A-Za-z0-9/+=]{40}\b/
  }
]

const PROTECTED_PATH_PREFIXES = [
  '/api',
  '/claude',
  '/antigravity/api',
  '/gemini-cli/api',
  '/gemini',
  '/openai',
  '/droid',
  '/azure'
]
const EXCLUDED_PATH_PREFIXES = ['/admin', '/web', '/users', '/apistats']

function normalizePath(value) {
  if (!value) {
    return '/'
  }

  const [path] = String(value).split('?')
  const normalized = path.replace(/\/{2,}/g, '/')
  if (normalized.length > 1 && normalized.endsWith('/')) {
    return normalized.slice(0, -1)
  }
  return normalized || '/'
}

function shouldInspectRequest(req) {
  const path = normalizePath(req.originalUrl || req.url || req.path)
  const lowerPath = path.toLowerCase()

  if (EXCLUDED_PATH_PREFIXES.some((prefix) => lowerPath.startsWith(prefix))) {
    return false
  }

  return PROTECTED_PATH_PREFIXES.some((prefix) => lowerPath.startsWith(prefix))
}

function collectSensitiveTypes(value, collector, depth = 0) {
  if (value === undefined || value === null || depth > 8) {
    return
  }

  if (typeof value === 'string') {
    const hasModelProviderKey =
      SENSITIVE_PATTERNS.find((entry) => entry.type === 'openai_api_key').pattern.test(value) ||
      SENSITIVE_PATTERNS.find((entry) => entry.type === 'anthropic_api_key').pattern.test(value)

    for (const { type, pattern } of SENSITIVE_PATTERNS) {
      if (type === 'aws_secret_key' && hasModelProviderKey) {
        continue
      }
      if (pattern.test(value)) {
        collector.add(type)
      }
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectSensitiveTypes(item, collector, depth + 1))
    return
  }

  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectSensitiveTypes(item, collector, depth + 1))
  }
}

function sensitiveContentGuard(req, res, next) {
  if (!shouldInspectRequest(req) || req.body === undefined || req.body === null) {
    return next()
  }

  const detectedTypes = new Set()
  collectSensitiveTypes(req.body, detectedTypes)

  if (detectedTypes.size === 0) {
    return next()
  }

  const detectedTypeList = Array.from(detectedTypes).sort()
  logger.security(
    `🚫 Sensitive content blocked for ${req.originalUrl || req.url || '/'} apiKey=${
      req.apiKey?.id || 'unknown'
    } detectedTypes=${detectedTypeList.join(',')}`
  )

  return res.status(400).json({
    error: {
      message: 'Request contains sensitive credentials and was rejected',
      type: 'sensitive_content_detected',
      code: 'sensitive_content_detected',
      detectedTypes: detectedTypeList
    }
  })
}

module.exports = sensitiveContentGuard
