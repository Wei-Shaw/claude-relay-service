const mockRouter = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn()
}

jest.mock(
  'express',
  () => ({
    Router: () => mockRouter
  }),
  { virtual: true }
)

jest.mock('../src/middleware/auth', () => ({
  authenticateAdmin: jest.fn((_req, _res, next) => next())
}))

jest.mock('../src/services/apiKeyService', () => ({
  updateApiKey: jest.fn()
}))

jest.mock('../src/models/redis', () => ({
  getApiKey: jest.fn()
}))

jest.mock('../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  success: jest.fn()
}))

jest.mock('../src/utils/costCalculator', () => ({
  calculateCost: jest.fn(),
  formatCost: jest.fn()
}))

jest.mock(
  '../config/config',
  () => ({
    system: {
      timezoneOffset: 8
    }
  }),
  { virtual: true }
)

jest.mock('../src/services/requestBodyRuleService', () => ({
  validateAndNormalizeRules: jest.fn()
}))

const apiKeyService = require('../src/services/apiKeyService')
const redis = require('../src/models/redis')
const requestBodyRuleService = require('../src/services/requestBodyRuleService')
require('../src/routes/admin/apiKeys')

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

function findPutHandler(path) {
  const route = mockRouter.put.mock.calls.find((call) => call[0] === path)
  return route?.[2]
}

function findPatchHandler(path) {
  const route = mockRouter.patch.mock.calls.find((call) => call[0] === path)
  return route?.[2]
}

describe('admin api keys route payload rule updates', () => {
  beforeEach(() => {
    apiKeyService.updateApiKey.mockReset()
    apiKeyService.updateApiKey.mockResolvedValue()

    redis.getApiKey.mockReset()
    redis.getApiKey.mockResolvedValue({ id: 'key-1', isActive: 'false' })

    requestBodyRuleService.validateAndNormalizeRules.mockReset()
    requestBodyRuleService.validateAndNormalizeRules.mockImplementation((rules) => ({
      valid: true,
      rules
    }))
  })

  test('does not clear stored payload rules when the toggle is disabled without sending rules', async () => {
    const handler = findPutHandler('/api-keys/:keyId')
    const res = createResponse()

    await handler(
      {
        params: { keyId: 'key-1' },
        body: {
          name: 'Renamed Key',
          enableOpenAIResponsesPayloadRules: false
        }
      },
      res
    )

    expect(requestBodyRuleService.validateAndNormalizeRules).not.toHaveBeenCalled()

    const updates = apiKeyService.updateApiKey.mock.calls[0][1]
    expect(updates).toEqual({
      name: 'Renamed Key',
      enableOpenAIResponsesPayloadRules: false
    })
    expect(updates).not.toHaveProperty('openaiResponsesPayloadRules')

    expect(res.status).not.toHaveBeenCalled()
    expect(res.body).toEqual({
      success: true,
      message: 'API key updated successfully'
    })
  })

  test('accepts payload rules even when the toggle is disabled', async () => {
    const handler = findPutHandler('/api-keys/:keyId')
    const res = createResponse()
    const rules = [{ path: 'model', valueType: 'string', value: 'gpt-5' }]

    await handler(
      {
        params: { keyId: 'key-2' },
        body: {
          enableOpenAIResponsesPayloadRules: false,
          openaiResponsesPayloadRules: rules
        }
      },
      res
    )

    expect(requestBodyRuleService.validateAndNormalizeRules).toHaveBeenCalledWith(rules)
    expect(apiKeyService.updateApiKey).toHaveBeenCalledWith('key-2', {
      enableOpenAIResponsesPayloadRules: false,
      openaiResponsesPayloadRules: rules
    })

    expect(res.status).not.toHaveBeenCalled()
    expect(res.body.success).toBe(true)
  })

  test('allows explicitly clearing payload rules with an empty array', async () => {
    const handler = findPutHandler('/api-keys/:keyId')
    const res = createResponse()

    await handler(
      {
        params: { keyId: 'key-3' },
        body: {
          openaiResponsesPayloadRules: []
        }
      },
      res
    )

    expect(requestBodyRuleService.validateAndNormalizeRules).toHaveBeenCalledWith([])
    expect(apiKeyService.updateApiKey).toHaveBeenCalledWith('key-3', {
      openaiResponsesPayloadRules: []
    })

    expect(res.status).not.toHaveBeenCalled()
    expect(res.body.success).toBe(true)
  })
})

describe('admin API key activation route', () => {
  beforeEach(() => {
    apiKeyService.updateApiKey.mockReset()
    apiKeyService.updateApiKey.mockResolvedValue()
    redis.getApiKey.mockReset()
    redis.getApiKey.mockResolvedValue({ id: 'key-1', isActive: 'false' })
  })

  test('activates an inactive key immediately', async () => {
    const handler = findPatchHandler('/api-keys/:keyId/activation')
    const res = createResponse()

    await handler({ params: { keyId: 'key-1' }, body: { mode: 'immediate' } }, res)

    expect(apiKeyService.updateApiKey).toHaveBeenCalledWith('key-1', {
      isActive: true,
      scheduledActivationAt: null
    })
    expect(res.body).toEqual({
      success: true,
      message: 'API key activated',
      scheduledActivationAt: null
    })
  })

  test('stores a future scheduled activation time and keeps the key inactive', async () => {
    const handler = findPatchHandler('/api-keys/:keyId/activation')
    const res = createResponse()
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    await handler(
      { params: { keyId: 'key-1' }, body: { mode: 'scheduled', scheduledAt } },
      res
    )

    expect(apiKeyService.updateApiKey).toHaveBeenCalledWith('key-1', {
      isActive: false,
      scheduledActivationAt: scheduledAt
    })
    expect(res.body).toEqual({
      success: true,
      message: 'API key activation scheduled',
      scheduledActivationAt: scheduledAt
    })
  })

  test('cancels a saved scheduled activation without changing the key status', async () => {
    const handler = findPatchHandler('/api-keys/:keyId/activation')
    const res = createResponse()

    await handler({ params: { keyId: 'key-1' }, body: { mode: 'cancel' } }, res)

    expect(apiKeyService.updateApiKey).toHaveBeenCalledWith('key-1', {
      scheduledActivationAt: null
    })
    expect(res.body).toEqual({
      success: true,
      message: 'Scheduled activation cancelled',
      scheduledActivationAt: null
    })
  })

  test('rejects a scheduled activation time in the past', async () => {
    const handler = findPatchHandler('/api-keys/:keyId/activation')
    const res = createResponse()

    await handler(
      {
        params: { keyId: 'key-1' },
        body: { mode: 'scheduled', scheduledAt: '2020-01-01T00:00:00.000Z' }
      },
      res
    )

    expect(apiKeyService.updateApiKey).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'Scheduled activation time must be in the future' })
  })
})
