const fs = require('fs/promises')
const path = require('path')
const logger = require('./logger')
const { getProjectRoot } = require('./projectPaths')

const RESPONSE_DUMP_ENV = 'ANTHROPIC_DEBUG_RESPONSE_DUMP'
const RESPONSE_DUMP_MAX_BYTES_ENV = 'ANTHROPIC_DEBUG_RESPONSE_DUMP_MAX_BYTES'
const RESPONSE_DUMP_FILENAME = 'anthropic-responses-dump.jsonl'

function isEnabled() {
  const raw = process.env[RESPONSE_DUMP_ENV]
  if (!raw) {
    return false
  }
  return raw === '1' || raw.toLowerCase() === 'true'
}

function getMaxBytes() {
  const raw = process.env[RESPONSE_DUMP_MAX_BYTES_ENV]
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
      type: 'anthropic_response_dump_error',
      error: 'JSON.stringify_failed',
      message: e?.message || String(e)
    })
  }

  if (Buffer.byteLength(json, 'utf8') <= maxBytes) {
    return json
  }

  const truncated = Buffer.from(json, 'utf8').subarray(0, maxBytes).toString('utf8')
  return JSON.stringify({
    type: 'anthropic_response_dump_truncated',
    maxBytes,
    originalBytes: Buffer.byteLength(json, 'utf8'),
    partialJson: truncated
  })
}

function summarizeAnthropicResponseBody(body) {
  const content = Array.isArray(body?.content) ? body.content : []
  const toolUses = content.filter((b) => b && b.type === 'tool_use')
  const texts = content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')

  return {
    id: body?.id || null,
    model: body?.model || null,
    stop_reason: body?.stop_reason || null,
    usage: body?.usage || null,
    content_blocks: content.map((b) => (b ? b.type : null)).filter(Boolean),
    tool_use_names: toolUses.map((b) => b.name).filter(Boolean),
    text_preview: texts ? texts.slice(0, 800) : ''
  }
}

async function dumpAnthropicResponse(req, responseInfo, meta = {}) {
  if (!isEnabled()) {
    return
  }

  const maxBytes = getMaxBytes()
  const filename = path.join(getProjectRoot(), RESPONSE_DUMP_FILENAME)

  const record = {
    ts: new Date().toISOString(),
    requestId: req?.requestId || null,
    url: req?.originalUrl || req?.url || null,
    meta,
    response: responseInfo
  }

  const line = `${safeJsonStringify(record, maxBytes)}\n`
  try {
    await fs.appendFile(filename, line, { encoding: 'utf8' })
  } catch (e) {
    logger.warn('Failed to dump Anthropic response', {
      filename,
      requestId: req?.requestId || null,
      error: e?.message || String(e)
    })
  }
}

async function dumpAnthropicNonStreamResponse(req, statusCode, body, meta = {}) {
  return dumpAnthropicResponse(
    req,
    { kind: 'non-stream', statusCode, summary: summarizeAnthropicResponseBody(body), body },
    meta
  )
}

async function dumpAnthropicStreamSummary(req, summary, meta = {}) {
  return dumpAnthropicResponse(req, { kind: 'stream', summary }, meta)
}

async function dumpAnthropicStreamError(req, error, meta = {}) {
  return dumpAnthropicResponse(req, { kind: 'stream-error', error }, meta)
}

module.exports = {
  dumpAnthropicNonStreamResponse,
  dumpAnthropicStreamSummary,
  dumpAnthropicStreamError,
  RESPONSE_DUMP_ENV,
  RESPONSE_DUMP_MAX_BYTES_ENV,
  RESPONSE_DUMP_FILENAME
}
