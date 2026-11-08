const crypto = require('crypto')

const FRESH_TTL_MS = 5 * 60 * 1000
const MAX_CATALOGS = 8

function validateModel(model, index) {
  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    throw new Error(`Codex model at index ${index} must be an object`)
  }

  const requiredStrings = ['slug', 'display_name', 'shell_type', 'visibility']
  for (const field of requiredStrings) {
    if (typeof model[field] !== 'string' || !model[field].trim()) {
      throw new Error(`Codex model at index ${index} is missing ${field}`)
    }
  }

  if (!Array.isArray(model.supported_reasoning_levels)) {
    throw new Error(`Codex model ${model.slug} has invalid supported_reasoning_levels`)
  }
  if (!Array.isArray(model.experimental_supported_tools)) {
    throw new Error(`Codex model ${model.slug} has invalid experimental_supported_tools`)
  }
  if (typeof model.supported_in_api !== 'boolean' || !Number.isInteger(model.priority)) {
    throw new Error(`Codex model ${model.slug} has invalid API metadata`)
  }
  if (
    !model.truncation_policy ||
    typeof model.truncation_policy !== 'object' ||
    typeof model.truncation_policy.mode !== 'string' ||
    !Number.isFinite(model.truncation_policy.limit)
  ) {
    throw new Error(`Codex model ${model.slug} has invalid truncation_policy`)
  }
}

function validateCatalog(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Codex models response must be an object')
  }
  if (!Array.isArray(payload.models) || payload.models.length === 0) {
    throw new Error('Codex models response must contain a non-empty models array')
  }

  const seen = new Set()
  payload.models.forEach((model, index) => {
    validateModel(model, index)
    if (seen.has(model.slug)) {
      throw new Error(`Codex models response contains duplicate slug: ${model.slug}`)
    }
    seen.add(model.slug)
  })

  return payload
}

class CodexModelsCatalogService {
  constructor() {
    this.catalogs = new Map()
    this.inflight = new Map()
  }

  normalizeClientVersion(value) {
    const version = typeof value === 'string' ? value.trim() : ''
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version) || version.length > 64) {
      return null
    }
    return version
  }

  getEntry(clientVersion) {
    return this.catalogs.get(clientVersion) || null
  }

  isFresh(entry) {
    return Boolean(entry && Date.now() - entry.updatedAt < FRESH_TTL_MS)
  }

  store(clientVersion, payload, upstreamEtag = null) {
    const validated = validateCatalog(payload)
    const entry = {
      payload: validated,
      upstreamEtag: typeof upstreamEtag === 'string' ? upstreamEtag : null,
      updatedAt: Date.now()
    }

    this.catalogs.delete(clientVersion)
    this.catalogs.set(clientVersion, entry)
    while (this.catalogs.size > MAX_CATALOGS) {
      this.catalogs.delete(this.catalogs.keys().next().value)
    }
    return entry
  }

  async getOrRefresh(clientVersion, loader) {
    const existing = this.getEntry(clientVersion)
    if (this.isFresh(existing)) {
      return { payload: existing.payload, source: 'fresh-cache' }
    }

    if (this.inflight.has(clientVersion)) {
      return this.inflight.get(clientVersion)
    }

    const refresh = (async () => {
      try {
        const result = await loader(existing?.upstreamEtag || null)
        if (result.notModified) {
          if (!existing) {
            throw new Error('Upstream returned 304 without a cached Codex model catalog')
          }
          existing.updatedAt = Date.now()
          return { payload: existing.payload, source: 'revalidated-cache' }
        }

        const entry = this.store(clientVersion, result.payload, result.etag)
        return { payload: entry.payload, source: 'oauth-upstream' }
      } catch (error) {
        if (existing) {
          return { payload: existing.payload, source: 'stale-cache', refreshError: error }
        }
        throw error
      } finally {
        this.inflight.delete(clientVersion)
      }
    })()

    this.inflight.set(clientVersion, refresh)
    return refresh
  }

  filterForApiKey(payload, apiKeyData = {}) {
    const restrictionEnabled =
      apiKeyData.enableModelRestriction === true || apiKeyData.enableModelRestriction === 'true'
    const restricted = new Set(
      restrictionEnabled && Array.isArray(apiKeyData.restrictedModels)
        ? apiKeyData.restrictedModels
        : []
    )

    if (restricted.size === 0) {
      return payload
    }

    return {
      ...payload,
      models: payload.models.filter((model) => !restricted.has(model.slug))
    }
  }

  createClientEtag(payload) {
    const digest = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('base64url')
    return `"crs-${digest}"`
  }

  resetForTests() {
    this.catalogs.clear()
    this.inflight.clear()
  }
}

module.exports = new CodexModelsCatalogService()
module.exports.validateCatalog = validateCatalog
