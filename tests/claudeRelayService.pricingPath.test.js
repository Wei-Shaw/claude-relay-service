const path = require('path')

const mockGetPricingData = jest.fn()

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

jest.mock('../src/utils/proxyHelper', () => ({}))
jest.mock('../src/utils/headerFilter', () => ({ filterForClaude: jest.fn() }))
jest.mock('../src/services/account/claudeAccountService', () => ({}))
jest.mock('../src/services/scheduler/unifiedClaudeScheduler', () => ({}))
jest.mock('../src/utils/sessionHelper', () => ({}))
jest.mock(
  '../config/config',
  () => ({
    claude: {
      apiVersion: '2023-06-01',
      betaHeader: 'test-beta',
      systemPrompt: ''
    }
  }),
  { virtual: true }
)
jest.mock('../src/services/claudeCodeHeadersService', () => ({}))
jest.mock('../src/models/redis', () => ({}))
jest.mock('../src/validators/clients/claudeCodeValidator', () => ({}))
jest.mock('../src/utils/dateHelper', () => ({ formatDateWithTimezone: jest.fn(() => 'mock-date') }))
jest.mock('../src/services/requestIdentityService', () => ({}))
jest.mock('../src/utils/testPayloadHelper', () => ({ createClaudeTestPayload: jest.fn() }))
jest.mock('../src/services/userMessageQueueService', () => ({}))
jest.mock('../src/utils/streamHelper', () => ({ isStreamWritable: jest.fn(() => true) }))
jest.mock('../src/utils/upstreamErrorHelper', () => ({}))
jest.mock('../src/utils/metadataUserIdHelper', () => ({}))
jest.mock('../src/utils/performanceOptimizer', () => ({
  getHttpsAgentForStream: jest.fn(),
  getHttpsAgentForNonStream: jest.fn(),
  getPricingData: mockGetPricingData
}))

const claudeRelayService = require('../src/services/relay/claudeRelayService')

describe('claudeRelayService._validateAndLimitMaxTokens', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('reads model_pricing.json from the runtime data directory when validating max_tokens', () => {
    const expectedPricingPath = path.join(process.cwd(), 'data', 'model_pricing.json')
    mockGetPricingData.mockImplementation((pricingPath) => {
      if (pricingPath === expectedPricingPath) {
        return {
          'claude-sonnet-4-20250514': {
            max_tokens: 8192
          }
        }
      }
      return null
    })

    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 999999
    }

    claudeRelayService._validateAndLimitMaxTokens(body)

    expect(mockGetPricingData).toHaveBeenCalledWith(expectedPricingPath)
    expect(body.max_tokens).toBe(8192)
  })
})
