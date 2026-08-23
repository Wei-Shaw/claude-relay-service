// 支付渠道端口（出站端口）。领域只依赖此抽象，不认识任何具体渠道实现。
// 每个渠道适配器继承本类并实现对应方法，自身闭环（验签/下单/查单/退款）。

class BasePaymentProvider {
  // 渠道唯一标识，如 'epay' | 'stripe' | 'mock'
  get providerKey() {
    throw new Error('providerKey not implemented')
  }

  // 该渠道支持的支付方式列表，如 ['alipay', 'wxpay']
  get supportedTypes() {
    return []
  }

  // 创建支付。入参为订单 + 渠道配置（已解密）。
  // 返回 { payUrl?, qrCode?, clientSecret?, tradeNo? }
  async createPayment(_order, _config) {
    throw new Error('createPayment not implemented')
  }

  // 从回调粗提 outTradeNo（验签前用于定位订单与渠道实例配置）。GET 参数在 query，POST 在 rawBody。
  extractOutTradeNo(_rawBody, _headers, _query) {
    return null
  }

  // 验证渠道回调（webhook）。rawBody 为原始请求体字符串，query 为 GET 参数。
  // 返回 { outTradeNo, tradeNo, paidAmount, success }
  async verifyWebhook(_rawBody, _headers, _config, _query) {
    throw new Error('verifyWebhook not implemented')
  }

  // webhook 成功应答内容（多数渠道要求特定纯文本，如 'success'）
  webhookSuccessResponse() {
    return 'success'
  }

  // 主动查单（可选，webhook 丢失时兜底）。返回 { success, paidAmount, tradeNo } | null
  // 第三参 order 可选：Stripe 等需 tradeNo(session id) 的渠道用；不传则仅靠 outTradeNo
  async queryOrder(_outTradeNo, _config, _order = null) {
    return null
  }

  // 退款能力声明：实现了 refund 的渠道必须覆写为 true——配置保存（providerRepository）与
  // 退款入口（approveRefund）按此硬门校验，未实现的渠道在配置期就拦掉「支持退款」假能力
  get supportsRefund() {
    return false
  }

  // 退款（可选）。返回 { success, message? }
  // 实现契约（payment/CLAUDE.md 接渠道5）：确认「未执行/已拒绝」return {success:false}（上层自动回滚
  // 可重试）；结果未知（超时/连接中断）必须 throw（上层按 in-doubt 转人工，绝不自动重试）。
  // 未实现 = 必然没调渠道 = 确定未执行，故返回 success:false 而非 throw（throw 会被当 in-doubt 冻结订单）
  async refund(_order, _amount, _config) {
    return { success: false, message: 'refund not implemented' }
  }
}

module.exports = BasePaymentProvider
