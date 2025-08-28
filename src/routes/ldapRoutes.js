const express = require('express')
const ldapService = require('../services/ldapService')
const logger = require('../utils/logger')

const router = express.Router()

/**
 * 测试LDAP/AD连接
 */
router.get('/test-connection', async (req, res) => {
  try {
    logger.info('LDAP connection test requested')
    const result = await ldapService.testConnection()

    if (result.success) {
      res.json({
        success: true,
        message: 'LDAP/AD connection successful',
        data: result
      })
    } else {
      res.status(500).json({
        success: false,
        message: 'LDAP/AD connection failed',
        error: result.error,
        config: result.config
      })
    }
  } catch (error) {
    logger.error('LDAP connection test error:', error)
    res.status(500).json({
      success: false,
      message: 'LDAP connection test failed',
      error: error.message
    })
  }
})

/**
 * 获取LDAP配置信息
 */
router.get('/config', (req, res) => {
  try {
    const config = ldapService.getConfig()
    res.json({
      success: true,
      config
    })
  } catch (error) {
    logger.error('Get LDAP config error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get LDAP config',
      error: error.message
    })
  }
})

/**
 * 搜索用户
 */
router.post('/search-user', async (req, res) => {
  try {
    const { username } = req.body

    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      })
    }

    logger.info(`Searching for user: ${username}`)

    await ldapService.createConnection()
    await ldapService.bind()

    const users = await ldapService.searchUser(username)

    res.json({
      success: true,
      message: `Found ${users.length} users`,
      users
    })
  } catch (error) {
    logger.error('User search error:', error)
    res.status(500).json({
      success: false,
      message: 'User search failed',
      error: error.message
    })
  } finally {
    ldapService.disconnect()
  }
})

/**
 * 列出所有用户（模拟Python代码的describe_ou功能）
 */
router.get('/list-users', async (req, res) => {
  try {
    const { limit = 20, type = 'human' } = req.query
    const limitNum = parseInt(limit)

    logger.info(`Listing users with limit: ${limitNum}, type: ${type}`)

    await ldapService.createConnection()
    await ldapService.bind()

    const users = await ldapService.listAllUsers(limitNum, type)

    res.json({
      success: true,
      message: `Found ${users.length} users`,
      users,
      total: users.length,
      limit: limitNum,
      type
    })
  } catch (error) {
    logger.error('List users error:', error)
    res.status(500).json({
      success: false,
      message: 'List users failed',
      error: error.message
    })
  } finally {
    ldapService.disconnect()
  }
})

/**
 * 测试用户认证
 */
router.post('/test-auth', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      })
    }

    logger.info(`Testing authentication for user: ${username}`)

    const result = await ldapService.authenticateUser(username, password)

    res.json({
      success: true,
      message: 'Authentication successful',
      user: result.user
    })
  } catch (error) {
    logger.error('User authentication test error:', error)
    res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    })
  }
})

/**
 * 列出所有OU
 */
router.get('/list-ous', async (req, res) => {
  try {
    logger.info('Listing all OUs in domain')

    await ldapService.createConnection()
    await ldapService.bind()

    const ous = await ldapService.listOUs()

    res.json({
      success: true,
      message: `Found ${ous.length} OUs`,
      ous
    })
  } catch (error) {
    logger.error('List OUs error:', error)
    res.status(500).json({
      success: false,
      message: 'List OUs failed',
      error: error.message
    })
  } finally {
    ldapService.disconnect()
  }
})

/**
 * 验证OU是否存在
 */
router.get('/verify-ou', async (req, res) => {
  try {
    const defaultOU = process.env.LDAP_DEFAULT_OU || 'YourOU'
    const { ou = defaultOU } = req.query
    // 使用配置的baseDN来构建测试DN，而不是硬编码域名
    const config = ldapService.getConfig()
    // 从baseDN中提取域部分，替换OU部分
    const baseDNParts = config.baseDN.split(',')
    const domainParts = baseDNParts.filter((part) => part.trim().startsWith('DC='))
    const testDN = `OU=${ou},${domainParts.join(',')}`

    logger.info(`Verifying OU exists: ${testDN}`)

    await ldapService.createConnection()
    await ldapService.bind()

    const result = await ldapService.verifyOU(testDN)

    res.json({
      success: true,
      message: 'OU verification completed',
      testDN,
      result
    })
  } catch (error) {
    logger.error('OU verification error:', error)
    res.status(500).json({
      success: false,
      message: 'OU verification failed',
      error: error.message
    })
  } finally {
    ldapService.disconnect()
  }
})

/**
 * LDAP服务状态检查
 */
router.get('/status', async (req, res) => {
  try {
    const config = ldapService.getConfig()

    // 简单的连接测试
    const connectionTest = await ldapService.testConnection()

    res.json({
      success: true,
      status: connectionTest.success ? 'connected' : 'disconnected',
      config,
      lastTest: new Date().toISOString(),
      testResult: connectionTest
    })
  } catch (error) {
    logger.error('LDAP status check error:', error)
    res.status(500).json({
      success: false,
      status: 'error',
      message: 'Status check failed',
      error: error.message
    })
  }
})

/**
 * AD用户登录认证
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      })
    }

    logger.info(`AD用户登录尝试: ${username}`)

    // 使用AD认证用户
    const authResult = await ldapService.authenticateUser(username, password)

    // 生成用户会话token
    const jwt = require('jsonwebtoken')
    const config = require('../../config/config')

    const userInfo = {
      type: 'ad_user',
      username: authResult.user.username || authResult.user.cn,
      displayName: authResult.user.displayName,
      email: authResult.user.email,
      groups: authResult.user.groups,
      loginTime: new Date().toISOString()
    }

    const token = jwt.sign(userInfo, config.security.jwtSecret, {
      expiresIn: '8h' // 8小时过期
    })

    logger.info(`AD用户登录成功: ${username}`)

    res.json({
      success: true,
      message: '登录成功',
      token,
      user: userInfo
    })
  } catch (error) {
    logger.error('AD用户登录失败:', error)
    res.status(401).json({
      success: false,
      message: '用户名或密码错误',
      error: error.message
    })
  }
})

/**
 * AD用户token验证
 */
router.get('/verify-token', (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: '未提供有效的认证token'
      })
    }

    const token = authHeader.substring(7)
    const jwt = require('jsonwebtoken')
    const config = require('../../config/config')

    const decoded = jwt.verify(token, config.security.jwtSecret)

    if (decoded.type !== 'ad_user') {
      return res.status(403).json({
        success: false,
        message: '无效的用户类型'
      })
    }

    res.json({
      success: true,
      user: decoded
    })
  } catch (error) {
    logger.error('Token验证失败:', error)
    res.status(401).json({
      success: false,
      message: 'Token无效或已过期'
    })
  }
})

/**
 * AD用户认证中间件
 */
const authenticateUser = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: '未提供有效的认证token'
      })
    }

    const token = authHeader.substring(7)
    const jwt = require('jsonwebtoken')
    const config = require('../../config/config')

    const decoded = jwt.verify(token, config.security.jwtSecret)

    if (decoded.type !== 'ad_user') {
      return res.status(403).json({
        success: false,
        message: '无效的用户类型'
      })
    }

    req.user = decoded
    next()
  } catch (error) {
    logger.error('用户认证失败:', error)
    res.status(401).json({
      success: false,
      message: 'Token无效或已过期'
    })
  }
}

/**
 * 获取用户的API Keys
 *
 * 自动关联逻辑说明:
 * 系统迁移过程中存在历史API Key，这些Key是在AD集成前手动创建的
 * 创建时使用的name字段恰好与AD用户的displayName一致
 * 例如: AD用户displayName为"测试用户"，对应的API Key name也是"测试用户"
 * 为了避免用户重复创建Key，系统会自动关联这些历史Key
 * 关联规则:
 * 1. 优先匹配owner字段(新建的Key)
 * 2. 如果没有owner匹配，则尝试匹配name字段与displayName
 * 3. 找到匹配的历史Key后，自动将owner设置为当前用户，完成关联
 */
router.get('/user/api-keys', authenticateUser, async (req, res) => {
  try {
    const apiKeyService = require('../services/apiKeyService')
    const redis = require('../models/redis')
    const { username, displayName } = req.user

    logger.info(`获取用户API Keys: ${username}, displayName: ${displayName}`)

    // 使用与admin相同的API Key服务，获取所有API Keys的完整信息
    const allApiKeys = await apiKeyService.getAllApiKeys()

    const userKeys = []
    let foundHistoricalKey = false

    // 筛选属于该用户的API Keys，并处理自动关联
    for (const apiKey of allApiKeys) {
      logger.debug(
        `检查API Key: ${apiKey.id}, name: "${apiKey.name}", owner: "${apiKey.owner || '无'}", displayName: "${displayName}"`
      )

      // 规则1: 直接owner匹配(已关联的Key)
      if (apiKey.owner === username) {
        logger.info(`找到已关联的API Key: ${apiKey.id}`)
        userKeys.push(apiKey)
      }
      // 规则2: 历史Key自动关联(name字段匹配displayName且无owner)
      else if (displayName && apiKey.name === displayName && !apiKey.owner) {
        logger.info(
          `🔗 发现历史API Key需要关联: id=${apiKey.id}, name="${apiKey.name}", displayName="${displayName}"`
        )

        // 自动关联: 设置owner为当前用户
        await redis.getClient().hset(`apikey:${apiKey.id}`, 'owner', username)
        foundHistoricalKey = true

        // 更新本地数据并添加到用户Key列表
        apiKey.owner = username
        userKeys.push(apiKey)

        logger.info(`✅ 历史API Key关联成功: ${apiKey.id} -> ${username}`)
      }
    }

    if (foundHistoricalKey) {
      logger.info(`用户 ${username} 自动关联了历史API Key`)
    }

    res.json({
      success: true,
      apiKeys: userKeys
    })
  } catch (error) {
    logger.error('获取用户API Keys失败:', error)
    res.status(500).json({
      success: false,
      message: '获取API Keys失败'
    })
  }
})

/**
 * 创建用户API Key
 */
router.post('/user/api-keys', authenticateUser, async (req, res) => {
  try {
    const { username } = req.user
    // 用户创建的API Key不需要任何输入参数，都使用默认值
    // const { limit } = req.body // 不再从请求体获取limit

    // 检查用户是否已有API Key
    const redis = require('../models/redis')
    const allKeysPattern = 'apikey:*'
    const keys = await redis.getClient().keys(allKeysPattern)

    let userKeyCount = 0
    for (const key of keys) {
      const apiKeyData = await redis.getClient().hgetall(key)
      if (apiKeyData && apiKeyData.owner === username) {
        userKeyCount++
      }
    }

    if (userKeyCount >= 1) {
      return res.status(400).json({
        success: false,
        message: '每个用户只能创建一个API Key'
      })
    }

    // 使用与admin相同的API Key生成服务，确保数据结构一致性
    const apiKeyService = require('../services/apiKeyService')

    // 获取用户的显示名称
    const { displayName } = req.user
    // 用户创建的API Key名称固定为displayName，不允许自定义
    const defaultName = displayName || username

    const keyParams = {
      name: defaultName, // 使用displayName作为API Key名称
      tokenLimit: 0, // 固定为无限制
      description: `AD用户${username}创建的API Key`,
      // AD用户创建的Key添加owner信息以区分用户归属
      owner: username,
      ownerType: 'ad_user',
      // 确保用户创建的Key默认激活
      isActive: true,
      // 设置基本权限（与admin创建保持一致）
      permissions: 'all',
      // 设置合理的并发和速率限制（与admin创建保持一致）
      concurrencyLimit: 0,
      rateLimitWindow: 0,
      rateLimitRequests: 0,
      // 添加标签标识AD用户创建
      tags: ['ad-user', 'user-created']
    }

    const newKey = await apiKeyService.generateApiKey(keyParams)

    logger.info(`用户${username}创建API Key成功: ${newKey.id}`)

    res.json({
      success: true,
      message: 'API Key创建成功',
      apiKey: {
        id: newKey.id,
        key: newKey.apiKey, // 返回完整的API Key
        name: newKey.name,
        tokenLimit: newKey.tokenLimit || 0,
        used: 0,
        createdAt: newKey.createdAt,
        isActive: true,
        usage: {
          daily: { requests: 0, tokens: 0 },
          total: { requests: 0, tokens: 0 }
        },
        dailyCost: 0
      }
    })
  } catch (error) {
    logger.error('创建用户API Key失败:', error)
    res.status(500).json({
      success: false,
      message: '创建API Key失败'
    })
  }
})

/**
 * 获取用户API Key使用统计
 */
router.get('/user/usage-stats', authenticateUser, async (req, res) => {
  try {
    const { username } = req.user
    const redis = require('../models/redis')

    // 获取用户的API Keys
    const allKeysPattern = 'apikey:*'
    const keys = await redis.getClient().keys(allKeysPattern)

    let totalUsage = 0
    let totalLimit = 0
    const userKeys = []

    for (const key of keys) {
      const apiKeyData = await redis.getClient().hgetall(key)
      if (apiKeyData && apiKeyData.owner === username) {
        const used = parseInt(apiKeyData.used) || 0
        const limit = parseInt(apiKeyData.limit) || 0

        totalUsage += used
        totalLimit += limit

        userKeys.push({
          id: apiKeyData.id,
          name: apiKeyData.name,
          used,
          limit,
          percentage: limit > 0 ? Math.round((used / limit) * 100) : 0
        })
      }
    }

    res.json({
      success: true,
      stats: {
        totalUsage,
        totalLimit,
        percentage: totalLimit > 0 ? Math.round((totalUsage / totalLimit) * 100) : 0,
        keyCount: userKeys.length,
        keys: userKeys
      }
    })
  } catch (error) {
    logger.error('获取用户使用统计失败:', error)
    res.status(500).json({
      success: false,
      message: '获取使用统计失败'
    })
  }
})

/**
 * 更新用户API Key
 */
router.put('/user/api-keys/:keyId', authenticateUser, async (req, res) => {
  try {
    const { username } = req.user
    const { keyId } = req.params
    const updates = req.body

    // 验证用户只能编辑自己的API Key
    const apiKeyService = require('../services/apiKeyService')
    const allApiKeys = await apiKeyService.getAllApiKeys()
    const apiKey = allApiKeys.find((key) => key.id === keyId && key.owner === username)

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API Key 不存在或无权限'
      })
    }

    // 限制用户只能修改特定字段（不允许修改name）
    const allowedFields = ['description', 'isActive']
    const filteredUpdates = {}
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = value
      }
    }

    await apiKeyService.updateApiKey(keyId, filteredUpdates)

    logger.info(`用户 ${username} 更新了 API Key: ${keyId}`)

    res.json({
      success: true,
      message: 'API Key 更新成功'
    })
  } catch (error) {
    logger.error('更新用户API Key失败:', error)
    res.status(500).json({
      success: false,
      message: '更新 API Key 失败'
    })
  }
})

/**
 * 删除用户API Key
 */
router.delete('/user/api-keys/:keyId', authenticateUser, async (req, res) => {
  try {
    const { username } = req.user
    const { keyId } = req.params

    // 验证用户只能删除自己的API Key
    const apiKeyService = require('../services/apiKeyService')
    const allApiKeys = await apiKeyService.getAllApiKeys()
    const apiKey = allApiKeys.find((key) => key.id === keyId && key.owner === username)

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API Key 不存在或无权限'
      })
    }

    await apiKeyService.deleteApiKey(keyId)

    logger.info(`用户 ${username} 删除了 API Key: ${keyId}`)

    res.json({
      success: true,
      message: 'API Key 删除成功'
    })
  } catch (error) {
    logger.error('删除用户API Key失败:', error)
    res.status(500).json({
      success: false,
      message: '删除 API Key 失败'
    })
  }
})

module.exports = router
