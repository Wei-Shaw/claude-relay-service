const fs = require('fs')
const path = require('path')

const CANARY = 'secret-canary@example.invalid'
const ACCOUNT = 'synthetic-account'
const UPSTREAM = 'synthetic-upstream'
const NOW = '2026-01-01T00:00:00.000Z'
const window = (used = 80) => ({
  used_percent: used,
  limit_window_seconds: 18000,
  reset_at: 1767240000,
  reset_after_seconds: 3600
})
const usage = (used = 80) => ({
  email: CANARY,
  rate_limit: { primary_window: window(used), secondary_window: window(used) }
})
const credits = (count = 1) => ({
  available_count: count,
  credits: count
    ? [{ id: 'credit-1', status: 'available', expires_at: '2027-01-01T00:00:00Z', token: CANARY }]
    : [],
  access_token: CANARY
})

function makeService(overrides = {}) {
  const file = path.join(__dirname, '../src/services/codexResetCreditsService.js')
  expect(fs.existsSync(file)).toBe(true)
  const { createCodexResetCreditsService } = require(file)
  const account = {
    id: ACCOUNT,
    accountId: UPSTREAM,
    accessToken: 'encrypted-synthetic-token',
    proxy: null,
    isActive: 'true',
    status: 'active',
    schedulable: 'false',
    rateLimitStatus: 'limited',
    rateLimitedAt: NOW,
    rateLimitResetAt: '2026-01-01T01:00:00.000Z'
  }
  const accountService = {
    getAccount: jest.fn(async () => ({ ...account })),
    decrypt: jest.fn(() => 'synthetic-access-token'),
    isTokenExpired: jest.fn(() => false),
    refreshAccountToken: jest.fn(async () => {}),
    updateCodexUsageSnapshot: jest.fn(async () => {}),
    resetAccountStatus: jest.fn(),
    setAccountRateLimited: jest.fn(),
    updateAccount: jest.fn()
  }
  const request = jest.fn(async (options) => ({
    status: 200,
    data: options.url.endsWith('/usage') ? usage() : credits()
  }))
  const proxyHelper = { createProxyAgent: jest.fn(() => null) }
  const redis = { get: jest.fn(async () => null) }
  const deps = {
    accountService,
    request,
    proxyHelper,
    redis,
    delay: jest.fn(async () => {}),
    now: () => new Date(NOW),
    ...overrides
  }
  return { ...deps, account, service: createCodexResetCreditsService(deps) }
}

describe('Codex live reads', () => {
  test('fresh usage preserves safe numeric windows and decrypts only encrypted accessToken', async () => {
    const h = makeService()
    const result = await h.service.usage(ACCOUNT)
    expect(result).toEqual({
      account_id: ACCOUNT,
      checked_at: NOW,
      source: 'upstream',
      rate_limit: usage().rate_limit
    })
    expect(JSON.stringify(result)).not.toContain(CANARY)
    expect(h.accountService.decrypt).toHaveBeenCalledWith('encrypted-synthetic-token')
    expect(h.accountService.refreshAccountToken).not.toHaveBeenCalled()
    expect(h.accountService.updateCodexUsageSnapshot).toHaveBeenCalledWith(
      ACCOUNT,
      expect.objectContaining({ primaryUsedPercent: 80, primaryWindowMinutes: 300 })
    )
    const options = h.request.mock.calls[0][0]
    expect(options).toMatchObject({
      method: 'GET',
      url: 'https://chatgpt.com/backend-api/wham/usage',
      proxy: false,
      maxRedirects: 0,
      timeout: 10000,
      headers: {
        'ChatGPT-Account-ID': UPSTREAM,
        Authorization: 'Bearer synthetic-access-token',
        originator: 'codex_cli_rs'
      }
    })
    expect(options.httpsAgent.options.rejectUnauthorized).toBe(true)
    await h.service.usage(ACCOUNT)
    expect(h.request).toHaveBeenCalledTimes(2)
  })

  test('single weekly window clears the stale secondary cache slot', async () => {
    const h = makeService()
    const body = usage()
    body.rate_limit.primary_window.limit_window_seconds = 604800
    body.rate_limit.secondary_window = null
    h.request.mockResolvedValue({ status: 200, data: body })
    const result = await h.service.usage(ACCOUNT)
    expect(result.rate_limit.secondary_window).toBeNull()
    expect(h.accountService.updateCodexUsageSnapshot).toHaveBeenCalledWith(
      ACCOUNT,
      expect.objectContaining({
        primaryWindowMinutes: 10080,
        secondaryUsedPercent: 0,
        secondaryResetAfterSeconds: 0,
        secondaryWindowMinutes: 0
      })
    )
  })

  test('credits exposes only id/status/expires_at', async () => {
    const h = makeService()
    const result = await h.service.resetCredits(ACCOUNT)
    expect(result).toEqual({
      account_id: ACCOUNT,
      checked_at: NOW,
      source: 'upstream',
      available_count: 1,
      credits: [{ id: 'credit-1', status: 'available', expires_at: '2027-01-01T00:00:00.000Z' }]
    })
    expect(h.request.mock.calls[0][0].url).toBe(
      'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits'
    )
    expect(JSON.stringify(result)).not.toContain(CANARY)
  })

  test('expiry refresh re-reads the account and uses renewed encrypted token', async () => {
    const h = makeService()
    h.accountService.isTokenExpired.mockReturnValueOnce(true).mockReturnValue(false)
    h.accountService.refreshAccountToken.mockImplementation(async () => {
      h.account.accessToken = 'renewed-encrypted'
    })
    await h.service.usage(ACCOUNT)
    expect(h.accountService.refreshAccountToken).toHaveBeenCalledTimes(1)
    expect(h.accountService.decrypt).toHaveBeenLastCalledWith('renewed-encrypted')
  })

  test('GET401 refreshes at most once and uses fixed identity', async () => {
    const h = makeService()
    h.request
      .mockResolvedValueOnce({ status: 401, data: { token: CANARY } })
      .mockResolvedValueOnce({ status: 401, data: CANARY })
    await expect(h.service.usage(ACCOUNT)).rejects.toMatchObject({
      code: 'upstream_unauthorized',
      statusCode: 502
    })
    expect(h.request).toHaveBeenCalledTimes(2)
    expect(h.accountService.refreshAccountToken).toHaveBeenCalledTimes(1)
  })

  test('stored JWT identity must agree before any provider request', async () => {
    const h = makeService()
    const encoded = Buffer.from(
      JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'different-account' } })
    ).toString('base64url')
    h.accountService.decrypt.mockReturnValue(`e30.${encoded}.synthetic-signature`)
    await expect(h.service.usage(ACCOUNT)).rejects.toMatchObject({
      code: 'account_identity_changed'
    })
    expect(h.request).not.toHaveBeenCalled()
  })

  test('renewed JWT user cannot silently change under the same account metadata', async () => {
    const h = makeService()
    const token = (subject) =>
      `e30.${Buffer.from(JSON.stringify({ sub: subject, 'https://api.openai.com/auth': { chatgpt_account_id: UPSTREAM } })).toString('base64url')}.synthetic-signature`
    h.accountService.decrypt.mockImplementation((value) =>
      token(value === 'renewed' ? 'other-user' : 'original-user')
    )
    h.accountService.isTokenExpired.mockReturnValueOnce(true).mockReturnValue(false)
    h.accountService.refreshAccountToken.mockImplementation(async () => {
      h.account.accessToken = 'renewed'
    })
    await expect(h.service.usage(ACCOUNT)).rejects.toMatchObject({
      code: 'account_identity_changed'
    })
    expect(h.request).not.toHaveBeenCalled()
  })

  test.each(['1234', '12345', '123456'])(
    'normalizes provider fractional expiry %s and omits profile metadata',
    async (fraction) => {
      const h = makeService()
      h.request.mockResolvedValue({
        status: 200,
        data: {
          available_count: 1,
          credits: [
            {
              id: 'credit-a',
              status: 'available',
              expires_at: `2030-02-01T02:03:04.${fraction}Z`,
              profile_user_id: 'synthetic-private-profile',
              profile_image_url: 'https://example.invalid/private-profile'
            }
          ]
        }
      })
      const result = await h.service.resetCredits(ACCOUNT)
      expect(result.credits).toEqual([
        { id: 'credit-a', status: 'available', expires_at: '2030-02-01T02:03:04.123Z' }
      ])
      expect(JSON.stringify(result)).not.toContain('private-profile')
    }
  )

  test.each(
    ['usage', 'resetCredits', 'consume'].flatMap((operation) =>
      ['missing-subject', 'opaque'].map((kind) => [operation, kind])
    )
  )('fixed subject cannot disappear during %s renewal into %s', async (operation, kind) => {
    const h = operation === 'consume' ? consumeHarness() : makeService()
    const jwt = (claims) =>
      `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.synthetic-signature`
    const identity = { 'https://api.openai.com/auth': { chatgpt_account_id: UPSTREAM } }
    const original = jwt({ ...identity, sub: 'original-user' })
    const renewed = kind === 'opaque' ? 'synthetic-opaque' : jwt(identity)
    h.accountService.decrypt.mockImplementation((value) =>
      value === 'renewed' ? renewed : original
    )
    h.accountService.isTokenExpired.mockReturnValueOnce(true).mockReturnValue(false)
    h.accountService.refreshAccountToken.mockImplementation(async () => {
      h.account.accessToken = 'renewed'
    })
    await expect(h.service[operation](ACCOUNT, payload)).rejects.toMatchObject({
      code: 'account_identity_changed'
    })
    expect(h.accountService.refreshAccountToken).toHaveBeenCalledTimes(1)
    expect(h.request).not.toHaveBeenCalled()
  })

  test('missing access token is renewed through the existing account service', async () => {
    const h = makeService()
    h.account.accessToken = ''
    h.accountService.refreshAccountToken.mockImplementation(async () => {
      h.account.accessToken = 'renewed'
    })
    await h.service.usage(ACCOUNT)
    expect(h.accountService.refreshAccountToken).toHaveBeenCalledTimes(1)
    expect(h.accountService.decrypt).toHaveBeenLastCalledWith('renewed')
  })

  test('identity changes on OAuth renewal fail before upstream', async () => {
    const h = makeService()
    h.accountService.isTokenExpired.mockReturnValueOnce(true)
    h.accountService.refreshAccountToken.mockImplementation(async () => {
      h.account.accountId = 'other-account'
    })
    await expect(h.service.usage(ACCOUNT)).rejects.toMatchObject({
      code: 'account_identity_changed'
    })
    expect(h.request).not.toHaveBeenCalled()
  })

  test('refresh exceptions are reduced to a safe fixed error', async () => {
    const h = makeService()
    h.accountService.isTokenExpired.mockReturnValueOnce(true)
    h.accountService.refreshAccountToken.mockRejectedValue(new Error(CANARY))
    await expect(h.service.usage(ACCOUNT)).rejects.toMatchObject({
      code: 'oauth_refresh_failed',
      message: 'oauth_refresh_failed'
    })
    expect(h.request).not.toHaveBeenCalled()
  })

  test.each([NaN, Infinity, -1, 101, '90', null])(
    'rejects malformed percent %s without reflecting payload',
    async (percent) => {
      const h = makeService()
      h.request.mockResolvedValue({ status: 200, data: usage(percent) })
      await expect(h.service.usage(ACCOUNT)).rejects.toMatchObject({
        code: 'invalid_upstream_response',
        message: 'invalid_upstream_response'
      })
      expect(h.accountService.updateCodexUsageSnapshot).not.toHaveBeenCalled()
    }
  )

  test('malformed cards fail closed', async () => {
    const h = makeService()
    h.request.mockResolvedValue({
      status: 200,
      data: { available_count: 1, credits: [{ id: CANARY, status: CANARY, expires_at: CANARY }] }
    })
    await expect(h.service.resetCredits(ACCOUNT)).rejects.toMatchObject({
      code: 'invalid_upstream_response'
    })
  })

  test('configured proxy is reused without ambient proxy or disabled TLS', async () => {
    const h = makeService()
    h.account.proxy = { type: 'socks5', host: 'proxy.invalid', port: 1080 }
    const agent = { options: {} }
    h.proxyHelper.createProxyAgent.mockReturnValue(agent)
    await h.service.usage(ACCOUNT)
    expect(h.proxyHelper.createProxyAgent).toHaveBeenCalledWith(h.account.proxy)
    expect(h.request.mock.calls[0][0]).toMatchObject({
      proxy: false,
      httpsAgent: agent,
      maxRedirects: 0
    })
    expect(agent.options.rejectUnauthorized).toBe(true)
  })

  test('bad proxy does not silently go direct', async () => {
    const h = makeService()
    h.account.proxy = { type: 'invalid' }
    await expect(h.service.usage(ACCOUNT)).rejects.toMatchObject({ code: 'invalid_account_proxy' })
    expect(h.request).not.toHaveBeenCalled()
  })

  test('missing account is safe and never requests a model', async () => {
    const h = makeService()
    h.accountService.getAccount.mockResolvedValue(null)
    await expect(h.service.usage(ACCOUNT)).rejects.toMatchObject({
      code: 'account_not_found',
      statusCode: 404
    })
    expect(h.request).not.toHaveBeenCalled()
  })
})

const { createFakeRedis } = require('./fixtures/codexResetCreditsFakes')
const payload = { execute: true, request_id: 'req-1' }

function consumeHarness() {
  const h = makeService({
    redis: createFakeRedis(ACCOUNT, {
      accountId: UPSTREAM,
      rateLimitStatus: 'limited',
      rateLimitedAt: NOW,
      rateLimitResetAt: '2026-01-01T01:00:00.000Z',
      schedulable: 'false',
      isActive: 'false',
      status: 'unauthorized',
      errorMessage: 'unrelated',
      unauthorizedCount: '2'
    })
  })
  let consumed = false
  h.request.mockImplementation(async (options) => {
    if (options.method === 'POST') {
      consumed = true
      return { status: 200, data: { code: 'reset', windows_reset: 2, token: CANARY } }
    }
    return {
      status: 200,
      data: options.url.endsWith('/usage') ? usage(consumed ? 0 : 80) : credits(consumed ? 0 : 1)
    }
  })
  return h
}

describe('Codex exactly-once consumption receipts', () => {
  test('delayed quota visibility is polled read-only without replaying consumption', async () => {
    const h = consumeHarness()
    let posted = false
    h.request.mockImplementation(async (o) => {
      if (o.method === 'POST') {
        posted = true
        return { status: 200, data: { code: 'reset', windows_reset: 1 } }
      }
      return {
        status: 200,
        data: o.url.endsWith('/usage')
          ? usage(posted && h.delay.mock.calls.length >= 2 ? 0 : 80)
          : credits(posted ? 0 : 1)
      }
    })
    const result = await h.service.consume(ACCOUNT, payload)
    expect(result.status).toBe('reset_verified')
    expect(h.delay).toHaveBeenCalledTimes(2)
    expect(h.request.mock.calls.filter(([o]) => o.method === 'POST')).toHaveLength(1)
  })

  test.each([false, true])(
    'explicit reconciliation proves delayed reset; legacy=%s',
    async (legacy) => {
      const h = consumeHarness()
      let posted = false
      let visible = false
      h.request.mockImplementation(async (o) => {
        if (o.method === 'POST') {
          posted = true
          return { status: 200, data: { code: 'reset', windows_reset: 1 } }
        }
        return {
          status: 200,
          data: o.url.endsWith('/usage') ? usage(visible ? 0 : 80) : credits(posted ? 0 : 1)
        }
      })
      expect((await h.service.consume(ACCOUNT, payload)).status).toBe('uncertain')
      if (legacy) {
        for (const [key, value] of h.redis.values) {
          if (!key.includes(':request:')) {
            continue
          }
          const record = JSON.parse(value)
          delete record.owner
          delete record.upstream_hash
          h.redis.values.set(key, JSON.stringify(record))
        }
      }
      visible = true
      h.request.mockClear()
      const result = await h.service.reconcile(ACCOUNT, payload.request_id, {
        execute: true,
        confirm_request_id: payload.request_id
      })
      expect(result).toMatchObject({
        status: 'reset_verified',
        code: 'reset',
        windows_reset: 1,
        scheduling_updated: false
      })
      expect(h.request.mock.calls.every(([o]) => o.method === 'GET')).toBe(true)
      expect([...h.redis.values.keys()].some((key) => key.endsWith(':lock'))).toBe(false)
      expect(await h.service.operation(ACCOUNT, payload.request_id)).toEqual(result)
      h.request.mockClear()
      expect(
        await h.service.reconcile(ACCOUNT, payload.request_id, {
          execute: true,
          confirm_request_id: payload.request_id
        })
      ).toEqual(result)
      expect(h.request).not.toHaveBeenCalled()
    }
  )

  test.each([
    'no-debit',
    'expired-credit',
    'natural-reset',
    'owner-changed',
    'receipt-raced',
    'legacy-ambiguous',
    'identity-changed',
    'no-acknowledgement'
  ])('reconciliation retains barriers for %s', async (scenario) => {
    const h = consumeHarness()
    let posted = false
    let visible = false
    h.request.mockImplementation(async (o) => {
      if (o.method === 'POST') {
        posted = true
        return { status: 200, data: { code: 'reset', windows_reset: 1 } }
      }
      const bank = credits(posted && !(visible && scenario === 'no-debit') ? 0 : 1)
      if (scenario === 'expired-credit' && bank.credits.length) {
        bank.credits[0].expires_at = '2025-01-01T00:00:00Z'
      }
      return { status: 200, data: o.url.endsWith('/usage') ? usage(visible ? 0 : 80) : bank }
    })
    expect((await h.service.consume(ACCOUNT, payload)).status).toBe('uncertain')
    const key = [...h.redis.values.keys()].find((candidate) => candidate.includes(':request:'))
    const lock = [...h.redis.values.keys()].find((candidate) => candidate.endsWith(':lock'))
    const record = JSON.parse(h.redis.values.get(key))
    if (scenario === 'natural-reset') {
      for (const value of Object.values(record.receipt.before.usage.rate_limit)) {
        value.reset_at = Date.parse(NOW) / 1000 - 1
      }
    }
    if (scenario === 'no-acknowledgement') {
      record.receipt.windows_reset = 0
    }
    if (scenario === 'identity-changed') {
      record.upstream_hash = '0'.repeat(64)
    }
    if (scenario === 'owner-changed') {
      h.redis.values.set(lock, 'another-owner')
    }
    if (scenario === 'legacy-ambiguous') {
      delete record.owner
      delete record.upstream_hash
      h.redis.values.set('openai:codex-reset:upstream:other:lock', 'another-owner')
    }
    h.redis.values.set(key, JSON.stringify(record))
    if (scenario === 'receipt-raced') {
      const original = h.redis.eval.bind(h.redis)
      h.redis.eval = async (script, ...args) => {
        if (script.includes('-- codex-reconcile')) {
          h.redis.values.set(key, JSON.stringify({ ...record, concurrent_marker: true }))
        }
        return original(script, ...args)
      }
    }
    visible = true
    h.request.mockClear()
    const promise = h.service.reconcile(ACCOUNT, payload.request_id, {
      execute: true,
      confirm_request_id: payload.request_id
    })
    if (['no-debit', 'expired-credit', 'natural-reset'].includes(scenario)) {
      expect((await promise).status).toBe('uncertain')
    } else {
      await expect(promise).rejects.toMatchObject({ statusCode: 409 })
    }
    expect(h.redis.values.has(lock)).toBe(true)
    expect((await h.service.operation(ACCOUNT, payload.request_id)).status).toBe('uncertain')
    expect(h.request.mock.calls.every(([o]) => o.method === 'GET')).toBe(true)
  })

  test('reconciliation confirmation is mandatory before any I/O', async () => {
    const h = consumeHarness()
    await expect(
      h.service.reconcile(ACCOUNT, 'req-1', { execute: true, confirm_request_id: 'req-other' })
    ).rejects.toMatchObject({ code: 'execution_required' })
    expect(h.redis.calls).toEqual([])
    expect(h.request).not.toHaveBeenCalled()
  })

  test.each([undefined, {}, { execute: false }, { execute: 'true' }, { execute: 1 }])(
    'execute guard precedes every side effect for %s',
    async (body) => {
      const h = consumeHarness()
      expect(typeof h.service.consume).toBe('function')
      await expect(h.service.consume(ACCOUNT, body)).rejects.toMatchObject({
        code: 'execution_required',
        statusCode: 400
      })
      expect(h.redis.calls).toEqual([])
      expect(h.accountService.getAccount).not.toHaveBeenCalled()
      expect(h.request).not.toHaveBeenCalled()
    }
  )

  test.each(['', ' ', 'a'.repeat(129), '../req', 'bad@id'])(
    'invalid request_id %s is rejected before I/O',
    async (requestId) => {
      const h = consumeHarness()
      expect(typeof h.service.consume).toBe('function')
      await expect(
        h.service.consume(ACCOUNT, { execute: true, request_id: requestId })
      ).rejects.toMatchObject({ code: 'invalid_request', statusCode: 400 })
      expect(h.redis.calls).toEqual([])
    }
  )

  test('verified reset persists safe before/after and narrowly clears rate-limit metadata', async () => {
    const h = consumeHarness()
    expect(typeof h.service.consume).toBe('function')
    const result = await h.service.consume(ACCOUNT, payload)
    expect(result).toMatchObject({
      account_id: ACCOUNT,
      request_id: 'req-1',
      status: 'reset_verified',
      code: 'reset',
      windows_reset: 2,
      cache_updated: true,
      scheduling_updated: true,
      before: {
        usage: { rate_limit: { primary_window: { used_percent: 80 } } },
        credits: { available_count: 1 }
      },
      after: {
        usage: { rate_limit: { primary_window: { used_percent: 0 } } },
        credits: { available_count: 0 }
      }
    })
    expect(JSON.stringify(result)).not.toContain(CANARY)
    const post = h.request.mock.calls.filter(([o]) => o.method === 'POST')
    expect(post).toHaveLength(1)
    expect(post[0][0]).toMatchObject({
      url: 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume',
      data: { redeem_request_id: 'req-1' },
      maxRedirects: 0,
      proxy: false
    })
    expect(h.redis.hash).toMatchObject({
      rateLimitStatus: 'normal',
      schedulable: 'false',
      isActive: 'false',
      status: 'unauthorized',
      errorMessage: 'unrelated',
      unauthorizedCount: '2'
    })
    expect(h.redis.hash.rateLimitedAt).toBeUndefined()
    expect(h.accountService.resetAccountStatus).not.toHaveBeenCalled()
    expect(h.accountService.setAccountRateLimited).not.toHaveBeenCalled()
    expect(h.accountService.updateAccount).not.toHaveBeenCalled()
    expect(h.accountService.updateCodexUsageSnapshot).toHaveBeenCalledTimes(2)
    expect(await h.service.operation(ACCOUNT, 'req-1')).toEqual(result)
    expect(JSON.stringify([...h.redis.values.values()])).not.toContain(CANARY)
  })

  test('only a rate-limit-owned pause may be resumed after a verified reset', async () => {
    const h = consumeHarness()
    Object.assign(h.redis.hash, {
      isActive: 'true',
      status: 'active',
      rateLimitOwnsSchedulable: 'true'
    })
    const result = await h.service.consume(ACCOUNT, payload)
    expect(result.status).toBe('reset_verified')
    expect(h.redis.hash.schedulable).toBe('true')
    expect(h.redis.hash.rateLimitOwnsSchedulable).toBeUndefined()
    const sync = h.redis.calls.find(
      ([op, script]) => op === 'eval' && script.includes('-- codex-sync')
    )
    expect(sync[1]).toContain('rateLimitOwnsSchedulable')
  })

  test('more than one vanished credit is not a verified single redemption', async () => {
    const h = consumeHarness()
    let posted = false
    const bank = (count) => ({
      available_count: count,
      credits: Array.from({ length: count }, (_unused, i) => ({
        id: `credit-${i}`,
        status: 'available',
        expires_at: '2027-01-01T00:00:00Z'
      }))
    })
    h.request.mockImplementation(async (o) => {
      if (o.method === 'POST') {
        posted = true
        return { status: 200, data: { code: 'reset', windows_reset: 1 } }
      }
      return {
        status: 200,
        data: o.url.endsWith('/usage') ? usage(posted ? 0 : 100) : bank(posted ? 1 : 3)
      }
    })
    const result = await h.service.consume(ACCOUNT, payload)
    expect(result.status).toBe('uncertain')
    expect(result.code).toBe('unknown')
    expect((await h.service.operation(ACCOUNT, payload.request_id)).code).toBe('unknown')
    expect(result.scheduling_updated).toBe(false)
    expect(h.request.mock.calls.filter(([o]) => o.method === 'POST')).toHaveLength(1)
  })

  test('no available credits completes locally without POST', async () => {
    const h = consumeHarness()
    expect(typeof h.service.consume).toBe('function')
    h.request.mockImplementation(async (o) => ({
      status: 200,
      data: o.url.endsWith('/usage') ? usage() : credits(0)
    }))
    const result = await h.service.consume(ACCOUNT, payload)
    expect(result).toMatchObject({
      status: 'no_credit',
      windows_reset: 0,
      after: null,
      scheduling_updated: false
    })
    expect(h.request.mock.calls.every(([o]) => o.method === 'GET')).toBe(true)
    expect(await h.service.consume(ACCOUNT, { ...payload, request_id: 'req-2' })).toMatchObject({
      status: 'no_credit'
    })
  })

  test('failed no-credit persistence leaves a valid uncertain receipt and barrier', async () => {
    const h = consumeHarness()
    h.request.mockImplementation(async (o) => ({
      status: 200,
      data: o.url.endsWith('/usage') ? usage() : credits(0)
    }))
    const execute = h.redis.eval.bind(h.redis)
    let failed = false
    h.redis.eval = jest.fn(async (script, ...args) => {
      if (script.includes('-- codex-save') && !failed) {
        failed = true
        throw new Error(CANARY)
      }
      return execute(script, ...args)
    })
    await expect(h.service.consume(ACCOUNT, payload)).rejects.toMatchObject({
      code: 'storage_unavailable'
    })
    const receipt = await h.service.operation(ACCOUNT, payload.request_id)
    expect(receipt).toMatchObject({
      status: 'uncertain',
      code: 'storage_unavailable',
      windows_reset: 0,
      after: null
    })
    expect(await h.service.consume(ACCOUNT, payload)).toEqual(receipt)
    await expect(
      h.service.consume(ACCOUNT, { ...payload, request_id: 'must-stay-blocked' })
    ).rejects.toMatchObject({ code: 'account_locked' })
    expect(h.request.mock.calls.every(([o]) => o.method === 'GET')).toBe(true)
    expect(JSON.stringify(receipt)).not.toContain(CANARY)
  })

  test('a completed duplicate or receipt lookup never touches OAuth or upstream', async () => {
    const h = consumeHarness()
    expect(typeof h.service.consume).toBe('function')
    const first = await h.service.consume(ACCOUNT, payload)
    h.request.mockClear()
    h.accountService.getAccount.mockClear()
    h.accountService.refreshAccountToken.mockClear()
    expect(await h.service.consume(ACCOUNT, payload)).toEqual(first)
    expect(await h.service.operation(ACCOUNT, 'req-1')).toEqual(first)
    expect(h.request).not.toHaveBeenCalled()
    expect(h.accountService.getAccount).not.toHaveBeenCalled()
    expect(h.accountService.refreshAccountToken).not.toHaveBeenCalled()
    await expect(
      h.service.consume(ACCOUNT, { ...payload, credit_id: 'different' })
    ).rejects.toMatchObject({ code: 'idempotency_conflict', statusCode: 409 })
  })

  test('same-account concurrent requests cannot send a second POST', async () => {
    const h = consumeHarness()
    expect(typeof h.service.consume).toBe('function')
    let finishPost
    let startedPost
    const started = new Promise((resolve) => {
      startedPost = resolve
    })
    const original = h.request.getMockImplementation()
    h.request.mockImplementation(async (o) => {
      if (o.method === 'POST') {
        startedPost()
        await new Promise((resolve) => {
          finishPost = resolve
        })
      }
      return original(o)
    })
    const first = h.service.consume(ACCOUNT, payload)
    await started
    await expect(
      h.service.consume(ACCOUNT, { ...payload, request_id: 'req-2' })
    ).rejects.toMatchObject({ code: 'account_locked', statusCode: 409 })
    expect(await h.service.consume(ACCOUNT, payload)).toMatchObject({
      status: 'uncertain',
      code: 'pending'
    })
    finishPost()
    await first
    expect(h.request.mock.calls.filter(([o]) => o.method === 'POST')).toHaveLength(1)
  })

  test.each(['reserve', 'save', 'read'])(
    'Redis %s failure prevents any consume POST',
    async (stage) => {
      const h = consumeHarness()
      expect(typeof h.service.consume).toBe('function')
      const originalEval = h.redis.eval.bind(h.redis)
      h.redis.eval = async (script, ...args) => {
        if (script.includes(`-- codex-${stage}`)) {
          throw new Error(CANARY)
        }
        return originalEval(script, ...args)
      }
      if (stage === 'read') {
        h.redis.get = async () => {
          throw new Error(CANARY)
        }
      }
      await expect(h.service.consume(ACCOUNT, payload)).rejects.toMatchObject({
        code: 'storage_unavailable'
      })
      expect(h.request.mock.calls.filter(([o]) => o.method === 'POST')).toHaveLength(0)
    }
  )

  test.each([401, 'timeout', 500])(
    'POST %s is uncertain, never refreshed or replayed, and durably blocks new requests',
    async (status) => {
      const h = consumeHarness()
      expect(typeof h.service.consume).toBe('function')
      const original = h.request.getMockImplementation()
      h.request.mockImplementation(async (o) => {
        if (o.method !== 'POST') {
          return original(o)
        }
        if (status === 'timeout') {
          throw Object.assign(new Error(CANARY), { code: 'ETIMEDOUT' })
        }
        return { status, data: { code: CANARY } }
      })
      const result = await h.service.consume(ACCOUNT, payload)
      expect(result).toMatchObject({
        status: 'uncertain',
        after: null,
        cache_updated: false,
        scheduling_updated: false
      })
      expect(JSON.stringify(result)).not.toContain(CANARY)
      expect(h.accountService.refreshAccountToken).not.toHaveBeenCalled()
      expect(await h.service.consume(ACCOUNT, payload)).toEqual(result)
      await expect(
        h.service.consume(ACCOUNT, { ...payload, request_id: 'req-2' })
      ).rejects.toMatchObject({ code: 'account_locked' })
      expect(h.request.mock.calls.filter(([o]) => o.method === 'POST')).toHaveLength(1)
      const reserve = h.redis.calls.find(
        ([op, script]) => op === 'eval' && script.includes('-- codex-reserve')
      )
      expect(reserve[1]).not.toMatch(/\b(EXPIRE|PEXPIRE|SETEX|PX|EX)\b/)
    }
  )

  test('post-readback failure remains uncertain with receipt and no scheduling reset', async () => {
    const h = consumeHarness()
    expect(typeof h.service.consume).toBe('function')
    let posted = false
    const original = h.request.getMockImplementation()
    h.request.mockImplementation(async (o) => {
      if (posted) {
        throw new Error(CANARY)
      }
      if (o.method === 'POST') {
        posted = true
      }
      return original(o)
    })
    const result = await h.service.consume(ACCOUNT, payload)
    expect(result).toMatchObject({
      status: 'uncertain',
      code: 'readback_failed',
      after: null,
      scheduling_updated: false
    })
    expect(await h.service.operation(ACCOUNT, 'req-1')).toEqual(result)
  })

  test.each([
    [{ code: 'reset', windows_reset: 0 }, 0, 0],
    [{ code: 'reset', windows_reset: 1.5 }, 0, 0],
    [{ code: 'reset', windows_reset: 1 }, 80, 0],
    [{ code: 'reset', windows_reset: 1 }, 0, 1],
    [{ code: CANARY, windows_reset: 2 }, 0, 0]
  ])(
    '200 is not verified without positive code/windows/card/usage proof',
    async (body, usedAfter, cardsAfter) => {
      const h = consumeHarness()
      expect(typeof h.service.consume).toBe('function')
      let posted = false
      h.request.mockImplementation(async (o) => {
        if (o.method === 'POST') {
          posted = true
          return { status: 200, data: body }
        }
        return {
          status: 200,
          data: o.url.endsWith('/usage')
            ? usage(posted ? usedAfter : 80)
            : credits(posted ? cardsAfter : 1)
        }
      })
      const result = await h.service.consume(ACCOUNT, payload)
      expect(result.status).toBe('uncertain')
      expect(result.scheduling_updated).toBe(false)
      expect(JSON.stringify(result)).not.toContain(CANARY)
    }
  )

  test.each(['nothing_to_reset', 'no_credit'])(
    'provider %s is known completion, not a reset',
    async (code) => {
      const h = consumeHarness()
      expect(typeof h.service.consume).toBe('function')
      h.request.mockImplementation(async (o) => ({
        status: 200,
        data:
          o.method === 'POST'
            ? { code, windows_reset: 0 }
            : o.url.endsWith('/usage')
              ? usage()
              : credits()
      }))
      expect(await h.service.consume(ACCOUNT, payload)).toMatchObject({
        status: code,
        code,
        windows_reset: 0,
        scheduling_updated: false
      })
    }
  )

  test('final Redis failure leaves pending receipt and owner block even after upstream reset', async () => {
    const h = consumeHarness()
    expect(typeof h.service.consume).toBe('function')
    const original = h.redis.eval.bind(h.redis)
    h.redis.eval = async (script, ...args) => {
      if (script.includes('-- codex-save') && args[args.length - 1] === 'release') {
        throw new Error(CANARY)
      }
      return original(script, ...args)
    }
    const result = await h.service.consume(ACCOUNT, payload)
    expect(result).toMatchObject({ status: 'uncertain', code: 'storage_unavailable' })
    await expect(
      h.service.consume(ACCOUNT, { ...payload, request_id: 'req-2' })
    ).rejects.toMatchObject({ code: 'account_locked' })
  })

  test('owner mismatch cannot delete another lock or overwrite receipt', async () => {
    const h = consumeHarness()
    expect(typeof h.service.consume).toBe('function')
    const original = h.request.getMockImplementation()
    h.request.mockImplementation(async (o) => {
      if (o.method === 'POST') {
        for (const key of h.redis.values.keys()) {
          if (key.endsWith(':lock')) {
            h.redis.values.set(key, 'another-owner')
          }
        }
      }
      return original(o)
    })
    expect(await h.service.consume(ACCOUNT, payload)).toMatchObject({
      status: 'uncertain',
      code: 'storage_unavailable'
    })
    expect([...h.redis.values.values()]).toContain('another-owner')
    const scripts = h.redis.calls.filter(([op]) => op === 'eval').map(([, script]) => script)
    expect(scripts.find((script) => script.includes('-- codex-save'))).toContain(
      "redis.call('GET', KEYS[1]) ~= ARGV[1]"
    )
  })

  test('duplicate CRS records sharing upstream identity share the uncertainty barrier', async () => {
    const h = consumeHarness()
    expect(typeof h.service.consume).toBe('function')
    h.accountService.getAccount.mockImplementation(async (id) => ({ ...h.account, id }))
    const original = h.request.getMockImplementation()
    h.request.mockImplementation(async (o) =>
      o.method === 'POST' ? { status: 401, data: {} } : original(o)
    )
    expect(await h.service.consume(ACCOUNT, payload)).toMatchObject({ status: 'uncertain' })
    await expect(
      h.service.consume('duplicate-crs-record', { ...payload, request_id: 'req-2' })
    ).rejects.toMatchObject({ code: 'account_locked', statusCode: 409 })
    await expect(h.service.operation('duplicate-crs-record', 'req-1')).rejects.toMatchObject({
      code: 'operation_not_found'
    })
    expect(h.request.mock.calls.filter(([o]) => o.method === 'POST')).toHaveLength(1)
  })

  test('missing receipt returns 404 without OAuth', async () => {
    const h = consumeHarness()
    expect(typeof h.service.operation).toBe('function')
    await expect(h.service.operation(ACCOUNT, 'missing')).rejects.toMatchObject({
      code: 'operation_not_found',
      statusCode: 404
    })
    expect(h.accountService.getAccount).not.toHaveBeenCalled()
  })
})
