jest.mock('../config/config', () => ({ claude: {} }), { virtual: true })
jest.mock('../src/services/account/claudeAccountService', () => ({}))
jest.mock('../src/services/account/claudeConsoleAccountService', () => ({
  getAllAccounts: jest.fn().mockResolvedValue([])
}))
jest.mock('../src/services/account/bedrockAccountService', () => ({
  getAccount: jest.fn(),
  getAllAccounts: jest.fn(),
  isSubscriptionExpired: jest.fn()
}))
jest.mock('../src/services/account/ccrAccountService', () => ({
  getAllAccounts: jest.fn().mockResolvedValue({ success: true, data: [] })
}))
jest.mock('../src/services/accountGroupService', () => ({}))
jest.mock('../src/models/redis', () => ({
  getAllClaudeAccounts: jest.fn().mockResolvedValue([])
}))
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))
jest.mock('../src/utils/modelHelper', () => ({
  parseVendorPrefixedModel: jest.fn((model) => ({ model })),
  isOpus45OrNewer: jest.fn(() => true),
  getRateLimitModelFamily: jest.fn(() => null)
}))
jest.mock('../src/utils/commonHelper', () => ({
  isSchedulable: jest.fn((value) => value !== false && value !== 'false'),
  sortAccountsByPriority: jest.fn((accounts) => accounts)
}))
jest.mock('../src/utils/upstreamErrorHelper', () => ({}))

const bedrockAccountService = require('../src/services/account/bedrockAccountService')
const scheduler = require('../src/services/scheduler/unifiedClaudeScheduler')

const expiredAccount = {
  id: 'bedrock-expired',
  name: 'Expired Bedrock',
  isActive: true,
  schedulable: true,
  accountType: 'shared',
  expiresAt: '2020-01-01T00:00:00.000Z'
}

describe('UnifiedClaudeScheduler Bedrock expiry', () => {
  let tempSpy

  beforeEach(() => {
    jest.clearAllMocks()
    bedrockAccountService.getAllAccounts.mockResolvedValue({ success: true, data: [] })
    bedrockAccountService.isSubscriptionExpired.mockImplementation(
      (account) => account.id === expiredAccount.id
    )
    tempSpy = jest.spyOn(scheduler, 'isAccountTemporarilyUnavailable').mockResolvedValue(false)
  })

  afterEach(() => {
    tempSpy.mockRestore()
  })

  test('rejects an expired Bedrock session binding', async () => {
    bedrockAccountService.getAccount.mockResolvedValue({ success: true, data: expiredAccount })

    await expect(scheduler._isAccountAvailable(expiredAccount.id, 'bedrock')).resolves.toBe(false)
  })

  test('does not use an expired bound Bedrock account', async () => {
    bedrockAccountService.getAccount.mockResolvedValue({ success: true, data: expiredAccount })

    await expect(
      scheduler._getAllAvailableAccounts({ bedrockAccountId: expiredAccount.id })
    ).resolves.toEqual([])
    expect(tempSpy).not.toHaveBeenCalledWith(expiredAccount.id, 'bedrock')
  })

  test('excludes expired Bedrock accounts from the shared pool', async () => {
    bedrockAccountService.getAllAccounts.mockResolvedValue({
      success: true,
      data: [expiredAccount]
    })

    await expect(scheduler._getAllAvailableAccounts({})).resolves.toEqual([])
    expect(tempSpy).not.toHaveBeenCalledWith(expiredAccount.id, 'bedrock')
  })
})
