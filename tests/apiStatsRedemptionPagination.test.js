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
jest.mock('../src/models/redis', () => ({
  getApiKey: jest.fn(async () => ({ id: 'key-1' })),
  client: {
    incr: jest.fn(),
    expire: jest.fn()
  }
}))
jest.mock('../src/services/apiKeyService', () => ({}))
jest.mock('../src/services/account/claudeAccountService', () => ({}))
jest.mock('../src/services/account/openaiAccountService', () => ({}))
jest.mock('../src/services/serviceRatesService', () => ({}))
jest.mock('../src/services/quotaCardService', () => ({
  getRedemptions: jest.fn(async () => ({ redemptions: [], total: 0 }))
}))

const redis = require('../src/models/redis')
const quotaCardService = require('../src/services/quotaCardService')
const apiStatsRoutes = require('../src/routes/apiStats')

describe('public API stats redemption history pagination', () => {
  const validApiId = '123e4567-e89b-12d3-a456-426614174000'

  const buildApp = () => {
    const app = express()
    app.use('/apiStats', apiStatsRoutes)
    return app
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects invalid pagination before loading API key data', async () => {
    const response = await request(buildApp()).get(
      `/apiStats/api/redemption-history?apiId=${validApiId}&offset=-1`
    )

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      success: false,
      error: 'offset must be an integer between 0 and 9007199254740991'
    })
    expect(redis.getApiKey).not.toHaveBeenCalled()
    expect(quotaCardService.getRedemptions).not.toHaveBeenCalled()
  })

  it('passes validated pagination numbers to redemption history lookup', async () => {
    const response = await request(buildApp()).get(
      `/apiStats/api/redemption-history?apiId=${validApiId}&limit=25&offset=5`
    )

    expect(response.status).toBe(200)
    expect(quotaCardService.getRedemptions).toHaveBeenCalledWith({
      apiKeyId: validApiId,
      limit: 25,
      offset: 5
    })
  })
})
