// 通用工具函数集合
// 抽取自各服务的重复代码，统一管理

const crypto = require('crypto')
const config = require('../../config/config')
const LRUCache = require('./lruCache')
const { getDateInTimezone, getDateStringInTimezone } = require('./timezone')
const { RATE_LIMITED_MODEL_FAMILIES } = require('./modelHelper')

// ============================================
// 加密相关 - 工厂模式支持不同 salt
// ============================================

const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16

// 缓存不同 salt 的加密实例
const _encryptorCache = new Map()

// 创建加密器实例（每个 salt 独立缓存）
const createEncryptor = (salt) => {
  if (_encryptorCache.has(salt)) {
    return _encryptorCache.get(salt)
  }

  let keyCache = null
  const decryptCache = new LRUCache(500)

  const getKey = () => {
    if (!keyCache) {
      keyCache = crypto.scryptSync(config.security.encryptionKey, salt, 32)
    }
    return keyCache
  }

  const encrypt = (text) => {
    if (!text) {
      return ''
    }
    const key = getKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return `${iv.toString('hex')}:${encrypted}`
  }

  const decrypt = (text, useCache = true) => {
    if (!text) {
      return ''
    }
    if (!text.includes(':')) {
      return text
    }
    const cacheKey = crypto.createHash('sha256').update(text).digest('hex')
    if (useCache) {
      const cached = decryptCache.get(cacheKey)
      if (cached !== undefined) {
        return cached
      }
    }
    try {
      const key = getKey()
      const [ivHex, encrypted] = text.split(':')
      const iv = Buffer.from(ivHex, 'hex')
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      if (useCache) {
        decryptCache.set(cacheKey, decrypted, 5 * 60 * 1000)
      }
      return decrypted
    } catch (e) {
      return text
    }
  }

  const instance = {
    encrypt,
    decrypt,
    getKey,
    clearCache: () => decryptCache.clear(),
    getStats: () => decryptCache.getStats?.() || { size: decryptCache.size }
  }

  _encryptorCache.set(salt, instance)
  return instance
}

// 默认加密器（向后兼容）
const defaultEncryptor = createEncryptor('claude-relay-salt')
const { encrypt } = defaultEncryptor
const { decrypt } = defaultEncryptor
const getEncryptionKey = defaultEncryptor.getKey
const clearDecryptCache = defaultEncryptor.clearCache
const getDecryptCacheStats = defaultEncryptor.getStats

// ============================================
// 布尔值处理
// ============================================

// 转换为布尔值（宽松模式）
const toBoolean = (value) =>
  value === true ||
  value === 'true' ||
  (typeof value === 'string' && value.toLowerCase() === 'true')

// 检查是否为真值（null/undefined 返回 false）
const isTruthy = (value) => value !== null && value !== undefined && toBoolean(value)

// 检查是否可调度（默认 true，只有明确 false 才返回 false）
const isSchedulable = (value) => value !== false && value !== 'false'

// 检查是否激活
const isActive = (value) => value === true || value === 'true'

// 检查账户是否健康（激活且状态正常）
const isAccountHealthy = (account) => {
  if (!account) {
    return false
  }
  if (!isTruthy(account.isActive)) {
    return false
  }
  const status = (account.status || 'active').toLowerCase()
  return !['error', 'unauthorized', 'blocked', 'temp_error'].includes(status)
}

// ============================================
// JSON 处理
// ============================================

// 安全解析 JSON
const safeParseJson = (value, fallback = null) => {
  if (!value || typeof value !== 'string') {
    return fallback
  }
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

// 安全解析 JSON 为对象
const safeParseJsonObject = (value, fallback = null) => {
  const parsed = safeParseJson(value, fallback)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback
}

// 安全解析 JSON 为数组
const safeParseJsonArray = (value, fallback = []) => {
  const parsed = safeParseJson(value, fallback)
  return Array.isArray(parsed) ? parsed : fallback
}

// ============================================
// 模型名称处理
// ============================================

// 规范化模型名称（用于统计聚合）
const normalizeModelName = (model) => {
  if (!model || model === 'unknown') {
    return model
  }
  // Bedrock 模型: us-east-1.anthropic.claude-3-5-sonnet-v1:0
  if (model.includes('.anthropic.') || model.includes('.claude')) {
    return model
      .replace(/^[a-z0-9-]+\./, '')
      .replace('anthropic.', '')
      .replace(/-v\d+:\d+$/, '')
  }
  return model.replace(/-v\d+:\d+$|:latest$/, '')
}

// 规范化端点类型
const normalizeEndpointType = (endpointType) => {
  if (!endpointType) {
    return 'anthropic'
  }
  const normalized = String(endpointType).toLowerCase()
  return ['openai', 'comm', 'anthropic'].includes(normalized) ? normalized : 'anthropic'
}

// 检查模型是否在映射表中
const isModelInMapping = (modelMapping, requestedModel) => {
  if (!modelMapping || Object.keys(modelMapping).length === 0) {
    return true
  }
  if (Object.prototype.hasOwnProperty.call(modelMapping, requestedModel)) {
    return true
  }
  const lower = requestedModel.toLowerCase()
  return Object.keys(modelMapping).some((k) => k.toLowerCase() === lower)
}

// 获取映射后的模型名称
const getMappedModelName = (modelMapping, requestedModel) => {
  if (!modelMapping || Object.keys(modelMapping).length === 0) {
    return requestedModel
  }
  if (modelMapping[requestedModel]) {
    return modelMapping[requestedModel]
  }
  const lower = requestedModel.toLowerCase()
  for (const [key, value] of Object.entries(modelMapping)) {
    if (key.toLowerCase() === lower) {
      return value
    }
  }
  return requestedModel
}

// ============================================
// 账户调度相关
// ============================================

// 账户是否关闭了上游错误自动防护（开关 ON = 调度判定忽略上游错误类自动暂停，暴力打上游）
// 兼容布尔与字符串存储；只读 disableAutoProtection 单一字段
const isAutoProtectionDisabled = (account) =>
  !!account && (account.disableAutoProtection === true || account.disableAutoProtection === 'true')

// 按优先级和最后使用时间排序账户
const sortAccountsByPriority = (accounts) =>
  [...accounts].sort((a, b) => {
    const priorityA = parseInt(a.priority, 10) || 50
    const priorityB = parseInt(b.priority, 10) || 50
    if (priorityA !== priorityB) {
      return priorityA - priorityB
    }
    const lastUsedA = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0
    const lastUsedB = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0
    if (lastUsedA !== lastUsedB) {
      return lastUsedA - lastUsedB
    }
    const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return createdA - createdB
  })

// 生成粘性会话 Key
const composeStickySessionKey = (prefix, sessionHash, apiKeyId = null) => {
  if (!sessionHash) {
    return null
  }
  return `sticky:${prefix}:${apiKeyId || 'default'}:${sessionHash}`
}

// 过滤可用账户（激活 + 健康 + 可调度）
const filterAvailableAccounts = (accounts) =>
  accounts.filter((acc) => acc && isAccountHealthy(acc) && isSchedulable(acc.schedulable))

// 账户"状态类"字段：仅由系统内部（调度/限流/自动保护）写入，外部更新请求禁止写入，防止伪造自动停用证据
// [人工决策-2026-06-02 23:30:05] review#3：账户更新入口字段白名单——剥离这些状态字段，只允许写配置类字段
const READONLY_ACCOUNT_STATE_FIELDS = new Set([
  'status',
  'errorMessage',
  'rateLimitStatus',
  'rateLimitedAt',
  'rateLimitEndAt',
  'rateLimitResetAt',
  'quotaStoppedAt',
  'overloadStatus',
  'overloadedAt',
  'blockedStatus',
  'blockedAt',
  'autoStoppedAt',
  'stoppedReason',
  'rateLimitAutoStopped',
  'fiveHourAutoStopped',
  'fiveHourStoppedAt',
  'quotaAutoStopped',
  'tempErrorAutoStopped',
  'blockedAutoStopped',
  'unauthorizedAt',
  // 各模型家族限流字段（opus/sonnet/haiku/fable 的 ${f}RateLimitedAt / ${f}RateLimitEndAt）
  // 由限流流程写入，外部更新入口禁止伪造/清除，防止排除账号或抹掉真实限流
  ...RATE_LIMITED_MODEL_FAMILIES.flatMap((family) => [
    `${family}RateLimitedAt`,
    `${family}RateLimitEndAt`
  ])
])

// 剥离外部更新请求里的状态类字段（不修改原对象），返回新对象
const stripReadonlyAccountFields = (updates) => {
  if (!updates || typeof updates !== 'object') {
    return updates
  }
  const cleaned = {}
  for (const [key, value] of Object.entries(updates)) {
    if (!READONLY_ACCOUNT_STATE_FIELDS.has(key)) {
      cleaned[key] = value
    }
  }
  return cleaned
}

// ============================================
// 字符串处理
// ============================================

// 截断字符串
const truncate = (str, maxLen = 100, suffix = '...') => {
  if (!str || str.length <= maxLen) {
    return str
  }
  return str.slice(0, maxLen - suffix.length) + suffix
}

// 掩码敏感信息（保留前后几位）
const maskSensitive = (str, keepStart = 4, keepEnd = 4, maskChar = '*') => {
  if (!str || str.length <= keepStart + keepEnd) {
    return str
  }
  const maskLen = Math.min(str.length - keepStart - keepEnd, 8)
  return str.slice(0, keepStart) + maskChar.repeat(maskLen) + str.slice(-keepEnd)
}

// ============================================
// 数值处理
// ============================================

// 安全解析整数
const safeParseInt = (value, fallback = 0) => {
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? fallback : parsed
}

// 安全解析浮点数
const safeParseFloat = (value, fallback = 0) => {
  const parsed = parseFloat(value)
  return isNaN(parsed) ? fallback : parsed
}

// 限制数值范围
const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

// 检查是否过期
const isExpired = (expiresAt) => {
  if (!expiresAt) {
    return false
  }
  return new Date(expiresAt).getTime() < Date.now()
}

// 计算剩余时间（秒）
const getTimeRemaining = (expiresAt) => {
  if (!expiresAt) {
    return Infinity
  }
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
}

// ============================================
// 版本处理
// ============================================

const fs = require('fs')
const path = require('path')

// 获取应用版本号
const getAppVersion = () => {
  if (process.env.APP_VERSION) {
    return process.env.APP_VERSION
  }
  if (process.env.VERSION) {
    return process.env.VERSION
  }
  try {
    const versionFile = path.join(__dirname, '..', '..', 'VERSION')
    if (fs.existsSync(versionFile)) {
      return fs.readFileSync(versionFile, 'utf8').trim()
    }
  } catch {
    // ignore
  }
  try {
    return require('../../package.json').version
  } catch {
    // ignore
  }
  return '1.0.0'
}

// 版本比较: a > b
const versionGt = (a, b) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) {
      return true
    }
    if ((pa[i] || 0) < (pb[i] || 0)) {
      return false
    }
  }
  return false
}

// 版本比较: a >= b
const versionGte = (a, b) => a === b || versionGt(a, b)

module.exports = {
  // 加密
  createEncryptor,
  encrypt,
  decrypt,
  getEncryptionKey,
  clearDecryptCache,
  getDecryptCacheStats,
  // 布尔值
  toBoolean,
  isTruthy,
  isSchedulable,
  isActive,
  isAccountHealthy,
  // JSON
  safeParseJson,
  safeParseJsonObject,
  safeParseJsonArray,
  // 模型
  normalizeModelName,
  normalizeEndpointType,
  isModelInMapping,
  getMappedModelName,
  // 调度
  isAutoProtectionDisabled,
  sortAccountsByPriority,
  composeStickySessionKey,
  filterAvailableAccounts,
  stripReadonlyAccountFields,
  READONLY_ACCOUNT_STATE_FIELDS,
  // 字符串
  truncate,
  maskSensitive,
  // 数值
  safeParseInt,
  safeParseFloat,
  clamp,
  // 时间
  getDateInTimezone,
  getDateStringInTimezone,
  isExpired,
  getTimeRemaining,
  // 版本
  getAppVersion,
  versionGt,
  versionGte
}
