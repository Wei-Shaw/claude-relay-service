const fs = require('fs/promises')
const path = require('path')
const logger = require('./logger')
const { getProjectRoot } = require('./projectPaths')

const UPSTREAM_REQUEST_DUMP_ENV = 'ANTIGRAVITY_DEBUG_UPSTREAM_REQUEST_DUMP'
const UPSTREAM_REQUEST_DUMP_MAX_BYTES_ENV = 'ANTIGRAVITY_DEBUG_UPSTREAM_REQUEST_DUMP_MAX_BYTES'
const UPSTREAM_REQUEST_DUMP_FILENAME = 'antigravity-upstream-requests-dump.jsonl'

function isEnabled() {
  const raw = process.env[UPSTREAM_REQUEST_DUMP_ENV]
  if (!raw) {
    return false
  }
  const normalized = String(raw).trim().toLowerCase()
  return normalized === '1' || normalized === 'true'
}

function getMaxBytes() {
  const raw = process.env[UPSTREAM_REQUEST_DUMP_MAX_BYTES_ENV]
  if (!raw) {
    return 2 * 1024 * 1024
  }
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 2 * 1024 * 1024
  }
  return parsed
}

function redact(value) {
  if (!value) {
    return value
  }
  const s = String(value)
  if (s.length <= 10) {
    return '***'
  }
  return `${s.slice(0, 3)}...${s.slice(-4)}`
}

function safeJsonStringify(payload, maxBytes) {
  let json = ''
  try {
    json = JSON.stringify(payload)
  } catch (e) {
    return JSON.stringify({
      type: 'antigravity_upstream_dump_error',
      error: 'JSON.stringify_failed',
      message: e?.message || String(e)
    })
  }

  if (Buffer.byteLength(json, 'utf8') <= maxBytes) {
    return json
  }

  const truncated = Buffer.from(json, 'utf8').subarray(0, maxBytes).toString('utf8')
  return JSON.stringify({
    type: 'antigravity_upstream_dump_truncated',
    maxBytes,
    originalBytes: Buffer.byteLength(json, 'utf8'),
    partialJson: truncated
  })
}

async function dumpAntigravityUpstreamRequest(requestInfo) {
  if (!isEnabled()) {
    return
  }

  const maxBytes = getMaxBytes()
  const filename = path.join(getProjectRoot(), UPSTREAM_REQUEST_DUMP_FILENAME)

  const record = {
    ts: new Date().toISOString(),
    type: 'antigravity_upstream_request',
    requestId: requestInfo?.requestId || null,
    model: requestInfo?.model || null,
    stream: Boolean(requestInfo?.stream),
    url: requestInfo?.url || null,
    baseUrl: requestInfo?.baseUrl || null,
    params: requestInfo?.params || null,
    headers: requestInfo?.headers
      ? {
          Host: requestInfo.headers.Host || requestInfo.headers.host || null,
          'User-Agent':
            requestInfo.headers['User-Agent'] || requestInfo.headers['user-agent'] || null,
          Authorization: (() => {
            const raw = requestInfo.headers.Authorization || requestInfo.headers.authorization
            if (!raw) {
              return null
            }
            const value = String(raw)
            const m = value.match(/^Bearer\\s+(.+)$/i)
            const token = m ? m[1] : value
            return `Bearer ${redact(token)}`
          })()
        }
      : null,
    envelope: requestInfo?.envelope || null
  }

  const line = `${safeJsonStringify(record, maxBytes)}\n`
  try {
    await fs.appendFile(filename, line, { encoding: 'utf8' })
  } catch (e) {
    logger.warn('Failed to dump Antigravity upstream request', {
      filename,
      requestId: requestInfo?.requestId || null,
      error: e?.message || String(e)
    })
  }
}

module.exports = {
  dumpAntigravityUpstreamRequest,
  UPSTREAM_REQUEST_DUMP_ENV,
  UPSTREAM_REQUEST_DUMP_MAX_BYTES_ENV,
  UPSTREAM_REQUEST_DUMP_FILENAME
}
