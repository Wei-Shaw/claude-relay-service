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
})
