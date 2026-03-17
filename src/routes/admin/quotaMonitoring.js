/**
 * 配额监控路由
 * 聚合 Claude 账户的 5h 窗口状态 + API Key 用量信息
 * 纯 Redis 读取，不触发额外上游 API 调用
 */
const express = require('express')
const router = express.Router()
const claudeAccountService = require('../../services/account/claudeAccountService')
const apiKeyService = require('../../services/apiKeyService')
const logger = require('../../utils/logger')
const { authenticateAdmin } = require('../../middleware/auth')

// GET /admin/quota-monitoring
router.get('/quota-monitoring', authenticateAdmin, async (req, res) => {
  try {
    // 并行获取账户和 API Key 数据
    const [accounts, apiKeys] = await Promise.all([
      claudeAccountService.getAllAccounts(),
      apiKeyService.getAllApiKeysFast()
    ])

    // 处理账户数据
    const processedAccounts = accounts.map((account) => {
      const usage = account.claudeUsage || null
      return {
        accountId: account.id,
        email: account.email || '',
        name: account.name || '',
        accountType: account.subscriptionInfo?.plan || account.accountType || 'unknown',
        sessionWindowStatus: account.sessionWindow?.hasActiveWindow
          ? (account.fiveHourAutoStopped ? 'rejected' : 'allowed')
          : 'allowed',
        sessionWindowStatusUpdatedAt: account.sessionWindow?.lastRequestTime || null,
        sessionWindowStart: account.sessionWindow?.windowStart || null,
        sessionWindowEnd: account.sessionWindow?.windowEnd || null,
        sessionWindowProgress: account.sessionWindow?.progress || 0,
        remainingTime: account.sessionWindow?.remainingTime || null,
        maxConcurrency: parseInt(account.maxConcurrency || 0),
        lastUsedAt: account.lastUsedAt || null,
        isActive: account.isActive,
        schedulable: account.schedulable,
        autoStopOnWarning: account.autoStopOnWarning,
        fiveHourAutoStopped: account.fiveHourAutoStopped || false,
        claudeUsage: usage,
        rateLimitStatus: account.rateLimitStatus,
        overloadStatus: account.overloadStatus
      }
    })

    // 统计池子概况
    const statusCounts = { allowed: 0, warning: 0, rejected: 0 }
    processedAccounts.forEach((a) => {
      if (a.fiveHourAutoStopped || a.rateLimitStatus?.isRateLimited) {
        statusCounts.rejected++
      } else if (a.overloadStatus?.isOverloaded || a.autoStopOnWarning) {
        statusCounts.warning++
      } else if (a.isActive) {
        statusCounts.allowed++
      }
    })

    // 处理 API Key 数据
    const processedApiKeys = apiKeys
      .filter((k) => k.isDeleted !== 'true')
      .map((key) => ({
        keyId: key.id,
        name: key.name || '',
        status: key.isActive ? 'active' : 'disabled',
        tokenLimit: key.tokenLimit || null,
        totalCostLimit: key.totalCostLimit || 0,
        dailyCostLimit: key.dailyCostLimit || 0,
        totalCost: key.totalCost || 0,
        dailyCost: key.dailyCost || 0,
        tokensUsed: key.usage?.total?.tokens || 0,
        lastUsedAt: key.lastUsedAt || null,
        createdAt: key.createdAt || null,
        tags: key.tags || []
      }))

    // 计算今日总 Token 和总费用
    let todayTotalTokens = 0
    let todayTotalCost = 0
    processedApiKeys.forEach((k) => {
      todayTotalCost += parseFloat(k.dailyCost) || 0
    })

    res.json({
      success: true,
      data: {
        accounts: processedAccounts,
        poolSummary: {
          totalAccounts: processedAccounts.length,
          activeAccounts: processedAccounts.filter((a) => a.isActive).length,
          statusCounts,
          todayTotalTokens,
          todayTotalCost: Math.round(todayTotalCost * 10000) / 10000
        },
        apiKeys: processedApiKeys,
        apiKeySummary: {
          total: processedApiKeys.length,
          active: processedApiKeys.filter((k) => k.status === 'active').length,
          disabled: processedApiKeys.filter((k) => k.status !== 'active').length
        }
      }
    })
  } catch (error) {
    logger.error('❌ Failed to get quota monitoring data:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

module.exports = router
