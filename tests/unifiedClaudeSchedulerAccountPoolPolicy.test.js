const claudeAccounts = []
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
  getAllClaudeAccounts: jest.fn(async () => claudeAccounts),
  getClaudeAccount: jest.fn(),
  getClientSafe: jest.fn(() => ({
    get: jest.fn(async (key) => (key === 'account_pool:policy' ? JSON.stringify(savedPolicy) : null)),
    setex: jest.fn(),
    del: jest.fn(),
    ttl: jest.fn()
  }))
}))

jest.mock('../src/services/account/claudeAccountService', () => ({
  isAccountRateLimited: jest.fn().mockResolvedValue(false),
  isAccountOpusRateLimited: jest.fn().mockResolvedValue(false),
  isAccountFableRateLimited: jest.fn().mockResolvedValue(false),
  updateAccount: jest.fn()
}))

jest.mock('../src/services/account/claudeConsoleAccountService', () => ({
  getAllAccounts: jest.fn().mockResolvedValue([])
}))

jest.mock('../src/services/account/bedrockAccountService', () => ({
  getAllAccounts: jest.fn().mockResolvedValue({ success: true, data: [] })
}))

jest.mock('../src/services/account/ccrAccountService', () => ({
  getAllAccounts: jest.fn().mockResolvedValue([])
}))

jest.mock('../src/services/accountGroupService', () => ({}))
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
}))
jest.mock('../src/utils/upstreamErrorHelper', () => ({
  isTempUnavailable: jest.fn().mockResolvedValue(false)
}))

const unifiedClaudeScheduler = require('../src/services/scheduler/unifiedClaudeScheduler')
const claudeAccountService = require('../src/services/account/claudeAccountService')

describe('UnifiedClaudeScheduler account-pool policy', () => {
  beforeEach(() => {
    claudeAccounts.length = 0
    jest.clearAllMocks()
    savedPolicy.enabled = true
    savedPolicy.platforms.claude.fiveHourUtilizationLimit = 100
    savedPolicy.platforms.claude.sevenDayUtilizationLimit = 100
    savedPolicy.platforms.claude.dailyCostLimit = 0
    savedPolicy.platforms.claude.dailyTokenLimit = 0
    savedPolicy.platforms.claude.dailyRequestLimit = 0
  })

  test('skips shared Claude OAuth accounts that exhausted 5h hard limits', async () => {
    claudeAccounts.push(
      {
        id: 'blocked-claude',
        name: 'Blocked Claude',
        isActive: 'true',
        status: 'active',
        schedulable: 'true',
        accountType: 'shared',
        fiveHourWindow: { utilization: 100, remainingSeconds: 300 },
        priority: 1
      },
      {
        id: 'healthy-claude',
        name: 'Healthy Claude',
        isActive: 'true',
        status: 'active',
        schedulable: 'true',
        accountType: 'shared',
        fiveHourWindow: { utilization: 20, remainingSeconds: 3000 },
        priority: 2
      }
    )

    const accounts = await unifiedClaudeScheduler._getAllAvailableAccounts({}, 'claude-sonnet-4')

    expect(accounts.map((account) => account.accountId)).toEqual(['healthy-claude'])
    expect(claudeAccountService.updateAccount).toHaveBeenCalledWith('blocked-claude', {
      schedulable: 'false',
      accountPoolAutoStopped: 'true',
      accountPoolStoppedReason: 'five_hour_limit',
      accountPoolStoppedAt: expect.any(String)
    })
  })

  test('uses saved Claude account-pool thresholds during shared-pool selection', async () => {
    savedPolicy.platforms.claude.fiveHourUtilizationLimit = 80
    claudeAccounts.push(
      {
        id: 'threshold-claude',
        name: 'Threshold Claude',
        isActive: 'true',
        status: 'active',
        schedulable: 'true',
        accountType: 'shared',
        fiveHourWindow: { utilization: 85, remainingSeconds: 300 },
        priority: 1
      },
      {
        id: 'healthy-claude',
        name: 'Healthy Claude',
        isActive: 'true',
        status: 'active',
        schedulable: 'true',
        accountType: 'shared',
        fiveHourWindow: { utilization: 20, remainingSeconds: 3000 },
        priority: 2
      }
    )

    const accounts = await unifiedClaudeScheduler._getAllAvailableAccounts({}, 'claude-sonnet-4')

    expect(accounts.map((account) => account.accountId)).toEqual(['healthy-claude'])
    expect(claudeAccountService.updateAccount).toHaveBeenCalledWith('threshold-claude', {
      schedulable: 'false',
      accountPoolAutoStopped: 'true',
      accountPoolStoppedReason: 'five_hour_limit',
      accountPoolStoppedAt: expect.any(String)
    })
  })
})
