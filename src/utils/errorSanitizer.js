/**
 * 错误消息清理工具
 * 用于移除上游错误中的供应商特定信息（如 URL、引用等）
 */

/**
 * 清理错误消息中的 URL 和供应商引用
 * @param {string} message - 原始错误消息
 * @returns {string} - 清理后的消息
 */
function sanitizeErrorMessage(message) {
  if (typeof message !== 'string') {
    return message
  }

  // 移除 URL（http:// 或 https://）
  let cleaned = message.replace(/https?:\/\/[^\s]+/gi, '')

  // 移除常见的供应商引用模式
  cleaned = cleaned.replace(/For more (?:details|information|help)[,\s]*/gi, '')
  cleaned = cleaned.replace(/(?:please\s+)?visit\s+\S*/gi, '') // 移除 "visit xxx"
  cleaned = cleaned.replace(/(?:see|check)\s+(?:our|the)\s+\S*/gi, '') // 移除 "see our xxx"
  cleaned = cleaned.replace(/(?:contact|reach)\s+(?:us|support)\s+at\s+\S*/gi, '') // 移除联系信息

  // 移除供应商特定关键词（包括整个单词）
  cleaned = cleaned.replace(/88code\S*/gi, '')
  cleaned = cleaned.replace(/duck\S*/gi, '')
  cleaned = cleaned.replace(/packy\S*/gi, '')
  cleaned = cleaned.replace(/ikun\S*/gi, '')
  cleaned = cleaned.replace(/privnode\S*/gi, '')
  cleaned = cleaned.replace(/yescode\S*/gi, '')
  cleaned = cleaned.replace(/yes.vg\S*/gi, '')
  cleaned = cleaned.replace(/share\S*/gi, '')
  cleaned = cleaned.replace(/yhlxj\S*/gi, '')
  cleaned = cleaned.replace(/gac\S*/gi, '')
  cleaned = cleaned.replace(/driod\S*/gi, '')

  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  // 如果消息被清理得太短或为空，返回通用消息
  if (cleaned.length < 5) {
    return 'The requested model is currently unavailable'
  }

  return cleaned
}

/**
 * 递归清理对象中的所有错误消息字段
 * @param {Object} errorData - 原始错误数据对象
 * @returns {Object} - 清理后的错误数据
 */
function sanitizeUpstreamError(errorData) {
  if (!errorData || typeof errorData !== 'object') {
    return errorData
  }

  // AxiosError / Error：返回摘要，避免泄露请求体/headers/token 等敏感信息
  const looksLikeAxiosError =
    errorData.isAxiosError ||
    (errorData.name === 'AxiosError' && (errorData.config || errorData.response))
  const looksLikeError = errorData instanceof Error || typeof errorData.message === 'string'

  if (looksLikeAxiosError || looksLikeError) {
    const statusCode = errorData.response?.status
    const upstreamBody = errorData.response?.data
    const upstreamMessage = sanitizeErrorMessage(extractErrorMessage(upstreamBody) || '')

    return {
      name: errorData.name || 'Error',
      code: errorData.code,
      statusCode,
      message: sanitizeErrorMessage(errorData.message || ''),
      upstreamMessage: upstreamMessage || undefined,
      upstreamType: upstreamBody?.error?.type || upstreamBody?.error?.status || undefined
    }
  }

  // 递归清理嵌套的错误对象
  const visited = new WeakSet()

  const shouldRedactKey = (key) => {
    if (!key) {
      return false
    }
    const lowerKey = String(key).toLowerCase()
    return (
      lowerKey === 'authorization' ||
      lowerKey === 'cookie' ||
      lowerKey.includes('api_key') ||
      lowerKey.includes('apikey') ||
      lowerKey.includes('access_token') ||
      lowerKey.includes('refresh_token') ||
      lowerKey.endsWith('token') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('password')
    )
  }

  const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') {
      return obj
    }

    if (visited.has(obj)) {
      return '[Circular]'
    }
    visited.add(obj)

    // 主动剔除常见“超大且敏感”的字段
    if (obj.config || obj.request || obj.response) {
      return '[Redacted]'
    }

    for (const key in obj) {
      if (shouldRedactKey(key)) {
        obj[key] = '[REDACTED]'
        continue
      }

      // 清理所有字符串字段，不仅仅是 message
      if (typeof obj[key] === 'string') {
        obj[key] = sanitizeErrorMessage(obj[key])
      } else if (typeof obj[key] === 'object') {
        sanitizeObject(obj[key])
      }
    }

    return obj
  }

  // 尽量不修改原对象：浅拷贝后递归清理
  const clone = Array.isArray(errorData) ? [...errorData] : { ...errorData }
  return sanitizeObject(clone)
}

/**
 * 提取错误消息（支持多种错误格式）
 * @param {*} body - 错误响应体（字符串或对象）
 * @returns {string} - 提取的错误消息
 */
function extractErrorMessage(body) {
  if (!body) {
    return ''
  }

  // 处理字符串类型
  if (typeof body === 'string') {
    const trimmed = body.trim()
    if (!trimmed) {
      return ''
    }
    try {
      const parsed = JSON.parse(trimmed)
      return extractErrorMessage(parsed)
    } catch (error) {
      return trimmed
    }
  }

  // 处理对象类型
  if (typeof body === 'object') {
    // 常见错误格式: { error: "message" }
    if (typeof body.error === 'string') {
      return body.error
    }
    // 嵌套错误格式: { error: { message: "..." } }
    if (body.error && typeof body.error === 'object') {
      if (typeof body.error.message === 'string') {
        return body.error.message
      }
      if (typeof body.error.error === 'string') {
        return body.error.error
      }
    }
    // 直接消息格式: { message: "..." }
    if (typeof body.message === 'string') {
      return body.message
    }
  }

  return ''
}

/**
 * 检测是否为账户被禁用或不可用的 400 错误
 * @param {number} statusCode - HTTP 状态码
 * @param {*} body - 响应体
 * @returns {boolean} - 是否为账户禁用错误
 */
function isAccountDisabledError(statusCode, body) {
  if (statusCode !== 400) {
    return false
  }

  const message = extractErrorMessage(body)
  if (!message) {
    return false
  }
  // 将消息全部转换为小写，进行模糊匹配（避免大小写问题）
  const lowerMessage = message.toLowerCase()
  // 检测常见的账户禁用/不可用模式
  return (
    lowerMessage.includes('organization has been disabled') ||
    lowerMessage.includes('account has been disabled') ||
    lowerMessage.includes('account is disabled') ||
    lowerMessage.includes('no account supporting') ||
    lowerMessage.includes('account not found') ||
    lowerMessage.includes('invalid account') ||
    lowerMessage.includes('too many active sessions')
  )
}

module.exports = {
  sanitizeErrorMessage,
  sanitizeUpstreamError,
  extractErrorMessage,
  isAccountDisabledError
}
