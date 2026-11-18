const axios = require('axios')
const config = require('../../config/config')
const logger = require('../utils/logger')
const { getSafeMessage } = require('../utils/errorSanitizer')
const {
  createCodexTestHeaders,
  createOpenAITestPayload,
  extractErrorMessage,
  sanitizeErrorMsg
} = require('../utils/testPayloadHelper')

const OPENAI_RESPONSES_TEST_PATH = '/v1/responses'
const INTERNAL_OPENAI_RESPONSES_TEST_PATH = `/openai${OPENAI_RESPONSES_TEST_PATH}`
const DEFAULT_TEST_TIMEOUT_MS = 60000

function getDefaultBaseUrl() {
  const { port = 3000 } = config.server || {}
  return `http://127.0.0.1:${port}`
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '')
}

function buildInternalTestUrl(baseUrl = getDefaultBaseUrl()) {
  return `${trimTrailingSlash(baseUrl)}${INTERNAL_OPENAI_RESPONSES_TEST_PATH}`
}

function buildTestRequestParts(model = 'gpt-5', options = {}) {
  const { sessionId: requestedSessionId, ...payloadOptions } = options
  const payload = createOpenAITestPayload(model, {
    stream: true,
    ...payloadOptions
  })
  const { sessionId, headers } = createCodexTestHeaders({
    sessionId: requestedSessionId,
    stream: payload.stream !== false
  })

  return {
    sessionId,
    payload,
    headers
  }
}

function extractResponseText(outputData) {
  if (typeof outputData?.output_text === 'string') {
    return outputData.output_text
  }

  const source = Array.isArray(outputData?.output)
    ? outputData.output
    : Array.isArray(outputData?.response?.output)
      ? outputData.response.output
      : Array.isArray(outputData)
        ? outputData
        : []

  let responseText = ''
  for (const item of source) {
    if (item?.type === 'message' && Array.isArray(item.content)) {
      for (const block of item.content) {
        if (block?.type === 'output_text' && block.text) {
          responseText += block.text
        } else if (typeof block?.text === 'string') {
          responseText += block.text
        }
      }
    } else if (item?.type === 'output_text' && item.text) {
      responseText += item.text
    }
  }

  return responseText
}

function extractStreamError(eventData) {
  if (!eventData || typeof eventData !== 'object') {
    return null
  }

  if (eventData.error) {
    return eventData.error.message || eventData.message || eventData.error || 'Unknown error'
  }

  if (eventData.type === 'response.failed') {
    return eventData.response?.error?.message || eventData.response?.error || 'Response failed'
  }

  if (eventData.type === 'response.incomplete') {
    return (
      eventData.response?.incomplete_details?.reason ||
      eventData.response?.status ||
      'Response incomplete'
    )
  }

  return null
}

function summarizeStreamEvent(eventData) {
  if (!eventData || typeof eventData !== 'object') {
    return null
  }

  if (eventData.type === 'response.completed' && eventData.response) {
    const output = Array.isArray(eventData.response.output) ? eventData.response.output : []
    return {
      status: eventData.response.status,
      outputTypes: output.map((item) => item?.type).filter(Boolean),
      contentTypes: output
        .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
        .map((part) => part?.type)
        .filter(Boolean)
    }
  }

  if (eventData.type === 'response.output_item.done' && eventData.item) {
    return {
      itemType: eventData.item.type,
      contentTypes: Array.isArray(eventData.item.content)
        ? eventData.item.content.map((part) => part?.type).filter(Boolean)
        : []
    }
  }

  if (Array.isArray(eventData.choices)) {
    return {
      object: eventData.object,
      choiceKeys: Object.keys(eventData.choices[0] || {})
    }
  }

  return null
}

function createStreamState() {
  return {
    responseText: '',
    streamError: null,
    seenEventTypes: new Set(),
    lastEventSummary: null
  }
}

function recordStreamEvent(state, eventData) {
  if (eventData.type) {
    state.seenEventTypes.add(eventData.type)
  } else if (eventData.object) {
    state.seenEventTypes.add(eventData.object)
  }

  const summary = summarizeStreamEvent(eventData)
  if (summary) {
    state.lastEventSummary = summary
  }
}

function applyStreamEvent(eventData, state = createStreamState()) {
  recordStreamEvent(state, eventData)

  const errorText = extractStreamError(eventData)
  if (errorText) {
    state.streamError = errorText
    return { content: '', error: errorText }
  }

  let content = ''
  if (eventData.type === 'response.output_text.delta' && typeof eventData.delta === 'string') {
    content = eventData.delta
  } else if (
    eventData.type === 'response.content_part.delta' &&
    typeof eventData.delta?.text === 'string'
  ) {
    content = eventData.delta.text
  } else if (
    eventData.type === 'response.output_text.done' &&
    eventData.text &&
    !state.responseText
  ) {
    content = eventData.text
  } else if (
    eventData.type === 'response.content_part.done' &&
    eventData.part?.text &&
    !state.responseText
  ) {
    content = eventData.part.text
  } else if (
    eventData.type === 'response.output_item.done' &&
    eventData.item &&
    !state.responseText
  ) {
    content = extractResponseText([eventData.item])
  } else if (eventData.type === 'response.completed' && eventData.response && !state.responseText) {
    content = extractResponseText(eventData.response)
  }

  if (content) {
    state.responseText += content
  }

  return { content, error: state.streamError }
}

function parseOpenAITestStreamBody(rawBody = '') {
  const state = createStreamState()
  let lastParsed = null

  const lines = String(rawBody).split('\n')
  for (const line of lines) {
    if (!line.startsWith('data:')) {
      continue
    }

    const jsonStr = line.slice(5).trim()
    if (!jsonStr || jsonStr === '[DONE]') {
      continue
    }

    try {
      const eventData = JSON.parse(jsonStr)
      lastParsed = eventData
      applyStreamEvent(eventData, state)
    } catch {
      // Ignore invalid SSE lines and keep any text already extracted.
    }
  }

  if (!state.responseText && lastParsed?.response) {
    state.responseText = extractResponseText(lastParsed.response)
  }

  return {
    responseText: state.responseText,
    errorMessage: state.streamError || '',
    events: Array.from(state.seenEventTypes).slice(-10),
    lastEvent: state.lastEventSummary
  }
}

function isReadableStream(value) {
  return value && typeof value.on === 'function' && typeof value.pipe === 'function'
}

async function readResponseBody(data) {
  if (data === undefined || data === null) {
    return ''
  }

  if (Buffer.isBuffer(data)) {
    return data.toString()
  }

  if (typeof data === 'string') {
    return data
  }

  if (!isReadableStream(data)) {
    try {
      return JSON.stringify(data)
    } catch {
      return ''
    }
  }

  return new Promise((resolve) => {
    const chunks = []
    data.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    data.on('end', () => resolve(Buffer.concat(chunks).toString()))
    data.on('error', () => resolve(Buffer.concat(chunks).toString()))
  })
}

function tryParseJson(rawBody) {
  if (!rawBody || typeof rawBody !== 'string') {
    return null
  }

  try {
    return JSON.parse(rawBody)
  } catch {
    return null
  }
}

async function parseOpenAITestResponse(response) {
  const fallbackError = `API Error: ${response.status}`
  const rawBody = await readResponseBody(response.data)
  const parsedData = tryParseJson(rawBody)
  const streamParsed = rawBody.includes('data:') ? parseOpenAITestStreamBody(rawBody) : null
  const extractedError = streamParsed?.errorMessage || extractErrorMessage(parsedData, '')

  return {
    responseText:
      streamParsed?.responseText ||
      extractResponseText(parsedData) ||
      extractResponseText(response.data),
    errorMessage: extractedError || (response.status >= 400 ? rawBody.trim() || fallbackError : ''),
    rawBody,
    events: streamParsed?.events || [],
    lastEvent: streamParsed?.lastEvent || null
  }
}

function writeSSE(responseStream, type, data = {}) {
  if (responseStream.destroyed || responseStream.writableEnded) {
    return
  }

  try {
    responseStream.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  } catch {
    // The client may have disconnected.
  }
}

function endTest(responseStream, success, error = null) {
  if (responseStream.destroyed || responseStream.writableEnded) {
    return
  }

  writeSSE(responseStream, 'test_complete', {
    success,
    error: error || undefined
  })
  try {
    responseStream.end()
  } catch {
    // The client may have disconnected after the final write.
  }
}

function ensureSSEHeaders(responseStream) {
  if (responseStream.headersSent) {
    return
  }

  responseStream.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
}

function buildNoContentError(state) {
  const details = {
    events: Array.from(state.seenEventTypes).slice(-10),
    lastEvent: state.lastEventSummary
  }
  return `No response content received from upstream: ${JSON.stringify(details)}`
}

async function sendApiKeyTestStream(options) {
  const {
    apiKey,
    model = 'gpt-5',
    prompt = 'hi',
    maxTokens = 100,
    responseStream,
    baseUrl,
    timeout = DEFAULT_TEST_TIMEOUT_MS
  } = options

  const abortController = new AbortController()
  let response = null
  let completed = false
  let clientDisconnected = false
  let streamResolve = null

  const cleanupClientListeners = () => {
    responseStream.removeListener('close', handleClientDisconnect)
    responseStream.removeListener('error', handleClientDisconnect)
  }

  const finishSilently = () => {
    if (completed) {
      return
    }

    completed = true
    cleanupClientListeners()
    if (streamResolve) {
      streamResolve()
      streamResolve = null
    }
  }

  const finishTest = (success, error = null) => {
    if (completed) {
      return
    }

    completed = true
    cleanupClientListeners()
    if (!clientDisconnected) {
      endTest(responseStream, success, error)
    }
    if (streamResolve) {
      streamResolve()
      streamResolve = null
    }
  }

  function handleClientDisconnect() {
    if (completed || responseStream.writableEnded) {
      return
    }

    clientDisconnected = true
    if (!abortController.signal.aborted) {
      abortController.abort()
    }
    try {
      response?.data?.destroy?.()
    } catch {
      // Ignore cleanup errors after the browser has gone away.
    }
    finishSilently()
  }

  responseStream.once('close', handleClientDisconnect)
  responseStream.once('error', handleClientDisconnect)

  try {
    ensureSSEHeaders(responseStream)
    writeSSE(responseStream, 'test_start', { message: 'Test started' })

    const apiUrl = buildInternalTestUrl(baseUrl)
    const { payload, headers: codexHeaders } = buildTestRequestParts(model, {
      prompt,
      maxTokens,
      stream: true
    })

    response = await axios.post(apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        ...codexHeaders
      },
      timeout,
      responseType: 'stream',
      signal: abortController.signal,
      validateStatus: () => true
    })

    if (clientDisconnected || completed || abortController.signal.aborted) {
      finishSilently()
      return
    }

    logger.debug(`OpenAI Responses API key test status: ${response.status}`)

    if (response.status !== 200) {
      const parsed = await parseOpenAITestResponse(response)
      finishTest(false, sanitizeErrorMsg(parsed.errorMessage || `API Error: ${response.status}`))
      return
    }

    if (!isReadableStream(response.data)) {
      const parsed = await parseOpenAITestResponse(response)
      if (parsed.responseText) {
        writeSSE(responseStream, 'content', { text: parsed.responseText })
        finishTest(true)
      } else {
        finishTest(false, buildNoContentError(createStreamState()))
      }
      return
    }

    await new Promise((resolve) => {
      streamResolve = resolve
      if (completed || clientDisconnected || abortController.signal.aborted) {
        streamResolve = null
        resolve()
        return
      }

      const state = createStreamState()
      let buffer = ''

      const processOpenAIStreamLine = (line) => {
        if (!line.startsWith('data:')) {
          return
        }

        const jsonStr = line.substring(5).trim()
        if (!jsonStr || jsonStr === '[DONE]') {
          return
        }

        try {
          const eventData = JSON.parse(jsonStr)
          const { content } = applyStreamEvent(eventData, state)
          if (content) {
            writeSSE(responseStream, 'content', { text: content })
          }
        } catch {
          // Ignore invalid SSE lines and continue reading the stream.
        }
      }

      response.data.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          processOpenAIStreamLine(line)
        }
      })

      response.data.on('end', () => {
        if (buffer.trim()) {
          const lines = buffer.split('\n')
          buffer = ''
          for (const line of lines) {
            processOpenAIStreamLine(line)
          }
        }

        if (state.streamError) {
          finishTest(false, sanitizeErrorMsg(state.streamError))
        } else if (state.responseText) {
          finishTest(true)
        } else {
          finishTest(false, buildNoContentError(state))
        }
      })

      response.data.on('error', (err) => {
        if (clientDisconnected || abortController.signal.aborted) {
          finishSilently()
          return
        }
        finishTest(false, getSafeMessage(err))
      })
    })
  } catch (error) {
    if (clientDisconnected || abortController.signal.aborted) {
      finishSilently()
      return
    }

    logger.error('OpenAI Responses API key test request failed:', error.message)
    if (!responseStream.headersSent) {
      ensureSSEHeaders(responseStream)
    }
    finishTest(false, getSafeMessage(error))
  }
}

module.exports = {
  OPENAI_RESPONSES_TEST_PATH,
  INTERNAL_OPENAI_RESPONSES_TEST_PATH,
  buildInternalTestUrl,
  buildTestRequestParts,
  extractResponseText,
  extractStreamError,
  summarizeStreamEvent,
  createStreamState,
  applyStreamEvent,
  parseOpenAITestStreamBody,
  parseOpenAITestResponse,
  sendApiKeyTestStream
}
