const CostCalculator = require('./costCalculator')

function parseCount(value) {
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundCost(value) {
  const amount = Number(value) || 0
  return Math.round(amount * 1_000_000) / 1_000_000
}

function emptyUsage() {
  return {
    requests: 0,
    tokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreateTokens: 0,
    cacheReadTokens: 0,
    cost: 0
  }
}

function usageFromHash(data = {}) {
  const inputTokens = parseCount(data.inputTokens || data.totalInputTokens)
  const outputTokens = parseCount(data.outputTokens || data.totalOutputTokens)
  const cacheCreateTokens = parseCount(data.cacheCreateTokens || data.totalCacheCreateTokens)
  const cacheReadTokens = parseCount(data.cacheReadTokens || data.totalCacheReadTokens)
  const requests = parseCount(data.requests || data.totalRequests)
  const tokens =
    parseCount(data.allTokens || data.totalAllTokens) ||
    inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

  return {
    requests,
    tokens,
    inputTokens,
    outputTokens,
    cacheCreateTokens,
    cacheReadTokens,
    cost: 0
  }
}

function addUsage(target, extra) {
  target.requests += extra.requests || 0
  target.tokens += extra.tokens || 0
  target.inputTokens += extra.inputTokens || 0
  target.outputTokens += extra.outputTokens || 0
  target.cacheCreateTokens += extra.cacheCreateTokens || 0
  target.cacheReadTokens += extra.cacheReadTokens || 0
  target.cost += extra.cost || 0
  return target
}

const HOURLY_MODEL_FIELD =
  /^model:(.+):(inputTokens|outputTokens|cacheCreateTokens|cacheReadTokens|ephemeral5mTokens|ephemeral1hTokens|allTokens|requests)$/

function extractModelUsageFromHourlyHash(data = {}) {
  const models = {}
  for (const [field, value] of Object.entries(data || {})) {
    const match = HOURLY_MODEL_FIELD.exec(field)
    if (!match) {
      continue
    }
    const [, model, metric] = match
    if (!models[model]) {
      models[model] = {}
    }
    models[model][metric] = parseCount(value)
  }
  return models
}

function costFromModelUsageMap(models, fallbackModel = 'unknown') {
  let total = 0
  const entries = Object.entries(models || {})
  if (entries.length === 0) {
    return 0
  }

  for (const [model, usage] of entries) {
    const costUsage = {
      input_tokens: usage.inputTokens || 0,
      output_tokens: usage.outputTokens || 0,
      cache_creation_input_tokens: usage.cacheCreateTokens || 0,
      cache_read_input_tokens: usage.cacheReadTokens || 0
    }
    const eph5m = usage.ephemeral5mTokens || 0
    const eph1h = usage.ephemeral1hTokens || 0
    if (eph5m > 0 || eph1h > 0) {
      costUsage.cache_creation = {
        ephemeral_5m_input_tokens: eph5m,
        ephemeral_1h_input_tokens: eph1h
      }
    }
    const result = CostCalculator.calculateCost(costUsage, model || fallbackModel)
    total += result?.costs?.total || 0
  }

  return total
}

function costFromUsageHash(data = {}, fallbackModel = 'unknown') {
  const models = extractModelUsageFromHourlyHash(data)
  const modelCost = costFromModelUsageMap(models, fallbackModel)
  if (modelCost > 0) {
    return modelCost
  }

  const usage = usageFromHash(data)
  if (usage.tokens <= 0) {
    return 0
  }

  const fallbackUsage = {
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cache_creation_input_tokens: usage.cacheCreateTokens,
    cache_read_input_tokens: usage.cacheReadTokens
  }
  const result = CostCalculator.calculateCost(fallbackUsage, fallbackModel)
  return result?.costs?.total || 0
}

function getHourSlotKeys(now, count, getDateStringInTimezone, getHourInTimezone) {
  const keys = []
  for (let i = 0; i < count; i++) {
    const at = new Date(now.getTime() - i * 3600000)
    const hour = String(getHourInTimezone(at)).padStart(2, '0')
    keys.push(`${getDateStringInTimezone(at)}:${hour}`)
  }
  return keys
}

function getDaySlotKeys(now, count, getDateStringInTimezone) {
  const keys = []
  for (let i = 0; i < count; i++) {
    const at = new Date(now.getTime() - i * 24 * 3600000)
    keys.push(getDateStringInTimezone(at))
  }
  return keys
}

function formatWindow(usage) {
  const cost = roundCost(usage.cost)
  return {
    requests: usage.requests || 0,
    tokens: usage.tokens || 0,
    inputTokens: usage.inputTokens || 0,
    outputTokens: usage.outputTokens || 0,
    cacheCreateTokens: usage.cacheCreateTokens || 0,
    cacheReadTokens: usage.cacheReadTokens || 0,
    cost,
    formattedCost: CostCalculator.formatCost(cost)
  }
}

function sumSlots(slotKeys, hashesByKey, costByKey, fallbackModel, useHashCost) {
  const total = emptyUsage()
  for (const key of slotKeys) {
    const data = hashesByKey.get(key) || {}
    const usage = usageFromHash(data)
    if (costByKey && costByKey.has(key)) {
      usage.cost = costByKey.get(key) || 0
    }
    if (useHashCost || (usage.tokens > 0 && !usage.cost)) {
      usage.cost = usage.cost || costFromUsageHash(data, fallbackModel)
    }
    addUsage(total, usage)
  }
  return formatWindow(total)
}

function buildRollingUsage({
  now = new Date(),
  getDateStringInTimezone,
  getHourInTimezone,
  hourlyHashes = new Map(),
  dailyHashes = new Map(),
  dailyCosts = new Map(),
  fallbackModel = 'unknown'
} = {}) {
  const hourKeys24 = getHourSlotKeys(now, 24, getDateStringInTimezone, getHourInTimezone)
  const dayKeys7 = getDaySlotKeys(now, 7, getDateStringInTimezone)
  const dayKeys30 = getDaySlotKeys(now, 30, getDateStringInTimezone)

  return {
    fiveHour: sumSlots(hourKeys24.slice(0, 5), hourlyHashes, null, fallbackModel, true),
    oneDay: sumSlots(hourKeys24, hourlyHashes, null, fallbackModel, true),
    sevenDay: sumSlots(dayKeys7, dailyHashes, dailyCosts, fallbackModel, false),
    thirtyDay: sumSlots(dayKeys30, dailyHashes, dailyCosts, fallbackModel, false)
  }
}

module.exports = {
  parseCount,
  usageFromHash,
  extractModelUsageFromHourlyHash,
  costFromUsageHash,
  getHourSlotKeys,
  getDaySlotKeys,
  buildRollingUsage,
  formatWindow,
  emptyUsage
}
