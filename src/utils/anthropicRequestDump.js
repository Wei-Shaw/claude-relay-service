const fs = require('fs/promises')
const path = require('path')
const logger = require('./logger')
const { getProjectRoot } = require('./projectPaths')

const REQUEST_DUMP_ENV = 'ANTHROPIC_DEBUG_REQUEST_DUMP'
const REQUEST_DUMP_MAX_BYTES_ENV = 'ANTHROPIC_DEBUG_REQUEST_DUMP_MAX_BYTES'
const REQUEST_DUMP_FILENAME = 'anthropic-requests-dump.jsonl'

function isEnabled() {
  const raw = process.env[REQUEST_DUMP_ENV]
  if (!raw) {
    return false
  }
  return raw === '1' || raw.toLowerCase() === 'true'
}

function getMaxBytes() {
  const raw = process.env[REQUEST_DUMP_MAX_BYTES_ENV]
  if (!raw) {
    return 2 * 1024 * 1024
  }
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 2 * 1024 * 1024
  }
  return parsed
}

function maskSecret(value) {
  if (value === null || value === undefined) {
    return value
  }
  const str = String(value)
  if (str.length <= 8) {
    return '***'
  }
  return `${str.slice(0, 4)}...${str.slice(-4)}`
}

function sanitizeHeaders(headers) {
  const sensitive = new Set([
    'authorization',
    'proxy-authorization',
    'x-api-key',
    'cookie',
    'set-cookie',
    'x-forwarded-for',
    'x-real-ip'
  ])

  const out = {}
  for (const [k, v] of Object.entries(headers || {})) {
    const key = k.toLowerCase()
    if (sensitive.has(key)) {
      out[key] = maskSecret(v)
      continue
    }
    out[key] = v
  }
  return out
}

function safeJsonStringify(payload, maxBytes) {
  let json = ''
  try {
    json = JSON.stringify(payload)
  } catch (e) {
    return JSON.stringify({
      type: 'anthropic_request_dump_error',
      error: 'JSON.stringify_failed',
      message: e?.message || String(e)
    })
  }

  if (Buffer.byteLength(json, 'utf8') <= maxBytes) {
    return json
  }

  const truncated = Buffer.from(json, 'utf8').subarray(0, maxBytes).toString('utf8')
  return JSON.stringify({
    type: 'anthropic_request_dump_truncated',
    maxBytes,
    originalBytes: Buffer.byteLength(json, 'utf8'),
    partialJson: truncated
  })
}

async function dumpAnthropicMessagesRequest(req, meta = {}) {
  if (!isEnabled()) {
    return
  }

  const maxBytes = getMaxBytes()
  const filename = path.join(getProjectRoot(), REQUEST_DUMP_FILENAME)

  const record = {
    ts: new Date().toISOString(),
    requestId: req?.requestId || null,
    method: req?.method || null,
    url: req?.originalUrl || req?.url || null,
    ip: req?.ip || null,
    meta,
    headers: sanitizeHeaders(req?.headers || {}),
    body: req?.body || null
  }

  const line = `${safeJsonStringify(record, maxBytes)}\n`

  try {
    await fs.appendFile(filename, line, { encoding: 'utf8' })
  } catch (e) {
    logger.warn('Failed to dump Anthropic request', {
      filename,
      requestId: req?.requestId || null,
      error: e?.message || String(e)
    })
  }
}

module.exports = {
  dumpAnthropicMessagesRequest,
  REQUEST_DUMP_ENV,
  REQUEST_DUMP_MAX_BYTES_ENV,
  REQUEST_DUMP_FILENAME
}
