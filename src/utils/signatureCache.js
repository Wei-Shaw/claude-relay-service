/**
 * Signature Cache - 签名缓存模块
 *
 * 用于缓存 Antigravity thinking block 的 thoughtSignature。
 * Claude Code 客户端可能剥离非标准字段，导致多轮对话时签名丢失。
 * 此模块按 sessionId + thinkingText 存储签名，便于后续请求恢复。
 *
 * 参考实现：
 * - CLIProxyAPI: internal/cache/signature_cache.go
 * - antigravity-claude-proxy: src/format/signature-cache.js
 */

const crypto = require('crypto')
const logger = require('./logger')

// 配置常量
const SIGNATURE_CACHE_TTL_MS = 60 * 60 * 1000 // 1 小时（同 CLIProxyAPI）
const MAX_ENTRIES_PER_SESSION = 100 // 每会话最大缓存条目
const MIN_SIGNATURE_LENGTH = 50 // 最小有效签名长度
const TEXT_HASH_LENGTH = 16 // 文本哈希长度（SHA256 前 16 位）

// 主缓存：sessionId -> Map<textHash, { signature, timestamp }>
const signatureCache = new Map()

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
 * 检查签名是否有效
 * @param {string} signature - 待检查的签名
 * @returns {boolean} 签名是否有效
 */
function isValidSignature(signature) {
  return typeof signature === 'string' && signature.length >= MIN_SIGNATURE_LENGTH
}

/**
 * 缓存 thinking 签名
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
}

/**
 * 获取缓存的签名
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
  if (Date.now() - entry.timestamp > SIGNATURE_CACHE_TTL_MS) {
    sessionCache.delete(textHash)
    logger.debug(`[SignatureCache] Entry expired for hash ${textHash}`)
    return null
  }

  logger.debug(
    `[SignatureCache] Cache hit for session ${sessionId.slice(0, 8)}..., hash ${textHash}`
  )
  return entry.signature
}

/**
 * 清除会话缓存
 * @param {string} sessionId - 要清除的会话 ID，为空则清除全部
 */
function clearSignatureCache(sessionId = null) {
  if (sessionId) {
    signatureCache.delete(sessionId)
    logger.debug(`[SignatureCache] Cleared cache for session ${sessionId.slice(0, 8)}...`)
  } else {
    signatureCache.clear()
    logger.debug('[SignatureCache] Cleared all caches')
  }
}

/**
 * 获取缓存统计信息（调试用）
 * @returns {Object} { sessionCount, totalEntries }
 */
function getCacheStats() {
  let totalEntries = 0
  for (const sessionCache of signatureCache.values()) {
    totalEntries += sessionCache.size
  }
  return {
    sessionCount: signatureCache.size,
    totalEntries
  }
}

module.exports = {
  cacheSignature,
  getCachedSignature,
  clearSignatureCache,
  getCacheStats,
  isValidSignature,
  // 内部函数导出（用于测试或扩展）
  hashText,
  MIN_SIGNATURE_LENGTH,
  MAX_ENTRIES_PER_SESSION,
  SIGNATURE_CACHE_TTL_MS
}
