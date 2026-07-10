const accountPoolPolicyService = require('../src/services/accountPoolPolicyService')

const createRedis = (initialPolicy = null) => {
  const state = { policy: initialPolicy ? JSON.stringify(initialPolicy) : null }
  return {
    state,
    getClientSafe: jest.fn(() => ({
      get: jest.fn(async (key) => (key === 'account_pool:policy' ? state.policy : null)),
      set: jest.fn(async (key, value) => {
        if (key === 'account_pool:policy') {
          state.policy = value
        }
        return 'OK'
      })
    }))
  }
}

describe('accountPoolPolicyService', () => {
  test('blocks an account when any 5h, 7d, cost, token, or request limit is exhausted', () => {
    const cases = [
      {
        name: '5h window',
        account: {
          primaryWindow: { utilization: 100, remainingSeconds: 300 }
        },
        expectedReason: 'five_hour_limit'
      },
      {
        name: '7d window',
        account: {
          weeklyWindow: { utilization: 101, remainingSeconds: 7200 }
        },
        expectedReason: 'seven_day_limit'
      },
      {
        name: 'cost quota',
        account: {
          dailyQuota: '10',
          usage: { daily: { cost: 10.2 } }
        },
        expectedReason: 'cost_limit'
      },
      {
        name: 'token quota',
        account: {
          tokenLimit: '1000',
          usage: { daily: { allTokens: 1000 } }
        },
        expectedReason: 'token_limit'
      },
      {
        name: 'request quota',
        account: {
          requestLimit: '50',
          usage: { daily: { requests: 51 } }
        },
        expectedReason: 'request_limit'
      }
    ]

    for (const item of cases) {
      const decision = accountPoolPolicyService.evaluateAccount(item.account)

      expect(decision).toEqual(
        expect.objectContaining({
          canSchedule: false,
          reason: item.expectedReason
        })
      )
    }
  })

  test('allows an account while all configured limits are still below capacity', () => {
    const decision = accountPoolPolicyService.evaluateAccount({
      primaryWindow: { utilization: 40, remainingSeconds: 3000 },
      weeklyWindow: { utilization: 70, remainingSeconds: 86400 },
      dailyQuota: '10',
      tokenLimit: '1000',
      requestLimit: '50',
      usage: {
        daily: {
          cost: 7,
          allTokens: 900,
          requests: 49
        }
      }
    })

    expect(decision).toEqual({
      canSchedule: true,
      reason: null,
      limit: null,
      resetAt: null,
      remainingSeconds: null
    })
  })

  test('loads default policy configuration when Redis has no saved policy', async () => {
    const policy = await accountPoolPolicyService.getPolicy(createRedis())

    expect(policy).toEqual({
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
    })
  })

  test('saves sanitized policy configuration for OpenAI and Claude only', async () => {
    const redis = createRedis()

    const policy = await accountPoolPolicyService.savePolicy(
      {
        enabled: true,
        platforms: {
          openai: {
            enabled: true,
            fiveHourUtilizationLimit: '85',
            sevenDayUtilizationLimit: '95',
            dailyCostLimit: '12.5',
            dailyTokenLimit: '100000',
            dailyRequestLimit: '2500'
          },
          claude: {
            enabled: false,
            fiveHourUtilizationLimit: 90,
            sevenDayUtilizationLimit: 100,
            dailyCostLimit: -1,
            dailyTokenLimit: null,
            dailyRequestLimit: undefined
          },
          gemini: {
            enabled: true,
            dailyRequestLimit: 1
          }
        }
      },
      redis
    )

    expect(policy).toEqual({
      enabled: true,
      platforms: {
        openai: {
          enabled: true,
          fiveHourUtilizationLimit: 85,
          sevenDayUtilizationLimit: 95,
          dailyCostLimit: 12.5,
          dailyTokenLimit: 100000,
          dailyRequestLimit: 2500
        },
        claude: {
          enabled: false,
          fiveHourUtilizationLimit: 90,
          sevenDayUtilizationLimit: 100,
          dailyCostLimit: 0,
          dailyTokenLimit: 0,
          dailyRequestLimit: 0
        }
      }
    })
    expect(JSON.parse(redis.state.policy)).toEqual(policy)
  })

  test('applies platform policy thresholds before built-in account limits', () => {
    const policy = {
      enabled: true,
      platforms: {
        openai: {
          enabled: true,
          fiveHourUtilizationLimit: 80,
          sevenDayUtilizationLimit: 95,
          dailyCostLimit: 5,
          dailyTokenLimit: 1000,
          dailyRequestLimit: 10
        },
        claude: {
          enabled: false,
          fiveHourUtilizationLimit: 100,
          sevenDayUtilizationLimit: 100,
          dailyCostLimit: 1,
          dailyTokenLimit: 1,
          dailyRequestLimit: 1
        }
      }
    }

    expect(
      accountPoolPolicyService.evaluateAccount(
        { primaryWindow: { utilization: 80, remainingSeconds: 300 } },
        { platform: 'openai', policy }
      ).reason
    ).toBe('five_hour_limit')
    expect(
      accountPoolPolicyService.evaluateAccount(
        { usage: { daily: { requests: 12 } } },
        { platform: 'openai', policy }
      ).reason
    ).toBe('request_limit')
    expect(
      accountPoolPolicyService.evaluateAccount(
        { usage: { daily: { requests: 12 } } },
        { platform: 'claude', policy }
      ).canSchedule
    ).toBe(true)
  })

  test('marks schedulable accounts as auto-stopped when a pool policy is exhausted', async () => {
    const updater = jest.fn()
    const decision = await accountPoolPolicyService.applySchedulingDecision({
      account: {
        id: 'openai-1',
        name: 'OpenAI 1',
        schedulable: true,
        primaryWindow: { utilization: 100, remainingSeconds: 300 }
      },
      updateAccount: updater
    })

    expect(decision.canSchedule).toBe(false)
    expect(decision.reason).toBe('five_hour_limit')
    expect(updater).toHaveBeenCalledWith('openai-1', {
      schedulable: 'false',
      accountPoolAutoStopped: 'true',
      accountPoolStoppedReason: 'five_hour_limit',
      accountPoolStoppedAt: expect.any(String)
    })
  })

  test('resumes only accounts previously stopped by the account-pool policy', async () => {
    const updater = jest.fn()
    const decision = await accountPoolPolicyService.applySchedulingDecision({
      account: {
        id: 'openai-1',
        name: 'OpenAI 1',
        schedulable: false,
        accountPoolAutoStopped: 'true',
        accountPoolStoppedReason: 'five_hour_limit',
        primaryWindow: { utilization: 25, remainingSeconds: 3000 }
      },
      updateAccount: updater
    })

    expect(decision.canSchedule).toBe(true)
    expect(decision.resumed).toBe(true)
    expect(updater).toHaveBeenCalledWith('openai-1', {
      schedulable: 'true',
      accountPoolAutoStopped: '',
      accountPoolStoppedReason: '',
      accountPoolStoppedAt: ''
    })
  })

  test('does not resume manually stopped accounts', async () => {
    const updater = jest.fn()
    const decision = await accountPoolPolicyService.applySchedulingDecision({
      account: {
        id: 'openai-1',
        schedulable: false,
        primaryWindow: { utilization: 25, remainingSeconds: 3000 }
      },
      updateAccount: updater
    })

    expect(decision.canSchedule).toBe(false)
    expect(decision.reason).toBe('not_schedulable')
    expect(updater).not.toHaveBeenCalled()
  })

  test('builds a shadow plan without mutating live server accounts', () => {
    const policy = accountPoolPolicyService.normalizePolicy({
      enabled: true,
      platforms: {
        openai: {
          enabled: true,
          fiveHourUtilizationLimit: 95,
          sevenDayUtilizationLimit: 100,
          dailyRequestLimit: 100
        }
      }
    })

    const plan = accountPoolPolicyService.buildShadowPlan({
      accounts: [
        {
          id: 'acct-stop',
          provider: 'openai',
          label: 'acct-stop',
          schedulable: true,
          usage: { fiveHourPercent: 96, sevenDayPercent: 40, requests: 10 }
        },
        {
          id: 'acct-resume',
          provider: 'openai',
          label: 'acct-resume',
          schedulable: false,
          accountPoolAutoStopped: true,
          accountPoolStoppedReason: 'five_hour_limit',
          usage: { fiveHourPercent: 20, sevenDayPercent: 30, requests: 10 }
        },
        {
          id: 'acct-manual',
          provider: 'openai',
          label: 'acct-manual',
          schedulable: false,
          status: 'PAUSED',
          stopSource: 'state',
          stopReason: 'deploy.spec.replicas=0',
          stopCategory: 'state_frozen',
          stopTrigger: 'scaled_down_reset_elapsed',
          stopDiagnosis: '远端原始状态为 PAUSED；5h=10%、7d=20%，state 已冻结且 reset 已过期，需要远端自动探测或复活链路刷新',
          lastError: 'deploy.spec.replicas=0',
          usage: { fiveHourPercent: 10, sevenDayPercent: 20, requests: 1 }
        }
      ],
      policy
    })

    expect(plan.mutationEnabled).toBe(false)
    expect(plan.totals).toEqual({
      accounts: 3,
      recommendStop: 1,
      recommendResume: 1,
      manualReview: 1,
      reasonBreakdown: {
        five_hour_limit: 1
      },
      skipBreakdown: {
        state_frozen: 1
      }
    })
    expect(plan.platforms.openai.recommendStop).toEqual([
      expect.objectContaining({
        id: 'acct-stop',
        provider: 'openai',
        action: 'would_stop',
        reason: 'five_hour_limit',
        governance: {
          source: 'policy',
          label: '策略到量',
          description: '本地账号池策略判定已到量，执行时会自动停用调度',
          autoManaged: true,
          recoverable: false
        }
      })
    ])
    expect(plan.platforms.openai.recommendResume).toEqual([
      expect.objectContaining({
        id: 'acct-resume',
        provider: 'openai',
        action: 'would_resume',
        reason: 'policy_limit_recovered',
        governance: {
          source: 'policy',
          label: '策略恢复',
          description: '之前由账号池策略停用，额度恢复后执行时会自动恢复调度',
          autoManaged: true,
          recoverable: true
        }
      })
    ])
    expect(plan.platforms.openai.manualReview).toEqual([
      expect.objectContaining({
        id: 'acct-manual',
        provider: 'openai',
        action: 'manual_review',
        reason: 'state_frozen',
        stopSource: 'state',
        stopReason: 'deploy.spec.replicas=0',
        stopCategory: 'state_frozen',
        stopTrigger: 'scaled_down_reset_elapsed',
        stopDiagnosis: '远端原始状态为 PAUSED；5h=10%、7d=20%，state 已冻结且 reset 已过期，需要远端自动探测或复活链路刷新',
        governance: {
          source: 'state',
          label: '状态冻结',
          description: '服务器状态已冻结且 reset 已过期，需要远端探测或恢复链路刷新',
          autoManaged: false,
          recoverable: true
        }
      })
    ])
  })

  test('returns readable Chinese governance labels for shadow decisions', () => {
    const plan = accountPoolPolicyService.buildShadowPlan({
      accounts: [
        {
          id: 'acct-stop',
          provider: 'openai',
          label: 'acct-stop',
          schedulable: true,
          usage: { fiveHourPercent: 100, sevenDayPercent: 10, requests: 0 }
        },
        {
          id: 'acct-state',
          provider: 'openai',
          label: 'acct-state',
          schedulable: false,
          stopSource: 'state',
          stopReason: 'deploy.spec.replicas=0',
          stopCategory: 'state_frozen',
          usage: { fiveHourPercent: 41, sevenDayPercent: 65, requests: 0 }
        }
      ],
      policy: accountPoolPolicyService.DEFAULT_POLICY
    })

    expect(plan.platforms.openai.recommendStop[0].governance).toEqual(
      expect.objectContaining({
        source: 'policy',
        label: '策略到量',
        description: '本地账号池策略判定已到量，执行时会自动停用调度'
      })
    )
    expect(plan.platforms.openai.manualReview[0].governance).toEqual(
      expect.objectContaining({
        source: 'state',
        label: '状态冻结',
        description: '服务器状态已冻结且 reset 已过期，需要远端探测或恢复链路刷新'
      })
    )
  })
})
