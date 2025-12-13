const express = require('express')
const { authenticateAdmin } = require('../../middleware/auth')
const fuelPackService = require('../../services/fuelPackService')
const logger = require('../../utils/logger')

const router = express.Router()

// ===== 加油包兑换码管理 =====

// 查询兑换码列表
router.get('/fuel-packs/codes', authenticateAdmin, async (req, res) => {
  try {
    const { status = 'unused', page = 1, pageSize = 50, isActive, q } = req.query || {}

    const result = await fuelPackService.listCodes({
      status,
      page,
      pageSize,
      isActive,
      q
    })

    return res.json(result)
  } catch (error) {
    logger.error('❌ Failed to list fuel pack codes:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to list fuel pack codes',
      message: error.message
    })
  }
})

// 创建兑换码（支持批量）
router.post('/fuel-packs/codes', authenticateAdmin, async (req, res) => {
  try {
    const { amount, validitySeconds, count, prefix, note } = req.body || {}
    const createdBy = req.admin?.username || 'admin'

    const result = await fuelPackService.createCodes({
      amount,
      validitySeconds,
      count,
      prefix,
      note,
      createdBy
    })

    return res.json(result)
  } catch (error) {
    logger.error('❌ Failed to create fuel pack codes:', error)
    return res.status(400).json({
      success: false,
      error: 'Failed to create fuel pack codes',
      message: error.message
    })
  }
})

// 修改兑换码（未使用才允许修改额度/有效期）
router.patch('/fuel-packs/codes/:codeId', authenticateAdmin, async (req, res) => {
  try {
    const { codeId } = req.params
    const adminUsername = req.admin?.username || 'admin'

    const result = await fuelPackService.updateCode(codeId, req.body || {}, adminUsername)
    return res.json(result)
  } catch (error) {
    logger.error('❌ Failed to update fuel pack code:', error)
    return res.status(400).json({
      success: false,
      error: 'Failed to update fuel pack code',
      message: error.message
    })
  }
})

// 删除兑换码（软删除）
router.delete('/fuel-packs/codes/:codeId', authenticateAdmin, async (req, res) => {
  try {
    const { codeId } = req.params
    const adminUsername = req.admin?.username || 'admin'

    const result = await fuelPackService.deleteCode(codeId, adminUsername)
    return res.json(result)
  } catch (error) {
    logger.error('❌ Failed to delete fuel pack code:', error)
    return res.status(400).json({
      success: false,
      error: 'Failed to delete fuel pack code',
      message: error.message
    })
  }
})

// 批量操作：启用/停用/删除
router.post('/fuel-packs/codes/batch', authenticateAdmin, async (req, res) => {
  try {
    const { ids, action } = req.body || {}
    const adminUsername = req.admin?.username || 'admin'

    const result = await fuelPackService.batchUpdateCodes(ids, action, adminUsername)
    return res.json(result)
  } catch (error) {
    logger.error('❌ Failed to batch update fuel pack codes:', error)
    return res.status(400).json({
      success: false,
      error: 'Failed to batch update fuel pack codes',
      message: error.message
    })
  }
})

// 导出 TXT（默认导出指定 ID）
router.post('/fuel-packs/codes/export', authenticateAdmin, async (req, res) => {
  try {
    const { ids } = req.body || {}
    const result = await fuelPackService.exportCodes(ids)

    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="fuel-pack-codes.txt"')
    return res.status(200).send(result.data?.text || '')
  } catch (error) {
    logger.error('❌ Failed to export fuel pack codes:', error)
    return res.status(400).json({
      success: false,
      error: 'Failed to export fuel pack codes',
      message: error.message
    })
  }
})

module.exports = router

