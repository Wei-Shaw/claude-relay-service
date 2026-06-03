const config = require('../../config/config')
const redis = require('../models/redis')
const logger = require('../utils/logger')
const CostCalculator = require('../utils/costCalculator')
const postgresUsageStore = require('./usageStores/postgresUsageStore')

function getWriteMode() {
  return config.usageStorage?.writeMode || 'redis'
}

function getReadMode() {
  return config.usageStorage?.readMode || 'redis'
}

function shouldWriteRedis() {
  return getWriteMode() === 'redis' || getWriteMode() === 'dual'
}

function shouldWritePostgres() {
  return getWriteMode() === 'dual' || getWriteMode() === 'postgres'
}

function shouldReadPostgres() {
  return getReadMode() === 'postgres'
}

function normalizeUsageRecordForPostgres(keyId, usageRecord = {}, keyData = {}) {
  return {
    ...usageRecord,
    eventId: usageRecord.eventId || usageRecord.requestId || null,
    apiKeyId: keyId,
    apiKeyName: keyData?.name || usageRecord.apiKeyName || null,
    metadata: {
      ...(usageRecord.metadata && typeof usageRecord.metadata === 'object'
        ? usageRecord.metadata
        : {}),
      userId: keyData?.userId || undefined
    }
  }
}

function decorateModelStats(rows = []) {
  return rows.map((row) => {
    const inputTokens = parseInt(row.input_tokens) || 0
    const outputTokens = parseInt(row.output_tokens) || 0
    const cacheCreateTokens = parseInt(row.cache_create_tokens) || 0
    const cacheReadTokens = parseInt(row.cache_read_tokens) || 0
    const ephemeral5mTokens = parseInt(row.ephemeral_5m_tokens) || 0
    const ephemeral1hTokens = parseInt(row.ephemeral_1h_tokens) || 0
    const allTokens = parseInt(row.total_tokens) || 0
    const realCost = Number(row.real_cost) || 0
    const ratedCost = Number(row.cost) || 0
    const usage = {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: cacheCreateTokens,
      cache_read_input_tokens: cacheReadTokens
    }

    if (ephemeral5mTokens > 0 || ephemeral1hTokens > 0) {
      usage.cache_creation = {
        ephemeral_5m_input_tokens: ephemeral5mTokens,
        ephemeral_1h_input_tokens: ephemeral1hTokens
      }
    }

    const costData = CostCalculator.calculateCost(usage, row.model || 'unknown')
    costData.costs.real = realCost
    costData.costs.rated = ratedCost
    costData.costs.total = realCost
    costData.formatted.total = `$${realCost.toFixed(6)}`

    return {
      model: row.model || 'unknown',
      requests: parseInt(row.request_count) || 0,
      inputTokens,
      outputTokens,
      cacheCreateTokens,
      cacheReadTokens,
      allTokens,
      costs: costData.costs,
      formatted: costData.formatted,
      pricing: costData.pricing,
      isLegacy: false
    }
  })
}

async function recordUsageEvent(keyId, usageRecord = {}, keyData = {}) {
  if (!shouldWritePostgres()) {
    return { inserted: 0, skipped: 0 }
  }

  try {
    return await postgresUsageStore.upsertUsageEvent(
      normalizeUsageRecordForPostgres(keyId, usageRecord, keyData)
    )
  } catch (error) {
    logger.warn(`⚠️ Failed to write usage event to PostgreSQL for ${keyId}: ${error.message}`)
    if (getWriteMode() === 'postgres') {
      throw error
    }
    return { inserted: 0, skipped: 0, error: error.message }
  }
}

async function getUsageStats(keyId, options = {}) {
  if (!shouldReadPostgres()) {
    return redis.getUsageStats(keyId)
  }

  let createdAt = options.createdAt || null
  if (!createdAt) {
    const keyData = await redis.getApiKey(keyId)
    createdAt = keyData?.createdAt || null
  }

  return postgresUsageStore.getUsageStats(keyId, { createdAt })
}

async function getUsageStatsWithRecords(keyId, options = {}) {
  const usageStats = await getUsageStats(keyId, options)
  const optionObject =
    options && typeof options === 'object' && !Array.isArray(options) ? options : {}

  if (optionObject.includeRecords === false) {
    return usageStats
  }

  const recordLimit = optionObject.recordLimit || 20
  const recentRecords = shouldReadPostgres()
    ? await postgresUsageStore.getUsageRecords(keyId, recordLimit)
    : await redis.getUsageRecords(keyId, recordLimit)

  const compatibleRecords = recentRecords.map((record) => {
    const breakdown = record.realCostBreakdown || record.costBreakdown
    return {
      ...record,
      costBreakdown: breakdown,
      realCostBreakdown: breakdown
    }
  })

  return {
    ...usageStats,
    recentRecords: compatibleRecords
  }
}

async function getDailyCost(keyId) {
  if (!shouldReadPostgres()) {
    return redis.getDailyCost(keyId)
  }

  return postgresUsageStore.getDailyCost(keyId)
}

async function getCostStats(keyId) {
  if (!shouldReadPostgres()) {
    return redis.getCostStats(keyId)
  }

  return postgresUsageStore.getCostStats(keyId)
}

async function getKeyUsageSummary(keyId, timeRange = 'all', startDate = null, endDate = null) {
  if (!shouldReadPostgres()) {
    return null
  }

  return postgresUsageStore.getKeyUsageSummary(keyId, timeRange, startDate, endDate)
}

async function getModelStatsForKey(keyId, period = 'monthly') {
  if (shouldReadPostgres()) {
    const rows = await postgresUsageStore.getModelStatsForKey(keyId, period)
    return decorateModelStats(rows)
  }

  return null
}

async function getBatchModelStats(keyIds = [], period = 'daily') {
  if (shouldReadPostgres()) {
    const rows = await postgresUsageStore.getBatchModelStats(keyIds, period)
    return decorateModelStats(rows)
  }

  return null
}

async function getAllUsedModels() {
  if (!shouldReadPostgres()) {
    return redis.getAllUsedModels()
  }

  return postgresUsageStore.getAllUsedModels()
}

async function getKeyIdsWithModels(keyIds = [], models = []) {
  if (!shouldReadPostgres()) {
    return redis.getKeyIdsWithModels(keyIds, models)
  }

  return postgresUsageStore.getKeyIdsWithModels(keyIds, models)
}

async function getBatchKeyCosts(timeRange, keyIds = []) {
  if (!shouldReadPostgres()) {
    return null
  }

  return postgresUsageStore.getBatchKeyCosts(timeRange, keyIds)
}

async function calculateCustomRangeCosts(keyIds = [], startDate, endDate) {
  if (!shouldReadPostgres()) {
    return null
  }

  return postgresUsageStore.calculateCustomRangeCosts(keyIds, startDate, endDate)
}

module.exports = {
  getWriteMode,
  getReadMode,
  shouldWriteRedis,
  shouldWritePostgres,
  shouldReadPostgres,
  recordUsageEvent,
  getUsageStats,
  getUsageStatsWithRecords,
  getDailyCost,
  getCostStats,
  getKeyUsageSummary,
  getModelStatsForKey,
  getBatchModelStats,
  getAllUsedModels,
  getKeyIdsWithModels,
  getBatchKeyCosts,
  calculateCustomRangeCosts,
  decorateModelStats
}
