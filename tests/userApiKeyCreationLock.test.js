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

jest.mock('../config/config', () => ({
  userManagement: {
    enabled: true,
    maxApiKeysPerUser: 1,
    allowUserDeleteApiKeys: true
  },
  ldap: {
    enabled: true
  }
}))

jest.mock('../src/services/ldapService', () => ({}))

const mockUpdateUserApiKeyCount = jest.fn()
jest.mock('../src/services/userService', () => ({
  updateUserApiKeyCount: (...args) => mockUpdateUserApiKeyCount(...args)
}))

let mockCreatedKeys = []
jest.mock('../src/services/apiKeyService', () => ({
  getUserApiKeys: jest.fn(async () => mockCreatedKeys),
  createApiKey: jest.fn(async (apiKeyData) => {
    await new Promise((resolve) => setTimeout(resolve, 25))
    const newKey = {
      id: `key-${mockCreatedKeys.length + 1}`,
      apiKey: `sk-${mockCreatedKeys.length + 1}`,
      ...apiKeyData,
      createdAt: new Date('2030-01-01T00:00:00.000Z').toISOString()
    }
    mockCreatedKeys.push(newKey)
    return newKey
  })
}))

let mockLockHeld = false
jest.mock('../src/models/redis', () => ({
  getClientSafe: jest.fn(() => ({})),
  setAccountLock: jest.fn(async () => {
    if (mockLockHeld) {
      return false
    }
    mockLockHeld = true
    return true
  }),
  releaseAccountLock: jest.fn(async () => {
    mockLockHeld = false
  })
}))

jest.mock('../src/middleware/auth', () => ({
  authenticateUser: (req, _res, next) => {
    req.user = { id: 'user-1', username: 'alice' }
    next()
  },
  authenticateUserOrAdmin: (_req, _res, next) => next(),
  requireAdmin: (_req, res) => res.status(403).json({ error: 'Admin access required' })
}))

const apiKeyService = require('../src/services/apiKeyService')
const userRoutes = require('../src/routes/userRoutes')

describe('user API key creation lock', () => {
  const buildApp = () => {
    const app = express()
    app.use(express.json())
    app.use('/users', userRoutes)
    return app
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockCreatedKeys = []
    mockLockHeld = false
  })

  it('enforces max keys when two create requests arrive concurrently', async () => {
    const [first, second] = await Promise.all([
      request(buildApp()).post('/users/api-keys').send({ name: 'one' }),
      request(buildApp()).post('/users/api-keys').send({ name: 'two' })
    ])

    expect([first.status, second.status].sort()).toEqual([201, 400])
    expect(mockCreatedKeys).toHaveLength(1)
    expect(apiKeyService.createApiKey).toHaveBeenCalledTimes(1)
    expect(mockUpdateUserApiKeyCount).toHaveBeenCalledWith('user-1', 1)
  })
})
