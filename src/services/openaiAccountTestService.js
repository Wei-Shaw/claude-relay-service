const axios = require('axios')
const { StringDecoder } = require('string_decoder')
const accounts = require('./account/openaiAccountService')
const ProxyHelper = require('../utils/proxyHelper')
const { extractCodexUsageHeaders } = require('../utils/codexUsage')
const { createOpenAITestPayload } = require('../utils/testPayloadHelper')

const DEFAULT_MODEL = 'gpt-5.5'
const errors = {
  ACCOUNT_NOT_FOUND: '账号不存在',
  TOKEN_REFRESH_FAILED: '令牌刷新失败，请检查账号授权',
  AUTH_ERROR: '账号认证失败，请重新授权',
  RATE_LIMITED: '账号被限流，请稍后重试',
  UPSTREAM_ERROR: '模型服务返回错误',
  INCOMPLETE_RESPONSE: '模型响应未正常完成',
  INVALID_RESPONSE: '模型响应格式无效或没有文本',
  TIMEOUT: '账号测试超时',
  NETWORK_ERROR: '无法连接模型服务',
  INVALID_PROXY: '账号代理配置无效'
}

function failure(code) {
  return { success: false, code, error: errors[code] }
}

function statusFailure(status) {
  if (status === 401 || status === 403) {
    return failure('AUTH_ERROR')
  }
  if (status === 429) {
    return failure('RATE_LIMITED')
  }
  return failure('UPSTREAM_ERROR')
}

function evaluateEvent(event, streamedText) {
  if (['error', 'response.failed'].includes(event.type)) {
    const code = event.error?.code || event.response?.error?.code || event.code
    if (['rate_limit_exceeded', 'usage_limit_reached'].includes(code)) {
      return failure('RATE_LIMITED')
    }
    if (['invalid_api_key', 'token_expired', 'authentication_error'].includes(code)) {
      return failure('AUTH_ERROR')
    }
    return failure('UPSTREAM_ERROR')
  }
  if (event.type === 'response.incomplete') {
    return failure('INCOMPLETE_RESPONSE')
  }
  if (event.type !== 'response.completed') {
    return null
  }
  const { response } = event
  if (!response || response.error || response.status !== 'completed') {
    return failure('INVALID_RESPONSE')
  }
  const hasText = response.output?.some(
    (item) =>
      item.type === 'message' &&
      item.content?.some(
        (part) => part.type === 'output_text' && typeof part.text === 'string' && part.text.trim()
      )
  )
  return hasText || streamedText
    ? { success: true, message: '收到有效模型回复' }
    : failure('INVALID_RESPONSE')
}

async function readResult(stream) {
  const decoder = new StringDecoder('utf8')
  let buffer = ''
  let bytes = 0
  let streamedText = false
  for await (const chunk of stream) {
    bytes += Buffer.byteLength(chunk)
    if (bytes > 1024 * 1024) {
      return failure('INVALID_RESPONSE')
    }
    buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk)
    buffer = buffer.replace(/\r\n/g, '\n')
    let end
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (!data || data === '[DONE]') {
        continue
      }
      let event
      try {
        event = JSON.parse(data)
      } catch {
        return failure('INVALID_RESPONSE')
      }
      const text =
        event.type === 'response.output_text.delta'
          ? event.delta
          : event.type === 'response.output_text.done'
            ? event.text
            : null
      if (typeof text === 'string' && text.trim()) {
        streamedText = true
      }
      const result = evaluateEvent(event, streamedText)
      if (result) {
        return result
      }
    }
  }
  return failure('INCOMPLETE_RESPONSE')
}

async function testAccount(accountId, model = DEFAULT_MODEL) {
  const startedAt = Date.now()
  let quotaUpdated = false
  let quotaError
  const updateQuota = async (headers) => {
    const snapshot = extractCodexUsageHeaders(headers)
    if (!snapshot) {
      return
    }
    try {
      await accounts.updateCodexUsageSnapshot(accountId, snapshot)
      quotaUpdated = true
    } catch {
      quotaError = 'QUOTA_SAVE_FAILED'
    }
  }
  const finish = (result) => ({
    ...result,
    model,
    quotaUpdated,
    ...(quotaError ? { quotaError } : {}),
    latencyMs: Date.now() - startedAt,
    timestamp: new Date().toISOString()
  })
  let stream
  let timedOut = false
  const controller = new AbortController()
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
    stream?.destroy()
  }, 60000)
  try {
    let account = await accounts.getAccount(accountId)
    if (!account) {
      return finish(failure('ACCOUNT_NOT_FOUND'))
    }
    if (accounts.isTokenExpired(account)) {
      try {
        await Promise.race([
          accounts.refreshAccountToken(accountId, { signal: controller.signal }),
          new Promise((_, reject) =>
            controller.signal.addEventListener('abort', () => reject(new Error('TIMEOUT')), {
              once: true
            })
          )
        ])
        account = await accounts.getAccount(accountId)
      } catch {
        return finish(failure(timedOut ? 'TIMEOUT' : 'TOKEN_REFRESH_FAILED'))
      }
    }
    const token = account?.accessToken && accounts.decrypt(account.accessToken)
    const chatgptAccountId = account?.accountId || account?.chatgptUserId
    if (!token || !chatgptAccountId) {
      return finish(failure('AUTH_ERROR'))
    }
    const agent = ProxyHelper.createProxyAgent(account.proxy)
    if (account.proxy && !agent) {
      return finish(failure('INVALID_PROXY'))
    }
    const response = await axios.post(
      'https://chatgpt.com/backend-api/codex/responses',
      {
        model,
        instructions: '',
        input: createOpenAITestPayload(model).input,
        stream: true,
        store: false
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'chatgpt-account-id': chatgptAccountId,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          originator: 'codex_cli_rs'
        },
        responseType: 'stream',
        timeout: 60000,
        signal: controller.signal,
        validateStatus: () => true,
        ...(agent ? { httpAgent: agent, httpsAgent: agent, proxy: false } : {})
      }
    )
    stream = response.data
    await updateQuota(response.headers)
    if (response.status !== 200) {
      return finish(statusFailure(response.status))
    }
    const result = await readResult(stream)
    return finish(timedOut ? failure('TIMEOUT') : result)
  } catch (error) {
    if (error.response) {
      stream = error.response.data
      await updateQuota(error.response.headers)
    }
    if (timedOut || ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code)) {
      return finish(failure('TIMEOUT'))
    }
    if (error.response?.status) {
      return finish(statusFailure(error.response.status))
    }
    return finish(failure('NETWORK_ERROR'))
  } finally {
    clearTimeout(timer)
    stream?.destroy?.()
    controller.abort()
  }
}

module.exports = { testAccount, DEFAULT_MODEL }
