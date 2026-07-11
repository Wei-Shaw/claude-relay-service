// Regression test: an API key bound to a dedicated Claude account must NEVER be
// silently routed to a different account.
//
// Bug: markAccountRateLimited sets schedulable='false' AND the relay writes a
// temp_unavailable key. The bound-account path checked temp_unavailable FIRST and only
// logged "falling back to pool", so the CLAUDE_DEDICATED_RATE_LIMITED throw was dead code
// and the dedicated key quietly used other accounts from the shared pool.

const mockConfig = { claude: {} }

jest.mock('../config/config', () => mockConfig)
jest.mock('../src/services/account/claudeAccountService', () => ({
  isAccountRateLimited: jest.fn(),
  getAccountRateLimitInfo: jest.fn(),
  isAccountModelRateLimited: jest.fn(),
  getAccountModelRateLimitInfo: jest.fn(),
  clearExpiredModelRateLimit: jest.fn()
}))
jest.mock('../src/services/account/claudeConsoleAccountService', () => ({}))
jest.mock('../src/services/account/bedrockAccountService', () => ({}))
jest.mock('../src/services/account/ccrAccountService', () => ({}))
jest.mock('../src/services/accountGroupService', () => ({}))
jest.mock('../src/models/redis', () => ({ getClaudeAccount: jest.fn() }))
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn()
}))
jest.mock('../src/utils/commonHelper', () => ({
  isSchedulable: jest.fn((value) => value !== false && value !== 'false'),
  sortAccountsByPriority: jest.fn((accounts) => accounts)
}))
jest.mock('../src/utils/upstreamErrorHelper', () => ({}))

const claudeAccountService = require('../src/services/account/claudeAccountService')
const redis = require('../src/models/redis')
const scheduler = require('../src/services/scheduler/unifiedClaudeScheduler')

const BOUND_ID = 'acct-0w'
// mirrors production: API key "river" bound to account "0w"
const apiKeyData = { id: 'key-river', name: 'river', claudeAccountId: BOUND_ID }

const healthyAccount = {
  id: BOUND_ID,
  name: '0w',
  isActive: 'true',
  status: 'active',
  schedulable: 'true'
}

describe('dedicated (bound) Claude account never silently falls back to the shared pool', () => {
  let tempSpy

  beforeEach(() => {
    jest.clearAllMocks()
    mockConfig.claude = {}
    claudeAccountService.isAccountRateLimited.mockResolvedValue(false)
    claudeAccountService.isAccountModelRateLimited.mockResolvedValue(false)
    claudeAccountService.clearExpiredModelRateLimit.mockResolvedValue({ success: true })
    claudeAccountService.getAccountRateLimitInfo.mockResolvedValue({
      rateLimitEndAt: '2026-07-07T07:00:00.000Z'
    })
    claudeAccountService.getAccountModelRateLimitInfo.mockResolvedValue({ resetAt: null })
    tempSpy = jest.spyOn(scheduler, 'isAccountTemporarilyUnavailable').mockResolvedValue(false)
  })

  afterEach(() => {
    tempSpy.mockRestore()
  })

  it('uses the bound account when it is healthy', async () => {
    redis.getClaudeAccount.mockResolvedValue(healthyAccount)

    await expect(
      scheduler.selectAccountForApiKey(apiKeyData, null, 'claude-opus-4-8')
    ).resolves.toEqual({ accountId: BOUND_ID, accountType: 'claude-official' })
  })

  it('throws CLAUDE_DEDICATED_RATE_LIMITED when rate limited AND temp-unavailable (the production bug)', async () => {
    // markAccountRateLimited sets schedulable=false + rateLimitAutoStopped,
    // and the relay also writes temp_unavailable — the exact state of "0w".
    redis.getClaudeAccount.mockResolvedValue({
      ...healthyAccount,
      schedulable: 'false',
      rateLimitStatus: 'limited',
      rateLimitAutoStopped: 'true'
    })
    claudeAccountService.isAccountRateLimited.mockResolvedValue(true)
    tempSpy.mockResolvedValue(true)

    await expect(
      scheduler.selectAccountForApiKey(apiKeyData, null, 'claude-opus-4-8')
    ).rejects.toMatchObject({ code: 'CLAUDE_DEDICATED_RATE_LIMITED', accountId: BOUND_ID })
  })

  it('throws CLAUDE_DEDICATED_RATE_LIMITED when only schedulable=false via rate-limit auto-stop', async () => {
    redis.getClaudeAccount.mockResolvedValue({
      ...healthyAccount,
      schedulable: 'false',
      rateLimitAutoStopped: 'true'
    })

    await expect(
      scheduler.selectAccountForApiKey(apiKeyData, null, 'claude-opus-4-8')
    ).rejects.toMatchObject({ code: 'CLAUDE_DEDICATED_RATE_LIMITED' })
  })

  it('throws CLAUDE_DEDICATED_RATE_LIMITED when the requested model family is limited', async () => {
    redis.getClaudeAccount.mockResolvedValue(healthyAccount)
    claudeAccountService.isAccountModelRateLimited.mockResolvedValue(true)
    claudeAccountService.getAccountModelRateLimitInfo.mockResolvedValue({ resetAt: 'soon' })

    await expect(
      scheduler.selectAccountForApiKey(apiKeyData, null, 'claude-sonnet-4-5')
    ).rejects.toMatchObject({ code: 'CLAUDE_DEDICATED_RATE_LIMITED', modelFamily: 'sonnet' })
  })

  it('throws CLAUDE_DEDICATED_UNAVAILABLE when only temporarily unavailable', async () => {
    redis.getClaudeAccount.mockResolvedValue(healthyAccount)
    tempSpy.mockResolvedValue(true)

    await expect(
      scheduler.selectAccountForApiKey(apiKeyData, null, 'claude-opus-4-8')
    ).rejects.toMatchObject({
      code: 'CLAUDE_DEDICATED_UNAVAILABLE',
      reason: 'temporarily_unavailable'
    })
  })

  it('throws CLAUDE_DEDICATED_UNAVAILABLE when the bound account is inactive', async () => {
    redis.getClaudeAccount.mockResolvedValue({ ...healthyAccount, isActive: 'false' })

    await expect(
      scheduler.selectAccountForApiKey(apiKeyData, null, 'claude-opus-4-8')
    ).rejects.toMatchObject({ code: 'CLAUDE_DEDICATED_UNAVAILABLE', reason: 'inactive_or_error' })
  })

  it('falls back to the shared pool ONLY when dedicatedAccountFallback is enabled', async () => {
    mockConfig.claude = { dedicatedAccountFallback: true }
    redis.getClaudeAccount.mockResolvedValue(healthyAccount)
    tempSpy.mockResolvedValue(true)
    const poolSpy = jest.spyOn(scheduler, '_getAllAvailableAccounts').mockResolvedValue([])

    await expect(
      scheduler.selectAccountForApiKey(apiKeyData, null, 'claude-opus-4-8')
    ).rejects.toThrow(/No available Claude accounts/)
    expect(poolSpy).toHaveBeenCalled()

    poolSpy.mockRestore()
  })
})
