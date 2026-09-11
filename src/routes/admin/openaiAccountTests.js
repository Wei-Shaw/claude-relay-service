const express = require('express')
const { authenticateAdmin } = require('../../middleware/auth')
const accounts = require('../../services/account/openaiAccountService')
const scheduler = require('../../services/accountTestSchedulerService')
const { DEFAULT_MODEL } = require('../../services/openaiAccountTestService')

const router = express.Router()
const base = '/:accountId'
const validModel = (model) =>
  typeof model === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(model)

router.use(
  ['test', 'test-sync', 'test-config', 'test-history'].map((path) => `${base}/${path}`),
  authenticateAdmin,
  async (req, res, next) => {
    try {
      const account = await accounts.getAccount(req.params.accountId)
      if (!account) {
        return res.status(404).json({ success: false, code: 'ACCOUNT_NOT_FOUND' })
      }
      next()
    } catch {
      res.status(500).json({ success: false, code: 'ACCOUNT_LOOKUP_FAILED' })
    }
  }
)

router.get(`${base}/test-config`, async (req, res) => {
  try {
    const config = await scheduler.getTestConfig(req.params.accountId, 'openai')
    res.json({
      success: true,
      data: {
        config: config || {
          enabled: false,
          cronExpression: '0 */6 * * *',
          model: DEFAULT_MODEL
        }
      }
    })
  } catch {
    res.status(500).json({ success: false, code: 'CONFIG_READ_FAILED' })
  }
})

router.put(`${base}/test-config`, async (req, res) => {
  const { enabled, cronExpression, model } = req.body || {}
  if (
    typeof enabled !== 'boolean' ||
    typeof cronExpression !== 'string' ||
    cronExpression.trim().split(/\s+/).length !== 5 ||
    !scheduler.validateCronExpression(cronExpression) ||
    !validModel(model)
  ) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_TEST_CONFIG',
      message: '请检查测试开关、五段 cron 表达式和模型名称'
    })
  }
  try {
    const config = { enabled, cronExpression, model }
    await scheduler.setTestConfig(req.params.accountId, 'openai', config)
    const saved = await scheduler.getTestConfig(req.params.accountId, 'openai')
    if (
      !saved ||
      saved.enabled !== enabled ||
      saved.cronExpression !== cronExpression ||
      saved.model !== model
    ) {
      throw new Error('CONFIG_WRITE_FAILED')
    }
    res.json({ success: true, data: { config } })
  } catch {
    res.status(500).json({ success: false, code: 'CONFIG_WRITE_FAILED' })
  }
})

router.get(`${base}/test-history`, async (req, res) => {
  try {
    const history = await scheduler.getTestHistory(req.params.accountId, 'openai')
    res.json({ success: true, data: { history } })
  } catch {
    res.status(500).json({ success: false, code: 'HISTORY_READ_FAILED' })
  }
})

router.post([`${base}/test`, `${base}/test-sync`], async (req, res) => {
  const requestedModel = req.body?.model
  if (requestedModel !== undefined && !validModel(requestedModel)) {
    return res.status(400).json({ success: false, code: 'INVALID_MODEL' })
  }
  try {
    const saved =
      requestedModel === undefined
        ? await scheduler.getTestConfig(req.params.accountId, 'openai')
        : null
    const model = requestedModel ?? saved?.model ?? DEFAULT_MODEL
    const result = await scheduler.triggerTest(req.params.accountId, 'openai', model)
    if (!result) {
      return res
        .status(409)
        .json({ success: false, code: 'TEST_IN_PROGRESS', message: '该账号正在测试，请稍后重试' })
    }
    res.json({
      success: result.success,
      message: result.error,
      code: result.code,
      data: {
        accountId: req.params.accountId,
        model,
        latency: result.latencyMs,
        responseText: result.message,
        result
      }
    })
  } catch {
    res.status(500).json({ success: false, code: 'TEST_FAILED' })
  }
})

module.exports = router
