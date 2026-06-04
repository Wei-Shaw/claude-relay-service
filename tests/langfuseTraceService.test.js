jest.mock('axios', () => ({
  post: jest.fn()
}))

jest.mock('../config/config', () => ({
  langfuse: {
    enabled: true,
    baseUrl: 'http://langfuse.local:3300/',
    publicKey: 'pk-test',
    secretKey: 'sk-test',
    timeoutMs: 1234,
    environment: 'test'
  }
}))

jest.mock('../src/utils/logger', () => ({
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  start: jest.fn()
}))

const axios = require('axios')
const langfuseTraceService = require('../src/services/langfuseTraceService')

describe('langfuseTraceService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    axios.post.mockResolvedValue({
      data: {
        successes: [{ id: 'req_1-trace-create', status: 201 }],
        errors: []
      }
    })
  })

  test('captures request detail as trace and generation with raw payloads', async () => {
    const result = await langfuseTraceService.captureRequestDetail({
      requestId: 'req_1',
      timestamp: '2026-06-04T07:00:00.000Z',
      requestStartedAt: '2026-06-04T07:00:00.000Z',
      responseCompletedAt: '2026-06-04T07:00:02.000Z',
      endpoint: '/api/v1/messages',
      method: 'POST',
      statusCode: 200,
      stream: true,
      apiKeyId: 'key_1',
      accountId: 'acct_1',
      accountType: 'claude-console',
      model: 'gpt-5.5',
      sessionHash: 'session_hash_1',
      metadataUserId: 'user_1',
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 3,
      cacheCreateTokens: 2,
      totalTokens: 20,
      cost: 0.123456,
      requestBody: {
        apiKey: 'raw-secret',
        messages: [{ role: 'user', content: 'hello' }]
      },
      responseBody: {
        id: 'resp_1',
        content: 'world'
      }
    })

    expect(result).toEqual({ captured: true, requestId: 'req_1' })
    expect(axios.post).toHaveBeenCalledWith(
      'http://langfuse.local:3300/api/public/ingestion',
      expect.objectContaining({
        batch: expect.arrayContaining([
          expect.objectContaining({ type: 'trace-create' }),
          expect.objectContaining({ type: 'generation-create' })
        ])
      }),
      expect.objectContaining({
        auth: {
          username: 'pk-test',
          password: 'sk-test'
        },
        timeout: 1234
      })
    )

    const payload = axios.post.mock.calls[0][1]
    const traceEvent = payload.batch.find((event) => event.type === 'trace-create')
    const generationEvent = payload.batch.find((event) => event.type === 'generation-create')

    expect(traceEvent.body).toEqual(
      expect.objectContaining({
        id: 'req_1',
        name: '/api/v1/messages',
        userId: 'user_1',
        sessionId: 'session_hash_1',
        input: expect.objectContaining({ apiKey: 'raw-secret' }),
        output: expect.objectContaining({ id: 'resp_1' }),
        tags: expect.arrayContaining(['crs', 'test', 'claude-console', 'gpt-5.5', 'stream'])
      })
    )
    expect(traceEvent.body.metadata.detail.requestBody.apiKey).toBe('raw-secret')
    expect(generationEvent.body).toEqual(
      expect.objectContaining({
        id: 'req_1-generation',
        traceId: 'req_1',
        model: 'gpt-5.5',
        usage: expect.objectContaining({
          input: 10,
          output: 5,
          total: 20,
          cacheReadTokens: 3,
          cacheCreateTokens: 2
        })
      })
    )
  })
})
