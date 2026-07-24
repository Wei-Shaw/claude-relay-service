const mockRouter = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  use: jest.fn()
}

jest.mock(
  'express',
  () => ({
    Router: () => mockRouter
  }),
  { virtual: true }
)

jest.mock('../src/middleware/auth', () => ({
  authenticateAdmin: jest.fn((_req, _res, next) => next())
}))

jest.mock('../src/services/account/claudeAccountService', () => ({
  getAllAccounts: jest.fn()
}))

jest.mock('../src/services/account/claudeConsoleAccountService', () => ({
  getAllAccounts: jest.fn()
}))

jest.mock('../src/services/account/openaiAccountService', () => ({
  getAllAccounts: jest.fn()
}))

jest.mock('../src/services/account/openaiResponsesAccountService', () => ({
  getAllAccounts: jest.fn()
}))

jest.mock('../src/services/serverStateService', () => ({
  getAccountMirror: jest.fn()
}))

jest.mock('../src/services/accountPoolAutomationService', () => ({
  runPolicySweep: jest.fn()
}))

jest.mock('../src/services/carherAdminSkillService', () => ({
  runAdminSkillAction: jest.fn()
}))

jest.mock('../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  success: jest.fn()
}))

jest.mock('../src/models/redis', () => {
  const state = {
    policy: null
  }
  return {
    getClientSafe: jest.fn(() => ({
      get: jest.fn(async (key) => (key === 'account_pool:policy' ? state.policy : null)),
      set: jest.fn(async (key, value) => {
        if (key === 'account_pool:policy') state.policy = value
        return 'OK'
      })
    })),
    __state: state
  }
})

const claudeAccountService = require('../src/services/account/claudeAccountService')
const claudeConsoleAccountService = require('../src/services/account/claudeConsoleAccountService')
const openaiAccountService = require('../src/services/account/openaiAccountService')
const openaiResponsesAccountService = require('../src/services/account/openaiResponsesAccountService')
const serverStateService = require('../src/services/serverStateService')
const accountPoolAutomationService = require('../src/services/accountPoolAutomationService')
const carherAdminSkillService = require('../src/services/carherAdminSkillService')
const fs = require('fs')
const path = require('path')

require('../src/routes/admin/accountPool')

function createResponse() {
  const res = {
    statusCode: 200,
    body: null,
    json: jest.fn((payload) => {
      res.body = payload
      return res
    }),
    status: jest.fn((code) => {
      res.statusCode = code
      return res
    })
  }

  return res
}

function findGetHandler(path) {
  const route = mockRouter.get.mock.calls.find((call) => call[0] === path)
  return route?.[route.length - 1]
}

function findPutHandler(path) {
  const route = mockRouter.put.mock.calls.find((call) => call[0] === path)
  return route?.[route.length - 1]
}

function findPostHandler(path) {
  const route = mockRouter.post.mock.calls.find((call) => call[0] === path)
  return route?.[route.length - 1]
}

describe('admin account pool summary route', () => {
  beforeEach(() => {
    claudeAccountService.getAllAccounts.mockReset()
    claudeConsoleAccountService.getAllAccounts.mockReset()
    openaiAccountService.getAllAccounts.mockReset()
    openaiResponsesAccountService.getAllAccounts.mockReset()
    serverStateService.getAccountMirror.mockReset()
    accountPoolAutomationService.runPolicySweep.mockReset()
    carherAdminSkillService.runAdminSkillAction.mockReset()
  })

  test('aggregates internal adapters into OpenAI and Claude business platforms', async () => {
    claudeAccountService.getAllAccounts.mockResolvedValue([
      {
        id: 'claude-1',
        isActive: true,
        schedulable: true,
        fiveHourWindow: { utilization: 72, remainingSeconds: 1800 },
        weeklyWindow: { utilization: 42, remainingSeconds: 3600 }
      },
      {
        id: 'claude-2',
        isActive: true,
        schedulable: false,
        fiveHourAutoStopped: 'true',
        fiveHourWindow: {
          utilization: 100,
          remainingSeconds: 600,
          resetAt: '2026-07-07T10:10:00.000Z'
        },
        weeklyWindow: {
          utilization: 88,
          remainingSeconds: 1200,
          resetAt: '2026-07-07T10:20:00.000Z'
        }
      }
    ])
    claudeConsoleAccountService.getAllAccounts.mockResolvedValue([
      {
        id: 'claude-console-1',
        isActive: false,
        schedulable: true,
        status: 'quota_exceeded',
        dailyQuota: '10',
        dailyUsage: '12.4',
        quotaStoppedAt: '2026-07-07T08:00:00.000Z'
      }
    ])
    openaiAccountService.getAllAccounts.mockResolvedValue([
      {
        id: 'openai-1',
        isActive: 'true',
        schedulable: 'true',
        primaryWindow: { utilization: 36, remainingSeconds: 7200 },
        secondaryWindow: { utilization: 64, remainingSeconds: 86400 }
      },
      {
        id: 'openai-2',
        isActive: 'true',
        schedulable: 'true',
        rateLimitStatus: { isRateLimited: true },
        primaryWindow: {
          utilization: 91,
          remainingSeconds: 300,
          resetAt: '2026-07-07T10:05:00.000Z'
        },
        secondaryWindow: {
          utilization: 100,
          remainingSeconds: 1800,
          resetAt: '2026-07-07T10:30:00.000Z'
        }
      }
    ])
    openaiResponsesAccountService.getAllAccounts.mockResolvedValue([
      {
        id: 'responses-1',
        isActive: 'false',
        schedulable: 'true',
        dailyQuota: '20',
        usage: { daily: { cost: 22 } },
        quotaStoppedAt: '2026-07-07T09:00:00.000Z'
      },
      {
        id: 'responses-2',
        isActive: 'true',
        schedulable: 'false',
        dailyQuota: '100',
        dailyUsage: '50'
      }
    ])

    const handler = findGetHandler('/account-pool/summary')
    const res = createResponse()

    await handler({}, res)

    expect(res.status).not.toHaveBeenCalled()
    expect(res.body).toEqual({
      success: true,
      data: {
        platforms: {
          openai: {
            label: 'OpenAI',
            adapters: ['openai', 'openai-responses'],
            total: 4,
            normal: 1,
            abnormal: 1,
            paused: 1,
            rateLimited: 1,
            available: 1,
            utilization: {
              fiveHour: 91,
              sevenDay: 100,
              quota: 110
            },
            recovery: {
              fiveHour: {
                utilization: 91,
                remainingSeconds: 300,
                resetAt: '2026-07-07T10:05:00.000Z'
              },
              sevenDay: {
                utilization: 100,
                remainingSeconds: 1800,
                resetAt: '2026-07-07T10:30:00.000Z'
              }
            },
            policy: {
              status: 'critical',
              label: '需要处理',
              blocked: 1,
              quotaStopped: 1,
              autoStopped: 0,
              highUsage: 2,
              hardStopped: 2,
              reasons: {
                seven_day_limit: 1,
                cost_limit: 1
              }
            }
          },
          claude: {
            label: 'Claude',
            adapters: ['claude', 'claude-console'],
            total: 3,
            normal: 1,
            abnormal: 1,
            paused: 1,
            rateLimited: 0,
            available: 1,
            utilization: {
              fiveHour: 100,
              sevenDay: 88,
              quota: 124
            },
            recovery: {
              fiveHour: {
                utilization: 100,
                remainingSeconds: 600,
                resetAt: '2026-07-07T10:10:00.000Z'
              },
              sevenDay: {
                utilization: 88,
                remainingSeconds: 1200,
                resetAt: '2026-07-07T10:20:00.000Z'
              }
            },
            policy: {
              status: 'critical',
              label: '需要处理',
              blocked: 1,
              quotaStopped: 1,
              autoStopped: 1,
              highUsage: 2,
              hardStopped: 2,
              reasons: {
                five_hour_limit: 1,
                cost_limit: 1
              }
            }
          }
        },
        policy: {
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
        },
        totals: {
          total: 7,
          normal: 2,
          abnormal: 2,
          paused: 2,
          rateLimited: 1,
          available: 2,
          utilization: {
            fiveHour: 100,
            sevenDay: 100,
            quota: 124
          },
          recovery: {
            fiveHour: {
              utilization: 100,
              remainingSeconds: 600,
              resetAt: '2026-07-07T10:10:00.000Z'
            },
            sevenDay: {
              utilization: 100,
              remainingSeconds: 1800,
              resetAt: '2026-07-07T10:30:00.000Z'
            }
          },
          policy: {
            status: 'critical',
            label: '需要处理',
            blocked: 2,
            quotaStopped: 2,
            autoStopped: 1,
            highUsage: 4,
            hardStopped: 4,
            reasons: {
              five_hour_limit: 1,
              seven_day_limit: 1,
              cost_limit: 2
            }
          }
        }
      }
    })
  })

  test('keeps account pool Chinese labels readable', () => {
    const files = [
      path.join(__dirname, '../src/routes/admin/accountPool.js'),
      path.join(__dirname, '../src/services/accountPoolPolicyService.js'),
      path.join(__dirname, '../src/services/serverStateService.js'),
      path.join(__dirname, '../web/admin-spa/src/components/dashboard/AccountPoolSummaryPanel.vue'),
      path.join(__dirname, '../web/admin-spa/src/components/dashboard/AccountPoolShadowPanel.vue'),
      path.join(__dirname, '../web/admin-spa/src/components/dashboard/ServerStatePanel.vue')
    ]

    const backendContent = fs.readFileSync(files[0], 'utf8')
    expect(backendContent).toContain('需要处理')
    expect(backendContent).toContain('接近上限')
    expect(backendContent).toContain('运行正常')

    const frontendContent = files.slice(3).map((file) => fs.readFileSync(file, 'utf8')).join('\n')
    expect(frontendContent).toContain('账号池')
    expect(frontendContent).toContain('服务器账号池')
    expect(frontendContent).toContain('策略影响')

    const serviceContent = files.slice(1, 3).map((file) => fs.readFileSync(file, 'utf8')).join('\n')
    expect(serviceContent).toContain('策略到量')
    expect(serviceContent).toContain('远端账号当前可调度')

    const mojibakeFragments = ['闇', '鐞', '绐', '濆', '鎺', '璐', '鈯', '�']
    for (const content of [backendContent, serviceContent, frontendContent]) {
      for (const fragment of mojibakeFragments) {
        expect(content).not.toContain(fragment)
      }
    }
  })

  test('returns and updates account pool policy configuration', async () => {
    const getHandler = findGetHandler('/account-pool/policy')
    const putHandler = findPutHandler('/account-pool/policy')
    const getBefore = createResponse()

    await getHandler({}, getBefore)

    expect(getBefore.body.data.platforms.openai).toEqual(
      expect.objectContaining({
        enabled: true,
        fiveHourUtilizationLimit: 100,
        sevenDayUtilizationLimit: 100,
        dailyCostLimit: 0,
        dailyTokenLimit: 0,
        dailyRequestLimit: 0
      })
    )

    const updateRes = createResponse()
    await putHandler(
      {
        body: {
          enabled: true,
          platforms: {
            openai: {
              enabled: true,
              fiveHourUtilizationLimit: 85,
              sevenDayUtilizationLimit: 92,
              dailyCostLimit: 30,
              dailyTokenLimit: 100000,
              dailyRequestLimit: 5000
            },
            claude: {
              enabled: false,
              fiveHourUtilizationLimit: 100,
              sevenDayUtilizationLimit: 100,
              dailyCostLimit: 0,
              dailyTokenLimit: 0,
              dailyRequestLimit: 0
            }
          }
        }
      },
      updateRes
    )

    expect(updateRes.body).toEqual({
      success: true,
      data: {
        enabled: true,
        platforms: {
          openai: {
            enabled: true,
            fiveHourUtilizationLimit: 85,
            sevenDayUtilizationLimit: 92,
            dailyCostLimit: 30,
            dailyTokenLimit: 100000,
            dailyRequestLimit: 5000
          },
          claude: {
            enabled: false,
            fiveHourUtilizationLimit: 100,
            sevenDayUtilizationLimit: 100,
            dailyCostLimit: 0,
            dailyTokenLimit: 0,
            dailyRequestLimit: 0
          }
        }
      }
    })
  })

  test('provides demo actions to force and restore account-pool scheduling policy', async () => {
    const putHandler = findPutHandler('/account-pool/demo')
    const forceRes = createResponse()

    await putHandler({ body: { platform: 'openai', mode: 'force_stop' } }, forceRes)

    expect(forceRes.body).toEqual({
      success: true,
      data: {
        mode: 'force_stop',
        platform: 'openai',
        policy: expect.objectContaining({
          platforms: expect.objectContaining({
            openai: expect.objectContaining({
              enabled: true,
              fiveHourUtilizationLimit: 1,
              sevenDayUtilizationLimit: 1,
              dailyRequestLimit: 1
            }),
            claude: expect.objectContaining({
              fiveHourUtilizationLimit: 100,
              sevenDayUtilizationLimit: 100
            })
          })
        })
      }
    })

    const restoreRes = createResponse()
    await putHandler({ body: { platform: 'openai', mode: 'restore' } }, restoreRes)

    expect(restoreRes.body).toEqual({
      success: true,
      data: {
        mode: 'restore',
        platform: 'openai',
        policy: expect.objectContaining({
          platforms: expect.objectContaining({
            openai: expect.objectContaining({
              enabled: true,
              fiveHourUtilizationLimit: 100,
              sevenDayUtilizationLimit: 100,
              dailyCostLimit: 0,
              dailyTokenLimit: 0,
              dailyRequestLimit: 0
            })
          })
        })
      }
    })
  })

  test('returns a read-only shadow plan from server account mirror', async () => {
    serverStateService.getAccountMirror.mockResolvedValue({
      target: 'JSZX-AI-03',
      accounts: [
        {
          id: 'acct-stop',
          provider: 'openai',
          label: 'acct-stop',
          status: 'ONLINE',
          schedulable: true,
          usage: {
            fiveHourPercent: 100,
            sevenDayPercent: 20,
            cost: 0,
            tokens: 0,
            requests: 0
          },
          recovery: {
            fiveHourResetAt: '2026-07-07T18:00:00.000Z',
            sevenDayResetAt: null
          },
          lastError: ''
        },
        {
          id: 'acct-manual',
          provider: 'openai',
          label: 'acct-manual',
          status: 'PAUSED',
          schedulable: false,
          stopSource: 'remote',
          stopReason: 'deploy.spec.replicas=0',
          stopCategory: 'remote_deploy_stopped',
          stopTrigger: 'deploy_replicas_zero',
          usage: {
            fiveHourPercent: 10,
            sevenDayPercent: 20,
            cost: 0,
            tokens: 0,
            requests: 0
          },
          recovery: {},
          lastError: 'deploy.spec.replicas=0'
        }
      ]
    })

    const handler = findGetHandler('/account-pool/shadow')
    const res = createResponse()

    await handler({}, res)

    expect(serverStateService.getAccountMirror).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
    expect(res.body).toEqual({
      success: true,
      data: expect.objectContaining({
        mode: 'shadow',
        mutationEnabled: false,
        target: 'JSZX-AI-03',
        totals: {
          accounts: 2,
          recommendStop: 1,
          recommendResume: 0,
          manualReview: 1,
          reasonBreakdown: {
            five_hour_limit: 1
          },
          skipBreakdown: {
            remote_deploy_stopped: 1
          }
        },
        platforms: expect.objectContaining({
          openai: expect.objectContaining({
            total: 2,
            recommendStop: [
              expect.objectContaining({
                id: 'acct-stop',
                action: 'would_stop',
                reason: 'five_hour_limit',
                governance: expect.objectContaining({
                  source: 'policy',
                  label: '策略到量',
                  autoManaged: true
                })
              })
            ],
            manualReview: [
              expect.objectContaining({
                id: 'acct-manual',
                action: 'manual_review',
                reason: 'remote_deploy_stopped',
                governance: expect.objectContaining({
                  source: 'remote',
                  label: '远端停用',
                  autoManaged: false
                })
              })
            ]
          })
        })
      })
    })
  })

  test('runs account-pool policy sweep in dry-run mode by default', async () => {
    accountPoolAutomationService.runPolicySweep.mockResolvedValue({
      mode: 'local',
      dryRun: true,
      mutationEnabled: false,
      totals: {
        scanned: 1,
        stopped: 0,
        resumed: 0,
        skipped: 0,
        wouldStop: 1,
        wouldResume: 0
      },
      platforms: {
        openai: {
          scanned: 1,
          stop: [{ id: 'openai-1', action: 'would_stop', reason: 'five_hour_limit' }],
          resume: [],
          skipped: []
        },
        claude: {
          scanned: 0,
          stop: [],
          resume: [],
          skipped: []
        }
      }
    })

    const handler = findPostHandler('/account-pool/sweep')
    const res = createResponse()

    await handler({ body: {} }, res)

    expect(accountPoolAutomationService.runPolicySweep).toHaveBeenCalledWith({
      dryRun: true,
      source: 'local'
    })
    expect(res.status).not.toHaveBeenCalled()
    expect(res.body).toEqual({
      success: true,
      data: expect.objectContaining({
        dryRun: true,
        mutationEnabled: false,
        totals: expect.objectContaining({
          wouldStop: 1
        })
      })
    })
  })

  test('runs account-pool policy sweep with live local mutations when dryRun is false', async () => {
    accountPoolAutomationService.runPolicySweep.mockResolvedValue({
      mode: 'local',
      dryRun: false,
      mutationEnabled: true,
      totals: {
        scanned: 1,
        stopped: 1,
        resumed: 0,
        skipped: 0,
        wouldStop: 0,
        wouldResume: 0
      },
      platforms: {
        openai: {
          scanned: 1,
          stop: [{ id: 'openai-1', action: 'stopped', reason: 'five_hour_limit' }],
          resume: [],
          skipped: []
        },
        claude: {
          scanned: 0,
          stop: [],
          resume: [],
          skipped: []
        }
      }
    })

    const handler = findPostHandler('/account-pool/sweep')
    const res = createResponse()

    await handler({ body: { dryRun: false } }, res)

    expect(accountPoolAutomationService.runPolicySweep).toHaveBeenCalledWith({
      dryRun: false,
      source: 'local'
    })
    expect(res.status).not.toHaveBeenCalled()
    expect(res.body).toEqual({
      success: true,
      data: expect.objectContaining({
        dryRun: false,
        mutationEnabled: true,
        totals: expect.objectContaining({
          stopped: 1
        })
      })
    })
  })

  test('runs account-pool policy sweep against the server mirror when requested', async () => {
    accountPoolAutomationService.runPolicySweep.mockResolvedValue({
      mode: 'server-mirror',
      target: 'JSZX-AI-03',
      dryRun: true,
      mutationEnabled: false,
      totals: {
        scanned: 58,
        stopped: 0,
        resumed: 0,
        skipped: 45,
        wouldStop: 3,
        wouldResume: 0
      },
      platforms: {
        openai: {
          scanned: 58,
          stop: [{ id: 'acct-29', action: 'would_stop', reason: 'five_hour_limit' }],
          resume: [],
          skipped: []
        },
        claude: {
          scanned: 0,
          stop: [],
          resume: [],
          skipped: []
        }
      }
    })

    const handler = findPostHandler('/account-pool/sweep')
    const res = createResponse()

    await handler({ body: { dryRun: true, source: 'server' } }, res)

    expect(accountPoolAutomationService.runPolicySweep).toHaveBeenCalledWith({
      dryRun: true,
      source: 'server'
    })
    expect(res.status).not.toHaveBeenCalled()
    expect(res.body).toEqual({
      success: true,
      data: expect.objectContaining({
        mode: 'server-mirror',
        target: 'JSZX-AI-03',
        totals: expect.objectContaining({
          scanned: 58,
          wouldStop: 3
        })
      })
    })
  })

  test('runs carher-admin skill action for OpenAI dry-run sweep', async () => {
    carherAdminSkillService.runAdminSkillAction.mockResolvedValue({
      success: true,
      provider: 'openai',
      action: 'openai_sweep_dry_run',
      dryRun: true,
      mutationEnabled: false,
      data: {
        totals: {
          scanned: 58
        }
      }
    })

    const handler = findPostHandler('/account-pool/admin-skill/action')
    const res = createResponse()

    await handler({ body: { action: 'openai_sweep_dry_run' } }, res)

    expect(carherAdminSkillService.runAdminSkillAction).toHaveBeenCalledWith({
      action: 'openai_sweep_dry_run'
    })
    expect(res.status).not.toHaveBeenCalled()
    expect(res.body).toEqual({
      success: true,
      data: expect.objectContaining({
        provider: 'openai',
        action: 'openai_sweep_dry_run',
        dryRun: true,
        mutationEnabled: false
      })
    })
  })

  test('runs carher-admin skill action for read-only server mirror refresh', async () => {
    carherAdminSkillService.runAdminSkillAction.mockResolvedValue({
      success: true,
      provider: 'all',
      action: 'refresh_mirror',
      dryRun: true,
      mutationEnabled: false,
      data: {
        target: 'JSZX-AI-03',
        totals: {
          scanned: 58,
          schedulable: 13,
          stopped: 45
        }
      }
    })

    const handler = findPostHandler('/account-pool/admin-skill/action')
    const res = createResponse()

    await handler({ body: { action: 'refresh_mirror' } }, res)

    expect(carherAdminSkillService.runAdminSkillAction).toHaveBeenCalledWith({
      action: 'refresh_mirror'
    })
    expect(res.status).not.toHaveBeenCalled()
    expect(res.body).toEqual({
      success: true,
      data: expect.objectContaining({
        provider: 'all',
        action: 'refresh_mirror',
        dryRun: true,
        mutationEnabled: false
      })
    })
  })

  test('returns 403 when carher-admin skill blocks live pause', async () => {
    const error = new Error('Live server account mutation is disabled')
    error.statusCode = 403
    carherAdminSkillService.runAdminSkillAction.mockRejectedValue(error)

    const handler = findPostHandler('/account-pool/admin-skill/action')
    const res = createResponse()

    await handler({ body: { action: 'openai_pause_account', accountId: 'acct-29' } }, res)

    expect(carherAdminSkillService.runAdminSkillAction).toHaveBeenCalledWith({
      action: 'openai_pause_account',
      accountId: 'acct-29'
    })
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.body).toEqual({
      success: false,
      message: 'Live server account mutation is disabled'
    })
  })
})

