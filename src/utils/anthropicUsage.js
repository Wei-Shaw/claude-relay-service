/**
 * Anthropic Messages usage helpers.
 *
 * In a stream, message_start carries the usage known before generation starts. The usage of the final
 * message_delta is cumulative for the whole message: input_tokens (including the results of server tools such as
 * web_search that ran during the turn), cache counts, output_tokens and server_tool_use. The counters are omitted
 * when they do not apply, so a present counter overwrites the value from message_start and is never added to it.
 * https://platform.claude.com/docs/en/build-with-claude/streaming (MessageDeltaUsage)
 */

const toCount = (value) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * Normalise usage.server_tool_use. Returns null when the usage reports no server tool requests.
 * @param {Object} usage - an Anthropic usage object (message, message_delta or collected usage data)
 * @returns {{web_search_requests: number, web_fetch_requests: number}|null}
 */
function extractServerToolUse(usage) {
  const stu = usage && typeof usage === 'object' ? usage.server_tool_use : null
  if (!stu || typeof stu !== 'object') {
    return null
  }
  const result = {
    web_search_requests: toCount(stu.web_search_requests),
    web_fetch_requests: toCount(stu.web_fetch_requests)
  }
  return result.web_search_requests > 0 || result.web_fetch_requests > 0 ? result : null
}

/**
 * Apply a message_delta usage object to usage collected from message_start (mutates and returns target).
 */
function mergeMessageDeltaUsage(target, deltaUsage) {
  if (!target || !deltaUsage || typeof deltaUsage !== 'object') {
    return target
  }
  if (deltaUsage.output_tokens !== undefined && deltaUsage.output_tokens !== null) {
    target.output_tokens = deltaUsage.output_tokens || 0
  }
  for (const field of ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']) {
    if (deltaUsage[field] !== undefined && deltaUsage[field] !== null) {
      target[field] = deltaUsage[field] || 0
    }
  }
  if (deltaUsage.cache_creation && typeof deltaUsage.cache_creation === 'object') {
    target.cache_creation = {
      ephemeral_5m_input_tokens: deltaUsage.cache_creation.ephemeral_5m_input_tokens || 0,
      ephemeral_1h_input_tokens: deltaUsage.cache_creation.ephemeral_1h_input_tokens || 0
    }
  }
  const serverToolUse = extractServerToolUse(deltaUsage)
  if (serverToolUse) {
    target.server_tool_use = serverToolUse
  }
  return target
}

/**
 * Number of billable web searches in a usage object (Anthropic bills each search; failed searches are not reported).
 */
function getWebSearchRequests(usage) {
  const stu = extractServerToolUse(usage)
  return stu ? stu.web_search_requests : 0
}

module.exports = {
  extractServerToolUse,
  mergeMessageDeltaUsage,
  getWebSearchRequests
}
