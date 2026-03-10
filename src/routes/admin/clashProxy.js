/**
 * Clash 代理管理 API 路由
 * 提供代理节点状态查看、手动测速、手动切换等功能
 */

const express = require('express')
const router = express.Router()
const clashProxyManager = require('../../services/clashProxyManager')
const logger = require('../../utils/logger')

// 获取 Clash 代理管理器状态
router.get('/clash-proxy/status', async (req, res) => {
  try {
    const status = await clashProxyManager.getStatus()
    res.json({ success: true, data: status })
  } catch (error) {
    logger.error('Failed to get clash proxy status:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 手动触发测速
router.post('/clash-proxy/speed-test', async (req, res) => {
  try {
    logger.info('🔌 [ClashProxy] 管理员触发手动测速')
    const results = await clashProxyManager.manualSpeedTest()
    res.json({ success: true, data: results })
  } catch (error) {
    logger.error('Failed to run clash proxy speed test:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

module.exports = router
