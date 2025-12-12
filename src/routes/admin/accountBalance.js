const express = require('express')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const accountBalanceService = require('../../services/accountBalanceService')

const router = express.Router()

const ensureValidPlatform = (rawPlatform) => {
  const normalized = accountBalanceService.normalizePlatform(rawPlatform)
  if (!normalized) {
    return { ok: false, status: 400, error: '缺少 platform 参数' }
  }

  const supported = accountBalanceService.getSupportedPlatforms()
  if (!supported.includes(normalized)) {
    return { ok: false, status: 400, error: `不支持的平台: ${normalized}` }
  }

  return { ok: true, platform: normalized }
}

// 1) 获取账户余额（默认本地统计优先，可选触发 Provider）
// GET /admin/accounts/:accountId/balance?platform=xxx&queryApi=false
router.get('/accounts/:accountId/balance', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const { platform, queryApi } = req.query

    const valid = ensureValidPlatform(platform)
    if (!valid.ok) {
      return res.status(valid.status).json({ success: false, error: valid.error })
    }

    const balance = await accountBalanceService.getAccountBalance(accountId, valid.platform, {
      queryApi
    })

    if (!balance) {
      return res.status(404).json({ success: false, error: 'Account not found' })
    }

    return res.json(balance)
  } catch (error) {
    logger.error('获取账户余额失败', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

// 2) 强制刷新账户余额（触发 Provider）
// POST /admin/accounts/:accountId/balance/refresh
// Body: { platform: 'xxx' }
router.post('/accounts/:accountId/balance/refresh', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const { platform } = req.body || {}

    const valid = ensureValidPlatform(platform)
    if (!valid.ok) {
      return res.status(valid.status).json({ success: false, error: valid.error })
    }

    logger.info(`手动刷新余额: ${valid.platform}:${accountId}`)

    const balance = await accountBalanceService.refreshAccountBalance(accountId, valid.platform)
    if (!balance) {
      return res.status(404).json({ success: false, error: 'Account not found' })
    }

    return res.json(balance)
  } catch (error) {
    logger.error('刷新账户余额失败', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

// 3) 批量获取平台所有账户余额
// GET /admin/accounts/balance/platform/:platform?queryApi=false
router.get('/accounts/balance/platform/:platform', authenticateAdmin, async (req, res) => {
  try {
    const { platform } = req.params
    const { queryApi } = req.query

    const valid = ensureValidPlatform(platform)
    if (!valid.ok) {
      return res.status(valid.status).json({ success: false, error: valid.error })
    }

    const balances = await accountBalanceService.getAllAccountsBalance(valid.platform, { queryApi })

    return res.json({ success: true, data: balances })
  } catch (error) {
    logger.error('批量获取余额失败', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

// 4) 获取余额汇总（Dashboard 用）
// GET /admin/accounts/balance/summary
router.get('/accounts/balance/summary', authenticateAdmin, async (req, res) => {
  try {
    const summary = await accountBalanceService.getBalanceSummary()
    return res.json({ success: true, data: summary })
  } catch (error) {
    logger.error('获取余额汇总失败', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

// 5) 清除缓存
// DELETE /admin/accounts/:accountId/balance/cache?platform=xxx
router.delete('/accounts/:accountId/balance/cache', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const { platform } = req.query

    const valid = ensureValidPlatform(platform)
    if (!valid.ok) {
      return res.status(valid.status).json({ success: false, error: valid.error })
    }

    await accountBalanceService.clearCache(accountId, valid.platform)

    return res.json({ success: true, message: '缓存已清除' })
  } catch (error) {
    logger.error('清除缓存失败', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

module.exports = router
