const { execFile } = require('child_process')
const logger = require('../utils/logger')

const DEFAULT_TARGET = 'JSZX-AI-03'
const DEFAULT_REMOTE_BASE = 'http://127.0.0.1:8910'
const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_ACCOUNT_MIRROR_CACHE_TTL_MS = 30000
const DEFAULT_CANONICAL_STATE_PATH = '/home/cltx/.chatgpt-quota/state/state.json'
const DEFAULT_CLAUDE_GUARD_STATE_PATH = '/Data/ccmax-pool-guard/state.json'
const DEFAULT_CLAUDE_GUARD_ACTIVE_PATH = '/Data/ccmax-pool-guard/active-upstreams.json'
const DEFAULT_CLAUDE_GUARD_TARGET = 'cc-proxy'
const QUOTA_SCRIPT_PATH = 'scripts/chatgpt-acct-quota.sh --json'
const LIVE_QUOTA_SCRIPT_PATH = 'scripts/chatgpt-acct-quota-aliyun.sh --json'
const DEMO_ACCOUNT = 'zk-codex-demo'
const SUPPORTED_ACCOUNT_PROVIDERS = ['openai', 'claude']
const SUPPORTED_ACCOUNT_ACTIONS = ['pause', 'resume', 'refresh']
const LIVE_ACCOUNTS_PATH = '/api/accounts?force=true'
const LIVE_ACCOUNT_SOURCE_MESSAGE = ''

const toNumber = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const isTruthy = (value) => value === true || value === 'true' || value === 1 || value === '1'

const getEpochSeconds = (value) => {
  if (value === undefined || value === null || value === '') {
    return null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    return numeric
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed / 1000
}

const isPastEpoch = (value) => {
  const epoch = getEpochSeconds(value)
  return epoch !== null && epoch < Date.now() / 1000
}

const isFutureEpoch = (value) => {
  const epoch = getEpochSeconds(value)
  return epoch !== null && epoch >= Date.now() / 1000
}

const parseJsonFromStdout = (stdout, errorMessage) => {
  const text = String(stdout || '').trim()
  if (!text) {
    throw new Error(errorMessage)
  }

  try {
    return JSON.parse(text)
  } catch (_error) {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1))
    }
    throw new Error(errorMessage)
  }
}

const buildRemotePython = (paths) => `
import json
import urllib.request

base = ${JSON.stringify(process.env.SERVER_STATE_REMOTE_BASE || DEFAULT_REMOTE_BASE)}
paths = ${JSON.stringify(paths)}
out = {}

for name, path in paths.items():
    try:
        req = urllib.request.Request(base + path, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            out[name] = {
                "ok": True,
                "status": resp.status,
                "body": json.loads(resp.read().decode("utf-8"))
            }
    except Exception as exc:
        out[name] = {
            "ok": False,
            "error": str(exc)[:300]
        }

print(json.dumps(out, ensure_ascii=False))
`

const buildRemoteMutationPython = (operation) => `
import json
import urllib.request

base = ${JSON.stringify(process.env.SERVER_STATE_REMOTE_BASE || DEFAULT_REMOTE_BASE)}
operation = ${JSON.stringify(operation)}

try:
    data = json.dumps(operation.get("body") or {}).encode("utf-8")
    req = urllib.request.Request(
        base + operation["path"],
        data=data,
        method=operation.get("method", "POST"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    )
    with urllib.request.urlopen(req, timeout=8) as resp:
        raw = resp.read().decode("utf-8")
        body = json.loads(raw) if raw else {}
        out = {
            "ok": True,
            "status": resp.status,
            "body": body
        }
except Exception as exc:
    out = {
        "ok": False,
        "status": getattr(exc, "code", 500),
        "error": str(exc)[:300]
    }

print(json.dumps(out, ensure_ascii=False))
`

const buildCanonicalStatePython = () => `
import json
import time

path = ${JSON.stringify(process.env.SERVER_STATE_CANONICAL_PATH || DEFAULT_CANONICAL_STATE_PATH)}

with open(path, "r", encoding="utf-8") as f:
    state = json.load(f)

if not isinstance(state, dict):
    raise RuntimeError("canonical state must be a JSON object")

accounts = []
for acct, payload in state.items():
    if not str(acct).startswith("acct-") or not isinstance(payload, dict):
        continue
    row = dict(payload)
    row["acct"] = acct
    accounts.append(row)

accounts.sort(key=lambda row: int(str(row["acct"]).split("-", 1)[1]) if str(row["acct"]).split("-", 1)[1].isdigit() else 999999)

print(json.dumps({
    "ok": True,
    "source": {
        "path": path,
        "count": len(accounts),
        "readAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    },
    "accounts": accounts
}, ensure_ascii=False))
`

const buildClaudeGuardPython = () => `
import json
import time

state_path = ${JSON.stringify(process.env.SERVER_STATE_CLAUDE_GUARD_STATE_PATH || DEFAULT_CLAUDE_GUARD_STATE_PATH)}
active_path = ${JSON.stringify(process.env.SERVER_STATE_CLAUDE_GUARD_ACTIVE_PATH || DEFAULT_CLAUDE_GUARD_ACTIVE_PATH)}

with open(state_path, "r", encoding="utf-8") as f:
    state_doc = json.load(f)

try:
    with open(active_path, "r", encoding="utf-8") as f:
        active_doc = json.load(f)
except FileNotFoundError:
    active_doc = {"upstreams": []}

accounts = state_doc.get("accounts", state_doc)
if not isinstance(accounts, dict):
    raise RuntimeError("claude guard state must contain an accounts object")

active_upstreams = active_doc.get("upstreams", [])
if not isinstance(active_upstreams, list):
    active_upstreams = []

print(json.dumps({
    "ok": True,
    "source": {
        "kind": "ccmax_pool_guard",
        "path": state_path,
        "activePath": active_path,
        "count": len(accounts),
        "activeCount": len(active_upstreams),
        "readAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    },
    "accounts": accounts,
    "activeUpstreams": active_upstreams
}, ensure_ascii=False))
`

const runWslJmsPython = (pythonCode) =>
  new Promise((resolve, reject) => {
    const target = process.env.SERVER_STATE_JMS_TARGET || DEFAULT_TARGET
    const cwd = process.env.SERVER_STATE_JMS_CWD || '~/codes/carher-admin'
    const encodedPython = Buffer.from(pythonCode, 'utf8').toString('base64')
    const remoteCommand = `printf %s ${encodedPython} | base64 -d | docker exec -i acct-admin-backend python -`
    const script = `cd ${cwd} && scripts/jms ssh ${target} "${remoteCommand}"`
    const child = execFile(
      process.env.SERVER_STATE_WSL_BIN || 'wsl.exe',
      ['-e', 'bash', '-lc', script],
      {
        timeout: toNumber(process.env.SERVER_STATE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
        windowsHide: true,
        maxBuffer: 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr
          reject(error)
          return
        }
        resolve(stdout)
      }
    )

    child.stdin?.end()
  })

const runWslJmsHostPython = (pythonCode) =>
  new Promise((resolve, reject) => {
    const target = process.env.SERVER_STATE_JMS_TARGET || DEFAULT_TARGET
    const cwd = process.env.SERVER_STATE_JMS_CWD || '~/codes/carher-admin'
    const encodedPython = Buffer.from(pythonCode, 'utf8').toString('base64')
    const remoteCommand = `printf %s ${encodedPython} | base64 -d | python3 -`
    const script = `cd ${cwd} && scripts/jms ssh ${target} "${remoteCommand}"`
    const child = execFile(
      process.env.SERVER_STATE_WSL_BIN || 'wsl.exe',
      ['-e', 'bash', '-lc', script],
      {
        timeout: toNumber(process.env.SERVER_STATE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr
          reject(error)
          return
        }
        resolve(stdout)
      }
    )

    child.stdin?.end()
  })

const runWslJmsHostPythonOnTarget = (target, pythonCode) =>
  new Promise((resolve, reject) => {
    const cwd = process.env.SERVER_STATE_JMS_CWD || '~/codes/carher-admin'
    const encodedPython = Buffer.from(pythonCode, 'utf8').toString('base64')
    const remoteCommand = `printf %s ${encodedPython} | base64 -d | python3 -`
    const script = `cd ${cwd} && scripts/jms ssh ${target} "${remoteCommand}"`
    const child = execFile(
      process.env.SERVER_STATE_WSL_BIN || 'wsl.exe',
      ['-e', 'bash', '-lc', script],
      {
        timeout: toNumber(process.env.SERVER_STATE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr
          reject(error)
          return
        }
        resolve(stdout)
      }
    )

    child.stdin?.end()
  })

const runWslCarherAdminCommand = (command) =>
  new Promise((resolve, reject) => {
    const cwd = process.env.SERVER_STATE_JMS_CWD || '~/codes/carher-admin'
    const script = `cd ${cwd} && ${command}`
    execFile(
      process.env.SERVER_STATE_WSL_BIN || 'wsl.exe',
      ['-e', 'bash', '-lc', script],
      {
        timeout: toNumber(
          process.env.SERVER_STATE_QUOTA_TIMEOUT_MS,
          toNumber(process.env.SERVER_STATE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)
        ),
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr
          reject(error)
          return
        }
        resolve(stdout)
      }
    )
  })

let quotaCommandRunner = runWslCarherAdminCommand
let accountMirrorCache = null
let accountMirrorInFlight = null

const getAccountMirrorCacheTtlMs = () =>
  Math.max(
    0,
    Math.floor(
      toNumber(
        process.env.SERVER_STATE_ACCOUNT_MIRROR_CACHE_TTL_MS,
        DEFAULT_ACCOUNT_MIRROR_CACHE_TTL_MS
      )
    )
  )

const isAccountMirrorCacheFresh = () =>
  accountMirrorCache &&
  getAccountMirrorCacheTtlMs() > 0 &&
  Date.now() - accountMirrorCache.cachedAtMs < getAccountMirrorCacheTtlMs()

const cloneAccountMirror = (mirror) => JSON.parse(JSON.stringify(mirror))

const rememberAccountMirror = (mirror) => {
  accountMirrorCache = {
    cachedAtMs: Date.now(),
    mirror: cloneAccountMirror(mirror)
  }
  return mirror
}

const clearAccountMirrorCache = () => {
  accountMirrorCache = null
  accountMirrorInFlight = null
}

const quotaCommandCandidates = () => {
  const configured = process.env.SERVER_STATE_QUOTA_COMMAND
  return [configured, LIVE_QUOTA_SCRIPT_PATH, QUOTA_SCRIPT_PATH].filter(
    (command, index, commands) => command && commands.indexOf(command) === index
  )
}

let fetchRemote = async (paths) => {
  const stdout = await runWslJmsPython(buildRemotePython(paths))
  const jsonLine = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => line.startsWith('{'))

  if (!jsonLine) {
    throw new Error('Remote server state response was empty')
  }

  return JSON.parse(jsonLine)
}

let mutateRemote = async (operation) => {
  const stdout = await runWslJmsPython(buildRemoteMutationPython(operation))
  const jsonLine = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => line.startsWith('{'))

  if (!jsonLine) {
    throw new Error('Remote server mutation response was empty')
  }

  return JSON.parse(jsonLine)
}

let fetchCanonicalState = async () => {
  const stdout = await runWslJmsHostPython(buildCanonicalStatePython())
  return parseJsonFromStdout(stdout, 'Canonical server state response was empty')
}

let fetchClaudeGuardState = async () => {
  if (process.env.NODE_ENV === 'test') {
    throw new Error('claude guard state disabled for test')
  }
  const target = process.env.SERVER_STATE_CLAUDE_GUARD_TARGET || DEFAULT_CLAUDE_GUARD_TARGET
  const stdout = await runWslJmsHostPythonOnTarget(target, buildClaudeGuardPython())
  return parseJsonFromStdout(stdout, 'Claude guard state response was empty')
}

const normalizeStateMap = (state) => {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('quota state must be a JSON object')
  }

  const accounts = []
  for (const [acct, payload] of Object.entries(state)) {
    if (!String(acct).startsWith('acct-') || !payload || typeof payload !== 'object') {
      continue
    }
    accounts.push({
      ...payload,
      acct
    })
  }

  accounts.sort((left, right) => {
    const leftId = Number(String(left.acct).split('-', 2)[1])
    const rightId = Number(String(right.acct).split('-', 2)[1])
    return (
      (Number.isFinite(leftId) ? leftId : 999999) - (Number.isFinite(rightId) ? rightId : 999999)
    )
  })

  return accounts
}

const sortAccountRows = (accounts) =>
  accounts.sort((left, right) => {
    const leftId = Number(String(left.acct || left.id || '').split('-', 2)[1])
    const rightId = Number(String(right.acct || right.id || '').split('-', 2)[1])
    return (
      (Number.isFinite(leftId) ? leftId : 999999) - (Number.isFinite(rightId) ? rightId : 999999)
    )
  })

const normalizeQuotaScriptDocument = (document) => {
  if (Array.isArray(document)) {
    return sortAccountRows(
      document
        .map((row) => ({
          ...row,
          acct: row?.acct || row?.id || row?.account
        }))
        .filter((row) => row.acct)
    )
  }

  if (Array.isArray(document?.rows)) {
    return normalizeQuotaScriptDocument(document.rows)
  }

  if (Array.isArray(document?.accounts)) {
    return normalizeQuotaScriptDocument(document.accounts)
  }

  return normalizeStateMap(document)
}

let fetchQuotaScriptState = async () => {
  const errors = []

  for (const command of quotaCommandCandidates()) {
    try {
      const stdout = await quotaCommandRunner(command)
      const state = parseJsonFromStdout(stdout, 'carher-admin quota script response was empty')
      const accounts = normalizeQuotaScriptDocument(state)

      return {
        ok: true,
        source: {
          kind: 'carher_admin_quota_script',
          path: command,
          count: accounts.length,
          readAt: new Date().toISOString()
        },
        accounts
      }
    } catch (error) {
      errors.push(`${command}: ${error.message || error}`)
    }
  }

  throw new Error(`carher-admin quota script response was empty: ${errors.join('; ')}`)
}

const summarizeAccounts = (response) => {
  const rows = response?.body?.accounts || []
  const stats = rows.reduce(
    (summary, account) => {
      const status = String(account.status || '').toLowerCase()
      const paused = isTruthy(account.paused) || isTruthy(account.manual_offline)
      const abnormal =
        status.includes('error') ||
        status.includes('blocked') ||
        status.includes('fail') ||
        status.includes('unauthorized') ||
        Boolean(account.cause)

      if (paused) {
        summary.paused += 1
      } else if (abnormal) {
        summary.abnormal += 1
      } else {
        summary.normal += 1
      }

      return summary
    },
    { total: rows.length, normal: 0, paused: 0, abnormal: 0 }
  )

  return stats
}

const summarizeCredentials = (response) => {
  const rows = response?.body?.rows || []
  return rows.reduce(
    (summary, row) => {
      summary.total += 1
      if (isTruthy(row.email_pw_present)) {
        summary.withEmailPassword += 1
      }
      if (isTruthy(row.chatgpt_pw_present)) {
        summary.withChatGptPassword += 1
      }
      return summary
    },
    { total: 0, withEmailPassword: 0, withChatGptPassword: 0 }
  )
}

const summarizePools = (response) => {
  const pools = response?.body?.pools || {}
  const poolList = Array.isArray(pools) ? pools : Object.values(pools)

  return poolList.reduce(
    (summary, pool) => {
      summary.total += 1
      const status = String(pool?.status || pool?.health || '').toLowerCase()
      if (status.includes('error') || status.includes('degraded') || status.includes('fail')) {
        summary.degraded += 1
      } else {
        summary.healthy += 1
      }
      return summary
    },
    { total: 0, healthy: 0, degraded: 0 }
  )
}

const summarizeCanonicalMirrorAccounts = (accounts = []) =>
  accounts.reduce(
    (summary, account) => {
      summary.total += 1
      if (account.schedulable) {
        summary.normal += 1
      } else if (account.stopSource === 'quota') {
        summary.paused += 1
      } else {
        summary.abnormal += 1
      }
      return summary
    },
    { total: 0, normal: 0, paused: 0, abnormal: 0 }
  )

const summarizeHealth = (response) => {
  const body = response?.body || {}
  const source = body.source || {}
  return {
    status: body.status || (response?.ok ? 'unknown' : 'unreachable'),
    reason: source.last_error || response?.error || '',
    cachedAccountCount: toNumber(source.cached_acct_count, 0),
    lastFetchAt: source.last_fetch_at || null
  }
}

const summarizeDemoCredential = (response) => {
  const rows = response?.body?.rows || []
  const row = rows.find((item) => item.acct === DEMO_ACCOUNT)
  return {
    account: DEMO_ACCOUNT,
    present: Boolean(row),
    updatedAt: row?._updated_at || null
  }
}

const normalizeProvider = (account = {}) => {
  const rawProvider = String(
    account.provider || account.platform || account.type || account.kind || ''
  ).toLowerCase()
  if (rawProvider.includes('openai') || rawProvider.includes('chatgpt')) {
    return 'openai'
  }
  if (rawProvider.includes('claude') || rawProvider.includes('anthropic')) {
    return 'claude'
  }

  const id = String(account.acct || account.id || account.account || '').toLowerCase()
  if (id.includes('openai') || id.includes('chatgpt')) {
    return 'openai'
  }
  if (id.includes('claude') || id.includes('anthropic')) {
    return 'claude'
  }
  if (id.startsWith('acct-')) {
    return 'openai'
  }
  return 'unknown'
}

const maskSecret = (value) => {
  if (!value) {
    return ''
  }
  const text = String(value)
  if (text.length <= 8) {
    return `${text.slice(0, 2)}...${text.slice(-2)}`
  }
  if (text.startsWith('sk-')) {
    return `${text.slice(0, 3)}...${text.slice(-4)}`
  }
  return `${text.slice(0, 2)}...${text.slice(-4)}`
}

const pickSecret = (account = {}, credential = {}) =>
  account.api_key ||
  account.apiKey ||
  account.key ||
  account.access_token ||
  account.accessToken ||
  credential.api_key ||
  credential.apiKey ||
  credential.key ||
  credential.access_token ||
  credential.accessToken ||
  ''

const normalizeRemoteUsage = (usage = {}) => {
  const normalized = {
    fiveHourPercent: toNumber(
      usage.fiveHourPercent ??
        usage.five_hour_percent ??
        usage.five_hour ??
        usage.fiveHour ??
        usage.primary_pct ??
        usage.p5h,
      0
    ),
    sevenDayPercent: toNumber(
      usage.sevenDayPercent ??
        usage.seven_day_percent ??
        usage.seven_day ??
        usage.sevenDay ??
        usage.weekly_pct ??
        usage.p7d,
      0
    ),
    cost: toNumber(usage.cost ?? usage.daily_cost ?? usage.dailyCost ?? usage.spend_5h?.spend, 0),
    tokens: toNumber(usage.tokens ?? usage.daily_tokens ?? usage.dailyTokens, 0),
    requests: toNumber(
      usage.requests ?? usage.daily_requests ?? usage.dailyRequests ?? usage.spend_5h?.calls,
      0
    )
  }

  if (usage.codexFiveHourPercent !== undefined || usage.codex_5h !== undefined) {
    normalized.codexFiveHourPercent = toNumber(usage.codexFiveHourPercent ?? usage.codex_5h, 0)
  }
  if (usage.codexSevenDayPercent !== undefined || usage.codex_7d !== undefined) {
    normalized.codexSevenDayPercent = toNumber(usage.codexSevenDayPercent ?? usage.codex_7d, 0)
  }

  return normalized
}

const normalizeRemoteRecovery = (recovery = {}) => ({
  fiveHourResetAt:
    recovery.fiveHourResetAt ||
    recovery.five_hour_reset_at ||
    recovery.five_hour_reset ||
    recovery.primary_reset_at ||
    recovery.p_reset ||
    null,
  sevenDayResetAt:
    recovery.sevenDayResetAt ||
    recovery.seven_day_reset_at ||
    recovery.seven_day_reset ||
    recovery.weekly_reset_at ||
    recovery.w_reset ||
    null
})

const isRawStateZombie = (account = {}) => {
  if (isTruthy(account.manual_offline) || isTruthy(account.paused)) {
    return false
  }
  return ![
    'primary_pct',
    'weekly_pct',
    'tier',
    'primary_reset_at',
    'weekly_reset_at',
    'subscription_active_until',
    'plan',
    'p5h',
    'p7d'
  ].some((key) => account[key] !== undefined && account[key] !== null)
}

const decorateQuotaViewSignals = (account = {}) => {
  const next = { ...account }
  const tier = String(next.tier || '').toUpperCase()
  const cause = String(next.cause || '')
  const stateFrozen = tier === 'SCALED_DOWN' || cause === 'deploy.spec.replicas=0'
  const lowerCause = cause.toLowerCase()
  const suppressResetSignals =
    tier === 'TOKEN_INVALID' ||
    lowerCause.includes('token') ||
    lowerCause.includes('401') ||
    lowerCause.includes('sub_expired') ||
    lowerCause.includes('abandoned')

  if (!next.status && isRawStateZombie(next)) {
    next.status = 'ZOMBIE'
    next.zombie = true
  }

  if (!suppressResetSignals && !next.primary_reset_status && isPastEpoch(next.primary_reset_at)) {
    next.primary_reset_status = stateFrozen ? 'past⊘' : isTruthy(next.paused) ? 'past·' : 'past!'
  }
  if (!suppressResetSignals && !next.weekly_reset_status && isPastEpoch(next.weekly_reset_at)) {
    next.weekly_reset_status = stateFrozen ? 'past⊘' : isTruthy(next.paused) ? 'past·' : 'past!'
  }
  if (!suppressResetSignals && !next.restore_status && isPastEpoch(next.restore_at)) {
    next.restore_status = stateFrozen ? 'past⊘' : isTruthy(next.paused) ? 'past·' : 'past!'
  }

  if (tier === 'SCALED_DOWN') {
    const notes = normalizeStringList(next.quota_notes || next.quotaNotes || next.stale_notes)
    if (isPastEpoch(next.primary_reset_at) && !notes.includes('5h_reset elapsed')) {
      notes.push('5h_reset elapsed')
    }
    if (isPastEpoch(next.weekly_reset_at) && !notes.includes('7d_reset elapsed')) {
      notes.push('7d_reset elapsed')
    }
    if (notes.length) {
      next.quota_notes = notes
    }
  }

  return next
}

const normalizeCanonicalStatus = (account = {}) => {
  const rawStatus = String(account.status || '').trim()
  if (rawStatus) {
    return rawStatus.toUpperCase()
  }
  const probeError = String(account.probe_err || account.probeError || '').toLowerCase()
  if (probeError.includes('token_invalidated') || probeError.includes('token invalid')) {
    return 'TOKEN_INVALID'
  }
  if (
    account.sub_until !== undefined &&
    account.sub_until !== null &&
    account.sub_until !== '' &&
    isPastEpoch(account.sub_until)
  ) {
    return 'OFFLINE'
  }
  if (
    account.expires_at !== undefined &&
    account.expires_at !== null &&
    account.expires_at !== '' &&
    isPastEpoch(account.expires_at)
  ) {
    return 'OFFLINE'
  }
  if (account.ready === false || account.phase === 'Failed') {
    return 'OFFLINE'
  }
  if (isRawStateZombie(account)) {
    return 'ZOMBIE'
  }
  if (isTruthy(account.manual_offline)) {
    return 'OFFLINE'
  }
  if (isTruthy(account.paused)) {
    return 'PAUSED'
  }
  const tier = String(account.tier || '').toUpperCase()
  if (tier === 'TOKEN_INVALID' || tier === 'ZOMBIE') {
    return 'OFFLINE'
  }
  if (toNumber(account.p5h ?? account.primary_pct, 0) >= 100) {
    return 'QUOTA'
  }
  if (toNumber(account.p7d ?? account.weekly_pct, 0) >= 100) {
    return 'QUOTA'
  }
  return 'ONLINE'
}

const normalizeStringList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

const normalizeHealthSignals = (account = {}) => {
  const tier = String(account.tier || account.health_tier || '').toUpperCase()
  const status = String(account.status || '').toUpperCase()
  const reason = String(
    account.last_error ||
      account.lastError ||
      account.probe_err ||
      account.probeError ||
      account.cause ||
      ''
  ).toLowerCase()
  const primaryResetStatus =
    account.primary_reset_status ||
    account.primaryResetStatus ||
    account.five_hour_reset_status ||
    ''
  const weeklyResetStatus =
    account.weekly_reset_status || account.weeklyResetStatus || account.seven_day_reset_status || ''
  const restoreStatus = account.restore_status || account.restoreStatus || ''
  const quotaNotes = normalizeStringList(
    account.quota_notes || account.quotaNotes || account.stale_notes
  )
  const resetStatuses = [primaryResetStatus, weeklyResetStatus, restoreStatus].map((item) =>
    String(item || '')
  )

  return {
    tier,
    primaryResetStatus,
    weeklyResetStatus,
    restoreStatus,
    quotaNotes,
    probeStale:
      isTruthy(account.probe_stale) ||
      isTruthy(account.probeStale) ||
      resetStatuses.includes('past!'),
    tokenInvalid:
      tier === 'TOKEN_INVALID' ||
      status.includes('TOKEN_INVALID') ||
      reason.includes('token_dead') ||
      reason.includes('token_invalidated') ||
      reason.includes('token invalid') ||
      reason.includes('401'),
    subscriptionExpired:
      reason.includes('sub_expired') ||
      reason.includes('subscription') ||
      reason.includes('expired') ||
      account.sub_left === 'expired' ||
      account.subscription_status === 'expired' ||
      isPastEpoch(account.sub_until) ||
      (account.expires_at !== undefined &&
        account.expires_at !== null &&
        account.expires_at !== '' &&
        !isFutureEpoch(account.expires_at)),
    zombie: status === 'ZOMBIE' || tier === 'ZOMBIE' || isTruthy(account.zombie)
  }
}

const appendHealthSignalDiagnosis = (diagnosis, healthSignals = {}) => {
  const notes = []
  const resetStatuses = [
    healthSignals.primaryResetStatus,
    healthSignals.weeklyResetStatus,
    healthSignals.restoreStatus
  ].map((item) => String(item || ''))

  if (resetStatuses.some((item) => item.includes('past'))) {
    notes.push('存在过期 reset 快照')
  }
  if (healthSignals.probeStale) {
    notes.push('ONLINE 但探测数据可能滞后')
  }
  if (healthSignals.tokenInvalid) {
    notes.push('TOKEN_INVALID 表示 token 已失效')
  }
  if (healthSignals.subscriptionExpired) {
    notes.push('订阅已过期')
  }
  if (healthSignals.zombie) {
    notes.push('ZOMBIE 表示 state 残留无 probe 数据')
  }
  if (healthSignals.quotaNotes?.length) {
    notes.push(healthSignals.quotaNotes.join('、'))
  }

  return notes.length ? `${diagnosis}；${notes.join('；')}` : diagnosis
}

const isScaledDownFrozenPastReset = (healthSignals = {}) => {
  if (healthSignals.tier !== 'SCALED_DOWN') {
    return false
  }

  return (
    healthSignals.primaryResetStatus === 'past⊘' ||
    healthSignals.weeklyResetStatus === 'past⊘' ||
    healthSignals.restoreStatus === 'past⊘' ||
    healthSignals.quotaNotes?.some((note) => String(note).includes('reset elapsed'))
  )
}

const buildStopDiagnosis = ({ account = {}, usage = {}, stopInfo = {}, healthSignals = {} }) => {
  if (!stopInfo.stopSource) {
    return appendHealthSignalDiagnosis('远端账号当前可调度', healthSignals)
  }

  const status = account.status || 'unknown'
  const fiveHour = toNumber(usage.fiveHourPercent, 0)
  const sevenDay = toNumber(usage.sevenDayPercent, 0)
  const prefix = `远端原始状态为 ${status}；5h=${fiveHour}%、7d=${sevenDay}%`

  if (stopInfo.stopCategory === 'quota_exhausted') {
    if (stopInfo.stopTrigger === 'five_hour_limit') {
      return appendHealthSignalDiagnosis(
        `${prefix}，命中 5h 到量，归因为额度停用`,
        healthSignals
      )
    }
    if (stopInfo.stopTrigger === 'seven_day_limit') {
      return appendHealthSignalDiagnosis(
        `${prefix}，命中 7d 到量，归因为额度停用`,
        healthSignals
      )
    }
    return appendHealthSignalDiagnosis(
      `${prefix}，远端原因包含额度到量信息，归因为额度停用`,
      healthSignals
    )
  }

  if (stopInfo.stopCategory === 'quota_paused') {
    return appendHealthSignalDiagnosis(
      `${prefix}，quota-rebalance 已暂停调度；当前百分比可能是暂停快照，不代表远端部署故障`,
      healthSignals
    )
  }

  if (stopInfo.stopCategory === 'remote_deploy_stopped') {
    return appendHealthSignalDiagnosis(
      `${prefix}，原因是远端部署副本为 0，归因为部署停用`,
      healthSignals
    )
  }

  if (stopInfo.stopCategory === 'state_frozen') {
    return appendHealthSignalDiagnosis(
      `${prefix}，state 已冻结且 reset 已过期，需要远端探测或恢复链路刷新`,
      healthSignals
    )
  }

  if (stopInfo.stopCategory === 'subscription_issue') {
    return appendHealthSignalDiagnosis(
      `${prefix}，原因是订阅过期、账号废弃或账号异常，需要人工处理`,
      healthSignals
    )
  }

  if (stopInfo.stopCategory === 'pod_not_ready') {
    return appendHealthSignalDiagnosis(
      `${prefix}，Pod 未就绪，这是远端运行状态问题，不是 5h/7d 额度到量`,
      healthSignals
    )
  }

  if (stopInfo.stopSource === 'upstream') {
    return appendHealthSignalDiagnosis(
      `${prefix}，原因来自认证、订阅或上游错误，需要先处理远端异常`,
      healthSignals
    )
  }

  if (stopInfo.stopSource === 'remote') {
    return appendHealthSignalDiagnosis(
      `${prefix}，未达到账号池策略阈值，所以不是本地策略自动停用`,
      healthSignals
    )
  }

  return appendHealthSignalDiagnosis(
    `${prefix}，停用来源为 ${stopInfo.stopSource}`,
    healthSignals
  )
}

const isRemoteSchedulable = (account = {}, usage = normalizeRemoteUsage(account)) => {
  const status = String(account.status || '').toLowerCase()
  const healthSignals = normalizeHealthSignals(account)
  if (account.ready === false) {
    return false
  }
  if (healthSignals.zombie || healthSignals.tokenInvalid || healthSignals.subscriptionExpired) {
    return false
  }
  if (usage.fiveHourPercent >= 100 || usage.sevenDayPercent >= 100) {
    return false
  }
  if (isTruthy(account.paused) || isTruthy(account.manual_offline)) {
    return false
  }
  if (status.includes('paused') || status.includes('stopped') || status.includes('offline')) {
    return false
  }
  if (status.includes('blocked') || status.includes('error') || status.includes('fail')) {
    return false
  }
  if (status.includes('unauthorized') || status.includes('quota')) {
    return false
  }
  return true
}

const classifyRemoteStop = (account = {}, usage = normalizeRemoteUsage(account)) => {
  const status = String(account.status || '').toLowerCase()
  const reason = account.last_error || account.lastError || account.cause || ''
  const reasonText = String(reason).toLowerCase()
  const stopReason = reason || account.status || ''
  const healthSignals = normalizeHealthSignals(account)
  const { tier } = healthSignals
  const hasDeployScaleZero =
    reasonText.includes('deploy.spec.replicas=0') || reasonText.includes('replicas=0')
  const normalizedReasonText = reasonText.replace(/_/g, '-')
  const reasonShowsFiveHourLimit = /(?:^|[^\w])5h\s*=\s*\d+(?:\.\d+)?%\s*>=/.test(reasonText)
  const reasonShowsSevenDayLimit = /(?:^|[^\w])(?:wk|week|7d)\s*=\s*\d+(?:\.\d+)?%\s*>=/.test(
    reasonText
  )
  const statusShowsQuota = status.includes('quota')
  const hasExplicitUsageProbe =
    account.p5h !== undefined ||
    account.p7d !== undefined ||
    account.primary_pct !== undefined ||
    account.weekly_pct !== undefined ||
    account.fiveHourPercent !== undefined ||
    account.sevenDayPercent !== undefined
  const genericQuotaError =
    !hasDeployScaleZero &&
    (reasonText.includes('quota exceeded') ||
      reasonText.includes('usage_limit') ||
      reasonText.includes('rate_limit') ||
      statusShowsQuota)
  const hasFiveHourLimit =
    tier === 'OFFLINE-5H' ||
    normalizedReasonText.includes('offline-5h') ||
    reasonShowsFiveHourLimit ||
    (!hasDeployScaleZero &&
      ((genericQuotaError && usage.fiveHourPercent >= 100) ||
        (hasExplicitUsageProbe && usage.fiveHourPercent >= 100)))
  const hasSevenDayLimit =
    tier === 'OFFLINE-WEEK' ||
    normalizedReasonText.includes('offline-week') ||
    reasonShowsSevenDayLimit ||
    (!hasDeployScaleZero &&
      ((genericQuotaError && usage.sevenDayPercent >= 100) ||
        (hasExplicitUsageProbe && usage.sevenDayPercent >= 100)))

  if (healthSignals.zombie) {
    return {
      stopSource: 'remote',
      stopReason: 'zombie state placeholder',
      stopCategory: 'remote_offline',
      stopTrigger: 'zombie_state'
    }
  }
  if (healthSignals.tokenInvalid || healthSignals.subscriptionExpired) {
    return {
      stopSource: 'remote',
      stopReason: stopReason || 'account health issue',
      stopCategory: 'subscription_issue',
      stopTrigger: healthSignals.tokenInvalid ? 'token_invalid' : 'subscription_expired'
    }
  }
  if (
    reasonText.includes('abandoned') ||
    reasonText.includes('sub_expired') ||
    reasonText.includes('expired')
  ) {
    return {
      stopSource: 'remote',
      stopReason: stopReason || 'subscription stopped',
      stopCategory: 'subscription_issue',
      stopTrigger: 'subscription_expired'
    }
  }
  if (hasFiveHourLimit) {
    return {
      stopSource: 'quota',
      stopReason: stopReason || '5h limit reached',
      stopCategory: 'quota_exhausted',
      stopTrigger: 'five_hour_limit'
    }
  }
  if (hasSevenDayLimit) {
    return {
      stopSource: 'quota',
      stopReason: stopReason || '7d limit reached',
      stopCategory: 'quota_exhausted',
      stopTrigger: 'seven_day_limit'
    }
  }
  if (hasDeployScaleZero) {
    if (isScaledDownFrozenPastReset(healthSignals)) {
      return {
        stopSource: 'state',
        stopReason: stopReason || 'scaled down state frozen after reset elapsed',
        stopCategory: 'state_frozen',
        stopTrigger: 'scaled_down_reset_elapsed'
      }
    }

    return {
      stopSource: 'remote',
      stopReason: stopReason || 'remote deployment stopped',
      stopCategory: 'remote_deploy_stopped',
      stopTrigger: 'deploy_replicas_zero'
    }
  }
  if (statusShowsQuota) {
    const trigger =
      usage.sevenDayPercent > usage.fiveHourPercent ? 'seven_day_limit' : 'five_hour_limit'
    return {
      stopSource: 'quota',
      stopReason: stopReason || 'quota limit reached',
      stopCategory: 'quota_exhausted',
      stopTrigger: trigger
    }
  }
  if (account.ready === false) {
    return {
      stopSource: 'remote',
      stopReason: stopReason || account.probe_err || 'pod not ready',
      stopCategory: 'pod_not_ready',
      stopTrigger: 'pod_not_ready'
    }
  }
  if (isTruthy(account.paused) && !isTruthy(account.manual_offline)) {
    return {
      stopSource: 'quota',
      stopReason: stopReason || 'quota-rebalance paused',
      stopCategory: 'quota_paused',
      stopTrigger: 'quota_rebalance_paused'
    }
  }
  if (
    status.includes('blocked') ||
    status.includes('unauthorized') ||
    reasonText.includes('quota')
  ) {
    return {
      stopSource: 'upstream',
      stopReason,
      stopCategory: reasonText.includes('quota') ? 'quota_error' : 'upstream_error',
      stopTrigger: reasonText.includes('quota') ? 'quota_error' : 'upstream_error'
    }
  }
  if (isTruthy(account.manual_offline)) {
    return {
      stopSource: 'remote',
      stopReason: stopReason || 'remote paused',
      stopCategory: 'remote_offline',
      stopTrigger: 'remote_offline'
    }
  }
  if (status.includes('paused') || status.includes('stopped') || status.includes('offline')) {
    return {
      stopSource: 'remote',
      stopReason: stopReason || 'remote stopped',
      stopCategory: 'remote_offline',
      stopTrigger: 'remote_offline'
    }
  }
  if (status.includes('error') || status.includes('fail')) {
    return {
      stopSource: 'upstream',
      stopReason,
      stopCategory: 'upstream_error',
      stopTrigger: 'upstream_error'
    }
  }
  return { stopSource: '', stopReason: reason || '', stopCategory: '', stopTrigger: '' }
}

const summarizeMirrorTotals = (accounts) =>
  accounts.reduce(
    (totals, account) => {
      if (!totals[account.provider]) {
        return totals
      }
      totals[account.provider].total += 1
      if (account.schedulable) {
        totals[account.provider].schedulable += 1
      } else {
        totals[account.provider].stopped += 1
      }
      return totals
    },
    {
      openai: { total: 0, schedulable: 0, stopped: 0 },
      claude: { total: 0, schedulable: 0, stopped: 0 }
    }
  )

const getSourceReadAt = (source = {}) => source.readAt || source.updatedAt || null

const latestReadAt = (...sources) =>
  sources.map(getSourceReadAt).filter(Boolean).sort().at(-1) || null

const toPercent = (value) => {
  const number = toNumber(value, 0)
  if (number > 0 && number <= 1) {
    return Math.round(number * 100)
  }
  return Math.round(number)
}

const isClaudeGuardSchedulable = (account = {}, activeIds = new Set()) => {
  const id = account.acct || account.id || account.account
  const state = String(account.state || account.tier || '').toUpperCase()
  if (account.enabled === false || account.manual_mode === 'manual_offline') {
    return false
  }
  if (['DISABLED', 'HARD_DOWN', 'DRAINED', 'OFFLINE-5H', 'OFFLINE-7D'].includes(state)) {
    return false
  }
  if (isTruthy(account.paused) || isTruthy(account.manual_offline)) {
    return false
  }
  return activeIds.size === 0 || activeIds.has(id)
}

const normalizeClaudeGuardStop = (account = {}, usage = {}) => {
  const state = String(account.state || account.tier || '').toUpperCase()
  const reason = account.drained_reason || account.cause || account.last_error || state
  const reasonText = String(reason || '').toLowerCase()

  if (state === 'DRAINED') {
    const trigger =
      reasonText.includes('d7') ||
      reasonText.includes('7d') ||
      usage.sevenDayPercent >= usage.fiveHourPercent
        ? 'seven_day_limit'
        : 'five_hour_limit'
    return {
      stopSource: 'quota',
      stopReason: reason || 'Claude quota drained',
      stopCategory: 'quota_exhausted',
      stopTrigger: trigger
    }
  }

  if (state === 'OFFLINE-5H') {
    return {
      stopSource: 'quota',
      stopReason: reason || '5h limit reached',
      stopCategory: 'quota_exhausted',
      stopTrigger: 'five_hour_limit'
    }
  }

  if (state === 'OFFLINE-7D') {
    return {
      stopSource: 'quota',
      stopReason: reason || '7d limit reached',
      stopCategory: 'quota_exhausted',
      stopTrigger: 'seven_day_limit'
    }
  }

  if (state === 'HARD_DOWN' || [401, 403].includes(toNumber(account.status, 0))) {
    return {
      stopSource: 'remote',
      stopReason: reason || 'Claude account authentication failed',
      stopCategory: 'subscription_issue',
      stopTrigger: 'token_invalid'
    }
  }

  if (
    state === 'DISABLED' ||
    account.enabled === false ||
    account.manual_mode === 'manual_offline'
  ) {
    return {
      stopSource: 'remote',
      stopReason: reason || 'manual_offline via acct web',
      stopCategory: 'remote_offline',
      stopTrigger: 'remote_offline'
    }
  }

  return {
    stopSource: 'upstream',
    stopReason: reason || state || 'Claude upstream unavailable',
    stopCategory: 'upstream_error',
    stopTrigger: 'upstream_error'
  }
}

const buildClaudeGuardMirror = (guardState = {}) => {
  const activeById = new Map(
    (guardState.activeUpstreams || [])
      .filter((upstream) => upstream?.acct)
      .map((upstream) => [upstream.acct, upstream])
  )
  const activeIds = new Set(activeById.keys())
  const accountEntries = Array.isArray(guardState.accounts)
    ? guardState.accounts.map((account) => [account.acct || account.id || account.account, account])
    : Object.entries(guardState.accounts || {})

  const accounts = accountEntries
    .map(([key, account]) => {
      const id = account?.acct || account?.id || account?.account || key
      if (!id) {
        return null
      }

      const active = activeById.get(id) || {}
      const status = String(account.state || account.tier || 'UNKNOWN').toUpperCase()
      const usage = {
        fiveHourPercent: toPercent(account.h5 ?? account.h5_pct ?? account.fiveHourPercent),
        sevenDayPercent: toPercent(account.d7 ?? account.d7_pct ?? account.sevenDayPercent),
        cost: toNumber(account.cost, 0),
        tokens: toNumber(account.tokens, 0),
        requests: toNumber(account.requests, 0)
      }
      const schedulable = isClaudeGuardSchedulable({ ...account, acct: id }, activeIds)
      const stopInfo = schedulable
        ? { stopSource: '', stopReason: '', stopCategory: '', stopTrigger: '' }
        : normalizeClaudeGuardStop(account, usage)
      const healthSignals = {
        tier: status,
        primaryResetStatus: '',
        weeklyResetStatus: '',
        restoreStatus: '',
        quotaNotes: [],
        probeStale: false,
        tokenInvalid: stopInfo.stopTrigger === 'token_invalid',
        subscriptionExpired: false,
        zombie: false
      }
      const stopDiagnosis = buildStopDiagnosis({
        account: { ...account, status },
        usage,
        stopInfo,
        healthSignals
      })

      return {
        id,
        provider: 'claude',
        label: active.label || account.label || id,
        email: '',
        status,
        schedulable,
        maskedSecret: '',
        usage,
        recovery: {
          fiveHourResetAt:
            account.h5_reset_at ||
            account.h5ResetAt ||
            account.fiveHourResetAt ||
            account.restore_at ||
            null,
          sevenDayResetAt:
            account.d7_reset_at ||
            account.d7ResetAt ||
            account.sevenDayResetAt ||
            account.restore_at ||
            null
        },
        healthSignals,
        stopSource: stopInfo.stopSource,
        stopReason: stopInfo.stopReason,
        stopCategory: stopInfo.stopCategory,
        stopTrigger: stopInfo.stopTrigger,
        stopDiagnosis,
        lastError:
          account.last_error || account.error || account.drained_reason || account.cause || '',
        observedAt: account.updated_at || account.ts || null
      }
    })
    .filter(Boolean)

  const source = guardState.source || {}
  return {
    target: process.env.SERVER_STATE_CLAUDE_GUARD_TARGET || DEFAULT_CLAUDE_GUARD_TARGET,
    source: {
      kind: source.kind || 'ccmax_pool_guard',
      path: source.path || DEFAULT_CLAUDE_GUARD_STATE_PATH,
      activePath: source.activePath || DEFAULT_CLAUDE_GUARD_ACTIVE_PATH,
      accurate: true,
      degraded: false,
      count: toNumber(source.count, accounts.length),
      activeCount: toNumber(source.activeCount, activeIds.size),
      readAt: source.readAt || null,
      message: ''
    },
    accounts,
    totals: summarizeMirrorTotals(accounts)
  }
}

const combineAccountMirrors = (...mirrors) => {
  const availableMirrors = mirrors.filter(Boolean)
  const accounts = availableMirrors.flatMap((mirror) => mirror.accounts || [])

  if (availableMirrors.length <= 1) {
    return availableMirrors[0]
  }

  return {
    target: process.env.SERVER_STATE_JMS_TARGET || DEFAULT_TARGET,
    source: {
      kind: 'combined_account_state',
      accurate: availableMirrors.every((mirror) => mirror.source?.accurate !== false),
      degraded: availableMirrors.some((mirror) => mirror.source?.degraded === true),
      count: accounts.length,
      readAt: latestReadAt(...availableMirrors.map((mirror) => mirror.source)),
      message: availableMirrors
        .map((mirror) => mirror.source?.message)
        .filter(Boolean)
        .join('；'),
      sources: availableMirrors.map((mirror) => mirror.source)
    },
    accounts,
    totals: summarizeMirrorTotals(accounts)
  }
}

const buildAccountMirror = (responses) => {
  const credentialsByAccount = (responses.credentials?.body?.rows || []).reduce((map, row) => {
    const id = row.acct || row.id || row.account
    if (id) {
      map.set(id, row)
    }
    return map
  }, new Map())

  const accounts = (responses.accounts?.body?.accounts || [])
    .map((rawAccount) => {
      const account = decorateQuotaViewSignals(rawAccount)
      const id = account.acct || account.id || account.account
      if (!id) {
        return null
      }

      const provider = normalizeProvider(account)
      if (!['openai', 'claude'].includes(provider)) {
        return null
      }

      const credential = credentialsByAccount.get(id) || {}
      const usage = normalizeRemoteUsage({ ...account, ...(account.usage || {}) })
      const schedulable = isRemoteSchedulable(account, usage)
      const healthSignals = normalizeHealthSignals(account)
      const stopInfo = schedulable
        ? { stopSource: '', stopReason: '', stopCategory: '', stopTrigger: '' }
        : classifyRemoteStop(account, usage)
      const stopDiagnosis = buildStopDiagnosis({ account, usage, stopInfo, healthSignals })

      return {
        id,
        provider,
        label: account.name || account.label || id,
        email: account.email || credential.email || '',
        status: account.status || (schedulable ? 'ok' : 'stopped'),
        schedulable,
        maskedSecret: maskSecret(pickSecret(account, credential)),
        usage,
        recovery: normalizeRemoteRecovery({ ...account, ...(account.recovery || {}) }),
        healthSignals,
        stopSource: stopInfo.stopSource,
        stopReason: stopInfo.stopReason,
        stopCategory: stopInfo.stopCategory,
        stopTrigger: stopInfo.stopTrigger,
        stopDiagnosis,
        lastError: account.last_error || account.lastError || account.cause || ''
      }
    })
    .filter(Boolean)

  return {
    target: process.env.SERVER_STATE_JMS_TARGET || DEFAULT_TARGET,
    source: {
      kind: 'live_acct_admin',
      path: LIVE_ACCOUNTS_PATH,
      accurate: true,
      degraded: false,
      count: accounts.length,
      readAt: new Date().toISOString(),
      message: LIVE_ACCOUNT_SOURCE_MESSAGE
    },
    accounts,
    totals: summarizeMirrorTotals(accounts)
  }
}

const buildCanonicalAccountMirror = (canonicalState) => {
  const accounts = (canonicalState.accounts || [])
    .map((rawAccount) => {
      const account = decorateQuotaViewSignals(rawAccount)
      const id = account.acct || account.id || account.account
      if (!id) {
        return null
      }

      const canonicalAccount = {
        ...account,
        provider: 'openai',
        status: normalizeCanonicalStatus(account)
      }
      const usage = normalizeRemoteUsage(canonicalAccount)
      const healthSignals = normalizeHealthSignals(canonicalAccount)
      const schedulable = isRemoteSchedulable(canonicalAccount, usage)
      const stopInfo = schedulable
        ? { stopSource: '', stopReason: '', stopCategory: '', stopTrigger: '' }
        : classifyRemoteStop(canonicalAccount, usage)
      const stopDiagnosis = buildStopDiagnosis({
        account: canonicalAccount,
        usage,
        stopInfo,
        healthSignals
      })

      return {
        id,
        provider: 'openai',
        label: id,
        email: canonicalAccount.email || '',
        status: canonicalAccount.status,
        schedulable,
        maskedSecret: '',
        usage,
        recovery: normalizeRemoteRecovery(canonicalAccount),
        healthSignals,
        stopSource: stopInfo.stopSource,
        stopReason: stopInfo.stopReason,
        stopCategory: stopInfo.stopCategory,
        stopTrigger: stopInfo.stopTrigger,
        stopDiagnosis,
        lastError: canonicalAccount.cause || '',
        observedAt: canonicalAccount.ts || null,
        subscriptionUntil: canonicalAccount.subscription_active_until || null
      }
    })
    .filter(Boolean)

  const source = canonicalState.source || {}
  return {
    target: process.env.SERVER_STATE_JMS_TARGET || DEFAULT_TARGET,
    source: {
      kind: source.kind || 'canonical_state',
      path: source.path || DEFAULT_CANONICAL_STATE_PATH,
      accurate: true,
      degraded: false,
      count: toNumber(source.count, accounts.length),
      readAt: source.readAt || null,
      message: ''
    },
    accounts,
    totals: summarizeMirrorTotals(accounts)
  }
}

const withClaudeGuardMirror = async (baseMirror) => {
  try {
    const claudeGuardState = await fetchClaudeGuardState()
    const claudeGuardMirror = buildClaudeGuardMirror(claudeGuardState)
    return combineAccountMirrors(baseMirror, claudeGuardMirror)
  } catch (error) {
    if (error.message !== 'claude guard state disabled for test') {
      logger.error('Failed to collect Claude ccmax guard state:', error)
    }
    return baseMirror
  }
}

const normalizeAccountId = (account = {}) => account.acct || account.id || account.account

const sanitizeRemoteActionAccount = (rawAccount, provider, accountId) => {
  const account = {
    ...decorateQuotaViewSignals(rawAccount || {}),
    provider,
    acct: rawAccount?.acct || rawAccount?.id || rawAccount?.account || accountId
  }
  const credential = {}
  const id = normalizeAccountId(account)
  const usage = normalizeRemoteUsage({ ...account, ...(account.usage || {}) })
  const schedulable = isRemoteSchedulable(account, usage)
  const healthSignals = normalizeHealthSignals(account)
  const stopInfo = schedulable
    ? { stopSource: '', stopReason: '', stopCategory: '', stopTrigger: '' }
    : classifyRemoteStop(account, usage)
  const stopDiagnosis = buildStopDiagnosis({ account, usage, stopInfo, healthSignals })

  return {
    id,
    provider,
    label: account.name || account.label || id,
    email: account.email || credential.email || '',
    status: account.status || (schedulable ? 'ok' : 'stopped'),
    schedulable,
    maskedSecret: maskSecret(pickSecret(account, credential)),
    usage,
    recovery: normalizeRemoteRecovery({ ...account, ...(account.recovery || {}) }),
    healthSignals,
    stopSource: stopInfo.stopSource,
    stopReason: stopInfo.stopReason,
    stopCategory: stopInfo.stopCategory,
    stopTrigger: stopInfo.stopTrigger,
    stopDiagnosis,
    lastError: account.last_error || account.lastError || account.cause || ''
  }
}

const buildAccountActionOperation = ({ provider, accountId, action }) => {
  const normalizedProvider = String(provider || '').toLowerCase()
  const normalizedAction = String(action || '').toLowerCase()
  const normalizedAccountId = String(accountId || '').trim()

  if (!SUPPORTED_ACCOUNT_PROVIDERS.includes(normalizedProvider)) {
    throw new Error('Unsupported server account provider')
  }
  if (!SUPPORTED_ACCOUNT_ACTIONS.includes(normalizedAction)) {
    throw new Error('Unsupported server account action')
  }
  if (!normalizedAccountId) {
    throw new Error('Server account id is required')
  }

  if (['pause', 'resume'].includes(normalizedAction)) {
    return {
      provider: normalizedProvider,
      accountId: normalizedAccountId,
      action: normalizedAction,
      available: true,
      method: 'POST',
      path: `/api/actions/${normalizedAction}`,
      body: {
        acct: normalizedAccountId,
        confirm: true,
        reason: `manual ${normalizedAction} from gateway`
      }
    }
  }

  return {
    provider: normalizedProvider,
    accountId: normalizedAccountId,
    action: normalizedAction,
    available: true,
    method: 'GET',
    path: '/api/accounts?force=true',
    body: {}
  }
}

const buildAccountActionOperations = ({ provider, accountId, action }) => {
  const operation = buildAccountActionOperation({ provider, accountId, action })
  if (operation.action === 'pause') {
    return [
      {
        ...operation,
        action: 'lock',
        path: '/api/actions/lock'
      },
      operation
    ]
  }
  if (operation.action === 'resume') {
    return [
      {
        ...operation,
        action: 'unlock',
        path: '/api/actions/unlock'
      },
      operation
    ]
  }
  return [operation]
}

const getSummary = async () => {
  try {
    const responses = await fetchRemote({
      health: '/api/health',
      accounts: LIVE_ACCOUNTS_PATH,
      credentials: '/api/creds',
      pools: '/api/pools'
    })
    let accountSummary = summarizeAccounts(responses.accounts)
    let accountSource = {
      kind: 'live_acct_admin',
      path: LIVE_ACCOUNTS_PATH,
      accurate: true,
      degraded: false,
      count: accountSummary.total,
      readAt: new Date().toISOString(),
      message: LIVE_ACCOUNT_SOURCE_MESSAGE
    }

    try {
      const quotaScriptState = await fetchQuotaScriptState()
      const quotaScriptMirror = await withClaudeGuardMirror(
        buildCanonicalAccountMirror(quotaScriptState)
      )
      accountSummary = summarizeCanonicalMirrorAccounts(quotaScriptMirror.accounts)
      accountSource = quotaScriptMirror.source
    } catch (error) {
      logger.error('Failed to summarize carher-admin quota script state:', error)
    }

    try {
      const canonicalState = await fetchCanonicalState()
      const canonicalMirror = await withClaudeGuardMirror(
        buildCanonicalAccountMirror(canonicalState)
      )
      if (accountSource.kind === 'live_acct_admin') {
        accountSummary = summarizeCanonicalMirrorAccounts(canonicalMirror.accounts)
        accountSource = canonicalMirror.source
      }
    } catch (error) {
      logger.error('Failed to summarize canonical account state:', error)
    }

    return {
      target: process.env.SERVER_STATE_JMS_TARGET || DEFAULT_TARGET,
      health: summarizeHealth(responses.health),
      accountSource,
      accounts: accountSummary,
      credentials: summarizeCredentials(responses.credentials),
      pools: summarizePools(responses.pools),
      demoCredential: summarizeDemoCredential(responses.credentials)
    }
  } catch (error) {
    logger.error('Failed to collect remote server state:', error)
    const reason = error.message ? error.message.slice(0, 300) : 'Unknown server state error'
    return {
      target: process.env.SERVER_STATE_JMS_TARGET || DEFAULT_TARGET,
      health: {
        status: 'unreachable',
        reason,
        cachedAccountCount: 0,
        lastFetchAt: null
      },
      accounts: { total: 0, normal: 0, paused: 0, abnormal: 0 },
      credentials: { total: 0, withEmailPassword: 0, withChatGptPassword: 0 },
      pools: { total: 0, healthy: 0, degraded: 0 },
      demoCredential: {
        account: DEMO_ACCOUNT,
        present: false,
        updatedAt: null
      }
    }
  }
}

const collectAccountMirror = async () => {
  try {
    const quotaScriptState = await fetchQuotaScriptState()
    return withClaudeGuardMirror(buildCanonicalAccountMirror(quotaScriptState))
  } catch (error) {
    logger.error('Failed to collect carher-admin quota script state:', error)
  }

  try {
    const canonicalState = await fetchCanonicalState()
    return withClaudeGuardMirror(buildCanonicalAccountMirror(canonicalState))
  } catch (error) {
    logger.error('Failed to collect canonical account state:', error)
  }

  try {
    const responses = await fetchRemote({
      accounts: LIVE_ACCOUNTS_PATH,
      credentials: '/api/creds'
    })
    return withClaudeGuardMirror(buildAccountMirror(responses))
  } catch (error) {
    logger.error('Failed to collect remote account mirror:', error)
    return {
      target: process.env.SERVER_STATE_JMS_TARGET || DEFAULT_TARGET,
      source: {
        kind: 'unavailable',
        path: process.env.SERVER_STATE_CANONICAL_PATH || DEFAULT_CANONICAL_STATE_PATH,
        accurate: false,
        degraded: true,
        count: 0,
        readAt: null,
        message: error.message ? error.message.slice(0, 300) : 'Canonical state unavailable'
      },
      accounts: [],
      totals: {
        openai: { total: 0, schedulable: 0, stopped: 0 },
        claude: { total: 0, schedulable: 0, stopped: 0 }
      }
    }
  }
}

const getAccountMirror = async (options = {}) => {
  const force = options?.force === true

  if (!force && isAccountMirrorCacheFresh()) {
    return cloneAccountMirror(accountMirrorCache.mirror)
  }

  if (!force && accountMirrorInFlight) {
    return cloneAccountMirror(await accountMirrorInFlight)
  }

  const request = collectAccountMirror()
    .then((mirror) => rememberAccountMirror(mirror))
    .finally(() => {
      accountMirrorInFlight = null
    })

  accountMirrorInFlight = request
  return cloneAccountMirror(await request)
}

const runAccountAction = async ({ provider, accountId, action }) => {
  clearAccountMirrorCache()
  const operation = buildAccountActionOperation({ provider, accountId, action })
  if (!operation.available) {
    return {
      target: process.env.SERVER_STATE_JMS_TARGET || DEFAULT_TARGET,
      provider: operation.provider,
      accountId: operation.accountId,
      action: operation.action,
      ok: false,
      status: operation.status,
      message: operation.message,
      account: null
    }
  }

  const operations = buildAccountActionOperations({ provider, accountId, action })
  let result = null
  for (const nextOperation of operations) {
    const { available: _available, ...remoteOperation } = nextOperation
    result = await mutateRemote(remoteOperation)
    if (result?.ok !== true) {
      break
    }
  }
  const body = result?.body || {}

  if (['pause', 'resume'].includes(operation.action)) {
    const mirror = await getAccountMirror()
    const account =
      mirror.accounts.find(
        (item) => item.provider === operation.provider && item.id === operation.accountId
      ) || null

    return {
      target: process.env.SERVER_STATE_JMS_TARGET || DEFAULT_TARGET,
      provider: operation.provider,
      accountId: operation.accountId,
      action: operation.action,
      ok: result?.ok === true && body?.result?.ok !== false,
      status: toNumber(result?.status, result?.ok ? 200 : 500),
      message:
        body.message ||
        (result?.ok ? `${operation.action} completed` : '') ||
        body.result?.msg ||
        result?.error ||
        '',
      account
    }
  }

  const rawAccount =
    body.account ||
    (Array.isArray(body.accounts)
      ? body.accounts.find((account) => normalizeAccountId(account) === operation.accountId)
      : null) ||
    body

  return {
    target: process.env.SERVER_STATE_JMS_TARGET || DEFAULT_TARGET,
    provider: operation.provider,
    accountId: operation.accountId,
    action: operation.action,
    ok: result?.ok === true,
    status: toNumber(result?.status, result?.ok ? 200 : 500),
    message:
      body.message ||
      (operation.action === 'refresh' && result?.ok ? 'refreshed' : '') ||
      result?.error ||
      '',
    account: sanitizeRemoteActionAccount(rawAccount, operation.provider, operation.accountId)
  }
}

module.exports = {
  getSummary,
  getAccountMirror,
  runAccountAction,
  DEMO_ACCOUNT,
  __setFetchCanonicalStateForTest: (fetcher) => {
    clearAccountMirrorCache()
    fetchCanonicalState = fetcher
  },
  __setFetchClaudeGuardStateForTest: (fetcher) => {
    clearAccountMirrorCache()
    fetchClaudeGuardState = fetcher
  },
  __setFetchQuotaScriptStateForTest: (fetcher) => {
    clearAccountMirrorCache()
    fetchQuotaScriptState = fetcher
  },
  __setQuotaCommandRunnerForTest: (runner) => {
    clearAccountMirrorCache()
    quotaCommandRunner = runner
  },
  __setFetchRemoteForTest: (fetcher) => {
    clearAccountMirrorCache()
    fetchRemote = fetcher
    fetchQuotaScriptState = async () => {
      throw new Error('quota script state disabled for fetchRemote test')
    }
    fetchCanonicalState = async () => {
      throw new Error('canonical state disabled for fetchRemote test')
    }
  },
  __setMutateRemoteForTest: (mutator) => {
    clearAccountMirrorCache()
    mutateRemote = mutator
  },
  __clearAccountMirrorCacheForTest: () => {
    clearAccountMirrorCache()
  }
}
