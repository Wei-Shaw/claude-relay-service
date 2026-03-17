const express = require('express')
const request = require('supertest')
const { PassThrough } = require('stream')

jest.mock('axios', () => ({
  post: jest.fn()
}))

jest.mock(
  '../config/config',
  () => ({
    requestTimeout: 600000
  }),
  { virtual: true }
)

jest.mock('../src/middleware/auth', () => ({
  authenticateApiKey: (req, _res, next) => {
    req.apiKey = {
      id: 'key-1',
      name: 'Test Key',
      permissions: ['openai']
    }
    next()
  }
}))

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  api: jest.fn(),
  security: jest.fn()
}))

jest.mock('../src/models/redis', () => ({}))

jest.mock('../src/utils/proxyHelper', () => ({
  createProxyAgent: jest.fn(() => null),
  getProxyDescription: jest.fn(() => 'no-proxy')
}))

jest.mock('../src/services/scheduler/unifiedOpenAIScheduler', () => ({
  selectAccountForApiKey: jest.fn(),
  markAccountRateLimited: jest.fn(),
  markAccountUnauthorized: jest.fn(),
  isAccountRateLimited: jest.fn(async () => false),
  removeAccountRateLimit: jest.fn()
}))

jest.mock('../src/services/account/openaiAccountService', () => ({
  getAccount: jest.fn(),
  isTokenExpired: jest.fn(() => false),
  decrypt: jest.fn(() => 'decrypted-access-token'),
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
  recordUsage: jest.fn(async () => ({ totalTokens: 5, totalCost: 0.123 }))
}))

jest.mock('../src/utils/rateLimitHelper', () => ({
  updateRateLimitCounters: jest.fn(async () => ({ totalTokens: 0, totalCost: 0 }))
}))

const axios = require('axios')
const unifiedOpenAIScheduler = require('../src/services/scheduler/unifiedOpenAIScheduler')
const openaiAccountService = require('../src/services/account/openaiAccountService')
const openaiRoutes = require('../src/routes/openaiRoutes')

const buildApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/openai', openaiRoutes)
  return app
}

describe('openaiRoutes non-stream adapter for Codex upstream', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    unifiedOpenAIScheduler.selectAccountForApiKey.mockResolvedValue({
      accountId: 'acc-1',
      accountType: 'openai'
    })

    openaiAccountService.getAccount.mockResolvedValue({
      id: 'acc-1',
      name: 'OpenAI Account',
      accessToken: 'encrypted-token',
      accountId: 'chatgpt-account-1',
      proxy: null
    })
  })

  it('forces SSE upstream and aggregates it back into JSON for stream=false', async () => {
    const upstream = new PassThrough()
    axios.post.mockResolvedValue({
      status: 200,
      data: upstream,
      headers: {
        'x-request-id': 'req-123'
      }
    })

    process.nextTick(() => {
      upstream.write(
        `data: ${JSON.stringify({
          type: 'response.created',
          response: {
            id: 'resp_1',
            object: 'response',
            created_at: 1710000000,
            model: 'gpt-5.4',
            status: 'in_progress'
          }
        })}\n\n`
      )
      upstream.end(
        `data: ${JSON.stringify({
          type: 'response.completed',
          response: {
            id: 'resp_1',
            object: 'response',
            created_at: 1710000000,
            model: 'gpt-5.4',
            status: 'completed',
            output: [
              {
                type: 'message',
                content: [{ type: 'output_text', text: 'hello json' }]
              }
            ],
            usage: {
              input_tokens: 2,
              output_tokens: 3,
              total_tokens: 5
            }
          }
        })}\n\n`
      )
    })

    const app = buildApp()
    const response = await request(app).post('/openai/v1/responses').send({
      model: 'gpt-5.4',
      input: 'hello',
      stream: false
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      object: 'response',
      model: 'gpt-5.4',
      status: 'completed'
    })
    expect(response.body.output[0].content[0].text).toBe('hello json')
    expect(axios.post).toHaveBeenCalledWith(
      'https://chatgpt.com/backend-api/codex/responses',
      expect.objectContaining({
        stream: true
      }),
      expect.objectContaining({
        responseType: 'stream',
        headers: expect.objectContaining({
          accept: 'text/event-stream'
        })
      })
    )
  })
})
