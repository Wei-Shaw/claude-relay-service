/**
 * Codex / OpenAI 容量降载（capacity shed）识别与改写工具
 *
 * 背景：ChatGPT Codex 后端在模型容量紧张时会把请求丢进「降载」路径，返回
 * `error.code = server_is_overloaded` 或 `slow_down`。Codex CLI 按错误码闭集
 * 分类（codex-rs/codex-api/src/sse/responses.rs 的 is_server_overloaded_error），
 * 这两个码会被映射成 CodexErr::ServerOverloaded，而 CodexErr::is_retryable()
 * 对它返回 false —— 客户端直接打印
 * "Selected model is at capacity. Please try a different model." 并结束当前回合。
 *
 * 降载是**请求级**信号，不是账号级故障：换账号并不改变被降载的因素（模型容量、
 * 后端负载都与账号无关），只会让一个请求把整池账号逐个消耗掉。因此正确做法是
 * 在同一账号上做有界重试；重试用尽后把错误码改写成客户端可重试的 server_error，
 * 让 Codex 走内置退避而不是就地终止。
 *
 * 行为参考实现：sub2api（openai_gateway_upstream_errors.go / openai_gateway_passthrough.go）。
 *
 * 本模块只包含纯函数，不依赖 config / redis / logger，便于单测。
 *
 * @module openaiCapacityShed
 */

// 上游降载错误码闭集，与 Codex CLI 的致命集一致
const CAPACITY_SHED_CODES = new Set(['server_is_overloaded', 'slow_down'])

// 改写后交给客户端的错误码：Codex 对 server_error 执行内置退避重试
const RETRYABLE_CLIENT_CODE = 'server_error'

// 降载消息特征（大小写不敏感）
const CAPACITY_SHED_MESSAGE_MARKERS = [
  'server is overloaded',
  'servers are overloaded',
  'servers are currently overloaded'
]

// 仅在 HTTP 400 上生效的「瞬时处理失败」特征
const TRANSIENT_400_MARKERS = [
  'selected model is at capacity',
  'an error occurred while processing your request'
]
const TRANSIENT_400_REQUEST_ID_MARKERS = [
  'you can retry your request',
  'help.openai.com',
  'request id'
]

// SSE preamble 事件：只是握手，不构成客户端输出
const PREAMBLE_EVENT_TYPES = new Set(['response.created', 'response.in_progress'])

const DEFAULT_SETTINGS = {
  maxAttempts: 3,
  retryDelaysMs: [500, 1000, 2000],
  maxDelayMs: 8000,
  bufferLimitBytes: 256 * 1024,
  // 预输出缓冲的时间上限。降载在 HTTP 200 之后一两秒内就会到达，所以这个窗口
  // 不影响识别率；但它保证 CRS 不会长时间对客户端一言不发 —— nginx 之类的反向
  // 代理 proxy_read_timeout 默认只有 60s，超时会直接掐断连接。
  preOutputBufferMs: 15000
}

function toLowerTrimmed(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 按 `a.b.c` 取值，任一层不是对象即返回 undefined
 */
function getPath(payload, path) {
  if (!isPlainObject(payload)) {
    return undefined
  }
  let current = payload
  for (const segment of path.split('.')) {
    if (!isPlainObject(current)) {
      return undefined
    }
    current = current[segment]
  }
  return current
}

function getStringAt(payload, path) {
  const value = getPath(payload, path)
  return typeof value === 'string' ? value : ''
}

/**
 * 提取降载判定用的错误码（小写），兼容 response.failed 的嵌套形态与裸 error 形态
 * @param {Object} payload
 * @returns {string}
 */
function extractErrorCode(payload) {
  const nested = toLowerTrimmed(getStringAt(payload, 'response.error.code'))
  if (nested) {
    return nested
  }
  return toLowerTrimmed(getStringAt(payload, 'error.code'))
}

/**
 * 提取错误消息，按 error.message → response.error.message → message 顺序
 * @param {Object} payload
 * @returns {string}
 */
function extractErrorMessage(payload) {
  for (const path of ['error.message', 'response.error.message', 'message']) {
    const value = getStringAt(payload, path)
    if (value.trim()) {
      return value.trim()
    }
  }
  return ''
}

/**
 * 消息是否命中降载特征
 * @param {string} text
 * @returns {boolean}
 */
function isCapacityShedMessage(text) {
  const lower = toLowerTrimmed(text)
  if (!lower) {
    return false
  }
  return CAPACITY_SHED_MESSAGE_MARKERS.some((marker) => lower.includes(marker))
}

/**
 * 判断一个已解析的 JSON / SSE 事件负载是否为降载信号。
 *
 * 只看结构化错误字段（error.* / response.error.* / 顶层 message），
 * 不扫描整个 JSON —— 用户内容可能原样回显这些短语。
 *
 * @param {Object} payload 已解析的对象
 * @returns {boolean}
 */
function isCapacityShedEvent(payload) {
  if (!isPlainObject(payload)) {
    return false
  }
  if (CAPACITY_SHED_CODES.has(extractErrorCode(payload))) {
    return true
  }
  for (const path of ['error.message', 'response.error.message', 'message']) {
    if (isCapacityShedMessage(getStringAt(payload, path))) {
      return true
    }
  }
  return false
}

/**
 * HTTP 400 专属的瞬时处理失败判定（"Selected model is at capacity…" 等）
 * @param {number} status
 * @param {Object|null} payload 已解析的对象，非 JSON 时传 null
 * @param {string} rawBody 原始响应体（仅在 payload 为 null 时参与判定）
 * @returns {boolean}
 */
function isTransientProcessing400(status, payload, rawBody = '') {
  if (status !== 400) {
    return false
  }
  const match = (text) => {
    const lower = toLowerTrimmed(text)
    if (!lower) {
      return false
    }
    if (TRANSIENT_400_MARKERS.some((marker) => lower.includes(marker))) {
      return true
    }
    return TRANSIENT_400_REQUEST_ID_MARKERS.every((marker) => lower.includes(marker))
  }

  if (isPlainObject(payload)) {
    return (
      match(getStringAt(payload, 'error.message')) ||
      match(getStringAt(payload, 'response.error.message')) ||
      match(getStringAt(payload, 'message'))
    )
  }
  // 非 JSON 响应体（纯文本错误页）才允许整体扫描
  return match(rawBody)
}

/**
 * 顶层判定：一次 HTTP 响应是否为容量降载
 *
 * @param {Object} options
 * @param {number} options.status HTTP 状态码
 * @param {Object|null} options.payload 已解析的响应体对象（无法解析时传 null）
 * @param {string} [options.rawBody] 原始响应体文本
 * @returns {boolean}
 */
function isCapacityShedResponse({ status, payload, rawBody = '' }) {
  if (isCapacityShedEvent(payload)) {
    return true
  }
  if (!isPlainObject(payload) && isCapacityShedMessage(rawBody)) {
    return true
  }
  return isTransientProcessing400(status, payload, rawBody)
}

/**
 * 把降载错误码改写为客户端可重试的 server_error。
 *
 * 只改 `error.code` / `response.error.code`，且只在原值属于降载闭集
 * （或缺失但消息命中降载特征）时改写。消息原样保留；
 * rate_limit_exceeded 等其它错误码一律不动 —— 客户端依赖原码解析重试延时。
 *
 * @param {Object} payload
 * @returns {{ payload: Object, changed: boolean }}
 */
function rewriteCapacityShedCode(payload) {
  if (!isCapacityShedEvent(payload)) {
    return { payload, changed: false }
  }

  let changed = false
  let cloned = null
  for (const parentPath of ['response.error', 'error']) {
    const parent = getPath(payload, parentPath)
    if (!isPlainObject(parent)) {
      continue
    }
    const code = toLowerTrimmed(typeof parent.code === 'string' ? parent.code : '')
    if (code && !CAPACITY_SHED_CODES.has(code)) {
      continue
    }
    if (!cloned) {
      cloned = JSON.parse(JSON.stringify(payload))
    }
    getPath(cloned, parentPath).code = RETRYABLE_CLIENT_CODE
    changed = true
  }

  return changed ? { payload: cloned, changed: true } : { payload, changed: false }
}

/**
 * SSE 事件是否构成「客户端已收到真实输出」。
 *
 * 一旦判定为已开始输出，重试就不再安全（客户端已经看到部分内容），
 * 缓冲也必须立即下发。降载 error / response.failed 帧不算输出：
 * 把它当首输出下发，Codex 就地终止，重试机会随之消失。
 *
 * @param {Object|null} data 已解析的事件负载（[DONE] 传 null）
 * @param {string} eventType SSE event 名（缺省时回退到 data.type）
 * @returns {boolean}
 */
function streamDataStartsClientOutput(data, eventType) {
  const type =
    (eventType && eventType.trim()) || (isPlainObject(data) ? toLowerTrimmed(data.type) : '')

  // data: [DONE]
  if (!isPlainObject(data)) {
    return true
  }

  switch (type) {
    case 'error':
    case 'response.failed':
      // 降载帧要留给重试；其它错误（内容策略、invalid_request 等）原样立即转发
      return !isCapacityShedEvent(data)
    case 'response.output_item.added':
      return outputItemStartsClientOutput(data.item)
    case 'response.content_part.added':
    case 'response.reasoning_summary_part.added':
      return partStartsClientOutput(data.part, type)
    default:
      return !PREAMBLE_EVENT_TYPES.has(type)
  }
}

function outputItemStartsClientOutput(item) {
  if (!isPlainObject(item)) {
    return true
  }
  switch (toLowerTrimmed(item.type)) {
    case 'reasoning':
      if (typeof item.encrypted_content === 'string' && item.encrypted_content !== '') {
        return true
      }
      if (!Array.isArray(item.summary)) {
        return false
      }
      return item.summary.some(
        (part) =>
          !isPlainObject(part) ||
          toLowerTrimmed(part.type) !== 'summary_text' ||
          (typeof part.text === 'string' && part.text !== '')
      )
    case 'message':
      if (!Array.isArray(item.content)) {
        return false
      }
      return item.content.some((part) => {
        if (!isPlainObject(part)) {
          return true
        }
        switch (toLowerTrimmed(part.type)) {
          case 'output_text':
            return typeof part.text === 'string' && part.text !== ''
          case 'refusal':
            return typeof part.refusal === 'string' && part.refusal !== ''
          default:
            return true
        }
      })
    case 'function_call':
      return typeof item.arguments === 'string' && item.arguments !== ''
    case 'custom_tool_call':
      return typeof item.input === 'string' && item.input !== ''
    case 'compaction':
      return typeof item.encrypted_content === 'string' && item.encrypted_content !== ''
    default:
      return true
  }
}

function partStartsClientOutput(part, eventType) {
  if (!isPlainObject(part)) {
    return true
  }
  const partType = toLowerTrimmed(part.type)
  if (eventType === 'response.reasoning_summary_part.added') {
    if (partType !== 'summary_text') {
      return true
    }
    return typeof part.text === 'string' && part.text !== ''
  }
  switch (partType) {
    case 'output_text':
      return typeof part.text === 'string' && part.text !== ''
    case 'refusal':
      return typeof part.refusal === 'string' && part.refusal !== ''
    default:
      return true
  }
}

/**
 * 计算下一次重试前的等待时间
 *
 * @param {number} attempt 已完成的尝试次数（1 表示首次请求刚失败）
 * @param {string|number|null} retryAfterHeader 上游 Retry-After 头
 * @param {Object} [settings]
 * @returns {number} 毫秒
 */
function computeRetryDelayMs(attempt, retryAfterHeader = null, settings = DEFAULT_SETTINGS) {
  const { retryDelaysMs, maxDelayMs } = { ...DEFAULT_SETTINGS, ...settings }
  const index = Math.min(Math.max(attempt, 1), retryDelaysMs.length) - 1
  let delay = retryDelaysMs[index]

  const retryAfterSeconds = Number.parseFloat(retryAfterHeader)
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    const retryAfterMs = Math.round(retryAfterSeconds * 1000)
    // 只在上游给出的等待时间落在预算内时采纳，避免一个头把请求挂死
    if (retryAfterMs <= maxDelayMs) {
      delay = Math.max(delay, retryAfterMs)
    }
  }

  return Math.min(delay, maxDelayMs)
}

/**
 * 解析 SSE 事件块（以空行分隔的一段文本）
 *
 * @param {string} block
 * @returns {{ eventType: string, dataLines: string[], jsonStr: string, data: Object|null, isDone: boolean }}
 */
function parseSSEBlock(block) {
  let eventType = ''
  const dataLines = []

  for (const rawLine of block.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
  }

  const jsonStr = dataLines.join('\n')
  if (!jsonStr) {
    return { eventType, dataLines, jsonStr, data: null, isDone: false }
  }
  if (jsonStr === '[DONE]') {
    return { eventType, dataLines, jsonStr, data: null, isDone: true }
  }

  let data = null
  try {
    data = JSON.parse(jsonStr)
  } catch (_) {
    data = null
  }
  return { eventType, dataLines, jsonStr, data, isDone: false }
}

/**
 * 对一个 SSE 事件块中的降载错误码做改写，返回新的块文本。
 * 未命中降载时原样返回（不重排字段、不重写空白）。
 *
 * @param {string} block
 * @returns {{ block: string, changed: boolean }}
 */
function rewriteCapacityShedSSEBlock(block) {
  const parsed = parseSSEBlock(block)
  if (!parsed.data) {
    return { block, changed: false }
  }
  const { payload, changed } = rewriteCapacityShedCode(parsed.data)
  if (!changed) {
    return { block, changed: false }
  }

  const rewrittenJson = JSON.stringify(payload)
  const lines = block.split('\n')
  let replaced = false
  const out = lines.map((rawLine) => {
    const hasCR = rawLine.endsWith('\r')
    const line = hasCR ? rawLine.slice(0, -1) : rawLine
    if (!line.startsWith('data:') || replaced) {
      return rawLine
    }
    replaced = true
    return `data: ${rewrittenJson}${hasCR ? '\r' : ''}`
  })

  return { block: out.join('\n'), changed: true }
}

/**
 * 合并运行期配置与默认值
 *
 * @param {Object} [overrides] 来自 config.openaiCapacityShed 的覆盖项
 * @returns {{maxAttempts:number, retryDelaysMs:number[], maxDelayMs:number, bufferLimitBytes:number}}
 */
function resolveSettings(overrides = null) {
  const merged = { ...DEFAULT_SETTINGS }
  if (!isPlainObject(overrides)) {
    return merged
  }
  for (const key of ['maxAttempts', 'maxDelayMs', 'bufferLimitBytes', 'preOutputBufferMs']) {
    const value = Number(overrides[key])
    if (Number.isFinite(value) && value > 0) {
      merged[key] = Math.floor(value)
    }
  }
  if (Array.isArray(overrides.retryDelaysMs) && overrides.retryDelaysMs.length > 0) {
    const delays = overrides.retryDelaysMs
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0)
    if (delays.length > 0) {
      merged.retryDelaysMs = delays
    }
  }
  return merged
}

module.exports = {
  CAPACITY_SHED_CODES,
  RETRYABLE_CLIENT_CODE,
  DEFAULT_SETTINGS,
  computeRetryDelayMs,
  extractErrorCode,
  extractErrorMessage,
  isCapacityShedEvent,
  isCapacityShedMessage,
  isCapacityShedResponse,
  isTransientProcessing400,
  parseSSEBlock,
  rewriteCapacityShedCode,
  resolveSettings,
  rewriteCapacityShedSSEBlock,
  streamDataStartsClientOutput
}
