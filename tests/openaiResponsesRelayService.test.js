jest.mock('axios', () => jest.fn())

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

jest.mock('../src/utils/headerFilter', () => ({
  filterForOpenAI: jest.fn((headers) => headers)
}))

jest.mock('../src/services/account/openaiResponsesAccountService', () => ({
  getAccount: jest.fn(),
  getMappedModel: jest.fn((mapping, requestedModel) => mapping?.[requestedModel] || requestedModel),
  updateAccount: jest.fn(),
  updateAccountUsage: jest.fn(),
  updateUsageQuota: jest.fn()
}))

jest.mock('../src/services/apiKeyService', () => ({
  recordUsageAttempt: jest.fn(),
  recordUsage: jest.fn(),
  updateUsageLifecycleRecord: jest.fn()
}))

jest.mock('../src/utils/costCalculator', () => ({
  calculateCost: jest.fn(() => ({ costs: { total: 0.01 } }))
}))

jest.mock('../src/services/scheduler/unifiedOpenAIScheduler', () => ({
  _deleteSessionMapping: jest.fn(),
  markAccountRateLimited: jest.fn()
}))

jest.mock('../src/utils/upstreamErrorHelper', () => ({
  buildSchedulingContext: jest.fn(() => null),
  buildErrorHistoryContext: jest.fn((baseContext, details) => ({
    ...(baseContext || {}),
    ...(details || {})
  })),
  markTempUnavailable: jest.fn(),
  sanitizeErrorForClient: jest.fn((errorData) => errorData),
  parseRetryAfter: jest.fn(() => null)
}))

jest.mock('../config/config', () => ({ requestTimeout: 1000 }), {
  virtual: true
})

const crypto = require('crypto')
const { EventEmitter } = require('events')
const { PassThrough } = require('stream')
const axios = require('axios')
const openaiResponsesRelayService = require('../src/services/relay/openaiResponsesRelayService')
const openaiResponsesAccountService = require('../src/services/account/openaiResponsesAccountService')
const apiKeyService = require('../src/services/apiKeyService')
const unifiedOpenAIScheduler = require('../src/services/scheduler/unifiedOpenAIScheduler')
const upstreamErrorHelper = require('../src/utils/upstreamErrorHelper')

function createReqRes(sessionId = 'session-123') {
  const req = {
    headers: {
      session_id: sessionId,
      'user-agent': 'jest'
    },
    body: {
      model: 'gpt-4.1-mini'
    },
    method: 'POST',
    path: '/v1/responses',
    once: jest.fn(),
    removeListener: jest.fn()
  }

  const res = {
    once: jest.fn(),
    removeListener: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  }

  return { req, res }
}

function createStreamingResponse() {
  const res = new EventEmitter()
  res.statusCode = 200
  res.writableEnded = false
  res.destroyed = false
  res.socket = { destroyed: false }
  res.setHeader = jest.fn()
  res.write = jest.fn(() => true)
  res.end = jest.fn(() => {
    res.writableEnded = true
  })
  return res
}

function createStreamingRequest(requestId) {
  return {
    headers: {},
    body: { model: 'gpt-4.1-mini', stream: true },
    method: 'POST',
    originalUrl: '/openai/responses',
    requestId,
    requestStartedAt: Date.now()
  }
}

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('openaiResponsesRelayService 路径和连接清理', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    openaiResponsesAccountService.getAccount.mockResolvedValue({
      id: 'resp-1',
      name: 'Responses 1',
      baseApi: 'https://api.openai.com',
      apiKey: 'test-key',
      providerEndpoint: 'responses',
      proxy: null,
      userAgent: null
    })
  })

  it('根 baseApi 转发裸 responses 路径时补 /v1', () => {
    expect(
      openaiResponsesRelayService._normalizeTargetPath('/responses', {
        baseApi: 'https://api.openai.com',
        providerEndpoint: 'responses'
      })
    ).toBe('/v1/responses')

    expect(
      openaiResponsesRelayService._normalizeTargetPath('/responses/compact', {
        baseApi: 'https://api.openai.com',
        providerEndpoint: 'responses'
      })
    ).toBe('/v1/responses/compact')

    expect(
      openaiResponsesRelayService._normalizeTargetPath('/v1/responses', {
        baseApi: 'https://api.openai.com/v1',
        providerEndpoint: 'responses'
      })
    ).toBe('/responses')
  })

  it('非流式成功响应结束前移除 close 监听，避免正常 close 误触发 abort', async () => {
    axios.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: { object: 'response', output_text: 'ok' },
      headers: {}
    })

    const { req, res } = createReqRes()

    await openaiResponsesRelayService.handleRequest(
      req,
      res,
      { id: 'resp-1', name: 'Responses 1', disableAutoProtection: false },
      { id: 'key-1' }
    )

    expect(res.removeListener).toHaveBeenCalledWith('close', expect.any(Function))
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ object: 'response', output_text: 'ok' })
  })

  it('按账户映射重定向上游模型且保留客户端请求模型', async () => {
    openaiResponsesAccountService.getAccount.mockResolvedValue({
      id: 'resp-1',
      name: 'Responses 1',
      baseApi: 'https://api.openai.com',
      apiKey: 'test-key',
      providerEndpoint: 'responses',
      supportedModels: { 'gpt-4.1-mini': 'gpt-5-mini' },
      proxy: null,
      userAgent: null
    })
    axios.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: { object: 'response', output_text: 'ok' },
      headers: {}
    })

    const { req, res } = createReqRes()

    await openaiResponsesRelayService.handleRequest(
      req,
      res,
      { id: 'resp-1', name: 'Responses 1', disableAutoProtection: false },
      { id: 'key-1' }
    )

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ model: 'gpt-5-mini' })
      })
    )
    expect(req.body.model).toBe('gpt-4.1-mini')
  })
})

describe('openaiResponsesRelayService 其他4xx软暂停', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    openaiResponsesAccountService.getAccount.mockResolvedValue({
      id: 'resp-1',
      name: 'Responses 1',
      baseApi: 'https://responses.example.com',
      apiKey: 'test-key',
      providerEndpoint: 'responses',
      proxy: null,
      userAgent: null
    })

    upstreamErrorHelper.markTempUnavailable.mockResolvedValue({ success: true })
    unifiedOpenAIScheduler._deleteSessionMapping.mockResolvedValue()
  })

  it('对普通403响应设置3分钟软暂停并清理粘性会话', async () => {
    axios.mockResolvedValue({
      status: 403,
      statusText: 'Forbidden',
      data: { error: { message: 'Forbidden' } },
      headers: {}
    })

    const { req, res } = createReqRes()

    await openaiResponsesRelayService.handleRequest(
      req,
      res,
      { id: 'resp-1', disableAutoProtection: false },
      {}
    )

    const sessionHash = crypto.createHash('sha256').update('session-123').digest('hex')

    expect(upstreamErrorHelper.markTempUnavailable).toHaveBeenCalledWith(
      'resp-1',
      'openai-responses',
      403,
      180,
      expect.objectContaining({ errorTypeOverride: 'client_error' })
    )
    expect(unifiedOpenAIScheduler._deleteSessionMapping).toHaveBeenCalledWith(sessionHash)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({
      error: {
        message: 'Account temporarily unavailable',
        type: 'server_error',
        code: 'account_unavailable'
      }
    })
  })

  it('对catch路径中的402响应也设置3分钟软暂停', async () => {
    axios.mockRejectedValue({
      code: 'ERR_BAD_REQUEST',
      response: {
        status: 402,
        statusText: 'Payment Required',
        data: { error: { message: 'Payment Required' } }
      }
    })

    const { req, res } = createReqRes('session-402')

    await openaiResponsesRelayService.handleRequest(
      req,
      res,
      { id: 'resp-1', disableAutoProtection: false },
      {}
    )

    const sessionHash = crypto.createHash('sha256').update('session-402').digest('hex')

    expect(upstreamErrorHelper.markTempUnavailable).toHaveBeenCalledWith(
      'resp-1',
      'openai-responses',
      402,
      180,
      expect.objectContaining({ errorTypeOverride: 'client_error' })
    )
    expect(unifiedOpenAIScheduler._deleteSessionMapping).toHaveBeenCalledWith(sessionHash)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({
      error: {
        message: 'Account temporarily unavailable',
        type: 'server_error',
        code: 'account_unavailable'
      }
    })
  })
})

describe('openaiResponsesRelayService 流式响应生命周期', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    apiKeyService.recordUsageAttempt.mockResolvedValue({ lifecycleRecordId: 'lifecycle-1' })
    apiKeyService.recordUsage.mockResolvedValue({ realCost: 0.01, ratedCost: 0.01 })
    apiKeyService.updateUsageLifecycleRecord.mockResolvedValue(true)
    openaiResponsesAccountService.updateAccountUsage.mockResolvedValue()
    openaiResponsesAccountService.updateUsageQuota.mockResolvedValue()
    unifiedOpenAIScheduler.markAccountRateLimited.mockResolvedValue()
  })

  it('response.completed 写入后 close 仍继续完成计费', async () => {
    const upstream = new PassThrough()
    const res = createStreamingResponse()
    const req = createStreamingRequest('request-1')
    let releaseRecordUsage
    apiKeyService.recordUsage.mockImplementation(
      () => new Promise((resolve) => (releaseRecordUsage = resolve))
    )

    await openaiResponsesRelayService._handleStreamResponse(
      { status: 200, headers: {}, data: upstream },
      res,
      { id: 'account-1', dailyQuota: 10 },
      { id: 'key-1' },
      'gpt-4.1-mini',
      jest.fn(),
      req
    )

    upstream.write(
      `data: ${JSON.stringify({
        type: 'response.completed',
        response: {
          model: 'gpt-4.1-mini',
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }
        }
      })}\n\n`
    )
    upstream.end()
    await flushAsyncWork()

    expect(apiKeyService.recordUsage).toHaveBeenCalled()
    expect(req._relayResponseTerminalForwarded).toBe(true)

    res.destroyed = true
    res.socket.destroyed = true
    res.emit('close')
    releaseRecordUsage({ realCost: 0.01, ratedCost: 0.01 })
    await flushAsyncWork()
    await flushAsyncWork()

    expect(openaiResponsesAccountService.updateAccountUsage).toHaveBeenCalledWith('account-1', 15)
    expect(openaiResponsesAccountService.updateUsageQuota).toHaveBeenCalledWith('account-1', 0.01)
    expect(apiKeyService.recordUsage.mock.invocationCallOrder[0]).toBeLessThan(
      openaiResponsesAccountService.updateAccountUsage.mock.invocationCallOrder[0]
    )
    expect(
      openaiResponsesAccountService.updateAccountUsage.mock.invocationCallOrder[0]
    ).toBeLessThan(openaiResponsesAccountService.updateUsageQuota.mock.invocationCallOrder[0])
  })

  it('终止事件写入前 close 不设置完成标记但仍记录 usage', async () => {
    const upstream = new PassThrough()
    const res = createStreamingResponse()
    const req = createStreamingRequest('request-2')

    await openaiResponsesRelayService._handleStreamResponse(
      { status: 200, headers: {}, data: upstream },
      res,
      { id: 'account-1', dailyQuota: 10 },
      { id: 'key-1' },
      'gpt-4.1-mini',
      jest.fn(),
      req
    )

    res.destroyed = true
    res.socket.destroyed = true
    res.emit('close')
    upstream.end(
      `data: ${JSON.stringify({
        type: 'response.completed',
        response: {
          usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 }
        }
      })}\n\n`
    )
    await flushAsyncWork()
    await flushAsyncWork()

    expect(req._relayResponseTerminalForwarded).not.toBe(true)
    expect(apiKeyService.recordUsage).toHaveBeenCalled()
    expect(openaiResponsesAccountService.updateAccountUsage).toHaveBeenCalledWith('account-1', 10)
    expect(openaiResponsesAccountService.updateUsageQuota).toHaveBeenCalledWith('account-1', 0.01)
  })

  it('response.failed 后的 DONE 不设置成功完成标记', async () => {
    const upstream = new PassThrough()
    const res = createStreamingResponse()
    const req = createStreamingRequest('request-3')

    await openaiResponsesRelayService._handleStreamResponse(
      { status: 200, headers: {}, data: upstream },
      res,
      { id: 'account-1', dailyQuota: 10 },
      { id: 'key-1' },
      'gpt-4.1-mini',
      jest.fn(),
      req
    )

    upstream.end(
      `data: ${JSON.stringify({
        type: 'response.failed',
        response: { status: 'failed', error: { message: 'upstream failed' } }
      })}\n\ndata: [DONE]\n\n`
    )
    await flushAsyncWork()
    await flushAsyncWork()

    expect(req._relayResponseTerminalForwarded).not.toBe(true)
  })
})
