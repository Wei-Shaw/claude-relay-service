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
  updateAccount: jest.fn()
}))

jest.mock('../src/services/apiKeyService', () => ({}))

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
const axios = require('axios')
const openaiResponsesRelayService = require('../src/services/relay/openaiResponsesRelayService')
const openaiResponsesAccountService = require('../src/services/account/openaiResponsesAccountService')
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
