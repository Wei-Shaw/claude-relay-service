const path = require('path')
const logger = require('./logger')
const { getProjectRoot } = require('./projectPaths')
const { safeRotatingAppend } = require('./safeRotatingAppend')

const UPSTREAM_RESPONSE_DUMP_ENV = 'ANTIGRAVITY_DEBUG_UPSTREAM_RESPONSE_DUMP'
const UPSTREAM_RESPONSE_DUMP_MAX_BYTES_ENV = 'ANTIGRAVITY_DEBUG_UPSTREAM_RESPONSE_DUMP_MAX_BYTES'
const UPSTREAM_RESPONSE_DUMP_FILENAME = 'antigravity-upstream-responses-dump.jsonl'

function isEnabled() {
  const raw = process.env[UPSTREAM_RESPONSE_DUMP_ENV]
  if (!raw) {
    return false
  }
  const normalized = String(raw).trim().toLowerCase()
  return normalized === '1' || normalized === 'true'
}

function getMaxBytes() {
  const raw = process.env[UPSTREAM_RESPONSE_DUMP_MAX_BYTES_ENV]
  if (!raw) {
    return 2 * 1024 * 1024
  }
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 2 * 1024 * 1024
  }
  return parsed
}

function safeJsonStringify(payload, maxBytes) {
  let json = ''
  try {
    json = JSON.stringify(payload)
  } catch (e) {
    return JSON.stringify({
      type: 'antigravity_upstream_response_dump_error',
      error: 'JSON.stringify_failed',
      message: e?.message || String(e)
    })
  }

  if (Buffer.byteLength(json, 'utf8') <= maxBytes) {
    return json
  }

  const truncated = Buffer.from(json, 'utf8').subarray(0, maxBytes).toString('utf8')
  return JSON.stringify({
    type: 'antigravity_upstream_response_dump_truncated',
    maxBytes,
    originalBytes: Buffer.byteLength(json, 'utf8'),
    partialJson: truncated
  })
}

/**
 * 记录 Antigravity 上游 API 的响应
 * @param {Object} responseInfo - 响应信息
 * @param {string} responseInfo.requestId - 请求 ID
 * @param {string} responseInfo.model - 模型名称
 * @param {number} responseInfo.statusCode - HTTP 状态码
 * @param {string} responseInfo.statusText - HTTP 状态文本
 * @param {Object} responseInfo.headers - 响应头
 * @param {string} responseInfo.responseType - 响应类型 (stream/non-stream/error)
 * @param {Object} responseInfo.summary - 响应摘要
 * @param {Object} responseInfo.error - 错误信息（如果有）
 */
async function dumpAntigravityUpstreamResponse(responseInfo) {
  if (!isEnabled()) {
    return
  }

  const maxBytes = getMaxBytes()
  const filename = path.join(getProjectRoot(), UPSTREAM_RESPONSE_DUMP_FILENAME)

  const record = {
    ts: new Date().toISOString(),
    type: 'antigravity_upstream_response',
    requestId: responseInfo?.requestId || null,
    model: responseInfo?.model || null,
    statusCode: responseInfo?.statusCode || null,
    statusText: responseInfo?.statusText || null,
    responseType: responseInfo?.responseType || null,
    headers: responseInfo?.headers || null,
    summary: responseInfo?.summary || null,
    error: responseInfo?.error || null,
    rawData: responseInfo?.rawData || null
  }

  const line = `${safeJsonStringify(record, maxBytes)}\n`
  try {
    await safeRotatingAppend(filename, line)
  } catch (e) {
    logger.warn('Failed to dump Antigravity upstream response', {
      filename,
      requestId: responseInfo?.requestId || null,
      error: e?.message || String(e)
    })
  }
}

/**
 * 记录 SSE 流中的每个事件（用于详细调试）
 */
async function dumpAntigravityStreamEvent(eventInfo) {
  if (!isEnabled()) {
    return
  }

  const maxBytes = getMaxBytes()
  const filename = path.join(getProjectRoot(), UPSTREAM_RESPONSE_DUMP_FILENAME)

  const record = {
    ts: new Date().toISOString(),
    type: 'antigravity_stream_event',
    requestId: eventInfo?.requestId || null,
    eventIndex: eventInfo?.eventIndex || null,
    eventType: eventInfo?.eventType || null,
    data: eventInfo?.data || null
  }

  const line = `${safeJsonStringify(record, maxBytes)}\n`
  try {
    await safeRotatingAppend(filename, line)
  } catch (e) {
    // 静默处理，避免日志过多
  }
}

/**
 * 记录流式响应的最终摘要
 */
async function dumpAntigravityStreamSummary(summaryInfo) {
  if (!isEnabled()) {
    return
  }

  const maxBytes = getMaxBytes()
  const filename = path.join(getProjectRoot(), UPSTREAM_RESPONSE_DUMP_FILENAME)

  const record = {
    ts: new Date().toISOString(),
    type: 'antigravity_stream_summary',
    requestId: summaryInfo?.requestId || null,
    model: summaryInfo?.model || null,
    totalEvents: summaryInfo?.totalEvents || 0,
    finishReason: summaryInfo?.finishReason || null,
    hasThinking: summaryInfo?.hasThinking || false,
    hasToolCalls: summaryInfo?.hasToolCalls || false,
    toolCallNames: summaryInfo?.toolCallNames || [],
    usage: summaryInfo?.usage || null,
    error: summaryInfo?.error || null,
    textPreview: summaryInfo?.textPreview || null
  }

  const line = `${safeJsonStringify(record, maxBytes)}\n`
  try {
    await safeRotatingAppend(filename, line)
  } catch (e) {
    logger.warn('Failed to dump Antigravity stream summary', {
      filename,
      requestId: summaryInfo?.requestId || null,
      error: e?.message || String(e)
    })
  }
}

module.exports = {
  dumpAntigravityUpstreamResponse,
  dumpAntigravityStreamEvent,
  dumpAntigravityStreamSummary,
  UPSTREAM_RESPONSE_DUMP_ENV,
  UPSTREAM_RESPONSE_DUMP_MAX_BYTES_ENV,
  UPSTREAM_RESPONSE_DUMP_FILENAME
}
