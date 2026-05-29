#!/usr/bin/env node

require('dotenv').config()

const redis = require('../src/models/redis')
const postgres = require('../src/models/postgres')
const requestDetailPostgresStore = require('../src/services/requestDetailStores/postgresRequestDetailStore')

const REQUEST_DETAIL_ITEM_PREFIX = 'request_detail:item:'
const REQUEST_DETAIL_DAY_INDEX_PREFIX = 'request_detail:index:day:'
const DEFAULT_DAYS = 30
const DEFAULT_BATCH_SIZE = 500

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    days: DEFAULT_DAYS,
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    startDate: null,
    endDate: null,
    limit: null,
    skipSchema: false
  }

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (arg === '--skip-schema') {
      options.skipSchema = true
      continue
    }

    const [rawKey, rawValue] = arg.split('=')
    const key = rawKey.replace(/^--/, '')
    const value = rawValue === undefined ? true : rawValue

    if (key === 'days') {
      options.days = Math.max(1, Number.parseInt(value, 10) || DEFAULT_DAYS)
    } else if (key === 'batch-size') {
      options.batchSize = Math.max(1, Number.parseInt(value, 10) || DEFAULT_BATCH_SIZE)
    } else if (key === 'start-date') {
      options.startDate = new Date(value)
    } else if (key === 'end-date') {
      options.endDate = new Date(value)
    } else if (key === 'limit') {
      options.limit = Math.max(1, Number.parseInt(value, 10) || 0) || null
    }
  }

  const now = new Date()
  options.endDate = options.endDate || now
  options.startDate =
    options.startDate || new Date(options.endDate.getTime() - options.days * 86400 * 1000)

  if (Number.isNaN(options.startDate.getTime()) || Number.isNaN(options.endDate.getTime())) {
    throw new Error('Invalid --start-date or --end-date')
  }
  if (options.startDate > options.endDate) {
    throw new Error('--start-date must be before or equal to --end-date')
  }

  return options
}

function formatDayKey(date) {
  return date.toISOString().slice(0, 10)
}

function listDayKeys(startDate, endDate) {
  const keys = []
  const cursor = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
  )
  const endCursor = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate())
  )

  while (cursor <= endCursor) {
    keys.push(`${REQUEST_DETAIL_DAY_INDEX_PREFIX}${formatDayKey(cursor)}`)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return keys
}

function parseRedisRecord(rawItem, pointer) {
  if (!rawItem) {
    return { missing: true, record: null }
  }

  try {
    const record = JSON.parse(rawItem)
    if (!record.requestId) {
      record.requestId = pointer.requestId
    }
    if (!record.timestamp || Number.isNaN(new Date(record.timestamp).getTime())) {
      record.timestamp = new Date(pointer.timestampMs).toISOString()
    }
    return { missing: false, badJson: false, record }
  } catch (error) {
    return { missing: false, badJson: true, error, record: null }
  }
}

async function loadPointers(client, options) {
  const startMs = options.startDate.getTime()
  const endMs = options.endDate.getTime()
  const pointersByRequestId = new Map()
  let scannedPointers = 0
  let duplicatePointers = 0

  for (const dayKey of listDayKeys(options.startDate, options.endDate)) {
    const entries = await client.zrangebyscore(dayKey, startMs, endMs, 'WITHSCORES')
    if (!Array.isArray(entries) || entries.length === 0) {
      continue
    }

    for (let index = 0; index < entries.length; index += 2) {
      const requestId = entries[index]
      const timestampMs = Number(entries[index + 1])
      if (!requestId || !Number.isFinite(timestampMs)) {
        continue
      }

      scannedPointers += 1
      if (pointersByRequestId.has(requestId)) {
        duplicatePointers += 1
      }
      pointersByRequestId.set(requestId, { requestId, timestampMs })
    }
  }

  let pointers = Array.from(pointersByRequestId.values()).sort(
    (left, right) => left.timestampMs - right.timestampMs
  )
  if (options.limit) {
    pointers = pointers.slice(0, options.limit)
  }

  return {
    pointers,
    scannedPointers,
    duplicatePointers
  }
}

function recordPgError(stats, record, error) {
  stats.pgErrors += 1
  if (stats.pgErrorSamples.length < 10) {
    stats.pgErrorSamples.push({
      requestId: record?.requestId || null,
      message: error.message
    })
  }
}

async function upsertRecordsWithFallback(records, stats) {
  if (records.length === 0) {
    return 0
  }

  try {
    const result = await requestDetailPostgresStore.upsertRequestDetails(records)
    return result.upserted
  } catch (error) {
    if (records.length === 1) {
      recordPgError(stats, records[0], error)
      console.warn(
        `⚠️ Skipped request detail ${records[0]?.requestId || 'unknown'}: ${error.message}`
      )
      return 0
    }

    const midpoint = Math.ceil(records.length / 2)
    const left = await upsertRecordsWithFallback(records.slice(0, midpoint), stats)
    const right = await upsertRecordsWithFallback(records.slice(midpoint), stats)
    return left + right
  }
}

async function backfill(options) {
  await redis.connect()
  const client = redis.getClient()
  if (!client) {
    throw new Error('Redis client is unavailable')
  }

  if (!options.dryRun && !options.skipSchema) {
    await requestDetailPostgresStore.ensureSchema()
  }

  console.log(
    `🔎 Backfill window ${options.startDate.toISOString()} → ${options.endDate.toISOString()}`
  )

  const pointerResult = await loadPointers(client, options)
  const stats = {
    scannedPointers: pointerResult.scannedPointers,
    duplicatePointers: pointerResult.duplicatePointers,
    uniquePointers: pointerResult.pointers.length,
    missingItems: 0,
    badJson: 0,
    recordsReady: 0,
    upserted: 0,
    pgErrors: 0,
    pgErrorSamples: []
  }

  console.log(
    `📌 Found ${stats.uniquePointers} unique request detail pointer(s) from ${stats.scannedPointers} index entries`
  )

  for (let index = 0; index < pointerResult.pointers.length; index += options.batchSize) {
    const pointerBatch = pointerResult.pointers.slice(index, index + options.batchSize)
    const keys = pointerBatch.map((pointer) => `${REQUEST_DETAIL_ITEM_PREFIX}${pointer.requestId}`)
    const rawItems = await client.mget(keys)
    const records = []

    rawItems.forEach((rawItem, itemIndex) => {
      const parsed = parseRedisRecord(rawItem, pointerBatch[itemIndex])
      if (parsed.missing) {
        stats.missingItems += 1
        return
      }
      if (parsed.badJson) {
        stats.badJson += 1
        return
      }
      records.push(parsed.record)
    })

    stats.recordsReady += records.length

    if (!options.dryRun && records.length > 0) {
      stats.upserted += await upsertRecordsWithFallback(records, stats)
    }

    const processed = Math.min(index + pointerBatch.length, pointerResult.pointers.length)
    console.log(
      `⏳ Progress ${processed}/${pointerResult.pointers.length}: ready=${stats.recordsReady}, upserted=${stats.upserted}, missing=${stats.missingItems}, badJson=${stats.badJson}`
    )
  }

  return stats
}

async function main() {
  const options = parseArgs()
  try {
    const stats = await backfill(options)
    console.log(options.dryRun ? '📝 Dry run completed' : '✅ Backfill completed')
    console.log(JSON.stringify(stats, null, 2))
  } finally {
    await redis.disconnect()
    await postgres.close()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`❌ Request detail backfill failed: ${error.message}`)
    process.exit(1)
  })
}

module.exports = {
  parseArgs,
  listDayKeys,
  parseRedisRecord,
  loadPointers,
  backfill
}
