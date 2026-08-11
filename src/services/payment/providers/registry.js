// 支付渠道注册表：按 paymentType 和 providerKey 双向索引。
// 上层用例只通过它拿到端口实例，不直接 new 具体渠道。

const logger = require('../../../utils/logger')

class PaymentProviderRegistry {
  constructor() {
    this.byType = new Map() // paymentType -> provider
    this.byKey = new Map() // providerKey -> provider
  }

  register(provider) {
    this.byKey.set(provider.providerKey, provider)
    for (const type of provider.supportedTypes) {
      this.byType.set(type, provider)
    }
    logger.info(
      `[payment] registered provider ${provider.providerKey} types=[${provider.supportedTypes.join(',')}]`
    )
  }

  getByType(paymentType) {
    const provider = this.byType.get(paymentType)
    if (!provider) {
      throw new Error(`No payment provider registered for type: ${paymentType}`)
    }
    return provider
  }

  getByKey(providerKey) {
    const provider = this.byKey.get(providerKey)
    if (!provider) {
      throw new Error(`No payment provider registered for key: ${providerKey}`)
    }
    return provider
  }

  hasType(paymentType) {
    return this.byType.has(paymentType)
  }

  // 按 providerKey 取实例，未注册返回 null（getByKey 的非抛错版本，供配置校验用）
  findByKey(providerKey) {
    return this.byKey.get(providerKey) || null
  }

  // 清空（仅测试用）
  reset() {
    this.byType.clear()
    this.byKey.clear()
  }
}

module.exports = new PaymentProviderRegistry()
