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
    const { ou = '微店' } = req.query
    const testDN = `OU=${ou},DC=corp,DC=weidian-inc,DC=com`

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
    const redis = require('../models/redis')
    const { username, displayName } = req.user

    logger.info(`获取用户API Keys: ${username}, displayName: ${displayName}`)
    logger.info(`用户完整信息: ${JSON.stringify(req.user)}`)

    // 获取所有API Keys
    const allKeysPattern = 'api_key:*'
    const keys = await redis.getClient().keys(allKeysPattern)

    const userKeys = []
    let foundHistoricalKey = false

    // 筛选属于该用户的API Keys
    for (const key of keys) {
      const apiKeyData = await redis.getClient().hgetall(key)
      if (!apiKeyData) {
        continue
      }

      // 规则1: 直接owner匹配(已关联的Key)
      if (apiKeyData.owner === username) {
        userKeys.push({
          id: apiKeyData.id,
          name: apiKeyData.name || '未命名',
          key: apiKeyData.key,
          limit: parseInt(apiKeyData.limit) || 1000000,
          used: parseInt(apiKeyData.used) || 0,
          createdAt: apiKeyData.createdAt,
          status: apiKeyData.status || 'active'
        })
      }
      // 规则2: 历史Key自动关联(name字段匹配displayName且无owner)
      else if (displayName && apiKeyData.name === displayName && !apiKeyData.owner) {
        logger.info(`发现历史API Key需要关联: name=${apiKeyData.name}, displayName=${displayName}`)

        // 自动关联: 设置owner为当前用户
        await redis.getClient().hset(key, 'owner', username)
        foundHistoricalKey = true

        userKeys.push({
          id: apiKeyData.id,
          name: apiKeyData.name || '未命名',
          key: apiKeyData.key,
          limit: parseInt(apiKeyData.limit) || 1000000,
          used: parseInt(apiKeyData.used) || 0,
          createdAt: apiKeyData.createdAt,
          status: apiKeyData.status || 'active'
        })

        logger.info(`历史API Key关联成功: ${apiKeyData.id} -> ${username}`)
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
    const { name, limit } = req.body

    // 检查用户是否已有API Key
    const redis = require('../models/redis')
    const allKeysPattern = 'api_key:*'
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

    // 生成API Key
    const crypto = require('crypto')
    const uuid = require('uuid')

    const keyId = uuid.v4()
    const apiKey = `cr_${crypto.randomBytes(32).toString('hex')}`

    const keyData = {
      id: keyId,
      key: apiKey,
      name: name || 'AD用户密钥',
      limit: limit || 100000,
      used: 0,
      owner: username,
      ownerType: 'ad_user',
      createdAt: new Date().toISOString(),
      status: 'active'
    }

    // 存储到Redis
    await redis.getClient().hset(`api_key:${keyId}`, keyData)

    // 创建哈希映射以快速查找
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')
    await redis.getClient().set(`api_key_hash:${keyHash}`, keyId)

    logger.info(`用户${username}创建API Key成功: ${keyId}`)

    res.json({
      success: true,
      message: 'API Key创建成功',
      apiKey: {
        id: keyId,
        key: apiKey,
        name: keyData.name,
        limit: keyData.limit,
        used: 0,
        createdAt: keyData.createdAt,
        status: keyData.status
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
    const allKeysPattern = 'api_key:*'
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

module.exports = router
