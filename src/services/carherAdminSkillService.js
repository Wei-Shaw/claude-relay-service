const { execFile } = require('child_process')
const path = require('path')
const accountPoolAutomationService = require('./accountPoolAutomationService')
const serverStateService = require('./serverStateService')
const { getAccountDispatchWeight, sortAccountsByPriority } = require('../utils/commonHelper')

const OPENAI_ACTIONS = new Set([
  'refresh_mirror',
  'openai_sweep_dry_run',
  'openai_refresh_account',
  'openai_reset_bank_probe',
  'openai_reset_bank_sweep',
  'openai_reset_bank_full_sweep',
  'openai_pause_account',
  'openai_resume_account'
])

const LIVE_ACTIONS = new Set(['openai_pause_account', 'openai_resume_account'])

const isLiveMutationEnabled = () => process.env.SERVER_STATE_LIVE_MUTATION_ENABLED === 'true'
const resetBankSweepCache = new Map()

const createHttpError = (statusCode, message) => {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

const normalizeAccountId = (accountId) => String(accountId || '').trim()
const normalizeChatGptAccountNumber = (accountId) => {
  const text = normalizeAccountId(accountId)
  const match = text.match(/^acct-(\d+)$/i) || text.match(/^(\d+)$/)
  return match ? match[1] : ''
}

const baseResult = ({
  action,
  provider = 'openai',
  accountId = '',
  dryRun = false,
  mutationEnabled = false
}) => ({
  success: true,
  provider,
  action,
  accountId,
  dryRun,
  mutationEnabled,
  ranAt: new Date().toISOString()
})

const ensureOpenAIAction = (action) => {
  if (!OPENAI_ACTIONS.has(action)) {
    throw createHttpError(400, 'Unsupported admin skill action')
  }
}

const ensureAccountId = (action, accountId) => {
  if (
    [
      'refresh_mirror',
      'openai_sweep_dry_run',
      'openai_reset_bank_sweep',
      'openai_reset_bank_full_sweep'
    ].includes(action)
  ) {
    return
  }
  if (action === 'openai_reset_bank_probe') return
  if (!accountId) {
    throw createHttpError(400, 'OpenAI account id is required')
  }
}

const getResetBankScriptPath = () =>
  process.env.CARHER_ADMIN_RESET_BANK_SCRIPT ||
  path.resolve(
    process.env.CARHER_ADMIN_REPO ||
      'C:\\Users\\zhangkairui\\Documents\\Codex\\2026-07-08\\refs\\carher-admin',
    'scripts',
    'chatgpt-acct-reset-bank.sh'
  )

const isWindowsPath = (value) => /^[a-zA-Z]:[\\/]/.test(String(value || ''))

const toWslPath = (value) => {
  const text = String(value || '')
  if (!isWindowsPath(text)) {
    return text.replace(/\\/g, '/')
  }
  return text.replace(/^([a-zA-Z]):[\\/]/, (_match, drive) => `/mnt/${drive.toLowerCase()}/`).replace(/\\/g, '/')
}

const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`

const getResetBankInnerTimeoutSeconds = (mode = 'default') => {
  const envName =
    mode === 'full'
      ? 'CARHER_ADMIN_RESET_BANK_FULL_INNER_TIMEOUT_SECONDS'
      : 'CARHER_ADMIN_RESET_BANK_INNER_TIMEOUT_SECONDS'
  const fallback = mode === 'full' ? 240 : 20
  return Math.max(5, Math.floor(Number(process.env[envName] || fallback)))
}

const buildWslResetBankScriptCommand = (scriptPath, args, options = {}) => {
  const wslScriptPath = toWslPath(scriptPath)
  const scriptDir = path.posix.dirname(wslScriptPath)
  const scriptName = path.posix.basename(wslScriptPath)
  const quotedArgs = args.map(shellQuote).join(' ')
  const timeoutSeconds = getResetBankInnerTimeoutSeconds(options.mode)

  return [
    `cd ${shellQuote(scriptDir)}`,
    'tmpdir="$(mktemp -d)"',
    `tr -d '\\r' < ${shellQuote(scriptName)} > "$tmpdir/${scriptName}"`,
    'if [ -f jms ]; then tr -d \'\\r\' < jms > "$tmpdir/jms"; chmod +x "$tmpdir/jms"; fi',
    `chmod +x "$tmpdir/${scriptName}"`,
    `timeout ${timeoutSeconds}s bash "$tmpdir/${scriptName}"${quotedArgs ? ` ${quotedArgs}` : ''}`,
    'rm -rf "$tmpdir"'
  ].join(' && ')
}

const parseJsonAfterPrefix = (line) => {
  const jsonStart = line.indexOf('{')
  if (jsonStart < 0) return null
  try {
    return JSON.parse(line.slice(jsonStart))
  } catch (_error) {
    return null
  }
}

const parseResetBankOutput = (stdout = '') =>
  String(stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^acct-?\s*(\d+)|^acct-(\d+)/i)
      const accountNumber = match?.[1] || match?.[2] || ''
      const httpErrorMatch = line.match(/\bHTTP_(\d{3})\b/i)
      if (
        !accountNumber ||
        line.includes('NO_POD') ||
        line.includes('SKIP') ||
        httpErrorMatch
      ) {
        return {
          id: accountNumber ? `acct-${accountNumber}` : '',
          available: false,
          unavailableReason: line.includes('NO_POD')
            ? 'no_pod'
            : httpErrorMatch
              ? `http_${httpErrorMatch[1]}`
              : line.includes('SKIP')
                ? 'skipped'
                : 'unparsed',
          raw: line
        }
      }

      const payload = parseJsonAfterPrefix(line)
      if (!payload) {
        return {
          id: `acct-${accountNumber}`,
          available: false,
          unavailableReason: 'unparsed',
          raw: line
        }
      }
      return {
        id: `acct-${accountNumber}`,
        email: payload.email || '',
        plan: payload.plan || '',
        fiveHourPercent: payload['5h'] ?? null,
        sevenDayPercent: payload['7d'] ?? null,
        allowed: payload.allowed ?? null,
        credits: payload.credits ?? 0,
        resetCardExpiresAt:
          payload.reset_card_expires_at ||
          payload.resetCardExpiresAt ||
          payload.credit_expires_at ||
          payload.creditExpiresAt ||
          null,
        fiveHourResetAt: payload['5h_reset_at'] || null,
        sevenDayResetAt: payload['7d_reset_at'] || null,
        additionalRateLimits: payload.addl || [],
        available: true,
        raw: line
      }
    })
    .filter((account) => account.id)

const runResetBankScript = (args, options = {}) =>
  new Promise((resolve, reject) => {
    const scriptPath = getResetBankScriptPath()
    const shouldUseWsl = process.env.SERVER_STATE_WSL_BIN || isWindowsPath(scriptPath)
    const file = shouldUseWsl ? process.env.SERVER_STATE_WSL_BIN || 'wsl.exe' : 'bash'
    const execArgs = shouldUseWsl
      ? ['-e', 'bash', '-lc', buildWslResetBankScriptCommand(scriptPath, args, options)]
      : [scriptPath, ...args]
    const innerTimeoutSeconds = getResetBankInnerTimeoutSeconds(options.mode)

    execFile(
      file,
      execArgs,
      {
        timeout: Number(
          process.env.CARHER_ADMIN_RESET_BANK_TIMEOUT_MS ||
            (innerTimeoutSeconds + 10) * 1000
        ),
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          if (String(stdout || '').includes('acct-')) {
            resolve({ stdout, stderr, partial: true, exitCode: error.code || null })
            return
          }
          error.stderr = stderr
          reject(error)
          return
        }
        resolve({ stdout, stderr })
      }
    )
  })

const decorateResetBankAccounts = (accounts) =>
  sortAccountsByPriority(accounts).map((account) => ({
    ...account,
    dispatchWeight: getAccountDispatchWeight(account)
  }))

const summarizeResetBankAccounts = (accounts) => {
  const usableAccounts = accounts.filter((account) => account.available)
  return {
    scanned: accounts.length,
    available: usableAccounts.length,
    withCredits: usableAccounts.filter((account) => Number(account.credits || 0) > 0).length,
    exhausted: usableAccounts.filter(
      (account) =>
        Number(account.fiveHourPercent || 0) >= 100 || Number(account.sevenDayPercent || 0) >= 100
    ).length,
    probed: accounts.filter((account) => account.resetCardProbeStatus === 'probed').length
  }
}

const getResetBankSweepLimit = () =>
  Math.max(1, Math.floor(Number(process.env.CARHER_ADMIN_RESET_BANK_SWEEP_LIMIT || 24)))

const getResetBankCacheTtlMs = () =>
  Math.max(0, Math.floor(Number(process.env.CARHER_ADMIN_RESET_BANK_CACHE_TTL_MS || 120000)))

const getAccountUsagePercent = (account, key) => {
  const usage = account?.usage || {}
  return Number(
    usage[key] ??
      account?.[key] ??
      (key === 'sevenDayPercent' ? account?.sevenDayPercent : account?.fiveHourPercent) ??
      0
  )
}

const getAccountQuotaUrgency = (account) => {
  const stopText = [
    account?.stopSource,
    account?.stopTrigger,
    account?.stopCategory,
    account?.stopReason,
    account?.lastError
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (stopText.includes('quota') || stopText.includes('limit')) {
    return 1000
  }
  if (stopText.includes('scaled_down_reset_elapsed') || stopText.includes('reset')) {
    return 800
  }
  if (account?.schedulable === false) {
    return 100
  }
  return 0
}

const getResetBankSweepAccountNumbers = async () => {
  return getResetBankSweepAccountNumbersFromAccounts(await getOpenAIServerMirrorAccounts())
}

const getOpenAIServerMirrorAccounts = async () => {
  try {
    const mirror = await serverStateService.getAccountMirror()
    return (Array.isArray(mirror?.accounts) ? mirror.accounts : []).filter(
      (account) => account?.provider === 'openai'
    )
  } catch (_error) {
    return []
  }
}

const getResetBankSweepAccountNumbersFromAccounts = (accounts = [], limit = getResetBankSweepLimit()) =>
  accounts
    .map((account) => ({
      id: account.id,
      number: normalizeChatGptAccountNumber(account.id),
      sevenDayPercent: getAccountUsagePercent(account, 'sevenDayPercent'),
      fiveHourPercent: getAccountUsagePercent(account, 'fiveHourPercent'),
      quotaUrgency: getAccountQuotaUrgency(account)
    }))
    .filter((account) => account.number)
    .sort(
      (left, right) =>
        right.quotaUrgency - left.quotaUrgency ||
        right.sevenDayPercent - left.sevenDayPercent ||
        right.fiveHourPercent - left.fiveHourPercent ||
        Number(left.number) - Number(right.number)
    )
    .slice(0, limit)
    .map((account) => account.number)

const toResetBankMirrorAccount = (account = {}) => ({
  id: account.id,
  email: account.email || '',
  fiveHourPercent: getAccountUsagePercent(account, 'fiveHourPercent'),
  sevenDayPercent: getAccountUsagePercent(account, 'sevenDayPercent'),
  allowed: account.schedulable === true,
  credits: null,
  resetCardExpiresAt: null,
  fiveHourResetAt: account.recovery?.fiveHourResetAt || null,
  sevenDayResetAt: account.recovery?.sevenDayResetAt || null,
  available: account.schedulable === true,
  unavailableReason: account.schedulable === true ? '' : account.stopTrigger || account.stopCategory || 'not_schedulable',
  resetCardProbeStatus: 'not_probed'
})

const mergeResetBankProbeAccounts = (mirrorAccounts, probeAccounts) => {
  const probeById = new Map(probeAccounts.map((account) => [account.id, account]))
  return mirrorAccounts.map((account) => {
    const probe = probeById.get(account.id)
    if (!probe) {
      return account
    }
    return {
      ...account,
      ...probe,
      resetCardProbeStatus: 'probed'
    }
  })
}

const runResetBankProbe = async ({ action, accountIds = [], accountId = '' }) => {
  const ids = Array.isArray(accountIds) && accountIds.length ? accountIds : [accountId]
  const accountNumbers = ids.map(normalizeChatGptAccountNumber).filter(Boolean)
  if (!accountNumbers.length) {
    throw createHttpError(400, 'At least one OpenAI account id is required')
  }

  const { stdout } = await runResetBankScript(['probe', ...accountNumbers])
  const accounts = decorateResetBankAccounts(parseResetBankOutput(stdout))
  return {
    ...baseResult({ action, dryRun: true }),
    message: 'OpenAI reset-bank probe completed',
    data: {
      mode: 'reset-bank-probe',
      dryRun: true,
      mutationEnabled: false,
      accounts,
      totals: summarizeResetBankAccounts(accounts)
    }
  }
}

const runResetBankSweep = async ({ action, full = false }) => {
  const now = Date.now()
  const cacheTtlMs = getResetBankCacheTtlMs()
  const cacheKey = full ? 'full' : 'priority'
  const cachedSweep = resetBankSweepCache.get(cacheKey)
  if (
    cachedSweep &&
    cacheTtlMs > 0 &&
    now - cachedSweep.cachedAtMs < cacheTtlMs
  ) {
    return {
      ...baseResult({ action, dryRun: true }),
      message: 'OpenAI reset-bank sweep completed',
      data: {
        ...cachedSweep.data,
        cache: {
          cached: true,
          cachedAt: cachedSweep.cachedAt,
          ageMs: now - cachedSweep.cachedAtMs,
          ttlMs: cacheTtlMs
        }
      }
    }
  }

  const mirrorAccounts = full ? (await getOpenAIServerMirrorAccounts()).map(toResetBankMirrorAccount) : []
  const accountNumbers = full
    ? getResetBankSweepAccountNumbersFromAccounts(mirrorAccounts)
    : await getResetBankSweepAccountNumbers()
  const scriptArgs = accountNumbers.length ? ['probe', ...accountNumbers] : ['sweep']
  const { stdout } = await runResetBankScript(scriptArgs, { mode: full ? 'full' : 'default' })
  const probedAccounts = parseResetBankOutput(stdout)
  const accounts = decorateResetBankAccounts(
    full ? mergeResetBankProbeAccounts(mirrorAccounts, probedAccounts) : probedAccounts
  )
  const data = {
    mode: 'reset-bank-sweep',
    dryRun: true,
    mutationEnabled: false,
    requestedAccounts: accountNumbers.length,
    scanLimit: full ? null : getResetBankSweepLimit(),
    scanMode: full
      ? 'full-mirror-priority-probe'
      : scriptArgs[0] === 'sweep'
        ? 'full-sweep'
        : 'priority-probe',
    accounts,
    totals: summarizeResetBankAccounts(accounts),
    cache: {
      cached: false,
      cachedAt: new Date(now).toISOString(),
      ageMs: 0,
      ttlMs: cacheTtlMs
    }
  }
  resetBankSweepCache.set(cacheKey, {
    cachedAtMs: now,
    cachedAt: data.cache.cachedAt,
    data
  })
  return {
    ...baseResult({ action, dryRun: true }),
    message: 'OpenAI reset-bank sweep completed',
    data
  }
}

const summarizeMirror = (mirror = {}) => {
  const accounts = Array.isArray(mirror.accounts) ? mirror.accounts : []
  const totals = accounts.reduce(
    (summary, account) => {
      if (account?.schedulable) {
        summary.schedulable += 1
      } else {
        summary.stopped += 1
      }
      return summary
    },
    { scanned: accounts.length, schedulable: 0, stopped: 0 }
  )

  return {
    target: mirror.target || '',
    source: mirror.source || null,
    totals,
    accounts,
    platformTotals: mirror.totals || null
  }
}

const runRefreshAccount = async ({ action, accountId }) => {
  const data = await serverStateService.runAccountAction({
    provider: 'openai',
    accountId,
    action: 'refresh'
  })

  return {
    ...baseResult({ action, accountId }),
    message: data?.message || 'OpenAI account refreshed',
    data
  }
}

const runLiveAccountMutation = async ({ action, accountId }) => {
  if (!isLiveMutationEnabled()) {
    throw createHttpError(403, 'Live server account mutation is disabled')
  }

  const remoteAction = action === 'openai_pause_account' ? 'pause' : 'resume'
  const data = await serverStateService.runAccountAction({
    provider: 'openai',
    accountId,
    action: remoteAction
  })

  return {
    ...baseResult({
      action,
      accountId,
      dryRun: false,
      mutationEnabled: true
    }),
    message: data?.message || `OpenAI account ${remoteAction} completed`,
    data
  }
}

const runAdminSkillAction = async (input = {}) => {
  const action = String(input.action || '').trim()
  const accountId = normalizeAccountId(input.accountId)

  ensureOpenAIAction(action)
  ensureAccountId(action, accountId)

  if (action === 'refresh_mirror') {
    const mirror = await serverStateService.getAccountMirror({ force: true })
    return {
      ...baseResult({
        action,
        provider: 'all',
        dryRun: true,
        mutationEnabled: false
      }),
      message: 'Server account mirror refreshed',
      data: summarizeMirror(mirror)
    }
  }

  if (action === 'openai_sweep_dry_run') {
    const data = await accountPoolAutomationService.runPolicySweep({
      dryRun: true,
      source: 'server'
    })
    return {
      ...baseResult({ action, dryRun: true }),
      message: 'OpenAI account-pool policy dry-run completed',
      data
    }
  }

  if (action === 'openai_refresh_account') {
    return runRefreshAccount({ action, accountId })
  }

  if (action === 'openai_reset_bank_probe') {
    return runResetBankProbe({
      action,
      accountId,
      accountIds: input.accountIds
    })
  }

  if (action === 'openai_reset_bank_sweep') {
    return runResetBankSweep({ action })
  }

  if (action === 'openai_reset_bank_full_sweep') {
    return runResetBankSweep({ action, full: true })
  }

  if (LIVE_ACTIONS.has(action)) {
    return runLiveAccountMutation({ action, accountId })
  }

  throw createHttpError(400, 'Unsupported admin skill action')
}

module.exports = {
  runAdminSkillAction,
  __resetForTest: () => {
    resetBankSweepCache.clear()
  }
}
