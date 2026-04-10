jest.mock('axios', () => jest.fn())

jest.mock('../config/config', () => ({ requestTimeout: 12345 }), {
  virtual: true
})

jest.mock('../src/utils/headerFilter', () => ({
  filterForOpenAI: jest.fn(() => ({}))
}))

jest.mock('../src/utils/proxyHelper', () => ({
  createProxyAgent: jest.fn(() => null),
  getProxyDescription: jest.fn(() => 'no-proxy')
}))

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

jest.mock('../src/services/account/openaiResponsesAccountService', () => ({
  getAccount: jest.fn(),
  updateAccount: jest.fn(),
  updateAccountUsage: jest.fn(),
  updateUsageQuota: jest.fn()
}))

jest.mock('../src/services/apiKeyService', () => ({
  recordUsage: jest.fn()
}))

jest.mock('../src/services/scheduler/unifiedOpenAIScheduler', () => ({
  markAccountRateLimited: jest.fn(),
  _deleteSessionMapping: jest.fn()
}))

jest.mock('../src/utils/upstreamErrorHelper', () => ({
  markTempUnavailable: jest.fn().mockResolvedValue(undefined),
  parseRetryAfter: jest.fn(() => null),
  sanitizeErrorForClient: jest.fn((data) => data)
}))

const axios = require('axios')
const openaiResponsesAccountService = require('../src/services/account/openaiResponsesAccountService')
const apiKeyService = require('../src/services/apiKeyService')
const openaiResponsesRelayService = require('../src/services/relay/openaiResponsesRelayService')

const createRes = () => ({
  statusCode: 200,
  headersSent: false,
  destroyed: false,
  once: jest.fn(),
  removeListener: jest.fn(),
  setHeader: jest.fn(),
  end: jest.fn(),
  status: jest.fn(function (code) {
    this.statusCode = code
    return this
  }),
  json: jest.fn(function (data) {
    this.body = data
    return this
  })
})

describe('openaiResponsesRelayService non-stream handling', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('passes serviceTier into the non-stream helper from handleRequest', async () => {
    openaiResponsesAccountService.getAccount.mockResolvedValue({
      id: 'acc-1',
      name: 'Responses Account',
      baseApi: 'https://responses.example.com',
      apiKey: 'upstream-key',
      providerEndpoint: 'responses',
      dailyQuota: '0'
    })
    openaiResponsesAccountService.updateAccount.mockResolvedValue(undefined)
    axios.mockResolvedValue({
      status: 200,
      data: {
        object: 'response'
      },
      headers: {}
    })

    const spy = jest
      .spyOn(openaiResponsesRelayService, '_handleNormalResponse')
      .mockResolvedValue(undefined)

    const req = {
      method: 'POST',
      path: '/v1/responses',
      headers: {
        'user-agent': 'jest-client/1.0'
      },
      body: {
        model: 'gpt-5',
        stream: false
      },
      _serviceTier: 'priority',
      once: jest.fn(),
      removeListener: jest.fn()
    }
    const res = createRes()
    const account = {
      id: 'acc-1',
      name: 'Responses Account'
    }
    const apiKeyData = {
      id: 'key-1'
    }

    await openaiResponsesRelayService.handleRequest(req, res, account, apiKeyData)

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200 }),
      res,
      account,
      apiKeyData,
      'gpt-5',
      'priority'
    )

    spy.mockRestore()
  })

  it('handles non-stream success without req context and preserves raw JSON response', async () => {
    apiKeyService.recordUsage.mockResolvedValue(undefined)
    openaiResponsesAccountService.updateAccountUsage.mockResolvedValue(undefined)

    const response = {
      status: 200,
      data: {
        object: 'response',
        model: 'gpt-5',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'hello' }]
          }
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 4,
          total_tokens: 14
        }
      }
    }
    const res = createRes()
    const account = {
      id: 'acc-2',
      dailyQuota: '0'
    }
    const apiKeyData = {
      id: 'key-2'
    }

    await expect(
      openaiResponsesRelayService._handleNormalResponse(
        response,
        res,
        account,
        apiKeyData,
        'gpt-5',
        'flex'
      )
    ).resolves.toBeUndefined()

    expect(apiKeyService.recordUsage).toHaveBeenCalledWith(
      'key-2',
      10,
      4,
      0,
      0,
      'gpt-5',
      'acc-2',
      'openai-responses',
      'flex'
    )
    expect(openaiResponsesAccountService.updateAccountUsage).toHaveBeenCalledWith('acc-2', 14)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(response.data)
  })
})
