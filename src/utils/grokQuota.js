const TIER_BY_NUMBER = {
  0: 'free',
  1: 'supergrok',
  2: 'x_basic',
  3: 'x_premium',
  4: 'x_premium_plus',
  5: 'supergrok_heavy',
  6: 'supergrok_lite',
  7: 'supergrok_plus'
}

const PLAN_LABELS = {
  free: 'Free',
  supergrok: 'SuperGrok',
  supergrok_lite: 'SuperGrok Lite',
  supergrok_plus: 'SuperGrok Plus',
  supergrok_pro: 'SuperGrok',
  supergrok_heavy: 'SuperGrok Heavy',
  x_basic: 'X Basic',
  x_premium: 'X Premium',
  x_premium_plus: 'X Premium+'
}

const HEAVY_REQUEST_LIMIT = 8300
const HEAVY_TOKEN_LIMIT = 53_000_000

const REQUEST_LIMIT_HEADERS = ['x-ratelimit-limit-requests', 'x-rate-limit-limit-requests']
const REQUEST_REMAINING_HEADERS = [
  'x-ratelimit-remaining-requests',
  'x-rate-limit-remaining-requests'
]
const REQUEST_RESET_HEADERS = ['x-ratelimit-reset-requests', 'x-rate-limit-reset-requests']
const TOKEN_LIMIT_HEADERS = ['x-ratelimit-limit-tokens', 'x-rate-limit-limit-tokens']
const TOKEN_REMAINING_HEADERS = ['x-ratelimit-remaining-tokens', 'x-rate-limit-remaining-tokens']
const TOKEN_RESET_HEADERS = ['x-ratelimit-reset-tokens', 'x-rate-limit-reset-tokens']
const TIER_HEADERS = [
  'xai-subscription-tier',
  'x-subscription-tier',
  'x-xai-subscription-tier',
  'x-xai-user-tier',
  'xai-user-tier',
  'xai-tier',
  'x-user-tier',
  'x-plan-tier',
  'x-subscription-plan'
]
const ENTITLEMENT_HEADERS = [
  'xai-entitlement-status',
  'x-entitlement-status',
  'x-xai-entitlement-status',
  'x-xai-user-entitlement-status',
  'x-user-entitlement-status'
]

function headerValue(headers, names) {
  if (!headers) {
    return ''
  }
  const get =
    typeof headers.get === 'function'
      ? (name) => headers.get(name)
      : (name) => {
          const direct = headers[name] ?? headers[name.toLowerCase()]
          if (Array.isArray(direct)) {
            return direct[0]
          }
          return direct
        }

  for (const name of names) {
    const value = get(name)
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim()
    }
  }

  if (typeof headers.get !== 'function') {
    const lowerMap = {}
    for (const [key, value] of Object.entries(headers)) {
      lowerMap[String(key).toLowerCase()] = Array.isArray(value) ? value[0] : value
    }
    for (const name of names) {
      const value = lowerMap[name.toLowerCase()]
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim()
      }
    }
  }
  return ''
}

function parseInt64(raw) {
  const text = String(raw || '').trim()
  if (!text) {
    return null
  }
  const value = Number(text)
  if (!Number.isFinite(value)) {
    return null
  }
  return Math.trunc(value)
}

function parseResetUnix(raw, now = new Date()) {
  const text = String(raw || '').trim()
  if (!text) {
    return null
  }
  const numeric = Number(text)
  if (Number.isFinite(numeric)) {
    let value = Math.trunc(numeric)
    if (value >= 1_000_000_000_000) {
      value = Math.floor(value / 1000)
    } else if (value < 1_000_000_000) {
      value = Math.floor(now.getTime() / 1000) + value
    }
    return value
  }
  const millis = Date.parse(text)
  if (!Number.isNaN(millis)) {
    return Math.floor(millis / 1000)
  }
  return null
}

function parseQuotaWindow(headers, limitNames, remainingNames, resetNames, now = new Date()) {
  const limit = parseInt64(headerValue(headers, limitNames))
  const remaining = parseInt64(headerValue(headers, remainingNames))
  const resetUnix = parseResetUnix(headerValue(headers, resetNames), now)
  if (limit === null && remaining === null && resetUnix === null) {
    return null
  }
  return {
    limit,
    remaining,
    resetUnix,
    resetsAt: resetUnix ? new Date(resetUnix * 1000).toISOString() : null
  }
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') {
    return null
  }
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = Buffer.from(padded, 'base64').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

function mapJwtTierNumber(value) {
  if (!Number.isFinite(value) || value < 0) {
    return ''
  }
  return TIER_BY_NUMBER[Math.trunc(value)] || String(Math.trunc(value))
}

function normalizeSubscriptionTier(raw) {
  if (raw === null || raw === undefined) {
    return ''
  }
  if (typeof raw === 'number') {
    return mapJwtTierNumber(raw)
  }
  let text = String(raw).trim().toLowerCase()
  if (!text) {
    return ''
  }
  if (/^\d+$/.test(text)) {
    return mapJwtTierNumber(Number(text))
  }
  text = text.replace(/-/g, '_').replace(/\s+/g, '_')
  const aliases = {
    grok_free: 'free',
    grokfree: 'free',
    free_tier: 'free',
    freetier: 'free',
    grok_basic: 'free',
    grokbasic: 'free',
    grokpro: 'supergrok',
    supergrokheavy: 'supergrok_heavy',
    supergroklite: 'supergrok_lite',
    supergrokplus: 'supergrok_plus',
    supergrokpro: 'supergrok_pro',
    xbasic: 'x_basic',
    xpremium: 'x_premium',
    xpremiumplus: 'x_premium_plus',
    'x_premium+': 'x_premium_plus'
  }
  return aliases[text] || text
}

function subscriptionTierFromClaims(payload = {}) {
  const raw = payload.tier ?? payload.subscription_tier ?? payload.plan ?? payload.user_tier
  if (raw === undefined || raw === null) {
    return ''
  }
  if (typeof raw === 'number') {
    return mapJwtTierNumber(raw)
  }
  return normalizeSubscriptionTier(raw)
}

function subscriptionTierFromJWT(token) {
  return subscriptionTierFromClaims(decodeJwtPayload(token) || {})
}

function planLabel(plan) {
  const normalized = normalizeSubscriptionTier(plan)
  if (!normalized) {
    return ''
  }
  return PLAN_LABELS[normalized] || normalized
}

function isGrok45ResponsesModel(model) {
  const name = String(model || '')
    .trim()
    .toLowerCase()
  return name === 'grok-4.5' || name.startsWith('grok-4.5-')
}

function quotaLooksLikeHeavy(snapshot) {
  const requests = snapshot?.requests?.limit
  const tokens = snapshot?.tokens?.limit
  return requests === HEAVY_REQUEST_LIMIT && tokens === HEAVY_TOKEN_LIMIT
}

function parseQuotaHeaders(headers, { statusCode = 0, model = '', now = new Date() } = {}) {
  if (!headers) {
    return null
  }
  const snapshot = {
    requests: parseQuotaWindow(
      headers,
      REQUEST_LIMIT_HEADERS,
      REQUEST_REMAINING_HEADERS,
      REQUEST_RESET_HEADERS,
      now
    ),
    tokens: parseQuotaWindow(
      headers,
      TOKEN_LIMIT_HEADERS,
      TOKEN_REMAINING_HEADERS,
      TOKEN_RESET_HEADERS,
      now
    ),
    subscriptionTier: normalizeSubscriptionTier(headerValue(headers, TIER_HEADERS)),
    entitlementStatus: headerValue(headers, ENTITLEMENT_HEADERS),
    statusCode,
    model: model || '',
    updatedAt: now.toISOString(),
    lastHeadersSeenAt: now.toISOString(),
    headersObserved: false,
    planFrom45Responses: '',
    planFrom45ResponsesAt: ''
  }

  if (
    !snapshot.requests &&
    !snapshot.tokens &&
    !snapshot.subscriptionTier &&
    !snapshot.entitlementStatus
  ) {
    return null
  }

  snapshot.headersObserved = true
  if (isGrok45ResponsesModel(model) && (snapshot.requests?.limit || snapshot.tokens?.limit)) {
    snapshot.planFrom45Responses = quotaLooksLikeHeavy(snapshot) ? 'supergrok_heavy' : 'supergrok'
    snapshot.planFrom45ResponsesAt = snapshot.updatedAt
  }
  return snapshot
}

function mergeQuotaSnapshots(previous, next) {
  if (!next) {
    return previous || null
  }
  if (!previous) {
    return next
  }
  const merged = { ...previous, ...next }
  if (!next.planFrom45Responses && previous.planFrom45Responses) {
    merged.planFrom45Responses = previous.planFrom45Responses
    merged.planFrom45ResponsesAt = previous.planFrom45ResponsesAt
  }
  if (!next.subscriptionTier && previous.subscriptionTier) {
    merged.subscriptionTier = previous.subscriptionTier
  }
  return merged
}

function canonicalPlan({ subscriptionTier = '', snapshot = null } = {}) {
  const fromHeader = normalizeSubscriptionTier(snapshot?.subscriptionTier)
  const fromJwt = normalizeSubscriptionTier(subscriptionTier)
  const from45 = normalizeSubscriptionTier(snapshot?.planFrom45Responses)
  for (const candidate of [fromHeader, fromJwt, from45]) {
    if (candidate === 'supergrok_heavy') {
      return 'supergrok_heavy'
    }
  }
  if (quotaLooksLikeHeavy(snapshot)) {
    return 'supergrok_heavy'
  }
  return fromHeader || fromJwt || from45 || ''
}

function formatWindow(window, now = new Date()) {
  if (!window || (window.limit === null && window.remaining === null)) {
    return null
  }
  const limit = Number(window.limit)
  const remaining = Number(window.remaining)
  const hasLimit = Number.isFinite(limit) && limit > 0
  const hasRemaining = Number.isFinite(remaining)
  const used = hasLimit && hasRemaining ? Math.max(0, limit - remaining) : null
  const utilization =
    hasLimit && used !== null ? Math.min(100, Math.round((used / limit) * 1000) / 10) : null
  const resetsAt = window.resetsAt || null
  const remainingSeconds = resetsAt
    ? Math.max(0, Math.floor((new Date(resetsAt).getTime() - now.getTime()) / 1000))
    : null
  return {
    limit: hasLimit ? limit : null,
    remaining: hasRemaining ? remaining : null,
    used,
    utilization,
    resetsAt,
    remainingSeconds
  }
}

function parseStoredSnapshot(raw) {
  if (!raw) {
    return null
  }
  if (typeof raw === 'object') {
    return raw
  }
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function buildGrokUsageSnapshot(account, now = new Date()) {
  if (!account) {
    return null
  }
  const snapshot = parseStoredSnapshot(account.grokQuotaSnapshot)
  const plan = canonicalPlan({
    subscriptionTier: account.subscriptionTier,
    snapshot
  })
  const tokens = formatWindow(snapshot?.tokens, now)
  const requests = formatWindow(snapshot?.requests, now)
  if (!plan && !tokens && !requests) {
    return null
  }
  return {
    plan,
    planLabel: planLabel(plan) || 'Grok',
    entitlementStatus: snapshot?.entitlementStatus || '',
    updatedAt: snapshot?.updatedAt || snapshot?.lastHeadersSeenAt || null,
    headersObserved: snapshot?.headersObserved === true,
    tokens,
    requests
  }
}

module.exports = {
  HEAVY_REQUEST_LIMIT,
  HEAVY_TOKEN_LIMIT,
  decodeJwtPayload,
  normalizeSubscriptionTier,
  subscriptionTierFromClaims,
  subscriptionTierFromJWT,
  planLabel,
  parseQuotaHeaders,
  mergeQuotaSnapshots,
  canonicalPlan,
  buildGrokUsageSnapshot,
  parseStoredSnapshot
}
