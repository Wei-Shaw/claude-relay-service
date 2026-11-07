jest.mock('../src/services/openaiAccountTestService', () => ({ testAccount: jest.fn() }), {
  virtual: true
})
jest.mock('../src/models/redis', () => ({
  saveAccountTestResult: jest.fn(),
  setAccountLastTestTime: jest.fn(),
  getAccountTestHistory: jest.fn(),
  getAccountTestConfig: jest.fn(),
  saveAccountTestConfig: jest.fn(),
  getEnabledTestAccounts: jest.fn()
}))
jest.mock('node-cron', () => ({ validate: jest.fn(), schedule: jest.fn() }))
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}))

const probe = require('../src/services/openaiAccountTestService')
const redis = require('../src/models/redis')
const cron = require('node-cron')
const scheduler = require('../src/services/accountTestSchedulerService')

describe('OpenAI scheduler integration', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    cron.validate.mockReturnValue(true)
    cron.schedule.mockReturnValue({ stop: jest.fn() })
    redis.getEnabledTestAccounts.mockResolvedValue([])
  })
  afterEach(() => scheduler.stop())

  test.each([true, false])(
    'manual probe persists actual success=%s and updates last test time',
    async (success) => {
      const result = {
        success,
        model: 'gpt-5.5',
        latencyMs: 17,
        timestamp: new Date().toISOString()
      }
      probe.testAccount.mockResolvedValue(result)
      expect(await scheduler.triggerTest('account-1', 'openai', 'gpt-5.5')).toEqual(result)
      expect(probe.testAccount).toHaveBeenCalledWith('account-1', 'gpt-5.5')
      expect(redis.saveAccountTestResult).toHaveBeenCalledWith('account-1', 'openai', result)
      expect(redis.setAccountLastTestTime).toHaveBeenCalledWith('account-1', 'openai')
    }
  )

  test('scheduled callback tests the configured OpenAI account and model', async () => {
    redis.getEnabledTestAccounts.mockImplementation(async (platform) =>
      platform === 'openai'
        ? [{ accountId: 'scheduled-account', cronExpression: '*/5 * * * *', model: 'gpt-5.5' }]
        : []
    )
    probe.testAccount.mockResolvedValue({ success: true })
    await scheduler.start()
    expect(cron.schedule).toHaveBeenCalledTimes(1)
    await cron.schedule.mock.calls[0][1]()
    expect(probe.testAccount).toHaveBeenCalledWith('scheduled-account', 'gpt-5.5')
    expect(redis.saveAccountTestResult).toHaveBeenCalledWith('scheduled-account', 'openai', {
      success: true
    })
  })

  test('overlapping triggers send only one upstream request', async () => {
    let finish
    probe.testAccount.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const first = scheduler.triggerTest('account-1', 'openai', 'gpt-5.5')
    await scheduler.triggerTest('account-1', 'openai', 'gpt-5.5')
    expect(probe.testAccount).toHaveBeenCalledTimes(1)
    finish({ success: true })
    await first
    expect(redis.saveAccountTestResult).toHaveBeenCalledTimes(1)
  })
})
