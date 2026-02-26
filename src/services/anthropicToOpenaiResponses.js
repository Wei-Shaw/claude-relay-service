/**
 * Anthropic Messages -> OpenAI Responses 请求转换器
 */

function normalizeAnthropicTextContent(content, role = 'user') {
  const textType = role === 'assistant' ? 'output_text' : 'input_text'

  if (typeof content === 'string') {
    return content.trim() ? [{ type: textType, text: content }] : []
  }

  if (!Array.isArray(content)) {
    return []
  }

  const parts = []
  for (const block of content) {
    if (!block || typeof block !== 'object') {
      continue
    }

    if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
      parts.push({ type: textType, text: block.text })
      continue
    }

    if (block.type === 'image' && block.source?.type === 'base64' && block.source?.data) {
      const mediaType = block.source.media_type || 'image/png'
      parts.push({
        type: 'input_image',
        image_url: `data:${mediaType};base64,${block.source.data}`
      })
    }
  }

  return parts
}

function parseToolResultOutput(content) {
  if (content === null || content === undefined) {
    return ''
  }

  if (typeof content === 'string') {
    return content
  }

  try {
    return JSON.stringify(content)
  } catch (_) {
    return String(content)
  }
}

function mapAnthropicToolChoice(toolChoice) {
  if (!toolChoice || typeof toolChoice !== 'object') {
    return undefined
  }

  if (toolChoice.type === 'auto') {
    return 'auto'
  }
  if (toolChoice.type === 'any') {
    return 'required'
  }
  if (toolChoice.type === 'none') {
    return 'none'
  }
  if (toolChoice.type === 'tool' && toolChoice.name) {
    return { type: 'function', name: toolChoice.name }
  }

  return undefined
}

function normalizeSystemToInstructions(system) {
  if (!system) {
    return undefined
  }

  if (typeof system === 'string') {
    return system
  }

  if (!Array.isArray(system)) {
    return undefined
  }

  const lines = system
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return ''
      }
      if (typeof entry.text === 'string') {
        return entry.text
      }
      return ''
    })
    .filter(Boolean)

  if (lines.length === 0) {
    return undefined
  }

  return lines.join('\n\n')
}

const DEFAULT_BRIDGE_INSTRUCTIONS = 'You are a helpful assistant.'

function buildResponsesRequestFromAnthropic(body = {}, options = {}) {
  const input = []
  const messages = Array.isArray(body.messages) ? body.messages : []

  for (const message of messages) {
    const role = message?.role === 'assistant' ? 'assistant' : 'user'
    const contentBlocks = Array.isArray(message?.content)
      ? message.content
      : typeof message?.content === 'string'
        ? [{ type: 'text', text: message.content }]
        : []

    const textContent = normalizeAnthropicTextContent(contentBlocks, role)
    if (textContent.length > 0) {
      input.push({
        type: 'message',
        role,
        content: textContent
      })
    }

    if (role === 'assistant') {
      for (const block of contentBlocks) {
        if (!block || block.type !== 'tool_use' || !block.name) {
          continue
        }
        input.push({
          type: 'function_call',
          call_id: block.id || `call_${Date.now()}`,
          name: block.name,
          arguments: JSON.stringify(block.input || {})
        })
      }
      continue
    }

    for (const block of contentBlocks) {
      if (!block || block.type !== 'tool_result' || !block.tool_use_id) {
        continue
      }
      input.push({
        type: 'function_call_output',
        call_id: block.tool_use_id,
        output: parseToolResultOutput(block.content)
      })
    }
  }

  const result = {
    model: body.model,
    input,
    stream: options.forceStream === true ? true : body.stream === true,
    store: false
  }

  if (typeof body.temperature === 'number' && Number.isFinite(body.temperature)) {
    result.temperature = body.temperature
  }

  if (typeof body.top_p === 'number' && Number.isFinite(body.top_p)) {
    result.top_p = body.top_p
  }

  if (Array.isArray(body.stop_sequences) && body.stop_sequences.length > 0) {
    result.stop = body.stop_sequences
  }

  const instructions = normalizeSystemToInstructions(body.system)
  result.instructions = instructions || DEFAULT_BRIDGE_INSTRUCTIONS

  if (Array.isArray(body.tools) && body.tools.length > 0) {
    result.tools = body.tools
      .filter((tool) => tool && typeof tool === 'object' && tool.name)
      .map((tool) => ({
        type: 'function',
        name: tool.name,
        description: tool.description || '',
        parameters: tool.input_schema || { type: 'object', properties: {} }
      }))
  }

  const mappedToolChoice = mapAnthropicToolChoice(body.tool_choice)
  if (mappedToolChoice !== undefined) {
    result.tool_choice = mappedToolChoice
  }

  return result
}

module.exports = {
  buildResponsesRequestFromAnthropic
}
