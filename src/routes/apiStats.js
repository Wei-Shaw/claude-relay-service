const express = require('express')
const redis = require('../models/redis')
const logger = require('../utils/logger')
const apiKeyService = require('../services/apiKeyService')
const CostCalculator = require('../utils/costCalculator')
const claudeAccountService = require('../services/claudeAccountService')
const openaiAccountService = require('../services/openaiAccountService')
const { createClaudeTestPayload } = require('../utils/testPayloadHelper')

const router = express.Router()

// 🏠 重定向页面请求到新版 admin-spa
router.get('/', (req, res) => {
  res.redirect(301, '/admin-next/api-stats')
})

// 🔑 获取 API Key 对应的 ID
router.post('/api/get-key-id', async (req, res) => {
  try {
    const { apiKey } = req.body

    if (!apiKey) {
      return res.status(400).json({
        error: 'API Key is required',
        message: 'Please provide your API Key'
      })
    }

    // 基本API Key格式验证
    if (typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 512) {
      return res.status(400).json({
        error: 'Invalid API key format',
        message: 'API key format is invalid'
      })
    }

    // 验证API Key（使用不触发激活的验证方法）
    const validation = await apiKeyService.validateApiKeyForStats(apiKey)

    if (!validation.valid) {
      const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'
      logger.security(`🔒 Invalid API key in get-key-id: ${validation.error} from ${clientIP}`)
      return res.status(401).json({
        error: 'Invalid API key',
        message: validation.error
      })
    }

    const { keyData } = validation

    return res.json({
      success: true,
      data: {
        id: keyData.id
      }
    })
  } catch (error) {
    logger.error('❌ Failed to get API key ID:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve API key ID'
    })
  }
})

const parseJsonArraySafe = (value) => {
  if (!value) {
    return []
  }
  if (Array.isArray(value)) {
    return value.filter(Boolean)
  }
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
  } catch (error) {
    return []
  }
}

const normalizeKeyPermissionsForCompare = (keyData) => {
  const restrictedModels = parseJsonArraySafe(keyData?.restrictedModels).map(String).sort()
  const allowedClients = parseJsonArraySafe(keyData?.allowedClients).map(String).sort()

  return {
    permissions: String(keyData?.permissions || 'all'),
    tokenLimit: Number.parseInt(keyData?.tokenLimit || '0', 10) || 0,
    concurrencyLimit: Number.parseInt(keyData?.concurrencyLimit || '0', 10) || 0,
    rateLimitWindow: Number.parseInt(keyData?.rateLimitWindow || '0', 10) || 0,
    rateLimitRequests: Number.parseInt(keyData?.rateLimitRequests || '0', 10) || 0,
    rateLimitCost: Number.parseFloat(keyData?.rateLimitCost || '0') || 0,
    dailyCostLimit: Number.parseFloat(keyData?.dailyCostLimit || '0') || 0,
    totalCostLimit: Number.parseFloat(keyData?.totalCostLimit || '0') || 0,
    weeklyOpusCostLimit: Number.parseFloat(keyData?.weeklyOpusCostLimit || '0') || 0,
    enableModelRestriction:
      keyData?.enableModelRestriction === true || keyData?.enableModelRestriction === 'true',
    restrictedModels,
    enableClientRestriction:
      keyData?.enableClientRestriction === true || keyData?.enableClientRestriction === 'true',
    allowedClients,
    claudeAccountId: String(keyData?.claudeAccountId || ''),
    claudeConsoleAccountId: String(keyData?.claudeConsoleAccountId || ''),
    geminiAccountId: String(keyData?.geminiAccountId || ''),
    openaiAccountId: String(keyData?.openaiAccountId || ''),
    azureOpenaiAccountId: String(keyData?.azureOpenaiAccountId || ''),
    bedrockAccountId: String(keyData?.bedrockAccountId || ''),
    droidAccountId: String(keyData?.droidAccountId || ''),
    ccrAccountId: String(keyData?.ccrAccountId || '')
  }
}

const diffPermissionFields = (a, b) => {
  const mismatch = []
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})])
  for (const key of keys) {
    const av = a?.[key]
    const bv = b?.[key]
    if (Array.isArray(av) || Array.isArray(bv)) {
      const aArr = Array.isArray(av) ? av : []
      const bArr = Array.isArray(bv) ? bv : []
      if (aArr.length !== bArr.length || aArr.join('|') !== bArr.join('|')) {
        mismatch.push(key)
      }
      continue
    }
    if (av !== bv) {
      mismatch.push(key)
    }
  }
  return mismatch
}

const ACTIVATION_HOUR_MS = 60 * 60 * 1000
const ACTIVATION_DAY_MS = 24 * ACTIVATION_HOUR_MS

const normalizeActivationUnit = (unit) => (unit === 'hours' ? 'hours' : 'days')

const parsePositiveIntOrZero = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }
  return parsed
}

const activationPeriodToMs = (period, unit) => {
  const safePeriod = parsePositiveIntOrZero(period)
  if (!safePeriod) {
    return 0
  }
  return safePeriod * (unit === 'hours' ? ACTIVATION_HOUR_MS : ACTIVATION_DAY_MS)
}

const activationMsToBestPeriod = (ms) => {
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0
  if (!safeMs) {
    return { value: 0, unit: 'days' }
  }
  if (safeMs % ACTIVATION_DAY_MS === 0) {
    return { value: safeMs / ACTIVATION_DAY_MS, unit: 'days' }
  }
  return { value: safeMs / ACTIVATION_HOUR_MS, unit: 'hours' }
}

// 🔑 使用“同权限未激活 Key”续费（用户自助）
router.post('/api/merge-renewal', async (req, res) => {
  try {
    const { apiKey, renewKey } = req.body || {}
    const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'

    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 512) {
      return res.status(400).json({
        error: 'Invalid API key format',
        message: 'API key format is invalid'
      })
    }

    if (
      !renewKey ||
      typeof renewKey !== 'string' ||
      renewKey.length < 10 ||
      renewKey.length > 512
    ) {
      return res.status(400).json({
        error: 'Invalid renew key format',
        message: 'Renew key format is invalid'
      })
    }

    const trimmedApiKey = apiKey.trim()
    const trimmedRenewKey = renewKey.trim()

    if (!trimmedApiKey || !trimmedRenewKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing keys',
        message: 'API Key 和续费 Key 都不能为空'
      })
    }

    if (trimmedApiKey === trimmedRenewKey) {
      return res.status(400).json({
        success: false,
        error: 'Invalid keys',
        message: '续费 Key 不能与当前 Key 相同'
      })
    }

    const targetKeyData = await apiKeyService.getApiKeyByRawKey(trimmedApiKey)
    if (!targetKeyData || Object.keys(targetKeyData).length === 0) {
      logger.security(`🔒 Merge renewal: target key not found from ${clientIP}`)
      return res.status(404).json({
        success: false,
        error: 'API key not found',
        message: '当前 API Key 不存在'
      })
    }

    if (targetKeyData.isDeleted === 'true') {
      return res.status(403).json({
        success: false,
        error: 'API key is deleted',
        message: '当前 API Key 已删除'
      })
    }

    if (targetKeyData.isActive !== 'true') {
      const keyName = targetKeyData.name || 'Unknown'
      return res.status(403).json({
        success: false,
        error: 'API key is disabled',
        message: `API Key "${keyName}" 已被禁用`,
        keyName
      })
    }

    const targetExpiresAtMs = Date.parse(targetKeyData.expiresAt || '')
    const targetExpirationMode = targetKeyData.expirationMode || 'fixed'
    const targetIsActivated =
      targetKeyData.isActivated === 'true' || targetKeyData.isActivated === true
    const targetAllowActivationMerge =
      targetExpirationMode === 'activation' &&
      !targetIsActivated &&
      !Number.isFinite(targetExpiresAtMs)

    if (!Number.isFinite(targetExpiresAtMs) && !targetAllowActivationMerge) {
      return res.status(400).json({
        success: false,
        error: 'API key has no expiry',
        message: '当前 API Key 没有设置过期时间，无法续费'
      })
    }

    const renewKeyData = await apiKeyService.getApiKeyByRawKey(trimmedRenewKey)
    if (!renewKeyData || Object.keys(renewKeyData).length === 0) {
      logger.security(`🔒 Merge renewal: renew key not found from ${clientIP}`)
      return res.status(404).json({
        success: false,
        error: 'Renew key not found',
        message: '续费 Key 不存在'
      })
    }

    if (renewKeyData.id === targetKeyData.id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid keys',
        message: '续费 Key 不能与当前 Key 相同'
      })
    }

    if (renewKeyData.isDeleted === 'true') {
      return res.status(403).json({
        success: false,
        error: 'Renew key is deleted',
        message: '续费 Key 已删除'
      })
    }

    if (renewKeyData.isActive !== 'true') {
      return res.status(403).json({
        success: false,
        error: 'Renew key is disabled',
        message: '续费 Key 已被禁用'
      })
    }

    if ((renewKeyData.expirationMode || 'fixed') !== 'activation') {
      return res.status(400).json({
        success: false,
        error: 'Renew key is not activation mode',
        message: '续费 Key 不是“未激活”类型（需要使用激活模式创建）'
      })
    }

    if (renewKeyData.isActivated === 'true') {
      return res.status(400).json({
        success: false,
        error: 'Renew key already activated',
        message: '续费 Key 已激活/已使用，无法用于续费'
      })
    }

    const targetPerm = normalizeKeyPermissionsForCompare(targetKeyData)
    const renewPerm = normalizeKeyPermissionsForCompare(renewKeyData)
    const mismatchFields = diffPermissionFields(targetPerm, renewPerm)
    if (mismatchFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Permission mismatch',
        message: '续费 Key 的权限与当前 Key 不一致，无法合并',
        data: {
          mismatchFields
        }
      })
    }

    const activationPeriod = Number.parseInt(renewKeyData.activationDays || '30', 10)
    const activationUnit = renewKeyData.activationUnit === 'hours' ? 'hours' : 'days'

    if (!Number.isFinite(activationPeriod) || activationPeriod <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid activation period',
        message: '续费 Key 的激活时长配置异常，请联系管理员'
      })
    }

    const extendMs =
      activationUnit === 'hours'
        ? activationPeriod * ACTIVATION_HOUR_MS
        : activationPeriod * ACTIVATION_DAY_MS

    const client = redis.getClientSafe()
    const targetKey = `apikey:${targetKeyData.id}`
    const renewKeyHash = `apikey:${renewKeyData.id}`
    const now = new Date()
    const nowIso = now.toISOString()

    let lastError = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await client.watch(targetKey, renewKeyHash)
        const [freshTarget, freshRenew] = await Promise.all([
          client.hgetall(targetKey),
          client.hgetall(renewKeyHash)
        ])

        if (!freshTarget || Object.keys(freshTarget).length === 0) {
          await client.unwatch()
          return res.status(404).json({
            success: false,
            error: 'API key not found',
            message: '当前 API Key 不存在'
          })
        }

        if (!freshRenew || Object.keys(freshRenew).length === 0) {
          await client.unwatch()
          return res.status(404).json({
            success: false,
            error: 'Renew key not found',
            message: '续费 Key 不存在'
          })
        }

        if (freshRenew.isDeleted === 'true' || freshRenew.isActive !== 'true') {
          await client.unwatch()
          return res.status(400).json({
            success: false,
            error: 'Renew key already consumed',
            message: '续费 Key 已被使用或已失效'
          })
        }

        if (
          (freshRenew.expirationMode || 'fixed') !== 'activation' ||
          freshRenew.isActivated === 'true'
        ) {
          await client.unwatch()
          return res.status(400).json({
            success: false,
            error: 'Renew key already activated',
            message: '续费 Key 已激活/已使用，无法用于续费'
          })
        }

        const freshTargetExpiresAtMs = Date.parse(freshTarget.expiresAt || '')
        const freshTargetExpirationMode = freshTarget.expirationMode || 'fixed'
        const freshTargetIsActivated =
          freshTarget.isActivated === 'true' || freshTarget.isActivated === true

        const shouldMergeActivationPeriod =
          !Number.isFinite(freshTargetExpiresAtMs) &&
          freshTargetExpirationMode === 'activation' &&
          !freshTargetIsActivated

        let newExpiresAt = ''
        let newActivationValue = 0
        let newActivationUnit = 'days'

        if (Number.isFinite(freshTargetExpiresAtMs)) {
          const baseMs = Math.max(Date.now(), freshTargetExpiresAtMs)
          newExpiresAt = new Date(baseMs + extendMs).toISOString()
        } else if (shouldMergeActivationPeriod) {
          const currentUnit = normalizeActivationUnit(freshTarget.activationUnit)
          const currentMs = activationPeriodToMs(freshTarget.activationDays, currentUnit)
          const mergedMs = currentMs + extendMs
          const mergedPeriod = activationMsToBestPeriod(mergedMs)
          newActivationValue = mergedPeriod.value
          newActivationUnit = mergedPeriod.unit
        } else {
          await client.unwatch()
          return res.status(400).json({
            success: false,
            error: 'API key has no expiry',
            message: '当前 API Key 没有设置过期时间，无法续费'
          })
        }

        const tx = client.multi()
        if (newExpiresAt) {
          tx.hset(targetKey, { expiresAt: newExpiresAt, updatedAt: nowIso })
        } else {
          tx.hset(targetKey, {
            activationDays: String(newActivationValue),
            activationUnit: newActivationUnit,
            updatedAt: nowIso
          })
        }
        tx.expire(targetKey, 86400 * 365)
        tx.hset(renewKeyHash, {
          isDeleted: 'true',
          deletedAt: nowIso,
          deletedBy: `merge-renewal:${targetKeyData.id}`,
          deletedByType: 'system',
          isActive: 'false',
          mergedToKeyId: targetKeyData.id,
          mergedAt: nowIso
        })
        tx.expire(renewKeyHash, 86400 * 365)

        if (freshRenew.apiKey) {
          tx.hdel('apikey:hash_map', freshRenew.apiKey)
        }

        const execResult = await tx.exec()
        if (!execResult) {
          lastError = new Error('Redis transaction aborted')
          continue
        }

        // best effort: 从费用索引中移除（不影响主流程）
        try {
          const costRankService = require('../services/costRankService')
          await costRankService.removeKeyFromIndexes(renewKeyData.id)
        } catch (error) {
          logger.warn(
            `Failed to remove renew key ${renewKeyData.id} from cost rank indexes:`,
            error
          )
        }

        logger.success(
          newExpiresAt
            ? `🔁 Merge renewal success: target=${targetKeyData.id}, renew=${renewKeyData.id}, extend=${activationPeriod} ${activationUnit}, newExpiresAt=${newExpiresAt}, ip=${clientIP}`
            : `🔁 Merge renewal success: target=${targetKeyData.id}, renew=${renewKeyData.id}, extend=${activationPeriod} ${activationUnit}, newActivation=${newActivationValue} ${newActivationUnit}, ip=${clientIP}`
        )

        return res.json({
          success: true,
          data: {
            ...(newExpiresAt ? { expiresAt: newExpiresAt } : {}),
            ...(newExpiresAt
              ? {}
              : {
                  activationValue: newActivationValue,
                  activationUnit: newActivationUnit
                }),
            extendValue: activationPeriod,
            extendUnit: activationUnit,
            renewKeyId: renewKeyData.id
          }
        })
      } catch (error) {
        lastError = error
      } finally {
        try {
          await client.unwatch()
        } catch (unwatchError) {
          // ignore
        }
      }
    }

    logger.error('❌ Merge renewal failed:', lastError)
    return res.status(500).json({
      success: false,
      error: 'Failed to merge renewal',
      message: '续费失败，请稍后重试'
    })
  } catch (error) {
    logger.error('❌ Failed to merge renewal:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to merge renewal',
      message: '续费失败，请稍后重试'
    })
  }
})

// 📊 用户API Key统计查询接口 - 安全的自查询接口
router.post('/api/user-stats', async (req, res) => {
  try {
    const { apiKey, apiId } = req.body

    let keyData
    let keyId

    if (apiId) {
      // 通过 apiId 查询
      if (
        typeof apiId !== 'string' ||
        !apiId.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
      ) {
        return res.status(400).json({
          error: 'Invalid API ID format',
          message: 'API ID must be a valid UUID'
        })
      }

      // 直接通过 ID 获取 API Key 数据
      keyData = await redis.getApiKey(apiId)

      if (!keyData || Object.keys(keyData).length === 0) {
        logger.security(`🔒 API key not found for ID: ${apiId} from ${req.ip || 'unknown'}`)
        return res.status(404).json({
          error: 'API key not found',
          message: 'The specified API key does not exist'
        })
      }

      // 检查是否激活
      if (keyData.isActive !== 'true') {
        const keyName = keyData.name || 'Unknown'
        return res.status(403).json({
          error: 'API key is disabled',
          message: `API Key "${keyName}" 已被禁用`,
          keyName
        })
      }

      keyId = apiId

      // 获取使用统计
      const usage = await redis.getUsageStats(keyId)

      // 获取当日费用统计
      const dailyCost = await redis.getDailyCost(keyId)
      const costStats = await redis.getCostStats(keyId)

      // 处理数据格式，与 validateApiKey 返回的格式保持一致
      // 解析限制模型数据
      let restrictedModels = []
      try {
        restrictedModels = keyData.restrictedModels ? JSON.parse(keyData.restrictedModels) : []
      } catch (e) {
        restrictedModels = []
      }

      // 解析允许的客户端数据
      let allowedClients = []
      try {
        allowedClients = keyData.allowedClients ? JSON.parse(keyData.allowedClients) : []
      } catch (e) {
        allowedClients = []
      }

      // 格式化 keyData
      keyData = {
        ...keyData,
        tokenLimit: parseInt(keyData.tokenLimit) || 0,
        concurrencyLimit: parseInt(keyData.concurrencyLimit) || 0,
        rateLimitWindow: parseInt(keyData.rateLimitWindow) || 0,
        rateLimitRequests: parseInt(keyData.rateLimitRequests) || 0,
        dailyCostLimit: parseFloat(keyData.dailyCostLimit) || 0,
        totalCostLimit: parseFloat(keyData.totalCostLimit) || 0,
        dailyCost: dailyCost || 0,
        totalCost: costStats.total || 0,
        enableModelRestriction: keyData.enableModelRestriction === 'true',
        restrictedModels,
        enableClientRestriction: keyData.enableClientRestriction === 'true',
        allowedClients,
        permissions: keyData.permissions || 'all',
        // 添加激活相关字段
        expirationMode: keyData.expirationMode || 'fixed',
        isActivated: keyData.isActivated === 'true',
        activationDays: parseInt(keyData.activationDays || 0),
        activatedAt: keyData.activatedAt || null,
        usage // 使用完整的 usage 数据，而不是只有 total
      }
    } else if (apiKey) {
      // 通过 apiKey 查询（保持向后兼容）
      if (typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 512) {
        logger.security(`🔒 Invalid API key format in user stats query from ${req.ip || 'unknown'}`)
        return res.status(400).json({
          error: 'Invalid API key format',
          message: 'API key format is invalid'
        })
      }

      // 验证API Key（使用不触发激活的验证方法）
      const validation = await apiKeyService.validateApiKeyForStats(apiKey)

      if (!validation.valid) {
        const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'
        logger.security(
          `🔒 Invalid API key in user stats query: ${validation.error} from ${clientIP}`
        )
        return res.status(401).json({
          error: 'Invalid API key',
          message: validation.error
        })
      }

      const { keyData: validatedKeyData } = validation
      keyData = validatedKeyData
      keyId = keyData.id
    } else {
      logger.security(`🔒 Missing API key or ID in user stats query from ${req.ip || 'unknown'}`)
      return res.status(400).json({
        error: 'API Key or ID is required',
        message: 'Please provide your API Key or API ID'
      })
    }

    // 记录合法查询
    logger.api(
      `📊 User stats query from key: ${keyData.name} (${keyId}) from ${req.ip || 'unknown'}`
    )

    // 获取验证结果中的完整keyData（包含isActive状态和cost信息）
    const fullKeyData = keyData

    // 计算总费用 - 使用与模型统计相同的逻辑（按模型分别计算）
    let totalCost = 0
    let formattedCost = '$0.000000'

    try {
      const client = redis.getClientSafe()

      // 获取所有月度模型统计（与model-stats接口相同的逻辑）
      const allModelKeys = await redis.scanKeys(`usage:${keyId}:model:monthly:*:*`)
      const modelUsageMap = new Map()

      for (const key of allModelKeys) {
        const modelMatch = key.match(/usage:.+:model:monthly:(.+):(\d{4}-\d{2})$/)
        if (!modelMatch) {
          continue
        }

        const model = modelMatch[1]
        const data = await client.hgetall(key)

        if (data && Object.keys(data).length > 0) {
          if (!modelUsageMap.has(model)) {
            modelUsageMap.set(model, {
              inputTokens: 0,
              outputTokens: 0,
              cacheCreateTokens: 0,
              cacheReadTokens: 0
            })
          }

          const modelUsage = modelUsageMap.get(model)
          modelUsage.inputTokens += parseInt(data.inputTokens) || 0
          modelUsage.outputTokens += parseInt(data.outputTokens) || 0
          modelUsage.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
          modelUsage.cacheReadTokens += parseInt(data.cacheReadTokens) || 0
        }
      }

      // 按模型计算费用并汇总
      for (const [model, usage] of modelUsageMap) {
        const usageData = {
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cache_creation_input_tokens: usage.cacheCreateTokens,
          cache_read_input_tokens: usage.cacheReadTokens
        }

        const costResult = CostCalculator.calculateCost(usageData, model)
        totalCost += costResult.costs.total
      }

      // 如果没有模型级别的详细数据，回退到总体数据计算
      if (modelUsageMap.size === 0 && fullKeyData.usage?.total?.allTokens > 0) {
        const usage = fullKeyData.usage.total
        const costUsage = {
          input_tokens: usage.inputTokens || 0,
          output_tokens: usage.outputTokens || 0,
          cache_creation_input_tokens: usage.cacheCreateTokens || 0,
          cache_read_input_tokens: usage.cacheReadTokens || 0
        }

        const costResult = CostCalculator.calculateCost(costUsage, 'claude-3-5-sonnet-20241022')
        totalCost = costResult.costs.total
      }

      formattedCost = CostCalculator.formatCost(totalCost)
    } catch (error) {
      logger.warn(`Failed to calculate detailed cost for key ${keyId}:`, error)
      // 回退到简单计算
      if (fullKeyData.usage?.total?.allTokens > 0) {
        const usage = fullKeyData.usage.total
        const costUsage = {
          input_tokens: usage.inputTokens || 0,
          output_tokens: usage.outputTokens || 0,
          cache_creation_input_tokens: usage.cacheCreateTokens || 0,
          cache_read_input_tokens: usage.cacheReadTokens || 0
        }

        const costResult = CostCalculator.calculateCost(costUsage, 'claude-3-5-sonnet-20241022')
        totalCost = costResult.costs.total
        formattedCost = costResult.formatted.total
      }
    }

    // 获取当前使用量
    let currentWindowRequests = 0
    let currentWindowTokens = 0
    let currentWindowCost = 0 // 新增：当前窗口费用
    let currentDailyCost = 0
    let windowStartTime = null
    let windowEndTime = null
    let windowRemainingSeconds = null

    try {
      // 获取当前时间窗口的请求次数、Token使用量和费用
      if (fullKeyData.rateLimitWindow > 0) {
        const client = redis.getClientSafe()
        const requestCountKey = `rate_limit:requests:${keyId}`
        const tokenCountKey = `rate_limit:tokens:${keyId}`
        const costCountKey = `rate_limit:cost:${keyId}` // 新增：费用计数key
        const windowStartKey = `rate_limit:window_start:${keyId}`

        currentWindowRequests = parseInt((await client.get(requestCountKey)) || '0')
        currentWindowTokens = parseInt((await client.get(tokenCountKey)) || '0')
        currentWindowCost = parseFloat((await client.get(costCountKey)) || '0') // 新增：获取当前窗口费用

        // 获取窗口开始时间和计算剩余时间
        const windowStart = await client.get(windowStartKey)
        if (windowStart) {
          const now = Date.now()
          windowStartTime = parseInt(windowStart)
          const windowDuration = fullKeyData.rateLimitWindow * 60 * 1000 // 转换为毫秒
          windowEndTime = windowStartTime + windowDuration

          // 如果窗口还有效
          if (now < windowEndTime) {
            windowRemainingSeconds = Math.max(0, Math.floor((windowEndTime - now) / 1000))
          } else {
            // 窗口已过期，下次请求会重置
            windowStartTime = null
            windowEndTime = null
            windowRemainingSeconds = 0
            // 重置计数为0，因为窗口已过期
            currentWindowRequests = 0
            currentWindowTokens = 0
            currentWindowCost = 0 // 新增：重置窗口费用
          }
        }
      }

      // 获取当日费用
      currentDailyCost = (await redis.getDailyCost(keyId)) || 0
    } catch (error) {
      logger.warn(`Failed to get current usage for key ${keyId}:`, error)
    }

    const boundAccountDetails = {}

    const accountDetailTasks = []

    if (fullKeyData.claudeAccountId) {
      accountDetailTasks.push(
        (async () => {
          try {
            const overview = await claudeAccountService.getAccountOverview(
              fullKeyData.claudeAccountId
            )

            if (overview && overview.accountType === 'dedicated') {
              boundAccountDetails.claude = overview
            }
          } catch (error) {
            logger.warn(`⚠️ Failed to load Claude account overview for key ${keyId}:`, error)
          }
        })()
      )
    }

    if (fullKeyData.openaiAccountId) {
      accountDetailTasks.push(
        (async () => {
          try {
            const overview = await openaiAccountService.getAccountOverview(
              fullKeyData.openaiAccountId
            )

            if (overview && overview.accountType === 'dedicated') {
              boundAccountDetails.openai = overview
            }
          } catch (error) {
            logger.warn(`⚠️ Failed to load OpenAI account overview for key ${keyId}:`, error)
          }
        })()
      )
    }

    if (accountDetailTasks.length > 0) {
      await Promise.allSettled(accountDetailTasks)
    }

    // 构建响应数据（只返回该API Key自己的信息，确保不泄露其他信息）
    const responseData = {
      id: keyId,
      name: fullKeyData.name,
      description: fullKeyData.description || keyData.description || '',
      isActive: true, // 如果能通过validateApiKey验证，说明一定是激活的
      createdAt: fullKeyData.createdAt || keyData.createdAt,
      expiresAt: fullKeyData.expiresAt || keyData.expiresAt,
      // 添加激活相关字段
      expirationMode: fullKeyData.expirationMode || 'fixed',
      isActivated: fullKeyData.isActivated === true || fullKeyData.isActivated === 'true',
      activationDays: parseInt(fullKeyData.activationDays || 0),
      activatedAt: fullKeyData.activatedAt || null,
      permissions: fullKeyData.permissions,

      // 使用统计（使用验证结果中的完整数据）
      usage: {
        total: {
          ...(fullKeyData.usage?.total || {
            requests: 0,
            tokens: 0,
            allTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheCreateTokens: 0,
            cacheReadTokens: 0
          }),
          cost: totalCost,
          formattedCost
        }
      },

      // 限制信息（显示配置和当前使用量）
      limits: {
        tokenLimit: fullKeyData.tokenLimit || 0,
        concurrencyLimit: fullKeyData.concurrencyLimit || 0,
        rateLimitWindow: fullKeyData.rateLimitWindow || 0,
        rateLimitRequests: fullKeyData.rateLimitRequests || 0,
        rateLimitCost: parseFloat(fullKeyData.rateLimitCost) || 0, // 新增：费用限制
        dailyCostLimit: fullKeyData.dailyCostLimit || 0,
        totalCostLimit: fullKeyData.totalCostLimit || 0,
        weeklyOpusCostLimit: parseFloat(fullKeyData.weeklyOpusCostLimit) || 0, // Opus 周费用限制
        // 当前使用量
        currentWindowRequests,
        currentWindowTokens,
        currentWindowCost, // 新增：当前窗口费用
        currentDailyCost,
        currentTotalCost: totalCost,
        weeklyOpusCost: (await redis.getWeeklyOpusCost(keyId)) || 0, // 当前 Opus 周费用
        // 时间窗口信息
        windowStartTime,
        windowEndTime,
        windowRemainingSeconds
      },

      // 绑定的账户信息（只显示ID，不显示敏感信息）
      accounts: {
        claudeAccountId:
          fullKeyData.claudeAccountId && fullKeyData.claudeAccountId !== ''
            ? fullKeyData.claudeAccountId
            : null,
        geminiAccountId:
          fullKeyData.geminiAccountId && fullKeyData.geminiAccountId !== ''
            ? fullKeyData.geminiAccountId
            : null,
        openaiAccountId:
          fullKeyData.openaiAccountId && fullKeyData.openaiAccountId !== ''
            ? fullKeyData.openaiAccountId
            : null,
        details: Object.keys(boundAccountDetails).length > 0 ? boundAccountDetails : null
      },

      // 模型和客户端限制信息
      restrictions: {
        enableModelRestriction: fullKeyData.enableModelRestriction || false,
        restrictedModels: fullKeyData.restrictedModels || [],
        enableClientRestriction: fullKeyData.enableClientRestriction || false,
        allowedClients: fullKeyData.allowedClients || []
      }
    }

    return res.json({
      success: true,
      data: responseData
    })
  } catch (error) {
    logger.error('❌ Failed to process user stats query:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve API key statistics'
    })
  }
})

// 📊 批量查询统计数据接口
router.post('/api/batch-stats', async (req, res) => {
  try {
    const { apiIds } = req.body

    // 验证输入
    if (!apiIds || !Array.isArray(apiIds) || apiIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'API IDs array is required'
      })
    }

    // 限制最多查询 30 个
    if (apiIds.length > 30) {
      return res.status(400).json({
        error: 'Too many keys',
        message: 'Maximum 30 API keys can be queried at once'
      })
    }

    // 验证所有 ID 格式
    const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
    const invalidIds = apiIds.filter((id) => !uuidRegex.test(id))
    if (invalidIds.length > 0) {
      return res.status(400).json({
        error: 'Invalid API ID format',
        message: `Invalid API IDs: ${invalidIds.join(', ')}`
      })
    }

    const individualStats = []
    const aggregated = {
      totalKeys: apiIds.length,
      activeKeys: 0,
      usage: {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreateTokens: 0,
        cacheReadTokens: 0,
        allTokens: 0,
        cost: 0,
        formattedCost: '$0.000000'
      },
      dailyUsage: {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreateTokens: 0,
        cacheReadTokens: 0,
        allTokens: 0,
        cost: 0,
        formattedCost: '$0.000000'
      },
      monthlyUsage: {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreateTokens: 0,
        cacheReadTokens: 0,
        allTokens: 0,
        cost: 0,
        formattedCost: '$0.000000'
      }
    }

    // 并行查询所有 API Key 数据（复用单key查询逻辑）
    const results = await Promise.allSettled(
      apiIds.map(async (apiId) => {
        const keyData = await redis.getApiKey(apiId)

        if (!keyData || Object.keys(keyData).length === 0) {
          return { error: 'Not found', apiId }
        }

        // 检查是否激活
        if (keyData.isActive !== 'true') {
          return { error: 'Disabled', apiId }
        }

        // 检查是否过期
        if (keyData.expiresAt && new Date() > new Date(keyData.expiresAt)) {
          return { error: 'Expired', apiId }
        }

        // 复用单key查询的逻辑：获取使用统计
        const usage = await redis.getUsageStats(apiId)

        // 获取费用统计（与单key查询一致）
        const costStats = await redis.getCostStats(apiId)

        return {
          apiId,
          name: keyData.name,
          description: keyData.description || '',
          isActive: true,
          createdAt: keyData.createdAt,
          usage: usage.total || {},
          dailyStats: {
            ...usage.daily,
            cost: costStats.daily
          },
          monthlyStats: {
            ...usage.monthly,
            cost: costStats.monthly
          },
          totalCost: costStats.total
        }
      })
    )

    // 处理结果并聚合
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value && !result.value.error) {
        const stats = result.value
        aggregated.activeKeys++

        // 聚合总使用量
        if (stats.usage) {
          aggregated.usage.requests += stats.usage.requests || 0
          aggregated.usage.inputTokens += stats.usage.inputTokens || 0
          aggregated.usage.outputTokens += stats.usage.outputTokens || 0
          aggregated.usage.cacheCreateTokens += stats.usage.cacheCreateTokens || 0
          aggregated.usage.cacheReadTokens += stats.usage.cacheReadTokens || 0
          aggregated.usage.allTokens += stats.usage.allTokens || 0
        }

        // 聚合总费用
        aggregated.usage.cost += stats.totalCost || 0

        // 聚合今日使用量
        aggregated.dailyUsage.requests += stats.dailyStats.requests || 0
        aggregated.dailyUsage.inputTokens += stats.dailyStats.inputTokens || 0
        aggregated.dailyUsage.outputTokens += stats.dailyStats.outputTokens || 0
        aggregated.dailyUsage.cacheCreateTokens += stats.dailyStats.cacheCreateTokens || 0
        aggregated.dailyUsage.cacheReadTokens += stats.dailyStats.cacheReadTokens || 0
        aggregated.dailyUsage.allTokens += stats.dailyStats.allTokens || 0
        aggregated.dailyUsage.cost += stats.dailyStats.cost || 0

        // 聚合本月使用量
        aggregated.monthlyUsage.requests += stats.monthlyStats.requests || 0
        aggregated.monthlyUsage.inputTokens += stats.monthlyStats.inputTokens || 0
        aggregated.monthlyUsage.outputTokens += stats.monthlyStats.outputTokens || 0
        aggregated.monthlyUsage.cacheCreateTokens += stats.monthlyStats.cacheCreateTokens || 0
        aggregated.monthlyUsage.cacheReadTokens += stats.monthlyStats.cacheReadTokens || 0
        aggregated.monthlyUsage.allTokens += stats.monthlyStats.allTokens || 0
        aggregated.monthlyUsage.cost += stats.monthlyStats.cost || 0

        // 添加到个体统计
        individualStats.push({
          apiId: stats.apiId,
          name: stats.name,
          isActive: true,
          usage: stats.usage,
          dailyUsage: {
            ...stats.dailyStats,
            formattedCost: CostCalculator.formatCost(stats.dailyStats.cost || 0)
          },
          monthlyUsage: {
            ...stats.monthlyStats,
            formattedCost: CostCalculator.formatCost(stats.monthlyStats.cost || 0)
          }
        })
      }
    })

    // 格式化费用显示
    aggregated.usage.formattedCost = CostCalculator.formatCost(aggregated.usage.cost)
    aggregated.dailyUsage.formattedCost = CostCalculator.formatCost(aggregated.dailyUsage.cost)
    aggregated.monthlyUsage.formattedCost = CostCalculator.formatCost(aggregated.monthlyUsage.cost)

    logger.api(`📊 Batch stats query for ${apiIds.length} keys from ${req.ip || 'unknown'}`)

    return res.json({
      success: true,
      data: {
        aggregated,
        individual: individualStats
      }
    })
  } catch (error) {
    logger.error('❌ Failed to process batch stats query:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve batch statistics'
    })
  }
})

// 📊 批量模型统计查询接口
router.post('/api/batch-model-stats', async (req, res) => {
  try {
    const { apiIds, period = 'daily' } = req.body

    // 验证输入
    if (!apiIds || !Array.isArray(apiIds) || apiIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'API IDs array is required'
      })
    }

    // 限制最多查询 30 个
    if (apiIds.length > 30) {
      return res.status(400).json({
        error: 'Too many keys',
        message: 'Maximum 30 API keys can be queried at once'
      })
    }

    const client = redis.getClientSafe()
    const tzDate = redis.getDateInTimezone()
    const today = redis.getDateStringInTimezone()
    const currentMonth = `${tzDate.getFullYear()}-${String(tzDate.getMonth() + 1).padStart(2, '0')}`

    const modelUsageMap = new Map()

    // 并行查询所有 API Key 的模型统计
    await Promise.all(
      apiIds.map(async (apiId) => {
        const pattern =
          period === 'daily'
            ? `usage:${apiId}:model:daily:*:${today}`
            : `usage:${apiId}:model:monthly:*:${currentMonth}`

        const keys = await redis.scanKeys(pattern)

        for (const key of keys) {
          const match = key.match(
            period === 'daily'
              ? /usage:.+:model:daily:(.+):\d{4}-\d{2}-\d{2}$/
              : /usage:.+:model:monthly:(.+):\d{4}-\d{2}$/
          )

          if (!match) {
            continue
          }

          const model = match[1]
          const data = await client.hgetall(key)

          if (data && Object.keys(data).length > 0) {
            if (!modelUsageMap.has(model)) {
              modelUsageMap.set(model, {
                requests: 0,
                inputTokens: 0,
                outputTokens: 0,
                cacheCreateTokens: 0,
                cacheReadTokens: 0,
                allTokens: 0
              })
            }

            const modelUsage = modelUsageMap.get(model)
            modelUsage.requests += parseInt(data.requests) || 0
            modelUsage.inputTokens += parseInt(data.inputTokens) || 0
            modelUsage.outputTokens += parseInt(data.outputTokens) || 0
            modelUsage.cacheCreateTokens += parseInt(data.cacheCreateTokens) || 0
            modelUsage.cacheReadTokens += parseInt(data.cacheReadTokens) || 0
            modelUsage.allTokens += parseInt(data.allTokens) || 0
          }
        }
      })
    )

    // 转换为数组并计算费用
    const modelStats = []
    for (const [model, usage] of modelUsageMap) {
      const usageData = {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cache_creation_input_tokens: usage.cacheCreateTokens,
        cache_read_input_tokens: usage.cacheReadTokens
      }

      const costData = CostCalculator.calculateCost(usageData, model)

      modelStats.push({
        model,
        requests: usage.requests,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheCreateTokens: usage.cacheCreateTokens,
        cacheReadTokens: usage.cacheReadTokens,
        allTokens: usage.allTokens,
        costs: costData.costs,
        formatted: costData.formatted,
        pricing: costData.pricing
      })
    }

    // 按总 token 数降序排列
    modelStats.sort((a, b) => b.allTokens - a.allTokens)

    logger.api(`📊 Batch model stats query for ${apiIds.length} keys, period: ${period}`)

    return res.json({
      success: true,
      data: modelStats,
      period
    })
  } catch (error) {
    logger.error('❌ Failed to process batch model stats query:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve batch model statistics'
    })
  }
})

// 🧪 API Key 端点测试接口 - 测试API Key是否能正常访问服务
router.post('/api-key/test', async (req, res) => {
  const config = require('../../config/config')
  const { sendStreamTestRequest } = require('../utils/testPayloadHelper')

  try {
    const { apiKey, model = 'claude-sonnet-4-5-20250929' } = req.body

    if (!apiKey) {
      return res.status(400).json({
        error: 'API Key is required',
        message: 'Please provide your API Key'
      })
    }

    if (typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 512) {
      return res.status(400).json({
        error: 'Invalid API key format',
        message: 'API key format is invalid'
      })
    }

    const validation = await apiKeyService.validateApiKeyForStats(apiKey)
    if (!validation.valid) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: validation.error
      })
    }

    logger.api(`🧪 API Key test started for: ${validation.keyData.name} (${validation.keyData.id})`)

    const port = config.server.port || 3000
    const apiUrl = `http://127.0.0.1:${port}/api/v1/messages?beta=true`

    await sendStreamTestRequest({
      apiUrl,
      authorization: apiKey,
      responseStream: res,
      payload: createClaudeTestPayload(model, { stream: true }),
      timeout: 60000,
      extraHeaders: { 'x-api-key': apiKey }
    })
  } catch (error) {
    logger.error('❌ API Key test failed:', error)

    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Test failed',
        message: error.message || 'Internal server error'
      })
    }

    res.write(
      `data: ${JSON.stringify({ type: 'error', error: error.message || 'Test failed' })}\n\n`
    )
    res.end()
  }
})

// 📊 用户模型统计查询接口 - 安全的自查询接口
router.post('/api/user-model-stats', async (req, res) => {
  try {
    const { apiKey, apiId, period = 'monthly' } = req.body

    let keyData
    let keyId

    if (apiId) {
      // 通过 apiId 查询
      if (
        typeof apiId !== 'string' ||
        !apiId.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
      ) {
        return res.status(400).json({
          error: 'Invalid API ID format',
          message: 'API ID must be a valid UUID'
        })
      }

      // 直接通过 ID 获取 API Key 数据
      keyData = await redis.getApiKey(apiId)

      if (!keyData || Object.keys(keyData).length === 0) {
        logger.security(`🔒 API key not found for ID: ${apiId} from ${req.ip || 'unknown'}`)
        return res.status(404).json({
          error: 'API key not found',
          message: 'The specified API key does not exist'
        })
      }

      // 检查是否激活
      if (keyData.isActive !== 'true') {
        const keyName = keyData.name || 'Unknown'
        return res.status(403).json({
          error: 'API key is disabled',
          message: `API Key "${keyName}" 已被禁用`,
          keyName
        })
      }

      keyId = apiId

      // 获取使用统计
      const usage = await redis.getUsageStats(keyId)
      keyData.usage = { total: usage.total }
    } else if (apiKey) {
      // 通过 apiKey 查询（保持向后兼容）
      // 验证API Key
      const validation = await apiKeyService.validateApiKey(apiKey)

      if (!validation.valid) {
        const clientIP = req.ip || req.connection?.remoteAddress || 'unknown'
        logger.security(
          `🔒 Invalid API key in user model stats query: ${validation.error} from ${clientIP}`
        )
        return res.status(401).json({
          error: 'Invalid API key',
          message: validation.error
        })
      }

      const { keyData: validatedKeyData } = validation
      keyData = validatedKeyData
      keyId = keyData.id
    } else {
      logger.security(
        `🔒 Missing API key or ID in user model stats query from ${req.ip || 'unknown'}`
      )
      return res.status(400).json({
        error: 'API Key or ID is required',
        message: 'Please provide your API Key or API ID'
      })
    }

    logger.api(
      `📊 User model stats query from key: ${keyData.name} (${keyId}) for period: ${period}`
    )

    // 重用管理后台的模型统计逻辑，但只返回该API Key的数据
    const client = redis.getClientSafe()
    // 使用与管理页面相同的时区处理逻辑
    const tzDate = redis.getDateInTimezone()
    const today = redis.getDateStringInTimezone()
    const currentMonth = `${tzDate.getFullYear()}-${String(tzDate.getMonth() + 1).padStart(2, '0')}`

    const pattern =
      period === 'daily'
        ? `usage:${keyId}:model:daily:*:${today}`
        : `usage:${keyId}:model:monthly:*:${currentMonth}`

    const keys = await redis.scanKeys(pattern)
    const modelStats = []

    for (const key of keys) {
      const match = key.match(
        period === 'daily'
          ? /usage:.+:model:daily:(.+):\d{4}-\d{2}-\d{2}$/
          : /usage:.+:model:monthly:(.+):\d{4}-\d{2}$/
      )

      if (!match) {
        continue
      }

      const model = match[1]
      const data = await client.hgetall(key)

      if (data && Object.keys(data).length > 0) {
        const usage = {
          input_tokens: parseInt(data.inputTokens) || 0,
          output_tokens: parseInt(data.outputTokens) || 0,
          cache_creation_input_tokens: parseInt(data.cacheCreateTokens) || 0,
          cache_read_input_tokens: parseInt(data.cacheReadTokens) || 0
        }

        const costData = CostCalculator.calculateCost(usage, model)

        modelStats.push({
          model,
          requests: parseInt(data.requests) || 0,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheCreateTokens: usage.cache_creation_input_tokens,
          cacheReadTokens: usage.cache_read_input_tokens,
          allTokens: parseInt(data.allTokens) || 0,
          costs: costData.costs,
          formatted: costData.formatted,
          pricing: costData.pricing
        })
      }
    }

    // 如果没有详细的模型数据，不显示历史数据以避免混淆
    // 只有在查询特定时间段时返回空数组，表示该时间段确实没有数据
    if (modelStats.length === 0) {
      logger.info(`📊 No model stats found for key ${keyId} in period ${period}`)
    }

    // 按总token数降序排列
    modelStats.sort((a, b) => b.allTokens - a.allTokens)

    return res.json({
      success: true,
      data: modelStats,
      period
    })
  } catch (error) {
    logger.error('❌ Failed to process user model stats query:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve model statistics'
    })
  }
})

module.exports = router
