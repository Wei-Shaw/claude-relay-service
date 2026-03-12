const express = require('express')
const ccrAccountService = require('../../services/account/ccrAccountService')
const accountGroupService = require('../../services/accountGroupService')
const apiKeyService = require('../../services/apiKeyService')
const redis = require('../../models/redis')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const webhookNotifier = require('../../utils/webhookNotifier')
const { formatAccountExpiry, mapExpiryField } = require('./utils')
const { extractErrorMessage } = require('../../utils/testPayloadHelper')

const router = express.Router()

// 🔧 CCR 账户管理

// 获取所有CCR账户
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await ccrAccountService.getAllAccounts()

    // 根据查询参数进行筛选
    if (platform && platform !== 'all' && platform !== 'ccr') {
      // 如果指定了其他平台，返回空数组
      accounts = []
    }

    // 如果指定了分组筛选
    if (groupId && groupId !== 'all') {
      if (groupId === 'ungrouped') {
        // 筛选未分组账户
        const filteredAccounts = []
        for (const account of accounts) {
          const groups = await accountGroupService.getAccountGroups(account.id)
          if (!groups || groups.length === 0) {
            filteredAccounts.push(account)
          }
        }
        accounts = filteredAccounts
      } else {
        // 筛选特定分组的账户
        const groupMembers = await accountGroupService.getGroupMembers(groupId)
        accounts = accounts.filter((account) => groupMembers.includes(account.id))
      }
    }

    // 为每个账户添加使用统计信息
    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          const usageStats = await redis.getAccountUsageStats(account.id)
          const groupInfos = await accountGroupService.getAccountGroups(account.id)

          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            // 转换schedulable为布尔值
            schedulable: account.schedulable === 'true' || account.schedulable === true,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              averages: usageStats.averages
            }
          }
        } catch (statsError) {
          logger.warn(
            `⚠️ Failed to get usage stats for CCR account ${account.id}:`,
            statsError.message
          )
          try {
            const groupInfos = await accountGroupService.getAccountGroups(account.id)
            const formattedAccount = formatAccountExpiry(account)
            return {
              ...formattedAccount,
              // 转换schedulable为布尔值
              schedulable: account.schedulable === 'true' || account.schedulable === true,
              groupInfos,
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          } catch (groupError) {
            logger.warn(
              `⚠️ Failed to get group info for CCR account ${account.id}:`,
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
    logger.error('❌ Failed to get CCR accounts:', error)
    return res.status(500).json({ error: 'Failed to get CCR accounts', message: error.message })
  }
})

// 创建新的CCR账户
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      apiUrl,
      apiKey,
      priority,
      supportedModels,
      userAgent,
      rateLimitDuration,
      proxy,
      accountType,
      groupId,
      dailyQuota,
      quotaResetTime
    } = req.body

    if (!name || !apiUrl || !apiKey) {
      return res.status(400).json({ error: 'Name, API URL and API Key are required' })
    }

    // 验证priority的有效性（1-100）
    if (priority !== undefined && (priority < 1 || priority > 100)) {
      return res.status(400).json({ error: 'Priority must be between 1 and 100' })
    }

    // 验证accountType的有效性
    if (accountType && !['shared', 'dedicated', 'group'].includes(accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }

    // 如果是分组类型，验证groupId
    if (accountType === 'group' && !groupId) {
      return res.status(400).json({ error: 'Group ID is required for group type accounts' })
    }

    const newAccount = await ccrAccountService.createAccount({
      name,
      description,
      apiUrl,
      apiKey,
      priority: priority || 50,
      supportedModels: supportedModels || [],
      userAgent,
      rateLimitDuration:
        rateLimitDuration !== undefined && rateLimitDuration !== null ? rateLimitDuration : 60,
      proxy,
      accountType: accountType || 'shared',
      dailyQuota: dailyQuota || 0,
      quotaResetTime: quotaResetTime || '00:00'
    })

    // 如果是分组类型，将账户添加到分组
    if (accountType === 'group' && groupId) {
      await accountGroupService.addAccountToGroup(newAccount.id, groupId)
    }

    logger.success(`🔧 Admin created CCR account: ${name}`)
    const formattedAccount = formatAccountExpiry(newAccount)
    return res.json({ success: true, data: formattedAccount })
  } catch (error) {
    logger.error('❌ Failed to create CCR account:', error)
    return res.status(500).json({ error: 'Failed to create CCR account', message: error.message })
  }
})

// 更新CCR账户
router.put('/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const updates = req.body

    // ✅ 【新增】映射字段名：前端的 expiresAt -> 后端的 subscriptionExpiresAt
    const mappedUpdates = mapExpiryField(updates, 'CCR', accountId)

    // 验证priority的有效性（1-100）
    if (
      mappedUpdates.priority !== undefined &&
      (mappedUpdates.priority < 1 || mappedUpdates.priority > 100)
    ) {
      return res.status(400).json({ error: 'Priority must be between 1 and 100' })
    }

    // 验证accountType的有效性
    if (
      mappedUpdates.accountType &&
      !['shared', 'dedicated', 'group'].includes(mappedUpdates.accountType)
    ) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared", "dedicated" or "group"' })
    }

    // 如果更新为分组类型，验证groupId
    if (mappedUpdates.accountType === 'group' && !mappedUpdates.groupId) {
      return res.status(400).json({ error: 'Group ID is required for group type accounts' })
    }

    // 获取账户当前信息以处理分组变更
    const currentAccount = await ccrAccountService.getAccount(accountId)
    if (!currentAccount) {
      return res.status(404).json({ error: 'Account not found' })
    }

    // 处理分组的变更
    if (mappedUpdates.accountType !== undefined) {
      // 如果之前是分组类型，需要从所有分组中移除
      if (currentAccount.accountType === 'group') {
        const oldGroups = await accountGroupService.getAccountGroups(accountId)
        for (const oldGroup of oldGroups) {
          await accountGroupService.removeAccountFromGroup(accountId, oldGroup.id)
        }
      }
      // 如果新类型是分组，处理多分组支持
      if (mappedUpdates.accountType === 'group') {
        if (Object.prototype.hasOwnProperty.call(mappedUpdates, 'groupIds')) {
          // 如果明确提供了 groupIds 参数（包括空数组）
          if (mappedUpdates.groupIds && mappedUpdates.groupIds.length > 0) {
            // 设置新的多分组
            await accountGroupService.setAccountGroups(accountId, mappedUpdates.groupIds, 'claude')
          } else {
            // groupIds 为空数组，从所有分组中移除
            await accountGroupService.removeAccountFromAllGroups(accountId)
          }
        } else if (mappedUpdates.groupId) {
          // 向后兼容：仅当没有 groupIds 但有 groupId 时使用单分组逻辑
          await accountGroupService.addAccountToGroup(accountId, mappedUpdates.groupId, 'claude')
        }
      }
    }

    await ccrAccountService.updateAccount(accountId, mappedUpdates)

    logger.success(`📝 Admin updated CCR account: ${accountId}`)
    return res.json({ success: true, message: 'CCR account updated successfully' })
  } catch (error) {
    logger.error('❌ Failed to update CCR account:', error)
    return res.status(500).json({ error: 'Failed to update CCR account', message: error.message })
  }
})

// 删除CCR账户
router.delete('/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    // 尝试自动解绑（CCR账户实际上不会绑定API Key，但保持代码一致性）
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(accountId, 'ccr')

    // 获取账户信息以检查是否在分组中
    const account = await ccrAccountService.getAccount(accountId)
    if (account && account.accountType === 'group') {
      const groups = await accountGroupService.getAccountGroups(accountId)
      for (const group of groups) {
        await accountGroupService.removeAccountFromGroup(accountId, group.id)
      }
    }

    await ccrAccountService.deleteAccount(accountId)

    let message = 'CCR账号已成功删除'
    if (unboundCount > 0) {
      // 理论上不会发生，但保持消息格式一致
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }

    logger.success(`🗑️ Admin deleted CCR account: ${accountId}`)
    return res.json({
      success: true,
      message,
      unboundKeys: unboundCount
    })
  } catch (error) {
    logger.error('❌ Failed to delete CCR account:', error)
    return res.status(500).json({ error: 'Failed to delete CCR account', message: error.message })
  }
})

// 切换CCR账户状态
router.put('/:accountId/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const account = await ccrAccountService.getAccount(accountId)
    if (!account) {
      return res.status(404).json({ error: 'Account not found' })
    }

    const newStatus = !account.isActive
    await ccrAccountService.updateAccount(accountId, { isActive: newStatus })

    logger.success(
      `🔄 Admin toggled CCR account status: ${accountId} -> ${newStatus ? 'active' : 'inactive'}`
    )
    return res.json({ success: true, isActive: newStatus })
  } catch (error) {
    logger.error('❌ Failed to toggle CCR account status:', error)
    return res
      .status(500)
      .json({ error: 'Failed to toggle account status', message: error.message })
  }
})

// 切换CCR账户调度状态
router.put('/:accountId/toggle-schedulable', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params

    const account = await ccrAccountService.getAccount(accountId)
    if (!account) {
      return res.status(404).json({ error: 'Account not found' })
    }

    const newSchedulable = !account.schedulable
    await ccrAccountService.updateAccount(accountId, { schedulable: newSchedulable })

    // 如果账号被禁用，发送webhook通知
    if (!newSchedulable) {
      await webhookNotifier.sendAccountAnomalyNotification({
        accountId: account.id,
        accountName: account.name || 'CCR Account',
        platform: 'ccr',
        status: 'disabled',
        errorCode: 'CCR_MANUALLY_DISABLED',
        reason: '账号已被管理员手动禁用调度',
        timestamp: new Date().toISOString()
      })
    }

    logger.success(
      `🔄 Admin toggled CCR account schedulable status: ${accountId} -> ${
        newSchedulable ? 'schedulable' : 'not schedulable'
      }`
    )
    return res.json({ success: true, schedulable: newSchedulable })
  } catch (error) {
    logger.error('❌ Failed to toggle CCR account schedulable status:', error)
    return res
      .status(500)
      .json({ error: 'Failed to toggle schedulable status', message: error.message })
  }
})

// 获取CCR账户的使用统计
router.get('/:accountId/usage', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const usageStats = await ccrAccountService.getAccountUsageStats(accountId)

    if (!usageStats) {
      return res.status(404).json({ error: 'Account not found' })
    }

    return res.json(usageStats)
  } catch (error) {
    logger.error('❌ Failed to get CCR account usage stats:', error)
    return res.status(500).json({ error: 'Failed to get usage stats', message: error.message })
  }
})

// 手动重置CCR账户的每日使用量
router.post('/:accountId/reset-usage', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    await ccrAccountService.resetDailyUsage(accountId)

    logger.success(`Admin manually reset daily usage for CCR account: ${accountId}`)
    return res.json({ success: true, message: 'Daily usage reset successfully' })
  } catch (error) {
    logger.error('❌ Failed to reset CCR account daily usage:', error)
    return res.status(500).json({ error: 'Failed to reset daily usage', message: error.message })
  }
})

// 重置CCR账户状态（清除所有异常状态）
router.post('/:accountId/reset-status', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const result = await ccrAccountService.resetAccountStatus(accountId)
    logger.success(`Admin reset status for CCR account: ${accountId}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to reset CCR account status:', error)
    return res.status(500).json({ error: 'Failed to reset status', message: error.message })
  }
})

// 手动重置所有CCR账户的每日使用量
router.post('/reset-all-usage', authenticateAdmin, async (req, res) => {
  try {
    await ccrAccountService.resetAllDailyUsage()

    logger.success('Admin manually reset daily usage for all CCR accounts')
    return res.json({ success: true, message: 'All daily usage reset successfully' })
  } catch (error) {
    logger.error('❌ Failed to reset all CCR accounts daily usage:', error)
    return res
      .status(500)
      .json({ error: 'Failed to reset all daily usage', message: error.message })
  }
})

// 测试 CCR 账户连通性
router.post('/:accountId/test', authenticateAdmin, async (req, res) => {
  const { accountId } = req.params
  const { model = 'claude-sonnet-4-20250514' } = req.body
  const startTime = Date.now()

  try {
    // 获取账户信息（已包含解密后的 apiKey）
    const account = await ccrAccountService.getAccount(accountId)
    if (!account) {
      return res.status(404).json({ error: 'Account not found' })
    }

    if (!account.apiKey || !account.apiUrl) {
      return res.status(401).json({ error: 'Credentials not found' })
    }

    // 构造测试请求
    const axios = require('axios')
    const ProxyHelper = require('../../utils/proxyHelper')

    const apiUrl = account.apiUrl
    const payload = {
      model,
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Say "Hello" in one word.' }]
    }

    const requestConfig = {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': account.apiKey,
        'anthropic-version': '2023-06-01'
      },
      timeout: 30000
    }

    // 配置代理
    if (account.proxy) {
      const agent = ProxyHelper.createProxyAgent(account.proxy)
      if (agent) {
        requestConfig.httpsAgent = agent
        requestConfig.httpAgent = agent
      }
    }

    const response = await axios.post(apiUrl, payload, requestConfig)
    const latency = Date.now() - startTime

    // 提取响应文本
    let responseText = ''
    if (response.data?.content?.[0]?.text) {
      responseText = response.data.content[0].text
    }

    logger.success(
      `✅ CCR account test passed: ${account.name} (${accountId}), latency: ${latency}ms`
    )

    return res.json({
      success: true,
      data: {
        accountId,
        accountName: account.name,
        model,
        latency,
        responseText: responseText.substring(0, 200)
      }
    })
  } catch (error) {
    const latency = Date.now() - startTime
    logger.error(`❌ CCR account test failed: ${accountId}`, error.message)

    return res.status(500).json({
      success: false,
      error: 'Test failed',
      message: extractErrorMessage(error.response?.data, error.message),
      latency
    })
  }
})

module.exports = router
