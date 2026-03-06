const express = require('express')
const request = require('supertest')

jest.mock('../src/middleware/auth', () => ({
  authenticateAdmin: (req, res, next) => next()
}))

jest.mock('../src/services/relay/claudeConsoleRelayService', () => ({
  testAccountConnection: jest.fn(async (accountId, res) =>
    res.status(200).json({ success: true, accountId })
  )
}))

jest.mock('../src/services/account/claudeConsoleAccountService', () => ({}))
jest.mock('../src/services/accountGroupService', () => ({}))
jest.mock('../src/services/apiKeyService', () => ({}))
jest.mock('../src/models/redis', () => ({}))
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn()
}))
jest.mock('../src/utils/webhookNotifier', () => ({}))
jest.mock('../src/routes/admin/utils', () => ({
  formatAccountExpiry: jest.fn((account) => account),
  mapExpiryField: jest.fn((updates) => updates)
}))

const claudeConsoleRelayService = require('../src/services/relay/claudeConsoleRelayService')
const claudeConsoleAccountsRouter = require('../src/routes/admin/claudeConsoleAccounts')

describe('POST /admin/claude-console-accounts/:accountId/test', () => {
  const buildApp = () => {
    const app = express()
    app.use(express.json())
    app.use('/admin', claudeConsoleAccountsRouter)
    return app
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 400 when model is missing', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/admin/claude-console-accounts/account-1/test')
      .send({})

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'model is required' })
    expect(claudeConsoleRelayService.testAccountConnection).not.toHaveBeenCalled()
  })

  it('passes model through to relay service when provided', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/admin/claude-console-accounts/account-1/test')
      .send({ model: 'claude-sonnet-4-6' })

    expect(response.status).toBe(200)
    expect(claudeConsoleRelayService.testAccountConnection).toHaveBeenCalledTimes(1)
    expect(claudeConsoleRelayService.testAccountConnection).toHaveBeenCalledWith(
      'account-1',
      expect.any(Object),
      'claude-sonnet-4-6'
    )
  })
})
