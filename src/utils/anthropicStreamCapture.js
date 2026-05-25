const RESPONSE_CAPTURE_ENV = 'ANTHROPIC_DEBUG_RESPONSE_DUMP'
const TEXT_PREVIEW_LIMIT = 800
const TOOL_INPUT_LIMIT = 4000

function isCaptureEnabled() {
  const raw = process.env[RESPONSE_CAPTURE_ENV]
  if (!raw) {
    return false
  }
  return raw === '1' || raw.toLowerCase() === 'true'
}

function parseSseLines(buffer, state, onPayload) {
  const combined = state._pending + buffer
  const parts = combined.split('\n')
  state._pending = parts.pop()
  for (const line of parts) {
    if (!line || !line.startsWith('data: ')) {
      continue
    }
    const payload = line.slice(6).trim()
    if (!payload || payload === '[DONE]') {
      continue
    }
    let parsed
    try {
      parsed = JSON.parse(payload)
    } catch {
      continue
    }
    onPayload(parsed)
  }
}

function handleSsePayload(state, evt) {
  if (evt.type === 'message_start' && evt.message) {
    if (evt.message.model) {
      state.responseModel = evt.message.model
    }
    if (evt.message.id) {
      state.responseId = evt.message.id
    }
    if (evt.message.usage) {
      state.usage = { ...(state.usage || {}), ...evt.message.usage }
    }
  } else if (evt.type === 'content_block_start') {
    const block = evt.content_block || {}
    if (block.type === 'tool_use') {
      state.toolUses.push({
        id: block.id || null,
        name: block.name || null,
        input_partial: ''
      })
    } else if (block.type === 'text') {
      // marker only; text comes via content_block_delta events
    }
  } else if (evt.type === 'content_block_delta' && evt.delta) {
    if (evt.delta.type === 'text_delta' && typeof evt.delta.text === 'string') {
      state.emittedText += evt.delta.text
    } else if (typeof evt.delta.text === 'string') {
      // backward-compat for older event shape: { delta: { text: '...' } }
      state.emittedText += evt.delta.text
    } else if (evt.delta.type === 'input_json_delta' && typeof evt.delta.partial_json === 'string') {
      const cur = state.toolUses[state.toolUses.length - 1]
      if (cur && cur.input_partial.length < TOOL_INPUT_LIMIT) {
        cur.input_partial = (cur.input_partial + evt.delta.partial_json).slice(0, TOOL_INPUT_LIMIT)
      }
    } else if (evt.delta.type === 'thinking_delta' && typeof evt.delta.thinking === 'string') {
      state.thinkingText += evt.delta.thinking
    }
  } else if (evt.type === 'message_delta' && evt.delta) {
    if (evt.delta.stop_reason) {
      state.stopReason = evt.delta.stop_reason
    }
    if (evt.delta.stop_sequence) {
      state.stopSequence = evt.delta.stop_sequence
    }
    if (evt.usage) {
      state.usage = { ...(state.usage || {}), ...evt.usage }
    }
  } else if (evt.type === 'error' && evt.error) {
    state.streamError = {
      type: evt.error.type || null,
      message: evt.error.message || null
    }
  }
}

/**
 * Wrap an Express response so SSE chunks written by the relay service flow
 * through unchanged to the client AND get parsed into a structured summary
 * (full text, tool_use blocks with partial JSON inputs, usage, stop_reason).
 *
 * Returns { proxy, state, summary() }:
 *   proxy   - drop-in replacement for `res` — pass it where `res` is expected
 *   state   - live accumulator (do not mutate from outside)
 *   summary() - returns a serialisable summary object ready for
 *               dumpAnthropicStreamSummary
 *
 * If ANTHROPIC_DEBUG_RESPONSE_DUMP is not enabled we return the original res
 * unchanged with a no-op summary, so the wrap is zero-cost in normal ops.
 */
function createAnthropicStreamCapture(res) {
  if (!isCaptureEnabled()) {
    return {
      proxy: res,
      state: null,
      summary: () => null
    }
  }

  const state = {
    startedAt: Date.now(),
    statusCode: null,
    responseId: null,
    responseModel: null,
    emittedText: '',
    thinkingText: '',
    toolUses: [],
    usage: null,
    stopReason: null,
    stopSequence: null,
    streamError: null,
    _pending: ''
  }

  const tap = (chunk) => {
    if (chunk == null) {
      return
    }
    let str
    if (typeof chunk === 'string') {
      str = chunk
    } else if (Buffer.isBuffer(chunk)) {
      str = chunk.toString('utf8')
    } else {
      return
    }
    parseSseLines(str, state, (evt) => handleSsePayload(state, evt))
  }

  const proxy = new Proxy(res, {
    get(target, prop, receiver) {
      if (prop === 'write') {
        return function (chunk, ...rest) {
          tap(chunk)
          return target.write(chunk, ...rest)
        }
      }
      if (prop === 'end') {
        return function (chunk, ...rest) {
          if (chunk) {
            tap(chunk)
          }
          return target.end(chunk, ...rest)
        }
      }
      if (prop === 'writeHead') {
        return function (code, ...rest) {
          state.statusCode = code
          return target.writeHead(code, ...rest)
        }
      }
      if (prop === 'status') {
        return function (code) {
          state.statusCode = code
          return target.status(code)
        }
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
    set(target, prop, value) {
      return Reflect.set(target, prop, value)
    }
  })

  function summary() {
    return {
      duration_ms: Date.now() - state.startedAt,
      status_code: state.statusCode != null ? state.statusCode : res.statusCode || null,
      response_id: state.responseId,
      response_model: state.responseModel,
      stop_reason: state.stopReason,
      stop_sequence: state.stopSequence,
      usage: state.usage,
      tool_use_names: state.toolUses.map((t) => t.name).filter(Boolean),
      tool_uses: state.toolUses.map((t) => ({
        id: t.id,
        name: t.name,
        input_partial: t.input_partial
      })),
      text_preview: state.emittedText.slice(0, TEXT_PREVIEW_LIMIT),
      thinking_preview: state.thinkingText.slice(0, TEXT_PREVIEW_LIMIT),
      // Full text is what we add on top of the pre-existing 800-char preview;
      // the response dump file size cap (ANTHROPIC_DEBUG_RESPONSE_DUMP_MAX_BYTES)
      // already enforces an overall ceiling, so we don't truncate here.
      full_text: state.emittedText,
      stream_error: state.streamError
    }
  }

  return { proxy, state, summary }
}

/**
 * Wire a captured stream's lifecycle to the response-dump file.
 *
 * Attaches one-shot 'finish' / 'close' listeners on the underlying
 * response so that:
 *   - if the stream ends cleanly → dumpAnthropicStreamSummary(req, summary, meta)
 *   - if the connection drops before finish → dumpAnthropicStreamError(req, ..., meta)
 *
 * Listeners only fire once. If capture is disabled this is a no-op.
 *
 * dumpers is { onSummary, onError } — typically the two functions from
 * anthropicResponseDump.js. Injected to avoid circular-import overhead.
 */
function wireResponseDumpFromCapture(req, res, capture, dumpers, meta = {}) {
  if (!capture || !capture.state) {
    return
  }
  let dumped = false
  res.once('finish', () => {
    if (dumped) {
      return
    }
    dumped = true
    try {
      dumpers.onSummary(req, capture.summary(), meta)
    } catch {
      // never let dump errors break the request flow
    }
  })
  res.once('close', () => {
    if (dumped) {
      return
    }
    dumped = true
    try {
      dumpers.onError(
        req,
        { message: 'client_disconnected_before_finish', partial: capture.summary() },
        meta
      )
    } catch {
      // ignore
    }
  })
}

module.exports = {
  createAnthropicStreamCapture,
  wireResponseDumpFromCapture,
  isCaptureEnabled
}
