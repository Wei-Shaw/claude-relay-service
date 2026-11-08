const express = require('express')
const { authenticateApiKey } = require('../middleware/auth')
const CodexCliValidator = require('../validators/clients/codexCliValidator')
const { handleCodexModels } = require('./openaiRoutes')

const router = express.Router()

const compatibilityPaths = ['/models', '/v1/models', '/api/models', '/api/v1/models']

// Only Codex discovery requests are intercepted. Other /api model clients keep
// using the existing static catalog in routes/api.js.
router.get(compatibilityPaths, (req, res, next) => {
  if (!CodexCliValidator.validate(req)) {
    return next()
  }

  return authenticateApiKey(req, res, () => handleCodexModels(req, res))
})

module.exports = router
module.exports.compatibilityPaths = compatibilityPaths
