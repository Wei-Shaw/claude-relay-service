jest.mock(
  '../config/config',
  () => ({
    system: {},
    security: {}
  }),
  { virtual: true }
)

jest.mock('../src/services/apiKeyService', () => ({
  validateApiKey: jest.fn()
}))

jest.mock('../src/services/adminApiKeyTestCredentialService', () => ({
  consumeCredential: jest.fn()
}))

const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  incr: jest.fn()
}

jest.mock('../src/models/redis', () => ({
  getClient: jest.fn(() => mockRedisClient),
  getClientSafe: jest.fn(() => mockRedisClient)
}))

jest.mock('../src/services/userService', () => ({}))
jest.mock('../src/services/requestDetailService', () => ({}))
jest.mock('../src/validators/clientValidator', () => ({ validateRequest: jest.fn() }))
jest.mock('../src/validators/clients/claudeCodeValidator', () => ({ validate: jest.fn() }))
jest.mock('../src/services/claudeRelayConfigService', () => ({
  isClaudeCodeOnlyEnabled: jest.fn(async () => false)
}))
jest.mock('../src/utils/statsHelper', () => ({ calculateWaitTimeStats: jest.fn() }))
jest.mock('../src/utils/modelHelper', () => ({ isClaudeFamilyModel: jest.fn(() => false) }))
jest.mock('../src/utils/logger', () => ({
  api: jest.fn(),
  database: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  security: jest.fn(),
  warn: jest.fn()
}))

const apiKeyService = require('../src/services/apiKeyService')
const credentialService = require('../src/services/adminApiKeyTestCredentialService')
const { authenticateApiKey } = require('../src/middleware/auth')
const { shouldSkipApiKeyUsage } = require('../src/utils/apiKeyUsageContext')

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  }
}

describe('admin API key test authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    credentialService.consumeCredential.mockReturnValue({ keyId: 'key-1', service: 'claude' })
    apiKeyService.validateApiKey.mockResolvedValue({
      valid: true,
      keyData: {
        id: 'key-1',
        name: 'Managed Key',
        permissions: [],
        concurrencyLimit: 0,
        rateLimitWindow: 10,
        rateLimitRequests: 5,
        rateLimitCost: 0,
        tokenLimit: 0,
        dailyCostLimit: 0,
        totalCostLimit: 0,
        weeklyOpusCostLimit: 0,
        enableClientRestriction: false,
        allowedClients: []
      }
    })
    mockRedisClient.get.mockImplementation(async (key) => {
      if (key.startsWith('rate_limit:window_start:')) {
        return String(Date.now())
      }
      return '0'
    })
  })

  test('checks existing rate limits without incrementing the request counter', async () => {
    let skippedInsideHandler = false
    const next = jest.fn(() => {
      skippedInsideHandler = shouldSkipApiKeyUsage()
    })
    const req = {
      originalUrl: '/api/v1/messages',
      headers: { 'x-api-key': 'cr_admin_test' },
      body: { model: 'claude-test' }
    }

    await authenticateApiKey(req, createResponse(), next)

    expect(credentialService.consumeCredential).toHaveBeenCalledWith('cr_admin_test', 'claude')
    expect(apiKeyService.validateApiKey).toHaveBeenCalledWith('cr_admin_test', {
      keyId: 'key-1',
      skipActivation: true
    })
    expect(mockRedisClient.set).not.toHaveBeenCalled()
    expect(mockRedisClient.incr).not.toHaveBeenCalled()
    expect(req.rateLimitInfo).toBeUndefined()
    expect(req.isAdminApiKeyTest).toBe(true)
    expect(skippedInsideHandler).toBe(true)
    expect(shouldSkipApiKeyUsage()).toBe(false)
  })
})
