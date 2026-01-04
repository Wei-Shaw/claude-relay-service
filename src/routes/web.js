const express = require('express')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const redis = require('../models/redis')
const logger = require('../utils/logger')
const config = require('../../config/config')

const router = express.Router()

// 🏠 服务静态文件
router.use('/assets', express.static(path.join(__dirname, '../../web/assets')))

// 🌐 页面路由重定向到新版 admin-spa
router.get('/', (req, res) => {
  res.redirect(301, '/admin-next/api-stats')
})

// 🔐 管理员登录
router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'Username and password are required'
      })
    }

    // 从Redis获取管理员信息
    let adminData = await redis.getSession('admin_credentials')

    // 如果Redis中没有管理员凭据，尝试从init.json重新加载
    if (!adminData || Object.keys(adminData).length === 0) {
      const initFilePath = path.join(__dirname, '../../data/init.json')

      if (fs.existsSync(initFilePath)) {
        try {
          const initData = JSON.parse(fs.readFileSync(initFilePath, 'utf8'))
          const saltRounds = 10
          const passwordHash = await bcrypt.hash(initData.adminPassword, saltRounds)

          adminData = {
            username: initData.adminUsername,
            passwordHash,
            createdAt: initData.initializedAt || new Date().toISOString(),
            lastLogin: null,
            updatedAt: initData.updatedAt || null
          }

          // 重新存储到Redis，不设置过期时间
          await redis.getClient().hset('session:admin_credentials', adminData)

          logger.info('✅ Admin credentials reloaded from init.json')
        } catch (error) {
          logger.error('❌ Failed to reload admin credentials:', error)
          return res.status(401).json({
            error: 'Invalid credentials',
            message: 'Invalid username or password'
          })
        }
      } else {
        return res.status(401).json({
          error: 'Invalid credentials',
          message: 'Invalid username or password'
        })
      }
    }

    // 验证用户名和密码
    const isValidUsername = adminData.username === username
    const isValidPassword = await bcrypt.compare(password, adminData.passwordHash)

    if (!isValidUsername || !isValidPassword) {
      logger.security(`Failed login attempt for username: ${username}`)
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Invalid username or password'
      })
    }

    // 生成会话token
    const sessionId = crypto.randomBytes(32).toString('hex')

    // 存储会话
    const sessionData = {
      username: adminData.username,
      loginTime: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    }

    await redis.setSession(sessionId, sessionData, config.security.adminSessionTimeout)

    // 不再更新 Redis 中的最后登录时间，因为 Redis 只是缓存
    // init.json 是唯一真实数据源

    logger.success(`Admin login successful: ${username}`)

    return res.json({
      success: true,
      token: sessionId,
      expiresIn: config.security.adminSessionTimeout,
      username: adminData.username // 返回真实用户名
    })
  } catch (error) {
    logger.error('❌ Login error:', error)
    return res.status(500).json({
      error: 'Login failed',
      message: 'Internal server error'
    })
  }
})

// 🚪 管理员登出
router.post('/auth/logout', async (req, res) => {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '') || req.cookies?.adminToken

    if (token) {
      await redis.deleteSession(token)
      logger.success('🚪 Admin logout successful')
    }

    return res.json({ success: true, message: 'Logout successful' })
  } catch (error) {
    logger.error('❌ Logout error:', error)
    return res.status(500).json({
      error: 'Logout failed',
      message: 'Internal server error'
    })
  }
})

// 🔑 修改账户信息
router.post('/auth/change-password', async (req, res) => {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '') || req.cookies?.adminToken

    if (!token) {
      return res.status(401).json({
        error: 'No token provided',
        message: 'Authentication required'
      })
    }

    const { newUsername, currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Current password and new password are required'
      })
    }

    // 验证新密码长度
    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'Password too short',
        message: 'New password must be at least 8 characters long'
      })
    }

    // 获取当前会话
    const sessionData = await redis.getSession(token)

    // 🔒 安全修复：检查空对象
    if (!sessionData || Object.keys(sessionData).length === 0) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Session expired or invalid'
      })
    }

    // 🔒 安全修复：验证会话完整性
    if (!sessionData.username || !sessionData.loginTime) {
      logger.security(
        `🔒 Invalid session structure in /auth/change-password from ${req.ip || 'unknown'}`
      )
      await redis.deleteSession(token)
      return res.status(401).json({
        error: 'Invalid session',
        message: 'Session data corrupted or incomplete'
      })
    }

    // 获取当前管理员信息
    const adminData = await redis.getSession('admin_credentials')
    if (!adminData) {
      return res.status(500).json({
        error: 'Admin data not found',
        message: 'Administrator credentials not found'
      })
    }

    // 验证当前密码
    const isValidPassword = await bcrypt.compare(currentPassword, adminData.passwordHash)
    if (!isValidPassword) {
      logger.security(`Invalid current password attempt for user: ${sessionData.username}`)
      return res.status(401).json({
        error: 'Invalid current password',
        message: 'Current password is incorrect'
      })
    }

    // 准备更新的数据
    const updatedUsername =
      newUsername && newUsername.trim() ? newUsername.trim() : adminData.username

    // 先更新 init.json（唯一真实数据源）
    const initFilePath = path.join(__dirname, '../../data/init.json')
    if (!fs.existsSync(initFilePath)) {
      return res.status(500).json({
        error: 'Configuration file not found',
        message: 'init.json file is missing'
      })
    }

    try {
      const initData = JSON.parse(fs.readFileSync(initFilePath, 'utf8'))
      // const oldData = { ...initData }; // 备份旧数据

      // 更新 init.json
      initData.adminUsername = updatedUsername
      initData.adminPassword = newPassword // 保存明文密码到init.json
      initData.updatedAt = new Date().toISOString()

      // 先写入文件（如果失败则不会影响 Redis）
      fs.writeFileSync(initFilePath, JSON.stringify(initData, null, 2))

      // 文件写入成功后，更新 Redis 缓存
      const saltRounds = 10
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds)

      const updatedAdminData = {
        username: updatedUsername,
        passwordHash: newPasswordHash,
        createdAt: adminData.createdAt,
        lastLogin: adminData.lastLogin,
        updatedAt: new Date().toISOString()
      }

      await redis.setSession('admin_credentials', updatedAdminData)
    } catch (fileError) {
      logger.error('❌ Failed to update init.json:', fileError)
      return res.status(500).json({
        error: 'Update failed',
        message: 'Failed to update configuration file'
      })
    }

    // 清除当前会话（强制用户重新登录）
    await redis.deleteSession(token)

    logger.success(`Admin password changed successfully for user: ${updatedUsername}`)

    return res.json({
      success: true,
      message: 'Password changed successfully. Please login again.',
      newUsername: updatedUsername
    })
  } catch (error) {
    logger.error('❌ Change password error:', error)
    return res.status(500).json({
      error: 'Change password failed',
      message: 'Internal server error'
    })
  }
})

// 👤 获取当前用户信息
router.get('/auth/user', async (req, res) => {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '') || req.cookies?.adminToken

    if (!token) {
      return res.status(401).json({
        error: 'No token provided',
        message: 'Authentication required'
      })
    }

    // 获取当前会话
    const sessionData = await redis.getSession(token)

    // 🔒 安全修复：检查空对象
    if (!sessionData || Object.keys(sessionData).length === 0) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Session expired or invalid'
      })
    }

    // 🔒 安全修复：验证会话完整性
    if (!sessionData.username || !sessionData.loginTime) {
      logger.security(`Invalid session structure in /auth/user from ${req.ip || 'unknown'}`)
      await redis.deleteSession(token)
      return res.status(401).json({
        error: 'Invalid session',
        message: 'Session data corrupted or incomplete'
      })
    }

    // 获取管理员信息
    const adminData = await redis.getSession('admin_credentials')
    if (!adminData) {
      return res.status(500).json({
        error: 'Admin data not found',
        message: 'Administrator credentials not found'
      })
    }

    return res.json({
      success: true,
      user: {
        username: adminData.username,
        loginTime: sessionData.loginTime,
        lastActivity: sessionData.lastActivity
      }
    })
  } catch (error) {
    logger.error('❌ Get user info error:', error)
    return res.status(500).json({
      error: 'Get user info failed',
      message: 'Internal server error'
    })
  }
})

// 🔄 刷新token
router.post('/auth/refresh', async (req, res) => {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '') || req.cookies?.adminToken

    if (!token) {
      return res.status(401).json({
        error: 'No token provided',
        message: 'Authentication required'
      })
    }

    const sessionData = await redis.getSession(token)

    // 🔒 安全修复：检查空对象（hgetall 对不存在的 key 返回 {}）
    if (!sessionData || Object.keys(sessionData).length === 0) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Session expired or invalid'
      })
    }

    // 🔒 安全修复：验证会话完整性（必须有 username 和 loginTime）
    if (!sessionData.username || !sessionData.loginTime) {
      logger.security(`Invalid session structure detected from ${req.ip || 'unknown'}`)
      await redis.deleteSession(token) // 清理无效/伪造的会话
      return res.status(401).json({
        error: 'Invalid session',
        message: 'Session data corrupted or incomplete'
      })
    }

    // 更新最后活动时间
    sessionData.lastActivity = new Date().toISOString()
    await redis.setSession(token, sessionData, config.security.adminSessionTimeout)

    return res.json({
      success: true,
      token,
      expiresIn: config.security.adminSessionTimeout
    })
  } catch (error) {
    logger.error('❌ Token refresh error:', error)
    return res.status(500).json({
      error: 'Token refresh failed',
      message: 'Internal server error'
    })
  }
})

module.exports = router
