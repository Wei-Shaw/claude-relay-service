// 用户支付路由：充值商品展示（公开只读，仅定价信息）+ 余额/下单/订单/查单/取消。
// 身份模型：首次用【完整 apiKey】换取短期会话 token（POST /session），之后所有涉及具体 key 的
// 操作只携带 token（绑定 keyId、滑动续期），避免明文 apiKey 在每个请求体反复上行（规避问题1：强凭证扩散）。

const express = require('express')

const router = express.Router()
const logger = require('../utils/logger')
const apiKeyService = require('../services/apiKeyService')
const planRepository = require('../services/payment/planRepository')
const paymentConfig = require('../services/payment/paymentConfig')
const paymentOrderService = require('../services/payment/paymentOrderService')
const paymentSession = require('../services/payment/paymentSession')

// 用会话 token 解析持有的 keyId（token 由 /session 用完整 apiKey 换取）。
// 失效返回固定 code，供前端区分「会话过期需重签」与普通业务错误。
const resolveKeyId = async (token) => {
  const keyId = await paymentSession.resolve(token)
  if (!keyId) {
    return { error: '会话已失效，请重新验证 API Key', code: 'payment_session_invalid' }
  }
  // 每次复核 key 当前状态：被禁用/删除/过期或所属用户停用则立即失效并吊销 token
  // （规避 token 签发后 key 状态变更带来的授权滞后窗口）
  const status = await apiKeyService.validateKeyActiveById(keyId)
  if (!status.valid) {
    await paymentSession.revoke(token)
    return { error: status.error || 'API Key 不可用', code: 'payment_session_invalid' }
  }
  return { keyId, keyData: status.keyData }
}

// 验证 token + 订单归属该 key
const guardOrder = async (orderId, token) => {
  const { keyId, error, code } = await resolveKeyId(token)
  if (error) {
    return { error, code }
  }
  const order = await paymentOrderService.getOrder(orderId)
  if (!order || order.apiKeyId !== keyId) {
    return { error: '订单不存在' }
  }
  return { keyId, order }
}

// 公开：在售充值商品 + 配置（仅定价/展示信息，无敏感 key 状态）
router.get('/plans', async (req, res) => {
  try {
    const [plans, config] = await Promise.all([
      planRepository.list({ enabledOnly: true }),
      paymentConfig.getConfig()
    ])
    res.json({
      success: true,
      data: {
        enabled: config.enabled,
        allowCustomAmount: config.allowCustomAmount && config.customRatio > 0,
        customRatio: config.customRatio,
        enabledPaymentTypes: config.enabledPaymentTypes,
        plans
      }
    })
  } catch (error) {
    logger.error('❌ [payment] list plans error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 用完整 apiKey 换取会话 token（仅此处需要明文 apiKey，且不落库）
router.post('/session', async (req, res) => {
  try {
    const { apiKey } = req.body
    if (!apiKey) {
      return res.status(400).json({ success: false, error: '缺少 apiKey' })
    }
    const validation = await apiKeyService.validateApiKeyForStats(apiKey)
    if (!validation.valid) {
      return res.status(401).json({ success: false, error: validation.error || 'apiKey 无效' })
    }
    const { token, expiresIn } = await paymentSession.issue(validation.keyData.id)
    res.json({ success: true, data: { token, expiresIn } })
  } catch (error) {
    logger.error('❌ [payment] issue session error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 余额查询
router.post('/balance', async (req, res) => {
  try {
    const { keyId, keyData, error, code } = await resolveKeyId(req.body.token)
    if (error) {
      return res.status(401).json({ success: false, error, code })
    }
    const balance = await paymentOrderService.getBalance(keyId)
    res.json({
      success: true,
      data: { balance, billingMode: keyData.billingMode || 'postpaid' }
    })
  } catch (error) {
    logger.error('❌ [payment] get balance error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 下单
router.post('/orders', async (req, res) => {
  try {
    const { keyId, error, code } = await resolveKeyId(req.body.token)
    if (error) {
      return res.status(401).json({ success: false, error, code })
    }
    const { planId, customQuota, paymentType } = req.body
    if (!paymentType) {
      return res.status(400).json({ success: false, error: '缺少 paymentType' })
    }
    const result = await paymentOrderService.createOrder({
      apiKeyId: keyId,
      planId,
      customQuota,
      paymentType
    })
    res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ [payment] create order error:', error)
    res.status(400).json({ success: false, error: error.message })
  }
})

// 我的订单（按 key 归集）
router.post('/orders/query', async (req, res) => {
  try {
    const { keyId, error, code } = await resolveKeyId(req.body.token)
    if (error) {
      return res.status(401).json({ success: false, error, code })
    }
    const offset = parseInt(req.body.offset || 0, 10)
    const limit = parseInt(req.body.limit || 20, 10)
    const data = await paymentOrderService.listOrdersByApiKey(keyId, { offset, limit })
    res.json({ success: true, data })
  } catch (error) {
    logger.error('❌ [payment] list orders error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 订单详情
router.post('/orders/:id/get', async (req, res) => {
  try {
    const { order, error, code } = await guardOrder(req.params.id, req.body.token)
    if (error) {
      return res.status(error === '订单不存在' ? 404 : 401).json({ success: false, error, code })
    }
    res.json({ success: true, data: order })
  } catch (error) {
    logger.error('❌ [payment] get order error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 查单补单
router.post('/orders/:id/verify', async (req, res) => {
  try {
    const { error, code } = await guardOrder(req.params.id, req.body.token)
    if (error) {
      return res.status(error === '订单不存在' ? 404 : 401).json({ success: false, error, code })
    }
    const updated = await paymentOrderService.verifyOrder(req.params.id)
    res.json({ success: true, data: updated })
  } catch (error) {
    logger.error('❌ [payment] verify order error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 取消未支付订单
router.post('/orders/:id/cancel', async (req, res) => {
  try {
    const { keyId, error, code } = await guardOrder(req.params.id, req.body.token)
    if (error) {
      return res.status(error === '订单不存在' ? 404 : 401).json({ success: false, error, code })
    }
    const result = await paymentOrderService.cancelOrder(req.params.id, keyId)
    res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ [payment] cancel order error:', error)
    res.status(400).json({ success: false, error: error.message })
  }
})

module.exports = router
