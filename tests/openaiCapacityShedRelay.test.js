// Codex 容量降载在 /openai/v1/responses 主链路上的行为回归。
//
// 关键不变量：
//   1. 降载先在同一账号上重试，客户端看不到 server_is_overloaded；
//   2. 降载**绝不**触发 markAccountRateLimited / markAccountUnauthorized（换账号解决不了容量问题）；
//   3. 重试用尽或流中途降载时，把错误码改写成 server_error，让 Codex 走内置退避
//      而不是打印 "Selected model is at capacity. Please try a different model." 后终止；
//   4. quota 429 走原有摘号路径，行为不变。

const { EventEmitter } = require('events')
const { Readable } = require('stream')

jest.mock('axios', () => ({ post: jest.fn() }))
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  api: jest.fn(),
  security: jest.fn()
}))
jest.mock('../config/config', () => ({
  requestTimeout: 1000,
  openaiCapacityShed: {
    maxAttempts: 3,
    maxDelayMs: 5,
    retryDelaysMs: [1, 1, 1],
    bufferLimitBytes: 65536
  }
}))
jest.mock('../src/middleware/auth', () => ({ authenticateApiKey: (req, res, next) => next() }))
jest.mock('../src/models/redis', () => ({ getClientSafe: () => ({}) }))
jest.mock('../src/utils/proxyHelper', () => ({
  createProxyAgent: () => null,
  getProxyDescription: () => 'none'
}))
jest.mock('../src/utils/rateLimitHelper', () => ({ updateRateLimitCounters: jest.fn() }))
jest.mock('../src/utils/requestDetailHelper', () => ({
  createRequestDetailMeta: () => ({}),
  extractOpenAICacheReadTokens: () => 0
}))
jest.mock('../src/services/requestBodyRuleService', () => ({ applyRules: (body) => body }))
jest.mock('../src/services/relay/openaiResponsesRelayService', () => ({ handleRequest: jest.fn() }))
jest.mock('../src/services/account/openaiResponsesAccountService', () => ({
  getAccount: jest.fn()
}))
jest.mock('../src/services/apiKeyService', () => ({
  hasPermission: () => true,
  recordUsage: jest.fn(async () => ({ total: 0 }))
}))
jest.mock('../src/services/account/openaiAccountService', () => ({
  getAccount: jest.fn(async () => ({
    id: 'acct-1',
    name: 'acct',
    accountId: 'chatgpt-acct-1',
    accessToken: 'enc',
    expiresAt: null
  })),
  isTokenExpired: () => false,
  decrypt: () => 'plain-access-token',
  updateCodexUsageSnapshot: jest.fn(async () => {})
}))
jest.mock('../src/services/scheduler/unifiedOpenAIScheduler', () => ({
  selectAccountForApiKey: jest.fn(async () => ({ accountId: 'acct-1', accountType: 'openai' })),
  isAccountRateLimited: jest.fn(async () => false),
  removeAccountRateLimit: jest.fn(async () => {}),
  markAccountRateLimited: jest.fn(async () => {}),
  markAccountUnauthorized: jest.fn(async () => {}),
  _deleteSessionMapping: jest.fn(async () => {})
}))

const axios = require('axios')
const unifiedOpenAIScheduler = require('../src/services/scheduler/unifiedOpenAIScheduler')
const { handleResponses } = require('../src/routes/openaiRoutes')

const OVERLOAD_MESSAGE = 'Our servers are currently overloaded. Please try again later.'

function sseStream(blocks) {
  return Readable.from([blocks.join('')])
}

function sseBlock(eventType, payload) {
  return `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`
}

const SHED_ERROR_BLOCK = sseBlock('error', {
  type: 'error',
  error: {
    type: 'service_unavailable_error',
    code: 'server_is_overloaded',
    message: OVERLOAD_MESSAGE
  },
  sequence_number: 2
})
const SHED_FAILED_BLOCK = sseBlock('response.failed', {
  type: 'response.failed',
  response: {
    id: 'resp_1',
    status: 'failed',
    error: { code: 'server_is_overloaded', message: OVERLOAD_MESSAGE }
  },
  sequence_number: 3
})
const CREATED_BLOCK = sseBlock('response.created', {
  type: 'response.created',
  response: { id: 'resp_1' }
})
const IN_PROGRESS_BLOCK = sseBlock('response.in_progress', {
  type: 'response.in_progress',
  response: { id: 'resp_1' }
})

function successStream() {
  return sseStream([
    CREATED_BLOCK,
    sseBlock('response.output_text.delta', { type: 'response.output_text.delta', delta: 'hello' }),
    sseBlock('response.completed', {
      type: 'response.completed',
      response: { id: 'resp_1', model: 'gpt-5', usage: { input_tokens: 10, output_tokens: 5 } }
    }),
    'data: [DONE]\n\n'
  ])
}

function makeReq({ stream = true } = {}) {
  const req = new EventEmitter()
  req.headers = { 'user-agent': 'codex_cli_rs/0.50.0' }
  req.body = { model: 'gpt-5', stream, input: [] }
  req.apiKey = { id: 'key-1', permissions: 'all' }
  req.path = '/v1/responses'
  req.originalUrl = '/openai/v1/responses'
  req.method = 'POST'
  req.destroyed = false
  return req
}

function makeRes() {
  const res = new EventEmitter()
  res.statusCode = 200
  res.headers = {}
  res.chunks = []
  res.jsonBody = null
  res.headersSent = false
  res.destroyed = false
  res.writable = true
  res.ended = false
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.setHeader = (k, v) => {
    res.headers[k] = v
    return res
  }
  res.flushHeaders = () => {
    res.headersSent = true
  }
  res.write = (chunk) => {
    res.headersSent = true
    res.chunks.push(chunk.toString())
    return true
  }
  res.json = (body) => {
    res.headersSent = true
    res.jsonBody = body
    res.ended = true
    return res
  }
  res.end = () => {
    res.ended = true
    return res
  }
  res.body = () => res.chunks.join('')
  return res
}

const noAccountPenalty = () => {
  expect(unifiedOpenAIScheduler.markAccountRateLimited).not.toHaveBeenCalled()
  expect(unifiedOpenAIScheduler.markAccountUnauthorized).not.toHaveBeenCalled()
}

beforeEach(() => {
  jest.clearAllMocks()
  unifiedOpenAIScheduler.selectAccountForApiKey.mockResolvedValue({
    accountId: 'acct-1',
    accountType: 'openai'
  })
  unifiedOpenAIScheduler.isAccountRateLimited.mockResolvedValue(false)
})

describe('非流式 HTTP 降载', () => {
  it('400 "Selected model is at capacity" 后第二次尝试成功，客户端只看到 200', async () => {
    axios.post
      .mockResolvedValueOnce({
        status: 400,
        headers: {},
        data: {
          error: {
            type: 'invalid_request_error',
            message: 'Selected model is at capacity. Please try a different model.'
          }
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: { model: 'gpt-5', usage: { input_tokens: 3, output_tokens: 4 } }
      })

    const res = makeRes()
    await handleResponses(makeReq({ stream: false }), res)

    expect(axios.post).toHaveBeenCalledTimes(2)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody.model).toBe('gpt-5')
    noAccountPenalty()
  })

  it('连续三次降载后返回 503 + server_error，且不摘号', async () => {
    axios.post.mockResolvedValue({
      status: 503,
      headers: {},
      data: { error: { code: 'server_is_overloaded', message: OVERLOAD_MESSAGE } }
    })

    const res = makeRes()
    await handleResponses(makeReq({ stream: false }), res)

    expect(axios.post).toHaveBeenCalledTimes(3)
    expect(res.statusCode).toBe(503)
    expect(res.jsonBody).toEqual({
      error: { type: 'server_error', code: 'server_error', message: OVERLOAD_MESSAGE }
    })
    noAccountPenalty()
  })

  it('非降载的 400 原样透传，不重试', async () => {
    axios.post.mockResolvedValue({
      status: 400,
      headers: {},
      data: { error: { type: 'invalid_request_error', message: 'Instructions are required' } }
    })

    const res = makeRes()
    await handleResponses(makeReq({ stream: false }), res)

    expect(axios.post).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(400)
    expect(res.jsonBody.error.message).toBe('Instructions are required')
  })
})

describe('流式降载', () => {
  it('error + response.failed 后重试成功，客户端从未看到 server_is_overloaded', async () => {
    axios.post
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: sseStream([CREATED_BLOCK, IN_PROGRESS_BLOCK, SHED_ERROR_BLOCK, SHED_FAILED_BLOCK])
      })
      .mockResolvedValueOnce({ status: 200, headers: {}, data: successStream() })

    const res = makeRes()
    await handleResponses(makeReq(), res)

    expect(axios.post).toHaveBeenCalledTimes(2)
    const body = res.body()
    expect(body).not.toContain('server_is_overloaded')
    expect(body).not.toContain('event: error')
    expect(body).toContain('hello')
    expect(body).toContain('[DONE]')
    // preamble 只应出现重试成功那一次的
    expect(body.match(/event: response\.created/g)).toHaveLength(1)
    expect(res.statusCode).toBe(200)
    expect(res.ended).toBe(true)
    noAccountPenalty()
  })

  it('重试用尽后改写为 server_error 转发，保留原始消息', async () => {
    // 每次尝试都要拿到全新的流实例
    axios.post.mockImplementation(async () => ({
      status: 200,
      headers: {},
      data: sseStream([CREATED_BLOCK, SHED_ERROR_BLOCK, SHED_FAILED_BLOCK])
    }))

    const res = makeRes()
    await handleResponses(makeReq(), res)

    expect(axios.post).toHaveBeenCalledTimes(3)
    const body = res.body()
    expect(body).not.toContain('server_is_overloaded')
    expect(body).toContain('"code":"server_error"')
    expect(body).toContain(OVERLOAD_MESSAGE)
    // preamble 也要一并下发，SSE 才是完整的
    expect(body).toContain('event: response.created')
    expect(res.statusCode).toBe(200)
    noAccountPenalty()
  })

  it('已有真实输出后才降载：不重试，只改写错误码', async () => {
    axios.post.mockResolvedValue({
      status: 200,
      headers: {},
      data: sseStream([
        CREATED_BLOCK,
        sseBlock('response.output_text.delta', {
          type: 'response.output_text.delta',
          delta: 'partial'
        }),
        SHED_ERROR_BLOCK,
        SHED_FAILED_BLOCK
      ])
    })

    const res = makeRes()
    await handleResponses(makeReq(), res)

    expect(axios.post).toHaveBeenCalledTimes(1)
    const body = res.body()
    expect(body).toContain('partial')
    expect(body).not.toContain('server_is_overloaded')
    expect(body.match(/"code":"server_error"/g)).toHaveLength(2)
    noAccountPenalty()
  })

  it('非降载的流内错误立即透传，不缓冲也不重试', async () => {
    const policyBlock = sseBlock('error', {
      type: 'error',
      error: {
        type: 'invalid_request_error',
        code: 'content_policy_violation',
        message: 'blocked'
      }
    })
    axios.post.mockResolvedValue({
      status: 200,
      headers: {},
      data: sseStream([CREATED_BLOCK, policyBlock])
    })

    const res = makeRes()
    await handleResponses(makeReq(), res)

    expect(axios.post).toHaveBeenCalledTimes(1)
    expect(res.body()).toContain('content_policy_violation')
  })

  it('正常流按原样转发，usage 照常记账', async () => {
    axios.post.mockResolvedValue({ status: 200, headers: {}, data: successStream() })

    const apiKeyService = require('../src/services/apiKeyService')
    const res = makeRes()
    await handleResponses(makeReq(), res)

    expect(axios.post).toHaveBeenCalledTimes(1)
    expect(res.body()).toContain('hello')
    expect(apiKeyService.recordUsage).toHaveBeenCalledTimes(1)
    const [, inputTokens, outputTokens] = apiKeyService.recordUsage.mock.calls[0]
    expect(inputTokens).toBe(10)
    expect(outputTokens).toBe(5)
  })
})

describe('既有行为不受影响', () => {
  it('quota 429 仍走摘号路径', async () => {
    axios.post.mockResolvedValue({
      status: 429,
      headers: {},
      data: {
        error: {
          type: 'usage_limit_reached',
          message: 'usage limit reached',
          resets_in_seconds: 3600
        }
      }
    })

    const res = makeRes()
    await handleResponses(makeReq({ stream: false }), res)

    expect(axios.post).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(429)
    expect(unifiedOpenAIScheduler.markAccountRateLimited).toHaveBeenCalledWith(
      'acct-1',
      'openai',
      null,
      3600
    )
  })

  it('401 仍标记账号未授权', async () => {
    axios.post.mockResolvedValue({
      status: 401,
      headers: {},
      data: { error: { message: 'invalid token' } }
    })

    const res = makeRes()
    await handleResponses(makeReq({ stream: false }), res)

    expect(res.statusCode).toBe(401)
    expect(unifiedOpenAIScheduler.markAccountUnauthorized).toHaveBeenCalled()
  })
})

describe('客户端断开', () => {
  // 线上回归：Node 在请求体读完后会自动销毁 request 流，于是每个 POST 的
  // req.destroyed 开局几毫秒内就变成 true。早期版本拿它当断线判据，结果所有降载
  // 重试都被跳过 —— 只剩改写，日志里 stream_output_started=false 却从不重试。
  it('req.destroyed 变为 true（Node 读完请求体的正常行为）不得当作客户端断开', async () => {
    const req = makeReq({ stream: false })
    axios.post
      .mockImplementationOnce(async () => {
        req.destroyed = true
        return {
          status: 503,
          headers: {},
          data: { error: { code: 'server_is_overloaded', message: OVERLOAD_MESSAGE } }
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: { model: 'gpt-5', usage: { input_tokens: 1, output_tokens: 1 } }
      })

    const res = makeRes()
    await handleResponses(req, res)

    expect(axios.post).toHaveBeenCalledTimes(2)
    expect(res.statusCode).toBe(200)
  })

  it('退避期间客户端断开则停止重试，且不摘号', async () => {
    const req = makeReq({ stream: false })
    const res = makeRes()
    axios.post.mockImplementation(async () => {
      // 真实的断线信号是 res 被销毁而响应尚未结束
      res.destroyed = true
      res.writable = false
      return {
        status: 503,
        headers: {},
        data: { error: { code: 'slow_down', message: OVERLOAD_MESSAGE } }
      }
    })

    await handleResponses(req, res)

    expect(axios.post).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(503)
    expect(res.jsonBody.error.code).toBe('server_error')
    noAccountPenalty()
  })
})

describe('预输出缓冲的边界', () => {
  it('keepalive 注释不算客户端输出，降载仍可重试', async () => {
    axios.post
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: sseStream([CREATED_BLOCK, ': ping\n\n', SHED_ERROR_BLOCK])
      })
      .mockResolvedValueOnce({ status: 200, headers: {}, data: successStream() })

    const res = makeRes()
    await handleResponses(makeReq(), res)

    expect(axios.post).toHaveBeenCalledTimes(2)
    expect(res.body()).not.toContain('server_is_overloaded')
    expect(res.body()).toContain('hello')
  })

  it('缓冲超时后放弃重试并下发 preamble，避免长时间对客户端沉默', async () => {
    jest.resetModules()
    jest.doMock('../config/config', () => ({
      requestTimeout: 1000,
      openaiCapacityShed: {
        maxAttempts: 3,
        maxDelayMs: 5,
        retryDelaysMs: [1, 1, 1],
        bufferLimitBytes: 65536,
        preOutputBufferMs: 20
      }
    }))
    const freshAxios = require('axios')
    const { handleResponses: freshHandle } = require('../src/routes/openaiRoutes')

    // preamble 之后长时间无事件：缓冲窗口到点应把 preamble 发出去
    const slow = new Readable({ read() {} })
    slow.push(CREATED_BLOCK)
    freshAxios.post.mockResolvedValue({ status: 200, headers: {}, data: slow })

    const res = makeRes()
    const pending = freshHandle(makeReq(), res)
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(res.body()).toContain('event: response.created')

    // 超时后到达的降载帧不再触发重试，只做错误码改写
    slow.push(SHED_ERROR_BLOCK)
    slow.push(null)
    await pending

    expect(freshAxios.post).toHaveBeenCalledTimes(1)
    expect(res.body()).not.toContain('server_is_overloaded')
    expect(res.body()).toContain('"code":"server_error"')

    jest.dontMock('../config/config')
    jest.resetModules()
  })
})
