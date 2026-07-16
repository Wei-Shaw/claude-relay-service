const express = require('express')
const request = require('supertest')

jest.mock('../src/models/redis', () => ({
  getSession: jest.fn(),
  setSession: jest.fn(),
  deleteSession: jest.fn(),
  getClient: jest.fn(() => ({ hset: jest.fn() })),
  getClientSafe: jest.fn(() => ({ del: jest.fn() })),
  scanKeys: jest.fn(),
  batchGetChunked: jest.fn()
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
  getAdminStatus: jest.fn(),
  createAdminSetup: jest.fn(),
  enableAdminTwoFactor: jest.fn(),
  disableAdminTwoFactor: jest.fn(),
  regenerateAdminRecoveryCodes: jest.fn(),
  resetAdminTwoFactor: jest.fn()
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

  const authHeader = {
    Authorization: 'Bearer admin-session'
  }

  beforeEach(() => {
    jest.clearAllMocks()
    Object.values(mockTwoFactorService).forEach((mockFn) => mockFn.mockReset())
    redis.scanKeys.mockResolvedValue([])
    redis.batchGetChunked.mockResolvedValue([])
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
    expect(redis.setSession).not.toHaveBeenCalled()
  })

  it('issues a real admin session after second-factor verification succeeds', async () => {
    mockTwoFactorService.verifyAdminSecondFactor.mockResolvedValue({
      username: 'admin',
      usedRecoveryCode: false
    })

    const response = await request(buildApp()).post('/web/auth/2fa/verify').send({
      pendingLoginToken: 'pending-admin-token',
      otpCode: '123456'
    })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.token).toBeTruthy()
    expect(redis.setSession).toHaveBeenCalledTimes(1)
  })

  it('returns current admin 2fa status for an authenticated session', async () => {
    redis.getSession
      .mockResolvedValueOnce({
        username: 'admin',
        loginTime: '2026-03-29T12:00:00.000Z',
        lastActivity: '2026-03-29T12:00:00.000Z'
      })
      .mockResolvedValueOnce({
        username: 'admin',
        passwordHash: await bcrypt.hash('secret-pass', 10)
      })

    mockTwoFactorService.getAdminStatus.mockResolvedValue({
      enabled: true,
      recoveryCodesGeneratedAt: '2026-03-29T12:00:00.000Z'
    })

    const response = await request(buildApp()).get('/web/auth/2fa/status').set(authHeader)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      twoFactor: {
        enabled: true,
        recoveryCodesGeneratedAt: '2026-03-29T12:00:00.000Z'
      }
    })
  })

  it('creates an admin 2fa setup only after fresh password confirmation', async () => {
    redis.getSession
      .mockResolvedValueOnce({
        username: 'admin',
        loginTime: '2026-03-29T12:00:00.000Z',
        lastActivity: '2026-03-29T12:00:00.000Z'
      })
      .mockResolvedValueOnce({
        username: 'admin',
        passwordHash: await bcrypt.hash('secret-pass', 10)
      })

    mockTwoFactorService.createAdminSetup.mockResolvedValue({
      setupToken: 'setup-token',
      secret: 'SECRET',
      otpauthUrl: 'otpauth://totp/demo',
      qrCodeDataUrl: 'data:image/png;base64,abc'
    })

    const response = await request(buildApp()).post('/web/auth/2fa/setup').set(authHeader).send({
      currentPassword: 'secret-pass'
    })

    expect(response.status).toBe(200)
    expect(mockTwoFactorService.createAdminSetup).toHaveBeenCalledWith({
      accountName: 'admin',
      issuer: 'Claude Relay Service'
    })
    expect(response.body.setupToken).toBe('setup-token')
  })

  it('enables admin 2fa and invalidates current admin session after password confirmation', async () => {
    redis.getSession
      .mockResolvedValueOnce({
        username: 'admin',
        loginTime: '2026-03-29T12:00:00.000Z',
        lastActivity: '2026-03-29T12:00:00.000Z'
      })
      .mockResolvedValueOnce({
        username: 'admin',
        passwordHash: await bcrypt.hash('secret-pass', 10)
      })

    mockTwoFactorService.enableAdminTwoFactor.mockResolvedValue({
      recoveryCodes: ['CODE1', 'CODE2']
    })

    const response = await request(buildApp()).post('/web/auth/2fa/enable').set(authHeader).send({
      currentPassword: 'secret-pass',
      setupToken: 'setup-token',
      otpCode: '123456'
    })

    expect(response.status).toBe(200)
    expect(mockTwoFactorService.enableAdminTwoFactor).toHaveBeenCalledWith({
      setupToken: 'setup-token',
      otpCode: '123456'
    })
    expect(redis.deleteSession).not.toHaveBeenCalled()
    expect(response.body.recoveryCodes).toEqual(['CODE1', 'CODE2'])
  })

  it('disables admin 2fa and invalidates current admin session after password confirmation', async () => {
    redis.getSession
      .mockResolvedValueOnce({
        username: 'admin',
        loginTime: '2026-03-29T12:00:00.000Z',
        lastActivity: '2026-03-29T12:00:00.000Z'
      })
      .mockResolvedValueOnce({
        username: 'admin',
        passwordHash: await bcrypt.hash('secret-pass', 10)
      })

    mockTwoFactorService.disableAdminTwoFactor.mockResolvedValue({
      disabled: true
    })

    const response = await request(buildApp()).post('/web/auth/2fa/disable').set(authHeader).send({
      currentPassword: 'secret-pass',
      otpCode: '123456'
    })

    expect(response.status).toBe(200)
    expect(mockTwoFactorService.disableAdminTwoFactor).toHaveBeenCalledWith({
      otpCode: '123456',
      recoveryCode: undefined
    })
    expect(redis.deleteSession).toHaveBeenCalledWith('admin-session')
  })

  it('regenerates admin recovery codes and invalidates current admin session', async () => {
    redis.getSession
      .mockResolvedValueOnce({
        username: 'admin',
        loginTime: '2026-03-29T12:00:00.000Z',
        lastActivity: '2026-03-29T12:00:00.000Z'
      })
      .mockResolvedValueOnce({
        username: 'admin',
        passwordHash: await bcrypt.hash('secret-pass', 10)
      })

    mockTwoFactorService.regenerateAdminRecoveryCodes.mockResolvedValue({
      recoveryCodes: ['NEWCODE1', 'NEWCODE2']
    })

    const response = await request(buildApp())
      .post('/web/auth/2fa/recovery-codes/regenerate')
      .set(authHeader)
      .send({
        currentPassword: 'secret-pass',
        otpCode: '123456'
      })

    expect(response.status).toBe(200)
    expect(mockTwoFactorService.regenerateAdminRecoveryCodes).toHaveBeenCalledWith({
      otpCode: '123456',
      recoveryCode: undefined
    })
    expect(redis.deleteSession).toHaveBeenCalledWith('admin-session')
    expect(response.body.recoveryCodes).toEqual(['NEWCODE1', 'NEWCODE2'])
  })

  it('rejects admin verification when the pending login token is missing', async () => {
    const response = await request(buildApp()).post('/web/auth/2fa/verify').send({
      otpCode: '123456'
    })

    expect(response.status).toBe(400)
    expect(response.body.message).toBe('Pending login token is required')
  })
})
