const express = require('express')
const { authenticateAdmin } = require('../../middleware/auth')
const requestDetailService = require('../../services/requestDetailService')
const logger = require('../../utils/logger')

const router = express.Router()

router.get('/request-details', authenticateAdmin, async (req, res) => {
  try {
    const data = await requestDetailService.listRequestDetails(req.query || {})
    return res.json({
      success: true,
      data
    })
  } catch (error) {
    if (error?.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request detail query',
        message: error.message
      })
    }

    logger.error('❌ Failed to list request details:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to list request details',
      message: error.message
    })
  }
})

router.get('/request-details/body-preview-stats', authenticateAdmin, async (_req, res) => {
  try {
    const data = await requestDetailService.getRequestBodyPreviewStats()
    return res.json({
      success: true,
      data
    })
  } catch (error) {
    logger.error('❌ Failed to get request body preview stats:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to get request body preview stats',
      message: error.message
    })
  }
})

router.post('/request-details/body-preview-purge', authenticateAdmin, async (_req, res) => {
  try {
    const data = await requestDetailService.purgeRequestBodySnapshots()
    return res.json({
      success: true,
      message: '清理完毕',
      data
    })
  } catch (error) {
    logger.error('❌ Failed to purge request body previews:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to purge request body previews',
      message: error.message
    })
  }
})

router.get('/request-details/:requestId', authenticateAdmin, async (req, res) => {
  try {
    const { requestId } = req.params
    const data = await requestDetailService.getRequestDetail(requestId)

    if (!data.record) {
      return res.status(404).json({
        success: false,
        error: 'Request detail not found'
      })
    }

    return res.json({
      success: true,
      data
    })
  } catch (error) {
    logger.error('❌ Failed to get request detail:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to get request detail',
      message: error.message
    })
  }
})

module.exports = router
