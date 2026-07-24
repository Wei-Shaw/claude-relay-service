const express = require('express')
const request = require('supertest')

jest.mock('../src/middleware/auth', () => ({
  authenticateAdmin: (req, _res, next) => next()
}))

jest.mock('../src/services/account/openaiResponsesAccountService', () => ({
  getAccount: jest.fn()
}))

jest.mock('../src/services/relay/openaiResponsesRelayService', () => ({
  testAccountConnection: jest.fn(),
  testAccountConfig: jest.fn()
}))

jest.mock('../src/services/apiKeyService', () => ({}))
jest.mock('../src/services/accountGroupService', () => ({}))
jest.mock('../src/utils/webhookNotifier', () => ({}))

jest.mock('../src/services/accountTestSchedulerService', () => ({
  validateCronExpression: jest.fn(),
  refreshAccountTask: jest.fn()
}))

jest.mock('../src/services/connectivityTestModelConfigService', () => ({
  getDefaultModelForPlatform: jest.fn(),
  normalizeTestModel: jest.fn()
}))

jest.mock('../src/models/redis', () => ({
  getAccountTestHistory: jest.fn(),
  getAccountTestConfig: jest.fn(),
  saveAccountTestConfig: jest.fn()
}))

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

const openaiResponsesAccountService = require('../src/services/account/openaiResponsesAccountService')
const accountTestSchedulerService = require('../src/services/accountTestSchedulerService')
const connectivityTestModelConfigService = require('../src/services/connectivityTestModelConfigService')
const redis = require('../src/models/redis')
const openaiResponsesAccountsRouter = require('../src/routes/admin/openaiResponsesAccounts')

const buildApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/admin', openaiResponsesAccountsRouter)
  return app
}

describe('OpenAI Responses scheduled test routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    accountTestSchedulerService.validateCronExpression.mockReturnValue(true)
    accountTestSchedulerService.refreshAccountTask.mockResolvedValue()
    connectivityTestModelConfigService.getDefaultModelForPlatform.mockResolvedValue('gpt-default')
    connectivityTestModelConfigService.normalizeTestModel.mockImplementation((model) => {
      if (typeof model !== 'string' || !model.trim()) {
        return null
      }
      return model.trim()
    })
    openaiResponsesAccountService.getAccount.mockResolvedValue({ id: 'account-1' })
    redis.getAccountTestHistory.mockResolvedValue([])
    redis.getAccountTestConfig.mockResolvedValue(null)
    redis.saveAccountTestConfig.mockResolvedValue()
  })

  test('returns the configured OpenAI default when no schedule exists', async () => {
    const response = await request(buildApp()).get(
      '/admin/openai-responses-accounts/account-1/test-config'
    )

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual({
      accountId: 'account-1',
      platform: 'openai-responses',
      config: {
        enabled: false,
        cronExpression: '0 8 * * *',
        model: 'gpt-default'
      }
    })
    expect(connectivityTestModelConfigService.getDefaultModelForPlatform).toHaveBeenCalledWith(
      'openai-responses'
    )
  })

  test('persists and refreshes an OpenAI Responses schedule', async () => {
    const response = await request(buildApp())
      .put('/admin/openai-responses-accounts/account-1/test-config')
      .send({
        enabled: true,
        cronExpression: '0 */6 * * *',
        model: '  gpt-scheduled  '
      })

    expect(response.status).toBe(200)
    expect(redis.saveAccountTestConfig).toHaveBeenCalledWith('account-1', 'openai-responses', {
      enabled: true,
      cronExpression: '0 */6 * * *',
      model: 'gpt-scheduled'
    })
    expect(accountTestSchedulerService.refreshAccountTask).toHaveBeenCalledWith(
      'account-1',
      'openai-responses'
    )
    expect(response.body.data.config).toEqual({
      enabled: true,
      cronExpression: '0 */6 * * *',
      model: 'gpt-scheduled'
    })
  })

  test('rejects an invalid cron expression before saving', async () => {
    accountTestSchedulerService.validateCronExpression.mockReturnValue(false)

    const response = await request(buildApp())
      .put('/admin/openai-responses-accounts/account-1/test-config')
      .send({
        enabled: true,
        cronExpression: 'invalid cron',
        model: 'gpt-scheduled'
      })

    expect(response.status).toBe(400)
    expect(redis.saveAccountTestConfig).not.toHaveBeenCalled()
  })

  test('returns scheduled test history for the same platform key', async () => {
    const history = [{ success: true, latencyMs: 42, timestamp: '2026-07-15T00:00:00.000Z' }]
    redis.getAccountTestHistory.mockResolvedValue(history)

    const response = await request(buildApp()).get(
      '/admin/openai-responses-accounts/account-1/test-history'
    )

    expect(response.status).toBe(200)
    expect(redis.getAccountTestHistory).toHaveBeenCalledWith('account-1', 'openai-responses')
    expect(response.body.data.history).toEqual(history)
  })
})
