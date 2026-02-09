/**
 * ============================================================================
 * Anthropic → Gemini/Antigravity 桥接服务
 * ============================================================================
 *
 * 【模块功能】
 * 本模块负责将 Anthropic Claude API 格式的请求转换为 Gemini/Antigravity 格式，
 * 并将响应转换回 Anthropic 格式返回给客户端（如 Claude Code）。
 *
 * 【支持的后端 (vendor)】
 * - gemini-cli: 原生 Google Gemini API
 * - antigravity: Claude 代理层，使用 Gemini 格式但有额外约束
 *
 * 【核心处理流程】
 * 1. 接收 Anthropic 格式请求 (/v1/messages)
 * 2. 标准化消息 (normalizeAnthropicMessages) - 处理 thinking blocks、tool_result 等
 * 3. 转换工具定义 (convertAnthropicToolsToGeminiTools) - 压缩描述、清洗 schema
 * 4. 转换消息内容 (convertAnthropicMessagesToGeminiContents)
 * 5. 构建 Gemini 请求 (buildGeminiRequestFromAnthropic)
 * 6. 发送请求并处理 SSE 流式响应
 * 7. 将 Gemini 响应转换回 Anthropic 格式返回
 *
 * 【Antigravity 特殊处理】
 * - 工具描述压缩：限制 400 字符，避免 prompt 超长
 * - Schema description 压缩：限制 200 字符，保留关键约束信息
 * - Thinking signature 校验：防止格式错误导致 400
 * - Tool result 截断：限制 20 万字符
 * - 缺失 tool_result 自动补全：避免 tool_use concurrency 错误
 */

const util = require('util')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const logger = require('../utils/logger')
const { getProjectRoot } = require('../utils/projectPaths')
const geminiAccountService = require('./geminiAccountService')
const unifiedGeminiScheduler = require('./unifiedGeminiScheduler')
const sessionHelper = require('../utils/sessionHelper')
const signatureCache = require('../utils/signatureCache')
const apiKeyService = require('./apiKeyService')
const { updateRateLimitCounters } = require('../utils/rateLimitHelper')
const { parseSSELine } = require('../utils/sseParser')
const { sanitizeUpstreamError } = require('../utils/errorSanitizer')
const { cleanJsonSchemaForGemini } = require('../utils/geminiSchemaCleaner')
const { parseGoogleErrorReason, parseGoogleRetryDelayMs } = require('../utils/googleErrorParser')
const {
  dumpAnthropicNonStreamResponse,
  dumpAnthropicStreamSummary
} = require('../utils/anthropicResponseDump')
const {
  dumpAntigravityStreamEvent,
  dumpAntigravityStreamSummary
} = require('../utils/antigravityUpstreamResponseDump')

// ============================================================================
// 常量定义
// ============================================================================

// 默认签名
const THOUGHT_SIGNATURE_FALLBACK = 'skip_thought_signature_validator'

// 支持的后端类型
const SUPPORTED_VENDORS = new Set(['gemini-cli', 'antigravity'])
// 需要跳过的系统提醒前缀（Claude 内部消息，不应转发给上游）
const SYSTEM_REMINDER_PREFIX = '<system-reminder>'
// 调试：工具定义 dump 相关
const TOOLS_DUMP_ENV = 'ANTHROPIC_DEBUG_TOOLS_DUMP'
const TOOLS_DUMP_FILENAME = 'anthropic-tools-dump.jsonl'
// 环境变量：工具调用失败时是否回退到文本输出
const TEXT_TOOL_FALLBACK_ENV = 'ANTHROPIC_TEXT_TOOL_FALLBACK'
// 环境变量：工具报错时是否继续执行（而非中断）
const TOOL_ERROR_CONTINUE_ENV = 'ANTHROPIC_TOOL_ERROR_CONTINUE'
// Antigravity 工具顶级描述的最大字符数（防止 prompt 超长）
const MAX_ANTIGRAVITY_TOOL_DESCRIPTION_CHARS = 400
// Antigravity 参数 schema description 的最大字符数（保留关键约束信息）
const MAX_ANTIGRAVITY_SCHEMA_DESCRIPTION_CHARS = 200
// Antigravity：当已经决定要走工具时，避免“只宣布步骤就结束”
const ANTIGRAVITY_TOOL_FOLLOW_THROUGH_PROMPT =
  'When a step requires calling a tool, call the tool immediately in the same turn. Do not stop after announcing the step. Updating todos alone (e.g., TodoWrite) is not enough; you must actually invoke the target MCP tool (browser_*, etc.) before ending the turn.'
// 工具报错时注入的 system prompt，提示模型不要中断
const TOOL_ERROR_CONTINUE_PROMPT =
  'Tool calls may fail (e.g., missing prerequisites). When a tool result indicates an error, do not stop: briefly explain the cause and continue with an alternative approach or the remaining steps.'
// Antigravity 账号前置注入的系统提示词
const ANTIGRAVITY_SYSTEM_INSTRUCTION_PREFIX = `<identity>
You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.
You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.
The USER will send you requests, which you must always prioritize addressing. Along with each USER request, we will attach additional metadata about their current state, such as what files they have open and where their cursor is.
This information may or may not be relevant to the coding task, it is up for you to decide.
</identity>
<communication_style>
- **Proactiveness**. As an agent, you are allowed to be proactive, but only in the course of completing the user's task. For example, if the user asks you to add a new component, you can edit the code, verify build and test statuses, and take any other obvious follow-up actions, such as performing additional research. However, avoid surprising the user. For example, if the user asks HOW to approach something, you should answer their question and instead of jumping into editing a file.</communication_style>`

// Antigravity 429 reason 分流
const ANTIGRAVITY_DEFAULT_RATE_LIMIT_SECONDS = 30
const ANTIGRAVITY_QUOTA_LOCKOUT_SECONDS = [60, 300, 1800, 7200] // 60s→5m→30m→2h
const ANTIGRAVITY_QUOTA_STRIKE_TTL_MS = 6 * 60 * 60 * 1000
const antigravityQuotaStrikesByAccountId = new Map()

// ============================================================================
// 辅助函数：基础工具
// ============================================================================

/**
 * 确保 Antigravity 请求有有效的 projectId
 * 如果账户没有配置 projectId，则生成一个临时 ID
 */
function ensureAntigravityProjectId(account) {
  if (account.projectId) {
    return account.projectId
  }
  if (account.tempProjectId) {
    return account.tempProjectId
  }
  return `ag-${crypto.randomBytes(8).toString('hex')}`
}

/**
 * 从 Anthropic 消息内容中提取纯文本
 * 支持字符串和 content blocks 数组两种格式
 * @param {string|Array} content - Anthropic 消息内容
 * @returns {string} 提取的文本
 */
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

/**
 * 检查文本是否应该跳过（不转发给上游）
 * 主要过滤 Claude 内部的 system-reminder 消息
 */
function shouldSkipText(text) {
  if (!text || typeof text !== 'string') {
    return true
  }
  return text.trimStart().startsWith(SYSTEM_REMINDER_PREFIX)
}

/**
 * 构建 Gemini 格式的 system parts
 * 将 Anthropic 的 system prompt 转换为 Gemini 的 parts 数组
 * @param {string|Array} system - Anthropic 的 system prompt
 * @returns {Array} Gemini 格式的 parts
 */
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

/**
 * 构建 tool_use ID 到工具名称的映射
 * 用于在处理 tool_result 时查找对应的工具名
 * @param {Array} messages - 消息列表
 * @returns {Map} tool_use_id -> tool_name 的映射
 */
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

/**
 * 标准化工具调用的输入参数
 * 确保输入始终是对象格式
 */
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

// Antigravity 工具结果的最大字符数（约 20 万，防止 prompt 超长）
const MAX_ANTIGRAVITY_TOOL_RESULT_CHARS = 200000

// ============================================================================
// 辅助函数：Antigravity 体积压缩
// 这些函数用于压缩工具描述、schema 等，避免 prompt 超过 Antigravity 的上限
// ============================================================================

/**
 * 检查两个模型是否兼容（同一模型家族）
 * 用于防止跨模型签名错误
 * 模型兼容性检查
 * @param {string} cachedFamily - 缓存的模型家族
 * @param {string} targetModel - 目标模型名称
 * @returns {boolean} 是否兼容
 */
function isModelCompatible(cachedFamily, targetModel) {
  if (!cachedFamily || !targetModel) {
    return true // 无法判断时默认兼容
  }

  const c = cachedFamily.toLowerCase()
  const t = targetModel.toLowerCase()

  if (c === t) {
    return true
  }

  // 检查特定模型家族
  if (c.includes('gemini-1.5') && t.includes('gemini-1.5')) {
    return true
  }
  if (c.includes('gemini-2.0') && t.includes('gemini-2.0')) {
    return true
  }
  if (c.includes('gemini-2.5') && t.includes('gemini-2.5')) {
    return true
  }
  if (c.includes('claude-3-5') && t.includes('claude-3-5')) {
    return true
  }
  if (c.includes('claude-3-7') && t.includes('claude-3-7')) {
    return true
  }
  if (c.includes('claude-sonnet-4') && t.includes('claude-sonnet-4')) {
    return true
  }
  if (c.includes('claude-opus-4') && t.includes('claude-opus-4')) {
    return true
  }

  // 严格模式：不同家族不兼容
  return false
}

/**
 * 从模型名称提取模型家族标识
 * @param {string} modelName - 模型名称
 * @returns {string} 模型家族标识
 */
function extractModelFamily(modelName) {
  if (!modelName) {
    return ''
  }
  const name = modelName.toLowerCase()

  // Gemini 模型
  if (name.includes('gemini-2.5')) {
    return 'gemini-2.5'
  }
  if (name.includes('gemini-2.0')) {
    return 'gemini-2.0'
  }
  if (name.includes('gemini-1.5')) {
    return 'gemini-1.5'
  }

  // Claude 模型
  if (name.includes('claude-opus-4')) {
    return 'claude-opus-4'
  }
  if (name.includes('claude-sonnet-4')) {
    return 'claude-sonnet-4'
  }
  if (name.includes('claude-3-7')) {
    return 'claude-3-7'
  }
  if (name.includes('claude-3-5')) {
    return 'claude-3-5'
  }

  return name
}

// ============================================================================
// ContextManager: 上下文管理器
// 上下文管理器
// ============================================================================

/**
 * 净化策略枚举
 * - None: 不清理
 * - Soft: 保留最近 2 轮（4 条消息）的 thinking blocks
 * - Aggressive: 移除所有历史 thinking blocks
 */
const PurificationStrategy = {
  None: 'none',
  Soft: 'soft',
  Aggressive: 'aggressive'
}

/**
 * 估算消息的 Token 使用量
 * 轻量级估算：约 3.5 字符 = 1 token
 * Token 使用量估算
 * @param {Object} body - Anthropic 请求体
 * @returns {number} 估算的 token 数量
 */
function estimateTokenUsage(body) {
  let total = 0

  const estimateFromStr = (s) => {
    if (!s || typeof s !== 'string') {
      return 0
    }
    return Math.ceil(s.length / 3.5)
  }

  // System prompt
  if (body.system) {
    if (typeof body.system === 'string') {
      total += estimateFromStr(body.system)
    } else if (Array.isArray(body.system)) {
      for (const block of body.system) {
        if (block?.text) {
          total += estimateFromStr(block.text)
        }
      }
    }
  }

  // Messages
  for (const msg of body.messages || []) {
    total += 4 // message overhead

    const content = msg?.content
    if (typeof content === 'string') {
      total += estimateFromStr(content)
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (!block) {
          continue
        }

        if (block.type === 'text') {
          total += estimateFromStr(block.text)
        } else if (block.type === 'thinking') {
          total += estimateFromStr(block.thinking)
          total += 100 // signature overhead
        } else if (block.type === 'redacted_thinking') {
          total += estimateFromStr(block.data)
        } else if (block.type === 'tool_use') {
          total += 20 // function call overhead
          total += estimateFromStr(block.name)
          if (block.input) {
            try {
              total += estimateFromStr(JSON.stringify(block.input))
            } catch (_) {
              // ignore
            }
          }
        } else if (block.type === 'tool_result') {
          total += 10 // result overhead
          if (typeof block.content === 'string') {
            total += estimateFromStr(block.content)
          } else if (Array.isArray(block.content)) {
            for (const item of block.content) {
              if (item?.text) {
                total += estimateFromStr(item.text)
              }
            }
          }
        }
      }
    }
  }

  // Tools definition overhead
  if (Array.isArray(body.tools)) {
    for (const tool of body.tools) {
      try {
        total += estimateFromStr(JSON.stringify(tool))
      } catch (_) {
        // ignore
      }
    }
  }

  // Thinking budget overhead
  if (body.thinking?.budget_tokens) {
    total += Number(body.thinking.budget_tokens) || 0
  }

  return total
}

/**
 * 根据上下文使用率确定净化策略
 * - > 90%: Aggressive（激进剥离所有历史 thinking）
 * - > 60%: Soft（保留最近 2 轮 thinking）
 * - < 60%: None（不处理）
 * @param {number} usageRatio - 使用率 (0-1)
 * @returns {string} 净化策略
 */
function determinePurificationStrategy(usageRatio) {
  if (usageRatio > 0.9) {
    return PurificationStrategy.Aggressive
  }
  if (usageRatio > 0.6) {
    return PurificationStrategy.Soft
  }
  return PurificationStrategy.None
}

/**
 * 净化历史消息中的 thinking blocks
 * 历史思考净化
 * @param {Array} messages - 消息列表（会被原地修改）
 * @param {string} strategy - 净化策略
 * @returns {boolean} 是否进行了修改
 */
function purifyHistoryThinking(messages, strategy) {
  if (strategy === PurificationStrategy.None) {
    return false
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return false
  }

  let modified = false
  const totalMsgs = messages.length

  // Soft 模式保护最后 4 条消息（约 2 轮对话）
  const protectedCount = strategy === PurificationStrategy.Soft ? 4 : 0
  const startProtectionIdx = Math.max(0, totalMsgs - protectedCount)

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const isProtected = i >= startProtectionIdx

    // 只处理 assistant 消息
    if (msg?.role !== 'assistant' || isProtected) {
      continue
    }

    if (!Array.isArray(msg.content)) {
      continue
    }

    const originalLen = msg.content.length
    // 过滤掉 thinking 和 redacted_thinking blocks
    msg.content = msg.content.filter(
      (block) => block?.type !== 'thinking' && block?.type !== 'redacted_thinking'
    )

    if (msg.content.length !== originalLen) {
      modified = true

      // 如果消息变空，添加占位符保持对话结构
      if (msg.content.length === 0) {
        msg.content.push({ type: 'text', text: '...' })
        logger.debug('[ContextManager] Replaced empty assistant message with placeholder')
      }
    }
  }

  if (modified) {
    logger.info(
      `[ContextManager] Purified history with strategy: ${strategy} (Protected last ${protectedCount} msgs)`
    )
  }

  return modified
}

// ============================================================================
// Thinking Utils: 工具循环检测与修复
// 思考工具
// ============================================================================

const MIN_SIGNATURE_LENGTH = 50

/**
 * 分析会话状态，检测工具循环和中断
 * 分析对话状态
 * @param {Array} messages - 消息列表
 * @returns {Object} { inToolLoop, interruptedTool, lastAssistantIdx }
 */
function analyzeConversationState(messages) {
  const state = {
    inToolLoop: false,
    interruptedTool: false,
    lastAssistantIdx: null
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return state
  }

  // 找到最后一条 assistant 消息
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') {
      state.lastAssistantIdx = i
      break
    }
  }

  if (state.lastAssistantIdx === null) {
    return state
  }

  // 检查 assistant 消息是否有 tool_use
  const assistantMsg = messages[state.lastAssistantIdx]
  const assistantContent = Array.isArray(assistantMsg?.content) ? assistantMsg.content : []
  const hasToolUse = assistantContent.some((b) => b?.type === 'tool_use')

  if (!hasToolUse) {
    return state
  }

  // 检查最后一条消息
  const lastMsg = messages[messages.length - 1]
  if (lastMsg?.role !== 'user') {
    return state
  }

  const lastContent = lastMsg?.content
  if (Array.isArray(lastContent)) {
    // Case 1: 最后消息是 ToolResult -> 活跃的工具循环
    if (lastContent.some((b) => b?.type === 'tool_result')) {
      state.inToolLoop = true
      logger.debug('[Thinking-Recovery] Active tool loop detected (last msg is ToolResult).')
    } else {
      // Case 2: 最后消息是文本 -> 中断的工具调用
      state.interruptedTool = true
      logger.debug('[Thinking-Recovery] Interrupted tool detected (last msg is Text user).')
    }
  } else if (typeof lastContent === 'string') {
    // Case 2: 字符串内容 -> 中断的工具调用
    state.interruptedTool = true
    logger.debug('[Thinking-Recovery] Interrupted tool detected (last msg is String user).')
  }

  return state
}

/**
 * 修复断裂的工具循环
 * 当 assistant 消息有 tool_use 但缺少有效的 thinking block 时，
 * 注入合成消息来关闭循环，避免 "Assistant message must start with thinking" 错误
 * 关闭工具循环以启用思考
 * @param {Array} messages - 消息列表（会被原地修改）
 * @returns {boolean} 是否进行了修改
 */
function closeToolLoopForThinking(messages) {
  const state = analyzeConversationState(messages)

  if (!state.inToolLoop && !state.interruptedTool) {
    return false
  }

  // 检查最后一条 assistant 消息是否有有效的 thinking block
  let hasValidThinking = false
  if (state.lastAssistantIdx !== null) {
    const assistantMsg = messages[state.lastAssistantIdx]
    const content = Array.isArray(assistantMsg?.content) ? assistantMsg.content : []

    for (const block of content) {
      if (block?.type === 'thinking') {
        const thinking = block.thinking || ''
        const signature = block.signature || ''
        if (thinking && signature.length >= MIN_SIGNATURE_LENGTH) {
          hasValidThinking = true
          break
        }
      }
    }
  }

  if (hasValidThinking) {
    return false
  }

  if (state.inToolLoop) {
    logger.info(
      '[Thinking-Recovery] Broken tool loop (ToolResult without preceding Thinking). Recovery triggered.'
    )

    // 注入确认消息来"关闭"历史轮次
    messages.push({
      role: 'assistant',
      content: [
        { type: 'text', text: '[System: Tool execution completed. Proceeding to final response.]' }
      ]
    })
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: 'Please provide the final result based on the tool output above.' }
      ]
    })
    return true
  }

  if (state.interruptedTool) {
    logger.info('[Thinking-Recovery] Interrupted tool call detected. Injecting synthetic closure.')

    // 在 assistant 的 tool_use 后插入闭包消息
    if (state.lastAssistantIdx !== null) {
      messages.splice(state.lastAssistantIdx + 1, 0, {
        role: 'assistant',
        content: [{ type: 'text', text: '[Tool call was interrupted by user.]' }]
      })
    }
    return true
  }

  return false
}

// ============================================================================
// Streaming 参数重映射: 修复 Gemini 返回的工具调用参数
// 流式参数重映射
// ============================================================================

/**
 * 重映射工具调用参数
 * Gemini 有时会使用与 Claude Code 期望不同的参数名
 * 此函数修复这些不一致，避免工具调用失败
 *
 * 常见映射：
 * - Grep/Glob: description → pattern, query → pattern, paths → path
 * - Read: path → file_path
 * - LS: 默认 path = "."
 * - EnterPlanMode: 清除所有参数（禁止携带任何参数）
 *
 * @param {string} name - 工具名称
 * @param {Object} args - 工具参数（会被原地修改）
 */
function remapFunctionCallArgs(name, args, { vendor = null, model = null } = {}) {
  if (!args || typeof args !== 'object') {
    return
  }

  const nameLower = (name || '').toLowerCase()
  const isAntigravityGeminiModel = vendor === 'antigravity' && isGeminiModelId(model)

  const coerceToString = (value) => {
    if (value === null || value === undefined) {
      return ''
    }
    if (typeof value === 'string') {
      return value
    }
    if (Array.isArray(value)) {
      return value
        .map((v) => coerceToString(v))
        .filter(Boolean)
        .join('\n')
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value)
      } catch (_) {
        return String(value)
      }
    }
    return String(value)
  }

  const coerceToBoolean = (value) => {
    if (typeof value === 'boolean') {
      return value
    }
    if (typeof value === 'number') {
      return value !== 0
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (
        normalized === 'true' ||
        normalized === '1' ||
        normalized === 'yes' ||
        normalized === 'on'
      ) {
        return true
      }
      if (
        normalized === 'false' ||
        normalized === '0' ||
        normalized === 'no' ||
        normalized === 'off'
      ) {
        return false
      }
    }
    return null
  }

  // [IMPORTANT] Claude Code CLI 的 EnterPlanMode 工具禁止携带任何参数
  // 代理层注入的 reason 参数会导致 InputValidationError
  if (nameLower === 'enterplanmode') {
    for (const key of Object.keys(args)) {
      delete args[key]
    }
    return
  }

  // Antigravity Gemini 更容易出现参数“幻觉/错位”，这里做更强的纠错（严格限定在 antigravity + gemini-*）。
  if (isAntigravityGeminiModel) {
    if (nameLower === 'bash') {
      if (args.command && typeof args.command === 'object' && args.command.command) {
        args.command = args.command.command
      }
      if (!args.command) {
        const fallback =
          args.cmd || args.shell || args.script || args.command_line || args.commandLine
        if (fallback) {
          args.command = fallback
        }
      }
      args.command = coerceToString(args.command)
      if (!args.command) {
        delete args.command
      }
      if (args.command && args.cmd) {
        delete args.cmd
      }
      if (args.command && args.shell) {
        delete args.shell
      }
      if (args.command && args.script) {
        delete args.script
      }
      if (args.command && args.command_line) {
        delete args.command_line
      }
      if (args.command && args.commandLine) {
        delete args.commandLine
      }
      return
    }

    if (nameLower === 'write') {
      if (!args.file_path) {
        const pathCandidate =
          args.filePath ||
          args.filepath ||
          args.path ||
          args.filename ||
          args.file ||
          args.target ||
          null
        if (pathCandidate) {
          args.file_path = pathCandidate
        }
      }
      if (args.file_path) {
        args.file_path = coerceToString(args.file_path).trim()
      }
      if (args.filePath) {
        delete args.filePath
      }
      if (args.filepath) {
        delete args.filepath
      }
      if (args.path) {
        delete args.path
      }
      if (args.filename) {
        delete args.filename
      }
      if (args.file) {
        delete args.file
      }
      if (args.target) {
        delete args.target
      }

      if (args.content === undefined) {
        const contentCandidate =
          args.text || args.data || args.contents || args.body || args.value || args.output || null
        if (contentCandidate !== null && contentCandidate !== undefined) {
          args.content = contentCandidate
        }
      }
      if (args.content !== undefined) {
        args.content = coerceToString(args.content)
      }
      if (args.text) {
        delete args.text
      }
      if (args.data) {
        delete args.data
      }
      if (args.contents) {
        delete args.contents
      }
      if (args.body) {
        delete args.body
      }
      if (args.value) {
        delete args.value
      }
      if (args.output) {
        delete args.output
      }
      return
    }

    if (nameLower === 'edit') {
      if (!args.file_path) {
        const pathCandidate =
          args.filePath ||
          args.filepath ||
          args.path ||
          args.filename ||
          args.file ||
          args.target ||
          null
        if (pathCandidate) {
          args.file_path = pathCandidate
        }
      }
      if (args.file_path) {
        args.file_path = coerceToString(args.file_path).trim()
      }
      if (args.filePath) {
        delete args.filePath
      }
      if (args.filepath) {
        delete args.filepath
      }
      if (args.path) {
        delete args.path
      }
      if (args.filename) {
        delete args.filename
      }
      if (args.file) {
        delete args.file
      }
      if (args.target) {
        delete args.target
      }

      if (args.old_string === undefined) {
        const oldCandidate = args.oldString || args.before || args.search || args.from || null
        if (oldCandidate !== null && oldCandidate !== undefined) {
          args.old_string = oldCandidate
        }
      }
      if (args.new_string === undefined) {
        const newCandidate = args.newString || args.after || args.replace || args.to || null
        if (newCandidate !== null && newCandidate !== undefined) {
          args.new_string = newCandidate
        }
      }
      if (args.old_string !== undefined) {
        args.old_string = coerceToString(args.old_string)
      }
      if (args.new_string !== undefined) {
        args.new_string = coerceToString(args.new_string)
      }
      if (args.oldString) {
        delete args.oldString
      }
      if (args.newString) {
        delete args.newString
      }
      if (args.before) {
        delete args.before
      }
      if (args.after) {
        delete args.after
      }
      if (args.search) {
        delete args.search
      }
      if (args.replace) {
        delete args.replace
      }
      if (args.from) {
        delete args.from
      }
      if (args.to) {
        delete args.to
      }

      if (args.replace_all !== undefined) {
        const b = coerceToBoolean(args.replace_all)
        if (b !== null) {
          args.replace_all = b
        }
      } else if (args.replaceAll !== undefined) {
        const b = coerceToBoolean(args.replaceAll)
        if (b !== null) {
          args.replace_all = b
        }
        delete args.replaceAll
      }

      return
    }
  }

  // Grep, Search, Glob 工具参数修复
  if (
    nameLower === 'grep' ||
    nameLower === 'search' ||
    nameLower === 'glob' ||
    nameLower === 'search_code_definitions' ||
    nameLower === 'search_code_snippets'
  ) {
    // Gemini 幻觉：将参数描述映射到 "description" 字段
    if (args.description && !args.pattern) {
      args.pattern = args.description
      delete args.description
      logger.debug(`[Streaming] Remapped ${name}: description → pattern`)
    }

    // Gemini 使用 "query"，Claude Code 期望 "pattern"
    if (args.query && !args.pattern) {
      args.pattern = args.query
      delete args.query
      logger.debug(`[Streaming] Remapped ${name}: query → pattern`)
    }

    // [CRITICAL FIX] Claude Code 使用 "path" (string)，不是 "paths" (array)!
    if (!args.path) {
      if (args.paths) {
        const { paths } = args
        let pathStr = '.'
        if (Array.isArray(paths) && paths.length > 0) {
          pathStr = typeof paths[0] === 'string' ? paths[0] : '.'
        } else if (typeof paths === 'string') {
          pathStr = paths
        }
        args.path = pathStr
        delete args.paths
        logger.debug(`[Streaming] Remapped ${name}: paths → path("${pathStr}")`)
      } else {
        // 默认使用当前目录
        args.path = '.'
        logger.debug(`[Streaming] Added default path: "."`)
      }
    }
    return
  }

  // Read 工具参数修复
  if (nameLower === 'read') {
    // Gemini 可能使用 "path"，Claude Code 期望 "file_path"
    if (args.path && !args.file_path) {
      args.file_path = args.path
      delete args.path
      logger.debug('[Streaming] Remapped Read: path → file_path')
    }
    return
  }

  // LS 工具参数修复
  if (nameLower === 'ls') {
    // 确保 "path" 参数存在
    if (!args.path) {
      args.path = '.'
      logger.debug('[Streaming] Remapped LS: default path → "."')
    }
    return
  }

  // [通用修复] 如果工具有 "paths" (只有一个元素的数组) 但没有 "path"，转换它
  if (!args.path && args.paths) {
    const { paths } = args
    if (Array.isArray(paths) && paths.length === 1 && typeof paths[0] === 'string') {
      args.path = paths[0]
      delete args.paths
      logger.debug(`[Streaming] Generic fix for tool '${name}': paths[0] → path("${args.path}")`)
    }
  }
}

// ============================================================================
// Request 处理增强: 三阶段分区排序 + 连续消息合并
// 请求处理增强
// ============================================================================

/**
 * 对 assistant 消息内容进行三阶段分区排序
 * 确保 thinking blocks 始终在最前面（符合 Anthropic/Gemini 协议要求）
 * 思考块排序
 * @param {Array} messages - 消息列表（会被原地修改）
 * @returns {boolean} 是否进行了修改
 */
function sortThinkingBlocksFirst(messages) {
  if (!Array.isArray(messages)) {
    return false
  }

  let modified = false

  for (const msg of messages) {
    if (msg?.role !== 'assistant') {
      continue
    }

    if (!Array.isArray(msg.content) || msg.content.length <= 1) {
      continue
    }

    const blocks = msg.content
    const thinkingBlocks = []
    const textBlocks = []
    const toolBlocks = []
    const otherBlocks = []

    let sawNonThinking = false
    let needsReorder = false

    // 检测是否需要重排序
    for (const block of blocks) {
      if (!block) {
        continue
      }

      if (block.type === 'thinking' || block.type === 'redacted_thinking') {
        if (sawNonThinking) {
          needsReorder = true
        }
      } else if (block.type === 'text' || block.type === 'tool_use') {
        sawNonThinking = true
      } else {
        sawNonThinking = true
      }
    }

    if (!needsReorder && blocks.length <= 1) {
      continue
    }

    // 执行三阶段分区
    for (const block of blocks) {
      if (!block) {
        continue
      }

      if (block.type === 'thinking' || block.type === 'redacted_thinking') {
        thinkingBlocks.push(block)
      } else if (block.type === 'text') {
        // 过滤空文本
        const text = block.text?.trim()
        if (text && text !== '(no content)') {
          textBlocks.push(block)
        }
      } else if (block.type === 'tool_use') {
        toolBlocks.push(block)
      } else {
        otherBlocks.push(block)
      }
    }

    // 重建：Thinking -> Text/Other -> Tool
    const newContent = [...thinkingBlocks, ...textBlocks, ...otherBlocks, ...toolBlocks]

    if (newContent.length !== blocks.length || needsReorder) {
      msg.content = newContent
      modified = true

      if (needsReorder) {
        logger.warn('[FIX #709] Reordered assistant messages to [Thinking, Text, Tool] structure.')
      }
    }
  }

  return modified
}

/**
 * 合并连续的同角色消息
 * 场景：当从 Spec/Plan 模式切换回编码模式时，可能出现连续两条 "user" 消息
 * 这会违反角色交替规则，导致 400 报错
 * 合并连续消息
 * @param {Array} messages - 消息列表（会被原地修改）
 * @returns {boolean} 是否进行了修改
 */
function mergeConsecutiveMessages(messages) {
  if (!Array.isArray(messages) || messages.length <= 1) {
    return false
  }

  const merged = []
  let current = messages[0]

  for (let i = 1; i < messages.length; i++) {
    const next = messages[i]

    if (current?.role === next?.role) {
      // 合并内容
      const currentContent = current.content
      const nextContent = next.content

      if (Array.isArray(currentContent) && Array.isArray(nextContent)) {
        current.content = [...currentContent, ...nextContent]
      } else if (Array.isArray(currentContent) && typeof nextContent === 'string') {
        current.content.push({ type: 'text', text: nextContent })
      } else if (typeof currentContent === 'string' && typeof nextContent === 'string') {
        current.content = `${currentContent}\n\n${nextContent}`
      } else if (typeof currentContent === 'string' && Array.isArray(nextContent)) {
        current.content = [{ type: 'text', text: currentContent }, ...nextContent]
      }
    } else {
      merged.push(current)
      current = next
    }
  }
  merged.push(current)

  if (merged.length !== messages.length) {
    messages.length = 0
    messages.push(...merged)
    logger.info(
      `[FIX #813] Merged consecutive messages: ${messages.length + merged.length - messages.length} -> ${messages.length}`
    )
    return true
  }

  return false
}

/**
 * 安全截断（尽量不在 HTML 标签 / JSON 未闭合结构中间截断）
 * 仅用于 Antigravity 的 tool_result 压缩，避免影响其他路径。
 */
function truncateTextSafe(text, maxChars) {
  if (!text || typeof text !== 'string') {
    return ''
  }
  if (!Number.isFinite(maxChars) || maxChars <= 0) {
    return ''
  }
  if (text.length <= maxChars) {
    return text
  }

  let splitPos = maxChars
  const sub = text.slice(0, maxChars)

  // 1) 尽量不要把 "<...>" 标签截断到一半
  const lastOpen = sub.lastIndexOf('<')
  if (lastOpen >= 0) {
    const lastClose = sub.lastIndexOf('>')
    if (lastClose < lastOpen) {
      splitPos = Math.min(splitPos, lastOpen)
    }
  }

  // 2) 尽量不要把 JSON 大括号截断到一半（只在截断点附近时回退）
  const lastOpenBrace = sub.lastIndexOf('{')
  if (lastOpenBrace >= 0) {
    const lastCloseBrace = sub.lastIndexOf('}')
    if (lastCloseBrace < lastOpenBrace && maxChars - lastOpenBrace < 100) {
      splitPos = Math.min(splitPos, lastOpenBrace)
    }
  }

  const truncated = text.slice(0, splitPos)
  const omitted = Math.max(0, text.length - splitPos)
  return `${truncated}\n...[truncated ${omitted} chars]`
}

/**
 * 深度清理 HTML（移除 style/script/base64 等高噪声内容）
 * 仅用于 Antigravity 的 tool_result 压缩，避免影响其他路径。
 */
function deepCleanHtmlForAntigravity(html) {
  if (!html || typeof html !== 'string') {
    return ''
  }

  let result = html

  // 移除 <style>...</style>
  result = result.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '[style omitted]')
  // 移除 <script>...</script>
  result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '[script omitted]')
  // 移除 data:*;base64,...
  result = result.replace(/data:[^;/]+\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, '[base64 omitted]')
  // 归一化空行
  result = result.replace(/\n\s*\n/g, '\n')

  return result
}

/**
 * 深度递归清理 JSON 中的 cache_control 字段
 * 这是最后一道防线，确保发送给 Antigravity 的请求中不包含任何 cache_control
 * 用于处理嵌套结构和非标准位置的 cache_control
 * 文本安全截断
 * @param {Object|Array} value - 待清理的 JSON 对象
 */
function deepCleanCacheControl(value) {
  if (!value || typeof value !== 'object') {
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      deepCleanCacheControl(item)
    }
    return
  }

  // 删除当前层的 cache_control
  if (Object.prototype.hasOwnProperty.call(value, 'cache_control')) {
    delete value.cache_control
  }

  // 递归处理所有子属性
  for (const key of Object.keys(value)) {
    deepCleanCacheControl(value[key])
  }
}

/**
 * 截断文本并添加截断提示（内联模式，不带换行）
 */
function truncateInlineText(text, maxChars) {
  if (!text || typeof text !== 'string') {
    return ''
  }
  if (text.length <= maxChars) {
    return text
  }
  return `${text.slice(0, maxChars)}...[truncated ${text.length - maxChars} chars]`
}

/**
 * Antigravity：对工具输出做语义摘要（优先减少 history 体积）
 * 目标：
 * - 降低因 prompt 过大导致的 429 / 断流缺 finishReason / 降级 end_turn 概率
 * - 不改变工具调用语义（只处理 tool_result 文本，不动 tool_use / tool_choice）
 *
 * 压缩策略：
 * 1. 大文件提示 → 提取关键信息（文件路径、字符数）
 * 2. 浏览器快照 → 头部 70% + 尾部 30% 保留
 * 3. 其他 → 简单截断
 */
function compactToolResultTextForAntigravity(text, maxChars) {
  if (!text || typeof text !== 'string') {
    return ''
  }
  if (!Number.isFinite(maxChars) || maxChars <= 0) {
    return ''
  }

  const normalized = text.replace(/\r\n/g, '\n')

  // [NEW] 针对 HTML 工具输出做深度预处理，减少无意义 token 占用
  const cleaned = /<html\b|<body\b|<!doctype\b/i.test(normalized)
    ? deepCleanHtmlForAntigravity(normalized)
    : normalized

  // 1) Claude Code 常见：工具输出过大已写入文件。该提示本身可能很长且会反复滚入 history。
  const savedOutputRegex =
    /result\s*\(\s*(?<count>[\d,]+)\s*characters\s*\)\s*exceeds\s+maximum\s+allowed\s+tokens\.\s*Output\s+(?:has\s+been\s+)?saved\s+to\s+(?<path>[^\r\n]+)/i
  const savedMatch = savedOutputRegex.exec(cleaned)
  if (savedMatch) {
    const rawPath = String(savedMatch?.groups?.path || '').trim()
    const filePath = rawPath
      .replace(/[)\]"']+$/, '')
      .replace(/\.$/, '')
      .trim()
    const count = String(savedMatch?.groups?.count || '').trim()

    const lines = cleaned.split('\n').map((l) => l.trim())
    const noticeLine =
      lines.find((l) => /exceeds maximum allowed tokens/i.test(l) && /saved to/i.test(l)) ||
      `result (${count || 'N/A'} characters) exceeds maximum allowed tokens. Output has been saved to ${filePath}`

    const formatLine =
      lines.find((l) => /^Format:/i.test(l)) ||
      lines.find((l) => /JSON array with schema/i.test(l)) ||
      lines.find((l) => /schema:/i.test(l)) ||
      null

    const compactLines = [
      noticeLine,
      formatLine && formatLine !== noticeLine ? formatLine : null,
      filePath
        ? `[tool_result omitted to reduce prompt size; read file locally if needed: ${filePath}]`
        : '[tool_result omitted to reduce prompt size; read the saved file locally if needed]'
    ].filter(Boolean)

    return truncateTextSafe(compactLines.join('\n'), maxChars)
  }

  // 2) 浏览器快照类：常见为超大文本（Page Snapshot / ref=...），会把 history 撑爆。
  //    为了尽量不影响可用性，采用“头+尾保留”的方式，只在明显超大时触发。
  if (cleaned.length > 20000) {
    const looksLikeSnapshot =
      /page snapshot|页面快照/i.test(cleaned) ||
      (cleaned.match(/\bref\s*[=:]\s*['"]?[a-z0-9_-]{2,}/gi) || []).length > 30 ||
      (cleaned.match(/\[ref=/gi) || []).length > 30

    if (!looksLikeSnapshot) {
      return truncateTextSafe(cleaned, maxChars)
    }

    const desiredMax = Math.min(maxChars, 16000)
    if (desiredMax >= 2000 && cleaned.length > desiredMax) {
      const meta = `[page snapshot summarized to reduce prompt size; original ${cleaned.length} chars]`
      const overhead = meta.length + 200
      const budget = Math.max(0, desiredMax - overhead)
      if (budget >= 1000) {
        const headLen = Math.min(10000, Math.max(500, Math.floor(budget * 0.7)))
        const tailLen = Math.min(3000, Math.max(0, budget - headLen))
        const head = cleaned.slice(0, headLen)
        const tail = tailLen > 0 ? cleaned.slice(-tailLen) : ''
        const omitted = Math.max(0, cleaned.length - headLen - tailLen)
        const summarized = `${meta}\n---[HEAD]---\n${head}\n---[...omitted ${omitted} chars]---\n---[TAIL]---\n${tail}`
        return truncateTextSafe(summarized, maxChars)
      }
    }
  }

  return truncateTextSafe(cleaned, maxChars)
}

/**
 * 压缩工具顶级描述
 * 取前 6 行，合并为单行，截断到 400 字符
 * 这样可以在保留关键信息的同时大幅减少体积
 * @param {string} description - 原始工具描述
 * @returns {string} 压缩后的描述
 */
function compactToolDescriptionForAntigravity(description) {
  if (!description || typeof description !== 'string') {
    return ''
  }
  const normalized = description.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return ''
  }

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return ''
  }

  const compacted = lines.slice(0, 6).join(' ')
  return truncateInlineText(compacted, MAX_ANTIGRAVITY_TOOL_DESCRIPTION_CHARS)
}

/**
 * 压缩 JSON Schema 属性描述
 * 压缩多余空白，截断到 200 字符
 * 这是为了保留关键参数约束（如 ji 工具的 action 只能是 "记忆"/"回忆"）
 * @param {string} description - 原始描述
 * @returns {string} 压缩后的描述
 */
function compactSchemaDescriptionForAntigravity(description) {
  if (!description || typeof description !== 'string') {
    return ''
  }
  const normalized = description.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ''
  }
  return truncateInlineText(normalized, MAX_ANTIGRAVITY_SCHEMA_DESCRIPTION_CHARS)
}

/**
 * 递归压缩 JSON Schema 中所有层级的 description 字段
 * 保留并压缩 description（而不是删除），确保关键参数约束信息不丢失
 * @param {Object} schema - JSON Schema 对象
 * @returns {Object} 压缩后的 schema
 */
function compactJsonSchemaDescriptionsForAntigravity(schema) {
  if (schema === null || schema === undefined) {
    return schema
  }
  if (typeof schema !== 'object') {
    return schema
  }
  if (Array.isArray(schema)) {
    return schema.map((item) => compactJsonSchemaDescriptionsForAntigravity(item))
  }

  const cleaned = {}
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'description') {
      const compacted = compactSchemaDescriptionForAntigravity(value)
      if (compacted) {
        cleaned.description = compacted
      }
      continue
    }
    cleaned[key] = compactJsonSchemaDescriptionsForAntigravity(value)
  }
  return cleaned
}

/**
 * 清洗 thinking block 的 signature
 * 检查格式是否合法（Base64-like token），不合法则返回空串
 * 这是为了避免 "Invalid signature in thinking block" 400 错误
 * @param {string} signature - 原始 signature
 * @returns {string} 清洗后的 signature（不合法则为空串）
 */
function sanitizeThoughtSignatureForAntigravity(signature) {
  if (!signature || typeof signature !== 'string') {
    return ''
  }
  const trimmed = signature.trim()
  if (!trimmed) {
    return ''
  }

  const compacted = trimmed.replace(/\s+/g, '')
  if (compacted.length > 65536) {
    return ''
  }

  const looksLikeToken = /^[A-Za-z0-9+/_=-]+$/.test(compacted)
  if (!looksLikeToken) {
    return ''
  }

  if (compacted.length < 8) {
    return ''
  }

  return compacted
}

/**
 * 检测是否是 Antigravity 的 INVALID_ARGUMENT (400) 错误
 * 用于在日志中特殊标记这类错误，方便调试
 *
 * @param {Object} sanitized - sanitizeUpstreamError 处理后的错误对象
 * @returns {boolean} 是否是参数无效错误
 */
function isInvalidAntigravityArgumentError(sanitized) {
  if (!sanitized || typeof sanitized !== 'object') {
    return false
  }
  const upstreamType = String(sanitized.upstreamType || '').toUpperCase()
  if (upstreamType === 'INVALID_ARGUMENT') {
    return true
  }
  const message = String(sanitized.upstreamMessage || sanitized.message || '')
  return /invalid argument/i.test(message)
}

/**
 * 汇总 Antigravity 请求信息用于调试
 * 当发生 400 错误时，输出请求的关键统计信息，帮助定位问题
 *
 * @param {Object} requestData - 发送给 Antigravity 的请求数据
 * @returns {Object} 请求摘要信息
 */
function summarizeAntigravityRequestForDebug(requestData) {
  const request = requestData?.request || {}
  const contents = Array.isArray(request.contents) ? request.contents : []
  const partStats = { text: 0, thought: 0, functionCall: 0, functionResponse: 0, other: 0 }
  let functionResponseIds = 0
  let fallbackSignatureCount = 0

  for (const message of contents) {
    const parts = Array.isArray(message?.parts) ? message.parts : []
    for (const part of parts) {
      if (!part || typeof part !== 'object') {
        continue
      }
      if (part.thoughtSignature === THOUGHT_SIGNATURE_FALLBACK) {
        fallbackSignatureCount += 1
      }
      if (part.thought) {
        partStats.thought += 1
        continue
      }
      if (part.functionCall) {
        partStats.functionCall += 1
        continue
      }
      if (part.functionResponse) {
        partStats.functionResponse += 1
        if (part.functionResponse.id) {
          functionResponseIds += 1
        }
        continue
      }
      if (typeof part.text === 'string') {
        partStats.text += 1
        continue
      }
      partStats.other += 1
    }
  }

  return {
    model: requestData?.model,
    toolCount: Array.isArray(request.tools) ? request.tools.length : 0,
    toolConfigMode: request.toolConfig?.functionCallingConfig?.mode,
    thinkingConfig: request.generationConfig?.thinkingConfig,
    maxOutputTokens: request.generationConfig?.maxOutputTokens,
    contentsCount: contents.length,
    partStats,
    functionResponseIds,
    fallbackSignatureCount
  }
}

/**
 * 清洗工具结果的 content blocks
 * - 移除 base64 图片（避免体积过大）
 * - 截断文本内容到 20 万字符
 * @param {Array} blocks - content blocks 数组
 * @returns {Array} 清洗后的 blocks
 */
function sanitizeToolResultBlocksForAntigravity(blocks) {
  const cleaned = []
  let usedChars = 0
  let removedImage = false

  // ✨✨✨ 添加日志,方便确认 MCP 数据是不是被压缩了 ✨✨✨
  if (blocks.length > 0) {
    logger.info(
      `✂️ [Truncation Check] Processing ${blocks.length} blocks for truncation (MAX: ${MAX_ANTIGRAVITY_TOOL_RESULT_CHARS} chars)`
    )
  }
  // ✨✨✨ 添加结束 ✨✨✨

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
      // [ENABLED] 使用语义压缩减少 prompt 体积，降低 429/断流概率
      // 工具结果压缩
      const text = compactToolResultTextForAntigravity(block.text, remaining)

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

// ============================================================================
// 核心函数：消息标准化和转换
// ============================================================================

/**
 * 标准化工具结果内容
 * 支持字符串和 content blocks 数组两种格式
 * 对 Antigravity 会进行截断和图片移除处理
 */
function normalizeToolResultContent(content, { vendor = null } = {}) {
  if (content === null || content === undefined) {
    return ''
  }
  if (typeof content === 'string') {
    if (vendor === 'antigravity') {
      // [ENABLED] 使用语义压缩减少 prompt 体积，降低 429/断流概率
      // 工具结果压缩
      return compactToolResultTextForAntigravity(content, MAX_ANTIGRAVITY_TOOL_RESULT_CHARS)
    }
    return content
  }
  // Claude Code 的 tool_result.content 通常是 content blocks 数组（例如 [{type:"text",text:"..."}]）。
  // [dadongwo] 保留原始 JSON 结构（数组/对象），避免上游将其视为“无效 tool_result”从而触发 400。
  if (Array.isArray(content) || (content && typeof content === 'object')) {
    if (vendor === 'antigravity' && Array.isArray(content)) {
      return sanitizeToolResultBlocksForAntigravity(content)
    }
    return content
  }
  return ''
}

/**
 * 标准化 Anthropic 消息列表
 * 这是关键的预处理函数，处理以下问题：
 *
 * 1. Antigravity thinking block 顺序调整
 *    - Antigravity 要求 thinking blocks 必须在 assistant 消息的最前面
 *    - 移除 thinking block 中的 cache_control 字段（上游不接受）
 *
 * 2. tool_use 后的冗余内容剥离
 *    - 移除 tool_use 后的空文本、"(no content)" 等冗余 part
 *
 * 3. 缺失 tool_result 补全（Antigravity 专用）
 *    - 检测消息历史中是否有 tool_use 没有对应的 tool_result
 *    - 自动插入合成的 tool_result（is_error: true）
 *    - 避免 "tool_use concurrency" 400 错误
 *
 * 4. tool_result 和 user 文本拆分
 *    - Claude Code 可能把 tool_result 和用户文本混在一个 user message 中
 *    - 拆分为两个 message 以符合 Anthropic 规范
 *
 * @param {Array} messages - 原始消息列表
 * @param {Object} options - 选项，包含 vendor
 * @returns {Array} 标准化后的消息列表
 */
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
        // 移除 cache_control 字段，上游 API 不接受 thinking block 中包含此字段
        // 错误信息: "thinking.cache_control: Extra inputs are not permitted"
        const { cache_control: _cache_control, ...cleanedPart } = part
        thinkingBlocks.push(cleanedPart)
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

// ============================================================================
// 核心函数：工具定义转换
// ============================================================================

/**
 * 将 Anthropic 工具定义转换为 Gemini/Antigravity 格式
 *
 * 主要工作：
 * 1. 工具描述压缩（Antigravity: 400 字符上限）
 * 2. JSON Schema 清洗（移除不支持的字段如 $schema, format 等）
 * 3. Schema description 压缩（Antigravity: 200 字符上限，保留关键约束）
 * 4. 输出格式差异：
 *    - Antigravity: 使用 parametersJsonSchema
 *    - Gemini: 使用 parameters
 *
 * @param {Array} tools - Anthropic 格式的工具定义数组
 * @param {Object} options - 选项，包含 vendor
 * @returns {Array|null} Gemini 格式的工具定义，或 null
 */
function convertAnthropicToolsToGeminiTools(tools, { vendor = null, targetModel = null } = {}) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return null
  }

  const isAntigravityGeminiModel = vendor === 'antigravity' && isGeminiModelId(targetModel)

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
      if (sanitized.items) {
        sanitized.type = 'array'
      } else if (sanitized.properties || sanitized.required || sanitized.additionalProperties) {
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

  const convertJsonSchemaToAntigravityParameters = (schema, depth = 0) => {
    const MAX_DEPTH = 8
    if (schema === null || schema === undefined) {
      return { type: 'OBJECT', properties: {} }
    }
    if (depth > MAX_DEPTH) {
      return { type: 'OBJECT', properties: {} }
    }
    if (typeof schema !== 'object') {
      return { type: 'OBJECT', properties: {} }
    }
    if (Array.isArray(schema)) {
      return {
        type: 'ARRAY',
        items: schema[0]
          ? convertJsonSchemaToAntigravityParameters(schema[0], depth + 1)
          : { type: 'OBJECT', properties: {} }
      }
    }

    const rawType = schema.type
    const resolvedType = (() => {
      if (typeof rawType === 'string') {
        return rawType
      }
      if (Array.isArray(rawType)) {
        const first = rawType.find((t) => typeof t === 'string' && t !== 'null')
        return first || 'object'
      }
      if (schema.properties || schema.required) {
        return 'object'
      }
      if (schema.items) {
        return 'array'
      }
      return 'object'
    })()

    const typeMap = {
      object: 'OBJECT',
      array: 'ARRAY',
      string: 'STRING',
      integer: 'INTEGER',
      number: 'NUMBER',
      boolean: 'BOOLEAN'
    }

    const out = { type: typeMap[String(resolvedType || '').toLowerCase()] || 'OBJECT' }

    if (typeof schema.description === 'string' && schema.description) {
      out.description = schema.description
    }

    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
      out.enum = schema.enum.slice(0, 60)
    }

    if (out.type === 'ARRAY') {
      out.items = convertJsonSchemaToAntigravityParameters(schema.items || null, depth + 1)
      return out
    }

    if (out.type === 'OBJECT') {
      const props =
        schema.properties && typeof schema.properties === 'object' ? schema.properties : {}
      const nextProps = {}
      for (const [propName, propSchema] of Object.entries(props)) {
        nextProps[propName] = convertJsonSchemaToAntigravityParameters(propSchema, depth + 1)
      }
      out.properties = nextProps

      if (Array.isArray(schema.required) && schema.required.length > 0) {
        const keys = new Set(Object.keys(nextProps))
        const req = schema.required.filter((k) => typeof k === 'string' && keys.has(k))
        if (req.length > 0) {
          out.required = req
        }
      }
      return out
    }

    // primitives
    if (typeof schema.minimum === 'number') {
      out.minimum = schema.minimum
    }
    if (typeof schema.maximum === 'number') {
      out.maximum = schema.maximum
    }
    if (typeof schema.minLength === 'number') {
      out.minLength = schema.minLength
    }
    if (typeof schema.maxLength === 'number') {
      out.maxLength = schema.maxLength
    }
    if (typeof schema.minItems === 'number') {
      out.minItems = schema.minItems
    }
    if (typeof schema.maxItems === 'number') {
      out.maxItems = schema.maxItems
    }
    return out
  }

  // Antigravity Gemini 对 schema 校验/解析更挑剔：做“更激进”的降级，仅保留最核心的约束结构，
  // 避免 $ref/anyOf/oneOf/allOf/if-then-else/patternProperties 等触发上游 schema reject。
  const sanitizeSchemaForAntigravityGemini = (schema, depth = 0) => {
    const MAX_DEPTH = 6
    const MAX_PROPERTIES = 60
    const MAX_ENUM = 60
    const MAX_DESCRIPTION = 200

    if (schema === null || schema === undefined) {
      return null
    }

    if (depth > MAX_DEPTH) {
      return { type: 'object', properties: {} }
    }

    // JSON Schema boolean form：true/false（尽量避免 false 直接导致整体不可用）
    if (typeof schema === 'boolean') {
      return schema ? { type: 'object', properties: {} } : { type: 'object', properties: {} }
    }

    if (typeof schema !== 'object') {
      return schema
    }

    if (Array.isArray(schema)) {
      return schema
        .map((item) => sanitizeSchemaForAntigravityGemini(item, depth + 1))
        .filter((item) => item !== null && item !== undefined)
    }

    if (schema.$ref) {
      return { type: 'object', properties: {} }
    }

    const pickFirstBranch = (key) => {
      const arr = schema[key]
      if (!Array.isArray(arr) || arr.length === 0) {
        return null
      }
      for (const item of arr) {
        const sanitized = sanitizeSchemaForAntigravityGemini(item, depth + 1)
        if (sanitized) {
          return sanitized
        }
      }
      return null
    }

    // 优先处理组合 schema：挑一个可用分支即可，避免复杂结构
    const anyOfPicked = pickFirstBranch('anyOf')
    if (anyOfPicked) {
      return anyOfPicked
    }
    const oneOfPicked = pickFirstBranch('oneOf')
    if (oneOfPicked) {
      return oneOfPicked
    }
    const allOfPicked = pickFirstBranch('allOf')
    if (allOfPicked) {
      return allOfPicked
    }

    const allowedKeys = new Set([
      'type',
      'properties',
      'required',
      'description',
      'enum',
      'items',
      'minimum',
      'maximum',
      'minItems',
      'maxItems',
      'minLength',
      'maxLength'
    ])

    const sanitized = {}
    for (const [key, value] of Object.entries(schema)) {
      if (key === '$schema' || key === '$id') {
        continue
      }
      if (key === 'title' || key === 'default' || key === 'examples' || key === 'example') {
        continue
      }
      if (key === 'format') {
        continue
      }
      // Gemini/Antigravity 不稳定/不支持：直接丢弃
      if (
        key === 'additionalProperties' ||
        key === 'patternProperties' ||
        key === 'dependencies' ||
        key === 'dependentRequired' ||
        key === 'dependentSchemas' ||
        key === 'if' ||
        key === 'then' ||
        key === 'else' ||
        key === 'not' ||
        key === 'definitions' ||
        key === '$defs'
      ) {
        continue
      }
      if (!allowedKeys.has(key)) {
        continue
      }

      if (key === 'type') {
        if (typeof value === 'string') {
          sanitized.type = value
        } else if (Array.isArray(value)) {
          const first = value.find((t) => typeof t === 'string' && t !== 'null')
          if (first) {
            sanitized.type = first
          }
        }
        continue
      }

      if (key === 'description') {
        if (typeof value === 'string' && value) {
          sanitized.description =
            value.length > MAX_DESCRIPTION ? value.slice(0, MAX_DESCRIPTION) : value
        }
        continue
      }

      if (key === 'enum') {
        if (Array.isArray(value) && value.length > 0) {
          const en = value
            .filter(
              (item) =>
                typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
            )
            .slice(0, MAX_ENUM)
          if (en.length > 0) {
            sanitized.enum = en
          }
        }
        continue
      }

      if (key === 'required') {
        if (Array.isArray(value) && value.length > 0) {
          const req = value.filter((item) => typeof item === 'string')
          if (req.length > 0) {
            sanitized.required = req
          }
        }
        continue
      }

      if (key === 'properties') {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const props = {}
          const entries = Object.entries(value).slice(0, MAX_PROPERTIES)
          for (const [propName, propSchema] of entries) {
            const propSanitized = sanitizeSchemaForAntigravityGemini(propSchema, depth + 1)
            if (propSanitized && typeof propSanitized === 'object') {
              props[propName] = propSanitized
            }
          }
          sanitized.properties = props
        }
        continue
      }

      if (key === 'items') {
        const itemsSanitized = sanitizeSchemaForAntigravityGemini(value, depth + 1)
        if (itemsSanitized && typeof itemsSanitized === 'object') {
          sanitized.items = itemsSanitized
        }
        continue
      }

      const sanitizedValue = sanitizeSchemaForAntigravityGemini(value, depth + 1)
      if (sanitizedValue === null || sanitizedValue === undefined) {
        continue
      }
      sanitized[key] = sanitizedValue
    }

    // 兜底：尽量规整为 object schema，避免上游对空/不确定 type 的奇怪处理
    if (!sanitized.type) {
      if (sanitized.items) {
        sanitized.type = 'array'
      } else if (sanitized.properties || sanitized.required) {
        sanitized.type = 'object'
      } else if (sanitized.enum) {
        sanitized.type = 'string'
      } else {
        sanitized.type = 'object'
      }
    }

    if (sanitized.type === 'object') {
      if (!sanitized.properties) {
        sanitized.properties = {}
      }
      if (Array.isArray(sanitized.required) && sanitized.required.length > 0) {
        const keys = new Set(Object.keys(sanitized.properties))
        sanitized.required = sanitized.required.filter((k) => keys.has(k))
        if (sanitized.required.length === 0) {
          delete sanitized.required
        }
      }
    }

    return sanitized
  }

  // [FIX] 检测是否有 web_search / googleSearch 类型的服务器工具
  // Claude API 中的 web_search 工具可能有以下形式：
  // - type: "web_search_20250305" 或类似
  // - name: "web_search" / "google_search"
  const isWebSearchTool = (tool) => {
    if (!tool) {
      return false
    }
    const toolType = tool.type || ''
    const toolName = tool.name || ''
    return (
      toolType.includes('web_search') || toolName === 'web_search' || toolName === 'google_search'
    )
  }

  const hasWebSearchTool = tools.some(isWebSearchTool)
  const nonWebSearchTools = tools.filter((t) => !isWebSearchTool(t))

  const functionDeclarations = nonWebSearchTools
    .map((tool) => {
      const toolDef = tool?.custom && typeof tool.custom === 'object' ? tool.custom : tool
      if (!toolDef || !toolDef.name) {
        return null
      }

      const toolDescription =
        vendor === 'antigravity'
          ? compactToolDescriptionForAntigravity(toolDef.description || '')
          : toolDef.description || ''

      const schema =
        vendor === 'antigravity'
          ? compactJsonSchemaDescriptionsForAntigravity(
              isAntigravityGeminiModel
                ? sanitizeSchemaForAntigravityGemini(cleanJsonSchemaForGemini(toolDef.input_schema))
                : cleanJsonSchemaForGemini(toolDef.input_schema)
            )
          : sanitizeSchemaForFunctionDeclarations(toolDef.input_schema) || {
              type: 'object',
              properties: {}
            }

      const baseDecl = {
        name: toolDef.name,
        description: toolDescription
      }

      // [dadongwo] Antigravity 使用 parametersJsonSchema（而不是 parameters）
      if (vendor === 'antigravity') {
        if (isAntigravityGeminiModel) {
          return { ...baseDecl, parameters: convertJsonSchemaToAntigravityParameters(schema) }
        }
        return { ...baseDecl, parametersJsonSchema: schema }
      }
      return { ...baseDecl, parameters: schema }
    })
    .filter(Boolean)

  // [FIX] 解决 "Multiple tools are supported only when they are all search tools" 400 错误
  // Gemini v1internal 接口不允许在同一个工具定义中混用 Google Search 和 Function Declarations
  // 工具参数处理
  if (functionDeclarations.length > 0) {
    // 如果有本地工具（functionDeclarations），则只使用本地工具，放弃 googleSearch
    if (hasWebSearchTool) {
      logger.info(
        `⚠️ [Tool-Conflict] Skipping googleSearch injection due to ${functionDeclarations.length} existing function declarations. Gemini v1internal does not support mixed tool types.`
      )
    }
    if (isAntigravityGeminiModel) {
      return functionDeclarations.map((decl) => ({ functionDeclarations: [decl] }))
    }
    return [{ functionDeclarations }]
  }

  // 如果只有 web_search 没有其他本地工具，返回 googleSearch
  if (hasWebSearchTool) {
    return [{ googleSearch: {} }]
  }

  return null
}

/**
 * 将 Anthropic 的 tool_choice 转换为 Gemini 的 toolConfig
 * 映射关系：
 *   auto → AUTO（模型自决定是否调用工具）
 *   any  → ANY（必须调用某个工具）
 *   tool → ANY + allowedFunctionNames（指定工具）
 *   none → NONE（禁止调用工具）
 */
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

function isGeminiModelId(model) {
  return String(model || '')
    .trim()
    .toLowerCase()
    .startsWith('gemini-')
}

function resolveAnthropicToolName(tool) {
  const toolDef = tool?.custom && typeof tool.custom === 'object' ? tool.custom : tool
  return toolDef?.name || null
}

function extractLastUserTextFromAnthropicMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return ''
  }
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (msg?.role !== 'user') {
      continue
    }
    const content = msg?.content
    if (typeof content === 'string') {
      const text = extractAnthropicText(content)
      if (text && typeof text === 'string' && !shouldSkipText(text)) {
        return text
      }
      continue
    }

    if (Array.isArray(content)) {
      const parts = []
      for (const part of content) {
        if (!part || part.type !== 'text') {
          continue
        }
        const text = extractAnthropicText(part.text || '')
        if (!text || shouldSkipText(text)) {
          continue
        }
        parts.push(text)
      }
      if (parts.length > 0) {
        return parts.join('\n')
      }
    }
  }
  return ''
}

function buildAntigravityGeminiToolRouting({ tools, messages }) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return { tools: null, toolConfigOverride: null }
  }

  const originalCount = tools.length
  const availableNames = new Set()
  for (const tool of tools) {
    const name = resolveAnthropicToolName(tool)
    if (name) {
      availableNames.add(name)
    }
  }

  const userText = extractLastUserTextFromAnthropicMessages(messages)
  const text = String(userText || '').trim()
  const lower = text.toLowerCase()

  const needsTool =
    /创建|新建|写入|写到|保存|生成文件|输出到文件|写文件|改动|修改|编辑|读取|打开|查看文件|搜索|查找|运行|执行|命令|终端|shell|bash|cmd|powershell|mcp|资源|工具调用/.test(
      text
    ) ||
    /\b(create|write|save|edit|modify|read|open|view|search|grep|find|run|execute|command|terminal|bash|powershell|mcp)\b/.test(
      lower
    )

  // 不强行“降级体验”：仅在明显需要工具且工具集合过大时才做路由裁剪
  const TOOL_ROUTING_THRESHOLD = 20
  if (!needsTool || originalCount <= TOOL_ROUTING_THRESHOLD) {
    return { tools, toolConfigOverride: null }
  }

  const wantsWrite =
    /创建.*文件|新建.*文件|写入.*文件|写.*文件|保存到.*文件|输出到.*文件|生成.*文件/.test(text) ||
    /\b(create|write|save).*(file|txt|json|md)\b/.test(lower)

  const wantsEdit =
    /修改.*文件|编辑.*文件|把.*改成|替换.*内容/.test(text) ||
    /\b(edit|modify|change|replace).*(file|content)\b/.test(lower)

  const wantsRead =
    /读取.*文件|打开.*文件|查看.*文件|看看.*文件|读取内容|查看内容/.test(text) ||
    /\b(read|open|view).*(file|content)\b/.test(lower)

  const wantsCommand =
    /运行|执行|命令|终端|shell|bash|cmd|powershell/.test(text) ||
    /\b(run|execute|command|terminal|bash|powershell)\b/.test(lower)

  const wantsSearch =
    /搜索|查找|grep|ripgrep|rg|glob|定位/.test(text) || /\b(search|find|grep|rg|glob)\b/.test(lower)

  const wantsMcp = /mcp|资源|server|uri/.test(lower) || /mcp|资源/.test(text)

  const baseNames = [
    'Read',
    'Edit',
    'Write',
    'Grep',
    'Glob',
    'Bash',
    'WebFetch',
    'WebSearch',
    'ListMcpResourcesTool',
    'ReadMcpResourceTool'
  ]

  const selected = new Set()
  const add = (name) => {
    if (!name || !availableNames.has(name)) {
      return
    }
    selected.add(name)
  }

  for (const name of baseNames) {
    add(name)
  }

  if (wantsSearch) {
    add('Grep')
    add('Glob')
  }
  if (wantsCommand) {
    add('Bash')
  }
  if (wantsRead) {
    add('Read')
  }
  if (wantsEdit) {
    add('Edit')
    add('Read')
  }
  if (wantsWrite) {
    add('Write')
    add('Read')
    add('Edit')
  }
  if (wantsMcp) {
    add('ListMcpResourcesTool')
    add('ReadMcpResourceTool')
  }

  const allowedFunctionNames = Array.from(selected)
  if (allowedFunctionNames.length === 0) {
    return { tools, toolConfigOverride: null }
  }

  const filteredTools = tools.filter((tool) => {
    const name = resolveAnthropicToolName(tool)
    return name && selected.has(name)
  })

  // 对于“明确要求动手”的场景，显式设置 VALIDATED（对齐 IDE 的 function calling 配置）
  const shouldForceValidated = wantsWrite || wantsEdit || wantsCommand
  const toolConfigOverride = shouldForceValidated
    ? { functionCallingConfig: { mode: 'VALIDATED' } }
    : null

  logger.info('🔧 [Antigravity-Gemini] Tool routing applied', {
    originalToolsCount: originalCount,
    filteredToolsCount: filteredTools.length,
    forcedValidated: shouldForceValidated,
    allowedFunctionNames
  })

  return { tools: filteredTools, toolConfigOverride }
}

// ============================================================================
// 核心函数：消息内容转换
// ============================================================================

/**
 * 将 Anthropic 消息转换为 Gemini contents 格式
 *
 * 处理的内容类型：
 * - text: 纯文本内容
 * - thinking: 思考过程（转换为 Gemini 的 thought part）
 * - image: 图片（转换为 inlineData）
 * - tool_use: 工具调用（转换为 functionCall）
 * - tool_result: 工具结果（转换为 functionResponse）
 *
 * Antigravity 特殊处理：
 * - thinking block 转换为 { thought: true, text, thoughtSignature }
 * - signature 清洗和校验（不伪造签名）
 * - 空 thinking block 跳过（避免 400 错误）
 * - stripThinking 模式：完全剔除 thinking blocks
 *
 * @param {Array} messages - 标准化后的消息列表
 * @param {Map} toolUseIdToName - tool_use ID 到工具名的映射
 * @param {Object} options - 选项，包含 vendor、stripThinking
 * @returns {Array} Gemini 格式的 contents
 */
function convertAnthropicMessagesToGeminiContents(
  messages,
  toolUseIdToName,
  { vendor = null, stripThinking = false, sessionId = null, targetModel = null } = {}
) {
  const isAntigravityGeminiModel = vendor === 'antigravity' && isGeminiModelId(targetModel)
  const contents = []
  for (const message of messages || []) {
    const role = message?.role === 'assistant' ? 'model' : 'user'

    const content = message?.content
    const parts = []
    let lastAntigravityThoughtSignature = ''

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

        if (part.type === 'thinking' || part.type === 'redacted_thinking') {
          // 当 thinking 未启用时，跳过所有 thinking blocks，避免 Antigravity 400 错误：
          // "When thinking is disabled, an assistant message cannot contain thinking"
          if (stripThinking) {
            continue
          }

          const thinkingText = extractAnthropicText(part.thinking || part.text || '')
          if (vendor === 'antigravity') {
            const hasThinkingText = thinkingText && !shouldSkipText(thinkingText)
            // 先尝试使用请求中的签名，如果没有则尝试从缓存恢复
            let signature = sanitizeThoughtSignatureForAntigravity(part.signature)
            if (!signature && sessionId && hasThinkingText) {
              const cachedSig = signatureCache.getCachedSignature(sessionId, thinkingText)
              if (cachedSig) {
                signature = cachedSig
                logger.debug('[SignatureCache] Restored signature from cache for thinking block')
              }
            }

            // [NEW] 跨模型兼容性检查
            // 检查签名是否来自兼容的模型家族，防止跨模型签名错误
            if (signature && targetModel) {
              const cachedFamily = signatureCache.getSignatureFamily(signature)
              if (cachedFamily && !isModelCompatible(cachedFamily, targetModel)) {
                logger.warn(
                  `⚠️ [Thinking-Compatibility] Incompatible signature detected (Family: ${cachedFamily}, Target: ${targetModel}). Dropping signature.`
                )
                // 丢弃不兼容的签名，将 thinking 降级为普通文本
                if (hasThinkingText) {
                  parts.push({ text: thinkingText })
                }
                continue
              }
            }

            const hasSignature = Boolean(signature)

            // Claude Code 有时会发送空的 thinking block（无 thinking / 无 signature）。
            // 传给 Antigravity 会变成仅含 thoughtSignature 的 part，容易触发 INVALID_ARGUMENT。
            if (!hasThinkingText && !hasSignature) {
              continue
            }

            // Antigravity 会校验 thoughtSignature；缺失/不合法时无法伪造，只能丢弃该块避免 400。
            if (!hasSignature) {
              continue
            }

            lastAntigravityThoughtSignature = signature
            const thoughtPart = { thought: true, thoughtSignature: signature }
            if (hasThinkingText) {
              thoughtPart.text = thinkingText
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
            const functionCall = {
              ...(vendor === 'antigravity' && toolCallId ? { id: toolCallId } : {}),
              name: part.name,
              args
            }

            // Antigravity 对历史工具调用的 functionCall 会校验 thoughtSignature；
            // Claude Code 侧的签名存放在 thinking block（part.signature），这里需要回填到 functionCall part 上。
            // [Antigravity] 仅在有有效签名时附带 thoughtSignature（Gemini 路径禁止使用 fallback）
            if (vendor === 'antigravity') {
              if (isAntigravityGeminiModel) {
                let effectiveSignature = lastAntigravityThoughtSignature || ''
                if (!effectiveSignature && toolCallId) {
                  const cachedSignature = signatureCache.getToolSignature(toolCallId)
                  if (cachedSignature) {
                    effectiveSignature = cachedSignature
                    lastAntigravityThoughtSignature = cachedSignature
                    logger.debug('[SignatureCache] Restored signature from tool cache for tool_use')
                  }
                }
                if (effectiveSignature) {
                  parts.push({
                    thought: true,
                    thoughtSignature: effectiveSignature,
                    functionCall
                  })
                } else {
                  parts.push({ functionCall })
                }
              } else {
                const effectiveSignature =
                  lastAntigravityThoughtSignature || THOUGHT_SIGNATURE_FALLBACK
                // Antigravity 要求：每个包含 thoughtSignature 的 part 都必须有 thought: true
                parts.push({
                  thought: true,
                  thoughtSignature: effectiveSignature,
                  functionCall
                })
              }
            } else {
              parts.push({ functionCall })
            }
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
            const response = part.is_error === true ? { result, is_error: true } : { result }

            parts.push({
              functionResponse: {
                ...(toolCallId ? { id: toolCallId } : {}),
                name: toolName,
                response
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

/**
 * 检查是否可以为 Antigravity 启用 thinking 功能
 *
 * 规则：查找最后一个 assistant 消息，检查其 thinking block 是否有效
 * - 如果有 thinking 文本或 signature，则可以启用
 * - 如果是空 thinking block（无文本且无 signature），则不能启用
 *
 * 这是为了避免 "When thinking is disabled, an assistant message cannot contain thinking" 错误
 *
 * @param {Array} messages - 消息列表
 * @returns {boolean} 是否可以启用 thinking
 */
function canEnableAntigravityThinking(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return true
  }

  // Antigravity 会校验历史 thinking blocks 的 signature；缺失/不合法时必须禁用 thinking，避免 400。
  for (const message of messages) {
    if (!message || message.role !== 'assistant') {
      continue
    }
    const { content } = message
    if (!Array.isArray(content) || content.length === 0) {
      continue
    }
    for (const part of content) {
      if (!part || (part.type !== 'thinking' && part.type !== 'redacted_thinking')) {
        continue
      }
      const signature = sanitizeThoughtSignatureForAntigravity(part.signature)
      if (!signature) {
        return false
      }
    }
  }

  let lastAssistant = null
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message && message.role === 'assistant') {
      lastAssistant = message
      break
    }
  }
  if (
    !lastAssistant ||
    !Array.isArray(lastAssistant.content) ||
    lastAssistant.content.length === 0
  ) {
    return true
  }

  const parts = lastAssistant.content.filter(Boolean)
  const hasToolBlocks = parts.some(
    (part) => part?.type === 'tool_use' || part?.type === 'tool_result'
  )
  if (!hasToolBlocks) {
    return true
  }

  const first = parts[0]
  if (!first || (first.type !== 'thinking' && first.type !== 'redacted_thinking')) {
    return false
  }

  return true
}

// ============================================================================
// 核心函数：构建最终请求
// ============================================================================

/**
 * 构建 Gemini/Antigravity 请求体
 * 这是整个转换流程的主函数，串联所有转换步骤：
 *
 * 1. normalizeAnthropicMessages - 消息标准化
 * 2. buildToolUseIdToNameMap - 构建 tool_use ID 映射
 * 3. canEnableAntigravityThinking - 检查 thinking 是否可启用
 * 4. convertAnthropicMessagesToGeminiContents - 转换消息内容
 * 5. buildSystemParts - 构建 system prompt
 * 6. convertAnthropicToolsToGeminiTools - 转换工具定义
 * 7. convertAnthropicToolChoiceToGeminiToolConfig - 转换工具选择
 * 8. 构建 generationConfig（温度、maxTokens、thinking 等）
 *
 * @param {Object} body - Anthropic 请求体
 * @param {string} baseModel - 基础模型名
 * @param {Object} options - 选项，包含 vendor
 * @returns {Object} { model, request } Gemini 请求对象
 */
function buildGeminiRequestFromAnthropic(
  body,
  baseModel,
  { vendor = null, sessionId = null, enableAntigravityGeminiToolRouting = false } = {}
) {
  // ========================================================================
  // [NEW] 预处理阶段：消息清理和优化
  // 模型处理优化
  // ========================================================================

  // 复制消息列表以避免修改原始数据
  const messages = JSON.parse(JSON.stringify(body.messages || []))

  const isAntigravityGeminiModel = vendor === 'antigravity' && isGeminiModelId(baseModel)

  // [FIX #813] 合并连续的同角色消息
  // 确保请求符合 Anthropic 和 Gemini 的角色交替协议
  mergeConsecutiveMessages(messages)

  // [FIX #709] 预排序 thinking blocks
  // 确保 assistant 消息中的 thinking blocks 始终在最前面
  sortThinkingBlocksFirst(messages)

  // [NEW] ContextManager: 上下文压力检测和历史净化
  // 仅对 Antigravity vendor 启用（因为它对 prompt 长度更敏感）
  if (vendor === 'antigravity') {
    // 确定上下文限制（Flash: ~1M, Pro: ~2M）
    const contextLimit = baseModel?.toLowerCase().includes('flash') ? 1000000 : 2000000
    const estimatedUsage = estimateTokenUsage({ ...body, messages })
    const usageRatio = estimatedUsage / contextLimit

    const strategy = determinePurificationStrategy(usageRatio)
    if (strategy !== PurificationStrategy.None) {
      logger.info(
        `[ContextManager] Context pressure: ${(usageRatio * 100).toFixed(1)}% (${estimatedUsage} / ${contextLimit}), Strategy: ${strategy}`
      )
      purifyHistoryThinking(messages, strategy)
    }

    // [NEW] 工具循环修复
    // 检测并修复断裂的工具循环，避免 "Assistant message must start with thinking" 错误
    if (!isAntigravityGeminiModel) {
      closeToolLoopForThinking(messages)
    }
  }

  // 使用预处理后的消息进行后续转换
  const normalizedMessages = normalizeAnthropicMessages(messages, { vendor })
  const toolUseIdToName = buildToolUseIdToNameMap(normalizedMessages || [])

  // 提前判断是否可以启用 thinking，以便决定是否需要剥离 thinking blocks
  let canEnableThinking = false
  if (vendor === 'antigravity' && body?.thinking?.type === 'enabled') {
    const budgetRaw = Number(body.thinking.budget_tokens)
    if (Number.isFinite(budgetRaw)) {
      canEnableThinking = canEnableAntigravityThinking(normalizedMessages)
    }
  }

  const contents = convertAnthropicMessagesToGeminiContents(
    normalizedMessages || [],
    toolUseIdToName,
    {
      vendor,
      // 当 Antigravity 无法启用 thinking 时，剥离所有 thinking blocks
      stripThinking: vendor === 'antigravity' && !canEnableThinking,
      sessionId,
      targetModel: baseModel // 用于签名兼容性检查
    }
  )
  const systemParts = buildSystemParts(body.system)

  if (vendor === 'antigravity' && isEnvEnabled(process.env[TOOL_ERROR_CONTINUE_ENV])) {
    systemParts.push({ text: TOOL_ERROR_CONTINUE_PROMPT })
  }
  if (vendor === 'antigravity') {
    systemParts.push({ text: ANTIGRAVITY_TOOL_FOLLOW_THROUGH_PROMPT })
  }

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
  if (isAntigravityGeminiModel && Array.isArray(body.stop_sequences)) {
    const stopSequences = body.stop_sequences.filter((s) => typeof s === 'string' && s)
    if (stopSequences.length > 0) {
      generationConfig.stopSequences = stopSequences
    }
  }

  // 使用前面已经计算好的 canEnableThinking 结果
  if (vendor === 'antigravity' && body?.thinking?.type === 'enabled') {
    const budgetRaw = Number(body.thinking.budget_tokens)
    if (Number.isFinite(budgetRaw)) {
      if (canEnableThinking) {
        const includeThoughtsKey = isAntigravityGeminiModel ? 'includeThoughts' : 'include_thoughts'
        generationConfig.thinkingConfig = {
          thinkingBudget: Math.trunc(budgetRaw),
          [includeThoughtsKey]: true
        }
      } else {
        logger.warn(
          '⚠️ Antigravity thinking request dropped: last assistant message lacks usable thinking block',
          { model: baseModel }
        )
      }
    }
  }

  const geminiRequestBody = {
    contents,
    generationConfig
  }

  // antigravity: 前置注入系统提示词
  if (vendor === 'antigravity') {
    if (isAntigravityGeminiModel) {
      geminiRequestBody.systemInstruction = {
        role: 'user',
        parts: [{ text: ANTIGRAVITY_SYSTEM_INSTRUCTION_PREFIX }]
      }
      if (systemParts.length > 0) {
        if (
          contents.length > 0 &&
          contents[0]?.role === 'user' &&
          Array.isArray(contents[0].parts)
        ) {
          contents[0].parts = [...systemParts, ...contents[0].parts]
        } else {
          contents.unshift({ role: 'user', parts: systemParts })
        }
      }
    } else {
      const allParts = [{ text: ANTIGRAVITY_SYSTEM_INSTRUCTION_PREFIX }, ...systemParts]
      geminiRequestBody.systemInstruction = { role: 'user', parts: allParts }
    }
  } else if (systemParts.length > 0) {
    geminiRequestBody.systemInstruction = { parts: systemParts }
  }

  let effectiveTools = body.tools
  let toolConfigOverride = null
  if (isAntigravityGeminiModel && enableAntigravityGeminiToolRouting && !body?.tool_choice) {
    const routing = buildAntigravityGeminiToolRouting({
      tools: Array.isArray(body.tools) ? body.tools : null,
      messages: normalizedMessages || []
    })
    if (routing?.tools) {
      effectiveTools = routing.tools
    }
    toolConfigOverride = routing?.toolConfigOverride || null
  }

  const geminiTools = convertAnthropicToolsToGeminiTools(effectiveTools, {
    vendor,
    targetModel: baseModel
  })
  if (geminiTools) {
    geminiRequestBody.tools = geminiTools
  }

  const toolConfig = convertAnthropicToolChoiceToGeminiToolConfig(body.tool_choice)
  if (toolConfig) {
    geminiRequestBody.toolConfig = toolConfig
  } else if (toolConfigOverride && geminiTools) {
    geminiRequestBody.toolConfig = toolConfigOverride
  } else if (geminiTools) {
    // Anthropic 的默认语义是 tools 存在且未设置 tool_choice 时为 auto。
    // Gemini/Antigravity 的 function calling 默认可能不会启用，因此显式设置，避免“永远不产出 tool_use”。
    const hasFunctionDeclarations = Array.isArray(geminiTools)
      ? geminiTools.some(
          (tool) =>
            Array.isArray(tool?.functionDeclarations) && tool.functionDeclarations.length > 0
        )
      : false
    const defaultMode = isAntigravityGeminiModel && hasFunctionDeclarations ? 'VALIDATED' : 'AUTO'
    geminiRequestBody.toolConfig = {
      functionCallingConfig: { mode: defaultMode }
    }
  }

  // [FIX #593] 最后一道防线：递归深度清理所有 cache_control 字段
  // 确保发送给 Antigravity/Gemini 的请求中不包含任何 cache_control
  // VS Code 插件等客户端可能在多轮对话中将历史消息的 cache_control 字段原封不动发回
  if (vendor === 'antigravity') {
    deepCleanCacheControl(geminiRequestBody)
  }

  return { model: baseModel, request: geminiRequestBody }
}

// ============================================================================
// 辅助函数：Gemini 响应解析
// ============================================================================

/**
 * 从 Gemini 响应中提取文本内容
 * @param {Object} payload - Gemini 响应 payload
 * @param {boolean} includeThought - 是否包含 thinking 文本
 * @returns {string} 提取的文本
 */
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

/**
 * 从 Gemini 响应中提取 thinking 文本内容
 */
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

function resolveGeminiPartSignature(part) {
  if (!part) {
    return ''
  }
  return part.thoughtSignature || part.thought_signature || part.signature || ''
}

/**
 * 从 Gemini 响应中提取 thinking signature
 * 用于在下一轮对话中传回给 Antigravity
 */
function extractGeminiThoughtSignature(payload) {
  const candidate = payload?.candidates?.[0]
  const parts = candidate?.content?.parts
  if (!Array.isArray(parts)) {
    return ''
  }

  // 优先：functionCall part 上的 signature（上游可能把签名挂在工具调用 part 上）
  for (const part of parts) {
    if (!part?.functionCall?.name) {
      continue
    }
    const signature = resolveGeminiPartSignature(part)
    if (signature) {
      return signature
    }
  }

  // 回退：thought part 上的 signature
  for (const part of parts) {
    if (!part?.thought) {
      continue
    }
    const signature = resolveGeminiPartSignature(part)
    if (signature) {
      return signature
    }
  }
  return ''
}

function cacheAntigravityGeminiToolSignaturesFromParts(payload, sessionId, model) {
  if (!sessionId) {
    return
  }
  const parts = extractGeminiParts(payload)
  if (parts.length === 0) {
    return
  }

  let lastSignature = ''
  const modelFamily = extractModelFamily(model)

  for (const part of parts) {
    if (part?.thought) {
      const sig = sanitizeThoughtSignatureForAntigravity(resolveGeminiPartSignature(part))
      if (sig) {
        lastSignature = sig
        signatureCache.cacheSessionSignature(sessionId, sig)
        if (modelFamily) {
          signatureCache.cacheSignatureFamily(sig, modelFamily)
        }
      }
      continue
    }

    if (part?.functionCall?.name) {
      const toolId =
        typeof part.functionCall.id === 'string' && part.functionCall.id ? part.functionCall.id : ''
      if (!toolId) {
        continue
      }
      const directSig = sanitizeThoughtSignatureForAntigravity(resolveGeminiPartSignature(part))
      const effectiveSig = directSig || lastSignature
      if (!effectiveSig) {
        continue
      }
      signatureCache.cacheToolSignature(toolId, effectiveSig)
      signatureCache.cacheSessionSignature(sessionId, effectiveSig)
      if (modelFamily) {
        signatureCache.cacheSignatureFamily(effectiveSig, modelFamily)
      }
    }
  }
}

/**
 * 解析 Gemini 响应的 token 使用情况
 * 计算输出 token 数（包括 candidate + thought tokens）
 */
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

/**
 * 检查环境变量是否启用
 * 支持 true/1/yes/on 等值
 */
function isEnvEnabled(value) {
  if (!value) {
    return false
  }
  const normalized = String(value).trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on'
}

/**
 * 从文本中提取 Write 工具调用
 * 处理模型在文本中输出 "Write: <path>" 格式的情况
 * 这是一个兜底机制，用于处理 function calling 失败的情况
 */
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

/**
 * 生成工具调用 ID
 * 使用 toolu_ 前缀 + 随机字符串
 */
function buildToolUseId() {
  return `toolu_${crypto.randomBytes(10).toString('hex')}`
}

/**
 * 稳定的 JSON 序列化（键按字母顺序排列）
 * 用于生成可比较的 JSON 字符串
 */
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

/**
 * 从 Gemini 响应中提取 parts 数组
 */
function extractGeminiParts(payload) {
  const candidate = payload?.candidates?.[0]
  const parts = candidate?.content?.parts
  if (!Array.isArray(parts)) {
    return []
  }
  return parts
}

// ============================================================================
// 核心函数：Gemini 响应转换为 Anthropic 格式
// ============================================================================

/**
 * 将 Gemini 响应转换为 Anthropic content blocks
 *
 * 处理的内容类型：
 * - text: 纯文本 → { type: "text", text }
 * - thought: 思考过程 → { type: "thinking", thinking, signature }
 * - functionCall: 工具调用 → { type: "tool_use", id, name, input }
 *
 * 注意：thinking blocks 会被调整到数组最前面（符合 Anthropic 规范）
 */
function convertGeminiPayloadToAnthropicContent(payload) {
  const parts = extractGeminiParts(payload)
  const content = []
  let currentText = ''

  const flushText = () => {
    if (!currentText) {
      return
    }
    content.push({ type: 'text', text: currentText })
    currentText = ''
  }

  const pushThinkingBlock = (thinkingText, signature) => {
    const normalizedThinking = typeof thinkingText === 'string' ? thinkingText : ''
    const normalizedSignature = typeof signature === 'string' ? signature : ''
    if (!normalizedThinking && !normalizedSignature) {
      return
    }
    const block = { type: 'thinking', thinking: normalizedThinking }
    if (normalizedSignature) {
      block.signature = normalizedSignature
    }
    content.push(block)
  }

  for (const part of parts) {
    const isThought = part?.thought === true
    if (isThought) {
      flushText()
      pushThinkingBlock(
        typeof part?.text === 'string' ? part.text : '',
        resolveGeminiPartSignature(part)
      )
      continue
    }

    if (typeof part?.text === 'string' && part.text) {
      currentText += part.text
      continue
    }

    const functionCall = part?.functionCall
    if (functionCall?.name) {
      flushText()

      // 上游可能把 thought signature 挂在 functionCall part 上：需要原样传回给客户端，
      // 以便下一轮对话能携带 signature。
      const functionCallSignature = resolveGeminiPartSignature(part)
      if (functionCallSignature) {
        pushThinkingBlock('', functionCallSignature)
      }

      const toolUseId =
        typeof functionCall.id === 'string' && functionCall.id ? functionCall.id : buildToolUseId()
      content.push({
        type: 'tool_use',
        id: toolUseId,
        name: functionCall.name,
        input: normalizeToolUseInput(functionCall.args)
      })
    }
  }

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

/**
 * 构建 Anthropic 格式的错误响应
 */
function buildAnthropicError(message) {
  return {
    type: 'error',
    error: {
      type: 'api_error',
      message: message || 'Upstream error'
    }
  }
}

/**
 * 判断是否应该在无工具模式下重试
 * 当上游报告 JSON Schema 或工具相关错误时，移除工具定义重试
 */
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

/**
 * 从请求中移除工具定义（用于重试）
 */
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

function parseAntigravity429Meta(error) {
  const body = error?.response?.data
  const reason = parseGoogleErrorReason(body) || null
  const retryDelayMs = parseGoogleRetryDelayMs(body)
  return { reason, retryDelayMs: retryDelayMs || null }
}

function bumpAntigravityQuotaStrike(accountId) {
  const key = String(accountId || '').trim()
  if (!key) {
    return 1
  }

  const now = Date.now()
  const existing = antigravityQuotaStrikesByAccountId.get(key)
  const isFresh = existing && now - (existing.lastAtMs || 0) <= ANTIGRAVITY_QUOTA_STRIKE_TTL_MS
  const nextCount = Math.min(
    ANTIGRAVITY_QUOTA_LOCKOUT_SECONDS.length,
    (isFresh ? existing.count || 0 : 0) + 1
  )

  antigravityQuotaStrikesByAccountId.set(key, { count: nextCount, lastAtMs: now })
  return nextCount
}

function resolveAntigravityAccountRateLimitSeconds({ accountId, reason, retryDelayMs }) {
  const parsedSeconds =
    retryDelayMs && retryDelayMs > 0 ? Math.max(1, Math.ceil(retryDelayMs / 1000)) : null

  // Cloud Code/Antigravity 有时只返回 RESOURCE_EXHAUSTED 而没有 details.reason；
  // 该错误通常是短周期限流或临时资源不足，按 rate limit 处理（避免持续撞 429）。
  if (reason === 'RESOURCE_EXHAUSTED') {
    return Math.max(ANTIGRAVITY_DEFAULT_RATE_LIMIT_SECONDS, parsedSeconds || 0)
  }

  if (reason === 'MODEL_CAPACITY_EXHAUSTED') {
    return Math.max(ANTIGRAVITY_DEFAULT_RATE_LIMIT_SECONDS, parsedSeconds || 0)
  }

  if (reason === 'RATE_LIMIT_EXCEEDED') {
    return Math.max(ANTIGRAVITY_DEFAULT_RATE_LIMIT_SECONDS, parsedSeconds || 0)
  }

  if (reason === 'QUOTA_EXHAUSTED') {
    const strike = bumpAntigravityQuotaStrike(accountId)
    const idx = Math.min(strike - 1, ANTIGRAVITY_QUOTA_LOCKOUT_SECONDS.length - 1)
    const base = ANTIGRAVITY_QUOTA_LOCKOUT_SECONDS[idx]
    return Math.max(base, parsedSeconds || 0)
  }

  return null
}

/**
 * 写入 Anthropic SSE 事件
 * 将事件和数据以 SSE 格式发送给客户端
 */
function writeAnthropicSseEvent(res, event, data) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

// ============================================================================
// 调试和跟踪函数
// ============================================================================

/**
 * 记录工具定义到文件（调试用）
 * 只在环境变量 ANTHROPIC_DEBUG_TOOLS_DUMP 启用时生效
 */
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

/**
 * 更新速率限制计数器
 * 跟踪 token 使用量和成本
 */
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

// ============================================================================
// 主入口函数：API 请求处理
// ============================================================================

/**
 * 处理 Anthropic 格式的请求并转发到 Gemini/Antigravity
 *
 * 这是整个模块的主入口，完整流程：
 * 1. 验证 vendor 支持
 * 2. 选择可用的 Gemini 账户
 * 3. 模型回退匹配（如果请求的模型不可用）
 * 4. 构建 Gemini 请求 (buildGeminiRequestFromAnthropic)
 * 5. 发送请求（流式或非流式）
 * 6. 处理响应并转换为 Anthropic 格式
 * 7. 如果工具相关错误，尝试移除工具重试
 * 8. 返回结果给客户端
 *
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Object} options - 包含 vendor 和 baseModel
 */
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

  let { accountId } = accountSelection
  const { accountType } = accountSelection
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

  let requestData = buildGeminiRequestFromAnthropic(req.body, effectiveModel, {
    vendor,
    sessionId: sessionHash
  })

  // Antigravity 上游对 Claude 模型的 function calling 启用/校验更严格：参考实现普遍使用 VALIDATED。
  // 注意：严格限定在 claude-*，避免影响 gemini-* 的 function calling 行为（只作用于 antigravity 的 claude 模型）。
  if (
    vendor === 'antigravity' &&
    String(effectiveModel || '')
      .toLowerCase()
      .includes('claude') &&
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

  // [dadongwo] Antigravity 默认启用 tools。若上游拒绝 schema，会在下方自动重试去掉 tools/toolConfig。

  let abortController = new AbortController()
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
        } else if (vendor === 'antigravity' && sanitized.statusCode === 429) {
          const { reason, retryDelayMs } = parseAntigravity429Meta(error)
          const resetsInSeconds = resolveAntigravityAccountRateLimitSeconds({
            accountId,
            reason,
            retryDelayMs
          })

          if (!resetsInSeconds) {
            throw error
          }

          logger.warn(
            '⚠️ Antigravity 429 rate limited (non-stream), switching account and retrying',
            {
              vendor,
              accountId,
              model: effectiveModel,
              reason,
              resetsInSeconds
            }
          )

          try {
            await unifiedGeminiScheduler.markAccountModelRateLimited(
              accountId,
              'gemini',
              sessionHash,
              effectiveModel,
              resetsInSeconds,
              reason
            )
          } catch (limitError) {
            logger.warn(
              'Failed to mark Gemini account model as rate limited (antigravity):',
              limitError
            )
          }

          try {
            const newAccountSelection = await unifiedGeminiScheduler.selectAccountForApiKey(
              req.apiKey,
              sessionHash,
              effectiveModel,
              { oauthProvider: vendor }
            )
            const newAccountId = newAccountSelection.accountId

            const newAccount = await geminiAccountService.getAccount(newAccountId)
            if (!newAccount) {
              throw new Error(`Retry account not found: ${newAccountId}`)
            }

            let newProxyConfig = null
            if (newAccount.proxy) {
              try {
                newProxyConfig =
                  typeof newAccount.proxy === 'string'
                    ? JSON.parse(newAccount.proxy)
                    : newAccount.proxy
              } catch (e) {
                logger.warn('Failed to parse proxy configuration for retry:', e)
              }
            }

            const newClient = await geminiAccountService.getOauthClient(
              newAccount.accessToken,
              newAccount.refreshToken,
              newProxyConfig,
              newAccount.oauthProvider
            )

            if (!newClient) {
              throw new Error('Failed to get new Gemini client for retry')
            }

            let newProjectId = newAccount.projectId
            if (vendor === 'antigravity') {
              newProjectId = ensureAntigravityProjectId(newAccount)
            }

            logger.info(
              `🔄 Retrying non-stream with new account: ${newAccountId} (was: ${accountId})`
            )

            rawResponse =
              vendor === 'antigravity'
                ? await geminiAccountService.generateContentAntigravity(
                    newClient,
                    requestData,
                    null,
                    newProjectId,
                    upstreamSessionId,
                    newProxyConfig
                  )
                : await geminiAccountService.generateContent(
                    newClient,
                    requestData,
                    null,
                    newProjectId,
                    upstreamSessionId,
                    newProxyConfig
                  )

            accountId = newAccountId
          } catch (retryError) {
            logger.error('❌ Failed to retry non-stream with new account:', retryError)
            throw error
          }
        } else {
          throw error
        }
      }

      let payload = rawResponse?.response || rawResponse

      // 🔍 调试日志：检查原始响应结构
      logger.info('🔍 [调试] 非流式 rawResponse 结构', {
        hasResponse: !!rawResponse?.response,
        payloadHasCandidates: !!payload?.candidates,
        payloadPartsCount: payload?.candidates?.[0]?.content?.parts?.length,
        payloadFinishReason: payload?.candidates?.[0]?.finishReason,
        firstPartType: payload?.candidates?.[0]?.content?.parts?.[0]
          ? Object.keys(payload.candidates[0].content.parts[0])
          : []
      })

      // ✅ 策略B（仅 antigravity + gemini-*）：默认不裁剪 tools；只有上游明显失败才降级裁剪并重试一次
      {
        const isAntigravityGeminiModel = vendor === 'antigravity' && isGeminiModelId(effectiveModel)
        const canRetryWithToolRouting =
          isAntigravityGeminiModel &&
          !req.body?.tool_choice &&
          Array.isArray(req.body?.tools) &&
          req.body.tools.length > 0

        if (canRetryWithToolRouting) {
          const initialUsageMetadata = payload?.usageMetadata || {}
          const initialOutputTokens = resolveUsageOutputTokens(initialUsageMetadata)
          const initialFinishReason = payload?.candidates?.[0]?.finishReason || null
          const normalizedFinishReason = String(initialFinishReason || '').toUpperCase()
          const parts = extractGeminiParts(payload)
          const hasAnyTextPart = parts.some((p) => typeof p?.text === 'string' && p.text)
          const hasAnyFunctionCallPart = parts.some(
            (p) => p?.functionCall && typeof p.functionCall === 'object'
          )

          const isToolLoopFailure =
            normalizedFinishReason === 'UNEXPECTED_TOOL_CALL' ||
            normalizedFinishReason === 'MALFORMED_FUNCTION_CALL'

          if (
            isToolLoopFailure &&
            initialOutputTokens === 0 &&
            !hasAnyTextPart &&
            !hasAnyFunctionCallPart
          ) {
            logger.warn(
              '⚠️ [Antigravity-Gemini] Upstream tool loop failure; retrying with routed tools',
              {
                requestId: req.requestId,
                model: effectiveModel,
                finishReason: initialFinishReason,
                toolsCount: Array.isArray(req.body?.tools) ? req.body.tools.length : 0
              }
            )

            const routedRequestData = buildGeminiRequestFromAnthropic(req.body, effectiveModel, {
              vendor,
              sessionId: sessionHash,
              enableAntigravityGeminiToolRouting: true
            })
            const routedRawResponse = await attemptRequest(routedRequestData)
            payload = routedRawResponse?.response || routedRawResponse
          }
        }
      }

      if (vendor === 'antigravity' && isGeminiModelId(effectiveModel)) {
        cacheAntigravityGeminiToolSignaturesFromParts(payload, sessionHash, effectiveModel)
      }

      let content = convertGeminiPayloadToAnthropicContent(payload)

      // 🔍 调试日志：检查转换后的 Anthropic 内容
      logger.info('🔍 [调试] 转换后 Anthropic content', {
        blocksCount: content?.length,
        blockTypes: content?.map((b) => b.type) || []
      })

      if (!Array.isArray(content) || content.length === 0) {
        logger.warn('⚠️ Non-stream upstream returned empty content; using fallback text', {
          vendor,
          accountId,
          model: effectiveModel,
          payloadFinishReason: payload?.candidates?.[0]?.finishReason || null,
          usageMetadata: payload?.usageMetadata || null
        })
        content = [
          {
            type: 'text',
            text: '上游返回空响应（可能被截断、连接中断或限流导致）。请重试，或改用 stream=true。'
          }
        ]
      }

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
      const statusCode = sanitized.statusCode || 502
      if (!res.headersSent && statusCode === 429) {
        const retryAfter =
          error?.response?.headers?.['retry-after'] ||
          error?.response?.headers?.['Retry-After'] ||
          null
        if (retryAfter) {
          res.setHeader('Retry-After', String(retryAfter))
        }
      }
      dumpAnthropicNonStreamResponse(
        req,
        statusCode,
        buildAnthropicError(sanitized.upstreamMessage || sanitized.message),
        { vendor, accountId, effectiveModel, forcedVendor: vendor, upstreamError: sanitized }
      )
      return res
        .status(statusCode)
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

    const createStreamResponse = async (payload) => {
      try {
        return await startStream(payload)
      } catch (error) {
        const sanitized = sanitizeUpstreamError(error)
        if (shouldRetryWithoutTools(sanitized) && payload?.request?.tools) {
          logger.warn('⚠️ Tool schema rejected by upstream, retrying stream without tools', {
            vendor,
            accountId
          })
          return await startStream(stripToolsFromRequest(payload))
        }
        if (vendor === 'antigravity' && sanitized.statusCode === 429) {
          const { reason, retryDelayMs } = parseAntigravity429Meta(error)
          const resetsInSeconds = resolveAntigravityAccountRateLimitSeconds({
            accountId,
            reason,
            retryDelayMs
          })

          if (!resetsInSeconds) {
            throw error
          }

          logger.warn('⚠️ Antigravity 429 rate limited, switching account and retrying', {
            vendor,
            accountId,
            model: effectiveModel,
            reason,
            resetsInSeconds
          })

          try {
            await unifiedGeminiScheduler.markAccountModelRateLimited(
              accountId,
              'gemini',
              sessionHash,
              effectiveModel,
              resetsInSeconds,
              reason
            )
          } catch (limitError) {
            logger.warn(
              'Failed to mark Gemini account model as rate limited (antigravity):',
              limitError
            )
          }

          try {
            const newAccountSelection = await unifiedGeminiScheduler.selectAccountForApiKey(
              req.apiKey,
              sessionHash,
              effectiveModel,
              { oauthProvider: vendor }
            )
            const newAccountId = newAccountSelection.accountId

            const newAccount = await geminiAccountService.getAccount(newAccountId)
            if (!newAccount) {
              throw new Error(`Retry account not found: ${newAccountId}`)
            }

            let newProxyConfig = null
            if (newAccount.proxy) {
              try {
                newProxyConfig =
                  typeof newAccount.proxy === 'string'
                    ? JSON.parse(newAccount.proxy)
                    : newAccount.proxy
              } catch (e) {
                logger.warn('Failed to parse proxy configuration for retry:', e)
              }
            }

            const newClient = await geminiAccountService.getOauthClient(
              newAccount.accessToken,
              newAccount.refreshToken,
              newProxyConfig,
              newAccount.oauthProvider
            )

            if (!newClient) {
              throw new Error('Failed to get new Gemini client for retry')
            }

            let newProjectId = newAccount.projectId
            if (vendor === 'antigravity') {
              newProjectId = ensureAntigravityProjectId(newAccount)
            }

            logger.info(`🔄 Retrying with new account: ${newAccountId} (was: ${accountId})`)

            const response =
              vendor === 'antigravity'
                ? await geminiAccountService.generateContentStreamAntigravity(
                    newClient,
                    payload,
                    null,
                    newProjectId,
                    upstreamSessionId,
                    abortController.signal,
                    newProxyConfig
                  )
                : await geminiAccountService.generateContentStream(
                    newClient,
                    payload,
                    null,
                    newProjectId,
                    upstreamSessionId,
                    abortController.signal,
                    newProxyConfig
                  )

            accountId = newAccountId
            return response
          } catch (retryError) {
            logger.error('❌ Failed to retry with new account:', retryError)
            throw error
          }
        }
        throw error
      }
    }

    const probeAntigravityGeminiToolLoopFailure = async (upstreamStream) => {
      const PROBE_TIMEOUT_MS = 1200
      const PROBE_MAX_BYTES = 256 * 1024
      const PROBE_MAX_EVENTS = 10

      return await new Promise((resolve) => {
        let done = false
        let buffered = ''
        let bytes = 0
        let events = 0
        const chunks = []
        let finishReason = null
        let usageMetadata = null
        let hasAnyTextPart = false
        let hasAnyFunctionCallPart = false

        const cleanup = () => {
          upstreamStream.off('data', onData)
          upstreamStream.off('end', onEnd)
          upstreamStream.off('error', onError)
        }

        const finalize = (result) => {
          if (done) {
            return
          }
          done = true
          clearTimeout(timer)
          cleanup()
          try {
            upstreamStream.pause()
          } catch (_) {
            // ignore
          }
          resolve(result)
        }

        const maybeDecide = () => {
          if (hasAnyTextPart || hasAnyFunctionCallPart) {
            finalize({ chunks, shouldRetry: false, finishReason })
            return true
          }

          const normalized = String(finishReason || '').toUpperCase()
          const isToolLoopFailure =
            normalized === 'UNEXPECTED_TOOL_CALL' || normalized === 'MALFORMED_FUNCTION_CALL'
          if (!isToolLoopFailure) {
            return false
          }

          const outputTokens = resolveUsageOutputTokens(usageMetadata || {})
          finalize({ chunks, shouldRetry: outputTokens === 0, finishReason })
          return true
        }

        const timer = setTimeout(() => {
          finalize({ chunks, shouldRetry: false, finishReason })
        }, PROBE_TIMEOUT_MS)

        const onEnd = () => {
          if (!maybeDecide()) {
            finalize({ chunks, shouldRetry: false, finishReason })
          }
        }

        const onError = () => {
          finalize({ chunks, shouldRetry: false, finishReason })
        }

        const onData = (chunk) => {
          chunks.push(chunk)
          bytes += chunk.length || 0
          if (bytes >= PROBE_MAX_BYTES) {
            return finalize({ chunks, shouldRetry: false, finishReason })
          }

          buffered += chunk.toString()
          const lines = buffered.split('\n')
          buffered = lines.pop() || ''

          for (const line of lines) {
            if (!line.trim()) {
              continue
            }
            const parsed = parseSSELine(line)
            if (parsed.type !== 'data' || !parsed.data) {
              continue
            }

            const payload = parsed.data?.response || parsed.data
            events += 1

            const currentUsageMetadata = payload?.usageMetadata
            if (currentUsageMetadata) {
              usageMetadata = currentUsageMetadata
            }

            const currentFinishReason = payload?.candidates?.[0]?.finishReason
            if (currentFinishReason) {
              finishReason = currentFinishReason
            }

            const parts = extractGeminiParts(payload)
            if (parts.some((p) => typeof p?.text === 'string' && p.text)) {
              hasAnyTextPart = true
            }
            if (parts.some((p) => p?.functionCall && typeof p.functionCall === 'object')) {
              hasAnyFunctionCallPart = true
            }

            if (maybeDecide()) {
              return
            }
            if (events >= PROBE_MAX_EVENTS) {
              return finalize({ chunks, shouldRetry: false, finishReason })
            }
          }
        }

        upstreamStream.on('data', onData)
        upstreamStream.on('end', onEnd)
        upstreamStream.on('error', onError)
      })
    }

    let streamResponse = await createStreamResponse(requestData)

    const isAntigravityVendor = vendor === 'antigravity'
    const isAntigravityGeminiModel = isAntigravityVendor && isGeminiModelId(effectiveModel)
    let probedChunks = null

    // ✅ 策略B（仅 antigravity + gemini-*）：默认不裁剪 tools；只有上游明显失败才降级裁剪并重试一次
    if (
      isAntigravityGeminiModel &&
      !req.body?.tool_choice &&
      Array.isArray(req.body?.tools) &&
      req.body.tools.length > 0 &&
      Array.isArray(requestData?.request?.tools) &&
      requestData.request.tools.length > 0
    ) {
      const probe = await probeAntigravityGeminiToolLoopFailure(streamResponse)
      probedChunks = Array.isArray(probe?.chunks) ? probe.chunks : null

      if (probe?.shouldRetry) {
        logger.warn(
          '⚠️ [Antigravity-Gemini] Upstream tool loop failure; retrying stream with routed tools',
          {
            requestId: req.requestId,
            model: effectiveModel,
            finishReason: probe.finishReason || null,
            toolsCount: Array.isArray(req.body?.tools) ? req.body.tools.length : 0
          }
        )

        if (!abortController.signal.aborted) {
          abortController.abort()
        }
        abortController = new AbortController()

        requestData = buildGeminiRequestFromAnthropic(req.body, effectiveModel, {
          vendor,
          sessionId: sessionHash,
          enableAntigravityGeminiToolRouting: true
        })

        streamResponse = await createStreamResponse(requestData)
        probedChunks = null
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

    const thinkingConfig = requestData?.request?.generationConfig?.thinkingConfig
    const wantsThinkingBlockFirst =
      isAntigravityVendor &&
      (thinkingConfig?.includeThoughts === true || thinkingConfig?.include_thoughts === true)

    // ========================================================================
    // [大东的 2.0 补丁 - 修复版] 活跃度看门狗 (Watchdog)
    // ========================================================================
    let activityTimeout = null
    const STREAM_ACTIVITY_TIMEOUT_MS = 45000 // 45秒无数据视为卡死
    const STREAM_FIRST_BYTE_TIMEOUT_MS = isAntigravityVendor
      ? (() => {
          const raw = process.env.ANTIGRAVITY_STREAM_FIRST_BYTE_TIMEOUT_MS
          const parsed = parseInt(String(raw || ''), 10)
          if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
            return 15000
          }
          return parsed
        })()
      : 0

    let firstByteTimeout = null
    let receivedAnyUpstreamBytes = false

    const resetActivityTimeout = () => {
      if (activityTimeout) {
        clearTimeout(activityTimeout)
      }
      activityTimeout = setTimeout(() => {
        if (finished) {
          return
        }

        // 🛑【关键修改】先锁门！防止 abort() 触发的 onError 再次写入 res
        finished = true

        logger.warn('⚠️ Upstream stream zombie detected (no data for 45s). Forcing termination.', {
          requestId: req.requestId
        })

        if (!abortController.signal.aborted) {
          abortController.abort()
        }

        if (firstByteTimeout) {
          clearTimeout(firstByteTimeout)
          firstByteTimeout = null
        }

        writeAnthropicSseEvent(res, 'error', {
          type: 'error',
          error: {
            type: 'overloaded_error',
            message: 'Upstream stream timed out (zombie connection). Please try again.'
          }
        })
        res.end()
      }, STREAM_ACTIVITY_TIMEOUT_MS)
    }

    // 🔥【这里！】一定要加这句来启动它！
    resetActivityTimeout()

    // Antigravity 专用：首包探测，避免“握手成功但长期无任何字节”的假流卡住。
    if (isAntigravityVendor && STREAM_FIRST_BYTE_TIMEOUT_MS > 0) {
      firstByteTimeout = setTimeout(() => {
        if (finished || receivedAnyUpstreamBytes) {
          return
        }

        finished = true
        logger.warn('⚠️ Antigravity upstream stream no first byte, forcing termination.', {
          requestId: req.requestId,
          timeoutMs: STREAM_FIRST_BYTE_TIMEOUT_MS
        })

        if (!abortController.signal.aborted) {
          abortController.abort()
        }

        writeAnthropicSseEvent(res, 'error', {
          type: 'error',
          error: {
            type: 'overloaded_error',
            message: 'Upstream stream timed out before first byte. Please try again.'
          }
        })
        res.end()
      }, STREAM_FIRST_BYTE_TIMEOUT_MS)
    }
    // ========================================================================

    let buffer = ''
    let emittedText = ''
    let emittedThinking = ''
    let emittedThoughtSignature = ''
    let finished = false
    let usageMetadata = null
    let finishReason = null
    let finishMessage = null
    let emittedAnyToolUse = false
    let sseEventIndex = 0
    let invalidSseLines = 0
    let invalidSseSample = null
    let rescueAttempted = false
    let forcedRescueAttempted = false
    let malformedRescueAttempted = false
    const emittedToolCallKeys = new Set()
    const emittedToolUseNames = new Set()
    const pendingToolCallsById = new Map()
    let mcpXmlBuffer = ''
    let inMcpXml = false

    const extractPlannedToolAliasFromTodoWrite = (messages) => {
      if (!Array.isArray(messages)) {
        return null
      }

      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i]
        if (!message || message.role !== 'assistant' || !Array.isArray(message.content)) {
          continue
        }
        const todoWriteToolUse = message.content.find(
          (b) => b?.type === 'tool_use' && b?.name === 'TodoWrite'
        )
        const todos = todoWriteToolUse?.input?.todos
        if (!Array.isArray(todos) || todos.length === 0) {
          continue
        }
        const activeTodo =
          todos.find((t) => t?.status === 'in_progress') ||
          todos.find((t) => t?.status === 'pending')
        let activeForm = ''
        if (typeof activeTodo?.activeForm === 'string') {
          activeForm = activeTodo.activeForm.trim()
        } else if (typeof activeTodo?.active_form === 'string') {
          activeForm = activeTodo.active_form.trim()
        }
        if (activeForm) {
          return activeForm
        }
        const content = typeof activeTodo?.content === 'string' ? activeTodo.content : ''
        const match = /^([a-zA-Z0-9_]+)\s*-/.exec(content)
        return match?.[1] || null
      }

      return null
    }

    const resolveToolNameFromAlias = (alias) => {
      if (!alias) {
        return null
      }
      const toolDefs = requestData?.request?.tools
      const decls = Array.isArray(toolDefs)
        ? toolDefs.flatMap((tool) =>
            Array.isArray(tool?.functionDeclarations) ? tool.functionDeclarations : []
          )
        : []
      const names = decls.map((d) => d?.name).filter(Boolean)
      if (names.length === 0) {
        return null
      }
      if (names.includes(alias)) {
        return alias
      }
      const prefixed = `mcp__mcp-router__${alias}`
      if (names.includes(prefixed)) {
        return prefixed
      }

      const byAlias = new Map()
      for (const name of names) {
        const resolvedAlias = typeof name === 'string' ? name.split('__').pop() : ''
        if (!resolvedAlias) {
          continue
        }
        const list = byAlias.get(resolvedAlias) || []
        list.push(name)
        byAlias.set(resolvedAlias, list)
      }
      const candidates = byAlias.get(alias) || []
      return candidates.length === 1 ? candidates[0] : null
    }

    const plannedToolAlias = extractPlannedToolAliasFromTodoWrite(req.body?.messages)
    const plannedToolName = plannedToolAlias ? resolveToolNameFromAlias(plannedToolAlias) : null

    const parseLooseJsonObject = (input) => {
      if (typeof input !== 'string') {
        return null
      }
      let str = input.trim()
      if (!str) {
        return null
      }
      const firstBrace = str.indexOf('{')
      const lastBrace = str.lastIndexOf('}')
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        return null
      }
      str = str.slice(firstBrace, lastBrace + 1)

      const normalized = str
        .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null')
        .replace(/'/g, '"')

      try {
        const parsed = JSON.parse(normalized)
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
      } catch (_) {
        return null
      }
    }

    const tryParseMalformedFinishMessageToolUse = (message) => {
      if (typeof message !== 'string' || !message) {
        return null
      }
      const callIdx = message.indexOf('call:')
      if (callIdx === -1) {
        return null
      }
      const after = message.slice(callIdx + 5).trim()
      if (!after) {
        return null
      }
      const braceIdx = after.indexOf('{')
      const alias = braceIdx === -1 ? after.trim() : after.slice(0, braceIdx).trim()
      if (!alias) {
        return null
      }
      const toolName = resolveToolNameFromAlias(alias)
      if (!toolName) {
        return null
      }

      const rawArgs = braceIdx === -1 ? '' : after.slice(braceIdx)
      let args = parseLooseJsonObject(rawArgs)
      if (!args && rawArgs) {
        // 最小兜底：常见 "command:\"...\"" 场景
        const commandMatch = rawArgs.match(/command\s*:\s*"([^"]*)"/i)
        if (commandMatch && commandMatch[1] !== undefined) {
          args = { command: commandMatch[1] }
        }
      }

      return { name: toolName, args: args || {} }
    }

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

    const canStartThinkingBlock = (_hasSignature = false) => {
      // Antigravity 特殊处理：某些情况下不应启动 thinking block
      if (isAntigravityVendor) {
        // 如果 wantsThinkingBlockFirst 且已发送过工具调用，不应再启动 thinking
        if (wantsThinkingBlockFirst && emittedAnyToolUse) {
          return false
        }
        // [移除规则2] 签名可能在后续 chunk 中到达，不应提前阻止 thinking 启动
      }
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

    const emitToolUseBlock = (name, args, id = null, signatureOverride = '') => {
      // [NEW] 参数重映射：修复 Gemini 返回的工具调用参数
      // 在发出工具调用之前应用修复，确保 Claude Code 能正确处理
      if (args && typeof args === 'object') {
        remapFunctionCallArgs(name, args, { vendor, model: effectiveModel })
      }

      const toolUseId = typeof id === 'string' && id ? id : buildToolUseId()
      const jsonArgs = stableJsonStringify(args || {})
      const toolSignature =
        signatureOverride ||
        (typeof emittedThoughtSignature === 'string' ? emittedThoughtSignature : '')
      if (isAntigravityGeminiModel && toolSignature) {
        signatureCache.cacheToolSignature(toolUseId, toolSignature)
        if (sessionHash) {
          signatureCache.cacheSessionSignature(sessionHash, toolSignature)
        }
      }

      if (name) {
        emittedToolUseNames.add(name)
      }
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

    const resolveFunctionCallArgs = (functionCall) => {
      if (!functionCall || typeof functionCall !== 'object') {
        return { args: null, json: '', canContinue: false }
      }
      const canContinue =
        functionCall.willContinue === true ||
        functionCall.will_continue === true ||
        functionCall.continue === true ||
        functionCall.willContinue === 'true' ||
        functionCall.will_continue === 'true'

      const raw =
        functionCall.args !== undefined
          ? functionCall.args
          : functionCall.partialArgs !== undefined
            ? functionCall.partialArgs
            : functionCall.partial_args !== undefined
              ? functionCall.partial_args
              : functionCall.argsJson !== undefined
                ? functionCall.argsJson
                : functionCall.args_json !== undefined
                  ? functionCall.args_json
                  : ''

      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return { args: raw, json: '', canContinue }
      }

      const json =
        typeof raw === 'string' ? raw : raw === null || raw === undefined ? '' : String(raw)
      if (!json) {
        return { args: null, json: '', canContinue }
      }

      try {
        const parsed = JSON.parse(json)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { args: parsed, json: '', canContinue }
        }
      } catch (_) {
        // ignore: treat as partial JSON string
      }

      return { args: null, json, canContinue }
    }

    /**
     * MCP XML Bridge（仅用于流式 text_delta）：
     * 将文本中的 <mcp__xxx>{...}</mcp__xxx> 转换为 tool_use，避免 Claude Code 把“工具标签”当普通文本吞掉。
     *
     * 设计要点：
     * - 只在命中 "<mcp__" 时启动缓冲；不影响普通文本路径。
     * - 标签不完整时缓冲等待后续 delta；缓冲过大则降级为原文输出，避免卡死。
     */
    const processMcpXmlBridgeDelta = (deltaText) => {
      if (!deltaText || typeof deltaText !== 'string') {
        return []
      }

      const actions = []
      const MAX_BUFFER_CHARS = 65536

      const appendToBuffer = (s) => {
        if (!s) {
          return
        }
        mcpXmlBuffer += s
        if (mcpXmlBuffer.length > MAX_BUFFER_CHARS) {
          actions.push({ type: 'text', text: mcpXmlBuffer })
          mcpXmlBuffer = ''
          inMcpXml = false
        }
      }

      if (!inMcpXml) {
        const startIdx = deltaText.indexOf('<mcp__')
        if (startIdx === -1) {
          return [{ type: 'text', text: deltaText }]
        }

        const prefix = deltaText.slice(0, startIdx)
        if (prefix) {
          actions.push({ type: 'text', text: prefix })
        }

        inMcpXml = true
        appendToBuffer(deltaText.slice(startIdx))
      } else {
        appendToBuffer(deltaText)
      }

      while (inMcpXml && mcpXmlBuffer) {
        const startIdx = mcpXmlBuffer.indexOf('<mcp__')
        if (startIdx === -1) {
          if (mcpXmlBuffer) {
            actions.push({ type: 'text', text: mcpXmlBuffer })
          }
          mcpXmlBuffer = ''
          inMcpXml = false
          break
        }

        if (startIdx > 0) {
          actions.push({ type: 'text', text: mcpXmlBuffer.slice(0, startIdx) })
          mcpXmlBuffer = mcpXmlBuffer.slice(startIdx)
        }

        const tagEnd = mcpXmlBuffer.indexOf('>')
        if (tagEnd === -1) {
          inMcpXml = true
          break
        }

        const toolName = mcpXmlBuffer.slice(1, tagEnd) // 去掉 "<"
        const endTag = `</${toolName}>`
        const closeIdx = mcpXmlBuffer.indexOf(endTag, tagEnd + 1)
        if (closeIdx === -1) {
          inMcpXml = true
          break
        }

        const inputStr = mcpXmlBuffer.slice(tagEnd + 1, closeIdx).trim()
        let input = null
        if (inputStr) {
          try {
            input = JSON.parse(inputStr)
          } catch (_) {
            input = { input: inputStr }
          }
        } else {
          input = {}
        }

        actions.push({ type: 'tool', name: toolName, args: input })

        const afterClose = closeIdx + endTag.length
        mcpXmlBuffer = mcpXmlBuffer.slice(afterClose)
        inMcpXml = mcpXmlBuffer.includes('<mcp__')
        if (!mcpXmlBuffer) {
          inMcpXml = false
          break
        }
      }

      return actions
    }

    const flushPendingToolCallById = (id, { force = false, signatureOverride = '' } = {}) => {
      const pending = pendingToolCallsById.get(id)
      if (!pending) {
        return
      }
      if (!pending.name) {
        return
      }
      if (!pending.args && pending.argsJson) {
        try {
          const parsed = JSON.parse(pending.argsJson)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            pending.args = parsed
            pending.argsJson = ''
          }
        } catch (_) {
          // keep buffering
        }
      }
      if (!pending.args) {
        if (!force) {
          return
        }
        pending.args = {}
      }

      const toolKey = `id:${id}`
      if (emittedToolCallKeys.has(toolKey)) {
        pendingToolCallsById.delete(id)
        return
      }
      emittedToolCallKeys.add(toolKey)

      if (currentBlockType === 'text' || currentBlockType === 'thinking') {
        stopCurrentBlock()
      }
      currentBlockType = 'tool_use'
      emitToolUseBlock(pending.name, pending.args, id, signatureOverride)
      pendingToolCallsById.delete(id)
    }

    const tryRescueAfterMissingFinishReason = async () => {
      if (!isAntigravityVendor) {
        return null
      }
      if (rescueAttempted) {
        return null
      }
      // 已经有 tool_use 时，不做救援，避免重复调用
      if (emittedAnyToolUse) {
        return null
      }
      rescueAttempted = true

      const rescueTimeoutMs = 30000
      logger.warn('⚠️ Missing finishReason: attempting non-stream rescue', {
        requestId: req.requestId,
        model: effectiveModel,
        rescueTimeoutMs,
        plannedToolAlias,
        plannedToolName,
        invalidSseLines,
        invalidSseSample
      })

      try {
        const rawResponse = await geminiAccountService.generateContentAntigravity(
          client,
          requestData,
          null,
          projectId,
          upstreamSessionId,
          proxyConfig,
          { abortTimeoutMs: rescueTimeoutMs }
        )
        const { response } = rawResponse || {}
        const payload = response || rawResponse
        const { usageMetadata: nextUsageMetadata } = payload || {}
        if (nextUsageMetadata) {
          usageMetadata = nextUsageMetadata
        }

        const rescuedContent = convertGeminiPayloadToAnthropicContent(payload)
        const rescuedToolUse = Array.isArray(rescuedContent)
          ? rescuedContent.find((b) => b?.type === 'tool_use' && b?.name)
          : null

        if (rescuedToolUse) {
          if (currentBlockType === 'text' || currentBlockType === 'thinking') {
            stopCurrentBlock()
          }
          currentBlockType = 'tool_use'
          emitToolUseBlock(rescuedToolUse.name, rescuedToolUse.input, rescuedToolUse.id)
          logger.warn('⚠️ Rescue succeeded: emitted tool_use after missing finishReason', {
            requestId: req.requestId,
            tool: rescuedToolUse.name
          })
          return { tool: rescuedToolUse.name }
        }

        // 二次救援（强制工具调用）：当 TodoWrite 明确标记了下一步工具时，尝试强制生成该 tool_use
        if (plannedToolName && !forcedRescueAttempted) {
          forcedRescueAttempted = true
          const backoffMs = 800
          await new Promise((resolve) => setTimeout(resolve, backoffMs))

          const forcedRequestData = JSON.parse(JSON.stringify(requestData || {}))
          if (forcedRequestData?.request) {
            forcedRequestData.request.toolConfig = {
              functionCallingConfig: {
                mode: 'ANY',
                allowedFunctionNames: [plannedToolName]
              }
            }
          }

          const forcedRawResponse = await geminiAccountService.generateContentAntigravity(
            client,
            forcedRequestData,
            null,
            projectId,
            upstreamSessionId,
            proxyConfig,
            { abortTimeoutMs: rescueTimeoutMs }
          )
          const { response: forcedResponse } = forcedRawResponse || {}
          const forcedPayload = forcedResponse || forcedRawResponse
          const { usageMetadata: forcedUsageMetadata } = forcedPayload || {}
          if (forcedUsageMetadata) {
            usageMetadata = forcedUsageMetadata
          }

          const forcedContent = convertGeminiPayloadToAnthropicContent(forcedPayload)
          const forcedToolUse = Array.isArray(forcedContent)
            ? forcedContent.find((b) => b?.type === 'tool_use' && b?.name)
            : null
          if (forcedToolUse) {
            if (currentBlockType === 'text' || currentBlockType === 'thinking') {
              stopCurrentBlock()
            }
            currentBlockType = 'tool_use'
            emitToolUseBlock(forcedToolUse.name, forcedToolUse.input, forcedToolUse.id)
            logger.warn('⚠️ Forced rescue succeeded: emitted tool_use after missing finishReason', {
              requestId: req.requestId,
              tool: forcedToolUse.name,
              plannedToolAlias,
              plannedToolName
            })
            return { tool: forcedToolUse.name, forced: true }
          }
        }

        // 完全空响应时，至少把非流式的文本结果返回给客户端（避免 CLI 直接中断）
        if (!emittedText && Array.isArray(rescuedContent)) {
          const rescuedText = rescuedContent
            .filter((b) => b?.type === 'text' && typeof b.text === 'string' && b.text)
            .map((b) => b.text)
            .join('')
          if (rescuedText) {
            switchBlockType('text')
            emittedText = rescuedText
            writeAnthropicSseEvent(res, 'content_block_delta', {
              type: 'content_block_delta',
              index: currentIndex,
              delta: { type: 'text_delta', text: rescuedText }
            })
            return { textLength: rescuedText.length }
          }
        }
      } catch (error) {
        const { statusCode, upstreamMessage, message } = sanitizeUpstreamError(error)
        logger.warn('⚠️ Non-stream rescue failed', {
          requestId: req.requestId,
          statusCode: statusCode || null,
          upstreamMessage: upstreamMessage || message
        })
      }

      return null
    }

    const tryRescueAfterMalformedFunctionCall = async () => {
      if (!isAntigravityVendor || !isAntigravityGeminiModel) {
        return null
      }
      if (malformedRescueAttempted) {
        return null
      }
      if (emittedAnyToolUse) {
        return null
      }
      malformedRescueAttempted = true

      const rescued = tryParseMalformedFinishMessageToolUse(finishMessage)
      if (rescued?.name) {
        if (currentBlockType === 'text' || currentBlockType === 'thinking') {
          stopCurrentBlock()
        }
        currentBlockType = 'tool_use'
        emitToolUseBlock(rescued.name, rescued.args || {}, null)
        logger.warn('⚠️ MALFORMED_FUNCTION_CALL rescued via finishMessage', {
          requestId: req.requestId,
          tool: rescued.name
        })
        return { tool: rescued.name, source: 'finishMessage' }
      }

      // 二次救援：当 TodoWrite 能推断下一步工具时，强制生成该 tool_use
      if (plannedToolName && !forcedRescueAttempted) {
        forcedRescueAttempted = true
        const rescueTimeoutMs = 30000
        const backoffMs = 800
        await new Promise((resolve) => setTimeout(resolve, backoffMs))

        logger.warn('⚠️ MALFORMED_FUNCTION_CALL: attempting forced tool rescue', {
          requestId: req.requestId,
          model: effectiveModel,
          plannedToolAlias,
          plannedToolName
        })

        try {
          const forcedRequestData = JSON.parse(JSON.stringify(requestData || {}))
          if (forcedRequestData?.request) {
            forcedRequestData.request.toolConfig = {
              functionCallingConfig: {
                mode: 'ANY',
                allowedFunctionNames: [plannedToolName]
              }
            }

            const sys = forcedRequestData.request.systemInstruction
            const sysObj = sys && typeof sys === 'object' ? sys : {}
            const parts = Array.isArray(sysObj.parts) ? sysObj.parts.slice() : []
            parts.push({
              text: 'When calling tools, DO NOT output textual call:Tool{...}. Use structured functionCall only.'
            })
            forcedRequestData.request.systemInstruction = { ...sysObj, role: 'user', parts }
          }

          const forcedRawResponse = await geminiAccountService.generateContentAntigravity(
            client,
            forcedRequestData,
            null,
            projectId,
            upstreamSessionId,
            proxyConfig,
            { abortTimeoutMs: rescueTimeoutMs }
          )
          const { response: forcedResponse } = forcedRawResponse || {}
          const forcedPayload = forcedResponse || forcedRawResponse
          const { usageMetadata: forcedUsageMetadata } = forcedPayload || {}
          if (forcedUsageMetadata) {
            usageMetadata = forcedUsageMetadata
          }

          const forcedContent = convertGeminiPayloadToAnthropicContent(forcedPayload)
          const forcedToolUse = Array.isArray(forcedContent)
            ? forcedContent.find((b) => b?.type === 'tool_use' && b?.name)
            : null
          if (forcedToolUse) {
            if (currentBlockType === 'text' || currentBlockType === 'thinking') {
              stopCurrentBlock()
            }
            currentBlockType = 'tool_use'
            emitToolUseBlock(forcedToolUse.name, forcedToolUse.input, forcedToolUse.id)
            logger.warn(
              '⚠️ Forced rescue succeeded: emitted tool_use after MALFORMED_FUNCTION_CALL',
              {
                requestId: req.requestId,
                tool: forcedToolUse.name,
                plannedToolAlias,
                plannedToolName
              }
            )
            return { tool: forcedToolUse.name, forced: true }
          }
        } catch (error) {
          const { statusCode, upstreamMessage, message } = sanitizeUpstreamError(error)
          logger.warn('⚠️ Forced rescue failed after MALFORMED_FUNCTION_CALL', {
            requestId: req.requestId,
            statusCode: statusCode || null,
            upstreamMessage: upstreamMessage || message
          })
        }
      }

      return null
    }

    const finalize = async () => {
      if (finished) {
        return
      }
      finished = true

      // 若存在未完成的工具调用（例如 args 分段但上游提前结束），尽力 flush，避免客户端卡死。
      for (const id of pendingToolCallsById.keys()) {
        flushPendingToolCallById(id, { force: true })
      }

      // MCP XML Bridge 兜底：若有未闭合标签，降级为原文输出，避免客户端永远看不到内容。
      if (mcpXmlBuffer) {
        const raw = mcpXmlBuffer
        mcpXmlBuffer = ''
        inMcpXml = false
        switchBlockType('text')
        writeAnthropicSseEvent(res, 'content_block_delta', {
          type: 'content_block_delta',
          index: currentIndex,
          delta: { type: 'text_delta', text: raw }
        })
      }

      const isMalformedFunctionCall =
        String(finishReason || '').toUpperCase() === 'MALFORMED_FUNCTION_CALL'
      if (isAntigravityGeminiModel && isMalformedFunctionCall) {
        await tryRescueAfterMalformedFunctionCall()
        const hasAnyContentAfterRescue = !!(emittedText || emittedAnyToolUse || emittedThinking)
        if (!hasAnyContentAfterRescue) {
          const fallbackText =
            '上游返回 MALFORMED_FUNCTION_CALL（疑似工具调用格式不兼容）。请重试，或减少工具/上下文长度。'
          switchBlockType('text')
          emittedText = fallbackText
          writeAnthropicSseEvent(res, 'content_block_delta', {
            type: 'content_block_delta',
            index: currentIndex,
            delta: { type: 'text_delta', text: fallbackText }
          })
        }
      }

      // 🔧 [dadongwo] 不依赖 finishReason 判断流结束
      // 上游 Antigravity 服务可能在某些情况下（如输出过大、超时）提前结束流，但不发送 finishReason。
      // 只要 HTTP 流正常结束且有内容，就视为正常完成。
      if (!finishReason) {
        const hasAnyContent = !!(emittedText || emittedAnyToolUse || emittedThinking)
        const inputTokens = usageMetadata?.promptTokenCount || 0
        const outputTokens = resolveUsageOutputTokens(usageMetadata)

        // ✅ 有内容时：直接正常完成，不触发救援，不追加错误提示
        if (hasAnyContent) {
          logger.info('🔄 [dadongwo] 流结束无finishReason但有内容，正常完成', {
            requestId: req.requestId,
            model: effectiveModel,
            hasToolCalls: emittedAnyToolUse,
            emittedTextLength: emittedText?.length || 0,
            emittedThinking: !!emittedThinking,
            sseEventCount: sseEventIndex
          })

          if (vendor === 'antigravity') {
            dumpAntigravityStreamSummary({
              requestId: req.requestId,
              model: effectiveModel,
              totalEvents: sseEventIndex,
              finishReason: 'STOP_INFERRED', // 推断为 STOP（dadongwo 优化）
              hasThinking: Boolean(emittedThinking || emittedThoughtSignature),
              hasToolCalls: emittedAnyToolUse,
              toolCallNames: Array.from(emittedToolUseNames).filter(Boolean),
              usage: { input_tokens: inputTokens, output_tokens: outputTokens },
              textPreview: emittedText ? emittedText.slice(0, 500) : ''
            }).catch(() => {})
          }

          // 关闭当前块（如果有）
          if (currentBlockType === 'text' || currentBlockType === 'thinking') {
            stopCurrentBlock()
          }

          // 发送正常的结束事件
          writeAnthropicSseEvent(res, 'message_delta', {
            type: 'message_delta',
            delta: {
              stop_reason: emittedAnyToolUse ? 'tool_use' : 'end_turn',
              stop_sequence: null
            },
            usage: {
              output_tokens: outputTokens
            }
          })

          writeAnthropicSseEvent(res, 'message_stop', { type: 'message_stop' })

          dumpAnthropicStreamSummary(req, {
            vendor,
            accountId,
            effectiveModel,
            responseModel,
            stop_reason: emittedAnyToolUse ? 'tool_use' : 'end_turn',
            tool_use_names: Array.from(emittedToolUseNames).filter(Boolean),
            text_preview: emittedText ? emittedText.slice(0, 800) : '',
            usage: { input_tokens: inputTokens, output_tokens: outputTokens },
            inferred_stop: true // 标记为推断完成
          })

          res.end()
          return
        }

        // ⚠️ 完全空响应：尝试救援
        logger.warn('⚠️ 流结束无finishReason且无内容，尝试救援', {
          requestId: req.requestId,
          model: effectiveModel,
          sseEventCount: sseEventIndex
        })

        await tryRescueAfterMissingFinishReason()

        // 救援后再检查是否有内容
        const hasContentAfterRescue = !!(emittedText || emittedAnyToolUse || emittedThinking)

        if (hasContentAfterRescue) {
          logger.info('🔄 救援成功，正常完成响应', {
            requestId: req.requestId,
            textLength: emittedText?.length || 0,
            hasToolCalls: emittedAnyToolUse
          })

          if (currentBlockType === 'text' || currentBlockType === 'thinking') {
            stopCurrentBlock()
          }

          writeAnthropicSseEvent(res, 'message_delta', {
            type: 'message_delta',
            delta: {
              stop_reason: emittedAnyToolUse ? 'tool_use' : 'end_turn',
              stop_sequence: null
            },
            usage: {
              output_tokens: resolveUsageOutputTokens(usageMetadata)
            }
          })

          writeAnthropicSseEvent(res, 'message_stop', { type: 'message_stop' })

          dumpAnthropicStreamSummary(req, {
            vendor,
            accountId,
            effectiveModel,
            responseModel,
            stop_reason: emittedAnyToolUse ? 'tool_use' : 'end_turn',
            tool_use_names: Array.from(emittedToolUseNames).filter(Boolean),
            text_preview: emittedText ? emittedText.slice(0, 800) : '',
            usage: {
              input_tokens: inputTokens,
              output_tokens: resolveUsageOutputTokens(usageMetadata)
            },
            rescue_succeeded: true
          })

          res.end()
          return
        }

        // 救援失败：追加兜底文本，避免客户端卡死
        const fallbackText = '上游流式连接异常中断（无有效内容）。请重试。'
        switchBlockType('text')
        emittedText = fallbackText
        writeAnthropicSseEvent(res, 'content_block_delta', {
          type: 'content_block_delta',
          index: currentIndex,
          delta: { type: 'text_delta', text: fallbackText }
        })

        if (vendor === 'antigravity') {
          dumpAntigravityStreamSummary({
            requestId: req.requestId,
            model: effectiveModel,
            totalEvents: sseEventIndex,
            finishReason: null,
            hasThinking: false,
            hasToolCalls: false,
            toolCallNames: [],
            usage: { input_tokens: inputTokens, output_tokens: outputTokens },
            textPreview: fallbackText,
            invalidLines: invalidSseLines,
            invalidSample: invalidSseSample,
            error: 'empty_response_fallback'
          }).catch(() => {})
        }

        if (currentBlockType === 'text' || currentBlockType === 'thinking') {
          stopCurrentBlock()
        }

        writeAnthropicSseEvent(res, 'message_delta', {
          type: 'message_delta',
          delta: {
            stop_reason: 'end_turn',
            stop_sequence: null
          },
          usage: {
            output_tokens: outputTokens
          }
        })

        writeAnthropicSseEvent(res, 'message_stop', { type: 'message_stop' })

        dumpAnthropicStreamSummary(req, {
          vendor,
          accountId,
          effectiveModel,
          responseModel,
          stop_reason: 'end_turn',
          tool_use_names: [],
          text_preview: fallbackText,
          usage: { input_tokens: inputTokens, output_tokens: outputTokens },
          empty_response_fallback: true
        })

        res.end()
        return
      }

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
        tool_use_names: Array.from(emittedToolUseNames).filter(Boolean),
        text_preview: emittedText ? emittedText.slice(0, 800) : '',
        usage: { input_tokens: inputTokens, output_tokens: outputTokens }
      })

      // 记录 Antigravity 上游流摘要用于调试
      if (vendor === 'antigravity') {
        dumpAntigravityStreamSummary({
          requestId: req.requestId,
          model: effectiveModel,
          totalEvents: sseEventIndex,
          finishReason,
          hasThinking: Boolean(emittedThinking || emittedThoughtSignature),
          hasToolCalls: emittedAnyToolUse,
          toolCallNames: Array.from(emittedToolUseNames).filter(Boolean),
          usage: { input_tokens: inputTokens, output_tokens: outputTokens },
          textPreview: emittedText ? emittedText.slice(0, 500) : ''
        }).catch(() => {})
      }

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

    const handleUpstreamChunk = (chunk) => {
      resetActivityTimeout() // <--- 【新增】收到数据了，重置倒计时！
      if (!receivedAnyUpstreamBytes) {
        receivedAnyUpstreamBytes = true
        if (firstByteTimeout) {
          clearTimeout(firstByteTimeout)
          firstByteTimeout = null
        }
      }

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
        if (parsed.type === 'invalid') {
          invalidSseLines += 1
          if (!invalidSseSample) {
            invalidSseSample = {
              jsonStrPreview: (parsed.jsonStr || '').slice(0, 200),
              error: parsed.error?.message || 'unknown'
            }
          }
          continue
        }
        if (parsed.type !== 'data' || !parsed.data) {
          continue
        }

        const payload = parsed.data?.response || parsed.data

        // 记录上游 SSE 事件用于调试
        if (vendor === 'antigravity') {
          sseEventIndex += 1
          dumpAntigravityStreamEvent({
            requestId: req.requestId,
            eventIndex: sseEventIndex,
            eventType: parsed.type,
            data: payload
          }).catch(() => {})
        }

        const { usageMetadata: currentUsageMetadata, candidates } = payload || {}
        if (currentUsageMetadata) {
          usageMetadata = currentUsageMetadata
        }

        const [candidate] = Array.isArray(candidates) ? candidates : []
        const { finishReason: currentFinishReason, finishMessage: currentFinishMessage } =
          candidate || {}
        if (currentFinishReason) {
          finishReason = currentFinishReason
          // 🔍 调试：记录收到 finishReason 的时间点
          logger.info('🔍 [调试] 流式收到 finishReason', {
            requestId: req.requestId,
            finishReason: currentFinishReason,
            sseEventIndex
          })
        }
        if (typeof currentFinishMessage === 'string' && currentFinishMessage) {
          finishMessage = currentFinishMessage
        }

        const parts = extractGeminiParts(payload)
        const rawThoughtSignature = extractGeminiThoughtSignature(payload)
        // Antigravity 专用净化：确保签名格式符合 API 要求
        const thoughtSignature = isAntigravityVendor
          ? sanitizeThoughtSignatureForAntigravity(rawThoughtSignature)
          : rawThoughtSignature
        const fullThoughtForToolOrdering = extractGeminiThoughtText(payload)

        if (wantsThinkingBlockFirst) {
          // 关键：确保 thinking/signature 在 tool_use 之前输出，避免出现 tool_use 后紧跟 thinking(signature)
          // 导致下一轮请求的 thinking 校验/工具调用校验失败（Antigravity 会返回 400）。
          if (thoughtSignature && canStartThinkingBlock()) {
            let delta = ''
            if (thoughtSignature.startsWith(emittedThoughtSignature)) {
              delta = thoughtSignature.slice(emittedThoughtSignature.length)
            } else if (thoughtSignature !== emittedThoughtSignature) {
              delta = thoughtSignature
            }
            if (delta) {
              switchBlockType('thinking')
              writeAnthropicSseEvent(res, 'content_block_delta', {
                type: 'content_block_delta',
                index: currentIndex,
                delta: { type: 'signature_delta', signature: delta }
              })
              emittedThoughtSignature = thoughtSignature
            }
          }

          if (fullThoughtForToolOrdering && canStartThinkingBlock()) {
            let delta = ''
            if (fullThoughtForToolOrdering.startsWith(emittedThinking)) {
              delta = fullThoughtForToolOrdering.slice(emittedThinking.length)
            } else {
              delta = fullThoughtForToolOrdering
            }
            if (delta) {
              switchBlockType('thinking')
              emittedThinking = fullThoughtForToolOrdering
              writeAnthropicSseEvent(res, 'content_block_delta', {
                type: 'content_block_delta',
                index: currentIndex,
                delta: { type: 'thinking_delta', thinking: delta }
              })
            }
          }
        }
        for (const part of parts) {
          const functionCall = part?.functionCall
          if (!functionCall?.name) {
            continue
          }

          const id = typeof functionCall.id === 'string' && functionCall.id ? functionCall.id : null
          const { args, json, canContinue } = resolveFunctionCallArgs(functionCall)

          // 若没有 id（无法聚合多段 args），只在拿到可用 args 时才 emit
          if (!id) {
            const finalArgs = args || {}
            const toolKey = `${functionCall.name}:${stableJsonStringify(finalArgs)}`
            if (emittedToolCallKeys.has(toolKey)) {
              continue
            }
            emittedToolCallKeys.add(toolKey)

            if (currentBlockType === 'text' || currentBlockType === 'thinking') {
              stopCurrentBlock()
            }
            currentBlockType = 'tool_use'
            emitToolUseBlock(functionCall.name, finalArgs, null, thoughtSignature)
            continue
          }

          const pending = pendingToolCallsById.get(id) || {
            id,
            name: functionCall.name,
            args: null,
            argsJson: ''
          }
          pending.name = functionCall.name
          if (args) {
            pending.args = args
            pending.argsJson = ''
          } else if (json) {
            pending.argsJson += json
          }
          pendingToolCallsById.set(id, pending)

          // 能确定“本次已完整”时再 emit；否则继续等待后续 SSE 事件补全 args。
          if (!canContinue) {
            flushPendingToolCallById(id, { signatureOverride: thoughtSignature })
          }
        }

        if (thoughtSignature && canStartThinkingBlock(true)) {
          let delta = ''
          if (thoughtSignature.startsWith(emittedThoughtSignature)) {
            delta = thoughtSignature.slice(emittedThoughtSignature.length)
          } else if (thoughtSignature !== emittedThoughtSignature) {
            delta = thoughtSignature
          }
          if (delta) {
            switchBlockType('thinking')
            writeAnthropicSseEvent(res, 'content_block_delta', {
              type: 'content_block_delta',
              index: currentIndex,
              delta: { type: 'signature_delta', signature: delta }
            })
            emittedThoughtSignature = thoughtSignature
          }
        }

        const fullThought = extractGeminiThoughtText(payload)
        if (
          fullThought &&
          canStartThinkingBlock(Boolean(thoughtSignature || emittedThoughtSignature))
        ) {
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
            // [签名缓存] 当 thinking 内容和签名都有时，缓存供后续请求使用
            if (isAntigravityVendor && sessionHash && emittedThoughtSignature) {
              signatureCache.cacheSignature(sessionHash, fullThought, emittedThoughtSignature)
              // [模型家族缓存] 记录签名来源模型家族，用于跨模型兼容性检查
              const modelFamily = extractModelFamily(baseModel)
              if (modelFamily) {
                signatureCache.cacheSignatureFamily(emittedThoughtSignature, modelFamily)
              }
            }
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
            const actions = processMcpXmlBridgeDelta(delta)
            for (const action of actions) {
              if (!action) {
                continue
              }

              if (action.type === 'text') {
                if (!action.text) {
                  continue
                }
                switchBlockType('text')
                writeAnthropicSseEvent(res, 'content_block_delta', {
                  type: 'content_block_delta',
                  index: currentIndex,
                  delta: { type: 'text_delta', text: action.text }
                })
                continue
              }

              if (action.type === 'tool') {
                if (currentBlockType === 'text' || currentBlockType === 'thinking') {
                  stopCurrentBlock()
                }
                emitToolUseBlock(action.name, action.args || {}, null)
              }
            }

            emittedText = fullText
          }
        }
      }
    }

    try {
      streamResponse.pause()
    } catch (_) {
      // ignore
    }

    streamResponse.on('data', handleUpstreamChunk)

    if (Array.isArray(probedChunks) && probedChunks.length > 0) {
      for (const chunk of probedChunks) {
        handleUpstreamChunk(chunk)
      }
      probedChunks = null
    }

    try {
      streamResponse.resume()
    } catch (_) {
      // ignore
    }

    streamResponse.on('end', () => {
      if (activityTimeout) {
        clearTimeout(activityTimeout)
      } // <--- 【新增】正常结束，取消报警
      if (firstByteTimeout) {
        clearTimeout(firstByteTimeout)
        firstByteTimeout = null
      }

      finalize().catch((e) => logger.error('Failed to finalize Anthropic SSE response:', e))
    })

    streamResponse.on('error', (error) => {
      if (activityTimeout) {
        clearTimeout(activityTimeout)
      } // <--- 【新增】报错了，取消报警
      if (firstByteTimeout) {
        clearTimeout(firstByteTimeout)
        firstByteTimeout = null
      }

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
    // ============================================================
    // [大东修复 3.0] 彻底防止 JSON 循环引用导致服务崩溃
    // ============================================================

    // 1. 使用 util.inspect 安全地将错误对象转为字符串，不使用 JSON.stringify
    const safeErrorDetails = util.inspect(error, {
      showHidden: false,
      depth: 2,
      colors: false,
      breakLength: Infinity
    })

    // 2. 打印安全日志，绝对不会崩
    logger.error(`❌ [Critical] Failed to start Gemini stream. 错误详情:\n${safeErrorDetails}`)

    const sanitized = sanitizeUpstreamError(error)

    // 3. 特殊处理 Antigravity 的参数错误 (400)，输出详细请求信息便于调试
    if (
      vendor === 'antigravity' &&
      effectiveModel.includes('claude') &&
      isInvalidAntigravityArgumentError(sanitized)
    ) {
      logger.warn('⚠️ Antigravity Claude invalid argument detected', {
        requestId: req.requestId,
        ...summarizeAntigravityRequestForDebug(requestData),
        statusCode: sanitized.statusCode,
        upstreamType: sanitized.upstreamType,
        upstreamMessage: sanitized.upstreamMessage || sanitized.message
      })
    }

    // 4. 确保返回 JSON 响应给客户端 (让客户端知道出错了并重试)
    if (!res.headersSent) {
      const statusCode = sanitized.statusCode || 502
      if (statusCode === 429) {
        const retryAfter =
          error?.response?.headers?.['retry-after'] ||
          error?.response?.headers?.['Retry-After'] ||
          null
        if (retryAfter) {
          res.setHeader('Retry-After', String(retryAfter))
        }
      }
      // 记录非流式响应日志
      dumpAnthropicNonStreamResponse(
        req,
        statusCode,
        buildAnthropicError(sanitized.upstreamMessage || sanitized.message),
        { vendor, accountId, effectiveModel, forcedVendor: vendor, upstreamError: sanitized }
      )

      return res
        .status(statusCode)
        .json(buildAnthropicError(sanitized.upstreamMessage || sanitized.message))
    }

    // 5. 如果头已经发了，走 SSE 发送错误
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

  const normalizedMessages = normalizeAnthropicMessages(req.body.messages || [], { vendor })
  const toolUseIdToName = buildToolUseIdToNameMap(normalizedMessages || [])

  let canEnableThinking = false
  if (vendor === 'antigravity' && req.body?.thinking?.type === 'enabled') {
    const budgetRaw = Number(req.body.thinking.budget_tokens)
    if (Number.isFinite(budgetRaw)) {
      canEnableThinking = canEnableAntigravityThinking(normalizedMessages)
    }
  }

  const contents = convertAnthropicMessagesToGeminiContents(
    normalizedMessages || [],
    toolUseIdToName,
    {
      vendor,
      stripThinking: vendor === 'antigravity' && !canEnableThinking,
      sessionId: sessionHash,
      targetModel: model // 用于签名兼容性检查
    }
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

// ============================================================================
// 模块导出
// ============================================================================

module.exports = {
  // 主入口：处理 /v1/messages 请求
  handleAnthropicMessagesToGemini,
  // 辅助入口：处理 /v1/messages/count_tokens 请求
  handleAnthropicCountTokensToGemini
}
