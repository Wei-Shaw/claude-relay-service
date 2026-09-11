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
jest.mock('../src/services/apiKeyService', () => ({}))
jest.mock('../src/models/redis', () => ({ getApiKey: jest.fn() }))
jest.mock('../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  success: jest.fn()
}))
jest.mock('../src/utils/costCalculator', () => ({}))
jest.mock('../src/services/requestBodyRuleService', () => ({}))
jest.mock('../src/services/adminApiKeyTestCredentialService', () => ({
  issueCredential: jest.fn()
}))
jest.mock('../config/config', () => ({ system: { timezoneOffset: 8 } }), { virtual: true })

const redis = require('../src/models/redis')
const credentialService = require('../src/services/adminApiKeyTestCredentialService')
require('../src/routes/admin/apiKeys')
const handler = mockRouter.post.mock.calls.find(
  (call) => call[0] === '/api-keys/:keyId/test-credential'
)?.[2]

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

describe('admin API key test credential route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('issues a short-lived credential for an existing key', async () => {
    redis.getApiKey.mockResolvedValue({ id: 'key-1', isDeleted: 'false' })
    credentialService.issueCredential.mockReturnValue({
      apiKey: 'cr_test',
      expiresInSeconds: 60
    })
    const res = createResponse()

    await handler({ params: { keyId: 'key-1' }, body: { service: 'claude' } }, res)

    expect(credentialService.issueCredential).toHaveBeenCalledWith('key-1', 'claude')
    expect(res.body).toEqual({
      success: true,
      data: { apiKey: 'cr_test', expiresInSeconds: 60 }
    })
  })

  test('rejects an unsupported service before issuing a credential', async () => {
    const res = createResponse()

    await handler({ params: { keyId: 'key-1' }, body: { service: 'droid' } }, res)

    expect(redis.getApiKey).not.toHaveBeenCalled()
    expect(credentialService.issueCredential).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ success: false, message: 'Invalid test service' })
  })
})
