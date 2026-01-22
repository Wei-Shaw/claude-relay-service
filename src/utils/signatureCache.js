/**
 * Signature Cache - 三层签名缓存模块
 *
 * 用于缓存 Antigravity thinking block 的 thoughtSignature。
 * Claude Code 客户端可能剥离非标准字段，导致多轮对话时签名丢失。
 *
 * 三层缓存架构：
 * - Layer 1: toolId -> signature (工具调用签名缓存)
 * - Layer 2: signature -> modelFamily (模型家族映射，用于兼容性检查)
 * - Layer 3: sessionId -> latest signature (会话最新签名，防止跨会话污染)
 *
 * 原有功能保留：sessionId + thinkingText -> signature
 */

const crypto = require('crypto')
const logger = require('./logger')

// ============================================================================
// 配置常量
// ============================================================================

const SIGNATURE_CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 小时
const MIN_SIGNATURE_LENGTH = 50 // 最小有效签名长度
const TEXT_HASH_LENGTH = 16 // 文本哈希长度（SHA256 前 16 位）

// 各层缓存限制
const TOOL_CACHE_LIMIT = 500 // Layer 1: 工具签名缓存上限
const FAMILY_CACHE_LIMIT = 200 // Layer 2: 模型家族缓存上限
const SESSION_CACHE_LIMIT = 1000 // Layer 3: 会话签名缓存上限
const MAX_ENTRIES_PER_SESSION = 100 // 原有：每会话文本哈希缓存上限

// ============================================================================
// 缓存存储
// ============================================================================

// 原有：sessionId -> Map<textHash, { signature, timestamp }>
const signatureCache = new Map()

// Layer 1: toolId -> { signature, timestamp }
const toolSignatureCache = new Map()

// Layer 2: signature -> { modelFamily, timestamp }
const modelFamilyCache = new Map()

// Layer 3: sessionId -> { signature, timestamp }
const sessionLatestSignatureCache = new Map()

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 生成文本内容的稳定哈希值
 * @param {string} text - 待哈希的文本
 * @returns {string} 16 字符的十六进制哈希
 */
function hashText(text) {
  if (!text || typeof text !== 'string') {
    return ''
  }
  const hash = crypto.createHash('sha256').update(text).digest('hex')
  return hash.slice(0, TEXT_HASH_LENGTH)
}

/**
 * 检查缓存条目是否过期
 * @param {number} timestamp - 条目时间戳
 * @returns {boolean} 是否过期
 */
function isExpired(timestamp) {
  return Date.now() - timestamp > SIGNATURE_CACHE_TTL_MS
}

/**
 * 检查签名是否有效
 * @param {string} signature - 待检查的签名
 * @returns {boolean} 签名是否有效
 */
function isValidSignature(signature) {
  return typeof signature === 'string' && signature.length >= MIN_SIGNATURE_LENGTH
}

/**
 * 清理过期条目（通用）
 * @param {Map} cache - 缓存 Map
 * @param {number} limit - 缓存上限
 * @param {string} cacheName - 缓存名称（用于日志）
 */
function cleanupCache(cache, limit, cacheName) {
  if (cache.size <= limit) {
    return
  }

  const before = cache.size
  const toDelete = []

  for (const [key, entry] of cache.entries()) {
    if (isExpired(entry.timestamp)) {
      toDelete.push(key)
    }
  }

  for (const key of toDelete) {
    cache.delete(key)
  }

  // 如果删除过期条目后仍然超限，按时间戳淘汰最老的条目，确保缓存不会无限增长
  if (cache.size > limit) {
    const entries = Array.from(cache.entries())
    entries.sort((a, b) => (a[1]?.timestamp || 0) - (b[1]?.timestamp || 0))

    const overflow = cache.size - limit
    for (let i = 0; i < overflow && i < entries.length; i += 1) {
      cache.delete(entries[i][0])
    }
  }

  const after = cache.size
  if (before !== after) {
    logger.debug(`[SignatureCache] ${cacheName} cleanup: ${before} -> ${after} entries`)
  }
}

// ============================================================================
// Layer 1: 工具签名缓存 (toolId -> signature)
// ============================================================================

/**
 * 缓存工具调用签名
 * @param {string} toolId - 工具调用 ID (tool_use_id)
 * @param {string} signature - thoughtSignature
 */
function cacheToolSignature(toolId, signature) {
  if (!toolId || !signature) {
    return
  }
  if (!isValidSignature(signature)) {
    return
  }

  toolSignatureCache.set(toolId, {
    signature,
    timestamp: Date.now()
  })

  logger.debug(`[SignatureCache] Cached tool signature for id: ${toolId.slice(0, 12)}...`)

  // 清理过期条目
  cleanupCache(toolSignatureCache, TOOL_CACHE_LIMIT, 'Tool cache')
}

/**
 * 获取工具调用签名
 * @param {string} toolId - 工具调用 ID
 * @returns {string|null} 签名或 null
 */
function getToolSignature(toolId) {
  if (!toolId) {
    return null
  }

  const entry = toolSignatureCache.get(toolId)
  if (!entry) {
    return null
  }

  if (isExpired(entry.timestamp)) {
    toolSignatureCache.delete(toolId)
    return null
  }

  logger.debug(`[SignatureCache] Hit tool signature for id: ${toolId.slice(0, 12)}...`)
  return entry.signature
}

// ============================================================================
// Layer 2: 模型家族缓存 (signature -> modelFamily)
// ============================================================================

/**
 * 缓存签名的模型家族
 * @param {string} signature - thoughtSignature
 * @param {string} modelFamily - 模型家族标识 (如 "gemini-2.0", "claude-3-5")
 */
function cacheSignatureFamily(signature, modelFamily) {
  if (!signature || !modelFamily) {
    return
  }
  if (!isValidSignature(signature)) {
    return
  }

  modelFamilyCache.set(signature, {
    modelFamily,
    timestamp: Date.now()
  })

  logger.debug(
    `[SignatureCache] Cached model family for sig (len=${signature.length}): ${modelFamily}`
  )

  // 清理过期条目
  cleanupCache(modelFamilyCache, FAMILY_CACHE_LIMIT, 'Family cache')
}

/**
 * 获取签名的模型家族
 * @param {string} signature - thoughtSignature
 * @returns {string|null} 模型家族或 null
 */
function getSignatureFamily(signature) {
  if (!signature) {
    return null
  }

  const entry = modelFamilyCache.get(signature)
  if (!entry) {
    return null
  }

  if (isExpired(entry.timestamp)) {
    modelFamilyCache.delete(signature)
    logger.debug('[SignatureCache] Signature family entry expired')
    return null
  }

  return entry.modelFamily
}

// ============================================================================
// Layer 3: 会话最新签名缓存 (sessionId -> latest signature)
// ============================================================================

/**
 * 缓存会话的最新签名
 * 只有当新签名更长时才更新（更长的签名通常更完整）
 * @param {string} sessionId - 会话 ID
 * @param {string} signature - thoughtSignature
 */
function cacheSessionSignature(sessionId, signature) {
  if (!sessionId || !signature) {
    return
  }
  if (!isValidSignature(signature)) {
    return
  }

  const existing = sessionLatestSignatureCache.get(sessionId)
  const shouldStore =
    !existing || isExpired(existing.timestamp) || signature.length > existing.signature.length

  if (shouldStore) {
    sessionLatestSignatureCache.set(sessionId, {
      signature,
      timestamp: Date.now()
    })

    logger.debug(
      `[SignatureCache] Session ${sessionId.slice(0, 8)}... -> storing signature (len=${signature.length})`
    )

    // 清理过期条目
    cleanupCache(sessionLatestSignatureCache, SESSION_CACHE_LIMIT, 'Session cache')
  }
}

/**
 * 获取会话的最新签名
 * @param {string} sessionId - 会话 ID
 * @returns {string|null} 签名或 null
 */
function getSessionSignature(sessionId) {
  if (!sessionId) {
    return null
  }

  const entry = sessionLatestSignatureCache.get(sessionId)
  if (!entry) {
    return null
  }

  if (isExpired(entry.timestamp)) {
    sessionLatestSignatureCache.delete(sessionId)
    logger.debug(`[SignatureCache] Session ${sessionId.slice(0, 8)}... -> EXPIRED`)
    return null
  }

  logger.debug(
    `[SignatureCache] Session ${sessionId.slice(0, 8)}... -> HIT (len=${entry.signature.length})`
  )
  return entry.signature
}

// ============================================================================
// 原有功能：sessionId + thinkingText -> signature
// ============================================================================

/**
 * 获取或创建会话缓存
 * @param {string} sessionId - 会话 ID
 * @returns {Map} 会话的签名缓存 Map
 */
function getOrCreateSessionCache(sessionId) {
  if (!signatureCache.has(sessionId)) {
    signatureCache.set(sessionId, new Map())
  }
  return signatureCache.get(sessionId)
}

/**
 * 缓存 thinking 签名（基于文本哈希）
 * @param {string} sessionId - 会话 ID
 * @param {string} thinkingText - thinking 内容文本
 * @param {string} signature - thoughtSignature
 */
function cacheSignature(sessionId, thinkingText, signature) {
  if (!sessionId || !thinkingText || !signature) {
    return
  }

  if (!isValidSignature(signature)) {
    return
  }

  const sessionCache = getOrCreateSessionCache(sessionId)
  const textHash = hashText(thinkingText)

  if (!textHash) {
    return
  }

  // 淘汰策略：超过限制时删除最老的 1/4 条目
  if (sessionCache.size >= MAX_ENTRIES_PER_SESSION) {
    const entries = Array.from(sessionCache.entries())
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
    const toRemove = Math.max(1, Math.floor(entries.length / 4))
    for (let i = 0; i < toRemove; i++) {
      sessionCache.delete(entries[i][0])
    }
    logger.debug(
      `[SignatureCache] Evicted ${toRemove} old entries for session ${sessionId.slice(0, 8)}...`
    )
  }

  sessionCache.set(textHash, {
    signature,
    timestamp: Date.now()
  })

  logger.debug(
    `[SignatureCache] Cached signature for session ${sessionId.slice(0, 8)}..., hash ${textHash}`
  )

  // 同时更新会话最新签名
  cacheSessionSignature(sessionId, signature)
}

/**
 * 获取缓存的签名（基于文本哈希）
 * @param {string} sessionId - 会话 ID
 * @param {string} thinkingText - thinking 内容文本
 * @returns {string|null} 缓存的签名，未找到或过期则返回 null
 */
function getCachedSignature(sessionId, thinkingText) {
  if (!sessionId || !thinkingText) {
    return null
  }

  const sessionCache = signatureCache.get(sessionId)
  if (!sessionCache) {
    return null
  }

  const textHash = hashText(thinkingText)
  if (!textHash) {
    return null
  }

  const entry = sessionCache.get(textHash)
  if (!entry) {
    return null
  }

  // 检查是否过期
  if (isExpired(entry.timestamp)) {
    sessionCache.delete(textHash)
    logger.debug(`[SignatureCache] Entry expired for hash ${textHash}`)
    return null
  }

  logger.debug(
    `[SignatureCache] Cache hit for session ${sessionId.slice(0, 8)}..., hash ${textHash}`
  )
  return entry.signature
}

// ============================================================================
// 清理和统计
// ============================================================================

/**
 * 清除会话缓存
 * @param {string} sessionId - 要清除的会话 ID，为空则清除全部
 */
function clearSignatureCache(sessionId = null) {
  if (sessionId) {
    signatureCache.delete(sessionId)
    sessionLatestSignatureCache.delete(sessionId)
    logger.debug(`[SignatureCache] Cleared cache for session ${sessionId.slice(0, 8)}...`)
  } else {
    signatureCache.clear()
    toolSignatureCache.clear()
    modelFamilyCache.clear()
    sessionLatestSignatureCache.clear()
    logger.debug('[SignatureCache] Cleared all caches')
  }
}

/**
 * 获取缓存统计信息（调试用）
 * @returns {Object} 统计信息
 */
function getCacheStats() {
  let textHashEntries = 0
  for (const sessionCache of signatureCache.values()) {
    textHashEntries += sessionCache.size
  }
  return {
    sessionCount: signatureCache.size,
    textHashEntries,
    toolSignatureCount: toolSignatureCache.size,
    modelFamilyCount: modelFamilyCache.size,
    sessionLatestCount: sessionLatestSignatureCache.size
  }
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
  // 原有功能
  cacheSignature,
  getCachedSignature,
  clearSignatureCache,
  getCacheStats,
  isValidSignature,

  // Layer 1: 工具签名缓存
  cacheToolSignature,
  getToolSignature,

  // Layer 2: 模型家族缓存
  cacheSignatureFamily,
  getSignatureFamily,

  // Layer 3: 会话最新签名
  cacheSessionSignature,
  getSessionSignature,

  // 内部函数导出（用于测试或扩展）
  hashText,
  MIN_SIGNATURE_LENGTH,
  MAX_ENTRIES_PER_SESSION,
  SIGNATURE_CACHE_TTL_MS,
  TOOL_CACHE_LIMIT,
  FAMILY_CACHE_LIMIT,
  SESSION_CACHE_LIMIT
}
