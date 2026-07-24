const CONTEXT_1M_BETA = 'context-1m-2025-08-07'
const LONG_CONTEXT_SUFFIX_RE = /\s*\[1m\]\s*$/i

function normalizeClaudeModelForUpstream(model) {
  if (typeof model !== 'string') {
    return { model, isLongContextAlias: false }
  }

  const normalized = model.replace(LONG_CONTEXT_SUFFIX_RE, '').trim()
  return {
    model: normalized || model,
    isLongContextAlias: normalized !== model.trim()
  }
}

function mergeAnthropicBetaHeader(betaHeader, requiredBeta) {
  const betaList = []
  const seen = new Set()

  const addBeta = (beta) => {
    if (!beta || typeof beta !== 'string') {
      return
    }

    beta
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        if (!seen.has(part)) {
          seen.add(part)
          betaList.push(part)
        }
      })
  }

  addBeta(betaHeader)
  addBeta(requiredBeta)

  return betaList.join(',')
}

function normalizeClaudePayloadForUpstream(body, betaHeader) {
  if (!body || typeof body !== 'object') {
    return { body, betaHeader, isLongContextAlias: false }
  }

  const normalized = normalizeClaudeModelForUpstream(body.model)
  if (!normalized.isLongContextAlias) {
    return { body, betaHeader, isLongContextAlias: false }
  }

  return {
    body: {
      ...body,
      model: normalized.model
    },
    betaHeader: mergeAnthropicBetaHeader(betaHeader, CONTEXT_1M_BETA),
    isLongContextAlias: true
  }
}

module.exports = {
  CONTEXT_1M_BETA,
  normalizeClaudeModelForUpstream,
  mergeAnthropicBetaHeader,
  normalizeClaudePayloadForUpstream
}
