const express = require('express')
const { authenticateAdmin } = require('../../middleware/auth')
const routeRulesVisualizationService = require('../../services/routeRulesVisualizationService')
const logger = require('../../utils/logger')

const router = express.Router()

router.get('/route-rules/endpoints', authenticateAdmin, async (_req, res) => {
  try {
    const data = await routeRulesVisualizationService.getEndpoints()
    return res.json({
      success: true,
      data
    })
  } catch (error) {
    logger.error('❌ Failed to get route rule endpoints:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to get route rule endpoints',
      message: error.message
    })
  }
})

router.get('/route-rules/explain', authenticateAdmin, async (req, res) => {
  try {
    const data = await routeRulesVisualizationService.getExplain(req.query || {})
    return res.json({
      success: true,
      data
    })
  } catch (error) {
    if (error?.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: 'Route rule target not found',
        message: error.message
      })
    }

    logger.error('❌ Failed to explain route rules:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to explain route rules',
      message: error.message
    })
  }
})

router.get('/route-rules/live', authenticateAdmin, async (req, res) => {
  try {
    const data = await routeRulesVisualizationService.getLive(req.query || {})
    return res.json({
      success: true,
      data
    })
  } catch (error) {
    logger.error('❌ Failed to get route rule live data:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to get route rule live data',
      message: error.message
    })
  }
})

module.exports = router
