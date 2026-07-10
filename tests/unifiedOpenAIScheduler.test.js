jest.mock('../src/services/account/openaiAccountService', () => ({
  getAllAccounts: jest.fn(),
  isTokenExpired: jest.fn(),
  setAccountRateLimited: jest.fn(),
  updateAccount: jest.fn()
}))

jest.mock('../src/services/account/openaiResponsesAccountService', () => ({
  getAllAccounts: jest.fn(),
  getAccount: jest.fn(),
  isSubscriptionExpired: jest.fn(),
  markAccountRateLimited: jest.fn(),
  updateAccount: jest.fn()
}))

jest.mock('../src/services/accountGroupService', () => ({}))
const savedPolicy = {
  enabled: true,
  platforms: {
    openai: {
      enabled: true,
      fiveHourUtilizationLimit: 100,
      sevenDayUtilizationLimit: 100,
      dailyCostLimit: 0,
      dailyTokenLimit: 0,
      dailyRequestLimit: 0
    },
    claude: {
      enabled: true,
      fiveHourUtilizationLimit: 100,
      sevenDayUtilizationLimit: 100,
      dailyCostLimit: 0,
      dailyTokenLimit: 0,
      dailyRequestLimit: 0
    }
  }
}
jest.mock('../src/models/redis', () => ({
  getClientSafe: jest.fn(() => ({
    get: jest.fn(async (key) => (key === 'account_pool:policy' ? JSON.stringify(savedPolicy) : null))
  }))
}))
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
}))
jest.mock('../src/utils/commonHelper', () => ({
  isSchedulable: jest.fn((value) => value !== false && value !== 'false'),
  sortAccountsByPriority: jest.fn((accounts) => accounts)
}))
jest.mock('../src/utils/upstreamErrorHelper', () => ({
  isTempUnavailable: jest.fn().mockResolvedValue(false)
}))

const openaiResponsesAccountService = require('../src/services/account/openaiResponsesAccountService')
const openaiAccountService = require('../src/services/account/openaiAccountService')
const unifiedOpenAIScheduler = require('../src/services/scheduler/unifiedOpenAIScheduler')

describe('UnifiedOpenAIScheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    savedPolicy.enabled = true
    savedPolicy.platforms.openai.fiveHourUtilizationLimit = 100
    savedPolicy.platforms.openai.sevenDayUtilizationLimit = 100
    savedPolicy.platforms.openai.dailyCostLimit = 0
    savedPolicy.platforms.openai.dailyTokenLimit = 0
    savedPolicy.platforms.openai.dailyRequestLimit = 0
    openaiAccountService.getAllAccounts.mockResolvedValue([])
    openaiAccountService.isTokenExpired.mockReturnValue(false)
    openaiResponsesAccountService.getAllAccounts.mockResolvedValue([])
    openaiResponsesAccountService.isSubscriptionExpired.mockReturnValue(false)
  })

  describe('selectAccountForApiKey', () => {
    it('skips shared OpenAI accounts that exhausted account-pool hard limits', async () => {
      openaiAccountService.getAllAccounts.mockResolvedValue([
        {
          id: 'blocked-openai',
          name: 'Blocked OpenAI',
          isActive: true,
          status: 'active',
          accountType: 'shared',
          primaryWindow: { utilization: 100, remainingSeconds: 300 },
          priority: 1
        },
        {
          id: 'healthy-openai',
          name: 'Healthy OpenAI',
          isActive: true,
          status: 'active',
          accountType: 'shared',
          primaryWindow: { utilization: 20, remainingSeconds: 3000 },
          priority: 2
        }
      ])

      const selected = await unifiedOpenAIScheduler.selectAccountForApiKey({
        id: 'key-1',
        name: 'Gateway Key'
      })

      expect(selected).toEqual({
        accountId: 'healthy-openai',
        accountType: 'openai'
      })
      expect(openaiAccountService.updateAccount).toHaveBeenCalledWith('blocked-openai', {
        schedulable: 'false',
        accountPoolAutoStopped: 'true',
        accountPoolStoppedReason: 'five_hour_limit',
        accountPoolStoppedAt: expect.any(String)
      })
    })

    it('uses saved OpenAI account-pool thresholds during shared-pool selection', async () => {
      savedPolicy.platforms.openai.fiveHourUtilizationLimit = 80
      openaiAccountService.getAllAccounts.mockResolvedValue([
        {
          id: 'threshold-openai',
          name: 'Threshold OpenAI',
          isActive: true,
          status: 'active',
          accountType: 'shared',
          primaryWindow: { utilization: 85, remainingSeconds: 300 },
          priority: 1
        },
        {
          id: 'healthy-openai',
          name: 'Healthy OpenAI',
          isActive: true,
          status: 'active',
          accountType: 'shared',
          primaryWindow: { utilization: 20, remainingSeconds: 3000 },
          priority: 2
        }
      ])

      const selected = await unifiedOpenAIScheduler.selectAccountForApiKey({
        id: 'key-1',
        name: 'Gateway Key'
      })

      expect(selected.accountId).toBe('healthy-openai')
      expect(openaiAccountService.updateAccount).toHaveBeenCalledWith('threshold-openai', {
        schedulable: 'false',
        accountPoolAutoStopped: 'true',
        accountPoolStoppedReason: 'five_hour_limit',
        accountPoolStoppedAt: expect.any(String)
      })
    })
  })

  describe('markAccountRateLimited', () => {
    it('does not disable scheduling again when OpenAI-Responses auto protection is disabled', async () => {
      openaiResponsesAccountService.getAccount.mockResolvedValue({
        id: 'account-1',
        disableAutoProtection: 'true'
      })

      await unifiedOpenAIScheduler.markAccountRateLimited(
        'account-1',
        'openai-responses',
        null,
        120
      )

      expect(openaiResponsesAccountService.markAccountRateLimited).toHaveBeenCalledWith(
        'account-1',
        2
      )
      expect(openaiResponsesAccountService.updateAccount).not.toHaveBeenCalled()
    })

    it('keeps disabling scheduling for protected OpenAI-Responses accounts', async () => {
      openaiResponsesAccountService.getAccount.mockResolvedValue({
        id: 'account-1',
        disableAutoProtection: 'false'
      })

      await unifiedOpenAIScheduler.markAccountRateLimited(
        'account-1',
        'openai-responses',
        null,
        120
      )

      expect(openaiResponsesAccountService.updateAccount).toHaveBeenCalledWith(
        'account-1',
        expect.objectContaining({
          schedulable: 'false'
        })
      )
    })
  })
})
