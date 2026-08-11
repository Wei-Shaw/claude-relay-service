// 上游错误 → 返回给客户端的包装/脱敏响应（纯函数）
// 原则：默认不裸透传上游原文。状态码归一化 + 按客户端协议的干净 error + 脱敏。
// 仅对"客户端请求自身问题"类（普通 4xx，如 400/404/422）透传脱敏后的上游 message，便于客户端修正。
// 上游账户/渠道标识、上游 URL、认证细节一律不出现在返回体里（运维信息走 recordErrorHistory）。

// 上游状态码 → 客户端看到的状态码（隐藏账户/上游内部细节）
const normalizeStatusCode = (upstreamStatus) => {
  if (!Number.isInteger(upstreamStatus)) {
    return 502
  }
  if (upstreamStatus === 401 || upstreamStatus === 403) {
    // 隐藏"我方账户认证问题"，免得客户端以为是自己的 key 错
    return 502
  }
  if (upstreamStatus === 529) {
    return 503
  }
  if (upstreamStatus === 429) {
    // 保留限流语义，让客户端退避
    return 429
  }
  if (upstreamStatus >= 500) {
    return 502
  }
  // 普通 4xx(400/404/422...) 原样，属客户端请求问题
  return upstreamStatus
}

// 是否把（脱敏后的）上游 message 透给客户端：仅普通 4xx（客户端请求自身问题，需知道哪错了）
const shouldExposeUpstreamMessage = (clientStatus) =>
  clientStatus >= 400 && clientStatus < 500 && clientStatus !== 429

// 凭证形态正则：即便透传普通 4xx 的上游 message，也按形态脱敏，防夹带 key
const SECRET_PATTERNS = [
  /sk-ant-[a-zA-Z0-9_-]{8,}/g,
  /sk-[a-zA-Z0-9_-]{16,}/g,
  /AIza[a-zA-Z0-9_-]{10,}/g,
  /ya29\.[a-zA-Z0-9._-]{10,}/g,
  /Bearer\s+[a-zA-Z0-9._-]{12,}/gi
]

// 从上游 body 提取 message 并脱敏（去账户/渠道标记、URL、凭证形态，限长）
const extractSafeMessage = (upstreamBody) => {
  let msg = ''
  if (typeof upstreamBody === 'string') {
    msg = upstreamBody
  } else if (upstreamBody && typeof upstreamBody === 'object') {
    const err = upstreamBody.error
    msg = (err && (err.message || err.msg)) || upstreamBody.message || ''
  }
  if (typeof msg !== 'string') {
    return ''
  }
  let cleaned = msg
    .replace(/ \[[^\]/]+\/[^\]]+\]/g, '')
    .replace(/https?:\/\/[^\s"']+/g, '[upstream]')
  for (const pattern of SECRET_PATTERNS) {
    cleaned = cleaned.replace(pattern, '***')
  }
  return cleaned.trim().slice(0, 500)
}

// 客户端状态码 → 默认通用文案（脱敏，不带上游原文）
const describeError = (clientStatus) => {
  if (clientStatus === 429) {
    return { type: 'rate_limit_error', message: 'Upstream rate limited, please retry later' }
  }
  if (clientStatus === 503) {
    return {
      type: 'overloaded_error',
      message: 'Upstream temporarily overloaded, please retry later'
    }
  }
  if (clientStatus === 502) {
    return { type: 'upstream_error', message: 'Upstream service temporarily unavailable' }
  }
  if (clientStatus >= 400 && clientStatus < 500) {
    return { type: 'invalid_request_error', message: 'Invalid request' }
  }
  return { type: 'upstream_error', message: 'Upstream request failed' }
}

// 按客户端协议构造 error body
const buildErrorBody = (protocol, clientStatus, type, message, retryAfterSeconds) => {
  if (protocol === 'anthropic') {
    return { type: 'error', error: { type, message } }
  }
  if (protocol === 'gemini') {
    return { error: { code: clientStatus, message, status: type } }
  }
  // openai（默认）
  const body = { error: { message, type, code: type, param: null } }
  if (retryAfterSeconds) {
    body.error.resets_in_seconds = retryAfterSeconds
  }
  return body
}

// 主入口：上游错误 → { statusCode, body }
const buildClientError = ({
  statusCode,
  protocol = 'openai',
  upstreamBody = null,
  retryAfterSeconds = null
}) => {
  const clientStatus = normalizeStatusCode(statusCode)
  const desc = describeError(clientStatus)
  let { message } = desc
  if (shouldExposeUpstreamMessage(clientStatus)) {
    const safe = extractSafeMessage(upstreamBody)
    if (safe) {
      message = safe
    }
  }
  return {
    statusCode: clientStatus,
    body: buildErrorBody(protocol, clientStatus, desc.type, message, retryAfterSeconds)
  }
}

module.exports = {
  normalizeStatusCode,
  shouldExposeUpstreamMessage,
  extractSafeMessage,
  describeError,
  buildClientError
}
