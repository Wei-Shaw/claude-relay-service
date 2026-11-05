// openai-responses 中继路径上的容量降载回归。
//
// 这条链路原先有个更严重的副作用：任何 >= 500 的上游响应都会调用
// markTempUnavailable 把账号临时摘掉。容量降载常以 503 出现，于是一个被降载的
// 请求会顺着 failover 把整池账号逐个封禁，而每个账号都会以同一个错误失败。

const { EventEmitter } = require('events')
const { Readable } = require('stream')

jest.mock('axios', () => jest.fn())
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  api: jest.fn()
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
jest.mock('../src/utils/proxyHelper', () => ({
  createProxyAgent: () => null,
  getProxyDescription: () => 'none'
}))
jest.mock('../src/utils/headerFilter', () => ({ filterForOpenAI: () => ({}) }))
jest.mock('../src/utils/requestDetailHelper', () => ({
  createRequestDetailMeta: () => ({}),
  extractOpenAICacheReadTokens: () => 0
}))
jest.mock('../src/utils/upstreamErrorHelper', () => ({
  markTempUnavailable: jest.fn(async () => {}),
  parseRetryAfter: () => null,
  sanitizeErrorForClient: (data) => data
}))
jest.mock('../src/services/apiKeyService', () => ({ recordUsage: jest.fn(async () => ({})) }))
jest.mock('../src/services/scheduler/unifiedOpenAIScheduler', () => ({
  markAccountRateLimited: jest.fn(async () => {}),
  _deleteSessionMapping: jest.fn(async () => {})
}))
jest.mock('../src/services/account/openaiResponsesAccountService', () => ({
  getAccount: jest.fn(async () => ({
    id: 'resp-1',
    name: 'resp',
    apiKey: 'sk-test',
    baseApi: 'https://upstream.example.com/v1'
  })),
  updateAccount: jest.fn(async () => {}),
  updateAccountUsage: jest.fn(async () => {}),
  updateUsageQuota: jest.fn(async () => {})
}))

const axios = require('axios')
const upstreamErrorHelper = require('../src/utils/upstreamErrorHelper')
const relay = require('../src/services/relay/openaiResponsesRelayService')

const OVERLOAD_MESSAGE = 'Our servers are currently overloaded. Please try again later.'
const ACCOUNT = { id: 'resp-1', name: 'resp' }
const API_KEY = { id: 'key-1' }

function sseBlock(eventType, payload) {
  return `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`
}

function makeReq({ stream = false } = {}) {
  const req = new EventEmitter()
  req.method = 'POST'
  req.path = '/v1/responses'
  req.headers = {}
  req.body = { model: 'gpt-5', stream }
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
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.setHeader = (k, v) => {
    res.headers[k] = v
    return res
  }
  res.write = (chunk) => {
    res.headersSent = true
    res.chunks.push(chunk.toString())
    return true
  }
  res.json = (body) => {
    res.headersSent = true
    res.jsonBody = body
    return res
  }
  res.end = () => res
  res.body = () => res.chunks.join('')
  return res
}

beforeEach(() => jest.clearAllMocks())

describe('openai-responses 中继降载', () => {
  it('503 降载后重试成功，且不摘号', async () => {
    axios
      .mockResolvedValueOnce({
        status: 503,
        headers: {},
        data: { error: { code: 'server_is_overloaded', message: OVERLOAD_MESSAGE } }
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: { model: 'gpt-5', usage: { input_tokens: 4, output_tokens: 2 } }
      })

    const res = makeRes()
    await relay.handleRequest(makeReq(), res, ACCOUNT, API_KEY)

    expect(axios).toHaveBeenCalledTimes(2)
    expect(res.statusCode).toBe(200)
    expect(upstreamErrorHelper.markTempUnavailable).not.toHaveBeenCalled()
  })

  it('重试用尽返回 503 + server_error，仍然不摘号', async () => {
    axios.mockResolvedValue({
      status: 503,
      headers: {},
      data: { error: { code: 'server_is_overloaded', message: OVERLOAD_MESSAGE } }
    })

    const res = makeRes()
    await relay.handleRequest(makeReq(), res, ACCOUNT, API_KEY)

    expect(axios).toHaveBeenCalledTimes(3)
    expect(res.statusCode).toBe(503)
    expect(res.jsonBody.error.code).toBe('server_error')
    expect(res.jsonBody.error.message).toBe(OVERLOAD_MESSAGE)
    expect(upstreamErrorHelper.markTempUnavailable).not.toHaveBeenCalled()
  })

  it('普通 500 仍按原逻辑临时摘号', async () => {
    axios.mockResolvedValue({
      status: 500,
      headers: {},
      data: { error: { message: 'boom' } }
    })

    const res = makeRes()
    await relay.handleRequest(makeReq(), res, ACCOUNT, API_KEY)

    expect(axios).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(500)
    expect(upstreamErrorHelper.markTempUnavailable).toHaveBeenCalledWith(
      'resp-1',
      'openai-responses',
      500
    )
  })

  it('流内降载先重试，客户端看不到 server_is_overloaded', async () => {
    const shedStream = () =>
      Readable.from([
        [
          sseBlock('response.created', { type: 'response.created', response: { id: 'r' } }),
          sseBlock('error', {
            type: 'error',
            error: { code: 'server_is_overloaded', message: OVERLOAD_MESSAGE }
          })
        ].join('')
      ])
    const okStream = () =>
      Readable.from([
        [
          sseBlock('response.created', { type: 'response.created', response: { id: 'r' } }),
          sseBlock('response.output_text.delta', {
            type: 'response.output_text.delta',
            delta: 'hi'
          }),
          'data: [DONE]\n\n'
        ].join('')
      ])

    axios
      .mockResolvedValueOnce({ status: 200, headers: {}, data: shedStream() })
      .mockResolvedValueOnce({ status: 200, headers: {}, data: okStream() })

    const res = makeRes()
    await relay.handleRequest(makeReq({ stream: true }), res, ACCOUNT, API_KEY)

    expect(axios).toHaveBeenCalledTimes(2)
    expect(res.body()).not.toContain('server_is_overloaded')
    expect(res.body()).toContain('hi')
    expect(upstreamErrorHelper.markTempUnavailable).not.toHaveBeenCalled()
  })

  it('流内降载重试用尽时改写错误码转发', async () => {
    axios.mockImplementation(async () => ({
      status: 200,
      headers: {},
      data: Readable.from([
        [
          sseBlock('response.created', { type: 'response.created', response: { id: 'r' } }),
          sseBlock('response.failed', {
            type: 'response.failed',
            response: { error: { code: 'slow_down', message: OVERLOAD_MESSAGE } }
          })
        ].join('')
      ])
    }))

    const res = makeRes()
    await relay.handleRequest(makeReq({ stream: true }), res, ACCOUNT, API_KEY)

    expect(axios).toHaveBeenCalledTimes(3)
    expect(res.body()).not.toContain('slow_down')
    expect(res.body()).toContain('"code":"server_error"')
    expect(res.body()).toContain(OVERLOAD_MESSAGE)
    expect(upstreamErrorHelper.markTempUnavailable).not.toHaveBeenCalled()
  })
})
