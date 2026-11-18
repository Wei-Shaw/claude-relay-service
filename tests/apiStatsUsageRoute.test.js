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
jest.mock('../src/models/redis', () => ({}))
jest.mock('../src/utils/logger', () => ({
  api: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  security: jest.fn(),
  warn: jest.fn()
}))
jest.mock('../src/services/apiKeyService', () => ({}))
jest.mock('../src/services/apiStatsUsageService', () => ({ getUsageWorkspace: jest.fn() }))
jest.mock('../src/utils/costCalculator', () => ({}))
jest.mock('../src/services/serviceRatesService', () => ({}))
jest.mock('../src/services/openaiResponsesTestService', () => ({}))
jest.mock('../src/utils/testPayloadHelper', () => ({
  createClaudeTestPayload: jest.fn(),
  extractErrorMessage: jest.fn(),
  sanitizeErrorMsg: jest.fn()
}))
jest.mock('../config/models', () => ({
  CLAUDE_MODELS: [],
  GEMINI_MODELS: [],
  OPENAI_MODELS: [],
  OTHER_MODELS: [],
  PLATFORM_TEST_MODELS: {},
  getAllModels: jest.fn(() => []),
  getModelsByService: jest.fn(() => [])
}))
jest.mock('../src/services/connectivityTestModelConfigService', () => ({}))
jest.mock('../src/utils/errorSanitizer', () => ({ getSafeMessage: jest.fn() }))

const apiStatsUsageService = require('../src/services/apiStatsUsageService')
require('../src/routes/apiStats')

const registeredPostPaths = mockRouter.post.mock.calls.map((call) => call[0])
const handler = mockRouter.post.mock.calls.find((call) => call[0] === '/api/usage-workspace')?.[1]

function createResponse() {
  const res = {
    statusCode: 200,
    body: null,
    json: jest.fn((payload) => {
      res.body = payload
      return res
    }),
    status: jest.fn((code) => {
      res.statusCode = code
      return res
    })
  }
  return res
}

describe('API Stats usage workspace route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns the safe workspace response from the service', async () => {
    const data = { totalCost: 1.25, records: [] }
    apiStatsUsageService.getUsageWorkspace.mockResolvedValue(data)
    const res = createResponse()

    await handler({ body: { apiKey: 'cr_valid_test_key', period: 'week' } }, res)

    expect(apiStatsUsageService.getUsageWorkspace).toHaveBeenCalledWith({
      apiKey: 'cr_valid_test_key',
      period: 'week'
    })
    expect(res.body).toEqual({ success: true, data })
  })

  test('preserves service validation status without leaking internal errors', async () => {
    const error = new Error('API Key 无效')
    error.statusCode = 401
    apiStatsUsageService.getUsageWorkspace.mockRejectedValue(error)
    const res = createResponse()

    await handler({ body: { apiKey: 'cr_invalid_key' } }, res)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid usage query', message: 'API Key 无效' })
  })

  test('does not register the removed aggregate query routes', () => {
    expect(registeredPostPaths).not.toContain('/api/batch-stats')
    expect(registeredPostPaths).not.toContain('/api/batch-model-stats')
  })
})
