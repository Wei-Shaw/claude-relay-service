// 管理端支付路由：全局配置 + 充值商品 CRUD + 订单管理 + 退款。逐端点 authenticateAdmin。

const express = require('express')

const router = express.Router()
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const paymentConfig = require('../../services/payment/paymentConfig')
const planRepository = require('../../services/payment/planRepository')
const orderRepository = require('../../services/payment/orderRepository')
const providerRepository = require('../../services/payment/providerRepository')
const paymentOrderService = require('../../services/payment/paymentOrderService')

// ========== 全局配置 ==========
router.get('/payment/config', authenticateAdmin, async (req, res) => {
  try {
    // 严格读：Redis 读失败时抛错 → 返回 success:false，前端据此进入「加载失败」态、禁止保存，
    // 避免用默认值覆盖生产配置（见 PaymentManageView 三态处理）
    res.json({ success: true, data: await paymentConfig.getConfigStrict() })
  } catch (error) {
    logger.error('❌ [payment] get config error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

router.put('/payment/config', authenticateAdmin, async (req, res) => {
  try {
    const updated = await paymentConfig.updateConfig(req.body, req.admin?.id || 'admin')
    res.json({ success: true, data: updated })
  } catch (error) {
    logger.error('❌ [payment] update config error:', error)
    const isValidationError = error.message && error.message.startsWith('支付配置 ')
    res.status(isValidationError ? 400 : 500).json({ success: false, error: error.message })
  }
})

// ========== 充值商品 ==========
router.get('/payment/plans', authenticateAdmin, async (req, res) => {
  try {
    res.json({ success: true, data: await planRepository.list() })
  } catch (error) {
    logger.error('❌ [payment] list plans error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

router.post('/payment/plans', authenticateAdmin, async (req, res) => {
  try {
    res.json({ success: true, data: await planRepository.create(req.body) })
  } catch (error) {
    logger.error('❌ [payment] create plan error:', error)
    res.status(400).json({ success: false, error: error.message })
  }
})

router.put('/payment/plans/:id', authenticateAdmin, async (req, res) => {
  try {
    res.json({ success: true, data: await planRepository.update(req.params.id, req.body) })
  } catch (error) {
    logger.error('❌ [payment] update plan error:', error)
    res.status(400).json({ success: false, error: error.message })
  }
})

router.delete('/payment/plans/:id', authenticateAdmin, async (req, res) => {
  try {
    res.json({ success: true, data: await planRepository.delete(req.params.id) })
  } catch (error) {
    logger.error('❌ [payment] delete plan error:', error)
    res.status(400).json({ success: false, error: error.message })
  }
})

// ========== 订单管理 ==========
router.get('/payment/orders', authenticateAdmin, async (req, res) => {
  try {
    const offset = parseInt(req.query.offset || 0, 10)
    const limit = parseInt(req.query.limit || 20, 10)
    const status = req.query.status || ''
    res.json({ success: true, data: await orderRepository.listAll({ offset, limit, status }) })
  } catch (error) {
    logger.error('❌ [payment] list orders error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 管理端查单补单（走渠道 queryOrder / paid 重履约）
router.post('/payment/orders/:id/verify', authenticateAdmin, async (req, res) => {
  try {
    const order = await paymentOrderService.verifyOrder(req.params.id)
    res.json({ success: true, data: order })
  } catch (error) {
    logger.error('❌ [payment] admin verify order error:', error)
    res.status(400).json({ success: false, error: error.message })
  }
})

// 管理端手工补单/强制入账（渠道已收款但 webhook/查单不可用时）
// body: { reason: string 必填, tradeNo?: string }
router.post('/payment/orders/:id/manual-complete', authenticateAdmin, async (req, res) => {
  try {
    const result = await paymentOrderService.manualComplete(req.params.id, {
      operator: req.admin?.id || 'admin',
      reason: req.body?.reason || '',
      tradeNo: req.body?.tradeNo || ''
    })
    res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ [payment] manual complete error:', error)
    res.status(400).json({ success: false, error: error.message })
  }
})

router.post('/payment/orders/:id/refund', authenticateAdmin, async (req, res) => {
  try {
    const result = await paymentOrderService.approveRefund(req.params.id, {
      operator: req.admin?.id || 'admin'
    })
    res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ [payment] refund order error:', error)
    res.status(400).json({ success: false, error: error.message })
  }
})

// in-doubt 退款裁决（管理员核对渠道流水后）：outcome=refunded 补终态 / not_refunded 回滚解锁
router.post('/payment/orders/:id/refund/resolve', authenticateAdmin, async (req, res) => {
  try {
    const result = await paymentOrderService.resolveRefundInDoubt(
      req.params.id,
      req.body?.outcome,
      { operator: req.admin?.id || 'admin' }
    )
    res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ [payment] resolve refund error:', error)
    res.status(400).json({ success: false, error: error.message })
  }
})

// ========== 看板统计 + 订单审计 ==========
router.get('/payment/dashboard', authenticateAdmin, async (req, res) => {
  try {
    res.json({ success: true, data: await paymentOrderService.dashboard() })
  } catch (error) {
    logger.error('❌ [payment] dashboard error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

router.get('/payment/orders/:id/audit', authenticateAdmin, async (req, res) => {
  try {
    res.json({ success: true, data: await paymentOrderService.getAuditLog(req.params.id) })
  } catch (error) {
    logger.error('❌ [payment] audit error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ========== 渠道实例（config 含密钥，AES 加密存储；列表不回显密钥） ==========
router.get('/payment/providers', authenticateAdmin, async (req, res) => {
  try {
    res.json({
      success: true,
      data: await providerRepository.list({ providerKey: req.query.providerKey || '' })
    })
  } catch (error) {
    logger.error('❌ [payment] list providers error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

router.get('/payment/providers/:id', authenticateAdmin, async (req, res) => {
  try {
    const provider = await providerRepository.getById(req.params.id, { withConfig: true })
    if (!provider) {
      return res.status(404).json({ success: false, error: 'Provider instance not found' })
    }
    res.json({ success: true, data: provider })
  } catch (error) {
    logger.error('❌ [payment] get provider error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

router.post('/payment/providers', authenticateAdmin, async (req, res) => {
  try {
    res.json({ success: true, data: await providerRepository.create(req.body) })
  } catch (error) {
    logger.error('❌ [payment] create provider error:', error)
    res.status(400).json({ success: false, error: error.message })
  }
})

router.put('/payment/providers/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const patch = req.body || {}
    // 引用守卫：仍被在途订单（pending/paid/refunding）引用的实例，禁止改动其依赖的关键字段。
    // [配置快照化后] completed 订单退款已读订单自身的 providerConfigSnapshot 调渠道，不再回查实例 config，
    // 故 completed 不再冻结实例——密钥轮换/改错配置/下线旧商户号只需等在途订单结清即可。
    // 仍拦在途单：pending/paid 的验签/查单、refunding 的退款执行仍依赖实例当前 config。
    // 无害字段（name/sortOrder/singleMin/singleMax/dailyLimit）放行。
    const SENSITIVE_FIELDS = ['config', 'refundEnabled', 'supportedTypes', 'enabled', 'providerKey']
    const touchedSensitive = SENSITIVE_FIELDS.filter((f) => patch[f] !== undefined)
    if (touchedSensitive.length > 0) {
      const activeOrders = await orderRepository.countActiveByProviderInstance(id, {
        includeCompleted: false
      })
      if (activeOrders > 0) {
        return res.status(409).json({
          success: false,
          error: 'provider_instance_in_use',
          message: `该渠道实例仍被 ${activeOrders} 个在途订单（待支付/已支付/退款中）引用，不能修改 ${touchedSensitive.join('、')}（会导致在途订单验签、查单或退款执行失败）。请改为新增实例并切新单，待在途订单全部结清后再修改旧实例。`
        })
      }
    }
    res.json({ success: true, data: await providerRepository.update(id, patch) })
  } catch (error) {
    logger.error('❌ [payment] update provider error:', error)
    res.status(400).json({ success: false, error: error.message })
  }
})

router.delete('/payment/providers/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const provider = await providerRepository.getById(id)
    if (!provider) {
      return res.status(404).json({ success: false, error: 'Provider instance not found' })
    }
    // 引用守卫：仍被非终态订单（pending/paid/refunding/completed）引用的实例不可删除，
    // 否则删除后这些订单的查单/webhook 验签/退款会因拿不到 config 而永久失败（用户已付款的钱无法入账）。
    const activeOrders = await orderRepository.countActiveByProviderInstance(id)
    if (activeOrders > 0) {
      return res.status(409).json({
        success: false,
        error: 'provider_instance_in_use',
        message: `该渠道实例仍被 ${activeOrders} 个未完结订单引用（待支付/已支付/退款中/已完成），删除会导致这些订单无法查单、验签或退款。请改为「禁用」该实例，或待相关订单全部终结后再删除。`
      })
    }
    res.json({ success: true, data: await providerRepository.delete(id) })
  } catch (error) {
    logger.error('❌ [payment] delete provider error:', error)
    res.status(400).json({ success: false, error: error.message })
  }
})

module.exports = router
