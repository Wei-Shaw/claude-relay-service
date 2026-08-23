// 支付宝当面付（扫码）适配器：alipay.trade.precreate 返回二维码 + 异步通知 RSA2 验签。
// Node crypto + axios，无 SDK。config: { appId, privateKey, alipayPublicKey, gateway, notifyUrl }

const crypto = require('crypto')

const axios = require('axios')

const BasePaymentProvider = require('./basePaymentProvider')

const DEFAULT_GATEWAY = 'https://openapi.alipay.com/gateway.do'

// 东八区"墙上时间" yyyy-MM-dd HH:mm:ss
const bjTimestamp = () =>
  new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ')

// 裸 base64 密钥包装成 PEM
const toPem = (key, type) => {
  if (!key) {
    return ''
  }
  if (key.includes('-----BEGIN')) {
    return key
  }
  const label = type === 'private' ? 'PRIVATE KEY' : 'PUBLIC KEY'
  const body = key
    .replace(/\s/g, '')
    .match(/.{1,64}/g)
    .join('\n')
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`
}

// 参数排序拼接（排除 sign/sign_type/空值），用 decode 后的值
const buildSignStr = (params) =>
  Object.keys(params)
    .filter(
      (k) =>
        k !== 'sign' &&
        k !== 'sign_type' &&
        params[k] !== '' &&
        params[k] !== undefined &&
        params[k] !== null
    )
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')

class AlipayProvider extends BasePaymentProvider {
  get providerKey() {
    return 'alipay'
  }

  get supportedTypes() {
    return ['alipay']
  }

  get supportsRefund() {
    return true
  }

  _sign(params, privateKey) {
    return crypto
      .createSign('RSA-SHA256')
      .update(buildSignStr(params), 'utf8')
      .sign(toPem(privateKey, 'private'), 'base64')
  }

  _verify(params, sign, publicKey) {
    try {
      return crypto
        .createVerify('RSA-SHA256')
        .update(buildSignStr(params), 'utf8')
        .verify(toPem(publicKey, 'public'), sign, 'base64')
    } catch (e) {
      return false
    }
  }

  _parse(rawBody, query) {
    if (query && Object.keys(query).length > 0) {
      return query
    }
    return rawBody ? Object.fromEntries(new URLSearchParams(rawBody)) : {}
  }

  async _call(method, bizContent, config) {
    const params = {
      app_id: config.appId,
      method,
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: bjTimestamp(),
      version: '1.0',
      biz_content: JSON.stringify(bizContent)
    }
    if (method === 'alipay.trade.precreate' && config.notifyUrl) {
      params.notify_url = config.notifyUrl
    }
    params.sign = this._sign(params, config.privateKey)
    const { data } = await axios.post(
      config.gateway || DEFAULT_GATEWAY,
      new URLSearchParams(params).toString(),
      {
        timeout: 15000,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' }
      }
    )
    return data
  }

  async createPayment(order, config) {
    const data = await this._call(
      'alipay.trade.precreate',
      {
        out_trade_no: order.outTradeNo,
        total_amount: Number(order.payAmount).toFixed(2),
        subject: order.subject || `充值 ${order.quotaAmount}`
      },
      config
    )
    const resp = data.alipay_trade_precreate_response
    if (!resp || resp.code !== '10000') {
      throw new Error(`支付宝下单失败: ${resp ? resp.sub_msg || resp.msg : 'unknown'}`)
    }
    return { payUrl: '', qrCode: resp.qr_code, tradeNo: '' }
  }

  extractOutTradeNo(rawBody, headers, query) {
    return this._parse(rawBody, query).out_trade_no
  }

  async verifyWebhook(rawBody, headers, config, query) {
    const data = this._parse(rawBody, query)
    const verified = data.sign ? this._verify(data, data.sign, config.alipayPublicKey) : false
    const success =
      verified && (data.trade_status === 'TRADE_SUCCESS' || data.trade_status === 'TRADE_FINISHED')
    return {
      outTradeNo: data.out_trade_no,
      tradeNo: data.trade_no || '',
      paidAmount: parseFloat(data.total_amount || 0),
      success
    }
  }

  async queryOrder(outTradeNo, config) {
    try {
      const data = await this._call('alipay.trade.query', { out_trade_no: outTradeNo }, config)
      const resp = data.alipay_trade_query_response
      if (
        resp &&
        resp.code === '10000' &&
        (resp.trade_status === 'TRADE_SUCCESS' || resp.trade_status === 'TRADE_FINISHED')
      ) {
        return {
          success: true,
          paidAmount: parseFloat(resp.total_amount || 0),
          tradeNo: resp.trade_no
        }
      }
      return { success: false }
    } catch (e) {
      return null
    }
  }

  async refund(order, amount, config) {
    const data = await this._call(
      'alipay.trade.refund',
      { out_trade_no: order.outTradeNo, refund_amount: Number(amount).toFixed(2) },
      config
    )
    const resp = data.alipay_trade_refund_response
    // 退款契约（payment/CLAUDE.md 接渠道5）：10000=确定成功；20000（支付宝语义「系统繁忙，
    // 请用相同参数重试」=网关可能已受理）或应答缺失/不可解析=结果未知 → throw 转 in-doubt；
    // 其余业务码（40004 等）=确定拒绝 → success:false 走自动回滚。禁止把未知压成 success:false
    if (!resp || resp.code === '20000') {
      throw new Error(
        `alipay refund result unknown: ${resp ? resp.sub_msg || resp.msg : 'empty response'}`
      )
    }
    return {
      success: resp.code === '10000',
      message: resp.sub_msg || resp.msg || resp.code
    }
  }

  // 支付宝异步通知要求返回纯文本 success
  webhookSuccessResponse() {
    return 'success'
  }
}

module.exports = AlipayProvider
