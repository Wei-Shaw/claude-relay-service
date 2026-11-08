jest.mock('axios', () => ({
  post: jest.fn()
}))

jest.mock('../config/config', () => ({ requestTimeout: 1000 }), {
  virtual: true
})

jest.mock('../src/middleware/auth', () => ({
  authenticateApiKey: jest.fn((_req, _res, next) => next())
}))

jest.mock('../src/services/scheduler/unifiedOpenAIScheduler', () => ({
  selectAccountForApiKey: jest.fn(),
  markAccountRateLimited: jest.fn(),
  isAccountRateLimited: jest.fn(),
  removeAccountRateLimit: jest.fn(),
  markAccountUnauthorized: jest.fn()
}))

jest.mock('../src/services/account/openaiAccountService', () => ({
  getAccount: jest.fn(),
  decrypt: jest.fn(),
  isTokenExpired: jest.fn(),
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
  hasPermission: jest.fn()
}))

jest.mock('../src/services/modelService', () => ({
  getModelsByProvider: jest.fn()
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

jest.mock('../src/services/requestBodyRuleService', () => ({
  applyRules: jest.fn((body) => body)
}))

jest.mock('../src/utils/connectionErrorHelper', () => ({
  attachResponseErrorHandler: jest.fn(),
  safeEndResponse: jest.fn(),
  safeWriteToResponse: jest.fn()
}))

const apiKeyService = require('../src/services/apiKeyService')
const modelService = require('../src/services/modelService')
const openaiRoutes = require('../src/routes/openaiRoutes')
const { CLIENT_IDS, isPathAllowedForClient } = require('../src/validators/clientDefinitions')

function createRes() {
  const res = {
    statusCode: 200,
    status: jest.fn((code) => {
      res.statusCode = code
      return res
    }),
    json: jest.fn((payload) => {
      res.body = payload
      return res
    })
  }
  return res
}

describe('OpenAI models route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    apiKeyService.hasPermission.mockReturnValue(true)
    modelService.getModelsByProvider.mockReturnValue([
      {
        id: 'gpt-5',
        object: 'model',
        created: 123,
        owned_by: 'openai'
      },
      {
        id: 'gpt-5.1-codex',
        object: 'model',
        created: 123,
        owned_by: 'openai'
      }
    ])
  })

  test('returns OpenAI-compatible model list', async () => {
    const res = createRes()

    await openaiRoutes.handleGetModels({ apiKey: { permissions: ['openai'] } }, res)

    expect(apiKeyService.hasPermission).toHaveBeenCalledWith(['openai'], 'openai')
    expect(modelService.getModelsByProvider).toHaveBeenCalledWith('openai')
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({
      object: 'list',
      data: [
        {
          id: 'gpt-5',
          object: 'model',
          created: 123,
          owned_by: 'openai'
        },
        {
          id: 'gpt-5.1-codex',
          object: 'model',
          created: 123,
          owned_by: 'openai'
        }
      ]
    })
  })

  test('filters restricted models', async () => {
    const res = createRes()

    await openaiRoutes.handleGetModels(
      {
        apiKey: {
          permissions: ['openai'],
          enableModelRestriction: true,
          restrictedModels: ['gpt-5.1*']
        }
      },
      res
    )

    expect(res.json).toHaveBeenCalledWith({
      object: 'list',
      data: [
        {
          id: 'gpt-5',
          object: 'model',
          created: 123,
          owned_by: 'openai'
        }
      ]
    })
  })

  test('rejects API keys without OpenAI permission', async () => {
    apiKeyService.hasPermission.mockReturnValue(false)
    const res = createRes()

    await openaiRoutes.handleGetModels({ apiKey: { permissions: ['claude'] } }, res)

    expect(modelService.getModelsByProvider).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({
      error: {
        message: 'This API key does not have permission to access OpenAI',
        type: 'permission_denied',
        code: 'permission_denied'
      }
    })
  })

  test('allows Codex client restrictions to access models endpoints', () => {
    expect(isPathAllowedForClient(CLIENT_IDS.CODEX_CLI, '/openai/models')).toBe(true)
    expect(isPathAllowedForClient(CLIENT_IDS.CODEX_CLI, '/openai/v1/models')).toBe(true)
  })
})
