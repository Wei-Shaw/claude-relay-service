const crypto = require('crypto')

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

jest.mock('../src/utils/sseParser', () => ({
  IncrementalSSEParser: jest.fn().mockImplementation(() => ({
    feed: jest.fn(() => []),
    getRemaining: jest.fn(() => '')
  }))
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
const openaiResponsesAccountService = require('../src/services/account/openaiResponsesAccountService')
const openaiResponsesRelayService = require('../src/services/relay/openaiResponsesRelayService')
const openaiRoutes = require('../src/routes/openaiRoutes')
const { buildResponsesRequestFromAnthropic } = require('../src/services/anthropicToOpenaiResponses')

function createHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function createReq({
  path = '/v1/responses',
  body = {},
  userAgent = 'my-client/1.0',
  apiKeyOverrides = {},
  fromUnifiedEndpoint = false
} = {}) {
  return {
    method: 'POST',
    path,
    originalUrl: `/openai${path}`,
    headers: {
      'user-agent': userAgent
    },
    body: JSON.parse(JSON.stringify(body)),
    apiKey: {
      id: 'key_1',
      permissions: ['openai'],
      enableOpenAIResponsesCodexAdaptation: true,
      enableOpenAIResponsesPayloadRules: false,
      openaiResponsesPayloadRules: [],
      ...apiKeyOverrides
    },
    _fromUnifiedEndpoint: fromUnifiedEndpoint
  }
}

function createRes() {
  const res = {
    statusCode: 200,
    headers: {},
    destroyed: false,
    writableEnded: false,
    headersSent: false,
    status: jest.fn((code) => {
      res.statusCode = code
      return res
    }),
    json: jest.fn((payload) => {
      res.payload = payload
      return res
    }),
    setHeader: jest.fn((key, value) => {
      res.headers[key] = value
    }),
    set: jest.fn((key, value) => {
      res.headers[key] = value
      return res
    })
  }
  return res
}

describe('openai responses payload toggles', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    unifiedOpenAIScheduler.selectAccountForApiKey.mockResolvedValue({
      accountId: 'resp-1',
      accountType: 'openai-responses'
    })

    openaiResponsesAccountService.getAccount.mockResolvedValue({
      id: 'resp-1',
      name: 'Responses Account',
      apiKey: 'sk-responses'
    })

    openaiResponsesRelayService.handleRequest.mockResolvedValue({ ok: true })
    openaiAccountService.decrypt.mockReturnValue('decrypted-token')
  })

  test('keeps standard responses payload unchanged for openai-responses when both toggles are off', async () => {
    const req = createReq({
      body: {
        model: 'gpt-5-2025-08-07',
        temperature: 0.2,
        service_tier: 'priority',
        prompt_cache_key: 'session-a'
      },
      apiKeyOverrides: {
        enableOpenAIResponsesCodexAdaptation: false,
        enableOpenAIResponsesPayloadRules: false
      }
    })

    await openaiRoutes.handleResponses(req, createRes())

    expect(req.body).toEqual({
      model: 'gpt-5-2025-08-07',
      temperature: 0.2,
      service_tier: 'priority',
      prompt_cache_key: 'session-a'
    })
    expect(unifiedOpenAIScheduler.selectAccountForApiKey).toHaveBeenCalledWith(
      req.apiKey,
      createHash('session-a'),
      'gpt-5'
    )
  })

  test('applies Codex adaptation only when adaptation toggle is on', async () => {
    const req = createReq({
      body: {
        model: 'gpt-5-2025-08-07',
        temperature: 0.2,
        service_tier: 'priority',
        prompt_cache_key: 'session-b'
      }
    })

    await openaiRoutes.handleResponses(req, createRes())

    expect(req.body.model).toBe('gpt-5')
    expect(req.body.instructions).toBe(openaiRoutes.CODEX_CLI_INSTRUCTIONS)
    expect(req.body.temperature).toBeUndefined()
    expect(req.body.service_tier).toBeUndefined()
    expect(unifiedOpenAIScheduler.selectAccountForApiKey).toHaveBeenCalledWith(
      req.apiKey,
      createHash('session-b'),
      'gpt-5'
    )
  })

  test('applies payload rules directly on the original payload when adaptation is off', async () => {
    const req = createReq({
      body: {
        model: 'gpt-4.1',
        temperature: 0.5,
        prompt_cache_key: 'old-key',
        text: { format: {} }
      },
      apiKeyOverrides: {
        enableOpenAIResponsesCodexAdaptation: false,
        enableOpenAIResponsesPayloadRules: true,
        openaiResponsesPayloadRules: [
          { path: 'model', valueType: 'string', value: 'gpt-5' },
          { path: 'prompt_cache_key', valueType: 'string', value: 'new-key' },
          { path: 'text.format.type', valueType: 'string', value: 'json_schema' }
        ]
      }
    })

    await openaiRoutes.handleResponses(req, createRes())

    expect(req.body).toEqual({
      model: 'gpt-5',
      temperature: 0.5,
      prompt_cache_key: 'new-key',
      text: {
        format: {
          type: 'json_schema'
        }
      }
    })
    expect(req.body.instructions).toBeUndefined()
    expect(unifiedOpenAIScheduler.selectAccountForApiKey).toHaveBeenCalledWith(
      req.apiKey,
      createHash('new-key'),
      'gpt-5'
    )
  })

  test('applies payload rules after Codex adaptation when both toggles are on', async () => {
    const req = createReq({
      body: {
        model: 'gpt-5-2025-08-07',
        prompt_cache_key: 'legacy-key',
        temperature: 0.2,
        instructions: 'raw'
      },
      apiKeyOverrides: {
        enableOpenAIResponsesCodexAdaptation: true,
        enableOpenAIResponsesPayloadRules: true,
        openaiResponsesPayloadRules: [
          { path: 'model', valueType: 'string', value: 'gpt-5.5' },
          { path: 'instructions', valueType: 'string', value: 'custom instructions' },
          { path: 'prompt_cache_key', valueType: 'string', value: 'rule-key' }
        ]
      }
    })

    await openaiRoutes.handleResponses(req, createRes())

    expect(req.body.model).toBe('gpt-5.5')
    expect(req.body.instructions).toBe('custom instructions')
    expect(req.body.temperature).toBeUndefined()
    expect(unifiedOpenAIScheduler.selectAccountForApiKey).toHaveBeenCalledWith(
      req.apiKey,
      createHash('rule-key'),
      'gpt-5.5'
    )
  })

  test('normalizes dated gpt-5 models only for scheduling and upstream openai requests when adaptation is off', async () => {
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
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        model: 'gpt-5',
        usage: {
          input_tokens: 10,
          output_tokens: 4,
          total_tokens: 14
        }
      },
      headers: {}
    })

    const req = createReq({
      body: {
        model: 'gpt-5-2025-08-07',
        service_tier: 'priority',
        prompt_cache_key: 'compat-key',
        stream: false
      },
      apiKeyOverrides: {
        enableOpenAIResponsesCodexAdaptation: false,
        enableOpenAIResponsesPayloadRules: false
      }
    })

    await openaiRoutes.handleResponses(req, createRes())

    expect(unifiedOpenAIScheduler.selectAccountForApiKey).toHaveBeenCalledWith(
      req.apiKey,
      createHash('compat-key'),
      'gpt-5'
    )
    expect(req.body.model).toBe('gpt-5')
    expect(req.body.service_tier).toBe('priority')
    expect(axios.post).toHaveBeenCalled()
    expect(axios.post.mock.calls[0][1]).toMatchObject({
      model: 'gpt-5',
      service_tier: 'priority',
      store: false
    })
  })

  test('normalizes payload-rule gpt-5 aliases for openai scheduling without applying full Codex adaptation', async () => {
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
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        model: 'gpt-5',
        usage: {
          input_tokens: 8,
          output_tokens: 3,
          total_tokens: 11
        }
      },
      headers: {}
    })

    const req = createReq({
      body: {
        model: 'gpt-4.1',
        text: { format: {} },
        prompt_cache_key: 'rule-model-key',
        stream: false
      },
      apiKeyOverrides: {
        enableOpenAIResponsesCodexAdaptation: false,
        enableOpenAIResponsesPayloadRules: true,
        openaiResponsesPayloadRules: [
          { path: 'model', valueType: 'string', value: 'gpt-5-2025-08-07' }
        ]
      }
    })

    await openaiRoutes.handleResponses(req, createRes())

    expect(unifiedOpenAIScheduler.selectAccountForApiKey).toHaveBeenCalledWith(
      req.apiKey,
      createHash('rule-model-key'),
      'gpt-5'
    )
    expect(req.body.model).toBe('gpt-5')
    expect(req.body.text).toEqual({ format: {} })
    expect(req.body.instructions).toBeUndefined()
    expect(axios.post.mock.calls[0][1]).toMatchObject({
      model: 'gpt-5',
      text: { format: {} },
      store: false
    })
  })

  test('normalizes gpt-5.5-high to gpt-5.5 with reasoning effort for scheduling and upstream requests', async () => {
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
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        model: 'gpt-5.5',
        usage: {
          input_tokens: 9,
          output_tokens: 4,
          total_tokens: 13
        }
      },
      headers: {}
    })

    const req = createReq({
      body: {
        model: 'gpt-5.5-high',
        prompt_cache_key: 'gpt55-high-key',
        stream: false
      },
      apiKeyOverrides: {
        enableOpenAIResponsesCodexAdaptation: false,
        enableOpenAIResponsesPayloadRules: false
      }
    })

    await openaiRoutes.handleResponses(req, createRes())

    expect(unifiedOpenAIScheduler.selectAccountForApiKey).toHaveBeenCalledWith(
      req.apiKey,
      createHash('gpt55-high-key'),
      'gpt-5.5'
    )
    expect(req.body.model).toBe('gpt-5.5')
    expect(req.body.reasoning).toEqual({ effort: 'high' })
    expect(axios.post.mock.calls[0][1]).toMatchObject({
      model: 'gpt-5.5',
      reasoning: { effort: 'high' },
      store: false
    })
  })

  test('normalizes payload-rule gpt-5.5-xhigh aliases after rule application', async () => {
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
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        model: 'gpt-5.5',
        usage: {
          input_tokens: 8,
          output_tokens: 5,
          total_tokens: 13
        }
      },
      headers: {}
    })

    const req = createReq({
      body: {
        model: 'gpt-4.1',
        prompt_cache_key: 'gpt55-rule-key',
        stream: false
      },
      apiKeyOverrides: {
        enableOpenAIResponsesCodexAdaptation: false,
        enableOpenAIResponsesPayloadRules: true,
        openaiResponsesPayloadRules: [
          { path: 'model', valueType: 'string', value: 'gpt-5.5-xhigh' }
        ]
      }
    })

    await openaiRoutes.handleResponses(req, createRes())

    expect(unifiedOpenAIScheduler.selectAccountForApiKey).toHaveBeenCalledWith(
      req.apiKey,
      createHash('gpt55-rule-key'),
      'gpt-5.5'
    )
    expect(req.body.model).toBe('gpt-5.5')
    expect(req.body.reasoning).toEqual({ effort: 'xhigh' })
    expect(axios.post.mock.calls[0][1]).toMatchObject({
      model: 'gpt-5.5',
      reasoning: { effort: 'xhigh' },
      store: false
    })
  })

  test('builds anthropic bridge requests with gpt-5.5 alias and reasoning effort', () => {
    expect(
      buildResponsesRequestFromAnthropic({
        model: 'gpt-5.5-high',
        messages: [{ role: 'user', content: 'hello' }]
      })
    ).toMatchObject({
      model: 'gpt-5.5',
      reasoning: {
        effort: 'high',
        summary: 'auto'
      }
    })

    expect(
      buildResponsesRequestFromAnthropic({
        model: 'gpt-5.5-xhigh',
        messages: [{ role: 'user', content: 'hello' }],
        output_config: { effort: 'high' }
      })
    ).toMatchObject({
      model: 'gpt-5.5',
      reasoning: {
        effort: 'high',
        summary: 'auto'
      }
    })

    expect(
      buildResponsesRequestFromAnthropic({
        model: 'gpt-5.5-high',
        messages: [{ role: 'user', content: 'hello' }],
        reasoning: { effort: 'xhigh', summary: 'detailed' }
      })
    ).toMatchObject({
      model: 'gpt-5.5',
      reasoning: {
        effort: 'xhigh',
        summary: 'detailed'
      }
    })
  })

  test.each([
    ['gpt-5.6-sol-high', 'gpt-5.6-sol', 'high'],
    ['gpt-5.6-sol-xhigh', 'gpt-5.6-sol', 'xhigh'],
    ['gpt-5.6-terra-high', 'gpt-5.6-terra', 'high'],
    ['gpt-5.6-terra-xhigh', 'gpt-5.6-terra', 'xhigh'],
    ['gpt-5.6-luna-high', 'gpt-5.6-luna', 'high'],
    ['gpt-5.6-luna-xhigh', 'gpt-5.6-luna', 'xhigh']
  ])(
    'maps %s to %s with %s reasoning across responses and the anthropic bridge',
    async (alias, normalizedModel, effort) => {
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
      axios.post.mockResolvedValue({
        status: 200,
        data: {
          model: normalizedModel,
          usage: {
            input_tokens: 9,
            output_tokens: 4,
            total_tokens: 13
          }
        },
        headers: {}
      })

      const promptCacheKey = `${alias}-key`
      const req = createReq({
        body: {
          model: alias,
          prompt_cache_key: promptCacheKey,
          stream: false
        },
        apiKeyOverrides: {
          enableOpenAIResponsesCodexAdaptation: false,
          enableOpenAIResponsesPayloadRules: false
        }
      })

      await openaiRoutes.handleResponses(req, createRes())

      expect(unifiedOpenAIScheduler.selectAccountForApiKey).toHaveBeenCalledWith(
        req.apiKey,
        createHash(promptCacheKey),
        normalizedModel
      )
      expect(req.body.model).toBe(normalizedModel)
      expect(req.body.reasoning).toEqual({ effort })
      expect(axios.post.mock.calls[0][1]).toMatchObject({
        model: normalizedModel,
        reasoning: { effort },
        store: false
      })

      expect(
        buildResponsesRequestFromAnthropic({
          model: alias,
          messages: [{ role: 'user', content: 'hello' }]
        })
      ).toMatchObject({
        model: normalizedModel,
        reasoning: {
          effort,
          summary: 'auto'
        }
      })
    }
  )

  test('records the mutated service_tier for standard responses sent through openai accounts', async () => {
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
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        model: 'gpt-4.1',
        usage: {
          input_tokens: 12,
          output_tokens: 6,
          total_tokens: 18
        }
      },
      headers: {}
    })

    const req = createReq({
      body: {
        model: 'gpt-4.1',
        prompt_cache_key: 'tier-rule-key',
        stream: false
      },
      apiKeyOverrides: {
        enableOpenAIResponsesCodexAdaptation: false,
        enableOpenAIResponsesPayloadRules: true,
        openaiResponsesPayloadRules: [
          { path: 'service_tier', valueType: 'string', value: 'priority' }
        ]
      }
    })

    await openaiRoutes.handleResponses(req, createRes())

    expect(req._serviceTier).toBe('priority')
    expect(apiKeyService.recordUsage).toHaveBeenCalled()
    expect(apiKeyService.recordUsage.mock.calls[0][8]).toBe('priority')
  })

  test('records null service_tier after Codex adaptation removes it for openai accounts', async () => {
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
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        model: 'gpt-5',
        usage: {
          input_tokens: 10,
          output_tokens: 4,
          total_tokens: 14
        }
      },
      headers: {}
    })

    const req = createReq({
      body: {
        model: 'gpt-5-2025-08-07',
        temperature: 0.2,
        service_tier: 'priority',
        prompt_cache_key: 'adapt-tier-key',
        stream: false
      }
    })

    await openaiRoutes.handleResponses(req, createRes())

    expect(req.body.service_tier).toBeUndefined()
    expect(req._serviceTier).toBeNull()
    expect(apiKeyService.recordUsage).toHaveBeenCalled()
    expect(apiKeyService.recordUsage.mock.calls[0][8]).toBeNull()
  })

  test('captures the post-rule service_tier before relaying openai-responses requests', async () => {
    const req = createReq({
      body: {
        model: 'gpt-4.1',
        prompt_cache_key: 'relay-tier-key'
      },
      apiKeyOverrides: {
        enableOpenAIResponsesCodexAdaptation: false,
        enableOpenAIResponsesPayloadRules: true,
        openaiResponsesPayloadRules: [
          { path: 'service_tier', valueType: 'string', value: 'priority' }
        ]
      }
    })

    await openaiRoutes.handleResponses(req, createRes())

    expect(req._serviceTier).toBe('priority')
    expect(openaiResponsesRelayService.handleRequest).toHaveBeenCalled()
    expect(openaiResponsesRelayService.handleRequest.mock.calls[0][0]._serviceTier).toBe('priority')
  })

  test('does not apply the new rule flow to compact responses routes', async () => {
    const req = createReq({
      path: '/v1/responses/compact',
      body: {
        model: 'o1-mini',
        prompt_cache_key: 'compact-key',
        temperature: 0.1
      },
      apiKeyOverrides: {
        enableOpenAIResponsesCodexAdaptation: false,
        enableOpenAIResponsesPayloadRules: true,
        openaiResponsesPayloadRules: [
          { path: 'model', valueType: 'string', value: 'gpt-5' },
          { path: 'prompt_cache_key', valueType: 'string', value: 'rule-key' }
        ]
      }
    })

    await openaiRoutes.handleResponses(req, createRes())

    expect(req.body.model).toBe('o1-mini')
    expect(req.body.prompt_cache_key).toBe('compact-key')
    expect(req.body.instructions).toBe(openaiRoutes.CODEX_CLI_INSTRUCTIONS)
  })
})
