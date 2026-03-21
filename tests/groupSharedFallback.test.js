/**
 * Group shared fallback tests
 *
 * When a group has allowSharedFallback enabled and no group members are
 * available, the scheduler should fall back to the shared account pool.
 */

jest.mock('../src/utils/logger', () => ({
  api: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  success: jest.fn(),
  database: jest.fn(),
  security: jest.fn()
}))

jest.mock('../src/models/redis', () => ({
  getAllClaudeAccounts: jest.fn(),
  getConsoleAccountConcurrency: jest.fn(),
  getClientSafe: jest.fn()
}))

jest.mock('../src/services/account/claudeAccountService', () => ({
  isAccountRateLimited: jest.fn(),
  isAccountOpusRateLimited: jest.fn()
}))

jest.mock('../src/services/account/claudeConsoleAccountService', () => ({
  getAllAccounts: jest.fn()
}))

jest.mock('../src/services/account/bedrockAccountService', () => ({}))

jest.mock('../src/services/account/ccrAccountService', () => ({
  getAllAccounts: jest.fn()
}))

jest.mock('../src/services/accountGroupService', () => ({
  getGroup: jest.fn(),
  getGroupMembers: jest.fn()
}))

jest.mock('../src/utils/upstreamErrorHelper', () => ({}))
jest.mock('../src/utils/modelHelper', () => ({
  parseVendorPrefixedModel: jest.fn((m) => ({ vendor: null, baseModel: m })),
  isOpus45OrNewer: jest.fn(() => true)
}))
jest.mock('../src/utils/commonHelper', () => ({
  isSchedulable: jest.fn(() => true),
  sortAccountsByPriority: jest.fn((a) => a)
}))

const redis = require('../src/models/redis')
const claudeAccountService = require('../src/services/account/claudeAccountService')
const claudeConsoleAccountService = require('../src/services/account/claudeConsoleAccountService')
const ccrAccountService = require('../src/services/account/ccrAccountService')
const accountGroupService = require('../src/services/accountGroupService')

describe('Group shared fallback', () => {
  let scheduler

  beforeEach(() => {
    jest.clearAllMocks()
    scheduler = require('../src/services/scheduler/unifiedClaudeScheduler')
    // Mock instance methods that aren't covered by module mocks
    scheduler.isAccountTemporarilyUnavailable = jest.fn().mockResolvedValue(false)
    scheduler.isAccountRateLimited = jest.fn().mockResolvedValue(false)
    scheduler._getSessionMapping = jest.fn().mockResolvedValue(null)
    scheduler._setSessionMapping = jest.fn().mockResolvedValue(undefined)
  })

  describe('_selectSharedFallbackAccount', () => {
    it('should return a shared claude-official account when available', async () => {
      redis.getAllClaudeAccounts.mockResolvedValue([
        {
          id: 'shared-1',
          name: 'shared-account',
          isActive: 'true',
          status: 'active',
          accountType: 'shared',
          schedulable: 'true',
          priority: '10'
        }
      ])
      claudeAccountService.isAccountRateLimited.mockResolvedValue(false)
      claudeConsoleAccountService.getAllAccounts.mockResolvedValue([])
      ccrAccountService.getAllAccounts.mockResolvedValue([])

      const result = await scheduler._selectSharedFallbackAccount('claude', 'claude-sonnet-4-6')
      expect(result).toEqual({
        accountId: 'shared-1',
        accountType: 'claude-official'
      })
    })

    it('should return null when no shared accounts are available', async () => {
      redis.getAllClaudeAccounts.mockResolvedValue([])
      claudeConsoleAccountService.getAllAccounts.mockResolvedValue([])
      ccrAccountService.getAllAccounts.mockResolvedValue([])

      const result = await scheduler._selectSharedFallbackAccount('claude', 'claude-sonnet-4-6')
      expect(result).toBeNull()
    })

    it('should skip inactive shared accounts', async () => {
      redis.getAllClaudeAccounts.mockResolvedValue([
        {
          id: 'inactive-1',
          name: 'inactive-account',
          isActive: 'false',
          status: 'active',
          accountType: 'shared',
          schedulable: 'true'
        }
      ])
      claudeConsoleAccountService.getAllAccounts.mockResolvedValue([])
      ccrAccountService.getAllAccounts.mockResolvedValue([])

      const result = await scheduler._selectSharedFallbackAccount('claude', 'claude-sonnet-4-6')
      expect(result).toBeNull()
    })

    it('should include console accounts in claude platform fallback', async () => {
      redis.getAllClaudeAccounts.mockResolvedValue([])
      claudeConsoleAccountService.getAllAccounts.mockResolvedValue([
        {
          id: 'console-1',
          name: 'console-account',
          isActive: true,
          status: 'active',
          schedulable: true,
          maxConcurrentTasks: 0,
          priority: '20'
        }
      ])
      ccrAccountService.getAllAccounts.mockResolvedValue([])

      const result = await scheduler._selectSharedFallbackAccount('claude', 'claude-sonnet-4-6')
      expect(result).toEqual({
        accountId: 'console-1',
        accountType: 'claude-console'
      })
    })

    it('should include ccr accounts in claude platform fallback', async () => {
      redis.getAllClaudeAccounts.mockResolvedValue([])
      claudeConsoleAccountService.getAllAccounts.mockResolvedValue([])
      ccrAccountService.getAllAccounts.mockResolvedValue([
        {
          id: 'ccr-1',
          name: 'ccr-account',
          status: 'active',
          schedulable: true,
          priority: '30'
        }
      ])

      const result = await scheduler._selectSharedFallbackAccount('claude', 'claude-sonnet-4-6')
      expect(result).toEqual({
        accountId: 'ccr-1',
        accountType: 'ccr'
      })
    })
  })

  describe('selectAccountFromGroup with fallback', () => {
    it('should fall back to shared pool when group has no members and allowSharedFallback is true', async () => {
      accountGroupService.getGroup.mockResolvedValue({
        name: 'test-group',
        platform: 'claude',
        allowSharedFallback: 'true'
      })
      accountGroupService.getGroupMembers.mockResolvedValue([])
      redis.getAllClaudeAccounts.mockResolvedValue([
        {
          id: 'shared-1',
          name: 'shared-account',
          isActive: 'true',
          status: 'active',
          accountType: 'shared',
          schedulable: 'true',
          priority: '10'
        }
      ])
      claudeAccountService.isAccountRateLimited.mockResolvedValue(false)
      claudeConsoleAccountService.getAllAccounts.mockResolvedValue([])
      ccrAccountService.getAllAccounts.mockResolvedValue([])

      const result = await scheduler.selectAccountFromGroup('group-1', null, 'claude-sonnet-4-6')
      expect(result.accountId).toBe('shared-1')
      expect(result.accountType).toBe('claude-official')
    })

    it('should throw error when group has no members and allowSharedFallback is false', async () => {
      accountGroupService.getGroup.mockResolvedValue({
        name: 'test-group',
        platform: 'claude',
        allowSharedFallback: 'false'
      })
      accountGroupService.getGroupMembers.mockResolvedValue([])

      await expect(
        scheduler.selectAccountFromGroup('group-1', null, 'claude-sonnet-4-6')
      ).rejects.toThrow('has no members')
    })

    it('should throw error when allowSharedFallback is not set (default behavior)', async () => {
      accountGroupService.getGroup.mockResolvedValue({
        name: 'test-group',
        platform: 'claude'
      })
      accountGroupService.getGroupMembers.mockResolvedValue([])

      await expect(
        scheduler.selectAccountFromGroup('group-1', null, 'claude-sonnet-4-6')
      ).rejects.toThrow('has no members')
    })

    it('should not create sticky session mapping for fallback accounts', async () => {
      accountGroupService.getGroup.mockResolvedValue({
        name: 'test-group',
        platform: 'claude',
        allowSharedFallback: 'true'
      })
      accountGroupService.getGroupMembers.mockResolvedValue([])
      redis.getAllClaudeAccounts.mockResolvedValue([
        {
          id: 'shared-1',
          name: 'shared-account',
          isActive: 'true',
          status: 'active',
          accountType: 'shared',
          schedulable: 'true',
          priority: '10'
        }
      ])
      claudeAccountService.isAccountRateLimited.mockResolvedValue(false)
      claudeConsoleAccountService.getAllAccounts.mockResolvedValue([])
      ccrAccountService.getAllAccounts.mockResolvedValue([])

      await scheduler.selectAccountFromGroup('group-1', 'session-hash', 'claude-sonnet-4-6')
      expect(scheduler._setSessionMapping).not.toHaveBeenCalled()
    })
  })
})
