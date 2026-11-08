const express = require('express')
const request = require('supertest')

jest.mock('../src/middleware/auth', () => ({
  authenticateAdmin: (req, _res, next) => next()
}))

jest.mock('../src/services/connectivityTestModelConfigService', () => ({
  getDefaultModelForPlatform: jest.fn(async (platform) => `${platform}-default`),
  normalizeTestModel: jest.fn((model) => {
    if (typeof model !== 'string' || !model.trim()) {
      return null
    }
    return model.trim()
  })
}))

jest.mock('../src/services/relay/claudeRelayService', () => ({
  testAccountConnection: jest.fn(async (_accountId, res) => res.status(200).json({ success: true }))
}))

jest.mock('../src/services/account/bedrockAccountService', () => ({
  testAccountConnection: jest.fn(async (_accountId, res) => res.status(200).json({ success: true }))
}))

jest.mock('../src/services/account/claudeAccountService', () => ({}))
jest.mock('../src/services/accountGroupService', () => ({}))
jest.mock('../src/services/accountTestSchedulerService', () => ({}))
jest.mock('../src/services/apiKeyService', () => ({}))
jest.mock('../src/models/redis', () => ({}))
jest.mock('../src/utils/oauthHelper', () => ({}))
jest.mock('../src/utils/costCalculator', () => ({}))
jest.mock('../src/utils/webhookNotifier', () => ({}))
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn()
}))
jest.mock('../src/routes/admin/utils', () => ({
  formatAccountExpiry: jest.fn((account) => account),
  mapExpiryField: jest.fn((updates) => updates)
}))

const claudeRelayService = require('../src/services/relay/claudeRelayService')
const bedrockAccountService = require('../src/services/account/bedrockAccountService')
const claudeAccountsRouter = require('../src/routes/admin/claudeAccounts')
const bedrockAccountsRouter = require('../src/routes/admin/bedrockAccounts')

const buildApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/admin', claudeAccountsRouter)
  app.use('/admin/bedrock-accounts', bedrockAccountsRouter)
  return app
}

describe('connectivity test account routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('passes the selected model to the Claude relay service', async () => {
    const response = await request(buildApp())
      .post('/admin/claude-accounts/account-1/test')
      .send({ model: 'claude-custom' })

    expect(response.status).toBe(200)
    expect(claudeRelayService.testAccountConnection).toHaveBeenCalledWith(
      'account-1',
      expect.any(Object),
      'claude-custom'
    )
  })

  test('passes the selected model to the Bedrock account service', async () => {
    const response = await request(buildApp())
      .post('/admin/bedrock-accounts/account-1/test')
      .send({ model: 'bedrock-custom' })

    expect(response.status).toBe(200)
    expect(bedrockAccountService.testAccountConnection).toHaveBeenCalledWith(
      'account-1',
      expect.any(Object),
      'bedrock-custom'
    )
  })

  test('uses configured defaults when model is omitted', async () => {
    await request(buildApp()).post('/admin/claude-accounts/account-1/test').send({})
    await request(buildApp()).post('/admin/bedrock-accounts/account-1/test').send({})

    expect(claudeRelayService.testAccountConnection).toHaveBeenCalledWith(
      'account-1',
      expect.any(Object),
      'claude-default'
    )
    expect(bedrockAccountService.testAccountConnection).toHaveBeenCalledWith(
      'account-1',
      expect.any(Object),
      'bedrock-default'
    )
  })
})
