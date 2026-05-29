#!/usr/bin/env node

require('dotenv').config()

const { v4: uuidv4 } = require('uuid')
const postgres = require('../src/models/postgres')
const redis = require('../src/models/redis')
const usagePostgresStore = require('../src/services/usageStores/postgresUsageStore')

function parseArgs(argv) {
  const args = {
    dryRun: false,
    reset: false,
    verifyOnly: false,
    withRollups: false,
    batchSize: 500,
    start: null,
    end: null
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') {
      args.dryRun = true
    } else if (arg === '--reset') {
      args.reset = true
    } else if (arg === '--verify-only') {
      args.verifyOnly = true
    } else if (arg === '--with-rollups') {
      args.withRollups = true
    } else if (arg === '--batch-size') {
      args.batchSize = Math.max(1, parseInt(argv[++i]) || args.batchSize)
    } else if (arg.startsWith('--batch-size=')) {
      args.batchSize = Math.max(1, parseInt(arg.split('=')[1]) || args.batchSize)
    } else if (arg === '--start') {
      args.start = argv[++i]
    } else if (arg.startsWith('--start=')) {
      args.start = arg.split('=')[1]
    } else if (arg === '--end') {
      args.end = argv[++i]
    } else if (arg.startsWith('--end=')) {
      args.end = arg.split('=')[1]
    }
  }

  return args
}

function normalizeDate(value, fallback) {
  if (!value) {
    return fallback
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date
}

function getDefaultWindow(args) {
  const now = new Date()
  const startDefault = new Date(now.getTime() - 30 * 86400000)
  return {
    start: normalizeDate(args.start, startDefault),
    end: normalizeDate(args.end, now)
  }
}

function rowToUsageEvent(row = {}) {
  return {
    eventId: row.request_id,
    requestId: row.request_id,
    timestamp: row.timestamp,
    apiKeyId: row.api_key_id,
    apiKeyName: row.api_key_name,
    accountId: row.account_id,
    accountType: row.account_type,
    model: row.model || 'unknown',
    endpoint: row.endpoint,
    method: row.method,
    statusCode: row.status_code,
    stream: row.stream === true,
    durationMs: row.duration_ms,
    inputTokens: row.input_tokens || 0,
    outputTokens: row.output_tokens || 0,
    cacheCreateTokens: row.cache_create_tokens || 0,
    cacheReadTokens: row.cache_read_tokens || 0,
    totalTokens: row.total_tokens || 0,
    cost: row.cost || 0,
    realCost: row.real_cost || row.cost || 0,
    costBreakdown: row.cost_breakdown || null,
    realCostBreakdown: row.real_cost_breakdown || row.cost_breakdown || null,
    pricingSource: row.pricing_source || null,
    usedFallbackPricing: row.used_fallback_pricing === true,
    isLongContextRequest: row.is_long_context_request === true,
    metadata: {
      source: 'request_details_backfill'
    }
  }
}

async function countSourceRows(start, end) {
  const result = await postgres.query(
    `
      SELECT COUNT(*)::int AS count
      FROM request_details d
      WHERE d.timestamp >= $1
        AND d.timestamp <= $2
        AND d.api_key_id IS NOT NULL
    `,
    [start, end]
  )
  return result.rows[0]?.count || 0
}

async function fetchBatch(start, end, limit, offset) {
  const result = await postgres.query(
    `
      SELECT
        d.request_id,
        d.timestamp,
        d.api_key_id,
        d.api_key_name,
        d.account_id,
        d.account_type,
        d.model,
        d.endpoint,
        d.method,
        d.status_code,
        d.stream,
        d.duration_ms,
        d.input_tokens,
        d.output_tokens,
        d.cache_create_tokens,
        d.cache_read_tokens,
        d.total_tokens,
        d.cost,
        d.real_cost,
        c.cost_breakdown,
        c.real_cost_breakdown,
        c.pricing_source,
        c.used_fallback_pricing,
        ctx.is_long_context_request
      FROM request_details d
      LEFT JOIN request_detail_costs c ON c.request_id = d.request_id
      LEFT JOIN request_detail_contexts ctx ON ctx.request_id = d.request_id
      WHERE d.timestamp >= $1
        AND d.timestamp <= $2
        AND d.api_key_id IS NOT NULL
      ORDER BY d.timestamp ASC, d.request_id ASC
      LIMIT $3 OFFSET $4
    `,
    [start, end, limit, offset]
  )
  return result.rows
}

function getDatesBetween(start, end) {
  const dates = []
  const cursor = new Date(start)
  cursor.setHours(12, 0, 0, 0)
  const last = new Date(end)
  last.setHours(12, 0, 0, 0)

  while (cursor <= last) {
    dates.push(redis.getDateStringInTimezone(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  return [...new Set(dates)]
}

async function loadPgCostsByKey(start, end) {
  const result = await postgres.query(
    `
      SELECT api_key_id, SUM(cost)::float AS cost, SUM(request_count)::int AS requests
      FROM usage_rollups
      WHERE period_type = 'day'
        AND dimension_type = 'api_key'
        AND model = ''
        AND period_start >= $1
        AND period_start <= $2
      GROUP BY api_key_id
    `,
    [usagePostgresStore.getPeriodStart(start, 'day'), usagePostgresStore.getPeriodStart(end, 'day')]
  )

  return new Map(result.rows.map((row) => [row.api_key_id, row]))
}

async function loadRedisCostsByKey(keyIds, dates) {
  const client = redis.getClientSafe()
  const costs = new Map(keyIds.map((keyId) => [keyId, 0]))

  for (const keyId of keyIds) {
    const pipeline = client.pipeline()
    for (const date of dates) {
      pipeline.get(`usage:cost:daily:${keyId}:${date}`)
    }
    const results = await pipeline.exec()
    let total = 0
    for (const [err, value] of results) {
      if (!err && value) {
        total += parseFloat(value) || 0
      }
    }
    costs.set(keyId, total)
  }

  return costs
}

async function verifyDiff(start, end) {
  const pgCosts = await loadPgCostsByKey(start, end)
  const dates = getDatesBetween(start, end)
  const keyIds = [...pgCosts.keys()]
  const redisCosts = await loadRedisCostsByKey(keyIds, dates)
  const diffs = []

  for (const keyId of keyIds) {
    const pgCost = Number(pgCosts.get(keyId)?.cost || 0)
    const redisCost = Number(redisCosts.get(keyId) || 0)
    const diff = pgCost - redisCost
    if (Math.abs(diff) > 0.000001) {
      diffs.push({ keyId, pgCost, redisCost, diff })
    }
  }

  diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
  console.log(
    `🔎 Verify usage cost diff: keys=${keyIds.length}, dates=${dates.length}, diffs=${diffs.length}`
  )
  for (const item of diffs.slice(0, 20)) {
    console.log(
      `  ${item.keyId}: pg=${item.pgCost.toFixed(6)}, redis=${item.redisCost.toFixed(
        6
      )}, diff=${item.diff.toFixed(6)}`
    )
  }

  return { keyCount: keyIds.length, dateCount: dates.length, diffCount: diffs.length }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { start, end } = getDefaultWindow(args)

  await usagePostgresStore.ensureSchema()
  await redis.connect()

  if (args.reset) {
    if (args.dryRun || args.verifyOnly) {
      console.log('ℹ️ --reset ignored in dry-run/verify-only mode')
    } else {
      await usagePostgresStore.resetSchema()
      console.log('✅ usage PostgreSQL schema reset completed')
    }
  }

  if (args.verifyOnly) {
    await verifyDiff(start, end)
    return
  }

  const total = await countSourceRows(start, end)
  console.log(
    `🚚 Backfill usage from request_details: ${start.toISOString()} -> ${end.toISOString()}, rows=${total}, batchSize=${args.batchSize}, dryRun=${args.dryRun}, withRollups=${args.withRollups}`
  )

  if (args.dryRun) {
    await verifyDiff(start, end)
    return
  }

  const runId = await usagePostgresStore.recordBackfillRunStart({
    runId: `usage_backfill_${uuidv4()}`,
    source: 'request_details'
  })

  const stats = { total, inserted: 0, skipped: 0, badRows: 0 }

  try {
    for (let offset = 0; offset < total; offset += args.batchSize) {
      const rows = await fetchBatch(start, end, args.batchSize, offset)
      const events = rows.map(rowToUsageEvent).filter((event) => {
        if (!event.apiKeyId || !event.requestId) {
          stats.badRows++
          return false
        }
        return true
      })
      const result = args.withRollups
        ? await usagePostgresStore.upsertUsageEvents(events)
        : await usagePostgresStore.insertUsageEventsOnly(events)
      stats.inserted += result.inserted || 0
      stats.skipped += result.skipped || 0
      console.log(
        `  progress ${Math.min(offset + rows.length, total)}/${total}, inserted=${
          stats.inserted
        }, skipped=${stats.skipped}, badRows=${stats.badRows}`
      )
    }

    const verify = await verifyDiff(start, end)
    stats.verify = verify
    await usagePostgresStore.recordBackfillRunComplete(runId, stats)
    console.log('✅ usage PostgreSQL backfill completed')
  } catch (error) {
    await usagePostgresStore.recordBackfillRunFailed(runId, error, stats).catch(() => {})
    throw error
  }
}

main()
  .catch((error) => {
    console.error(`❌ usage PostgreSQL backfill failed: ${error.message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await postgres.close().catch(() => {})
    if (typeof redis.disconnect === 'function') {
      await redis.disconnect().catch(() => {})
    }
  })
