const express = require('express')
const request = require('supertest')

jest.mock('../config/config', () => ({
  ldap: { enabled: true },
  userManagement: {
    enabled: true,
    userSessionTimeout: 86400000
  },
  security: {
    encryptionKey: 'test-encryption-key'
  }
}))

jest.mock('../src/services/ldapService', () => ({
  authenticateUserCredentials: jest.fn(),
  verifyUserCredentials: jest.fn()
}))

jest.mock('../src/services/userService', () => ({
  createUserSession: jest.fn(),
  validateUserSession: jest.fn(),
  invalidateUserSession: jest.fn(),
  invalidateUserSessions: jest.fn(),
  invalidateOtherUserSessions: jest.fn(),
  getUserById: jest.fn()
}))

jest.mock('../src/services/apiKeyService', () => ({}))

jest.mock('../src/models/redis', () => ({
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  getClientSafe: jest.fn(() => ({}))
}))

jest.mock('../src/middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.user = { id: 'user-1', username: 'alice', sessionToken: 'user-session-token' }
    next()
  },
  authenticateUserOrAdmin: (req, res, next) => {
    req.admin = { username: 'admin' }
    next()
  },
  requireAdmin: (req, res, next) => next()
}))

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  security: jest.fn()
}))

jest.mock('../src/utils/inputValidator', () => ({
  validateUsername: jest.fn((value) => value),
  validatePassword: jest.fn()
}))

jest.mock('rate-limiter-flexible', () => ({
  RateLimiterRedis: jest.fn().mockImplementation(() => ({
    consume: jest.fn().mockResolvedValue({})
  }))
}))

const mockTwoFactorService = {
  isTwoFactorEnabledForUser: jest.fn(),
  createPendingChallenge: jest.fn(),
  verifyUserSecondFactor: jest.fn(),
  getUserStatus: jest.fn(),
  createUserSetup: jest.fn(),
  enableUserTwoFactor: jest.fn(),
  disableUserTwoFactor: jest.fn(),
  regenerateUserRecoveryCodes: jest.fn(),
  resetUserTwoFactor: jest.fn()
}

jest.mock('../src/services/twoFactorService', () =>
  jest.fn().mockImplementation(() => mockTwoFactorService)
)

const ldapService = require('../src/services/ldapService')
const userService = require('../src/services/userService')
const userRoutes = require('../src/routes/userRoutes')

describe('user routes with two-factor auth', () => {
  const buildApp = () => {
    const app = express()
    app.use(express.json())
    app.use('/users', userRoutes)
    return app
  }

  beforeEach(() => {
    jest.clearAllMocks()
    Object.values(mockTwoFactorService).forEach((mockFn) => mockFn.mockReset())
  })

  it('returns a pending login challenge when ldap succeeds and user 2fa is enabled', async () => {
    ldapService.authenticateUserCredentials.mockResolvedValue({
      success: true,
      user: { id: 'user-1', username: 'alice', role: 'user' },
      sessionToken: 'ldap-issued-session'
    })

    mockTwoFactorService.isTwoFactorEnabledForUser.mockResolvedValue(true)
    mockTwoFactorService.createPendingChallenge.mockResolvedValue({
      pendingLoginToken: 'pending-user-token',
      pendingLoginExpiresIn: 300000
    })

    const response = await request(buildApp()).post('/users/login').send({
      username: 'alice',
      password: 'ldap-secret'
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      requiresTwoFactor: true,
      pendingLoginToken: 'pending-user-token'
    })
    expect(userService.createUserSession).not.toHaveBeenCalled()
    expect(userService.invalidateUserSession).toHaveBeenCalledWith('ldap-issued-session')
  })

  it('creates a real user session only after user second-factor verification succeeds', async () => {
    mockTwoFactorService.verifyUserSecondFactor.mockResolvedValue({
      subjectId: 'user-1',
      username: 'alice',
      usedRecoveryCode: false
    })
    userService.createUserSession.mockResolvedValue('final-session-token')
    userService.getUserById.mockResolvedValue({
      id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      displayName: 'Alice',
      firstName: 'Alice',
      lastName: 'Tester',
      role: 'user'
    })

    const response = await request(buildApp()).post('/users/2fa/verify').send({
      pendingLoginToken: 'pending-user-token',
      otpCode: '123456'
    })

    expect(response.status).toBe(200)
    expect(mockTwoFactorService.verifyUserSecondFactor).toHaveBeenCalledWith({
      pendingLoginToken: 'pending-user-token',
      otpCode: '123456',
      recoveryCode: undefined
    })
    expect(userService.createUserSession).toHaveBeenCalledWith('user-1')
    expect(response.body).toMatchObject({
      success: true,
      sessionToken: 'final-session-token',
      user: {
        id: 'user-1',
        username: 'alice'
      }
    })
  })

  it('returns current user 2fa status for an authenticated user session', async () => {
    mockTwoFactorService.getUserStatus.mockResolvedValue({
      enabled: true,
      recoveryCodesGeneratedAt: '2026-03-29T12:00:00.000Z'
    })

    const response = await request(buildApp()).get('/users/2fa/status')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      twoFactor: {
        enabled: true,
        recoveryCodesGeneratedAt: '2026-03-29T12:00:00.000Z'
      }
    })
  })

  it('creates a user 2fa setup only after fresh ldap password confirmation', async () => {
    ldapService.verifyUserCredentials.mockResolvedValue({
      success: true
    })
    mockTwoFactorService.createUserSetup.mockResolvedValue({
      setupToken: 'setup-token',
      secret: 'SECRET',
      otpauthUrl: 'otpauth://totp/demo',
      qrCodeDataUrl: 'data:image/png;base64,abc'
    })

    const response = await request(buildApp()).post('/users/2fa/setup').send({
      currentPassword: 'ldap-secret'
    })

    expect(response.status).toBe(200)
    expect(ldapService.verifyUserCredentials).toHaveBeenCalledWith('alice', 'ldap-secret')
    expect(mockTwoFactorService.createUserSetup).toHaveBeenCalledWith({
      userId: 'user-1',
      accountName: 'alice',
      issuer: 'Claude Relay Service'
    })
  })

  it('enables user 2fa and keeps the current user session after fresh ldap password confirmation', async () => {
    ldapService.verifyUserCredentials.mockResolvedValue({
      success: true
    })
    mockTwoFactorService.enableUserTwoFactor.mockResolvedValue({
      recoveryCodes: ['CODE1', 'CODE2']
    })

    const response = await request(buildApp()).post('/users/2fa/enable').send({
      currentPassword: 'ldap-secret',
      setupToken: 'setup-token',
      otpCode: '123456'
    })

    expect(response.status).toBe(200)
    expect(mockTwoFactorService.enableUserTwoFactor).toHaveBeenCalledWith({
      userId: 'user-1',
      setupToken: 'setup-token',
      otpCode: '123456'
    })
    expect(userService.invalidateOtherUserSessions).toHaveBeenCalledWith(
      'user-1',
      'user-session-token'
    )
    expect(userService.invalidateUserSessions).not.toHaveBeenCalled()
    expect(response.body.recoveryCodes).toEqual(['CODE1', 'CODE2'])
  })

  it('disables user 2fa and invalidates user sessions after fresh ldap password confirmation', async () => {
    ldapService.verifyUserCredentials.mockResolvedValue({
      success: true
    })
    mockTwoFactorService.disableUserTwoFactor.mockResolvedValue({
      disabled: true
    })

    const response = await request(buildApp()).post('/users/2fa/disable').send({
      currentPassword: 'ldap-secret',
      otpCode: '123456'
    })

    expect(response.status).toBe(200)
    expect(mockTwoFactorService.disableUserTwoFactor).toHaveBeenCalledWith({
      userId: 'user-1',
      otpCode: '123456',
      recoveryCode: undefined
    })
    expect(userService.invalidateUserSessions).toHaveBeenCalledWith('user-1')
  })

  it('regenerates user recovery codes and invalidates user sessions after fresh ldap password confirmation', async () => {
    ldapService.verifyUserCredentials.mockResolvedValue({
      success: true
    })
    mockTwoFactorService.regenerateUserRecoveryCodes.mockResolvedValue({
      recoveryCodes: ['NEWCODE1', 'NEWCODE2']
    })

    const response = await request(buildApp()).post('/users/2fa/recovery-codes/regenerate').send({
      currentPassword: 'ldap-secret',
      otpCode: '123456'
    })

    expect(response.status).toBe(200)
    expect(mockTwoFactorService.regenerateUserRecoveryCodes).toHaveBeenCalledWith({
      userId: 'user-1',
      otpCode: '123456',
      recoveryCode: undefined
    })
    expect(userService.invalidateUserSessions).toHaveBeenCalledWith('user-1')
    expect(response.body.recoveryCodes).toEqual(['NEWCODE1', 'NEWCODE2'])
  })

  it('lets an admin reset a user 2fa config and invalidates user sessions', async () => {
    mockTwoFactorService.resetUserTwoFactor.mockResolvedValue({ userId: 'user-1' })

    const response = await request(buildApp()).post('/users/user-1/reset-2fa').send({})

    expect(response.status).toBe(200)
    expect(mockTwoFactorService.resetUserTwoFactor).toHaveBeenCalledWith({ userId: 'user-1' })
    expect(userService.invalidateUserSessions).toHaveBeenCalledWith('user-1')
  })
})
