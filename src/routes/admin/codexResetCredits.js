const express = require('express')
const {
  createCodexResetCreditsService,
  CodexResetCreditsError
} = require('../../services/codexResetCreditsService')
const {
  createCodexManagementAuth,
  readCredentials
} = require('../../middleware/codexManagementAuth')

module.exports = function createCodexResetCreditsRouter(deps = {}) {
  const router = express.Router({ mergeParams: true })
  const authorize = createCodexManagementAuth({
    keysService: deps.keysService,
    authenticateAdmin: deps.authenticateAdmin
  })
  const service = deps.service || createCodexResetCreditsService()
  router.use(authorize)
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  function handler(fn, consume = false) {
    return async (req, res) => {
      try {
        const data = await fn(req)
        return res
          .status(consume && data.status === 'uncertain' ? 202 : 200)
          .json({ success: true, data })
      } catch (error) {
        const known = error instanceof CodexResetCreditsError
        return res
          .status(known ? error.statusCode : 500)
          .json({ success: false, error: { code: known ? error.code : 'internal_error' } })
      }
    }
  }

  router.get(
    '/usage',
    handler((req) => service.usage(req.params.accountId))
  )
  router.get(
    '/reset-credits',
    handler((req) => service.resetCredits(req.params.accountId))
  )
  router.post(
    '/reset-credits/consume',
    handler((req) => service.consume(req.params.accountId, req.body), true)
  )
  router.get(
    '/reset-credits/operations/:requestId',
    handler((req) => service.operation(req.params.accountId, req.params.requestId))
  )
  router.post(
    '/reset-credits/operations/:requestId/reconcile',
    handler((req) => {
      if (req.headers['x-api-key'] !== undefined || readCredentials(req).management) {
        throw new CodexResetCreditsError('admin_required', 403)
      }
      return service.reconcile(req.params.accountId, req.params.requestId, req.body)
    }, true)
  )
  return router
}
