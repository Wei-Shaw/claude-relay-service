const express = require('express')
const request = require('supertest')

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  security: jest.fn(),
  api: jest.fn()
}))

jest.mock('../src/utils/costCalculator', () => ({
  calculateCost: jest.fn(() => ({
    costs: {
      total: 0.75
    }
  }))
}))

jest.mock('../src/services/serviceRatesService', () => ({
  getService: jest.fn(() => 'claude'),
  getServiceRate: jest.fn(async () => 1)
}))

let mockDailyCost = 0
let mockCostLimitLockHeld = false

jest.mock('../src/models/redis', () => ({
  setAccountLock: jest.fn(async () => {
    if (mockCostLimitLockHeld) {
      return false
    }
    mockCostLimitLockHeld = true
    return true
  }),
  releaseAccountLock: jest.fn(async () => {
    mockCostLimitLockHeld = false
  }),
  getNextResetTime: jest.fn(() => new Date('2030-01-07T00:00:00.000Z'))
}))

jest.mock('../src/services/apiKeyService', () => ({
  validateApiKey: jest.fn(async () => ({
    valid: true,
    keyData: {
      id: 'key-1',
      name: 'limited-key',
      dailyCost: mockDailyCost,
      dailyCostLimit: 1,
      totalCost: 0,
      totalCostLimit: 0,
      weeklyOpusCost: 0,
      weeklyOpusCostLimit: 0,
      rateLimitWindow: 0,
      rateLimitRequests: 0,
      rateLimitCost: 0,
      tokenLimit: 0,
      concurrencyLimit: 0
    }
  })),
  calculateRatedCost: jest.fn(async (_keyId, _service, realCost) => realCost)
}))

jest.mock('../src/services/userService', () => ({}))
jest.mock('../src/services/claudeRelayConfigService', () => ({}))

const { authenticateApiKey } = require('../src/middleware/auth')

describe('API key cost limit concurrency gate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDailyCost = 0
    mockCostLimitLockHeld = false
  })

  it('serializes cost checks and rejects a concurrent request that would exceed daily quota', async () => {
    const app = express()
    app.use(express.json())
    app.post('/api/v1/messages', authenticateApiKey, async (_req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 25))
      mockDailyCost += 0.75
      res.json({ success: true })
    })

    const payload = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 50000,
      messages: [{ role: 'user', content: 'hello' }]
    }

    const [first, second] = await Promise.all([
      request(app).post('/api/v1/messages').set('x-api-key', 'sk-test-key').send(payload),
      request(app).post('/api/v1/messages').set('x-api-key', 'sk-test-key').send(payload)
    ])

    expect([first.status, second.status].sort()).toEqual([200, 402])
    expect(mockDailyCost).toBeCloseTo(0.75)
  })
})
