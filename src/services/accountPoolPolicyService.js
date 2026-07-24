const LIMIT_REASONS = {
  FIVE_HOUR: 'five_hour_limit',
  SEVEN_DAY: 'seven_day_limit',
  COST: 'cost_limit',
  TOKEN: 'token_limit',
  REQUEST: 'request_limit',
  NOT_SCHEDULABLE: 'not_schedulable'
}

const POLICY_KEY = 'account_pool:policy'
const PLATFORM_KEYS = ['openai', 'claude']
const DEFAULT_PLATFORM_POLICY = {
  enabled: true,
  fiveHourUtilizationLimit: 100,
  sevenDayUtilizationLimit: 100,
  dailyCostLimit: 0,
  dailyTokenLimit: 0,
  dailyRequestLimit: 0
}
const DEFAULT_POLICY = {
  enabled: true,
  platforms: {
    openai: { ...DEFAULT_PLATFORM_POLICY },
    claude: { ...DEFAULT_PLATFORM_POLICY }
  }
}

const toNumber = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
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

const clampNonNegative = (value, fallback = 0) => Math.max(0, toNumber(value, fallback))

const clampPercentage = (value, fallback = 100) =>
  Math.min(100, Math.max(1, toNumber(value, fallback)))

const normalizePlatformPolicy = (policy = {}) => ({
  enabled: toBoolean(policy.enabled, DEFAULT_PLATFORM_POLICY.enabled),
  fiveHourUtilizationLimit: clampPercentage(
    policy.fiveHourUtilizationLimit,
    DEFAULT_PLATFORM_POLICY.fiveHourUtilizationLimit
  ),
  sevenDayUtilizationLimit: clampPercentage(
    policy.sevenDayUtilizationLimit,
    DEFAULT_PLATFORM_POLICY.sevenDayUtilizationLimit
  ),
  dailyCostLimit: clampNonNegative(policy.dailyCostLimit, DEFAULT_PLATFORM_POLICY.dailyCostLimit),
  dailyTokenLimit: clampNonNegative(
    policy.dailyTokenLimit,
    DEFAULT_PLATFORM_POLICY.dailyTokenLimit
  ),
  dailyRequestLimit: clampNonNegative(
    policy.dailyRequestLimit,
    DEFAULT_PLATFORM_POLICY.dailyRequestLimit
  )
})

const normalizePolicy = (policy = {}) => ({
  enabled: toBoolean(policy.enabled, DEFAULT_POLICY.enabled),
  platforms: Object.fromEntries(
    PLATFORM_KEYS.map((platform) => [
      platform,
      normalizePlatformPolicy(policy.platforms?.[platform])
    ])
  )
})

const getPolicy = async (redis) => {
  const redisClient = redis || require('../models/redis')
  const client = redisClient.getClientSafe()
  const rawPolicy = await client.get(POLICY_KEY)
  if (!rawPolicy) {
    return normalizePolicy(DEFAULT_POLICY)
  }

  try {
    return normalizePolicy(JSON.parse(rawPolicy))
  } catch (_error) {
    return normalizePolicy(DEFAULT_POLICY)
  }
}

const savePolicy = async (policy, redis) => {
  const redisClient = redis || require('../models/redis')
  const client = redisClient.getClientSafe()
  const normalizedPolicy = normalizePolicy(policy)
  await client.set(POLICY_KEY, JSON.stringify(normalizedPolicy))
  return normalizedPolicy
}

const firstPositiveNumber = (...values) => {
  for (const value of values) {
    const number = toNumber(value, 0)
    if (number > 0) {
      return number
    }
  }
  return 0
}

const getNested = (object, path) =>
  path.reduce(
    (current, key) => (current === undefined || current === null ? undefined : current[key]),
    object
  )

const getWindowSummary = (account, fields) => {
  for (const field of fields) {
    const window = account?.[field]
    if (!window) {
      continue
    }

    const utilization = toNumber(
      window.utilization ?? window.usedPercent ?? window.percentage ?? window.percent,
      0
    )
    if (utilization <= 0) {
      continue
    }

    return {
      utilization,
      remainingSeconds:
        window.remainingSeconds !== undefined || window.resetAfterSeconds !== undefined
          ? Math.max(0, toNumber(window.remainingSeconds ?? window.resetAfterSeconds, 0))
          : null,
      resetAt: window.resetAt || window.resetsAt || window.windowEnd || window.endAt || null
    }
  }
  return null
}

const block = (reason, limit, window = null) => ({
  canSchedule: false,
  reason,
  limit,
  resetAt: window?.resetAt || null,
  remainingSeconds: window?.remainingSeconds ?? null
})

const getUsageValue = (account, paths) => {
  for (const path of paths) {
    const value = Array.isArray(path) ? getNested(account, path) : account?.[path]
    const number = toNumber(value, 0)
    if (number > 0) {
      return number
    }
  }
  return 0
}

const isSchedulable = (value) => value !== false && value !== 'false'

const isPolicyAutoStopped = (account) =>
  account?.accountPoolAutoStopped === true || account?.accountPoolAutoStopped === 'true'

const getEffectivePlatformPolicy = (platform, policy) => {
  if (!policy?.enabled) {
    return null
  }
  return policy.platforms?.[platform] || null
}

const evaluateAccount = (account, options = {}) => {
  const platformPolicy = getEffectivePlatformPolicy(options.platform, options.policy)

  if (platformPolicy && !platformPolicy.enabled) {
    return {
      canSchedule: true,
      reason: null,
      limit: null,
      resetAt: null,
      remainingSeconds: null
    }
  }

  const fiveHourWindow = getWindowSummary(account, [
    'primaryWindow',
    'fiveHourWindow',
    'sessionWindow'
  ])
  const fiveHourLimit = platformPolicy?.fiveHourUtilizationLimit || 100
  if (fiveHourWindow && fiveHourWindow.utilization >= fiveHourLimit) {
    return block(LIMIT_REASONS.FIVE_HOUR, fiveHourWindow.utilization, fiveHourWindow)
  }

  const sevenDayWindow = getWindowSummary(account, [
    'secondaryWindow',
    'weeklyWindow',
    'sevenDayWindow'
  ])
  const sevenDayLimit = platformPolicy?.sevenDayUtilizationLimit || 100
  if (sevenDayWindow && sevenDayWindow.utilization >= sevenDayLimit) {
    return block(LIMIT_REASONS.SEVEN_DAY, sevenDayWindow.utilization, sevenDayWindow)
  }

  const costLimit = firstPositiveNumber(
    platformPolicy?.dailyCostLimit,
    account?.costLimit,
    account?.dailyQuota,
    account?.quota?.daily,
    account?.limits?.cost,
    account?.limits?.dailyCost
  )
  const costUsed = getUsageValue(account, [
    ['usage', 'daily', 'cost'],
    ['quota', 'used'],
    'dailyUsage',
    'dailyCost',
    'currentDailyCost'
  ])
  if (costLimit > 0 && costUsed >= costLimit) {
    return block(LIMIT_REASONS.COST, costLimit)
  }

  const tokenLimit = firstPositiveNumber(
    platformPolicy?.dailyTokenLimit,
    account?.tokenLimit,
    account?.dailyTokenLimit,
    account?.limits?.tokens,
    account?.limits?.dailyTokens
  )
  const tokensUsed = getUsageValue(account, [
    ['usage', 'daily', 'allTokens'],
    ['usage', 'daily', 'tokens'],
    ['usage', 'daily', 'totalTokens'],
    'dailyTokens',
    'tokensUsed'
  ])
  if (tokenLimit > 0 && tokensUsed >= tokenLimit) {
    return block(LIMIT_REASONS.TOKEN, tokenLimit)
  }

  const requestLimit = firstPositiveNumber(
    platformPolicy?.dailyRequestLimit,
    account?.requestLimit,
    account?.dailyRequestLimit,
    account?.limits?.requests,
    account?.limits?.dailyRequests
  )
  const requestsUsed = getUsageValue(account, [
    ['usage', 'daily', 'requests'],
    'dailyRequests',
    'requestsUsed'
  ])
  if (requestLimit > 0 && requestsUsed >= requestLimit) {
    return block(LIMIT_REASONS.REQUEST, requestLimit)
  }

  return {
    canSchedule: true,
    reason: null,
    limit: null,
    resetAt: null,
    remainingSeconds: null
  }
}

const buildStopUpdates = (decision) => ({
  schedulable: 'false',
  accountPoolAutoStopped: 'true',
  accountPoolStoppedReason: decision.reason,
  accountPoolStoppedAt: new Date().toISOString()
})

const buildResumeUpdates = () => ({
  schedulable: 'true',
  accountPoolAutoStopped: '',
  accountPoolStoppedReason: '',
  accountPoolStoppedAt: ''
})

const GOVERNANCE_STATES = {
  POLICY_STOP: {
    source: 'policy',
    label: '策略到量',
    description: '本地账号池策略判定已到量，执行时会自动停用调度',
    autoManaged: true,
    recoverable: false
  },
  POLICY_RESUME: {
    source: 'policy',
    label: '策略恢复',
    description: '之前由账号池策略停用，额度恢复后执行时会自动恢复调度',
    autoManaged: true,
    recoverable: true
  },
  REMOTE: {
    source: 'remote',
    label: '远端停用',
    description: '服务器原始状态已经停用，本地账号池策略不会自动恢复',
    autoManaged: false,
    recoverable: false
  },
  QUOTA: {
    source: 'quota',
    label: '额度暂停',
    description: '服务器 quota-rebalance 已暂停调度，等待 5h/7d 窗口恢复或下一轮探测刷新',
    autoManaged: false,
    recoverable: true
  },
  UPSTREAM: {
    source: 'upstream',
    label: '上游异常',
    description: '账号存在认证、订阅或上游错误，需要先处理远端异常',
    autoManaged: false,
    recoverable: false
  },
  STATE: {
    source: 'state',
    label: '状态冻结',
    description: '服务器状态已冻结且 reset 已过期，需要远端探测或恢复链路刷新',
    autoManaged: false,
    recoverable: true
  },
  NOT_SCHEDULABLE: {
    source: 'not_schedulable',
    label: '不可调度',
    description: '账号当前不可调度，但不是账号池策略自动停用',
    autoManaged: false,
    recoverable: false
  }
}
const getGovernanceState = (action, reason, account = {}) => {
  if (action === 'would_stop') {
    return GOVERNANCE_STATES.POLICY_STOP
  }
  if (action === 'would_resume') {
    return GOVERNANCE_STATES.POLICY_RESUME
  }
  if (account.stopSource === 'quota' || reason === 'quota') {
    return GOVERNANCE_STATES.QUOTA
  }
  if (account.stopSource === 'upstream' || reason === 'upstream') {
    return GOVERNANCE_STATES.UPSTREAM
  }
  if (account.stopSource === 'state' || reason === 'state' || reason === 'state_frozen') {
    return GOVERNANCE_STATES.STATE
  }
  if (account.stopSource === 'remote' || reason === 'remote') {
    return GOVERNANCE_STATES.REMOTE
  }
  return GOVERNANCE_STATES.NOT_SCHEDULABLE
}

const normalizeShadowAccountForPolicy = (account = {}) => ({
  ...account,
  primaryWindow: {
    utilization: toNumber(account.usage?.fiveHourPercent ?? account.fiveHourPercent, 0),
    resetAt: account.recovery?.fiveHourResetAt || null
  },
  secondaryWindow: {
    utilization: toNumber(account.usage?.sevenDayPercent ?? account.sevenDayPercent, 0),
    resetAt: account.recovery?.sevenDayResetAt || null
  },
  usage: {
    daily: {
      cost: toNumber(account.usage?.cost, 0),
      allTokens: toNumber(account.usage?.tokens, 0),
      requests: toNumber(account.usage?.requests, 0)
    }
  }
})

const buildShadowItem = (account, action, decision, reason = decision?.reason) => ({
  id: account.id,
  provider: account.provider,
  label: account.label || account.id,
  status: account.status || '',
  schedulable: isSchedulable(account.schedulable),
  action,
  reason,
  stopSource: account.stopSource || '',
  stopReason: account.stopReason || '',
  stopCategory: account.stopCategory || '',
  stopTrigger: account.stopTrigger || '',
  stopDiagnosis: account.stopDiagnosis || '',
  limit: decision?.limit || null,
  resetAt: decision?.resetAt || null,
  remainingSeconds: decision?.remainingSeconds ?? null,
  usage: account.usage || {},
  healthSignals: account.healthSignals || {},
  lastError: account.lastError || '',
  governance: getGovernanceState(action, reason, account)
})

const emptyPlatformPlan = () => ({
  total: 0,
  recommendStop: [],
  recommendResume: [],
  manualReview: [],
  reasonBreakdown: {},
  skipBreakdown: {}
})

const incrementBreakdown = (breakdown, key) => {
  const normalizedKey = key || 'unknown'
  breakdown[normalizedKey] = (breakdown[normalizedKey] || 0) + 1
}

const buildShadowPlan = ({ accounts = [], policy = DEFAULT_POLICY } = {}) => {
  const normalizedPolicy = normalizePolicy(policy)
  const platforms = {
    openai: emptyPlatformPlan(),
    claude: emptyPlatformPlan()
  }

  for (const account of accounts) {
    const provider = account?.provider
    if (!platforms[provider]) {
      continue
    }

    const platformPlan = platforms[provider]
    platformPlan.total += 1

    const normalizedAccount = normalizeShadowAccountForPolicy(account)
    const decision = evaluateAccount(normalizedAccount, {
      platform: provider,
      policy: normalizedPolicy
    })
    const schedulable = isSchedulable(account.schedulable)

    if (schedulable && !decision.canSchedule) {
      platformPlan.recommendStop.push(buildShadowItem(account, 'would_stop', decision))
      incrementBreakdown(platformPlan.reasonBreakdown, decision.reason)
      continue
    }

    if (!schedulable && isPolicyAutoStopped(account) && decision.canSchedule) {
      platformPlan.recommendResume.push(
        buildShadowItem(account, 'would_resume', decision, 'policy_limit_recovered')
      )
      continue
    }

    if (!schedulable) {
      const reviewReason =
        account.stopCategory || account.stopSource || account.lastError || 'not_schedulable'
      platformPlan.manualReview.push(
        buildShadowItem(account, 'manual_review', decision, reviewReason)
      )
      incrementBreakdown(platformPlan.skipBreakdown, reviewReason)
    }
  }

  const totals = Object.values(platforms).reduce(
    (total, platform) => ({
      accounts: total.accounts + platform.total,
      recommendStop: total.recommendStop + platform.recommendStop.length,
      recommendResume: total.recommendResume + platform.recommendResume.length,
      manualReview: total.manualReview + platform.manualReview.length
    }),
    { accounts: 0, recommendStop: 0, recommendResume: 0, manualReview: 0 }
  )

  const breakdowns = Object.values(platforms).reduce(
    (total, platform) => {
      for (const [reason, count] of Object.entries(platform.reasonBreakdown)) {
        total.reasonBreakdown[reason] = (total.reasonBreakdown[reason] || 0) + count
      }
      for (const [reason, count] of Object.entries(platform.skipBreakdown)) {
        total.skipBreakdown[reason] = (total.skipBreakdown[reason] || 0) + count
      }
      return total
    },
    { reasonBreakdown: {}, skipBreakdown: {} }
  )

  return {
    mode: 'shadow',
    mutationEnabled: false,
    policy: normalizedPolicy,
    totals: {
      ...totals,
      ...breakdowns
    },
    platforms
  }
}

const applySchedulingDecision = async ({ account, updateAccount, platform, policy }) => {
  if (!account || typeof updateAccount !== 'function') {
    throw new Error('account and updateAccount are required')
  }

  const decision = evaluateAccount(account, { platform, policy })
  const accountId = account.id || account.accountId

  if (!decision.canSchedule) {
    if (isSchedulable(account.schedulable) && accountId) {
      await updateAccount(accountId, buildStopUpdates(decision))
    }
    return decision
  }

  if (isPolicyAutoStopped(account) && accountId) {
    await updateAccount(accountId, buildResumeUpdates())
    return {
      ...decision,
      resumed: true
    }
  }

  if (!isSchedulable(account.schedulable)) {
    return {
      canSchedule: false,
      reason: LIMIT_REASONS.NOT_SCHEDULABLE,
      limit: null,
      resetAt: null,
      remainingSeconds: null
    }
  }

  return decision
}

module.exports = {
  LIMIT_REASONS,
  DEFAULT_POLICY,
  getPolicy,
  savePolicy,
  normalizePolicy,
  evaluateAccount,
  applySchedulingDecision,
  buildShadowPlan
}
