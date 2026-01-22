const express = require('express')
const apiKeyService = require('../../services/apiKeyService')
const redis = require('../../models/redis')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const CostCalculator = require('../../utils/costCalculator')
const config = require('../../../config/config')

const router = express.Router()

// 有效的权限值列表
const VALID_PERMISSIONS = ['claude', 'gemini', 'openai', 'droid']

/**
 * 验证权限数组格式
 * @param {any} permissions - 权限值（可以是数组或其他）
 * @returns {string|null} - 返回错误消息，null 表示验证通过
 */
function validatePermissions(permissions) {
  // 空值或未定义表示全部服务
  if (permissions === undefined || permissions === null || permissions === '') {
    return null
  }
  // 兼容旧格式字符串
  if (typeof permissions === 'string') {
    if (permissions === 'all' || VALID_PERMISSIONS.includes(permissions)) {
      return null
    }
    return `Invalid permissions value. Must be an array of: ${VALID_PERMISSIONS.join(', ')}`
  }
  // 新格式数组
  if (Array.isArray(permissions)) {
    // 空数组表示全部服务
    if (permissions.length === 0) {
      return null
    }
    // 验证数组中的每个值
    for (const perm of permissions) {
      if (!VALID_PERMISSIONS.includes(perm)) {
        return `Invalid permission value "${perm}". Valid values are: ${VALID_PERMISSIONS.join(', ')}`
      }
    }
    return null
  }
  return `Permissions must be an array. Valid values are: ${VALID_PERMISSIONS.join(', ')}`
}

/**
 * 验证 serviceRates 格式
 * @param {any} serviceRates - 服务倍率对象
 * @returns {string|null} - 返回错误消息，null 表示验证通过
 */
function validateServiceRates(serviceRates) {
  if (serviceRates === undefined || serviceRates === null) {
    return null
  }
  if (typeof serviceRates !== 'object' || Array.isArray(serviceRates)) {
    return 'Service rates must be an object'
  }
  for (const [service, rate] of Object.entries(serviceRates)) {
    const numRate = Number(rate)
    if (!Number.isFinite(numRate) || numRate < 0) {
      return `Invalid rate for service "${service}": must be a non-negative number`
    }
  }
  return null
}

// 👥 用户管理 (用于API Key分配)

// 获取所有用户列表（用于API Key分配）
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const userService = require('../../services/userService')

    // Extract query parameters for filtering
    const { role, isActive } = req.query
    const options = { limit: 1000 }

    // Apply role filter if provided
    if (role) {
      options.role = role
    }

    // Apply isActive filter if provided, otherwise default to active users only
    if (isActive !== undefined) {
      options.isActive = isActive === 'true'
    } else {
      options.isActive = true // Default to active users for backwards compatibility
    }

    const result = await userService.getAllUsers(options)

    // Extract users array from the paginated result
    const allUsers = result.users || []

    // Map to the format needed for the dropdown
    const activeUsers = allUsers.map((user) => ({
      id: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      email: user.email,
      role: user.role
    }))

    // 添加Admin选项作为第一个
    const usersWithAdmin = [
      {
        id: 'admin',
        username: 'admin',
        displayName: 'Admin',
        email: '',
        role: 'admin'
      },
      ...activeUsers
    ]

    return res.json({
      success: true,
      data: usersWithAdmin
    })
  } catch (error) {
    logger.error('❌ Failed to get users list:', error)
    return res.status(500).json({
      error: 'Failed to get users list',
      message: error.message
    })
  }
})

// 🔑 API Keys 管理

// 调试：获取API Key费用详情
router.get('/api-keys/:keyId/cost-debug', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const costStats = await redis.getCostStats(keyId)
    const dailyCost = await redis.getDailyCost(keyId)
    const today = redis.getDateStringInTimezone()

    // 获取所有相关的Redis键
    const costKeys = await redis.scanKeys(`usage:cost:*:${keyId}:*`)
    const costValues = await redis.batchGetChunked(costKeys)
    const keyValues = {}

    for (let i = 0; i < costKeys.length; i++) {
      keyValues[costKeys[i]] = costValues[i]
    }

    return res.json({
      keyId,
      today,
      dailyCost,
      costStats,
      redisKeys: keyValues,
      timezone: config.system.timezoneOffset || 8
    })
  } catch (error) {
    logger.error('❌ Failed to get cost debug info:', error)
    return res.status(500).json({ error: 'Failed to get cost debug info', message: error.message })
  }
})

// 获取所有被使用过的模型列表
router.get('/api-keys/used-models', authenticateAdmin, async (req, res) => {
  try {
    const models = await redis.getAllUsedModels()
    return res.json({ success: true, data: models })
  } catch (error) {
    logger.error('❌ Failed to get used models:', error)
    return res.status(500).json({ error: 'Failed to get used models', message: error.message })
  }
})

// 获取所有API Keys
router.get('/api-keys', authenticateAdmin, async (req, res) => {
  try {
    const {
      // 分页参数
      page = 1,
      pageSize = 20,
      // 搜索参数
      searchMode = 'apiKey',
      search = '',
      // 筛选参数
      tag = '',
      isActive = '',
      models = '', // 模型筛选（逗号分隔）
      // 排序参数
      sortBy = 'createdAt',
      sortOrder = 'desc',
      // 费用排序参数
      costTimeRange = '7days', // 费用排序的时间范围
      costStartDate = '', // custom 时间范围的开始日期
      costEndDate = '', // custom 时间范围的结束日期
      // 兼容旧参数（不再用于费用计算，仅标记）
      timeRange = 'all'
    } = req.query

    // 解析模型筛选参数
    const modelFilter = models ? models.split(',').filter((m) => m.trim()) : []

    // 验证分页参数
    const pageNum = Math.max(1, parseInt(page) || 1)
    const pageSizeNum = [10, 20, 50, 100].includes(parseInt(pageSize)) ? parseInt(pageSize) : 20

    // 验证排序参数（新增 cost 排序）
    const validSortFields = [
      'name',
      'createdAt',
      'expiresAt',
      'lastUsedAt',
      'isActive',
      'status',
      'cost'
    ]
    const validSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt'
    const validSortOrder = ['asc', 'desc'].includes(sortOrder) ? sortOrder : 'desc'

    // 获取用户服务来补充owner信息
    const userService = require('../../services/userService')

    // 如果是绑定账号搜索模式，先刷新账户名称缓存
    if (searchMode === 'bindingAccount' && search) {
      const accountNameCacheService = require('../../services/accountNameCacheService')
      await accountNameCacheService.refreshIfNeeded()
    }

    let result
    let costSortStatus = null

    // 如果是费用排序
    if (validSortBy === 'cost') {
      const costRankService = require('../../services/costRankService')

      // 验证费用排序的时间范围
      const validCostTimeRanges = ['today', '7days', '30days', 'all', 'custom']
      const effectiveCostTimeRange = validCostTimeRanges.includes(costTimeRange)
        ? costTimeRange
        : '7days'

      // 如果是 custom 时间范围，使用实时计算
      if (effectiveCostTimeRange === 'custom') {
        // 验证日期参数
        if (!costStartDate || !costEndDate) {
          return res.status(400).json({
            success: false,
            error: 'INVALID_DATE_RANGE',
            message: '自定义时间范围需要提供 costStartDate 和 costEndDate 参数'
          })
        }

        const start = new Date(costStartDate)
        const end = new Date(costEndDate)
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            error: 'INVALID_DATE_FORMAT',
            message: '日期格式无效'
          })
        }

        if (start > end) {
          return res.status(400).json({
            success: false,
            error: 'INVALID_DATE_RANGE',
            message: '开始日期不能晚于结束日期'
          })
        }

        // 限制最大范围为 365 天
        const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
        if (daysDiff > 365) {
          return res.status(400).json({
            success: false,
            error: 'DATE_RANGE_TOO_LARGE',
            message: '日期范围不能超过365天'
          })
        }

        logger.info(`📊 Cost sort with custom range: ${costStartDate} to ${costEndDate}`)

        // 实时计算费用排序
        result = await getApiKeysSortedByCostCustom({
          page: pageNum,
          pageSize: pageSizeNum,
          sortOrder: validSortOrder,
          startDate: costStartDate,
          endDate: costEndDate,
          search,
          searchMode,
          tag,
          isActive,
          modelFilter
        })

        costSortStatus = {
          status: 'ready',
          isRealTimeCalculation: true
        }
      } else {
        // 使用预计算索引
        const rankStatus = await costRankService.getRankStatus()
        costSortStatus = rankStatus[effectiveCostTimeRange]

        // 检查索引是否就绪
        if (!costSortStatus || costSortStatus.status !== 'ready') {
          return res.status(503).json({
            success: false,
            error: 'RANK_NOT_READY',
            message: `费用排序索引 (${effectiveCostTimeRange}) 正在更新中，请稍后重试`,
            costSortStatus: costSortStatus || { status: 'unknown' }
          })
        }

        logger.info(`📊 Cost sort using precomputed index: ${effectiveCostTimeRange}`)

        // 使用预计算索引排序
        result = await getApiKeysSortedByCostPrecomputed({
          page: pageNum,
          pageSize: pageSizeNum,
          sortOrder: validSortOrder,
          costTimeRange: effectiveCostTimeRange,
          search,
          searchMode,
          tag,
          isActive,
          modelFilter
        })

        costSortStatus.isRealTimeCalculation = false
      }
    } else {
      // 原有的非费用排序逻辑
      result = await redis.getApiKeysPaginated({
        page: pageNum,
        pageSize: pageSizeNum,
        searchMode,
        search,
        tag,
        isActive,
        sortBy: validSortBy,
        sortOrder: validSortOrder,
        modelFilter
      })
    }

    // 为每个API Key添加owner的displayName（批量获取优化）
    const userIdsToFetch = [...new Set(result.items.filter((k) => k.userId).map((k) => k.userId))]
    const userMap = new Map()

    if (userIdsToFetch.length > 0) {
      // 批量获取用户信息
      const users = await Promise.all(
        userIdsToFetch.map((id) => userService.getUserById(id, false).catch(() => null))
      )
      userIdsToFetch.forEach((id, i) => {
        if (users[i]) {
          userMap.set(id, users[i])
        }
      })
    }

    for (const apiKey of result.items) {
      if (apiKey.userId && userMap.has(apiKey.userId)) {
        const user = userMap.get(apiKey.userId)
        apiKey.ownerDisplayName = user.displayName || user.username || 'Unknown User'
      } else if (apiKey.userId) {
        apiKey.ownerDisplayName = 'Unknown User'
      } else {
        apiKey.ownerDisplayName =
          apiKey.createdBy === 'admin' ? 'Admin' : apiKey.createdBy || 'Admin'
      }

      // 初始化空的 usage 对象（费用通过 batch-stats 接口获取）
      if (!apiKey.usage) {
        apiKey.usage = { total: { requests: 0, tokens: 0, cost: 0, formattedCost: '$0.00' } }
      }
    }

    // 返回分页数据
    const responseData = {
      success: true,
      data: {
        items: result.items,
        pagination: result.pagination,
        availableTags: result.availableTags
      },
      // 标记当前请求的时间范围（供前端参考）
      timeRange
    }

    // 如果是费用排序，附加排序状态
    if (costSortStatus) {
      responseData.data.costSortStatus = costSortStatus
    }

    return res.json(responseData)
  } catch (error) {
    logger.error('❌ Failed to get API keys:', error)
    return res.status(500).json({ error: 'Failed to get API keys', message: error.message })
  }
})

/**
 * 使用预计算索引进行费用排序的分页查询
 */
async function getApiKeysSortedByCostPrecomputed(options) {
  const {
    page,
    pageSize,
    sortOrder,
    costTimeRange,
    search,
    searchMode,
    tag,
    isActive,
    modelFilter = []
  } = options
  const costRankService = require('../../services/costRankService')

  // 1. 获取排序后的全量 keyId 列表
  const rankedKeyIds = await costRankService.getSortedKeyIds(costTimeRange, sortOrder)

  if (rankedKeyIds.length === 0) {
    return {
      items: [],
      pagination: { page: 1, pageSize, total: 0, totalPages: 1 },
      availableTags: []
    }
  }

  // 2. 批量获取 API Key 基础数据
  const allKeys = await redis.batchGetApiKeys(rankedKeyIds)

  // 3. 保持排序顺序（使用 Map 优化查找）
  const keyMap = new Map(allKeys.map((k) => [k.id, k]))
  let orderedKeys = rankedKeyIds.map((id) => keyMap.get(id)).filter((k) => k && !k.isDeleted)

  // 4. 应用筛选条件
  // 状态筛选
  if (isActive !== '' && isActive !== undefined && isActive !== null) {
    const activeValue = isActive === 'true' || isActive === true
    orderedKeys = orderedKeys.filter((k) => k.isActive === activeValue)
  }

  // 标签筛选
  if (tag) {
    orderedKeys = orderedKeys.filter((k) => {
      const tags = Array.isArray(k.tags) ? k.tags : []
      return tags.includes(tag)
    })
  }

  // 搜索筛选
  if (search) {
    const lowerSearch = search.toLowerCase().trim()
    if (searchMode === 'apiKey') {
      orderedKeys = orderedKeys.filter((k) => k.name && k.name.toLowerCase().includes(lowerSearch))
    } else if (searchMode === 'bindingAccount') {
      const accountNameCacheService = require('../../services/accountNameCacheService')
      orderedKeys = accountNameCacheService.searchByBindingAccount(orderedKeys, lowerSearch)
    }
  }

  // 模型筛选
  if (modelFilter.length > 0) {
    const keyIdsWithModels = await redis.getKeyIdsWithModels(
      orderedKeys.map((k) => k.id),
      modelFilter
    )
    orderedKeys = orderedKeys.filter((k) => keyIdsWithModels.has(k.id))
  }

  // 5. 收集所有可用标签
  const allTags = new Set()
  for (const key of allKeys) {
    if (!key.isDeleted) {
      const tags = Array.isArray(key.tags) ? key.tags : []
      tags.forEach((t) => allTags.add(t))
    }
  }
  const availableTags = [...allTags].sort()

  // 6. 分页
  const total = orderedKeys.length
  const totalPages = Math.ceil(total / pageSize) || 1
  const validPage = Math.min(Math.max(1, page), totalPages)
  const start = (validPage - 1) * pageSize
  const items = orderedKeys.slice(start, start + pageSize)

  // 7. 为当前页的 Keys 附加费用数据
  const keyCosts = await costRankService.getBatchKeyCosts(
    costTimeRange,
    items.map((k) => k.id)
  )
  for (const key of items) {
    key._cost = keyCosts.get(key.id) || 0
  }

  return {
    items,
    pagination: {
      page: validPage,
      pageSize,
      total,
      totalPages
    },
    availableTags
  }
}

/**
 * 使用实时计算进行 custom 时间范围的费用排序
 */
async function getApiKeysSortedByCostCustom(options) {
  const {
    page,
    pageSize,
    sortOrder,
    startDate,
    endDate,
    search,
    searchMode,
    tag,
    isActive,
    modelFilter = []
  } = options
  const costRankService = require('../../services/costRankService')

  // 1. 实时计算所有 Keys 的费用
  const costs = await costRankService.calculateCustomRangeCosts(startDate, endDate)

  if (costs.size === 0) {
    return {
      items: [],
      pagination: { page: 1, pageSize, total: 0, totalPages: 1 },
      availableTags: []
    }
  }

  // 2. 转换为数组并排序
  const sortedEntries = [...costs.entries()].sort((a, b) =>
    sortOrder === 'desc' ? b[1] - a[1] : a[1] - b[1]
  )
  const rankedKeyIds = sortedEntries.map(([keyId]) => keyId)

  // 3. 批量获取 API Key 基础数据
  const allKeys = await redis.batchGetApiKeys(rankedKeyIds)

  // 4. 保持排序顺序
  const keyMap = new Map(allKeys.map((k) => [k.id, k]))
  let orderedKeys = rankedKeyIds.map((id) => keyMap.get(id)).filter((k) => k && !k.isDeleted)

  // 5. 应用筛选条件
  // 状态筛选
  if (isActive !== '' && isActive !== undefined && isActive !== null) {
    const activeValue = isActive === 'true' || isActive === true
    orderedKeys = orderedKeys.filter((k) => k.isActive === activeValue)
  }

  // 标签筛选
  if (tag) {
    orderedKeys = orderedKeys.filter((k) => {
      const tags = Array.isArray(k.tags) ? k.tags : []
      return tags.includes(tag)
    })
  }

  // 搜索筛选
  if (search) {
    const lowerSearch = search.toLowerCase().trim()
    if (searchMode === 'apiKey') {
      orderedKeys = orderedKeys.filter((k) => k.name && k.name.toLowerCase().includes(lowerSearch))
    } else if (searchMode === 'bindingAccount') {
      const accountNameCacheService = require('../../services/accountNameCacheService')
      orderedKeys = accountNameCacheService.searchByBindingAccount(orderedKeys, lowerSearch)
    }
  }

  // 模型筛选
  if (modelFilter.length > 0) {
    const keyIdsWithModels = await redis.getKeyIdsWithModels(
      orderedKeys.map((k) => k.id),
      modelFilter
    )
    orderedKeys = orderedKeys.filter((k) => keyIdsWithModels.has(k.id))
  }

  // 6. 收集所有可用标签
  const allTags = new Set()
  for (const key of allKeys) {
    if (!key.isDeleted) {
      const tags = Array.isArray(key.tags) ? key.tags : []
      tags.forEach((t) => allTags.add(t))
    }
  }
  const availableTags = [...allTags].sort()

  // 7. 分页
  const total = orderedKeys.length
  const totalPages = Math.ceil(total / pageSize) || 1
  const validPage = Math.min(Math.max(1, page), totalPages)
  const start = (validPage - 1) * pageSize
  const items = orderedKeys.slice(start, start + pageSize)

  // 8. 为当前页的 Keys 附加费用数据
  for (const key of items) {
    key._cost = costs.get(key.id) || 0
  }

  return {
    items,
    pagination: {
      page: validPage,
      pageSize,
      total,
      totalPages
    },
    availableTags
  }
}

// 获取费用排序索引状态
router.get('/api-keys/cost-sort-status', authenticateAdmin, async (req, res) => {
  try {
    const costRankService = require('../../services/costRankService')
    const status = await costRankService.getRankStatus()
    return res.json({ success: true, data: status })
  } catch (error) {
    logger.error('❌ Failed to get cost sort status:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to get cost sort status',
      message: error.message
    })
  }
})

// 获取 API Key 索引状态
router.get('/api-keys/index-status', authenticateAdmin, async (req, res) => {
  try {
    const apiKeyIndexService = require('../../services/apiKeyIndexService')
    const status = await apiKeyIndexService.getStatus()
    return res.json({ success: true, data: status })
  } catch (error) {
    logger.error('❌ Failed to get API Key index status:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to get index status',
      message: error.message
    })
  }
})

// 手动重建 API Key 索引
router.post('/api-keys/index-rebuild', authenticateAdmin, async (req, res) => {
  try {
    const apiKeyIndexService = require('../../services/apiKeyIndexService')
    const status = await apiKeyIndexService.getStatus()

    if (status.building) {
      return res.status(409).json({
        success: false,
        error: 'INDEX_BUILDING',
        message: '索引正在重建中，请稍后再试',
        progress: status.progress
      })
    }

    // 异步重建，不等待完成
    apiKeyIndexService.rebuildIndexes().catch((err) => {
      logger.error('❌ Failed to rebuild API Key index:', err)
    })

    return res.json({
      success: true,
      message: 'API Key 索引重建已开始'
    })
  } catch (error) {
    logger.error('❌ Failed to trigger API Key index rebuild:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to trigger rebuild',
      message: error.message
    })
  }
})

// 强制刷新费用排序索引
router.post('/api-keys/cost-sort-refresh', authenticateAdmin, async (req, res) => {
  try {
    const { timeRange } = req.body
    const costRankService = require('../../services/costRankService')

    // 验证时间范围
    if (timeRange) {
      const validTimeRanges = ['today', '7days', '30days', 'all']
      if (!validTimeRanges.includes(timeRange)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_TIME_RANGE',
          message: '无效的时间范围，可选值：today, 7days, 30days, all'
        })
      }
    }

    // 异步刷新，不等待完成
    costRankService.forceRefresh(timeRange || null).catch((err) => {
      logger.error('❌ Failed to refresh cost rank:', err)
    })

    return res.json({
      success: true,
      message: timeRange ? `费用排序索引 (${timeRange}) 刷新已开始` : '所有费用排序索引刷新已开始'
    })
  } catch (error) {
    logger.error('❌ Failed to trigger cost sort refresh:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to trigger refresh',
      message: error.message
    })
  }
})

// 获取支持的客户端列表（使用新的验证器）
router.get('/supported-clients', authenticateAdmin, async (req, res) => {
  try {
    // 使用新的 ClientValidator 获取所有可用客户端
    const ClientValidator = require('../../validators/clientValidator')
    const availableClients = ClientValidator.getAvailableClients()

    // 格式化返回数据
    const clients = availableClients.map((client) => ({
      id: client.id,
      name: client.name,
      description: client.description,
      icon: client.icon
    }))

    logger.info(`📱 Returning ${clients.length} supported clients`)
    return res.json({ success: true, data: clients })
  } catch (error) {
    logger.error('❌ Failed to get supported clients:', error)
    return res
      .status(500)
      .json({ error: 'Failed to get supported clients', message: error.message })
  }
})

// 获取已存在的标签列表
router.get('/api-keys/tags', authenticateAdmin, async (req, res) => {
  try {
    const tags = await apiKeyService.getAllTags()

    logger.info(`📋 Retrieved ${tags.length} unique tags from API keys`)
    return res.json({ success: true, data: tags })
  } catch (error) {
    logger.error('❌ Failed to get API key tags:', error)
    return res.status(500).json({ error: 'Failed to get API key tags', message: error.message })
  }
})

// 获取标签详情（含使用数量）
router.get('/api-keys/tags/details', authenticateAdmin, async (req, res) => {
  try {
    const tagDetails = await apiKeyService.getTagsWithCount()
    logger.info(`📋 Retrieved ${tagDetails.length} tags with usage counts`)
    return res.json({ success: true, data: tagDetails })
  } catch (error) {
    logger.error('❌ Failed to get tag details:', error)
    return res.status(500).json({ error: 'Failed to get tag details', message: error.message })
  }
})

// 创建新标签
router.post('/api-keys/tags', authenticateAdmin, async (req, res) => {
  try {
    const { name } = req.body
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '标签名称不能为空' })
    }

    const result = await apiKeyService.createTag(name.trim())
    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    logger.info(`🏷️ Created new tag: ${name}`)
    return res.json({ success: true, message: '标签创建成功' })
  } catch (error) {
    logger.error('❌ Failed to create tag:', error)
    return res.status(500).json({ error: 'Failed to create tag', message: error.message })
  }
})

// 删除标签（从所有 API Key 中移除）
router.delete('/api-keys/tags/:tagName', authenticateAdmin, async (req, res) => {
  try {
    const { tagName } = req.params
    if (!tagName) {
      return res.status(400).json({ error: 'Tag name is required' })
    }

    const decodedTagName = decodeURIComponent(tagName)
    const result = await apiKeyService.removeTagFromAllKeys(decodedTagName)

    logger.info(`🏷️ Removed tag "${decodedTagName}" from ${result.affectedCount} API keys`)
    return res.json({
      success: true,
      message: `Tag "${decodedTagName}" removed from ${result.affectedCount} API keys`,
      affectedCount: result.affectedCount
    })
  } catch (error) {
    logger.error('❌ Failed to delete tag:', error)
    return res.status(500).json({ error: 'Failed to delete tag', message: error.message })
  }
})

// 重命名标签
router.put('/api-keys/tags/:tagName', authenticateAdmin, async (req, res) => {
  try {
    const { tagName } = req.params
    const { newName } = req.body
    if (!tagName || !newName || !newName.trim()) {
      return res.status(400).json({ error: 'Tag name and new name are required' })
    }

    const decodedTagName = decodeURIComponent(tagName)
    const trimmedNewName = newName.trim()
    const result = await apiKeyService.renameTag(decodedTagName, trimmedNewName)

    if (result.error) {
      return res.status(400).json({ error: result.error })
    }

    logger.info(
      `🏷️ Renamed tag "${decodedTagName}" to "${trimmedNewName}" in ${result.affectedCount} API keys`
    )
    return res.json({
      success: true,
      message: `Tag renamed in ${result.affectedCount} API keys`,
      affectedCount: result.affectedCount
    })
  } catch (error) {
    logger.error('❌ Failed to rename tag:', error)
    return res.status(500).json({ error: 'Failed to rename tag', message: error.message })
  }
})

/**
 * 获取账户绑定的 API Key 数量统计
 * GET /admin/accounts/binding-counts
 *
 * 返回每种账户类型的绑定数量统计，用于账户列表页面显示"绑定: X 个API Key"
 * 这是一个轻量级接口，只返回计数而不是完整的 API Key 数据
 */
router.get('/accounts/binding-counts', authenticateAdmin, async (req, res) => {
  try {
    // 使用优化的分页方法获取所有非删除的 API Keys（只需要绑定字段）
    const result = await redis.getApiKeysPaginated({
      page: 1,
      pageSize: 10000, // 获取所有
      excludeDeleted: true
    })

    const apiKeys = result.items

    // 初始化统计对象
    const bindingCounts = {
      claudeAccountId: {},
      claudeConsoleAccountId: {},
      geminiAccountId: {},
      openaiAccountId: {},
      azureOpenaiAccountId: {},
      bedrockAccountId: {},
      droidAccountId: {},
      ccrAccountId: {}
    }

    // 遍历一次，统计每个账户的绑定数量
    for (const key of apiKeys) {
      // Claude 账户
      if (key.claudeAccountId) {
        const id = key.claudeAccountId
        bindingCounts.claudeAccountId[id] = (bindingCounts.claudeAccountId[id] || 0) + 1
      }

      // Claude Console 账户
      if (key.claudeConsoleAccountId) {
        const id = key.claudeConsoleAccountId
        bindingCounts.claudeConsoleAccountId[id] =
          (bindingCounts.claudeConsoleAccountId[id] || 0) + 1
      }

      // Gemini 账户（包括 api: 前缀的 Gemini-API 账户）
      if (key.geminiAccountId) {
        const id = key.geminiAccountId
        bindingCounts.geminiAccountId[id] = (bindingCounts.geminiAccountId[id] || 0) + 1
      }

      // OpenAI 账户（包括 responses: 前缀的 OpenAI-Responses 账户）
      if (key.openaiAccountId) {
        const id = key.openaiAccountId
        bindingCounts.openaiAccountId[id] = (bindingCounts.openaiAccountId[id] || 0) + 1
      }

      // Azure OpenAI 账户
      if (key.azureOpenaiAccountId) {
        const id = key.azureOpenaiAccountId
        bindingCounts.azureOpenaiAccountId[id] = (bindingCounts.azureOpenaiAccountId[id] || 0) + 1
      }

      // Bedrock 账户
      if (key.bedrockAccountId) {
        const id = key.bedrockAccountId
        bindingCounts.bedrockAccountId[id] = (bindingCounts.bedrockAccountId[id] || 0) + 1
      }

      // Droid 账户
      if (key.droidAccountId) {
        const id = key.droidAccountId
        bindingCounts.droidAccountId[id] = (bindingCounts.droidAccountId[id] || 0) + 1
      }

      // CCR 账户
      if (key.ccrAccountId) {
        const id = key.ccrAccountId
        bindingCounts.ccrAccountId[id] = (bindingCounts.ccrAccountId[id] || 0) + 1
      }
    }

    logger.debug(`📊 Account binding counts calculated from ${apiKeys.length} API keys`)
    return res.json({ success: true, data: bindingCounts })
  } catch (error) {
    logger.error('❌ Failed to get account binding counts:', error)
    return res.status(500).json({
      error: 'Failed to get account binding counts',
      message: error.message
    })
  }
})

/**
 * 批量获取指定 Keys 的统计数据和费用
 * POST /admin/api-keys/batch-stats
 *
 * 用于 API Keys 列表页面异步加载统计数据
 */
router.post('/api-keys/batch-stats', authenticateAdmin, async (req, res) => {
  try {
    const {
      keyIds, // 必需：API Key ID 数组
      timeRange = 'all', // 时间范围：all, today, 7days, monthly, custom
      startDate, // custom 时必需
      endDate // custom 时必需
    } = req.body

    // 参数验证
    if (!Array.isArray(keyIds) || keyIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'keyIds is required and must be a non-empty array'
      })
    }

    // 限制单次最多处理 100 个 Key
    if (keyIds.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Max 100 keys per request'
      })
    }

    // 验证 custom 时间范围的参数
    if (timeRange === 'custom') {
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: 'startDate and endDate are required for custom time range'
        })
      }
      const start = new Date(startDate)
      const end = new Date(endDate)
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format'
        })
      }
      if (start > end) {
        return res.status(400).json({
          success: false,
          error: 'startDate must be before or equal to endDate'
        })
      }
      // 限制最大范围为 365 天
      const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
      if (daysDiff > 365) {
        return res.status(400).json({
          success: false,
          error: 'Date range cannot exceed 365 days'
        })
      }
    }

    logger.info(
      `📊 Batch stats request: ${keyIds.length} keys, timeRange=${timeRange}`,
      timeRange === 'custom' ? `, ${startDate} to ${endDate}` : ''
    )

    const stats = {}

    // 并行计算每个 Key 的统计数据
    await Promise.all(
      keyIds.map(async (keyId) => {
        try {
          stats[keyId] = await calculateKeyStats(keyId, timeRange, startDate, endDate)
        } catch (error) {
          logger.error(`❌ Failed to calculate stats for key ${keyId}:`, error)
          stats[keyId] = {
            requests: 0,
            tokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheCreateTokens: 0,
            cacheReadTokens: 0,
            cost: 0,
            formattedCost: '$0.00',
            dailyCost: 0,
            currentWindowCost: 0,
            windowRemainingSeconds: null,
            allTimeCost: 0,
            error: error.message
          }
        }
      })
    )

    return res.json({ success: true, data: stats })
  } catch (error) {
    logger.error('❌ Failed to calculate batch stats:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to calculate stats',
      message: error.message
    })
  }
})

/**
 * 计算单个 Key 的统计数据
 * @param {string} keyId - API Key ID
 * @param {string} timeRange - 时间范围
 * @param {string} startDate - 开始日期 (custom 模式)
 * @param {string} endDate - 结束日期 (custom 模式)
 * @returns {Object} 统计数据
 */
async function calculateKeyStats(keyId, timeRange, startDate, endDate) {
  const client = redis.getClientSafe()
  const tzDate = redis.getDateInTimezone()
  const today = redis.getDateStringInTimezone()

  // 构建搜索模式
  const searchPatterns = []

  if (timeRange === 'custom' && startDate && endDate) {
    // 自定义日期范围
    const start = new Date(startDate)
    const end = new Date(endDate)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = redis.getDateStringInTimezone(d)
      searchPatterns.push(`usage:${keyId}:model:daily:*:${dateStr}`)
    }
  } else if (timeRange === 'today') {
    searchPatterns.push(`usage:${keyId}:model:daily:*:${today}`)
  } else if (timeRange === '7days') {
    // 最近7天
    for (let i = 0; i < 7; i++) {
      const d = new Date(tzDate)
      d.setDate(d.getDate() - i)
      const dateStr = redis.getDateStringInTimezone(d)
      searchPatterns.push(`usage:${keyId}:model:daily:*:${dateStr}`)
    }
  } else if (timeRange === 'monthly') {
    // 当月
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`
    searchPatterns.push(`usage:${keyId}:model:monthly:*:${currentMonth}`)
  } else {
    // all - 获取所有数据（日和月数据都查）
    searchPatterns.push(`usage:${keyId}:model:daily:*`)
    searchPatterns.push(`usage:${keyId}:model:monthly:*`)
  }

  // 使用 SCAN 收集所有匹配的 keys
  const allKeys = []
  for (const pattern of searchPatterns) {
    let cursor = '0'
    do {
      const [newCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
      cursor = newCursor
      allKeys.push(...keys)
    } while (cursor !== '0')
  }

  // 去重（避免日数据和月数据重复计算）
  const uniqueKeys = [...new Set(allKeys)]

  // 获取实时限制数据（窗口数据不受时间范围筛选影响，始终获取当前窗口状态）
  let dailyCost = 0
  let currentWindowCost = 0
  let windowRemainingSeconds = null
  let windowStartTime = null
  let windowEndTime = null
  let allTimeCost = 0

  try {
    // 先获取 API Key 配置，判断是否需要查询限制相关数据
    const apiKey = await redis.getApiKey(keyId)
    const rateLimitWindow = parseInt(apiKey?.rateLimitWindow) || 0
    const dailyCostLimit = parseFloat(apiKey?.dailyCostLimit) || 0
    const totalCostLimit = parseFloat(apiKey?.totalCostLimit) || 0

    // 只在启用了每日费用限制时查询
    if (dailyCostLimit > 0) {
      dailyCost = await redis.getDailyCost(keyId)
    }

    // 只在启用了总费用限制时查询
    if (totalCostLimit > 0) {
      const totalCostKey = `usage:cost:total:${keyId}`
      allTimeCost = parseFloat((await client.get(totalCostKey)) || '0')
    }

    // 🔧 FIX: 对于 "全部时间" 时间范围，直接使用 allTimeCost
    // 因为 usage:*:model:daily:* 键有 30 天 TTL，旧数据已经过期
    if (timeRange === 'all' && allTimeCost > 0) {
      logger.debug(`📊 使用 allTimeCost 计算 timeRange='all': ${allTimeCost}`)

      return {
        requests: 0, // 旧数据详情不可用
        tokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreateTokens: 0,
        cacheReadTokens: 0,
        cost: allTimeCost,
        formattedCost: CostCalculator.formatCost(allTimeCost),
        // 实时限制数据（始终返回，不受时间范围影响）
        dailyCost,
        currentWindowCost,
        windowRemainingSeconds,
        windowStartTime,
        windowEndTime,
        allTimeCost
      }
    }

    // 只在启用了窗口限制时查询窗口数据
    if (rateLimitWindow > 0) {
      const costCountKey = `rate_limit:cost:${keyId}`
      const windowStartKey = `rate_limit:window_start:${keyId}`

      currentWindowCost = parseFloat((await client.get(costCountKey)) || '0')

      // 获取窗口开始时间和计算剩余时间
      const windowStart = await client.get(windowStartKey)
      if (windowStart) {
        const now = Date.now()
        windowStartTime = parseInt(windowStart)
        const windowDuration = rateLimitWindow * 60 * 1000 // 转换为毫秒
        windowEndTime = windowStartTime + windowDuration

        // 如果窗口还有效
        if (now < windowEndTime) {
          windowRemainingSeconds = Math.max(0, Math.floor((windowEndTime - now) / 1000))
        } else {
          // 窗口已过期
          windowRemainingSeconds = 0
          currentWindowCost = 0
        }
      }
    }
  } catch (error) {
    logger.warn(`⚠️ 获取实时限制数据失败 (key: ${keyId}):`, error.message)
  }

  // 如果没有使用数据，返回零值但包含窗口数据
  if (uniqueKeys.length === 0) {
    return {
      requests: 0,
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreateTokens: 0,
      cacheReadTokens: 0,
      cost: 0,
      formattedCost: '$0.00',
      // 实时限制数据（始终返回，不受时间范围影响）
      dailyCost,
      currentWindowCost,
      windowRemainingSeconds,
      windowStartTime,
      windowEndTime,
      allTimeCost
    }
  }

  // 使用 Pipeline 批量获取数据
  const pipeline = client.pipeline()
  for (const key of uniqueKeys) {
    pipeline.hgetall(key)
  }
  const results = await pipeline.exec()

  // 汇总计算
  const modelStatsMap = new Map()
  let totalRequests = 0

  // 用于去重：先统计月数据，避免与日数据重复
  const dailyKeyPattern = /usage:.+:model:daily:(.+):\d{4}-\d{2}-\d{2}$/
  const monthlyKeyPattern = /usage:.+:model:monthly:(.+):\d{4}-\d{2}$/
  const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`

  for (let i = 0; i < results.length; i++) {
    const [err, data] = results[i]
    if (err || !data || Object.keys(data).length === 0) {
      continue
    }

    const key = uniqueKeys[i]
    let model = null
    let isMonthly = false

    // 提取模型名称
    const dailyMatch = key.match(dailyKeyPattern)
    const monthlyMatch = key.match(monthlyKeyPattern)

    if (dailyMatch) {
      model = dailyMatch[1]
    } else if (monthlyMatch) {
      model = monthlyMatch[1]
      isMonthly = true
    }

    if (!model) {
      continue
    }

    // 跳过当前月的月数据
    if (isMonthly && key.includes(`:${currentMonth}`)) {
      continue
    }
    // 跳过非当前月的日数据
    if (!isMonthly && !key.includes(`:${currentMonth}-`)) {
      continue
    }

    if (!modelStatsMap.has(model)) {
      modelStatsMap.set(model, {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreateTokens: 0,
        cacheReadTokens: 0,
        requests: 0
      })
    }

    const stats = modelStatsMap.get(model)
    stats.inputTokens += parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0
    stats.outputTokens += parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0
    stats.cacheCreateTokens +=
      parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0
    stats.cacheReadTokens +=
      parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0
    stats.requests += parseInt(data.totalRequests) || parseInt(data.requests) || 0

    totalRequests += parseInt(data.totalRequests) || parseInt(data.requests) || 0
  }

  // 计算费用
  let totalCost = 0
  let inputTokens = 0
  let outputTokens = 0
  let cacheCreateTokens = 0
  let cacheReadTokens = 0

  for (const [model, stats] of modelStatsMap) {
    inputTokens += stats.inputTokens
    outputTokens += stats.outputTokens
    cacheCreateTokens += stats.cacheCreateTokens
    cacheReadTokens += stats.cacheReadTokens

    const costResult = CostCalculator.calculateCost(
      {
        input_tokens: stats.inputTokens,
        output_tokens: stats.outputTokens,
        cache_creation_input_tokens: stats.cacheCreateTokens,
        cache_read_input_tokens: stats.cacheReadTokens
      },
      model
    )
    totalCost += costResult.costs.total
  }

  const tokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

  return {
    requests: totalRequests,
    tokens,
    inputTokens,
    outputTokens,
    cacheCreateTokens,
    cacheReadTokens,
    cost: totalCost,
    formattedCost: CostCalculator.formatCost(totalCost),
    // 实时限制数据
    dailyCost,
    currentWindowCost,
    windowRemainingSeconds,
    windowStartTime,
    windowEndTime,
    allTimeCost // 历史总费用（用于总费用限制）
  }
}

/**
 * 批量获取指定 Keys 的最后使用账号信息
 * POST /admin/api-keys/batch-last-usage
 *
 * 用于 API Keys 列表页面异步加载最后使用账号数据
 */
router.post('/api-keys/batch-last-usage', authenticateAdmin, async (req, res) => {
  try {
    const { keyIds } = req.body

    // 参数验证
    if (!Array.isArray(keyIds) || keyIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'keyIds is required and must be a non-empty array'
      })
    }

    // 限制单次最多处理 100 个 Key
    if (keyIds.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Max 100 keys per request'
      })
    }

    logger.debug(`📊 Batch last-usage request: ${keyIds.length} keys`)

    const client = redis.getClientSafe()
    const lastUsageData = {}
    const accountInfoCache = new Map()

    // 并行获取每个 Key 的最后使用记录
    await Promise.all(
      keyIds.map(async (keyId) => {
        try {
          // 获取最新的使用记录
          const usageRecords = await redis.getUsageRecords(keyId, 1)
          if (!Array.isArray(usageRecords) || usageRecords.length === 0) {
            lastUsageData[keyId] = null
            return
          }

          const lastUsageRecord = usageRecords[0]
          if (!lastUsageRecord || (!lastUsageRecord.accountId && !lastUsageRecord.accountType)) {
            lastUsageData[keyId] = null
            return
          }

          // 解析账号信息
          const resolvedAccount = await apiKeyService._resolveAccountByUsageRecord(
            lastUsageRecord,
            accountInfoCache,
            client
          )

          if (resolvedAccount) {
            lastUsageData[keyId] = {
              accountId: resolvedAccount.accountId,
              rawAccountId: lastUsageRecord.accountId || resolvedAccount.accountId,
              accountType: resolvedAccount.accountType,
              accountCategory: resolvedAccount.accountCategory,
              accountName: resolvedAccount.accountName,
              recordedAt: lastUsageRecord.timestamp || null
            }
          } else {
            // 账号已删除
            lastUsageData[keyId] = {
              accountId: null,
              rawAccountId: lastUsageRecord.accountId || null,
              accountType: 'deleted',
              accountCategory: 'deleted',
              accountName: '已删除',
              recordedAt: lastUsageRecord.timestamp || null
            }
          }
        } catch (error) {
          logger.debug(`获取 API Key ${keyId} 的最后使用记录失败:`, error)
          lastUsageData[keyId] = null
        }
      })
    )

    return res.json({ success: true, data: lastUsageData })
  } catch (error) {
    logger.error('❌ Failed to get batch last-usage:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to get last-usage data',
      message: error.message
    })
  }
})

// 创建新的API Key
router.post('/api-keys', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      tokenLimit,
      expiresAt,
      claudeAccountId,
      claudeConsoleAccountId,
      geminiAccountId,
      openaiAccountId,
      bedrockAccountId,
      droidAccountId,
      permissions,
      concurrencyLimit,
      rateLimitWindow,
      rateLimitRequests,
      rateLimitCost,
      enableModelRestriction,
      restrictedModels,
      enableClientRestriction,
      allowedClients,
      dailyCostLimit,
      totalCostLimit,
      weeklyOpusCostLimit,
      tags,
      activationDays, // 新增：激活后有效天数
      activationUnit, // 新增：激活时间单位 (hours/days)
      expirationMode, // 新增：过期模式
      icon, // 新增：图标
      serviceRates // API Key 级别服务倍率
    } = req.body

    // 输入验证
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required and must be a non-empty string' })
    }

    if (name.length > 100) {
      return res.status(400).json({ error: 'Name must be less than 100 characters' })
    }

    if (description && (typeof description !== 'string' || description.length > 500)) {
      return res
        .status(400)
        .json({ error: 'Description must be a string with less than 500 characters' })
    }

    if (tokenLimit && (!Number.isInteger(Number(tokenLimit)) || Number(tokenLimit) < 0)) {
      return res.status(400).json({ error: 'Token limit must be a non-negative integer' })
    }

    if (
      concurrencyLimit !== undefined &&
      concurrencyLimit !== null &&
      concurrencyLimit !== '' &&
      (!Number.isInteger(Number(concurrencyLimit)) || Number(concurrencyLimit) < 0)
    ) {
      return res.status(400).json({ error: 'Concurrency limit must be a non-negative integer' })
    }

    if (
      rateLimitWindow !== undefined &&
      rateLimitWindow !== null &&
      rateLimitWindow !== '' &&
      (!Number.isInteger(Number(rateLimitWindow)) || Number(rateLimitWindow) < 1)
    ) {
      return res
        .status(400)
        .json({ error: 'Rate limit window must be a positive integer (minutes)' })
    }

    if (
      rateLimitRequests !== undefined &&
      rateLimitRequests !== null &&
      rateLimitRequests !== '' &&
      (!Number.isInteger(Number(rateLimitRequests)) || Number(rateLimitRequests) < 1)
    ) {
      return res.status(400).json({ error: 'Rate limit requests must be a positive integer' })
    }

    // 验证模型限制字段
    if (enableModelRestriction !== undefined && typeof enableModelRestriction !== 'boolean') {
      return res.status(400).json({ error: 'Enable model restriction must be a boolean' })
    }

    if (restrictedModels !== undefined && !Array.isArray(restrictedModels)) {
      return res.status(400).json({ error: 'Restricted models must be an array' })
    }

    // 验证客户端限制字段
    if (enableClientRestriction !== undefined && typeof enableClientRestriction !== 'boolean') {
      return res.status(400).json({ error: 'Enable client restriction must be a boolean' })
    }

    if (allowedClients !== undefined && !Array.isArray(allowedClients)) {
      return res.status(400).json({ error: 'Allowed clients must be an array' })
    }

    // 验证标签字段
    if (tags !== undefined && !Array.isArray(tags)) {
      return res.status(400).json({ error: 'Tags must be an array' })
    }

    if (tags && tags.some((tag) => typeof tag !== 'string' || tag.trim().length === 0)) {
      return res.status(400).json({ error: 'All tags must be non-empty strings' })
    }

    if (
      totalCostLimit !== undefined &&
      totalCostLimit !== null &&
      totalCostLimit !== '' &&
      (Number.isNaN(Number(totalCostLimit)) || Number(totalCostLimit) < 0)
    ) {
      return res.status(400).json({ error: 'Total cost limit must be a non-negative number' })
    }

    // 验证激活相关字段
    if (expirationMode && !['fixed', 'activation'].includes(expirationMode)) {
      return res
        .status(400)
        .json({ error: 'Expiration mode must be either "fixed" or "activation"' })
    }

    if (expirationMode === 'activation') {
      // 验证激活时间单位
      if (!activationUnit || !['hours', 'days'].includes(activationUnit)) {
        return res.status(400).json({
          error: 'Activation unit must be either "hours" or "days" when using activation mode'
        })
      }

      // 验证激活时间数值
      if (
        !activationDays ||
        !Number.isInteger(Number(activationDays)) ||
        Number(activationDays) < 1
      ) {
        const unitText = activationUnit === 'hours' ? 'hours' : 'days'
        return res.status(400).json({
          error: `Activation ${unitText} must be a positive integer when using activation mode`
        })
      }
      // 激活模式下不应该设置固定过期时间
      if (expiresAt) {
        return res
          .status(400)
          .json({ error: 'Cannot set fixed expiration date when using activation mode' })
      }
    }

    // 验证服务权限字段（支持数组格式）
    const permissionsError = validatePermissions(permissions)
    if (permissionsError) {
      return res.status(400).json({ error: permissionsError })
    }

    // 验证服务倍率
    const serviceRatesError = validateServiceRates(serviceRates)
    if (serviceRatesError) {
      return res.status(400).json({ error: serviceRatesError })
    }

    const newKey = await apiKeyService.generateApiKey({
      name,
      description,
      tokenLimit,
      expiresAt,
      claudeAccountId,
      claudeConsoleAccountId,
      geminiAccountId,
      openaiAccountId,
      bedrockAccountId,
      droidAccountId,
      permissions,
      concurrencyLimit,
      rateLimitWindow,
      rateLimitRequests,
      rateLimitCost,
      enableModelRestriction,
      restrictedModels,
      enableClientRestriction,
      allowedClients,
      dailyCostLimit,
      totalCostLimit,
      weeklyOpusCostLimit,
      tags,
      activationDays,
      activationUnit,
      expirationMode,
      icon,
      serviceRates
    })

    logger.success(`🔑 Admin created new API key: ${name}`)
    return res.json({ success: true, data: newKey })
  } catch (error) {
    logger.error('❌ Failed to create API key:', error)
    return res.status(500).json({ error: 'Failed to create API key', message: error.message })
  }
})

// 批量创建API Keys
router.post('/api-keys/batch', authenticateAdmin, async (req, res) => {
  try {
    const {
      baseName,
      count,
      description,
      tokenLimit,
      expiresAt,
      claudeAccountId,
      claudeConsoleAccountId,
      geminiAccountId,
      openaiAccountId,
      bedrockAccountId,
      droidAccountId,
      permissions,
      concurrencyLimit,
      rateLimitWindow,
      rateLimitRequests,
      rateLimitCost,
      enableModelRestriction,
      restrictedModels,
      enableClientRestriction,
      allowedClients,
      dailyCostLimit,
      totalCostLimit,
      weeklyOpusCostLimit,
      tags,
      activationDays,
      activationUnit,
      expirationMode,
      icon,
      serviceRates
    } = req.body

    // 输入验证
    if (!baseName || typeof baseName !== 'string' || baseName.trim().length === 0) {
      return res.status(400).json({ error: 'Base name is required and must be a non-empty string' })
    }

    if (!count || !Number.isInteger(count) || count < 2 || count > 500) {
      return res.status(400).json({ error: 'Count must be an integer between 2 and 500' })
    }

    if (baseName.length > 90) {
      return res
        .status(400)
        .json({ error: 'Base name must be less than 90 characters to allow for numbering' })
    }

    // 验证服务权限字段（支持数组格式）
    const batchPermissionsError = validatePermissions(permissions)
    if (batchPermissionsError) {
      return res.status(400).json({ error: batchPermissionsError })
    }

    // 验证服务倍率
    const batchServiceRatesError = validateServiceRates(serviceRates)
    if (batchServiceRatesError) {
      return res.status(400).json({ error: batchServiceRatesError })
    }

    // 生成批量API Keys
    const createdKeys = []
    const errors = []

    for (let i = 1; i <= count; i++) {
      try {
        const name = `${baseName}_${i}`
        const newKey = await apiKeyService.generateApiKey({
          name,
          description,
          tokenLimit,
          expiresAt,
          claudeAccountId,
          claudeConsoleAccountId,
          geminiAccountId,
          openaiAccountId,
          bedrockAccountId,
          droidAccountId,
          permissions,
          concurrencyLimit,
          rateLimitWindow,
          rateLimitRequests,
          rateLimitCost,
          enableModelRestriction,
          restrictedModels,
          enableClientRestriction,
          allowedClients,
          dailyCostLimit,
          totalCostLimit,
          weeklyOpusCostLimit,
          tags,
          activationDays,
          activationUnit,
          expirationMode,
          icon,
          serviceRates
        })

        // 保留原始 API Key 供返回
        createdKeys.push({
          ...newKey,
          apiKey: newKey.apiKey
        })
      } catch (error) {
        errors.push({
          index: i,
          name: `${baseName}_${i}`,
          error: error.message
        })
      }
    }

    // 如果有部分失败，返回部分成功的结果
    if (errors.length > 0 && createdKeys.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Failed to create any API keys',
        errors
      })
    }

    // 返回创建的keys（包含完整的apiKey）
    return res.json({
      success: true,
      data: createdKeys,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        requested: count,
        created: createdKeys.length,
        failed: errors.length
      }
    })
  } catch (error) {
    logger.error('Failed to batch create API keys:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to batch create API keys',
      message: error.message
    })
  }
})

// 批量编辑API Keys
router.put('/api-keys/batch', authenticateAdmin, async (req, res) => {
  try {
    const { keyIds, updates } = req.body

    if (!keyIds || !Array.isArray(keyIds) || keyIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'keyIds must be a non-empty array'
      })
    }

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'updates must be an object'
      })
    }

    // 验证服务权限字段（支持数组格式）
    if (updates.permissions !== undefined) {
      const updatePermissionsError = validatePermissions(updates.permissions)
      if (updatePermissionsError) {
        return res.status(400).json({ error: updatePermissionsError })
      }
    }

    // 验证服务倍率
    if (updates.serviceRates !== undefined) {
      const updateServiceRatesError = validateServiceRates(updates.serviceRates)
      if (updateServiceRatesError) {
        return res.status(400).json({ error: updateServiceRatesError })
      }
    }

    logger.info(
      `🔄 Admin batch editing ${keyIds.length} API keys with updates: ${JSON.stringify(updates)}`
    )
    logger.info(`🔍 Debug: keyIds received: ${JSON.stringify(keyIds)}`)

    const results = {
      successCount: 0,
      failedCount: 0,
      errors: []
    }

    // 处理每个API Key
    for (const keyId of keyIds) {
      try {
        // 获取当前API Key信息
        const currentKey = await redis.getApiKey(keyId)
        if (!currentKey || Object.keys(currentKey).length === 0) {
          results.failedCount++
          results.errors.push(`API key ${keyId} not found`)
          continue
        }

        // 构建最终更新数据
        const finalUpdates = {}

        // 处理普通字段
        if (updates.name) {
          finalUpdates.name = updates.name
        }
        if (updates.tokenLimit !== undefined) {
          finalUpdates.tokenLimit = updates.tokenLimit
        }
        if (updates.rateLimitCost !== undefined) {
          finalUpdates.rateLimitCost = updates.rateLimitCost
        }
        if (updates.concurrencyLimit !== undefined) {
          finalUpdates.concurrencyLimit = updates.concurrencyLimit
        }
        if (updates.rateLimitWindow !== undefined) {
          finalUpdates.rateLimitWindow = updates.rateLimitWindow
        }
        if (updates.rateLimitRequests !== undefined) {
          finalUpdates.rateLimitRequests = updates.rateLimitRequests
        }
        if (updates.dailyCostLimit !== undefined) {
          finalUpdates.dailyCostLimit = updates.dailyCostLimit
        }
        if (updates.totalCostLimit !== undefined) {
          finalUpdates.totalCostLimit = updates.totalCostLimit
        }
        if (updates.weeklyOpusCostLimit !== undefined) {
          finalUpdates.weeklyOpusCostLimit = updates.weeklyOpusCostLimit
        }
        if (updates.permissions !== undefined) {
          finalUpdates.permissions = updates.permissions
        }
        if (updates.isActive !== undefined) {
          finalUpdates.isActive = updates.isActive
        }
        if (updates.monthlyLimit !== undefined) {
          finalUpdates.monthlyLimit = updates.monthlyLimit
        }
        if (updates.priority !== undefined) {
          finalUpdates.priority = updates.priority
        }
        if (updates.enabled !== undefined) {
          finalUpdates.enabled = updates.enabled
        }
        if (updates.serviceRates !== undefined) {
          finalUpdates.serviceRates = updates.serviceRates
        }

        // 处理账户绑定
        if (updates.claudeAccountId !== undefined) {
          finalUpdates.claudeAccountId = updates.claudeAccountId
        }
        if (updates.claudeConsoleAccountId !== undefined) {
          finalUpdates.claudeConsoleAccountId = updates.claudeConsoleAccountId
        }
        if (updates.geminiAccountId !== undefined) {
          finalUpdates.geminiAccountId = updates.geminiAccountId
        }
        if (updates.openaiAccountId !== undefined) {
          finalUpdates.openaiAccountId = updates.openaiAccountId
        }
        if (updates.bedrockAccountId !== undefined) {
          finalUpdates.bedrockAccountId = updates.bedrockAccountId
        }
        if (updates.droidAccountId !== undefined) {
          finalUpdates.droidAccountId = updates.droidAccountId || ''
        }

        // 处理标签操作
        if (updates.tags !== undefined) {
          if (updates.tagOperation) {
            const currentTags = currentKey.tags ? JSON.parse(currentKey.tags) : []
            const operationTags = updates.tags

            switch (updates.tagOperation) {
              case 'replace': {
                finalUpdates.tags = operationTags
                break
              }
              case 'add': {
                const newTags = [...currentTags]
                operationTags.forEach((tag) => {
                  if (!newTags.includes(tag)) {
                    newTags.push(tag)
                  }
                })
                finalUpdates.tags = newTags
                break
              }
              case 'remove': {
                finalUpdates.tags = currentTags.filter((tag) => !operationTags.includes(tag))
                break
              }
            }
          } else {
            // 如果没有指定操作类型，默认为替换
            finalUpdates.tags = updates.tags
          }
        }

        // 执行更新
        await apiKeyService.updateApiKey(keyId, finalUpdates)
        results.successCount++
        logger.success(`Batch edit: API key ${keyId} updated successfully`)
      } catch (error) {
        results.failedCount++
        results.errors.push(`Failed to update key ${keyId}: ${error.message}`)
        logger.error(`❌ Batch edit failed for key ${keyId}:`, error)
      }
    }

    // 记录批量编辑结果
    if (results.successCount > 0) {
      logger.success(
        `🎉 Batch edit completed: ${results.successCount} successful, ${results.failedCount} failed`
      )
    } else {
      logger.warn(
        `⚠️ Batch edit completed with no successful updates: ${results.failedCount} failed`
      )
    }

    return res.json({
      success: true,
      message: `批量编辑完成`,
      data: results
    })
  } catch (error) {
    logger.error('❌ Failed to batch edit API keys:', error)
    return res.status(500).json({
      error: 'Batch edit failed',
      message: error.message
    })
  }
})

// 更新API Key
router.put('/api-keys/:keyId', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const {
      name, // 添加名称字段
      tokenLimit,
      concurrencyLimit,
      rateLimitWindow,
      rateLimitRequests,
      rateLimitCost,
      isActive,
      claudeAccountId,
      claudeConsoleAccountId,
      geminiAccountId,
      openaiAccountId,
      bedrockAccountId,
      droidAccountId,
      permissions,
      enableModelRestriction,
      restrictedModels,
      enableClientRestriction,
      allowedClients,
      expiresAt,
      dailyCostLimit,
      totalCostLimit,
      weeklyOpusCostLimit,
      tags,
      ownerId, // 新增：所有者ID字段
      serviceRates // API Key 级别服务倍率
    } = req.body

    // 只允许更新指定字段
    const updates = {}

    // 处理名称字段
    if (name !== undefined && name !== null && name !== '') {
      const trimmedName = name.toString().trim()
      if (trimmedName.length === 0) {
        return res.status(400).json({ error: 'API Key name cannot be empty' })
      }
      if (trimmedName.length > 100) {
        return res.status(400).json({ error: 'API Key name must be less than 100 characters' })
      }
      updates.name = trimmedName
    }

    if (tokenLimit !== undefined && tokenLimit !== null && tokenLimit !== '') {
      if (!Number.isInteger(Number(tokenLimit)) || Number(tokenLimit) < 0) {
        return res.status(400).json({ error: 'Token limit must be a non-negative integer' })
      }
      updates.tokenLimit = Number(tokenLimit)
    }

    if (concurrencyLimit !== undefined && concurrencyLimit !== null && concurrencyLimit !== '') {
      if (!Number.isInteger(Number(concurrencyLimit)) || Number(concurrencyLimit) < 0) {
        return res.status(400).json({ error: 'Concurrency limit must be a non-negative integer' })
      }
      updates.concurrencyLimit = Number(concurrencyLimit)
    }

    if (rateLimitWindow !== undefined && rateLimitWindow !== null && rateLimitWindow !== '') {
      if (!Number.isInteger(Number(rateLimitWindow)) || Number(rateLimitWindow) < 0) {
        return res
          .status(400)
          .json({ error: 'Rate limit window must be a non-negative integer (minutes)' })
      }
      updates.rateLimitWindow = Number(rateLimitWindow)
    }

    if (rateLimitRequests !== undefined && rateLimitRequests !== null && rateLimitRequests !== '') {
      if (!Number.isInteger(Number(rateLimitRequests)) || Number(rateLimitRequests) < 0) {
        return res.status(400).json({ error: 'Rate limit requests must be a non-negative integer' })
      }
      updates.rateLimitRequests = Number(rateLimitRequests)
    }

    if (rateLimitCost !== undefined && rateLimitCost !== null && rateLimitCost !== '') {
      const cost = Number(rateLimitCost)
      if (isNaN(cost) || cost < 0) {
        return res.status(400).json({ error: 'Rate limit cost must be a non-negative number' })
      }
      updates.rateLimitCost = cost
    }

    if (claudeAccountId !== undefined) {
      // 空字符串表示解绑，null或空字符串都设置为空字符串
      updates.claudeAccountId = claudeAccountId || ''
    }

    if (claudeConsoleAccountId !== undefined) {
      // 空字符串表示解绑，null或空字符串都设置为空字符串
      updates.claudeConsoleAccountId = claudeConsoleAccountId || ''
    }

    if (geminiAccountId !== undefined) {
      // 空字符串表示解绑，null或空字符串都设置为空字符串
      updates.geminiAccountId = geminiAccountId || ''
    }

    if (openaiAccountId !== undefined) {
      // 空字符串表示解绑，null或空字符串都设置为空字符串
      updates.openaiAccountId = openaiAccountId || ''
    }

    if (bedrockAccountId !== undefined) {
      // 空字符串表示解绑，null或空字符串都设置为空字符串
      updates.bedrockAccountId = bedrockAccountId || ''
    }

    if (droidAccountId !== undefined) {
      // 空字符串表示解绑，null或空字符串都设置为空字符串
      updates.droidAccountId = droidAccountId || ''
    }

    if (permissions !== undefined) {
      // 验证服务权限字段（支持数组格式）
      const singlePermissionsError = validatePermissions(permissions)
      if (singlePermissionsError) {
        return res.status(400).json({ error: singlePermissionsError })
      }
      updates.permissions = permissions
    }

    // 处理模型限制字段
    if (enableModelRestriction !== undefined) {
      if (typeof enableModelRestriction !== 'boolean') {
        return res.status(400).json({ error: 'Enable model restriction must be a boolean' })
      }
      updates.enableModelRestriction = enableModelRestriction
    }

    if (restrictedModels !== undefined) {
      if (!Array.isArray(restrictedModels)) {
        return res.status(400).json({ error: 'Restricted models must be an array' })
      }
      updates.restrictedModels = restrictedModels
    }

    // 处理客户端限制字段
    if (enableClientRestriction !== undefined) {
      if (typeof enableClientRestriction !== 'boolean') {
        return res.status(400).json({ error: 'Enable client restriction must be a boolean' })
      }
      updates.enableClientRestriction = enableClientRestriction
    }

    if (allowedClients !== undefined) {
      if (!Array.isArray(allowedClients)) {
        return res.status(400).json({ error: 'Allowed clients must be an array' })
      }
      updates.allowedClients = allowedClients
    }

    // 处理过期时间字段
    if (expiresAt !== undefined) {
      if (expiresAt === null) {
        // null 表示永不过期
        updates.expiresAt = null
        updates.isActive = true
      } else {
        // 验证日期格式
        const expireDate = new Date(expiresAt)
        if (isNaN(expireDate.getTime())) {
          return res.status(400).json({ error: 'Invalid expiration date format' })
        }
        updates.expiresAt = expiresAt
        updates.isActive = expireDate > new Date() // 如果过期时间在当前时间之后，则设置为激活状态
      }
    }

    // 处理每日费用限制
    if (dailyCostLimit !== undefined && dailyCostLimit !== null && dailyCostLimit !== '') {
      const costLimit = Number(dailyCostLimit)
      if (isNaN(costLimit) || costLimit < 0) {
        return res.status(400).json({ error: 'Daily cost limit must be a non-negative number' })
      }
      updates.dailyCostLimit = costLimit
    }

    if (totalCostLimit !== undefined && totalCostLimit !== null && totalCostLimit !== '') {
      const costLimit = Number(totalCostLimit)
      if (isNaN(costLimit) || costLimit < 0) {
        return res.status(400).json({ error: 'Total cost limit must be a non-negative number' })
      }
      updates.totalCostLimit = costLimit
    }

    // 处理 Opus 周费用限制
    if (
      weeklyOpusCostLimit !== undefined &&
      weeklyOpusCostLimit !== null &&
      weeklyOpusCostLimit !== ''
    ) {
      const costLimit = Number(weeklyOpusCostLimit)
      // 明确验证非负数（0 表示禁用，负数无意义）
      if (isNaN(costLimit) || costLimit < 0) {
        return res
          .status(400)
          .json({ error: 'Weekly Opus cost limit must be a non-negative number' })
      }
      updates.weeklyOpusCostLimit = costLimit
    }

    // 处理标签
    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        return res.status(400).json({ error: 'Tags must be an array' })
      }
      if (tags.some((tag) => typeof tag !== 'string' || tag.trim().length === 0)) {
        return res.status(400).json({ error: 'All tags must be non-empty strings' })
      }
      updates.tags = tags
    }

    // 处理服务倍率
    if (serviceRates !== undefined) {
      const singleServiceRatesError = validateServiceRates(serviceRates)
      if (singleServiceRatesError) {
        return res.status(400).json({ error: singleServiceRatesError })
      }
      updates.serviceRates = serviceRates
    }

    // 处理活跃/禁用状态状态, 放在过期处理后，以确保后续增加禁用key功能
    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive must be a boolean' })
      }
      updates.isActive = isActive
    }

    // 处理所有者变更
    if (ownerId !== undefined) {
      const userService = require('../../services/userService')

      if (ownerId === 'admin') {
        // 分配给Admin
        updates.userId = ''
        updates.userUsername = ''
        updates.createdBy = 'admin'
      } else if (ownerId) {
        // 分配给用户
        try {
          const user = await userService.getUserById(ownerId, false)
          if (!user) {
            return res.status(400).json({ error: 'Invalid owner: User not found' })
          }
          if (!user.isActive) {
            return res.status(400).json({ error: 'Cannot assign to inactive user' })
          }

          // 设置新的所有者信息
          updates.userId = ownerId
          updates.userUsername = user.username
          updates.createdBy = user.username

          // 管理员重新分配时，不检查用户的API Key数量限制
          logger.info(`🔄 Admin reassigning API key ${keyId} to user ${user.username}`)
        } catch (error) {
          logger.error('Error fetching user for owner reassignment:', error)
          return res.status(400).json({ error: 'Invalid owner ID' })
        }
      } else {
        // 清空所有者（分配给Admin）
        updates.userId = ''
        updates.userUsername = ''
        updates.createdBy = 'admin'
      }
    }

    await apiKeyService.updateApiKey(keyId, updates)

    logger.success(`📝 Admin updated API key: ${keyId}`)
    return res.json({ success: true, message: 'API key updated successfully' })
  } catch (error) {
    logger.error('❌ Failed to update API key:', error)
    return res.status(500).json({ error: 'Failed to update API key', message: error.message })
  }
})

// 修改API Key过期时间（包括手动激活功能）
router.patch('/api-keys/:keyId/expiration', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const { expiresAt, activateNow } = req.body

    // 获取当前API Key信息
    const keyData = await redis.getApiKey(keyId)
    if (!keyData || Object.keys(keyData).length === 0) {
      return res.status(404).json({ error: 'API key not found' })
    }

    const updates = {}

    // 如果是激活操作（用于未激活的key）
    if (activateNow === true) {
      if (keyData.expirationMode === 'activation' && keyData.isActivated !== 'true') {
        const now = new Date()
        const activationDays = parseInt(keyData.activationDays || 30)
        const newExpiresAt = new Date(now.getTime() + activationDays * 24 * 60 * 60 * 1000)

        updates.isActivated = 'true'
        updates.activatedAt = now.toISOString()
        updates.expiresAt = newExpiresAt.toISOString()

        logger.success(
          `🔓 API key manually activated by admin: ${keyId} (${
            keyData.name
          }), expires at ${newExpiresAt.toISOString()}`
        )
      } else {
        return res.status(400).json({
          error: 'Cannot activate',
          message: 'Key is either already activated or not in activation mode'
        })
      }
    }

    // 如果提供了新的过期时间（但不是激活操作）
    if (expiresAt !== undefined && activateNow !== true) {
      // 验证过期时间格式
      if (expiresAt && isNaN(Date.parse(expiresAt))) {
        return res.status(400).json({ error: 'Invalid expiration date format' })
      }

      // 如果设置了过期时间，确保key是激活状态
      if (expiresAt) {
        updates.expiresAt = new Date(expiresAt).toISOString()
        // 如果之前是未激活状态，现在激活它
        if (keyData.isActivated !== 'true') {
          updates.isActivated = 'true'
          updates.activatedAt = new Date().toISOString()
        }
      } else {
        // 清除过期时间（永不过期）
        updates.expiresAt = ''
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' })
    }

    // 更新API Key
    await apiKeyService.updateApiKey(keyId, updates)

    logger.success(`📝 Updated API key expiration: ${keyId} (${keyData.name})`)
    return res.json({
      success: true,
      message: 'API key expiration updated successfully',
      updates
    })
  } catch (error) {
    logger.error('❌ Failed to update API key expiration:', error)
    return res.status(500).json({
      error: 'Failed to update API key expiration',
      message: error.message
    })
  }
})

// 批量删除API Keys（必须在 :keyId 路由之前定义）
router.delete('/api-keys/batch', authenticateAdmin, async (req, res) => {
  try {
    const { keyIds } = req.body

    // 调试信息
    logger.info(`🐛 Batch delete request body: ${JSON.stringify(req.body)}`)
    logger.info(`🐛 keyIds type: ${typeof keyIds}, value: ${JSON.stringify(keyIds)}`)

    // 参数验证
    if (!keyIds || !Array.isArray(keyIds) || keyIds.length === 0) {
      logger.warn(
        `🚨 Invalid keyIds: ${JSON.stringify({
          keyIds,
          type: typeof keyIds,
          isArray: Array.isArray(keyIds)
        })}`
      )
      return res.status(400).json({
        error: 'Invalid request',
        message: 'keyIds 必须是一个非空数组'
      })
    }

    if (keyIds.length > 100) {
      return res.status(400).json({
        error: 'Too many keys',
        message: '每次最多只能删除100个API Keys'
      })
    }

    // 验证keyIds格式
    const invalidKeys = keyIds.filter((id) => !id || typeof id !== 'string')
    if (invalidKeys.length > 0) {
      return res.status(400).json({
        error: 'Invalid key IDs',
        message: '包含无效的API Key ID'
      })
    }

    logger.info(
      `🗑️ Admin attempting batch delete of ${keyIds.length} API keys: ${JSON.stringify(keyIds)}`
    )

    const results = {
      successCount: 0,
      failedCount: 0,
      errors: []
    }

    // 逐个删除，记录成功和失败情况
    for (const keyId of keyIds) {
      try {
        // 检查API Key是否存在
        const apiKey = await redis.getApiKey(keyId)
        if (!apiKey || Object.keys(apiKey).length === 0) {
          results.failedCount++
          results.errors.push({ keyId, error: 'API Key 不存在' })
          continue
        }

        // 执行删除
        await apiKeyService.deleteApiKey(keyId)
        results.successCount++

        logger.success(`Batch delete: API key ${keyId} deleted successfully`)
      } catch (error) {
        results.failedCount++
        results.errors.push({
          keyId,
          error: error.message || '删除失败'
        })

        logger.error(`❌ Batch delete failed for key ${keyId}:`, error)
      }
    }

    // 记录批量删除结果
    if (results.successCount > 0) {
      logger.success(
        `🎉 Batch delete completed: ${results.successCount} successful, ${results.failedCount} failed`
      )
    } else {
      logger.warn(
        `⚠️ Batch delete completed with no successful deletions: ${results.failedCount} failed`
      )
    }

    return res.json({
      success: true,
      message: `批量删除完成`,
      data: results
    })
  } catch (error) {
    logger.error('❌ Failed to batch delete API keys:', error)
    return res.status(500).json({
      error: 'Batch delete failed',
      message: error.message
    })
  }
})

// 删除单个API Key（必须在批量删除路由之后定义）
router.delete('/api-keys/:keyId', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params

    await apiKeyService.deleteApiKey(keyId, req.admin.username, 'admin')

    logger.success(`🗑️ Admin deleted API key: ${keyId}`)
    return res.json({ success: true, message: 'API key deleted successfully' })
  } catch (error) {
    logger.error('❌ Failed to delete API key:', error)
    return res.status(500).json({ error: 'Failed to delete API key', message: error.message })
  }
})

// 📋 获取已删除的API Keys
router.get('/api-keys/deleted', authenticateAdmin, async (req, res) => {
  try {
    const deletedApiKeys = await apiKeyService.getAllApiKeysFast(true) // Include deleted
    const onlyDeleted = deletedApiKeys.filter((key) => key.isDeleted === true)

    // Add additional metadata for deleted keys
    const enrichedKeys = onlyDeleted.map((key) => ({
      ...key,
      isDeleted: key.isDeleted === true,
      deletedAt: key.deletedAt,
      deletedBy: key.deletedBy,
      deletedByType: key.deletedByType,
      canRestore: true // 已删除的API Key可以恢复
    }))

    logger.success(`📋 Admin retrieved ${enrichedKeys.length} deleted API keys`)
    return res.json({ success: true, apiKeys: enrichedKeys, total: enrichedKeys.length })
  } catch (error) {
    logger.error('❌ Failed to get deleted API keys:', error)
    return res
      .status(500)
      .json({ error: 'Failed to retrieve deleted API keys', message: error.message })
  }
})

// 🔄 恢复已删除的API Key
router.post('/api-keys/:keyId/restore', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const adminUsername = req.session?.admin?.username || 'unknown'

    // 调用服务层的恢复方法
    const result = await apiKeyService.restoreApiKey(keyId, adminUsername, 'admin')

    if (result.success) {
      logger.success(`Admin ${adminUsername} restored API key: ${keyId}`)
      return res.json({
        success: true,
        message: 'API Key 已成功恢复',
        apiKey: result.apiKey
      })
    } else {
      return res.status(400).json({
        success: false,
        error: 'Failed to restore API key'
      })
    }
  } catch (error) {
    logger.error('❌ Failed to restore API key:', error)

    // 根据错误类型返回适当的响应
    if (error.message === 'API key not found') {
      return res.status(404).json({
        success: false,
        error: 'API Key 不存在'
      })
    } else if (error.message === 'API key is not deleted') {
      return res.status(400).json({
        success: false,
        error: '该 API Key 未被删除，无需恢复'
      })
    }

    return res.status(500).json({
      success: false,
      error: '恢复 API Key 失败',
      message: error.message
    })
  }
})

// 🗑️ 彻底删除API Key（物理删除）
router.delete('/api-keys/:keyId/permanent', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params
    const adminUsername = req.session?.admin?.username || 'unknown'

    // 调用服务层的彻底删除方法
    const result = await apiKeyService.permanentDeleteApiKey(keyId)

    if (result.success) {
      logger.success(`🗑️ Admin ${adminUsername} permanently deleted API key: ${keyId}`)
      return res.json({
        success: true,
        message: 'API Key 已彻底删除'
      })
    }
  } catch (error) {
    logger.error('❌ Failed to permanently delete API key:', error)

    if (error.message === 'API key not found') {
      return res.status(404).json({
        success: false,
        error: 'API Key 不存在'
      })
    } else if (error.message === '只能彻底删除已经删除的API Key') {
      return res.status(400).json({
        success: false,
        error: '只能彻底删除已经删除的API Key'
      })
    }

    return res.status(500).json({
      success: false,
      error: '彻底删除 API Key 失败',
      message: error.message
    })
  }
})

// 🧹 清空所有已删除的API Keys
router.delete('/api-keys/deleted/clear-all', authenticateAdmin, async (req, res) => {
  try {
    const adminUsername = req.session?.admin?.username || 'unknown'

    // 调用服务层的清空方法
    const result = await apiKeyService.clearAllDeletedApiKeys()

    logger.success(
      `🧹 Admin ${adminUsername} cleared deleted API keys: ${result.successCount}/${result.total}`
    )

    return res.json({
      success: true,
      message: `成功清空 ${result.successCount} 个已删除的 API Keys`,
      details: {
        total: result.total,
        successCount: result.successCount,
        failedCount: result.failedCount,
        errors: result.errors
      }
    })
  } catch (error) {
    logger.error('❌ Failed to clear all deleted API keys:', error)
    return res.status(500).json({
      success: false,
      error: '清空已删除的 API Keys 失败',
      message: error.message
    })
  }
})

module.exports = router
