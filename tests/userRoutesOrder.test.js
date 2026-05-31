const express = require('express')
const request = require('supertest')

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  security: jest.fn()
}))
jest.mock('../src/services/ldapService', () => ({}))
jest.mock('../src/services/userService', () => ({}))
jest.mock('../src/services/apiKeyService', () => ({}))
jest.mock('../src/services/quotaCardService', () => ({
  getRedemptions: jest.fn(async () => ({ records: [], total: 0 }))
}))
jest.mock('../src/models/redis', () => ({
  getApiKey: jest.fn(async () => ({ userId: 'user-1', isAggregated: 'false' })),
  getClientSafe: jest.fn(() => ({}))
}))

const mockRequireAdmin = jest.fn((req, res) => {
  res.status(403).json({ error: 'Admin access required' })
})

jest.mock('../src/middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.user = { id: 'user-1', username: 'alice' }
    next()
  },
  authenticateUserOrAdmin: (req, res, next) => next(),
  requireAdmin: (req, res, next) => mockRequireAdmin(req, res, next)
}))

const quotaCardService = require('../src/services/quotaCardService')
const userRoutes = require('../src/routes/userRoutes')

describe('user route ordering', () => {
  const buildApp = () => {
    const app = express()
    app.use('/users', userRoutes)
    return app
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('routes redemption history to the user handler instead of /:userId', async () => {
    const response = await request(buildApp()).get('/users/redemption-history')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true, data: { records: [], total: 0 } })
    expect(quotaCardService.getRedemptions).toHaveBeenCalledWith({
      userId: 'user-1',
      limit: 50,
      offset: 0
    })
    expect(mockRequireAdmin).not.toHaveBeenCalled()
  })

  it('rejects invalid redemption history pagination before querying history', async () => {
    const response = await request(buildApp()).get('/users/redemption-history?limit=abc')

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Invalid pagination')
    expect(quotaCardService.getRedemptions).not.toHaveBeenCalled()
  })

  it('routes quota info to the user handler instead of /:userId', async () => {
    const response = await request(buildApp()).get('/users/quota-info?apiKeyId=key-1')

    expect(response.status).toBe(200)
    expect(response.body.data.isAggregated).toBe(false)
    expect(mockRequireAdmin).not.toHaveBeenCalled()
  })
})
