const express = require('express')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const connectivityTestModelConfigService = require('../../services/connectivityTestModelConfigService')

const router = express.Router()

router.get('/connectivity-test-models', authenticateAdmin, async (_req, res) => {
  try {
    const config = await connectivityTestModelConfigService.getConfig()
    return res.json({ success: true, data: config })
  } catch (error) {
    logger.error('❌ Failed to get connectivity test model config:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to get connectivity test model config'
    })
  }
})

router.put('/connectivity-test-models', authenticateAdmin, async (req, res) => {
  try {
    const config = await connectivityTestModelConfigService.saveConfig(
      req.body,
      req.admin?.username || 'admin'
    )
    logger.info(`✅ Connectivity test model config updated by ${config.updatedBy}`)
    return res.json({ success: true, data: config })
  } catch (error) {
    const statusCode = error.statusCode || 500
    if (statusCode === 500) {
      logger.error('❌ Failed to update connectivity test model config:', error)
    }
    return res.status(statusCode).json({
      success: false,
      message:
        statusCode === 400 ? error.message : 'Failed to update connectivity test model config'
    })
  }
})

router.delete('/connectivity-test-models', authenticateAdmin, async (req, res) => {
  try {
    const config = await connectivityTestModelConfigService.resetConfig()
    logger.info(`✅ Connectivity test model config reset by ${req.admin?.username || 'admin'}`)
    return res.json({ success: true, data: config })
  } catch (error) {
    logger.error('❌ Failed to reset connectivity test model config:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to reset connectivity test model config'
    })
  }
})

module.exports = router
