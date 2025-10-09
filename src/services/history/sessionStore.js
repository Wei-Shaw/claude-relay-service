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
const stickySessionKey = (apiKeyId, stickyId) => `${PREFIX}:sticky:${apiKeyId}:${stickyId}`

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
      applyTtl(pipeline, [
        sessionMetaKey(sessionId),
        sessionMessagesKey(sessionId),
        sessionsIndexKey(apiKeyId)
      ])
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
  applyTtl(pipeline, [
    sessionMetaKey(sessionId),
    sessionMessagesKey(sessionId),
    sessionsIndexKey(apiKeyId)
  ])

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

const listSessions = async (apiKeyId, { page = 1, pageSize = 20, keyword } = {}) => {
  const client = ensureClient()
  const indexKey = sessionsIndexKey(apiKeyId)
  const normalizedKeyword =
    typeof keyword === 'string' && keyword.trim().length > 0 ? keyword.trim().toLowerCase() : ''

  const fetchSessionMetas = async (sessionIds) => {
    if (!sessionIds.length) {
      return []
    }

    const pipeline = client.multi()
    sessionIds.forEach((sessionId) => {
      pipeline.hgetall(sessionMetaKey(sessionId))
    })
    const results = await pipeline.exec()

    return sessionIds.map((sessionId, index) => {
      const [, meta] = results[index]
      return {
        sessionId,
        meta: meta || {}
      }
    })
  }

  if (!normalizedKeyword) {
    const offset = Math.max(0, (Number(page) - 1) * Number(pageSize))
    const stop = offset + Number(pageSize) - 1

    const [sessionIds, total] = await Promise.all([
      client.zrevrange(indexKey, offset, stop),
      client.zcard(indexKey)
    ])

    if (!sessionIds.length) {
      return { sessions: [], total }
    }

    const sessions = await fetchSessionMetas(sessionIds)
    return { sessions, total }
  }

  // Keyword search path: fetch all sessions for the API Key and filter in-memory
  const allSessionIds = await client.zrevrange(indexKey, 0, -1)
  if (!allSessionIds.length) {
    return { sessions: [], total: 0 }
  }

  const allSessions = await fetchSessionMetas(allSessionIds)

  const keywordMatches = allSessions.filter(({ sessionId, meta }) => {
    const title = typeof meta.title === 'string' ? meta.title.toLowerCase() : ''
    if (title.includes(normalizedKeyword)) {
      return true
    }

    // Fallback to sessionId and raw metadata string search for robustness
    if (sessionId && sessionId.toLowerCase().includes(normalizedKeyword)) {
      return true
    }

    if (meta.metadata && typeof meta.metadata === 'string') {
      return meta.metadata.toLowerCase().includes(normalizedKeyword)
    }

    return false
  })

  const total = keywordMatches.length
  if (!total) {
    return { sessions: [], total }
  }

  const numericPage = Math.max(1, Number(page) || 1)
  const numericPageSize = Math.max(1, Number(pageSize) || 20)
  const start = (numericPage - 1) * numericPageSize
  const end = start + numericPageSize
  const paginated = keywordMatches.slice(start, end)

  return { sessions: paginated, total }
}

const assignDefaultsToMessage = (sessionId, index, message) => {
  if (!message || typeof message !== 'object') {
    return null
  }

  const subtype =
    message.subtype ||
    (message.role === 'assistant' ? 'message' : message.role === 'system' ? 'reminder' : 'message')

  const messageGroupId =
    message.messageGroupId ||
    `legacy_${sessionId}_${message.requestId || message.storedAt || index}`

  const metadata =
    typeof message.metadata === 'object' && message.metadata !== null ? message.metadata : {}

  return {
    ...message,
    subtype,
    messageGroupId,
    metadata,
    isVisible: typeof message.isVisible === 'boolean' ? message.isVisible : true
  }
}

const getSessionMessages = async (sessionId, { start = 0, stop = -1 } = {}) => {
  const client = ensureClient()
  const listKey = sessionMessagesKey(sessionId)
  const messages = await client.lrange(listKey, start, stop)
  return messages
    .map((raw, index) => {
      try {
        const parsed = JSON.parse(raw)
        return assignDefaultsToMessage(sessionId, index, parsed)
      } catch (error) {
        logger.warn('⚠️ Failed to parse stored history message:', error.message)
        return null
      }
    })
    .filter(Boolean)
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

const getLastMessageGroupId = async (sessionId) => {
  const client = ensureClient()
  const listKey = sessionMessagesKey(sessionId)
  const messages = await client.lrange(listKey, -1, -1)
  if (!messages || !messages.length) {
    return null
  }

  try {
    const parsed = JSON.parse(messages[0])
    return parsed?.messageGroupId || null
  } catch (error) {
    logger.debug('⚠️ Failed to parse last history message:', error.message)
    return null
  }
}

const findMessageGroupIdByRequestIds = async (
  sessionId,
  requestIds,
  { searchWindow = 120 } = {}
) => {
  if (!Array.isArray(requestIds) || !requestIds.length) {
    return null
  }

  const client = ensureClient()
  const listKey = sessionMessagesKey(sessionId)
  const messages = await client.lrange(listKey, -searchWindow, -1)
  if (!messages || !messages.length) {
    return null
  }

  const requestIdSet = new Set(requestIds.filter((id) => typeof id === 'string' && id))

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const raw = messages[index]
    if (!raw) {
      continue
    }

    try {
      const parsed = JSON.parse(raw)
      const candidateIds = [
        parsed?.requestId,
        parsed?.metadata?.requestId,
        parsed?.metadata?.relatedRequestId
      ].filter(Boolean)

      const matched = candidateIds.find((id) => requestIdSet.has(id))
      if (matched) {
        return parsed?.messageGroupId || parsed?.metadata?.messageGroupId || null
      }
    } catch (error) {
      logger.debug('⚠️ Failed to parse history message during group lookup:', error.message)
    }
  }

  return null
}

const findMessageGroupIdByUserContent = async (
  sessionId,
  content,
  { searchWindow = 200, normalized = true } = {}
) => {
  if (!content || typeof content !== 'string') {
    return null
  }

  const trimmed = normalized ? content.trim() : content
  if (!trimmed) {
    return null
  }

  const client = ensureClient()
  const listKey = sessionMessagesKey(sessionId)
  const messages = await client.lrange(listKey, -searchWindow, -1)
  if (!messages || !messages.length) {
    return null
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const raw = messages[index]
    if (!raw) {
      continue
    }
    try {
      const parsed = JSON.parse(raw)
      if (!parsed || parsed.role !== 'user') {
        continue
      }
      if (parsed.metadata?.assistantGenerated) {
        continue
      }
      const candidateContent =
        typeof parsed.content === 'string' && normalized ? parsed.content.trim() : parsed.content
      if (!candidateContent) {
        continue
      }
      if (candidateContent === trimmed) {
        return parsed.messageGroupId || null
      }
    } catch (error) {
      logger.debug('⚠️ Failed to parse history message during duplicate lookup:', error.message)
    }
  }

  return null
}

const hasMessageInGroup = async (
  sessionId,
  messageGroupId,
  {
    role,
    subtype,
    content,
    searchWindow = 120,
    normalized = true
  } = {}
) => {
  if (!sessionId || !messageGroupId) {
    return false
  }

  const client = ensureClient()
  const listKey = sessionMessagesKey(sessionId)
  const messages = await client.lrange(listKey, -searchWindow, -1)
  if (!messages || !messages.length) {
    return false
  }

  const normalizedContent =
    normalized && typeof content === 'string' ? content.trim() : content ?? null

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const raw = messages[index]
    if (!raw) {
      continue
    }
    try {
      const parsed = JSON.parse(raw)
      if (!parsed) {
        continue
      }
      if (parsed.messageGroupId !== messageGroupId) {
        continue
      }
      if (role !== undefined && role !== null && parsed.role !== role) {
        continue
      }
      if (subtype !== undefined && subtype !== null && parsed.subtype !== subtype) {
        continue
      }
      if (normalizedContent) {
        const candidate =
          normalized && typeof parsed.content === 'string'
            ? parsed.content.trim()
            : parsed.content ?? null
        if (candidate !== normalizedContent) {
          continue
        }
      }
      return true
    } catch (error) {
      logger.debug('⚠️ Failed to parse history message during duplication check:', error.message)
    }
  }

  return false
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
  findMessageGroupIdByUserContent,
  getLastMessageGroupId,
  findMessageGroupIdByRequestIds,
  hasMessageInGroup,
  deleteSession,
  getStickySession,
  setStickySession,
  clearStickySession,
  setSessionTitle
}
