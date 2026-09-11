const express = require('express')

const claudeAccountService = require('../../services/account/claudeAccountService')
const claudeConsoleAccountService = require('../../services/account/claudeConsoleAccountService')
const bedrockAccountService = require('../../services/account/bedrockAccountService')
const geminiAccountService = require('../../services/account/geminiAccountService')
const geminiApiAccountService = require('../../services/account/geminiApiAccountService')
const openaiAccountService = require('../../services/account/openaiAccountService')
const openaiResponsesAccountService = require('../../services/account/openaiResponsesAccountService')
const azureOpenaiAccountService = require('../../services/account/azureOpenaiAccountService')
const ccrAccountService = require('../../services/account/ccrAccountService')
const droidAccountService = require('../../services/account/droidAccountService')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')

const router = express.Router()

const PRIORITY_MIN = 1
const PRIORITY_MAX = 100
const MAX_BATCH_SIZE = 200

const normalizePlatform = (platform) => {
  if (typeof platform !== 'string') {
    return ''
  }

  const normalized = platform.trim().toLowerCase()
  const aliases = {
    'claude-official': 'claude',
    'claude-oauth': 'claude',
    'azure-openai': 'azure_openai',
    azure_openai: 'azure_openai'
  }

  return aliases[normalized] || normalized
}

const getAccountDisplayName = (account, fallbackId) => {
  if (!account || typeof account !== 'object') {
    return fallbackId
  }

  const candidates = [
    account.name,
    account.email,
    account.accountName,
    account.ownerDisplayName,
    account.ownerName,
    account.owner,
    account.username,
    account.alias,
    account.id,
    fallbackId
  ]

  return candidates.find((value) => typeof value === 'string' && value.trim()) || fallbackId
}

const parseAccountPriority = (account) => {
  const parsed = Number.parseInt(account?.priority, 10)
  if (Number.isInteger(parsed) && parsed >= PRIORITY_MIN && parsed <= PRIORITY_MAX) {
    return parsed
  }
  return 50
}

const assertUpdateResult = (result) => {
  if (result && typeof result === 'object' && result.success === false) {
    throw new Error(result.error || result.message || '更新失败')
  }
}

const platformHandlers = {
  claude: {
    label: 'Claude 官方',
    getAccount: async (accountId) => claudeAccountService.getAccount(accountId),
    updatePriority: async (accountId, priority) => {
      await claudeAccountService.updateAccount(accountId, { priority })
    }
  },
  'claude-console': {
    label: 'Claude Console',
    getAccount: async (accountId) => claudeConsoleAccountService.getAccount(accountId),
    updatePriority: async (accountId, priority) => {
      await claudeConsoleAccountService.updateAccount(accountId, { priority })
    }
  },
  bedrock: {
    label: 'Bedrock',
    getAccount: async (accountId) => {
      const result = await bedrockAccountService.getAccount(accountId)
      return result?.success ? result.data : null
    },
    updatePriority: async (accountId, priority) => {
      const result = await bedrockAccountService.updateAccount(accountId, { priority })
      assertUpdateResult(result)
    }
  },
  gemini: {
    label: 'Gemini OAuth',
    getAccount: async (accountId) => geminiAccountService.getAccount(accountId),
    updatePriority: async (accountId, priority) => {
      await geminiAccountService.updateAccount(accountId, { priority })
    }
  },
  'gemini-api': {
    label: 'Gemini API',
    getAccount: async (accountId) => geminiApiAccountService.getAccount(accountId),
    updatePriority: async (accountId, priority) => {
      const result = await geminiApiAccountService.updateAccount(accountId, { priority })
      assertUpdateResult(result)
    }
  },
  openai: {
    label: 'OpenAI',
    getAccount: async (accountId) => openaiAccountService.getAccount(accountId),
    updatePriority: async (accountId, priority) => {
      await openaiAccountService.updateAccount(accountId, { priority })
    }
  },
  'openai-responses': {
    label: 'OpenAI Responses',
    getAccount: async (accountId) => openaiResponsesAccountService.getAccount(accountId),
    updatePriority: async (accountId, priority) => {
      const result = await openaiResponsesAccountService.updateAccount(accountId, { priority })
      assertUpdateResult(result)
    }
  },
  azure_openai: {
    label: 'Azure OpenAI',
    getAccount: async (accountId) => azureOpenaiAccountService.getAccount(accountId),
    updatePriority: async (accountId, priority) => {
      await azureOpenaiAccountService.updateAccount(accountId, { priority })
    }
  },
  ccr: {
    label: 'CCR Relay',
    getAccount: async (accountId) => ccrAccountService.getAccount(accountId),
    updatePriority: async (accountId, priority) => {
      await ccrAccountService.updateAccount(accountId, { priority })
    }
  },
  droid: {
    label: 'Droid',
    getAccount: async (accountId) => droidAccountService.getAccount(accountId),
    updatePriority: async (accountId, priority) => {
      await droidAccountService.updateAccount(accountId, { priority })
    }
  }
}

router.put('/accounts/batch-priority', authenticateAdmin, async (req, res) => {
  try {
    const { accounts: rawAccounts, priority } = req.body || {}

    if (!Array.isArray(rawAccounts) || rawAccounts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'accounts must be a non-empty array'
      })
    }

    if (rawAccounts.length > MAX_BATCH_SIZE) {
      return res.status(400).json({
        success: false,
        message: `最多只允许批量更新 ${MAX_BATCH_SIZE} 个账户`
      })
    }

    const normalizedPriority = Number.parseInt(priority, 10)
    if (
      !Number.isInteger(normalizedPriority) ||
      normalizedPriority < PRIORITY_MIN ||
      normalizedPriority > PRIORITY_MAX
    ) {
      return res.status(400).json({
        success: false,
        message: 'priority must be an integer between 1 and 100'
      })
    }

    const normalizedAccounts = []
    const dedupSet = new Set()

    for (const item of rawAccounts) {
      const accountId = item?.accountId || item?.id
      const platform = normalizePlatform(item?.platform)

      if (!accountId || !platform) {
        return res.status(400).json({
          success: false,
          message: 'each account item must include accountId and platform'
        })
      }

      const dedupKey = `${platform}:${accountId}`
      if (dedupSet.has(dedupKey)) {
        continue
      }

      dedupSet.add(dedupKey)
      normalizedAccounts.push({
        accountId,
        platform
      })
    }

    if (normalizedAccounts.length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有可更新的账户'
      })
    }

    logger.info(
      `🔄 Admin batch updating ${normalizedAccounts.length} accounts priority to ${normalizedPriority}`,
      {
        admin: req.admin?.username || 'unknown'
      }
    )

    const results = await Promise.all(
      normalizedAccounts.map(async ({ accountId, platform }) => {
        const handler = platformHandlers[platform]

        if (!handler) {
          return {
            success: false,
            accountId,
            platform,
            platformLabel: platform,
            message: 'Unsupported platform'
          }
        }

        try {
          const account = await handler.getAccount(accountId)
          if (!account) {
            return {
              success: false,
              accountId,
              platform,
              platformLabel: handler.label,
              message: 'Account not found'
            }
          }

          const accountName = getAccountDisplayName(account, accountId)
          const previousPriority = parseAccountPriority(account)

          if (previousPriority === normalizedPriority) {
            return {
              success: true,
              skipped: true,
              accountId,
              accountName,
              platform,
              platformLabel: handler.label,
              previousPriority,
              priority: normalizedPriority,
              message: 'Priority unchanged'
            }
          }

          await handler.updatePriority(accountId, normalizedPriority)

          return {
            success: true,
            skipped: false,
            accountId,
            accountName,
            platform,
            platformLabel: handler.label,
            previousPriority,
            priority: normalizedPriority,
            message: 'Priority updated'
          }
        } catch (error) {
          logger.error(`❌ Failed to update account priority: ${platform}/${accountId}`, error)
          return {
            success: false,
            accountId,
            platform,
            platformLabel: handler.label,
            message: error.message || 'Priority update failed'
          }
        }
      })
    )

    const summary = results.reduce(
      (accumulator, item) => {
        if (!item.success) {
          accumulator.failedCount += 1
        } else if (item.skipped) {
          accumulator.skippedCount += 1
        } else {
          accumulator.successCount += 1
        }
        return accumulator
      },
      {
        successCount: 0,
        skippedCount: 0,
        failedCount: 0
      }
    )

    const responseData = {
      priority: normalizedPriority,
      totalCount: results.length,
      successCount: summary.successCount,
      skippedCount: summary.skippedCount,
      failedCount: summary.failedCount,
      results
    }

    logger.audit('批量更新账户优先级', {
      admin: req.admin?.username || 'unknown',
      priority: normalizedPriority,
      totalCount: results.length,
      successCount: summary.successCount,
      skippedCount: summary.skippedCount,
      failedCount: summary.failedCount,
      platforms: Array.from(new Set(results.map((item) => item.platform).filter(Boolean)))
    })

    return res.json({
      success: true,
      message: '批量更新账户优先级完成',
      data: responseData
    })
  } catch (error) {
    logger.error('❌ Failed to batch update account priority:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to batch update account priority',
      error: error.message
    })
  }
})

module.exports = router
