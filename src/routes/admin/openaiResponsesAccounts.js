/**
 * Admin Routes - OpenAI-Responses 账户管理
 * 处理 OpenAI-Responses 账户的增删改查和状态管理
 */

const express = require('express')
const axios = require('axios')
const openaiResponsesAccountService = require('../../services/account/openaiResponsesAccountService')
const apiKeyService = require('../../services/apiKeyService')
const accountGroupService = require('../../services/accountGroupService')
const redis = require('../../models/redis')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const webhookNotifier = require('../../utils/webhookNotifier')
const { formatAccountExpiry, mapExpiryField } = require('./utils')
const { createOpenAITestPayload, extractErrorMessage } = require('../../utils/testPayloadHelper')
const { getProxyAgent } = require('../../utils/proxyHelper')

const router = express.Router()

// ==================== OpenAI-Responses 账户管理 API ====================

// 获取所有 OpenAI-Responses 账户
router.get('/openai-responses-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await openaiResponsesAccountService.getAllAccounts(true)

    // 根据查询参数进行筛选
    if (platform && platform !== 'openai-responses') {
      accounts = []
    }

    // 根据分组ID筛选
    if (groupId) {
      const group = await accountGroupService.getGroup(groupId)
      if (group && group.platform === 'openai') {
        const groupMembers = await accountGroupService.getGroupMembers(groupId)
        accounts = accounts.filter((account) => groupMembers.includes(account.id))
      } else {
        accounts = []
      }
    }

    const accountIds = accounts.map((a) => a.id)

    // 并行获取：轻量 API Keys + 分组信息 + daily cost + 清理限流状态
    const [allApiKeys, allGroupInfosMap, dailyCostMap] = await Promise.all([
      apiKeyService.getAllApiKeysLite(),
      accountGroupService.batchGetAccountGroupsByIndex(accountIds, 'openai'),
      redis.batchGetAccountDailyCost(accountIds),
      // 批量清理限流状态
      Promise.all(accountIds.map((id) => openaiResponsesAccountService.checkAndClearRateLimit(id)))
    ])

    // 单次遍历构建绑定数映射（只算直连，不算 group）
    const bindingCountMap = new Map()
    for (const key of allApiKeys) {
      const binding = key.openaiAccountId
      if (!binding) {
        continue
      }
      // 处理 responses: 前缀
      const accountId = binding.startsWith('responses:') ? binding.substring(10) : binding
      bindingCountMap.set(accountId, (bindingCountMap.get(accountId) || 0) + 1)
    }

    // 批量获取使用统计（不含 daily cost，已单独获取）
    const client = redis.getClientSafe()
    const today = redis.getDateStringInTimezone()
    const tzDate = redis.getDateInTimezone()
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`

    const statsPipeline = client.pipeline()
    for (const accountId of accountIds) {
      statsPipeline.hgetall(`account_usage:${accountId}`)
      statsPipeline.hgetall(`account_usage:daily:${accountId}:${today}`)
      statsPipeline.hgetall(`account_usage:monthly:${accountId}:${currentMonth}`)
    }
    const statsResults = await statsPipeline.exec()

    // 处理统计数据
    const allUsageStatsMap = new Map()
    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i]
      const [errTotal, total] = statsResults[i * 3]
      const [errDaily, daily] = statsResults[i * 3 + 1]
      const [errMonthly, monthly] = statsResults[i * 3 + 2]

      const parseUsage = (data) => ({
        requests: parseInt(data?.totalRequests || data?.requests) || 0,
        tokens: parseInt(data?.totalTokens || data?.tokens) || 0,
        inputTokens: parseInt(data?.totalInputTokens || data?.inputTokens) || 0,
        outputTokens: parseInt(data?.totalOutputTokens || data?.outputTokens) || 0,
        cacheCreateTokens: parseInt(data?.totalCacheCreateTokens || data?.cacheCreateTokens) || 0,
        cacheReadTokens: parseInt(data?.totalCacheReadTokens || data?.cacheReadTokens) || 0,
        allTokens:
          parseInt(data?.totalAllTokens || data?.allTokens) ||
          (parseInt(data?.totalInputTokens || data?.inputTokens) || 0) +
            (parseInt(data?.totalOutputTokens || data?.outputTokens) || 0) +
            (parseInt(data?.totalCacheCreateTokens || data?.cacheCreateTokens) || 0) +
            (parseInt(data?.totalCacheReadTokens || data?.cacheReadTokens) || 0)
      })

      allUsageStatsMap.set(accountId, {
        total: errTotal ? {} : parseUsage(total),
        daily: errDaily ? {} : parseUsage(daily),
        monthly: errMonthly ? {} : parseUsage(monthly)
      })
    }

    // 处理额度信息、使用统计和绑定的 API Key 数量
    const accountsWithStats = accounts.map((account) => {
      const usageStats = allUsageStatsMap.get(account.id) || {
        daily: { requests: 0, tokens: 0, allTokens: 0 },
        total: { requests: 0, tokens: 0, allTokens: 0 },
        monthly: { requests: 0, tokens: 0, allTokens: 0 }
      }

      const groupInfos = allGroupInfosMap.get(account.id) || []
      const boundCount = bindingCountMap.get(account.id) || 0
      const dailyCost = dailyCostMap.get(account.id) || 0

      const formattedAccount = formatAccountExpiry(account)
      return {
        ...formattedAccount,
        groupInfos,
        boundApiKeysCount: boundCount,
        usage: {
          daily: { ...usageStats.daily, cost: dailyCost },
          total: usageStats.total,
          monthly: usageStats.monthly
        }
      }
    })

    res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('Failed to get OpenAI-Responses accounts:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// 创建 OpenAI-Responses 账户
router.post('/openai-responses-accounts', authenticateAdmin, async (req, res) => {
  try {
    const accountData = req.body

    // 验证分组类型
    if (
      accountData.accountType === 'group' &&
      !accountData.groupId &&
      (!accountData.groupIds || accountData.groupIds.length === 0)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Group ID is required for group type accounts'
      })
    }

    const account = await openaiResponsesAccountService.createAccount(accountData)

    // 如果是分组类型，处理分组绑定
    if (accountData.accountType === 'group') {
      if (accountData.groupIds && accountData.groupIds.length > 0) {
        // 多分组模式
        await accountGroupService.setAccountGroups(account.id, accountData.groupIds, 'openai')
        logger.info(
          `🏢 Added OpenAI-Responses account ${account.id} to groups: ${accountData.groupIds.join(', ')}`
        )
      } else if (accountData.groupId) {
        // 单分组模式（向后兼容）
        await accountGroupService.addAccountToGroup(account.id, accountData.groupId, 'openai')
        logger.info(
          `🏢 Added OpenAI-Responses account ${account.id} to group: ${accountData.groupId}`
        )
      }
    }

    const formattedAccount = formatAccountExpiry(account)
    res.json({ success: true, data: formattedAccount })
  } catch (error) {
    logger.error('Failed to create OpenAI-Responses account:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 更新 OpenAI-Responses 账户
router.put('/openai-responses-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    // 获取当前账户信息
    const currentAccount = await openaiResponsesAccountService.getAccount(id)
    if (!currentAccount) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      })
    }

    // ✅ 【新增】映射字段名：前端的 expiresAt -> 后端的 subscriptionExpiresAt
    const mappedUpdates = mapExpiryField(updates, 'OpenAI-Responses', id)

    // 验证priority的有效性（1-100）
    if (mappedUpdates.priority !== undefined) {
      const priority = parseInt(mappedUpdates.priority)
      if (isNaN(priority) || priority < 1 || priority > 100) {
        return res.status(400).json({
          success: false,
          message: 'Priority must be a number between 1 and 100'
        })
      }
      mappedUpdates.priority = priority.toString()
    }

    // 处理分组变更
    if (mappedUpdates.accountType !== undefined) {
      // 如果之前是分组类型，需要从所有分组中移除
      if (currentAccount.accountType === 'group') {
        const oldGroups = await accountGroupService.getAccountGroups(id)
        for (const oldGroup of oldGroups) {
          await accountGroupService.removeAccountFromGroup(id, oldGroup.id)
        }
        logger.info(`📤 Removed OpenAI-Responses account ${id} from all groups`)
      }

      // 如果新类型是分组，处理多分组支持
      if (mappedUpdates.accountType === 'group') {
        if (Object.prototype.hasOwnProperty.call(mappedUpdates, 'groupIds')) {
          if (mappedUpdates.groupIds && mappedUpdates.groupIds.length > 0) {
            // 设置新的多分组
            await accountGroupService.setAccountGroups(id, mappedUpdates.groupIds, 'openai')
            logger.info(
              `📥 Added OpenAI-Responses account ${id} to groups: ${mappedUpdates.groupIds.join(', ')}`
            )
          } else {
            // groupIds 为空数组，从所有分组中移除
            await accountGroupService.removeAccountFromAllGroups(id)
            logger.info(
              `📤 Removed OpenAI-Responses account ${id} from all groups (empty groupIds)`
            )
          }
        } else if (mappedUpdates.groupId) {
          // 向后兼容：仅当没有 groupIds 但有 groupId 时使用单分组逻辑
          await accountGroupService.addAccountToGroup(id, mappedUpdates.groupId, 'openai')
          logger.info(`📥 Added OpenAI-Responses account ${id} to group: ${mappedUpdates.groupId}`)
        }
      }
    }

    const result = await openaiResponsesAccountService.updateAccount(id, mappedUpdates)

    if (!result.success) {
      return res.status(400).json(result)
    }

    logger.success(`📝 Admin updated OpenAI-Responses account: ${id}`)
    res.json({ success: true, ...result })
  } catch (error) {
    logger.error('Failed to update OpenAI-Responses account:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 删除 OpenAI-Responses 账户
router.delete('/openai-responses-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const account = await openaiResponsesAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      })
    }

    // 自动解绑所有绑定的 API Keys
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(id, 'openai-responses')

    // 从所有分组中移除此账户
    if (account.accountType === 'group') {
      await accountGroupService.removeAccountFromAllGroups(id)
      logger.info(`Removed OpenAI-Responses account ${id} from all groups`)
    }

    const result = await openaiResponsesAccountService.deleteAccount(id)

    let message = 'OpenAI-Responses账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }

    logger.success(`🗑️ Admin deleted OpenAI-Responses account: ${id}, unbound ${unboundCount} keys`)

    res.json({
      success: true,
      ...result,
      message,
      unboundKeys: unboundCount
    })
  } catch (error) {
    logger.error('Failed to delete OpenAI-Responses account:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 切换 OpenAI-Responses 账户调度状态
router.put(
  '/openai-responses-accounts/:id/toggle-schedulable',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { id } = req.params

      const result = await openaiResponsesAccountService.toggleSchedulable(id)

      if (!result.success) {
        return res.status(400).json(result)
      }

      // 仅在停止调度时发送通知
      if (!result.schedulable) {
        await webhookNotifier.sendAccountEvent('account.status_changed', {
          accountId: id,
          platform: 'openai-responses',
          schedulable: result.schedulable,
          changedBy: 'admin',
          action: 'stopped_scheduling'
        })
      }

      res.json(result)
    } catch (error) {
      logger.error('Failed to toggle OpenAI-Responses account schedulable status:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }
)

// 切换 OpenAI-Responses 账户激活状态
router.put('/openai-responses-accounts/:id/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const account = await openaiResponsesAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      })
    }

    const newActiveStatus = account.isActive === 'true' ? 'false' : 'true'
    await openaiResponsesAccountService.updateAccount(id, {
      isActive: newActiveStatus
    })

    res.json({
      success: true,
      isActive: newActiveStatus === 'true'
    })
  } catch (error) {
    logger.error('Failed to toggle OpenAI-Responses account status:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 重置 OpenAI-Responses 账户限流状态
router.post(
  '/openai-responses-accounts/:id/reset-rate-limit',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { id } = req.params

      await openaiResponsesAccountService.updateAccount(id, {
        rateLimitedAt: '',
        rateLimitStatus: '',
        status: 'active',
        errorMessage: ''
      })

      logger.info(`🔄 Admin manually reset rate limit for OpenAI-Responses account ${id}`)

      res.json({
        success: true,
        message: 'Rate limit reset successfully'
      })
    } catch (error) {
      logger.error('Failed to reset OpenAI-Responses account rate limit:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }
)

// 重置 OpenAI-Responses 账户状态（清除所有异常状态）
router.post('/openai-responses-accounts/:id/reset-status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const result = await openaiResponsesAccountService.resetAccountStatus(id)

    logger.success(`Admin reset status for OpenAI-Responses account: ${id}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to reset OpenAI-Responses account status:', error)
    return res.status(500).json({ error: 'Failed to reset status', message: error.message })
  }
})

// 手动重置 OpenAI-Responses 账户的每日使用量
router.post('/openai-responses-accounts/:id/reset-usage', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    await openaiResponsesAccountService.updateAccount(id, {
      dailyUsage: '0',
      lastResetDate: redis.getDateStringInTimezone(),
      quotaStoppedAt: ''
    })

    logger.success(`Admin manually reset daily usage for OpenAI-Responses account ${id}`)

    res.json({
      success: true,
      message: 'Daily usage reset successfully'
    })
  } catch (error) {
    logger.error('Failed to reset OpenAI-Responses account usage:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 测试 OpenAI-Responses 账户连通性
router.post('/openai-responses-accounts/:accountId/test', authenticateAdmin, async (req, res) => {
  const { accountId } = req.params
  const { model = 'gpt-4o-mini' } = req.body
  const startTime = Date.now()

  try {
    // 获取账户信息（apiKey 已自动解密）
    const account = await openaiResponsesAccountService.getAccount(accountId)
    if (!account) {
      return res.status(404).json({ error: 'Account not found' })
    }

    if (!account.apiKey) {
      return res.status(401).json({ error: 'API Key not found or decryption failed' })
    }

    // 构造测试请求
    const baseUrl = account.baseApi || 'https://api.openai.com'
    const apiUrl = `${baseUrl}/responses`
    const payload = createOpenAITestPayload(model, { stream: false })

    const requestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${account.apiKey}`
      },
      timeout: 30000
    }

    // 配置代理
    if (account.proxy) {
      const agent = getProxyAgent(account.proxy)
      if (agent) {
        requestConfig.httpsAgent = agent
        requestConfig.httpAgent = agent
      }
    }

    const response = await axios.post(apiUrl, payload, requestConfig)
    const latency = Date.now() - startTime

    // 提取响应文本（Responses API 格式）
    let responseText = ''
    const output = response.data?.output
    if (Array.isArray(output)) {
      for (const item of output) {
        if (item.type === 'message' && Array.isArray(item.content)) {
          for (const block of item.content) {
            if (block.type === 'output_text' && block.text) {
              responseText += block.text
            }
          }
        }
      }
    }

    logger.success(
      `✅ OpenAI-Responses account test passed: ${account.name} (${accountId}), latency: ${latency}ms`
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
    logger.error(`❌ OpenAI-Responses account test failed: ${accountId}`, error.message)

    return res.status(500).json({
      success: false,
      error: 'Test failed',
      message: extractErrorMessage(error.response?.data, error.message),
      latency
    })
  }
})

module.exports = router
