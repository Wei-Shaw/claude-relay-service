const BaseBalanceProvider = require('./baseBalanceProvider')
const claudeAccountService = require('../claudeAccountService')

class ClaudeBalanceProvider extends BaseBalanceProvider {
  constructor() {
    super('claude')
  }

  /**
   * Claude（OAuth）：优先尝试获取 OAuth usage（用于配额/使用信息），不强行提供余额金额
   */
  async queryBalance(account) {
    this.logger.debug(`查询 Claude 余额（OAuth usage）: ${account?.id}`)

    // 仅 OAuth 账户可用；失败时降级
    const usageData = await claudeAccountService.fetchOAuthUsage(account.id).catch(() => null)
    if (!usageData) {
      return { balance: null, currency: 'USD', queryMethod: 'local' }
    }

    return {
      balance: null,
      currency: 'USD',
      queryMethod: 'api',
      rawData: usageData
    }
  }
}

module.exports = ClaudeBalanceProvider
