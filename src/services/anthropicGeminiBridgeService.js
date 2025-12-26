const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const logger = require('../utils/logger')
const { getProjectRoot } = require('../utils/projectPaths')
const geminiAccountService = require('./geminiAccountService')
const unifiedGeminiScheduler = require('./unifiedGeminiScheduler')
const sessionHelper = require('../utils/sessionHelper')
const apiKeyService = require('./apiKeyService')
const { updateRateLimitCounters } = require('../utils/rateLimitHelper')
const { parseSSELine } = require('../utils/sseParser')
const { sanitizeUpstreamError } = require('../utils/errorSanitizer')
const { cleanJsonSchemaForGemini } = require('../utils/geminiSchemaCleaner')
const {
  dumpAnthropicNonStreamResponse,
  dumpAnthropicStreamSummary
} = require('../utils/anthropicResponseDump')

const SUPPORTED_VENDORS = new Set(['gemini-cli', 'antigravity'])
const SYSTEM_REMINDER_PREFIX = '<system-reminder>'
const TOOLS_DUMP_ENV = 'ANTHROPIC_DEBUG_TOOLS_DUMP'
const TOOLS_DUMP_FILENAME = 'anthropic-tools-dump.jsonl'
const TEXT_TOOL_FALLBACK_ENV = 'ANTHROPIC_TEXT_TOOL_FALLBACK'
const THOUGHT_SIGNATURE_FALLBACK = 'skip_thought_signature_validator'

function ensureAntigravityProjectId(account) {
  if (account.projectId) {
    return account.projectId
  }
  if (account.tempProjectId) {
    return account.tempProjectId
  }
  return `ag-${crypto.randomBytes(8).toString('hex')}`
}

function extractAnthropicText(content) {
  if (content === null || content === undefined) {
    return ''
  }
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .filter((part) => part && part.type === 'text')
    .map((part) => part.text || '')
    .join('')
}

function shouldSkipText(text) {
  if (!text || typeof text !== 'string') {
    return true
  }
  return text.trimStart().startsWith(SYSTEM_REMINDER_PREFIX)
}

function buildSystemParts(system) {
  const parts = []
  if (!system) {
    return parts
  }
  if (Array.isArray(system)) {
    for (const part of system) {
      if (!part || part.type !== 'text') {
        continue
      }
      const text = extractAnthropicText(part.text || '')
      if (text && !shouldSkipText(text)) {
        parts.push({ text })
      }
    }
    return parts
  }
  const text = extractAnthropicText(system)
  if (text && !shouldSkipText(text)) {
    parts.push({ text })
  }
  return parts
}

function buildToolUseIdToNameMap(messages) {
  const toolUseIdToName = new Map()

  for (const message of messages || []) {
    if (message?.role !== 'assistant') {
      continue
    }
    const content = message?.content
    if (!Array.isArray(content)) {
      continue
    }
    for (const part of content) {
      if (!part || part.type !== 'tool_use') {
        continue
      }
      if (part.id && part.name) {
        toolUseIdToName.set(part.id, part.name)
      }
    }
  }

  return toolUseIdToName
}

function normalizeToolUseInput(input) {
  if (input === null || input === undefined) {
    return {}
  }
  if (typeof input === 'object') {
    return input
  }
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) {
      return {}
    }
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    } catch (_) {
      return {}
    }
  }
  return {}
}

const MAX_ANTIGRAVITY_TOOL_RESULT_CHARS = 200000

function truncateText(text, maxChars) {
  if (!text || typeof text !== 'string') {
    return ''
  }
  if (text.length <= maxChars) {
    return text
  }
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`
}

function sanitizeToolResultBlocksForAntigravity(blocks) {
  const cleaned = []
  let usedChars = 0
  let removedImage = false

  for (const block of blocks) {
    if (!block || typeof block !== 'object') {
      continue
    }

    if (
      block.type === 'image' &&
      block.source?.type === 'base64' &&
      typeof block.source?.data === 'string'
    ) {
      removedImage = true
      continue
    }

    if (block.type === 'text' && typeof block.text === 'string') {
      const remaining = MAX_ANTIGRAVITY_TOOL_RESULT_CHARS - usedChars
      if (remaining <= 0) {
        break
      }
      const text = truncateText(block.text, remaining)
      cleaned.push({ ...block, text })
      usedChars += text.length
      continue
    }

    cleaned.push(block)
    usedChars += 100
    if (usedChars >= MAX_ANTIGRAVITY_TOOL_RESULT_CHARS) {
      break
    }
  }

  if (removedImage) {
    cleaned.push({
      type: 'text',
      text: '[image omitted to fit Antigravity prompt limits; use the file path in the previous text block]'
    })
  }

  return cleaned
}

function normalizeToolResultContent(content, { vendor = null } = {}) {
  if (content === null || content === undefined) {
    return ''
  }
  if (typeof content === 'string') {
    if (vendor === 'antigravity') {
      return truncateText(content, MAX_ANTIGRAVITY_TOOL_RESULT_CHARS)
    }
    return content
  }
  // Claude Code 的 tool_result.content 通常是 content blocks 数组（例如 [{type:"text",text:"..."}]）。
  // 为对齐 CLIProxyAPI/Antigravity 的行为，这里优先保留原始 JSON 结构（数组/对象），
  // 避免上游将其视为“无效 tool_result”从而触发 tool_use concurrency 400。
  if (Array.isArray(content) || (content && typeof content === 'object')) {
    if (vendor === 'antigravity' && Array.isArray(content)) {
      return sanitizeToolResultBlocksForAntigravity(content)
    }
    return content
  }
  return ''
}

function normalizeAnthropicMessages(messages, { vendor = null } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages
  }

  const pendingToolUseIds = []
  const isIgnorableTrailingText = (part) => {
    if (!part || part.type !== 'text') {
      return false
    }
    if (typeof part.text !== 'string') {
      return false
    }
    const trimmed = part.text.trim()
    if (trimmed === '' || trimmed === '(no content)') {
      return true
    }
    if (part.cache_control?.type === 'ephemeral' && trimmed === '(no content)') {
      return true
    }
    return false
  }

  const normalizeAssistantThinkingOrderForVendor = (parts) => {
    if (vendor !== 'antigravity') {
      return parts
    }
    const thinkingBlocks = []
    const otherBlocks = []
    for (const part of parts) {
      if (!part) {
        continue
      }
      if (part.type === 'thinking' || part.type === 'redacted_thinking') {
        thinkingBlocks.push(part)
        continue
      }
      if (isIgnorableTrailingText(part)) {
        continue
      }
      otherBlocks.push(part)
    }
    if (thinkingBlocks.length === 0) {
      return otherBlocks
    }
    return [...thinkingBlocks, ...otherBlocks]
  }

  const stripNonToolPartsAfterToolUse = (parts) => {
    let seenToolUse = false
    const cleaned = []
    for (const part of parts) {
      if (!part) {
        continue
      }
      if (part.type === 'tool_use') {
        seenToolUse = true
        cleaned.push(part)
        continue
      }
      if (!seenToolUse) {
        cleaned.push(part)
        continue
      }
      if (isIgnorableTrailingText(part)) {
        continue
      }
    }
    return cleaned
  }

  const normalized = []

  for (const message of messages) {
    if (!message || !Array.isArray(message.content)) {
      normalized.push(message)
      continue
    }

    let parts = message.content.filter(Boolean)
    if (message.role === 'assistant') {
      parts = normalizeAssistantThinkingOrderForVendor(parts)
    }

    if (vendor === 'antigravity' && message.role === 'assistant') {
      if (pendingToolUseIds.length > 0) {
        normalized.push({
          role: 'user',
          content: pendingToolUseIds.map((toolUseId) => ({
            type: 'tool_result',
            tool_use_id: toolUseId,
            is_error: true,
            content: [
              {
                type: 'text',
                text: '[tool_result missing; tool execution interrupted]'
              }
            ]
          }))
        })
        pendingToolUseIds.length = 0
      }

      const stripped = stripNonToolPartsAfterToolUse(parts)
      const toolUseIds = stripped
        .filter((part) => part?.type === 'tool_use' && typeof part.id === 'string')
        .map((part) => part.id)
      if (toolUseIds.length > 0) {
        pendingToolUseIds.push(...toolUseIds)
      }

      normalized.push({ ...message, content: stripped })
      continue
    }

    if (vendor === 'antigravity' && message.role === 'user' && pendingToolUseIds.length > 0) {
      const toolResults = parts.filter((p) => p.type === 'tool_result')
      const toolResultIds = new Set(
        toolResults.map((p) => p.tool_use_id).filter((id) => typeof id === 'string')
      )
      const missing = pendingToolUseIds.filter((id) => !toolResultIds.has(id))
      if (missing.length > 0) {
        const synthetic = missing.map((toolUseId) => ({
          type: 'tool_result',
          tool_use_id: toolUseId,
          is_error: true,
          content: [
            {
              type: 'text',
              text: '[tool_result missing; tool execution interrupted]'
            }
          ]
        }))
        parts = [...toolResults, ...synthetic, ...parts.filter((p) => p.type !== 'tool_result')]
      }
      pendingToolUseIds.length = 0
    }

    if (message.role !== 'user') {
      normalized.push({ ...message, content: parts })
      continue
    }

    const toolResults = parts.filter((p) => p.type === 'tool_result')
    if (toolResults.length === 0) {
      normalized.push({ ...message, content: parts })
      continue
    }

    const nonToolResults = parts.filter((p) => p.type !== 'tool_result')
    if (nonToolResults.length === 0) {
      normalized.push({ ...message, content: toolResults })
      continue
    }

    // Claude Code 可能把 tool_result 和下一条用户文本合并在同一个 user message 中。
    // 但上游（Antigravity/Claude）会按 Anthropic 规则校验：tool_use 后的下一条 message
    // 必须只包含 tool_result blocks。这里做兼容拆分，避免 400 tool-use concurrency。
    normalized.push({ ...message, content: toolResults })
    normalized.push({ ...message, content: nonToolResults })
  }

  if (vendor === 'antigravity' && pendingToolUseIds.length > 0) {
    normalized.push({
      role: 'user',
      content: pendingToolUseIds.map((toolUseId) => ({
        type: 'tool_result',
        tool_use_id: toolUseId,
        is_error: true,
        content: [
          {
            type: 'text',
            text: '[tool_result missing; tool execution interrupted]'
          }
        ]
      }))
    })
    pendingToolUseIds.length = 0
  }

  return normalized
}

function convertAnthropicToolsToGeminiTools(tools, { vendor = null } = {}) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return null
  }

  // 说明：Gemini / Antigravity 对工具 schema 的接受程度不同；这里做“尽可能兼容”的最小清洗，降低 400 概率。
  const sanitizeSchemaForFunctionDeclarations = (schema) => {
    const allowedKeys = new Set([
      'type',
      'properties',
      'required',
      'description',
      'enum',
      'items',
      'anyOf',
      'oneOf',
      'allOf',
      'additionalProperties',
      'minimum',
      'maximum',
      'minItems',
      'maxItems',
      'minLength',
      'maxLength'
    ])

    if (schema === null || schema === undefined) {
      return null
    }

    // primitives: keep as-is (e.g. type/description/nullable/minimum...)
    if (typeof schema !== 'object') {
      return schema
    }

    if (Array.isArray(schema)) {
      return schema
        .map((item) => sanitizeSchemaForFunctionDeclarations(item))
        .filter((item) => item !== null && item !== undefined)
    }

    const sanitized = {}
    for (const [key, value] of Object.entries(schema)) {
      // Antigravity/Cloud Code 的 function_declarations.parameters 不接受 $schema / $id 等元字段
      if (key === '$schema' || key === '$id') {
        continue
      }
      // 去除常见的非必要字段，减少上游 schema 校验失败概率
      if (key === 'title' || key === 'default' || key === 'examples' || key === 'example') {
        continue
      }
      // 上游对 JSON Schema "format" 支持不稳定（特别是 format=uri），直接移除以降低 400 概率
      if (key === 'format') {
        continue
      }
      if (!allowedKeys.has(key)) {
        continue
      }

      if (key === 'properties') {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const props = {}
          for (const [propName, propSchema] of Object.entries(value)) {
            const sanitizedProp = sanitizeSchemaForFunctionDeclarations(propSchema)
            if (sanitizedProp && typeof sanitizedProp === 'object') {
              props[propName] = sanitizedProp
            }
          }
          sanitized.properties = props
        }
        continue
      }

      if (key === 'required') {
        if (Array.isArray(value)) {
          const req = value.filter((item) => typeof item === 'string')
          if (req.length > 0) {
            sanitized.required = req
          }
        }
        continue
      }

      if (key === 'enum') {
        if (Array.isArray(value)) {
          const en = value.filter(
            (item) =>
              typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
          )
          if (en.length > 0) {
            sanitized.enum = en
          }
        }
        continue
      }

      if (key === 'additionalProperties') {
        if (typeof value === 'boolean') {
          sanitized.additionalProperties = value
        } else if (value && typeof value === 'object') {
          const ap = sanitizeSchemaForFunctionDeclarations(value)
          if (ap && typeof ap === 'object') {
            sanitized.additionalProperties = ap
          }
        }
        continue
      }

      const sanitizedValue = sanitizeSchemaForFunctionDeclarations(value)
      if (sanitizedValue === null || sanitizedValue === undefined) {
        continue
      }
      sanitized[key] = sanitizedValue
    }

    // 兜底：确保 schema 至少是一个 object schema
    if (!sanitized.type) {
      if (sanitized.properties || sanitized.required || sanitized.additionalProperties) {
        sanitized.type = 'object'
      } else if (sanitized.enum) {
        sanitized.type = 'string'
      } else {
        sanitized.type = 'object'
        sanitized.properties = {}
      }
    }

    if (sanitized.type === 'object' && !sanitized.properties) {
      sanitized.properties = {}
    }

    return sanitized
  }

  const functionDeclarations = tools
    .map((tool) => {
      const toolDef = tool?.custom && typeof tool.custom === 'object' ? tool.custom : tool
      if (!toolDef || !toolDef.name) {
        return null
      }

      const schema =
        vendor === 'antigravity'
          ? cleanJsonSchemaForGemini(toolDef.input_schema)
          : sanitizeSchemaForFunctionDeclarations(toolDef.input_schema) || {
              type: 'object',
              properties: {}
            }

      const baseDecl = {
        name: toolDef.name,
        description: toolDef.description || ''
      }

      // CLIProxyAPI/Antigravity 侧使用 parametersJsonSchema（而不是 parameters）。
      if (vendor === 'antigravity') {
        return { ...baseDecl, parametersJsonSchema: schema }
      }
      return { ...baseDecl, parameters: schema }
    })
    .filter(Boolean)

  if (functionDeclarations.length === 0) {
    return null
  }

  return [
    {
      functionDeclarations
    }
  ]
}

function convertAnthropicToolChoiceToGeminiToolConfig(toolChoice) {
  if (!toolChoice || typeof toolChoice !== 'object') {
    return null
  }

  const { type } = toolChoice
  if (!type) {
    return null
  }

  if (type === 'auto') {
    return { functionCallingConfig: { mode: 'AUTO' } }
  }

  if (type === 'any') {
    return { functionCallingConfig: { mode: 'ANY' } }
  }

  if (type === 'tool') {
    const { name } = toolChoice
    if (!name) {
      return { functionCallingConfig: { mode: 'ANY' } }
    }
    return {
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: [name]
      }
    }
  }

  if (type === 'none') {
    return { functionCallingConfig: { mode: 'NONE' } }
  }

  return null
}

function convertAnthropicMessagesToGeminiContents(
  messages,
  toolUseIdToName,
  { vendor = null } = {}
) {
  const contents = []
  for (const message of messages || []) {
    const role = message?.role === 'assistant' ? 'model' : 'user'

    const content = message?.content
    const parts = []

    if (typeof content === 'string') {
      const text = extractAnthropicText(content)
      if (text && !shouldSkipText(text)) {
        parts.push({ text })
      }
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (!part || !part.type) {
          continue
        }

        if (part.type === 'text') {
          const text = extractAnthropicText(part.text || '')
          if (text && !shouldSkipText(text)) {
            parts.push({ text })
          }
          continue
        }

        if (part.type === 'thinking') {
          const thinkingText = extractAnthropicText(part.thinking || part.text || '')
          if (vendor === 'antigravity') {
            const hasThinkingText = thinkingText && !shouldSkipText(thinkingText)
            const hasSignature = typeof part.signature === 'string' && part.signature

            // Claude Code 有时会发送空的 thinking block（无 thinking / 无 signature）。
            // 传给 Antigravity 会变成仅含 thoughtSignature 的 part，容易触发 INVALID_ARGUMENT。
            if (!hasThinkingText && !hasSignature) {
              continue
            }

            const signature = hasSignature ? part.signature : THOUGHT_SIGNATURE_FALLBACK
            const thoughtPart = { thought: true }
            if (hasThinkingText) {
              thoughtPart.text = thinkingText
            }
            if (signature) {
              thoughtPart.thoughtSignature = signature
            }
            parts.push(thoughtPart)
          } else if (thinkingText && !shouldSkipText(thinkingText)) {
            parts.push({ text: thinkingText })
          }
          continue
        }

        if (part.type === 'image') {
          const source = part.source || {}
          if (source.type === 'base64' && source.data) {
            const mediaType = source.media_type || source.mediaType || 'application/octet-stream'
            const inlineData =
              vendor === 'antigravity'
                ? { mime_type: mediaType, data: source.data }
                : { mimeType: mediaType, data: source.data }
            parts.push({ inlineData })
          }
          continue
        }

        if (part.type === 'tool_use') {
          if (part.name) {
            const toolCallId = typeof part.id === 'string' && part.id ? part.id : undefined
            const args = normalizeToolUseInput(part.input)
            parts.push({
              functionCall: {
                ...(vendor === 'antigravity' && toolCallId ? { id: toolCallId } : {}),
                name: part.name,
                args
              }
            })
          }
          continue
        }

        if (part.type === 'tool_result') {
          const toolUseId = part.tool_use_id
          const toolName = toolUseId ? toolUseIdToName.get(toolUseId) : null
          if (!toolName) {
            continue
          }

          const raw = normalizeToolResultContent(part.content, { vendor })

          let parsedResponse = null
          if (raw && typeof raw === 'string') {
            try {
              parsedResponse = JSON.parse(raw)
            } catch (_) {
              parsedResponse = null
            }
          }

          if (vendor === 'antigravity') {
            const toolCallId = typeof toolUseId === 'string' && toolUseId ? toolUseId : undefined
            const result = parsedResponse !== null ? parsedResponse : raw || ''

            parts.push({
              functionResponse: {
                ...(toolCallId ? { id: toolCallId } : {}),
                name: toolName,
                response: { result }
              }
            })
          } else {
            const response =
              parsedResponse !== null
                ? parsedResponse
                : {
                    content: raw || '',
                    is_error: part.is_error === true
                  }

            parts.push({
              functionResponse: {
                name: toolName,
                response
              }
            })
          }
        }
      }
    }

    if (parts.length === 0) {
      continue
    }
    contents.push({
      role,
      parts
    })
  }
  return contents
}

function buildGeminiRequestFromAnthropic(body, baseModel, { vendor = null } = {}) {
  const normalizedMessages = normalizeAnthropicMessages(body.messages || [], { vendor })
  const toolUseIdToName = buildToolUseIdToNameMap(normalizedMessages || [])
  const contents = convertAnthropicMessagesToGeminiContents(
    normalizedMessages || [],
    toolUseIdToName,
    {
      vendor
    }
  )
  const systemParts = buildSystemParts(body.system)

  const temperature = typeof body.temperature === 'number' ? body.temperature : 1
  const maxTokens = Number.isFinite(body.max_tokens) ? body.max_tokens : 4096

  const generationConfig = {
    temperature,
    maxOutputTokens: maxTokens,
    candidateCount: 1
  }

  if (typeof body.top_p === 'number') {
    generationConfig.topP = body.top_p
  }
  if (typeof body.top_k === 'number') {
    generationConfig.topK = body.top_k
  }

  if (vendor === 'antigravity' && body?.thinking && typeof body.thinking === 'object') {
    if (body.thinking.type === 'enabled') {
      const budgetRaw = Number(body.thinking.budget_tokens)
      if (Number.isFinite(budgetRaw)) {
        generationConfig.thinkingConfig = {
          thinkingBudget: Math.trunc(budgetRaw),
          include_thoughts: true
        }
      }
    }
  }

  const geminiRequestBody = {
    contents,
    generationConfig
  }

  if (systemParts.length > 0) {
    geminiRequestBody.systemInstruction =
      vendor === 'antigravity' ? { role: 'user', parts: systemParts } : { parts: systemParts }
  }

  const geminiTools = convertAnthropicToolsToGeminiTools(body.tools, { vendor })
  if (geminiTools) {
    geminiRequestBody.tools = geminiTools
  }

  const toolConfig = convertAnthropicToolChoiceToGeminiToolConfig(body.tool_choice)
  if (toolConfig) {
    geminiRequestBody.toolConfig = toolConfig
  } else if (geminiTools) {
    // Anthropic 的默认语义是 tools 存在且未设置 tool_choice 时为 auto。
    // Gemini/Antigravity 的 function calling 默认可能不会启用，因此显式设置为 AUTO，避免“永远不产出 tool_use”。
    geminiRequestBody.toolConfig = { functionCallingConfig: { mode: 'AUTO' } }
  }

  return { model: baseModel, request: geminiRequestBody }
}

function extractGeminiText(payload, { includeThought = false } = {}) {
  const candidate = payload?.candidates?.[0]
  const parts = candidate?.content?.parts
  if (!Array.isArray(parts)) {
    return ''
  }
  return parts
    .filter(
      (part) => typeof part?.text === 'string' && part.text && (includeThought || !part.thought)
    )
    .map((part) => part.text)
    .filter(Boolean)
    .join('')
}

function extractGeminiThoughtText(payload) {
  const candidate = payload?.candidates?.[0]
  const parts = candidate?.content?.parts
  if (!Array.isArray(parts)) {
    return ''
  }
  return parts
    .filter((part) => part?.thought && typeof part?.text === 'string' && part.text)
    .map((part) => part.text)
    .filter(Boolean)
    .join('')
}

function extractGeminiThoughtSignature(payload) {
  const candidate = payload?.candidates?.[0]
  const parts = candidate?.content?.parts
  if (!Array.isArray(parts)) {
    return ''
  }
  for (const part of parts) {
    if (!part || !part.thought) {
      continue
    }
    const signature = part.thoughtSignature || part.thought_signature || part.signature || ''
    if (signature) {
      return signature
    }
  }
  return ''
}

function resolveUsageOutputTokens(usageMetadata) {
  if (!usageMetadata || typeof usageMetadata !== 'object') {
    return 0
  }
  const promptTokens = usageMetadata.promptTokenCount || 0
  const candidateTokens = usageMetadata.candidatesTokenCount || 0
  const thoughtTokens = usageMetadata.thoughtsTokenCount || 0
  const totalTokens = usageMetadata.totalTokenCount || 0

  let outputTokens = candidateTokens + thoughtTokens
  if (outputTokens === 0 && totalTokens > 0) {
    outputTokens = totalTokens - promptTokens
    if (outputTokens < 0) {
      outputTokens = 0
    }
  }
  return outputTokens
}

function isEnvEnabled(value) {
  if (!value) {
    return false
  }
  const normalized = String(value).trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on'
}

function tryExtractWriteToolFromText(text, fallbackCwd) {
  if (!text || typeof text !== 'string') {
    return null
  }

  const lines = text.split(/\r?\n/)
  const index = lines.findIndex((line) => /^\s*Write\s*:\s*/i.test(line))
  if (index < 0) {
    return null
  }

  const header = lines[index]
  const rawPath = header.replace(/^\s*Write\s*:\s*/i, '').trim()
  if (!rawPath) {
    return null
  }

  const content = lines.slice(index + 1).join('\n')
  const prefixText = lines.slice(0, index).join('\n').trim()

  // Claude Code 的 Write 工具要求绝对路径。若模型给的是相对路径，仅在本地运行代理时可用；
  // 这里提供一个可选回退：使用服务端 cwd 解析。
  let filePath = rawPath
  if (!path.isAbsolute(filePath) && fallbackCwd) {
    filePath = path.resolve(fallbackCwd, filePath)
  }

  return {
    prefixText: prefixText || '',
    tool: {
      name: 'Write',
      input: {
        file_path: filePath,
        content: content || ''
      }
    }
  }
}

function mapGeminiFinishReasonToAnthropicStopReason(finishReason) {
  const normalized = (finishReason || '').toString().toUpperCase()
  if (normalized === 'MAX_TOKENS') {
    return 'max_tokens'
  }
  return 'end_turn'
}

function buildToolUseId() {
  return `toolu_${crypto.randomBytes(10).toString('hex')}`
}

function stableJsonStringify(value) {
  if (value === null || value === undefined) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort()
    const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`)
    return `{${pairs.join(',')}}`
  }
  return JSON.stringify(value)
}

function extractGeminiParts(payload) {
  const candidate = payload?.candidates?.[0]
  const parts = candidate?.content?.parts
  if (!Array.isArray(parts)) {
    return []
  }
  return parts
}

function convertGeminiPayloadToAnthropicContent(payload) {
  const parts = extractGeminiParts(payload)
  const content = []
  let currentText = ''
  let currentThinking = ''
  let thinkingSignature = ''

  const flushText = () => {
    if (!currentText) {
      return
    }
    content.push({ type: 'text', text: currentText })
    currentText = ''
  }

  const flushThinking = () => {
    if (!currentThinking && !thinkingSignature) {
      return
    }
    const block = { type: 'thinking', thinking: currentThinking }
    if (thinkingSignature) {
      block.signature = thinkingSignature
    }
    content.push(block)
    currentThinking = ''
    thinkingSignature = ''
  }

  for (const part of parts) {
    const isThought = part?.thought === true
    if (isThought) {
      flushText()
      const signature = part.thoughtSignature || part.thought_signature || part.signature || ''
      if (signature) {
        thinkingSignature = signature
      }
      if (typeof part?.text === 'string' && part.text) {
        currentThinking += part.text
      }
      continue
    }

    if (typeof part?.text === 'string' && part.text) {
      flushThinking()
      currentText += part.text
      continue
    }

    const functionCall = part?.functionCall
    if (functionCall?.name) {
      flushThinking()
      flushText()
      const toolUseId =
        typeof functionCall.id === 'string' && functionCall.id ? functionCall.id : buildToolUseId()
      content.push({
        type: 'tool_use',
        id: toolUseId,
        name: functionCall.name,
        input: functionCall.args || {}
      })
    }
  }

  flushThinking()
  flushText()
  const thinkingBlocks = content.filter(
    (b) => b && (b.type === 'thinking' || b.type === 'redacted_thinking')
  )
  if (thinkingBlocks.length > 0) {
    const firstType = content?.[0]?.type
    if (firstType !== 'thinking' && firstType !== 'redacted_thinking') {
      const others = content.filter(
        (b) => b && b.type !== 'thinking' && b.type !== 'redacted_thinking'
      )
      return [...thinkingBlocks, ...others]
    }
  }
  return content
}

function buildAnthropicError(message) {
  return {
    type: 'error',
    error: {
      type: 'api_error',
      message: message || 'Upstream error'
    }
  }
}

function shouldRetryWithoutTools(sanitizedError) {
  const message = (sanitizedError?.upstreamMessage || sanitizedError?.message || '').toLowerCase()
  if (!message) {
    return false
  }
  return (
    message.includes('json schema is invalid') ||
    message.includes('invalid json payload') ||
    message.includes('tools.') ||
    message.includes('function_declarations')
  )
}

function stripToolsFromRequest(requestData) {
  if (!requestData || !requestData.request) {
    return requestData
  }
  const nextRequest = {
    ...requestData,
    request: {
      ...requestData.request
    }
  }
  delete nextRequest.request.tools
  delete nextRequest.request.toolConfig
  return nextRequest
}

function writeAnthropicSseEvent(res, event, data) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function dumpToolsPayload({ vendor, model, tools, toolChoice }) {
  if (!isEnvEnabled(process.env[TOOLS_DUMP_ENV])) {
    return
  }
  if (!Array.isArray(tools) || tools.length === 0) {
    return
  }
  if (vendor !== 'antigravity') {
    return
  }

  const filePath = path.join(getProjectRoot(), TOOLS_DUMP_FILENAME)
  const payload = {
    timestamp: new Date().toISOString(),
    vendor,
    model,
    tool_choice: toolChoice || null,
    tools
  }

  try {
    fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, 'utf8')
    logger.warn(`🧾 Tools payload dumped to ${filePath}`)
  } catch (error) {
    logger.warn('Failed to dump tools payload:', error.message)
  }
}

async function applyRateLimitTracking(rateLimitInfo, usageSummary, model, context = '') {
  if (!rateLimitInfo) {
    return
  }

  const label = context ? ` (${context})` : ''

  try {
    const { totalTokens, totalCost } = await updateRateLimitCounters(
      rateLimitInfo,
      usageSummary,
      model
    )
    if (totalTokens > 0) {
      logger.api(`📊 Updated rate limit token count${label}: +${totalTokens} tokens`)
    }
    if (typeof totalCost === 'number' && totalCost > 0) {
      logger.api(`💰 Updated rate limit cost count${label}: +$${totalCost.toFixed(6)}`)
    }
  } catch (error) {
    logger.error(`❌ Failed to update rate limit counters${label}:`, error)
  }
}

async function handleAnthropicMessagesToGemini(req, res, { vendor, baseModel }) {
  if (!SUPPORTED_VENDORS.has(vendor)) {
    return res.status(400).json(buildAnthropicError(`Unsupported vendor: ${vendor}`))
  }

  dumpToolsPayload({
    vendor,
    model: baseModel,
    tools: req.body?.tools || null,
    toolChoice: req.body?.tool_choice || null
  })

  const pickFallbackModel = (account, requestedModel) => {
    const supportedModels = Array.isArray(account?.supportedModels) ? account.supportedModels : []
    if (supportedModels.length === 0) {
      return requestedModel
    }

    const normalize = (m) => String(m || '').replace(/^models\//, '')
    const requested = normalize(requestedModel)
    const normalizedSupported = supportedModels.map(normalize)

    if (normalizedSupported.includes(requested)) {
      return requestedModel
    }

    // Claude Code 常见探测模型：优先回退到 Opus 4.5（如果账号支持）
    const preferred = ['claude-opus-4-5', 'claude-sonnet-4-5-thinking', 'claude-sonnet-4-5']
    for (const candidate of preferred) {
      if (normalizedSupported.includes(candidate)) {
        return candidate
      }
    }

    return normalizedSupported[0]
  }

  const isStream = req.body?.stream === true
  const sessionHash = sessionHelper.generateSessionHash(req.body)
  const upstreamSessionId = sessionHash || req.apiKey?.id || null

  let accountSelection
  try {
    accountSelection = await unifiedGeminiScheduler.selectAccountForApiKey(
      req.apiKey,
      sessionHash,
      baseModel,
      { oauthProvider: vendor }
    )
  } catch (error) {
    logger.error('Failed to select Gemini account (via /v1/messages):', error)
    return res
      .status(503)
      .json(buildAnthropicError(error.message || 'No available Gemini accounts'))
  }

  const { accountId, accountType } = accountSelection
  if (accountType !== 'gemini') {
    return res
      .status(400)
      .json(buildAnthropicError('Only Gemini OAuth accounts are supported for this vendor'))
  }

  const account = await geminiAccountService.getAccount(accountId)
  if (!account) {
    return res.status(503).json(buildAnthropicError('Gemini OAuth account not found'))
  }

  await geminiAccountService.markAccountUsed(account.id)

  let proxyConfig = null
  if (account.proxy) {
    try {
      proxyConfig = typeof account.proxy === 'string' ? JSON.parse(account.proxy) : account.proxy
    } catch (e) {
      logger.warn('Failed to parse proxy configuration:', e)
    }
  }

  const client = await geminiAccountService.getOauthClient(
    account.accessToken,
    account.refreshToken,
    proxyConfig,
    account.oauthProvider
  )

  let { projectId } = account
  if (vendor === 'antigravity') {
    projectId = ensureAntigravityProjectId(account)
    if (!account.projectId && account.tempProjectId !== projectId) {
      await geminiAccountService.updateTempProjectId(account.id, projectId)
      account.tempProjectId = projectId
    }
  }

  const effectiveModel = pickFallbackModel(account, baseModel)
  if (effectiveModel !== baseModel) {
    logger.warn('⚠️ Requested model not supported by account, falling back', {
      requestedModel: baseModel,
      effectiveModel,
      vendor,
      accountId
    })
  }

  let requestData = buildGeminiRequestFromAnthropic(req.body, effectiveModel, { vendor })

  // Antigravity 上游对 function calling 的启用/校验更严格：参考实现普遍使用 VALIDATED。
  // 这里仅在 tools 存在且未显式禁用（tool_choice=none）时应用，避免破坏原始语义。
  if (
    vendor === 'antigravity' &&
    Array.isArray(requestData?.request?.tools) &&
    requestData.request.tools.length > 0
  ) {
    const existingCfg = requestData?.request?.toolConfig?.functionCallingConfig || null
    const mode = existingCfg?.mode
    if (mode !== 'NONE') {
      const nextCfg = { ...(existingCfg || {}), mode: 'VALIDATED' }
      requestData = {
        ...requestData,
        request: {
          ...requestData.request,
          toolConfig: { functionCallingConfig: nextCfg }
        }
      }
    }
  }

  // Antigravity 默认启用 tools（对齐 CLIProxyAPI）。若上游拒绝 schema，会在下方自动重试去掉 tools/toolConfig。

  const abortController = new AbortController()
  req.on('close', () => {
    if (!abortController.signal.aborted) {
      abortController.abort()
    }
  })

  if (!isStream) {
    try {
      const attemptRequest = async (payload) => {
        if (vendor === 'antigravity') {
          return await geminiAccountService.generateContentAntigravity(
            client,
            payload,
            null,
            projectId,
            upstreamSessionId,
            proxyConfig
          )
        }
        return await geminiAccountService.generateContent(
          client,
          payload,
          null,
          projectId,
          upstreamSessionId,
          proxyConfig
        )
      }

      let rawResponse
      try {
        rawResponse = await attemptRequest(requestData)
      } catch (error) {
        const sanitized = sanitizeUpstreamError(error)
        if (shouldRetryWithoutTools(sanitized) && requestData.request?.tools) {
          logger.warn('⚠️ Tool schema rejected by upstream, retrying without tools', {
            vendor,
            accountId
          })
          rawResponse = await attemptRequest(stripToolsFromRequest(requestData))
        } else {
          throw error
        }
      }

      const payload = rawResponse?.response || rawResponse
      let content = convertGeminiPayloadToAnthropicContent(payload)
      let hasToolUse = content.some((block) => block.type === 'tool_use')

      // Antigravity 某些模型可能不会返回 functionCall（导致永远没有 tool_use），但会把 “Write: xxx” 以纯文本形式输出。
      // 可选回退：解析该文本并合成标准 tool_use，交给 claude-cli 去执行。
      if (!hasToolUse && isEnvEnabled(process.env[TEXT_TOOL_FALLBACK_ENV])) {
        const fullText = extractGeminiText(payload)
        const extracted = tryExtractWriteToolFromText(fullText, process.cwd())
        if (extracted?.tool) {
          const toolUseId = buildToolUseId()
          const blocks = []
          if (extracted.prefixText) {
            blocks.push({ type: 'text', text: extracted.prefixText })
          }
          blocks.push({
            type: 'tool_use',
            id: toolUseId,
            name: extracted.tool.name,
            input: extracted.tool.input
          })
          content = blocks
          hasToolUse = true
          logger.warn('⚠️ Synthesized tool_use from plain text Write directive', {
            vendor,
            accountId,
            tool: extracted.tool.name
          })
        }
      }

      const usageMetadata = payload?.usageMetadata || {}
      const inputTokens = usageMetadata.promptTokenCount || 0
      const outputTokens = resolveUsageOutputTokens(usageMetadata)
      const finishReason = payload?.candidates?.[0]?.finishReason

      const stopReason = hasToolUse
        ? 'tool_use'
        : mapGeminiFinishReasonToAnthropicStopReason(finishReason)

      if (req.apiKey?.id && (inputTokens > 0 || outputTokens > 0)) {
        await apiKeyService.recordUsage(
          req.apiKey.id,
          inputTokens,
          outputTokens,
          0,
          0,
          effectiveModel,
          accountId
        )
        await applyRateLimitTracking(
          req.rateLimitInfo,
          { inputTokens, outputTokens, cacheCreateTokens: 0, cacheReadTokens: 0 },
          effectiveModel,
          'anthropic-messages'
        )
      }

      const responseBody = {
        id: `msg_${crypto.randomBytes(12).toString('hex')}`,
        type: 'message',
        role: 'assistant',
        model: req.body.model || effectiveModel,
        content,
        stop_reason: stopReason,
        stop_sequence: null,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens
        }
      }

      dumpAnthropicNonStreamResponse(req, 200, responseBody, {
        vendor,
        accountId,
        effectiveModel,
        forcedVendor: vendor
      })

      return res.status(200).json(responseBody)
    } catch (error) {
      const sanitized = sanitizeUpstreamError(error)
      logger.error('Upstream Gemini error (via /v1/messages):', sanitized)
      dumpAnthropicNonStreamResponse(
        req,
        sanitized.statusCode || 502,
        buildAnthropicError(sanitized.upstreamMessage || sanitized.message),
        { vendor, accountId, effectiveModel, forcedVendor: vendor, upstreamError: sanitized }
      )
      return res
        .status(sanitized.statusCode || 502)
        .json(buildAnthropicError(sanitized.upstreamMessage || sanitized.message))
    }
  }

  const messageId = `msg_${crypto.randomBytes(12).toString('hex')}`
  const responseModel = req.body.model || effectiveModel

  try {
    const startStream = async (payload) => {
      if (vendor === 'antigravity') {
        return await geminiAccountService.generateContentStreamAntigravity(
          client,
          payload,
          null,
          projectId,
          upstreamSessionId,
          abortController.signal,
          proxyConfig
        )
      }
      return await geminiAccountService.generateContentStream(
        client,
        payload,
        null,
        projectId,
        upstreamSessionId,
        abortController.signal,
        proxyConfig
      )
    }

    let streamResponse
    try {
      streamResponse = await startStream(requestData)
    } catch (error) {
      const sanitized = sanitizeUpstreamError(error)
      if (shouldRetryWithoutTools(sanitized) && requestData.request?.tools) {
        logger.warn('⚠️ Tool schema rejected by upstream, retrying stream without tools', {
          vendor,
          accountId
        })
        streamResponse = await startStream(stripToolsFromRequest(requestData))
      } else {
        throw error
      }
    }

    // 仅在上游流成功建立后再开始向客户端发送 SSE。
    // 这样如果上游在握手阶段直接返回 4xx/5xx（例如 schema 400 或配额 429），
    // 我们可以返回真实 HTTP 状态码，而不是先 200 再在 SSE 内发 error 事件。
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    writeAnthropicSseEvent(res, 'message_start', {
      type: 'message_start',
      message: {
        id: messageId,
        type: 'message',
        role: 'assistant',
        model: responseModel,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 0,
          output_tokens: 0
        }
      }
    })

    const wantsThinkingBlockFirst =
      vendor === 'antigravity' &&
      req.body?.thinking &&
      typeof req.body.thinking === 'object' &&
      req.body.thinking.type === 'enabled'

    let buffer = ''
    let emittedText = ''
    let emittedThinking = ''
    let emittedThoughtSignature = ''
    let finished = false
    let usageMetadata = null
    let finishReason = null
    let emittedAnyToolUse = false
    const emittedToolCallKeys = new Set()

    let currentIndex = wantsThinkingBlockFirst ? 0 : -1
    let currentBlockType = wantsThinkingBlockFirst ? 'thinking' : null

    const startTextBlock = (index) => {
      writeAnthropicSseEvent(res, 'content_block_start', {
        type: 'content_block_start',
        index,
        content_block: { type: 'text', text: '' }
      })
    }

    const stopCurrentBlock = () => {
      writeAnthropicSseEvent(res, 'content_block_stop', {
        type: 'content_block_stop',
        index: currentIndex
      })
    }

    const startThinkingBlock = (index) => {
      writeAnthropicSseEvent(res, 'content_block_start', {
        type: 'content_block_start',
        index,
        content_block: { type: 'thinking', thinking: '' }
      })
    }

    if (wantsThinkingBlockFirst) {
      startThinkingBlock(0)
    }

    const switchBlockType = (nextType) => {
      if (currentBlockType === nextType) {
        return
      }
      if (currentBlockType === 'text' || currentBlockType === 'thinking') {
        stopCurrentBlock()
      }
      currentIndex += 1
      currentBlockType = nextType
      if (nextType === 'text') {
        startTextBlock(currentIndex)
      } else if (nextType === 'thinking') {
        startThinkingBlock(currentIndex)
      }
    }

    const canStartThinkingBlock = () => {
      if (currentIndex < 0) {
        return true
      }
      if (currentBlockType === 'thinking') {
        return true
      }
      if (emittedThinking || emittedThoughtSignature) {
        return true
      }
      return false
    }

    const emitToolUseBlock = (name, args, id = null) => {
      const toolUseId = typeof id === 'string' && id ? id : buildToolUseId()
      const jsonArgs = stableJsonStringify(args || {})

      currentIndex += 1
      const toolIndex = currentIndex

      writeAnthropicSseEvent(res, 'content_block_start', {
        type: 'content_block_start',
        index: toolIndex,
        content_block: { type: 'tool_use', id: toolUseId, name, input: {} }
      })

      writeAnthropicSseEvent(res, 'content_block_delta', {
        type: 'content_block_delta',
        index: toolIndex,
        delta: { type: 'input_json_delta', partial_json: jsonArgs }
      })

      writeAnthropicSseEvent(res, 'content_block_stop', {
        type: 'content_block_stop',
        index: toolIndex
      })
      emittedAnyToolUse = true
      currentBlockType = null
    }

    const finalize = async () => {
      if (finished) {
        return
      }
      finished = true

      const inputTokens = usageMetadata?.promptTokenCount || 0
      const outputTokens = resolveUsageOutputTokens(usageMetadata)

      if (currentBlockType === 'text' || currentBlockType === 'thinking') {
        stopCurrentBlock()
      }

      writeAnthropicSseEvent(res, 'message_delta', {
        type: 'message_delta',
        delta: {
          stop_reason: emittedAnyToolUse
            ? 'tool_use'
            : mapGeminiFinishReasonToAnthropicStopReason(finishReason),
          stop_sequence: null
        },
        usage: {
          output_tokens: outputTokens
        }
      })

      writeAnthropicSseEvent(res, 'message_stop', { type: 'message_stop' })
      res.end()

      dumpAnthropicStreamSummary(req, {
        vendor,
        accountId,
        effectiveModel,
        responseModel,
        stop_reason: emittedAnyToolUse
          ? 'tool_use'
          : mapGeminiFinishReasonToAnthropicStopReason(finishReason),
        tool_use_names: Array.from(emittedToolCallKeys)
          .map((key) => key.split(':')[0])
          .filter(Boolean),
        text_preview: emittedText ? emittedText.slice(0, 800) : '',
        usage: { input_tokens: inputTokens, output_tokens: outputTokens }
      })

      if (req.apiKey?.id && (inputTokens > 0 || outputTokens > 0)) {
        await apiKeyService.recordUsage(
          req.apiKey.id,
          inputTokens,
          outputTokens,
          0,
          0,
          effectiveModel,
          accountId
        )
        await applyRateLimitTracking(
          req.rateLimitInfo,
          { inputTokens, outputTokens, cacheCreateTokens: 0, cacheReadTokens: 0 },
          effectiveModel,
          'anthropic-messages-stream'
        )
      }
    }

    streamResponse.on('data', (chunk) => {
      if (finished) {
        return
      }

      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) {
          continue
        }

        const parsed = parseSSELine(line)
        if (parsed.type === 'control') {
          continue
        }
        if (parsed.type !== 'data' || !parsed.data) {
          continue
        }

        const payload = parsed.data?.response || parsed.data
        const { usageMetadata: currentUsageMetadata, candidates } = payload || {}
        if (currentUsageMetadata) {
          usageMetadata = currentUsageMetadata
        }

        const [candidate] = Array.isArray(candidates) ? candidates : []
        const { finishReason: currentFinishReason } = candidate || {}
        if (currentFinishReason) {
          finishReason = currentFinishReason
        }

        const parts = extractGeminiParts(payload)
        const thoughtSignature = extractGeminiThoughtSignature(payload)
        for (const part of parts) {
          const functionCall = part?.functionCall
          if (!functionCall?.name) {
            continue
          }

          const toolKey =
            typeof functionCall.id === 'string' && functionCall.id
              ? `id:${functionCall.id}`
              : `${functionCall.name}:${stableJsonStringify(functionCall.args || {})}`
          if (emittedToolCallKeys.has(toolKey)) {
            continue
          }
          emittedToolCallKeys.add(toolKey)

          if (currentBlockType === 'text' || currentBlockType === 'thinking') {
            stopCurrentBlock()
          }
          currentBlockType = 'tool_use'
          emitToolUseBlock(functionCall.name, functionCall.args || {}, functionCall.id || null)
        }

        if (
          thoughtSignature &&
          thoughtSignature !== emittedThoughtSignature &&
          canStartThinkingBlock()
        ) {
          switchBlockType('thinking')
          writeAnthropicSseEvent(res, 'content_block_delta', {
            type: 'content_block_delta',
            index: currentIndex,
            delta: { type: 'signature_delta', signature: thoughtSignature }
          })
          emittedThoughtSignature = thoughtSignature
        }

        const fullThought = extractGeminiThoughtText(payload)
        if (fullThought && canStartThinkingBlock()) {
          let delta = ''
          if (fullThought.startsWith(emittedThinking)) {
            delta = fullThought.slice(emittedThinking.length)
          } else {
            delta = fullThought
          }
          if (delta) {
            switchBlockType('thinking')
            emittedThinking = fullThought
            writeAnthropicSseEvent(res, 'content_block_delta', {
              type: 'content_block_delta',
              index: currentIndex,
              delta: { type: 'thinking_delta', thinking: delta }
            })
          }
        }

        const fullText = extractGeminiText(payload)
        if (fullText) {
          let delta = ''
          if (fullText.startsWith(emittedText)) {
            delta = fullText.slice(emittedText.length)
          } else {
            delta = fullText
          }
          if (delta) {
            switchBlockType('text')
            emittedText = fullText
            writeAnthropicSseEvent(res, 'content_block_delta', {
              type: 'content_block_delta',
              index: currentIndex,
              delta: { type: 'text_delta', text: delta }
            })
          }
        }
      }
    })

    streamResponse.on('end', () => {
      finalize().catch((e) => logger.error('Failed to finalize Anthropic SSE response:', e))
    })

    streamResponse.on('error', (error) => {
      if (finished) {
        return
      }
      const sanitized = sanitizeUpstreamError(error)
      logger.error('Upstream Gemini stream error (via /v1/messages):', sanitized)
      writeAnthropicSseEvent(
        res,
        'error',
        buildAnthropicError(sanitized.upstreamMessage || sanitized.message)
      )
      res.end()
    })

    return undefined
  } catch (error) {
    const sanitized = sanitizeUpstreamError(error)
    logger.error('Failed to start Gemini stream (via /v1/messages):', sanitized)

    // 上游尚未建立 SSE（未写入任何事件）时，优先返回真实 HTTP 错误码，避免 200 + SSE error 的混淆。
    if (!res.headersSent) {
      dumpAnthropicNonStreamResponse(
        req,
        sanitized.statusCode || 502,
        buildAnthropicError(sanitized.upstreamMessage || sanitized.message),
        { vendor, accountId, effectiveModel, forcedVendor: vendor, upstreamError: sanitized }
      )
      return res
        .status(sanitized.statusCode || 502)
        .json(buildAnthropicError(sanitized.upstreamMessage || sanitized.message))
    }

    writeAnthropicSseEvent(
      res,
      'error',
      buildAnthropicError(sanitized.upstreamMessage || sanitized.message)
    )
    res.end()
    return undefined
  }
}

async function handleAnthropicCountTokensToGemini(req, res, { vendor }) {
  if (!SUPPORTED_VENDORS.has(vendor)) {
    return res.status(400).json(buildAnthropicError(`Unsupported vendor: ${vendor}`))
  }

  const sessionHash = sessionHelper.generateSessionHash(req.body)

  const model = (req.body?.model || '').trim()
  if (!model) {
    return res.status(400).json(buildAnthropicError('Missing model'))
  }

  let accountSelection
  try {
    accountSelection = await unifiedGeminiScheduler.selectAccountForApiKey(
      req.apiKey,
      sessionHash,
      model,
      { oauthProvider: vendor }
    )
  } catch (error) {
    logger.error('Failed to select Gemini account (count_tokens):', error)
    return res
      .status(503)
      .json(buildAnthropicError(error.message || 'No available Gemini accounts'))
  }

  const { accountId, accountType } = accountSelection
  if (accountType !== 'gemini') {
    return res
      .status(400)
      .json(buildAnthropicError('Only Gemini OAuth accounts are supported for this vendor'))
  }

  const account = await geminiAccountService.getAccount(accountId)
  if (!account) {
    return res.status(503).json(buildAnthropicError('Gemini OAuth account not found'))
  }

  await geminiAccountService.markAccountUsed(account.id)

  let proxyConfig = null
  if (account.proxy) {
    try {
      proxyConfig = typeof account.proxy === 'string' ? JSON.parse(account.proxy) : account.proxy
    } catch (e) {
      logger.warn('Failed to parse proxy configuration:', e)
    }
  }

  const client = await geminiAccountService.getOauthClient(
    account.accessToken,
    account.refreshToken,
    proxyConfig,
    account.oauthProvider
  )

  const toolUseIdToName = buildToolUseIdToNameMap(req.body.messages || [])
  const contents = convertAnthropicMessagesToGeminiContents(
    req.body.messages || [],
    toolUseIdToName,
    { vendor }
  )

  try {
    const countResult =
      vendor === 'antigravity'
        ? await geminiAccountService.countTokensAntigravity(client, contents, model, proxyConfig)
        : await geminiAccountService.countTokens(client, contents, model, proxyConfig)

    const totalTokens = countResult?.totalTokens || 0
    return res.status(200).json({ input_tokens: totalTokens })
  } catch (error) {
    const sanitized = sanitizeUpstreamError(error)
    logger.error('Upstream token count error (via /v1/messages/count_tokens):', sanitized)
    return res
      .status(sanitized.statusCode || 502)
      .json(buildAnthropicError(sanitized.upstreamMessage || sanitized.message))
  }
}

module.exports = {
  handleAnthropicMessagesToGemini,
  handleAnthropicCountTokensToGemini
}
