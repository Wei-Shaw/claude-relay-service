const apiKeyService = require('./apiKeyService')
const requestDetailService = require('./requestDetailService')
const claudeRelayConfigService = require('./claudeRelayConfigService')
const claudeAccountService = require('./account/claudeAccountService')
const claudeConsoleAccountService = require('./account/claudeConsoleAccountService')
const ccrAccountService = require('./account/ccrAccountService')
const bedrockAccountService = require('./account/bedrockAccountService')
const openaiAccountService = require('./account/openaiAccountService')
const openaiResponsesAccountService = require('./account/openaiResponsesAccountService')
const azureOpenaiAccountService = require('./account/azureOpenaiAccountService')
const geminiAccountService = require('./account/geminiAccountService')
const geminiApiAccountService = require('./account/geminiApiAccountService')
const droidAccountService = require('./account/droidAccountService')
const upstreamErrorHelper = require('../utils/upstreamErrorHelper')
const { isSchedulable } = require('../utils/commonHelper')
const { isClaudeFamilyModel, parseVendorPrefixedModel } = require('../utils/modelHelper')

const LIVE_WINDOW_SECONDS = 300
const HISTORY_BUCKETS = 60
const REQUEST_DETAIL_PAGE_SIZE = 200

const ENDPOINT_DEFINITIONS = [
  {
    id: 'claude',
    label: 'Claude',
    path: '/api/v1/messages',
    service: 'claude',
    defaultModel: 'sonnet',
    acceptedFormat: 'Claude / Codex',
    modelSource: 'body.model',
    accountTypes: ['claude', 'claude-console', 'bedrock'],
    ccrAccountTypes: ['ccr'],
    requestDetailMatchers: ['/api/v1/messages', '/v1/messages', '/api/messages'],
    models: [
      { id: 'sonnet', label: 'sonnet', hint: '模型别名' },
      { id: 'opus', label: 'opus', hint: '模型别名' },
      { id: 'haiku', label: 'haiku', hint: '模型别名' },
      { id: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6', hint: '完整模型名' },
      { id: 'claude-opus-4-7', label: 'claude-opus-4-7', hint: '完整模型名' },
      { id: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5', hint: '完整模型名' },
      { id: 'ccr,claude-sonnet', label: 'ccr,claude-*', hint: 'CCR 前缀路由' },
      { id: 'bedrock anthropic.*', label: 'bedrock anthropic.*', hint: 'Bedrock Claude 模型' }
    ]
  },
  {
    id: 'openai',
    label: 'OpenAI Chat',
    path: '/openai/v1/chat/completions',
    service: 'openai',
    defaultModel: 'gpt-5',
    acceptedFormat: 'OpenAI Chat Completions',
    modelSource: 'body.model',
    accountTypes: ['openai', 'openai-responses'],
    requestDetailMatchers: ['/openai/v1/chat/completions', '/v1/chat/completions'],
    models: [
      { id: 'gpt-5', label: 'gpt-5', hint: '默认模型' },
      { id: 'gpt-4o', label: 'gpt-4o', hint: '兼容模型' },
      { id: 'o3', label: 'o3', hint: '推理模型' }
    ]
  },
  {
    id: 'openai-responses',
    label: 'OpenAI Responses',
    path: '/openai/v1/responses',
    service: 'openai',
    defaultModel: 'gpt-5',
    acceptedFormat: 'OpenAI Responses',
    modelSource: 'body.model',
    accountTypes: ['openai-responses'],
    requestDetailMatchers: ['/openai/v1/responses', '/v1/responses', '/responses'],
    models: [
      { id: 'gpt-5', label: 'gpt-5', hint: 'Responses 默认模型' },
      { id: 'gpt-5-mini', label: 'gpt-5-mini', hint: '轻量模型' },
      { id: 'o3', label: 'o3', hint: '推理模型' }
    ]
  },
  {
    id: 'gemini',
    label: 'Gemini',
    path: '/gemini/v1beta/models',
    service: 'gemini',
    defaultModel: 'gemini-2.5-pro',
    acceptedFormat: 'Gemini / OpenAI compatible',
    modelSource: 'body.model / path model',
    accountTypes: ['gemini', 'gemini-api'],
    requestDetailMatchers: ['/gemini', '/v1beta/models', '/v1/models'],
    models: [
      { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro', hint: '默认模型' },
      { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash', hint: '快速模型' },
      { id: 'gemini-1.5-pro', label: 'gemini-1.5-pro', hint: '兼容模型' }
    ]
  },
  {
    id: 'azure-openai',
    label: 'Azure OpenAI',
    path: '/azure/openai/deployments',
    service: 'openai',
    defaultModel: 'gpt-4o',
    acceptedFormat: 'Azure OpenAI',
    modelSource: 'deployment / body.model',
    accountTypes: ['azure-openai'],
    requestDetailMatchers: ['/azure/openai', '/openai/deployments'],
    models: [
      { id: 'gpt-4o', label: 'gpt-4o', hint: '默认部署' },
      { id: 'gpt-5', label: 'gpt-5', hint: '新模型部署' },
      { id: 'o3', label: 'o3', hint: '推理部署' }
    ]
  },
  {
    id: 'droid',
    label: 'Droid',
    path: '/droid/v1/messages',
    service: 'droid',
    defaultModel: 'claude-sonnet-4.5',
    acceptedFormat: 'Droid',
    modelSource: 'body.model',
    accountTypes: ['droid'],
    requestDetailMatchers: ['/droid'],
    models: [
      { id: 'claude-sonnet-4.5', label: 'claude-sonnet-4.5', hint: '默认模型' },
      { id: 'claude-opus-4.5', label: 'claude-opus-4.5', hint: '高阶模型' }
    ]
  }
]

const ENDPOINTS_BY_ID = new Map(ENDPOINT_DEFINITIONS.map((endpoint) => [endpoint.id, endpoint]))

const ACCOUNT_LOADERS = {
  claude: {
    label: 'Claude OAuth',
    routeAccountType: 'claude-official',
    platform: 'claude',
    load: () => claudeAccountService.getAllAccounts()
  },
  'claude-console': {
    label: 'Claude Console',
    routeAccountType: 'claude-console',
    platform: 'claude-console',
    load: () => claudeConsoleAccountService.getAllAccounts()
  },
  ccr: {
    label: 'CCR',
    routeAccountType: 'ccr',
    platform: 'ccr',
    load: () => ccrAccountService.getAllAccounts()
  },
  bedrock: {
    label: 'AWS Bedrock',
    routeAccountType: 'bedrock',
    platform: 'bedrock',
    load: async () => {
      const result = await bedrockAccountService.getAllAccounts()
      return result?.success ? result.data || [] : []
    }
  },
  openai: {
    label: 'OpenAI',
    routeAccountType: 'openai',
    platform: 'openai',
    load: () => openaiAccountService.getAllAccounts()
  },
  'openai-responses': {
    label: 'OpenAI Responses',
    routeAccountType: 'openai-responses',
    platform: 'openai-responses',
    load: () => openaiResponsesAccountService.getAllAccounts(true)
  },
  'azure-openai': {
    label: 'Azure OpenAI',
    routeAccountType: 'azure-openai',
    platform: 'azure-openai',
    formPlatform: 'azure_openai',
    load: () => azureOpenaiAccountService.getAllAccounts()
  },
  gemini: {
    label: 'Gemini OAuth',
    routeAccountType: 'gemini',
    platform: 'gemini',
    load: () => geminiAccountService.getAllAccounts()
  },
  'gemini-api': {
    label: 'Gemini API',
    routeAccountType: 'gemini-api',
    platform: 'gemini-api',
    load: () => geminiApiAccountService.getAllAccounts(true)
  },
  droid: {
    label: 'Droid',
    routeAccountType: 'droid',
    platform: 'droid',
    load: () => droidAccountService.getAllAccounts()
  }
}

function getEndpointModelConfigKey(endpoint) {
  return endpoint.id
}

function withConfiguredEndpointModels(endpoint, modelEndpointConfigs = {}) {
  const configKey = getEndpointModelConfigKey(endpoint)
  const whitelistModels = modelEndpointConfigs[configKey]?.whitelistModels
  if (!Array.isArray(whitelistModels) || whitelistModels.length === 0) {
    return endpoint
  }

  return {
    ...endpoint,
    models: whitelistModels.map((model) => ({
      id: model.value,
      label: model.label || model.value,
      hint: '系统设置'
    }))
  }
}

function cloneEndpointDefinition(endpoint) {
  return {
    id: endpoint.id,
    label: endpoint.label,
    path: endpoint.path,
    service: endpoint.service,
    defaultModel: endpoint.defaultModel,
    acceptedFormat: endpoint.acceptedFormat,
    modelSource: endpoint.modelSource,
    models: endpoint.models
  }
}

function getEndpointDefinition(endpointId = 'claude') {
  return ENDPOINTS_BY_ID.get(endpointId) || ENDPOINTS_BY_ID.get('claude')
}

function normalizeArrayResult(value) {
  if (Array.isArray(value)) {
    return value
  }
  if (value?.success && Array.isArray(value.data)) {
    return value.data
  }
  return []
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function round(value, digits = 1) {
  const num = toNumber(value, 0)
  return Number(num.toFixed(digits))
}

function parseMaybeJson(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }
  if (typeof value !== 'string') {
    return value
  }
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function normalizeBoolean(value, fallback = false) {
  if (value === true || value === 'true' || value === 1 || value === '1') {
    return true
  }
  if (value === false || value === 'false' || value === 0 || value === '0') {
    return false
  }
  return fallback
}

function normalizeSourceType(value) {
  const type = String(value || '').toLowerCase()
  if (!type || type === 'unknown') {
    return 'unknown'
  }
  if (type === 'claude-official' || type === 'claude_oauth') {
    return 'claude'
  }
  if (type === 'claude_console' || type === 'claude-console') {
    return 'claude-console'
  }
  if (type === 'openai_responses' || type === 'openai-response') {
    return 'openai-responses'
  }
  if (type === 'azure_openai' || type === 'azureopenai') {
    return 'azure-openai'
  }
  if (type === 'gemini_api') {
    return 'gemini-api'
  }
  return type
}

function normalizeEndpointPath(endpoint) {
  if (!endpoint) {
    return ''
  }
  const value = String(endpoint).toLowerCase().split('?')[0]
  try {
    return new URL(value).pathname.toLowerCase()
  } catch {
    return value
  }
}

function matchesEndpointRecord(recordEndpoint, endpoint) {
  const normalized = normalizeEndpointPath(recordEndpoint)
  if (!normalized) {
    return false
  }

  return endpoint.requestDetailMatchers.some((matcher) => normalized.includes(matcher))
}

function matchesModel(recordModel, selectedModel) {
  if (!selectedModel) {
    return true
  }
  const recordValue = String(recordModel || '').toLowerCase()
  const selectedValue = String(selectedModel || '').toLowerCase()
  const parsed = parseVendorPrefixedModel(selectedModel)
  return (
    recordValue === selectedValue || recordValue === String(parsed.baseModel || '').toLowerCase()
  )
}

function normalizeSupportedModels(value) {
  const parsed = parseMaybeJson(value, value)
  if (Array.isArray(parsed)) {
    return parsed.filter(Boolean)
  }
  if (parsed && typeof parsed === 'object') {
    return parsed
  }
  return []
}

function objectSupportsModel(modelMapping, model) {
  const keys = Object.keys(modelMapping || {})
  if (keys.length === 0) {
    return true
  }
  const lowerModel = String(model || '').toLowerCase()
  return keys.some((key) => String(key).toLowerCase() === lowerModel)
}

function findMappingEntry(entries, model) {
  const lowerModel = String(model || '').toLowerCase()
  return entries.find((entry) => String(entry.sourceModel).toLowerCase() === lowerModel) || null
}

function buildModelMappingInfo(account, model) {
  const { baseModel } = parseVendorPrefixedModel(model)
  const effectiveModel = baseModel || model
  const supportedModels = normalizeSupportedModels(account.supportedModels)

  if (Array.isArray(supportedModels)) {
    if (supportedModels.length === 0) {
      return {
        mode: 'all',
        selected: {
          sourceModel: effectiveModel,
          mappedModel: effectiveModel
        },
        entries: [],
        entryCount: 0
      }
    }

    const entries = supportedModels.map((item) => ({
      sourceModel: item,
      mappedModel: item
    }))
    const selected = findMappingEntry(entries, model) || findMappingEntry(entries, effectiveModel)
    return {
      mode: 'list',
      selected,
      entries: entries.slice(0, 8),
      entryCount: entries.length
    }
  }

  if (!supportedModels || typeof supportedModels !== 'object') {
    return {
      mode: 'unknown',
      selected: null,
      entries: [],
      entryCount: 0
    }
  }

  const entries = Object.entries(supportedModels).map(([sourceModel, mappedModel]) => ({
    sourceModel,
    mappedModel
  }))
  const selected = findMappingEntry(entries, model) || findMappingEntry(entries, effectiveModel)

  return {
    mode: entries.length === 0 ? 'all' : 'mapping',
    selected:
      selected ||
      (entries.length === 0
        ? {
            sourceModel: effectiveModel,
            mappedModel: effectiveModel
          }
        : null),
    entries: entries.slice(0, 8),
    entryCount: entries.length
  }
}

function isModelSupportedByAccount(account, sourceType, model) {
  if (!model) {
    return true
  }

  const { vendor, baseModel } = parseVendorPrefixedModel(model)
  const effectiveModel = baseModel || model

  if (sourceType === 'ccr') {
    if (vendor !== 'ccr') {
      return false
    }
  } else if (vendor === 'ccr') {
    return false
  }

  if (sourceType === 'claude') {
    return isClaudeFamilyModel(effectiveModel)
  }

  if (sourceType === 'bedrock') {
    return isClaudeFamilyModel(effectiveModel) || String(effectiveModel).includes('anthropic')
  }

  if (sourceType === 'droid') {
    return true
  }

  const supportedModels = normalizeSupportedModels(account.supportedModels)
  if (Array.isArray(supportedModels)) {
    if (supportedModels.length === 0) {
      return true
    }
    const lowerModels = supportedModels.map((item) => String(item).toLowerCase())
    return lowerModels.includes(String(model).toLowerCase()) || lowerModels.includes(effectiveModel)
  }

  if (supportedModels && typeof supportedModels === 'object') {
    return (
      objectSupportsModel(supportedModels, model) ||
      objectSupportsModel(supportedModels, effectiveModel)
    )
  }

  return true
}

function getRouteAccountTypes(endpoint, model) {
  if (endpoint.id === 'claude') {
    const { vendor } = parseVendorPrefixedModel(model || endpoint.defaultModel)
    return vendor === 'ccr' ? endpoint.ccrAccountTypes : endpoint.accountTypes
  }
  return endpoint.accountTypes
}

function getSourceModelEntries(account) {
  const supportedModels = normalizeSupportedModels(account.supportedModels)
  if (Array.isArray(supportedModels)) {
    return supportedModels.map((model) => ({
      sourceModel: model,
      mappedModel: model
    }))
  }

  if (supportedModels && typeof supportedModels === 'object') {
    return Object.entries(supportedModels).map(([sourceModel, mappedModel]) => ({
      sourceModel,
      mappedModel
    }))
  }

  return []
}

function getDisplayModelId(sourceType, sourceModel) {
  const model = String(sourceModel || '').trim()
  if (!model) {
    return ''
  }

  if (sourceType !== 'ccr') {
    return model
  }

  const { vendor } = parseVendorPrefixedModel(model)
  return vendor === 'ccr' ? model : `ccr,${model}`
}

function addModelOption(optionMap, option, order) {
  const id = String(option.id || '').trim()
  if (!id) {
    return
  }

  const key = id.toLowerCase()
  const existing = optionMap.get(key)
  if (existing) {
    existing.sourceTypes = Array.from(
      new Set([...(existing.sourceTypes || []), ...(option.sourceTypes || [])])
    )
    existing.sourceCount = Math.max(existing.sourceCount || 0, option.sourceCount || 0)
    return
  }

  optionMap.set(key, {
    id,
    label: option.label || id,
    hint: option.hint || '',
    sourceTypes: option.sourceTypes || [],
    sourceCount: option.sourceCount || 0,
    order
  })
}

function buildAcceptedModelOptions(endpoint, accounts) {
  const optionMap = new Map()
  let order = 0

  for (const model of endpoint.models || []) {
    addModelOption(
      optionMap,
      {
        ...model,
        hint: model.hint || 'endpoint 默认模型'
      },
      order
    )
    order += 1
  }

  for (const { account, sourceType } of accounts) {
    const entries = getSourceModelEntries(account)
    for (const entry of entries) {
      const id = getDisplayModelId(sourceType, entry.sourceModel)
      if (!id) {
        continue
      }

      const label = id
      const mappedSuffix =
        entry.mappedModel && String(entry.mappedModel) !== String(entry.sourceModel)
          ? ` -> ${entry.mappedModel}`
          : ''

      addModelOption(
        optionMap,
        {
          id,
          label,
          hint: `账户模型${mappedSuffix}`,
          sourceTypes: [sourceType],
          sourceCount: 1
        },
        order
      )
      order += 1
    }
  }

  return Array.from(optionMap.values()).sort((a, b) => {
    const staticDiff = a.order - b.order
    if (staticDiff !== 0) {
      return staticDiff
    }
    return a.label.localeCompare(b.label)
  })
}

function getRateLimitState(account) {
  const rateLimitStatus = account.rateLimitStatus || account.rateLimitInfo
  if (!rateLimitStatus) {
    return { isRateLimited: false, minutesRemaining: 0, rateLimitedAt: null }
  }

  if (typeof rateLimitStatus === 'string') {
    return {
      isRateLimited: rateLimitStatus === 'limited' || rateLimitStatus === 'active',
      minutesRemaining: 0,
      rateLimitedAt: account.rateLimitedAt || null
    }
  }

  return {
    isRateLimited:
      rateLimitStatus.isRateLimited === true ||
      rateLimitStatus.status === 'limited' ||
      rateLimitStatus.status === 'active',
    minutesRemaining:
      toNumber(rateLimitStatus.minutesRemaining, 0) ||
      toNumber(rateLimitStatus.remainingMinutes, 0),
    rateLimitedAt: rateLimitStatus.rateLimitedAt || null
  }
}

function pickFirstNumber(values) {
  for (const value of values) {
    const num = toNullableNumber(value)
    if (num !== null) {
      return num
    }
  }
  return null
}

function normalizeDailyUsage(account) {
  const quota = pickFirstNumber([
    account.dailyQuota,
    account.dailyLimit,
    account.quota,
    account.quotaLimit,
    account.costLimit
  ])
  const usage = pickFirstNumber([
    account.dailyUsage,
    account.todayUsage,
    account.currentDailyCost,
    account.usage?.daily?.cost,
    account.daily?.cost
  ])

  const utilization = pickFirstNumber([
    account.usagePercentage,
    account.claudeUsage?.fiveHour?.utilization,
    account.codexUsage?.primary?.usedPercent
  ])
  const utilizationPercent =
    utilization === null
      ? null
      : utilization <= 1
        ? round(utilization * 100, 1)
        : round(utilization, 1)

  const quotaValue = quota || 0
  const usageValue = usage || 0
  const percentage =
    quotaValue > 0 ? Math.min(100, round((usageValue / quotaValue) * 100, 1)) : utilizationPercent

  return {
    usage: usageValue,
    quota: quotaValue,
    remaining: quotaValue > 0 ? Math.max(0, quotaValue - usageValue) : null,
    percentage,
    utilizationPercent,
    unit: quotaValue > 0 || usageValue > 0 ? '$' : '',
    hasQuota: quotaValue > 0,
    isExceeded: quotaValue > 0 && usageValue >= quotaValue
  }
}

function normalizeConcurrency(account) {
  const active = toNumber(
    account.activeTaskCount ??
      account.activeTasks ??
      account.currentConcurrency ??
      account.activeRequests,
    0
  )
  const limit = toNumber(
    account.maxConcurrentTasks ??
      account.maxConcurrency ??
      account.concurrencyLimit ??
      account.maxConcurrencyLimit,
    0
  )

  return {
    active,
    limit,
    unlimited: limit <= 0,
    percentage: limit > 0 ? Math.min(100, round((active / limit) * 100, 1)) : 0
  }
}

function getAccountStatus(account) {
  const rawStatus = String(account.status || '').toLowerCase()
  if (rawStatus) {
    return rawStatus
  }
  return normalizeBoolean(account.isActive, true) ? 'active' : 'inactive'
}

function buildHealth(account, daily, liveStats = {}) {
  const isActive = normalizeBoolean(account.isActive, true)
  const schedulable = isSchedulable(account.schedulable)
  const status = getAccountStatus(account)
  const rateLimit = getRateLimitState(account)
  const overloaded = account.overloadStatus?.isOverloaded === true
  const blockedStatus = ['error', 'unauthorized', 'blocked', 'disabled', 'inactive'].includes(
    status
  )

  let officialStatus = 'normal'
  if (!isActive || blockedStatus) {
    officialStatus = 'down'
  } else if (!schedulable || rateLimit.isRateLimited || overloaded || daily.isExceeded) {
    officialStatus = 'degraded'
  }

  const availabilityPercent =
    liveStats.totalCount > 0
      ? round((liveStats.successCount / liveStats.totalCount) * 100, 2)
      : null

  return {
    officialStatus,
    status,
    isActive,
    schedulable,
    isRateLimited: rateLimit.isRateLimited,
    rateLimitMinutesRemaining: rateLimit.minutesRemaining,
    overloaded,
    availabilityPercent,
    availabilityWindowLabel: '5分钟',
    conversationLatencyMs: liveStats.p95Ms || null,
    endpointPingMs: null
  }
}

function accountKey(sourceType, accountId) {
  return `${normalizeSourceType(sourceType)}:${accountId}`
}

function recordAccountKeys(record = {}) {
  const keys = []
  if (record.accountId) {
    keys.push(String(record.accountId))
    keys.push(accountKey(record.accountType, record.accountId))
  }
  return keys
}

function getRecordTimestamp(record = {}) {
  const raw = record.timestamp || record.createdAt || record.completedAt || record.startedAt
  const timestamp = raw ? new Date(raw).getTime() : Date.now()
  return Number.isNaN(timestamp) ? Date.now() : timestamp
}

function isSuccessStatus(statusCode) {
  const status = Number(statusCode)
  return status >= 200 && status < 400
}

function isWarnStatus(statusCode) {
  const status = Number(statusCode)
  return status === 429 || status === 529 || (status >= 400 && status < 500)
}

function getHistoryBucketStatus(bucket) {
  if (!bucket.total) {
    return 'empty'
  }
  if (bucket.down > 0) {
    return 'down'
  }
  if (bucket.warn > 0) {
    return 'warn'
  }
  return 'ok'
}

function buildHistory(records, windowSeconds, now = Date.now()) {
  const start = now - windowSeconds * 1000
  const bucketMs = (windowSeconds * 1000) / HISTORY_BUCKETS
  const buckets = Array.from({ length: HISTORY_BUCKETS }, () => ({
    total: 0,
    ok: 0,
    warn: 0,
    down: 0
  }))

  for (const record of records) {
    const timestamp = getRecordTimestamp(record)
    if (timestamp < start || timestamp > now) {
      continue
    }

    const index = Math.min(
      HISTORY_BUCKETS - 1,
      Math.max(0, Math.floor((timestamp - start) / bucketMs))
    )
    const bucket = buckets[index]
    const statusCode = Number(record.statusCode || record.status || 0)
    bucket.total += 1
    if (isSuccessStatus(statusCode)) {
      bucket.ok += 1
    } else if (isWarnStatus(statusCode)) {
      bucket.warn += 1
    } else {
      bucket.down += 1
    }
  }

  return buckets.map(getHistoryBucketStatus)
}

function percentile(values, ratio) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (sorted.length === 0) {
    return null
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index]
}

function aggregateRecords(records, windowSeconds) {
  const minutes = Math.max(windowSeconds / 60, 1)
  const durations = records
    .map((record) => toNumber(record.durationMs, 0))
    .filter((value) => value > 0)
  const totalTokens = records.reduce((sum, record) => sum + toNumber(record.totalTokens, 0), 0)
  const successCount = records.filter((record) => isSuccessStatus(record.statusCode)).length
  const warnCount = records.filter((record) => isWarnStatus(record.statusCode)).length
  const rateLimitedCount = records.filter((record) => Number(record.statusCode) === 429).length

  return {
    requestCount: records.length,
    successCount,
    warnCount,
    errorCount: Math.max(0, records.length - successCount - warnCount),
    rateLimitedCount,
    rpm: round(records.length / minutes, 1),
    tpm: round(totalTokens / minutes, 1),
    totalTokens,
    p95Ms: percentile(durations, 0.95)
  }
}

function aggregateByModel(records, windowSeconds) {
  const groups = new Map()
  for (const record of records) {
    const model = record.model || 'unknown'
    if (!groups.has(model)) {
      groups.set(model, [])
    }
    groups.get(model).push(record)
  }

  const total = Math.max(records.length, 1)
  return Array.from(groups.entries())
    .map(([model, modelRecords]) => ({
      model,
      ...aggregateRecords(modelRecords, windowSeconds),
      trafficPercent: round((modelRecords.length / total) * 100, 1)
    }))
    .sort((a, b) => b.requestCount - a.requestCount)
}

function aggregateByAccount(records, windowSeconds) {
  const groups = new Map()
  for (const record of records) {
    const keys = recordAccountKeys(record)
    for (const key of keys) {
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key).push(record)
    }
  }

  const now = Date.now()
  const accounts = {}
  for (const [key, accountRecords] of groups.entries()) {
    const stats = aggregateRecords(accountRecords, windowSeconds)
    accounts[key] = {
      ...stats,
      history: buildHistory(accountRecords, windowSeconds, now),
      totalCount: accountRecords.length
    }
  }
  return accounts
}

async function getRequestDetailRecords({ endpoint, model, apiKeyId, windowSeconds }) {
  const endDate = new Date()
  const startDate = new Date(endDate.getTime() - windowSeconds * 1000)
  const result = await requestDetailService.listRequestDetails({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    page: 1,
    pageSize: REQUEST_DETAIL_PAGE_SIZE,
    sortOrder: 'desc',
    apiKeyId: apiKeyId || undefined
  })

  const records = normalizeArrayResult(result?.records)
    .filter((record) => matchesEndpointRecord(record.endpoint, endpoint))
    .filter((record) => matchesModel(record.model, model))

  return {
    records,
    captureEnabled: result?.captureEnabled,
    readMode: result?.readMode,
    sampleLimited: toNumber(result?.pagination?.totalRecords, 0) > REQUEST_DETAIL_PAGE_SIZE
  }
}

async function buildLiveSnapshot({
  endpoint,
  model,
  apiKeyId,
  windowSeconds = LIVE_WINDOW_SECONDS
}) {
  const windowValue = Math.min(
    Math.max(Number.parseInt(windowSeconds, 10) || LIVE_WINDOW_SECONDS, 60),
    900
  )
  const detailResult = await getRequestDetailRecords({
    endpoint,
    model,
    apiKeyId,
    windowSeconds: windowValue
  })

  const accounts = aggregateByAccount(detailResult.records, windowValue)
  const summary = aggregateRecords(detailResult.records, windowValue)

  return {
    windowSeconds: windowValue,
    windowLabel: `${Math.round(windowValue / 60)}分钟`,
    source: {
      captureEnabled: detailResult.captureEnabled,
      readMode: detailResult.readMode,
      sampleLimited: detailResult.sampleLimited
    },
    summary,
    models: aggregateByModel(detailResult.records, windowValue),
    accounts,
    updatedAt: new Date().toISOString()
  }
}

function getBindingValue(apiKey, sourceType) {
  if (!apiKey) {
    return ''
  }

  if (sourceType === 'claude') {
    return apiKey.claudeAccountId || ''
  }
  if (sourceType === 'claude-console') {
    return apiKey.claudeConsoleAccountId || ''
  }
  if (sourceType === 'bedrock') {
    return apiKey.bedrockAccountId || ''
  }
  if (sourceType === 'ccr') {
    return apiKey.ccrAccountId || ''
  }
  if (sourceType === 'openai' || sourceType === 'openai-responses') {
    return apiKey.openaiAccountId || ''
  }
  if (sourceType === 'azure-openai') {
    return apiKey.azureOpenaiAccountId || ''
  }
  if (sourceType === 'gemini' || sourceType === 'gemini-api') {
    return apiKey.geminiAccountId || ''
  }
  if (sourceType === 'droid') {
    return apiKey.droidAccountId || ''
  }
  return ''
}

function encodeBindingAccountId(sourceType, accountId) {
  if (sourceType === 'openai-responses') {
    return `responses:${accountId}`
  }
  if (sourceType === 'gemini-api') {
    return `api:${accountId}`
  }
  return accountId
}

function evaluateApiKeyBinding(apiKey, account, sourceType) {
  const bindingValue = getBindingValue(apiKey, sourceType)
  if (!bindingValue) {
    return {
      matched: true,
      scope: 'shared',
      bindingValue: ''
    }
  }

  if (String(bindingValue).startsWith('group:')) {
    return {
      matched: true,
      scope: 'group',
      bindingValue
    }
  }

  const expectedValue = encodeBindingAccountId(sourceType, account.id)
  return {
    matched: String(bindingValue) === String(expectedValue),
    scope: 'dedicated',
    bindingValue
  }
}

function getRouteReason(status, reasons, bindingScope) {
  if (status === 'routable') {
    if (bindingScope === 'dedicated') {
      return '专属绑定命中，按权重进入候选'
    }
    if (bindingScope === 'group') {
      return '绑定分组候选，组内再按权重调度'
    }
    return '共享池候选，按权重调度'
  }

  if (status === 'degraded') {
    return '可进入候选，但当前健康状态需关注'
  }

  const reasonLabels = {
    api_key_disabled: 'API Key 已停用',
    api_key_permission_denied: 'API Key 无该 endpoint 权限',
    endpoint_pool_mismatch: '不属于当前 endpoint 账户池',
    model_not_supported: '模型不匹配',
    inactive: '账户未启用',
    status_blocked: '账户状态异常',
    not_schedulable: '已停止调度',
    rate_limited: '当前限流中',
    overloaded: '上游过载保护中',
    quota_exceeded: '今日限额已用尽',
    temp_unavailable: '临时不可用保护中',
    api_key_bound_to_other_account: 'API Key 绑定到其他账户'
  }

  return reasons.map((reason) => reasonLabels[reason] || reason).join('、') || '不在候选池'
}

function buildEditableAccount(account, sourceType, loader) {
  return {
    ...account,
    id: account.id,
    platform: loader.formPlatform || account.platform || loader.platform || sourceType,
    sourceType
  }
}

async function normalizeAccount(account, sourceType, context) {
  const loader = ACCOUNT_LOADERS[sourceType]
  const liveStats =
    context.live.accounts[account.id] ||
    context.live.accounts[accountKey(sourceType, account.id)] ||
    {}
  const daily = normalizeDailyUsage(account)
  const concurrency = normalizeConcurrency(account)
  const health = buildHealth(account, daily, liveStats)
  const supportedModels = normalizeSupportedModels(account.supportedModels)
  const { routeAccountType } = loader
  const routePoolMatched = context.routeAccountTypes.includes(sourceType)
  const modelSupported =
    routePoolMatched && isModelSupportedByAccount(account, sourceType, context.model)
  const apiKeyEnabled = !context.apiKey || context.apiKey.isActive !== false
  const permissionAllowed =
    !context.apiKey ||
    apiKeyService.hasPermission(context.apiKey.permissions, context.endpoint.service)
  const binding = evaluateApiKeyBinding(context.apiKey, account, sourceType)
  const rateLimit = getRateLimitState(account)
  const tempUnavailable = await upstreamErrorHelper.isTempUnavailable(account.id, routeAccountType)

  const excludedReasons = []
  if (!apiKeyEnabled) {
    excludedReasons.push('api_key_disabled')
  }
  if (!permissionAllowed) {
    excludedReasons.push('api_key_permission_denied')
  }
  if (!routePoolMatched) {
    excludedReasons.push('endpoint_pool_mismatch')
  }
  if (!modelSupported) {
    excludedReasons.push('model_not_supported')
  }
  if (!health.isActive) {
    excludedReasons.push('inactive')
  }
  if (['error', 'unauthorized', 'blocked', 'disabled'].includes(health.status)) {
    excludedReasons.push('status_blocked')
  }
  if (!health.schedulable) {
    excludedReasons.push('not_schedulable')
  }
  if (rateLimit.isRateLimited) {
    excludedReasons.push('rate_limited')
  }
  if (health.overloaded) {
    excludedReasons.push('overloaded')
  }
  if (daily.isExceeded) {
    excludedReasons.push('quota_exceeded')
  }
  if (tempUnavailable) {
    excludedReasons.push('temp_unavailable')
  }
  if (!binding.matched) {
    excludedReasons.push('api_key_bound_to_other_account')
  }

  const routeStatus =
    excludedReasons.length > 0
      ? 'excluded'
      : health.officialStatus === 'degraded'
        ? 'degraded'
        : 'routable'
  const priority = toNumber(account.priority, 50)

  return {
    id: account.id,
    name: account.name || account.id,
    description: '',
    sourceType,
    routeAccountType,
    platform: loader.platform,
    platformLabel: loader.label,
    accountKind: account.accountType || account.type || 'shared',
    priority,
    effectiveWeight: priority,
    sortRank: priority,
    isActive: health.isActive,
    status: health.status,
    schedulable: health.schedulable,
    routeStatus,
    routeReason: getRouteReason(routeStatus, excludedReasons, binding.scope),
    excludedReasons,
    binding,
    permissionAllowed,
    routePoolMatched,
    modelSupported,
    modelMapping: buildModelMappingInfo(account, context.model),
    supportedModels,
    daily,
    concurrency,
    health,
    live: {
      rpm: liveStats.rpm || 0,
      tpm: liveStats.tpm || 0,
      requestCount: liveStats.requestCount || 0,
      totalTokens: liveStats.totalTokens || 0,
      p95Ms: liveStats.p95Ms || null,
      rateLimitedCount: liveStats.rateLimitedCount || 0,
      history: liveStats.history || buildHistory([], LIVE_WINDOW_SECONDS)
    },
    lastUsedAt: account.lastUsedAt || null,
    expiresAt: account.expiresAt || account.subscriptionExpiresAt || null,
    updatedAt: account.updatedAt || null,
    editAccount: buildEditableAccount(account, sourceType, loader)
  }
}

function sortAccounts(accounts) {
  const statusRank = {
    routable: 0,
    degraded: 1,
    excluded: 2
  }
  return [...accounts].sort((a, b) => {
    const routeDiff = statusRank[a.routeStatus] - statusRank[b.routeStatus]
    if (routeDiff !== 0) {
      return routeDiff
    }
    if (a.priority !== b.priority) {
      return a.priority - b.priority
    }
    if (b.live.rpm !== a.live.rpm) {
      return b.live.rpm - a.live.rpm
    }
    return String(a.name).localeCompare(String(b.name))
  })
}

async function loadAccountsForEndpoint(endpoint, model) {
  const routeTypes = getRouteAccountTypes(endpoint, model)
  const allTypes = Array.from(
    new Set([...(endpoint.accountTypes || []), ...(endpoint.ccrAccountTypes || [])])
  )
  const selectedTypes = Array.from(new Set([...routeTypes, ...allTypes]))

  const results = await Promise.all(
    selectedTypes.map(async (sourceType) => {
      const loader = ACCOUNT_LOADERS[sourceType]
      if (!loader) {
        return []
      }
      const accounts = await loader.load()
      return normalizeArrayResult(accounts).map((account) => ({ account, sourceType }))
    })
  )

  return results.flat()
}

function buildModelRoutes(endpoint, accounts, apiKey) {
  return buildAcceptedModelOptions(endpoint, accounts).map((model) => {
    const routeTypes = getRouteAccountTypes(endpoint, model.id)
    let routableCount = 0
    let candidateCount = 0
    for (const { account, sourceType } of accounts) {
      if (!routeTypes.includes(sourceType)) {
        continue
      }
      candidateCount += 1
      const daily = normalizeDailyUsage(account)
      const health = buildHealth(account, daily, {})
      const permissionAllowed =
        !apiKey || apiKeyService.hasPermission(apiKey.permissions, endpoint.service)
      const binding = evaluateApiKeyBinding(apiKey, account, sourceType)
      if (
        permissionAllowed &&
        binding.matched &&
        health.isActive &&
        health.schedulable &&
        !daily.isExceeded &&
        isModelSupportedByAccount(account, sourceType, model.id)
      ) {
        routableCount += 1
      }
    }

    return {
      ...model,
      selected: false,
      candidateCount,
      routableCount
    }
  })
}

async function resolveApiKey(apiKeyId) {
  if (!apiKeyId) {
    return null
  }

  const apiKey = await apiKeyService.getApiKeyById(apiKeyId)
  if (!apiKey) {
    const error = new Error('API Key not found')
    error.statusCode = 404
    throw error
  }
  return apiKey
}

function sanitizeApiKey(apiKey) {
  return {
    id: apiKey.id,
    name: apiKey.name || apiKey.id,
    isActive: apiKey.isActive !== false,
    permissions: apiKeyService.normalizePermissions(apiKey.permissions),
    bindings: {
      claudeAccountId: apiKey.claudeAccountId || '',
      claudeConsoleAccountId: apiKey.claudeConsoleAccountId || '',
      geminiAccountId: apiKey.geminiAccountId || '',
      openaiAccountId: apiKey.openaiAccountId || '',
      azureOpenaiAccountId: apiKey.azureOpenaiAccountId || '',
      bedrockAccountId: apiKey.bedrockAccountId || '',
      droidAccountId: apiKey.droidAccountId || '',
      ccrAccountId: apiKey.ccrAccountId || ''
    }
  }
}

const routeRulesVisualizationService = {
  async getEndpoints() {
    const apiKeys = await apiKeyService.getAllApiKeysFast(false)
    const config = await claudeRelayConfigService.getConfig()
    const modelEndpointConfigs = config.modelEndpointConfigs || {}
    return {
      defaultEndpoint: 'claude',
      liveWindowSeconds: LIVE_WINDOW_SECONDS,
      endpoints: ENDPOINT_DEFINITIONS.map((endpoint) =>
        cloneEndpointDefinition(withConfiguredEndpointModels(endpoint, modelEndpointConfigs))
      ),
      apiKeys: apiKeys.map(sanitizeApiKey).sort((a, b) => a.name.localeCompare(b.name))
    }
  },

  async getExplain(params = {}) {
    const baseEndpoint = getEndpointDefinition(params.endpoint)
    const config = await claudeRelayConfigService.getConfig()
    const endpoint = withConfiguredEndpointModels(baseEndpoint, config.modelEndpointConfigs || {})
    const model = params.model || endpoint.defaultModel
    const apiKey = await resolveApiKey(params.apiKeyId)
    const live = await buildLiveSnapshot({
      endpoint,
      model,
      apiKeyId: apiKey?.id || null,
      windowSeconds: params.windowSeconds || LIVE_WINDOW_SECONDS
    })
    const routeAccountTypes = getRouteAccountTypes(endpoint, model)
    const rawAccounts = await loadAccountsForEndpoint(endpoint, model)

    const accounts = await Promise.all(
      rawAccounts.map(({ account, sourceType }) =>
        normalizeAccount(account, sourceType, {
          endpoint,
          model,
          apiKey,
          live,
          routeAccountTypes
        })
      )
    )

    const sortedAccounts = sortAccounts(accounts)
    const modelRoutes = buildModelRoutes(endpoint, rawAccounts, apiKey).map((item) => ({
      ...item,
      selected: item.id === model
    }))

    return {
      endpoint: cloneEndpointDefinition(endpoint),
      selectedModel: model,
      selectedApiKey: apiKey ? sanitizeApiKey(apiKey) : null,
      routeAccountTypes,
      modelRoutes,
      accounts: sortedAccounts,
      summary: {
        routableCount: sortedAccounts.filter((account) => account.routeStatus === 'routable')
          .length,
        degradedCount: sortedAccounts.filter((account) => account.routeStatus === 'degraded')
          .length,
        excludedCount: sortedAccounts.filter((account) => account.routeStatus === 'excluded').length
      },
      live,
      generatedAt: new Date().toISOString()
    }
  },

  async getLive(params = {}) {
    const endpoint = getEndpointDefinition(params.endpoint)
    const model = params.model || endpoint.defaultModel
    return buildLiveSnapshot({
      endpoint,
      model,
      apiKeyId: params.apiKeyId || null,
      windowSeconds: params.windowSeconds || LIVE_WINDOW_SECONDS
    })
  }
}

module.exports = routeRulesVisualizationService
