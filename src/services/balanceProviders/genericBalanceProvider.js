const BaseBalanceProvider = require('./baseBalanceProvider')

class GenericBalanceProvider extends BaseBalanceProvider {
  constructor(platform) {
    super(platform)
  }

  async queryBalance(account) {
    this.logger.debug(`${this.platform} 暂无专用余额 API，实现降级策略`)

    // 对于暂不支持的 Qwen，直接返回 0，避免前端报错
    if (this.platform === 'qwen') {
      return {
        balance: 0,
        currency: 'USD',
        quota: null,
        queryMethod: 'local'
      }
    }

    if (account && Object.prototype.hasOwnProperty.call(account, 'dailyQuota')) {
      return this.readQuotaFromFields(account)
    }

    return {
      balance: null,
      currency: 'USD',
      queryMethod: 'local'
    }
  }
}

module.exports = GenericBalanceProvider
