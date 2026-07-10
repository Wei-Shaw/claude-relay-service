const accountPoolAutomationService = require('../src/services/accountPoolAutomationService')

jest.mock('../src/services/account/openaiAccountService', () => ({
  getAllAccounts: jest.fn(),
  updateAccount: jest.fn()
}))

jest.mock('../src/services/account/openaiResponsesAccountService', () => ({
  getAllAccounts: jest.fn(),
  updateAccount: jest.fn()
}))

jest.mock('../src/services/account/claudeAccountService', () => ({
  getAllAccounts: jest.fn(),
  updateAccount: jest.fn()
}))

jest.mock('../src/services/account/claudeConsoleAccountService', () => ({
  getAllAccounts: jest.fn(),
  updateAccount: jest.fn()
}))

jest.mock('../src/services/serverStateService', () => ({
  getAccountMirror: jest.fn()
}))

jest.mock('../src/models/redis', () => {
  const state = {
    policy: JSON.stringify({
      enabled: true,
      platforms: {
        openai: {
          enabled: true,
          fiveHourUtilizationLimit: 90,
          sevenDayUtilizationLimit: 100,
          dailyCostLimit: 0,
          dailyTokenLimit: 0,
          dailyRequestLimit: 0
        },
        claude: {
          enabled: true,
          fiveHourUtilizationLimit: 100,
          sevenDayUtilizationLimit: 100,
          dailyCostLimit: 10,
          dailyTokenLimit: 0,
          dailyRequestLimit: 0
        }
      }
    })
  }

  return {
    getClientSafe: jest.fn(() => ({
      get: jest.fn(async (key) => (key === 'account_pool:policy' ? state.policy : null))
    })),
    __state: state
  }
})

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
}))

const openaiAccountService = require('../src/services/account/openaiAccountService')
const openaiResponsesAccountService = require('../src/services/account/openaiResponsesAccountService')
const claudeAccountService = require('../src/services/account/claudeAccountService')
const claudeConsoleAccountService = require('../src/services/account/claudeConsoleAccountService')
const serverStateService = require('../src/services/serverStateService')

describe('accountPoolAutomationService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    openaiAccountService.getAllAccounts.mockResolvedValue([])
    openaiResponsesAccountService.getAllAccounts.mockResolvedValue([])
    claudeAccountService.getAllAccounts.mockResolvedValue([])
    claudeConsoleAccountService.getAllAccounts.mockResolvedValue([])
    serverStateService.getAccountMirror.mockResolvedValue({
      target: 'JSZX-AI-03',
      accounts: [],
      totals: {
        openai: { total: 0, schedulable: 0, stopped: 0 },
        claude: { total: 0, schedulable: 0, stopped: 0 }
      }
    })
  })

  test('server dry-run evaluates the remote account mirror instead of local Redis accounts', async () => {
    serverStateService.getAccountMirror.mockResolvedValue({
      target: 'JSZX-AI-03',
      source: {
        kind: 'carher_admin_quota_script',
        count: 2,
        readAt: '2026-07-08T11:10:00.000Z'
      },
      accounts: [
        {
          id: 'acct-29',
          provider: 'openai',
          label: 'acct-29',
          schedulable: true,
          usage: {
            fiveHourPercent: 95,
            sevenDayPercent: 20,
            cost: 0,
            tokens: 0,
            requests: 0
          },
          recovery: {
            fiveHourResetAt: '2026-07-08T10:00:00.000Z'
          }
        },
        {
          id: 'acct-paused',
          provider: 'openai',
          label: 'acct-paused',
          schedulable: false,
          status: 'PAUSED',
          stopSource: 'remote',
          stopReason: 'deploy.spec.replicas=0',
          stopCategory: 'remote_deploy_stopped',
          stopTrigger: 'deploy_replicas_zero',
          lastError: 'deploy.spec.replicas=0',
          usage: {
            fiveHourPercent: 10,
            sevenDayPercent: 20,
            cost: 0,
            tokens: 0,
            requests: 0
          },
          recovery: {}
        }
      ]
    })

    const result = await accountPoolAutomationService.runPolicySweep({
      source: 'server',
      dryRun: true
    })

    expect(result.mode).toBe('server-mirror')
    expect(result.target).toBe('JSZX-AI-03')
    expect(result.source).toEqual({
      kind: 'carher_admin_quota_script',
      count: 2,
      readAt: '2026-07-08T11:10:00.000Z'
    })
    expect(result.mutationEnabled).toBe(false)
    expect(result.totals).toEqual({
      scanned: 2,
      stopped: 0,
      resumed: 0,
      skipped: 1,
      wouldStop: 1,
      wouldResume: 0,
      reasonBreakdown: {
        five_hour_limit: 1
      },
      skipBreakdown: {
        remote_deploy_stopped: 1
      }
    })
    expect(result.platforms.openai.stop).toEqual([
      expect.objectContaining({
        id: 'acct-29',
        action: 'would_stop',
        reason: 'five_hour_limit'
      })
    ])
    expect(openaiAccountService.getAllAccounts).not.toHaveBeenCalled()
  })

  test('dry-run reports stop and resume decisions without mutating accounts', async () => {
    openaiAccountService.getAllAccounts.mockResolvedValue([
      {
        id: 'openai-stop',
        name: 'OpenAI Stop',
        isActive: true,
        schedulable: true,
        accountType: 'shared',
        status: 'active',
        primaryWindow: { utilization: 95, resetAt: '2026-07-08T10:00:00.000Z' }
      },
      {
        id: 'openai-resume',
        name: 'OpenAI Resume',
        isActive: true,
        schedulable: false,
        accountType: 'shared',
        status: 'active',
        accountPoolAutoStopped: true,
        primaryWindow: { utilization: 12 }
      }
    ])

    const result = await accountPoolAutomationService.runPolicySweep({ dryRun: true })

    expect(result.dryRun).toBe(true)
    expect(result.totals).toEqual({
      scanned: 2,
      stopped: 0,
      resumed: 0,
      skipped: 0,
      wouldStop: 1,
      wouldResume: 1,
      reasonBreakdown: {
        five_hour_limit: 1
      },
      skipBreakdown: {}
    })
    expect(result.platforms.openai.stop).toEqual([
      expect.objectContaining({ id: 'openai-stop', action: 'would_stop', reason: 'five_hour_limit' })
    ])
    expect(result.platforms.openai.resume).toEqual([
      expect.objectContaining({ id: 'openai-resume', action: 'would_resume', reason: 'policy_limit_recovered' })
    ])
    expect(openaiAccountService.updateAccount).not.toHaveBeenCalled()
  })

  test('live run stops exhausted accounts and resumes only accounts stopped by the pool policy', async () => {
    openaiResponsesAccountService.getAllAccounts.mockResolvedValue([
      {
        id: 'responses-stop',
        name: 'Responses Stop',
        isActive: true,
        schedulable: true,
        accountType: 'shared',
        status: 'active',
        primaryWindow: { utilization: 91 }
      }
    ])
    claudeConsoleAccountService.getAllAccounts.mockResolvedValue([
      {
        id: 'console-resume',
        name: 'Console Resume',
        isActive: true,
        schedulable: false,
        accountType: 'shared',
        status: 'active',
        accountPoolAutoStopped: true,
        dailyQuota: 10,
        dailyUsage: 3
      },
      {
        id: 'console-manual',
        name: 'Console Manual',
        isActive: true,
        schedulable: false,
        accountType: 'shared',
        status: 'active',
        dailyQuota: 10,
        dailyUsage: 2
      }
    ])

    const result = await accountPoolAutomationService.runPolicySweep({ dryRun: false })

    expect(result.dryRun).toBe(false)
    expect(result.totals).toEqual({
      scanned: 3,
      stopped: 1,
      resumed: 1,
      skipped: 1,
      wouldStop: 0,
      wouldResume: 0,
      reasonBreakdown: {
        five_hour_limit: 1
      },
      skipBreakdown: {
        not_schedulable: 1
      }
    })
    expect(openaiResponsesAccountService.updateAccount).toHaveBeenCalledWith('responses-stop', {
      schedulable: 'false',
      accountPoolAutoStopped: 'true',
      accountPoolStoppedReason: 'five_hour_limit',
      accountPoolStoppedAt: expect.any(String)
    })
    expect(claudeConsoleAccountService.updateAccount).toHaveBeenCalledWith('console-resume', {
      schedulable: 'true',
      accountPoolAutoStopped: '',
      accountPoolStoppedReason: '',
      accountPoolStoppedAt: ''
    })
    expect(claudeConsoleAccountService.updateAccount).not.toHaveBeenCalledWith(
      'console-manual',
      expect.anything()
    )
    expect(result.platforms.claude.skipped).toEqual([
      expect.objectContaining({ id: 'console-manual', action: 'skipped', reason: 'not_schedulable' })
    ])
  })

  test('ignores dedicated accounts during automatic shared pool sweeps', async () => {
    claudeAccountService.getAllAccounts.mockResolvedValue([
      {
        id: 'dedicated-claude',
        name: 'Dedicated Claude',
        isActive: true,
        schedulable: true,
        accountType: 'dedicated',
        status: 'active',
        usage: { daily: { cost: 12 } }
      }
    ])

    const result = await accountPoolAutomationService.runPolicySweep({ dryRun: false })

    expect(result.totals).toEqual({
      scanned: 0,
      stopped: 0,
      resumed: 0,
      skipped: 0,
      wouldStop: 0,
      wouldResume: 0,
      reasonBreakdown: {},
      skipBreakdown: {}
    })
    expect(claudeAccountService.updateAccount).not.toHaveBeenCalled()
  })
})
