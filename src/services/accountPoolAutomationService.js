const openaiAccountService = require('./account/openaiAccountService')
const openaiResponsesAccountService = require('./account/openaiResponsesAccountService')
const claudeAccountService = require('./account/claudeAccountService')
const claudeConsoleAccountService = require('./account/claudeConsoleAccountService')
const accountPoolPolicyService = require('./accountPoolPolicyService')
const serverStateService = require('./serverStateService')
const logger = require('../utils/logger')

const PROVIDERS = [
  {
    key: 'openai',
    platform: 'openai',
    accountType: 'openai',
    getAllAccounts: () => openaiAccountService.getAllAccounts(),
    updateAccount: (accountId, updates) => openaiAccountService.updateAccount(accountId, updates)
  },
  {
    key: 'openai-responses',
    platform: 'openai',
    accountType: 'openai-responses',
    getAllAccounts: () => openaiResponsesAccountService.getAllAccounts(true),
    updateAccount: (accountId, updates) =>
      openaiResponsesAccountService.updateAccount(accountId, updates)
  },
  {
    key: 'claude',
    platform: 'claude',
    accountType: 'claude-official',
    getAllAccounts: () => claudeAccountService.getAllAccounts(),
    updateAccount: (accountId, updates) => claudeAccountService.updateAccount(accountId, updates)
  },
  {
    key: 'claude-console',
    platform: 'claude',
    accountType: 'claude-console',
    getAllAccounts: () => claudeConsoleAccountService.getAllAccounts(),
    updateAccount: (accountId, updates) =>
      claudeConsoleAccountService.updateAccount(accountId, updates)
  }
]

const emptyPlatformResult = () => ({
  scanned: 0,
  stop: [],
  resume: [],
  skipped: [],
  reasonBreakdown: {},
  skipBreakdown: {}
})

const emptyTotals = () => ({
  scanned: 0,
  stopped: 0,
  resumed: 0,
  skipped: 0,
  wouldStop: 0,
  wouldResume: 0,
  reasonBreakdown: {},
  skipBreakdown: {}
})

const isSharedPoolAccount = (account = {}) => {
  const accountType = account.accountType || 'shared'
  return accountType === 'shared'
}

const toBoolean = (value, fallback = true) => {
  if (value === true || value === 'true' || value === 1 || value === '1') {
    return true
  }
  if (value === false || value === 'false' || value === 0 || value === '0') {
    return false
  }
  return fallback
}

const isSchedulable = (account = {}) => toBoolean(account.schedulable, true)

const isPoolAutoStopped = (account = {}) =>
  account.accountPoolAutoStopped === true || account.accountPoolAutoStopped === 'true'

const incrementBreakdown = (breakdown, key) => {
  const normalizedKey = key || 'unknown'
  breakdown[normalizedKey] = (breakdown[normalizedKey] || 0) + 1
}

const buildItem = ({ account, provider, action, reason, decision = {} }) => ({
  id: account.id || account.accountId,
  name: account.name || account.label || account.id || account.accountId,
  provider: provider.key,
  platform: provider.platform,
  accountType: provider.accountType,
  action,
  reason,
  resetAt: decision.resetAt || null,
  remainingSeconds: decision.remainingSeconds ?? null
})

const addTotals = (totals, platformResult, dryRun) => {
  totals.scanned += platformResult.scanned
  totals.skipped += platformResult.skipped.length
  for (const [reason, count] of Object.entries(platformResult.reasonBreakdown || {})) {
    totals.reasonBreakdown[reason] = (totals.reasonBreakdown[reason] || 0) + count
  }
  for (const [reason, count] of Object.entries(platformResult.skipBreakdown || {})) {
    totals.skipBreakdown[reason] = (totals.skipBreakdown[reason] || 0) + count
  }
  if (dryRun) {
    totals.wouldStop += platformResult.stop.length
    totals.wouldResume += platformResult.resume.length
    return
  }
  totals.stopped += platformResult.stop.length
  totals.resumed += platformResult.resume.length
}

const mergeBreakdown = (target, source = {}) => {
  for (const [reason, count] of Object.entries(source)) {
    target[reason] = (target[reason] || 0) + count
  }
}

const buildServerTotals = (shadowPlan) => ({
  scanned: shadowPlan.totals.accounts,
  stopped: 0,
  resumed: 0,
  skipped: shadowPlan.totals.manualReview,
  wouldStop: shadowPlan.totals.recommendStop,
  wouldResume: shadowPlan.totals.recommendResume,
  reasonBreakdown: shadowPlan.totals.reasonBreakdown || {},
  skipBreakdown: shadowPlan.totals.skipBreakdown || {}
})

const normalizeServerPlatform = (platformPlan) => ({
  scanned: platformPlan.total,
  stop: platformPlan.recommendStop,
  resume: platformPlan.recommendResume,
  skipped: platformPlan.manualReview,
  reasonBreakdown: platformPlan.reasonBreakdown || {},
  skipBreakdown: platformPlan.skipBreakdown || {}
})

const runServerMirrorSweep = async ({ dryRun, policy }) => {
  if (!dryRun) {
    const error = new Error('Live server account mutation is disabled')
    error.statusCode = 403
    throw error
  }

  const accountMirror = await serverStateService.getAccountMirror()
  const shadowPlan = accountPoolPolicyService.buildShadowPlan({
    accounts: accountMirror.accounts,
    policy
  })

  return {
    mode: 'server-mirror',
    target: accountMirror.target,
    source: accountMirror.source || null,
    dryRun: true,
    mutationEnabled: false,
    policy,
    ranAt: new Date().toISOString(),
    totals: buildServerTotals(shadowPlan),
    platforms: {
      openai: normalizeServerPlatform(shadowPlan.platforms.openai),
      claude: normalizeServerPlatform(shadowPlan.platforms.claude)
    }
  }
}

const runProviderSweep = async ({ provider, policy, dryRun }) => {
  const platformResult = emptyPlatformResult()
  const accounts = await provider.getAllAccounts()

  for (const account of accounts) {
    if (!isSharedPoolAccount(account)) {
      continue
    }

    const accountId = account.id || account.accountId
    if (!accountId) {
      continue
    }

    platformResult.scanned += 1
    const decision = accountPoolPolicyService.evaluateAccount(account, {
      platform: provider.platform,
      policy
    })

    if (isSchedulable(account) && !decision.canSchedule) {
      const item = buildItem({
        account,
        provider,
        action: dryRun ? 'would_stop' : 'stopped',
        reason: decision.reason,
        decision
      })
      platformResult.stop.push(item)
      incrementBreakdown(platformResult.reasonBreakdown, decision.reason)
      if (!dryRun) {
        await accountPoolPolicyService.applySchedulingDecision({
          account,
          updateAccount: provider.updateAccount,
          platform: provider.platform,
          policy
        })
      }
      continue
    }

    if (!isSchedulable(account) && isPoolAutoStopped(account) && decision.canSchedule) {
      const item = buildItem({
        account,
        provider,
        action: dryRun ? 'would_resume' : 'resumed',
        reason: 'policy_limit_recovered',
        decision
      })
      platformResult.resume.push(item)
      if (!dryRun) {
        await accountPoolPolicyService.applySchedulingDecision({
          account,
          updateAccount: provider.updateAccount,
          platform: provider.platform,
          policy
        })
      }
      continue
    }

    if (!isSchedulable(account)) {
      const skipReason =
        account.stopCategory || account.stopSource || decision.reason || 'not_schedulable'
      platformResult.skipped.push(
        buildItem({
          account,
          provider,
          action: 'skipped',
          reason: skipReason,
          decision
        })
      )
      incrementBreakdown(platformResult.skipBreakdown, skipReason)
    }
  }

  return platformResult
}

const runPolicySweep = async ({ dryRun = true, source = 'local' } = {}) => {
  const policy = await accountPoolPolicyService.getPolicy()
  if (source === 'server') {
    return runServerMirrorSweep({ dryRun, policy })
  }

  const result = {
    mode: 'local',
    dryRun,
    mutationEnabled: !dryRun,
    policy,
    ranAt: new Date().toISOString(),
    totals: emptyTotals(),
    platforms: {
      openai: emptyPlatformResult(),
      claude: emptyPlatformResult()
    }
  }

  for (const provider of PROVIDERS) {
    try {
      const providerResult = await runProviderSweep({ provider, policy, dryRun })
      const platformResult = result.platforms[provider.platform]
      platformResult.scanned += providerResult.scanned
      platformResult.stop.push(...providerResult.stop)
      platformResult.resume.push(...providerResult.resume)
      platformResult.skipped.push(...providerResult.skipped)
      mergeBreakdown(platformResult.reasonBreakdown, providerResult.reasonBreakdown)
      mergeBreakdown(platformResult.skipBreakdown, providerResult.skipBreakdown)
    } catch (error) {
      logger.error(`Failed to run account-pool sweep for ${provider.key}:`, error)
      result.platforms[provider.platform].skipped.push({
        id: provider.key,
        name: provider.key,
        provider: provider.key,
        platform: provider.platform,
        accountType: provider.accountType,
        action: 'skipped',
        reason: error.message,
        resetAt: null,
        remainingSeconds: null
      })
      incrementBreakdown(result.platforms[provider.platform].skipBreakdown, 'provider_error')
    }
  }

  addTotals(result.totals, result.platforms.openai, dryRun)
  addTotals(result.totals, result.platforms.claude, dryRun)

  return result
}

module.exports = {
  runPolicySweep
}
