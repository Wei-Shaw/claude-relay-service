/**
 * Admin Routes - Account Migration (import/export)
 * 新增的账户导入导出能力，全部走新路径，不触碰 /admin/sync/export-accounts 契约。
 *
 *   GET  /admin/accounts/export?format=crs|sub2api|cliproxyapi&ids=a,b,c
 *   POST /admin/accounts/import/inspect   { filename, contentBase64 }
 *   POST /admin/accounts/import           { filename, contentBase64, options }
 */

const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const migrationService = require('../../services/accountMigrationService')

const VALID_FORMATS = ['crs', 'sub2api', 'cliproxyapi']

function toBool(value) {
  if (value === true || value === 'true') {
    return true
  }
  if (value === false || value === 'false') {
    return false
  }
  return false
}

// 导出账户
router.get('/accounts/export', authenticateAdmin, async (req, res) => {
  try {
    const format = String(req.query.format || 'crs').toLowerCase()
    if (!VALID_FORMATS.includes(format)) {
      return res.status(400).json({ success: false, error: `invalid format: ${format}` })
    }
    const ids =
      typeof req.query.ids === 'string' && req.query.ids.trim()
        ? req.query.ids
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : null
    const includeSecrets = toBool(req.query.include_secrets)
    if (!includeSecrets) {
      return res.status(400).json({
        success: false,
        error: 'include_secrets_required',
        message: 'Set include_secrets=true to export secrets'
      })
    }

    const result = await migrationService.exportAccounts({ format, ids })

    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
    // 响应头只放计数（完整明细会随条目数线性膨胀，撞反代 header size 限制）；明细落服务端日志
    if (result.skipped && result.skipped.length > 0) {
      res.setHeader('X-Export-Skipped-Count', String(result.skipped.length))
      logger.warn(
        `⚠️ Account export skipped ${result.skipped.length} account(s): ${JSON.stringify(result.skipped)}`
      )
    }
    if (result.readErrors && result.readErrors.length > 0) {
      res.setHeader('X-Export-Read-Errors-Count', String(result.readErrors.length))
      logger.warn(
        `⚠️ Account export read errors on ${result.readErrors.length} account(s): ${JSON.stringify(result.readErrors)}`
      )
    }

    if (result.kind === 'empty') {
      return res.status(400).json({
        success: false,
        error: 'no_exportable_accounts',
        message: '没有可导出的账户（所选账户均不支持该格式或读取失败）',
        skipped: result.skipped || [],
        readErrors: result.readErrors || []
      })
    }

    if (result.kind === 'zip') {
      res.setHeader('Content-Type', 'application/zip')
      return res.send(result.buffer)
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    return res.send(JSON.stringify(result.payload, null, 2))
  } catch (error) {
    logger.error('❌ Account export failed:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

// 导入预检
router.post('/accounts/import/inspect', authenticateAdmin, async (req, res) => {
  try {
    const { filename, contentBase64 } = req.body || {}
    if (!contentBase64) {
      return res.status(400).json({ success: false, error: 'contentBase64 is required' })
    }
    const result = await migrationService.inspectImport({ filename, contentBase64 })
    return res.json({ success: true, ...result })
  } catch (error) {
    logger.error('❌ Account import inspect failed:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

// 执行导入
router.post('/accounts/import', authenticateAdmin, async (req, res) => {
  try {
    const { filename, contentBase64, options } = req.body || {}
    if (!contentBase64) {
      return res.status(400).json({ success: false, error: 'contentBase64 is required' })
    }
    const result = await migrationService.importAccounts({ filename, contentBase64, options })
    logger.info(
      `📥 Account import done: format=${result.format} created=${result.created} updated=${result.updated} skipped=${result.skipped} failed=${result.failed}`
    )
    return res.json({ success: true, ...result })
  } catch (error) {
    logger.error('❌ Account import failed:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

module.exports = router
