jest.mock('../src/middleware/auth', () => ({
  authenticateAdmin: (_req, _res, next) => next()
}))
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn()
}))
jest.mock('../src/services/account/bedrockAccountService', () => ({
  getAllAccounts: jest.fn(),
  createAccount: jest.fn(),
  updateAccount: jest.fn(),
  testAccountConnection: jest.fn(),
  deleteAccount: jest.fn(),
  resetAccountStatus: jest.fn()
}))
jest.mock('../src/services/apiKeyService', () => ({}))
jest.mock('../src/services/accountGroupService', () => ({
  getAccountGroups: jest.fn()
}))
jest.mock('../src/models/redis', () => ({
  getAccountUsageStats: jest.fn()
}))
jest.mock('../src/utils/webhookNotifier', () => ({}))

const express = require('express')
const request = require('supertest')
const service = require('../src/services/account/bedrockAccountService')
const redis = require('../src/models/redis')
const accountGroupService = require('../src/services/accountGroupService')
const router = require('../src/routes/admin/bedrockAccounts')
const { BEDROCK_TEST_MODEL } = require('../config/models')

describe('Bedrock admin routes', () => {
  let app

  beforeEach(() => {
    jest.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use('/api/admin/bedrock-accounts', router)
    accountGroupService.getAccountGroups.mockResolvedValue([])
  })

  test('passes the selected model to the real SSE connection test', async () => {
    service.testAccountConnection.mockImplementation(async (accountId, res, model) => {
      res.json({ accountId, model })
    })

    const response = await request(app)
      .post('/api/admin/bedrock-accounts/account-1/test')
      .send({ model: BEDROCK_TEST_MODEL })

    expect(response.status).toBe(200)
    expect(service.testAccountConnection).toHaveBeenCalledWith(
      'account-1',
      expect.anything(),
      BEDROCK_TEST_MODEL
    )
  })

  test('maps create expiry and accepts the default credential chain', async () => {
    const expiresAt = '2030-01-01T00:00:00.000Z'
    service.createAccount.mockResolvedValue({
      success: true,
      data: {
        id: 'account-1',
        region: 'us-west-2',
        credentialType: 'default',
        subscriptionExpiresAt: expiresAt,
        tokenExpiresAt: null,
        expiresAt
      }
    })

    const response = await request(app).post('/api/admin/bedrock-accounts').send({
      name: 'Role account',
      region: ' us-west-2 ',
      credentialType: 'default',
      expiresAt
    })

    expect(response.status).toBe(200)
    expect(service.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialType: 'default',
        region: 'us-west-2',
        subscriptionExpiresAt: expiresAt
      })
    )
    expect(response.body.data).toEqual(
      expect.objectContaining({
        subscriptionExpiresAt: expiresAt,
        tokenExpiresAt: null,
        expiresAt
      })
    )
  })

  test('propagates Bedrock validation failures as HTTP 400', async () => {
    const response = await request(app).post('/api/admin/bedrock-accounts').send({
      name: 'Invalid account',
      region: 'not-a-region',
      credentialType: 'default'
    })

    expect(response.status).toBe(400)
    expect(response.body.message).toMatch('Invalid AWS Region')
    expect(service.createAccount).not.toHaveBeenCalled()
  })

  test('rejects an explicitly empty Region instead of applying the default', async () => {
    const response = await request(app).post('/api/admin/bedrock-accounts').send({
      name: 'Empty Region account',
      region: '',
      credentialType: 'default'
    })

    expect(response.status).toBe(400)
    expect(response.body.message).toBe('AWS Region is required')
    expect(service.createAccount).not.toHaveBeenCalled()
  })

  test('passes access key patches through without synthesizing omitted fields', async () => {
    service.updateAccount.mockResolvedValue({ success: true, data: { id: 'account-1' } })

    const response = await request(app)
      .put('/api/admin/bedrock-accounts/account-1')
      .send({ awsCredentials: { secretAccessKey: 'rotated-secret' } })

    expect(response.status).toBe(200)
    expect(service.updateAccount).toHaveBeenCalledWith('account-1', {
      awsCredentials: { secretAccessKey: 'rotated-secret' }
    })
  })

  test('returns HTTP 400 for invalid Region updates', async () => {
    const response = await request(app)
      .put('/api/admin/bedrock-accounts/account-1')
      .send({ region: 'invalid' })

    expect(response.status).toBe(400)
    expect(response.body.message).toMatch('Invalid AWS Region')
    expect(service.updateAccount).not.toHaveBeenCalled()
  })

  test('returns HTTP 400 for empty Region updates', async () => {
    const response = await request(app)
      .put('/api/admin/bedrock-accounts/account-1')
      .send({ region: '' })

    expect(response.status).toBe(400)
    expect(response.body.message).toBe('AWS Region is required')
    expect(service.updateAccount).not.toHaveBeenCalled()
  })

  test('queries usage statistics with the bedrock platform key', async () => {
    const expiresAt = '2030-01-01T00:00:00.000Z'
    service.getAllAccounts.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'account-1',
          name: 'Bedrock',
          platform: 'bedrock',
          subscriptionExpiresAt: expiresAt,
          tokenExpiresAt: null,
          expiresAt
        }
      ]
    })
    redis.getAccountUsageStats.mockResolvedValue({
      daily: { tokens: 1 },
      total: { tokens: 2 },
      averages: { rpm: 0, tpm: 0 }
    })

    const response = await request(app).get('/api/admin/bedrock-accounts')

    expect(response.status).toBe(200)
    expect(redis.getAccountUsageStats).toHaveBeenCalledWith('account-1', 'bedrock')
    expect(response.body.data[0]).toEqual(
      expect.objectContaining({
        subscriptionExpiresAt: expiresAt,
        tokenExpiresAt: null,
        expiresAt
      })
    )
  })
})
