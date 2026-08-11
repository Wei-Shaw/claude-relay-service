// 微信支付 V3 Native 适配器：请求 RSA-SHA256 签名 + 回调 AES-256-GCM 解密。
// 回调用 APIv3 密钥解密，GCM 的 auth tag 即完整性/来源验证（篡改会解密失败）。
// Node crypto + axios，无 SDK。config: { appId, mchId, serialNo, privateKey, apiV3Key, notifyUrl }

const crypto = require('crypto')

const axios = require('axios')

const BasePaymentProvider = require('./basePaymentProvider')

const WX_API = 'https://api.mch.weixin.qq.com'

const toPem = (key) => {
  if (!key) {
    return ''
  }
  if (key.includes('-----BEGIN')) {
    return key
  }
  const body = key
    .replace(/\s/g, '')
    .match(/.{1,64}/g)
    .join('\n')
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`
}

class WxpayProvider extends BasePaymentProvider {
  get providerKey() {
    return 'wxpay'
  }

  get supportedTypes() {
    return ['wxpay']
  }

  get supportsRefund() {
    return true
  }

  // 构造 V3 请求签名头
  _authHeader(method, urlPath, body, config) {
    const nonce = crypto.randomBytes(16).toString('hex')
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`
    const signature = crypto
      .createSign('RSA-SHA256')
      .update(message, 'utf8')
      .sign(toPem(config.privateKey), 'base64')
    return `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.serialNo}"`
  }

  async _request(method, urlPath, bodyObj, config) {
    const body = bodyObj ? JSON.stringify(bodyObj) : ''
    const { data } = await axios({
      method,
      url: `${WX_API}${urlPath}`,
      data: body || undefined,
      timeout: 15000,
      headers: {
        Authorization: this._authHeader(method, urlPath, body, config),
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
    return data
  }

  async createPayment(order, config) {
    const data = await this._request(
      'POST',
      '/v3/pay/transactions/native',
      {
        appid: config.appId,
        mchid: config.mchId,
        description: order.subject || `充值 ${order.quotaAmount}`,
        out_trade_no: order.outTradeNo,
        notify_url: config.notifyUrl,
        amount: { total: Math.round(Number(order.payAmount) * 100), currency: 'CNY' }
      },
      config
    )
    return { payUrl: data.code_url, qrCode: data.code_url, tradeNo: '' }
  }

  // 回调需用 APIv3 密钥解密后才有 out_trade_no，故 handler 阶段无法粗提（返回 null，由多 config 尝试兜底）
  extractOutTradeNo() {
    return null
  }

  _decryptResource(rawBody, config) {
    const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody
    const res = body && body.resource
    if (!res || !config.apiV3Key) {
      return null
    }
    const key = Buffer.from(config.apiV3Key, 'utf8')
    const nonce = Buffer.from(res.nonce, 'utf8')
    const aad = Buffer.from(res.associated_data || '', 'utf8')
    const ciphertext = Buffer.from(res.ciphertext, 'base64')
    const authTag = ciphertext.subarray(ciphertext.length - 16)
    const payload = ciphertext.subarray(0, ciphertext.length - 16)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce)
    decipher.setAuthTag(authTag)
    decipher.setAAD(aad)
    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()])
    return JSON.parse(decrypted.toString('utf8'))
  }

  async verifyWebhook(rawBody, headers, config) {
    try {
      const decrypted = this._decryptResource(rawBody, config)
      if (!decrypted) {
        return { success: false }
      }
      return {
        outTradeNo: decrypted.out_trade_no,
        tradeNo: decrypted.transaction_id || '',
        paidAmount: (decrypted.amount && decrypted.amount.total ? decrypted.amount.total : 0) / 100,
        success: decrypted.trade_state === 'SUCCESS'
      }
    } catch (e) {
      return { success: false }
    }
  }

  async queryOrder(outTradeNo, config) {
    try {
      const urlPath = `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${config.mchId}`
      const data = await this._request('GET', urlPath, null, config)
      if (data && data.trade_state === 'SUCCESS') {
        return {
          success: true,
          paidAmount: (data.amount && data.amount.total ? data.amount.total : 0) / 100,
          tradeNo: data.transaction_id
        }
      }
      return { success: false }
    } catch (e) {
      return null
    }
  }

  async refund(order, amount, config) {
    let data
    try {
      data = await this._request(
        'POST',
        '/v3/refund/domestic/refunds',
        {
          out_trade_no: order.outTradeNo,
          out_refund_no: `RF${order.outTradeNo}`,
          amount: {
            refund: Math.round(Number(amount) * 100),
            total: Math.round(Number(order.payAmount) * 100),
            currency: 'CNY'
          }
        },
        config
      )
    } catch (e) {
      // 退款契约（payment/CLAUDE.md 接渠道5）：收到微信业务应答（4xx+错误码）=确定未执行 → success:false
      // 走自动回滚；网络超时/连接中断/5xx（微信语义「系统超时，结果未知」）→ 原样抛出，上层按 in-doubt
      // 人工裁决。禁止把未知结果吞成 success:false——会触发自动回滚+重试=双退
      const wxResponse = e.response
      if (wxResponse && wxResponse.status < 500 && wxResponse.data && wxResponse.data.code) {
        return {
          success: false,
          message: `${wxResponse.data.code}: ${wxResponse.data.message || ''}`
        }
      }
      throw e
    }
    return { success: ['SUCCESS', 'PROCESSING'].includes(data.status), message: data.status }
  }

  // 微信 V3 要求回调应答 JSON
  webhookSuccessResponse() {
    return JSON.stringify({ code: 'SUCCESS', message: 'OK' })
  }
}

module.exports = WxpayProvider
