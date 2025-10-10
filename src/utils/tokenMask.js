/**
 * Token 脱敏工具
 * 用于在日志中安全显示 token，只显示70%的内容，其余用*代替
 */

/**
 * 对 token 进行脱敏处理
 * @param {string} token - 需要脱敏的 token
 * @param {number} visiblePercent - 可见部分的百分比，默认 70
 * @returns {string} 脱敏后的 token
 */
function maskToken(token, visiblePercent = 70) {
  if (!token || typeof token !== 'string') {
    return '[EMPTY]'
  }

  const { length } = token

  // 对于非常短的 token，至少隐藏一部分
  if (length <= 2) {
    return '*'.repeat(length)
  }

  if (length <= 5) {
    return token.slice(0, 1) + '*'.repeat(length - 1)
  }

  if (length <= 10) {
    const visibleLength = Math.min(5, length - 2)
    const front = token.slice(0, visibleLength)
    return front + '*'.repeat(length - visibleLength)
  }

  // 计算可见字符数量
  const visibleLength = Math.floor(length * (visiblePercent / 100))

  // 在前部和尾部分配可见字符
  const frontLength = Math.ceil(visibleLength * 0.6)
  const backLength = visibleLength - frontLength

  // 构建脱敏后的 token
  const front = token.slice(0, frontLength)
  const back = token.slice(-backLength)
  const middle = '*'.repeat(length - visibleLength)

  return `${front}${middle}${back}`
}

/**
 * 对包含 token 的对象进行脱敏处理
 * @param {Object} obj - 包含 token 的对象
 * @param {Array<string>} tokenFields - 需要脱敏的字段名列表
 * @returns {Object} 脱敏后的对象副本
 */
function maskTokensInObject(
  obj,
  tokenFields = ['accessToken', 'refreshToken', 'access_token', 'refresh_token']
) {
  if (!obj || typeof obj !== 'object') {
    return obj
  }

  const masked = { ...obj }

  tokenFields.forEach((field) => {
    if (masked[field]) {
      masked[field] = maskToken(masked[field])
    }
  })

  return masked
}

/**
 * 格式化 token 刷新日志
 * @param {string} accountId - 账户 ID
 * @param {string} accountName - 账户名称
 * @param {Object} tokens - 包含 access_token 和 refresh_token 的对象
 * @param {string} status - 刷新状态 (success/failed)
 * @param {string} message - 额外的消息
 * @returns {Object} 格式化的日志对象
 */
function formatTokenRefreshLog(accountId, accountName, tokens, status, message = '') {
  const log = {
    timestamp: new Date().toISOString(),
    event: 'token_refresh',
    accountId,
    accountName,
    status,
    message
  }

  if (tokens) {
    log.tokens = {
      accessToken: tokens.accessToken ? maskToken(tokens.accessToken) : '[NOT_PROVIDED]',
      refreshToken: tokens.refreshToken ? maskToken(tokens.refreshToken) : '[NOT_PROVIDED]',
      expiresAt: tokens.expiresAt || '[NOT_PROVIDED]'
    }
  }

  return log
}

module.exports = {
  maskToken,
  maskTokensInObject,
  formatTokenRefreshLog
}
