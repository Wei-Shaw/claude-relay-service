const { v4: uuidv4 } = require('uuid')
const logger = require('../../utils/logger')
const sessionStore = require('./sessionStore')
const config = require('./historyConfig')

const normalizeContent = (content) => {
  if (content === null || content === undefined) {
    return ''
  }
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item) {
          return ''
        }
        if (typeof item === 'string') {
          return item
        }
        if (typeof item === 'object') {
          return item.text || item.input_text || item.content || ''
        }
        return ''
      })
      .join('')
  }
  if (typeof content === 'object') {
    return content.text || content.value || ''
  }
  return String(content)
}

const truncate = (text) => {
  if (!text) {
    return ''
  }
  if (!config.maxContentLength || text.length <= config.maxContentLength) {
    return text
  }
  return `${text.slice(0, config.maxContentLength)}…`
}

const parseJsonSafe = (value) => {
  if (!value) {
    return null
  }
  try {
    return JSON.parse(value)
  } catch (error) {
    return null
  }
}

const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

const deriveUsageFromPayload = (usage) => {
  if (!usage) {
    return null
  }
  const inputTokens = usage.input_tokens ?? usage.inputTokens
  const outputTokens = usage.output_tokens ?? usage.outputTokens
  const cacheCreateTokens =
    usage.cache_creation_input_tokens ?? usage.cacheCreateTokens ?? usage.cacheCreationInputTokens
  const cacheReadTokens = usage.cache_read_input_tokens ?? usage.cacheReadTokens

  const totalTokens = [inputTokens, outputTokens, cacheCreateTokens, cacheReadTokens]
    .map((value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0))
    .reduce((sum, value) => sum + value, 0)

  return {
    inputTokens: typeof inputTokens === 'number' ? inputTokens : undefined,
    outputTokens: typeof outputTokens === 'number' ? outputTokens : undefined,
    cacheCreateTokens:
      typeof cacheCreateTokens === 'number' ? cacheCreateTokens : undefined,
    cacheReadTokens: typeof cacheReadTokens === 'number' ? cacheReadTokens : undefined,
    totalTokens
  }
}

const extractStopReason = (responseJson) => {
  if (!responseJson) {
    return undefined
  }
  if (responseJson.stop_reason) {
    return responseJson.stop_reason
  }
  if (responseJson.stop_reason === null && responseJson.stop_sequence) {
    return 'stop_sequence'
  }
  if (responseJson.stopReason) {
    return responseJson.stopReason
  }
  return undefined
}

const extractAssistantTextFromResponse = (responseJson) => {
  if (!responseJson) {
    return ''
  }

  if (typeof responseJson.content === 'string') {
    return responseJson.content
  }

  if (Array.isArray(responseJson.content)) {
    const textBlocks = responseJson.content
      .filter(Boolean)
      .map((block) => {
        if (typeof block === 'string') {
          return block
        }
        if (typeof block === 'object') {
          if (block.text) {
            return block.text
          }
          if (Array.isArray(block.content)) {
            return block.content.map((item) => item?.text || '').join('')
          }
        }
        return ''
      })
    return textBlocks.join('')
  }

  if (responseJson.delta && Array.isArray(responseJson.delta)) {
    return responseJson.delta
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
  }

  return ''
}

class HistoryRecorder {
  constructor({
    apiKey,
    requestBody,
    requestId,
    headers,
    isStream,
    providedSessionId
  }) {
    this.apiKey = apiKey
    this.requestBody = requestBody || {}
    this.requestId = requestId
    this.headers = headers || {}
    this.isStream = Boolean(isStream)
    this.providedSessionId = providedSessionId
    this.sessionId = null
    this.sessionWasCreated = false
    this.assistantText = ''
    this.streamBuffer = ''
    this.streamStopReason = undefined
    this.usage = null
    this.isClosed = false
  }

  get model() {
    return this.requestBody?.model || this.usage?.model || undefined
  }

  async init() {
    if (!config.enabled) {
      return this
    }

    try {
      const metadata = {
        apiKeyName: this.apiKey?.name,
        userAgent: this.headers['user-agent'] || this.headers['User-Agent'],
        requestId: this.requestId,
        stream: this.isStream
      }

      const sessionResult = await sessionStore.ensureSession(this.apiKey.id, this.providedSessionId, {
        model: this.requestBody?.model,
        isStream: this.isStream,
        metadata,
        generateId: () => `session_${this.apiKey.id}_${Date.now()}_${uuidv4().slice(0, 8)}`
      })

      this.sessionId = sessionResult.sessionId
      this.sessionWasCreated = sessionResult.isNew

      const userMessage = HistoryRecorder.extractUserMessage(this.requestBody)
      if (userMessage) {
        await sessionStore.appendMessage({
          apiKeyId: this.apiKey.id,
          sessionId: this.sessionId,
          message: {
            role: userMessage.role || 'user',
            type: 'user',
            content: truncate(userMessage.content),
            createdAt: new Date().toISOString(),
            model: this.requestBody?.model,
            requestId: this.requestId,
            metadata: userMessage.metadata
          }
        })
      }
    } catch (error) {
      logger.warn('⚠️ Failed to initialize history recorder:', error.message)
    }

    return this
  }

  static extractUserMessage(requestBody = {}) {
    const messages = Array.isArray(requestBody.messages) ? requestBody.messages : []
    if (!messages.length) {
      return null
    }

    const reversed = [...messages].reverse()
    const candidate = reversed.find((message) => message && message.role === 'user')
    const selected = candidate || messages[messages.length - 1]

    if (!selected) {
      return null
    }

    const content = normalizeContent(selected.content)
    const metadata = {}

    if (selected.id) {
      metadata.messageId = selected.id
    }

    if (selected.metadata) {
      metadata.sourceMetadata = selected.metadata
    }

    return {
      role: selected.role || 'user',
      content,
      metadata
    }
  }

  recordUsage(usageData) {
    if (!config.enabled || !this.sessionId) {
      return
    }

    const usage = deriveUsageFromPayload(usageData)
    if (!usage) {
      return
    }

    if (usageData.model && !this.requestBody?.model) {
      this.requestBody.model = usageData.model
    }

    this.usage = { ...usage, model: usageData.model || this.requestBody?.model }

    sessionStore
      .updateUsage({
        apiKeyId: this.apiKey.id,
        sessionId: this.sessionId,
        usage,
        model: this.model
      })
      .catch((error) => {
        logger.warn('⚠️ Failed to update session usage:', error.message)
      })
  }

  captureStreamChunk(chunk, encoding) {
    if (!config.enabled || !this.sessionId || !this.isStream || this.isClosed) {
      return
    }

    const textChunk = Buffer.isBuffer(chunk) ? chunk.toString(encoding || 'utf8') : chunk
    if (!textChunk) {
      return
    }

    this.streamBuffer += textChunk

    const events = this.streamBuffer.split('\n\n')
    this.streamBuffer = events.pop() || ''

    events.forEach((eventPayload) => {
      const dataLines = eventPayload
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter(Boolean)

      dataLines.forEach((dataLine) => {
        if (dataLine === '[DONE]') {
          return
        }
        try {
          const parsed = JSON.parse(dataLine)
          this.handleStreamEvent(parsed)
        } catch (error) {
          // SSE数据可能被拆分，先忽略解析错误
        }
      })
    })
  }

  handleStreamEvent(event) {
    if (!event || typeof event !== 'object') {
      return
    }

    if (event.type === 'content_block_delta') {
      const delta = event.delta
      if (delta && delta.type === 'text_delta' && delta.text) {
        this.appendAssistantText(delta.text)
      }
    }

    if (event.type === 'message_delta' && event.delta?.stop_reason) {
      this.streamStopReason = event.delta.stop_reason
    }

    if (event.type === 'message_stop' && event.stop_reason) {
      this.streamStopReason = event.stop_reason
    }

    if (event.message && Array.isArray(event.message.content)) {
      const text = event.message.content
        .map((block) => (block?.text ? block.text : ''))
        .join('')
      if (text) {
        this.appendAssistantText(text)
      }
    }

    if (!this.requestBody?.model && event.message?.model) {
      this.requestBody.model = event.message.model
    }
  }

  appendAssistantText(text) {
    if (!text) {
      return
    }
    const combined = `${this.assistantText}${text}`
    this.assistantText = truncate(combined)
  }

  async recordAssistantResponse({
    text,
    raw,
    finishReason,
    model,
    error
  }) {
    if (!config.enabled || !this.sessionId || this.isClosed) {
      return
    }

    const content = truncate(text || this.assistantText || '')

    try {
      await sessionStore.appendMessage({
        apiKeyId: this.apiKey.id,
        sessionId: this.sessionId,
        message: {
          role: 'assistant',
          type: 'assistant',
          content,
          createdAt: new Date().toISOString(),
          model: model || this.model,
          requestId: this.requestId,
          metadata: {
            finishReason: finishReason || this.streamStopReason,
            raw,
            error: error ? error.message || String(error) : undefined
          }
        }
      })
    } catch (storageError) {
      logger.warn('⚠️ Failed to record assistant response:', storageError.message)
    }
  }

  async finalizeStream(error) {
    if (this.isClosed || !config.enabled || !this.sessionId || !this.isStream) {
      return
    }
    this.isClosed = true

    await this.recordAssistantResponse({
      text: this.assistantText,
      finishReason: this.streamStopReason,
      model: this.model,
      error
    })
  }
}

const createRecorder = async (options) => {
  if (!config.enabled) {
    return null
  }

  const recorder = new HistoryRecorder(options)
  await recorder.init()

  if (!recorder.sessionId) {
    return null
  }

  return recorder
}

const recordAssistantFromJson = async ({ recorder, responseJson, usage, modelOverride }) => {
  if (!recorder) {
    return
  }

  const assistantText = extractAssistantTextFromResponse(responseJson)
  const finishReason = extractStopReason(responseJson)

  if (usage) {
    recorder.recordUsage(usage)
  }

  await recorder.recordAssistantResponse({
    text: assistantText,
    raw: responseJson,
    finishReason,
    model: modelOverride || responseJson?.model
  })
}

const listSessions = async ({ apiKeyId, page = 1, pageSize = 20 }) => {
  if (!config.enabled) {
    return { sessions: [], total: 0 }
  }

  try {
    const result = await sessionStore.listSessions(apiKeyId, { page, pageSize })
    const sessions = result.sessions.map(({ sessionId, meta }) => {
      const metadata = parseJsonSafe(meta.metadata)
      return {
        id: sessionId,
        apiKeyId: meta.apiKey,
        createdAt: meta.createdAt ? new Date(Number(meta.createdAt)).toISOString() : null,
        lastActivity: meta.lastActivity
          ? new Date(Number(meta.lastActivity)).toISOString()
          : null,
        messageCount: Number(meta.messageCount) || 0,
        totalTokens: toNumber(meta.totalTokens) || 0,
        usage: {
          inputTokens: toNumber(meta.inputTokens) || 0,
          outputTokens: toNumber(meta.outputTokens) || 0,
          cacheCreateTokens: toNumber(meta.cacheCreateTokens) || 0,
          cacheReadTokens: toNumber(meta.cacheReadTokens) || 0
        },
        model: meta.model,
        isStream: meta.isStream === '1',
        metadata: metadata || {}
      }
    })

    return { sessions, total: result.total }
  } catch (error) {
    logger.error('❌ Failed to list history sessions:', error)
    return { sessions: [], total: 0 }
  }
}

const getSessionMessages = async ({ sessionId }) => {
  if (!config.enabled) {
    return []
  }

  try {
    const rawMessages = await sessionStore.getSessionMessages(sessionId)
    return rawMessages
      .map((item) => {
        try {
          return JSON.parse(item)
        } catch (error) {
          return null
        }
      })
      .filter(Boolean)
  } catch (error) {
    logger.error('❌ Failed to fetch history messages:', error)
    return []
  }
}

const deleteSession = async ({ sessionId }) => {
  if (!config.enabled) {
    return false
  }

  try {
    return await sessionStore.deleteSession(sessionId)
  } catch (error) {
    logger.error('❌ Failed to delete history session:', error)
    return false
  }
}

module.exports = {
  createRecorder,
  recordAssistantFromJson,
  listSessions,
  getSessionMessages,
  deleteSession,
  config,
  HistoryRecorder
}
