const redis = require('../models/redis')
const logger = require('./logger')

const MINUTE_MS = 60 * 1000
const FALLBACK_RETENTION_BUFFER_SECONDS = 24 * 60 * 60
const SLIDING_BUCKET_KEY_PREFIX = 'rate_limit:sliding:buckets:'

function toInt(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundCost(value) {
  return Math.round(toNumber(value) * 1e6) / 1e6
}

function getWindowDurationMs(windowMinutes) {
  return Math.max(0, toInt(windowMinutes)) * MINUTE_MS
}

function getBucketKey(keyId) {
  return `${SLIDING_BUCKET_KEY_PREFIX}${keyId}`
}

function getLegacyKeys(keyId) {
  return {
    requestCountKey: `rate_limit:requests:${keyId}`,
    tokenCountKey: `rate_limit:tokens:${keyId}`,
    costCountKey: `rate_limit:cost:${keyId}`,
    windowStartKey: `rate_limit:window_start:${keyId}`
  }
}

function getBucketId(timestampMs = Date.now()) {
  return Math.floor(toNumber(timestampMs) / MINUTE_MS)
}

function getBucketTimestamp(bucketId) {
  return toInt(bucketId) * MINUTE_MS
}

function parseBucketValue(rawValue) {
  if (!rawValue) {
    return { requests: 0, tokens: 0, cost: 0 }
  }

  const [requestsRaw = '0', tokensRaw = '0', costRaw = '0'] = String(rawValue).split('|')

  return {
    requests: Math.max(0, toInt(requestsRaw)),
    tokens: Math.max(0, toInt(tokensRaw)),
    cost: Math.max(0, roundCost(costRaw))
  }
}

function serializeBucketValue(bucketValue) {
  return [
    Math.max(0, toInt(bucketValue.requests)),
    Math.max(0, toInt(bucketValue.tokens)),
    Math.max(0, roundCost(bucketValue.cost))
  ].join('|')
}

function createEmptySnapshot() {
  return {
    requests: 0,
    tokens: 0,
    cost: 0,
    hasActiveWindow: false,
    windowStartTime: null,
    windowEndTime: null,
    windowRemainingSeconds: null,
    staleFields: []
  }
}

function buildSnapshotFromBuckets(rawBuckets, windowMinutes, now = Date.now()) {
  const windowDurationMs = getWindowDurationMs(windowMinutes)
  if (windowDurationMs <= 0) {
    return createEmptySnapshot()
  }

  const snapshot = createEmptySnapshot()
  const normalizedNow = toNumber(now) || Date.now()
  const minIncludedBucketId = Math.floor((normalizedNow - windowDurationMs) / MINUTE_MS)
  let oldestActiveBucketId = null

  for (const [bucketIdRaw, bucketValueRaw] of Object.entries(rawBuckets || {})) {
    const bucketId = toInt(bucketIdRaw)
    if (!Number.isFinite(bucketId) || bucketId <= 0) {
      snapshot.staleFields.push(bucketIdRaw)
      continue
    }

    if (bucketId < minIncludedBucketId) {
      snapshot.staleFields.push(bucketIdRaw)
      continue
    }

    const bucketValue = parseBucketValue(bucketValueRaw)
    if (bucketValue.requests <= 0 && bucketValue.tokens <= 0 && bucketValue.cost <= 0) {
      snapshot.staleFields.push(bucketIdRaw)
      continue
    }

    snapshot.requests += bucketValue.requests
    snapshot.tokens += bucketValue.tokens
    snapshot.cost = roundCost(snapshot.cost + bucketValue.cost)

    if (oldestActiveBucketId === null || bucketId < oldestActiveBucketId) {
      oldestActiveBucketId = bucketId
    }
  }

  if (oldestActiveBucketId === null) {
    return snapshot
  }

  snapshot.hasActiveWindow = true
  snapshot.windowStartTime = getBucketTimestamp(oldestActiveBucketId)
  snapshot.windowEndTime = getBucketTimestamp(oldestActiveBucketId + 1) + windowDurationMs
  snapshot.windowRemainingSeconds = Math.max(
    0,
    Math.ceil((snapshot.windowEndTime - normalizedNow) / 1000)
  )

  return snapshot
}

function getBucketRetentionSeconds(windowMinutes) {
  const windowDurationSeconds = Math.ceil(getWindowDurationMs(windowMinutes) / 1000)
  return Math.max(windowDurationSeconds + FALLBACK_RETENTION_BUFFER_SECONDS, 3600)
}

async function pruneBucketFields(client, bucketKey, staleFields) {
  if (!client || !bucketKey || !Array.isArray(staleFields) || staleFields.length === 0) {
    return
  }

  try {
    await client.hdel(bucketKey, ...staleFields)
  } catch (error) {
    logger.debug(`Failed to prune stale sliding-window fields for ${bucketKey}: ${error.message}`)
  }
}

async function getLegacyWindowSnapshot(keyId, windowMinutes, options = {}) {
  const windowDurationMs = getWindowDurationMs(windowMinutes)
  if (!keyId || windowDurationMs <= 0) {
    return createEmptySnapshot()
  }

  const client = options.client || redis.getClientSafe()
  if (!client) {
    return createEmptySnapshot()
  }

  const now = toNumber(options.now) || Date.now()
  const { requestCountKey, tokenCountKey, costCountKey, windowStartKey } = getLegacyKeys(keyId)

  const [requestCountRaw, tokenCountRaw, costCountRaw, windowStartRaw] = await Promise.all([
    client.get(requestCountKey),
    client.get(tokenCountKey),
    client.get(costCountKey),
    client.get(windowStartKey)
  ])

  const windowStartTime = toInt(windowStartRaw)
  if (!windowStartTime || now >= windowStartTime + windowDurationMs) {
    return createEmptySnapshot()
  }

  const requests = Math.max(0, toInt(requestCountRaw))
  const tokens = Math.max(0, toInt(tokenCountRaw))
  const cost = Math.max(0, roundCost(costCountRaw))
  if (requests <= 0 && tokens <= 0 && cost <= 0) {
    return createEmptySnapshot()
  }

  return {
    requests,
    tokens,
    cost,
    hasActiveWindow: true,
    windowStartTime,
    windowEndTime: windowStartTime + windowDurationMs,
    windowRemainingSeconds: Math.max(
      0,
      Math.ceil((windowStartTime + windowDurationMs - now) / 1000)
    ),
    staleFields: []
  }
}

async function migrateLegacyWindowToBuckets(keyId, windowMinutes, legacySnapshot, options = {}) {
  if (!legacySnapshot || !legacySnapshot.hasActiveWindow) {
    return false
  }

  const client = options.client || redis.getClientSafe()
  if (!client) {
    return false
  }

  const bucketKey = getBucketKey(keyId)
  const bucketId = String(getBucketId(legacySnapshot.windowStartTime))

  try {
    await client.hset(
      bucketKey,
      bucketId,
      serializeBucketValue({
        requests: legacySnapshot.requests,
        tokens: legacySnapshot.tokens,
        cost: legacySnapshot.cost
      })
    )
    await client.expire(bucketKey, getBucketRetentionSeconds(windowMinutes))
    logger.info(`Migrated legacy rate-limit window to sliding buckets for API key ${keyId}`)
    return true
  } catch (error) {
    logger.warn(`Failed to migrate legacy rate-limit window for API key ${keyId}: ${error.message}`)
    return false
  }
}

async function getWindowSnapshot(keyId, windowMinutes, options = {}) {
  if (!keyId || getWindowDurationMs(windowMinutes) <= 0) {
    return createEmptySnapshot()
  }

  const client = options.client || redis.getClientSafe()
  if (!client) {
    return createEmptySnapshot()
  }

  const now = toNumber(options.now) || Date.now()
  const bucketKey = getBucketKey(keyId)
  const rawBuckets = (await client.hgetall(bucketKey)) || {}
  const hasBucketData = Object.keys(rawBuckets).length > 0

  if (!hasBucketData && options.legacyFallback !== false) {
    const legacySnapshot = await getLegacyWindowSnapshot(keyId, windowMinutes, { client, now })
    if (legacySnapshot.hasActiveWindow) {
      if (options.migrateLegacy !== false) {
        await migrateLegacyWindowToBuckets(keyId, windowMinutes, legacySnapshot, { client })
      }
      return legacySnapshot
    }
  }

  const snapshot = buildSnapshotFromBuckets(rawBuckets, windowMinutes, now)

  if (options.prune !== false && snapshot.staleFields.length > 0) {
    await pruneBucketFields(client, bucketKey, snapshot.staleFields)
  }

  return snapshot
}

async function getWindowSnapshotsByConfig(configs, options = {}) {
  const normalizedConfigs = Array.isArray(configs)
    ? configs
        .map((item) => ({
          keyId: item?.keyId,
          windowMinutes: toInt(item?.windowMinutes)
        }))
        .filter((item) => item.keyId && item.windowMinutes > 0)
    : []

  if (normalizedConfigs.length === 0) {
    return new Map()
  }

  const client = options.client || redis.getClientSafe()
  if (!client) {
    return new Map()
  }

  const now = toNumber(options.now) || Date.now()
  const pipeline = client.pipeline()

  for (const config of normalizedConfigs) {
    pipeline.hgetall(getBucketKey(config.keyId))
  }

  const results = await pipeline.exec()
  const snapshots = new Map()
  const prunePipeline = options.prune === false ? null : client.pipeline()
  let pruneCommands = 0

  for (let i = 0; i < normalizedConfigs.length; i += 1) {
    const config = normalizedConfigs[i]
    const [, rawBuckets] = results[i] || []
    let snapshot = buildSnapshotFromBuckets(rawBuckets || {}, config.windowMinutes, now)

    if (!snapshot.hasActiveWindow && options.legacyFallback) {
      snapshot = await getLegacyWindowSnapshot(config.keyId, config.windowMinutes, {
        client,
        now
      })
    }

    if (prunePipeline && snapshot.staleFields.length > 0) {
      prunePipeline.hdel(getBucketKey(config.keyId), ...snapshot.staleFields)
      pruneCommands += 1
    }

    snapshots.set(config.keyId, snapshot)
  }

  if (prunePipeline && pruneCommands > 0) {
    await prunePipeline.exec()
  }

  return snapshots
}

async function incrementWindowUsage(keyId, windowMinutes, increments = {}, options = {}) {
  if (!keyId || getWindowDurationMs(windowMinutes) <= 0) {
    return createEmptySnapshot()
  }

  const requestsDelta = Math.max(0, toInt(increments.requests))
  const tokensDelta = Math.max(0, toInt(increments.tokens))
  const costDelta = Math.max(0, roundCost(increments.cost))

  if (requestsDelta <= 0 && tokensDelta <= 0 && costDelta <= 0) {
    return createEmptySnapshot()
  }

  const client = options.client || redis.getClientSafe()
  if (!client) {
    return createEmptySnapshot()
  }

  const now = toNumber(options.now) || Date.now()
  const bucketKey = getBucketKey(keyId)
  const bucketId = String(getBucketId(now))

  const currentValue = parseBucketValue(await client.hget(bucketKey, bucketId))
  const nextValue = {
    requests: currentValue.requests + requestsDelta,
    tokens: currentValue.tokens + tokensDelta,
    cost: roundCost(currentValue.cost + costDelta)
  }

  const pipeline = client.pipeline()
  pipeline.hset(bucketKey, bucketId, serializeBucketValue(nextValue))
  pipeline.expire(bucketKey, getBucketRetentionSeconds(windowMinutes))
  await pipeline.exec()

  return {
    requests: nextValue.requests,
    tokens: nextValue.tokens,
    cost: nextValue.cost,
    hasActiveWindow: true,
    windowStartTime: getBucketTimestamp(toInt(bucketId)),
    windowEndTime: getBucketTimestamp(toInt(bucketId) + 1) + getWindowDurationMs(windowMinutes),
    windowRemainingSeconds: Math.max(
      0,
      Math.ceil(
        (getBucketTimestamp(toInt(bucketId) + 1) + getWindowDurationMs(windowMinutes) - now) / 1000
      )
    ),
    staleFields: []
  }
}

async function incrementRequestCount(keyId, windowMinutes, count = 1, options = {}) {
  return incrementWindowUsage(keyId, windowMinutes, { requests: count }, options)
}

module.exports = {
  getWindowSnapshot,
  getWindowSnapshotsByConfig,
  getLegacyWindowSnapshot,
  incrementRequestCount,
  incrementWindowUsage,
  buildSnapshotFromBuckets,
  parseBucketValue,
  serializeBucketValue,
  _private: {
    createEmptySnapshot,
    getBucketKey,
    getBucketId,
    getBucketTimestamp,
    getBucketRetentionSeconds,
    migrateLegacyWindowToBuckets,
    roundCost
  }
}
