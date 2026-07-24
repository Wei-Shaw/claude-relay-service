/**
 * Admin Routes - Vertex AI Accounts Management
 * Google Cloud Vertex AI 账户管理路由
 */

const express = require('express')
const router = express.Router()
const vertexAccountService = require('../../services/account/vertexAccountService')
const apiKeyService = require('../../services/apiKeyService')
const accountGroupService = require('../../services/accountGroupService')
const redis = require('../../models/redis')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const webhookNotifier = require('../../utils/webhookNotifier')
const { formatAccountExpiry, mapExpiryField } = require('./utils')

// ☁️ Vertex AI 账户管理

// 获取所有 Vertex AI 账户
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    const result = await vertexAccountService.getAllAccounts()
    if (!result.success) {
      return res.status(500).json({ error: 'Failed to get Vertex accounts', message: result.error })
    }

    let accounts = result.data

    if (platform && platform !== 'all' && platform !== 'vertex') {
      accounts = []
    }

    if (groupId && groupId !== 'all') {
      if (groupId === 'ungrouped') {
        const filteredAccounts = []
        for (const account of accounts) {
          const groups = await accountGroupService.getAccountGroups(account.id)
          if (!groups || groups.length === 0) {
            filteredAccounts.push(account)
          }
        }
        accounts = filteredAccounts
      } else {
        const groupMembers = await accountGroupService.getGroupMembers(groupId)
        accounts = accounts.filter((account) => groupMembers.includes(account.id))
      }
    }

    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          const usageStats = await redis.getAccountUsageStats(account.id, 'openai')
          const groupInfos = await accountGroupService.getAccountGroups(account.id)

          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              averages: usageStats.averages
            }
          }
        } catch (statsError) {
          logger.warn(
            `⚠️ Failed to get usage stats for Vertex account ${account.id}:`,
            statsError.message
          )
          try {
            const groupInfos = await accountGroupService.getAccountGroups(account.id)
            const formattedAccount = formatAccountExpiry(account)
            return {
              ...formattedAccount,
              groupInfos,
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          } catch (groupError) {
            logger.warn(
              `⚠️ Failed to get group info for account ${account.id}:`,
              groupError.message
            )
            return {
              ...account,
              groupInfos: [],
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          }
        }
      })
    )

    return res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('❌ Failed to get Vertex accounts:', error)
    return res.status(500).json({ error: 'Failed to get Vertex accounts', message: error.message })
  }
})

// 创建新的 Vertex AI 账户
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      projectId,
      region,
      defaultModel,
      supportedModels,
      credentialsJson,
      proxy,
      priority,
      accountType
    } = req.body

    if (!name) {
      return res.status(400).json({ error: 'Name is required' })
    }
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' })
    }
    if (!credentialsJson) {
      return res.status(400).json({ error: 'credentialsJson (Service Account JSON) is required' })
    }

    if (priority !== undefined && (priority < 1 || priority > 100)) {
      return res.status(400).json({ error: 'Priority must be between 1 and 100' })
    }

    if (accountType && !['shared', 'dedicated'].includes(accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared" or "dedicated"' })
    }

    const result = await vertexAccountService.createAccount({
      name,
      description: description || '',
      projectId,
      region: region || 'global',
      defaultModel,
      supportedModels: Array.isArray(supportedModels) ? supportedModels : [],
      credentialsJson,
      proxy: proxy || null,
      priority: priority || 50,
      accountType: accountType || 'shared'
    })

    if (!result.success) {
      return res
        .status(500)
        .json({ error: 'Failed to create Vertex account', message: result.error })
    }

    logger.success(`☁️ Admin created Vertex account: ${name}`)
    const formattedAccount = formatAccountExpiry(result.data)
    return res.json({ success: true, data: formattedAccount })
  } catch (error) {
    logger.error('❌ Failed to create Vertex account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to create Vertex account', message: error.message })
  }
})

// 更新 Vertex AI 账户
router.put('/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const updates = req.body

    // 映射字段名：前端的 expiresAt -> 后端的 subscriptionExpiresAt
    const mappedUpdates = mapExpiryField(updates, 'Vertex', accountId)

    if (
      mappedUpdates.priority !== undefined &&
      (mappedUpdates.priority < 1 || mappedUpdates.priority > 100)
    ) {
      return res.status(400).json({ error: 'Priority must be between 1 and 100' })
    }

    if (mappedUpdates.accountType && !['shared', 'dedicated'].includes(mappedUpdates.accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared" or "dedicated"' })
    }

    const result = await vertexAccountService.updateAccount(accountId, mappedUpdates)

    if (!result.success) {
      return res
        .status(500)
        .json({ error: 'Failed to update Vertex account', message: result.error })
    }

    logger.success(`📝 Admin updated Vertex account: ${accountId}`)
    return res.json({ success: true, message: 'Vertex account updated successfully' })
  } catch (error) {
    logger.error('❌ Failed to update Vertex account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to update Vertex account', message: error.message })
  }
})

// 删除 Vertex AI 账户
router.delete('/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(accountId, 'vertex')

    const result = await vertexAccountService.deleteAccount(accountId)

    if (!result.success) {
      return res
        .status(500)
        .json({ error: 'Failed to delete Vertex account', message: result.error })
    }

    let message = 'Vertex 账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }

    logger.success(`🗑️ Admin deleted Vertex account: ${accountId}, unbound ${unboundCount} keys`)
    return res.json({ success: true, message, unboundKeys: unboundCount })
  } catch (error) {
    logger.error('❌ Failed to delete Vertex account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to delete Vertex account', message: error.message })
  }
})

// 切换 Vertex 账户启用状态
router.put('/:accountId/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const accountResult = await vertexAccountService.getAccount(accountId)
    if (!accountResult.success) {
      return res.status(404).json({ error: 'Account not found' })
    }

    const newStatus = !accountResult.data.isActive
    const updateResult = await vertexAccountService.updateAccount(accountId, {
      isActive: newStatus
    })

    if (!updateResult.success) {
      return res
        .status(500)
        .json({ error: 'Failed to toggle account status', message: updateResult.error })
    }

    logger.success(
      `🔄 Admin toggled Vertex account status: ${accountId} -> ${newStatus ? 'active' : 'inactive'}`
    )
    return res.json({ success: true, isActive: newStatus })
  } catch (error) {
    logger.error('❌ Failed to toggle Vertex account status:', error)
    return res
      .status(500)
      .json({ error: 'Failed to toggle account status', message: error.message })
  }
})

// 切换 Vertex 账户调度状态
router.put('/:accountId/toggle-schedulable', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const accountResult = await vertexAccountService.getAccount(accountId)
    if (!accountResult.success) {
      return res.status(404).json({ error: 'Account not found' })
    }

    const newSchedulable = !accountResult.data.schedulable
    const updateResult = await vertexAccountService.updateAccount(accountId, {
      schedulable: newSchedulable
    })

    if (!updateResult.success) {
      return res
        .status(500)
        .json({ error: 'Failed to toggle schedulable status', message: updateResult.error })
    }

    if (!newSchedulable) {
      await webhookNotifier.sendAccountAnomalyNotification({
        accountId: accountResult.data.id,
        accountName: accountResult.data.name || 'Vertex Account',
        platform: 'vertex',
        status: 'disabled',
        errorCode: 'VERTEX_MANUALLY_DISABLED',
        reason: '账号已被管理员手动禁用调度',
        timestamp: new Date().toISOString()
      })
    }

    logger.success(
      `🔄 Admin toggled Vertex account schedulable status: ${accountId} -> ${
        newSchedulable ? 'schedulable' : 'not schedulable'
      }`
    )
    return res.json({ success: true, schedulable: newSchedulable })
  } catch (error) {
    logger.error('❌ Failed to toggle Vertex account schedulable status:', error)
    return res
      .status(500)
      .json({ error: 'Failed to toggle schedulable status', message: error.message })
  }
})

// 测试 Vertex 账户连通性（SSE 流式）
router.post('/:accountId/test', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const { model } = req.body || {}
    await vertexAccountService.testAccountConnection(accountId, res, model)
  } catch (error) {
    logger.error('❌ Failed to test Vertex account:', error)
  }
})

// 重置 Vertex 账户状态
router.post('/:accountId/reset-status', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const result = await vertexAccountService.resetAccountStatus(accountId)
    logger.success(`Admin reset status for Vertex account: ${accountId}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to reset Vertex account status:', error)
    return res.status(500).json({ error: 'Failed to reset status', message: error.message })
  }
})

module.exports = router
