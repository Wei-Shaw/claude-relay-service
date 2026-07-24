const express = require('express')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const serverStateService = require('../../services/serverStateService')

const router = express.Router()
const LIVE_MUTATION_ACTIONS = new Set(['pause', 'resume', 'lock', 'unlock'])
const isLiveMutationEnabled = () => process.env.SERVER_STATE_LIVE_MUTATION_ENABLED === 'true'

router.get('/server-state/summary', authenticateAdmin, async (_req, res) => {
  try {
    const summary = await serverStateService.getSummary()
    return res.json({
      success: true,
      data: summary
    })
  } catch (error) {
    logger.error('Failed to get server state summary:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to get server state summary',
      error: error.message
    })
  }
})

router.get('/server-state/accounts', authenticateAdmin, async (req, res) => {
  try {
    const accountMirror = await serverStateService.getAccountMirror({
      force: req.query?.force === 'true'
    })
    return res.json({
      success: true,
      data: accountMirror
    })
  } catch (error) {
    logger.error('Failed to get server state accounts:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to get server state accounts',
      error: error.message
    })
  }
})

router.post(
  '/server-state/accounts/:provider/:accountId/:action',
  authenticateAdmin,
  async (req, res) => {
    try {
      if (
        LIVE_MUTATION_ACTIONS.has(String(req.params.action || '').toLowerCase()) &&
        !isLiveMutationEnabled()
      ) {
        return res.status(403).json({
          success: false,
          message: 'Live server account mutation is disabled'
        })
      }

      const result = await serverStateService.runAccountAction({
        provider: req.params.provider,
        accountId: req.params.accountId,
        action: req.params.action
      })
      if (result?.ok === false) {
        return res.status(400).json({
          success: false,
          message: result.message || 'Server account action was rejected',
          data: result
        })
      }
      return res.json({
        success: true,
        data: result
      })
    } catch (error) {
      logger.error('Failed to run server account action:', error)
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to run server account action'
      })
    }
  }
)

module.exports = router
