const express = require('express')
const {
  createCodexManagementKeysService,
  CodexManagementKeysError,
  sendManagementKeyError
} = require('../../services/codexManagementKeysService')
const {
  readCredentials,
  authenticateAdminSession
} = require('../../middleware/codexManagementAuth')

function createCodexManagementKeysRouter({ service, authenticateAdmin } = {}) {
  const keys = service || createCodexManagementKeysService()
  const admin =
    authenticateAdmin || ((...args) => require('../../middleware/auth').authenticateAdmin(...args))
  const router = express.Router()
  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    try {
      const credentials = readCredentials(req)
      if (credentials.management || req.headers['x-api-key'] !== undefined) {
        throw new CodexManagementKeysError('invalid_management_key')
      }
      return await authenticateAdminSession(admin, req, res, next)
    } catch (error) {
      return sendManagementKeyError(res, error)
    }
  })
  const handle = (operation, status) => async (req, res) => {
    try {
      const data = await operation(req)
      return res.status(status).json({ success: true, data })
    } catch (error) {
      return sendManagementKeyError(res, error)
    }
  }
  router.post(
    '/',
    handle((req) => keys.create(req.body), 201)
  )
  router.get(
    '/:id',
    handle((req) => keys.get(req.params.id), 200)
  )
  router.delete(
    '/:id',
    handle((req) => keys.revoke(req.params.id), 200)
  )
  return router
}

module.exports = { createCodexManagementKeysRouter }
