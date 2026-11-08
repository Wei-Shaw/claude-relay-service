const { EventEmitter } = require('events')
const { PassThrough } = require('stream')

const mockRouter = {
  get: jest.fn(),
  post: jest.fn()
}

jest.mock(
  'express',
  () => ({
    Router: () => mockRouter
  }),
  { virtual: true }
)

jest.mock(
  '../config/config',
  () => ({
    requestTimeout: 1000
  }),
  { virtual: true }
)

jest.mock('../src/middleware/auth', () => ({
  authenticateApiKey: jest.fn((_req, _res, next) => next())
}))

jest.mock('axios', () => ({
  post: jest.fn()
}))

jest.mock('../src/services/scheduler/unifiedOpenAIScheduler', () => ({
  selectAccountForApiKey: jest.fn(),
  markAccountRateLimited: jest.fn(),
  isAccountRateLimited: jest.fn().mockResolvedValue(false),
  removeAccountRateLimit: jest.fn(),
  markAccountUnauthorized: jest.fn()
}))

jest.mock('../src/services/account/openaiAccountService', () => ({
  getAccount: jest.fn(),
  decrypt: jest.fn(),
  isTokenExpired: jest.fn(() => false),
  refreshAccountToken: jest.fn(),
  updateCodexUsageSnapshot: jest.fn()
}))

jest.mock('../src/services/account/openaiResponsesAccountService', () => ({
  getAccount: jest.fn()
}))

jest.mock('../src/services/relay/openaiResponsesRelayService', () => ({
  handleRequest: jest.fn()
}))

jest.mock('../src/services/apiKeyService', () => ({
  hasPermission: jest.fn(() => true),
  recordUsage: jest.fn()
}))

jest.mock('../src/models/redis', () => ({
  getUsageStats: jest.fn()
}))

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  api: jest.fn(),
  security: jest.fn()
}))

jest.mock('../src/utils/proxyHelper', () => ({
  createProxyAgent: jest.fn(() => null),
  getProxyDescription: jest.fn(() => 'none')
}))

jest.mock('../src/utils/rateLimitHelper', () => ({
  updateRateLimitCounters: jest.fn()
}))

jest.mock('../src/utils/errorSanitizer', () => ({
  getSafeMessage: jest.fn((error) => error?.message || 'error')
}))

jest.mock('../src/utils/requestDetailHelper', () => ({
  createRequestDetailMeta: jest.fn(() => null),
  extractOpenAICacheReadTokens: jest.fn(() => 0)
}))

const unifiedOpenAIScheduler = require('../src/services/scheduler/unifiedOpenAIScheduler')
const axios = require('axios')
const apiKeyService = require('../src/services/apiKeyService')
const openaiAccountService = require('../src/services/account/openaiAccountService')
const logger = require('../src/utils/logger')
const openaiRoutes = require('../src/routes/openaiRoutes')

function sseEvent(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function createReq() {
  const req = new EventEmitter()
  Object.assign(req, {
    method: 'POST',
    path: '/v1/responses',
    originalUrl: '/openai/v1/responses',
    aborted: false,
    headers: {
      'user-agent': 'test-client/1.0'
    },
    body: {
      model: 'gpt-5',
      stream: true,
      input: 'generate a long response'
    },
    apiKey: {
      id: 'key_1',
      permissions: ['openai'],
      enableOpenAIResponsesCodexAdaptation: false,
      enableOpenAIResponsesPayloadRules: false,
      openaiResponsesPayloadRules: []
    }
  })
  return req
}

function createRes() {
  const res = new EventEmitter()
  Object.assign(res, {
    statusCode: 200,
    headers: {},
    destroyed: false,
    writableEnded: false,
    headersSent: false,
    chunks: [],
    payload: null,
    status: jest.fn(function status(code) {
      this.statusCode = code
      this.headersSent = true
      return this
    }),
    json: jest.fn(function json(payload) {
      this.payload = payload
      this.headersSent = true
      return this
    }),
    setHeader(key, value) {
      this.headers[key] = value
    },
    set(key, value) {
      this.headers[key] = value
      return this
    },
    write(chunk) {
      this.chunks.push(chunk)
      this.headersSent = true
      return true
    },
    end() {
      this.writableEnded = true
    },
    flushHeaders() {
      this.headersSent = true
    }
  })
  return res
}

function createUpstreamStream() {
  const stream = new PassThrough()
  return {
    stream,
    destroySpy: jest.spyOn(stream, 'destroy')
  }
}

async function flushAsync(times = 8) {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve))
  }
}

function completedUsageEvent() {
  return {
    type: 'response.completed',
    response: {
      model: 'gpt-5',
      usage: {
        input_tokens: 12,
        output_tokens: 13000,
        total_tokens: 13012
      }
    }
  }
}

describe('openai oauth responses client disconnect', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    unifiedOpenAIScheduler.selectAccountForApiKey.mockResolvedValue({
      accountId: 'openai-1',
      accountType: 'openai'
    })
    openaiAccountService.getAccount.mockResolvedValue({
      id: 'openai-1',
      name: 'OpenAI Account',
      accessToken: 'encrypted-token',
      accountId: 'chatgpt-account-1'
    })
    openaiAccountService.decrypt.mockReturnValue('decrypted-token')
    apiKeyService.recordUsage.mockResolvedValue({})
  })

  test('aborts the axios request when the downstream response closes mid-stream', async () => {
    const { stream } = createUpstreamStream()
    axios.post.mockResolvedValue({
      status: 200,
      data: stream,
      headers: {}
    })

    const req = createReq()
    const res = createRes()

    await openaiRoutes.handleResponses(req, res)

    expect(axios.post).toHaveBeenCalled()
    const axiosConfig = axios.post.mock.calls[0][2]
    expect(axiosConfig.signal).toBeDefined()
    expect(typeof axiosConfig.signal.addEventListener).toBe('function')
    expect(axiosConfig.signal.aborted).toBe(false)

    stream.write(sseEvent({ type: 'response.created', response: { id: 'resp_1' } }))
    res.emit('close')

    expect(axiosConfig.signal.aborted).toBe(true)
  })

  test('destroys the upstream stream when the downstream client disconnects', async () => {
    const { stream, destroySpy } = createUpstreamStream()
    axios.post.mockResolvedValue({
      status: 200,
      data: stream,
      headers: {}
    })

    const req = createReq()
    const res = createRes()
    await openaiRoutes.handleResponses(req, res)

    stream.write(sseEvent({ type: 'response.output_text.delta', delta: 'hello' }))
    res.emit('close')

    expect(destroySpy).toHaveBeenCalled()
  })

  test('does not record completed usage after the client disconnects', async () => {
    const { stream } = createUpstreamStream()
    axios.post.mockResolvedValue({
      status: 200,
      data: stream,
      headers: {}
    })

    const req = createReq()
    const res = createRes()
    await openaiRoutes.handleResponses(req, res)

    stream.write(sseEvent({ type: 'response.output_text.delta', delta: 'partial' }))
    res.emit('close')

    stream.emit('data', Buffer.from(sseEvent(completedUsageEvent())))
    stream.emit('end')
    await flushAsync()

    expect(apiKeyService.recordUsage).not.toHaveBeenCalled()
    expect(unifiedOpenAIScheduler.removeAccountRateLimit).not.toHaveBeenCalled()
  })

  test('cancelling one streaming request does not abort a concurrent request', async () => {
    const first = createUpstreamStream()
    const second = createUpstreamStream()
    const signals = []

    axios.post.mockImplementationOnce(async (_url, _body, config) => {
      signals.push(config.signal)
      return { status: 200, data: first.stream, headers: {} }
    })
    axios.post.mockImplementationOnce(async (_url, _body, config) => {
      signals.push(config.signal)
      return { status: 200, data: second.stream, headers: {} }
    })

    const firstReq = createReq()
    const firstRes = createRes()
    const secondReq = createReq()
    const secondRes = createRes()

    await openaiRoutes.handleResponses(firstReq, firstRes)
    await openaiRoutes.handleResponses(secondReq, secondRes)

    first.stream.write(sseEvent({ type: 'response.output_text.delta', delta: 'one' }))
    second.stream.write(sseEvent({ type: 'response.output_text.delta', delta: 'two' }))

    firstRes.emit('close')

    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
    expect(first.destroySpy).toHaveBeenCalled()
    expect(second.destroySpy).not.toHaveBeenCalled()

    second.stream.write(sseEvent(completedUsageEvent()))
    second.stream.end()
    await flushAsync()

    expect(apiKeyService.recordUsage).toHaveBeenCalledTimes(1)
  })

  test('treats axios cancellation from a client disconnect as expected, not an account failure', async () => {
    axios.post.mockImplementation(
      (_url, _body, config) =>
        new Promise((_resolve, reject) => {
          const abort = () => {
            const err = new Error('canceled')
            err.name = 'CanceledError'
            err.code = 'ERR_CANCELED'
            reject(err)
          }
          if (config.signal?.aborted) {
            abort()
            return
          }
          config.signal?.addEventListener?.('abort', abort)
        })
    )

    const req = createReq()
    const res = createRes()
    const pending = openaiRoutes.handleResponses(req, res)
    await flushAsync()

    res.emit('close')

    await Promise.race([
      pending,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('handleResponses hung after client disconnect')), 1000)
      })
    ])

    expect(res.json).not.toHaveBeenCalled()
    expect(unifiedOpenAIScheduler.markAccountUnauthorized).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalledWith(
      'Proxy to ChatGPT codex/responses failed:',
      expect.anything()
    )
  })
})
