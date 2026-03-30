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
  }
]

const AWS_SECRET_KEY_VALUE_PATTERN = /^[A-Za-z0-9/+=]{40}$/
const AWS_SECRET_KEY_CONTEXT_PATTERN =
  /(?:^|[^A-Za-z0-9])(?:aws[_-]?)?secret(?:[_-]?access)?[_-]?key(?:[^A-Za-z0-9]|$)/i
const AWS_SECRET_KEY_INLINE_PATTERN =
  /(?:^|[^A-Za-z0-9])(?:aws[_-]?)?secret(?:[_-]?access)?[_-]?key\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/i

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

function isResponsesStylePath(req) {
  const path = normalizePath(req.originalUrl || req.url || req.path).toLowerCase()
  return (
    path.startsWith('/openai/responses') ||
    path.startsWith('/openai/v1/responses') ||
    path.startsWith('/azure/response')
  )
}

function appendTextContent(content, collector, allowedTypes = null) {
  if (typeof content === 'string') {
    collector.push(content)
    return
  }

  if (!Array.isArray(content)) {
    return
  }

  for (const item of content) {
    if (typeof item === 'string') {
      collector.push(item)
      continue
    }

    if (!item || typeof item !== 'object') {
      continue
    }

    if (
      typeof item.text === 'string' &&
      (!allowedTypes || allowedTypes.has(item.type) || item.type === undefined)
    ) {
      collector.push(item.text)
    }
  }
}

function getInspectablePayloads(req) {
  if (!isResponsesStylePath(req) || !req.body || typeof req.body !== 'object') {
    return [req.body]
  }

  const payloads = []
  const ignoredTopLevelKeys = new Set([
    'model',
    'instructions',
    'tools',
    'include',
    'reasoning',
    'text',
    'input',
    'messages',
    'stream',
    'store',
    'service_tier',
    'prompt_cache_key',
    'conversation_id',
    'session_id',
    'max_output_tokens',
    'temperature',
    'top_p',
    'user'
  ])

  if (typeof req.body.prompt === 'string') {
    payloads.push(req.body.prompt)
  }

  if (Array.isArray(req.body.messages)) {
    for (const message of req.body.messages) {
      if (!message || message.role !== 'user') {
        continue
      }
      appendTextContent(message.content, payloads)
    }
  }

  if (typeof req.body.input === 'string') {
    payloads.push(req.body.input)
  } else if (Array.isArray(req.body.input)) {
    for (const item of req.body.input) {
      if (!item || typeof item !== 'object') {
        continue
      }

      if (item.type === 'message') {
        if (item.role !== 'user' && item.role !== 'developer') {
          continue
        }
        appendTextContent(item.content, payloads, new Set(['input_text', 'text']))
        continue
      }

      if (item.type === 'input_text' && typeof item.text === 'string') {
        payloads.push(item.text)
      }
    }
  }

  for (const [key, value] of Object.entries(req.body)) {
    if (ignoredTopLevelKeys.has(key)) {
      continue
    }
    payloads.push({ [key]: value })
  }

  return payloads
}

function containsAwsSecretKey(value, keyContext = '') {
  if (typeof value !== 'string') {
    return false
  }

  const trimmed = value.trim()
  if (AWS_SECRET_KEY_INLINE_PATTERN.test(trimmed)) {
    return true
  }

  return AWS_SECRET_KEY_CONTEXT_PATTERN.test(keyContext) && AWS_SECRET_KEY_VALUE_PATTERN.test(trimmed)
}

function collectSensitiveTypes(value, collector, depth = 0, keyContext = '') {
  if (value === undefined || value === null || depth > 8) {
    return
  }

  if (typeof value === 'string') {
    for (const { type, pattern } of SENSITIVE_PATTERNS) {
      if (pattern.test(value)) {
        collector.add(type)
      }
    }
    if (containsAwsSecretKey(value, keyContext)) {
      collector.add('aws_secret_key')
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSensitiveTypes(item, collector, depth + 1, `${keyContext}[${index}]`))
    return
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      const nextContext = keyContext ? `${keyContext}.${key}` : key
      collectSensitiveTypes(item, collector, depth + 1, nextContext)
    })
  }
}

function sensitiveContentGuard(req, res, next) {
  if (!shouldInspectRequest(req) || req.body === undefined || req.body === null) {
    return next()
  }

  const detectedTypes = new Set()
  for (const payload of getInspectablePayloads(req)) {
    collectSensitiveTypes(payload, detectedTypes)
  }

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
