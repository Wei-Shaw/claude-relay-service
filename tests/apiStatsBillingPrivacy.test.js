const express = require('express')
const request = require('supertest')

const TEST_API_ID = '123e4567-e89b-12d3-a456-426614174000'
const TEST_MONTH = '2026-04'
const TEST_MODEL = 'claude-3-5-sonnet-20241022'

jest.mock('../src/models/redis', () => ({
  getApiKey: jest.fn(),
  getUsageStats: jest.fn(),
  getDailyCost: jest.fn(),
  getCostStats: jest.fn(),
  getWeeklyOpusCost: jest.fn(),
  getClientSafe: jest.fn(),
  scanAndGetAllChunked: jest.fn(),
  getDateInTimezone: jest.fn(),
  getDateStringInTimezone: jest.fn()
}))

jest.mock('../src/utils/logger', () => ({
  api: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  security: jest.fn()
}))

jest.mock('../src/services/apiKeyService', () => ({
  validateApiKey: jest.fn(),
  validateApiKeyForStats: jest.fn()
}))

jest.mock('../src/services/account/claudeAccountService', () => ({
  getAccountOverview: jest.fn()
}))

jest.mock('../src/services/account/openaiAccountService', () => ({
  getAccountOverview: jest.fn()
}))

jest.mock('../src/services/serviceRatesService', () => ({
  getRates: jest.fn()
}))

jest.mock('../src/utils/costCalculator', () => ({
  calculateCost: jest.fn(() => ({
    costs: {
      input: 0.25,
      output: 0.75,
      total: 1,
      real: 1,
      rated: 1.5
    },
    formatted: {
      input: '$0.250000',
      output: '$0.750000',
      total: '$1.000000'
    },
    pricing: {
      input: 3,
      output: 15,
      cacheWrite: 3.75,
      cacheRead: 0.3
    }
  })),
  formatCost: jest.fn((cost) => `$${Number(cost || 0).toFixed(6)}`)
}))

jest.mock('../src/utils/testPayloadHelper', () => ({
  createClaudeTestPayload: jest.fn(),
  extractErrorMessage: jest.fn(),
  sanitizeErrorMsg: jest.fn(),
  sendStreamTestRequest: jest.fn()
}))

jest.mock('../config/models', () => ({
  CLAUDE_MODELS: [],
  GEMINI_MODELS: [],
  OPENAI_MODELS: [],
  OTHER_MODELS: [],
  PLATFORM_TEST_MODELS: {},
  getModelsByService: jest.fn(() => []),
  getAllModels: jest.fn(() => [])
}))

jest.mock('../src/utils/errorSanitizer', () => ({
  getSafeMessage: jest.fn((message) => message)
}))

const redis = require('../src/models/redis')
const serviceRatesService = require('../src/services/serviceRatesService')
const apiStatsRouter = require('../src/routes/apiStats')

const buildApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/apiStats', apiStatsRouter)
  return app
}

const buildKeyData = () => ({
  id: TEST_API_ID,
  name: 'Customer Key',
  description: 'customer-visible key',
  isActive: 'true',
  createdAt: '2026-04-01T00:00:00.000Z',
  expiresAt: null,
  permissions: ['claude'],
  tokenLimit: '0',
  concurrencyLimit: '0',
  rateLimitWindow: '0',
  rateLimitRequests: '0',
  dailyCostLimit: '0',
  totalCostLimit: '0',
  weeklyOpusCostLimit: '0',
  weeklyResetDay: '1',
  weeklyResetHour: '0',
  enableModelRestriction: 'false',
  enableClientRestriction: 'false',
  serviceRates: JSON.stringify({ claude: 1.5 })
})

const modelUsageData = () => ({
  requests: '2',
  inputTokens: '1000',
  outputTokens: '500',
  cacheCreateTokens: '0',
  cacheReadTokens: '0',
  ephemeral5mTokens: '0',
  ephemeral1hTokens: '0',
  allTokens: '1500',
  realCostMicro: '1000000',
  ratedCostMicro: '1500000'
})

const setupRedisFixtures = () => {
  const client = {
    get: jest.fn(async (key) => (key === `usage:cost:total:${TEST_API_ID}` ? '1.5' : '0'))
  }

  redis.getApiKey.mockResolvedValue(buildKeyData())
  redis.getUsageStats.mockResolvedValue({
    total: { requests: 2, inputTokens: 1000, outputTokens: 500, allTokens: 1500 },
    daily: { requests: 1, inputTokens: 500, outputTokens: 250, allTokens: 750 },
    monthly: { requests: 2, inputTokens: 1000, outputTokens: 500, allTokens: 1500 }
  })
  redis.getDailyCost.mockResolvedValue(0)
  redis.getCostStats.mockResolvedValue({ daily: 0, monthly: 1.5, total: 1.5 })
  redis.getWeeklyOpusCost.mockResolvedValue(0)
  redis.getClientSafe.mockReturnValue(client)
  redis.getDateInTimezone.mockReturnValue(new Date('2026-04-29T00:00:00.000Z'))
  redis.getDateStringInTimezone.mockReturnValue('2026-04-29')
  redis.scanAndGetAllChunked.mockImplementation(async (pattern) => {
    if (pattern.includes(':model:monthly:')) {
      return [
        {
          key: `usage:${TEST_API_ID}:model:monthly:${TEST_MODEL}:${TEST_MONTH}`,
          data: modelUsageData()
        }
      ]
    }
    return []
  })
  serviceRatesService.getRates.mockResolvedValue({
    baseService: 'claude',
    rates: { claude: 1.5, codex: 1 },
    updatedAt: '2026-04-01T00:00:00.000Z',
    updatedBy: 'admin'
  })
}

describe('apiStats customer billing privacy switch', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.HIDE_CUSTOMER_BILLING_DETAILS
    setupRedisFixtures()
  })

  it('keeps existing billing details visible by default', async () => {
    const app = buildApp()

    const statsResponse = await request(app)
      .post('/apiStats/api/user-stats')
      .send({ apiId: TEST_API_ID })

    expect(statsResponse.status).toBe(200)
    expect(statsResponse.body.data.serviceRates).toEqual({ claude: 1.5 })

    const ratesResponse = await request(app).get('/apiStats/service-rates')

    expect(ratesResponse.status).toBe(200)
    expect(ratesResponse.body).toMatchObject({
      success: true,
      data: { rates: { claude: 1.5 } }
    })

    const modelResponse = await request(app)
      .post('/apiStats/api/user-model-stats')
      .send({ apiId: TEST_API_ID, period: 'monthly' })

    expect(modelResponse.status).toBe(200)
    expect(modelResponse.body.data[0].costs).toMatchObject({ real: 1, rated: 1.5 })
    expect(modelResponse.body.data[0].pricing).toMatchObject({ input: 3, output: 15 })
  })

  it('hides customer billing details when HIDE_CUSTOMER_BILLING_DETAILS is enabled', async () => {
    process.env.HIDE_CUSTOMER_BILLING_DETAILS = 'true'
    const app = buildApp()

    const statsResponse = await request(app)
      .post('/apiStats/api/user-stats')
      .send({ apiId: TEST_API_ID })

    expect(statsResponse.status).toBe(200)
    expect(statsResponse.body.data).not.toHaveProperty('serviceRates')

    const ratesResponse = await request(app).get('/apiStats/service-rates')

    expect(ratesResponse.status).toBe(200)
    expect(ratesResponse.body).toEqual({
      success: false,
      data: null,
      billingDetailsHidden: true
    })

    const modelResponse = await request(app)
      .post('/apiStats/api/user-model-stats')
      .send({ apiId: TEST_API_ID, period: 'monthly' })

    expect(modelResponse.status).toBe(200)
    expect(modelResponse.body.data[0]).not.toHaveProperty('pricing')
    expect(modelResponse.body.data[0].costs).toEqual({ total: 1.5 })
    expect(modelResponse.body.data[0].formatted).toEqual({ total: '$1.500000' })

    const batchModelResponse = await request(app)
      .post('/apiStats/api/batch-model-stats')
      .send({ apiIds: [TEST_API_ID], period: 'monthly' })

    expect(batchModelResponse.status).toBe(200)
    expect(batchModelResponse.body.data[0]).not.toHaveProperty('pricing')
    expect(batchModelResponse.body.data[0].costs).toEqual({ total: 1.5 })
    expect(batchModelResponse.body.data[0].formatted).toEqual({ total: '$1.500000' })
  })
})
