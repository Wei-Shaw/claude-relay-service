const redis = require('../models/redis')
const crypto = require('crypto')
const logger = require('../utils/logger')
const config = require('../../config/config')

class UserService {
  constructor() {
    this.userPrefix = 'user:'
    this.usernamePrefix = 'username:'
    this.userSessionPrefix = 'user_session:'
  }

  // 🔑 生成用户ID
  generateUserId() {
    return crypto.randomBytes(16).toString('hex')
  }

  // 🔑 生成会话Token
  generateSessionToken() {
    return crypto.randomBytes(32).toString('hex')
  }

  // 👤 创建或更新用户
  async createOrUpdateUser(userData) {
    try {
      const {
        username,
        email,
        displayName,
        firstName,
        lastName,
        role = config.userManagement.defaultUserRole,
        isActive = true
      } = userData

      // 检查用户是否已存在
      let user = await this.getUserByUsername(username)
      const isNewUser = !user

      if (isNewUser) {
        const userId = this.generateUserId()
        user = {
          id: userId,
          username,
          email,
          displayName,
          firstName,
          lastName,
          role,
          isActive,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastLoginAt: null,
          apiKeyCount: 0,
          totalUsage: {
            requests: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalCost: 0
          }
        }
      } else {
        // 更新现有用户信息
        user = {
          ...user,
          email,
          displayName,
          firstName,
          lastName,
          updatedAt: new Date().toISOString()
        }
      }

      // 保存用户信息
      await redis.set(`${this.userPrefix}${user.id}`, JSON.stringify(user))
      await redis.set(`${this.usernamePrefix}${username}`, user.id)
      await redis.addToIndex('user:index', user.id)

      // 如果是新用户，尝试转移匹配的API Keys
      if (isNewUser) {
        await this.transferMatchingApiKeys(user)
      }

      logger.info(`📝 ${isNewUser ? 'Created' : 'Updated'} user: ${username} (${user.id})`)
      return user
    } catch (error) {
      logger.error('❌ Error creating/updating user:', error)
      throw error
    }
  }

  // 👤 通过用户名获取用户
  async getUserByUsername(username) {
    try {
      const userId = await redis.get(`${this.usernamePrefix}${username}`)
      if (!userId) {
        return null
      }

      const userData = await redis.get(`${this.userPrefix}${userId}`)
      return userData ? JSON.parse(userData) : null
    } catch (error) {
      logger.error('❌ Error getting user by username:', error)
      throw error
    }
  }

  // 👤 通过ID获取用户
  async getUserById(userId, calculateUsage = true) {
    try {
      const userData = await redis.get(`${this.userPrefix}${userId}`)
      if (!userData) {
        return null
      }

      const user = JSON.parse(userData)

      // Calculate totalUsage by aggregating user's API keys usage (if requested)
      if (calculateUsage) {
        try {
          const usageStats = await this.calculateUserUsageStats(userId)
          user.totalUsage = usageStats.totalUsage
          user.apiKeyCount = usageStats.apiKeyCount
        } catch (error) {
          logger.error('❌ Error calculating user usage stats:', error)
          // Fallback to stored values if calculation fails
          user.totalUsage = user.totalUsage || {
            requests: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalCost: 0
          }
          user.apiKeyCount = user.apiKeyCount || 0
        }
      }

      return user
    } catch (error) {
      logger.error('❌ Error getting user by ID:', error)
      throw error
    }
  }

  // 📊 计算用户使用统计（通过聚合API Keys）
  async calculateUserUsageStats(userId) {
    try {
      // Use the existing apiKeyService method which already includes usage stats
      const apiKeyService = require('./apiKeyService')
      const userApiKeys = await apiKeyService.getUserApiKeys(userId, true) // Include deleted keys for stats

      const totalUsage = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0
      }

      for (const apiKey of userApiKeys) {
        if (apiKey.usage && apiKey.usage.total) {
          totalUsage.requests += apiKey.usage.total.requests || 0
          totalUsage.inputTokens += apiKey.usage.total.inputTokens || 0
          totalUsage.outputTokens += apiKey.usage.total.outputTokens || 0
          totalUsage.totalCost += apiKey.totalCost || 0
        }
      }

      logger.debug(
        `📊 Calculated user ${userId} usage: ${totalUsage.requests} requests, ${totalUsage.inputTokens} input tokens, $${totalUsage.totalCost.toFixed(4)} total cost from ${userApiKeys.length} API keys`
      )

      // Count only non-deleted API keys for the user's active count（布尔值比较）
      const activeApiKeyCount = userApiKeys.filter((key) => !key.isDeleted).length

      return {
        totalUsage,
        apiKeyCount: activeApiKeyCount
      }
    } catch (error) {
      logger.error('❌ Error calculating user usage stats:', error)
      return {
        totalUsage: {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalCost: 0
        },
        apiKeyCount: 0
      }
    }
  }

  // 📋 获取所有用户列表（管理员功能）
  async getAllUsers(options = {}) {
    try {
      const { page = 1, limit = 20, role, isActive } = options
      const userIds = await redis.getAllIdsByIndex(
        'user:index',
        `${this.userPrefix}*`,
        /^user:(.+)$/
      )
      const keys = userIds.map((id) => `${this.userPrefix}${id}`)
      const dataList = await redis.batchGetChunked(keys)

      const users = []
      for (let i = 0; i < keys.length; i++) {
        const userData = dataList[i]
        if (userData) {
          const user = JSON.parse(userData)

          // 应用过滤条件
          if (role && user.role !== role) {
            continue
          }
          if (typeof isActive === 'boolean' && user.isActive !== isActive) {
            continue
          }

          // Calculate dynamic usage stats for each user
          try {
            const usageStats = await this.calculateUserUsageStats(user.id)
            user.totalUsage = usageStats.totalUsage
            user.apiKeyCount = usageStats.apiKeyCount
          } catch (error) {
            logger.error(`❌ Error calculating usage for user ${user.id}:`, error)
            // Fallback to stored values
            user.totalUsage = user.totalUsage || {
              requests: 0,
              inputTokens: 0,
              outputTokens: 0,
              totalCost: 0
            }
            user.apiKeyCount = user.apiKeyCount || 0
          }

          users.push(user)
        }
      }

      // 排序和分页
      users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      const startIndex = (page - 1) * limit
      const endIndex = startIndex + limit
      const paginatedUsers = users.slice(startIndex, endIndex)

      return {
        users: paginatedUsers,
        total: users.length,
        page,
        limit,
        totalPages: Math.ceil(users.length / limit)
      }
    } catch (error) {
      logger.error('❌ Error getting all users:', error)
      throw error
    }
  }

  // 🔄 更新用户状态
  async updateUserStatus(userId, isActive) {
    try {
      const user = await this.getUserById(userId, false) // Skip usage calculation
      if (!user) {
        throw new Error('User not found')
      }

      user.isActive = isActive
      user.updatedAt = new Date().toISOString()

      await redis.set(`${this.userPrefix}${userId}`, JSON.stringify(user))
      logger.info(`🔄 Updated user status: ${user.username} -> ${isActive ? 'active' : 'disabled'}`)

      // 如果禁用用户，删除所有会话并禁用其所有API Keys
      if (!isActive) {
        await this.invalidateUserSessions(userId)

        // Disable all user's API keys when user is disabled
        try {
          const apiKeyService = require('./apiKeyService')
          const result = await apiKeyService.disableUserApiKeys(userId)
          logger.info(`🔑 Disabled ${result.count} API keys for disabled user: ${user.username}`)
        } catch (error) {
          logger.error('❌ Error disabling user API keys during user disable:', error)
        }
      }

      return user
    } catch (error) {
      logger.error('❌ Error updating user status:', error)
      throw error
    }
  }

  // 🔄 更新用户角色
  async updateUserRole(userId, role) {
    try {
      const user = await this.getUserById(userId, false) // Skip usage calculation
      if (!user) {
        throw new Error('User not found')
      }

      user.role = role
      user.updatedAt = new Date().toISOString()

      await redis.set(`${this.userPrefix}${userId}`, JSON.stringify(user))
      logger.info(`🔄 Updated user role: ${user.username} -> ${role}`)

      return user
    } catch (error) {
      logger.error('❌ Error updating user role:', error)
      throw error
    }
  }

  // 📊 更新用户API Key数量 (已废弃，现在通过聚合计算)
  async updateUserApiKeyCount(userId, _count) {
    // This method is deprecated since apiKeyCount is now calculated dynamically
    // in getUserById by aggregating the user's API keys
    logger.debug(
      `📊 updateUserApiKeyCount called for ${userId} but is now deprecated (count auto-calculated)`
    )
  }

  // 📝 记录用户登录
  async recordUserLogin(userId) {
    try {
      const user = await this.getUserById(userId, false) // Skip usage calculation
      if (!user) {
        return
      }

      user.lastLoginAt = new Date().toISOString()
      await redis.set(`${this.userPrefix}${userId}`, JSON.stringify(user))
    } catch (error) {
      logger.error('❌ Error recording user login:', error)
    }
  }

  // 🎫 创建用户会话
  async createUserSession(userId, sessionData = {}) {
    try {
      const sessionToken = this.generateSessionToken()
      const session = {
        token: sessionToken,
        userId,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + config.userManagement.userSessionTimeout).toISOString(),
        ...sessionData
      }

      const ttl = Math.floor(config.userManagement.userSessionTimeout / 1000)
      await redis.setex(`${this.userSessionPrefix}${sessionToken}`, ttl, JSON.stringify(session))

      logger.info(`🎫 Created session for user: ${userId}`)
      return sessionToken
    } catch (error) {
      logger.error('❌ Error creating user session:', error)
      throw error
    }
  }

  // 🎫 验证用户会话
  async validateUserSession(sessionToken) {
    try {
      const sessionData = await redis.get(`${this.userSessionPrefix}${sessionToken}`)
      if (!sessionData) {
        return null
      }

      const session = JSON.parse(sessionData)

      // 检查会话是否过期
      if (new Date() > new Date(session.expiresAt)) {
        await this.invalidateUserSession(sessionToken)
        return null
      }

      // 获取用户信息
      const user = await this.getUserById(session.userId, false) // Skip usage calculation for validation
      if (!user || !user.isActive) {
        await this.invalidateUserSession(sessionToken)
        return null
      }

      return { session, user }
    } catch (error) {
      logger.error('❌ Error validating user session:', error)
      return null
    }
  }

  // 🚫 使用户会话失效
  async invalidateUserSession(sessionToken) {
    try {
      await redis.del(`${this.userSessionPrefix}${sessionToken}`)
      logger.info(`🚫 Invalidated session: ${sessionToken}`)
    } catch (error) {
      logger.error('❌ Error invalidating user session:', error)
    }
  }

  // 🚫 使用户所有会话失效
  async invalidateUserSessions(userId) {
    try {
      const client = redis.getClientSafe()
      const pattern = `${this.userSessionPrefix}*`
      const keys = await redis.scanKeys(pattern)
      const dataList = await redis.batchGetChunked(keys)

      for (let i = 0; i < keys.length; i++) {
        const sessionData = dataList[i]
        if (sessionData) {
          const session = JSON.parse(sessionData)
          if (session.userId === userId) {
            await client.del(keys[i])
          }
        }
      }

      logger.info(`🚫 Invalidated all sessions for user: ${userId}`)
    } catch (error) {
      logger.error('❌ Error invalidating user sessions:', error)
    }
  }

  // 🚫 使用户除当前会话外的其他会话失效
  async invalidateOtherUserSessions(userId, preserveSessionToken) {
    try {
      const client = redis.getClientSafe()
      const pattern = `${this.userSessionPrefix}*`
      const keys = await redis.scanKeys(pattern)
      const dataList = await redis.batchGetChunked(keys)

      for (let i = 0; i < keys.length; i++) {
        const sessionData = dataList[i]
        if (!sessionData) {
          continue
        }

        const session = JSON.parse(sessionData)
        if (session.userId !== userId || session.token === preserveSessionToken) {
          continue
        }

        await client.del(keys[i])
      }

      logger.info(`🚫 Invalidated other sessions for user: ${userId}`)
    } catch (error) {
      logger.error('❌ Error invalidating other user sessions:', error)
    }
  }

  // 🗑️ 删除用户（软删除，标记为不活跃）
  async deleteUser(userId) {
    try {
      const user = await this.getUserById(userId, false) // Skip usage calculation
      if (!user) {
        throw new Error('User not found')
      }

      // 软删除：标记为不活跃并添加删除时间戳
      user.isActive = false
      user.deletedAt = new Date().toISOString()
      user.updatedAt = new Date().toISOString()

      await redis.set(`${this.userPrefix}${userId}`, JSON.stringify(user))

      // 删除所有会话
      await this.invalidateUserSessions(userId)

      // Disable all user's API keys when user is deleted
      try {
        const apiKeyService = require('./apiKeyService')
        const result = await apiKeyService.disableUserApiKeys(userId)
        logger.info(`🔑 Disabled ${result.count} API keys for deleted user: ${user.username}`)
      } catch (error) {
        logger.error('❌ Error disabling user API keys during user deletion:', error)
      }

      logger.info(`🗑️ Soft deleted user: ${user.username} (${userId})`)
      return user
    } catch (error) {
      logger.error('❌ Error deleting user:', error)
      throw error
    }
  }

  // 📊 获取用户统计信息
  async getUserStats() {
    try {
      const userIds = await redis.getAllIdsByIndex(
        'user:index',
        `${this.userPrefix}*`,
        /^user:(.+)$/
      )
      const keys = userIds.map((id) => `${this.userPrefix}${id}`)
      const dataList = await redis.batchGetChunked(keys)

      const stats = {
        totalUsers: 0,
        activeUsers: 0,
        adminUsers: 0,
        regularUsers: 0,
        totalApiKeys: 0,
        totalUsage: {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalCost: 0
        }
      }

      for (let i = 0; i < keys.length; i++) {
        const userData = dataList[i]
        if (userData) {
          const user = JSON.parse(userData)
          stats.totalUsers++

          if (user.isActive) {
            stats.activeUsers++
          }

          if (user.role === 'admin') {
            stats.adminUsers++
          } else {
            stats.regularUsers++
          }

          // Calculate dynamic usage stats for each user
          try {
            const usageStats = await this.calculateUserUsageStats(user.id)
            stats.totalApiKeys += usageStats.apiKeyCount
            stats.totalUsage.requests += usageStats.totalUsage.requests
            stats.totalUsage.inputTokens += usageStats.totalUsage.inputTokens
            stats.totalUsage.outputTokens += usageStats.totalUsage.outputTokens
            stats.totalUsage.totalCost += usageStats.totalUsage.totalCost
          } catch (error) {
            logger.error(`❌ Error calculating usage for user ${user.id} in stats:`, error)
            // Fallback to stored values if calculation fails
            stats.totalApiKeys += user.apiKeyCount || 0
            stats.totalUsage.requests += user.totalUsage?.requests || 0
            stats.totalUsage.inputTokens += user.totalUsage?.inputTokens || 0
            stats.totalUsage.outputTokens += user.totalUsage?.outputTokens || 0
            stats.totalUsage.totalCost += user.totalUsage?.totalCost || 0
          }
        }
      }

      return stats
    } catch (error) {
      logger.error('❌ Error getting user stats:', error)
      throw error
    }
  }

  // 🔄 转移匹配的API Keys给新用户
  async transferMatchingApiKeys(user) {
    try {
      const apiKeyService = require('./apiKeyService')
      const { displayName, username, email } = user

      // 获取所有API Keys
      const allApiKeys = await apiKeyService.getAllApiKeysFast()

      // 找到没有用户ID的API Keys（即由Admin创建的）
      const unownedApiKeys = allApiKeys.filter((key) => !key.userId || key.userId === '')

      if (unownedApiKeys.length === 0) {
        logger.debug(`📝 No unowned API keys found for potential transfer to user: ${username}`)
        return
      }

      // 构建匹配字符串数组（只考虑displayName、username、email，去除空值和重复值）
      const matchStrings = new Set()
      if (displayName) {
        matchStrings.add(displayName.toLowerCase().trim())
      }
      if (username) {
        matchStrings.add(username.toLowerCase().trim())
      }
      if (email) {
        matchStrings.add(email.toLowerCase().trim())
      }

      const matchingKeys = []

      // 查找名称匹配的API Keys（只进行完全匹配）
      for (const apiKey of unownedApiKeys) {
        const keyName = apiKey.name ? apiKey.name.toLowerCase().trim() : ''

        // 检查API Key名称是否与用户信息完全匹配
        for (const matchString of matchStrings) {
          if (keyName === matchString) {
            matchingKeys.push(apiKey)
            break // 找到匹配后跳出内层循环
          }
        }
      }

      // 转移匹配的API Keys
      let transferredCount = 0
      for (const apiKey of matchingKeys) {
        try {
          await apiKeyService.updateApiKey(apiKey.id, {
            userId: user.id,
            userUsername: user.username,
            createdBy: user.username
          })

          transferredCount++
          logger.info(`🔄 Transferred API key "${apiKey.name}" (${apiKey.id}) to user: ${username}`)
        } catch (error) {
          logger.error(`❌ Failed to transfer API key ${apiKey.id} to user ${username}:`, error)
        }
      }

      if (transferredCount > 0) {
        logger.success(
          `🎉 Successfully transferred ${transferredCount} API key(s) to new user: ${username} (${displayName})`
        )
      } else if (matchingKeys.length === 0) {
        logger.debug(`📝 No matching API keys found for user: ${username} (${displayName})`)
      }
    } catch (error) {
      logger.error('❌ Error transferring matching API keys:', error)
      // Don't throw error to prevent blocking user creation
    }
  }
}

module.exports = new UserService()
