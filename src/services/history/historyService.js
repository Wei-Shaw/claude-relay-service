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
    cacheCreateTokens: typeof cacheCreateTokens === 'number' ? cacheCreateTokens : undefined,
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
    const textBlocks = responseJson.content.filter(Boolean).map((block) => {
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

const SYSTEM_MESSAGE_PATTERNS = [
  /<system-reminder>[\s\S]*?<\/system-reminder>/i,
  /<important>[\s\S]*?<\/important>/i,
  /<context>[\s\S]*?<\/context>/i
]

const POLICY_SPEC_PATTERN = /<policy_spec>/i
const REQUEST_ID_KEY_PATTERN = /(request|req)[_-]?id$/i
const REQUEST_ID_PATH_HINT_PATTERN =
  /(parent|root|origin|source|previous|policy|compliance|lineage)/i
const MESSAGE_GROUP_KEY_PATTERN = /(message[_-]?group[_-]?id)$/i

const sanitizeString = (value) => {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

const isLikelyRequestId = (value, currentRequestId) => {
  const trimmed = sanitizeString(value)
  if (!trimmed || trimmed.length < 8 || trimmed.length > 120) {
    return false
  }
  if (currentRequestId && trimmed === currentRequestId) {
    return false
  }
  return /^[a-z0-9:_-]+$/i.test(trimmed)
}

const traverseForCandidateRequestIds = (root, currentRequestId) => {
  const results = new Set()
  if (!root || typeof root !== 'object') {
    return results
  }

  const visited = new Set()
  const stack = [{ value: root, depth: 0, path: [] }]

  while (stack.length) {
    const { value, depth, path } = stack.pop()
    if (!value || typeof value !== 'object') {
      continue
    }
    if (visited.has(value)) {
      continue
    }
    visited.add(value)

    if (depth > 4) {
      continue
    }

    const entries = Array.isArray(value)
      ? value.slice(0, 12).map((item, index) => [String(index), item])
      : Object.entries(value).slice(0, 48)

    for (const [key, child] of entries) {
      if (child === null || child === undefined) {
        continue
      }

      const nextPath = [...path, key]

      if (typeof child === 'string') {
        if (!REQUEST_ID_KEY_PATTERN.test(key)) {
          continue
        }
        const trimmed = child.trim()
        if (!trimmed) {
          continue
        }
        const pathHasHint = nextPath.some((segment) => REQUEST_ID_PATH_HINT_PATTERN.test(segment))
        if (!pathHasHint) {
          continue
        }
        if (isLikelyRequestId(trimmed, currentRequestId)) {
          results.add(trimmed)
        }
        continue
      }

      if (typeof child === 'object') {
        stack.push({ value: child, depth: depth + 1, path: nextPath })
        continue
      }
    }
  }

  return results
}

const traverseForCandidateGroupIds = (root) => {
  const results = new Set()
  if (!root || typeof root !== 'object') {
    return results
  }

  const visited = new Set()
  const stack = [{ value: root, depth: 0 }]

  while (stack.length) {
    const { value, depth } = stack.pop()
    if (!value || typeof value !== 'object') {
      continue
    }

    if (visited.has(value)) {
      continue
    }
    visited.add(value)

    if (depth > 4) {
      continue
    }

    const entries = Array.isArray(value)
      ? value.slice(0, 12).map((item, index) => [String(index), item])
      : Object.entries(value).slice(0, 48)

    for (const [key, child] of entries) {
      if (child === null || child === undefined) {
        continue
      }

      if (typeof child === 'string') {
        if (MESSAGE_GROUP_KEY_PATTERN.test(key)) {
          const trimmed = child.trim()
          if (trimmed) {
            results.add(trimmed)
          }
        }
        continue
      }

      if (typeof child === 'object') {
        stack.push({ value: child, depth: depth + 1 })
      }
    }
  }

  return results
}

const extractRelatedRequestIds = ({ headers, requestBody, userMessage, currentRequestId }) => {
  const related = new Set()

  const addCandidate = (value) => {
    if (isLikelyRequestId(value, currentRequestId)) {
      related.add(sanitizeString(value))
    }
  }

  if (headers && typeof headers === 'object') {
    addCandidate(headers['x-parent-request-id'])
    addCandidate(headers['x-crs-parent-request-id'])
    addCandidate(headers['x-related-request-id'])
    addCandidate(headers['x-request-parent-id'])
  }

  const metadataSources = []
  if (requestBody && typeof requestBody === 'object') {
    if (requestBody.metadata && typeof requestBody.metadata === 'object') {
      metadataSources.push(requestBody.metadata)
    }
    if (Array.isArray(requestBody.messages) && requestBody.messages.length) {
      requestBody.messages.slice(-4).forEach((message) => {
        if (message && typeof message.metadata === 'object') {
          metadataSources.push(message.metadata)
        }
      })
    }
  }

  if (
    userMessage?.metadata?.sourceMetadata &&
    typeof userMessage.metadata.sourceMetadata === 'object'
  ) {
    metadataSources.push(userMessage.metadata.sourceMetadata)
  }

  metadataSources.forEach((source) => {
    traverseForCandidateRequestIds(source, currentRequestId).forEach((id) => related.add(id))
  })

  return Array.from(related)
}

const extractProvidedGroupIds = ({ headers, requestBody, userMessage }) => {
  const groups = new Set()

  const addGroup = (value) => {
    const trimmed = sanitizeString(value)
    if (trimmed) {
      groups.add(trimmed)
    }
  }

  if (headers && typeof headers === 'object') {
    addGroup(headers['x-crs-message-group-id'])
    addGroup(headers['x-message-group-id'])
  }

  if (requestBody && typeof requestBody === 'object') {
    addGroup(requestBody.messageGroupId)
    addGroup(requestBody.message_group_id)
    if (requestBody.metadata && typeof requestBody.metadata === 'object') {
      addGroup(requestBody.metadata.messageGroupId)
      addGroup(requestBody.metadata.message_group_id)
      traverseForCandidateGroupIds(requestBody.metadata).forEach((id) => groups.add(id))
    }
  }

  if (
    userMessage?.metadata?.sourceMetadata &&
    typeof userMessage.metadata.sourceMetadata === 'object'
  ) {
    addGroup(userMessage.metadata.sourceMetadata.messageGroupId)
    addGroup(userMessage.metadata.sourceMetadata.message_group_id)
    traverseForCandidateGroupIds(userMessage.metadata.sourceMetadata).forEach((id) =>
      groups.add(id)
    )
  }

  if (requestBody && Array.isArray(requestBody.messages) && requestBody.messages.length) {
    requestBody.messages.slice(-4).forEach((message) => {
      if (message && typeof message.metadata === 'object') {
        addGroup(message.metadata.messageGroupId)
        addGroup(message.metadata.message_group_id)
        traverseForCandidateGroupIds(message.metadata).forEach((id) => groups.add(id))
      }
    })
  }

  return Array.from(groups)
}

const THINKING_JSON_PREDICATES = [
  (data) => data?.type === 'thinking',
  (data) => data?.type === 'tool_use',
  (data) => typeof data?.isNewTopic !== 'undefined' && typeof data?.title !== 'undefined'
]

const AUTO_GENERATED_USER_PATTERNS = [
  /^perform (?:a|an)?\s*(?:web|internet)\s+search/i,
  /^search the (?:web|internet)/i,
  /^open (?:the )?(?:browser|terminal)/i,
  /^execute(?: the)? command:/i,
  /^running tool:/i,
  /^waiting for tool/i,
  /^launch (?:the )?(?:application|app|tool)/i,
  /^query:\s*/i,
  /^web page content:/i,
  /^web search results?/i,
  /^based on (?:the )?(?:search results|web page content)/i,
  /^\s*command[:：]/i,
  /^\s*output[:：]/i,
  /^request failed with status code/i,
  /^command timed out/i,
  /^command (?:completed|successful)/i,
  /^command running in background/i,
  /^shell [a-z0-9_-]+ is not running/i,
  /^@[a-z0-9._-]+\/[a-z0-9._-]+/i,
  /^usage\b/i,
  /^version\b/i,
  /^\s*keywords?:/i,
  /^\s*https?:\/\//i,
  /^retrying request/i,
  /^checking (?:web|internet)/i,
  /^summaries? of web results/i,
  /^\s*\{?\s*"?(?:isNewTopic|title)"?\s*:/i,
  /running on stdio/i,
  /^\s*<status>/i,
  /^\s*<exit_code>/i,
  /^\s*<timestamp>/i,
  /^[a-z0-9._-]+@\d+(?:\.\d+)+/i
]

const matchesAutoGeneratedContent = (content) => {
  if (!content || typeof content !== "string") {
    return false
  }
  const trimmed = content.trim()
  if (!trimmed) {
    return false
  }
  if (AUTO_GENERATED_USER_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return true
  }
  const lines = trimmed.split(/\r?\n+/).map((line) => line.trim()).filter(Boolean)
  return lines.some((line) => AUTO_GENERATED_USER_PATTERNS.some((pattern) => pattern.test(line)))
}

const metadataSuggestsNonUserAuthor = (metadata) => {
  if (!metadata || typeof metadata !== 'object') {
    return false
  }

  const visited = new Set()
  const stack = [metadata]

  const roleKeys = [
    'role',
    'origin',
    'originRole',
    'author',
    'actor',
    'speaker',
    'source',
    'sourceRole',
    'messageRole',
    'emitter',
    'from',
    'via'
  ]

  const truthyKeys = [
    'auto',
    'autoGenerated',
    'auto_generated',
    'autogenerated',
    'isAuto',
    'isAutoGenerated',
    'isAssistant',
    'assistantGenerated',
    'systemGenerated',
    'generatedByAssistant'
  ]

  while (stack.length) {
    const current = stack.pop()
    if (!current || typeof current !== 'object') {
      continue
    }
    if (visited.has(current)) {
      continue
    }
    visited.add(current)

    for (const flagKey of truthyKeys) {
      if (current[flagKey] === true) {
        return true
      }
    }

    for (const key of roleKeys) {
      const value = current[key]
      if (typeof value === 'string' && value.trim()) {
        const normalized = value.trim().toLowerCase()
        if (normalized && normalized !== 'user' && normalized !== 'human') {
          return true
        }
      }
    }

    if (typeof current.channel === 'string') {
      const normalized = current.channel.trim().toLowerCase()
      if (normalized && normalized !== 'user') {
        return true
      }
    }

    if (typeof current.type === 'string') {
      const normalized = current.type.trim().toLowerCase()
      if (['assistant', 'tool', 'automation', 'system'].includes(normalized)) {
        return true
      }
    }

    if (typeof current.category === 'string') {
      const normalized = current.category.trim().toLowerCase()
      if (['assistant', 'tool', 'system'].includes(normalized)) {
        return true
      }
    }

    if (typeof current.tool === 'string' || typeof current.toolName === 'string') {
      return true
    }

    const nestedCandidates = [
      current.sourceMetadata,
      current.metadata,
      current.meta,
      current.originalMessage,
      current.parent,
      current.context
    ]

    nestedCandidates.forEach((candidate) => {
      if (candidate && typeof candidate === 'object') {
        stack.push(candidate)
      }
    })
  }

  return false
}

const classifyUserMessage = ({ content, fallbackRole = 'user', metadata = {} }) => {
  const normalizedContent = typeof content === 'string' ? content.trim() : ''

  if (!normalizedContent) {
    return {
      role: fallbackRole || 'user',
      subtype: 'message',
      isVisible: true,
      metadata: {}
    }
  }

  if (POLICY_SPEC_PATTERN.test(normalizedContent)) {
    return {
      role: 'system',
      subtype: 'policy',
      isVisible: false,
      metadata: {
        policySpec: true
      },
      policyRequest: true
    }
  }

  if (SYSTEM_MESSAGE_PATTERNS.some((pattern) => pattern.test(normalizedContent))) {
    return {
      role: 'system',
      subtype: 'reminder',
      isVisible: false,
      metadata: {}
    }
  }

  const assistantGenerated =
    metadataSuggestsNonUserAuthor(metadata) ||
    matchesAutoGeneratedContent(content)

  if (assistantGenerated) {
    return {
      role: 'system',
      subtype: 'instruction',
      isVisible: false,
      metadata: {
        assistantGenerated: true,
        originalRole: fallbackRole || 'user'
      }
    }
  }

  return {
    role: fallbackRole || 'user',
    subtype: 'message',
    isVisible: true,
    metadata: {}
  }
}

const classifyAssistantContent = ({ text, raw, metadata = {}, isPolicyResponse = false }) => {
  if (raw?.type === 'tool_use' || metadata.blockType === 'tool_use') {
    return { subtype: 'tool_use', isVisible: false }
  }

  if (metadata.finishReason && metadata.finishReason.toLowerCase() === 'end_turn') {
    return { subtype: isPolicyResponse ? 'policy' : 'message', isVisible: !isPolicyResponse }
  }

  if (metadata.blockType === 'thinking') {
    return { subtype: 'thinking', isVisible: false }
  }

  if (text) {
    try {
      const parsed = JSON.parse(text)
      if (THINKING_JSON_PREDICATES.some((predicate) => predicate(parsed))) {
        return { subtype: 'thinking', isVisible: false }
      }
    } catch (error) {
      // 非 JSON 内容直接作为正常消息
    }
  }

  return {
    subtype: isPolicyResponse ? 'policy' : 'message',
    isVisible: !isPolicyResponse
  }
}

const extractSystemReminder = (content) => {
  if (!content) {
    return { body: '', reminder: '' }
  }

  const reminderMatch = content.match(/<system-reminder>[\s\S]*?<\/system-reminder>/i)
  if (!reminderMatch) {
    return { body: content, reminder: '' }
  }

  const reminder = reminderMatch[0]
  const before = content.slice(0, reminderMatch.index || 0)
  const after = content.slice((reminderMatch.index || 0) + reminder.length)
  const body = `${before}${after}`.trim()
  return {
    body,
    reminder: reminder.trim()
  }
}

const formatToolUsePayload = ({ raw = {}, partialJson = '' }) => {
  const { name, id, type, input = {} } = raw

  let parsedInput = input
  if (partialJson) {
    const startIndex = partialJson.indexOf('{')
    const endIndex = partialJson.lastIndexOf('}')
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      const candidate = partialJson.slice(startIndex, endIndex + 1)
      try {
        parsedInput = JSON.parse(candidate)
      } catch (error) {
        parsedInput = candidate
      }
    }
  }

  const payload = {
    id,
    name,
    type,
    input: parsedInput
  }

  return {
    payload,
    formatted: `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``
  }
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
    this.requestId = requestId || uuidv4()
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
    this.messageGroupId = `group_${this.apiKey?.id || 'unknown'}_${this.requestId}_${Date.now()}`
    this.pendingMessages = []
    this.streamContentBlocks = new Map()
    this.policyRequestIds = new Set()
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

      const sessionResult = await sessionStore.ensureSession(
        this.apiKey.id,
        this.providedSessionId,
        {
          model: this.requestBody?.model,
          isStream: this.isStream,
          metadata,
          generateId: () => `session_${this.apiKey.id}_${Date.now()}_${uuidv4().slice(0, 8)}`
        }
      )

      this.sessionId = sessionResult.sessionId
      this.sessionWasCreated = sessionResult.isNew
      if (sessionResult.meta && sessionResult.meta.title) {
        this.sessionTitle = sessionResult.meta.title
      }

      if (this.stickySessionId && this.sessionId) {
        await sessionStore.setStickySession(this.apiKey.id, this.stickySessionId, this.sessionId)
      }

      let classifiedUserMessage = null
      if (userMessage) {
        classifiedUserMessage = classifyUserMessage({
          content: userMessage.content,
          fallbackRole: userMessage.role,
          metadata: userMessage.metadata
        })
        const titleCandidate = this.deriveTitle(userMessage.content)
        if (!this.sessionTitle && !helperPrompt && titleCandidate) {
          this.sessionTitle = titleCandidate
          await sessionStore.setSessionTitle(this.sessionId, this.sessionTitle)
        }
      }

      this.messageGroupId = await this.determineMessageGroupId({
        userMessage,
        classification: classifiedUserMessage,
        helperPrompt
      })

      if (userMessage && classifiedUserMessage) {
        if (classifiedUserMessage.policyRequest) {
          this.policyRequestIds.add(this.requestId)
        }

        const contentToStore = truncate(userMessage.content)
        let shouldStoreMessage = true

        if (contentToStore) {
          let alreadyExists = await sessionStore.hasMessageInGroup(
            this.sessionId,
            this.messageGroupId,
            {
              role: classifiedUserMessage.role,
              subtype: classifiedUserMessage.subtype,
              content: contentToStore
            }
          )
          if (!alreadyExists) {
            const assistantDuplicate = await sessionStore.hasMessageInGroup(
              this.sessionId,
              this.messageGroupId,
              {
                role: 'assistant',
                content: contentToStore
              }
            )
            if (assistantDuplicate) {
              alreadyExists = true
              if (classifiedUserMessage.metadata) {
                classifiedUserMessage.metadata.assistantGenerated = true
              }
            }
          }
          if (alreadyExists) {
            shouldStoreMessage = false
          }
        }

        if (shouldStoreMessage) {
          await sessionStore.appendMessage({
            apiKeyId: this.apiKey.id,
            sessionId: this.sessionId,
            message: {
              role: classifiedUserMessage.role,
              type: helperPrompt ? 'system-helper' : classifiedUserMessage.role,
              subtype: classifiedUserMessage.subtype,
              messageGroupId: this.messageGroupId,
              isVisible: classifiedUserMessage.isVisible && !helperPrompt,
              content: contentToStore,
              createdAt: new Date().toISOString(),
              model: this.requestBody?.model,
              requestId: this.requestId,
              metadata: {
                ...userMessage.metadata,
                ...(classifiedUserMessage.metadata || {}),
                isSystemHelper: helperPrompt
              }
            }
          })
        }
      }
    } catch (error) {
      logger.warn('⚠️ Failed to initialize history recorder:', error.message)
    }

    return this
  }

  async determineMessageGroupId({ userMessage, classification, helperPrompt }) {
    if (!config.enabled || !this.sessionId) {
      return this.messageGroupId
    }

    const providedGroupIds = extractProvidedGroupIds({
      headers: this.headers,
      requestBody: this.requestBody,
      userMessage
    })
    if (providedGroupIds.length > 0) {
      return providedGroupIds[0]
    }

    const relatedRequestIds = extractRelatedRequestIds({
      headers: this.headers,
      requestBody: this.requestBody,
      userMessage,
      currentRequestId: this.requestId
    })
    if (relatedRequestIds.length > 0) {
      const mappedGroupId = await sessionStore.findMessageGroupIdByRequestIds(
        this.sessionId,
        relatedRequestIds
      )
      if (mappedGroupId) {
        return mappedGroupId
    }
  }

  const shouldStartNewGroup =
    !helperPrompt &&
    classification &&
    classification.role === 'user' &&
    classification.isVisible !== false &&
    !classification.policyRequest

  if (
    classification &&
    classification.role === 'user' &&
    !classification.metadata?.assistantGenerated &&
    userMessage?.content
  ) {
    const duplicateGroupId = await sessionStore.findMessageGroupIdByUserContent(
      this.sessionId,
      userMessage.content
    )
    if (duplicateGroupId) {
      return duplicateGroupId
    }

    const assistantDuplicate = await sessionStore.hasMessageWithContent(
      this.sessionId,
      userMessage.content,
      { roles: ['assistant'] }
    )
    if (assistantDuplicate) {
      const originalRole = classification.role
      classification.role = 'system'
      classification.subtype = 'instruction'
      classification.isVisible = false
      classification.metadata = {
        ...(classification.metadata || {}),
        assistantGenerated: true,
        originalRole
      }
    }
  }

  if (shouldStartNewGroup || this.sessionWasCreated) {
    return this.messageGroupId
  }

    const latestGroupId = await sessionStore.getLastMessageGroupId(this.sessionId)
    if (latestGroupId) {
      return latestGroupId
    }

    return this.messageGroupId
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
          logger.info('🔍 HistoryRecorder: failed to parse SSE chunk', dataLine.slice(0, 80))
        }
      })
    })
  }

  handleStreamEvent(event) {
    if (!event || typeof event !== 'object') {
      return
    }

    logger.info('🔍 HistoryRecorder: stream event received', {
      type: event.type,
      hasDelta: Boolean(event.delta),
      hasMessage: Boolean(event.message),
      hasContent: Boolean(event.content)
    })

    if (event.type === 'content_block_start') {
      const block = this.ensureStreamBlock(event.index)
      const blockKey = Number.isInteger(event.index) ? event.index : 'default'
      const blockType = event.content_block?.type || block?.type || 'text'
      const basePayload =
        event.content_block && typeof event.content_block === 'object'
          ? { ...event.content_block }
          : undefined

      let initialPartialJson = ''
      if (basePayload && typeof basePayload.partial_json === 'string') {
        initialPartialJson = basePayload.partial_json
        delete basePayload.partial_json
      }

      this.streamContentBlocks.set(blockKey, {
        type: blockType,
        text: '',
        raw: basePayload,
        deltas: [],
        partialJson: initialPartialJson || ''
      })
      // track block state for structured messages
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

      const blockKey = Number.isInteger(event.index) ? event.index : 'default'
      const blockState = this.streamContentBlocks.get(blockKey)
      if (blockState) {
        blockState.deltas.push(event.delta)
        if (blockState.type === 'thinking' || blockState.type === 'text') {
          if (typeof event.delta.text === 'string') {
            blockState.text += event.delta.text
          }
          if (event.delta.partial_text && !this.streamHadTextDelta) {
            blockState.text = event.delta.partial_text
          }
        }

        if (blockState.type === 'tool_use') {
          blockState.raw = {
            ...(blockState.raw || {}),
            ...event.delta
          }
          if (typeof event.delta.partial_json === 'string') {
            blockState.partialJson = `${blockState.partialJson || ''}${event.delta.partial_json}`
          }
        }
      }
    }

    if (event.type === 'content_block_stop') {
      const block = this.ensureStreamBlock(event.index)
      if (block) {
        block.closed = true
      }

      const blockKey = Number.isInteger(event.index) ? event.index : 'default'
      const blockState = this.streamContentBlocks.get(blockKey)
      if (blockState) {
        const bufferedText = blockState.text || block?.text || ''
        const messagePayload = {
          role: 'assistant',
          messageGroupId: this.messageGroupId,
          createdAt: new Date().toISOString(),
          model: this.model,
          requestId: this.requestId,
          isVisible: true
        }

        const isPolicyResponse = this.policyRequestIds.has(this.requestId)

        if (blockState.type === 'thinking' && bufferedText) {
          const classification = classifyAssistantContent({
            text: truncate(bufferedText),
            raw: null,
            metadata: { blockType: 'thinking' },
            isPolicyResponse
          })
          this.pendingMessages.push({
            ...messagePayload,
            subtype: classification.subtype,
            isVisible: classification.isVisible,
            type: 'assistant',
            content: truncate(bufferedText),
            metadata: {
              blockType: 'thinking'
            }
          })
        } else if (blockState.type === 'tool_use') {
          const { payload: toolPayload, formatted } = formatToolUsePayload({
            raw: blockState.raw || {},
            partialJson: blockState.partialJson || ''
          })
          const classification = classifyAssistantContent({
            text: formatted,
            raw: { type: 'tool_use' },
            metadata: { blockType: 'tool_use' },
            isPolicyResponse
          })
          this.pendingMessages.push({
            ...messagePayload,
            subtype: classification.subtype,
            isVisible: classification.isVisible,
            type: 'assistant',
            content: formatted,
            metadata: {
              blockType: 'tool_use',
              tool: toolPayload
            }
          })
        }

        this.streamContentBlocks.delete(blockKey)
        // block handled and removed
      }
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

  async recordAssistantResponse({ text, raw, finishReason, model, error }) {
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
        finishReason === 'tool_use' ||
        finishReason === 'tool_request' ||
        finishReason === 'tool_output'

      if (isToolOnlyMessage) {
        logger.info('ℹ️ HistoryRecorder: skip tool-only assistant message', {
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
      logger.info('ℹ️ HistoryRecorder: skip empty assistant message', {
        sessionId: this.sessionId,
        finishReason,
        hasError: Boolean(error)
      })
      return
    }

    const isPolicyResponse = this.policyRequestIds.has(this.requestId)
    let content = truncate(resolvedContent)

    let classification = classifyAssistantContent({
      text: content,
      raw,
      metadata: {
        finishReason: finishReason || this.streamStopReason
      },
      isPolicyResponse
    })

    const messageMetadataBase = {
      finishReason: finishReason || this.streamStopReason,
      raw,
      error: error ? error.message || String(error) : undefined
    }

    if (classification.subtype === 'tool_use') {
      const { payload: toolPayload, formatted } = formatToolUsePayload({
        raw: raw || {},
        partialJson: typeof resolvedContent === 'string' ? resolvedContent : ''
      })
      content = truncate(formatted)
      classification = classifyAssistantContent({
        text: content,
        raw: { type: 'tool_use' },
        metadata: { blockType: 'tool_use', finishReason: finishReason || this.streamStopReason },
        isPolicyResponse
      })
      messageMetadataBase.tool = toolPayload
    }

    const { body: messageBody, reminder } =
      classification.subtype === 'tool_use'
        ? { body: content, reminder: '' }
        : extractSystemReminder(content)

    const messagesToPersist = []

    const hasError = Boolean(error)

    if (messageBody && messageBody.trim()) {
      messagesToPersist.push({
        role: 'assistant',
        type: 'assistant',
        subtype: hasError ? 'error' : classification.subtype,
        messageGroupId: this.messageGroupId,
        isVisible: classification.isVisible,
        content: truncate(messageBody),
        createdAt: new Date().toISOString(),
        model: model || this.model,
        requestId: this.requestId,
        metadata: {
          ...messageMetadataBase
        }
      })
    }

    if (reminder) {
      const exists = await sessionStore.hasMessageInGroup(this.sessionId, this.messageGroupId, {
        role: 'system',
        subtype: 'reminder',
        content: reminder
      })
      if (!exists) {
        messagesToPersist.push({
          role: 'system',
          type: 'system',
          subtype: 'reminder',
          messageGroupId: this.messageGroupId,
          isVisible: false,
          content: reminder,
          createdAt: new Date().toISOString(),
          model: model || this.model,
          requestId: this.requestId,
          metadata: {
            relatedRequestId: this.requestId
          }
        })
      }
    }

    try {
      for (const message of messagesToPersist) {
        await sessionStore.appendMessage({
          apiKeyId: this.apiKey.id,
          sessionId: this.sessionId,
          message
        })
      }
      logger.info('📝 HistoryRecorder: assistant message stored', {
        sessionId: this.sessionId,
        contentPreview: (messageBody || reminder || '').slice(0, 50)
      })

      if (!this.sessionTitle) {
        const titleCandidate = this.deriveTitle(messageBody || content)
        if (titleCandidate) {
          this.sessionTitle = titleCandidate
          await sessionStore.setSessionTitle(this.sessionId, this.sessionTitle)
        }
      }
    } catch (storageError) {
      logger.warn('⚠️ Failed to record assistant response:', storageError.message)
    }
  }

  async flushPendingMessages() {
    if (!this.pendingMessages.length) {
      return
    }

    const messagesToStore = [...this.pendingMessages]
    this.pendingMessages = []

    for (const message of messagesToStore) {
      try {
        await sessionStore.appendMessage({
          apiKeyId: this.apiKey.id,
          sessionId: this.sessionId,
          message
        })
      } catch (error) {
        logger.warn('⚠️ Failed to append pending stream message:', error.message)
      }
    }
  }

  async finalizeStream(error) {
    if (
      this.isClosed ||
      !config.enabled ||
      !this.sessionId ||
      !this.isStream ||
      this.skipRecording
    ) {
      return
    }

    logger.info('🔚 HistoryRecorder: finalizeStream invoked', {
      hasAssistantText: Boolean(this.assistantText),
      streamBlocks: this.streamBlocks.size,
      lastMessageContentLength: this.lastMessageContent?.length || 0
    })

    await this.flushPendingMessages()

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
    const sentenceMatch =
      primary.match(/^.+?(?:[。！？!?\.](?=\s)|[。！？!?\.](?=$)|$)/u) || []
    const base = sentenceMatch[0] || primary

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

const listSessions = async ({ apiKeyId, page = 1, pageSize = 20, keyword = '' }) => {
  if (!config.enabled) {
    return { sessions: [], total: 0 }
  }

  try {
    const result = await sessionStore.listSessions(apiKeyId, {
      page,
      pageSize,
      keyword
    })
    const sessions = result.sessions.map(({ sessionId, meta }) => {
      const metadata = parseJsonSafe(meta.metadata)
      return {
        id: sessionId,
        apiKeyId: meta.apiKey,
        createdAt: meta.createdAt ? new Date(Number(meta.createdAt)).toISOString() : null,
        lastActivity: meta.lastActivity ? new Date(Number(meta.lastActivity)).toISOString() : null,
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
    const messages = await sessionStore.getSessionMessages(sessionId)
    return messages
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
