jest.mock('../src/services/account/openaiAccountService', () => ({
  setAccountRateLimited: jest.fn().mockResolvedValue(undefined),
  markAccountUnauthorized: jest.fn().mockResolvedValue(undefined),
  recordUsage: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('../src/services/accountGroupService', () => ({
  getGroupMembers: jest.fn().mockResolvedValue([])
}))

jest.mock('../src/models/redis', () => ({
  getClientSafe: jest.fn().mockReturnValue({
    del: jest.fn().mockResolvedValue(undefined)
  })
}))

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn()
}))

jest.mock('../src/utils/commonHelper', () => ({
  isSchedulable: jest.fn(),
  sortAccountsByPriority: jest.fn((accounts) => accounts)
}))

jest.mock('../src/utils/upstreamErrorHelper', () => ({
  recordErrorHistory: jest.fn().mockResolvedValue(undefined),
  isTempUnavailable: jest.fn().mockResolvedValue(false)
}))

jest.mock(
  '../config/config',
  () => ({
    security: {
      encryptionKey: 'test-encryption-key'
    }
  }),
  { virtual: true }
)

describe('unifiedOpenAIScheduler.markAccountRateLimited', () => {
  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllMocks()
    jest.resetModules()
    jest.restoreAllMocks()
  })

  it('should not override disableAutoProtection for openai-responses accounts', async () => {
    jest.useFakeTimers()

    const openaiResponsesAccountService = require('../src/services/account/openaiResponsesAccountService')
    const upstreamErrorHelper = require('../src/utils/upstreamErrorHelper')
    const scheduler = require('../src/services/scheduler/unifiedOpenAIScheduler')

    jest.spyOn(openaiResponsesAccountService, 'getAccount').mockResolvedValue({
      id: 'acct-1',
      name: 'Protected Account',
      disableAutoProtection: 'true',
      rateLimitDuration: '60'
    })
    const updateAccountSpy = jest
      .spyOn(openaiResponsesAccountService, 'updateAccount')
      .mockResolvedValue({ success: true })

    await scheduler.markAccountRateLimited('acct-1', 'openai-responses', null, 30)

    expect(updateAccountSpy).not.toHaveBeenCalled()
    expect(upstreamErrorHelper.recordErrorHistory).toHaveBeenCalledWith(
      'acct-1',
      'openai-responses',
      429,
      'rate_limit'
    )
  })
})
