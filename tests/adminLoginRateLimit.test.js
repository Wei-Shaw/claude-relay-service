const crypto = require('crypto')

const mockRouter = {
  use: jest.fn(),
  get: jest.fn(),
  post: jest.fn()
}

const mockLimiterInstances = []
const mockRateLimiterRedis = jest.fn().mockImplementation((options) => {
  const instance = {
    options,
    consume: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue(true)
  }

  mockLimiterInstances.push(instance)
  return instance
})

jest.mock('express', () => ({
  Router: () => mockRouter,
  static: jest.fn(() => jest.fn())
}))

jest.mock('rate-limiter-flexible', () => ({
  RateLimiterRedis: mockRateLimiterRedis
}))

const mockRedisClient = {}
const mockRedis = {
  getClientSafe: jest.fn(() => mockRedisClient),
  getSession: jest.fn(),
  setSession: jest.fn(),
  getClient: jest.fn()
}

jest.mock('../src/models/redis', () => mockRedis)

const mockBcrypt = {
  compare: jest.fn(),
  hash: jest.fn()
}

jest.mock('bcryptjs', () => mockBcrypt)

const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
  security: jest.fn(),
  success: jest.fn()
}

jest.mock('../src/utils/logger', () => mockLogger)

jest.mock('../config/config', () => ({
  security: { adminSessionTimeout: 3600 }
}))

require('../src/routes/web')

function findLoginHandler() {
  const route = mockRouter.post.mock.calls.find((call) => call[0] === '/auth/login')
  return route?.[1]
}

function createRequest(username = 'admin', password = 'secret') {
  return {
    body: { username, password },
    ip: '203.0.113.10',
    connection: { remoteAddress: '127.0.0.1' }
  }
}

function createResponse() {
  const res = {
    body: null,
    headers: {},
    json: jest.fn((payload) => {
      res.body = payload
      return res
    }),
    set: jest.fn((name, value) => {
      res.headers[name] = value
      return res
    }),
    status: jest.fn(() => res)
  }

  return res
}

function getLimiter(keyPrefix) {
  return mockLimiterInstances.find((instance) => instance.options.keyPrefix === keyPrefix)
}

function resetLoginMocks() {
  for (const limiter of mockLimiterInstances) {
    limiter.consume.mockReset().mockResolvedValue({})
    limiter.delete.mockReset().mockResolvedValue(true)
  }

  mockRedis.getSession.mockReset().mockResolvedValue({
    username: 'admin',
    passwordHash: 'password-hash'
  })
  mockRedis.setSession.mockReset().mockResolvedValue(undefined)
  mockBcrypt.compare.mockReset().mockResolvedValue(true)
  mockLogger.error.mockReset()
  mockLogger.info.mockReset()
  mockLogger.security.mockReset()
  mockLogger.success.mockReset()
}

describe('admin login rate limiting', () => {
  const handler = findLoginHandler()

  beforeAll(async () => {
    resetLoginMocks()
    await handler(createRequest(), createResponse())
  })

  beforeEach(() => {
    resetLoginMocks()
  })

  test('configures the approved IP and IP plus username limits', () => {
    const ipLimiter = getLimiter('admin_login_ip_limiter')
    const accountLimiter = getLimiter('admin_login_account_limiter')

    expect(ipLimiter.options).toEqual({
      storeClient: mockRedisClient,
      keyPrefix: 'admin_login_ip_limiter',
      points: 30,
      duration: 900,
      blockDuration: 900,
      rejectIfRedisNotReady: true
    })
    expect(accountLimiter.options).toEqual({
      storeClient: mockRedisClient,
      keyPrefix: 'admin_login_account_limiter',
      points: 5,
      duration: 900,
      blockDuration: 1800,
      rejectIfRedisNotReady: true
    })
  })

  test('consumes both limits before loading credentials or comparing the password', async () => {
    const ipLimiter = getLimiter('admin_login_ip_limiter')
    const accountLimiter = getLimiter('admin_login_account_limiter')

    await handler(createRequest(), createResponse())

    expect(ipLimiter.consume).toHaveBeenCalledWith('203.0.113.10')
    expect(accountLimiter.consume).toHaveBeenCalledTimes(1)
    expect(ipLimiter.consume.mock.invocationCallOrder[0]).toBeLessThan(
      mockRedis.getSession.mock.invocationCallOrder[0]
    )
    expect(accountLimiter.consume.mock.invocationCallOrder[0]).toBeLessThan(
      mockRedis.getSession.mock.invocationCallOrder[0]
    )
    expect(accountLimiter.consume.mock.invocationCallOrder[0]).toBeLessThan(
      mockBcrypt.compare.mock.invocationCallOrder[0]
    )
  })

  test('returns 429 with Retry-After when the IP limit rejects the attempt', async () => {
    const ipLimiter = getLimiter('admin_login_ip_limiter')
    ipLimiter.consume.mockRejectedValue({ msBeforeNext: 1501 })
    const res = createResponse()

    await handler(createRequest(), res)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.set).toHaveBeenCalledWith('Retry-After', '2')
    expect(res.body.retryAfter).toBe(2)
    expect(mockRedis.getSession).not.toHaveBeenCalled()
    expect(mockBcrypt.compare).not.toHaveBeenCalled()
  })

  test('returns 429 when the IP plus username limit rejects the attempt', async () => {
    const accountLimiter = getLimiter('admin_login_account_limiter')
    accountLimiter.consume.mockRejectedValue({ msBeforeNext: 30000 })
    const res = createResponse()

    await handler(createRequest(), res)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.set).toHaveBeenCalledWith('Retry-After', '30')
    expect(mockRedis.getSession).not.toHaveBeenCalled()
    expect(mockBcrypt.compare).not.toHaveBeenCalled()
  })

  test('normalizes and hashes the username in the account limiter key', async () => {
    const accountLimiter = getLimiter('admin_login_account_limiter')
    const username = '  AdMiN  '
    const expectedHash = crypto.createHash('sha256').update('admin').digest('hex').slice(0, 32)
    mockRedis.getSession.mockResolvedValue({
      username,
      passwordHash: 'password-hash'
    })

    await handler(createRequest(username), createResponse())

    expect(accountLimiter.consume).toHaveBeenCalledWith(`203.0.113.10:${expectedHash}`)
    expect(accountLimiter.consume.mock.calls[0][0]).not.toContain(username)
  })

  test('deletes only the IP plus username state after successful authentication', async () => {
    const ipLimiter = getLimiter('admin_login_ip_limiter')
    const accountLimiter = getLimiter('admin_login_account_limiter')

    await handler(createRequest(), createResponse())

    expect(accountLimiter.delete).toHaveBeenCalledWith(accountLimiter.consume.mock.calls[0][0])
    expect(ipLimiter.delete).not.toHaveBeenCalled()
  })

  test('fails closed with 503 when a limiter cannot reach Redis', async () => {
    const ipLimiter = getLimiter('admin_login_ip_limiter')
    ipLimiter.consume.mockRejectedValue(new Error('Redis unavailable'))
    const res = createResponse()

    await handler(createRequest(), res)

    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.body).toEqual({
      error: 'Service unavailable',
      message: 'Login service is temporarily unavailable'
    })
    expect(mockRedis.getSession).not.toHaveBeenCalled()
    expect(mockBcrypt.compare).not.toHaveBeenCalled()
  })

  test('fails closed with 503 when successful-login limiter cleanup fails', async () => {
    const accountLimiter = getLimiter('admin_login_account_limiter')
    accountLimiter.delete.mockRejectedValue(new Error('Redis unavailable'))
    const res = createResponse()

    await handler(createRequest(), res)

    expect(res.status).toHaveBeenCalledWith(503)
    expect(mockRedis.setSession).not.toHaveBeenCalled()
  })

  test('preserves the successful login response and session creation', async () => {
    const res = createResponse()

    await handler(createRequest(), res)

    expect(mockRedis.setSession).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.objectContaining({ username: 'admin' }),
      3600
    )
    expect(res.status).not.toHaveBeenCalled()
    expect(res.body).toEqual({
      success: true,
      token: expect.stringMatching(/^[a-f0-9]{64}$/),
      expiresIn: 3600,
      username: 'admin'
    })
  })
})
