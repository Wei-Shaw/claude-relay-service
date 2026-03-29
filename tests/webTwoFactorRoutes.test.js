const express = require('express')
const request = require('supertest')

jest.mock('../src/models/redis', () => ({
  getSession: jest.fn(),
  setSession: jest.fn(),
  deleteSession: jest.fn(),
  getClient: jest.fn(() => ({ hset: jest.fn() }))
}))

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  security: jest.fn()
}))

const mockTwoFactorService = {
  isTwoFactorEnabledForAdmin: jest.fn(),
  createPendingChallenge: jest.fn(),
  verifyAdminSecondFactor: jest.fn(),
  createAdminSetup: jest.fn(),
  enableAdminTwoFactor: jest.fn(),
  disableAdminTwoFactor: jest.fn(),
  regenerateAdminRecoveryCodes: jest.fn()
}

jest.mock('../src/services/twoFactorService', () =>
  jest.fn().mockImplementation(() => mockTwoFactorService)
)

const bcrypt = require('bcryptjs')
const redis = require('../src/models/redis')
const webRouter = require('../src/routes/web')
describe('admin web 2fa routes', () => {
  const buildApp = () => {
    const app = express()
    app.use(express.json())
    app.use('/web', webRouter)
    return app
  }

  beforeEach(() => {
    jest.clearAllMocks()
    Object.values(mockTwoFactorService).forEach((mockFn) => mockFn.mockReset())
  })

  it('returns a pending login token when admin 2fa is enabled', async () => {
    redis.getSession.mockResolvedValueOnce({
      username: 'admin',
      passwordHash: await bcrypt.hash('secret-pass', 10)
    })

    mockTwoFactorService.isTwoFactorEnabledForAdmin.mockResolvedValue(true)
    mockTwoFactorService.createPendingChallenge.mockResolvedValue({
      pendingLoginToken: 'pending-admin-token',
      pendingLoginExpiresIn: 300000
    })

    const response = await request(buildApp()).post('/web/auth/login').send({
      username: 'admin',
      password: 'secret-pass'
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      requiresTwoFactor: true,
      pendingLoginToken: 'pending-admin-token'
    })
  })

  it('rejects admin verification when the pending login token is missing', async () => {
    const response = await request(buildApp()).post('/web/auth/2fa/verify').send({
      otpCode: '123456'
    })

    expect(response.status).toBe(400)
    expect(response.body.message).toBe('Pending login token is required')
  })
})
