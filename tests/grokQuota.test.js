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

    // This case also exercises the shallow-merge data loss below: `next` carried no
    // request headers, so the request window observed a moment ago must survive.
    expect(merged.requests).not.toBeNull()
    expect(merged.requests.limit).toBe(grokQuota.HEAVY_REQUEST_LIMIT)
  })

  // parseQuotaWindow returns null when a response carries no headers for that window,
  // and xAI does not return both groups on every endpoint. A plain `{...previous,
  // ...next}` therefore wiped out quota data that had already been measured, and the
  // admin UI fell back to 「等待上游配额头」 for a window it already knew.
  it('keeps windows the latest response did not report', () => {
    const previous = grokQuota.parseQuotaHeaders({
      'x-ratelimit-limit-requests': '8300',
      'x-ratelimit-remaining-requests': '8000',
      'xai-entitlement-status': 'active'
    })
    const next = grokQuota.parseQuotaHeaders({
      'x-ratelimit-limit-tokens': '1000000',
      'x-ratelimit-remaining-tokens': '900000'
    })

    const merged = grokQuota.mergeQuotaSnapshots(previous, next)

    expect(merged.requests).toMatchObject({ limit: 8300, remaining: 8000 })
    expect(merged.tokens).toMatchObject({ limit: 1000000, remaining: 900000 })
    expect(merged.entitlementStatus).toBe('active')
  })

  // canonicalPlan's result is persisted and fed back in as `subscriptionTier` on the
  // next observation, so treating that stored value as a Heavy candidate made the
  // label irreversible — a real downgrade on xAI's side would never show up.
  it('follows the tier the upstream reports now, even when it is a downgrade', () => {
    const snapshot = grokQuota.parseQuotaHeaders({ 'x-subscription-tier': 'SuperGrok' })

    expect(
      grokQuota.canonicalPlan({
        subscriptionTier: 'supergrok_heavy', // 上一次算出来、存进 Redis 的值
        snapshot
      })
    ).toBe('supergrok')
  })

  // 修降级问题时不能顺手把 Heavy 推断关掉：上游经常根本不回 tier 头，配额形状是
  // 唯一线索，而 mergeQuotaSnapshots 又会让 snapshot.subscriptionTier 粘住 ——
  // 若「见过一次 tier 头就以它为准」，一次偶发的头就会永久禁用 Heavy 推断。
  it('keeps inferring Heavy from the quota shape even when a tier header is present', () => {
    const snapshot = grokQuota.parseQuotaHeaders({
      'x-subscription-tier': 'SuperGrok',
      'x-ratelimit-limit-requests': String(grokQuota.HEAVY_REQUEST_LIMIT),
      'x-ratelimit-limit-tokens': String(grokQuota.HEAVY_TOKEN_LIMIT)
    })

    expect(grokQuota.canonicalPlan({ snapshot })).toBe('supergrok_heavy')
  })

  // 上游不再回配额头时快照会原样留着。窗口早就重置了，界面却一直显示
  // 「1000/1000 已用、100%、重置剩余 0 秒」，运维会以为账号还卡在配额耗尽上。
  it('treats a window whose reset time has passed as replenished', () => {
    const past = new Date('2026-09-01T01:00:00.000Z').toISOString()
    const snapshot = {
      requests: { limit: 1000, remaining: 0, resetsAt: past },
      subscriptionTier: 'supergrok'
    }

    const usage = grokQuota.buildGrokUsageSnapshot(
      { grokQuotaSnapshot: JSON.stringify(snapshot) },
      new Date('2026-09-10T00:00:00.000Z')
    )

    expect(usage.requests).toMatchObject({ limit: 1000, remaining: 1000, used: 0, utilization: 0 })
  })

  it('still reports a live window as used', () => {
    const future = new Date(Date.now() + 3600 * 1000).toISOString()
    const snapshot = { requests: { limit: 1000, remaining: 250, resetsAt: future } }

    const usage = grokQuota.buildGrokUsageSnapshot({ grokQuotaSnapshot: JSON.stringify(snapshot) })

    expect(usage.requests).toMatchObject({ used: 750, utilization: 75 })
  })

  // parseQuotaWindow 在只有 reset 头时返回 {limit:null,remaining:null,resetUnix:X}，
  // 它是 truthy —— 整块保留判断会放它覆盖掉上一次真实测到的 limit/remaining。
  it('keeps known limit/remaining when the next response carries only a reset header', () => {
    const previous = grokQuota.parseQuotaHeaders({
      'x-ratelimit-limit-requests': '1000',
      'x-ratelimit-remaining-requests': '150'
    })
    const next = grokQuota.parseQuotaHeaders({ 'x-ratelimit-reset-requests': '3600' })

    const merged = grokQuota.mergeQuotaSnapshots(previous, next)

    expect(merged.requests.limit).toBe(1000)
    expect(merged.requests.remaining).toBe(150)
    expect(merged.requests.resetUnix).toBe(next.requests.resetUnix)
  })

  it('still lets a fresh reading overwrite an older one', () => {
    const previous = grokQuota.parseQuotaHeaders({
      'x-ratelimit-limit-requests': '1000',
      'x-ratelimit-remaining-requests': '150'
    })
    const next = grokQuota.parseQuotaHeaders({
      'x-ratelimit-limit-requests': '1000',
      'x-ratelimit-remaining-requests': '20'
    })

    expect(grokQuota.mergeQuotaSnapshots(previous, next).requests.remaining).toBe(20)
  })

  it('still infers Heavy from the quota shape when no tier header is present', () => {
    const snapshot = grokQuota.parseQuotaHeaders({
      'x-ratelimit-limit-requests': String(grokQuota.HEAVY_REQUEST_LIMIT),
      'x-ratelimit-limit-tokens': String(grokQuota.HEAVY_TOKEN_LIMIT)
    })

    expect(grokQuota.canonicalPlan({ snapshot })).toBe('supergrok_heavy')
  })
})
