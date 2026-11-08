const https = require('https')
const crypto = require('crypto')

const ROOT = 'https://chatgpt.com/backend-api/wham'
const WINDOW_NAMES = ['primary_window', 'secondary_window']
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/

// Pending/uncertain writes deliberately have no TTL. A crash must not reopen
// an operation that the upstream may already have performed.
const RESERVE = `-- codex-reserve
if redis.call('EXISTS', KEYS[2]) == 1 then return 2 end
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[2])
return 1`
const SAVE = `-- codex-save
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[2])
if ARGV[3] == 'release' then redis.call('DEL', KEYS[1]) end
return 1`
const RECONCILE = `-- codex-reconcile
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if redis.call('GET', KEYS[2]) ~= ARGV[2] then return 0 end
redis.call('SET', KEYS[2], ARGV[3])
redis.call('DEL', KEYS[1])
return 1`
const SYNC_RATE_LIMIT = `-- codex-sync
if redis.call('HGET', KEYS[1], 'accountId') ~= ARGV[1] then return 0 end
if redis.call('HGET', KEYS[1], 'rateLimitStatus') ~= 'limited' then return 0 end
if (redis.call('HGET', KEYS[1], 'rateLimitedAt') or '') ~= ARGV[2] then return 0 end
if (redis.call('HGET', KEYS[1], 'rateLimitResetAt') or '') ~= ARGV[3] then return 0 end
if redis.call('HGET', KEYS[1], 'rateLimitOwnsSchedulable') == 'true'
  and redis.call('HGET', KEYS[1], 'schedulable') == 'false'
  and redis.call('HGET', KEYS[1], 'isActive') == 'true'
  and redis.call('HGET', KEYS[1], 'status') == 'active' then
  redis.call('HSET', KEYS[1], 'schedulable', 'true')
end
redis.call('HSET', KEYS[1], 'rateLimitStatus', 'normal')
redis.call('HDEL', KEYS[1], 'rateLimitedAt', 'rateLimitResetAt', 'rateLimitOwnsSchedulable')
return 1`
const CODES = new Set([
  'pending',
  'unknown',
  'reset',
  'nothing_to_reset',
  'no_credit',
  'readback_failed',
  'storage_unavailable',
  'precheck_failed'
])
const STATES = new Set(['uncertain', 'reset_verified', 'nothing_to_reset', 'no_credit'])
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
const receiptKey = (accountId, requestId) =>
  `openai:codex-reset:${hash(accountId)}:request:${hash(requestId)}`

class CodexResetCreditsError extends Error {
  constructor(code, statusCode = 502) {
    super(code)
    this.code = code
    this.statusCode = statusCode
  }
}

function fail(code, statusCode) {
  throw new CodexResetCreditsError(code, statusCode)
}

function identifier(value) {
  return typeof value === 'string' && IDENTIFIER.test(value)
}

function number(value, min, max, integer = false) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  ) {
    fail('invalid_upstream_response')
  }
  return value
}

function normalizeUsage(body) {
  if (!body || !body.rate_limit || typeof body.rate_limit !== 'object') {
    fail('invalid_upstream_response')
  }
  const rateLimit = {}
  for (const key of ['allowed', 'limit_reached']) {
    if (body.rate_limit[key] !== undefined) {
      if (typeof body.rate_limit[key] !== 'boolean') {
        fail('invalid_upstream_response')
      }
      rateLimit[key] = body.rate_limit[key]
    }
  }
  for (const key of WINDOW_NAMES) {
    const value = body.rate_limit[key]
    if (value === null || value === undefined) {
      rateLimit[key] = null
      continue
    }
    rateLimit[key] = {
      used_percent: number(value.used_percent, 0, 100),
      limit_window_seconds: number(value.limit_window_seconds, 1, 31536000, true),
      reset_at: number(value.reset_at, 0, 253402300799, true),
      reset_after_seconds: number(value.reset_after_seconds, 0, 31536000, true)
    }
  }
  if (!WINDOW_NAMES.some((key) => rateLimit[key])) {
    fail('invalid_upstream_response')
  }
  return { rate_limit: rateLimit }
}

function normalizeCredits(body) {
  if (!body || !Array.isArray(body.credits) || body.credits.length > 1000) {
    fail('invalid_upstream_response')
  }
  const availableCount = number(body.available_count, 0, 1000, true)
  const ids = new Set()
  const credits = body.credits.map((credit) => {
    if (
      !credit ||
      !identifier(credit.id) ||
      ids.has(credit.id) ||
      !['available', 'consumed', 'expired'].includes(credit.status)
    ) {
      fail('invalid_upstream_response')
    }
    ids.add(credit.id)
    let expiresAt = null
    if (credit.expires_at !== null && credit.expires_at !== undefined) {
      if (
        typeof credit.expires_at !== 'string' ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(credit.expires_at) ||
        !Number.isFinite(Date.parse(credit.expires_at))
      ) {
        fail('invalid_upstream_response')
      }
      expiresAt = new Date(credit.expires_at).toISOString()
    }
    return { id: credit.id, status: credit.status, expires_at: expiresAt }
  })
  if (credits.filter((credit) => credit.status === 'available').length !== availableCount) {
    fail('invalid_upstream_response')
  }
  return { available_count: availableCount, credits }
}

// Dependencies are lazy: synthetic fixtures never load config, Redis or OAuth modules.
function createCodexResetCreditsService(deps = {}) {
  const accountService = deps.accountService || require('./account/openaiAccountService')
  const proxyHelper = deps.proxyHelper || require('../utils/proxyHelper')
  const request = deps.request || require('axios').create().request
  const now = deps.now || (() => new Date())
  const delay = deps.delay || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const redis = () => deps.redis || require('../models/redis').getClientSafe()

  function tokenState(current, context) {
    const token = accountService.decrypt(current.accessToken)
    if (typeof token !== 'string' || !token || token.length > 32768 || /[\r\n]/.test(token)) {
      fail('invalid_account_credentials')
    }
    let subject = ''
    if (token.split('.').length === 3) {
      let claims
      try {
        claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
      } catch (_) {
        fail('invalid_account_credentials')
      }
      if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
        fail('invalid_account_credentials')
      }
      const auth = claims['https://api.openai.com/auth'] || {}
      if (auth.chatgpt_account_id && auth.chatgpt_account_id !== current.accountId) {
        fail('account_identity_changed', 409)
      }
      subject = auth.chatgpt_user_id || auth.user_id || claims.sub || ''
      if (typeof subject !== 'string') {
        fail('invalid_account_credentials')
      }
    }
    if (context && context.subject && context.subject !== subject) {
      fail('account_identity_changed', 409)
    }
    return { token, subject }
  }

  async function account(accountId, context) {
    const result = await accountService.getAccount(accountId)
    if (!result) {
      fail('account_not_found', 404)
    }
    if (result.id !== accountId || !identifier(result.accountId)) {
      fail('invalid_account_identity')
    }
    if (
      context &&
      (result.accountId !== context.identity ||
        JSON.stringify(result.proxy || null) !== context.proxy)
    ) {
      fail('account_identity_changed', 409)
    }
    return result
  }

  async function refresh(context) {
    context.refreshed = true
    try {
      await accountService.refreshAccountToken(context.accountId)
    } catch (_) {
      fail('oauth_refresh_failed')
    }
    return account(context.accountId, context)
  }

  async function contextFor(accountId, renew = true) {
    if (!identifier(accountId)) {
      fail('invalid_request', 400)
    }
    const initial = await account(accountId)
    const context = {
      accountId,
      identity: initial.accountId,
      proxy: JSON.stringify(initial.proxy || null),
      refreshed: false,
      initial,
      subject: initial.accessToken ? tokenState(initial).subject : ''
    }
    if (renew && (!initial.accessToken || accountService.isTokenExpired(initial))) {
      await refresh(context)
    }
    return context
  }

  async function upstream(context, method, path, data) {
    let current = await account(context.accountId, context)
    if (!current.accessToken || accountService.isTokenExpired(current)) {
      if (context.refreshed) {
        fail('oauth_refresh_failed')
      }
      current = await refresh(context)
      if (!current.accessToken || accountService.isTokenExpired(current)) {
        fail('oauth_refresh_failed')
      }
    }
    const agent = current.proxy
      ? proxyHelper.createProxyAgent(current.proxy)
      : new https.Agent({ rejectUnauthorized: true })
    if (!agent) {
      fail('invalid_account_proxy')
    }
    agent.options = { ...agent.options, rejectUnauthorized: true }
    const { token } = tokenState(current, context)
    let response
    try {
      response = await request({
        method,
        url: ROOT + path,
        data,
        headers: {
          Authorization: `Bearer ${token}`,
          'ChatGPT-Account-ID': context.identity,
          originator: 'codex_cli_rs',
          'user-agent': 'codex_cli_rs/0.144.5',
          accept: 'application/json',
          'Content-Type': 'application/json'
        },
        proxy: false,
        httpsAgent: agent,
        maxRedirects: 0,
        timeout: 10000,
        signal: AbortSignal.timeout(10000),
        maxContentLength: 1048576,
        maxBodyLength: 4096,
        validateStatus: () => true
      })
    } catch (error) {
      if (['ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED'].includes(error.code)) {
        fail('upstream_timeout', 504)
      }
      fail('upstream_unavailable')
    }
    if (response.status === 401 && method === 'GET' && !context.refreshed) {
      await refresh(context)
      return upstream(context, method, path, data)
    }
    if (response.status === 401) {
      fail('upstream_unauthorized')
    }
    if (response.status !== 200) {
      fail('upstream_unavailable')
    }
    if (
      response.data &&
      response.data.account_id !== undefined &&
      response.data.account_id !== context.identity
    ) {
      fail('account_identity_changed', 409)
    }
    return response.data
  }

  function stamp(accountId, payload) {
    return {
      account_id: accountId,
      checked_at: now().toISOString(),
      source: 'upstream',
      ...payload
    }
  }

  async function cacheUsage(accountId, value) {
    const snapshot = {}
    for (const key of WINDOW_NAMES) {
      const item = value.rate_limit[key]
      const prefix = key === 'primary_window' ? 'primary' : 'secondary'
      if (item) {
        snapshot[`${prefix}UsedPercent`] = item.used_percent
        snapshot[`${prefix}ResetAfterSeconds`] = item.reset_after_seconds
        snapshot[`${prefix}WindowMinutes`] = item.limit_window_seconds / 60
      } else {
        // Upstream can expose only one window. Zero duration removes the old
        // slot instead of presenting its stale values under a fresh timestamp.
        snapshot[`${prefix}UsedPercent`] = 0
        snapshot[`${prefix}ResetAfterSeconds`] = 0
        snapshot[`${prefix}WindowMinutes`] = 0
      }
    }
    try {
      await accountService.updateCodexUsageSnapshot(accountId, snapshot)
      return true
    } catch (_) {
      return false
    }
  }

  async function readUsage(context) {
    const result = stamp(
      context.accountId,
      normalizeUsage(await upstream(context, 'GET', '/usage'))
    )
    return { value: result, cacheUpdated: await cacheUsage(context.accountId, result) }
  }

  async function readCredits(context) {
    return stamp(
      context.accountId,
      normalizeCredits(await upstream(context, 'GET', '/rate-limit-reset-credits'))
    )
  }

  function quotaDecreased(before, after, beforeNaturalReset = false) {
    return WINDOW_NAMES.some((name) => {
      const original = before.rate_limit[name]
      return (
        original &&
        (!beforeNaturalReset || original.reset_at > now().getTime() / 1000) &&
        WINDOW_NAMES.some((next) => {
          const current = after.rate_limit[next]
          return (
            current &&
            current.limit_window_seconds === original.limit_window_seconds &&
            current.used_percent < original.used_percent
          )
        })
      )
    })
  }

  function receiptSnapshot(value, kind, accountId) {
    if (value === null) {
      return null
    }
    if (
      !value ||
      value.account_id !== accountId ||
      value.source !== 'upstream' ||
      typeof value.checked_at !== 'string' ||
      !Number.isFinite(Date.parse(value.checked_at))
    ) {
      fail('storage_unavailable')
    }
    return {
      account_id: accountId,
      checked_at: value.checked_at,
      source: 'upstream',
      ...(kind === 'usage' ? normalizeUsage(value) : normalizeCredits(value))
    }
  }

  function bundle(value, accountId) {
    if (value === null) {
      return null
    }
    if (!value || typeof value !== 'object') {
      fail('storage_unavailable')
    }
    return {
      usage: receiptSnapshot(value.usage, 'usage', accountId),
      credits: receiptSnapshot(value.credits, 'credits', accountId)
    }
  }

  async function stored(accountId, requestId) {
    try {
      const text = await redis().get(receiptKey(accountId, requestId))
      if (text === null) {
        return null
      }
      if (typeof text !== 'string' || text.length > 4194304) {
        throw new Error()
      }
      const record = JSON.parse(text)
      const r = record.receipt
      if (
        !r ||
        r.account_id !== accountId ||
        r.request_id !== requestId ||
        !STATES.has(r.status) ||
        !CODES.has(r.code) ||
        (record.owner !== undefined &&
          (!identifier(record.owner) || !/^[a-f0-9]{64}$/.test(record.upstream_hash || ''))) ||
        (record.owner === undefined && record.upstream_hash !== undefined) ||
        (record.credit_id !== null && !identifier(record.credit_id))
      ) {
        throw new Error()
      }
      return {
        serialized: text,
        owner: record.owner || null,
        upstream_hash: record.upstream_hash || null,
        credit_id: record.credit_id,
        receipt: {
          account_id: accountId,
          request_id: requestId,
          status: r.status,
          code: r.code,
          windows_reset: number(r.windows_reset, 0, 1000, true),
          before: bundle(r.before, accountId),
          after: bundle(r.after, accountId),
          cache_updated: r.cache_updated === true,
          scheduling_updated: r.scheduling_updated === true
        }
      }
    } catch (_) {
      fail('storage_unavailable')
    }
  }

  async function operation(accountId, requestId) {
    if (!identifier(accountId) || !identifier(requestId)) {
      fail('invalid_request', 400)
    }
    const value = await stored(accountId, requestId)
    if (!value) {
      fail('operation_not_found', 404)
    }
    return value.receipt
  }

  async function soleLegacyPending(key, serialized, lock, owner) {
    let cursor = '0'
    const seen = new Set()
    let receipts = 0
    let locks = 0
    for (let page = 0; page < 50; page++) {
      const result = await redis().scan(cursor, 'MATCH', 'openai:codex-reset:*', 'COUNT', 100)
      cursor = result[0]
      for (const candidate of result[1]) {
        if (seen.has(candidate)) {
          continue
        }
        seen.add(candidate)
        if (seen.size > 200) {
          fail('reconciliation_conflict', 409)
        }
        const value = await redis().get(candidate)
        if (candidate.endsWith(':lock')) {
          if (candidate !== lock || value !== owner) {
            fail('reconciliation_conflict', 409)
          }
          locks++
        } else if (candidate.includes(':request:')) {
          if (typeof value !== 'string' || value.length > 4194304) {
            fail('reconciliation_conflict', 409)
          }
          const row = JSON.parse(value)
          if (row.receipt && row.receipt.status === 'uncertain') {
            if (candidate !== key || value !== serialized) {
              fail('reconciliation_conflict', 409)
            }
            receipts++
          }
        }
      }
      if (cursor === '0') {
        if (receipts !== 1 || locks !== 1) {
          fail('reconciliation_conflict', 409)
        }
        return
      }
    }
    fail('reconciliation_conflict', 409)
  }

  async function reconcile(accountId, requestId, body) {
    if (!identifier(accountId) || !identifier(requestId)) {
      fail('invalid_request', 400)
    }
    if (!body || body.execute !== true || body.confirm_request_id !== requestId) {
      fail('execution_required', 400)
    }
    const record = await stored(accountId, requestId)
    if (!record) {
      fail('operation_not_found', 404)
    }
    const { receipt } = record
    if (receipt.status !== 'uncertain') {
      return receipt
    }
    if (
      !receipt.before ||
      !receipt.before.usage ||
      !receipt.before.credits ||
      !receipt.after ||
      !receipt.after.usage ||
      !receipt.after.credits ||
      receipt.windows_reset < 1
    ) {
      fail('reconciliation_unproven', 409)
    }
    const age = now().getTime() - Date.parse(receipt.before.usage.checked_at)
    if (age < 0 || age > 3600000) {
      fail('reconciliation_unproven', 409)
    }
    const context = await contextFor(accountId)
    const lock = `openai:codex-reset:upstream:${hash(context.identity)}:lock`
    const key = receiptKey(accountId, requestId)
    const owner = record.owner || (await redis().get(lock))
    if (
      !identifier(owner) ||
      (await redis().get(lock)) !== owner ||
      (record.owner && record.upstream_hash !== hash(context.identity))
    ) {
      fail('reconciliation_conflict', 409)
    }
    if (!record.owner) {
      await soleLegacyPending(key, record.serialized, lock, owner)
    }
    const freshUsage = await readUsage(context)
    const freshCredits = await readCredits(context)
    const beforeAvailable = receipt.before.credits.credits.filter(
      (row) => row.status === 'available'
    )
    const afterIds = new Set(
      freshCredits.credits.filter((row) => row.status === 'available').map((row) => row.id)
    )
    const missing = beforeAvailable.filter((row) => !afterIds.has(row.id))
    const validDebit =
      freshCredits.available_count === receipt.before.credits.available_count - 1 &&
      missing.length === 1 &&
      [...afterIds].every((id) => beforeAvailable.some((row) => row.id === id)) &&
      (missing[0].expires_at === null || Date.parse(missing[0].expires_at) > now().getTime())
    if (!validDebit || !quotaDecreased(receipt.before.usage, freshUsage.value, true)) {
      return receipt
    }
    tokenState(await account(accountId, context), context)
    receipt.after = { usage: freshUsage.value, credits: freshCredits }
    receipt.status = 'reset_verified'
    receipt.code = 'reset'
    receipt.cache_updated = freshUsage.cacheUpdated
    // Operator reconciliation never reverses an administrator/legacy scheduler pause.
    receipt.scheduling_updated = false
    const encoded = JSON.stringify({
      credit_id: record.credit_id,
      owner,
      upstream_hash: hash(context.identity),
      receipt
    })
    if ((await redis().eval(RECONCILE, 2, lock, key, owner, record.serialized, encoded)) !== 1) {
      fail('reconciliation_conflict', 409)
    }
    return receipt
  }

  async function consume(accountId, body) {
    if (!body || body.execute !== true) {
      fail('execution_required', 400)
    }
    if (
      !identifier(accountId) ||
      !identifier(body.request_id) ||
      (body.credit_id !== undefined && !identifier(body.credit_id))
    ) {
      fail('invalid_request', 400)
    }
    const requestId = body.request_id
    const creditId = body.credit_id === undefined ? null : body.credit_id
    const previous = await stored(accountId, requestId)
    if (previous) {
      if (previous.credit_id !== creditId) {
        fail('idempotency_conflict', 409)
      }
      return previous.receipt
    }

    // Resolve identity, but acquire the shared upstream-account barrier before
    // renewal or live reads. Duplicate CRS records cannot bypass this lock.
    const context = await contextFor(accountId, false)
    const lock = `openai:codex-reset:upstream:${hash(context.identity)}:lock`
    const key = receiptKey(accountId, requestId)
    const owner = crypto.randomUUID()
    const receipt = {
      account_id: accountId,
      request_id: requestId,
      status: 'uncertain',
      code: 'pending',
      windows_reset: 0,
      before: null,
      after: null,
      cache_updated: false,
      scheduling_updated: false
    }
    const encode = () =>
      JSON.stringify({ credit_id: creditId, owner, upstream_hash: hash(context.identity), receipt })
    let reserved
    try {
      reserved = await redis().eval(RESERVE, 2, lock, key, owner, encode())
    } catch (_) {
      fail('storage_unavailable')
    }
    if (reserved === 2) {
      const raced = await stored(accountId, requestId)
      if (!raced || raced.credit_id !== creditId) {
        fail('idempotency_conflict', 409)
      }
      return raced.receipt
    }
    if (reserved !== 1) {
      fail('account_locked', 409)
    }

    async function save(release) {
      try {
        if (
          (await redis().eval(
            SAVE,
            2,
            lock,
            key,
            owner,
            encode(),
            release ? 'release' : 'keep'
          )) !== 1
        ) {
          throw new Error()
        }
      } catch (_) {
        fail('storage_unavailable')
      }
    }

    // Persist the full pre-read proof before allowing the single write. On any
    // storage/precheck failure keep a visible barrier, never a silent retry.
    try {
      const beforeUsage = await readUsage(context)
      receipt.before = { usage: beforeUsage.value, credits: await readCredits(context) }
      if (
        creditId &&
        !receipt.before.credits.credits.some(
          (credit) => credit.id === creditId && credit.status === 'available'
        )
      ) {
        fail('invalid_request', 400)
      }
      if (receipt.before.credits.available_count === 0) {
        receipt.status = receipt.code = 'no_credit'
        await save(true)
        return receipt
      }
      await save(false)
    } catch (error) {
      receipt.status = 'uncertain'
      receipt.code =
        error.code === 'storage_unavailable' ? 'storage_unavailable' : 'precheck_failed'
      try {
        await save(false)
      } catch (_) {
        /* The initial reservation remains. */
      }
      throw error
    }

    let result
    try {
      result = await upstream(context, 'POST', '/rate-limit-reset-credits/consume', {
        redeem_request_id: requestId,
        ...(creditId ? { credit_id: creditId } : {})
      })
    } catch (_) {
      receipt.code = 'unknown'
      try {
        await save(false)
      } catch (_saveError) {
        receipt.code = 'storage_unavailable'
      }
      return receipt
    }

    try {
      const code =
        result && ['reset', 'nothing_to_reset', 'no_credit'].includes(result.code)
          ? result.code
          : 'unknown'
      const count =
        result &&
        Number.isSafeInteger(result.windows_reset) &&
        result.windows_reset >= 0 &&
        result.windows_reset <= 1000
          ? result.windows_reset
          : 0
      receipt.code = code
      receipt.windows_reset = count
      // Quota projections can lag the acknowledgement. Retry only GET proof.
      for (let attempt = 0; attempt < 6; attempt++) {
        const afterUsage = await readUsage(context)
        receipt.after = { usage: afterUsage.value, credits: await readCredits(context) }
        receipt.cache_updated = afterUsage.cacheUpdated
        const difference =
          receipt.before.credits.available_count - receipt.after.credits.available_count
        const verified =
          difference === 1 && quotaDecreased(receipt.before.usage, receipt.after.usage)
        if (
          code !== 'reset' ||
          count === 0 ||
          verified ||
          ![0, 1].includes(difference) ||
          attempt === 5
        ) {
          break
        }
        await delay(2000)
      }
      const beforeWindows = Object.values(receipt.before.usage.rate_limit).filter(
        (value) => value && typeof value === 'object'
      )
      const afterWindows = Object.values(receipt.after.usage.rate_limit).filter(
        (value) => value && typeof value === 'object'
      )
      const lowerWindow = beforeWindows.some((before) =>
        afterWindows.some(
          (after) =>
            after.limit_window_seconds === before.limit_window_seconds &&
            after.used_percent < before.used_percent
        )
      )
      if (
        code === 'reset' &&
        count > 0 &&
        lowerWindow &&
        receipt.after.credits.available_count === receipt.before.credits.available_count - 1
      ) {
        receipt.status = 'reset_verified'
      } else if (
        ['nothing_to_reset', 'no_credit'].includes(code) &&
        count === 0 &&
        receipt.after.credits.available_count === receipt.before.credits.available_count
      ) {
        receipt.status = code
      } else {
        // A provider claim without matching readback is not a known outcome.
        // Keep the persisted uncertain receipt readable by strict clients.
        receipt.code = 'unknown'
      }
      const limit = receipt.after.usage.rate_limit
      if (
        receipt.status === 'reset_verified' &&
        receipt.cache_updated &&
        limit.allowed !== false &&
        limit.limit_reached !== true &&
        afterWindows.every((window) => window.used_percent < 100)
      ) {
        try {
          receipt.scheduling_updated =
            (await redis().eval(
              SYNC_RATE_LIMIT,
              1,
              `openai:account:${accountId}`,
              context.identity,
              context.initial.rateLimitedAt || '',
              context.initial.rateLimitResetAt || ''
            )) === 1
        } catch (_) {
          receipt.scheduling_updated = false
        }
      }
    } catch (_) {
      receipt.status = 'uncertain'
      receipt.code = 'readback_failed'
      receipt.after = null
      receipt.cache_updated = receipt.scheduling_updated = false
    }
    try {
      await save(receipt.status !== 'uncertain')
    } catch (_) {
      receipt.status = 'uncertain'
      receipt.code = 'storage_unavailable'
    }
    return receipt
  }

  function safe(fn) {
    return async (...args) => {
      try {
        return await fn(...args)
      } catch (error) {
        if (error instanceof CodexResetCreditsError) {
          throw error
        }
        fail('internal_error', 500)
      }
    }
  }

  return {
    usage: safe(async (accountId) => (await readUsage(await contextFor(accountId))).value),
    resetCredits: safe(async (accountId) => readCredits(await contextFor(accountId))),
    consume: safe(consume),
    reconcile: safe(reconcile),
    operation: safe(operation)
  }
}

module.exports = { createCodexResetCreditsService, CodexResetCreditsError }
