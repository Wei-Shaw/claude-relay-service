// 虎皮椒（xunhupay）适配器。MD5 签名，支持查单补单。Node 内置 crypto，无额外依赖。
// config: { appid, appSecret, gateway, notifyUrl, returnUrl, callbackUrl }

const crypto = require('crypto')
const querystring = require('querystring')

const axios = require('axios')

const BasePaymentProvider = require('./basePaymentProvider')

const md5 = (str) => crypto.createHash('md5').update(str, 'utf8').digest('hex')

// 虎皮椒签名：参数按 key 升序 url 拼接（排除 hash 和空值）+ appSecret，MD5
const notEmpty = (v) => v !== undefined && v !== null && v !== ''

const xunhuSign = (params, appSecret) => {
  const orderedKeys = Object.keys(params)
    .filter((k) => k !== 'hash' && notEmpty(params[k]))
    .sort()
  const stringA = orderedKeys.map((k) => `${k}=${params[k]}`).join('&')
  return md5(stringA + appSecret)
}

class XunhupayProvider extends BasePaymentProvider {
  get providerKey() {
    return 'xunhupay'
  }

  get supportedTypes() {
    return ['wxpay', 'alipay']
  }

  _parseForm(rawBody, query) {
    if (query && Object.keys(query).length > 0) {
      return query
    }
    return rawBody ? querystring.parse(rawBody) : {}
  }

  async createPayment(order, config) {
    const params = {
      version: '1.1',
      appid: config.appid,
      trade_order_id: order.outTradeNo,
      total_fee: Number(order.payAmount).toFixed(2),
      title: order.subject || `充值${order.quotaAmount}`,
      time: Math.floor(Date.now() / 1000).toString(),
      notify_url: config.notifyUrl,
      nonce_str: crypto.randomBytes(8).toString('hex')
    }
    if (config.returnUrl) {
      params.return_url = config.returnUrl
    }
    if (config.callbackUrl) {
      params.callback_url = config.callbackUrl
    }
    params.hash = xunhuSign(params, config.appSecret)
    const gateway = config.gateway || 'https://api.xunhupay.com'
    const { data } = await axios.post(`${gateway}/payment/do.html`, querystring.stringify(params), {
      timeout: 10000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    if (!data || data.errcode !== 0) {
      throw new Error(`虎皮椒下单失败: ${data && data.errmsg ? data.errmsg : 'unknown'}`)
    }
    return {
      payUrl: data.url || '',
      qrCode: data.url_qrcode || data.url || '',
      tradeNo: data.open_order_id || ''
    }
  }

  extractOutTradeNo(rawBody, headers, query) {
    return this._parseForm(rawBody, query).trade_order_id
  }

  async verifyWebhook(rawBody, headers, config, query) {
    const data = this._parseForm(rawBody, query)
    const success = data.hash === xunhuSign(data, config.appSecret) && data.status === 'OD'
    return {
      outTradeNo: data.trade_order_id,
      tradeNo: data.transaction_id || data.open_order_id || '',
      paidAmount: parseFloat(data.total_fee || 0),
      success
    }
  }

  async queryOrder(outTradeNo, config) {
    try {
      const params = {
        appid: config.appid,
        out_trade_order: outTradeNo,
        time: Math.floor(Date.now() / 1000).toString(),
        nonce_str: crypto.randomBytes(8).toString('hex')
      }
      params.hash = xunhuSign(params, config.appSecret)
      const gateway = config.gateway || 'https://api.xunhupay.com'
      const { data } = await axios.post(
        `${gateway}/payment/query.html`,
        querystring.stringify(params),
        { timeout: 10000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      )
      if (data && data.errcode === 0 && data.data && data.data.status === 'OD') {
        return {
          success: true,
          paidAmount: parseFloat(data.data.total_fee || 0),
          tradeNo: data.data.transaction_id
        }
      }
      return { success: false }
    } catch (e) {
      return null
    }
  }

  get supportsRefund() {
    return true
  }

  // 虎皮椒退款：payment/refund.html。契约同 payment/CLAUDE.md——业务拒绝 success:false；网络/未知 throw
  async refund(order, amount, config) {
    const params = {
      appid: config.appid,
      trade_order_id: order.outTradeNo,
      // open_order_id 有则带上，部分商户要求
      ...(order.tradeNo ? { open_order_id: order.tradeNo } : {}),
      refund_amount: Number(amount).toFixed(2),
      reason: `order ${order.id} refund`,
      time: Math.floor(Date.now() / 1000).toString(),
      nonce_str: crypto.randomBytes(8).toString('hex')
    }
    params.hash = xunhuSign(params, config.appSecret)
    const gateway = config.gateway || 'https://api.xunhupay.com'
    // axios 网络/5xx 原样抛出 → 上层 in-doubt；有业务体则按 errcode 三分
    const { data } = await axios.post(
      `${gateway}/payment/refund.html`,
      querystring.stringify(params),
      { timeout: 15000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    )
    // errcode===0 成功；非 0 且有明确 errmsg = 确定拒绝
    if (data && Number(data.errcode) === 0) {
      return { success: true, message: data.errmsg || 'ok' }
    }
    if (data && data.errcode !== undefined && data.errcode !== null) {
      return {
        success: false,
        message: `xunhupay refund ${data.errcode}: ${data.errmsg || ''}`
      }
    }
    // 应答缺失/不可解析 = 未知
    throw new Error('虎皮椒退款应答缺失或不可解析')
  }
}

module.exports = XunhupayProvider
