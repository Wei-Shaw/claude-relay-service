const upstreamErrorHelper = require('./upstreamErrorHelper')

const DEFAULT_QUOTA_EXCEEDED_COOLDOWN_SECONDS = (() => {
  const parsed = Number.parseInt(process.env.QUOTA_EXCEEDED_COOLDOWN_SECONDS, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2 * 60 * 60
})()

const QUOTA_STATUS_CODES = new Set([402, 403, 429])
const EXACT_MATCHERS = new Set([
  'insufficient_quota',
  'quota_exceeded',
  'billing_hard_limit',
  'billing_hard_limit_reached'
])
const KEYWORD_MATCHERS = [
  'quota exceeded',
  'exceeded your current quota',
  'billing hard limit',
  'billing_hard_limit',
  'insufficient quota',
  'insufficient_quota',
  'quota_exceeded',
  'credit balance is too low',
  'usage limit reached',
  '无可用套餐',
  '不允许使用余额',
  '余额不足'
]

function tryParseJson(value) {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return value
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function collectNormalizedTokens(value, collector, depth = 0) {
  if (value === undefined || value === null || depth > 6) {
    return
  }

  const normalizedValue = tryParseJson(value)
  if (typeof normalizedValue === 'string') {
    const trimmed = normalizedValue.trim().toLowerCase()
    if (trimmed) {
      collector.add(trimmed)
    }
    return
  }

  if (Array.isArray(normalizedValue)) {
    normalizedValue.forEach((item) => collectNormalizedTokens(item, collector, depth + 1))
    return
  }

  if (typeof normalizedValue === 'object') {
    Object.entries(normalizedValue).forEach(([key, item]) => {
      const lowerKey = String(key || '')
        .trim()
        .toLowerCase()
      if (lowerKey) {
        collector.add(lowerKey)
      }
      collectNormalizedTokens(item, collector, depth + 1)
    })
  }
}

function isQuotaExceededError(statusCode, payload) {
  const collector = new Set()
  collectNormalizedTokens(payload, collector)

  for (const token of collector) {
    if (EXACT_MATCHERS.has(token)) {
      return true
    }
  }

  const joined = Array.from(collector).join(' ')
  const hasKeyword = KEYWORD_MATCHERS.some((keyword) => joined.includes(keyword))
  if (!hasKeyword) {
    return false
  }

  const normalizedStatus = Number(statusCode)
  return statusCode === undefined || statusCode === null || QUOTA_STATUS_CODES.has(normalizedStatus)
}

async function applyQuotaExceededCooldown({
  accountId,
  accountType,
  statusCode,
  payload,
  sessionHash = null,
  clearSessionMapping = null
}) {
  if (!accountId || !accountType || !isQuotaExceededError(statusCode, payload)) {
    return { applied: false, cooldownSeconds: null }
  }

  await upstreamErrorHelper.markTempUnavailable(
    accountId,
    accountType,
    Number(statusCode) || 429,
    DEFAULT_QUOTA_EXCEEDED_COOLDOWN_SECONDS,
    {
      reason: 'quota_exceeded',
      errorTypeOverride: 'quota_exceeded',
      errorBody: payload
    }
  )

  if (sessionHash && typeof clearSessionMapping === 'function') {
    await clearSessionMapping(sessionHash)
  }

  return {
    applied: true,
    cooldownSeconds: DEFAULT_QUOTA_EXCEEDED_COOLDOWN_SECONDS
  }
}

module.exports = {
  DEFAULT_QUOTA_EXCEEDED_COOLDOWN_SECONDS,
  isQuotaExceededError,
  applyQuotaExceededCooldown
}
