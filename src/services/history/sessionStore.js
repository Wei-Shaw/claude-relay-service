const redis = require('../../models/redis')
const logger = require('../../utils/logger')
const config = require('./historyConfig')

const TTL_SECONDS = Math.max(0, Number.parseInt(config.ttlSeconds, 10) || 0)
const MAX_SESSIONS = Math.max(0, Number.parseInt(config.maxSessionsPerKey, 10) || 0)
const MAX_MESSAGES = Math.max(0, Number.parseInt(config.maxMessagesPerSession, 10) || 0)
const PREFIX = config.redisPrefix || 'chat'

const sessionsIndexKey = (apiKeyId) => `${PREFIX}:sessions:${apiKeyId}`
const sessionMetaKey = (sessionId) => `${PREFIX}:session:${sessionId}`
const sessionMessagesKey = (sessionId) => `${PREFIX}:messages:${sessionId}`
const stickySessionKey = (apiKeyId, stickyId) =>
  `${PREFIX}:sticky:${apiKeyId}:${stickyId}`

const ensureClient = () => {
  try {
    return redis.getClientSafe()
  } catch (error) {
    logger.warn('⚠️ History session store could not access Redis:', error.message)
    throw error
  }
}

const applyTtl = (pipeline, keys) => {
  if (TTL_SECONDS <= 0) {
    return
  }
  keys.forEach((key) => {
    pipeline.expire(key, TTL_SECONDS)
  })
}

const enforceSessionLimit = async (client, apiKeyId) => {
  if (MAX_SESSIONS <= 0) {
    return
  }

  const indexKey = sessionsIndexKey(apiKeyId)
  const count = await client.zcard(indexKey)
  if (count <= MAX_SESSIONS) {
    return
  }

  const removeCount = count - MAX_SESSIONS
  const obsoleteSessionIds = await client.zrange(indexKey, 0, removeCount - 1)
  if (!obsoleteSessionIds.length) {
    return
  }

  const pipeline = client.multi()
  pipeline.zrem(indexKey, ...obsoleteSessionIds)

  obsoleteSessionIds.forEach((sessionId) => {
    pipeline.del(sessionMetaKey(sessionId))
    pipeline.del(sessionMessagesKey(sessionId))
  })

  applyTtl(pipeline, [indexKey])

  await pipeline.exec()
}

const ensureSession = async (apiKeyId, providedSessionId, options = {}) => {
  const client = ensureClient()
  const now = Date.now()

  let sessionId = providedSessionId
  let isNew = false

  if (sessionId) {
    const meta = await client.hgetall(sessionMetaKey(sessionId))
    if (meta && meta.apiKey === apiKeyId) {
      // 已有会话，刷新活动时间
      const pipeline = client.multi()
      pipeline.hset(sessionMetaKey(sessionId), 'lastActivity', String(now))
      pipeline.zadd(sessionsIndexKey(apiKeyId), now, sessionId)
      applyTtl(pipeline, [sessionMetaKey(sessionId), sessionMessagesKey(sessionId), sessionsIndexKey(apiKeyId)])
      await pipeline.exec()
      return { sessionId, isNew: false, meta }
    }
    // 不匹配则忽略提供的ID
    sessionId = null
  }

  sessionId = sessionId || options.generateId?.() || `session_${apiKeyId}_${now}`
  isNew = true

  const baseMeta = {
    apiKey: apiKeyId,
    createdAt: String(now),
    lastActivity: String(now),
    messageCount: '0',
    totalTokens: '0',
    inputTokens: '0',
    outputTokens: '0'
  }

  if (options.model) {
    baseMeta.model = options.model
  }

  if (options.isStream !== undefined) {
    baseMeta.isStream = options.isStream ? '1' : '0'
  }

  if (options.metadata && Object.keys(options.metadata).length > 0) {
    baseMeta.metadata = JSON.stringify(options.metadata)
  }

  const pipeline = client.multi()
  pipeline.hset(sessionMetaKey(sessionId), baseMeta)
  pipeline.zadd(sessionsIndexKey(apiKeyId), now, sessionId)
  applyTtl(pipeline, [sessionMetaKey(sessionId), sessionMessagesKey(sessionId), sessionsIndexKey(apiKeyId)])

  await pipeline.exec()
  await enforceSessionLimit(client, apiKeyId)

  return { sessionId, isNew, meta: baseMeta }
}

const appendMessage = async ({ apiKeyId, sessionId, message }) => {
  const client = ensureClient()
  const now = Date.now()
  const listKey = sessionMessagesKey(sessionId)
  const metaKey = sessionMetaKey(sessionId)
  const indexKey = sessionsIndexKey(apiKeyId)

  const payload = JSON.stringify({ ...message, storedAt: new Date().toISOString() })

  const pipeline = client.multi()
  pipeline.rpush(listKey, payload)
  if (MAX_MESSAGES > 0) {
    pipeline.ltrim(listKey, -MAX_MESSAGES, -1)
  }
  pipeline.hincrby(metaKey, 'messageCount', 1)
  if (typeof message.tokens === 'number' && Number.isFinite(message.tokens)) {
    pipeline.hincrbyfloat(metaKey, 'totalTokens', message.tokens)
  }
  pipeline.hset(metaKey, 'lastActivity', String(now))
  pipeline.zadd(indexKey, now, sessionId)
  applyTtl(pipeline, [listKey, metaKey, indexKey])

  await pipeline.exec()
}

const updateUsage = async ({ apiKeyId, sessionId, usage = {}, model }) => {
  const client = ensureClient()
  const metaKey = sessionMetaKey(sessionId)
  const indexKey = sessionsIndexKey(apiKeyId)

  const pipeline = client.multi()

  const appendFloat = (field, value) => {
    if (typeof value === 'number' && Number.isFinite(value) && value !== 0) {
      pipeline.hincrbyfloat(metaKey, field, value)
    }
  }

  appendFloat('inputTokens', usage.inputTokens)
  appendFloat('outputTokens', usage.outputTokens)
  appendFloat('cacheCreateTokens', usage.cacheCreateTokens)
  appendFloat('cacheReadTokens', usage.cacheReadTokens)

  if (typeof usage.totalTokens === 'number' && Number.isFinite(usage.totalTokens)) {
    pipeline.hincrbyfloat(metaKey, 'totalTokens', usage.totalTokens)
  }

  if (model) {
    pipeline.hset(metaKey, 'model', model)
  }

  pipeline.hset(metaKey, 'lastActivity', String(Date.now()))
  pipeline.zadd(indexKey, Date.now(), sessionId)
  applyTtl(pipeline, [metaKey, indexKey])

  await pipeline.exec()
}

const getSessionMeta = async (sessionId) => {
  const client = ensureClient()
  const meta = await client.hgetall(sessionMetaKey(sessionId))
  return Object.keys(meta || {}).length ? meta : null
}

const setSessionTitle = async (sessionId, title) => {
  if (!title) {
    return
  }
  const client = ensureClient()
  await client.hset(sessionMetaKey(sessionId), 'title', title)
}

const listSessions = async (apiKeyId, { page = 1, pageSize = 20 } = {}) => {
  const client = ensureClient()
  const indexKey = sessionsIndexKey(apiKeyId)
  const offset = Math.max(0, (Number(page) - 1) * Number(pageSize))
  const stop = offset + Number(pageSize) - 1

  const [sessionIds, total] = await Promise.all([
    client.zrevrange(indexKey, offset, stop),
    client.zcard(indexKey)
  ])

  if (!sessionIds.length) {
    return { sessions: [], total }
  }

  const pipeline = client.multi()
  sessionIds.forEach((sessionId) => {
    pipeline.hgetall(sessionMetaKey(sessionId))
  })
  const results = await pipeline.exec()

  const sessions = sessionIds.map((sessionId, index) => {
    const [, meta] = results[index]
    return {
      sessionId,
      meta: meta || {}
    }
  })

  return { sessions, total }
}

const getSessionMessages = async (sessionId, { start = 0, stop = -1 } = {}) => {
  const client = ensureClient()
  const listKey = sessionMessagesKey(sessionId)
  const messages = await client.lrange(listKey, start, stop)
  return messages
}

const deleteSession = async (sessionId) => {
  const client = ensureClient()
  const meta = await client.hgetall(sessionMetaKey(sessionId))
  if (!meta || Object.keys(meta).length === 0) {
    return false
  }

  const apiKeyId = meta.apiKey
  const indexKey = sessionsIndexKey(apiKeyId)

  const pipeline = client.multi()
  pipeline.zrem(indexKey, sessionId)
  pipeline.del(sessionMetaKey(sessionId))
  pipeline.del(sessionMessagesKey(sessionId))
  applyTtl(pipeline, [indexKey])

  await pipeline.exec()
  return true
}

const getStickySession = async (apiKeyId, stickyId) => {
  if (!stickyId) {
    return null
  }
  const client = ensureClient()
  const value = await client.get(stickySessionKey(apiKeyId, stickyId))
  return value || null
}

const setStickySession = async (apiKeyId, stickyId, sessionId) => {
  if (!stickyId || !sessionId) {
    return
  }
  const client = ensureClient()
  const key = stickySessionKey(apiKeyId, stickyId)
  if (config.stickySessionTtlSeconds > 0) {
    await client.set(key, sessionId, 'EX', config.stickySessionTtlSeconds)
  } else {
    await client.set(key, sessionId)
  }
}

const clearStickySession = async (apiKeyId, stickyId) => {
  if (!stickyId) {
    return
  }
  const client = ensureClient()
  await client.del(stickySessionKey(apiKeyId, stickyId))
}

module.exports = {
  ensureSession,
  appendMessage,
  updateUsage,
  listSessions,
  getSessionMeta,
  getSessionMessages,
  deleteSession,
  getStickySession,
  setStickySession,
  clearStickySession,
  setSessionTitle
}
