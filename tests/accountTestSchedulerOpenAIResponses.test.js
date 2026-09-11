const mockTask = {
  stop: jest.fn()
}

jest.mock('node-cron', () => ({
  validate: jest.fn(() => true),
  schedule: jest.fn(() => mockTask)
}))

jest.mock('../src/models/redis', () => ({
  getEnabledTestAccounts: jest.fn(),
  saveAccountTestResult: jest.fn(),
  setAccountLastTestTime: jest.fn(),
  getAccountTestConfig: jest.fn(),
  saveAccountTestConfig: jest.fn()
}))

jest.mock('../src/services/relay/openaiResponsesRelayService', () => ({
  testAccountConnection: jest.fn()
}))

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

const cron = require('node-cron')
const redis = require('../src/models/redis')
const openaiResponsesRelayService = require('../src/services/relay/openaiResponsesRelayService')
const accountTestSchedulerService = require('../src/services/accountTestSchedulerService')

describe('accountTestSchedulerService OpenAI Responses support', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    accountTestSchedulerService.scheduledTasks.clear()
    accountTestSchedulerService.testingAccounts.clear()
    accountTestSchedulerService.isStarted = false
    redis.getEnabledTestAccounts.mockResolvedValue([])
    redis.saveAccountTestResult.mockResolvedValue()
    redis.setAccountLastTestTime.mockResolvedValue()
  })

  test('discovers and schedules enabled OpenAI Responses accounts', async () => {
    redis.getEnabledTestAccounts.mockImplementation(async (platform) =>
      platform === 'openai-responses'
        ? [{ accountId: 'account-1', cronExpression: '0 */6 * * *', model: 'gpt-scheduled' }]
        : []
    )

    await accountTestSchedulerService._refreshAllTasks()

    expect(redis.getEnabledTestAccounts).toHaveBeenCalledWith('openai-responses')
    expect(cron.schedule).toHaveBeenCalledWith(
      '0 */6 * * *',
      expect.any(Function),
      expect.objectContaining({ scheduled: true })
    )
    expect(accountTestSchedulerService.scheduledTasks.has('openai-responses:account-1')).toBe(true)
  })

  test('runs the Responses relay test and stores a normalized history record', async () => {
    openaiResponsesRelayService.testAccountConnection.mockResolvedValue({
      accountId: 'account-1',
      accountName: 'Responses account',
      model: 'gpt-scheduled',
      latency: 42,
      responseText: 'ok'
    })

    const result = await accountTestSchedulerService.triggerTest(
      'account-1',
      'openai-responses',
      'gpt-scheduled'
    )

    expect(openaiResponsesRelayService.testAccountConnection).toHaveBeenCalledWith(
      'account-1',
      'gpt-scheduled'
    )
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        latency: 42,
        latencyMs: 42,
        responseText: 'ok'
      })
    )
    expect(redis.saveAccountTestResult).toHaveBeenCalledWith(
      'account-1',
      'openai-responses',
      result
    )
    expect(redis.setAccountLastTestTime).toHaveBeenCalledWith('account-1', 'openai-responses')
  })
})
