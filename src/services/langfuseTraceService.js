const axios = require('axios')
const config = require('../../config/config')
const logger = require('../utils/logger')
const metadataUserIdHelper = require('../utils/metadataUserIdHelper')

const DEFAULT_TIMEOUT_MS = 5000

function parseBoolean(value) {
  return value === true || value === 'true' || value === '1'
}

function parseTimeout(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS
}

function trimTrailingSlash(value) {
  return typeof value === 'string' ? value.replace(/\/+$/, '') : ''
}

function getRuntimeConfig() {
  const langfuseConfig = config.langfuse || {}
  return {
    enabled: parseBoolean(langfuseConfig.enabled ?? process.env.LANGFUSE_ENABLED),
    baseUrl: trimTrailingSlash(langfuseConfig.baseUrl || process.env.LANGFUSE_BASE_URL),
    publicKey: langfuseConfig.publicKey || process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: langfuseConfig.secretKey || process.env.LANGFUSE_SECRET_KEY,
    timeoutMs: parseTimeout(langfuseConfig.timeoutMs || process.env.LANGFUSE_TIMEOUT_MS),
    environment: langfuseConfig.environment || process.env.LANGFUSE_ENVIRONMENT || 'default'
  }
}

function toIsoString(value, fallback = null) {
  if (!value) {
    return fallback
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function cleanObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }

  const result = {}
  for (const [key, childValue] of Object.entries(value)) {
    if (childValue !== undefined) {
      result[key] = childValue
    }
  }
  return result
}

function safeJsonValue(value) {
  if (value === undefined) {
    return undefined
  }

  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    return {
      serializationError: error.message,
      value: String(value)
    }
  }
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return null
}

function buildUserId(detail = {}) {
  const parsedMetadataUser = metadataUserIdHelper.parse(detail.metadataUserId)
  const apiKeyName = firstNonEmpty(detail.apiKeyName, detail.apiKeyId)

  return firstNonEmpty(apiKeyName, parsedMetadataUser?.deviceId, detail.metadataUserId)
}

function buildUsage(detail = {}) {
  const input = Number(detail.inputTokens) || 0
  const output = Number(detail.outputTokens) || 0
  const cacheRead = Number(detail.cacheReadTokens) || 0
  const cacheCreate = Number(detail.cacheCreateTokens) || 0
  const total = Number(detail.totalTokens) || input + output + cacheRead + cacheCreate

  return cleanObject({
    input,
    output,
    total,
    unit: 'TOKENS',
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheCreateTokens: cacheCreate
  })
}

function toFiniteNumber(value) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function buildUsageDetails(detail = {}) {
  const input = toFiniteNumber(detail.inputTokens)
  const output = toFiniteNumber(detail.outputTokens)
  const cacheRead = toFiniteNumber(detail.cacheReadTokens)
  const cacheCreate = toFiniteNumber(detail.cacheCreateTokens)
  const total = toFiniteNumber(detail.totalTokens) || input + output + cacheRead + cacheCreate

  return cleanObject({
    input,
    output,
    cache_read_input: cacheRead,
    cache_creation_input: cacheCreate,
    total
  })
}

function addPositiveNumber(target, key, value) {
  const numberValue = toFiniteNumber(value)
  if (numberValue > 0) {
    target[key] = numberValue
  }
}

function buildCostDetails(detail = {}) {
  const source = detail.realCostBreakdown || detail.costBreakdown || {}
  const costDetails = {}

  addPositiveNumber(costDetails, 'input', source.input)
  addPositiveNumber(costDetails, 'output', source.output)
  addPositiveNumber(costDetails, 'cache_read_input', source.cacheRead)
  addPositiveNumber(costDetails, 'cache_creation_input', source.cacheCreate ?? source.cacheWrite)
  addPositiveNumber(costDetails, 'ephemeral_5m_input', source.ephemeral5m)
  addPositiveNumber(costDetails, 'ephemeral_1h_input', source.ephemeral1h)
  addPositiveNumber(costDetails, 'total', source.total ?? detail.realCost ?? detail.cost)

  return Object.keys(costDetails).length > 0 ? costDetails : undefined
}

function buildMetadata(detail = {}, runtimeConfig = {}) {
  const parsedMetadataUser = metadataUserIdHelper.parse(detail.metadataUserId)

  return cleanObject({
    source: 'claude-relay-service',
    environment: runtimeConfig.environment,
    requestId: detail.requestId,
    endpoint: detail.endpoint,
    method: detail.method,
    statusCode: detail.statusCode,
    stream: detail.stream,
    apiKeyId: detail.apiKeyId,
    apiKeyName: detail.apiKeyName,
    accountId: detail.accountId,
    accountType: detail.accountType,
    model: detail.model,
    sessionId: detail.sessionId,
    sessionHash: detail.sessionHash,
    conversationId: detail.conversationId,
    promptCacheKey: detail.promptCacheKey,
    metadataUserId: detail.metadataUserId,
    metadataDeviceId: parsedMetadataUser?.deviceId,
    metadataAccountUuid: parsedMetadataUser?.accountUuid,
    metadataSessionId: parsedMetadataUser?.sessionId,
    serviceTier: detail.serviceTier,
    clientIp: detail.clientIp,
    userAgent: detail.userAgent,
    requestSource: detail.requestSource,
    requestStartedAt: detail.requestStartedAt,
    firstByteAt: detail.firstByteAt,
    firstTokenAt: detail.firstTokenAt,
    responseCompletedAt: detail.responseCompletedAt,
    durationMs: detail.durationMs,
    timeToFirstByteMs: detail.timeToFirstByteMs,
    timeToFirstTokenMs: detail.timeToFirstTokenMs,
    contentGenerationMs: detail.contentGenerationMs,
    inputTokens: detail.inputTokens,
    outputTokens: detail.outputTokens,
    cacheReadTokens: detail.cacheReadTokens,
    cacheCreateTokens: detail.cacheCreateTokens,
    totalTokens: detail.totalTokens,
    cost: detail.cost,
    realCost: detail.realCost,
    costBreakdown: safeJsonValue(detail.costBreakdown),
    realCostBreakdown: safeJsonValue(detail.realCostBreakdown),
    pricingSource: detail.pricingSource,
    usedFallbackPricing: detail.usedFallbackPricing,
    costRecomputed: detail.costRecomputed,
    responseHeaders: safeJsonValue(detail.responseHeaders),
    responseTextPreview: detail.responseTextPreview,
    responseBodySizeBytes: detail.responseBodySizeBytes,
    responseBodyTruncated: detail.responseBodyTruncated,
    upstreamResponseId: detail.upstreamResponseId,
    finishReason: detail.finishReason,
    errorBody: safeJsonValue(detail.errorBody),
    responseMetadata: safeJsonValue(detail.responseMetadata),
    metadata: safeJsonValue(detail.metadata)
  })
}

function buildTags(detail = {}, runtimeConfig = {}) {
  return [
    'crs',
    runtimeConfig.environment,
    detail.accountType,
    detail.model,
    detail.endpoint,
    detail.stream === true ? 'stream' : 'non-stream',
    Number(detail.statusCode) >= 400 ? 'error' : 'success'
  ].filter(Boolean)
}

function buildTracePayload(detail = {}, runtimeConfig = {}) {
  const traceId = detail.requestId
  const timestamp = toIsoString(detail.timestamp, new Date().toISOString())
  const requestBody = safeJsonValue(detail.requestBody ?? detail.requestBodySnapshot)
  const responseBody = safeJsonValue(detail.responseBody ?? detail.responseBodySnapshot)
  const metadata = buildMetadata(detail, runtimeConfig)
  const sessionId = firstNonEmpty(detail.sessionId, detail.conversationId, detail.sessionHash)
  const userId = buildUserId(detail)
  const name = firstNonEmpty(detail.endpoint, detail.model, 'crs-request')
  const generationId = `${traceId}-generation`

  return {
    batch: [
      {
        id: `${traceId}-trace-create`,
        timestamp,
        type: 'trace-create',
        body: cleanObject({
          id: traceId,
          name,
          userId,
          sessionId,
          input: requestBody,
          output: responseBody,
          metadata,
          tags: buildTags(detail, runtimeConfig)
        })
      },
      {
        id: `${traceId}-generation-create`,
        timestamp,
        type: 'generation-create',
        body: cleanObject({
          id: generationId,
          traceId,
          name,
          startTime: toIsoString(detail.requestStartedAt, timestamp),
          endTime: toIsoString(detail.responseCompletedAt),
          model: detail.model,
          input: requestBody,
          output: responseBody,
          usage: buildUsage(detail),
          usageDetails: buildUsageDetails(detail),
          costDetails: buildCostDetails(detail),
          metadata
        })
      }
    ]
  }
}

class LangfuseTraceService {
  isEnabled() {
    const runtimeConfig = getRuntimeConfig()
    return Boolean(
      runtimeConfig.enabled &&
        runtimeConfig.baseUrl &&
        runtimeConfig.publicKey &&
        runtimeConfig.secretKey
    )
  }

  async captureRequestDetail(detail = {}) {
    const runtimeConfig = getRuntimeConfig()
    if (
      !runtimeConfig.enabled ||
      !runtimeConfig.baseUrl ||
      !runtimeConfig.publicKey ||
      !runtimeConfig.secretKey ||
      !detail.requestId
    ) {
      return { captured: false, reason: 'disabled' }
    }

    const payload = buildTracePayload(detail, runtimeConfig)
    const response = await axios.post(`${runtimeConfig.baseUrl}/api/public/ingestion`, payload, {
      auth: {
        username: runtimeConfig.publicKey,
        password: runtimeConfig.secretKey
      },
      timeout: runtimeConfig.timeoutMs,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const errors = Array.isArray(response.data?.errors) ? response.data.errors : []
    if (errors.length > 0) {
      logger.warn(
        `⚠️ Langfuse ingestion returned ${errors.length} error(s) for request ${detail.requestId}`
      )
      return { captured: false, reason: 'langfuse_errors', requestId: detail.requestId }
    }

    return { captured: true, requestId: detail.requestId }
  }
}

module.exports = new LangfuseTraceService()
module.exports._private = {
  buildTracePayload,
  buildUsageDetails,
  buildCostDetails,
  getRuntimeConfig
}
