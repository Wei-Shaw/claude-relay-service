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

jest.mock('../src/services/serverStateService', () => ({
  getSummary: jest.fn(),
  getAccountMirror: jest.fn(),
  runAccountAction: jest.fn()
}))

jest.mock('../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  success: jest.fn()
}))

const serverStateService = require('../src/services/serverStateService')

require('../src/routes/admin/serverState')

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

function findPostHandler(path) {
  const route = mockRouter.post.mock.calls.find((call) => call[0] === path)
  return route?.[route.length - 1]
}

describe('admin server state route', () => {
  beforeEach(() => {
    serverStateService.getSummary.mockReset()
    serverStateService.getAccountMirror.mockReset()
    serverStateService.runAccountAction.mockReset()
    delete process.env.SERVER_STATE_LIVE_MUTATION_ENABLED
  })

  test('returns sanitized remote server state summary', async () => {
    serverStateService.getSummary.mockResolvedValue({
      target: 'JSZX-AI-03',
      health: {
        status: 'degraded',
        reason: 'state file not found',
        cachedAccountCount: 58,
        lastFetchAt: 1782633513.8
      },
      accountSource: {
        kind: 'canonical_state',
        accurate: true,
        degraded: false,
        count: 69,
        path: '/home/cltx/.chatgpt-quota/state/state.json',
        readAt: '2026-07-08T08:10:13Z',
        message: ''
      },
      accounts: {
        total: 58,
        normal: 40,
        paused: 5,
        abnormal: 13
      },
      credentials: {
        total: 72,
        withEmailPassword: 70,
        withChatGptPassword: 0
      },
      pools: {
        total: 3,
        healthy: 2,
        degraded: 1
      },
      demoCredential: {
        account: 'zk-codex-demo',
        present: true,
        updatedAt: '2026-07-07T13:00:00.000Z'
      }
    })

    const handler = findGetHandler('/server-state/summary')
    const res = createResponse()

    await handler({}, res)

    expect(res.status).not.toHaveBeenCalled()
    expect(res.body).toEqual({
      success: true,
      data: {
        target: 'JSZX-AI-03',
        health: {
          status: 'degraded',
          reason: 'state file not found',
          cachedAccountCount: 58,
          lastFetchAt: 1782633513.8
        },
        accountSource: {
          kind: 'canonical_state',
          accurate: true,
          degraded: false,
          count: 69,
          path: '/home/cltx/.chatgpt-quota/state/state.json',
          readAt: '2026-07-08T08:10:13Z',
          message: ''
        },
        accounts: {
          total: 58,
          normal: 40,
          paused: 5,
          abnormal: 13
        },
        credentials: {
          total: 72,
          withEmailPassword: 70,
          withChatGptPassword: 0
        },
        pools: {
          total: 3,
          healthy: 2,
          degraded: 1
        },
        demoCredential: {
          account: 'zk-codex-demo',
          present: true,
          updatedAt: '2026-07-07T13:00:00.000Z'
        }
      }
    })
  })

  test('returns sanitized remote server account mirror', async () => {
    serverStateService.getAccountMirror.mockResolvedValue({
      target: 'JSZX-AI-03',
      accounts: [
        {
          id: 'openai-prod-1',
          provider: 'openai',
          label: 'openai-prod-1',
          email: 'openai@example.com',
          status: 'ok',
          schedulable: true,
          maskedSecret: 'sk-...7890',
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
          lastError: ''
        }
      ],
      totals: {
        openai: { total: 1, schedulable: 1, stopped: 0 },
        claude: { total: 0, schedulable: 0, stopped: 0 }
      }
    })

    const handler = findGetHandler('/server-state/accounts')
    const res = createResponse()

    await handler({}, res)

    expect(res.status).not.toHaveBeenCalled()
    expect(res.body).toEqual({
      success: true,
      data: {
        target: 'JSZX-AI-03',
        accounts: [
          {
            id: 'openai-prod-1',
            provider: 'openai',
            label: 'openai-prod-1',
            email: 'openai@example.com',
            status: 'ok',
            schedulable: true,
            maskedSecret: 'sk-...7890',
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
            lastError: ''
          }
        ],
        totals: {
          openai: { total: 1, schedulable: 1, stopped: 0 },
          claude: { total: 0, schedulable: 0, stopped: 0 }
        }
      }
    })
  })

  test('runs safe remote server account refresh actions', async () => {
    serverStateService.runAccountAction.mockResolvedValue({
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
          fiveHourPercent: 0,
          sevenDayPercent: 0,
          cost: 0,
          tokens: 0,
          requests: 0
        },
        recovery: {
          fiveHourResetAt: null,
          sevenDayResetAt: null
        },
        lastError: ''
      }
    })

    const handler = findPostHandler('/server-state/accounts/:provider/:accountId/:action')
    const res = createResponse()

    await handler(
      {
        params: {
          provider: 'openai',
          accountId: 'openai-prod-1',
          action: 'refresh'
        }
      },
      res
    )

    expect(serverStateService.runAccountAction).toHaveBeenCalledWith({
      provider: 'openai',
      accountId: 'openai-prod-1',
      action: 'refresh'
    })
    expect(res.status).not.toHaveBeenCalled()
    expect(res.body).toEqual({
      success: true,
      data: {
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
            fiveHourPercent: 0,
            sevenDayPercent: 0,
            cost: 0,
            tokens: 0,
            requests: 0
          },
          recovery: {
            fiveHourResetAt: null,
            sevenDayResetAt: null
          },
          lastError: ''
        }
      }
    })
  })

  test('rejects live server pause and resume actions by default', async () => {
    const handler = findPostHandler('/server-state/accounts/:provider/:accountId/:action')

    for (const action of ['pause', 'resume']) {
      const res = createResponse()

      await handler(
        {
          params: {
            provider: 'openai',
            accountId: 'openai-prod-1',
            action
          }
        },
        res
      )

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.body).toEqual({
        success: false,
        message: 'Live server account mutation is disabled'
      })
    }

    expect(serverStateService.runAccountAction).not.toHaveBeenCalled()
  })

  test('allows live server pause and resume actions when explicitly enabled', async () => {
    process.env.SERVER_STATE_LIVE_MUTATION_ENABLED = 'true'
    serverStateService.runAccountAction.mockResolvedValue({
      target: 'JSZX-AI-03',
      provider: 'openai',
      accountId: 'acct-29',
      action: 'pause',
      ok: true,
      status: 200,
      message: 'pause completed',
      account: {
        id: 'acct-29',
        provider: 'openai',
        label: 'acct-29',
        status: 'PAUSED',
        schedulable: false
      }
    })

    const handler = findPostHandler('/server-state/accounts/:provider/:accountId/:action')
    const res = createResponse()

    await handler(
      {
        params: {
          provider: 'openai',
          accountId: 'acct-29',
          action: 'pause'
        }
      },
      res
    )

    expect(serverStateService.runAccountAction).toHaveBeenCalledWith({
      provider: 'openai',
      accountId: 'acct-29',
      action: 'pause'
    })
    expect(res.status).not.toHaveBeenCalled()
    expect(res.body).toEqual({
      success: true,
      data: {
        target: 'JSZX-AI-03',
        provider: 'openai',
        accountId: 'acct-29',
        action: 'pause',
        ok: true,
        status: 200,
        message: 'pause completed',
        account: {
          id: 'acct-29',
          provider: 'openai',
          label: 'acct-29',
          status: 'PAUSED',
          schedulable: false
        }
      }
    })
  })

  test('returns unsuccessful response when remote server account action is rejected', async () => {
    serverStateService.runAccountAction.mockResolvedValue({
      target: 'JSZX-AI-03',
      provider: 'openai',
      accountId: 'acct-99',
      action: 'refresh',
      ok: false,
      status: 400,
      message: "'acct-99' not in POOL_ACCOUNTS",
      account: null
    })

    const handler = findPostHandler('/server-state/accounts/:provider/:accountId/:action')
    const res = createResponse()

    await handler(
      {
        params: {
          provider: 'openai',
          accountId: 'acct-99',
          action: 'refresh'
        }
      },
      res
    )

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.body).toEqual({
      success: false,
      message: "'acct-99' not in POOL_ACCOUNTS",
      data: {
        target: 'JSZX-AI-03',
        provider: 'openai',
        accountId: 'acct-99',
        action: 'refresh',
        ok: false,
        status: 400,
        message: "'acct-99' not in POOL_ACCOUNTS",
        account: null
      }
    })
  })
})
