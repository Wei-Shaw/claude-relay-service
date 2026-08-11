/**
 * Grok 协议增强：
 * - chat↔responses 桥
 * - tool protocol 规范化
 * - SSE ping 过滤
 * - compact 改写
 * - 405 / encrypted_content 判定
 * 对齐 sub2api openai_gateway_grok_* 核心契约
 */

const GROK_COMPACT_SUMMARY_PROMPT = `Your task is to produce a faithful, concise summary of the conversation so far so that a successor assistant can continue the work seamlessly after the earlier turns are discarded. The successor will see the user's original query plus this summary. Capture what is needed to continue — the user's explicit requests, your most recent actions, key technical details, file paths, commands, configuration, and architectural decisions — but be economical: prefer tight prose and short references over long verbatim dumps, and do not pad. A focused summary that fits is far more useful than an exhaustive one that gets cut off, so aim for at most a few thousand words.

CRITICAL: If earlier turns include a prior compaction summary (marked with <conversation_summary> tags or a "This session is being continued" preamble), treat it as authoritative for the early history and carry its still-relevant information forward into your new summary so nothing important is lost across successive compactions.

Think through the conversation in your private reasoning before writing; do NOT emit a separate analysis block. Output the final summary inside a single <summary>...</summary> block, organized into the following numbered sections. Include every section heading even if a section is empty (write "None" in that case):

1. Primary Request and Intent
2. Key Technical Concepts
3. Files and Code Sections
4. Errors and Fixes
5. Problem Solving
6. All User Messages
7. Pending Tasks
8. Current Work
9. Optional Next Step

IMPORTANT: Do NOT call or use any tools. Respond with ONLY the <summary>...</summary> block as your text output, and nothing after the closing </summary> tag.`

const stripSsePingFrames = (chunkText) => {
  if (!chunkText || typeof chunkText !== 'string') {
    return chunkText
  }
  const events = chunkText.split(/\n\n/)
  const kept = []
  for (const event of events) {
    if (!event.trim()) {
      continue
    }
    const lower = event.toLowerCase()
    if (
      lower.includes('event: ping') ||
      lower.includes('"type":"ping"') ||
      lower.includes('"type": "ping"') ||
      lower.includes('event: heartbeat')
    ) {
      continue
    }
    kept.push(event)
  }
  if (kept.length === 0) {
    return ''
  }
  return `${kept.join('\n\n')}\n\n`
}

const isChatBridgeEligible = (body) => {
  if (!body || typeof body !== 'object') {
    return { ok: false, reason: 'invalid_body' }
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { ok: false, reason: 'no_messages' }
  }
  if (body.functions) {
    return { ok: false, reason: 'legacy_functions' }
  }
  if (body.tools) {
    if (!Array.isArray(body.tools)) {
      return { ok: false, reason: 'invalid_tools' }
    }
    for (const tool of body.tools) {
      if (!tool || typeof tool !== 'object') {
        return { ok: false, reason: 'invalid_tool' }
      }
      // 允许 function 工具 + 官方 web_search/x_search 类型
      if (tool.type === 'function') {
        if (!tool.function?.name) {
          return { ok: false, reason: 'invalid_tool_function' }
        }
        continue
      }
      if (tool.type === 'web_search' || tool.type === 'x_search') {
        continue
      }
      return { ok: false, reason: 'unsupported_tool_type' }
    }
  }
  if (body.tool_choice !== undefined && body.tool_choice !== null) {
    if (typeof body.tool_choice === 'string') {
      if (!['auto', 'none', 'required'].includes(body.tool_choice)) {
        return { ok: false, reason: 'unsupported_tool_choice' }
      }
    } else if (typeof body.tool_choice === 'object') {
      if (body.tool_choice.type !== 'function' || !body.tool_choice.function?.name) {
        return { ok: false, reason: 'unsupported_tool_choice' }
      }
    } else {
      return { ok: false, reason: 'unsupported_tool_choice' }
    }
  }
  for (const message of body.messages) {
    if (!message || !message.role) {
      return { ok: false, reason: 'invalid_message' }
    }
    if (!['system', 'user', 'assistant', 'tool', 'developer'].includes(message.role)) {
      return { ok: false, reason: 'unsupported_role' }
    }
    if (message.role === 'tool' && !message.tool_call_id) {
      return { ok: false, reason: 'invalid_tool_call_id' }
    }
    if (message.role === 'assistant' && message.tool_calls) {
      if (!Array.isArray(message.tool_calls)) {
        return { ok: false, reason: 'invalid_tool_calls' }
      }
      for (const call of message.tool_calls) {
        if (!call?.id || call.type !== 'function' || !call.function?.name) {
          return { ok: false, reason: 'invalid_tool_calls' }
        }
      }
    }
  }
  return { ok: true, reason: 'eligible' }
}

// tool protocol：规范化 chat tools → responses tools
const normalizeToolsForResponses = (tools) => {
  if (!Array.isArray(tools)) {
    return tools
  }
  return tools.map((tool) => {
    if (tool.type === 'function' && tool.function) {
      return {
        type: 'function',
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
        strict: tool.function.strict
      }
    }
    return tool
  })
}

const normalizeToolChoiceForResponses = (toolChoice) => {
  if (toolChoice === undefined || toolChoice === null) {
    return toolChoice
  }
  if (typeof toolChoice === 'string') {
    return toolChoice
  }
  if (toolChoice.type === 'function' && toolChoice.function?.name) {
    return { type: 'function', name: toolChoice.function.name }
  }
  return toolChoice
}

// messages → responses input items（含 tool 调用/结果）
const messagesToResponsesInput = (messages) => {
  const input = []
  for (const message of messages || []) {
    if (!message) {
      continue
    }
    if (message.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: message.tool_call_id,
        output:
          typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content ?? '')
      })
      continue
    }
    if (
      message.role === 'assistant' &&
      Array.isArray(message.tool_calls) &&
      message.tool_calls.length
    ) {
      if (message.content) {
        input.push({
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text:
                typeof message.content === 'string'
                  ? message.content
                  : JSON.stringify(message.content)
            }
          ]
        })
      }
      for (const call of message.tool_calls) {
        input.push({
          type: 'function_call',
          call_id: call.id,
          name: call.function?.name,
          arguments:
            typeof call.function?.arguments === 'string'
              ? call.function.arguments
              : JSON.stringify(call.function?.arguments || {})
        })
      }
      continue
    }
    const role = message.role === 'developer' ? 'system' : message.role
    const contentType = role === 'assistant' ? 'output_text' : 'input_text'
    let text = ''
    if (typeof message.content === 'string') {
      text = message.content
    } else if (Array.isArray(message.content)) {
      // 多模态：尽量保留 image_url + 文本
      const parts = []
      for (const part of message.content) {
        if (!part) {
          continue
        }
        if (part.type === 'text' && part.text) {
          parts.push({ type: contentType, text: part.text })
        } else if (part.type === 'image_url') {
          const url = part.image_url?.url || part.image_url
          if (url) {
            parts.push({ type: 'input_image', image_url: url })
          }
        }
      }
      if (parts.length) {
        input.push({ type: 'message', role, content: parts })
        continue
      }
      text = JSON.stringify(message.content)
    } else if (message.content != null) {
      text = JSON.stringify(message.content)
    }
    input.push({
      type: 'message',
      role,
      content: [{ type: contentType, text }]
    })
  }
  return input
}

const chatToResponsesBody = (body) => {
  const mapped = {
    model: body.model,
    input: messagesToResponsesInput(body.messages),
    stream: body.stream !== false
  }
  if (body.temperature !== undefined) {
    mapped.temperature = body.temperature
  }
  if (body.top_p !== undefined) {
    mapped.top_p = body.top_p
  }
  if (body.max_tokens !== undefined) {
    mapped.max_output_tokens = body.max_tokens
  }
  if (body.max_completion_tokens !== undefined) {
    mapped.max_output_tokens = body.max_completion_tokens
  }
  if (body.tools) {
    mapped.tools = normalizeToolsForResponses(body.tools)
  }
  if (body.tool_choice !== undefined) {
    mapped.tool_choice = normalizeToolChoiceForResponses(body.tool_choice)
  }
  if (body.user) {
    mapped.user = body.user
  }
  if (body.metadata) {
    mapped.metadata = body.metadata
  }
  if (body.prompt_cache_key) {
    mapped.prompt_cache_key = body.prompt_cache_key
  }
  // Grok 不需要 store/include 的 Codex 专属语义
  mapped.store = false
  return mapped
}

const maybeInjectFreeCacheTools = (responsesBody, account) => {
  if (!account) {
    return responsesBody
  }
  const enabled =
    account.grokClientToolCacheEnabled === true || account.grokClientToolCacheEnabled === 'true'
  if (!enabled) {
    return responsesBody
  }
  if (Array.isArray(responsesBody.tools) && responsesBody.tools.length > 0) {
    return responsesBody
  }
  const plan = String(account.planType || account.subscriptionTier || '').toLowerCase()
  const isFree =
    plan === 'free' || plan === 'basic' || (plan.includes('free') && !plan.includes('super'))
  if (!isFree && plan !== '') {
    return responsesBody
  }
  return {
    ...responsesBody,
    tools: [{ type: 'web_search' }, { type: 'x_search' }]
  }
}

// /responses/compact → 普通 Responses 总结轮
const buildGrokCompactRequestBody = (body) => {
  const payload = { ...(body || {}) }
  let input = payload.input
  if (input == null) {
    input = []
  } else if (typeof input === 'string') {
    input = [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: input }]
      }
    ]
  } else if (!Array.isArray(input)) {
    input = [input]
  }
  input = [
    ...input,
    {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: GROK_COMPACT_SUMMARY_PROMPT }]
    }
  ]
  payload.input = input
  payload.include = ['reasoning.encrypted_content']
  payload.store = false
  payload.stream = false
  if (Array.isArray(payload.tools) && payload.tools.length > 0) {
    payload.tool_choice = 'none'
  }
  return payload
}

const convertGrokResponseToOpenAICompact = (responseBody) => {
  const response = responseBody?.response || responseBody || {}
  let summaryText = ''
  const output = Array.isArray(response.output) ? response.output : []
  for (const item of output) {
    if (item?.type === 'message' && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part?.type === 'output_text' && part.text) {
          summaryText += part.text
        }
      }
    }
  }
  // 提取 <summary>...</summary>
  const match = summaryText.match(/<summary>([\s\S]*?)<\/summary>/i)
  if (match) {
    summaryText = match[1].trim()
  }
  const compactItem = {
    id: `cmp_${Date.now()}`,
    type: 'compaction',
    summary: summaryText ? [{ type: 'summary_text', text: summaryText }] : []
  }
  return {
    id: response.id || `resp_compact_${Date.now()}`,
    object: 'response',
    created_at: response.created_at || Math.floor(Date.now() / 1000),
    status: 'completed',
    model: response.model,
    output: [compactItem],
    usage: response.usage || undefined
  }
}

// failover 判定
const shouldFailoverGrokStatus = (statusCode) => {
  if (!statusCode) {
    return false
  }
  if ([401, 402, 403, 405, 408, 409, 429, 500, 502, 503, 504, 529].includes(statusCode)) {
    return true
  }
  return statusCode >= 500
}

const isInvalidEncryptedContentError = (statusCode, body) => {
  if (statusCode !== 400) {
    return false
  }
  let code = ''
  let message = ''
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body
    if (!parsed) {
      return false
    }
    code = String(parsed.code || parsed.error?.code || '').trim()
    if (typeof parsed.error === 'string') {
      message = parsed.error
    } else {
      message = String(parsed.error?.message || parsed.message || '')
    }
  } catch {
    message = String(body || '')
  }
  const normalized = message.toLowerCase()
  if (!normalized) {
    return false
  }
  if (code.toLowerCase() === 'invalid_encrypted_content') {
    return true
  }
  if (code && !['invalid-argument', 'invalid_argument'].includes(code.toLowerCase())) {
    return false
  }
  return (
    normalized.includes('encrypted_content') &&
    (normalized.includes('decrypt') || normalized.includes('unmodified'))
  )
}

// 剥离 reasoning.encrypted_content 以便同号重试
const stripEncryptedReasoningContent = (body) => {
  if (!body || typeof body !== 'object') {
    return { body, changed: false }
  }
  const next = JSON.parse(JSON.stringify(body))
  let changed = false
  const stripItems = (items) => {
    if (!Array.isArray(items)) {
      return items
    }
    return items.map((item) => {
      if (item && item.type === 'reasoning' && item.encrypted_content) {
        changed = true
        const copy = { ...item }
        delete copy.encrypted_content
        return copy
      }
      return item
    })
  }
  if (Array.isArray(next.input)) {
    next.input = stripItems(next.input)
  }
  return { body: next, changed }
}

const videoSessionHash = (requestId, apiKeyId) => {
  const crypto = require('crypto')
  return crypto
    .createHash('sha256')
    .update(`grok-video:${apiKeyId || 'anon'}:${requestId}`)
    .digest('hex')
}

module.exports = {
  stripSsePingFrames,
  isChatBridgeEligible,
  chatToResponsesBody,
  maybeInjectFreeCacheTools,
  normalizeToolsForResponses,
  messagesToResponsesInput,
  buildGrokCompactRequestBody,
  convertGrokResponseToOpenAICompact,
  shouldFailoverGrokStatus,
  isInvalidEncryptedContentError,
  stripEncryptedReasoningContent,
  videoSessionHash,
  GROK_COMPACT_SUMMARY_PROMPT
}
