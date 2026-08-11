// 支付渠道注册入口：应用启动时调用 initPaymentProviders 完成注册。
// 领域/用例只依赖 registry，不在别处直接 new 具体渠道。

const registry = require('./registry')
const MockProvider = require('./mockProvider')
const EpayProvider = require('./epayProvider')
const XunhupayProvider = require('./xunhupayProvider')
const StripeProvider = require('./stripeProvider')
const AlipayProvider = require('./alipayProvider')
const WxpayProvider = require('./wxpayProvider')

let initialized = false

// 注册全部支付渠道。真实渠道按 providerKey 注册；具体用哪个实例由 providerRepository 选。
const initPaymentProviders = () => {
  if (initialized) {
    return registry
  }
  registry.register(new MockProvider())
  registry.register(new EpayProvider())
  registry.register(new XunhupayProvider())
  registry.register(new StripeProvider())
  registry.register(new AlipayProvider())
  registry.register(new WxpayProvider())
  initialized = true
  return registry
}

module.exports = { initPaymentProviders, registry }
