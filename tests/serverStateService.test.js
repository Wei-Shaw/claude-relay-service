const defaultHealthSignals = (overrides = {}) => ({
  tier: '',
  primaryResetStatus: '',
  weeklyResetStatus: '',
  restoreStatus: '',
  quotaNotes: [],
  probeStale: false,
  tokenInvalid: false,
  subscriptionExpired: false,
  zombie: false,
  ...overrides
})

describe('serverStateService', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  test('reuses the recent account mirror to avoid repeated remote quota reads', async () => {
    const serverStateService = require('../src/services/serverStateService')
    let quotaReads = 0

    serverStateService.__setFetchQuotaScriptStateForTest(async () => {
      quotaReads += 1
      return {
        ok: true,
        source: {
          kind: 'carher_admin_quota_script',
          path: 'scripts/chatgpt-acct-quota.sh --json',
          count: 1,
          readAt: '2026-07-10T01:00:00.000Z'
        },
        accounts: [
          {
            acct: 'acct-1',
            p5h: 12,
            p7d: 34,
            tier: 'READY'
          }
        ]
      }
    })

    const [first, second] = await Promise.all([
      serverStateService.getAccountMirror(),
      serverStateService.getAccountMirror()
    ])

    expect(quotaReads).toBe(1)
    expect(first.accounts).toHaveLength(1)
    expect(second.accounts).toHaveLength(1)
  })

  test('summarizes remote server state without leaking credential values', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchRemoteForTest(async () => ({
      health: {
        ok: true,
        body: {
          status: 'degraded',
          source: {
            last_error: 'state file not found',
            cached_acct_count: 58,
            last_fetch_at: 1782633513.8
          }
        }
      },
      accounts: {
        ok: true,
        body: {
          accounts: [
            { acct: 'acct-1', status: 'ok' },
            { acct: 'acct-2', paused: true, status: 'ok' },
            { acct: 'acct-3', status: 'blocked', cause: '401' }
          ]
        }
      },
      credentials: {
        ok: true,
        body: {
          rows: [
            {
              acct: 'zk-codex-demo',
              email: 'demo@example.com',
              email_pw: 'secret-password',
              email_pw_present: true,
              chatgpt_pw: 'secret-chatgpt-password',
              chatgpt_pw_present: true,
              _updated_at: '2026-07-07T13:00:00.000Z'
            }
          ]
        }
      },
      pools: {
        ok: true,
        body: {
          pools: {
            primary: { status: 'healthy' },
            backup: { status: 'degraded' }
          }
        }
      }
    }))

    const summary = await serverStateService.getSummary()

    expect(summary).toEqual({
      target: 'JSZX-AI-03',
      health: {
        status: 'degraded',
        reason: 'state file not found',
        cachedAccountCount: 58,
        lastFetchAt: 1782633513.8
      },
      accountSource: {
        kind: 'live_acct_admin',
        path: '/api/accounts?force=true',
        accurate: true,
        degraded: false,
        count: 3,
        readAt: expect.any(String),
        message: ''
      },
      accounts: {
        total: 3,
        normal: 1,
        paused: 1,
        abnormal: 1
      },
      credentials: {
        total: 1,
        withEmailPassword: 1,
        withChatGptPassword: 1
      },
      pools: {
        total: 2,
        healthy: 1,
        degraded: 1
      },
      demoCredential: {
        account: 'zk-codex-demo',
        present: true,
        updatedAt: '2026-07-07T13:00:00.000Z'
      }
    })
    expect(JSON.stringify(summary)).not.toContain('secret-password')
    expect(JSON.stringify(summary)).not.toContain('secret-chatgpt-password')
  })

  test('uses canonical ChatGPT quota state instead of degraded acct-admin cache', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchRemoteForTest(async () => ({
      accounts: {
        ok: true,
        body: {
          accounts: [
            {
              acct: 'acct-1',
              status: 'OFFLINE',
              tier: 'TOKEN_INVALID',
              primary_pct: 5,
              weekly_pct: 100,
              cause: 'wk=100%>=99',
              paused: true,
              manual_offline: true
            }
          ]
        }
      },
      credentials: { ok: true, body: { rows: [] } }
    }))
    serverStateService.__setFetchCanonicalStateForTest(async () => ({
      ok: true,
      source: {
        path: '/home/cltx/.chatgpt-quota/state/state.json',
        count: 2,
        readAt: '2026-07-08T07:42:00.000Z'
      },
      accounts: [
        {
          acct: 'acct-1',
          tier: 'HEALTHY',
          cause: null,
          primary_pct: 3,
          weekly_pct: 3,
          paused: false,
          manual_offline: false,
          restore_at: null,
          primary_reset_at: 1783182101,
          weekly_reset_at: 1783731609,
          subscription_active_until: '2026-07-09T04:27:54+00:00',
          ts: 1783169245
        },
        {
          acct: 'acct-22',
          tier: 'SCALED_DOWN',
          cause: '5h=100%>=100',
          primary_pct: 100,
          weekly_pct: 86,
          paused: true,
          manual_offline: false,
          restore_at: 1783505207,
          primary_reset_at: 1783505207,
          weekly_reset_at: 1783702963,
          subscription_active_until: '2026-07-09T04:24:10+00:00',
          ts: 1783497427
        }
      ]
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.source).toEqual({
      kind: 'canonical_state',
      path: '/home/cltx/.chatgpt-quota/state/state.json',
      accurate: true,
      degraded: false,
      count: 2,
      readAt: '2026-07-08T07:42:00.000Z',
      message: ''
    })
    expect(mirror.accounts).toHaveLength(2)
    expect(mirror.accounts[0]).toEqual(
      expect.objectContaining({
        id: 'acct-1',
        provider: 'openai',
        status: 'ONLINE',
        schedulable: true,
        usage: expect.objectContaining({
          fiveHourPercent: 3,
          sevenDayPercent: 3
        }),
        stopSource: ''
      })
    )
    expect(mirror.accounts[1]).toEqual(
      expect.objectContaining({
        id: 'acct-22',
        provider: 'openai',
        status: 'PAUSED',
        schedulable: false,
        usage: expect.objectContaining({
          fiveHourPercent: 100,
          sevenDayPercent: 86
        }),
        stopSource: 'quota',
        stopCategory: 'quota_exhausted',
        stopTrigger: 'five_hour_limit'
      })
    )
    expect(mirror.totals).toEqual({
      openai: { total: 2, schedulable: 1, stopped: 1 },
      claude: { total: 0, schedulable: 0, stopped: 0 }
    })
  })

  test('prefers carher-admin quota script state over direct canonical path reads', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchQuotaScriptStateForTest(async () => ({
      ok: true,
      source: {
        kind: 'carher_admin_quota_script',
        path: 'scripts/chatgpt-acct-quota.sh --json',
        count: 1,
        readAt: '2026-07-08T09:15:00.000Z'
      },
      accounts: [
        {
          acct: 'acct-29',
          tier: 'HEALTHY',
          primary_pct: 3,
          weekly_pct: 9,
          paused: false,
          manual_offline: false,
          ts: 1783502000
        }
      ]
    }))
    serverStateService.__setFetchCanonicalStateForTest(async () => ({
      ok: true,
      source: {
        path: '/home/cltx/.chatgpt-quota/state/state.json',
        count: 1,
        readAt: '2026-07-08T09:10:00.000Z'
      },
      accounts: [
        {
          acct: 'acct-29',
          tier: 'SCALED_DOWN',
          cause: 'deploy.spec.replicas=0',
          primary_pct: 100,
          weekly_pct: 100,
          paused: true,
          manual_offline: false,
          ts: 1783501000
        }
      ]
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.source).toEqual({
      kind: 'carher_admin_quota_script',
      path: 'scripts/chatgpt-acct-quota.sh --json',
      accurate: true,
      degraded: false,
      count: 1,
      readAt: '2026-07-08T09:15:00.000Z',
      message: ''
    })
    expect(mirror.accounts).toEqual([
      expect.objectContaining({
        id: 'acct-29',
        status: 'ONLINE',
        schedulable: true,
        usage: expect.objectContaining({
          fiveHourPercent: 3,
          sevenDayPercent: 9
        }),
        stopSource: ''
      })
    ])
  })

  test('uses live aliyun quota script rows when canonical state is missing', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchQuotaScriptStateForTest(async () => ({
      ok: true,
      source: {
        kind: 'carher_admin_quota_script',
        path: 'scripts/chatgpt-acct-quota-aliyun.sh --json',
        count: 3,
        readAt: '2026-07-08T11:10:00.000Z'
      },
      accounts: [
        {
          acct: 'acct-1',
          email: 'acct1@example.com',
          ready: true,
          status: 'ONLINE',
          p5h: 5,
          p7d: 66,
          p_reset: 1783505207,
          w_reset: 1783702963,
          spend_5h: { calls: 11, spend: 1.25 }
        },
        {
          acct: 'acct-2',
          ready: true,
          status: 'QUOTA',
          p5h: 100,
          p7d: 71,
          probe_err: null,
          spend_5h: { calls: 0, spend: 0 }
        },
        {
          acct: 'acct-3',
          ready: false,
          status: 'OFFLINE',
          p5h: 20,
          p7d: 30,
          probe_err: 'pod not ready'
        }
      ]
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.source).toEqual({
      kind: 'carher_admin_quota_script',
      path: 'scripts/chatgpt-acct-quota-aliyun.sh --json',
      accurate: true,
      degraded: false,
      count: 3,
      readAt: '2026-07-08T11:10:00.000Z',
      message: ''
    })
    expect(mirror.accounts).toEqual([
      expect.objectContaining({
        id: 'acct-1',
        email: 'acct1@example.com',
        status: 'ONLINE',
        schedulable: true,
        usage: {
          fiveHourPercent: 5,
          sevenDayPercent: 66,
          cost: 1.25,
          tokens: 0,
          requests: 11
        },
        recovery: {
          fiveHourResetAt: 1783505207,
          sevenDayResetAt: 1783702963
        },
        stopSource: ''
      }),
      expect.objectContaining({
        id: 'acct-2',
        status: 'QUOTA',
        schedulable: false,
        stopSource: 'quota',
        stopCategory: 'quota_exhausted',
        stopTrigger: 'five_hour_limit'
      }),
      expect.objectContaining({
        id: 'acct-3',
        status: 'OFFLINE',
        schedulable: false,
        stopSource: 'remote',
        stopCategory: 'pod_not_ready',
        stopTrigger: 'pod_not_ready'
      })
    ])
    expect(mirror.totals).toEqual({
      openai: { total: 3, schedulable: 1, stopped: 2 },
      claude: { total: 0, schedulable: 0, stopped: 0 }
    })
  })

  test('tries the live aliyun quota script before stale canonical state scripts', async () => {
    const serverStateService = require('../src/services/serverStateService')
    const commands = []

    serverStateService.__setQuotaCommandRunnerForTest(async (command) => {
      commands.push(command)
      if (command.includes('chatgpt-acct-quota-aliyun.sh')) {
        return JSON.stringify([
          {
            acct: 'acct-58',
            ready: true,
            p5h: 8,
            p7d: 13,
            spend_5h: { calls: 2, spend: 0.25 }
          }
        ])
      }
      throw new Error('stale canonical state script should not run first')
    })

    const mirror = await serverStateService.getAccountMirror()

    expect(commands).toEqual(['scripts/chatgpt-acct-quota-aliyun.sh --json'])
    expect(mirror.source).toEqual(
      expect.objectContaining({
        kind: 'carher_admin_quota_script',
        path: 'scripts/chatgpt-acct-quota-aliyun.sh --json',
        message: ''
      })
    )
    expect(mirror.accounts[0]).toEqual(
      expect.objectContaining({
        id: 'acct-58',
        schedulable: true,
        usage: expect.objectContaining({
          fiveHourPercent: 8,
          sevenDayPercent: 13,
          requests: 2
        })
      })
    )
  })

  test('derives stop state from raw aliyun quota rows without status fields', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchQuotaScriptStateForTest(async () => ({
      ok: true,
      source: {
        kind: 'carher_admin_quota_script',
        path: 'scripts/chatgpt-acct-quota-aliyun.sh --json',
        count: 4,
        readAt: '2026-07-08T12:20:00.000Z'
      },
      accounts: [
        {
          acct: 'acct-70',
          ready: true,
          p5h: 100,
          p7d: 20,
          p_reset: 1783505207,
          w_reset: 1783702963
        },
        {
          acct: 'acct-71',
          ready: true,
          p5h: 6,
          p7d: 100,
          p_reset: 1783505207,
          w_reset: 1783702963
        },
        {
          acct: 'acct-72',
          ready: true,
          p5h: 0,
          p7d: 0,
          probe_err: 'token_invalidated'
        },
        {
          acct: 'acct-73',
          ready: true,
          p5h: 3,
          p7d: 9,
          sub_until: 1
        }
      ]
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.accounts).toEqual([
      expect.objectContaining({
        id: 'acct-70',
        status: 'QUOTA',
        schedulable: false,
        stopSource: 'quota',
        stopCategory: 'quota_exhausted',
        stopTrigger: 'five_hour_limit'
      }),
      expect.objectContaining({
        id: 'acct-71',
        status: 'QUOTA',
        schedulable: false,
        stopSource: 'quota',
        stopCategory: 'quota_exhausted',
        stopTrigger: 'seven_day_limit'
      }),
      expect.objectContaining({
        id: 'acct-72',
        status: 'TOKEN_INVALID',
        schedulable: false,
        stopSource: 'remote',
        stopCategory: 'subscription_issue',
        stopTrigger: 'token_invalid'
      }),
      expect.objectContaining({
        id: 'acct-73',
        status: 'OFFLINE',
        schedulable: false,
        stopSource: 'remote',
        stopCategory: 'subscription_issue',
        stopTrigger: 'subscription_expired'
      })
    ])
    expect(mirror.totals).toEqual({
      openai: { total: 4, schedulable: 0, stopped: 4 },
      claude: { total: 0, schedulable: 0, stopped: 0 }
    })
  })

  test('classifies aliyun live rows by probe evidence instead of generic remote stop labels', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchQuotaScriptStateForTest(async () => ({
      ok: true,
      source: {
        kind: 'carher_admin_quota_script',
        path: 'scripts/chatgpt-acct-quota-aliyun.sh --json',
        count: 4,
        readAt: '2026-07-09T06:00:00.000Z'
      },
      accounts: [
        {
          acct: 'acct-ready',
          ready: true,
          p5h: 12,
          p7d: 71,
          spend_5h: { calls: 3, spend: 0.2 }
        },
        {
          acct: 'acct-quota',
          ready: true,
          p5h: 100,
          p7d: 33,
          spend_5h: { calls: 0, spend: 0 }
        },
        {
          acct: 'acct-token',
          ready: true,
          p5h: 0,
          p7d: 0,
          probe_err: 'token_invalidated'
        },
        {
          acct: 'acct-pod',
          ready: false,
          p5h: 8,
          p7d: 9,
          probe_err: ''
        }
      ]
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.accounts).toEqual([
      expect.objectContaining({
        id: 'acct-ready',
        status: 'ONLINE',
        schedulable: true,
        stopSource: '',
        stopDiagnosis: '远端账号当前可调度'
      }),
      expect.objectContaining({
        id: 'acct-quota',
        status: 'QUOTA',
        schedulable: false,
        stopSource: 'quota',
        stopCategory: 'quota_exhausted',
        stopTrigger: 'five_hour_limit',
        stopDiagnosis: expect.stringContaining('命中 5h 到量')
      }),
      expect.objectContaining({
        id: 'acct-token',
        status: 'TOKEN_INVALID',
        schedulable: false,
        stopSource: 'remote',
        stopCategory: 'subscription_issue',
        stopTrigger: 'token_invalid',
        stopDiagnosis: expect.stringContaining('token 已失效')
      }),
      expect.objectContaining({
        id: 'acct-pod',
        status: 'OFFLINE',
        schedulable: false,
        stopSource: 'remote',
        stopCategory: 'pod_not_ready',
        stopTrigger: 'pod_not_ready',
        stopDiagnosis: expect.stringContaining('Pod 未就绪')
      })
    ])
  })

  test('derives quota-view reset signals from raw carher-admin state.json rows', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchQuotaScriptStateForTest(async () => ({
      ok: true,
      source: {
        kind: 'carher_admin_quota_script',
        path: 'scripts/chatgpt-acct-quota.sh --json',
        count: 1,
        readAt: '2026-07-08T09:30:00.000Z'
      },
      accounts: [
        {
          acct: 'acct-41',
          tier: 'SCALED_DOWN',
          primary_pct: 41,
          weekly_pct: 65,
          primary_reset_at: 1,
          weekly_reset_at: 1,
          restore_at: 1,
          cause: 'deploy.spec.replicas=0',
          paused: true,
          manual_offline: false,
          ts: 1783502000
        }
      ]
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.accounts).toEqual([
      expect.objectContaining({
        id: 'acct-41',
        status: 'PAUSED',
        schedulable: false,
        healthSignals: {
          tier: 'SCALED_DOWN',
          primaryResetStatus: 'past⊘',
          weeklyResetStatus: 'past⊘',
          restoreStatus: 'past⊘',
          quotaNotes: ['5h_reset elapsed', '7d_reset elapsed'],
          probeStale: false,
          tokenInvalid: false,
          subscriptionExpired: false,
          zombie: false
        },
        stopSource: 'state',
        stopReason: 'deploy.spec.replicas=0',
        stopCategory: 'state_frozen',
        stopTrigger: 'scaled_down_reset_elapsed',
        stopDiagnosis: expect.stringContaining('5h=41%')
      })
    ])
  })

  test('marks raw state rows without probe fields as zombie accounts', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchQuotaScriptStateForTest(async () => ({
      ok: true,
      source: {
        kind: 'carher_admin_quota_script',
        path: 'scripts/chatgpt-acct-quota.sh --json',
        count: 1,
        readAt: '2026-07-08T09:31:00.000Z'
      },
      accounts: [
        {
          acct: 'acct-ghost',
          ts: 1783502000,
          consecutive_probe_err: 2
        }
      ]
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.accounts[0]).toEqual(
      expect.objectContaining({
        id: 'acct-ghost',
        status: 'ZOMBIE',
        schedulable: false,
        healthSignals: expect.objectContaining({
          zombie: true
        }),
        stopSource: 'remote',
        stopReason: 'zombie state placeholder',
        stopCategory: 'remote_offline',
        stopTrigger: 'zombie_state'
      })
    )
  })

  test('merges Claude ccmax pool guard state with OpenAI quota state', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchQuotaScriptStateForTest(async () => ({
      ok: true,
      source: {
        kind: 'carher_admin_quota_script',
        path: 'scripts/chatgpt-acct-quota.sh --json',
        count: 1,
        readAt: '2026-07-08T09:15:00.000Z'
      },
      accounts: [
        {
          acct: 'acct-29',
          tier: 'HEALTHY',
          primary_pct: 3,
          weekly_pct: 9,
          paused: false,
          manual_offline: false,
          ts: 1783502000
        }
      ]
    }))
    serverStateService.__setFetchClaudeGuardStateForTest(async () => ({
      ok: true,
      source: {
        kind: 'ccmax_pool_guard',
        path: '/Data/ccmax-pool-guard/state.json',
        activePath: '/Data/ccmax-pool-guard/active-upstreams.json',
        count: 2,
        activeCount: 1,
        readAt: '2026-07-08T09:16:00.000Z'
      },
      accounts: {
        'claude-1': {
          acct: 'claude-1',
          state: 'ACTIVE',
          h5: 0.17,
          d7: 0.41,
          h5_reset_at: 1783505207,
          d7_reset_at: 1783702963,
          updated_at: '2026-07-08T09:16:00+08:00'
        },
        'claude-2': {
          acct: 'claude-2',
          state: 'DRAINED',
          drained_reason: 'h5_threshold',
          h5: 0.78,
          d7: 0.22,
          h5_reset_at: 1783505207,
          d7_reset_at: 1783702963,
          cooldown_until: 1783505207,
          updated_at: '2026-07-08T09:16:00+08:00'
        }
      },
      activeUpstreams: [{ acct: 'claude-1', label: 'Claude 1' }]
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.source).toEqual({
      kind: 'combined_account_state',
      accurate: true,
      degraded: false,
      count: 3,
      readAt: '2026-07-08T09:16:00.000Z',
      message: '',
      sources: [
        expect.objectContaining({
          kind: 'carher_admin_quota_script',
          count: 1
        }),
        expect.objectContaining({
          kind: 'ccmax_pool_guard',
          count: 2,
          activeCount: 1
        })
      ]
    })
    expect(mirror.accounts).toEqual([
      expect.objectContaining({
        id: 'acct-29',
        provider: 'openai',
        schedulable: true
      }),
      expect.objectContaining({
        id: 'claude-1',
        provider: 'claude',
        label: 'Claude 1',
        status: 'ACTIVE',
        schedulable: true,
        usage: expect.objectContaining({
          fiveHourPercent: 17,
          sevenDayPercent: 41
        }),
        stopSource: ''
      }),
      expect.objectContaining({
        id: 'claude-2',
        provider: 'claude',
        status: 'DRAINED',
        schedulable: false,
        usage: expect.objectContaining({
          fiveHourPercent: 78,
          sevenDayPercent: 22
        }),
        recovery: expect.objectContaining({
          fiveHourResetAt: 1783505207,
          sevenDayResetAt: 1783702963
        }),
        stopSource: 'quota',
        stopCategory: 'quota_exhausted',
        stopTrigger: 'five_hour_limit',
        stopDiagnosis: expect.stringContaining('5h=78%')
      })
    ])
    expect(mirror.totals).toEqual({
      openai: { total: 1, schedulable: 1, stopped: 0 },
      claude: { total: 2, schedulable: 1, stopped: 1 }
    })
  })

  test('falls back to a forced live acct-admin snapshot when canonical state is unavailable', async () => {
    const serverStateService = require('../src/services/serverStateService')
    const remoteCalls = []

    serverStateService.__setFetchRemoteForTest(async (paths) => {
      remoteCalls.push(paths)
      return {
        accounts: {
          ok: true,
          body: {
            accounts: [
              {
                acct: 'acct-live-1',
                provider: 'openai',
                status: 'ok',
                primary_pct: 11,
                weekly_pct: 22
              }
            ]
          }
        },
        credentials: { ok: true, body: { rows: [] } }
      }
    })

    const mirror = await serverStateService.getAccountMirror()

    expect(remoteCalls).toEqual([
      {
        accounts: '/api/accounts?force=true',
        credentials: '/api/creds'
      }
    ])
    expect(mirror.source).toEqual({
      kind: 'live_acct_admin',
      path: '/api/accounts?force=true',
      accurate: true,
      degraded: false,
      count: 1,
      readAt: expect.any(String),
      message: ''
    })
    expect(mirror.accounts[0]).toEqual(
      expect.objectContaining({
        id: 'acct-live-1',
        schedulable: true,
        usage: expect.objectContaining({
          fiveHourPercent: 11,
          sevenDayPercent: 22
        })
      })
    )
  })

  test('uses aliyun-probe p5h and p7d fields when live snapshots expose them', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchRemoteForTest(async () => ({
      accounts: {
        ok: true,
        body: {
          accounts: [
            {
              acct: 'acct-aliyun-1',
              provider: 'openai',
              status: 'ok',
              p5h: 23,
              p7d: 45,
              codex_5h: 12,
              codex_7d: 34,
              p_reset: 1783505207,
              w_reset: 1783702963,
              spend_5h: { calls: 18, spend: 2.5 }
            }
          ]
        }
      },
      credentials: { ok: true, body: { rows: [] } }
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.accounts[0]).toEqual(
      expect.objectContaining({
        id: 'acct-aliyun-1',
        usage: {
          fiveHourPercent: 23,
          sevenDayPercent: 45,
          codexFiveHourPercent: 12,
          codexSevenDayPercent: 34,
          cost: 2.5,
          tokens: 0,
          requests: 18
        },
        recovery: {
          fiveHourResetAt: 1783505207,
          sevenDayResetAt: 1783702963
        }
      })
    )
  })

  test('mirrors remote OpenAI and Claude accounts with masked secrets only', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchRemoteForTest(async () => ({
      health: { ok: true, body: { status: 'ok', source: {} } },
      accounts: {
        ok: true,
        body: {
          accounts: [
            {
              acct: 'openai-prod-1',
              provider: 'openai',
              status: 'ok',
              paused: false,
              api_key: 'sk-prod-openai-secret-1234567890',
              usage: {
                five_hour_percent: 76,
                seven_day_percent: 34,
                cost: 12.5,
                tokens: 45678,
                requests: 321
              },
              recovery: {
                five_hour_reset_at: '2026-07-07T16:00:00.000Z',
                seven_day_reset_at: '2026-07-12T00:00:00.000Z'
              },
              last_error: ''
            },
            {
              acct: 'claude-prod-1',
              provider: 'claude',
              status: 'blocked',
              paused: true,
              access_token: 'claude-access-token-secret-abcdef',
              cause: 'quota exceeded',
              usage: {
                five_hour_percent: 100,
                seven_day_percent: 91,
                cost: 28,
                tokens: 98765,
                requests: 654
              }
            }
          ]
        }
      },
      credentials: {
        ok: true,
        body: {
          rows: [
            {
              acct: 'openai-prod-1',
              email: 'openai@example.com',
              email_pw: 'email-password-secret',
              chatgpt_pw: 'chatgpt-password-secret',
              api_key: 'sk-prod-openai-secret-1234567890'
            },
            {
              acct: 'claude-prod-1',
              email: 'claude@example.com',
              access_token: 'claude-access-token-secret-abcdef'
            }
          ]
        }
      },
      pools: { ok: true, body: { pools: {} } }
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror).toEqual({
      target: 'JSZX-AI-03',
      source: {
        kind: 'live_acct_admin',
        path: '/api/accounts?force=true',
        accurate: true,
        degraded: false,
        count: 2,
        readAt: expect.any(String),
        message: ''
      },
      accounts: [
        {
          id: 'openai-prod-1',
          provider: 'openai',
          label: 'openai-prod-1',
          email: 'openai@example.com',
          status: 'ok',
          schedulable: true,
          maskedSecret: 'sk-prod-openai-secret-1234567890'.replace(
            /^(.{3}).*(.{4})$/,
            '$1...$2'
          ),
          usage: {
            fiveHourPercent: 76,
            sevenDayPercent: 34,
            cost: 12.5,
            tokens: 45678,
            requests: 321
          },
          recovery: {
            fiveHourResetAt: '2026-07-07T16:00:00.000Z',
            sevenDayResetAt: '2026-07-12T00:00:00.000Z'
          },
          healthSignals: defaultHealthSignals(),
          stopSource: '',
          stopReason: '',
          stopCategory: '',
          stopTrigger: '',
          stopDiagnosis: '远端账号当前可调度',
          lastError: ''
        },
        {
          id: 'claude-prod-1',
          provider: 'claude',
          label: 'claude-prod-1',
          email: 'claude@example.com',
          status: 'blocked',
          schedulable: false,
          maskedSecret: 'cl...cdef',
          usage: {
            fiveHourPercent: 100,
            sevenDayPercent: 91,
            cost: 28,
            tokens: 98765,
            requests: 654
          },
          recovery: {
            fiveHourResetAt: null,
            sevenDayResetAt: null
          },
          healthSignals: defaultHealthSignals(),
          stopSource: 'quota',
          stopReason: 'quota exceeded',
          stopCategory: 'quota_exhausted',
          stopTrigger: 'five_hour_limit',
          stopDiagnosis: expect.stringContaining('5h=100%'),
          lastError: 'quota exceeded'
        }
      ],
      totals: {
        openai: { total: 1, schedulable: 1, stopped: 0 },
        claude: { total: 1, schedulable: 0, stopped: 1 }
      }
    })
    expect(JSON.stringify(mirror)).not.toContain('email-password-secret')
    expect(JSON.stringify(mirror)).not.toContain('chatgpt-password-secret')
    expect(JSON.stringify(mirror)).not.toContain('claude-access-token-secret-abcdef')
    expect(JSON.stringify(mirror)).not.toContain('sk-prod-openai-secret-1234567890')
  })

  test('maps acct-admin ChatGPT account fields into OpenAI account mirror usage', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchRemoteForTest(async () => ({
      accounts: {
        ok: true,
        body: {
          accounts: [
            {
              acct: 'acct-1',
              status: 'OFFLINE',
              tier: 'TOKEN_INVALID',
              take: false,
              primary_pct: 5,
              weekly_pct: 100,
              primary_reset_at: 1782189322,
              weekly_reset_at: 1782337374,
              cause: 'wk=100%>=99',
              paused: true,
              manual_offline: true
            }
          ]
        }
      },
      credentials: { ok: true, body: { rows: [] } }
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror).toEqual({
      target: 'JSZX-AI-03',
      source: {
        kind: 'live_acct_admin',
        path: '/api/accounts?force=true',
        accurate: true,
        degraded: false,
        count: 1,
        readAt: expect.any(String),
        message: ''
      },
      accounts: [
        {
          id: 'acct-1',
          provider: 'openai',
          label: 'acct-1',
          email: '',
          status: 'OFFLINE',
          schedulable: false,
          maskedSecret: '',
          usage: {
            fiveHourPercent: 5,
            sevenDayPercent: 100,
            cost: 0,
            tokens: 0,
            requests: 0
          },
          recovery: {
            fiveHourResetAt: 1782189322,
            sevenDayResetAt: 1782337374
          },
          healthSignals: defaultHealthSignals({ tier: 'TOKEN_INVALID', tokenInvalid: true }),
          stopSource: 'remote',
          stopReason: 'wk=100%>=99',
          stopCategory: 'subscription_issue',
          stopTrigger: 'token_invalid',
          stopDiagnosis: expect.stringContaining('TOKEN_INVALID 表示 token 已失效'),
          lastError: 'wk=100%>=99'
        }
      ],
      totals: {
        openai: { total: 1, schedulable: 0, stopped: 1 },
        claude: { total: 0, schedulable: 0, stopped: 0 }
      }
    })
  })

  test('marks below-limit stopped remote accounts as remote stopped instead of policy stopped', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchRemoteForTest(async () => ({
      accounts: {
        ok: true,
        body: {
          accounts: [
            {
              acct: 'acct-2',
              status: 'OFFLINE',
              primary_pct: 12,
              weekly_pct: 71,
              cause: '5h=12%/wk=71%',
              paused: true,
              manual_offline: true
            }
          ]
        }
      },
      credentials: { ok: true, body: { rows: [] } }
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.accounts[0]).toEqual(
      expect.objectContaining({
        id: 'acct-2',
        schedulable: false,
        usage: expect.objectContaining({
          fiveHourPercent: 12,
          sevenDayPercent: 71
        }),
        stopSource: 'remote',
        stopReason: '5h=12%/wk=71%',
        stopCategory: 'remote_offline',
        stopTrigger: 'remote_offline',
        stopDiagnosis: expect.stringContaining('5h=12%')
      })
    )
  })

  test('marks abandoned or subscription-expired remote accounts as remote stopped', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchRemoteForTest(async () => ({
      accounts: {
        ok: true,
        body: {
          accounts: [
            {
              acct: 'acct-expired',
              status: 'OFFLINE',
              primary_pct: 100,
              weekly_pct: 0,
              cause: 'abandoned 2026-06-25 sub_expired',
              paused: true,
              manual_offline: true
            }
          ]
        }
      },
      credentials: { ok: true, body: { rows: [] } }
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.accounts[0]).toEqual(
      expect.objectContaining({
        id: 'acct-expired',
        schedulable: false,
        usage: expect.objectContaining({
          fiveHourPercent: 100,
          sevenDayPercent: 0
        }),
        stopSource: 'remote',
        stopReason: 'abandoned 2026-06-25 sub_expired',
        stopCategory: 'subscription_issue',
        stopTrigger: 'subscription_expired'
      })
    )
  })

  test('keeps deploy replica stopped accounts as remote stopped even when stale usage is full', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchRemoteForTest(async () => ({
      accounts: {
        ok: true,
        body: {
          accounts: [
            {
              acct: 'acct-replica-zero',
              status: 'PAUSED',
              primary_pct: 100,
              weekly_pct: 65,
              cause: 'deploy.spec.replicas=0',
              paused: true
            }
          ]
        }
      },
      credentials: { ok: true, body: { rows: [] } }
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.accounts[0]).toEqual(
      expect.objectContaining({
        id: 'acct-replica-zero',
        schedulable: false,
        stopSource: 'remote',
        stopReason: 'deploy.spec.replicas=0',
        stopCategory: 'remote_deploy_stopped',
        stopTrigger: 'deploy_replicas_zero',
        stopDiagnosis: expect.stringContaining('远端部署副本为 0')
      })
    )
  })

  test('classifies scaled-down accounts as quota stopped when the cause names a 5h limit', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchRemoteForTest(async () => ({
      accounts: {
        ok: true,
        body: {
          accounts: [
            {
              acct: 'acct-scaled-quota',
              status: 'PAUSED',
              tier: 'SCALED_DOWN',
              primary_pct: 100,
              weekly_pct: 65,
              cause: 'deploy.spec.replicas=0; 5h=100%>=99',
              paused: true
            }
          ]
        }
      },
      credentials: { ok: true, body: { rows: [] } }
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.accounts[0]).toEqual(
      expect.objectContaining({
        id: 'acct-scaled-quota',
        schedulable: false,
        stopSource: 'quota',
        stopReason: 'deploy.spec.replicas=0; 5h=100%>=99',
        stopCategory: 'quota_exhausted',
        stopTrigger: 'five_hour_limit'
      })
    )
  })

  test('marks quota stopped accounts only when tier or cause shows quota exhaustion', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchRemoteForTest(async () => ({
      accounts: {
        ok: true,
        body: {
          accounts: [
            {
              acct: 'acct-5h',
              status: 'PAUSED',
              tier: 'OFFLINE-5H',
              primary_pct: 100,
              weekly_pct: 64,
              cause: '5h=100%>=100',
              paused: true
            },
            {
              acct: 'acct-week',
              status: 'PAUSED',
              tier: 'OFFLINE-WEEK',
              primary_pct: 7,
              weekly_pct: 100,
              cause: 'wk=100%>=100',
              paused: true
            }
          ]
        }
      },
      credentials: { ok: true, body: { rows: [] } }
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.accounts).toEqual([
      expect.objectContaining({
        id: 'acct-5h',
        stopSource: 'quota',
        stopCategory: 'quota_exhausted',
        stopTrigger: 'five_hour_limit'
      }),
      expect.objectContaining({
        id: 'acct-week',
        stopSource: 'quota',
        stopCategory: 'quota_exhausted',
        stopTrigger: 'seven_day_limit'
      })
    ])
  })

  test('treats quota-rebalance paused snapshots as quota-managed even when usage is below threshold', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchQuotaScriptStateForTest(async () => ({
      ok: true,
      source: {
        kind: 'carher_admin_quota_script',
        path: 'scripts/chatgpt-acct-quota.sh --json',
        count: 1,
        readAt: '2026-07-09T04:10:00.000Z'
      },
      accounts: [
        {
          acct: 'acct-paused-snapshot',
          tier: 'SLOW',
          cause: '5h=12%/wk=71%',
          primary_pct: 12,
          weekly_pct: 71,
          paused: true,
          manual_offline: false,
          primary_reset_at: 1783505207,
          weekly_reset_at: 1783702963
        }
      ]
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.accounts[0]).toEqual(
      expect.objectContaining({
        id: 'acct-paused-snapshot',
        status: 'PAUSED',
        schedulable: false,
        stopSource: 'quota',
        stopReason: '5h=12%/wk=71%',
        stopCategory: 'quota_paused',
        stopTrigger: 'quota_rebalance_paused',
        stopDiagnosis: expect.stringContaining('quota-rebalance 已暂停调度')
      })
    )
  })

  test('classifies paused quota text as quota pause before generic quota errors', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchQuotaScriptStateForTest(async () => ({
      ok: true,
      source: {
        kind: 'carher_admin_quota_script',
        path: 'scripts/chatgpt-acct-quota.sh --json',
        count: 1,
        readAt: '2026-07-09T04:20:00.000Z'
      },
      accounts: [
        {
          acct: 'acct-paused-quota-text',
          tier: 'SLOW',
          cause: 'quota-rebalance paused: 5h=12%/wk=71%',
          primary_pct: 12,
          weekly_pct: 71,
          paused: true,
          manual_offline: false
        }
      ]
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.accounts[0]).toEqual(
      expect.objectContaining({
        id: 'acct-paused-quota-text',
        status: 'PAUSED',
        schedulable: false,
        stopSource: 'quota',
        stopReason: 'quota-rebalance paused: 5h=12%/wk=71%',
        stopCategory: 'quota_paused',
        stopTrigger: 'quota_rebalance_paused'
      })
    )
  })

  test('recognizes quota-rebalance OFFLINE cause strings as quota stops', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchRemoteForTest(async () => ({
      accounts: {
        ok: true,
        body: {
          accounts: [
            {
              acct: 'acct-offline-5h',
              status: 'PAUSED',
              tier: 'SCALED_DOWN',
              primary_pct: 5,
              weekly_pct: 71,
              cause: 'OFFLINE-5H',
              paused: true
            },
            {
              acct: 'acct-offline-week',
              status: 'PAUSED',
              tier: 'SCALED_DOWN',
              primary_pct: 12,
              weekly_pct: 40,
              cause: 'OFFLINE-WEEK',
              paused: true
            }
          ]
        }
      },
      credentials: { ok: true, body: { rows: [] } }
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.accounts).toEqual([
      expect.objectContaining({
        id: 'acct-offline-5h',
        stopSource: 'quota',
        stopCategory: 'quota_exhausted',
        stopTrigger: 'five_hour_limit'
      }),
      expect.objectContaining({
        id: 'acct-offline-week',
        stopSource: 'quota',
        stopCategory: 'quota_exhausted',
        stopTrigger: 'seven_day_limit'
      })
    ])
  })

  test('marks deploy replica stopped accounts below quota as remote deployment stopped', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchRemoteForTest(async () => ({
      accounts: {
        ok: true,
        body: {
          accounts: [
            {
              acct: 'acct-replica-zero-below-limit',
              status: 'PAUSED',
              primary_pct: 41,
              weekly_pct: 65,
              cause: 'deploy.spec.replicas=0',
              paused: true
            }
          ]
        }
      },
      credentials: { ok: true, body: { rows: [] } }
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.accounts[0]).toEqual(
      expect.objectContaining({
        id: 'acct-replica-zero-below-limit',
        schedulable: false,
        stopSource: 'remote',
        stopReason: 'deploy.spec.replicas=0',
        stopCategory: 'remote_deploy_stopped',
        stopTrigger: 'deploy_replicas_zero'
      })
    )
  })

  test('treats scaled-down accounts with elapsed reset windows as frozen state needing probe', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchRemoteForTest(async () => ({
      accounts: {
        ok: true,
        body: {
          accounts: [
            {
              acct: 'acct-scaled-stale',
              status: 'PAUSED',
              tier: 'SCALED_DOWN',
              primary_pct: 100,
              weekly_pct: 100,
              primary_reset_status: 'past⊘',
              weekly_reset_status: 'past⊘',
              cause: 'deploy.spec.replicas=0',
              paused: true
            }
          ]
        }
      },
      credentials: { ok: true, body: { rows: [] } }
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.accounts[0]).toEqual(
      expect.objectContaining({
        id: 'acct-scaled-stale',
        schedulable: false,
        usage: expect.objectContaining({
          fiveHourPercent: 100,
          sevenDayPercent: 100
        }),
        healthSignals: expect.objectContaining({
          tier: 'SCALED_DOWN',
          primaryResetStatus: 'past⊘',
          weeklyResetStatus: 'past⊘'
        }),
        stopSource: 'state',
        stopReason: 'deploy.spec.replicas=0',
        stopCategory: 'state_frozen',
        stopTrigger: 'scaled_down_reset_elapsed'
      })
    )
  })

  test('surfaces quota view health signals from acct-admin state snapshots', async () => {
    const serverStateService = require('../src/services/serverStateService')

    serverStateService.__setFetchRemoteForTest(async () => ({
      accounts: {
        ok: true,
        body: {
          accounts: [
            {
              acct: 'acct-scaled',
              status: 'PAUSED',
              tier: 'SCALED_DOWN',
              primary_pct: 41,
              weekly_pct: 65,
              primary_reset_status: 'past⊘',
              weekly_reset_status: 'past⊘',
              quota_notes: ['5h_reset elapsed', '7d_reset elapsed'],
              cause: 'deploy.spec.replicas=0',
              paused: true
            },
            {
              acct: 'acct-token',
              status: 'OFFLINE',
              tier: 'TOKEN_INVALID',
              primary_pct: 0,
              weekly_pct: 0,
              cause: 'token_dead_401 (consecutive x13)',
              manual_offline: true
            },
            {
              acct: 'acct-sub',
              status: 'PAUSED',
              tier: 'SCALED_DOWN',
              primary_pct: 5,
              weekly_pct: 0,
              cause: 'sub_expired',
              paused: true
            },
            {
              acct: 'acct-stale',
              status: 'ONLINE',
              tier: 'HEALTHY',
              primary_pct: 3,
              weekly_pct: 3,
              primary_reset_status: 'past!',
              probe_stale: true,
              cause: 'None'
            },
            {
              acct: 'acct-zombie',
              status: 'ZOMBIE',
              cause: 'state placeholder'
            }
          ]
        }
      },
      credentials: { ok: true, body: { rows: [] } }
    }))

    const mirror = await serverStateService.getAccountMirror()

    expect(mirror.accounts).toEqual([
      expect.objectContaining({
        id: 'acct-scaled',
        schedulable: false,
        stopSource: 'state',
        stopCategory: 'state_frozen',
        stopTrigger: 'scaled_down_reset_elapsed',
        healthSignals: {
          tier: 'SCALED_DOWN',
          primaryResetStatus: 'past⊘',
          weeklyResetStatus: 'past⊘',
          restoreStatus: '',
          quotaNotes: ['5h_reset elapsed', '7d_reset elapsed'],
          probeStale: false,
          tokenInvalid: false,
          subscriptionExpired: false,
          zombie: false
        },
        stopDiagnosis: expect.stringContaining('5h=41%')
      }),
      expect.objectContaining({
        id: 'acct-token',
        stopCategory: 'subscription_issue',
        healthSignals: expect.objectContaining({
          tier: 'TOKEN_INVALID',
          tokenInvalid: true,
          subscriptionExpired: false
        }),
        stopDiagnosis: expect.stringContaining('TOKEN_INVALID 表示 token 已失效')
      }),
      expect.objectContaining({
        id: 'acct-sub',
        stopCategory: 'subscription_issue',
        healthSignals: expect.objectContaining({
          subscriptionExpired: true
        }),
        stopDiagnosis: expect.stringContaining('订阅已过期')
      }),
      expect.objectContaining({
        id: 'acct-stale',
        schedulable: true,
        healthSignals: expect.objectContaining({
          primaryResetStatus: 'past!',
          probeStale: true
        }),
        stopDiagnosis: '远端账号当前可调度；存在过期 reset 快照；ONLINE 但探测数据可能滞后'
      }),
      expect.objectContaining({
        id: 'acct-zombie',
        schedulable: false,
        stopCategory: 'remote_offline',
        healthSignals: expect.objectContaining({
          zombie: true
        }),
        stopDiagnosis: expect.stringContaining('ZOMBIE 表示 state 残留无 probe 数据')
      })
    ])
  })

  test('refreshes remote account state through acct-admin force refresh', async () => {
    const serverStateService = require('../src/services/serverStateService')
    const calls = []

    serverStateService.__setMutateRemoteForTest(async (operation) => {
      calls.push(operation)
      return {
        ok: true,
        status: 200,
        body: {
          accounts: [
            {
              acct: 'openai-prod-1',
              provider: 'openai',
              status: 'ok',
              api_key: 'sk-remote-secret-123456',
              access_token: 'remote-access-token-secret',
              primary_pct: 7,
              weekly_pct: 12
            }
          ]
        }
      }
    })

    const result = await serverStateService.runAccountAction({
      accountId: 'openai-prod-1',
      provider: 'openai',
      action: 'refresh'
    })

    expect(calls).toEqual([
      {
        provider: 'openai',
        accountId: 'openai-prod-1',
        action: 'refresh',
        method: 'GET',
        path: '/api/accounts?force=true',
        body: {}
      }
    ])
    expect(result).toEqual({
      target: 'JSZX-AI-03',
      provider: 'openai',
      accountId: 'openai-prod-1',
      action: 'refresh',
      ok: true,
      status: 200,
      message: 'refreshed',
      account: {
        id: 'openai-prod-1',
        provider: 'openai',
        label: 'openai-prod-1',
        email: '',
        status: 'ok',
        schedulable: true,
        maskedSecret: 'sk-...3456',
        usage: {
          fiveHourPercent: 7,
          sevenDayPercent: 12,
          cost: 0,
          tokens: 0,
          requests: 0
        },
        recovery: {
          fiveHourResetAt: null,
          sevenDayResetAt: null
        },
        healthSignals: defaultHealthSignals(),
        stopSource: '',
        stopReason: '',
        stopCategory: '',
        stopTrigger: '',
        stopDiagnosis: '远端账号当前可调度',
        lastError: ''
      }
    })
    expect(JSON.stringify(result)).not.toContain('sk-remote-secret-123456')
    expect(JSON.stringify(result)).not.toContain('remote-access-token-secret')
  })

  test('pauses remote account through controlled acct-admin action', async () => {
    const serverStateService = require('../src/services/serverStateService')
    const calls = []
    serverStateService.__setMutateRemoteForTest(async (operation) => {
      calls.push(operation)
      return {
        ok: true,
        status: 200,
        body: {
          action: operation.action,
          result: {
            ok: true,
            acct: 'openai-prod-1',
            msg: `${operation.action} ok`,
            deleted: operation.action === 'pause' ? ['chatgpt-openai-prod-1-gpt-5.5'] : []
          },
          duration_ms: 25.1
        }
      }
    })
    serverStateService.__setFetchRemoteForTest(async () => ({
      accounts: {
        ok: true,
        body: {
          accounts: [
            {
              acct: 'openai-prod-1',
              provider: 'openai',
              status: 'MANUAL_OFFLINE',
              paused: true,
              manual_offline: true,
              primary_pct: 17,
              weekly_pct: 28,
              cause: 'manual pause from gateway'
            }
          ]
        }
      },
      credentials: { ok: true, body: { rows: [] } }
    }))

    const result = await serverStateService.runAccountAction({
      accountId: 'openai-prod-1',
      provider: 'openai',
      action: 'pause'
    })

    expect(calls).toEqual([
      {
        provider: 'openai',
        accountId: 'openai-prod-1',
        action: 'lock',
        method: 'POST',
        path: '/api/actions/lock',
        body: {
          acct: 'openai-prod-1',
          confirm: true,
          reason: 'manual pause from gateway'
        }
      },
      {
        provider: 'openai',
        accountId: 'openai-prod-1',
        action: 'pause',
        method: 'POST',
        path: '/api/actions/pause',
        body: {
          acct: 'openai-prod-1',
          confirm: true,
          reason: 'manual pause from gateway'
        }
      }
    ])
    expect(result).toEqual({
      target: 'JSZX-AI-03',
      provider: 'openai',
      accountId: 'openai-prod-1',
      action: 'pause',
      ok: true,
      status: 200,
      message: 'pause completed',
      account: {
        id: 'openai-prod-1',
        provider: 'openai',
        label: 'openai-prod-1',
        email: '',
        status: 'MANUAL_OFFLINE',
        schedulable: false,
        maskedSecret: '',
        usage: {
          fiveHourPercent: 17,
          sevenDayPercent: 28,
          cost: 0,
          tokens: 0,
          requests: 0
        },
        recovery: {
          fiveHourResetAt: null,
          sevenDayResetAt: null
        },
        healthSignals: defaultHealthSignals(),
        stopSource: 'remote',
        stopReason: 'manual pause from gateway',
        stopCategory: 'remote_offline',
        stopTrigger: 'remote_offline',
        stopDiagnosis: expect.stringContaining('MANUAL_OFFLINE'),
        lastError: 'manual pause from gateway'
      }
    })
  })

  test('resumes remote account through controlled acct-admin action', async () => {
    const serverStateService = require('../src/services/serverStateService')
    const calls = []
    serverStateService.__setMutateRemoteForTest(async (operation) => {
      calls.push(operation)
      return {
        ok: true,
        status: 200,
        body: {
          action: operation.action,
          result: {
            ok: true,
            acct: 'openai-prod-1',
            msg: `${operation.action} ok`,
            created: operation.action === 'resume' ? ['chatgpt-openai-prod-1-gpt-5.5'] : []
          },
          duration_ms: 31.2
        }
      }
    })
    serverStateService.__setFetchRemoteForTest(async () => ({
      accounts: {
        ok: true,
        body: {
          accounts: [
            {
              acct: 'openai-prod-1',
              provider: 'openai',
              status: 'ok',
              paused: false,
              manual_offline: false,
              primary_pct: 7,
              weekly_pct: 12
            }
          ]
        }
      },
      credentials: { ok: true, body: { rows: [] } }
    }))

    const result = await serverStateService.runAccountAction({
      accountId: 'openai-prod-1',
      provider: 'openai',
      action: 'resume'
    })

    expect(calls).toEqual([
      {
        provider: 'openai',
        accountId: 'openai-prod-1',
        action: 'unlock',
        method: 'POST',
        path: '/api/actions/unlock',
        body: {
          acct: 'openai-prod-1',
          confirm: true,
          reason: 'manual resume from gateway'
        }
      },
      {
        provider: 'openai',
        accountId: 'openai-prod-1',
        action: 'resume',
        method: 'POST',
        path: '/api/actions/resume',
        body: {
          acct: 'openai-prod-1',
          confirm: true,
          reason: 'manual resume from gateway'
        }
      }
    ])
    expect(result).toEqual({
      target: 'JSZX-AI-03',
      provider: 'openai',
      accountId: 'openai-prod-1',
      action: 'resume',
      ok: true,
      status: 200,
      message: 'resume completed',
      account: {
        id: 'openai-prod-1',
        provider: 'openai',
        label: 'openai-prod-1',
        email: '',
        status: 'ok',
        schedulable: true,
        maskedSecret: '',
        usage: {
          fiveHourPercent: 7,
          sevenDayPercent: 12,
          cost: 0,
          tokens: 0,
          requests: 0
        },
        recovery: {
          fiveHourResetAt: null,
          sevenDayResetAt: null
        },
        healthSignals: defaultHealthSignals(),
        stopSource: '',
        stopReason: '',
        stopCategory: '',
        stopTrigger: '',
        stopDiagnosis: '远端账号当前可调度',
        lastError: ''
      }
    })
  })

  test('rejects unsupported remote account actions and providers', async () => {
    const serverStateService = require('../src/services/serverStateService')

    await expect(
      serverStateService.runAccountAction({
        accountId: 'openai-prod-1',
        provider: 'openai',
        action: 'delete'
      })
    ).rejects.toThrow('Unsupported server account action')

    await expect(
      serverStateService.runAccountAction({
        accountId: 'gemini-prod-1',
        provider: 'gemini',
        action: 'pause'
      })
    ).rejects.toThrow('Unsupported server account provider')
  })
})
