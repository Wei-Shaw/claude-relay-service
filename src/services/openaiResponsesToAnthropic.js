/**
 * OpenAI Responses -> Anthropic Messages 事件转换器
 */

function safeJsonParse(raw, fallback = null) {
  try {
    return JSON.parse(raw)
  } catch (_) {
    return fallback
  }
}

function sanitizeFunctionArgumentsString(args) {
  if (!args || typeof args !== 'string') {
    return ''
  }

  const trimmed = args.trim()
  if (!trimmed) {
    return ''
  }

  if (safeJsonParse(trimmed, null)) {
    return trimmed
  }

  // Some upstream streams emit duplicated complete JSON payloads like:
  // {"a":1}{"a":1}. Keep the last valid JSON object.
  const lastObjectStart = trimmed.lastIndexOf('{')
  if (lastObjectStart > 0) {
    const tail = trimmed.slice(lastObjectStart)
    if (safeJsonParse(tail, null)) {
      return tail
    }
  }

  return trimmed
}

function parseFunctionArguments(args) {
  const normalized = sanitizeFunctionArgumentsString(args)
  if (!normalized) {
    return {}
  }
  try {
    const parsed = JSON.parse(normalized)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed
    }
  } catch (_) {
    // ignore
  }
  return {}
}

function mapStopReason(response = {}, hasToolUse = false) {
  if (hasToolUse) {
    return 'tool_use'
  }

  if (response?.status === 'incomplete') {
    const reason = String(response?.incomplete_details?.reason || '').toLowerCase()
    if (reason === 'max_output_tokens') {
      return 'max_tokens'
    }
    return 'end_turn'
  }

  return 'end_turn'
}

class OpenAIResponsesToAnthropicConverter {
  createStreamState() {
    return {
      messageStarted: false,
      messageId: null,
      model: null,
      currentBlockIndex: -1,
      currentBlockType: null,
      currentToolCallId: null,
      toolCallCount: 0,
      hasToolUse: false,
      usage: {
        input_tokens: 0,
        output_tokens: 0
      },
      pendingArgsByCallId: Object.create(null)
    }
  }

  _buildMessageStartPayload(state, requestedModel) {
    return {
      type: 'message_start',
      message: {
        id: state.messageId || `msg_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        model: state.model || requestedModel,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 0,
          output_tokens: 0
        }
      }
    }
  }

  _ensureMessageStarted(events, state, requestedModel) {
    if (state.messageStarted) {
      return
    }
    state.messageStarted = true
    events.push({
      event: 'message_start',
      data: this._buildMessageStartPayload(state, requestedModel)
    })
  }

  _startTextBlock(events, state) {
    state.currentBlockIndex += 1
    state.currentBlockType = 'text'
    state.currentToolCallId = null
    events.push({
      event: 'content_block_start',
      data: {
        type: 'content_block_start',
        index: state.currentBlockIndex,
        content_block: { type: 'text', text: '' }
      }
    })
  }

  _startToolBlock(events, state, callId, name) {
    state.currentBlockIndex += 1
    state.currentBlockType = 'tool_use'
    state.currentToolCallId = callId
    state.toolCallCount += 1
    state.hasToolUse = true

    events.push({
      event: 'content_block_start',
      data: {
        type: 'content_block_start',
        index: state.currentBlockIndex,
        content_block: {
          type: 'tool_use',
          id: callId || `toolu_${Date.now()}_${state.toolCallCount}`,
          name: name || 'tool',
          input: {}
        }
      }
    })
  }

  _stopCurrentBlock(events, state) {
    if (state.currentBlockIndex < 0 || !state.currentBlockType) {
      return
    }
    events.push({
      event: 'content_block_stop',
      data: {
        type: 'content_block_stop',
        index: state.currentBlockIndex
      }
    })
    state.currentBlockType = null
    state.currentToolCallId = null
  }

  _getPendingArgsState(state, callId) {
    if (!callId) {
      return null
    }
    if (!state.pendingArgsByCallId[callId]) {
      state.pendingArgsByCallId[callId] = {
        latestArgs: '',
        emitted: false
      }
    }
    return state.pendingArgsByCallId[callId]
  }

  _emitToolArgsIfNeeded(events, state, callId, argsText) {
    const pending = this._getPendingArgsState(state, callId)
    if (!pending || pending.emitted) {
      return
    }

    const normalizedArgs = sanitizeFunctionArgumentsString(argsText || pending.latestArgs || '')
    if (!normalizedArgs) {
      return
    }

    pending.latestArgs = normalizedArgs
    pending.emitted = true

    events.push({
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: state.currentBlockIndex,
        delta: {
          type: 'input_json_delta',
          partial_json: normalizedArgs
        }
      }
    })
  }

  _emitError(events, message, errorType = 'api_error') {
    events.push({
      event: 'error',
      data: {
        type: 'error',
        error: {
          type: errorType,
          message: message || 'Upstream error'
        }
      }
    })
  }

  convertStreamEvent(eventData, requestedModel, state) {
    const events = []
    const type = eventData?.type

    if (!type) {
      return events
    }

    if (type === 'response.created') {
      const response = eventData.response || {}
      state.messageId = response.id || state.messageId || `msg_${Date.now()}`
      state.model = response.model || requestedModel
      this._ensureMessageStarted(events, state, requestedModel)
      return events
    }

    if (type === 'response.output_text.delta') {
      this._ensureMessageStarted(events, state, requestedModel)
      if (state.currentBlockType !== 'text') {
        this._stopCurrentBlock(events, state)
        this._startTextBlock(events, state)
      }
      events.push({
        event: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index: state.currentBlockIndex,
          delta: {
            type: 'text_delta',
            text: eventData.delta || ''
          }
        }
      })
      return events
    }

    if (type === 'response.output_item.added') {
      const item = eventData.item || {}
      if (item.type !== 'function_call') {
        return events
      }

      this._ensureMessageStarted(events, state, requestedModel)
      this._stopCurrentBlock(events, state)
      const callId = item.call_id || item.id || `call_${Date.now()}_${state.toolCallCount + 1}`
      this._startToolBlock(events, state, callId, item.name)
      return events
    }

    if (type === 'response.function_call_arguments.delta') {
      this._ensureMessageStarted(events, state, requestedModel)
      if (state.currentBlockType !== 'tool_use') {
        this._stopCurrentBlock(events, state)
        this._startToolBlock(
          events,
          state,
          eventData.call_id || eventData.item_id || `call_${Date.now()}_${state.toolCallCount + 1}`,
          eventData.name || 'tool'
        )
      }

      const callId = state.currentToolCallId || eventData.call_id || eventData.item_id
      if (callId) {
        const pending = this._getPendingArgsState(state, callId)
        pending.latestArgs += eventData.delta || ''
      }

      return events
    }

    if (type === 'response.function_call_arguments.done') {
      // Prefer current active tool call id. Some upstream payloads expose item_id
      // instead of call_id here, which may not match tool call id and cause
      // duplicate argument emission across done/output_item.done.
      const callId =
        state.currentToolCallId || eventData.call_id || eventData.item_id || `call_${Date.now()}`
      const pending = this._getPendingArgsState(state, callId)

      this._ensureMessageStarted(events, state, requestedModel)
      if (state.currentBlockType !== 'tool_use') {
        this._stopCurrentBlock(events, state)
        this._startToolBlock(events, state, callId, eventData.name || 'tool')
      }

      if (typeof eventData.arguments === 'string' && eventData.arguments.length > 0) {
        pending.latestArgs = eventData.arguments
      }
      this._emitToolArgsIfNeeded(events, state, callId, pending.latestArgs)

      return events
    }

    if (type === 'response.output_item.done') {
      const item = eventData.item || {}
      if (item.type !== 'function_call') {
        return events
      }

      // Prefer current active tool call id. Some upstream payloads provide item.id
      // that is not equal to function call call_id, which can lead to duplicated
      // argument emission.
      const callId = state.currentToolCallId || item.call_id || item.id
      const pending = this._getPendingArgsState(state, callId)
      if (pending && !pending.emitted) {
        if (typeof item.arguments === 'string' && item.arguments.length > 0) {
          pending.latestArgs = item.arguments
        }
        this._emitToolArgsIfNeeded(events, state, callId, pending.latestArgs)
      }

      if (state.currentBlockType === 'tool_use') {
        this._stopCurrentBlock(events, state)
      }
      if (callId) {
        delete state.pendingArgsByCallId[callId]
      }
      return events
    }

    if (type === 'response.completed') {
      const response = eventData.response || {}
      this._ensureMessageStarted(events, state, requestedModel)

      if (response?.usage) {
        state.usage.input_tokens = response.usage.input_tokens || 0
        state.usage.output_tokens = response.usage.output_tokens || 0
      }

      this._stopCurrentBlock(events, state)

      events.push({
        event: 'message_delta',
        data: {
          type: 'message_delta',
          delta: {
            stop_reason: mapStopReason(response, state.hasToolUse),
            stop_sequence: null
          },
          usage: {
            output_tokens: state.usage.output_tokens || 0
          }
        }
      })

      events.push({
        event: 'message_stop',
        data: { type: 'message_stop' }
      })

      return events
    }

    if (type === 'response.failed') {
      const message = eventData?.response?.error?.message || 'Upstream response failed'
      this._emitError(events, message)
      return events
    }

    if (type === 'response.incomplete') {
      const response = eventData.response || {}
      this._ensureMessageStarted(events, state, requestedModel)
      this._stopCurrentBlock(events, state)
      events.push({
        event: 'message_delta',
        data: {
          type: 'message_delta',
          delta: {
            stop_reason: mapStopReason(response, state.hasToolUse),
            stop_sequence: null
          },
          usage: {
            output_tokens: response?.usage?.output_tokens || 0
          }
        }
      })
      events.push({
        event: 'message_stop',
        data: { type: 'message_stop' }
      })
      return events
    }

    if (type === 'error') {
      this._emitError(events, eventData.message || 'Upstream stream error')
      return events
    }

    return events
  }

  convertResponse(responseData, requestedModel) {
    const response = responseData?.type === 'response.completed' ? responseData.response : responseData

    if (!response || typeof response !== 'object') {
      return {
        type: 'error',
        error: {
          type: 'api_error',
          message: 'Invalid upstream response'
        }
      }
    }

    if (response.status === 'failed' || response.error) {
      return {
        type: 'error',
        error: {
          type: response.error?.type || 'api_error',
          message: response.error?.message || 'Upstream response failed'
        }
      }
    }

    const content = []
    const output = Array.isArray(response.output) ? response.output : []
    let hasToolUse = false

    for (const item of output) {
      if (!item || typeof item !== 'object') {
        continue
      }

      if (item.type === 'message') {
        const parts = Array.isArray(item.content) ? item.content : []
        const text = parts
          .filter((part) => part?.type === 'output_text')
          .map((part) => part.text || '')
          .join('')
        if (text) {
          content.push({ type: 'text', text })
        }
        continue
      }

      if (item.type === 'function_call') {
        hasToolUse = true
        content.push({
          type: 'tool_use',
          id: item.call_id || item.id || `toolu_${Date.now()}`,
          name: item.name || 'tool',
          input: parseFunctionArguments(item.arguments)
        })
      }
    }

    return {
      id: response.id || `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      model: response.model || requestedModel,
      content,
      stop_reason: mapStopReason(response, hasToolUse),
      stop_sequence: null,
      usage: {
        input_tokens: response.usage?.input_tokens || 0,
        output_tokens: response.usage?.output_tokens || 0
      }
    }
  }
}

function parseSSEFromChunk(chunk, bufferState) {
  const entries = []
  bufferState.buffer += String(chunk).replace(/\r\n/g, '\n')
  let idx = bufferState.buffer.indexOf('\n\n')

  while (idx !== -1) {
    const event = bufferState.buffer.slice(0, idx)
    bufferState.buffer = bufferState.buffer.slice(idx + 2)
    idx = bufferState.buffer.indexOf('\n\n')

    if (!event.trim()) {
      continue
    }

    const lines = event.split('\n')
    let dataLine = null

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        dataLine = line.slice(6).trim()
      }
    }

    if (!dataLine || dataLine === '[DONE]') {
      continue
    }

    const parsed = safeJsonParse(dataLine, null)
    if (parsed) {
      entries.push(parsed)
    }
  }

  return entries
}

module.exports = {
  OpenAIResponsesToAnthropicConverter,
  parseSSEFromChunk
}
