// Regression test: a model-family rate-limit block must be anchored to the window that
// was actually rejected — never to `anthropic-ratelimit-unified-reset`.
//
// Observed in production: four Claude OAuth accounts were each blocked for `claude-fable-5-1`
// for 4-5 days while their 7-day utilization sat at 0-4%. In every case the stored
// `fableRateLimitEndAt` was byte-identical to that account's `sevenDay.resetsAt`, because
// `anthropic-ratelimit-unified-reset` mirrors whichever window `representative-claim` points
// at (it floats). A temporary 5-hour exhaustion was therefore recorded as a week-long
// per-model block, the fable pool drained one account at a time, and every fable request
// eventually failed with "No available Claude accounts support the requested model".

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

const {
  parseRateLimitWindows,
  resolveRateLimitReset,
  DEFAULT_MAX_FALLBACK_SECONDS
} = require('../src/utils/rateLimitHeaderHelper')

const ts = (iso) => Math.floor(Date.parse(iso) / 1000)

// The exact shape observed on the wire (2026-09-05, 200 response).
const NOW = Date.parse('2026-09-05T04:25:00Z')
const FIVE_HOUR_RESET = ts('2026-09-05T06:10:00Z')
const SEVEN_DAY_RESET = ts('2026-09-09T04:00:00Z')

const headers = (overrides = {}) => ({
  'anthropic-ratelimit-unified-status': 'rejected',
  'anthropic-ratelimit-unified-5h-status': 'allowed',
  'anthropic-ratelimit-unified-5h-reset': String(FIVE_HOUR_RESET),
  'anthropic-ratelimit-unified-5h-utilization': '0.11',
  'anthropic-ratelimit-unified-7d-status': 'allowed',
  'anthropic-ratelimit-unified-7d-reset': String(SEVEN_DAY_RESET),
  'anthropic-ratelimit-unified-7d-utilization': '0.04',
  'anthropic-ratelimit-unified-7d_oi-status': 'allowed',
  'anthropic-ratelimit-unified-7d_oi-reset': String(SEVEN_DAY_RESET),
  'anthropic-ratelimit-unified-7d_oi-utilization': '0.0',
  'anthropic-ratelimit-unified-representative-claim': 'seven_day',
  // The floating one. Points at the 7d window here.
  'anthropic-ratelimit-unified-reset': String(SEVEN_DAY_RESET),
  ...overrides
})

describe('resolveRateLimitReset', () => {
  it('anchors to the rejected 5h window, not the 7d unified-reset (the production bug)', () => {
    const result = resolveRateLimitReset(
      headers({ 'anthropic-ratelimit-unified-5h-status': 'rejected' }),
      'fable',
      { now: NOW }
    )

    expect(result.resetTimestamp).toBe(FIVE_HOUR_RESET)
    expect(result.resetTimestamp).not.toBe(SEVEN_DAY_RESET)
    expect(result.windowKey).toBe('5h')
    expect(result.scope).toBe('account')
    expect(result.authoritative).toBe(true)
  })

  it('prefers the model-scoped window when it is the one rejected', () => {
    const result = resolveRateLimitReset(
      headers({
        'anthropic-ratelimit-unified-7d_oi-status': 'rejected',
        'anthropic-ratelimit-unified-5h-status': 'rejected'
      }),
      'opus',
      { now: NOW }
    )

    expect(result.resetTimestamp).toBe(SEVEN_DAY_RESET)
    expect(result.windowKey).toBe('7d_oi')
    expect(result.scope).toBe('model')
    expect(result.authoritative).toBe(true)
  })

  it('does not hand the opus-only window to a different family', () => {
    const result = resolveRateLimitReset(
      headers({
        'anthropic-ratelimit-unified-7d_oi-status': 'rejected',
        'anthropic-ratelimit-unified-5h-status': 'rejected'
      }),
      'fable',
      { now: NOW }
    )

    // fable has no dedicated window upstream, so it falls to the account-wide one
    expect(result.windowKey).toBe('5h')
    expect(result.scope).toBe('account')
  })

  it('takes the latest reset when several account windows are rejected', () => {
    const result = resolveRateLimitReset(
      headers({
        'anthropic-ratelimit-unified-5h-status': 'rejected',
        'anthropic-ratelimit-unified-7d-status': 'rejected'
      }),
      'sonnet',
      { now: NOW }
    )

    expect(result.resetTimestamp).toBe(SEVEN_DAY_RESET)
    expect(result.windowKey).toBe('7d')
  })

  it('clamps the unified-reset fallback when no window reports a rejection', () => {
    const result = resolveRateLimitReset(headers(), 'fable', { now: NOW })

    expect(result.authoritative).toBe(false)
    expect(result.clamped).toBe(true)
    expect(result.resetTimestamp).toBe(Math.floor(NOW / 1000) + DEFAULT_MAX_FALLBACK_SECONDS)
    // 4 days out would have been stored verbatim before this fix
    expect(result.resetTimestamp).toBeLessThan(SEVEN_DAY_RESET)
  })

  it('honours a custom fallback cap', () => {
    const result = resolveRateLimitReset(headers(), 'fable', {
      now: NOW,
      maxFallbackSeconds: 900
    })

    expect(result.resetTimestamp).toBe(Math.floor(NOW / 1000) + 900)
    expect(result.clamped).toBe(true)
  })

  it('leaves a near-term fallback reset untouched', () => {
    const soon = Math.floor(NOW / 1000) + 120
    const result = resolveRateLimitReset(
      {
        'anthropic-ratelimit-unified-reset': String(soon)
      },
      'fable',
      { now: NOW }
    )

    expect(result.resetTimestamp).toBe(soon)
    expect(result.clamped).toBe(false)
  })

  it('reads headers case-insensitively', () => {
    const result = resolveRateLimitReset(
      {
        'Anthropic-RateLimit-Unified-5h-Status': 'rejected',
        'Anthropic-RateLimit-Unified-5h-Reset': String(FIVE_HOUR_RESET)
      },
      'fable',
      { now: NOW }
    )

    expect(result.resetTimestamp).toBe(FIVE_HOUR_RESET)
    expect(result.windowKey).toBe('5h')
  })

  it('accepts ISO timestamps as well as unix seconds', () => {
    const result = resolveRateLimitReset(
      {
        'anthropic-ratelimit-unified-5h-status': 'rejected',
        'anthropic-ratelimit-unified-5h-reset': '2026-09-05T06:10:00Z'
      },
      'fable',
      { now: NOW }
    )

    expect(result.resetTimestamp).toBe(FIVE_HOUR_RESET)
  })

  it('returns null when there is nothing usable to go on', () => {
    expect(resolveRateLimitReset({}, 'fable', { now: NOW }).resetTimestamp).toBeNull()
    expect(resolveRateLimitReset(null, 'fable', { now: NOW }).resetTimestamp).toBeNull()
    expect(resolveRateLimitReset(undefined, null, { now: NOW }).resetTimestamp).toBeNull()
  })
})

describe('parseRateLimitWindows', () => {
  it('parses every window the upstream reports', () => {
    const windows = parseRateLimitWindows(headers())
    expect(windows.map((w) => w.key)).toEqual(['5h', '7d', '7d_oi'])

    const fiveHour = windows.find((w) => w.key === '5h')
    expect(fiveHour).toMatchObject({
      status: 'allowed',
      reset: FIVE_HOUR_RESET,
      utilization: 0.11,
      family: null,
      isAccountWide: true
    })

    const opusWindow = windows.find((w) => w.key === '7d_oi')
    expect(opusWindow).toMatchObject({ family: 'opus', isAccountWide: false })
  })

  it('skips windows the upstream did not report', () => {
    expect(parseRateLimitWindows({})).toEqual([])
    expect(parseRateLimitWindows(null)).toEqual([])
  })
})
