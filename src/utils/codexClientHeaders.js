const LEGACY_CODEX_ORIGINATORS = new Set([
  'codex_cli_rs',
  'codex_vscode',
  'codex_exec',
  'codex-tui'
])

const CODEX_BRANDED_ORIGINATOR_REGEX = /^codex /i
const CODEX_VERSION_REGEX = /^[0-9][0-9A-Za-z.-]*$/

function normalizeCodexHeaderValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecognizedCodexOriginator(value) {
  const normalized = normalizeCodexHeaderValue(value)
  if (!normalized) {
    return false
  }

  const lower = normalized.toLowerCase()
  return LEGACY_CODEX_ORIGINATORS.has(lower) || CODEX_BRANDED_ORIGINATOR_REGEX.test(normalized)
}

function parseCodexClientUserAgent(userAgent) {
  const normalized = normalizeCodexHeaderValue(userAgent)
  if (!normalized) {
    return null
  }

  const slashIndex = normalized.indexOf('/')
  if (slashIndex <= 0) {
    return null
  }

  const originator = normalized.slice(0, slashIndex).trim()
  if (!isRecognizedCodexOriginator(originator)) {
    return null
  }

  const version = normalized
    .slice(slashIndex + 1)
    .trim()
    .split(/\s+/, 1)[0]
  if (!version || !CODEX_VERSION_REGEX.test(version)) {
    return null
  }

  return {
    originator,
    version
  }
}

function isCodexClientUserAgent(userAgent) {
  return parseCodexClientUserAgent(userAgent) !== null
}

function codexOriginatorsMatch(userAgentOriginator, headerOriginator) {
  const normalizedUserAgentOriginator = normalizeCodexHeaderValue(userAgentOriginator)
  const normalizedHeaderOriginator = normalizeCodexHeaderValue(headerOriginator)

  if (!normalizedUserAgentOriginator || !normalizedHeaderOriginator) {
    return false
  }

  return normalizedUserAgentOriginator.toLowerCase() === normalizedHeaderOriginator.toLowerCase()
}

function extractCodexSessionId(headers = {}, body = {}) {
  return (
    headers['session_id'] ||
    headers['x-client-request-id'] ||
    headers['x-session-id'] ||
    body?.session_id ||
    body?.conversation_id ||
    body?.prompt_cache_key ||
    null
  )
}

module.exports = {
  LEGACY_CODEX_ORIGINATORS,
  isRecognizedCodexOriginator,
  parseCodexClientUserAgent,
  isCodexClientUserAgent,
  codexOriginatorsMatch,
  extractCodexSessionId
}
