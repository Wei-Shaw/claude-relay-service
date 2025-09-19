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

const isSystemHelperPrompt = (text) => {
  if (!text) {
    return false
  }

  const normalized = text.trim().toLowerCase()

  const patterns = [
    /^please write a \d{1,2}-?\d{1,2}? word title for the following conversation/, // CLI conversation summary
    /^please write a short title for the following conversation/,
    /^generate a short title for the following conversation/,
    /^summarize the following conversation in a title/
  ]

  return patterns.some((pattern) => pattern.test(normalized))
}

class HistoryRecorder {
  constructor({
    apiKey,
    requestBody,
    requestId,
    headers,
    isStream,
    providedSessionId,
    stickySessionId,
    forceNewSession
  }) {
    this.apiKey = apiKey
    this.requestBody = requestBody || {}
    this.requestId = requestId
    this.headers = headers || {}
    this.isStream = Boolean(isStream)
    this.providedSessionId = providedSessionId
    this.stickySessionId = stickySessionId
    this.forceNewSession = Boolean(forceNewSession)
    this.sessionId = null
    this.sessionWasCreated = false
    this.assistantText = ''
    this.streamBuffer = ''
    this.streamStopReason = undefined
    this.usage = null
    this.isClosed = false
    this.streamBlocks = new Map()
    this.streamHadTextDelta = false
    this.lastMessageContent = ''
    this.skipRecording = false
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

      const userMessage = HistoryRecorder.extractUserMessage(this.requestBody)
      const helperPrompt = userMessage && isSystemHelperPrompt(userMessage.content)

      if (this.stickySessionId && this.forceNewSession) {
        await sessionStore.clearStickySession(this.apiKey.id, this.stickySessionId)
      }

      if (helperPrompt) {
        this.skipRecording = true
        logger.debug('🛈 HistoryRecorder: skip system-helper prompt', {
          apiKeyId: this.apiKey?.id,
          requestId: this.requestId
        })
        return this
      }

      if (this.stickySessionId && !this.forceNewSession && !this.providedSessionId) {
        const mappedSessionId = await sessionStore.getStickySession(
          this.apiKey.id,
          this.stickySessionId
        )
        if (mappedSessionId) {
          this.providedSessionId = mappedSessionId
        }
      }

    const sessionResult = await sessionStore.ensureSession(this.apiKey.id, this.providedSessionId, {
      model: this.requestBody?.model,
      isStream: this.isStream,
      metadata,
      generateId: () => `session_${this.apiKey.id}_${Date.now()}_${uuidv4().slice(0, 8)}`
    })

    this.sessionId = sessionResult.sessionId
    this.sessionWasCreated = sessionResult.isNew
    if (sessionResult.meta && sessionResult.meta.title) {
      this.sessionTitle = sessionResult.meta.title
    }

      if (this.stickySessionId && this.sessionId) {
        await sessionStore.setStickySession(
          this.apiKey.id,
          this.stickySessionId,
          this.sessionId
        )
      }

      if (userMessage) {
        const helperPrompt = isSystemHelperPrompt(userMessage.content)
        const titleCandidate = this.deriveTitle(userMessage.content)
        if (!this.sessionTitle && !helperPrompt && titleCandidate) {
          this.sessionTitle = titleCandidate
          await sessionStore.setSessionTitle(this.sessionId, this.sessionTitle)
        }

        await sessionStore.appendMessage({
          apiKeyId: this.apiKey.id,
          sessionId: this.sessionId,
          message: {
            role: userMessage.role || 'user',
            type: helperPrompt ? 'system-helper' : 'user',
            content: truncate(userMessage.content),
            createdAt: new Date().toISOString(),
            model: this.requestBody?.model,
            requestId: this.requestId,
            metadata: {
              ...userMessage.metadata,
              isSystemHelper: helperPrompt
            }
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
    if (!config.enabled || !this.sessionId || this.skipRecording) {
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

    const rawChunk = Buffer.isBuffer(chunk) ? chunk.toString(encoding || 'utf8') : chunk
    const textChunk = typeof rawChunk === 'string' ? rawChunk.replace(/\r\n/g, '\n') : ''
    if (!textChunk) {
      return
    }

    this.streamBuffer += textChunk

    const events = this.streamBuffer.split(/\n{2,}/)
    this.streamBuffer = events.pop() || ''

    events.forEach((eventPayload) => {
      const dataLines = eventPayload
        .split('\n')
        .map((line) => line.trim())
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
          logger.debug(
            '🔍 HistoryRecorder: failed to parse SSE chunk',
            dataLine.slice(0, 80)
          )
        }
      })
    })
  }

  handleStreamEvent(event) {
    if (!event || typeof event !== 'object') {
      return
    }

    logger.debug('🔍 HistoryRecorder: stream event received', {
      type: event.type,
      hasDelta: Boolean(event.delta),
      hasMessage: Boolean(event.message),
      hasContent: Boolean(event.content)
    })

    if (event.type === 'content_block_start' && typeof event.index !== 'undefined') {
      this.ensureStreamBlock(event.index)
    }

    if (event.type === 'content_block_delta') {
      const block = this.ensureStreamBlock(event.index)
      if (event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') {
        block.text += event.delta.text
        this.streamHadTextDelta = true
        this.appendAssistantText(event.delta.text)
      }
      if (event.delta?.partial_text && !this.streamHadTextDelta) {
        block.text = event.delta.partial_text
      }
    }

    if (event.type === 'content_block_stop' && typeof event.index !== 'undefined') {
      const block = this.ensureStreamBlock(event.index)
      block.closed = true
    }

    if (event.message && Array.isArray(event.message.content)) {
      const combined = this.flattenContentArray(event.message.content)
      if (combined) {
        this.lastMessageContent = combined
        if (!this.streamHadTextDelta && !this.assistantText) {
          this.appendAssistantText(combined)
        }
      }
    }

    if (event.content && Array.isArray(event.content) && !this.streamHadTextDelta) {
      const combined = this.flattenContentArray(event.content)
      if (combined) {
        this.lastMessageContent = combined
        if (!this.assistantText) {
          this.appendAssistantText(combined)
        }
      }
    }

    const potentialStopReason =
      event.delta?.stop_reason ||
      event.stop_reason ||
      event.response?.stop_reason ||
      event.completion?.stop_reason

    if (potentialStopReason) {
      this.streamStopReason = potentialStopReason
    }

    if (!this.requestBody?.model) {
      const modelFromEvent =
        event.model ||
        event.message?.model ||
        event.delta?.model ||
        (Array.isArray(event.messages)
          ? event.messages.find((msg) => msg?.model)?.model
          : undefined)
      if (modelFromEvent) {
        this.requestBody.model = modelFromEvent
      }
    }
  }

  ensureStreamBlock(index) {
    const key = Number.isInteger(index) ? index : 'default'
    if (!this.streamBlocks.has(key)) {
      this.streamBlocks.set(key, {
        text: '',
        closed: false,
        order: this.streamBlocks.size
      })
    }
    return this.streamBlocks.get(key)
  }

  flattenContentArray(contentArray) {
    if (!Array.isArray(contentArray)) {
      return ''
    }
    const parts = []

    const walk = (items) => {
      items.forEach((item) => {
        if (!item) {
          return
        }
        if (typeof item.text === 'string') {
          parts.push(item.text)
        }
        if (typeof item.partial_text === 'string') {
          parts.push(item.partial_text)
        }
        if (Array.isArray(item.content)) {
          walk(item.content)
        }
      })
    }

    walk(contentArray)
    return parts.join('')
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
    if (!config.enabled || !this.sessionId || this.skipRecording) {
      return
    }

    if (!this.assistantText) {
      if (this.streamBlocks.size) {
        const combined = Array.from(this.streamBlocks.values())
          .sort((a, b) => a.order - b.order)
          .map((block) => block.text || '')
          .join('')
        if (combined) {
          this.assistantText = truncate(combined)
        }
      }
      if (!this.assistantText && this.lastMessageContent) {
        this.assistantText = truncate(this.lastMessageContent)
      }
    }

    let resolvedContent = text || this.assistantText || ''

    if (!resolvedContent) {
      const isToolOnlyMessage =
        finishReason === 'tool_use' || finishReason === 'tool_request' || finishReason === 'tool_output'

      if (isToolOnlyMessage) {
        logger.debug('ℹ️ HistoryRecorder: skip tool-only assistant message', {
          sessionId: this.sessionId,
          finishReason
        })
        return
      }

      if (error) {
        resolvedContent = `【错误】${error.message || String(error)}`
      }
    }

    if (!resolvedContent.trim()) {
      logger.debug('ℹ️ HistoryRecorder: skip empty assistant message', {
        sessionId: this.sessionId,
        finishReason,
        hasError: Boolean(error)
      })
      return
    }

    const content = truncate(resolvedContent)

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
      logger.debug('📝 HistoryRecorder: assistant message stored', {
        sessionId: this.sessionId,
        contentPreview: content.slice(0, 50)
      })

      if (!this.sessionTitle) {
        const titleCandidate = this.deriveTitle(content)
        if (titleCandidate) {
          this.sessionTitle = titleCandidate
          await sessionStore.setSessionTitle(this.sessionId, this.sessionTitle)
        }
      }
    } catch (storageError) {
      logger.warn('⚠️ Failed to record assistant response:', storageError.message)
    }
  }

  async finalizeStream(error) {
    if (this.isClosed || !config.enabled || !this.sessionId || !this.isStream || this.skipRecording) {
      return
    }

    logger.debug('🔚 HistoryRecorder: finalizeStream invoked', {
      hasAssistantText: Boolean(this.assistantText),
      streamBlocks: this.streamBlocks.size,
      lastMessageContentLength: this.lastMessageContent?.length || 0
    })

    await this.recordAssistantResponse({
      text: this.assistantText,
      finishReason: this.streamStopReason,
      model: this.model,
      error
    })

    this.isClosed = true
  }

  deriveTitle(text) {
    if (!text) {
      return undefined
    }

    const withoutSystemTags = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, ' ')
    const normalizedWhitespace = withoutSystemTags.replace(/\s+/g, ' ').trim()

    if (!normalizedWhitespace) {
      return undefined
    }

    const candidates = normalizedWhitespace
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^important[:：]?/i.test(line))
      .filter((line) => !/^todos?/i.test(line))

    const primary = candidates[0] || normalizedWhitespace
    const firstSentence = primary.split(/(?<=[。！？!.?])/)[0]
    const base = firstSentence || primary

    const withoutMarkdown = base.replace(/^#+\s*/, '')
    const withoutQuotes = withoutMarkdown.replace(/^"/, '').replace(/"$/, '')
    const title = withoutQuotes.slice(0, 80).trim()
    return title || undefined
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
        metadata: metadata || {},
        title: meta.title || undefined
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
