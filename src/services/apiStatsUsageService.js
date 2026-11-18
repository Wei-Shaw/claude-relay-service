const apiKeyService = require('./apiKeyService')
const redis = require('../models/redis')
const config = require('../../config/config')

const MAX_RECORDS = 5000
const MAX_PAGE_SIZE = 50
const PERIOD_DAYS = {
  day: 1,
  week: 7,
  month: 30,
  quarter: 90
}

function toFiniteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function toTokenCount(value) {
  return Math.max(0, Math.trunc(toFiniteNumber(value)))
}

function roundCost(value) {
  return Number(Math.max(0, toFiniteNumber(value)).toFixed(6))
}

function normalizePeriod(period) {
  return Object.prototype.hasOwnProperty.call(PERIOD_DAYS, period) ? period : 'week'
}

function getRecordTimestamp(record = {}) {
  const value = record.completedAt || record.endedAt || record.timestamp || record.startedAt
  const timestamp = value ? new Date(value) : null
  return timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp : null
}

function getDateKey(date) {
  const offset = config.system?.timezoneOffset || 8
  return new Date(date.getTime() + offset * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function createDailyBuckets(startDate, now) {
  const offset = config.system?.timezoneOffset || 8
  const offsetMs = offset * 60 * 60 * 1000
  const cursor = new Date(startDate.getTime() + offsetMs)
  const lastDay = new Date(now.getTime() + offsetMs)
  const buckets = new Map()
  cursor.setUTCHours(0, 0, 0, 0)
  lastDay.setUTCHours(0, 0, 0, 0)

  while (cursor <= lastDay) {
    const date = cursor.toISOString().slice(0, 10)
    buckets.set(date, { date, requests: 0, cost: 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return buckets
}

function normalizeOutcome(record = {}) {
  const statusCode = toFiniteNumber(record.statusCode)
  const status = String(record.usageStatus || record.lifecycleStatus || '').toLowerCase()

  if (
    statusCode >= 400 ||
    ['failed', 'error', 'aborted', 'cancelled', 'timeout', 'incomplete', 'stream_error'].includes(
      status
    )
  ) {
    return 'failed'
  }
  if (['completed_without_usage', 'record_failed'].includes(status)) {
    return 'unavailable'
  }
  if (status === 'completed') {
    return 'completed'
  }
  if (record.isUsageFinal === true) {
    return 'unavailable'
  }
  return 'pending'
}

function getCostComponents(record = {}) {
  const source = record.costBreakdown || record.realCostBreakdown || {}
  return {
    input: Math.max(0, toFiniteNumber(source.input)),
    output: Math.max(0, toFiniteNumber(source.output)),
    cacheCreate: Math.max(0, toFiniteNumber(source.cacheCreate || source.cacheWrite)),
    cacheRead: Math.max(0, toFiniteNumber(source.cacheRead))
  }
}

function buildBillingBreakdown(record = {}) {
  const totalCost = roundCost(record.cost)
  const components = getCostComponents(record)
  const componentTotal = Object.values(components).reduce((sum, value) => sum + value, 0)
  const scale = componentTotal > 0 ? totalCost / componentTotal : 0
  const definitions = [
    ['input', '输入 Token', toTokenCount(record.inputTokens)],
    ['output', '输出 Token', toTokenCount(record.outputTokens)],
    ['cacheCreate', '缓存写入', toTokenCount(record.cacheCreateTokens)],
    ['cacheRead', '缓存读取', toTokenCount(record.cacheReadTokens)]
  ]
  const items = definitions
    .filter(([key, , tokens]) => tokens > 0 || components[key] > 0)
    .map(([key, label, tokens]) => {
      const cost = roundCost(components[key] * scale)
      return {
        type: key,
        label,
        tokens,
        cost,
        ratePerMillion: tokens > 0 ? roundCost((cost / tokens) * 1000000) : 0
      }
    })

  const allocatedCost = roundCost(items.reduce((sum, item) => sum + item.cost, 0))
  const roundingDifference = Number((totalCost - allocatedCost).toFixed(6))
  if (componentTotal > 0 && items.length > 0 && roundingDifference !== 0) {
    const target = items.reduce((largest, item) => (item.cost > largest.cost ? item : largest))
    target.cost = roundCost(target.cost + roundingDifference)
    target.ratePerMillion =
      target.tokens > 0 ? roundCost((target.cost / target.tokens) * 1000000) : 0
  } else if (roundingDifference > 0) {
    items.push({
      type: 'adjustment',
      label: '计费调整',
      tokens: 0,
      cost: roundingDifference,
      ratePerMillion: 0
    })
  }

  return { total: totalCost, items }
}

function createSafeRecord(record, keyData) {
  const timestamp = getRecordTimestamp(record)
  const input = toTokenCount(record.inputTokens)
  const output = toTokenCount(record.outputTokens)
  const cacheCreate = toTokenCount(record.cacheCreateTokens)
  const cacheRead = toTokenCount(record.cacheReadTokens)
  const total = toTokenCount(record.totalTokens) || input + output + cacheCreate + cacheRead
  const outcome = normalizeOutcome(record)

  return {
    timestamp: timestamp?.toISOString() || null,
    model: record.displayModel || record.actualModel || record.model || 'unknown',
    apiKeyName: keyData.name || '未命名密钥',
    tokens: { input, output, cacheCreate, cacheRead, total },
    cost: roundCost(record.cost),
    billing: buildBillingBreakdown(record),
    outcome,
    outcomeLabel:
      outcome === 'completed'
        ? '请求成功'
        : outcome === 'failed'
          ? '请求失败'
          : outcome === 'unavailable'
            ? '用量未确认'
            : '处理中'
  }
}

function parsePageOptions(options = {}) {
  const pageSize = Math.min(Math.max(Number.parseInt(options.pageSize, 10) || 20, 1), MAX_PAGE_SIZE)
  return {
    page: Math.max(Number.parseInt(options.page, 10) || 1, 1),
    pageSize
  }
}

class ApiStatsUsageService {
  async getUsageWorkspace(options = {}) {
    const apiKey = typeof options.apiKey === 'string' ? options.apiKey.trim() : ''
    if (!apiKey || apiKey.length < 10 || apiKey.length > 512) {
      const error = new Error('请提供有效的 API Key')
      error.statusCode = 400
      throw error
    }

    const validation = await apiKeyService.validateApiKeyForStats(apiKey)
    if (!validation.valid) {
      const error = new Error(validation.error || 'API Key 无效')
      error.statusCode = 401
      throw error
    }

    const { keyData } = validation
    const period = normalizePeriod(options.period)
    const now = new Date()
    const startDate = new Date(now.getTime() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000)
    const rawRecords = await redis.getUsageRecords(keyData.id, MAX_RECORDS)
    const records = []

    for (const record of rawRecords) {
      const timestamp = getRecordTimestamp(record)
      if (!timestamp || timestamp < startDate || timestamp > now) {
        continue
      }
      records.push(createSafeRecord(record, keyData))
    }
    records.sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))

    const dailyBuckets = createDailyBuckets(startDate, now)
    const modelMap = new Map()
    const summary = {
      totalRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheTokens: 0,
      totalTokens: 0,
      totalCost: 0
    }

    for (const record of records) {
      summary.totalRequests += 1
      summary.totalInputTokens += record.tokens.input
      summary.totalOutputTokens += record.tokens.output
      summary.totalCacheTokens += record.tokens.cacheCreate + record.tokens.cacheRead
      summary.totalTokens += record.tokens.total
      summary.totalCost += record.cost
      if (record.outcome === 'completed') {
        summary.completedRequests += 1
      }
      if (record.outcome === 'failed') {
        summary.failedRequests += 1
      }

      const day = dailyBuckets.get(getDateKey(new Date(record.timestamp)))
      if (day) {
        day.requests += 1
        day.cost += record.cost
      }

      const model = modelMap.get(record.model) || {
        name: record.model,
        requests: 0,
        tokens: 0,
        cost: 0
      }
      model.requests += 1
      model.tokens += record.tokens.total
      model.cost += record.cost
      modelMap.set(record.model, model)
    }

    summary.totalCost = roundCost(summary.totalCost)
    for (const day of dailyBuckets.values()) {
      day.cost = roundCost(day.cost)
    }
    for (const model of modelMap.values()) {
      model.cost = roundCost(model.cost)
    }

    const model = typeof options.model === 'string' ? options.model.trim() : ''
    const outcome = ['completed', 'failed', 'unavailable', 'pending'].includes(options.outcome)
      ? options.outcome
      : ''
    const filteredRecords = records.filter(
      (record) => (!model || record.model === model) && (!outcome || record.outcome === outcome)
    )
    const { page, pageSize } = parsePageOptions(options)
    const totalRecords = filteredRecords.length
    const totalPages = totalRecords > 0 ? Math.ceil(totalRecords / pageSize) : 0
    const currentPage = totalPages > 0 ? Math.min(page, totalPages) : 1
    const startIndex = (currentPage - 1) * pageSize
    const isPartial =
      rawRecords.length >= MAX_RECORDS &&
      Boolean(getRecordTimestamp(rawRecords[rawRecords.length - 1]) >= startDate)

    return {
      period,
      range: { start: startDate.toISOString(), end: now.toISOString() },
      recordRetentionDays: PERIOD_DAYS.quarter,
      isPartial,
      lastRequestAt: records[0]?.timestamp || keyData.lastUsedAt || null,
      averageRequestCost:
        summary.totalRequests > 0 ? roundCost(summary.totalCost / summary.totalRequests) : 0,
      ...summary,
      dailyStats: Array.from(dailyBuckets.values()),
      modelStats: Array.from(modelMap.values()).sort((left, right) => right.cost - left.cost),
      keyStats: [
        {
          name: keyData.name || '未命名密钥',
          isActive: true,
          lastUsedAt: records[0]?.timestamp || null,
          expiresAt: keyData.expiresAt || null,
          dailyCost: roundCost(keyData.dailyCost),
          dailyCostLimit: roundCost(keyData.dailyCostLimit),
          totalCost: roundCost(keyData.totalCost),
          totalCostLimit: roundCost(keyData.totalCostLimit),
          requests: summary.totalRequests,
          periodCost: summary.totalCost
        }
      ],
      records: filteredRecords.slice(startIndex, startIndex + pageSize),
      pagination: {
        currentPage,
        pageSize,
        totalRecords,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1
      },
      availableFilters: {
        models: Array.from(new Set(records.map((record) => record.model))).sort()
      }
    }
  }
}

module.exports = new ApiStatsUsageService()
module.exports.createSafeRecord = createSafeRecord
