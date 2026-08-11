/**
 * 连通性测试默认模型配置 API 路由
 * admin 在后台配置各平台账户测试 / API Key 测试的默认模型
 */

const express = require('express')
const { authenticateAdmin } = require('../../middleware/auth')
const testModelConfigService = require('../../services/testModelConfigService')
const logger = require('../../utils/logger')

const router = express.Router()

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * GET /admin/test-model-config
 * 获取测试默认模型配置
 */
router.get('/test-model-config', authenticateAdmin, async (req, res) => {
  try {
    const config = await testModelConfigService.getConfig()
    return res.json({
      success: true,
      config
    })
  } catch (error) {
    logger.error('❌ Failed to get test model config:', error)
    return res.status(500).json({
      error: 'Failed to get configuration',
      message: error.message
    })
  }
})

/**
 * PUT /admin/test-model-config
 * 更新测试默认模型配置
 */
router.put('/test-model-config', authenticateAdmin, async (req, res) => {
  try {
    const { account, apikey } = req.body

    if (account !== undefined && !isPlainObject(account)) {
      return res.status(400).json({ error: 'account must be an object' })
    }
    if (apikey !== undefined && !isPlainObject(apikey)) {
      return res.status(400).json({ error: 'apikey must be an object' })
    }

    const config = await testModelConfigService.updateConfig(
      { account, apikey },
      req.admin?.username || 'unknown'
    )

    return res.json({
      success: true,
      message: 'Configuration updated successfully',
      config
    })
  } catch (error) {
    logger.error('❌ Failed to update test model config:', error)
    return res.status(500).json({
      error: 'Failed to update configuration',
      message: error.message
    })
  }
})

module.exports = router
