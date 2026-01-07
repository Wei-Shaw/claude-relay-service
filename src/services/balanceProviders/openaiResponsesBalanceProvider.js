const BaseBalanceProvider = require('./baseBalanceProvider')

class OpenAIResponsesBalanceProvider extends BaseBalanceProvider {
  constructor() {
    super('openai-responses')
  }

  /**
   * OpenAI-Responses：
   * - 优先使用 dailyQuota 字段（如果配置了额度）
   * - 可选：尝试调用兼容 API（不同服务商实现不一，失败自动降级）
   */
  async queryBalance(account) {
    this.logger.debug(`查询 OpenAI Responses 余额: ${account?.id}`)

    // 配置了额度时直接返回（字段法）
    if (account?.dailyQuota && Number(account.dailyQuota) > 0) {
      return this.readQuotaFromFields(account)
    }

    // 尝试调用 usage 接口（兼容性不保证）
    if (account?.apiKey && account?.baseApi) {
      const baseApi = String(account.baseApi).replace(/\/$/, '')
      const response = await this.makeRequest(
        `${baseApi}/v1/usage`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${account.apiKey}`,
            'Content-Type': 'application/json'
          }
        },
        account
      )

      if (response.success) {
        return {
          balance: null,
          currency: this.parseCurrency(response.data),
          queryMethod: 'api',
          rawData: response.data
        }
      }
    }

    return {
      balance: null,
      currency: 'USD',
      queryMethod: 'local'
    }
  }
}

module.exports = OpenAIResponsesBalanceProvider
