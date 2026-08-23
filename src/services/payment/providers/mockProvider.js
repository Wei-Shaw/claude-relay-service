// Mock 渠道：不调任何外部服务，用于本地/测试把"下单→支付成功→履约"整链路跑通。
// 生产环境不应启用（enabledPaymentTypes 不含 'mock' 即可）。

const BasePaymentProvider = require('./basePaymentProvider')

class MockProvider extends BasePaymentProvider {
  get providerKey() {
    return 'mock'
  }

  get supportedTypes() {
    return ['mock']
  }

  get supportsRefund() {
    return true
  }

  async createPayment(order, _config) {
    return {
      payUrl: `mock://pay/${order.outTradeNo}`,
      qrCode: `mock-qr:${order.outTradeNo}`,
      tradeNo: `MOCK-${order.outTradeNo}`
    }
  }

  extractOutTradeNo(rawBody) {
    try {
      const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody || {}
      return body.outTradeNo
    } catch (e) {
      return null
    }
  }

  async verifyWebhook(rawBody, _headers, _config, _query) {
    const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody || {}
    return {
      outTradeNo: body.outTradeNo,
      tradeNo: body.tradeNo || `MOCK-${body.outTradeNo}`,
      paidAmount: parseFloat(body.paidAmount || 0),
      success: body.success !== false
    }
  }

  async queryOrder(outTradeNo, _config) {
    return { success: true, paidAmount: null, tradeNo: `MOCK-${outTradeNo}` }
  }

  async refund(_order, _amount, _config) {
    return { success: true }
  }
}

module.exports = MockProvider
