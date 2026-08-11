// 支付渠道回调（公开，无认证，靠各渠道验签）。
// 必须在全局 express.json 之前挂载，用 express.raw 拿原始字节验签（Stripe/支付宝/微信依赖原始 body）。

const express = require('express')

const router = express.Router()
const logger = require('../utils/logger')
const registry = require('../services/payment/providers/registry')
const orderRepository = require('../services/payment/orderRepository')
const providerRepository = require('../services/payment/providerRepository')
const paymentOrderService = require('../services/payment/paymentOrderService')

const extractRawBody = (req) => {
  if (Buffer.isBuffer(req.body)) {
    return req.body.toString('utf8')
  }
  if (typeof req.body === 'string') {
    return req.body
  }
  return req.body ? JSON.stringify(req.body) : ''
}

// 同时支持 POST/GET（部分渠道用 GET 回调）
router.all('/:provider', async (req, res) => {
  const providerKey = req.params.provider
  try {
    const provider = registry.getByKey(providerKey)
    const rawBody = extractRawBody(req)
    // 验签前粗提 outTradeNo（明文渠道可直接定位订单与实例配置）
    const outTradeNo = provider.extractOutTradeNo(rawBody, req.headers, req.query)
    let order = outTradeNo ? await orderRepository.getByOutTradeNo(outTradeNo) : null

    // 候选 config：订单关联实例优先；否则（如微信需解密才知单号）取该渠道全部启用实例逐个试
    const candidates = []
    if (order && order.providerInstanceId) {
      const inst = await providerRepository.getById(order.providerInstanceId, { withConfig: true })
      if (inst) {
        candidates.push(inst.config)
      }
    } else {
      const instances = await providerRepository.enabledConfigs(providerKey)
      for (const inst of instances) {
        candidates.push(inst.config)
      }
    }
    if (candidates.length === 0) {
      candidates.push({})
    }

    let notification = null
    for (const cfg of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const result = await provider.verifyWebhook(rawBody, req.headers, cfg, req.query)
      if (result && result.success) {
        notification = result
        break
      }
      if (!notification) {
        notification = result
      }
    }
    if (!notification || !notification.success) {
      logger.warn(`[payment] webhook ${providerKey} verify failed or unsuccessful`)
      return res.status(200).send('fail')
    }
    if (!order && notification.outTradeNo) {
      order = await orderRepository.getByOutTradeNo(notification.outTradeNo)
    }
    if (!order) {
      logger.warn(`[payment] webhook ${providerKey} order not found: ${notification.outTradeNo}`)
      return res.status(200).send(provider.webhookSuccessResponse())
    }
    await paymentOrderService.confirmPayment(order, {
      paidAmount: notification.paidAmount,
      tradeNo: notification.tradeNo
    })
    res.status(200).send(provider.webhookSuccessResponse())
  } catch (error) {
    logger.error(`❌ [payment] webhook ${providerKey} error:`, error)
    res.status(200).send('fail')
  }
})

module.exports = router
