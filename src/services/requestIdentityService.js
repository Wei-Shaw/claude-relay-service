/**
 * Request Identity Service
 *
 * 处理 Claude 请求的身份信息规范化：
 * 1. Stainless 指纹管理 - 收集、持久化和应用 x-stainless-* 系列请求头
 * 2. User ID 规范化 - 重写 metadata.user_id，使其与真实账户保持一致
 */

const crypto = require('crypto')
const logger = require('../utils/logger')
const redisService = require('../models/redis')

const SESSION_PREFIX = 'session_'
const ACCOUNT_MARKER = '_account_'
const STAINLESS_HEADER_KEYS = [
  'x-stainless-retry-count',
  'x-stainless-timeout',
  'x-stainless-lang',
  'x-stainless-package-version',
  'x-stainless-os',
  'x-stainless-arch',
  'x-stainless-runtime',
  'x-stainless-runtime-version'
]

// 小写 key 到正确大小写格式的映射（用于返回给上游时）
const STAINLESS_HEADER_CASE_MAP = {
  'x-stainless-retry-count': 'X-Stainless-Retry-Count',
  'x-stainless-timeout': 'X-Stainless-Timeout',
  'x-stainless-lang': 'X-Stainless-Lang',
  'x-stainless-package-version': 'X-Stainless-Package-Version',
  'x-stainless-os': 'X-Stainless-OS',
  'x-stainless-arch': 'X-Stainless-Arch',
  'x-stainless-runtime': 'X-Stainless-Runtime',
  'x-stainless-runtime-version': 'X-Stainless-Runtime-Version'
}
const MIN_FINGERPRINT_FIELDS = 4
const REDIS_KEY_PREFIX = 'fmt_claude_req:stainless_headers:'

function formatUuidFromSeed(seed) {
  const digest = crypto.createHash('sha256').update(String(seed)).digest()
  const bytes = Buffer.from(digest.subarray(0, 16))

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function safeParseJson(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    return null
  }
}

function getRedisClient() {
  if (!redisService || typeof redisService.getClientSafe !== 'function') {
    throw new Error('requestIdentityService: Redis 服务未初始化')
  }

  return redisService.getClientSafe()
}

function hasFingerprintValues(fingerprint) {
  return fingerprint && typeof fingerprint === 'object' && Object.keys(fingerprint).length > 0
}

function sanitizeFingerprint(source) {
  if (!source || typeof source !== 'object') {
    return {}
  }

  const normalized = {}
  const lowerCaseSource = {}

  Object.keys(source).forEach((key) => {
    const value = source[key]
    if (value === undefined || value === null || String(value).trim() === '') {
      return
    }
    lowerCaseSource[key.toLowerCase()] = String(value)
  })

  STAINLESS_HEADER_KEYS.forEach((key) => {
    if (lowerCaseSource[key]) {
      normalized[key] = lowerCaseSource[key]
    }
  })

  return normalized
}

function collectFingerprintFromHeaders(headers) {
  if (!headers || typeof headers !== 'object') {
    return {}
  }

  const subset = {}

  Object.keys(headers).forEach((key) => {
    const lowerKey = key.toLowerCase()
    if (STAINLESS_HEADER_KEYS.includes(lowerKey)) {
      subset[lowerKey] = headers[key]
    }
  })

  return sanitizeFingerprint(subset)
}

function removeHeaderCaseInsensitive(target, key) {
  if (!target || typeof target !== 'object') {
    return
  }

  const lowerKey = key.toLowerCase()
  Object.keys(target).forEach((candidate) => {
    if (candidate.toLowerCase() === lowerKey) {
      delete target[candidate]
    }
  })
}

function applyFingerprintToHeaders(headers, fingerprint) {
  if (!headers || typeof headers !== 'object') {
    return headers
  }

  if (!hasFingerprintValues(fingerprint)) {
    return { ...headers }
  }

  const nextHeaders = { ...headers }

  STAINLESS_HEADER_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(fingerprint, key)) {
      return
    }
    removeHeaderCaseInsensitive(nextHeaders, key)
    // 使用正确的大小写格式返回给上游
    const properCaseKey = STAINLESS_HEADER_CASE_MAP[key] || key
    nextHeaders[properCaseKey] = fingerprint[key]
  })

  return nextHeaders
}

function persistFingerprint(accountId, fingerprint) {
  if (!accountId || !hasFingerprintValues(fingerprint)) {
    return
  }

  const client = getRedisClient()
  const key = `${REDIS_KEY_PREFIX}${accountId}`
  const serialized = JSON.stringify(fingerprint)

  const command = client.set(key, serialized, 'NX')

  if (command && typeof command.catch === 'function') {
    command.catch((error) => {
      logger.error(`requestIdentityService: Redis 持久化指纹失败 (${accountId}): ${error.message}`)
    })
  }
}

function getHeaderValueCaseInsensitive(headers, key) {
  if (!headers || typeof headers !== 'object') {
    return undefined
  }

  const lowerKey = key.toLowerCase()
  for (const candidate of Object.keys(headers)) {
    if (candidate.toLowerCase() === lowerKey) {
      return headers[candidate]
    }
  }

  return undefined
}

function headersChanged(original, updated) {
  if (original === updated) {
    return false
  }

  for (const key of STAINLESS_HEADER_KEYS) {
    if (
      getHeaderValueCaseInsensitive(original, key) !== getHeaderValueCaseInsensitive(updated, key)
    ) {
      return true
    }
  }

  return false
}

function resolveAccountId(payload) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const account = payload.account && typeof payload.account === 'object' ? payload.account : null
  const candidates = [
    payload.accountId,
    payload.account_id,
    payload.accountID,
    account && (account.accountId || account.account_id || account.accountID),
    account && (account.id || account.uuid),
    account && (account.account_uuid || account.accountUuid),
    account && (account.schedulerAccountId || account.scheduler_account_id)
  ]

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue
    }

    const stringified = String(candidate).trim()
    if (stringified) {
      return stringified
    }
  }

  return null
}

function rewriteHeaders(headers, accountId) {
  if (!headers || typeof headers !== 'object') {
    return { nextHeaders: headers, changed: false }
  }

  if (!accountId) {
    return { nextHeaders: { ...headers }, changed: false }
  }

  const workingHeaders = { ...headers }
  const fingerprint = collectFingerprintFromHeaders(workingHeaders)
  const fieldCount = Object.keys(fingerprint).length

  if (fieldCount < MIN_FINGERPRINT_FIELDS) {
    logger.warn(
      `requestIdentityService: 账号 ${accountId} 提供的 Stainless 指纹字段不足，已保持原样`
    )
    return { nextHeaders: workingHeaders, changed: false }
  }

  try {
    persistFingerprint(accountId, fingerprint)
  } catch (error) {
    logger.error(`requestIdentityService: 持久化指纹失败 (${accountId}): ${error.message}`)
    return {
      abortResponse: {
        statusCode: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'fingerprint_persist_failed', message: '指纹信息持久化失败' })
      }
    }
  }

  const appliedHeaders = applyFingerprintToHeaders(workingHeaders, fingerprint)
  const changed = headersChanged(workingHeaders, appliedHeaders)

  return { nextHeaders: appliedHeaders, changed }
}

function normalizeAccountUuid(candidate) {
  if (typeof candidate !== 'string') {
    return null
  }

  const trimmed = candidate.trim()
  return trimmed || null
}

function extractAccountUuid(account) {
  if (!account || typeof account !== 'object') {
    return null
  }

  const extInfoRaw = account.extInfo
  if (!extInfoRaw) {
    return null
  }

  const extInfoObject = typeof extInfoRaw === 'string' ? safeParseJson(extInfoRaw) : null

  if (!extInfoObject || typeof extInfoObject !== 'object') {
    return null
  }

  const extUuid = normalizeAccountUuid(extInfoObject.account_uuid)
  return extUuid || null
}

function rewriteUserId(body, accountId, accountUuid) {
  if (!body || typeof body !== 'object') {
    return { nextBody: body, changed: false }
  }

  const { metadata } = body
  if (!metadata || typeof metadata !== 'object') {
    return { nextBody: body, changed: false }
  }

  const userId = metadata.user_id
  if (typeof userId !== 'string') {
    return { nextBody: body, changed: false }
  }

  const pivot = userId.lastIndexOf(SESSION_PREFIX)
  if (pivot === -1) {
    return { nextBody: body, changed: false }
  }

  const prefixBeforeSession = userId.slice(0, pivot)
  const sessionTail = userId.slice(pivot + SESSION_PREFIX.length)

  const seedTail = sessionTail || 'default'
  const effectiveScheduler = accountId ? String(accountId) : 'unknown-scheduler'
  const hashed = formatUuidFromSeed(`${effectiveScheduler}::${seedTail}`)

  let normalizedPrefix = prefixBeforeSession

  if (accountUuid) {
    const trimmedUuid = normalizeAccountUuid(accountUuid)
    if (trimmedUuid) {
      const accountIndex = normalizedPrefix.indexOf(ACCOUNT_MARKER)

      if (accountIndex === -1) {
        const base = normalizedPrefix.replace(/_+$/, '')
        const baseWithMarker = /_account$/.test(base) ? base : `${base}_account`
        normalizedPrefix = `${baseWithMarker}_${trimmedUuid}_`
      } else {
        const valueStart = accountIndex + ACCOUNT_MARKER.length
        let separatorIndex = normalizedPrefix.indexOf('_', valueStart)
        if (separatorIndex === -1) {
          separatorIndex = normalizedPrefix.length
        }

        const head = normalizedPrefix.slice(0, valueStart)
        let tail = '_'

        if (separatorIndex < normalizedPrefix.length) {
          tail = normalizedPrefix.slice(separatorIndex)
          if (/^_+$/.test(tail)) {
            tail = '_'
          }
        }

        normalizedPrefix = `${head}${trimmedUuid}${tail}`
      }
    }
  }

  const nextUserId = `${normalizedPrefix}${SESSION_PREFIX}${hashed}`

  if (nextUserId === userId) {
    return { nextBody: body, changed: false }
  }

  const nextBody = {
    ...body,
    metadata: {
      ...metadata,
      user_id: nextUserId
    }
  }

  return { nextBody, changed: true }
}

/**
 * 转换请求身份信息
 * @param {Object} payload - 请求载荷
 * @param {Object} payload.body - 请求体
 * @param {Object} payload.headers - 请求头
 * @param {string} payload.accountId - 账户ID
 * @param {Object} payload.account - 账户对象
 * @returns {Object} 转换后的 { body, headers, abortResponse? }
 */
function transform(payload = {}) {
  const currentBody = payload.body
  const currentHeaders = payload.headers

  if (!payload.accountId) {
    return {
      body: currentBody,
      headers: currentHeaders
    }
  }

  const accountUuid = extractAccountUuid(payload.account)
  const accountIdForHeaders = resolveAccountId(payload)

  const { nextBody } = rewriteUserId(currentBody, payload.accountId, accountUuid)
  const headerResult = rewriteHeaders(currentHeaders, accountIdForHeaders)

  const nextHeaders = headerResult ? headerResult.nextHeaders : currentHeaders
  const abortResponse =
    headerResult && headerResult.abortResponse ? headerResult.abortResponse : null

  return {
    body: nextBody,
    headers: nextHeaders,
    abortResponse
  }
}

module.exports = {
  transform,
  // 导出内部函数供测试使用
  _internal: {
    formatUuidFromSeed,
    collectFingerprintFromHeaders,
    rewriteHeaders,
    rewriteUserId,
    extractAccountUuid,
    resolveAccountId
  }
}
