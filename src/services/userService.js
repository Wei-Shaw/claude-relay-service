const redis = require('../models/redis')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
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
      if (!userId) return null

      const userData = await redis.get(`${this.userPrefix}${userId}`)
      return userData ? JSON.parse(userData) : null
    } catch (error) {
      logger.error('❌ Error getting user by username:', error)
      throw error
    }
  }

  // 👤 通过ID获取用户
  async getUserById(userId) {
    try {
      const userData = await redis.get(`${this.userPrefix}${userId}`)
      return userData ? JSON.parse(userData) : null
    } catch (error) {
      logger.error('❌ Error getting user by ID:', error)
      throw error
    }
  }

  // 📋 获取所有用户列表（管理员功能）
  async getAllUsers(options = {}) {
    try {
      const { page = 1, limit = 20, role, isActive } = options
      const pattern = `${this.userPrefix}*`
      const keys = await redis.keys(pattern)
      
      const users = []
      for (const key of keys) {
        const userData = await redis.get(key)
        if (userData) {
          const user = JSON.parse(userData)
          
          // 应用过滤条件
          if (role && user.role !== role) continue
          if (typeof isActive === 'boolean' && user.isActive !== isActive) continue
          
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
      const user = await this.getUserById(userId)
      if (!user) {
        throw new Error('User not found')
      }

      user.isActive = isActive
      user.updatedAt = new Date().toISOString()

      await redis.set(`${this.userPrefix}${userId}`, JSON.stringify(user))
      logger.info(`🔄 Updated user status: ${user.username} -> ${isActive ? 'active' : 'disabled'}`)

      // 如果禁用用户，删除所有会话
      if (!isActive) {
        await this.invalidateUserSessions(userId)
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
      const user = await this.getUserById(userId)
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

  // 📊 更新用户使用统计
  async updateUserUsage(userId, usage) {
    try {
      const user = await this.getUserById(userId)
      if (!user) return

      const { requests = 0, inputTokens = 0, outputTokens = 0, cost = 0 } = usage

      user.totalUsage.requests += requests
      user.totalUsage.inputTokens += inputTokens
      user.totalUsage.outputTokens += outputTokens
      user.totalUsage.totalCost += cost
      user.updatedAt = new Date().toISOString()

      await redis.set(`${this.userPrefix}${userId}`, JSON.stringify(user))
    } catch (error) {
      logger.error('❌ Error updating user usage:', error)
    }
  }

  // 📊 更新用户API Key数量
  async updateUserApiKeyCount(userId, count) {
    try {
      const user = await this.getUserById(userId)
      if (!user) return

      user.apiKeyCount = count
      user.updatedAt = new Date().toISOString()

      await redis.set(`${this.userPrefix}${userId}`, JSON.stringify(user))
    } catch (error) {
      logger.error('❌ Error updating user API key count:', error)
    }
  }

  // 📝 记录用户登录
  async recordUserLogin(userId) {
    try {
      const user = await this.getUserById(userId)
      if (!user) return

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
      if (!sessionData) return null

      const session = JSON.parse(sessionData)
      
      // 检查会话是否过期
      if (new Date() > new Date(session.expiresAt)) {
        await this.invalidateUserSession(sessionToken)
        return null
      }

      // 获取用户信息
      const user = await this.getUserById(session.userId)
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
      const pattern = `${this.userSessionPrefix}*`
      const keys = await redis.keys(pattern)
      
      for (const key of keys) {
        const sessionData = await redis.get(key)
        if (sessionData) {
          const session = JSON.parse(sessionData)
          if (session.userId === userId) {
            await redis.del(key)
          }
        }
      }
      
      logger.info(`🚫 Invalidated all sessions for user: ${userId}`)
    } catch (error) {
      logger.error('❌ Error invalidating user sessions:', error)
    }
  }

  // 🗑️ 删除用户（软删除，标记为不活跃）
  async deleteUser(userId) {
    try {
      const user = await this.getUserById(userId)
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
      const pattern = `${this.userPrefix}*`
      const keys = await redis.keys(pattern)
      
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

      for (const key of keys) {
        const userData = await redis.get(key)
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
          
          stats.totalApiKeys += user.apiKeyCount || 0
          stats.totalUsage.requests += user.totalUsage?.requests || 0
          stats.totalUsage.inputTokens += user.totalUsage?.inputTokens || 0
          stats.totalUsage.outputTokens += user.totalUsage?.outputTokens || 0
          stats.totalUsage.totalCost += user.totalUsage?.totalCost || 0
        }
      }

      return stats
    } catch (error) {
      logger.error('❌ Error getting user stats:', error)
      throw error
    }
  }
}

module.exports = new UserService()