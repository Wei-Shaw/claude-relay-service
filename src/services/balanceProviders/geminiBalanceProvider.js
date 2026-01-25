const BaseBalanceProvider = require('./baseBalanceProvider')
const antigravityClient = require('../antigravityClient')
const geminiAccountService = require('../geminiAccountService')

const OAUTH_PROVIDER_ANTIGRAVITY = 'antigravity'

function clamp01(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  if (value < 0) {
    return 0
  }
  if (value > 1) {
    return 1
  }
  return value
}

function round2(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  return Math.round(value * 100) / 100
}

function normalizeAntigravityQuotaModelId(modelId) {
  const raw = String(modelId || '').trim()
  if (!raw) {
    return ''
  }
  return raw.replace(/^models\//i, '')
}

function normalizeQuotaCategory(displayName, modelId) {
  const name = String(displayName || '')
  const id = normalizeAntigravityQuotaModelId(modelId)
  const lowerName = name.toLowerCase()
  const lowerId = id.toLowerCase()

  if (name.includes('Gemini') && name.includes('Pro')) {
    return 'Gemini Pro'
  }
  if (name.includes('Gemini') && name.includes('Flash')) {
    return 'Gemini Flash'
  }
  if (name.includes('Gemini') && lowerName.includes('image')) {
    return 'Gemini Image'
  }
  if (lowerName.includes('imagen')) {
    return 'Gemini Image'
  }

  if (name.includes('Claude') || name.includes('GPT-OSS')) {
    return 'Claude'
  }

  if (id.startsWith('gemini-3-pro-') || id.startsWith('gemini-2.5-pro')) {
    return 'Gemini Pro'
  }
  if (id.startsWith('gemini-3-flash') || id.startsWith('gemini-2.5-flash')) {
    return 'Gemini Flash'
  }
  if (lowerId.startsWith('imagen-') || lowerId.includes('image')) {
    return 'Gemini Image'
  }
  if (lowerId.includes('claude') || lowerId.includes('gpt-oss')) {
    return 'Claude'
  }

  return name || id || 'Unknown'
}

function buildAntigravityQuota(modelsResponse) {
  const models = modelsResponse && typeof modelsResponse === 'object' ? modelsResponse.models : null

  if (!models || typeof models !== 'object') {
    return null
  }

  const parseRemainingFraction = (quotaInfo) => {
    if (!quotaInfo || typeof quotaInfo !== 'object') {
      return null
    }

    const raw =
      quotaInfo.remainingFraction ??
      quotaInfo.remaining_fraction ??
      quotaInfo.remaining ??
      undefined

    const num = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    if (!Number.isFinite(num)) {
      return null
    }

    return clamp01(num)
  }

  const allowedCategories = new Set(['Gemini Pro', 'Claude', 'Gemini Flash', 'Gemini Image'])
  const fixedOrder = ['Gemini Pro', 'Claude', 'Gemini Flash', 'Gemini Image']

  const categoryMap = new Map()

  const buildEntry = (category, rawModelId, modelDataRaw) => {
    const modelId = normalizeAntigravityQuotaModelId(rawModelId)
    if (!modelId) {
      return null
    }

    const quotaInfo = modelDataRaw?.quotaInfo || modelDataRaw?.quota_info || null
    const remainingFraction = parseRemainingFraction(quotaInfo)
    if (remainingFraction === null) {
      return null
    }

    const displayName = modelDataRaw?.displayName || modelDataRaw?.display_name || modelId
    const remainingPercent = round2(remainingFraction * 100)
    const usedPercent = round2(100 - remainingPercent)
    const resetAt = quotaInfo?.resetTime || quotaInfo?.reset_time || null

    return {
      category,
      modelId,
      displayName: String(displayName || modelId || category),
      remainingPercent,
      usedPercent,
      resetAt: typeof resetAt === 'string' && resetAt.trim() ? resetAt : null
    }
  }

  const pickPreferred = (category, matcher) => {
    let best = null

    for (const [rawModelId, modelDataRaw] of Object.entries(models)) {
      if (!modelDataRaw || typeof modelDataRaw !== 'object') {
        continue
      }

      const modelId = normalizeAntigravityQuotaModelId(rawModelId)
      if (!modelId) {
        continue
      }
      if (!matcher(modelId.toLowerCase())) {
        continue
      }

      const entry = buildEntry(category, modelId, modelDataRaw)
      if (!entry) {
        continue
      }

      // 同类若命中多个，取更保守（剩余更低）的那个
      if (!best || (entry.remainingPercent ?? 0) < (best.remainingPercent ?? 0)) {
        best = entry
      }
    }

    return best
  }

  // 优先匹配固定模型集合
  const proEntry = pickPreferred(
    'Gemini Pro',
    (id) => id === 'gemini-3-pro-high' || id.startsWith('gemini-2.5-pro')
  )
  if (proEntry) {
    categoryMap.set('Gemini Pro', proEntry)
  }

  const claudeEntry = pickPreferred(
    'Claude',
    (id) => id === 'claude-sonnet-4-5-thinking' || id.includes('claude')
  )
  if (claudeEntry) {
    categoryMap.set('Claude', claudeEntry)
  }

  const flashEntry = pickPreferred(
    'Gemini Flash',
    (id) => id === 'gemini-3-flash' || id.startsWith('gemini-2.5-flash')
  )
  if (flashEntry) {
    categoryMap.set('Gemini Flash', flashEntry)
  }

  const imageEntry = pickPreferred(
    'Gemini Image',
    (id) => id === 'gemini-3-pro-image' || id.startsWith('imagen-')
  )
  if (imageEntry) {
    categoryMap.set('Gemini Image', imageEntry)
  }

  for (const [modelId, modelDataRaw] of Object.entries(models)) {
    if (!modelDataRaw || typeof modelDataRaw !== 'object') {
      continue
    }

    const normalizedId = normalizeAntigravityQuotaModelId(modelId)
    if (!normalizedId) {
      continue
    }

    const displayName = modelDataRaw.displayName || modelDataRaw.display_name || normalizedId
    const category = normalizeQuotaCategory(displayName, normalizedId)
    if (!allowedCategories.has(category)) {
      continue
    }

    const entry = buildEntry(category, normalizedId, modelDataRaw)
    if (!entry) {
      continue
    }

    const existing = categoryMap.get(category)
    if (!existing || (entry.remainingPercent ?? 0) < (existing.remainingPercent ?? 0)) {
      categoryMap.set(category, entry)
    }
  }

  const buckets = fixedOrder.map((category) => {
    const existing = categoryMap.get(category) || null
    if (existing) {
      return existing
    }
    return {
      category,
      modelId: '',
      displayName: category,
      remainingPercent: null,
      usedPercent: null,
      resetAt: null
    }
  })

  if (buckets.length === 0) {
    return null
  }

  const critical = buckets
    .filter((item) => item.remainingPercent !== null)
    .reduce((min, item) => {
      if (!min) {
        return item
      }
      return (item.remainingPercent ?? 0) < (min.remainingPercent ?? 0) ? item : min
    }, null)

  if (!critical) {
    return null
  }

  return {
    balance: null,
    currency: 'USD',
    quota: {
      type: 'antigravity',
      total: 100,
      used: critical.usedPercent,
      remaining: critical.remainingPercent,
      percentage: critical.usedPercent,
      resetAt: critical.resetAt,
      buckets: buckets.map((item) => ({
        category: item.category,
        remaining: item.remainingPercent,
        used: item.usedPercent,
        percentage: item.usedPercent,
        resetAt: item.resetAt
      }))
    },
    queryMethod: 'api',
    rawData: {
      modelsCount: Object.keys(models).length,
      bucketCount: buckets.length
    }
  }
}

class GeminiBalanceProvider extends BaseBalanceProvider {
  constructor() {
    super('gemini')
  }

  async queryBalance(account) {
    const oauthProvider = account?.oauthProvider
    if (oauthProvider !== OAUTH_PROVIDER_ANTIGRAVITY) {
      if (account && Object.prototype.hasOwnProperty.call(account, 'dailyQuota')) {
        return this.readQuotaFromFields(account)
      }
      return { balance: null, currency: 'USD', queryMethod: 'local' }
    }

    const accessToken = String(account?.accessToken || '').trim()
    const refreshToken = String(account?.refreshToken || '').trim()
    const proxyConfig = account?.proxyConfig || account?.proxy || null

    if (!accessToken) {
      throw new Error('Antigravity 账户缺少 accessToken')
    }

    const fetch = async (token) =>
      await antigravityClient.fetchAvailableModels({
        accessToken: token,
        proxyConfig
      })

    let data
    try {
      data = await fetch(accessToken)
    } catch (error) {
      const status = error?.response?.status
      if ((status === 401 || status === 403) && refreshToken) {
        const refreshed = await geminiAccountService.refreshAccessToken(
          refreshToken,
          proxyConfig,
          OAUTH_PROVIDER_ANTIGRAVITY
        )
        const nextToken = String(refreshed?.access_token || '').trim()
        if (!nextToken) {
          throw error
        }
        data = await fetch(nextToken)
      } else {
        throw error
      }
    }

    const mapped = buildAntigravityQuota(data)
    if (!mapped) {
      return {
        balance: null,
        currency: 'USD',
        quota: null,
        queryMethod: 'api',
        rawData: data || null
      }
    }

    return mapped
  }
}

module.exports = GeminiBalanceProvider
