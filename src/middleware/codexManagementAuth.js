const {
  createCodexManagementKeysService,
  CodexManagementKeysError,
  sendManagementKeyError,
  KEY_PATTERN
} = require('../services/codexManagementKeysService')

function readCredentials(req) {
  const xKey = req.headers['x-api-key']
  const { authorization } = req.headers
  const invalid = () => {
    throw new CodexManagementKeysError('invalid_management_key')
  }
  // Node can discard duplicate Authorization fields; do not silently choose one.
  for (const header of ['authorization', 'x-api-key']) {
    let count = 0
    for (let i = 0; i < (req.rawHeaders || []).length; i += 2) {
      if (req.rawHeaders[i].toLowerCase() === header) {
        count++
      }
    }
    if (count > 1) {
      invalid()
    }
  }
  if (
    (xKey !== undefined && typeof xKey !== 'string') ||
    (authorization !== undefined && typeof authorization !== 'string')
  ) {
    invalid()
  }
  const bearer = authorization?.match(/^Bearer ([^\s,]+)$/i)?.[1]
  if (authorization !== undefined && !bearer) {
    invalid()
  }
  if (xKey !== undefined && bearer !== undefined && xKey !== bearer) {
    invalid()
  }
  for (const legacyToken of [req.headers['x-admin-token'], req.cookies?.adminToken]) {
    if (typeof legacyToken === 'string' && /^(crsm_|cr_)/.test(legacyToken)) {
      invalid()
    }
  }
  const token = xKey !== undefined ? xKey : bearer
  if (xKey !== undefined && !KEY_PATTERN.test(token)) {
    invalid()
  }
  if (token?.startsWith('crsm_') && !KEY_PATTERN.test(token)) {
    invalid()
  }
  if (token?.startsWith('cr_')) {
    invalid()
  }
  return { token, management: token?.startsWith('crsm_') === true }
}

async function authenticateAdminSession(admin, req, res, next) {
  const originalJson = res.json
  const restore = () => {
    res.json = originalJson
  }
  res.json = function sanitizedAdminResponse(body) {
    restore()
    if (res.statusCode >= 400) {
      const status = res.statusCode === 401 || res.statusCode === 403 ? res.statusCode : 503
      const error = status === 503 ? 'management_key_unavailable' : 'admin_required'
      return originalJson.call(res.status(status), { success: false, error })
    }
    return originalJson.call(res, body)
  }
  try {
    return await admin(req, res, (error) => {
      restore()
      if (error) {
        return sendManagementKeyError(res, error)
      }
      return next()
    })
  } catch (error) {
    restore()
    return sendManagementKeyError(res, error)
  }
}

function createCodexManagementAuth({ keysService, authenticateAdmin } = {}) {
  const service = keysService || createCodexManagementKeysService()
  const admin = authenticateAdmin || ((...args) => require('./auth').authenticateAdmin(...args))
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    try {
      const { token, management } = readCredentials(req)
      if (!management) {
        return await authenticateAdminSession(admin, req, res, next)
      }
      if (!['GET', 'HEAD', 'POST'].includes(req.method)) {
        throw new CodexManagementKeysError('management_key_forbidden')
      }
      req.codexManagementKey = await service.authorize(
        token,
        req.params.accountId,
        req.method === 'POST' ? 'consume' : 'read'
      )
      return next()
    } catch (error) {
      return sendManagementKeyError(res, error)
    }
  }
}

module.exports = { createCodexManagementAuth, readCredentials, authenticateAdminSession }
