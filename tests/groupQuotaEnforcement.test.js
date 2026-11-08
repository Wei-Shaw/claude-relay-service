// Regression test: Claude Console accounts scheduled through a GROUP ignored dailyQuota.
//
// Bug: selectAccountFromGroup() never called claudeConsoleAccountService.checkQuotaUsage(),
// so the only code that compares today's cost against dailyQuota (and stops the account)
// ran exclusively on the shared-pool path and on upstream 429 responses. Group members
// could therefore run unbounded over their daily quota.

const mockConfig = { claude: {} }

jest.mock('../config/config', () => mockConfig)
jest.mock('../src/services/account/claudeAccountService', () => ({
  isAccountRateLimited: jest.fn(),
  isAccountModelRateLimited: jest.fn()
}))
jest.mock('../src/services/account/claudeConsoleAccountService', () => ({
  getAccount: jest.fn(),
  checkQuotaUsage: jest.fn(),
  isAccountQuotaExceeded: jest.fn()
}))
jest.mock('../src/services/account/bedrockAccountService', () => ({}))
jest.mock('../src/services/account/ccrAccountService', () => ({
  getAccount: jest.fn(),
  checkQuotaUsage: jest.fn(),
  isAccountQuotaExceeded: jest.fn()
}))
jest.mock('../src/services/accountGroupService', () => ({
  getGroup: jest.fn(),
  getGroupMembers: jest.fn()
}))
jest.mock('../src/models/redis', () => ({
  getClaudeAccount: jest.fn(),
  getConsoleAccountConcurrency: jest.fn()
}))
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn()
}))
jest.mock('../src/utils/modelHelper', () => ({
  parseVendorPrefixedModel: jest.fn((model) => ({ model })),
  isOpus45OrNewer: jest.fn(() => false),
  getRateLimitModelFamily: jest.fn(() => null)
}))
jest.mock('../src/utils/commonHelper', () => ({
  isSchedulable: jest.fn((value) => value !== false && value !== 'false'),
  // real behaviour: lower priority number wins
  sortAccountsByPriority: jest.fn((accounts) =>
    [...accounts].sort((a, b) => a.priority - b.priority)
  )
}))
jest.mock('../src/utils/upstreamErrorHelper', () => ({}))

const consoleAccount = (id, name, priority, dailyQuota) => ({
  id,
  name,
  isActive: true,
  status: 'active',
  schedulable: true,
  priority: String(priority),
  dailyQuota: String(dailyQuota),
  maxConcurrentTasks: 0
})

describe('group scheduling enforces Claude Console dailyQuota', () => {
  let scheduler
  let claudeConsoleAccountService
  let accountGroupService
  let redis
  let tempSpy
  let rateSpy

  beforeEach(() => {
    jest.resetModules()
    // re-require after resetModules so the test and the scheduler share mock instances
    claudeConsoleAccountService = require('../src/services/account/claudeConsoleAccountService')
    accountGroupService = require('../src/services/accountGroupService')
    redis = require('../src/models/redis')
    scheduler = require('../src/services/scheduler/unifiedClaudeScheduler')

    accountGroupService.getGroup.mockResolvedValue({
      id: 'grp-1',
      name: 'kimi-group',
      platform: 'claude'
    })
    redis.getClaudeAccount.mockResolvedValue(null)
    redis.getConsoleAccountConcurrency.mockResolvedValue(0)
    claudeConsoleAccountService.checkQuotaUsage.mockResolvedValue({ success: true })
    claudeConsoleAccountService.isAccountQuotaExceeded.mockResolvedValue(false)

    tempSpy = jest.spyOn(scheduler, 'isAccountTemporarilyUnavailable').mockResolvedValue(false)
    rateSpy = jest.spyOn(scheduler, 'isAccountRateLimited').mockResolvedValue(false)
  })

  afterEach(() => {
    tempSpy.mockRestore()
    rateSpy.mockRestore()
    jest.clearAllMocks()
  })

  it('skips a quota-exceeded higher-priority member and selects the next one', async () => {
    const a = consoleAccount('acct-a', 'kimi-a', 10, 60)
    const b = consoleAccount('acct-b', 'kimi-b', 20, 60)
    accountGroupService.getGroupMembers.mockResolvedValue([a.id, b.id])
    claudeConsoleAccountService.getAccount.mockImplementation(async (id) =>
      id === a.id ? a : id === b.id ? b : null
    )
    claudeConsoleAccountService.isAccountQuotaExceeded.mockImplementation(async (id) => id === a.id)

    await expect(scheduler.selectAccountFromGroup('grp-1')).resolves.toEqual({
      accountId: 'acct-b',
      accountType: 'claude-console'
    })
    expect(claudeConsoleAccountService.checkQuotaUsage).toHaveBeenCalledWith('acct-a')
  })

  it('throws when every member is quota exceeded instead of returning one', async () => {
    const a = consoleAccount('acct-a', 'kimi-a', 10, 60)
    const b = consoleAccount('acct-b', 'kimi-b', 20, 60)
    accountGroupService.getGroupMembers.mockResolvedValue([a.id, b.id])
    claudeConsoleAccountService.getAccount.mockImplementation(async (id) =>
      id === a.id ? a : id === b.id ? b : null
    )
    claudeConsoleAccountService.isAccountQuotaExceeded.mockResolvedValue(true)

    await expect(scheduler.selectAccountFromGroup('grp-1')).rejects.toThrow(
      /No available accounts in group kimi-group/
    )
  })

  it('returns the single member unchanged when it is under quota', async () => {
    const a = consoleAccount('acct-a', 'kimi-a', 10, 60)
    accountGroupService.getGroupMembers.mockResolvedValue([a.id])
    claudeConsoleAccountService.getAccount.mockResolvedValue(a)

    await expect(scheduler.selectAccountFromGroup('grp-1')).resolves.toEqual({
      accountId: 'acct-a',
      accountType: 'claude-console'
    })
    expect(claudeConsoleAccountService.checkQuotaUsage).toHaveBeenCalledTimes(1)
    expect(claudeConsoleAccountService.checkQuotaUsage).toHaveBeenCalledWith('acct-a')
  })

  it('does not check quota for members with dailyQuota = 0 (unlimited)', async () => {
    const a = consoleAccount('acct-a', 'kimi-a', 10, 0)
    accountGroupService.getGroupMembers.mockResolvedValue([a.id])
    claudeConsoleAccountService.getAccount.mockResolvedValue(a)

    await expect(scheduler.selectAccountFromGroup('grp-1')).resolves.toEqual({
      accountId: 'acct-a',
      accountType: 'claude-console'
    })
    expect(claudeConsoleAccountService.checkQuotaUsage).not.toHaveBeenCalled()
    expect(claudeConsoleAccountService.isAccountQuotaExceeded).not.toHaveBeenCalled()
  })

  it('still selects the candidate when the quota check throws', async () => {
    const a = consoleAccount('acct-a', 'kimi-a', 10, 60)
    accountGroupService.getGroupMembers.mockResolvedValue([a.id])
    claudeConsoleAccountService.getAccount.mockResolvedValue(a)
    claudeConsoleAccountService.checkQuotaUsage.mockRejectedValue(new Error('redis down'))

    await expect(scheduler.selectAccountFromGroup('grp-1')).resolves.toEqual({
      accountId: 'acct-a',
      accountType: 'claude-console'
    })
  })
})
