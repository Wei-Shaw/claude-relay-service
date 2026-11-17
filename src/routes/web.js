const express = require('express')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const redis = require('../models/redis')
const TwoFactorService = require('../services/twoFactorService')
const logger = require('../utils/logger')
const config = require('../../config/config')

const router = express.Router()
const TWO_FACTOR_ISSUER = 'Claude Relay Service'
const twoFactorService = new TwoFactorService({
  redis,
  encryptionKey: config.security.encryptionKey,
  challengeTtlMs: config.security.twoFactorPendingLoginTtlMs,
  maxChallengeAttempts: config.security.twoFactorMaxChallengeAttempts,
  recoveryCodesCount: config.security.twoFactorRecoveryCodesCount
})

function buildAdminSession(username) {
  const now = new Date().toISOString()
  return {
    token: crypto.randomBytes(32).toString('hex'),
    sessionData: {
      username,
      loginTime: now,
      lastActivity: now
    }
  }
}

function extractAdminToken(req) {
  return req.headers['authorization']?.replace(/^Bearer\s+/i, '') || req.cookies?.adminToken
}

function initFilePath() {
  return path.join(__dirname, '../../data/init.json')
}

async function loadAdminCredentials() {
  let adminData = await redis.getSession('admin_credentials')

  if (!adminData || Object.keys(adminData).length === 0) {
    const filePath = initFilePath()

    if (!fs.existsSync(filePath)) {
      return null
    }

    const initData = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const passwordHash = await bcrypt.hash(initData.adminPassword, 10)

    adminData = {
      username: initData.adminUsername,
      passwordHash,
      createdAt: initData.initializedAt || new Date().toISOString(),
      lastLogin: null,
      updatedAt: initData.updatedAt || null
    }

    await redis.getClient().hset('session:admin_credentials', adminData)
    logger.info('✅ Admin credentials reloaded from init.json')
  }

  return adminData
}

async function getAdminRequestContext(req, res) {
  const token = extractAdminToken(req)

  if (!token) {
    res.status(401).json({
      error: 'No token provided',
      message: 'Authentication required'
    })
    return null
  }

  const sessionData = await redis.getSession(token)
  if (!sessionData || Object.keys(sessionData).length === 0) {
    res.status(401).json({
      error: 'Invalid token',
      message: 'Session expired or invalid'
    })
    return null
  }

  if (!sessionData.username || !sessionData.loginTime) {
    logger.security(`Invalid session structure in admin 2FA route from ${req.ip || 'unknown'}`)
    await redis.deleteSession(token)
    res.status(401).json({
      error: 'Invalid session',
      message: 'Session data corrupted or incomplete'
    })
    return null
  }

  const adminData = await loadAdminCredentials()
  if (!adminData) {
    res.status(500).json({
      error: 'Admin data not found',
      message: 'Administrator credentials not found'
    })
    return null
  }

  return { token, sessionData, adminData }
}

async function verifyAdminPassword(adminData, currentPassword) {
  if (!currentPassword) {
    return false
  }

  return bcrypt.compare(currentPassword, adminData.passwordHash)
}

async function invalidateAdminSessions(username, currentToken = null, options = {}) {
  const { preserveCurrent = false } = options

  if (currentToken && !preserveCurrent) {
    await redis.deleteSession(currentToken)
  }

  if (typeof redis.scanKeys !== 'function' || typeof redis.batchGetChunked !== 'function') {
    return
  }

  const keys = await redis.scanKeys('session:*')
  const sessions = await redis.batchGetChunked(keys)
  const client = typeof redis.getClientSafe === 'function' ? redis.getClientSafe() : null

  for (let i = 0; i < keys.length; i++) {
    const raw = sessions[i]
    if (!raw) {
      continue
    }

    const session = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!session?.username || !session?.loginTime || session.username !== username) {
      continue
    }

    const sessionToken = keys[i].replace(/^session:/, '')
    if (sessionToken === currentToken) {
      continue
    }

    if (client?.del) {
      await client.del(keys[i])
    } else {
      await redis.deleteSession(sessionToken)
    }
  }
}

function readInitData() {
  const filePath = initFilePath()
  if (!fs.existsSync(filePath)) {
    throw new Error('init.json file is missing')
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeInitData(data) {
  fs.writeFileSync(initFilePath(), JSON.stringify(data, null, 2))
}

function safeTokenEquals(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) {
    return false
  }

  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right))
}

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

    const adminData = await loadAdminCredentials()
    if (!adminData) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Invalid username or password'
      })
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

    const twoFactorEnabled = await twoFactorService.isTwoFactorEnabledForAdmin()
    if (twoFactorEnabled) {
      const challenge = await twoFactorService.createPendingChallenge({
        subjectType: 'admin',
        subjectId: adminData.username,
        username: adminData.username,
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown'
      })

      return res.json({
        success: true,
        requiresTwoFactor: true,
        pendingLoginToken: challenge.pendingLoginToken,
        pendingLoginExpiresIn: challenge.pendingLoginExpiresIn,
        canUseRecoveryCode: true
      })
    }

    const { token: sessionId, sessionData } = buildAdminSession(adminData.username)

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

// 📱 管理员 2FA 状态
router.get('/auth/2fa/status', async (req, res) => {
  try {
    const adminContext = await getAdminRequestContext(req, res)
    if (!adminContext) {
      return
    }

    const status = await twoFactorService.getAdminStatus()
    return res.json({
      success: true,
      twoFactor: status
    })
  } catch (error) {
    logger.error('❌ Get admin 2FA status error:', error)
    return res.status(500).json({
      error: 'Get 2FA status failed',
      message: 'Internal server error'
    })
  }
})

// 📱 创建管理员 2FA 设置
router.post('/auth/2fa/setup', async (req, res) => {
  try {
    const adminContext = await getAdminRequestContext(req, res)
    if (!adminContext) {
      return
    }

    const { currentPassword } = req.body
    const isValidPassword = await verifyAdminPassword(adminContext.adminData, currentPassword)
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid current password',
        message: 'Current password is incorrect'
      })
    }

    const setup = await twoFactorService.createAdminSetup({
      accountName: adminContext.adminData.username,
      issuer: TWO_FACTOR_ISSUER
    })

    return res.json({
      success: true,
      ...setup
    })
  } catch (error) {
    logger.error('❌ Create admin 2FA setup error:', error)
    return res.status(400).json({
      error: 'Create 2FA setup failed',
      message: error.message || 'Failed to create two-factor setup'
    })
  }
})

// 📱 启用管理员 2FA
router.post('/auth/2fa/enable', async (req, res) => {
  try {
    const adminContext = await getAdminRequestContext(req, res)
    if (!adminContext) {
      return
    }

    const { currentPassword, setupToken, otpCode } = req.body
    const isValidPassword = await verifyAdminPassword(adminContext.adminData, currentPassword)
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid current password',
        message: 'Current password is incorrect'
      })
    }

    const result = await twoFactorService.enableAdminTwoFactor({
      setupToken,
      otpCode
    })

    await invalidateAdminSessions(adminContext.adminData.username, adminContext.token, {
      preserveCurrent: true
    })

    return res.json({
      success: true,
      ...result
    })
  } catch (error) {
    logger.error('❌ Enable admin 2FA error:', error)
    return res.status(400).json({
      error: 'Enable 2FA failed',
      message: error.message || 'Failed to enable two-factor authentication'
    })
  }
})

// 📱 禁用管理员 2FA
router.post('/auth/2fa/disable', async (req, res) => {
  try {
    const adminContext = await getAdminRequestContext(req, res)
    if (!adminContext) {
      return
    }

    const { currentPassword, otpCode, recoveryCode } = req.body
    const isValidPassword = await verifyAdminPassword(adminContext.adminData, currentPassword)
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid current password',
        message: 'Current password is incorrect'
      })
    }

    await twoFactorService.disableAdminTwoFactor({
      otpCode,
      recoveryCode
    })

    await invalidateAdminSessions(adminContext.adminData.username, adminContext.token)

    return res.json({
      success: true,
      message: 'Two-factor authentication disabled'
    })
  } catch (error) {
    logger.error('❌ Disable admin 2FA error:', error)
    return res.status(400).json({
      error: 'Disable 2FA failed',
      message: error.message || 'Failed to disable two-factor authentication'
    })
  }
})

// 📱 重新生成管理员恢复码
router.post('/auth/2fa/recovery-codes/regenerate', async (req, res) => {
  try {
    const adminContext = await getAdminRequestContext(req, res)
    if (!adminContext) {
      return
    }

    const { currentPassword, otpCode, recoveryCode } = req.body
    const isValidPassword = await verifyAdminPassword(adminContext.adminData, currentPassword)
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid current password',
        message: 'Current password is incorrect'
      })
    }

    const result = await twoFactorService.regenerateAdminRecoveryCodes({
      otpCode,
      recoveryCode
    })

    await invalidateAdminSessions(adminContext.adminData.username, adminContext.token)

    return res.json({
      success: true,
      ...result
    })
  } catch (error) {
    logger.error('❌ Regenerate admin recovery codes error:', error)
    return res.status(400).json({
      error: 'Regenerate recovery codes failed',
      message: error.message || 'Failed to regenerate recovery codes'
    })
  }
})

// 🚨 管理员 2FA 应急恢复
router.post('/auth/2fa/emergency-recover', async (req, res) => {
  try {
    const { username, password, emergencyRecoveryToken } = req.body

    if (!username || !password || !emergencyRecoveryToken) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Username, password, and emergency recovery token are required'
      })
    }

    const adminData = await loadAdminCredentials()
    if (!adminData) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Invalid username or password'
      })
    }

    const isValidUsername = adminData.username === username
    const isValidPassword = await bcrypt.compare(password, adminData.passwordHash)
    if (!isValidUsername || !isValidPassword) {
      logger.security(`Failed emergency admin recovery attempt for username: ${username}`)
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Invalid username or password'
      })
    }

    const initData = readInitData()
    if (!safeTokenEquals(initData.adminEmergencyRecoveryToken, emergencyRecoveryToken)) {
      logger.security(`Failed emergency admin recovery token validation for username: ${username}`)
      return res.status(401).json({
        error: 'Invalid emergency recovery token',
        message: 'Emergency recovery token is invalid'
      })
    }

    await twoFactorService.resetAdminTwoFactor()
    await invalidateAdminSessions(adminData.username)

    initData.adminEmergencyRecoveryUsedAt = new Date().toISOString()
    delete initData.adminEmergencyRecoveryToken
    writeInitData(initData)

    const { token, sessionData } = buildAdminSession(adminData.username)
    await redis.setSession(token, sessionData, config.security.adminSessionTimeout)

    logger.security(`Admin emergency recovery completed for username: ${username}`)

    return res.json({
      success: true,
      token,
      expiresIn: config.security.adminSessionTimeout,
      username: adminData.username,
      emergencyRecovered: true
    })
  } catch (error) {
    logger.error('❌ Admin emergency recovery error:', error)
    return res.status(500).json({
      error: 'Emergency recovery failed',
      message: error.message || 'Failed to complete emergency recovery'
    })
  }
})

// 🚨 清除管理员 2FA 应急恢复令牌
router.post('/auth/2fa/reset-emergency', async (req, res) => {
  try {
    const adminContext = await getAdminRequestContext(req, res)
    if (!adminContext) {
      return
    }

    const { currentPassword } = req.body
    const isValidPassword = await verifyAdminPassword(adminContext.adminData, currentPassword)
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid current password',
        message: 'Current password is incorrect'
      })
    }

    const initData = readInitData()
    delete initData.adminEmergencyRecoveryToken
    initData.adminEmergencyRecoveryResetAt = new Date().toISOString()
    writeInitData(initData)

    return res.json({
      success: true,
      message: 'Emergency recovery token cleared'
    })
  } catch (error) {
    logger.error('❌ Reset admin emergency recovery error:', error)
    return res.status(500).json({
      error: 'Reset emergency recovery failed',
      message: error.message || 'Failed to reset emergency recovery'
    })
  }
})

// 🔐 管理员 2FA 验证
router.post('/auth/2fa/verify', async (req, res) => {
  try {
    const { pendingLoginToken, otpCode, recoveryCode } = req.body

    if (!pendingLoginToken) {
      return res.status(400).json({
        error: 'Missing pending token',
        message: 'Pending login token is required'
      })
    }

    const result = await twoFactorService.verifyAdminSecondFactor({
      pendingLoginToken,
      otpCode,
      recoveryCode
    })

    const { token, sessionData } = buildAdminSession(result.username)
    await redis.setSession(token, sessionData, config.security.adminSessionTimeout)

    return res.json({
      success: true,
      token,
      expiresIn: config.security.adminSessionTimeout,
      username: result.username,
      usedRecoveryCode: !!result.usedRecoveryCode
    })
  } catch (error) {
    logger.error('❌ Admin two-factor verification error:', error)
    return res.status(401).json({
      error: 'Two-factor verification failed',
      message: error.message || 'Two-factor verification failed'
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
    const initDataPath = path.join(__dirname, '../../data/init.json')
    if (!fs.existsSync(initDataPath)) {
      return res.status(500).json({
        error: 'Configuration file not found',
        message: 'init.json file is missing'
      })
    }

    try {
      const initData = JSON.parse(fs.readFileSync(initDataPath, 'utf8'))
      // const oldData = { ...initData }; // 备份旧数据

      // 更新 init.json
      initData.adminUsername = updatedUsername
      initData.adminPassword = newPassword // 保存明文密码到init.json
      initData.updatedAt = new Date().toISOString()

      // 先写入文件（如果失败则不会影响 Redis）
      fs.writeFileSync(initDataPath, JSON.stringify(initData, null, 2))

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
