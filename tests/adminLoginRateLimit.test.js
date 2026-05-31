const express = require('express')
const request = require('supertest')
const bcrypt = require('bcryptjs')

const mockConsume = jest.fn(() => Promise.resolve())

jest.mock('rate-limiter-flexible', () => ({
  RateLimiterRedis: jest.fn(() => ({
    consume: mockConsume
  }))
}))

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  security: jest.fn()
}))

jest.mock('../src/models/redis', () => ({
  getClientSafe: jest.fn(() => ({})),
  getSession: jest.fn(),
  setSession: jest.fn(),
  getClient: jest.fn(() => ({ hset: jest.fn() }))
}))

const redis = require('../src/models/redis')
const webRoutes = require('../src/routes/web')

describe('admin login rate limiting', () => {
  const buildApp = () => {
    const app = express()
    app.use(express.json())
    app.use('/web', webRoutes)
    return app
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockConsume.mockReset()
    mockConsume.mockResolvedValue(undefined)
    redis.getSession.mockResolvedValue({
      username: 'admin',
      passwordHash: bcrypt.hashSync('correct-password', 4)
    })
  })

  it('returns 429 when the admin login IP limiter is exceeded', async () => {
    mockConsume.mockRejectedValueOnce({ msBeforeNext: 120000 })

    const response = await request(buildApp()).post('/web/auth/login').send({
      username: 'admin',
      password: 'wrong-password'
    })

    expect(response.status).toBe(429)
    expect(response.headers['retry-after']).toBe('120')
    expect(response.body.error).toBe('Too many requests')
    expect(redis.getSession).not.toHaveBeenCalled()
  })

  it('checks both IP and username admin login limits before validating credentials', async () => {
    const response = await request(buildApp()).post('/web/auth/login').send({
      username: 'admin',
      password: 'wrong-password'
    })

    expect(response.status).toBe(401)
    expect(mockConsume).toHaveBeenCalledTimes(2)
    expect(redis.getSession).toHaveBeenCalledWith('admin_credentials')
  })
})
