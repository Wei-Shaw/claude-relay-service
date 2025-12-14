const express = require('express')
const { authenticateAdmin } = require('../../middleware/auth')
const proxyPolicyService = require('../../services/proxyPolicyService')
const logger = require('../../utils/logger')

const router = express.Router()

// ==================== 代理策略配置 ====================

router.get('/proxy-policy', authenticateAdmin, async (req, res) => {
  try {
    const config = await proxyPolicyService.getConfig()
    return res.json({ success: true, data: config })
  } catch (error) {
    logger.error('❌ Failed to get proxy policy config:', error)
    return res.status(500).json({ error: 'Failed to get proxy policy config', message: error.message })
  }
})

router.put('/proxy-policy', authenticateAdmin, async (req, res) => {
  try {
    const updates = req.body || {}
    const updated = await proxyPolicyService.updateConfig(updates, req.admin?.username || 'unknown')
    return res.json({ success: true, data: updated })
  } catch (error) {
    logger.error('❌ Failed to update proxy policy config:', error)
    return res.status(400).json({ error: error.message })
  }
})

module.exports = router

