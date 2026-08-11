// Stripe 适配器：Checkout Session 跳转支付 + webhook HMAC-SHA256 验签。Node crypto + axios，无 SDK。
// config: { secretKey, webhookSecret, successUrl, cancelUrl }

const crypto = require('crypto')
const querystring = require('querystring')

const axios = require('axios')

const BasePaymentProvider = require('./basePaymentProvider')

const STRIPE_API = 'https://api.stripe.com/v1'

class StripeProvider extends BasePaymentProvider {
  get providerKey() {
    return 'stripe'
  }

  get supportedTypes() {
    return ['stripe', 'card']
  }

  get supportsRefund() {
    return true
  }

  async createPayment(order, config) {
    const currency = (order.currency || 'usd').toLowerCase()
    const amountMinor = Math.round(Number(order.payAmount) * 100)
    const form = {
      mode: 'payment',
      success_url: config.successUrl || '',
      cancel_url: config.cancelUrl || config.successUrl || '',
      client_reference_id: order.outTradeNo,
      'metadata[outTradeNo]': order.outTradeNo,
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][currency]': currency,
      'line_items[0][price_data][unit_amount]': amountMinor,
      'line_items[0][price_data][product_data][name]': order.subject || `充值 ${order.quotaAmount}`
    }
    const { data } = await axios.post(
      `${STRIPE_API}/checkout/sessions`,
      querystring.stringify(form),
      {
        timeout: 15000,
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )
    return { payUrl: data.url, qrCode: '', tradeNo: data.id }
  }

  _parseEvent(rawBody) {
    try {
      return typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody || {}
    } catch (e) {
      return {}
    }
  }

  extractOutTradeNo(rawBody) {
    const obj = (this._parseEvent(rawBody).data || {}).object || {}
    return (obj.metadata && obj.metadata.outTradeNo) || obj.client_reference_id || null
  }

  async verifyWebhook(rawBody, headers, config) {
    // Stripe-Signature: t=ts,v1=sig；sig = HMAC-SHA256(`${t}.${rawBody}`, webhookSecret)
    const header = headers['stripe-signature'] || headers['Stripe-Signature'] || ''
    const parts = {}
    for (const seg of header.split(',')) {
      const idx = seg.indexOf('=')
      if (idx > 0) {
        parts[seg.slice(0, idx).trim()] = seg.slice(idx + 1)
      }
    }
    const expected = crypto
      .createHmac('sha256', config.webhookSecret || '')
      .update(`${parts.t}.${rawBody}`, 'utf8')
      .digest('hex')
    const signed = Boolean(parts.v1) && expected === parts.v1
    const event = this._parseEvent(rawBody)
    const obj = (event.data || {}).object || {}
    const paid = event.type === 'checkout.session.completed' && obj.payment_status === 'paid'
    return {
      outTradeNo: (obj.metadata && obj.metadata.outTradeNo) || obj.client_reference_id,
      tradeNo: obj.payment_intent || obj.id || '',
      paidAmount: (obj.amount_total || 0) / 100,
      success: signed && paid
    }
  }

  // 查单补单：优先用下单返回的 Checkout Session id（order.tradeNo），否则按 client_reference_id 列最新一条
  async queryOrder(outTradeNo, config, order = null) {
    const auth = {
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
    let session = null
    const sessionId = order && order.tradeNo ? String(order.tradeNo) : ''
    // tradeNo 存的是 session id（cs_...）；若误存 payment_intent（pi_...）则走 list 回退
    if (sessionId.startsWith('cs_')) {
      try {
        const { data } = await axios.get(
          `${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`,
          auth
        )
        session = data
      } catch (e) {
        // 4xx 确定无此 session → 未支付；网络/5xx 返回 null 让上层不误关单
        if (e.response && e.response.status >= 400 && e.response.status < 500) {
          return { success: false }
        }
        return null
      }
    } else {
      try {
        // Stripe list 不按 client_reference_id 服务端过滤，拉近期 session 本地匹配（补单窗口内够用）
        const { data } = await axios.get(`${STRIPE_API}/checkout/sessions`, {
          ...auth,
          params: { limit: 100 }
        })
        const list = (data && data.data) || []
        session =
          list.find(
            (s) =>
              (s.client_reference_id && s.client_reference_id === outTradeNo) ||
              (s.metadata && s.metadata.outTradeNo === outTradeNo)
          ) || null
        if (!session) {
          return { success: false }
        }
      } catch (e) {
        if (e.response && e.response.status >= 400 && e.response.status < 500) {
          return { success: false }
        }
        return null
      }
    }
    const paid = session.payment_status === 'paid' || session.status === 'complete'
    if (!paid) {
      return { success: false }
    }
    return {
      success: true,
      paidAmount: (session.amount_total || 0) / 100,
      // 优先 payment_intent 供后续退款；否则保留 session id
      tradeNo: session.payment_intent || session.id || sessionId || ''
    }
  }

  async refund(order, amount, config) {
    // 退款契约：axios 对 4xx/5xx/网络错误一律 throw → 上层按 in-doubt 人工裁决。故意不分类——
    // Stripe 4xx 含 charge_already_refunded（钱已退过）等绝不能自动回滚的场景，统一转人工最安全
    // tradeNo 可能是 pi_...（webhook/查单后）或仍是 cs_...（仅 session）——后者先解析 payment_intent
    let paymentIntent = order.tradeNo || ''
    if (paymentIntent.startsWith('cs_')) {
      const { data: session } = await axios.get(
        `${STRIPE_API}/checkout/sessions/${encodeURIComponent(paymentIntent)}`,
        {
          timeout: 15000,
          headers: { Authorization: `Bearer ${config.secretKey}` }
        }
      )
      paymentIntent = session.payment_intent || ''
    }
    if (!paymentIntent || !String(paymentIntent).startsWith('pi_')) {
      return { success: false, message: '缺少 payment_intent，无法退款' }
    }
    const form = {
      payment_intent: paymentIntent,
      amount: Math.round(Number(amount) * 100)
    }
    const { data } = await axios.post(`${STRIPE_API}/refunds`, querystring.stringify(form), {
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return {
      success: data.status === 'succeeded' || data.status === 'pending',
      message: data.status
    }
  }
}

module.exports = StripeProvider
