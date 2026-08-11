// 易支付（彩虹/EPay 系）适配器。MD5 签名，Node 内置 crypto，无额外依赖。
// config: { apiUrl, pid, key, notifyUrl, returnUrl }
// 无标准退款 API：supportsRefund 保持 false；运营侧走线下退款（管理端显示「仅线下退」）。
// 查单：api.php?act=order 供 webhook 丢失时补单。

const crypto = require('crypto')
const querystring = require('querystring')

const axios = require('axios')

const BasePaymentProvider = require('./basePaymentProvider')

const md5 = (str) => crypto.createHash('md5').update(str, 'utf8').digest('hex')

// 参数按 key 升序拼接（排除 sign/sign_type/空值），末尾直接接商户 key 后 MD5
const notEmpty = (v) => v !== undefined && v !== null && v !== ''

const epaySign = (params, key) => {
  const orderedKeys = Object.keys(params)
    .filter((k) => k !== 'sign' && k !== 'sign_type' && notEmpty(params[k]))
    .sort()
  const stringA = orderedKeys.map((k) => `${k}=${params[k]}`).join('&')
  return md5(stringA + key)
}

class EpayProvider extends BasePaymentProvider {
  get providerKey() {
    return 'epay'
  }

  get supportedTypes() {
    return ['alipay', 'wxpay']
  }

  _parse(rawBody, query) {
    if (query && Object.keys(query).length > 0) {
      return query
    }
    return rawBody ? querystring.parse(rawBody) : {}
  }

  async createPayment(order, config) {
    const params = {
      pid: config.pid,
      type: order.paymentType === 'wxpay' ? 'wxpay' : 'alipay',
      out_trade_no: order.outTradeNo,
      notify_url: config.notifyUrl,
      return_url: config.returnUrl || '',
      name: order.subject || `充值 ${order.quotaAmount}`,
      money: Number(order.payAmount).toFixed(2)
    }
    params.sign = epaySign(params, config.key)
    params.sign_type = 'MD5'
    // 页面跳转支付（GET submit.php），最兼容各 epay 实现
    const query = Object.keys(params)
      .map((k) => `${k}=${encodeURIComponent(params[k])}`)
      .join('&')
    return { payUrl: `${config.apiUrl}/submit.php?${query}`, qrCode: '', tradeNo: '' }
  }

  extractOutTradeNo(rawBody, headers, query) {
    return this._parse(rawBody, query).out_trade_no
  }

  async verifyWebhook(rawBody, headers, config, query) {
    const data = this._parse(rawBody, query)
    const success =
      data.sign === epaySign(data, config.key) && data.trade_status === 'TRADE_SUCCESS'
    return {
      outTradeNo: data.out_trade_no,
      tradeNo: data.trade_no || '',
      paidAmount: parseFloat(data.money || 0),
      success
    }
  }

  async queryOrder(outTradeNo, config) {
    try {
      const url = `${config.apiUrl}/api.php?act=order&pid=${config.pid}&key=${config.key}&out_trade_no=${outTradeNo}`
      const { data } = await axios.get(url, { timeout: 10000 })
      if (data && data.code === 1 && data.status === 1) {
        return { success: true, paidAmount: parseFloat(data.money || 0), tradeNo: data.trade_no }
      }
      return { success: false }
    } catch (e) {
      return null
    }
  }
}

module.exports = EpayProvider
