jest.mock('../src/middleware/auth', () => ({
  authenticateAdmin: (req, res, next) =>
    req.headers['x-test-admin'] === 'yes' ? next() : res.status(401).json({ success: false })
}))
jest.mock('../src/services/account/openaiAccountService', () => ({ getAccount: jest.fn() }))
jest.mock('../src/services/accountTestSchedulerService', () => ({
  triggerTest: jest.fn(),
  getTestHistory: jest.fn(),
  getTestConfig: jest.fn(),
  setTestConfig: jest.fn(),
  validateCronExpression: jest.fn(),
  getStatus: jest.fn(),
  testingAccounts: new Set()
}))
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}))
jest.mock('../src/utils/proxyHelper', () => ({ createProxyAgent: jest.fn() }))
jest.mock('../src/services/accountGroupService', () => ({}))
jest.mock('../src/services/apiKeyService', () => ({}))
jest.mock('../src/models/redis', () => ({}))
jest.mock('../src/utils/webhookNotifier', () => ({}))

const express = require('express')
const request = require('supertest')
const accounts = require('../src/services/account/openaiAccountService')
const scheduler = require('../src/services/accountTestSchedulerService')
const router = require('../src/routes/admin/openaiAccounts')
const app = express()
app.use(express.json())
app.use('/admin/openai-accounts', router)
const base = '/admin/openai-accounts/account-1'
const admin = (req) => req.set('x-test-admin', 'yes')

describe('OpenAI admin test routes', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    scheduler.testingAccounts.clear()
    accounts.getAccount.mockResolvedValue({ id: 'account-1' })
    scheduler.validateCronExpression.mockReturnValue(true)
    scheduler.getStatus.mockReturnValue({ currentlyTesting: [] })
    scheduler.getTestConfig.mockResolvedValue(null)
    scheduler.triggerTest.mockResolvedValue({ success: true, model: 'gpt-5.5', message: 'OK' })
  })

  test.each(['test', 'test-sync'])(
    '%s rejects non-admin requests before probing',
    async (endpoint) => {
      const res = await request(app).post(`${base}/${endpoint}`).send({})
      expect([401, 403]).toContain(res.status)
      expect(scheduler.triggerTest).not.toHaveBeenCalled()
    }
  )

  test.each(['test', 'test-sync'])(
    '%s returns actual probe result and uses default model',
    async (endpoint) => {
      const res = await admin(request(app).post(`${base}/${endpoint}`)).send({})
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.result.success).toBe(true)
      expect(scheduler.triggerTest).toHaveBeenCalledWith('account-1', 'openai', 'gpt-5.5')
    }
  )

  test.each(['test', 'test-sync'])(
    '%s restores the saved account model when omitted',
    async (endpoint) => {
      scheduler.getTestConfig.mockResolvedValue({ enabled: true, model: 'gpt-5.6-luna' })
      const res = await admin(request(app).post(`${base}/${endpoint}`)).send({})
      expect(res.status).toBe(200)
      expect(scheduler.triggerTest).toHaveBeenCalledWith('account-1', 'openai', 'gpt-5.6-luna')
      expect(res.body.data.model).toBe('gpt-5.6-luna')
    }
  )

  test('an explicit model overrides the saved account model', async () => {
    scheduler.getTestConfig.mockResolvedValue({ enabled: true, model: 'gpt-5.6-luna' })
    const res = await admin(request(app).post(`${base}/test`)).send({ model: 'gpt-5.5' })
    expect(res.status).toBe(200)
    expect(scheduler.triggerTest).toHaveBeenCalledWith('account-1', 'openai', 'gpt-5.5')
    expect(res.body.data.model).toBe('gpt-5.5')
  })

  test('upstream failure remains a failure in the top-level JSON response', async () => {
    scheduler.triggerTest.mockResolvedValue({
      success: false,
      code: 'RATE_LIMITED',
      error: 'safe-error'
    })
    const res = await admin(request(app).post(`${base}/test`)).send({ model: 'gpt-5.5' })
    expect(res.body.success).toBe(false)
    expect(res.body.data.result.code).toBe('RATE_LIMITED')
  })

  test('unknown account returns 404 without probing', async () => {
    accounts.getAccount.mockResolvedValue(null)
    const res = await admin(request(app).post(`${base}/test`)).send({})
    expect(res.status).toBe(404)
    expect(scheduler.triggerTest).not.toHaveBeenCalled()
  })

  test('invalid model returns 400 without probing', async () => {
    const res = await admin(request(app).post(`${base}/test`)).send({ model: { injected: true } })
    expect(res.status).toBe(400)
    expect(scheduler.triggerTest).not.toHaveBeenCalled()
  })

  test('duplicate test returns 409', async () => {
    scheduler.testingAccounts.add('openai:account-1')
    scheduler.getStatus.mockReturnValue({ currentlyTesting: ['openai:account-1'] })
    scheduler.triggerTest.mockResolvedValue(undefined)
    const res = await admin(request(app).post(`${base}/test`)).send({})
    expect(res.status).toBe(409)
  })

  test('configuration updates use the OpenAI platform', async () => {
    const config = { enabled: true, cronExpression: '*/5 * * * *', model: 'gpt-5.5' }
    scheduler.getTestConfig.mockResolvedValue(config)
    const res = await admin(request(app).put(`${base}/test-config`)).send(config)
    expect(res.status).toBe(200)
    expect(scheduler.setTestConfig).toHaveBeenCalledWith('account-1', 'openai', config)
  })

  test('failed persistence does not report a successful configuration update', async () => {
    scheduler.getTestConfig.mockResolvedValue(null)
    const res = await admin(request(app).put(`${base}/test-config`)).send({
      enabled: true,
      cronExpression: '*/5 * * * *',
      model: 'gpt-5.5'
    })
    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(res.body.code).toBe('CONFIG_WRITE_FAILED')
  })

  test('invalid cron is rejected before persistence', async () => {
    scheduler.validateCronExpression.mockReturnValue(false)
    const res = await admin(request(app).put(`${base}/test-config`)).send({
      enabled: true,
      cronExpression: 'invalid',
      model: 'gpt-5.5'
    })
    expect(res.status).toBe(400)
    expect(scheduler.setTestConfig).not.toHaveBeenCalled()
  })

  test('configuration and history read the requested account namespace', async () => {
    scheduler.getTestConfig.mockResolvedValue({ enabled: false, model: 'gpt-5.5' })
    scheduler.getTestHistory.mockResolvedValue([{ success: false, code: 'TIMEOUT' }])
    const config = await admin(request(app).get(`${base}/test-config`))
    const history = await admin(request(app).get(`${base}/test-history`))
    expect(config.status).toBe(200)
    expect(history.status).toBe(200)
    expect(scheduler.getTestConfig).toHaveBeenCalledWith('account-1', 'openai')
    expect(scheduler.getTestHistory).toHaveBeenCalledWith('account-1', 'openai')
    expect(JSON.stringify(history.body)).toContain('TIMEOUT')
  })
})
