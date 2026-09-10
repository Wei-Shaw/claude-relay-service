// The upstream /api/oauth/usage response carries per-model weekly caps in `limits[]`,
// NOT in a named top-level window. Observed on live Max accounts: `seven_day_opus` and
// `seven_day_sonnet` were both null while limits[] held a real Fable entry at 9% / 49%.
// Parsing only the named windows therefore showed an empty bar for accounts that were
// actually approaching (or already past) their Fable cap.

jest.mock('../src/models/redis', () => ({
  getClaudeAccount: jest.fn(async () => ({})),
  setClaudeAccount: jest.fn(async () => {}),
  client: { hdel: jest.fn(async () => 1) }
}))
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn()
}))
jest.mock('../src/services/tokenRefreshService', () => ({}))
jest.mock('../src/utils/tokenRefreshLogger', () => ({}))
jest.mock('../src/utils/webhookNotifier', () => ({ sendAccountAnomalyNotification: jest.fn() }))
jest.mock('../src/utils/upstreamErrorHelper', () => ({
  recordErrorHistory: jest.fn(() => ({ catch: jest.fn() })),
  markTempUnavailable: jest.fn(() => ({ catch: jest.fn() })),
  parseRetryAfter: jest.fn(() => null)
}))
jest.mock('../src/utils/proxyHelper', () => ({}))
jest.mock('axios', () => ({}))

// The service constructor starts a cache-cleanup setInterval at load; unref it so the
// timer never keeps Jest alive.
const _realSetInterval = global.setInterval
global.setInterval = (fn, ms, ...args) => {
  const timer = _realSetInterval(fn, ms, ...args)
  if (timer && typeof timer.unref === 'function') {
    timer.unref()
  }
  return timer
}
const claudeAccountService = require('../src/services/account/claudeAccountService')
global.setInterval = _realSetInterval

// Verbatim shape from the live upstream response.
const LIMITS = [
  {
    kind: 'session',
    group: 'session',
    percent: 0,
    severity: 'normal',
    resets_at: '2026-09-05T10:40:00.509692+00:00',
    scope: null,
    is_active: false
  },
  {
    kind: 'weekly_all',
    group: 'weekly',
    percent: 8,
    severity: 'normal',
    resets_at: '2026-09-09T07:00:00.509715+00:00',
    scope: null,
    is_active: false
  },
  {
    kind: 'weekly_scoped',
    group: 'weekly',
    percent: 9,
    severity: 'normal',
    resets_at: '2026-09-09T07:00:00.509898+00:00',
    scope: { model: { id: null, display_name: 'Fable' }, surface: null },
    is_active: true
  }
]

describe('_extractWeeklyScopedModels', () => {
  it('pulls the per-model weekly cap out of limits[]', () => {
    const scoped = claudeAccountService._extractWeeklyScopedModels(LIMITS)

    expect(scoped).toEqual([
      {
        modelName: 'Fable',
        utilization: 9,
        resetsAt: '2026-09-09T07:00:00.509898+00:00',
        severity: 'normal',
        isActive: true
      }
    ])
  })

  it('ignores account-wide entries and anything without a model name', () => {
    expect(
      claudeAccountService._extractWeeklyScopedModels([
        { kind: 'weekly_all', percent: 8, scope: null },
        { kind: 'weekly_scoped', percent: 5, scope: {} },
        { kind: 'weekly_scoped', percent: 5, scope: { model: {} } },
        null
      ])
    ).toEqual([])
  })

  it('tolerates a missing or malformed limits array', () => {
    expect(claudeAccountService._extractWeeklyScopedModels(undefined)).toEqual([])
    expect(claudeAccountService._extractWeeklyScopedModels(null)).toEqual([])
    expect(claudeAccountService._extractWeeklyScopedModels({})).toEqual([])
  })

  it('keeps every scoped model when the upstream reports more than one', () => {
    const scoped = claudeAccountService._extractWeeklyScopedModels([
      ...LIMITS,
      {
        kind: 'weekly_scoped',
        percent: 40,
        severity: 'warning',
        resets_at: '2026-09-10T00:00:00Z',
        scope: { model: { display_name: 'Opus' } },
        is_active: false
      }
    ])

    expect(scoped.map((s) => s.modelName)).toEqual(['Fable', 'Opus'])
    expect(scoped[1]).toMatchObject({ utilization: 40, severity: 'warning', isActive: false })
  })
})

describe('buildClaudeUsageSnapshot', () => {
  it('exposes scoped models with a computed remainingSeconds', () => {
    const resetsAt = new Date(Date.now() + 3600 * 1000).toISOString()
    const snapshot = claudeAccountService.buildClaudeUsageSnapshot({
      claudeUsageUpdatedAt: '2026-09-05T05:00:00.000Z',
      claudeWeeklyScopedModels: JSON.stringify([
        { modelName: 'Fable', utilization: 9, resetsAt, severity: 'normal', isActive: true }
      ])
    })

    expect(snapshot.sevenDayScopedModels).toHaveLength(1)
    expect(snapshot.sevenDayScopedModels[0]).toMatchObject({
      modelName: 'Fable',
      utilization: 9,
      isActive: true
    })
    expect(snapshot.sevenDayScopedModels[0].remainingSeconds).toBeGreaterThan(3500)
    expect(snapshot.sevenDayScopedModels[0].remainingSeconds).toBeLessThanOrEqual(3600)
  })

  it('does not throw on malformed stored JSON', () => {
    const snapshot = claudeAccountService.buildClaudeUsageSnapshot({
      claudeUsageUpdatedAt: '2026-09-05T05:00:00.000Z',
      claudeWeeklyScopedModels: '{not json'
    })

    expect(snapshot.sevenDayScopedModels).toEqual([])
  })

  it('still returns null when the account has no usage data at all', () => {
    expect(claudeAccountService.buildClaudeUsageSnapshot({})).toBeNull()
  })

  // Array.isArray('[null]' parsed) is true, so a corrupted Redis value used to reach
  // `item.modelName` and throw. One of the two call sites (claudeAccounts.js, the
  // cache-fresh branch) sits outside its try, where Promise.allSettled swallows the
  // rejection with no log at all — every usage bar for that account just vanishes.
  it('does not throw when the stored array holds null or primitive entries', () => {
    const snapshot = claudeAccountService.buildClaudeUsageSnapshot({
      claudeUsageUpdatedAt: '2026-09-05T05:00:00.000Z',
      claudeWeeklyScopedModels: JSON.stringify([null, 'Fable', 42, { modelName: 'Fable' }])
    })

    expect(snapshot.sevenDayScopedModels).toHaveLength(1)
    expect(snapshot.sevenDayScopedModels[0].modelName).toBe('Fable')
  })
})

describe('updateClaudeUsageSnapshot', () => {
  const redis = require('../src/models/redis')

  beforeEach(() => {
    jest.clearAllMocks()
    redis.getClaudeAccount.mockResolvedValue({ id: 'acc-1', name: 'test' })
  })

  const savedAccount = () => redis.setClaudeAccount.mock.calls[0][1]

  it('persists the scoped models parsed out of limits[]', async () => {
    await claudeAccountService.updateClaudeUsageSnapshot('acc-1', {
      five_hour: { utilization: 12, resets_at: '2026-09-05T10:00:00Z' },
      limits: [
        {
          kind: 'weekly_scoped',
          percent: 49,
          resets_at: '2026-09-09T07:00:00Z',
          scope: { model: { display_name: 'Fable' } },
          is_active: true
        }
      ]
    })

    const scoped = JSON.parse(savedAccount().claudeWeeklyScopedModels)
    expect(scoped).toHaveLength(1)
    expect(scoped[0]).toMatchObject({ modelName: 'Fable', utilization: 49 })
  })

  // Regression: the write used to be gated on `scopedModels.length > 0`, and
  // setClaudeAccount merges via Object.assign, so once the upstream stopped
  // returning a weekly_scoped entry the last snapshot stayed in Redis forever —
  // resetsAt in the past, remainingSeconds pinned at 0, and the UI kept rendering
  // a zombie bar with a frozen percentage.
  it('clears a previously stored snapshot once the upstream stops returning it', async () => {
    redis.getClaudeAccount.mockResolvedValue({
      id: 'acc-1',
      claudeWeeklyScopedModels: JSON.stringify([{ modelName: 'Fable', utilization: 49 }])
    })

    await claudeAccountService.updateClaudeUsageSnapshot('acc-1', {
      five_hour: { utilization: 12, resets_at: '2026-09-05T10:00:00Z' },
      limits: [{ kind: 'weekly_all', percent: 3 }]
    })

    expect(JSON.parse(savedAccount().claudeWeeklyScopedModels)).toEqual([])
  })

  it('does not touch the account when the upstream returned nothing at all', async () => {
    await claudeAccountService.updateClaudeUsageSnapshot('acc-1', { limits: [] })

    expect(redis.setClaudeAccount).not.toHaveBeenCalled()
  })

  // 早退条件里的 `&& scopedModels.length === 0` 是有载荷的：上游只回 limits[]
  // 而顶层三个窗口全缺时，没有这一半判断就会提前 return，scoped 数据永远落不了盘。
  // 变异测试证明：退回成只判 Object.keys(updates).length === 0 时，其余用例全绿。
  it('persists scoped models even when no top-level window was returned', async () => {
    await claudeAccountService.updateClaudeUsageSnapshot('acc-1', {
      limits: [
        {
          kind: 'weekly_scoped',
          percent: 9,
          resets_at: '2026-09-09T07:00:00Z',
          scope: { model: { display_name: 'Fable' } },
          is_active: true
        }
      ]
    })

    expect(redis.setClaudeAccount).toHaveBeenCalledTimes(1)
    const saved = redis.setClaudeAccount.mock.calls[0][1]
    expect(JSON.parse(saved.claudeWeeklyScopedModels)).toEqual([
      expect.objectContaining({ modelName: 'Fable', utilization: 9 })
    ])
  })
})
