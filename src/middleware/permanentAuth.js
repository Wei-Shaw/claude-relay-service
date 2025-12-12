const config = require('../../config/config')
const logger = require('../utils/logger')

// 永久API-KEY认证中间件（独立文件，不影响git更新）
const authenticateWithPermanentKey = (req, res, next) => {
  const permanentKeys = config.security.systemApiKeys || []

  // 检查是否有永久API-KEY
  const providedKey =
    req.headers['x-api-key'] ||
    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
    req.headers['api-key']

  if (providedKey && permanentKeys.includes(providedKey)) {
    // 设置虚拟管理员信息
    req.admin = {
      id: 'permanent-admin',
      username: 'permanent-admin',
      sessionId: 'permanent-key',
      loginTime: new Date().toISOString()
    }

    logger.security(`🔐 Permanent API key authenticated from ${req.ip || 'unknown'}`)
    return next()
  }

  // 如果没有永久KEY，继续原有的认证流程
  return next()
}

// 管理员或永久API-KEY认证中间件
const authenticateAdminOrPermanentKey = async (req, res, next) => {
  // 先检查永久API-KEY
  const permanentKeys = config.security.systemApiKeys || []
  const providedKey =
    req.headers['x-api-key'] ||
    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
    req.headers['api-key']

  if (providedKey && permanentKeys.includes(providedKey)) {
    // 设置虚拟管理员信息
    req.admin = {
      id: 'permanent-admin',
      username: 'permanent-admin',
      sessionId: 'permanent-key',
      loginTime: new Date().toISOString()
    }

    logger.security(`🔐 Permanent API key authenticated from ${req.ip || 'unknown'}`)
    return next()
  }

  // 如果没有永久KEY，导入并使用原有的管理员认证
  const { authenticateAdmin } = require('./auth')
  return authenticateAdmin(req, res, next)
}

module.exports = {
  authenticateWithPermanentKey,
  authenticateAdminOrPermanentKey
}
