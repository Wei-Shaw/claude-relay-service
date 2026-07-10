const express = require('express')
const claudeAccountService = require('../../services/account/claudeAccountService')
const claudeConsoleAccountService = require('../../services/account/claudeConsoleAccountService')
const openaiAccountService = require('../../services/account/openaiAccountService')
const openaiResponsesAccountService = require('../../services/account/openaiResponsesAccountService')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const accountPoolPolicyService = require('../../services/accountPoolPolicyService')
const accountPoolAutomationService = require('../../services/accountPoolAutomationService')
const serverStateService = require('../../services/serverStateService')
const carherAdminSkillService = require('../../services/carherAdminSkillService')

const router = express.Router()

const BUSINESS_PLATFORMS = {
  openai: {
    label: 'OpenAI',
    adapters: ['openai', 'openai-responses']
  },
  claude: {
    label: 'Claude',
    adapters: ['claude', 'claude-console']
  }
}
const DEFAULT_DEMO_PLATFORM_POLICY = {
  enabled: true,
  fiveHourUtilizationLimit: 100,
  sevenDayUtilizationLimit: 100,
  dailyCostLimit: 0,
  dailyTokenLimit: 0,
  dailyRequestLimit: 0
}
const DEMO_FORCE_STOP_PLATFORM_POLICY = {
  ...DEFAULT_DEMO_PLATFORM_POLICY,
  fiveHourUtilizationLimit: 1,
  sevenDayUtilizationLimit: 1,
  dailyRequestLimit: 1
}

const normalizeBoolean = (value, defaultValue = false) => {
  if (value === true || value === 'true' || value === 1 || value === '1') {
    return true
  }
  if (value === false || value === 'false' || value === 0 || value === '0') {
    return false
  }
  return defaultValue
}

const isRateLimited = (account) => {
  const status = account?.rateLimitStatus
  if (!status) {
    return false
  }
  if (typeof status === 'string') {
    return status === 'limited'
  }
  return status.isRateLimited === true
}

const toNumber = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const getWindowUtilization = (account, fields) => {
  for (const field of fields) {
    const window = account?.[field]
    if (window && window.utilization !== undefined && window.utilization !== null) {
      return toNumber(window.utilization)
    }
  }
  return 0
}

const getQuotaUtilization = (account) => {
  const quota = toNumber(account?.dailyQuota)
  if (quota <= 0) {
    return 0
  }

  const used = toNumber(
    account?.usage?.daily?.cost ??
      account?.dailyUsage ??
      account?.dailyCost ??
      account?.currentDailyCost
  )
  return Math.round((used / quota) * 100)
}

const getMaxUtilization = (accounts, fields) =>
  accounts.reduce((max, account) => Math.max(max, getWindowUtilization(account, fields)), 0)

const normalizeWindowSummary = (window) => {
  if (!window || window.utilization === undefined || window.utilization === null) {
    return null
  }

  const remainingSeconds = toNumber(window.remainingSeconds, 0)
  return {
    utilization: toNumber(window.utilization),
    remainingSeconds: Math.max(0, remainingSeconds),
    resetAt: window.resetAt || window.windowEnd || window.endAt || null
  }
}

const pickMostUsedWindow = (accounts, fields) =>
  accounts.reduce((selected, account) => {
    for (const field of fields) {
      const summary = normalizeWindowSummary(account?.[field])
      if (!summary) {
        continue
      }
      if (!selected || summary.utilization > selected.utilization) {
        return summary
      }
    }
    return selected
  }, null)

const pickMostUsedRecovery = (left, right) => {
  if (!left) {
    return right || null
  }
  if (!right) {
    return left
  }
  return right.utilization > left.utilization ? right : left
}

const isQuotaStopped = (account) =>
  Boolean(account?.quotaStoppedAt) ||
  account?.quotaAutoStopped === true ||
  account?.quotaAutoStopped === 'true' ||
  account?.status === 'quota_exceeded' ||
  account?.status === 'quotaExceeded'

const isAutoStopped = (account) =>
  account?.fiveHourAutoStopped === true ||
  account?.fiveHourAutoStopped === 'true' ||
  account?.blockedAutoStopped === true ||
  account?.blockedAutoStopped === 'true' ||
  account?.quotaAutoStopped === true ||
  account?.quotaAutoStopped === 'true'

const buildPolicyStatus = ({ blocked, quotaStopped, autoStopped, highUsage }) => {
  if (blocked > 0 || quotaStopped > 0 || autoStopped > 0) {
    return { status: 'critical', label: '需要处理' }
  }
  if (highUsage > 0) {
    return { status: 'warning', label: '接近上限' }
  }
  return { status: 'healthy', label: '运行正常' }
}
const countAccounts = (accounts) => {
  const stats = accounts.reduce(
    (accountStats, account) => {
      accountStats.total += 1

      const active = normalizeBoolean(account.isActive, true)
      const schedulable = normalizeBoolean(account.schedulable, true)
      const blocked =
        account.status === 'blocked' ||
        account.status === 'unauthorized' ||
        account.status === 'quota_exceeded' ||
        account.status === 'quotaExceeded'

      if (!active || blocked) {
        accountStats.abnormal += 1
      } else if (!schedulable) {
        accountStats.paused += 1
      } else if (isRateLimited(account)) {
        accountStats.rateLimited += 1
      } else {
        accountStats.normal += 1
      }

      return accountStats
    },
    { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 }
  )

  return {
    ...stats,
    available: stats.normal
  }
}

const mergeStats = (...statsList) =>
  statsList.reduce(
    (total, stats) => ({
      total: total.total + stats.total,
      normal: total.normal + stats.normal,
      abnormal: total.abnormal + stats.abnormal,
      paused: total.paused + stats.paused,
      rateLimited: total.rateLimited + stats.rateLimited,
      available: total.available + stats.available,
      utilization: {
        fiveHour: Math.max(total.utilization.fiveHour, stats.utilization?.fiveHour || 0),
        sevenDay: Math.max(total.utilization.sevenDay, stats.utilization?.sevenDay || 0),
        quota: Math.max(total.utilization.quota, stats.utilization?.quota || 0)
      },
      recovery: {
        fiveHour: pickMostUsedRecovery(total.recovery.fiveHour, stats.recovery?.fiveHour),
        sevenDay: pickMostUsedRecovery(total.recovery.sevenDay, stats.recovery?.sevenDay)
      },
      policy: {
        blocked: total.policy.blocked + (stats.policy?.blocked || 0),
        quotaStopped: total.policy.quotaStopped + (stats.policy?.quotaStopped || 0),
        autoStopped: total.policy.autoStopped + (stats.policy?.autoStopped || 0),
        highUsage: total.policy.highUsage + (stats.policy?.highUsage || 0),
        hardStopped: total.policy.hardStopped + (stats.policy?.hardStopped || 0),
        reasons: Object.entries(stats.policy?.reasons || {}).reduce(
          (reasons, [reason, count]) => ({
            ...reasons,
            [reason]: (reasons[reason] || 0) + count
          }),
          { ...total.policy.reasons }
        )
      }
    }),
    {
      total: 0,
      normal: 0,
      abnormal: 0,
      paused: 0,
      rateLimited: 0,
      available: 0,
      utilization: { fiveHour: 0, sevenDay: 0, quota: 0 },
      recovery: { fiveHour: null, sevenDay: null },
      policy: {
        blocked: 0,
        quotaStopped: 0,
        autoStopped: 0,
        highUsage: 0,
        hardStopped: 0,
        reasons: {}
      }
    }
  )

const finalizePolicy = (stats) => {
  const status = buildPolicyStatus(stats.policy)
  return {
    ...stats,
    policy: {
      ...status,
      ...stats.policy
    }
  }
}

const buildPlatformStats = (accounts, windowFields, platform, policy) => {
  const baseStats = countAccounts(accounts)
  const quota = accounts.reduce((max, account) => Math.max(max, getQuotaUtilization(account)), 0)
  const highUsage = accounts.filter((account) => {
    const fiveHour = getWindowUtilization(account, windowFields.fiveHour)
    const sevenDay = getWindowUtilization(account, windowFields.sevenDay)
    const quotaUsage = getQuotaUtilization(account)
    return fiveHour >= 90 || sevenDay >= 90 || quotaUsage >= 90
  }).length
  const policyDecisions = accounts.map((account) =>
    accountPoolPolicyService.evaluateAccount(account, { platform, policy })
  )
  const hardStoppedDecisions = policyDecisions.filter((decision) => !decision.canSchedule)
  const reasons = hardStoppedDecisions.reduce((reasonCounts, decision) => {
    reasonCounts[decision.reason] = (reasonCounts[decision.reason] || 0) + 1
    return reasonCounts
  }, {})

  return finalizePolicy({
    ...baseStats,
    utilization: {
      fiveHour: getMaxUtilization(accounts, windowFields.fiveHour),
      sevenDay: getMaxUtilization(accounts, windowFields.sevenDay),
      quota
    },
    recovery: {
      fiveHour: pickMostUsedWindow(accounts, windowFields.fiveHour),
      sevenDay: pickMostUsedWindow(accounts, windowFields.sevenDay)
    },
    policy: {
      blocked: baseStats.abnormal,
      quotaStopped: accounts.filter(isQuotaStopped).length,
      autoStopped: accounts.filter(isAutoStopped).length,
      highUsage,
      hardStopped: hardStoppedDecisions.length,
      reasons
    }
  })
}

router.get('/account-pool/summary', authenticateAdmin, async (_req, res) => {
  try {
    const [
      claudeAccounts,
      claudeConsoleAccounts,
      openaiAccounts,
      openaiResponsesAccounts,
      accountPoolPolicy
    ] = await Promise.all([
      claudeAccountService.getAllAccounts(),
      claudeConsoleAccountService.getAllAccounts(),
      openaiAccountService.getAllAccounts(),
      openaiResponsesAccountService.getAllAccounts(true),
      accountPoolPolicyService.getPolicy()
    ])

    const openaiStats = buildPlatformStats(
      [...openaiAccounts, ...openaiResponsesAccounts],
      {
        fiveHour: ['primaryWindow', 'fiveHourWindow'],
        sevenDay: ['secondaryWindow', 'weeklyWindow', 'sevenDayWindow']
      },
      'openai',
      accountPoolPolicy
    )
    const claudeStats = buildPlatformStats(
      [...claudeAccounts, ...claudeConsoleAccounts],
      {
        fiveHour: ['fiveHourWindow', 'sessionWindow'],
        sevenDay: ['weeklyWindow', 'secondaryWindow', 'sevenDayWindow']
      },
      'claude',
      accountPoolPolicy
    )
    const totals = finalizePolicy(mergeStats(openaiStats, claudeStats))

    const platforms = {
      openai: {
        ...BUSINESS_PLATFORMS.openai,
        ...openaiStats
      },
      claude: {
        ...BUSINESS_PLATFORMS.claude,
        ...claudeStats
      }
    }

    return res.json({
      success: true,
      data: {
        platforms,
        totals,
        policy: accountPoolPolicy
      }
    })
  } catch (error) {
    logger.error('Failed to get account pool summary:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to get account pool summary',
      error: error.message
    })
  }
})

router.get('/account-pool/policy', authenticateAdmin, async (_req, res) => {
  try {
    const policy = await accountPoolPolicyService.getPolicy()
    return res.json({
      success: true,
      data: policy
    })
  } catch (error) {
    logger.error('Failed to get account pool policy:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to get account pool policy',
      error: error.message
    })
  }
})

router.get('/account-pool/shadow', authenticateAdmin, async (_req, res) => {
  try {
    const [accountMirror, policy] = await Promise.all([
      serverStateService.getAccountMirror(),
      accountPoolPolicyService.getPolicy()
    ])
    const shadowPlan = accountPoolPolicyService.buildShadowPlan({
      accounts: accountMirror.accounts,
      policy
    })

    return res.json({
      success: true,
      data: {
        ...shadowPlan,
        target: accountMirror.target
      }
    })
  } catch (error) {
    logger.error('Failed to get account pool shadow plan:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to get account pool shadow plan',
      error: error.message
    })
  }
})

router.post('/account-pool/sweep', authenticateAdmin, async (req, res) => {
  try {
    const dryRun = req.body?.dryRun !== false
    const source = req.body?.source === 'server' ? 'server' : 'local'
    const result = await accountPoolAutomationService.runPolicySweep({ dryRun, source })

    return res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('Failed to run account pool policy sweep:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to run account pool policy sweep',
      error: error.message
    })
  }
})

router.post('/account-pool/admin-skill/action', authenticateAdmin, async (req, res) => {
  try {
    const result = await carherAdminSkillService.runAdminSkillAction(req.body || {})

    return res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('Failed to run account pool admin skill action:', error)
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || 'Failed to run account pool admin skill action'
    })
  }
})

router.put('/account-pool/policy', authenticateAdmin, async (req, res) => {
  try {
    const policy = await accountPoolPolicyService.savePolicy(req.body)
    return res.json({
      success: true,
      data: policy
    })
  } catch (error) {
    logger.error('Failed to save account pool policy:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to save account pool policy',
      error: error.message
    })
  }
})

router.put('/account-pool/demo', authenticateAdmin, async (req, res) => {
  try {
    const platform = req.body?.platform
    const mode = req.body?.mode

    if (!BUSINESS_PLATFORMS[platform]) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported account-pool demo platform'
      })
    }

    if (!['force_stop', 'restore'].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported account-pool demo mode'
      })
    }

    const currentPolicy = await accountPoolPolicyService.getPolicy()
    const platformPolicy =
      mode === 'force_stop' ? DEMO_FORCE_STOP_PLATFORM_POLICY : DEFAULT_DEMO_PLATFORM_POLICY
    const policy = await accountPoolPolicyService.savePolicy({
      ...currentPolicy,
      enabled: true,
      platforms: {
        ...currentPolicy.platforms,
        [platform]: platformPolicy
      }
    })

    return res.json({
      success: true,
      data: {
        mode,
        platform,
        policy
      }
    })
  } catch (error) {
    logger.error('Failed to apply account pool demo action:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to apply account pool demo action',
      error: error.message
    })
  }
})

module.exports = router
