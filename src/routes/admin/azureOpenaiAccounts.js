const express = require('express')
const azureOpenaiAccountService = require('../../services/account/azureOpenaiAccountService')
const accountGroupService = require('../../services/accountGroupService')
const apiKeyService = require('../../services/apiKeyService')
const redis = require('../../models/redis')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const webhookNotifier = require('../../utils/webhookNotifier')
const axios = require('axios')
const { formatAccountExpiry, mapExpiryField } = require('./utils')
const { stripReadonlyAccountFields } = require('../../utils/commonHelper')

const router = express.Router()

// 获取所有 Azure OpenAI 账户
router.get('/azure-openai-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await azureOpenaiAccountService.getAllAccounts()

    // 根据查询参数进行筛选
    if (platform && platform !== 'all' && platform !== 'azure_openai') {
      // 如果指定了其他平台,返回空数组
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

    // 为每个账户添加使用统计信息和分组信息
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
        } catch (error) {
          logger.debug(`Failed to get usage stats for Azure OpenAI account ${account.id}:`, error)
          try {
            const groupInfos = await accountGroupService.getAccountGroups(account.id)
            const formattedAccount = formatAccountExpiry(account)
            return {
              ...formattedAccount,
              groupInfos,
              usage: {
                daily: { requests: 0, tokens: 0, allTokens: 0 },
                total: { requests: 0, tokens: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          } catch (groupError) {
            logger.debug(`Failed to get group info for account ${account.id}:`, groupError)
            return {
              ...account,
              groupInfos: [],
              usage: {
                daily: { requests: 0, tokens: 0, allTokens: 0 },
                total: { requests: 0, tokens: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          }
        }
      })
    )

    res.json({
      success: true,
      data: accountsWithStats
    })
  } catch (error) {
    logger.error('Failed to fetch Azure OpenAI accounts:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch accounts',
      error: error.message
    })
  }
})

// 创建 Azure OpenAI 账户
router.post('/azure-openai-accounts', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      accountType,
      azureEndpoint,
      apiVersion,
      deploymentName,
      apiKey,
      supportedModels,
      proxy,
      groupId,
      groupIds,
      priority,
      isActive,
      schedulable
    } = req.body

    // 验证必填字段
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Account name is required'
      })
    }

    if (!azureEndpoint) {
      return res.status(400).json({
        success: false,
        message: 'Azure endpoint is required'
      })
    }

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: 'API key is required'
      })
    }

    if (!deploymentName) {
      return res.status(400).json({
        success: false,
        message: 'Deployment name is required'
      })
    }

    // 验证 Azure endpoint 格式
    if (!azureEndpoint.match(/^https:\/\/[\w-]+\.openai\.azure\.com$/)) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid Azure OpenAI endpoint format. Expected: https://your-resource.openai.azure.com'
      })
    }

    // 测试连接
    try {
      const testUrl = `${azureEndpoint}/openai/deployments/${deploymentName}?api-version=${
        apiVersion || '2024-02-01'
      }`
      await axios.get(testUrl, {
        headers: {
          'api-key': apiKey
        },
        timeout: 5000
      })
    } catch (testError) {
      if (testError.response?.status === 404) {
        logger.warn('Azure OpenAI deployment not found, but continuing with account creation')
      } else if (testError.response?.status === 401) {
        return res.status(400).json({
          success: false,
          message: 'Invalid API key or unauthorized access'
        })
      }
    }

    const account = await azureOpenaiAccountService.createAccount({
      name,
      description,
      accountType: accountType || 'shared',
      azureEndpoint,
      apiVersion: apiVersion || '2024-02-01',
      deploymentName,
      apiKey,
      supportedModels,
      proxy,
      groupId,
      priority: priority || 50,
      isActive: isActive !== false,
      schedulable: schedulable !== false
    })

    // 如果是分组类型,将账户添加到分组
    if (accountType === 'group') {
      if (groupIds && groupIds.length > 0) {
        // 使用多分组设置
        await accountGroupService.setAccountGroups(account.id, groupIds, 'azure_openai')
      } else if (groupId) {
        // 兼容单分组模式
        await accountGroupService.addAccountToGroup(account.id, groupId, 'azure_openai')
      }
    }

    res.json({
      success: true,
      data: account,
      message: 'Azure OpenAI account created successfully'
    })
  } catch (error) {
    logger.error('Failed to create Azure OpenAI account:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to create account',
      error: error.message
    })
  }
})

// 更新 Azure OpenAI 账户
router.put('/azure-openai-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    // ✅ 【新增】映射字段名:前端的 expiresAt -> 后端的 subscriptionExpiresAt
    // review#3：剥离外部传入的状态类字段，禁止伪造自动停用证据
    const mappedUpdates = stripReadonlyAccountFields(mapExpiryField(updates, 'Azure OpenAI', id))

    const account = await azureOpenaiAccountService.updateAccount(id, mappedUpdates)

    res.json({
      success: true,
      data: account,
      message: 'Azure OpenAI account updated successfully'
    })
  } catch (error) {
    logger.error('Failed to update Azure OpenAI account:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update account',
      error: error.message
    })
  }
})

// 删除 Azure OpenAI 账户
router.delete('/azure-openai-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // 自动解绑所有绑定的 API Keys
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(id, 'azure_openai')

    await azureOpenaiAccountService.deleteAccount(id)

    let message = 'Azure OpenAI账号已成功删除'
    if (unboundCount > 0) {
      message += `,${unboundCount} 个 API Key 已切换为共享池模式`
    }

    logger.success(`🗑️ Admin deleted Azure OpenAI account: ${id}, unbound ${unboundCount} keys`)

    res.json({
      success: true,
      message,
      unboundKeys: unboundCount
    })
  } catch (error) {
    logger.error('Failed to delete Azure OpenAI account:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to delete account',
      error: error.message
    })
  }
})

// 切换 Azure OpenAI 账户状态
router.put('/azure-openai-accounts/:id/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const account = await azureOpenaiAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      })
    }

    const newStatus = account.isActive === 'true' ? 'false' : 'true'
    await azureOpenaiAccountService.updateAccount(id, { isActive: newStatus })

    res.json({
      success: true,
      message: `Account ${newStatus === 'true' ? 'activated' : 'deactivated'} successfully`,
      isActive: newStatus === 'true'
    })
  } catch (error) {
    logger.error('Failed to toggle Azure OpenAI account status:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to toggle account status',
      error: error.message
    })
  }
})

// 切换 Azure OpenAI 账户调度状态
router.put(
  '/azure-openai-accounts/:accountId/toggle-schedulable',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountId } = req.params

      const result = await azureOpenaiAccountService.toggleSchedulable(accountId)

      // 如果账号被禁用,发送webhook通知
      if (!result.schedulable) {
        // 获取账号信息
        const account = await azureOpenaiAccountService.getAccount(accountId)
        if (account) {
          await webhookNotifier.sendAccountAnomalyNotification({
            accountId: account.id,
            accountName: account.name || 'Azure OpenAI Account',
            platform: 'azure-openai',
            status: 'disabled',
            errorCode: 'AZURE_OPENAI_MANUALLY_DISABLED',
            reason: '账号已被管理员手动禁用调度',
            timestamp: new Date().toISOString()
          })
        }
      }

      return res.json({
        success: true,
        schedulable: result.schedulable,
        message: result.schedulable ? '已启用调度' : '已禁用调度'
      })
    } catch (error) {
      logger.error('切换 Azure OpenAI 账户调度状态失败:', error)
      return res.status(500).json({
        success: false,
        message: '切换调度状态失败',
        error: error.message
      })
    }
  }
)

// 健康检查单个 Azure OpenAI 账户
router.post('/azure-openai-accounts/:id/health-check', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const healthResult = await azureOpenaiAccountService.healthCheckAccount(id)

    res.json({
      success: true,
      data: healthResult
    })
  } catch (error) {
    logger.error('Failed to perform health check:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to perform health check',
      error: error.message
    })
  }
})

// 批量健康检查所有 Azure OpenAI 账户
router.post('/azure-openai-accounts/health-check-all', authenticateAdmin, async (req, res) => {
  try {
    const healthResults = await azureOpenaiAccountService.performHealthChecks()

    res.json({
      success: true,
      data: healthResults
    })
  } catch (error) {
    logger.error('Failed to perform batch health check:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to perform batch health check',
      error: error.message
    })
  }
})

// 迁移 API Keys 以支持 Azure OpenAI
router.post('/migrate-api-keys-azure', authenticateAdmin, async (req, res) => {
  try {
    const migratedCount = await azureOpenaiAccountService.migrateApiKeysForAzureSupport()

    res.json({
      success: true,
      message: `Successfully migrated ${migratedCount} API keys for Azure OpenAI support`
    })
  } catch (error) {
    logger.error('Failed to migrate API keys:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to migrate API keys',
      error: error.message
    })
  }
})

// 测试 Azure OpenAI 账户连通性
router.post('/azure-openai-accounts/:accountId/test', authenticateAdmin, async (req, res) => {
  const { accountId } = req.params
  const startTime = Date.now()
  const {
    createChatCompletionsTestPayload,
    extractErrorMessage
  } = require('../../utils/testPayloadHelper')

  try {
    // 获取账户信息
    const account = await azureOpenaiAccountService.getAccount(accountId)
    if (!account) {
      return res.status(404).json({ error: 'Account not found' })
    }

    // 获取解密后的 API Key
    const apiKey = await azureOpenaiAccountService.getDecryptedApiKey(accountId)
    if (!apiKey) {
      return res.status(401).json({ error: 'API Key not found or decryption failed' })
    }

    // 构造测试请求
    const { getProxyAgent } = require('../../utils/proxyHelper')

    const deploymentName = account.deploymentName || 'gpt-4o-mini'
    const apiVersion = account.apiVersion || '2024-02-15-preview'
    const apiUrl = `${account.endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`
    const payload = createChatCompletionsTestPayload(deploymentName)

    const requestConfig = {
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
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

    // 提取响应文本
    let responseText = ''
    if (response.data?.choices?.[0]?.message?.content) {
      responseText = response.data.choices[0].message.content
    }

    logger.success(
      `✅ Azure OpenAI account test passed: ${account.name} (${accountId}), latency: ${latency}ms`
    )

    return res.json({
      success: true,
      data: {
        accountId,
        accountName: account.name,
        model: deploymentName,
        latency,
        responseText: responseText.substring(0, 200)
      }
    })
  } catch (error) {
    const latency = Date.now() - startTime
    logger.error(`❌ Azure OpenAI account test failed: ${accountId}`, error.message)

    return res.status(500).json({
      success: false,
      error: 'Test failed',
      message: extractErrorMessage(error.response?.data, error.message),
      latency
    })
  }
})

// 重置 Azure OpenAI 账户状态
router.post('/:accountId/reset-status', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const result = await azureOpenaiAccountService.resetAccountStatus(accountId)
    logger.success(`Admin reset status for Azure OpenAI account: ${accountId}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to reset Azure OpenAI account status:', error)
    return res.status(500).json({ error: 'Failed to reset status', message: error.message })
  }
})

module.exports = router
