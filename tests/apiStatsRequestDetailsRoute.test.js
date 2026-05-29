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

jest.mock('../src/models/redis', () => ({
  getClientSafe: jest.fn(),
  getDailyCost: jest.fn(),
  getCostStats: jest.fn(),
  getWeeklyOpusCost: jest.fn(),
  scanAndGetAllChunked: jest.fn()
}))
jest.mock('../src/services/apiKeyService', () => ({
  validateApiKeyForStats: jest.fn(),
  hasPermission: jest.fn(() => true)
}))
jest.mock('../src/services/requestDetailService', () => ({
  listRequestDetails: jest.fn(),
  listRequestDetailSessions: jest.fn(),
  getRequestDetail: jest.fn()
}))
jest.mock('../src/services/account/claudeAccountService', () => ({}))
jest.mock('../src/services/account/claudeConsoleAccountService', () => ({
  getAllAccounts: jest.fn(() => [])
}))
jest.mock('../src/services/account/ccrAccountService', () => ({
  getAllAccounts: jest.fn(() => [])
}))
jest.mock('../src/services/account/geminiAccountService', () => ({
  getAllAccounts: jest.fn(() => [])
}))
jest.mock('../src/services/account/geminiApiAccountService', () => ({
  getAllAccounts: jest.fn(() => [])
}))
jest.mock('../src/services/account/openaiAccountService', () => ({}))
jest.mock('../src/services/accountGroupService', () => ({
  getGroupMembers: jest.fn(() => [])
}))
jest.mock('../src/services/serviceRatesService', () => ({}))
jest.mock('../src/services/claudeRelayConfigService', () => ({
  getConfig: jest.fn(() => Promise.resolve({ modelEndpointConfigs: {} })),
  getDefaultModelEndpointConfigs: jest.fn(() => ({}))
}))
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
  getDefaultModelEndpointConfigs: jest.fn(() => ({})),
  getAllModels: jest.fn(() => []),
  getModelsByService: jest.fn(() => [])
}))
jest.mock('../src/utils/logger', () => ({
  api: jest.fn(),
  security: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}))

const apiKeyService = require('../src/services/apiKeyService')
const redis = require('../src/models/redis')
const requestDetailService = require('../src/services/requestDetailService')
const claudeConsoleAccountService = require('../src/services/account/claudeConsoleAccountService')
const ccrAccountService = require('../src/services/account/ccrAccountService')
const geminiAccountService = require('../src/services/account/geminiAccountService')
const geminiApiAccountService = require('../src/services/account/geminiApiAccountService')
require('../src/routes/apiStats')

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

function findPostHandler(path) {
  const route = mockRouter.post.mock.calls.find((call) => call[0] === path)
  return route?.[1]
}

describe('apiStats request detail routes', () => {
  beforeEach(() => {
    apiKeyService.validateApiKeyForStats.mockReset()
    apiKeyService.hasPermission.mockReset()
    apiKeyService.hasPermission.mockImplementation((permissions, service) => {
      if (!permissions || permissions.length === 0) {
        return true
      }
      return permissions.includes(service)
    })
    redis.getClientSafe.mockReset()
    redis.getDailyCost.mockReset()
    redis.getCostStats.mockReset()
    redis.getWeeklyOpusCost.mockReset()
    redis.scanAndGetAllChunked.mockReset()
    requestDetailService.listRequestDetails.mockReset()
    requestDetailService.getRequestDetail.mockReset()
    claudeConsoleAccountService.getAllAccounts.mockReset()
    ccrAccountService.getAllAccounts.mockReset()
    geminiAccountService.getAllAccounts.mockReset()
    geminiApiAccountService.getAllAccounts.mockReset()
    redis.getClientSafe.mockReturnValue({
      get: jest.fn(async (key) => (key === 'usage:cost:total:key_current' ? '0.5' : null))
    })
    redis.getDailyCost.mockResolvedValue(0)
    redis.getCostStats.mockResolvedValue({ total: 0, daily: 0, monthly: 0 })
    redis.getWeeklyOpusCost.mockResolvedValue(0)
    redis.scanAndGetAllChunked.mockResolvedValue([])
    claudeConsoleAccountService.getAllAccounts.mockResolvedValue([])
    ccrAccountService.getAllAccounts.mockResolvedValue([])
    geminiAccountService.getAllAccounts.mockResolvedValue([])
    geminiApiAccountService.getAllAccounts.mockResolvedValue([])
    apiKeyService.validateApiKeyForStats.mockResolvedValue({
      valid: true,
      keyData: {
        id: 'key_current',
        name: 'Current Key'
      }
    })
  })

  test('lists only the current API key request details', async () => {
    requestDetailService.listRequestDetails.mockResolvedValue({
      records: [
        {
          requestId: 'req_1',
          apiKeyId: 'key_current',
          model: 'glm-5.1',
          endpoint: '/api/v1/messages',
          timestamp: '2026-05-27T06:30:00.000Z'
        }
      ],
      availableFilters: {
        apiKeys: [{ id: 'key_other', name: 'Other Key' }],
        accounts: [{ id: 'acct_other' }],
        models: ['other-model'],
        endpoints: ['/other'],
        dateRange: {
          earliest: '2026-05-01T00:00:00.000Z',
          latest: '2026-05-27T06:30:00.000Z'
        }
      },
      pagination: {
        currentPage: 1,
        pageSize: 50,
        totalRecords: 1
      }
    })

    const handler = findPostHandler('/api/request-details')
    const res = createResponse()

    await handler(
      {
        body: {
          apiKey: 'cr_valid_key_for_test',
          apiId: 'key_current',
          apiKeyId: 'key_other',
          keyword: 'glm',
          session: 'session_1'
        },
        ip: '127.0.0.1'
      },
      res
    )

    expect(apiKeyService.validateApiKeyForStats).toHaveBeenCalledWith('cr_valid_key_for_test')
    expect(requestDetailService.listRequestDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: 'key_current',
        keyword: 'glm',
        session: 'session_1'
      })
    )
    expect(res.status).not.toHaveBeenCalled()
    expect(res.body.success).toBe(true)
    expect(res.body.data.availableFilters.apiKeys).toEqual([])
    expect(res.body.data.availableFilters.accounts).toEqual([])
    expect(res.body.data.availableFilters.models).toEqual(['glm-5.1'])
    expect(res.body.data.availableFilters.endpoints).toEqual(['/api/v1/messages'])
  })

  test('lists current API key request detail sessions', async () => {
    requestDetailService.listRequestDetailSessions.mockResolvedValue({
      sessions: [
        {
          sessionKey: 'session_1',
          sessionId: 'session_1',
          requestCount: 2
        }
      ],
      pagination: {
        currentPage: 1,
        pageSize: 6,
        totalSessions: 1
      }
    })

    const handler = findPostHandler('/api/request-detail-sessions')
    const res = createResponse()

    await handler(
      {
        body: {
          apiKey: 'cr_valid_key_for_test',
          apiId: 'key_current',
          apiKeyId: 'key_other',
          pageSize: 6
        },
        ip: '127.0.0.1'
      },
      res
    )

    expect(requestDetailService.listRequestDetailSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: 'key_current',
        pageSize: 6
      })
    )
    expect(res.status).not.toHaveBeenCalled()
    expect(res.body.success).toBe(true)
    expect(res.body.data.sessions[0].sessionId).toBe('session_1')
  })

  test('returns mapped source models available to the current API key test modal', async () => {
    apiKeyService.validateApiKeyForStats.mockResolvedValue({
      valid: true,
      keyData: {
        id: 'key_current',
        name: 'Current Key',
        permissions: ['claude', 'gemini'],
        usage: {
          total: {
            requests: 0,
            allTokens: 0
          }
        },
        enableModelRestriction: false,
        restrictedModels: []
      }
    })
    claudeConsoleAccountService.getAllAccounts.mockResolvedValue([
      {
        id: 'console_1',
        isActive: true,
        status: 'active',
        accountType: 'shared',
        schedulable: true,
        supportedModels: {
          'kimi-for-coding': 'claude-sonnet-4-5-20250929'
        }
      }
    ])
    ccrAccountService.getAllAccounts.mockResolvedValue([
      {
        id: 'ccr_1',
        isActive: true,
        status: 'active',
        accountType: 'shared',
        schedulable: true,
        supportedModels: {
          'glm-5.1': 'glm-5.1'
        }
      }
    ])
    geminiApiAccountService.getAllAccounts.mockResolvedValue([
      {
        id: 'gemini_api_1',
        isActive: true,
        status: 'active',
        accountType: 'shared',
        schedulable: true,
        supportedModels: ['qwen3.6-plus']
      }
    ])

    const handler = findPostHandler('/api/user-stats')
    const res = createResponse()

    await handler(
      {
        body: {
          apiKey: 'cr_valid_key_for_test'
        },
        ip: '127.0.0.1'
      },
      res
    )

    expect(res.body.success).toBe(true)
    expect(res.body.data.testModelOptions.claude).toEqual(
      expect.arrayContaining([
        { value: 'kimi-for-coding', label: 'kimi-for-coding' },
        { value: 'ccr,glm-5.1', label: 'CCR: glm-5.1' }
      ])
    )
    expect(res.body.data.testModelOptions.gemini).toEqual([
      { value: 'qwen3.6-plus', label: 'qwen3.6-plus' }
    ])
    expect(res.body.data.testModelOptions.openai).toEqual([])
  })

  test('rejects request detail query when apiId does not match the submitted key', async () => {
    const handler = findPostHandler('/api/request-details')
    const res = createResponse()

    await handler(
      {
        body: {
          apiKey: 'cr_valid_key_for_test',
          apiId: 'key_other'
        },
        ip: '127.0.0.1'
      },
      res
    )

    expect(res.status).toHaveBeenCalledWith(403)
    expect(requestDetailService.listRequestDetails).not.toHaveBeenCalled()
  })

  test('hides request detail records owned by another API key', async () => {
    requestDetailService.getRequestDetail.mockResolvedValue({
      record: {
        requestId: 'req_other',
        apiKeyId: 'key_other'
      }
    })

    const handler = findPostHandler('/api/request-details/:requestId')
    const res = createResponse()

    await handler(
      {
        params: {
          requestId: 'req_other'
        },
        body: {
          apiKey: 'cr_valid_key_for_test',
          apiId: 'key_current'
        },
        ip: '127.0.0.1'
      },
      res
    )

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.body.success).toBe(false)
  })
})
