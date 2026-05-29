#!/usr/bin/env node

require('dotenv').config()

const { v4: uuidv4 } = require('uuid')
const config = require('../config/config')
const postgres = require('../src/models/postgres')
const redis = require('../src/models/redis')
const usagePostgresStore = require('../src/services/usageStores/postgresUsageStore')

const SOURCE_TYPE = 'redis_baseline'
const BATCH_SIZE_DEFAULT = 500

function parseArgs(argv) {
  const args = {
    dryRun: false,
    resetBaseline: false,
    resetEventRollups: false,
    batchSize: BATCH_SIZE_DEFAULT
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') {
      args.dryRun = true
    } else if (arg === '--reset-baseline') {
      args.resetBaseline = true
    } else if (arg === '--reset-event-rollups') {
      args.resetEventRollups = true
    } else if (arg === '--batch-size') {
      args.batchSize = Math.max(1, parseInt(argv[++index]) || args.batchSize)
    } else if (arg.startsWith('--batch-size=')) {
      args.batchSize = Math.max(1, parseInt(arg.split('=')[1]) || args.batchSize)
    }
  }

  return args
}

function normalizeNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function normalizeInteger(value, fallback = 0) {
  return Math.trunc(normalizeNumber(value, fallback))
}

function metric(data, ...names) {
  for (const name of names) {
    if (data[name] !== undefined && data[name] !== '') {
      return data[name]
    }
  }
  return 0
}

function microToCost(value) {
  return normalizeNumber(value) / 1000000
}

function localDateToUtc(dateStr, hour = 0) {
  const [year, month, day] = dateStr.split('-').map((part) => parseInt(part, 10))
  const offsetMs = (config.system?.timezoneOffset || 8) * 3600000
  return new Date(Date.UTC(year, month - 1, day, hour) - offsetMs)
}

function localMonthToUtc(monthStr) {
  return localDateToUtc(`${monthStr}-01`)
}

function allPeriodStart() {
  return new Date(Date.UTC(1970, 0, 1))
}

function rowFromUsageHash({
  data,
  periodType,
  periodStart,
  dimensionType,
  apiKeyId = '',
  model = ''
}) {
  const inputTokens = normalizeInteger(metric(data, 'inputTokens', 'totalInputTokens'))
  const outputTokens = normalizeInteger(metric(data, 'outputTokens', 'totalOutputTokens'))
  const cacheCreateTokens = normalizeInteger(
    metric(data, 'cacheCreateTokens', 'totalCacheCreateTokens')
  )
  const cacheReadTokens = normalizeInteger(metric(data, 'cacheReadTokens', 'totalCacheReadTokens'))
  const ephemeral5mTokens = normalizeInteger(
    metric(data, 'ephemeral5mTokens', 'totalEphemeral5mTokens')
  )
  const ephemeral1hTokens = normalizeInteger(
    metric(data, 'ephemeral1hTokens', 'totalEphemeral1hTokens')
  )
  const totalTokens =
    normalizeInteger(metric(data, 'allTokens', 'totalAllTokens')) ||
    inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens ||
    normalizeInteger(metric(data, 'tokens', 'totalTokens'))

  return {
    sourceType: SOURCE_TYPE,
    periodType,
    periodStart,
    dimensionType,
    apiKeyId,
    model,
    requestCount: normalizeInteger(metric(data, 'requests', 'totalRequests')),
    inputTokens,
    outputTokens,
    cacheCreateTokens,
    cacheReadTokens,
    ephemeral5mTokens,
    ephemeral1hTokens,
    totalTokens,
    cost: microToCost(metric(data, 'ratedCostMicro')),
    realCost: microToCost(metric(data, 'realCostMicro')),
    longContextRequests: normalizeInteger(
      metric(data, 'longContextRequests', 'totalLongContextRequests')
    )
  }
}

function parseUsageKey(key) {
  let match = key.match(/^usage:daily:([^:]+):(\d{4}-\d{2}-\d{2})$/)
  if (match) {
    return {
      periodType: 'day',
      periodStart: localDateToUtc(match[2]),
      dimensionType: 'api_key',
      apiKeyId: match[1],
      model: '',
      costKeys: [`usage:cost:daily:${match[1]}:${match[2]}`],
      realCostKeys: [`usage:cost:real:daily:${match[1]}:${match[2]}`]
    }
  }

  match = key.match(/^usage:monthly:([^:]+):(\d{4}-\d{2})$/)
  if (match) {
    return {
      periodType: 'month',
      periodStart: localMonthToUtc(match[2]),
      dimensionType: 'api_key',
      apiKeyId: match[1],
      model: '',
      costKeys: [`usage:cost:monthly:${match[1]}:${match[2]}`]
    }
  }

  match = key.match(/^usage:hourly:([^:]+):(\d{4}-\d{2}-\d{2}):(\d{2})$/)
  if (match) {
    return {
      periodType: 'hour',
      periodStart: localDateToUtc(match[2], parseInt(match[3], 10)),
      dimensionType: 'api_key',
      apiKeyId: match[1],
      model: '',
      costKeys: [`usage:cost:hourly:${match[1]}:${match[2]}:${match[3]}`]
    }
  }

  match = key.match(/^usage:([^:]+)$/)
  if (match && !['global', 'model', 'cost', 'daily', 'monthly', 'hourly'].includes(match[1])) {
    return {
      periodType: 'all',
      periodStart: allPeriodStart(),
      dimensionType: 'api_key',
      apiKeyId: match[1],
      model: '',
      costKeys: [`usage:cost:total:${match[1]}`],
      realCostKeys: [`usage:cost:real:total:${match[1]}`]
    }
  }

  match = key.match(/^usage:global:daily:(\d{4}-\d{2}-\d{2})$/)
  if (match) {
    return {
      periodType: 'day',
      periodStart: localDateToUtc(match[1]),
      dimensionType: 'global',
      apiKeyId: '',
      model: ''
    }
  }

  match = key.match(/^usage:global:monthly:(\d{4}-\d{2})$/)
  if (match) {
    return {
      periodType: 'month',
      periodStart: localMonthToUtc(match[1]),
      dimensionType: 'global',
      apiKeyId: '',
      model: ''
    }
  }

  if (key === 'usage:global:total') {
    return {
      periodType: 'all',
      periodStart: allPeriodStart(),
      dimensionType: 'global',
      apiKeyId: '',
      model: ''
    }
  }

  match = key.match(/^usage:model:daily:(.+):(\d{4}-\d{2}-\d{2})$/)
  if (match) {
    return {
      periodType: 'day',
      periodStart: localDateToUtc(match[2]),
      dimensionType: 'model',
      apiKeyId: '',
      model: match[1]
    }
  }

  match = key.match(/^usage:model:monthly:(.+):(\d{4}-\d{2})$/)
  if (match) {
    return {
      periodType: 'month',
      periodStart: localMonthToUtc(match[2]),
      dimensionType: 'model',
      apiKeyId: '',
      model: match[1]
    }
  }

  match = key.match(/^usage:model:hourly:(.+):(\d{4}-\d{2}-\d{2}):(\d{2})$/)
  if (match) {
    return {
      periodType: 'hour',
      periodStart: localDateToUtc(match[2], parseInt(match[3], 10)),
      dimensionType: 'model',
      apiKeyId: '',
      model: match[1]
    }
  }

  match = key.match(/^usage:([^:]+):model:daily:(.+):(\d{4}-\d{2}-\d{2})$/)
  if (match) {
    return {
      periodType: 'day',
      periodStart: localDateToUtc(match[3]),
      dimensionType: 'api_key_model',
      apiKeyId: match[1],
      model: match[2]
    }
  }

  match = key.match(/^usage:([^:]+):model:monthly:(.+):(\d{4}-\d{2})$/)
  if (match) {
    return {
      periodType: 'month',
      periodStart: localMonthToUtc(match[3]),
      dimensionType: 'api_key_model',
      apiKeyId: match[1],
      model: match[2]
    }
  }

  match = key.match(/^usage:([^:]+):model:hourly:(.+):(\d{4}-\d{2}-\d{2}):(\d{2})$/)
  if (match) {
    return {
      periodType: 'hour',
      periodStart: localDateToUtc(match[3], parseInt(match[4], 10)),
      dimensionType: 'api_key_model',
      apiKeyId: match[1],
      model: match[2]
    }
  }

  match = key.match(/^usage:([^:]+):model:alltime:(.+)$/)
  if (match) {
    return {
      periodType: 'all',
      periodStart: allPeriodStart(),
      dimensionType: 'api_key_model',
      apiKeyId: match[1],
      model: match[2]
    }
  }

  return null
}

function shouldSkipUsageKey(key) {
  return (
    key.includes(':index:') ||
    key.endsWith(':empty') ||
    key === 'usage:model:monthly:months' ||
    key.startsWith('usage:cost:')
  )
}

async function scanUsageKeys(client, visitor) {
  let cursor = '0'
  do {
    const [nextCursor, keys] = await client.scan(cursor, 'MATCH', 'usage:*', 'COUNT', 1000)
    cursor = nextCursor
    const filteredKeys = keys.filter((key) => !shouldSkipUsageKey(key) && parseUsageKey(key))
    if (filteredKeys.length > 0) {
      await visitor(filteredKeys)
    }
  } while (cursor !== '0')
}

async function applyCostKeys(client, rows, parsedByKey) {
  const costLookups = []
  for (const [index, parsed] of parsedByKey.entries()) {
    for (const key of parsed.costKeys || []) {
      costLookups.push({ index, key, type: 'cost' })
    }
    for (const key of parsed.realCostKeys || []) {
      costLookups.push({ index, key, type: 'realCost' })
    }
  }

  if (costLookups.length === 0) {
    return
  }

  const pipeline = client.pipeline()
  costLookups.forEach((lookup) => pipeline.get(lookup.key))
  const results = await pipeline.exec()

  results.forEach(([error, value], resultIndex) => {
    if (error || value === null || value === undefined) {
      return
    }
    const lookup = costLookups[resultIndex]
    rows[lookup.index][lookup.type] = normalizeNumber(value)
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  await usagePostgresStore.ensureSchema()
  await redis.connect()

  const client = redis.getClientSafe()
  const runId = `usage_redis_baseline_${uuidv4()}`
  const stats = {
    scannedKeys: 0,
    parsedRows: 0,
    upsertedRows: 0,
    skippedKeys: 0,
    dryRun: args.dryRun,
    resetBaseline: args.resetBaseline,
    resetEventRollups: args.resetEventRollups
  }

  if (args.resetBaseline && !args.dryRun) {
    const result = await postgres.query('DELETE FROM usage_rollups WHERE source_type = $1', [
      SOURCE_TYPE
    ])
    console.log(`🧹 Removed existing Redis baseline rows: ${result.rowCount}`)
  }

  if (args.resetEventRollups && !args.dryRun) {
    const result = await postgres.query("DELETE FROM usage_rollups WHERE source_type = 'event'")
    console.log(`🧹 Removed existing event rollup rows: ${result.rowCount}`)
  }

  if (!args.dryRun) {
    await usagePostgresStore.recordBackfillRunStart({ runId, source: SOURCE_TYPE })
  }

  try {
    await scanUsageKeys(client, async (keys) => {
      stats.scannedKeys += keys.length
      const pipeline = client.pipeline()
      keys.forEach((key) => pipeline.hgetall(key))
      const results = await pipeline.exec()
      const rows = []
      const parsedByRowIndex = new Map()

      results.forEach(([error, data], index) => {
        const parsed = parseUsageKey(keys[index])
        if (error || !parsed || !data || Object.keys(data).length === 0) {
          stats.skippedKeys += 1
          return
        }

        parsedByRowIndex.set(rows.length, parsed)
        rows.push(rowFromUsageHash({ data, ...parsed }))
      })

      await applyCostKeys(client, rows, parsedByRowIndex)
      stats.parsedRows += rows.length

      if (!args.dryRun && rows.length > 0) {
        const result = await usagePostgresStore.upsertRollupRows(rows, { sourceType: SOURCE_TYPE })
        stats.upsertedRows += result.upserted || 0
      }

      if (stats.scannedKeys % (args.batchSize * 10) < keys.length) {
        console.log(
          `  progress scanned=${stats.scannedKeys}, parsedRows=${stats.parsedRows}, upsertedRows=${stats.upsertedRows}`
        )
      }
    })

    if (!args.dryRun) {
      await usagePostgresStore.recordBackfillRunComplete(runId, stats)
    }

    console.log(
      `✅ Redis usage baseline import completed: scanned=${stats.scannedKeys}, parsedRows=${stats.parsedRows}, upsertedRows=${stats.upsertedRows}, dryRun=${args.dryRun}`
    )
  } catch (error) {
    if (!args.dryRun) {
      await usagePostgresStore.recordBackfillRunFailed(runId, error, stats).catch(() => {})
    }
    throw error
  }
}

main()
  .catch((error) => {
    console.error(`❌ Redis usage baseline import failed: ${error.message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await postgres.close().catch(() => {})
    if (typeof redis.disconnect === 'function') {
      await redis.disconnect().catch(() => {})
    }
  })
