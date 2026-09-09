const grokQuota = require('../src/utils/grokQuota')

function jwtWithTier(tier) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ tier })).toString('base64url')
  return `${header}.${payload}.sig`
}

describe('grokQuota', () => {
  it('maps JWT numeric tier 5 to SuperGrok Heavy', () => {
    expect(grokQuota.subscriptionTierFromJWT(jwtWithTier(5))).toBe('supergrok_heavy')
    expect(grokQuota.planLabel('supergrok_heavy')).toBe('SuperGrok Heavy')
  })

  it('parses xAI rate-limit headers into used/limit utilization', () => {
    const now = new Date('2026-09-01T20:00:00.000Z')
    const snapshot = grokQuota.parseQuotaHeaders(
      {
        'x-ratelimit-limit-tokens': String(grokQuota.HEAVY_TOKEN_LIMIT),
        'x-ratelimit-remaining-tokens': String(grokQuota.HEAVY_TOKEN_LIMIT - 1_000_000),
        'x-ratelimit-reset-tokens': '3600',
        'x-ratelimit-limit-requests': String(grokQuota.HEAVY_REQUEST_LIMIT),
        'x-ratelimit-remaining-requests': '8000',
        'x-subscription-tier': 'SuperGrok Heavy'
      },
      { model: 'grok-4.5', now }
    )

    expect(snapshot.subscriptionTier).toBe('supergrok_heavy')
    expect(snapshot.planFrom45Responses).toBe('supergrok_heavy')
    expect(snapshot.tokens.limit).toBe(grokQuota.HEAVY_TOKEN_LIMIT)
    expect(snapshot.tokens.remaining).toBe(grokQuota.HEAVY_TOKEN_LIMIT - 1_000_000)
    expect(snapshot.requests.limit).toBe(grokQuota.HEAVY_REQUEST_LIMIT)

    const usage = grokQuota.buildGrokUsageSnapshot(
      {
        subscriptionTier: 'supergrok_heavy',
        grokQuotaSnapshot: JSON.stringify(snapshot)
      },
      now
    )
    expect(usage.planLabel).toBe('SuperGrok Heavy')
    expect(usage.tokens.used).toBe(1_000_000)
    expect(usage.tokens.utilization).toBeCloseTo(1.9, 1)
    expect(usage.requests.used).toBe(300)
  })

  it('keeps a previous Heavy 4.5 hint when a later non-4.5 observation arrives', () => {
    const previous = grokQuota.parseQuotaHeaders(
      {
        'x-ratelimit-limit-tokens': String(grokQuota.HEAVY_TOKEN_LIMIT),
        'x-ratelimit-limit-requests': String(grokQuota.HEAVY_REQUEST_LIMIT)
      },
      { model: 'grok-4.5' }
    )
    const next = grokQuota.parseQuotaHeaders(
      {
        'x-ratelimit-limit-tokens': '1000000',
        'x-ratelimit-remaining-tokens': '10'
      },
      { model: 'grok-4.3' }
    )
    const merged = grokQuota.mergeQuotaSnapshots(previous, next)
    expect(merged.planFrom45Responses).toBe('supergrok_heavy')
    expect(grokQuota.canonicalPlan({ snapshot: merged })).toBe('supergrok_heavy')
  })
})
