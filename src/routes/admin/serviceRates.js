/**
 * 服务倍率配置管理路由
 */
const express = require('express')
const router = express.Router()
const serviceRatesService = require('../../services/serviceRatesService')
const logger = require('../../utils/logger')
const { authenticateAdmin } = require('../../middleware/auth')

// 获取服务倍率配置
router.get('/service-rates', authenticateAdmin, async (req, res) => {
  try {
    const rates = await serviceRatesService.getRates()
    res.json({
      success: true,
      data: rates
    })
  } catch (error) {
    logger.error('❌ Failed to get service rates:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 更新服务倍率配置
router.put('/service-rates', authenticateAdmin, async (req, res) => {
  try {
    const { rates, baseService } = req.body

    if (!rates || typeof rates !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'rates is required and must be an object'
      })
    }

    const updatedBy = req.session?.username || 'admin'
    const result = await serviceRatesService.saveRates({ rates, baseService }, updatedBy)

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('❌ Failed to update service rates:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 获取可用服务列表
router.get('/service-rates/services', authenticateAdmin, async (req, res) => {
  try {
    const services = await serviceRatesService.getAvailableServices()
    res.json({
      success: true,
      data: services
    })
  } catch (error) {
    logger.error('❌ Failed to get available services:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

module.exports = router
